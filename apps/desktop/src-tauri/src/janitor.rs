// JanitorAI window (docs/CARD-BROWSER.md §7, D-098): the site's own page, kept hidden, runs fixed read-only GETs for the
// Card Browser, so its Cloudflare check and the user's sign-in stay inside it. Same shape as botbooru.rs (CODEX): one
// pending request, a random id, a 35 s wait, an 8 MiB cap; the page may only call janitor_report. The idea of a hidden
// in-page browser comes from Glaze (hydall/Glaze f1fe39e, AGPL-3.0). Nothing here writes to the account. CLAUDE, 2026-11-08.
use std::sync::{Arc, Mutex, atomic::{AtomicBool, AtomicU64, Ordering}};
use tauri::Manager;
const LABEL: &str = "janitor";
const ORIGIN: &str = "https://janitorai.com";
const CAP: usize = 8 * 1024 * 1024;
#[derive(Default)]
pub(crate) struct JanitorBridge {
    serial: tauri::async_runtime::Mutex<()>,
    /// Get-or-create of the window only, so "Sign In…" never waits behind a pending request.
    opening: Mutex<()>,
    /// The window has finished loading a JanitorAI page (not a sign-in provider's).
    ready: Arc<AtomicBool>,
    counter: AtomicU64,
    pending: Mutex<Option<(String, std::sync::mpsc::Sender<serde_json::Value>)>>,
}
fn safe_id(id: &str) -> bool { !id.is_empty() && id.len() <= 64 && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') }
fn valid_path(path: &str) -> bool {
    if path == "logout" { return true; }
    let Ok(url) = reqwest::Url::parse(&format!("{ORIGIN}{path}")) else { return false; };
    if !path.starts_with("/hampter/") || url.origin().ascii_serialization() != ORIGIN || url.fragment().is_some() { return false; }
    let route = url.path();
    if path.split('?').next() != Some(route) { return false; }
    if route == "/hampter/characters" {
        return path.len() <= 4096 && url.query_pairs().all(|(k, _)| ["page", "mode", "sort", "search", "tag_id[]", "custom_tags[]"].contains(&k.as_ref()));
    }
    if url.query().is_some() { return false; }
    ["/hampter/tags", "/hampter/profiles/mine"].contains(&route)
        || ["/hampter/characters/", "/hampter/script/"].iter().any(|p| route.strip_prefix(p).is_some_and(safe_id))
}
fn report_allowed(label: &str, url: &reqwest::Url, body: &str) -> bool { label == LABEL && url.origin().ascii_serialization() == ORIGIN && body.len() <= CAP }
fn deliver(state: &JanitorBridge, request_id: &str, payload: serde_json::Value) -> Result<(), String> {
    let mut pending = state.pending.lock().map_err(|_| "JanitorAI window is unavailable.")?;
    if pending.as_ref().map(|p| p.0.as_str()) != Some(request_id) { return Err("Expired JanitorAI response.".into()); }
    let (_, sender) = pending.take().unwrap(); sender.send(payload).map_err(|_| "Expired JanitorAI response.".into())
}
/// Google refuses to sign in inside a page that calls itself "Edg" (WebView2), so on Windows the window says it is the
/// Chrome of the same version, keeping it in line with what the page reports to Cloudflare (Glaze `_deriveJanitorWebViewUA`).
#[cfg_attr(not(windows), allow(dead_code))]
fn user_agent(webview_version: &str) -> Option<String> {
    let major: String = webview_version.chars().take_while(|c| c.is_ascii_digit()).collect();
    if major.is_empty() { return None; }
    Some(format!("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{major}.0.0.0 Safari/537.36"))
}
fn window(app: &tauri::AppHandle, state: &JanitorBridge) -> Result<tauri::WebviewWindow, String> {
    let _opening = state.opening.lock().map_err(|_| "JanitorAI window is unavailable.")?;
    if let Some(w) = app.get_webview_window(LABEL) { return Ok(w); }
    state.ready.store(false, Ordering::SeqCst);
    let ready = state.ready.clone();
    let place = app.state::<super::DataPlace>();
    #[allow(unused_mut)]
    let mut builder = tauri::WebviewWindowBuilder::new(app, LABEL, tauri::WebviewUrl::External(format!("{ORIGIN}/").parse().unwrap()))
        .title("JanitorAI").inner_size(1000., 780.).visible(false).focused(false)
        .data_directory(place.dir.join("janitor-browser")).initialization_script(include_str!("janitor.js"))
        // sign-in may pass through Google or Discord; only JanitorAI's own page can talk to the app (capabilities/janitor.json)
        .on_navigation(|url| url.scheme() == "https")
        .on_page_load(move |_, p| {
            let here = p.url().origin().ascii_serialization() == ORIGIN;
            ready.store(here && matches!(p.event(), tauri::webview::PageLoadEvent::Finished), Ordering::SeqCst);
        });
    #[cfg(windows)]
    if let Some(ua) = tauri::webview_version().ok().as_deref().and_then(user_agent) { builder = builder.user_agent(&ua); }
    let w = builder.build().map_err(|e| e.to_string())?;
    let hidden = w.clone();
    w.on_window_event(move |e| { if let tauri::WindowEvent::CloseRequested { api, .. } = e { api.prevent_close(); let _ = hidden.hide(); } });
    Ok(w)
}
/// Shows JanitorAI's window; `sign_in` goes to its sign-in page.
#[tauri::command]
pub(crate) async fn janitor_window(app: tauri::AppHandle, webview: tauri::Webview, state: tauri::State<'_, JanitorBridge>, sign_in: bool) -> Result<(), String> {
    if webview.label() != "main" { return Err("Only the app can open the JanitorAI window.".into()); }
    let w = window(&app, &state)?;
    if sign_in { w.navigate(format!("{ORIGIN}/login").parse().unwrap()).map_err(|e| e.to_string())?; }
    w.show().map_err(|e| e.to_string())?; w.set_focus().map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn janitor_report(webview: tauri::Webview, state: tauri::State<JanitorBridge>, request_id: String, status: u16, body: String, cf_mitigated: bool, retry_after_secs: Option<u64>) -> Result<(), String> {
    if !report_allowed(webview.label(), &webview.url().map_err(|e| e.to_string())?, &body) || !(100..=599).contains(&status) { return Err("Invalid JanitorAI response.".into()); }
    deliver(&state, &request_id, serde_json::json!({"status":status,"contentType":"application/json","text":body,"cfMitigated":cf_mitigated,"retryAfterSecs":retry_after_secs,"finalUrl":ORIGIN}))
}
#[tauri::command]
pub(crate) async fn janitor_request(app: tauri::AppHandle, webview: tauri::Webview, state: tauri::State<'_, JanitorBridge>, path: String) -> Result<serde_json::Value, String> {
    use std::hash::BuildHasher;
    if webview.label() != "main" || !valid_path(&path) { return Err("Invalid JanitorAI request.".into()); }
    let _serial = state.serial.lock().await;
    let w = window(&app, &state)?;
    let ready = state.ready.clone();
    tauri::async_runtime::spawn_blocking(move || { let start = std::time::Instant::now(); while !ready.load(Ordering::SeqCst) { if start.elapsed().as_secs() >= 25 { return Err("Open JanitorAI to finish its browser check or sign-in, then try again."); } std::thread::sleep(std::time::Duration::from_millis(40)); } Ok(()) }).await.map_err(|e| e.to_string())??;
    let n = state.counter.fetch_add(1, Ordering::SeqCst);
    let request_id = format!("{:x}{:x}", std::collections::hash_map::RandomState::new().hash_one((std::time::SystemTime::now(), n)), std::collections::hash_map::RandomState::new().hash_one(n));
    let (sender, receiver) = std::sync::mpsc::channel();
    *state.pending.lock().map_err(|_| "JanitorAI window is unavailable.")? = Some((request_id.clone(), sender));
    let script = format!("window.__h2Janitor && window.__h2Janitor({});", serde_json::json!({"id":request_id,"path":path}));
    if let Err(e) = w.eval(script) { state.pending.lock().map_err(|_| "JanitorAI window is unavailable.")?.take(); return Err(e.to_string()); }
    let answer = tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(std::time::Duration::from_secs(35))).await;
    state.pending.lock().map_err(|_| "JanitorAI window is unavailable.")?.take();
    answer.map_err(|e| e.to_string())?.map_err(|_| "JanitorAI did not answer. Open JanitorAI and try again.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "0b6e4c1a-1111-4c2b-9a77-2f1d2b3c4d5e";
    #[test]
    fn only_fixed_read_only_paths_are_accepted() {
        for p in ["/hampter/tags", "/hampter/profiles/mine", "/hampter/characters?page=2&mode=sfw&sort=trending&search=keeper&tag_id%5B%5D=53&custom_tags%5B%5D=cozy",
                  &format!("/hampter/characters/{ID}"), &format!("/hampter/script/{ID}"), "logout"] { assert!(valid_path(p), "{p}"); }
        for p in ["/hampter/profiles/mine/blocked-content", "/hampter/profiles/mine?x=1", "/hampter/characters?user_id%5B%5D=me", "/hampter/proxy-configs", "/hampter/generateAlpha",
                  "/hampter/chats", "/hampter/characters/../profiles/mine", "/hampter/characters/%2e%2e/profiles/mine", "/hampter/characters/a_b", "/hampter/characters/x?y=1",
                  "/hampter/script/", "/hampter/characters#x", "//evil.test/hampter/tags", "https://evil.test", "/login", &format!("/hampter/characters/{}", "a".repeat(65))] { assert!(!valid_path(p), "{p}"); }
    }
    #[test]
    fn wrong_origin_window_and_oversized_reports_are_refused() {
        let good = reqwest::Url::parse("https://janitorai.com/characters/x").unwrap();
        assert!(report_allowed(LABEL, &good, "{}"));
        assert!(!report_allowed("main", &good, "{}"));
        assert!(!report_allowed("botbooru", &good, "{}"));
        assert!(!report_allowed(LABEL, &good, &"x".repeat(CAP + 1)));
        for u in ["http://janitorai.com/", "https://janitorai.com.evil.test/", "https://accounts.google.com/", "https://ella.janitorai.com/"] { assert!(!report_allowed(LABEL, &u.parse().unwrap(), "{}")); }
    }
    #[test]
    fn stale_duplicate_and_expired_reports_cannot_complete_a_request() {
        let s = JanitorBridge::default();
        let (tx, rx) = std::sync::mpsc::channel();
        *s.pending.lock().unwrap() = Some(("new".into(), tx));
        assert!(deliver(&s, "old", serde_json::json!({})).is_err());
        assert!(matches!(rx.try_recv(), Err(std::sync::mpsc::TryRecvError::Empty)));
        assert!(deliver(&s, "new", serde_json::json!({"ok":true})).is_ok());
        assert_eq!(rx.recv().unwrap()["ok"], true);
        assert!(deliver(&s, "new", serde_json::json!({})).is_err());
    }
    #[test]
    fn the_remote_page_can_only_report_and_cannot_invoke_app_commands() {
        let c: serde_json::Value = serde_json::from_str(include_str!("../capabilities/janitor.json")).unwrap();
        assert_eq!(c["permissions"], serde_json::json!(["allow-janitor-report"]));
        assert_eq!(c["windows"], serde_json::json!(["janitor"]));
        assert_eq!(c["remote"]["urls"], serde_json::json!([ORIGIN]));
        assert_eq!(c["local"], false);
    }
    #[test]
    fn the_windows_user_agent_keeps_the_real_chrome_version() {
        assert_eq!(user_agent("131.0.2903.86").unwrap(), "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
        assert!(user_agent("unknown").is_none());
    }
}
