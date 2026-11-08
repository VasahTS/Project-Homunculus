// JanitorAI (docs/CARD-BROWSER.md §7, T-013). Endpoints, field mapping, greetings and public lorebooks adapted from Glaze
// (hydall/Glaze f1fe39e, AGPL-3.0: lib/features/catalog/services/janitor_provider.dart, janitor_public_lorebook.dart,
// greeting_normalizer.dart). Requests go through the site's own window in the desktop app (Cloudflare and the user's sign-in
// stay there); this file only builds read-only GET addresses and maps the answers. Cards whose creator hides the definition
// are shown but never added (D-081, D-098). CLAUDE, 2026-11-08.
import type { CardItem, CardSource, SiteTransport } from "../types.ts";
import { askImage, askJson, buildCard, list, num, plain, text, withoutExcluded } from "../build.ts";
import { SiteError } from "../pauses.ts";
import { extractJanitor } from "./janitor-extract.ts";

export const JANITOR = "https://janitorai.com";
const API = JANITOR + "/hampter";
const IMAGES = "https://ella.janitorai.com/bot-avatars/";
/** Fixed by the server; a size parameter is ignored. */
const PAGE = 34;
export const HIDDEN_DEFINITION = "The creator keeps this card's definition hidden. Extract reads it through your JanitorAI account.";
export const NO_PROXY = "The creator keeps this card's definition hidden and only allows JanitorAI's own model, so it can't be extracted.";
const ID = /^[A-Za-z0-9-]{1,64}$/;

/** Curated tags, used until /hampter/tags answers (the same list JannyAI mirrors). */
const FALLBACK_TAGS: Record<number, string> = { 1: "Male", 2: "Female", 3: "Non-binary", 4: "Celebrity", 5: "OC", 6: "Fictional", 7: "Real", 8: "Game", 9: "Anime", 10: "Historical", 11: "Royalty", 12: "Detective", 13: "Hero", 14: "Villain", 15: "Magical", 16: "Non-human", 17: "Monster", 18: "Monster Girl", 19: "Alien", 20: "Robot", 21: "Politics", 22: "Vampire", 23: "Giant", 24: "OpenAI", 25: "Elf", 26: "Multiple", 27: "VTuber", 28: "Dominant", 29: "Submissive", 30: "Scenario", 31: "Pokemon", 32: "Assistant", 34: "Non-English", 36: "Philosophy", 38: "RPG", 39: "Religion", 41: "Books", 42: "AnyPOV", 43: "Angst", 44: "Demi-Human", 45: "Enemies to Lovers", 46: "Smut", 47: "MLM", 48: "WLW", 49: "Action", 50: "Romance", 51: "Horror", 52: "Slice of Life", 53: "Fantasy", 54: "Drama", 55: "Comedy", 56: "Mystery", 57: "Sci-Fi", 59: "Yandere", 60: "Furry", 61: "Movies/TV" };
let tagNames = new Map<number, string>(Object.entries(FALLBACK_TAGS).map(([id, n]) => [Number(id), n]));
let tagsLoaded = false;
/** Only for tests. */
export const resetJanitor = () => { tagNames = new Map(Object.entries(FALLBACK_TAGS).map(([id, n]) => [Number(id), n])); tagsLoaded = false; };
const tagId = (name: string) => { const low = name.toLowerCase(); for (const [id, n] of tagNames) if (n.toLowerCase() === low) return id; return undefined; };

export function janitorAvatarUrl(v: unknown, width?: number): string {
  const s = text(v);
  if (!s) return "";
  const url = s.startsWith("https://") ? s : s.startsWith("/") ? "https://ella.janitorai.com" + s : !s.includes("/") ? IMAGES + s : "https://ella.janitorai.com/" + s;
  if (!url.startsWith("https://ella.janitorai.com/")) return "";
  return width && !url.includes("?") ? `${url}?width=${width}` : url;
}

