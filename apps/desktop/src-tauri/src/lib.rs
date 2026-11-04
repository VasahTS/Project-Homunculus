// Homunculus 2 — native shell. Author: CLAUDE, 2026-10-23.
// Kept small on purpose (D-003): SQLite plugin, data folder, database backup, API keys, exports.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tauri::Manager;
mod janny;
mod botbooru;

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

// ---- Settings → Data (D-082, CLAUDE 2026-11-03): automatic backups keep the newest N; "Export everything" copies the
// database to Downloads. Only the app's own `homunculus-<seconds>.db` backups are ever counted or removed.
fn backup_files(dir: &Path) -> Vec<(PathBuf, u64)> {
    let mut out: Vec<(PathBuf, u64)> = std::fs::read_dir(dir).into_iter().flatten().flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let stamp = name.strip_prefix("homunculus-")?.strip_suffix(".db")?;
            let secs = stamp.parse::<u64>().ok()?;
            e.file_type().ok()?.is_file().then(|| (e.path(), secs))
        })
        .collect();
    out.sort_by_key(|(_, secs)| *secs);
    out
}
fn prune_backup_dir(dir: &Path, keep: usize) -> std::io::Result<usize> {
    let files = backup_files(dir);
    let extra = files.len().saturating_sub(keep.max(1));
    for (path, _) in files.iter().take(extra) {
        std::fs::remove_file(path)?;
        for side in DB_SIDE_FILES {
            let mut p = path.clone().into_os_string();
            p.push(side);
            let _ = std::fs::remove_file(PathBuf::from(p));
        }
    }
    Ok(extra)
}
#[tauri::command]
fn backups_info(place: tauri::State<DataPlace>) -> serde_json::Value {
    let dir = place.dir.join("backups");
    let files = backup_files(&dir);
    serde_json::json!({ "dir": dir.to_string_lossy(), "count": files.len(), "last": files.last().map(|(_, s)| *s) })
}
#[tauri::command]
fn prune_backups(place: tauri::State<DataPlace>, keep: usize) -> Result<usize, String> {
    prune_backup_dir(&place.dir.join("backups"), keep).map_err(|e| e.to_string())
}
#[tauri::command]
fn export_database(app: tauri::AppHandle, place: tauri::State<DataPlace>) -> Result<String, String> {
    if !place.dir.join(DB_FILE).exists() { return Err("There is nothing to export yet.".into()); }
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs();
    let mut name = format!("Homunculus export {stamp}.db");
    let mut n = 2;
    while dir.join(&name).exists() { name = format!("Homunculus export {stamp} ({n}).db"); n += 1; }
    copy_database(&place.dir, &dir, &name).map_err(|e| e.to_string())?;
    Ok(dir.join(name).to_string_lossy().into_owned())
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
// ---- Card Browser transport. CODEX, 2026-11-02 (T-007); reuses T-005's public-only client.
#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum CardSiteExpect { Json, Text, Image, Card }
impl CardSiteExpect {
    fn cap(self) -> usize {
        (match self { Self::Json | Self::Text => 8, Self::Image => 15, Self::Card => 64 }) * 1024 * 1024
    }
    fn seconds(self) -> u64 { if matches!(self, Self::Card) { 60 } else { 30 } }
}
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct CardSiteRequest {
    url: String,
    method: String,
    #[serde(default)]
    headers: BTreeMap<String, String>,
    body: Option<String>,
    expect: CardSiteExpect,
}
const CARD_SITE_HOSTS: &[&str] = &[
    "api.chub.ai", "avatars.charhub.io", "*.charhub.io", "*.chub.ai", "jannyai.com", "api.jannyai.com",
    "search.jannyai.com", "image.jannyai.com", "api.wyvern.chat", "*.wyvern.chat", "imagedelivery.net",
    "*.imagedelivery.net", "server.pygmalion.chat", "pygmalion.chat", "*.pygmalion.chat", "datacat.run",
    "media.datacat.run", "ella.janitorai.com", "botbooru.com",
];
fn check_card_site_url(url: &reqwest::Url, expect: CardSiteExpect) -> Result<(), String> {
    check_web_url(url)?;
    if url.scheme() != "https" || url.port_or_known_default() != Some(443) {
        return Err("Card sites require HTTPS on port 443.".into());
    }
    let host = url.host_str().unwrap_or("").trim_end_matches('.').to_ascii_lowercase();
    if matches!(expect, CardSiteExpect::Card) || CARD_SITE_HOSTS.iter().any(|allowed| {
        allowed.strip_prefix("*.").map_or(host == *allowed, |suffix| host.ends_with(&format!(".{suffix}")))
    }) { return Ok(()); }
    Err("That host is not an allowed card site.".into())
}
fn card_site_headers(input: &BTreeMap<String, String>) -> Result<reqwest::header::HeaderMap, String> {
    use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
    let mut headers = HeaderMap::new();
    for (name, value) in input {
        if !matches!(name.to_ascii_lowercase().as_str(), "accept" | "content-type" | "authorization" | "origin"
            | "referer" | "cache-control" | "x-session-token" | "x-meilisearch-client") {
            return Err(format!("Header {name} is not allowed for card sites."));
        }
        let name = HeaderName::from_bytes(name.as_bytes()).map_err(|_| "Invalid card-site header name.".to_string())?;
        let value = HeaderValue::from_str(value).map_err(|_| "Invalid card-site header value.".to_string())?;
        headers.insert(name, value);
    }
    Ok(headers)
}
fn card_site_method(method: &str) -> Result<reqwest::Method, String> {
    match method { "GET" => Ok(reqwest::Method::GET), "POST" => Ok(reqwest::Method::POST),
        _ => Err("Card sites support only GET and POST.".into()) }
}
fn card_site_redirect(from: &reqwest::Url, to: &reqwest::Url, expect: CardSiteExpect, status: u16, hop: u8,
    method: &mut reqwest::Method, headers: &mut reqwest::header::HeaderMap, body: &mut Option<String>) -> Result<(), String> {
    check_card_site_url(to, expect)?;
    if hop >= 5 { return Err("Too many redirects (maximum 5).".into()); }
    // Follow browser redirect semantics; never forward site credentials to another origin.
    if from.origin() != to.origin() { headers.remove("authorization"); headers.remove("x-session-token"); }
    if status == 303 || (matches!(status, 301 | 302) && *method == reqwest::Method::POST) {
        *method = reqwest::Method::GET; *body = None; headers.remove("content-type");
    }
    Ok(())
}
async fn card_site_body(mut response: reqwest::Response, host: &str, cap: usize) -> Result<Vec<u8>, String> {
    let too_large = || format!("Card-site response exceeds the {} MB limit.", cap / (1024 * 1024));
    if response.content_length().is_some_and(|len| len > cap as u64) { return Err(too_large()); }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| web_error(host, e))? {
        if chunk.len() > cap - bytes.len() { return Err(too_large()); }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
fn card_site_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { Some("image/png") }
    else if bytes.starts_with(b"\xff\xd8\xff") { Some("image/jpeg") }
    else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") { Some("image/gif") }
    else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" { Some("image/webp") }
    else { None }
}
fn card_site_is_card(bytes: &[u8]) -> bool {
    if card_site_image_mime(bytes) != Some("image/png") { return false; }
    let mut at = 8usize;
    let mut found = false;
    while at + 12 <= bytes.len() {
        let len = u32::from_be_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
        let Some(end) = at.checked_add(12).and_then(|n| n.checked_add(len)).filter(|n| *n <= bytes.len()) else { return false; };
        let kind = &bytes[at + 4..at + 8];
        if at == 8 && (kind != b"IHDR" || len != 13) { return false; }
        let data = &bytes[at + 8..end - 4];
        if kind == b"tEXt" {
            found |= [b"chara\0".as_slice(), b"ccv3\0".as_slice()].iter()
                .any(|key| data.strip_prefix(*key).is_some_and(|text| !text.is_empty()));
        }
        if kind == b"IEND" { return len == 0 && found; }
        at = end;
    }
    false
}
async fn card_site_response(response: reqwest::Response, target: &reqwest::Url, expect: CardSiteExpect, now: u64) -> Result<serde_json::Value, String> {
    use base64::Engine;
    let status = response.status();
    let headers = response.headers();
    let content_type = headers.get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let retry = headers.get("retry-after").and_then(|v| v.to_str().ok()).and_then(|v| web_retry_after(v, now));
    let mut out = serde_json::json!({ "status": status.as_u16(), "finalUrl": target, "contentType": content_type,
        "cfMitigated": headers.contains_key("cf-mitigated") });
    if let Some(seconds) = retry { out["retryAfterSecs"] = seconds.into(); }
    let bytes = card_site_body(response, target.host_str().unwrap_or(""), expect.cap()).await?;
    // Rate limits and Cloudflare pages must reach pauses.ts even when a picture/card was requested.
    if !status.is_success() || matches!(expect, CardSiteExpect::Json | CardSiteExpect::Text) {
        out["text"] = String::from_utf8_lossy(&bytes).into_owned().into();
    } else {
        let mime = card_site_image_mime(&bytes).ok_or("The card site did not return a PNG, JPEG, WebP or GIF image.")?;
        if matches!(expect, CardSiteExpect::Card) && !card_site_is_card(&bytes) {
            return Err("The card site did not return a PNG with a chara or ccv3 text chunk.".into());
        }
        out["base64"] = base64::engine::general_purpose::STANDARD.encode(&bytes).into();
        out["mime"] = mime.into();
    }
    Ok(out)
}
#[tauri::command]
async fn card_site_request(request: CardSiteRequest) -> Result<serde_json::Value, String> {
    let mut target = reqwest::Url::parse(&request.url).map_err(|_| "Invalid card-site address.".to_string())?;
    check_card_site_url(&target, request.expect)?;
    let mut method = card_site_method(&request.method)?;
    let mut headers = card_site_headers(&request.headers)?;
    let mut body = request.body;
    let timeout = std::time::Duration::from_secs(request.expect.seconds());
    let started = std::time::Instant::now();
    let client = web_client(request.expect.seconds())?;
    for hop in 0..=5 {
        let host = target.host_str().unwrap_or("");
        let left = timeout.checked_sub(started.elapsed()).ok_or_else(|| format!("{host} did not answer in time."))?;
        let mut call = client.request(method.clone(), target.clone()).headers(headers.clone()).timeout(left);
        if let Some(text) = &body { call = call.body(text.clone()); }
        let response = call.send().await.map_err(|e| web_error(host, e))?;
        if matches!(response.status().as_u16(), 301 | 302 | 303 | 307 | 308) {
            if let Some(location) = response.headers().get("location") {
                let next = location.to_str().ok().and_then(|url| target.join(url).ok()).ok_or("Invalid card-site redirect.")?;
                card_site_redirect(&target, &next, request.expect, response.status().as_u16(), hop, &mut method, &mut headers, &mut body)?;
                target = next; continue;
            }
        }
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
        return card_site_response(response, &target, request.expect, now).await;
    }
    Err("Too many redirects (maximum 5).".into())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(janny::JannyBridge::default())
        .manage(botbooru::BotbooruBridge::default())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        // A hidden account window must not keep the app alive after its main window closes. CODEX, 2026-11-02.
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(account) = window.app_handle().get_webview_window("botbooru") { let _ = account.destroy(); }
            }
        })
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
            backups_info,
            prune_backups,
            export_database,
            secret_get,
            secret_set,
            secret_delete,
            save_download,
            update_channel,
            web_search_page,
            web_get,
            card_site_request,
            janny::janny_card_url,
            janny::janny_card_report,
            botbooru::botbooru_window,
            botbooru::botbooru_request,
            botbooru::botbooru_report
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

