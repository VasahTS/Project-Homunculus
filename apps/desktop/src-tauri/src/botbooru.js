// Fixed read-only bridge; credentials never leave the BotBooru page. CODEX, 2026-11-02.
(() => {
  if (window.top !== window || location.origin !== "https://botbooru.com") return;
  window.__h2Botbooru = async ({ id, path }) => {
    let status = 502, body = '{"error":"BotBooru did not answer."}', cfMitigated = false, retryAfterSecs = null;
    try {
      if (path === "logout") {
        localStorage.removeItem("token"); localStorage.removeItem("botbooru_nsfw");
        if (typeof window.doLogout === "function") window.doLogout();
        status = 200; body = '{"username":null,"showNsfw":false,"showNsfl":false}';
      } else {
        const token = localStorage.getItem("token");
        const r = await fetch(path, { method: "GET", headers: token ? { Authorization: "Bearer " + token } : {}, credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000) });
        status = r.status; cfMitigated = r.headers.get("cf-mitigated") === "challenge";
        const retry = Number(r.headers.get("retry-after")); if (retry > 0) retryAfterSecs = retry;
        const reader = r.body?.getReader(), decoder = new TextDecoder();
        let size = 0; body = "";
        if (reader) try {
          while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8 * 1024 * 1024) throw new Error("size"); body += decoder.decode(part.value, { stream: true }); }
          body += decoder.decode();
        } finally { await reader.cancel().catch(() => {}); }
        if (path === "/auth/me") {
          const a = r.ok ? JSON.parse(body) : {};
          body = JSON.stringify({ username: r.ok && typeof a.username === "string" ? a.username.slice(0, 128) : null, showNsfw: a.show_nsfw === true, showNsfl: a.show_nsfl === true && a.show_nsfl_active !== false });
        }
      }
    } catch (_) { status = 502; body = '{"error":"BotBooru did not answer. Open Account and try again."}'; }
    await window.__TAURI_INTERNALS__.invoke("botbooru_report", { requestId: id, status, body, cfMitigated, retryAfterSecs }).catch(() => {});
  };
})();
