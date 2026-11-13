// Homunculus 2 — folders the user picked: a SillyTavern folder to import, a linked folder of cards. CLAUDE, 2026-11-13 (D-127).
//
// The window can list and read files ONLY inside a folder the user chose in the system's folder dialog. The dialog is
// opened here (not by the page), and the chosen folder gets an id; every later call names that id and a path inside it,
// which is checked so it can never leave the folder (no "..", no absolute paths, no links pointing outside).
// Linked folders (the external card source) are remembered in `linked-folders.json` in the data folder; a folder picked
// for a one-time import is remembered only until the app closes. Nothing here ever writes into the user's folders.
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

const LINKED_FILE: &str = "linked-folders.json";
/// A safety cap: a folder listing stops after this many entries.
const MAX_ENTRIES: usize = 300_000;

#[derive(Default)]
pub struct Folders {
    picked: Mutex<BTreeMap<String, PathBuf>>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct PickedFolder { pub id: String, pub path: String, pub name: String, pub linked: bool }

#[derive(Serialize, Debug, PartialEq)]
pub struct FolderEntry {
    /// Path inside the folder, with "/" (e.g. "chats/Mira/Mira - 2026.jsonl").
    pub path: String,
    pub dir: bool,
    pub size: u64,
    /// Last change, ms since 1970.
    pub modified: u64,
}

fn linked_path(data_dir: &Path) -> PathBuf { data_dir.join(LINKED_FILE) }

pub fn read_linked(data_dir: &Path) -> BTreeMap<String, PathBuf> {
    std::fs::read_to_string(linked_path(data_dir)).ok()
        .and_then(|t| serde_json::from_str::<BTreeMap<String, PathBuf>>(&t).ok())
        .unwrap_or_default()
}

fn write_linked(data_dir: &Path, map: &BTreeMap<String, PathBuf>) -> Result<(), String> {
    let text = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(linked_path(data_dir), text).map_err(|e| e.to_string())
}

fn folder_name(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| p.to_string_lossy().into_owned())
}

fn new_id() -> String {
    let nanos = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("f{nanos:x}")
}

/// `rel` inside `root`, or an error when it would leave it. The file must exist (it is resolved on disk, so a link that
/// points outside the folder is refused too).
pub fn inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.components().any(|c| !matches!(c, Component::Normal(_) | Component::CurDir)) {
        return Err("that path is outside the folder".into());
    }
    let root = root.canonicalize().map_err(|_| "the folder is not there any more".to_string())?;
    let full = root.join(rel_path).canonicalize().map_err(|_| format!("not found: {rel}"))?;
    if !full.starts_with(&root) { return Err("that path is outside the folder".into()); }
    Ok(full)
}

