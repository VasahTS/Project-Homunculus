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
  // Account calls (D-098 reads; D-099 the extraction's own temporary changes, each undone after). The app decides which
  // paths and methods are allowed (janitor.rs); this page only adds the account's token and returns the answer.
  window.__h2Janitor = async ({ id, path, method, body: send }) => {
    let status = 502, body = '{"error":"JanitorAI did not answer."}', cfMitigated = false, retryAfterSecs = null, reload = false;
    try {
      const account = path === "account";
      if (path === "logout") {
        for (const name of authCookies()) for (const domain of ["", "; domain=.janitorai.com", "; domain=janitorai.com"]) document.cookie = name + "=; Max-Age=0; path=/" + domain;
        try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
        status = 200; body = '{"username":null}'; reload = true;
      } else {
        const token = findToken();
        if (account && !token) { status = 200; body = '{"username":null}'; }
        else {
          const headers = { Accept: "application/json, text/plain, */*" };
          if (token) headers.authorization = "Bearer " + token;
          const init = { method: method || "GET", headers, credentials: "include", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000) };
          if (typeof send === "string") { headers["Content-Type"] = "application/json"; init.body = send; }
          const r = await fetch(account ? "/hampter/profiles/mine" : path, init);
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
          if (account || path === "/hampter/profiles/mine") {
            // only the name and the "about" text leave the page, never the rest of the profile
            let a = {};
            if (r.ok) { try { a = JSON.parse(body) || {}; } catch (_) {} }
            const name = typeof a.user_name === "string" ? a.user_name : typeof a.name === "string" ? a.name : null;
            if (account && (r.ok || status === 401)) { status = 200; body = JSON.stringify({ username: name ? name.slice(0, 128) : null }); }
            else if (!account && r.ok) body = JSON.stringify({ name: typeof a.name === "string" ? a.name : "", profile: typeof a.profile === "string" ? a.profile : "", user_name: typeof a.user_name === "string" ? a.user_name : "" });
          }
        }
      }
    } catch (_) { status = 502; body = '{"error":"JanitorAI did not answer. Open JanitorAI and try again."}'; }
    await report({ requestId: id, status, body, cfMitigated, retryAfterSecs });
    if (reload) location.reload();
  };

  // ------------------------------------------------------------------ extraction (D-099)
  // On a chat page: keep the prompt JanitorAI assembles (/generateAlpha answers with it before the message goes to the
  // account's proxy), type a message and send it like a person would. Adapted from Glaze `_captureUserScript`.
  if (location.pathname.startsWith("/chats/")) {
    window.__h2Alpha = null; window.__h2AlphaLog = [];
    const note = (e) => { try { window.__h2AlphaLog.push(e); while (window.__h2AlphaLog.length > 12) window.__h2AlphaLog.shift(); } catch (_) {} };
    const take = (status, text) => {
      let j = null; try { j = JSON.parse(text); } catch (_) {}
      const ok = !!(j && Array.isArray(j.messages) && j.messages.some((m) => m && m.role === "system" && typeof m.content === "string"));
      if (ok) window.__h2Alpha = j;
      note({ status, matched: ok, body: ok ? "" : String(text || "").slice(0, 300) });
    };
    const isAlpha = (u) => typeof u === "string" && u.indexOf("/generateAlpha") >= 0;
    const origFetch = window.fetch ? window.fetch.bind(window) : null;
    if (origFetch) window.fetch = async function (...args) {
      let alpha = false; try { const a = args[0]; alpha = isAlpha(a && a.url ? a.url : String(a)); } catch (_) {}
      let res;
      try { res = await origFetch(...args); } catch (e) { if (alpha) note({ status: 0, matched: false, body: "network error" }); throw e; }
      if (alpha) { const s = res.status; res.clone().text().then((t) => take(s, t), () => note({ status: s, matched: false, body: "unreadable" })); }
      return res;
    };
    const X = window.XMLHttpRequest;
    if (X) {
      const open = X.prototype.open, sendX = X.prototype.send;
      X.prototype.open = function (m, url) { this.__h2Url = url; return open.apply(this, arguments); };
      X.prototype.send = function () { this.addEventListener("load", function () { try { if (isAlpha(this.__h2Url)) take(this.status, this.responseText); } catch (_) {} }); return sendX.apply(this, arguments); };
    }
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const shown = (el) => el && el.offsetParent !== null;
    const findInput = () => { for (const s of ['textarea[placeholder]', 'form textarea', 'textarea', 'div[contenteditable="true"]']) { const els = document.querySelectorAll(s); for (let i = els.length - 1; i >= 0; i--) if (shown(els[i])) return els[i]; } return null; };
    const key = (el, k, code) => { for (const type of ["keydown", "keypress", "keyup"]) { const ev = new KeyboardEvent(type, { key: k, code: k, bubbles: true, cancelable: true }); try { Object.defineProperty(ev, "keyCode", { get: () => code }); Object.defineProperty(ev, "which", { get: () => code }); } catch (_) {} el.dispatchEvent(ev); } };
    const overlay = () => { const els = document.querySelectorAll('[class*="modalOverlay" i]'); for (let i = els.length - 1; i >= 0; i--) if (shown(els[i])) return els[i]; return null; };
    const dismiss = async (ms) => {
      const until = Date.now() + (ms || 4000);
      while (Date.now() < until && overlay()) {
        const close = document.querySelector('[class*="modal" i] button[aria-label*="close" i], [role="dialog"] button[aria-label*="close" i]');
        if (shown(close)) close.click(); else { key(document.activeElement || document.body, "Escape", 27); key(document, "Escape", 27); }
        await wait(300);
      }
    };
    const live = (b) => shown(b) && !b.disabled && !/stop|cancel/i.test(b.getAttribute("aria-label") || "");
    const sendButton = (input) => {
      for (const b of document.querySelectorAll('button[aria-label*="send" i], button[class*="sendButton" i], button[type="submit"]')) if (live(b)) return b;
      const scope = input.closest("form") || input.parentElement;
      const btns = scope ? [...scope.querySelectorAll("button")].filter(live) : [];
      return btns.length ? btns[btns.length - 1] : null;
    };
    const stopButton = () => { for (const b of document.querySelectorAll('button[aria-label*="stop" i], button[aria-label*="cancel" i]')) if (shown(b) && !b.disabled) return b; return null; };
    const setValue = (el, v) => {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
      } else { el.focus(); el.textContent = v; el.dispatchEvent(new InputEvent("input", { bubbles: true })); }
    };
    const leftText = (el) => ((el.value !== undefined && el.value !== null ? el.value : el.textContent) || "").trim();
    const cleared = async (el, ms) => { const until = Date.now() + ms; while (Date.now() < until) { await wait(400); if (!document.contains(el) || !leftText(el)) return true; } return false; };
    const sendText = async (text) => {
      await dismiss();
      const el = findInput(); if (!el) return { ok: false, reason: "The chat's message box did not appear." };
      // a previous send may still hang on the temporary proxy and keep the box disabled
      for (const until = Date.now() + 6000; Date.now() < until;) { const s = stopButton(); if (!s) break; s.click(); await wait(300); }
      el.focus(); setValue(el, text); await dismiss(2000);
      let btn = null; for (const until = Date.now() + 15000; Date.now() < until;) { await wait(200); btn = sendButton(el); if (btn) break; }
      if (btn) btn.click(); else key(el, "Enter", 13);
      let done = await cleared(el, 3000);
      if (!done) { await dismiss(2000); key(el, "Enter", 13); done = await cleared(el, 3000); }
      return { ok: true, cleared: done };
    };
    window.__h2JanitorPage = async ({ id, op, text }) => {
      let out = {};
      try {
        if (op === "composer") out = { ready: !!findInput() };
        else if (op === "reset") { window.__h2Alpha = null; window.__h2AlphaLog = []; out = { ok: true }; }
        else if (op === "send") out = await sendText(String(text || "."));
        else if (op === "alpha") out = { payload: window.__h2Alpha, log: window.__h2AlphaLog.slice(-4) };
      } catch (e) { out = { ok: false, reason: String(e && e.message || e).slice(0, 200) }; }
      await report({ requestId: id, status: 200, body: JSON.stringify(out), cfMitigated: false, retryAfterSecs: null });
    };
  }
})();
