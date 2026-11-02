// JannyAI's supported download API in its own browser session. CODEX, 2026-11-02.
use std::sync::{mpsc, Mutex};
use tauri::Manager;

const LABEL: &str = "janny-card";
const ORIGIN: &str = "https://api.jannyai.com";
const CAP: usize = 128 * 1024;
#[derive(Default)]
pub(crate) struct JannyBridge {
    serial: tauri::async_runtime::Mutex<()>,
    pending: Mutex<Option<(String, mpsc::Sender<serde_json::Value>)>>,
}
fn valid_id(id: &str) -> bool {
    id.len() == 36 && id.bytes().enumerate().all(|(i, c)| if [8, 13, 18, 23].contains(&i) { c == b'-' } else { c.is_ascii_hexdigit() })
}
fn report_allowed(label: &str, url: &reqwest::Url, body: &str) -> bool {
    label == LABEL && url.origin().ascii_serialization() == ORIGIN && body.len() <= CAP
}
fn deliver_report(state: &JannyBridge, request_id: &str, payload: serde_json::Value) -> Result<(), String> {
    let mut pending = state.pending.lock().map_err(|e| e.to_string())?;
    if pending.as_ref().map(|p| p.0.as_str()) != Some(request_id) { return Err("Expired card-site report.".into()); }
    let (_, sender) = pending.take().unwrap();
    sender.send(payload).map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn janny_card_report(webview: tauri::Webview, state: tauri::State<JannyBridge>, request_id: String, status: u16, body: String, cf_mitigated: bool) -> Result<(), String> {
    if !report_allowed(webview.label(), &webview.url().map_err(|e| e.to_string())?, &body) || !(100..=599).contains(&status) { return Err("Invalid card-site report.".into()); }
    deliver_report(&state, &request_id, serde_json::json!({"status":status,"finalUrl":format!("{ORIGIN}/api/v1/download"),"contentType":"application/json","text":body,"cfMitigated":cf_mitigated}))
}
#[tauri::command]
pub(crate) async fn janny_card_url(app: tauri::AppHandle, webview: tauri::Webview, state: tauri::State<'_, JannyBridge>, character_id: String) -> Result<serde_json::Value, String> {
    if webview.label() != "main" || !valid_id(&character_id) { return Err("Invalid JannyAI card request.".into()); }
    let _serial = state.serial.lock().await;
    let request_id = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos());
    let script = include_str!("janny.js").replace("__REQUEST__", &serde_json::to_string(&request_id).unwrap()).replace("__CHARACTER__", &serde_json::to_string(&character_id).unwrap());
    let (sender, receiver) = mpsc::channel();
    *state.pending.lock().map_err(|e| e.to_string())? = Some((request_id, sender));
    let url = reqwest::Url::parse(&format!("{ORIGIN}/characters/{character_id}_character")).unwrap();
    let place = app.state::<super::DataPlace>();
    let result = tauri::WebviewWindowBuilder::new(&app, LABEL, tauri::WebviewUrl::External(url))
        .visible(false).focused(false).initialization_script(script)
        .data_directory(place.dir.join(super::WINDOW_DIR))
        .on_navigation(|url| url.origin().ascii_serialization() == ORIGIN)
        .build();
    let window = match result { Ok(w) => w, Err(e) => { state.pending.lock().map_err(|e| e.to_string())?.take(); return Err(e.to_string()); } };
    let answer = tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(std::time::Duration::from_secs(45))).await;
    state.pending.lock().map_err(|e| e.to_string())?.take();
    let _ = window.destroy();
    answer.map_err(|e| e.to_string())?.map_err(|_| "JannyAI browser verification did not finish in time.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stale_and_duplicate_reports_cannot_complete_another_request() {
        let state = JannyBridge::default();
        let (sender, receiver) = mpsc::channel();
        *state.pending.lock().unwrap() = Some(("current".into(), sender));
        assert!(deliver_report(&state, "old", serde_json::json!({"old":true})).is_err());
        assert!(matches!(receiver.try_recv(), Err(mpsc::TryRecvError::Empty)));
        assert!(deliver_report(&state, "current", serde_json::json!({"ok":true})).is_ok());
        assert_eq!(receiver.recv().unwrap(), serde_json::json!({"ok":true}));
        assert!(deliver_report(&state, "current", serde_json::json!({})).is_err());
    }
    #[test]
    fn remote_capability_grants_only_the_report_on_the_fixed_site_window() {
        let capability: serde_json::Value = serde_json::from_str(include_str!("../capabilities/janny.json")).unwrap();
        assert_eq!(capability["windows"], serde_json::json!([LABEL]));
        assert_eq!(capability["permissions"], serde_json::json!(["allow-janny-card-report"]));
        assert_eq!(capability["remote"]["urls"], serde_json::json!([ORIGIN]));
        assert_eq!(capability["local"], serde_json::json!(false));
    }

    #[test]
    fn ids_and_reports_are_restricted() {
        assert!(valid_id("5d03e1ca-b79d-40dc-b93c-3ff85e918437"));
        for id in ["", "audit-demo", "../secret", "5d03e1ca-b79d-40dc-b93c-3ff85e91843/"] { assert!(!valid_id(id)); }
        let url = reqwest::Url::parse("https://api.jannyai.com/characters/public").unwrap();
        assert!(report_allowed(LABEL, &url, "{}"));
        assert!(!report_allowed("main", &url, "{}"));
        for url in ["http://api.jannyai.com/", "https://api.jannyai.com.evil.test/", "https://jannyai.com/", "https://api.jannyai.com:444/"] { assert!(!report_allowed(LABEL, &reqwest::Url::parse(url).unwrap(), "{}")); }
        assert!(!report_allowed(LABEL, &url, &"x".repeat(CAP + 1)));
    }
}
