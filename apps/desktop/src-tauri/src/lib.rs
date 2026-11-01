// Homunculus 2 — native shell. Author: CLAUDE, 2026-10-23.
// Kept small on purpose (D-003): SQLite plugin, data folder, database backup, API keys, exports.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tauri::Manager;

// ---- Where the app keeps its data (D-030, CLAUDE 2026-10-29: portable mode, like SillyTavern).
// Portable: a file `portable.txt` next to Homunculus.exe → everything (database, backups, API keys,
// screen preferences) lives in the `data` folder beside it; copy the folder = move/back up everything.
// The env var HOMUNCULUS_DATA points at such a folder too.
// Otherwise: the usual per-user app folder (AppData\Roaming\com.vasahts.homunculus) and the keychain.
struct DataPlace {
    dir: PathBuf,
    portable: bool,
}

const DATA_DIR: &str = "data";
const WINDOW_DIR: &str = "window";
/// Names used by portable folders made before D-038 (they were Portuguese). Renamed once, in place.
const OLD_DATA_DIR: &str = "dados";
const OLD_SECRETS_FILE: &str = "chaves.json";
const OLD_WINDOW_DIR: &str = "janela";
const OLD_DATA_ENV: &str = "HOMUNCULUS_DADOS";

/// Renames `from` to `to` when `from` exists and `to` does not. Returns false only when a rename failed.
fn rename_once(from: &Path, to: &Path) -> bool {
    if !from.exists() || to.exists() {
        return true;
    }
    match std::fs::rename(from, to) {
        Ok(()) => true,
        Err(e) => {
            eprintln!("Homunculus: could not rename {} to {}: {e}", from.display(), to.display());
            false
        }
    }
}

/// D-038: a portable folder from an older version keeps working — `dados` becomes `data`, and inside it
/// `chaves.json` becomes `keys.json` and `janela` becomes `window`. If the folder cannot be renamed
/// (another program has it open), the old folder is used as it is.
fn portable_data_dir(exe_dir: &Path) -> PathBuf {
    let new = exe_dir.join(DATA_DIR);
    let old = exe_dir.join(OLD_DATA_DIR);
    let dir = if rename_once(&old, &new) { new } else { old };
    rename_once(&dir.join(OLD_SECRETS_FILE), &dir.join(SECRETS_FILE));
    rename_once(&dir.join(OLD_WINDOW_DIR), &dir.join(WINDOW_DIR));
    dir
}

fn resolve_data_place(app: &tauri::AppHandle) -> Result<DataPlace, String> {
    let from_env = std::env::var_os("HOMUNCULUS_DATA").or_else(|| std::env::var_os(OLD_DATA_ENV)).filter(|v| !v.is_empty());
    if let Some(dir) = from_env {
        let dir = PathBuf::from(dir);
        rename_once(&dir.join(OLD_SECRETS_FILE), &dir.join(SECRETS_FILE));
        rename_once(&dir.join(OLD_WINDOW_DIR), &dir.join(WINDOW_DIR));
        return Ok(DataPlace { dir, portable: true });
    }
    if let Some(exe_dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)) {
        if exe_dir.join("portable.txt").is_file() {
            return Ok(DataPlace { dir: portable_data_dir(&exe_dir), portable: true });
        }
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(DataPlace { dir, portable: false })
}

const DB_FILE: &str = "homunculus.db";
/// SQLite keeps recent changes in these side files until they are folded into the main file.
const DB_SIDE_FILES: [&str; 2] = ["-wal", "-shm"];

/// Copies the database (and its side files) from one folder to another. Used for backups and for
/// bringing the existing data into a new portable folder.
fn copy_database(from_dir: &Path, to_dir: &Path, to_name: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(to_dir)?;
    std::fs::copy(from_dir.join(DB_FILE), to_dir.join(to_name))?;
    for side in DB_SIDE_FILES {
        let src = from_dir.join(format!("{DB_FILE}{side}"));
        if src.is_file() {
            std::fs::copy(&src, to_dir.join(format!("{to_name}{side}")))?;
        }
    }
    Ok(())
}

