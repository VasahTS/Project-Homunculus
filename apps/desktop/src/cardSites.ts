// Card Browser desktop transport and browser-test seam. CODEX, 2026-11-02 (T-007).
import { base64ToBytes, importCardPng } from "@homunculus/st-cards";
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
export interface SiteTransport { request(input: SiteRequest): Promise<SiteResponse>; decodeCard?(bytes: Uint8Array): Record<string, unknown> }
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
    let native = await invoke<NativeResponse>("card_site_request", { request });
    if (jannyJson && request.url === "https://api.jannyai.com/api/v1/download" && native.cfMitigated && [403, 503].includes(native.status)) {
      try { const body = JSON.parse(request.body ?? "{}"); const recovered = await invoke<NativeResponse>("janny_card_url", { characterId: body.characterId }); if ((recovered.status >= 200 && recovered.status < 300) || recovered.status === 429) native = recovered; } catch { /* Preserve the original refusal and recovery actions. */ }
    }
    const { base64, ...response } = native;
    return base64 === undefined ? response : { ...response, bytes: base64ToBytes(base64) };
  },
};