/// Every file and folder under `root/sub` (or only its direct children), with sizes and dates. Hidden entries skipped.
pub fn list(root: &Path, sub: &str, recursive: bool) -> Result<Vec<FolderEntry>, String> {
    let start = if sub.is_empty() { root.canonicalize().map_err(|_| "the folder is not there any more".to_string())? } else { inside(root, sub)? };
    let base = root.canonicalize().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    let mut stack = vec![start];
    while let Some(dir) = stack.pop() {
        let Ok(read) = std::fs::read_dir(&dir) else { continue };
        for entry in read.flatten() {
            if out.len() >= MAX_ENTRIES { return Ok(out); }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') { continue; }
            let Ok(meta) = entry.metadata() else { continue }; // follows links; a broken one is skipped
            let path = entry.path();
            // a link that leads outside the folder is left out
            match path.canonicalize() { Ok(c) if c.starts_with(&base) => {}, _ => continue }
            let rel = path.strip_prefix(&base).unwrap_or(&path).components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/");
            let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
            let dir_entry = meta.is_dir();
            if dir_entry && recursive { stack.push(path.clone()); }
            out.push(FolderEntry { path: rel, dir: dir_entry, size: if dir_entry { 0 } else { meta.len() }, modified });
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

impl Folders {
    fn root(&self, data_dir: &Path, id: &str) -> Result<PathBuf, String> {
        if let Some(p) = self.picked.lock().map_err(|e| e.to_string())?.get(id) { return Ok(p.clone()); }
        read_linked(data_dir).get(id).cloned().ok_or_else(|| "that folder was not picked (pick it again)".into())
    }
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.state::<crate::DataPlace>().dir.clone())
}

/// Opens the system's folder dialog. `link`: remember it as a linked folder (the external card source).
#[tauri::command]
pub async fn folder_pick(app: tauri::AppHandle, title: String, link: bool) -> Result<Option<PickedFolder>, String> {
    use tauri::Manager;
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().set_title(&title).blocking_pick_folder();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let id = new_id();
    let dir = data_dir(&app)?;
    if link {
        let mut map = read_linked(&dir);
        if let Some((old, _)) = map.iter().find(|(_, p)| **p == path) {
            return Ok(Some(PickedFolder { id: old.clone(), name: folder_name(&path), path: path.to_string_lossy().into_owned(), linked: true }));
        }
        map.insert(id.clone(), path.clone());
        write_linked(&dir, &map)?;
    } else {
        app.state::<Folders>().picked.lock().map_err(|e| e.to_string())?.insert(id.clone(), path.clone());
    }
    Ok(Some(PickedFolder { id, name: folder_name(&path), path: path.to_string_lossy().into_owned(), linked: link }))
}

/// The linked folders (external card sources), and whether each is there right now.
#[tauri::command]
pub fn folders_linked(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let dir = data_dir(&app)?;
    Ok(read_linked(&dir).into_iter().map(|(id, p)| serde_json::json!({
        "id": id, "path": p.to_string_lossy(), "name": folder_name(&p), "linked": true, "present": p.is_dir(),
    })).collect())
}

/// Stops linking a folder (nothing is deleted anywhere).
#[tauri::command]
pub fn folder_unlink(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let mut map = read_linked(&dir);
    if map.remove(&id).is_some() { write_linked(&dir, &map)?; }
    Ok(())
}

#[tauri::command]
pub fn folder_list(app: tauri::AppHandle, state: tauri::State<Folders>, id: String, sub: String, recursive: bool) -> Result<Vec<FolderEntry>, String> {
    let root = state.root(&data_dir(&app)?, &id)?;
    list(&root, &sub, recursive)
}

/// One file's bytes (sent as raw bytes, not text).
#[tauri::command]
pub fn folder_read(app: tauri::AppHandle, state: tauri::State<Folders>, id: String, path: String) -> Result<tauri::ipc::Response, String> {
    let root = state.root(&data_dir(&app)?, &id)?;
    let full = inside(&root, &path)?;
    if !full.is_file() { return Err(format!("not a file: {path}")); }
    std::fs::read(&full).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let d = std::env::temp_dir().join(format!("h2-folders-{}", new_id()));
        std::fs::create_dir_all(d.join("characters")).unwrap();
        std::fs::create_dir_all(d.join("chats/Mira")).unwrap();
        std::fs::write(d.join("characters/Mira.png"), b"png").unwrap();
        std::fs::write(d.join("chats/Mira/a.jsonl"), b"{}").unwrap();
        std::fs::write(d.join(".hidden"), b"x").unwrap();
        d
    }

    #[test]
    fn lists_inside_the_folder_with_sizes() {
        let d = temp();
        let all = list(&d, "", true).unwrap();
        let paths: Vec<_> = all.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["characters", "characters/Mira.png", "chats", "chats/Mira", "chats/Mira/a.jsonl"]);
        assert_eq!(all[1].size, 3);
        assert!(all[1].modified > 0);
        let top = list(&d, "chats", false).unwrap();
        assert_eq!(top.iter().map(|e| e.path.as_str()).collect::<Vec<_>>(), vec!["chats/Mira"]);
    }

    #[test]
    fn never_leaves_the_folder() {
        let d = temp();
        assert!(inside(&d, "characters/Mira.png").is_ok());
        assert!(inside(&d, "../etc/passwd").is_err());
        assert!(inside(&d, "characters/../../x").is_err());
        let abs = if cfg!(windows) { "C:\\Windows\\win.ini" } else { "/etc/passwd" };
        assert!(inside(&d, abs).is_err());
        assert!(list(&d, "..", true).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_link_pointing_outside_is_refused() {
        let d = temp();
        let outside = std::env::temp_dir().join(format!("h2-outside-{}", new_id()));
        std::fs::write(&outside, b"secret").unwrap();
        std::os::unix::fs::symlink(&outside, d.join("characters/link.png")).unwrap();
        assert!(inside(&d, "characters/link.png").is_err());
        assert!(!list(&d, "", true).unwrap().iter().any(|e| e.path.ends_with("link.png")));
    }

    #[test]
    fn linked_folders_are_remembered_in_the_data_folder() {
        let data = temp();
        let mut map = BTreeMap::new();
        map.insert("f1".to_string(), PathBuf::from("/cards"));
        write_linked(&data, &map).unwrap();
        assert_eq!(read_linked(&data), map);
        let f = Folders::default();
        assert_eq!(f.root(&data, "f1").unwrap(), PathBuf::from("/cards"));
        assert!(f.root(&data, "nope").is_err());
    }
}
