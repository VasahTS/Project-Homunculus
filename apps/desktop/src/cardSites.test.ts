// T-007 transport boundary tests. CODEX, 2026-11-02; no network or desktop data.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SiteRequest, SiteResponse, SiteTransport } from "./cardSites.ts";
const env = vi.hoisted(() => ({ desktop: false, invoke: vi.fn() }));
vi.mock("./db.ts", () => ({ get isDesktop() { return env.desktop; } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: env.invoke }));
import { desktopCardSites } from "./cardSites.ts";
const request: SiteRequest = { url: "https://api.chub.ai/search", method: "GET", expect: "json" };
const response: SiteResponse = { status: 200, finalUrl: request.url, contentType: "application/json", cfMitigated: false, text: '{"items":[]}' };
const fakeGlobal = globalThis as { __h2FakeCardSites?: SiteTransport };
afterEach(() => { delete fakeGlobal.__h2FakeCardSites; env.desktop = false; vi.resetAllMocks(); });

describe("Card Browser desktop boundary", () => {
  it("refuses browser preview requests without a fake, without invoking native code", async () => {
    await expect(desktopCardSites.request(request)).rejects.toThrow("The Card Browser works in the desktop app.");
    expect(env.invoke).not.toHaveBeenCalled();
  });
  it("passes the full request to the browser fake and preserves non-2xx metadata", async () => {
    const input: SiteRequest = { ...request, method: "POST", headers: { "X-Session-Token": "synthetic" }, body: '{"query":"世界"}' };
    const limited = { ...response, status: 429, retryAfterSecs: 17, cfMitigated: true, text: "challenge" };
    const mock = vi.fn().mockResolvedValue(limited); fakeGlobal.__h2FakeCardSites = { request: mock };
    expect(await desktopCardSites.request(input)).toBe(limited);
    expect(mock).toHaveBeenCalledExactlyOnceWith(input); expect(env.invoke).not.toHaveBeenCalled();
  });
  it("reads the fake at call time and returns its decoded binary response", async () => {
    const binary = { ...response, text: undefined, bytes: new Uint8Array([0, 128, 255]), mime: "image/png" };
    fakeGlobal.__h2FakeCardSites = { request: vi.fn().mockResolvedValue(binary) };
    expect(await desktopCardSites.request({ ...request, expect: "image" })).toBe(binary);
    delete fakeGlobal.__h2FakeCardSites;
    await expect(desktopCardSites.request(request)).rejects.toThrow("The Card Browser works in the desktop app.");
  });
  it("propagates fake failures without falling back to native requests", async () => {
    fakeGlobal.__h2FakeCardSites = { request: vi.fn().mockRejectedValue(new Error("Test site is unavailable")) };
    await expect(desktopCardSites.request(request)).rejects.toThrow("Test site is unavailable");
    expect(env.invoke).not.toHaveBeenCalled();
  });
  it("invokes the exact command payload on desktop and ignores the browser fake", async () => {
    env.desktop = true; env.invoke.mockResolvedValue(response);
    const fake = vi.fn(); fakeGlobal.__h2FakeCardSites = { request: fake };
    expect(await desktopCardSites.request(request)).toEqual(response);
    expect(env.invoke).toHaveBeenCalledExactlyOnceWith("card_site_request", { request });
    expect(fake).not.toHaveBeenCalled();
  });
  it.each(["image", "card"] as const)("decodes native %s base64 without losing high bytes or response metadata", async (kind) => {
    env.desktop = true;
    const native = { ...response, text: undefined, base64: "AID/", mime: "image/png" };
    env.invoke.mockResolvedValue(native);
    const result = await desktopCardSites.request({ ...request, expect: kind });
    expect(result).toEqual({ ...response, text: undefined, mime: "image/png", bytes: new Uint8Array([0, 128, 255]) });
    expect(result).not.toHaveProperty("base64"); expect(native.base64).toBe("AID/");
  });
  it("preserves an empty binary body as empty bytes, not an absent result", async () => {
    env.desktop = true; env.invoke.mockResolvedValue({ ...response, base64: "" });
    expect((await desktopCardSites.request(request)).bytes).toEqual(new Uint8Array());
  });
  it("returns error statuses as data even when an image was requested", async () => {
    env.desktop = true; const failed = { ...response, status: 403, cfMitigated: true, retryAfterSecs: 30, text: "Cloudflare challenge" };
    env.invoke.mockResolvedValue(failed);
    expect(await desktopCardSites.request({ ...request, expect: "image" })).toEqual(failed);
  });
  it("propagates native validation/network errors without a fake fallback", async () => {
    env.desktop = true; env.invoke.mockRejectedValue(new Error("That host is not an allowed card site."));
    await expect(desktopCardSites.request(request)).rejects.toThrow("That host is not an allowed card site.");
  });
  it("rejects malformed native base64 instead of returning damaged bytes", async () => {
    env.desktop = true; env.invoke.mockResolvedValue({ ...response, base64: "%%%" });
    await expect(desktopCardSites.request(request)).rejects.toThrow();
  });
});