/// First start of a portable folder on a PC that already has Homunculus data: copy it in
/// (a copy — the old folder is left untouched).
fn adopt_existing_data(app: &tauri::AppHandle, place: &DataPlace) {
    if !place.portable || place.dir.join(DB_FILE).exists() {
        return;
    }
    let Ok(old_dir) = app.path().app_config_dir() else { return };
    if old_dir != place.dir && old_dir.join(DB_FILE).is_file() {
        if let Err(e) = copy_database(&old_dir, &place.dir, DB_FILE) {
            eprintln!("Homunculus: could not copy the existing data into the portable folder: {e}");
        }
    }
}

/// The address the SQL plugin opens. An absolute path replaces the plugin's own folder.
/// `%`, `?` and `#` are escaped because the address is decoded like a web address.
#[tauri::command]
fn database_url(place: tauri::State<DataPlace>) -> String {
    let path = place.dir.join(DB_FILE).to_string_lossy().replace('%', "%25").replace('?', "%3F").replace('#', "%23");
    format!("sqlite:{path}")
}

/// Where the data is, for the app to show: { dir, portable }.
#[tauri::command]
fn data_location(place: tauri::State<DataPlace>) -> serde_json::Value {
    serde_json::json!({ "dir": place.dir.to_string_lossy(), "portable": place.portable })
}

/// Copies the database file to `<data folder>/backups/` before a schema upgrade.
/// Returns the backup path, or None when there is no database yet.
#[tauri::command]
fn backup_database(place: tauri::State<DataPlace>) -> Result<Option<String>, String> {
    if !place.dir.join(DB_FILE).exists() {
        return Ok(None);
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let name = format!("homunculus-{stamp}.db");
    let backups = place.dir.join("backups");
    copy_database(&place.dir, &backups, &name).map_err(|e| e.to_string())?;
    Ok(Some(backups.join(name).to_string_lossy().into_owned()))
}

// ---- Secrets (API keys) (D-011, D-030).
// Normal install: the operating system's keychain (Windows Credential Manager; on Linux the Secret Service,
// e.g. GNOME Keyring or KWallet); keys never touch files.
// Portable: `data/keys.json` (like SillyTavern's secrets.json), so the keys travel with the folder.
// Anyone with the folder can read them — Daniel's choice for portability.
const KEYCHAIN_SERVICE: &str = "Homunculus";
const SECRETS_FILE: &str = "keys.json";

fn check_secret_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 200 {
        return Err("Invalid secret name".into());
    }
    Ok(())
}

fn keychain_entry(name: &str) -> Result<keyring::Entry, String> {
    check_secret_name(name)?;
    keyring::Entry::new(KEYCHAIN_SERVICE, name).map_err(|e| e.to_string())
}

