// D-148: web search providers — Exa (free endpoint and API key), NanoGPT, the order with fallback, reading a page a site
// refuses through Exa, and OpenRouter's own search in the request. Fake transports only: never contacts a website.
// Author: CLAUDE, 2026-11-17.
import initSqlJs from "sql.js";
import { describe, expect, it, vi } from "vitest";
import { AssistantChat, AssistantSettings, type AssistantMessage } from "@homunculus/schemas";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate, type ConnectionConfig, type GenerateRequest, type StreamChunk } from "@homunculus/core";
import { citationsOf, streamChat } from "@homunculus/provider-openai";
import { EXA_KEY_NAME, isNanoGpt, isOpenRouter, loadSettings, runAssistant, saveSettings, webPlan, webRows, webSources } from "./engine.ts";
import { runTool, type ToolContext, type WebUsage } from "./tools.ts";
import { EXA_CONTENTS_URL, EXA_MCP_URL, EXA_SEARCH_URL, NANOGPT_WEB_URL, parseExaText, WebQueue, WebSession, type ApiPage, type WebTransport } from "./web.ts";

const EXA_TEXT = [
  "Title: Frieren - Wikipedia\nURL: https://en.wikipedia.org/wiki/Frieren\nPublished: 2024-01-01\nAuthor: N/A\nHighlights:\nFrieren is an elf mage.\nShe travels with Fern.",
  "Title: N/A\nURL: https://frieren.fandom.com/wiki/Fern\nPublished: N/A\nAuthor: N/A\nText: Fern is Frieren's apprentice.",
  "Title: Not a page\nURL: javascript:alert(1)",
].join("\n\n---\n\n");
const rpc = (text: string, extra: Record<string, unknown> = {}) => JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }], ...extra } });
const ok = (body: string): ApiPage => ({ status: 200, body });

function transport(o: { api?: WebTransport["api"]; html?: string; status?: number; get?: WebTransport["get"] } = {}) {
  const searchPage = vi.fn<WebTransport["searchPage"]>(async () => ({ status: o.status ?? 200, html: o.html ?? "" }));
  const get = vi.fn<WebTransport["get"]>(o.get ?? (async (url) => ({ status: 200, finalUrl: url, contentType: "text/html", body: "<title>T</title><p>Body</p>", cut: false })));
  const api = vi.fn<NonNullable<WebTransport["api"]>>(o.api ?? (async () => ok(rpc(EXA_TEXT))));
  return { searchPage, get, api, session: new WebSession({ searchPage, get, api }, new WebQueue()) };
}
const usage = (): WebUsage => ({ searches: 0, pages: 0, cost: 0, providers: [], fallbacks: [] });
const ctxOf = (web: WebSession, providers: ToolContext["webProviders"], webUsage = usage()): ToolContext =>
  ({ store: {} as never, saveNew: true, newId: () => "x", files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {}, web, webProviders: providers, webUsage });

describe("Exa's free endpoint", () => {
  it("reads its text blocks into results (no N/A titles, only web addresses)", () => {
    expect(parseExaText(EXA_TEXT)).toEqual([
      { title: "Frieren - Wikipedia", url: "https://en.wikipedia.org/wiki/Frieren", snippet: "Frieren is an elf mage. She travels with Fern." },
      { title: "https://frieren.fandom.com/wiki/Fern", url: "https://frieren.fandom.com/wiki/Fern", snippet: "Fern is Frieren's apprentice." },
    ]);
  });
  it("calls tools/call on the hosted endpoint and reads a streamed answer", async () => {
    const t = transport({ api: async () => ok(`event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\ndata: ${rpc(EXA_TEXT)}\n`) });
    const r = await t.session.search("frieren", 5, { providers: [{ id: "exa" }] });
    expect(r).toMatchObject({ provider: "Exa (Free)", cached: false, cost: 0 });
    expect(r.results).toHaveLength(2);
    const [url, body, headers] = t.api.mock.calls[0]!;
    expect(url).toBe(EXA_MCP_URL);
    expect(JSON.parse(body)).toMatchObject({ method: "tools/call", params: { name: "web_search_exa", arguments: { query: "frieren", numResults: 5 } } });
    expect(headers.accept).toContain("text/event-stream");
  });
  it("a used-up free limit is a limit (200 with the refusal inside, or 429), never 'no results'", async () => {
    for (const answer of [ok(rpc("You've hit Exa's free MCP rate limit.", { isError: true, _meta: { "ai.exa/rateLimited": true } })), { status: 429, body: "" }]) {
      const t = transport({ api: async () => answer });
      const out = await runTool("web_search", JSON.stringify({ query: "q" }), ctxOf(t.session, [{ id: "exa" }]));
      expect(out).toMatchObject({ error: true, label: "Exa's free limit is used up · add a key or another provider in Customize → Web Search" });
    }
  });
});

