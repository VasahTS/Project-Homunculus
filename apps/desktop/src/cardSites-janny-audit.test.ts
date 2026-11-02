// Compare the native-only boundary with Marinara's original browser-first helper. CODEX, 2026-11-02.
// Ordinary regressions for the browser route and native session; no live network.
import { afterEach, expect, it, vi } from "vitest";
import { fetchCompleteJannyCard } from "../../../packages/card-browser/test/fixtures/marinara-janny-download.ts";
const env = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./db.ts", () => ({ isDesktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: env.invoke }));
import { desktopCardSites } from "./cardSites.ts";
const url = "https://api.jannyai.com/api/v1/download";
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

it("J1a: uses the successful browser download before a Cloudflare-blocked native fallback", async () => {
  const browserFetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok", downloadUrl: "https://files.example.invalid/card.png" }))).mockResolvedValueOnce(new Response(new Uint8Array([137, 80, 78, 71])));
  vi.stubGlobal("fetch", browserFetch);
  expect((await fetchCompleteJannyCard("audit-demo")).status).toBe(200);
  expect(browserFetch.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
  browserFetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ status: "ok", downloadUrl: "https://files.example.invalid/card.png" })));
  env.invoke.mockResolvedValue({ status: 403, finalUrl: url, contentType: "text/html", cfMitigated: true, text: "<title>Just a moment...</title>" });
  const result = await desktopCardSites.request({ url, method: "POST", expect: "json", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ characterId: "audit-demo" }) });
  expect(result.status).toBe(200);
  expect(browserFetch).toHaveBeenCalled();
});

it("J1b: searches in the browser without include credentials, as required by Marinara's CORS path", async () => {
  const browserFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ hits: [] }] })));
  vi.stubGlobal("fetch", browserFetch);
  env.invoke.mockResolvedValue({ status: 403, finalUrl: "https://search.jannyai.com/multi-search", contentType: "text/html", cfMitigated: true, text: "<title>Just a moment...</title>" });
  const result = await desktopCardSites.request({ url: "https://search.jannyai.com/multi-search", method: "POST", expect: "json", body: '{"queries":[]}', headers: { Authorization: "Bearer public-fixture", "Content-Type": "application/json" } });
  expect(result.status).toBe(200);
  expect(browserFetch).toHaveBeenCalled();
  expect(browserFetch.mock.calls[0]![1]?.credentials).not.toBe("include");
});

it("uses the native Janny session when CORS fails and the HTTP client is challenged", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("CORS")));
  env.invoke.mockResolvedValueOnce({ status: 403, finalUrl: url, contentType: "text/html", cfMitigated: true, text: "challenge" })
    .mockResolvedValueOnce({ status: 200, finalUrl: url, contentType: "application/json", cfMitigated: false, text: '{"status":"ok","downloadUrl":"https://files.example.invalid/card.png"}' });
  const result = await desktopCardSites.request({ url, method: "POST", expect: "json", body: '{"characterId":"5d03e1ca-b79d-40dc-b93c-3ff85e918437"}' });
  expect(result.status).toBe(200);
  expect(env.invoke).toHaveBeenNthCalledWith(2, "janny_card_url", { characterId: "5d03e1ca-b79d-40dc-b93c-3ff85e918437" });
});
it("preserves the original refusal when the native browser session times out", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("CORS")));
  const refusal = { status: 403, finalUrl: url, contentType: "text/html", cfMitigated: true, text: "challenge" };
  env.invoke.mockResolvedValueOnce(refusal).mockRejectedValueOnce(new Error("Verification timed out"));
  expect(await desktopCardSites.request({ url, method: "POST", expect: "json", body: '{"characterId":"5d03e1ca-b79d-40dc-b93c-3ff85e918437"}' })).toEqual(refusal);
});
it("returns a browser rate limit without starting native requests", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("slow down", { status: 429, headers: { "Retry-After": "17" } })));
  expect(await desktopCardSites.request({ url, method: "POST", expect: "json" })).toMatchObject({ status: 429, retryAfterSecs: 17 });
  expect(env.invoke).not.toHaveBeenCalled();
});
it("does not create a browser session after a native rate limit", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("CORS")));
  env.invoke.mockResolvedValue({ status: 429, finalUrl: url, contentType: "application/json", cfMitigated: false, retryAfterSecs: 30, text: "{}" });
  expect(await desktopCardSites.request({ url, method: "POST", expect: "json" })).toMatchObject({ status: 429, retryAfterSecs: 30 });
  expect(env.invoke).toHaveBeenCalledTimes(1);
});
it("bounds browser bodies before falling back to the existing native boundary", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(8 * 1024 * 1024 + 1))));
  env.invoke.mockResolvedValue({ status: 200, finalUrl: url, contentType: "application/json", cfMitigated: false, text: "{}" });
  expect((await desktopCardSites.request({ url, method: "POST", expect: "json" })).status).toBe(200);
  expect(env.invoke).toHaveBeenCalledTimes(1);
});
it("does not send another card site's requests through the Janny browser route", async () => {
  const browserFetch = vi.fn(); vi.stubGlobal("fetch", browserFetch);
  env.invoke.mockResolvedValue({ status: 200, finalUrl: "https://api.chub.ai/search", contentType: "application/json", cfMitigated: false, text: "{}" });
  await desktopCardSites.request({ url: "https://api.chub.ai/search", method: "POST", expect: "json" });
  expect(browserFetch).not.toHaveBeenCalled();
});

it("keeps the Cloudflare recovery notice if the site session reports a network failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("CORS")));
  const refusal = { status: 403, finalUrl: url, contentType: "text/html", cfMitigated: true, text: "challenge" };
  env.invoke.mockResolvedValueOnce(refusal).mockResolvedValueOnce({ ...refusal, status: 502, cfMitigated: false, text: '{"error":"network"}' });
  expect(await desktopCardSites.request({ url, method: "POST", expect: "json", body: '{"characterId":"5d03e1ca-b79d-40dc-b93c-3ff85e918437"}' })).toEqual(refusal);
});
