// Card Browser desktop transport and browser-test seam. CODEX, 2026-11-02 (T-007).
import { base64ToBytes } from "@homunculus/st-cards";
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
export interface SiteTransport { request(input: SiteRequest): Promise<SiteResponse> }
type NativeResponse = Omit<SiteResponse, "bytes"> & { base64?: string };

export const desktopCardSites: SiteTransport = {
  async request(request) {
    if (!isDesktop) {
      const fake = (globalThis as { __h2FakeCardSites?: SiteTransport }).__h2FakeCardSites;
      if (fake) return fake.request(request);
      throw new Error("The Card Browser works in the desktop app.");
    }
    const { invoke } = await import("@tauri-apps/api/core");
    const { base64, ...response } = await invoke<NativeResponse>("card_site_request", { request });
    return base64 === undefined ? response : { ...response, bytes: base64ToBytes(base64) };
  },
};