fn keychain_get(name: &str) -> Result<Option<String>, String> {
    match keychain_entry(name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn read_secret_file(dir: &Path) -> Result<BTreeMap<String, String>, String> {
    match std::fs::read_to_string(dir.join(SECRETS_FILE)) {
        Ok(text) if text.trim().is_empty() => Ok(BTreeMap::new()),
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("{SECRETS_FILE} is damaged: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Writes to a temporary file first, then swaps it in, so a crash never leaves half a file.
fn write_secret_file(dir: &Path, values: &BTreeMap<String, String>) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(values).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{SECRETS_FILE}.tmp"));
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(SECRETS_FILE)).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_get(place: tauri::State<DataPlace>, name: String) -> Result<Option<String>, String> {
    if !place.portable {
        return keychain_get(&name);
    }
    check_secret_name(&name)?;
    let mut values = read_secret_file(&place.dir)?;
    if let Some(value) = values.get(&name) {
        return Ok(Some(value.clone()));
    }
    // a key saved before going portable: bring it from the keychain into the folder (once)
    if let Ok(Some(value)) = keychain_get(&name) {
        values.insert(name, value.clone());
        write_secret_file(&place.dir, &values)?;
        return Ok(Some(value));
    }
    Ok(None)
}

#[tauri::command]
fn secret_set(place: tauri::State<DataPlace>, name: String, value: String) -> Result<(), String> {
    if !place.portable {
        return keychain_entry(&name)?.set_password(&value).map_err(|e| e.to_string());
    }
    check_secret_name(&name)?;
    let mut values = read_secret_file(&place.dir)?;
    values.insert(name, value);
    write_secret_file(&place.dir, &values)
}

#[tauri::command]
fn secret_delete(place: tauri::State<DataPlace>, name: String) -> Result<(), String> {
    if place.portable {
        check_secret_name(&name)?;
        let mut values = read_secret_file(&place.dir)?;
        if values.remove(&name).is_some() {
            write_secret_file(&place.dir, &values)?;
        }
        return Ok(());
    }
    match keychain_entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ---- How this copy gets updates (D-037, D-038).
// "auto": the updater can replace this copy (Windows installer, Linux AppImage).
// "manual": a Linux .deb (installed by the system's package manager) — the app only says a new version is
// out and opens the download page. "off" is decided on the screen (portable copies, dev).
#[tauri::command]
fn update_channel(app: tauri::AppHandle) -> serde_json::Value {
    let manual = cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_none();
    // the releases page, from the updater's latest.json address: …/releases/latest/download/latest.json
    let page = app
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("endpoints"))
        .and_then(|e| e.get(0))
        .and_then(|e| e.as_str())
        .map(|url| url.trim_end_matches("/download/latest.json").to_string())
        .unwrap_or_default();
    serde_json::json!({ "channel": if manual { "manual" } else { "auto" }, "releasePage": page })
}

// ---- Exports go to the user's Downloads folder, never overwriting an existing file.
#[tauri::command]
fn save_download(app: tauri::AppHandle, file_name: String, base64_data: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| format!("Invalid file data: {e}"))?;
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // keep only a safe file name (no folders), then avoid overwriting: "name (2).png"
    let clean: String = file_name
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    let clean = clean.trim().trim_matches('.').to_string();
    let clean = if clean.is_empty() { "export".to_string() } else { clean };
    let path = std::path::Path::new(&clean);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("export").to_string();
    let ext = path.extension().and_then(|s| s.to_str()).map(|e| format!(".{e}")).unwrap_or_default();

    let mut target = dir.join(&clean);
    let mut n = 2;
    while target.exists() {
        target = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    std::fs::write(&target, bytes).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

// D-067 / T-005. Public-address rules adapted from Jozkah/flint (Apache-2.0),
// 32861bbf87176a44af7471b54c8fc57aa34d6881, provider.rs. No proxy may bypass DNS checks.
const WEB_REFUSED: &str = "That address is on this computer or a private network, so it can't be read.";
const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WEB_CAP: usize = 2 * 1024 * 1024;
fn is_public_ip(ip: std::net::IpAddr) -> bool {
    use std::net::{IpAddr, Ipv4Addr};
    match ip {
        IpAddr::V4(v) => {
            let [a, b, c, _] = v.octets();
            !(v.is_loopback() || v.is_private() || v.is_link_local() || v.is_unspecified()
                || v.is_broadcast() || v.is_documentation() || v.is_multicast() || a == 0
                || (a == 100 && (64..128).contains(&b)) || (a == 192 && b == 0 && c == 0)
                || (a == 198 && (b == 18 || b == 19)) || a >= 240)
        }
        IpAddr::V6(v) => {
            if let Some(v4) = v.to_ipv4_mapped() { return is_public_ip(v4.into()); }
            let s = v.segments();
            let ipv4 = |hi: u16, lo: u16| IpAddr::V4(Ipv4Addr::new((hi >> 8) as u8, hi as u8, (lo >> 8) as u8, lo as u8));
            if s[..6] == [0; 6] || (s[0] == 0x64 && s[1] == 0xff9b && s[2..6] == [0; 4]) { return is_public_ip(ipv4(s[6], s[7])); }
            if s[0] == 0x2002 { return is_public_ip(ipv4(s[1], s[2])); }
            if s[0] == 0x2001 && s[1] == 0 { return is_public_ip(ipv4(s[2], s[3])) && is_public_ip(ipv4(s[6] ^ 0xffff, s[7] ^ 0xffff)); }
            !(v.is_loopback() || v.is_unspecified() || v.is_multicast() || (s[0] & 0xfe00) == 0xfc00
                || (s[0] & 0xffc0) == 0xfe80 || (s[0] == 0x2001 && s[1] == 0xdb8))
        }
    }
}
fn check_web_url(url: &reqwest::Url) -> Result<(), String> {
    let host = url.host_str().unwrap_or("").trim_matches(['[', ']']);
    let domain = host.trim_end_matches('.').to_ascii_lowercase();
    if !matches!(url.scheme(), "http" | "https") || !matches!(url.port(), None | Some(80) | Some(443))
        || !url.username().is_empty() || url.password().is_some() || host.is_empty()
        || domain == "localhost" || domain.ends_with(".localhost")
        || host.parse().is_ok_and(|ip| !is_public_ip(ip)) { return Err(WEB_REFUSED.into()); }
    Ok(())
}
fn same_web_host(from: &reqwest::Url, to: &reqwest::Url) -> bool { from.host_str() == to.host_str() }
struct PublicOnlyResolver;
impl reqwest::dns::Resolve for PublicOnlyResolver {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        let host = name.as_str().to_owned();
        Box::pin(async move {
            let public = tauri::async_runtime::spawn_blocking(move || {
                use std::net::ToSocketAddrs;
                (host.as_str(), 0).to_socket_addrs().map(|items| items.filter(|a| is_public_ip(a.ip())).collect::<Vec<_>>())
            }).await??;
            if public.is_empty() { return Err(WEB_REFUSED.into()); }
            Ok(Box::new(public.into_iter()) as reqwest::dns::Addrs)
        })
    }
}
/// reqwest is built without its own crypto provider (`rustls-no-provider`): install ring once, as the updater does.
fn web_crypto() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        if rustls::crypto::CryptoProvider::get_default().is_none() {
            let _ = rustls::crypto::ring::default_provider().install_default();
        }
    });
}
fn web_client(seconds: u64) -> Result<reqwest::Client, String> {
    web_crypto();
    reqwest::Client::builder().no_proxy().dns_resolver(std::sync::Arc::new(PublicOnlyResolver))
        .redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(seconds))
        .user_agent(WEB_UA).build().map_err(|e| e.to_string())
}
fn web_error(host: &str, e: reqwest::Error) -> String {
    if e.is_timeout() { return format!("{host} did not answer in time."); }
    let mut source: Option<&(dyn std::error::Error + 'static)> = Some(&e);
    while let Some(cause) = source {
        if cause.to_string().contains(WEB_REFUSED) { return WEB_REFUSED.into(); }
        source = cause.source();
    }
    format!("{host} request failed: {e}")
}
async fn web_body(mut response: reqwest::Response, host: &str) -> Result<(String, bool), String> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| web_error(host, e))? {
        let remaining = WEB_CAP - bytes.len();
        bytes.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
        if chunk.len() > remaining { return Ok((String::from_utf8_lossy(&bytes).into_owned(), true)); }
    }
    Ok((String::from_utf8_lossy(&bytes).into_owned(), false))
}
// Retry-After allows delta seconds or an IMF-fixdate. Parsing needs no additional crate.
fn web_retry_after(value: &str, now: u64) -> Option<u64> {
    if let Ok(seconds) = value.trim().parse::<u64>() { return Some(seconds); }
    let p: Vec<_> = value.split_whitespace().collect();
    if p.len() != 6 || !p[0].ends_with(',') || p[5] != "GMT" { return None; }
    let year: u64 = p[3].parse().ok()?;
    if !(1970..=9999).contains(&year) { return None; }
    let month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].iter().position(|m| *m == p[2])?;
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let months = [31u64, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let day: u64 = p[1].parse().ok()?;
    let clock: Vec<u64> = p[4].split(':').map(str::parse).collect::<Result<_, _>>().ok()?;
    if day == 0 || day > months[month] || clock.len() != 3 || clock[0] > 23 || clock[1] > 59 || clock[2] > 59 { return None; }
    let leaps = |y: u64| y / 4 - y / 100 + y / 400;
    let days = 365 * (year - 1970) + leaps(year - 1) - leaps(1969) + months[..month].iter().sum::<u64>() + day - 1;
    Some((days * 86400 + clock[0] * 3600 + clock[1] * 60 + clock[2]).saturating_sub(now))
}
#[tauri::command]
async fn web_search_page(body: String) -> Result<serde_json::Value, String> {
    let response = web_client(20)?.post("https://html.duckduckgo.com/html/")
        .header("Content-Type", "application/x-www-form-urlencoded").header("Accept-Language", "en-US,en;q=0.9")
        .body(body).send().await.map_err(|e| web_error("DuckDuckGo", e))?;
    let status = response.status().as_u16();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    let retry = response.headers().get("retry-after").and_then(|v| v.to_str().ok()).and_then(|v| web_retry_after(v, now));
    let (html, _) = web_body(response, "DuckDuckGo").await?;
    Ok(serde_json::json!({ "status": status, "retryAfterSecs": retry, "html": html }))
}
#[tauri::command]
async fn web_get(url: String) -> Result<serde_json::Value, String> {
    let mut target = reqwest::Url::parse(&url).map_err(|_| WEB_REFUSED.to_string())?;
    let client = web_client(15)?;
    let started = std::time::Instant::now();
    for hop in 0..=5 {
        check_web_url(&target)?;
        let host = target.host_str().unwrap_or("").to_string();
        let left = std::time::Duration::from_secs(15).checked_sub(started.elapsed()).ok_or_else(|| format!("{host} did not answer in time."))?;
        let response = client.get(target.clone()).timeout(left).send().await.map_err(|e| web_error(&host, e))?;
        let status = response.status();
        let redirect = if matches!(status.as_u16(), 301 | 302 | 303 | 307 | 308) {
            response.headers().get("location").and_then(|v| v.to_str().ok()).map(|v| target.join(v)).transpose().map_err(|_| "Invalid redirect address.".to_string())?
        } else { None };
        if let Some(next) = redirect {
            check_web_url(&next)?;
            if !same_web_host(&target, &next) {
                return Ok(serde_json::json!({ "status": status.as_u16(), "finalUrl": target, "contentType": "", "body": "", "cut": false, "redirectTo": next }));
            }
            if hop == 5 { return Err("Too many redirects (maximum 5).".into()); }
            target = next;
            continue;
        }
        let content_type = response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let (body, cut) = web_body(response, &host).await?;
        return Ok(serde_json::json!({ "status": status.as_u16(), "finalUrl": target, "contentType": content_type, "body": body, "cut": cut }));
    }
    Err("Too many redirects (maximum 5).".into())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // updates from GitHub Releases (D-037): checked and started only from the screen, never on its own
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_process::init())?;
            // opens the download page for copies that update by hand (Linux .deb)
            app.handle().plugin(tauri_plugin_opener::init())?;

            let place = resolve_data_place(app.handle())?;
            std::fs::create_dir_all(&place.dir)?;
            adopt_existing_data(app.handle(), &place);

            // The window is created here (not from tauri.conf.json, which has "create": false) so that,
            // when portable, the window's own storage (screen preferences) also lives in the folder.
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .ok_or("tauri.conf.json has no \"main\" window")?;
            let mut window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
            if place.portable {
                window = window.data_directory(place.dir.join(WINDOW_DIR));
            }
            window.build()?;

            app.manage(place);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            database_url,
            data_location,
            backup_database,
            secret_get,
            secret_set,
            secret_delete,
            save_download,
            update_channel,
            web_search_page,
            web_get
        ])
        .run(tauri::generate_context!())
        .expect("error while running Homunculus");
}

