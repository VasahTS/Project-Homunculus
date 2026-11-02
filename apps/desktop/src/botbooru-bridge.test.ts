// Execute the actual injected bridge with synthetic sessions; no network/credentials. CODEX, 2026-11-02.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
const source = readFileSync(new URL("./src-tauri/src/botbooru.js", new URL("..", import.meta.url)), "utf8");
function bridge(response: Response) {
  const storage = new Map([["token", "synthetic-token"], ["botbooru_nsfw", "1"]]);
  const fetch = vi.fn().mockResolvedValue(response), invoke = vi.fn().mockResolvedValue(null), reload = vi.fn();
  const window: { top?: unknown; __TAURI_INTERNALS__: { invoke: typeof invoke }; __h2Botbooru?: (r: { id: string; path: string }) => Promise<void> } = { __TAURI_INTERNALS__: { invoke } };
  window.top = window;
  runInNewContext(source, { window, location: { origin: "https://botbooru.com", reload }, localStorage: { getItem: (k: string) => storage.get(k), removeItem: (k: string) => storage.delete(k) }, fetch, TextDecoder, AbortSignal });
  return { storage, fetch, invoke, reload, call: (path: string) => window.__h2Botbooru!({ id: "pending", path }) };
}
it("uses the page token only in a same-origin GET and returns only the account fields the app needs", async () => {
  const b = bridge(new Response(JSON.stringify({ username: "fixture", show_nsfw: true, show_nsfl: true, show_nsfl_active: false, email: "private@example.invalid", token: "must-not-return" })));
  await b.call("/auth/me");
  expect(b.fetch).toHaveBeenCalledWith("/auth/me", expect.objectContaining({ method: "GET", redirect: "error", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-token" } }));
  const report = b.invoke.mock.calls[0]![1];
  expect(JSON.parse(report.body)).toEqual({ username: "fixture", showNsfw: true, showNsfl: false });
  expect(JSON.stringify(report)).not.toMatch(/synthetic-token|private@|must-not-return/);
});
it("reports an expired session without leaking the server's auth error body", async () => {
  const b = bridge(new Response("private error body", { status: 401 }));
  await b.call("/auth/me");
  expect(b.invoke.mock.calls[0]![1]).toMatchObject({ status: 401, body: '{"username":null,"showNsfw":false,"showNsfl":false}' });
});
it("preserves rate-limit and Cloudflare metadata for ordinary catalog requests", async () => {
  const b = bridge(new Response('{"error":"slow down"}', { status: 429, headers: { "retry-after": "120", "cf-mitigated": "challenge" } }));
  await b.call("/posts/?limit=40");
  expect(b.invoke.mock.calls[0]![1]).toMatchObject({ status: 429, retryAfterSecs: 120, cfMitigated: true });
});
it("caps streamed responses and returns a fixed message rather than unbounded/untrusted error text", async () => {
  const b = bridge(new Response(new Uint8Array(8 * 1024 * 1024 + 1)));
  await b.call("/tags/");
  expect(b.invoke.mock.calls[0]![1]).toMatchObject({ status: 502 });
  expect(b.invoke.mock.calls[0]![1].body.length).toBeLessThan(150);
});
it("signs out only the isolated site session, without a remote account mutation", async () => {
  const b = bridge(new Response("{}"));
  b.storage.set("other-preference", "preserve");
  await b.call("logout");
  expect(b.storage.has("token")).toBe(false); expect(b.storage.has("botbooru_nsfw")).toBe(false);
  expect(b.storage.get("other-preference")).toBe("preserve");
  expect(b.fetch).not.toHaveBeenCalled(); expect(b.reload).not.toHaveBeenCalled();
});
