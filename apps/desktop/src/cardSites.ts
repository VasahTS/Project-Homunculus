// Card Browser desktop transport and browser-test seam. CODEX, 2026-11-02 (T-007).
import { base64ToBytes, importCardPng } from "@homunculus/st-cards";
import type { BotbooruAccountState, JanitorAccountState } from "@homunculus/card-browser";
import { isDesktop } from "./db.ts";

export interface SiteRequest {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  expect: "json" | "text" | "image" | "card";
}
/** Binary responses are decoded once at the native boundary; consumers do not handle base64. */
export interface SiteResponse {
  status: number;
  finalUrl: string;
  contentType: string;
  retryAfterSecs?: number;
  cfMitigated: boolean;
  text?: string;
  bytes?: Uint8Array;
  mime?: string;
}
export interface SiteTransport {
  request(input: SiteRequest): Promise<SiteResponse>;
  decodeCard?(bytes: Uint8Array): Record<string, unknown>;
  botbooruAccount?(action: "status" | "open" | "logout"): Promise<BotbooruAccountState>;
  /** "open" shows its sign-in page, "show" the window as it is (for its browser check). */
  janitorAccount?(action: "status" | "open" | "show" | "logout"): Promise<JanitorAccountState>;
}
type NativeResponse = Omit<SiteResponse, "bytes"> & { base64?: string };

// Prefer Marinara's browser route; a challenged download can complete in the site's own native session.
async function browserJson(request: SiteRequest): Promise<SiteResponse | undefined> {
  const headers = Object.fromEntries(Object.entries(request.headers ?? {}).filter(([k]) => !["origin", "referer"].includes(k.toLowerCase())));
  const r = await fetch(request.url, { method: "POST", body: request.body, headers, credentials: request.url.includes("search.jannyai.com") ? "omit" : "include", redirect: "error", signal: AbortSignal.timeout(10_000) });
  const reader = r.body?.getReader(), decoder = new TextDecoder();
  let text = "", size = 0;
  if (reader) { try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8 * 1024 * 1024) throw new Error("Card-site response is too large."); text += decoder.decode(part.value, { stream: true }); } text += decoder.decode(); } finally { await reader.cancel().catch(() => {}); } }
  const response: SiteResponse = { status: r.status, finalUrl: r.url || request.url, contentType: r.headers.get("content-type") ?? "", cfMitigated: r.headers.get("cf-mitigated") === "challenge", text };
  const retry = Number(r.headers.get("retry-after"));
  if (retry > 0) response.retryAfterSecs = retry;
  if (r.ok) { JSON.parse(text); return response; }
  return r.status === 429 ? response : undefined;
}

export const desktopCardSites: SiteTransport = {
  async botbooruAccount(action) {
    if (!isDesktop) {
      const fake = (globalThis as { __h2FakeCardSites?: SiteTransport }).__h2FakeCardSites;
      if (fake?.botbooruAccount) return fake.botbooruAccount(action);
      throw new Error("BotBooru accounts work in the desktop app.");
    }
    const { invoke } = await import("@tauri-apps/api/core");
    if (action === "open") await invoke("botbooru_window");
    const r = await invoke<NativeResponse>("botbooru_request", { path: action === "logout" ? "logout" : "/auth/me" });
    if (r.status === 401) return { username: null, showNsfw: false, showNsfl: false };
    if (r.status !== 200) throw new Error("Open BotBooru Account to finish signing in or the browser check, then refresh.");
    const a = JSON.parse(r.text ?? "{}");
    return { username: typeof a.username === "string" ? a.username : null, showNsfw: a.showNsfw === true, showNsfl: a.showNsfl === true };
  },
  // JanitorAI's own window (D-098): "open" shows its sign-in page; the app only ever learns the account's name.
  async janitorAccount(action) {
    if (!isDesktop) {
      const fake = (globalThis as { __h2FakeCardSites?: SiteTransport }).__h2FakeCardSites;
      if (fake?.janitorAccount) return fake.janitorAccount(action);
      throw new Error("JanitorAI works in the desktop app.");
    }
    const { invoke } = await import("@tauri-apps/api/core");
    if (action === "open" || action === "show") { await invoke("janitor_window", { signIn: action === "open" }); return { username: null }; }
    const r = await invoke<NativeResponse>("janitor_request", { path: action === "logout" ? "logout" : "/hampter/profiles/mine" });
    if (r.status !== 200) throw new Error("Open JanitorAI to finish its browser check, then refresh.");
    const a = JSON.parse(r.text ?? "{}");
    return { username: typeof a.username === "string" && a.username ? a.username : null };
  },
  decodeCard: (bytes) => importCardPng(bytes).character.original as Record<string, unknown>,
  async request(request) {
    if (!isDesktop) {
      const fake = (globalThis as { __h2FakeCardSites?: SiteTransport }).__h2FakeCardSites;
      if (fake) return fake.request(request);
      throw new Error("The Card Browser works in the desktop app.");
    }
    const jannyJson = request.method === "POST" && request.expect === "json" && ["https://search.jannyai.com/multi-search", "https://api.jannyai.com/api/v1/download"].includes(request.url);
    if (jannyJson) { try { const r = await browserJson(request); if (r) return r; } catch { /* Native fallback handles CORS/network refusals. */ } }
    const { invoke } = await import("@tauri-apps/api/core");
    const botbooru = new URL(request.url).origin === "https://botbooru.com" && request.expect === "json";
    if (botbooru && (request.method !== "GET" || request.body || Object.keys(request.headers ?? {}).length)) throw new Error("BotBooru supports fixed read-only requests.");
    // JanitorAI's API answers only inside its own page (Cloudflare); read-only GETs go there (D-098)
    const janitor = new URL(request.url).origin === "https://janitorai.com" && request.expect === "json";
    if (janitor && (request.method !== "GET" || request.body || Object.keys(request.headers ?? {}).length)) throw new Error("JanitorAI supports fixed read-only requests.");
    const path = new URL(request.url).pathname + new URL(request.url).search;
    let native = botbooru ? await invoke<NativeResponse>("botbooru_request", { path })
      : janitor ? await invoke<NativeResponse>("janitor_request", { path })
      : await invoke<NativeResponse>("card_site_request", { request });
    if (jannyJson && request.url === "https://api.jannyai.com/api/v1/download" && native.cfMitigated && [403, 503].includes(native.status)) {
      try { const body = JSON.parse(request.body ?? "{}"); const recovered = await invoke<NativeResponse>("janny_card_url", { characterId: body.characterId }); if ((recovered.status >= 200 && recovered.status < 300) || recovered.status === 429) native = recovered; } catch { /* Preserve the original refusal and recovery actions. */ }
    }
    const { base64, ...response } = native;
    return base64 === undefined ? response : { ...response, bytes: base64ToBytes(base64) };
  },
};
