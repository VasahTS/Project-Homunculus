// D-067 / T-005. DuckDuckGo parsing and address rules ported from Flint (Apache-2.0),
// Jozkah/flint 32861bbf87176a44af7471b54c8fc57aa34d6881, provider.rs and ratelimit.rs.
import { isDesktop } from "../db.ts";

export interface SearchPage { status: number; retryAfterSecs?: number; html: string }
export interface GetPage { status: number; finalUrl: string; contentType: string; body: string; cut: boolean; redirectTo?: string }
/** An answer from a search service's API (D-148): only fixed addresses are allowed (see `web_api` in lib.rs). */
export interface ApiPage { status: number; retryAfterSecs?: number; body: string }
export interface WebTransport {
  searchPage(body: string): Promise<SearchPage>;
  get(url: string): Promise<GetPage>;
  api?(url: string, body: string, headers: Record<string, string>): Promise<ApiPage>;
}
export interface WebResult { title: string; url: string; snippet: string }
export interface PageText { title: string; text: string; url: string; cut: boolean }
/** A provider `web_search` can use, ready to run (its key, when it needs one). D-148. */
export type WebProviderKind = "duckduckgo" | "exa" | "exa-key" | "nanogpt";
export interface WebProvider { id: WebProviderKind; key?: string }
export const WEB_PROVIDER_LABEL: Record<string, string> = { duckduckgo: "DuckDuckGo", exa: "Exa (Free)", "exa-key": "Exa (API Key)", nanogpt: "NanoGPT", openrouter: "OpenRouter" };
export interface WebOptions {
  signal?: AbortSignal; onWait?: (seconds: number) => void;
  /** The providers to try, in order (D-148). Absent = DuckDuckGo only (as before). */
  providers?: WebProvider[];
}
const PREVIEW = "Web search works in the desktop app only.";
const REFUSED = "That address is on this computer or a private network, so it can't be read.";
/** Click tests put a fake web here (as `__h2FakeUpdate` for updates); the browser preview has no web otherwise. */
const fakeWeb = () => (globalThis as { __h2FakeWeb?: WebTransport }).__h2FakeWeb;
export const nativeWeb: WebTransport = {
  async searchPage(body) { if (!isDesktop) { const f = fakeWeb(); if (f) return f.searchPage(body); throw new Error(PREVIEW); } return (await import("@tauri-apps/api/core")).invoke("web_search_page", { body }); },
  async get(url) { if (!isDesktop) { const f = fakeWeb(); if (f) return f.get(url); throw new Error(PREVIEW); } return (await import("@tauri-apps/api/core")).invoke("web_get", { url }); },
  async api(url, body, headers) {
    if (!isDesktop) { const f = fakeWeb(); if (f?.api) return f.api(url, body, headers); throw new Error(PREVIEW); }
    return (await import("@tauri-apps/api/core")).invoke("web_api", { url, body, headers });
  },
};
const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©" };
const decode = (s: string) => s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, key: string) => {
  if (!key.startsWith("#")) return entities[key] ?? all;
  const n = key[1]?.toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
  return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "�";
});
const plain = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const attr = (tag: string, name: string) => decode(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find((v) => v !== undefined) ?? "");
function element(html: string, cls: string): { tag: string; inner: string } | undefined {
  for (const m of html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    if ((cls === "result__a" && m[1]!.toLowerCase() !== "a") || !attr(m[2]!, "class").split(/\s+/).includes(cls)) continue;
    const from = m.index! + m[0].length;
    const close = new RegExp(`</${m[1]}\\s*>`, "i").exec(html.slice(from));
    if (close) return { tag: m[2]!, inner: html.slice(from, from + close.index) };
  }
}
export function parseResults(html: string): WebResult[] {
  const out: WebResult[] = [];
  for (const block of html.split('<div class="result ').slice(1)) {
    if (block.split('"')[0]!.split(/\s+/).includes("result--ad")) continue;
    const link = element(block, "result__a"); if (!link) continue;
    try {
      const href = attr(link.tag, "href");
      let url = new URL(href.startsWith("//") ? `https:${href}` : href);
      if ((url.hostname === "duckduckgo.com" || url.hostname.endsWith(".duckduckgo.com")) && url.pathname.startsWith("/l/")) url = new URL(url.searchParams.get("uddg") ?? "");
      if (!/^https?:$/.test(url.protocol) || out.some((r) => r.url === url.href)) continue;
      out.push({ title: plain(link.inner).slice(0, 120) || url.href, url: url.href, snippet: plain(element(block, "result__snippet")?.inner ?? "").slice(0, 300) });
    } catch { /* Ignore malformed or non-web destinations. */ }
  }
  return out;
}
export const isBotCheck = (html: string) => html.includes("anomaly-modal") || html.includes("challenge-form");
export function readable(body: string, contentType: string): { title: string; text: string } {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  if (["text/plain", "text/markdown", "application/json", "text/json"].includes(type) || type.endsWith("+json")) return { title: "", text: body };
  if (!["text/html", "application/xhtml+xml"].includes(type)) throw new Error(`Can't read ${type || "unknown content type"} pages yet.`);
  const title = plain(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(body)?.[1] ?? "");
  let text = body.replace(/<!--[\s\S]*?(?:-->|$)|<!doctype[^>]*>/gi, "").replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "");
  // Repeated nested structural elements are removed together, not just to their first closing tag.
  const hidden: string[] = [];
  text = text.replace(/<\/?([a-z][\w:-]*)\b[^>]*>|[^<]+|</gi, (token, name: string | undefined) => {
    if (name && /^(script|style|noscript|svg|template|nav|footer|header|aside|form|head)$/i.test(name)) {
      const tag = name.toLowerCase();
      if (token.startsWith("</")) { const at = hidden.lastIndexOf(tag); if (at >= 0) hidden.splice(at); }
      else if (!token.endsWith("/>")) hidden.push(tag);
      return "";
    }
    if (hidden.length) return "";
    if (!name) return token;
    if (/^h[1-6]$/i.test(name)) return token.startsWith("</") ? "\n" : `\n${"#".repeat(Number(name[1]))} `;
    return /^(p|div|section|article|br|li|ul|ol|blockquote|pre|tr|hr)$/i.test(name) ? "\n" : "";
  });
  return { title, text: decode(text).replace(/\r\n?/g, "\n").split("\n").map((s) => s.replace(/[^\S\n]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}
function stopped<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Stopped."));
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function check(signal?: AbortSignal) { if (signal?.aborted) throw new Error("Stopped."); }
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  check(signal);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new Error("Stopped.")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, Math.max(0, ms));
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export class WebLimitedError extends Error {
  constructor(public seconds: number, public reason: string, public provider = "DuckDuckGo") { super(`${provider} is limiting searches right now (${reason}). Try again in about ${seconds} s; don't search again before then.`); }
}

// ------------------------------------------------------------------ search services with an API (D-148)
// Exa's hosted endpoint, Exa's API and NanoGPT's search. Ported in part from Flint (Apache-2.0), Jozkah/flint
// provider.rs (`ExaProvider`, `parse_hosted_result_text`, `parse_hosted_search_text`): the hosted endpoint answers
// "200 OK" with the refusal inside when its free limit is used up, so that is read as a limit, never as "no results".
export const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
export const EXA_SEARCH_URL = "https://api.exa.ai/search";
export const EXA_CONTENTS_URL = "https://api.exa.ai/contents";
export const NANOGPT_WEB_URL = "https://nano-gpt.com/api/web";
const EXA_PAGE_CHARS = 20_000;
type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? v as Json : {});
const text = (v: unknown) => (typeof v === "string" ? v : "");
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const rateWords = /rate.?limit|too many requests|free (mcp )?(plan|tier|limit)|quota/i;
function parseJson(body: string, provider: string): Json {
  try { return obj(JSON.parse(body)); } catch { throw new Error(`${provider} returned an answer that isn't JSON.`); }
}
/** HTTP errors of a search API, with the key / balance cases said plainly. */
function apiFailure(r: ApiPage, provider: string, where: string): Error {
  if (r.status === 429) return new WebLimitedError(Math.min(300, r.retryAfterSecs ?? 60), "HTTP 429", provider);
  if (r.status === 401 || r.status === 403) return new Error(`${provider} refused the API key (${where}).`);
  if (r.status === 402) return new Error(`${provider}: no credit or balance left, or a usage cap was reached.`);
  // only the first words of the body: provider text with links reads like orders to a model (Flint)
  const said = (() => { try { const j = obj(JSON.parse(r.body)); return text(j.error) || text(obj(j.error).message) || text(j.message); } catch { return ""; } })();
  return new Error(`${provider} answered HTTP ${r.status}${said ? `: ${clip(said.replace(/https?:\/\/\S+/g, "").trim(), 120)}` : ""}.`);
}
/** One `tools/call` on Exa's hosted endpoint; returns the tool's text. */
export async function exaHosted(t: WebTransport, tool: string, args: Json): Promise<string> {
  if (!t.api) throw new Error(PREVIEW);
  const r = await t.api(EXA_MCP_URL, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
    { "content-type": "application/json", accept: "application/json, text/event-stream" });
  if (r.status === 429) throw new WebLimitedError(Math.min(300, r.retryAfterSecs ?? 300), "free limit", "Exa (Free)");
  if (r.status < 200 || r.status >= 300) throw apiFailure(r, "Exa (Free)", "free endpoint");
  // a streamed answer may carry progress frames first: the frame with `result` or `error` is the one
  const frames = r.body.split("\n").flatMap((l) => (l.startsWith("data:") ? [l.slice(5).trim()] : []));
  let envelope: Json | undefined;
  for (const f of frames) { try { const j = obj(JSON.parse(f)); if ("result" in j || "error" in j) { envelope = j; break; } } catch { /* not JSON */ } }
  envelope ??= parseJson(r.body.trim(), "Exa (Free)");
  if (envelope.error) {
    const message = text(obj(envelope.error).message) || "unknown error";
    if (rateWords.test(message)) throw new WebLimitedError(300, "free limit", "Exa (Free)");
    throw new Error(`Exa (Free) returned an error: ${clip(message.replace(/https?:\/\/\S+/g, "").trim(), 120)}`);
  }
  const result = obj(envelope.result);
  const first = obj((Array.isArray(result.content) ? result.content : [])[0]);
  const body = text(first.text);
  const meta = obj(result._meta);
  const limited = Object.entries(meta).some(([k, v]) => (k === "rateLimited" || k.endsWith("/rateLimited")) && v === true);
  if (limited || (result.isError === true && rateWords.test(body))) throw new WebLimitedError(300, "free limit", "Exa (Free)");
  if (result.isError === true) throw new Error(`Exa (Free) couldn't do it: ${clip(body.replace(/https?:\/\/\S+/g, "").trim() || "unknown error", 120)}`);
  return body;
}
/** Exa's hosted search text ("Title: … URL: … Highlights: …" blocks between "---") as results. */
export function parseExaText(body: string): WebResult[] {
  const out: WebResult[] = [];
  for (const block of body.split(/\n-{3,}\n/)) {
    let title = "", url = "", mode: "" | "highlights" | "text" = "";
    const lines: string[] = [];
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      const field = /^(Title|URL|Published|Author|Highlights|Text):\s*(.*)$/.exec(line);
      if (field) {
        const [, k, v] = field;
        if (k === "Title") title = v!; else if (k === "URL") url = v!;
        else if (k === "Highlights") { mode = "highlights"; if (v) lines.push(v); }
        else if (k === "Text") { mode = "text"; if (v) lines.push(v); }
        continue;
      }
      if (mode && line && line !== "...") lines.push(line);
    }
    if (!/^https?:\/\//.test(url) || out.some((r) => r.url === url)) continue;
    out.push({ title: clip(title && title !== "N/A" ? title : url, 120), url, snippet: clip(lines.join(" ").replace(/\s+/g, " "), 300) });
  }
  return out;
}
const fromList = (list: unknown[], pick: (x: Json) => { title: string; url: string; snippet: string }): WebResult[] => {
  const out: WebResult[] = [];
  for (const item of list) {
    const r = pick(obj(item));
    if (!/^https?:\/\//.test(r.url) || out.some((x) => x.url === r.url)) continue;
    out.push({ title: clip(r.title.trim() || r.url, 120), url: r.url, snippet: clip(r.snippet.replace(/\s+/g, " ").trim(), 300) });
  }
  return out;
};
const costOf = (v: unknown) => { const n = typeof v === "number" ? v : Number(obj(v).total); return Number.isFinite(n) && n > 0 ? n : 0; };
interface Found { results: WebResult[]; cost: number }
async function searchExaFree(t: WebTransport, query: string, count: number): Promise<Found> {
  return { results: parseExaText(await exaHosted(t, "web_search_exa", { query, numResults: count })), cost: 0 };
}
async function searchExaKey(t: WebTransport, key: string, query: string, count: number): Promise<Found> {
  if (!t.api) throw new Error(PREVIEW);
  const r = await t.api(EXA_SEARCH_URL, JSON.stringify({ query, type: "auto", numResults: count, contents: { highlights: { maxCharacters: 600 } } }),
    { "content-type": "application/json", "x-api-key": key });
  if (r.status < 200 || r.status >= 300) throw apiFailure(r, "Exa", "Assistant → Customize → Web Search");
  const j = parseJson(r.body, "Exa");
  const results = fromList(Array.isArray(j.results) ? j.results : [], (x) => ({
    title: text(x.title), url: text(x.url),
    snippet: (Array.isArray(x.highlights) ? x.highlights.filter((h): h is string => typeof h === "string").join(" ") : "") || text(x.summary) || text(x.text),
  }));
  return { results, cost: costOf(j.costDollars) };
}
async function searchNanoGpt(t: WebTransport, key: string, query: string, count: number): Promise<Found> {
  if (!t.api) throw new Error(PREVIEW);
  const r = await t.api(NANOGPT_WEB_URL, JSON.stringify({ query, provider: "linkup", depth: "standard", outputType: "searchResults" }),
    { "content-type": "application/json", authorization: `Bearer ${key}` });
  if (r.status < 200 || r.status >= 300) throw apiFailure(r, "NanoGPT", "the NanoGPT connection's key");
  const j = parseJson(r.body, "NanoGPT");
  // `data` is the provider's list (Linkup: { results: [{ name, url, content }] }); both shapes are read
  const data = j.data;
  const list = Array.isArray(data) ? data : Array.isArray(obj(data).results) ? obj(data).results as unknown[] : [];
  const results = fromList(list, (x) => ({ title: text(x.title) || text(x.name), url: text(x.url) || text(x.link), snippet: text(x.snippet) || text(x.content) || text(x.description) || text(x.text) }));
  return { results: results.slice(0, count), cost: costOf(obj(j.metadata).cost) };
}
/** Reads a page through Exa (when the site refuses the app's own reader). */
async function readThroughExa(t: WebTransport, p: WebProvider, url: string): Promise<PageText & { cost: number }> {
  if (p.id === "exa-key" && p.key) {
    if (!t.api) throw new Error(PREVIEW);
    const r = await t.api(EXA_CONTENTS_URL, JSON.stringify({ urls: [url], text: { maxCharacters: EXA_PAGE_CHARS } }), { "content-type": "application/json", "x-api-key": p.key });
    if (r.status < 200 || r.status >= 300) throw apiFailure(r, "Exa", "Assistant → Customize → Web Search");
    const j = parseJson(r.body, "Exa");
    const first = obj((Array.isArray(j.results) ? j.results : [])[0]);
    const body = text(first.text).trim();
    if (!body) throw new Error("Exa found no text on that page.");
    return { title: text(first.title), text: body, url: text(first.url) || url, cut: body.length >= EXA_PAGE_CHARS, cost: costOf(j.costDollars) };
  }
  const body = await exaHosted(t, "web_fetch_exa", { urls: [url], maxCharacters: EXA_PAGE_CHARS });
  // "# Title\nURL: …\n\n<text>"
  const lines = body.split("\n");
  const title = lines[0]?.startsWith("# ") ? lines[0].slice(2).trim() : "";
  const at = lines.findIndex((l) => l.startsWith("URL:"));
  const page = (at >= 0 ? lines.slice(at + 1) : lines).join("\n").replace(/^(Published|Author):.*$/gm, "").trim();
  if (!page || /^Error fetching /m.test(page) && page.split("\n").length < 3) throw new Error("Exa couldn't read that page either.");
  return { title: title === "(no title)" ? "" : title, text: page, url, cut: page.length >= EXA_PAGE_CHARS, cost: 0 };
}
/** Shared by all sessions. A canceled native call keeps its slot until its late answer is discarded. */
export class WebQueue {
  private tail = Promise.resolve();
  private pages = [Promise.resolve(), Promise.resolve()];
  private pageIndex = 0;
  nextSearch = 0;
  until = 0;
  strikes = 0;
  lastStrike = -Infinity;
  reason = "";
  search<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const task = this.tail.then(() => { check(signal); return job(); });
    this.tail = task.then(() => {}, () => {});
    return stopped(task, signal);
  }
  page<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const index = this.pageIndex++ % 2;
    const task = this.pages[index]!.then(() => { check(signal); return job(); });
    this.pages[index] = task.then(() => {}, () => {});
    return stopped(task, signal);
  }
}
const sharedQueue = new WebQueue();
const TTL = 600_000;
class Cache<T> {
  private values = new Map<string, { at: number; value: T }>();
  get(key: string): T | undefined { const v = this.values.get(key); if (v && Date.now() - v.at < TTL) return v.value; this.values.delete(key); }
  set(key: string, value: T) { this.values.delete(key); this.values.set(key, { at: Date.now(), value }); if (this.values.size > 50) this.values.delete(this.values.keys().next().value!); }
}
/** `skipped`: providers passed over (labels); `fallbacks`: the same with why ("DuckDuckGo: limited (bot check)"). */
export interface SearchFound { query: string; results: WebResult[]; cached: boolean; note: string; provider: string; cost: number; fallbacks: string[]; skipped: string[] }
/** Why a provider was skipped, in a few words ("free limit", "HTTP 503"). */
export const skipReason = (e: unknown) => e instanceof WebLimitedError ? `limited (${e.reason})` : clip((e instanceof Error ? e.message : String(e)).replace(/\.$/, ""), 80);
export class WebSession {
  private searches = new Cache<{ results: WebResult[]; provider: string }>();
  private pages = new Cache<PageText & { via?: string }>();
  private reading = new Map<string, Promise<GetPage>>();
  private running = new Map<string, Promise<SearchFound>>();
  constructor(private transport: WebTransport = nativeWeb, private queue: WebQueue = sharedQueue) {}
  /** Tries the providers in order (D-148); one that fails or is limited passes the search to the next. */
  async search(query: string, count = 5, o: WebOptions = {}): Promise<SearchFound> {
    const key = query.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) throw new Error("Enter a search query.");
    count = Number.isFinite(count) ? Math.min(10, Math.max(1, Math.floor(count))) : 5;
    const providers: WebProvider[] = o.providers?.length ? o.providers : [{ id: "duckduckgo" }];
    check(o.signal);
    const again = (r: { results: WebResult[]; provider: string }): SearchFound => ({ query, results: r.results.slice(0, count), cached: true, note: "(from a moment ago)", provider: r.provider, cost: 0, fallbacks: [], skipped: [] });
    const cached = this.searches.get(key);
    if (cached) return again(cached);
    // the same search already running (two calls in one round): wait for it instead of searching twice
    const running = this.running.get(key);
    if (running) { const r = await stopped(running, o.signal).catch(() => undefined); const now = this.searches.get(key); if (r && now) return again(now); }
    const job = this.searchOnce(query, key, count, providers, o);
    this.running.set(key, job);
    try { return await job; } finally { if (this.running.get(key) === job) this.running.delete(key); }
  }
  private async searchOnce(query: string, key: string, count: number, providers: WebProvider[], o: WebOptions): Promise<SearchFound> {
    const fallbacks: string[] = [], skipped: string[] = [];
    for (const [i, p] of providers.entries()) {
      const label = WEB_PROVIDER_LABEL[p.id] ?? p.id;
      const more = i < providers.length - 1;
      try {
        const want = Math.max(count, 5);
        const found = p.id === "duckduckgo" ? { results: await this.duckDuckGo(query, o, more), cost: 0 }
          : await stopped(p.id === "exa" ? searchExaFree(this.transport, query, want)
            : p.id === "exa-key" ? searchExaKey(this.transport, p.key ?? "", query, want)
            : searchNanoGpt(this.transport, p.key ?? "", query, want), o.signal);
        check(o.signal);
        this.searches.set(key, { results: found.results.slice(0, 10), provider: label });
        return { query, results: found.results.slice(0, count), cached: false, note: "", provider: label, cost: found.cost, fallbacks, skipped };
      } catch (e) {
        if (o.signal?.aborted) throw new Error("Stopped.");
        if (!more) {
          if (fallbacks.length && !(e instanceof WebLimitedError)) throw new Error(`${label}: ${skipReason(e)} (also tried ${fallbacks.join("; ")})`);
          throw e;
        }
        fallbacks.push(`${label}: ${skipReason(e)}`); skipped.push(label);
      }
    }
    throw new Error("No web search provider is on.");
  }
  /** DuckDuckGo's HTML page, one search at a time with a pause between (D-067). With a provider after it, a cooldown skips instead of waiting. */
  private duckDuckGo(query: string, o: WebOptions, more: boolean): Promise<WebResult[]> {
    return this.queue.search(async () => {
      check(o.signal);
      for (let attempt = 0; attempt < 2; attempt++) {
        const remaining = Math.ceil((this.queue.until - Date.now()) / 1000);
        if (remaining > 30 || (more && remaining > 0)) throw new WebLimitedError(remaining, this.queue.reason);
        while (this.queue.until > Date.now()) {
          o.onWait?.(Math.ceil((this.queue.until - Date.now()) / 1000));
          await wait(Math.min(1000, this.queue.until - Date.now()), o.signal);
        }
        await wait(this.queue.nextSearch - Date.now(), o.signal);
        check(o.signal);
        this.queue.nextSearch = Date.now() + 2000;
        const response = await this.transport.searchPage(new URLSearchParams({ q: query.trim().replace(/\s+/g, " ") }).toString());
        check(o.signal);
        const bot = isBotCheck(response.html);
        if (bot || [202, 403, 429].includes(response.status)) {
          if (Date.now() - this.queue.lastStrike >= TTL) this.queue.strikes = 0;
          const cooldown = Math.min(300, Math.max(0, response.retryAfterSecs ?? [30, 60, 120, 300][Math.min(this.queue.strikes, 3)]!));
          this.queue.strikes++; this.queue.lastStrike = Date.now(); this.queue.until = Date.now() + cooldown * 1000;
          this.queue.reason = bot ? "bot check" : `HTTP ${response.status}`;
          throw new WebLimitedError(Math.ceil(cooldown), this.queue.reason);
        }
        if (response.status < 200 || response.status >= 300) {
          if (attempt === 0 && !more) { await wait(3000, o.signal); continue; }
          throw new Error(`DuckDuckGo answered HTTP ${response.status}.`);
        }
        return parseResults(response.html).slice(0, 10);
      }
      throw new Error("DuckDuckGo search failed.");
    }, o.signal);
  }
  async fetch(address: string, o: WebOptions = {}) {
    const parsed = new URL(address);
    if (!/^https?:$/.test(parsed.protocol) || (parsed.port && !["80", "443"].includes(parsed.port)) || parsed.username || parsed.password) throw new Error(REFUSED);
    parsed.hash = "";
    const url = parsed.href;
    return this.queue.page(async () => {
      check(o.signal);
      const cached = this.pages.get(url);
      if (cached) return { ...cached, cached: true, note: "(from a moment ago)", cost: 0 };
      let pending = this.reading.get(url);
      if (!pending) {
        pending = this.transport.get(url); this.reading.set(url, pending);
        void pending.then(() => this.reading.delete(url), () => this.reading.delete(url));
      }
      // D-148: a site that refuses the app's reader (blocked, too slow, no readable text) is read through Exa when Exa is on
      const reader = o.providers?.find((p) => p.id === "exa-key" && p.key) ?? o.providers?.find((p) => p.id === "exa");
      let response: GetPage;
      try { response = await stopped(pending, o.signal); } catch (e) {
        if (o.signal?.aborted || !reader || (e instanceof Error && e.message === REFUSED)) throw e;
        return this.viaExa(reader, url, e);
      }
      check(o.signal);
      if (response.redirectTo) throw new Error(`${url} redirects to ${response.redirectTo}. It was not followed; call web_fetch with that address if you want it.`);
      const own = new Error(`${parsed.host} answered HTTP ${response.status}.`);
      if (response.status < 200 || response.status >= 300) { if (reader && response.status !== 404 && response.status !== 410) return this.viaExa(reader, url, own); throw own; }
      let page: PageText;
      try { page = { ...readable(response.body, response.contentType), url: response.finalUrl, cut: response.cut }; }
      catch (e) { if (reader && /html|unknown/i.test(response.contentType || "unknown")) return this.viaExa(reader, url, e); throw e; }
      if (!page.text.trim() && reader) return this.viaExa(reader, url, new Error("no readable text"));
      this.pages.set(url, page);
      return { ...page, cached: false, note: "", cost: 0 };
    }, o.signal);
  }
  private async viaExa(p: WebProvider, url: string, first: unknown) {
    try {
      const { cost, ...page } = await readThroughExa(this.transport, p, url);
      const via = WEB_PROVIDER_LABEL[p.id] ?? p.id;
      this.pages.set(url, { ...page, via });
      return { ...page, via, cached: false, note: "", cost };
    } catch (e) {
      const why = (x: unknown) => (x instanceof Error ? x.message : String(x)).replace(/\.$/, "");
      throw new Error(`${why(first)}. Reading it through Exa failed too: ${why(e)}.`);
    }
  }
}
