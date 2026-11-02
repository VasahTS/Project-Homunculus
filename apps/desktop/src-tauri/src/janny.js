// Fixed script for one supported public-card download. CODEX, 2026-11-02.
(() => {
  if (window.top !== window || location.origin !== "https://api.jannyai.com") return;
  const requestId = __REQUEST__, characterId = __CHARACTER__;
  const started = Date.now();
  const timer = setInterval(async () => {
    if (Date.now() - started > 40000) { clearInterval(timer); return; }
    if (!document.querySelector("astro-island") || !window.__TAURI_INTERNALS__) return;
    clearInterval(timer);
    try {
      const r = await fetch("/api/v1/download", { method: "POST", credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ characterId }), signal: AbortSignal.timeout(20000) });
      const body = await r.text();
      if (body.length > 128 * 1024) throw new Error("Card-site response is too large.");
      await window.__TAURI_INTERNALS__.invoke("janny_card_report", { requestId, status: r.status, body, cfMitigated: r.headers.get("cf-mitigated") === "challenge" });
    } catch {
      await window.__TAURI_INTERNALS__.invoke("janny_card_report", { requestId, status: 502, body: '{"error":"JannyAI did not provide the card."}', cfMitigated: false }).catch(() => {});
    }
  }, 250);
})();
