// D-067 / T-005. DuckDuckGo parsing and address rules ported from Flint (Apache-2.0),
// Jozkah/flint 32861bbf87176a44af7471b54c8fc57aa34d6881, provider.rs and ratelimit.rs.
import { isDesktop } from "../db.ts";

export interface SearchPage { status: number; retryAfterSecs?: number; html: string }
export interface GetPage { status: number; finalUrl: string; contentType: string; body: string; cut: boolean; redirectTo?: string }
export interface WebTransport { searchPage(body: string): Promise<SearchPage>; get(url: string): Promise<GetPage> }
export interface WebResult { title: string; url: string; snippet: string }
export interface PageText { title: string; text: string; url: string; cut: boolean }
export interface WebOptions { signal?: AbortSignal; onWait?: (seconds: number) => void }
const PREVIEW = "Web search works in the desktop app only.";
const REFUSED = "That address is on this computer or a private network, so it can't be read.";
export const nativeWeb: WebTransport = {
  async searchPage(body) { if (!isDesktop) throw new Error(PREVIEW); return (await import("@tauri-apps/api/core")).invoke("web_search_page", { body }); },
  async get(url) { if (!isDesktop) throw new Error(PREVIEW); return (await import("@tauri-apps/api/core")).invoke("web_get", { url }); },
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
  constructor(public seconds: number, public reason: string) { super(`DuckDuckGo is limiting searches right now (${reason}). Try again in about ${seconds} s; don't search again before then.`); }
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
export class WebSession {
  private searches = new Cache<WebResult[]>();
  private pages = new Cache<PageText>();
  private reading = new Map<string, Promise<GetPage>>();
  constructor(private transport: WebTransport = nativeWeb, private queue: WebQueue = sharedQueue) {}
  async search(query: string, count = 5, o: WebOptions = {}) {
    const key = query.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) throw new Error("Enter a search query.");
    count = Number.isFinite(count) ? Math.min(10, Math.max(1, Math.floor(count))) : 5;
    return this.queue.search(async () => {
      check(o.signal);
      const cached = this.searches.get(key);
      if (cached) return { query, results: cached.slice(0, count), cached: true, note: "(from a moment ago)" };
      for (let attempt = 0; attempt < 2; attempt++) {
        const remaining = Math.ceil((this.queue.until - Date.now()) / 1000);
        if (remaining > 30) throw new WebLimitedError(remaining, this.queue.reason);
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
          if (attempt === 0) { await wait(3000, o.signal); continue; }
          throw new Error(`DuckDuckGo answered HTTP ${response.status}.`);
        }
        const results = parseResults(response.html).slice(0, 10);
        this.searches.set(key, results);
        return { query, results: results.slice(0, count), cached: false, note: "" };
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
      if (cached) return { ...cached, cached: true, note: "(from a moment ago)" };
      let pending = this.reading.get(url);
      if (!pending) {
        pending = this.transport.get(url); this.reading.set(url, pending);
        void pending.then(() => this.reading.delete(url), () => this.reading.delete(url));
      }
      const response = await pending;
      check(o.signal);
      if (response.redirectTo) throw new Error(`${url} redirects to ${response.redirectTo}. It was not followed; call web_fetch with that address if you want it.`);
      if (response.status < 200 || response.status >= 300) throw new Error(`${parsed.host} answered HTTP ${response.status}.`);
      const page = { ...readable(response.body, response.contentType), url: response.finalUrl, cut: response.cut };
      this.pages.set(url, page);
      return { ...page, cached: false, note: "" };
    }, o.signal);
  }
}