describe("the order of providers", () => {
  it("DuckDuckGo limited → Exa answers; the label, the step and the reply's usage say so", async () => {
    const t = transport({ html: '<div id="anomaly-modal"></div>' });
    const use = usage();
    const out = await runTool("web_search", JSON.stringify({ query: "frieren" }), ctxOf(t.session, [{ id: "duckduckgo" }, { id: "exa" }], use));
    expect(out.error).toBeFalsy();
    expect(out.label).toBe("Searched the web: “frieren” · 2 results · Exa (Free) (DuckDuckGo skipped)");
    expect(out.result).toMatch(/^Web results for “frieren” \(Exa \(Free\)\)/);
    expect(use).toMatchObject({ searches: 1, providers: ["Exa (Free)"], fallbacks: ["DuckDuckGo: limited (bot check)"] });
  });
  it("every provider failing says what each one did", async () => {
    const t = transport({ status: 500, api: async () => ({ status: 503, body: '{"error":"busy, see https://status.example"}' }) });
    const out = await runTool("web_search", JSON.stringify({ query: "q" }), ctxOf(t.session, [{ id: "duckduckgo" }, { id: "exa" }]));
    expect(out.error).toBe(true);
    expect(out.result).toBe("Exa (Free): Exa (Free) answered HTTP 503: busy, see (also tried DuckDuckGo: DuckDuckGo answered HTTP 500)");
    expect(out.result).not.toContain("https://");
  });
  it("Exa with a key: the API, the key in its header, the cost", async () => {
    const t = transport({ api: async () => ok(JSON.stringify({ results: [{ title: "Fern", url: "https://a.example/fern", highlights: ["Apprentice."] }], costDollars: { total: 0.007 } })) });
    const use = usage();
    const out = await runTool("web_search", JSON.stringify({ query: "fern" }), ctxOf(t.session, [{ id: "exa-key", key: "k-1" }], use));
    expect(out.label).toBe("Searched the web: “fern” · 1 result · Exa (API Key)");
    const [url, body, headers] = t.api.mock.calls[0]!;
    expect(url).toBe(EXA_SEARCH_URL);
    expect(headers["x-api-key"]).toBe("k-1");
    expect(JSON.parse(body)).toMatchObject({ query: "fern", type: "auto" });
    expect(use.cost).toBe(0.007);
  });
  it("Exa refuses the key → said plainly, the next provider answers", async () => {
    const t = transport({ api: async (url) => (url === EXA_SEARCH_URL ? { status: 401, body: "" } : ok(rpc(EXA_TEXT))) });
    const use = usage();
    const out = await runTool("web_search", JSON.stringify({ query: "q" }), ctxOf(t.session, [{ id: "exa-key", key: "bad" }, { id: "exa" }], use));
    expect(out.label).toContain("· Exa (Free) (Exa (API Key) skipped)");
    expect(use.fallbacks[0]).toBe("Exa (API Key): Exa refused the API key (Assistant → Customize → Web Search)");
  });
  it("NanoGPT: Linkup through the connection's key; both answer shapes; the cost", async () => {
    for (const data of [{ results: [{ type: "text", name: "Fern", url: "https://b.example/fern", content: "Apprentice." }] }, [{ title: "Fern", url: "https://b.example/fern", snippet: "Apprentice." }]]) {
      const t = transport({ api: async () => ok(JSON.stringify({ data, metadata: { cost: 0.006, provider: "linkup" } })) });
      const use = usage();
      const out = await runTool("web_search", JSON.stringify({ query: "fern" }), ctxOf(t.session, [{ id: "nanogpt", key: "n-1" }], use));
      expect(out.result).toContain("1. Fern\n   https://b.example/fern\n   Apprentice.");
      const [url, body, headers] = t.api.mock.calls[0]!;
      expect(url).toBe(NANOGPT_WEB_URL);
      expect(headers.authorization).toBe("Bearer n-1");
      expect(JSON.parse(body)).toEqual({ query: "fern", provider: "linkup", depth: "standard", outputType: "searchResults" });
      expect(use).toMatchObject({ cost: 0.006, providers: ["NanoGPT"] });
    }
    const broke = transport({ api: async () => ({ status: 402, body: "" }) });
    expect((await runTool("web_search", JSON.stringify({ query: "q" }), ctxOf(broke.session, [{ id: "nanogpt", key: "n" }]))).result)
      .toBe("NanoGPT: no credit or balance left, or a usage cap was reached.");
  });
});

