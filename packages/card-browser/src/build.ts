// Turning site data into cards. buildCard is a port of Homunculus v1 src/endpoints/classic-card-browser.js `buildCard`
// (VasahTS/Homunculus 0884338a), itself following Marinara Engine's bot browser. CLAUDE, 2026-11-02 (T-008).
import type { CardDetails, SiteRequest, SiteTransport } from "./types.ts";
import { pauses, refusalKind, SiteError } from "./pauses.ts";

type Loose = Record<string, unknown>;
const asText = (v: unknown) => (typeof v === "string" ? v : "");
export const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((t) => (typeof t === "string" ? t : (t as { name?: unknown; slug?: unknown } | null)?.name ?? (t as { slug?: unknown } | null)?.slug)).filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()) : [];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** HTML → plain text (site text is always shown as text, never as HTML). Keeps line breaks. */
export function plain(v: unknown): string {
  return asText(v)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, k: string) => {
      if (!k.startsWith("#")) return ENTITIES[k.toLowerCase()] ?? all;
      const n = k[1]?.toLowerCase() === "x" ? parseInt(k.slice(2), 16) : Number(k.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    })
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Loose fields → a Character Card V2 object (what the app's JSON importer reads). */
export function buildCard(c: Loose): Record<string, unknown> {
  const greetings = Array.isArray(c.alternate_greetings) ? c.alternate_greetings.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  const data: Loose = {
    name: asText(c.name) || "Unnamed",
    description: asText(c.description),
    personality: asText(c.personality),
    scenario: asText(c.scenario),
    first_mes: asText(c.first_mes),
    mes_example: asText(c.mes_example),
    creator_notes: asText(c.creator_notes),
    system_prompt: asText(c.system_prompt),
    post_history_instructions: asText(c.post_history_instructions),
    alternate_greetings: greetings,
    tags: list(c.tags).slice(0, 50),
    creator: asText(c.creator),
    character_version: asText(c.character_version),
    extensions: c.extensions && typeof c.extensions === "object" && !Array.isArray(c.extensions) ? c.extensions : {},
  };
  const book = c.character_book as { entries?: unknown } | undefined;
  if (book && typeof book === "object" && Array.isArray(book.entries) && book.entries.length) data.character_book = book;
  return { spec: "chara_card_v2", spec_version: "2.0", data };
}

/** The details a V2 card object shows in the sheet. */
export function detailsFromCard(card: Loose, tags: string[] = []): CardDetails {
  const d = ((card.data as Loose | undefined) ?? card) as Loose;
  const book = d.character_book as { entries?: unknown[] } | undefined;
  return {
    description: text(d.description), personality: text(d.personality), scenario: text(d.scenario), firstMessage: text(d.first_mes),
    alternateGreetings: list(d.alternate_greetings), exampleDialogue: text(d.mes_example), creatorNotes: plain(d.creator_notes),
    systemPrompt: text(d.system_prompt), postHistory: text(d.post_history_instructions),
    hasLorebook: Array.isArray(book?.entries) && book!.entries!.length > 0, tags: list(d.tags).length ? list(d.tags) : tags,
  };
}

export const encodePath = (v: string) => v.split("/").map(encodeURIComponent).join("/");
export const slugify = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "character";

/** Asks a site, honouring and recording pauses. Refusals and errors become SiteErrors; the answer is returned as is. */
export async function ask(t: SiteTransport, key: string, req: SiteRequest): Promise<{ status: number; text: string; bytes?: Uint8Array; mime?: string }> {
  pauses.check(key);
  const site = key.split(":")[0]!;
  let r;
  try { r = await t.request(req); }
  catch (e) { throw new SiteError(e instanceof Error ? e.message : String(e), site, "http"); }
  const kind = refusalKind(r);
  if (kind) {
    const ms = pauses.pause(key, kind, r.status, r.retryAfterSecs);
    pauses.check(key); // throws the pause message
    throw new SiteError("", site, kind, ms, r.status);
  }
  if (r.status < 200 || r.status >= 300) throw new SiteError(`${req.url.split("/")[2]} answered ${r.status}.`, site, "http", 0, r.status);
  return { status: r.status, text: r.text ?? "", bytes: r.bytes, mime: r.mime };
}

export async function askJson<T = unknown>(t: SiteTransport, key: string, req: Omit<SiteRequest, "expect">): Promise<T> {
  const r = await ask(t, key, { ...req, expect: "json" });
  try { return JSON.parse(r.text) as T; }
  catch { throw new SiteError(`${req.url.split("/")[2]} sent an unreadable answer.`, key.split(":")[0]!, "data"); }
}

/** A picture, or undefined when it can't be had (a card is still useful without one). */
export async function askImage(t: SiteTransport, key: string, url: string, headers?: Record<string, string>): Promise<{ mime: string; bytes: Uint8Array } | undefined> {
  if (!url) return undefined;
  try {
    const r = await ask(t, key, { url, method: "GET", expect: "image", headers });
    return r.bytes && r.mime ? { mime: r.mime, bytes: r.bytes } : undefined;
  } catch (e) {
    if (e instanceof SiteError && e.kind === "rate") throw e;
    return undefined;
  }
}

/** Removes cards that carry a hidden tag (sites that can't exclude tags themselves). */
export const withoutExcluded = <T extends { tags: string[] }>(items: T[], exclude: string[]) => {
  if (!exclude.length) return items;
  const hidden = new Set(exclude.map((t) => t.toLowerCase()));
  return items.filter((c) => !c.tags.some((t) => hidden.has(t.toLowerCase())));
};
export const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
