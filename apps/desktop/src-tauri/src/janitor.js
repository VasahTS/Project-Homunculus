// JanitorAI window bridge: fixed read-only GETs run inside the site's own page (its Cloudflare check and sign-in stay here).
// The account token is read only inside this page and never sent to the app. Token lookup adapted from Glaze
// (hydall/Glaze f1fe39e, AGPL-3.0, janitor_webview_proxy.dart `_findTokenJs`). CLAUDE, 2026-11-08 (D-098).
(() => {
  if (window.top !== window || location.origin !== "https://janitorai.com") return;
  const CAP = 8 * 1024 * 1024;
  const decode = (s) => { try { return atob(s); } catch (_) {} try { return atob(s.replace(/-/g, "+").replace(/_/g, "/")); } catch (_) {} return null; };
  const tokenFrom = (raw) => {
    if (!raw) return null;
    try { raw = decodeURIComponent(raw); } catch (_) {}
    if (raw.indexOf("base64-") === 0) raw = raw.slice(7);
    if (raw.indexOf("eyJ") === 0 && raw.split(".").length === 3) return raw;
    for (const s of [decode(raw), raw]) {
      if (!s) continue;
      const m = s.match(/"access_token":"(eyJ[^"]+)"/);
      if (m) return m[1];
    }
    return null;
  };
  // Supabase keeps the session in cookies sb-<ref>-auth-token(.0, .1 …), or in localStorage on older layouts.
  const authCookies = () => (document.cookie || "").split("; ").map((c) => c.slice(0, Math.max(0, c.indexOf("=")))).filter((n) => /^sb-.*-auth-token(\.\d+)?$/.test(n));
  const findToken = () => {
    try {
      const parts = {};
      for (const c of (document.cookie || "").split("; ")) {
        const eq = c.indexOf("="); if (eq < 0) continue;
        const m = c.slice(0, eq).match(/^(sb-.*-auth-token)(?:\.(\d+))?$/); if (!m) continue;
        (parts[m[1]] ??= {})[m[2] ? parseInt(m[2], 10) : 0] = c.slice(eq + 1);
      }
      for (const base in parts) { const t = tokenFrom(Object.keys(parts[base]).map(Number).sort((a, b) => a - b).map((i) => parts[base][i]).join("")); if (t) return t; }
    } catch (_) {}
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && /^sb-.*-auth-token$/.test(k)) { const t = tokenFrom(localStorage.getItem(k)); if (t) return t; } } } catch (_) {}
    return null;
  };
  const report = (args) => window.__TAURI_INTERNALS__.invoke("janitor_report", args).catch(() => {});
  window.__h2Janitor = async ({ id, path }) => {
    let status = 502, body = '{"error":"JanitorAI did not answer."}', cfMitigated = false, retryAfterSecs = null, reload = false;
    try {
      if (path === "logout") {
        for (const name of authCookies()) for (const domain of ["", "; domain=.janitorai.com", "; domain=janitorai.com"]) document.cookie = name + "=; Max-Age=0; path=/" + domain;
        try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
        status = 200; body = '{"username":null}'; reload = true;
      } else {
        const token = findToken();
        if (path === "/hampter/profiles/mine" && !token) { status = 200; body = '{"username":null}'; }
        else {
          const headers = { Accept: "application/json, text/plain, */*" };
          if (token) headers.authorization = "Bearer " + token;
          const r = await fetch(path, { method: "GET", headers, credentials: "include", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000) });
          status = r.status;
          const html = (r.headers.get("content-type") || "").includes("text/html");
          cfMitigated = r.headers.get("cf-mitigated") === "challenge" || ((status === 403 || status === 503) && html);
          const retry = Number(r.headers.get("retry-after")); if (retry > 0) retryAfterSecs = retry;
          const reader = r.body?.getReader(), decoder = new TextDecoder();
          let size = 0; body = "";
          if (reader) try {
            while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > CAP) throw new Error("size"); body += decoder.decode(part.value, { stream: true }); }
            body += decoder.decode();
          } finally { await reader.cancel().catch(() => {}); }
          // A 200 that is Cloudflare's page, not JSON
          if (status === 200 && html && /Access Restricted|Just a moment/.test(body)) { status = 403; cfMitigated = true; }
          if (path === "/hampter/profiles/mine") {
            let name = null;
            if (r.ok) { try { const a = JSON.parse(body); name = typeof a.user_name === "string" ? a.user_name : typeof a.name === "string" ? a.name : null; } catch (_) {} }
            if (r.ok || status === 401) { status = 200; body = JSON.stringify({ username: name ? name.slice(0, 128) : null }); }
          }
        }
      }
    } catch (_) { status = 502; body = '{"error":"JanitorAI did not answer. Open JanitorAI and try again."}'; }
    await report({ requestId: id, status, body, cfMitigated, retryAfterSecs });
    if (reload) location.reload();
  };
})();
