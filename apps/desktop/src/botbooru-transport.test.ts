// BotBooru desktop routing and browser-test boundary. CODEX, 2026-11-02.
import { afterEach, expect, it, vi } from "vitest";
const env = vi.hoisted(() => ({ desktop: true, invoke: vi.fn() }));
vi.mock("./db.ts", () => ({ get isDesktop() { return env.desktop; } }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: env.invoke }));
import { desktopCardSites, type SiteTransport } from "./cardSites.ts";
const response = { status: 200, contentType: "application/json", finalUrl: "https://botbooru.com", cfMitigated: false, text: '{"username":"fixture","showNsfw":true,"showNsfl":true}' };
const fakeGlobal = globalThis as { __h2FakeCardSites?: SiteTransport };
afterEach(() => { env.desktop = true; vi.resetAllMocks(); delete fakeGlobal.__h2FakeCardSites; });
it("routes JSON through the site session, keeping pictures and PNGs on the checked native transport", async () => {
  env.invoke.mockResolvedValue(response);
  await desktopCardSites.request({ url: "https://botbooru.com/posts/?sfw_only=true", method: "GET", expect: "json" });
  expect(env.invoke).toHaveBeenLastCalledWith("botbooru_request", { path: "/posts/?sfw_only=true" });
  await desktopCardSites.request({ url: "https://botbooru.com/download/png/42", method: "GET", expect: "card" });
  expect(env.invoke).toHaveBeenLastCalledWith("card_site_request", { request: { url: "https://botbooru.com/download/png/42", method: "GET", expect: "card" } });
  await expect(desktopCardSites.request({ url: "https://botbooru.com/auth/token", method: "POST", body: "credential", expect: "json" })).rejects.toThrow("read-only");
});
it("opens the site's account window, refreshes sanitized status, and signs out without persisting a bearer", async () => {
  env.invoke.mockResolvedValue(response);
  expect(await desktopCardSites.botbooruAccount!("open")).toEqual({ username: "fixture", showNsfw: true, showNsfl: true });
  expect(env.invoke.mock.calls.map((x) => x[0])).toEqual(["botbooru_window", "botbooru_request"]);
  await desktopCardSites.botbooruAccount!("logout");
  expect(env.invoke).toHaveBeenLastCalledWith("botbooru_request", { path: "logout" });
  env.invoke.mockResolvedValue({ ...response, status: 401, text: "expired" });
  expect(await desktopCardSites.botbooruAccount!("status")).toEqual({ username: null, showNsfw: false, showNsfl: false });
});
it("uses the fake account boundary only in browser preview and reports unavailable accounts clearly", async () => {
  env.desktop = false;
  await expect(desktopCardSites.botbooruAccount!("status")).rejects.toThrow("desktop app");
  fakeGlobal.__h2FakeCardSites = { request: vi.fn(), botbooruAccount: vi.fn().mockResolvedValue({ username: "fake", showNsfw: false, showNsfl: false }) };
  expect((await desktopCardSites.botbooruAccount!("status")).username).toBe("fake");
  expect(env.invoke).not.toHaveBeenCalled();
});