// T-007: synthetic responses and a loopback HTTP fixture; no site requests or personal app state. CODEX, 2026-11-02.
#[cfg(test)]
mod card_site_tests {
    use super::*;
    use CardSiteExpect::{Card, Image, Json, Text};
    fn url(input: &str) -> reqwest::Url { reqwest::Url::parse(input).unwrap() }
    fn response(status: u16, bytes: Vec<u8>, headers: &[(&str, &str)]) -> reqwest::Response {
        let mut out = tauri::http::Response::builder().status(status);
        for (key, value) in headers { out = out.header(*key, *value); }
        reqwest::Response::from(out.body(bytes).unwrap())
    }
    // Response::from(Vec) has an exact body length, ignoring a synthetic Content-Length header.
    // A loopback fixture exercises unknown-length chunks and advertised limits like a real server.
    async fn streamed_response(bytes: Vec<u8>, advertised: Option<usize>) -> reqwest::Response {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
            let mut request = Vec::new();
            while !request.ends_with(b"\r\n\r\n") {
                let mut byte = [0]; if socket.read(&mut byte).unwrap() == 0 { break; } request.push(byte[0]);
            }
            if let Some(len) = advertised {
                write!(socket, "HTTP/1.1 200 OK\r\nContent-Length: {len}\r\nConnection: close\r\n\r\n").unwrap();
            } else {
                socket.write_all(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n").unwrap();
                for part in bytes.chunks(3) {
                    write!(socket, "{:x}\r\n", part.len()).unwrap(); socket.write_all(part).unwrap(); socket.write_all(b"\r\n").unwrap();
                }
                socket.write_all(b"0\r\n\r\n").unwrap();
            }
        });
        web_crypto(); // this test's own client needs the TLS provider too, whatever order the tests run in (CLAUDE)
        let response = reqwest::Client::builder().no_proxy().timeout(std::time::Duration::from_secs(5)).build().unwrap()
            .get(format!("http://{address}/synthetic")).send().await.unwrap();
        server.join().unwrap(); response
    }
    // The gate checks PNG framing and card keywords, not decoding pixels/JSON (the importer does that).
    fn chunk(kind: &[u8; 4], data: &[u8]) -> Vec<u8> {
        let mut out = (data.len() as u32).to_be_bytes().to_vec(); out.extend(kind); out.extend(data); out.extend([0; 4]); out
    }
    fn png(text: Option<&[u8]>) -> Vec<u8> {
        let mut out = b"\x89PNG\r\n\x1a\n".to_vec(); out.extend(chunk(b"IHDR", &[0; 13]));
        out.extend(chunk(b"IDAT", &[1, 2, 3]));
        if let Some(text) = text { out.extend(chunk(b"tEXt", text)); }
        out.extend(chunk(b"IEND", &[])); out
    }
    #[test]
    fn allowed_hosts_wildcards_and_trailing_dot_are_precise() {
        for host in ["api.chub.ai", "avatars.charhub.io", "cdn.charhub.io", "a.b.charhub.io", "cdn.chub.ai",
            "jannyai.com", "api.jannyai.com", "search.jannyai.com", "image.jannyai.com", "api.wyvern.chat",
            "cdn.wyvern.chat", "imagedelivery.net", "cdn.imagedelivery.net", "server.pygmalion.chat",
            "pygmalion.chat", "cdn.pygmalion.chat", "datacat.run", "media.datacat.run", "ella.janitorai.com",
            "API.CHUB.AI", "api.chub.ai."] {
            for expect in [Json, Text, Image, Card] {
                assert!(check_card_site_url(&url(&format!("https://{host}/")), expect).is_ok(), "{host}");
            }
        }
        for host in ["chub.ai.evil.com", "evilchub.ai", "chub.ai", "charhub.io", "evilcharhub.io", "evilwyvern.chat",
            "evilpygmalion.chat", "evilimagedelivery.net", "evil.datacat.run", "api.chub.ai.evil.com.", "example.org"] {
            for expect in [Json, Text, Image] {
                assert!(check_card_site_url(&url(&format!("https://{host}/")), expect).is_err(), "{host}");
            }
        }
    }
    #[test]
    fn card_exception_still_refuses_private_addresses_credentials_http_and_ports() {
        for expect in [Json, Text, Image, Card] {
            for address in ["http://api.chub.ai/", "https://api.chub.ai:80/", "https://api.chub.ai:444/",
                "https://127.0.0.1/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://10.2.3.4/",
                "https://169.254.1.1/", "https://2130706433/", "https://0x7f000001/", "https://localhost/",
                "https://a.localhost./", "https://user:pass@api.chub.ai/", "ftp://api.chub.ai/", "file:///tmp/card.png"] {
                assert!(check_card_site_url(&url(address), expect).is_err(), "{address}");
            }
            assert!(check_card_site_url(&url("https://api.chub.ai:443/card"), expect).is_ok());
        }
        assert!(check_card_site_url(&url("https://8.8.8.8/card.png"), Card).is_ok());
        assert!(check_card_site_url(&url("https://public-files.example/card.png"), Card).is_ok());
        assert!(check_card_site_url(&url("https://public-files.example/card.png"), Image).is_err());
    }
    #[test]
    fn only_documented_methods_and_headers_are_accepted() {
        for method in ["GET", "POST"] { assert!(card_site_method(method).is_ok()); }
        for method in ["get", "PUT", "DELETE", "CONNECT", "HEAD", "", "POST\r\n"] { assert!(card_site_method(method).is_err()); }
        let allowed = BTreeMap::from_iter(["Accept", "Content-Type", "Authorization", "Origin", "Referer", "Cache-Control",
            "X-Session-Token", "x-meilisearch-client"].map(|h| (h.to_string(), "synthetic".to_string())));
        assert_eq!(card_site_headers(&allowed).unwrap().len(), 8);
        assert!(card_site_headers(&BTreeMap::from([("aCcEpT".into(), "text/plain".into())])).is_ok());
        for name in ["Cookie", "Host", "User-Agent", "X-Arbitrary", "Content-Length", "Proxy-Authorization"] {
            assert!(card_site_headers(&BTreeMap::from([(name.into(), "synthetic".into())])).is_err());
        }
        assert!(card_site_headers(&BTreeMap::from([("Accept".into(), "text/plain\r\nHost: evil.test".into())])).is_err());
    }
    #[test]
    fn request_deserialization_has_bounded_expectation_and_optional_fields() {
        let input = serde_json::json!({"url":"https://api.chub.ai/", "method":"GET", "expect":"json"});
        let request: CardSiteRequest = serde_json::from_value(input.clone()).unwrap();
        assert!(request.headers.is_empty()); assert!(request.body.is_none());
        for invalid in [serde_json::json!({"expect":"binary"}), serde_json::json!({"extra":"unknown"})] {
            let mut changed = input.clone(); changed.as_object_mut().unwrap().extend(invalid.as_object().unwrap().clone());
            assert!(serde_json::from_value::<CardSiteRequest>(changed).is_err());
        }
    }
    #[test]
    fn redirects_recheck_each_target_limit_hops_and_drop_cross_origin_secrets() {
        let from = url("https://api.chub.ai/start");
        let mut method = reqwest::Method::POST;
        let mut body = Some("synthetic body".into());
        let mut headers = card_site_headers(&BTreeMap::from([("Authorization".into(), "Bearer synthetic".into()),
            ("X-Session-Token".into(), "synthetic".into()), ("Content-Type".into(), "application/json".into())])).unwrap();
        card_site_redirect(&from, &url("https://api.chub.ai/next"), Json, 307, 0, &mut method, &mut headers, &mut body).unwrap();
        assert_eq!(method, reqwest::Method::POST); assert!(body.is_some()); assert!(headers.contains_key("authorization"));
        card_site_redirect(&from, &url("https://media.datacat.run/end"), Json, 302, 1, &mut method, &mut headers, &mut body).unwrap();
        assert_eq!(method, reqwest::Method::GET); assert!(body.is_none());
        for h in ["authorization", "x-session-token", "content-type"] { assert!(!headers.contains_key(h)); }
        for next in ["https://example.org/", "http://api.chub.ai/", "https://127.0.0.1/", "https://api.chub.ai:444/"] {
            assert!(card_site_redirect(&from, &url(next), Json, 302, 1, &mut method, &mut headers, &mut body).is_err());
        }
        assert!(card_site_redirect(&from, &url("https://files.example/card"), Card, 307, 4, &mut method, &mut headers, &mut body).is_ok());
        assert!(card_site_redirect(&from, &from, Card, 307, 5, &mut method, &mut headers, &mut body).is_err());
        for status in [301, 302, 303, 307, 308] {
            let mut method = reqwest::Method::POST; let mut body = Some("body".into());
            card_site_redirect(&from, &from, Json, status, 0, &mut method, &mut headers, &mut body).unwrap();
            assert_eq!(method == reqwest::Method::POST, matches!(status, 307 | 308));
            assert_eq!(body.is_some(), matches!(status, 307 | 308));
        }
    }
    #[test]
    fn images_are_identified_by_bytes_not_the_claimed_content_type() {
        for (bytes, mime) in [(b"\x89PNG\r\n\x1a\n".as_slice(), "image/png"), (b"\xff\xd8\xffrest", "image/jpeg"),
            (b"GIF87arest", "image/gif"), (b"GIF89arest", "image/gif"), (b"RIFF\0\0\0\0WEBPrest", "image/webp")] {
            assert_eq!(card_site_image_mime(bytes), Some(mime));
        }
        for bytes in [b"<html>challenge</html>".as_slice(), b"", b"\x89PNG", b"RIFF\0\0\0\0WAVE", b"GIF90a"] {
            assert_eq!(card_site_image_mime(bytes), None);
        }
    }
    #[test]
    fn card_metadata_requires_exact_text_keyword_and_complete_png_chunks() {
        for key in [b"chara\0e30=".as_slice(), b"ccv3\0e30="] { assert!(card_site_is_card(&png(Some(key)))); }
        for text in [None, Some(b"comment\0chara".as_slice()), Some(b"charade\0e30="), Some(b"chara\0"), Some(b"ccv3") ] {
            assert!(!card_site_is_card(&png(text)));
        }
        let valid = png(Some(b"chara\0e30="));
        for end in 0..valid.len() { assert!(!card_site_is_card(&valid[..end]), "truncated at {end}"); }
        let mut bad_length = valid.clone(); bad_length[8..12].copy_from_slice(&u32::MAX.to_be_bytes());
        assert!(!card_site_is_card(&bad_length));
        let mut bad_header = valid.clone(); bad_header[12..16].copy_from_slice(b"tEXt");
        assert!(!card_site_is_card(&bad_header));
        let mut embedded = png(None); embedded.extend(chunk(b"tEXt", b"chara\0e30="));
        assert!(!card_site_is_card(&embedded));
    }
    #[test]
    fn caps_and_total_request_timeouts_are_exact() {
        for (expect, mb, seconds) in [(Json, 8, 30), (Text, 8, 30), (Image, 15, 30), (Card, 64, 60)] {
            assert_eq!(expect.cap(), mb * 1024 * 1024); assert_eq!(expect.seconds(), seconds);
        }
        tauri::async_runtime::block_on(async {
            for (len, succeeds) in [(7, true), (8, true), (9, false)] {
                let result = card_site_body(response(200, vec![b'x'; len], &[]), "example.org", 8).await;
                assert_eq!(result.is_ok(), succeeds);
                if let Ok(bytes) = result { assert_eq!(bytes.len(), len); }
            }
            for (len, succeeds) in [(7, true), (8, true), (9, false)] {
                let input = streamed_response(vec![b'x'; len], None).await;
                assert!(input.content_length().is_none());
                assert_eq!(card_site_body(input, "loopback fixture", 8).await.is_ok(), succeeds);
            }
            assert!(card_site_body(streamed_response(vec![], Some(9)).await, "loopback fixture", 8).await.is_err());
            assert!(card_site_response(response(200, vec![b'x'; Json.cap() + 1], &[]), &url("https://api.chub.ai/"), Json, 0).await.is_err());
        });
    }
    #[test]
    fn non_success_bodies_keep_rate_limit_and_cloudflare_metadata_for_every_expectation() {
        tauri::async_runtime::block_on(async {
            for expect in [Json, Text, Image, Card] {
                for status in [202, 301, 403, 404, 429, 503] {
                    let input = response(status, b"Cloudflare challenge".to_vec(), &[("retry-after", "Thu, 01 Jan 1970 00:00:30 GMT"),
                        ("cf-mitigated", "challenge"), ("content-type", "text/html")]);
                    // 202 is a successful HTTP status: binary expectations still validate their bytes.
                    let out = card_site_response(input, &url("https://api.chub.ai/final"), expect, 0).await;
                    if status == 202 && matches!(expect, Image | Card) { assert!(out.is_err()); continue; }
                    let out = out.unwrap();
                    assert_eq!(out["status"], status); assert_eq!(out["retryAfterSecs"], 30); assert_eq!(out["cfMitigated"], true);
                    assert_eq!(out["text"], "Cloudflare challenge"); assert_eq!(out["finalUrl"], "https://api.chub.ai/final");
                    assert_eq!(out["contentType"], "text/html"); assert!(out.get("base64").is_none());
                }
            }
        });
    }
    #[test]
    fn successful_binary_text_and_false_image_responses_have_the_right_shape() {
        tauri::async_runtime::block_on(async {
            let address = url("https://public-files.example/card.png"); let card = png(Some(b"ccv3\0e30="));
            let out = card_site_response(response(200, card.clone(), &[("content-type", "application/octet-stream")]), &address, Card, 0).await.unwrap();
            use base64::Engine;
            assert_eq!(out["mime"], "image/png"); assert_eq!(out["cfMitigated"], false); assert!(out.get("retryAfterSecs").is_none());
            assert_eq!(base64::engine::general_purpose::STANDARD.decode(out["base64"].as_str().unwrap()).unwrap(), card);
            for expect in [Image, Card] {
                assert!(card_site_response(response(200, b"<html>not an image</html>".to_vec(), &[("content-type", "image/png")]), &address, expect, 0).await.is_err());
            }
            assert!(card_site_response(response(200, png(None), &[]), &address, Image, 0).await.is_ok());
            assert!(card_site_response(response(200, png(None), &[]), &address, Card, 0).await.is_err());
            for (bytes, mime) in [(b"\xff\xd8\xffrest".as_slice(), "image/jpeg"), (b"GIF89arest", "image/gif"), (b"RIFF\0\0\0\0WEBP", "image/webp")] {
                let out = card_site_response(response(200, bytes.to_vec(), &[]), &address, Image, 0).await.unwrap();
                assert_eq!(out["mime"], mime);
                assert!(card_site_response(response(200, bytes.to_vec(), &[]), &address, Card, 0).await.is_err());
            }
            let out = card_site_response(response(200, vec![0xff, b'a'], &[]), &address, Text, 0).await.unwrap();
            assert_eq!(out["text"], "�a"); assert!(out.get("base64").is_none());
            let out = card_site_response(response(429, vec![], &[("retry-after", "17")]), &address, Json, 0).await.unwrap();
            assert_eq!(out["retryAfterSecs"], 17);
        });
    }
    #[test]
    fn native_command_rejects_bad_requests_before_making_any_network_call() {
        tauri::async_runtime::block_on(async {
            for (address, method, name) in [("https://example.org/", "GET", "Accept"), ("https://127.0.0.1/", "GET", "Accept"),
                ("https://api.chub.ai/", "DELETE", "Accept"), ("https://api.chub.ai/", "GET", "Cookie"), ("not a URL", "GET", "Accept")] {
                let input = CardSiteRequest { url: address.into(), method: method.into(), headers: BTreeMap::from([(name.into(), "synthetic".into())]), body: None, expect: Json };
                assert!(card_site_request(input).await.is_err());
            }
        });
    }
}