describe("reading a page a site refuses", () => {
  it("HTTP 403 → read through Exa when Exa is on; the label says so", async () => {
    const t = transport({ get: async (url) => ({ status: 403, finalUrl: url, contentType: "text/html", body: "", cut: false }),
      api: async () => ok(rpc("# Fern\nURL: https://c.example/fern\n\nFern is Frieren's apprentice.")) });
    const use = usage();
    const out = await runTool("web_fetch", JSON.stringify({ url: "https://c.example/fern" }), ctxOf(t.session, [{ id: "duckduckgo" }, { id: "exa" }], use));
    expect(out.error).toBeFalsy();
    expect(out.label).toContain("· through Exa (Free)");
    expect(out.result).toContain("Fern is Frieren's apprentice.");
    expect(JSON.parse(t.api.mock.calls[0]![1])).toMatchObject({ params: { name: "web_fetch_exa", arguments: { urls: ["https://c.example/fern"] } } });
    expect(use).toMatchObject({ pages: 1, providers: ["Exa (Free)"] });
  });
  it("with an Exa key it uses /contents; a missing page (404) or no Exa stays an error", async () => {
    const t = transport({ get: async (url) => ({ status: 503, finalUrl: url, contentType: "text/html", body: "", cut: false }),
      api: async () => ok(JSON.stringify({ results: [{ title: "Fern", url: "https://c.example/fern", text: "Apprentice." }], costDollars: { total: 0.001 } })) });
    const out = await runTool("web_fetch", JSON.stringify({ url: "https://c.example/fern" }), ctxOf(t.session, [{ id: "exa-key", key: "k" }]));
    expect(out.result).toContain("Apprentice.");
    expect(t.api.mock.calls[0]![0]).toBe(EXA_CONTENTS_URL);
    const missing = transport({ get: async (url) => ({ status: 404, finalUrl: url, contentType: "text/html", body: "", cut: false }) });
    expect((await runTool("web_fetch", JSON.stringify({ url: "https://c.example/x" }), ctxOf(missing.session, [{ id: "exa" }]))).error).toBe(true);
    expect(missing.api).not.toHaveBeenCalled();
    const alone = transport({ get: async (url) => ({ status: 403, finalUrl: url, contentType: "text/html", body: "", cut: false }) });
    expect((await runTool("web_fetch", JSON.stringify({ url: "https://c.example/x" }), ctxOf(alone.session, [{ id: "duckduckgo" }]))).result).toBe("c.example answered HTTP 403.");
  });
});

describe("what the settings make of the order", () => {
  const settings = (order: AssistantSettings["web"]["order"], extra: Partial<AssistantSettings["web"]> = {}) =>
    AssistantSettings.parse({ web: { order, ...extra } });
  const nano: ConnectionConfig = { providerId: "openai-compatible", model: "glm", baseUrl: "https://nano-gpt.com/api/v1", apiKey: "n-key" };
  const router: ConnectionConfig = { providerId: "openai-compatible", model: "x", baseUrl: "https://openrouter.ai/api/v1", apiKey: "o-key" };
  it("recognizes OpenRouter and NanoGPT connections", () => {
    expect(isOpenRouter(router)).toBe(true); expect(isOpenRouter({ providerId: "openai-compatible", baseUrl: "" })).toBe(true);
    expect(isOpenRouter(nano)).toBe(false); expect(isOpenRouter({ providerId: "offline-test" })).toBe(false);
    expect(isNanoGpt(nano)).toBe(true); expect(isNanoGpt(router)).toBe(false);
  });
  it("rows that can't run are skipped, with why; the key and the NanoGPT connection are filled in", async () => {
    const s = settings([{ id: "exa-key", on: true }, { id: "nanogpt", on: true }, { id: "openrouter", on: true }, { id: "duckduckgo", on: false }, { id: "exa", on: true }]);
    expect(webRows(s.web, {}, false, nano).map((r) => [r.label, r.ready, r.note])).toEqual([
      ["Exa (API Key)", false, "No API key · skipped"], ["NanoGPT", false, "No NanoGPT connection · skipped"],
      ["OpenRouter", false, "Only when the Assistant runs on OpenRouter · skipped"], ["DuckDuckGo", true, ""], ["Exa (Free)", true, ""],
    ]);
    const plan = await webPlan(s, { a: nano }, nano, async (n) => (n === EXA_KEY_NAME ? " e-key " : null));
    expect(plan).toEqual({ openrouter: false, providers: [{ id: "exa-key", key: "e-key" }, { id: "nanogpt", key: "n-key" }, { id: "exa" }] });
  });
  it("OpenRouter first and the Assistant on OpenRouter → OpenRouter's own search; else it is skipped", async () => {
    const s = settings([{ id: "openrouter", on: true }, { id: "exa", on: true }]);
    expect(await webPlan(s, {}, router, async () => null)).toEqual({ openrouter: true, providers: [{ id: "exa" }] });
    expect(await webPlan(s, {}, nano, async () => null)).toEqual({ openrouter: false, providers: [{ id: "exa" }] });
  });
});