#[cfg(test)]
mod web_tests {
    use super::*;
    #[test]
    fn private_and_special_addresses_are_refused() {
        for address in ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.2", "169.254.1.1", "100.64.0.1",
            "0.0.0.0", "0.1.2.3", "192.0.0.9", "192.0.2.1", "198.51.100.1", "203.0.113.1", "198.18.1.1",
            "224.0.0.1", "240.1.1.1", "255.255.255.255", "::1", "::", "fc00::1", "fd00::1", "fe80::1",
            "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:10.1.2.3", "::127.0.0.1",
            "64:ff9b::7f00:1", "2002:7f00:1::", "2001:0:7f00:1::f7f7:f7f7", "2001:0:808:808::80ff:fffe"] {
            assert!(!is_public_ip(address.parse().unwrap()), "{address}");
        }
    }
    #[test]
    fn public_addresses_stay_public() {
        for address in ["8.8.8.8", "1.1.1.1", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8",
            "64:ff9b::808:808", "2002:808:808::", "2001:0:808:808::f7f7:f7f7"] {
            assert!(is_public_ip(address.parse().unwrap()), "{address}");
        }
    }
    #[test]
    fn urls_refuse_local_names_literals_credentials_schemes_and_ports() {
        for address in ["http://localhost/", "https://a.localhost/", "http://LOCALHOST./", "http://a.localhost./",
            "http://127.0.0.1/", "http://2130706433/", "http://0x7f000001/", "http://[::1]/", "http://[::ffff:127.0.0.1]/",
            "file:///etc/passwd", "ftp://example.org/", "http://example.org:8080/", "https://user:pass@example.org/"] {
            assert_eq!(check_web_url(&reqwest::Url::parse(address).unwrap()), Err(WEB_REFUSED.to_string()), "{address}");
        }
        for address in ["https://example.org/", "http://8.8.8.8/", "http://example.org:443/", "https://[2606:4700:4700::1111]/"] {
            assert!(check_web_url(&reqwest::Url::parse(address).unwrap()).is_ok(), "{address}");
        }
    }
    #[test]
    fn redirect_rule_keeps_same_host_only() {
        let original = reqwest::Url::parse("https://example.org/start").unwrap();
        for (address, follows) in [("https://example.org/next", true), ("http://example.org/next", true),
            ("https://EXAMPLE.ORG/end", true), ("https://other.example/", false), ("https://example.org.evil.test/", false)] {
            assert_eq!(same_web_host(&original, &reqwest::Url::parse(address).unwrap()), follows);
        }
    }
    #[test]
    fn resolver_rejects_localhost_on_the_address_it_would_use() {
        use reqwest::dns::Resolve;
        let result = tauri::async_runtime::block_on(PublicOnlyResolver.resolve("localhost".parse().unwrap()));
        assert!(result.is_err());
        assert!(result.err().unwrap().to_string().contains(WEB_REFUSED));
    }
    #[test]
    fn retry_after_reads_seconds_and_http_dates() {
        assert_eq!(web_retry_after("42", 0), Some(42));
        assert_eq!(web_retry_after("Thu, 01 Jan 1970 00:00:30 GMT", 0), Some(30));
        assert_eq!(web_retry_after("Wed, 21 Oct 2015 07:28:00 GMT", 1445412420), Some(60));
        assert_eq!(web_retry_after("Wed, 21 Oct 2015 07:28:00 GMT", 1445412540), Some(0));
        assert_eq!(web_retry_after("Sat, 29 Feb 2020 00:00:00 GMT", 1582934400), Some(0));
        for invalid in ["-1", "junk", "Thu, 31 Feb 2026 00:00:30 GMT", "Thu, 01 Jan 1970 24:00:00 GMT", "Thu, 01 Jan 1970 00:00:00 PST"] {
            assert_eq!(web_retry_after(invalid, 0), None);
        }
    }
    #[test]
    fn response_bodies_are_capped_and_decode_lossily() {
        tauri::async_runtime::block_on(async {
            for (len, cut) in [(WEB_CAP - 1, false), (WEB_CAP, false), (WEB_CAP + 1, true)] {
                let response = reqwest::Response::from(tauri::http::Response::new(vec![b'x'; len]));
                let (text, capped) = web_body(response, "example.org").await.unwrap();
                assert_eq!(text.len(), len.min(WEB_CAP)); assert_eq!(capped, cut);
            }
            let response = reqwest::Response::from(tauri::http::Response::new(vec![0xff, b'a']));
            assert_eq!(web_body(response, "example.org").await.unwrap(), ("�a".into(), false));
        });
    }
    #[test]
    fn web_client_builds_without_the_updater_having_run() {
        assert!(web_client(5).is_ok());
    }
    #[test]
    fn public_address_rules_match_the_original_pinned_flint_functions() {
        let original: serde_json::Value = serde_json::from_str(include_str!("../../src/assistant/fixtures/flint-parity.json")).unwrap();
        for case in original["ips"].as_array().unwrap() {
            let address = case["address"].as_str().unwrap();
            assert_eq!(is_public_ip(address.parse().unwrap()), case["public"].as_bool().unwrap(), "{address}");
        }
    }
}