/** The search address. Curated tags go by id, any other tag by its text (custom_tags[]). */
export function janitorSearchUrl(q: { text: string; sort: string; page: number; nsfw: boolean; include: string[] }): string {
  const p = new URLSearchParams({ page: String(Math.max(1, q.page)), mode: q.nsfw ? "all" : "sfw", sort: SORTS.some((s) => s.id === q.sort) ? q.sort : "trending" });
  const words = q.text.trim().slice(0, 200);
  if (words) p.set("search", words);
  for (const name of q.include) {
    const id = tagId(name);
    if (id !== undefined) p.append("tag_id[]", String(id)); else p.append("custom_tags[]", name.replace(/^#/, ""));
  }
  return `${API}/characters?${p}`;
}

type Row = Record<string, unknown>;
function rowTags(m: Row): string[] {
  const named = Array.isArray(m.tags) ? list(m.tags) : (Array.isArray(m.tagIds) ? m.tagIds : []).map((id) => tagNames.get(Number(id)) ?? "").filter(Boolean);
  const custom = list(m.custom_tags).map((t) => "#" + t.replace(/^#/, ""));
  return [...new Set([...named.filter((t) => t.toLowerCase() !== "limitless"), ...custom])];
}
const isNsfw = (m: Row) => m.is_nsfw === true || m.isNsfw === true;
const pageUrl = (id: string, slug: unknown) => { const s = text(slug); return `${JANITOR}/characters/${id}${s && /^[\w-]{1,160}$/.test(s) ? "_" + s : ""}`; };

function toItem(m: Row): CardItem | null {
  const id = text(m.id);
  if (!ID.test(id)) return null;
  const avatar = m.avatar ?? m.image;
  return {
    source: "janitor", id, name: text(m.name) || text(m.chat_name) || "Unnamed",
    creator: text(m.creator_name) || text(m.creatorUsername) || text(m.creator),
    tagline: plain(m.description ?? m.short_description).slice(0, 220), tags: rowTags(m),
    thumb: janitorAvatarUrl(avatar, 400), image: janitorAvatarUrl(avatar) || undefined, nsfw: isNsfw(m),
    url: pageUrl(id, m.slug), stats: { chats: num((m.stats as Row | undefined)?.chat ?? m.public_chat_count), tokens: num(m.totalToken ?? m.total_tokens) },
  };
}

/** Whether the creator left the definition public; only then does /characters/{id} carry the real fields. Glaze `janitorDefinitionPublic`. */
export const definitionPublic = (m: Row) => m.showdefinition === true && (text(m.personality) !== "" || text(m.scenario) !== "");

/** The opening line plus the rest, in the author's order, without blanks or repeats (`first_messages` includes the first one). */
function greetings(m: Row): string[] {
  const out: string[] = [], seen = new Set<string>();
  for (const g of [m.first_message ?? m.first_mes, ...(Array.isArray(m.first_messages) ? m.first_messages : [])]) {
    const v = typeof g === "string" ? g.trim() : "";
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

// ------------------------------------------------------------------ public lorebooks
type ScriptRef = { id: string; title: string };
/** The lorebooks the creator made public (closed ones stay out). */
export function publicScripts(m: Row): ScriptRef[] {
  return (Array.isArray(m.scripts) ? m.scripts : []).filter((s): s is Row => !!s && typeof s === "object")
    .filter((s) => (s.type === "lorebook" || s.type === "advanced") && s.is_public !== false && ID.test(String(s.id ?? "")))
    .map((s) => ({ id: String(s.id), title: text(s.title) }));
}
/** A /hampter/script/{id} record's entries (its `script` is a JSON string). A scripted ("advanced") book has no entries. */
export function scriptEntries(rec: unknown): Row[] {
  const raw = rec && typeof rec === "object" ? (rec as Row).script : undefined;
  let value: unknown = raw;
  if (typeof raw === "string") { try { value = JSON.parse(raw); } catch { return []; } }
  return Array.isArray(value) ? value.filter((e): e is Row => !!e && typeof e === "object" && text(e.content ?? e.text) !== "") : [];
}
const keys = (v: unknown) => Array.isArray(v) ? list(v) : typeof v === "string" ? v.split(",").map((k) => k.trim()).filter(Boolean) : [];
const order = (e: Row) => num(e.order) ?? num(e.insertion_order) ?? num(e.priority) ?? 100;
/** JanitorAI entry → a card book entry (SillyTavern V2). Placement into a card field becomes the same side of the character. */
export function bookEntry(e: Row, index: number, book: string): Row {
  const pos = e.position;
  const before = typeof pos === "string" ? ["before_char", "before_character", "worldInfoBefore"].includes(pos)
    : typeof pos === "number" ? [0, 2, 4].includes(pos)
    : e.placement && e.placement !== "default" && e.placementPosition === "before";
  const rawProb = num(e.probability);
  const probability = rawProb === undefined ? 100 : Math.max(0, Math.min(100, Math.round(rawProb <= 1 ? rawProb * 100 : rawProb)));
  const constant = e.constant === true;
  const logic = num(e.selectiveLogic);
  const title = text(e.comment ?? e.title ?? e.name ?? e.category);
  return {
    id: index, keys: keys(e.key ?? e.keys ?? e.keysRaw ?? e.keywords), secondary_keys: keys(e.keysecondary ?? e.secondary_keys ?? e.keySecondary),
    comment: [book, title || `Entry ${index + 1}`].filter(Boolean).join(" · "), content: text(e.content ?? e.text),
    constant, selective: !constant, insertion_order: order(e), enabled: e.enabled !== false && e.disable !== true,
    position: before ? "before_char" : "after_char",
    extensions: { position: before ? 0 : 1, depth: 4, probability, useProbability: true, selectiveLogic: logic !== undefined && logic >= 0 && logic <= 3 ? logic : 0,
      ...(typeof e.case_sensitive === "boolean" ? { case_sensitive: e.case_sensitive } : {}), ...(typeof e.match_whole_words === "boolean" ? { match_whole_words: e.match_whole_words } : {}),
      ...(e.prevent_recursion === true ? { prevent_recursion: true } : {}) },
  };
}
async function lorebook(m: Row, name: string, t: SiteTransport): Promise<{ book?: Row; skipped: number }> {
  const entries: Row[] = []; const titles: string[] = []; let skipped = 0;
  for (const ref of publicScripts(m).slice(0, 20)) {
    let rows: Row[] = [];
    try { rows = scriptEntries(await askJson(t, "janitor:lorebook", { url: `${API}/script/${ref.id}`, method: "GET" })); }
    catch (e) { if (e instanceof SiteError && e.paused) throw e; }
    if (!rows.length) { skipped++; continue; }
    titles.push(ref.title);
    for (const row of rows) entries.push(bookEntry(row, entries.length, ref.title));
  }
  if (!entries.length) return { skipped };
  return { book: { name: titles.filter(Boolean).join(" + ") || `${name} Lorebook`, entries }, skipped };
}

// ------------------------------------------------------------------ the source
async function character(item: CardItem, t: SiteTransport): Promise<Row> {
  if (!ID.test(item.id)) throw new SiteError("Invalid JanitorAI card.", "janitor", "data");
  const m = await askJson<Row>(t, "janitor:details", { url: `${API}/characters/${item.id}`, method: "GET" });
  if (!m || typeof m !== "object" || Array.isArray(m)) throw new SiteError("JanitorAI did not return this character.", "janitor", "data");
  return m;
}
function definition(m: Row, item: CardItem, book?: Row): Record<string, unknown> {
  const [first = "", ...rest] = greetings(m);
  return buildCard({
    name: text(m.name) || text(m.chat_name) || item.name,
    // JanitorAI's "personality" is the whole definition; the public bio is the creator's notes (Glaze `_convertToGlaze`).
    description: m.personality, personality: "", scenario: m.scenario, first_mes: first, alternate_greetings: rest,
    mes_example: m.example_dialogs ?? m.mes_example, creator_notes: plain(m.description),
    tags: rowTags(m), creator: text(m.creator_name) || item.creator, character_book: book,
    extensions: { janitor: { id: item.id } },
  });
}

const SORTS = [{ id: "trending", label: "Trending (Week)" }, { id: "trending24", label: "Trending (24h)" }, { id: "popular", label: "Popular All Time" }, { id: "latest", label: "Latest" }];

export const janitor: CardSource = {
  id: "janitor", name: "JanitorAI", site: JANITOR,
  sorts: SORTS, defaultSort: "trending", separate: true,
  nsfw: "toggle", nsfwNote: "Adult cards with NSFW on (JanitorAI may ask you to sign in)", pageSize: PAGE, mustHave: [], ascending: false, tokens: false, lowQuality: false, suggestedTags: [],
  async loadTags(t) {
    if (!tagsLoaded) {
      const rows = await askJson<unknown>(t, "janitor:tags", { url: `${API}/tags`, method: "GET" }).catch(() => null);
      const valid = Array.isArray(rows) ? rows.filter((r): r is Row => !!r && typeof r === "object" && Number.isInteger(r.id) && text(r.name) !== "") : [];
      if (valid.length) { tagNames = new Map(valid.map((r) => [r.id as number, text(r.name)])); tagsLoaded = true; }
    }
    return [...tagNames.values()];
  },
  async search(q, t) {
    const d = await askJson<unknown>(t, "janitor:search", { url: janitorSearchUrl(q), method: "GET" });
    const rows = Array.isArray(d) ? d : d && typeof d === "object" ? ((d as Row).data ?? (d as Row).characters) : undefined;
    if (!Array.isArray(rows)) throw new SiteError("JanitorAI did not return its catalog.", "janitor", "data");
    const total = d && typeof d === "object" && !Array.isArray(d) ? num((d as Row).total) ?? null : null;
    const size = d && typeof d === "object" && !Array.isArray(d) ? num((d as Row).size) ?? PAGE : PAGE;
    const items = rows.filter((r): r is Row => !!r && typeof r === "object").map(toItem).filter((x): x is CardItem => x !== null);
    return { items: withoutExcluded(q.nsfw ? items : items.filter((i) => !i.nsfw), q.exclude), total,
      hasMore: rows.length > 0 && (total === null ? rows.length >= size : q.page * size < total) };
  },
  async details(item, t) {
    const m = await character(item, t);
    const shown = definitionPublic(m);
    const all = greetings(m);
    return {
      description: shown ? text(m.personality) : "", personality: "", scenario: shown ? text(m.scenario) : "",
      firstMessage: all[0] ?? "", alternateGreetings: all.slice(1), exampleDialogue: shown ? text(m.example_dialogs ?? m.mes_example) : "",
      creatorNotes: plain(m.description), systemPrompt: "", postHistory: "",
      hasLorebook: shown && publicScripts(m).length > 0, tags: rowTags(m).length ? rowTags(m) : item.tags,
      ...(shown ? {} : m.allow_proxy === false ? { hidden: NO_PROXY } : { hidden: HIDDEN_DEFINITION, canExtract: true }),
    };
  },
  async download(item, t) {
    const m = await character(item, t);
    if (!definitionPublic(m)) throw new SiteError(HIDDEN_DEFINITION, "janitor", "data");
    const { book } = await lorebook(m, item.name, t);
    const avatar = await askImage(t, "janitor:avatar", janitorAvatarUrl(m.avatar ?? m.image) || item.image || item.thumb);
    return { kind: "json", card: definition(m, item, book), avatar };
  },
  /** A hidden card, read through the person's account (D-099). */
  extract(item, t, opts) {
    return extractJanitor(item, t, {
      meta: character,
      publicBook: async (m, name, tt) => (((await lorebook(m, name, tt)).book?.entries ?? []) as Record<string, unknown>[]),
      avatar: (m, it) => janitorAvatarUrl(m.avatar ?? m.image) || it.image || it.thumb,
      tags: rowTags,
    }, opts);
  },
};