describe("OpenRouter's own search in the request", () => {
  async function setup(script: (req: GenerateRequest, call: number) => StreamChunk[]) {
    const SQL = await initSqlJs();
    const driver = new SqlJsDriver(new SQL.Database());
    await migrate(driver, coreMigrations);
    const store = new SqlStore(driver);
    const core = new HomunculusCore({ tree: store, stateRepository: store });
    const seen: GenerateRequest[] = [];
    let n = 0;
    await core.loadModules([{ manifest: { id: "fake-ai", version: "1" }, register(api) {
      api.registerProvider({ id: "fake", name: "", help: "", async *stream(req) { seen.push(req); for (const c of script(req, n++)) yield c; } });
    } }]);
    return { store, core, seen };
  }
  const userMsg = (text: string): AssistantMessage => ({ id: "u1", role: "user", text, reasoning: "", attachments: [], steps: [], rounds: [], results: [], createdAt: 1 });
  it("sends openrouter:web_search instead of web_search; the cited pages and the count end up on the reply", async () => {
    const { store, core, seen } = await setup(() => ["Fern is her apprentice.", { citations: [{ url: "https://en.wikipedia.org/wiki/Frieren", title: "Frieren" }] }, { usage: { tokensIn: 10, tokensOut: 5, webSearches: 2 } }]);
    const s = await loadSettings(store);
    await saveSettings(store, { ...s, web: { ...s.web, order: [{ id: "openrouter", on: true }, { id: "duckduckgo", on: true }] } });
    const main: ConnectionConfig = { providerId: "fake", model: "m", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k" };
    const out = await runAssistant({ core, store, chat: AssistantChat.parse({ id: "c", messages: [userMsg("who is fern?")], createdAt: 1, updatedAt: 1 }), main, connections: {}, onUpdate: () => {} });
    expect(seen[0]!.serverTools).toEqual([{ type: "openrouter:web_search", parameters: { engine: "auto", max_uses: 5 } }]);
    expect(seen[0]!.tools!.map((t) => t.name)).not.toContain("web_search");
    expect(seen[0]!.tools!.map((t) => t.name)).toContain("web_fetch");
    const reply = out.messages.at(-1)!;
    expect(reply.used?.web).toMatchObject({ searches: 2, providers: ["OpenRouter"], cited: [{ url: "https://en.wikipedia.org/wiki/Frieren", title: "Frieren" }] });
    expect(webSources(reply.steps, reply.used?.web?.cited).sources).toEqual([{ url: "https://en.wikipedia.org/wiki/Frieren", title: "Frieren", read: false }]);
  });
  it("the provider sends server tools only to OpenRouter, reads url_citation annotations and the search count", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const sse = ['data: {"choices":[{"delta":{"content":"Hi","annotations":[{"type":"url_citation","url_citation":{"url":"https://a.example/x","title":"X"}},{"type":"file"}]}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1,"server_tool_use":{"web_search_requests":1}}}', "data: [DONE]", ""].join("\n");
    const fetchFn = async (_u: unknown, init?: { body?: unknown }) => { bodies.push(JSON.parse(String(init?.body))); return new Response(sse); };
    const tool = { type: "openrouter:web_search" };
    const chunks: StreamChunk[] = [];
    for await (const c of streamChat({ connection: { providerId: "x", model: "m", baseUrl: "https://openrouter.ai/api/v1" }, messages: [], serverTools: [tool] }, fetchFn)) chunks.push(c);
    for await (const _ of streamChat({ connection: { providerId: "x", model: "m", baseUrl: "https://nano-gpt.com/api/v1" }, messages: [], serverTools: [tool] }, fetchFn)) { /* drain */ }
    expect(bodies[0]!.tools).toEqual([tool]);
    expect(bodies[1]!.tools).toBeUndefined();
    expect(chunks).toContainEqual({ citations: [{ url: "https://a.example/x", title: "X" }] });
    expect(chunks).toContainEqual({ usage: { tokensIn: 3, tokensOut: 1, cost: undefined, webSearches: 1 } });
    expect(citationsOf([{ type: "url_citation", url: "javascript:x" }])).toEqual([]);
  });
});