// Settings → Data: only the app's own backups are counted and removed, oldest first. CLAUDE, 2026-11-03.
#[cfg(test)]
mod backup_tests {
    use super::*;
    #[test]
    fn prune_keeps_the_newest_and_never_touches_other_files() {
        let dir = std::env::temp_dir().join(format!("h2-backups-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for s in [100, 300, 200, 400] { std::fs::write(dir.join(format!("homunculus-{s}.db")), b"x").unwrap(); }
        std::fs::write(dir.join("homunculus-300.db-wal"), b"x").unwrap();
        for other in ["notes.txt", "homunculus-abc.db", "mine-500.db"] { std::fs::write(dir.join(other), b"x").unwrap(); }
        assert_eq!(backup_files(&dir).iter().map(|(_, s)| *s).collect::<Vec<_>>(), vec![100, 200, 300, 400]);
        assert_eq!(prune_backup_dir(&dir, 2).unwrap(), 2);
        assert_eq!(backup_files(&dir).iter().map(|(_, s)| *s).collect::<Vec<_>>(), vec![300, 400]);
        for other in ["notes.txt", "homunculus-abc.db", "mine-500.db", "homunculus-300.db-wal"] { assert!(dir.join(other).exists(), "{other}"); }
        assert_eq!(prune_backup_dir(&dir, 0).unwrap(), 1, "keep is at least one");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
