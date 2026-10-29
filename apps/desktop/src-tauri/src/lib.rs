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
            update_channel
        ])
        .run(tauri::generate_context!())
        .expect("error while running Homunculus");
}
