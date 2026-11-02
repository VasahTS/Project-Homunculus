// Isolated BotBooru browser session: fixed GET routes, one bounded pending response. CODEX, 2026-11-02.
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use tauri::Manager;
const LABEL: &str = "botbooru";
const ORIGIN: &str = "https://botbooru.com";
const CAP: usize = 8 * 1024 * 1024;
#[derive(Default)]
pub(crate) struct BotbooruBridge {
    serial: tauri::async_runtime::Mutex<()>,
    ready: Arc<AtomicBool>,
    pending: Mutex<Option<(String, std::sync::mpsc::Sender<serde_json::Value>)>>,
}
fn valid_path(path: &str) -> bool {
    if path == "logout" { return true; }
    let Ok(url) = reqwest::Url::parse(&format!("{ORIGIN}{path}")) else { return false; };
    if !path.starts_with('/') || url.origin().ascii_serialization() != ORIGIN || url.fragment().is_some() { return false; }
    let route = url.path();
    if path.split('?').next() != Some(route) { return false; }
    if route == "/posts/" {
        return path.len() <= 4096 && url.query_pairs().all(|(k, _)| ["limit", "offset", "sort", "q", "qtext", "sfw_only", "min_tokens", "max_tokens"].contains(&k.as_ref()));
    }
    if url.query().is_some() { return false; }
    ["/auth/me", "/tags/"].contains(&route) || ["/download/json/", "/post/"].iter().any(|p| route.strip_prefix(p).is_some_and(|id| !id.is_empty() && id.len() <= 12 && id.bytes().all(|c| c.is_ascii_digit())))
}
fn report_allowed(label: &str, url: &reqwest::Url, body: &str) -> bool { label == LABEL && url.origin().ascii_serialization() == ORIGIN && body.len() <= CAP }
fn deliver(state: &BotbooruBridge, request_id: &str, payload: serde_json::Value) -> Result<(), String> {
    let mut pending = state.pending.lock().map_err(|_| "BotBooru session is unavailable.")?;
    if pending.as_ref().map(|p| p.0.as_str()) != Some(request_id) { return Err("Expired BotBooru response.".into()); }
    let (_, sender) = pending.take().unwrap(); sender.send(payload).map_err(|_| "Expired BotBooru response.".into())
}
fn window(app: &tauri::AppHandle, state: &BotbooruBridge) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(LABEL) { return Ok(w); }
    state.ready.store(false, Ordering::SeqCst);
    let ready = state.ready.clone();
    let place = app.state::<super::DataPlace>();
    let w = tauri::WebviewWindowBuilder::new(app, LABEL, tauri::WebviewUrl::External(format!("{ORIGIN}/account").parse().unwrap()))
        .title("BotBooru Account").inner_size(1000., 760.).visible(false).focused(false)
        .data_directory(place.dir.join("botbooru-browser")).initialization_script(include_str!("botbooru.js"))
        .on_navigation(|url| url.origin().ascii_serialization() == ORIGIN)
        .on_page_load(move |_, p| { ready.store(matches!(p.event(), tauri::webview::PageLoadEvent::Finished), Ordering::SeqCst); })
        .build().map_err(|e| e.to_string())?;
    let hidden = w.clone();
    w.on_window_event(move |e| { if let tauri::WindowEvent::CloseRequested { api, .. } = e { api.prevent_close(); let _ = hidden.hide(); } });
    Ok(w)
}
#[tauri::command]
pub(crate) async fn botbooru_window(app: tauri::AppHandle, webview: tauri::Webview, state: tauri::State<'_, BotbooruBridge>) -> Result<(), String> {
    if webview.label() != "main" { return Err("Only the app can open the account window.".into()); }
    let _serial = state.serial.lock().await;
    let w = window(&app, &state)?; w.show().map_err(|e| e.to_string())?; w.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn botbooru_report(webview: tauri::Webview, state: tauri::State<BotbooruBridge>, request_id: String, status: u16, body: String, cf_mitigated: bool, retry_after_secs: Option<u64>) -> Result<(), String> {
    if !report_allowed(webview.label(), &webview.url().map_err(|e| e.to_string())?, &body) || !(100..=599).contains(&status) { return Err("Invalid BotBooru response.".into()); }
    deliver(&state, &request_id, serde_json::json!({"status":status,"contentType":"application/json","text":body,"cfMitigated":cf_mitigated,"retryAfterSecs":retry_after_secs,"finalUrl":ORIGIN}))
}
#[tauri::command]
pub(crate) async fn botbooru_request(app: tauri::AppHandle, webview: tauri::Webview, state: tauri::State<'_, BotbooruBridge>, path: String) -> Result<serde_json::Value, String> {
    use std::hash::BuildHasher;
    if webview.label() != "main" || !valid_path(&path) { return Err("Invalid BotBooru request.".into()); }
    let _serial = state.serial.lock().await;
    let w = window(&app, &state)?;
    let ready = state.ready.clone();
    tauri::async_runtime::spawn_blocking(move || { let start = std::time::Instant::now(); while !ready.load(Ordering::SeqCst) { if start.elapsed().as_secs() >= 25 { return Err("Open BotBooru Account to finish the browser check."); } std::thread::sleep(std::time::Duration::from_millis(40)); } Ok(()) }).await.map_err(|e| e.to_string())??;
    let request_id = format!("{:x}", std::collections::hash_map::RandomState::new().hash_one(std::time::SystemTime::now()));
    let (sender, receiver) = std::sync::mpsc::channel();
    *state.pending.lock().map_err(|_| "BotBooru session is unavailable.")? = Some((request_id.clone(), sender));
    let script = format!("window.__h2Botbooru({});", serde_json::json!({"id":request_id,"path":path}));
    if let Err(e) = w.eval(script) { state.pending.lock().map_err(|_| "BotBooru session is unavailable.")?.take(); return Err(e.to_string()); }
    let answer = tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(std::time::Duration::from_secs(35))).await;
    state.pending.lock().map_err(|_| "BotBooru session is unavailable.")?.take();
    answer.map_err(|e| e.to_string())?.map_err(|_| "BotBooru did not answer. Open Account and try again.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_fixed_read_only_paths_are_accepted() {
        for p in ["/auth/me", "/tags/", "/posts/?limit=40&offset=0&q=-horror&sfw_only=true", "/download/json/42", "/post/42", "logout"] { assert!(valid_path(p), "{p}"); }
        for p in ["/auth/token", "/auth/me?x=1", "/auth/me/blacklist", "//evil.test/posts/", "/posts/?show_nsfl=true", "/posts/#fragment", "/download/png/42", "/download/json/../../auth/me", "/download/json/%2f", "/post/1234567890123", "https://evil.test"] { assert!(!valid_path(p), "{p}"); }
    }
    #[test]
    fn wrong_origin_window_and_oversized_reports_are_refused() {
        let good = reqwest::Url::parse("https://botbooru.com/account").unwrap();
        assert!(report_allowed(LABEL, &good, "{}"));
        assert!(!report_allowed("main", &good, "{}"));
        assert!(!report_allowed(LABEL, &good, &"x".repeat(CAP + 1)));
        for u in ["http://botbooru.com/", "https://botbooru.com.evil.test/", "https://botbooru.com:444/", "https://janitorai.com/"] { assert!(!report_allowed(LABEL, &u.parse().unwrap(), "{}")); }
    }
    #[test]
    fn stale_duplicate_and_expired_reports_cannot_complete_a_request() {
        let s = BotbooruBridge::default();
        let (tx, rx) = std::sync::mpsc::channel();
        *s.pending.lock().unwrap() = Some(("new".into(), tx));
        assert!(deliver(&s, "old", serde_json::json!({})).is_err());
        assert!(matches!(rx.try_recv(), Err(std::sync::mpsc::TryRecvError::Empty)));
        assert!(deliver(&s, "new", serde_json::json!({"ok":true})).is_ok());
        assert_eq!(rx.recv().unwrap()["ok"], true);
        assert!(deliver(&s, "new", serde_json::json!({})).is_err());
        let (tx, _rx) = std::sync::mpsc::channel();
        *s.pending.lock().unwrap() = Some(("expired".into(), tx));
        s.pending.lock().unwrap().take();
        assert!(deliver(&s, "expired", serde_json::json!({})).is_err());
    }
    #[test]
    fn the_remote_page_can_only_report_and_cannot_invoke_app_commands() {
        let c: serde_json::Value = serde_json::from_str(include_str!("../capabilities/botbooru.json")).unwrap();
        assert_eq!(c["permissions"], serde_json::json!(["allow-botbooru-report"]));
        assert_eq!(c["windows"], serde_json::json!(["botbooru"]));
        assert_eq!(c["remote"]["urls"], serde_json::json!([ORIGIN]));
        assert_eq!(c["local"], false);
    }
}
