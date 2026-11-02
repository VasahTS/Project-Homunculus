// JannyAI. Port of Homunculus v1 (VasahTS/Homunculus 0884338a): server `janny*` (search key from the site's page bundle,
// Meilisearch search, the character page's astro-island props, the download API) and client `SOURCES.janny`, `JANNY_TAGS`.
// v1's Node/Bun child-process trick does not apply here. CLAUDE, 2026-11-02 (T-012).
import type { CardFile, CardItem, CardSource, SiteTransport } from "../types.ts";
import { ask, askImage, askJson, buildCard, detailsFromCard, list, num, plain, slugify, text, withoutExcluded } from "../build.ts";
import { pauses, SiteError } from "../pauses.ts";

const SITE = "https://jannyai.com";
const SEARCH = "https://search.jannyai.com/multi-search";
const IMAGES = "https://image.jannyai.com/bot-avatars/";
const DOWNLOAD = "https://api.jannyai.com/api/v1/download";
const FALLBACK_KEY = "88a6463b66e04fb07ba87ee3db06af337f492ce511d93df6e2d2968cb2ff2b30";
export const JANNY_TAGS: Record<number, string> = { 1: 'Male', 2: 'Female', 3: 'Non-binary', 4: 'Celebrity', 5: 'OC', 6: 'Fictional', 7: 'Real', 8: 'Game', 9: 'Anime', 10: 'Historical', 11: 'Royalty', 12: 'Detective', 13: 'Hero', 14: 'Villain', 15: 'Magical', 16: 'Non-human', 17: 'Monster', 18: 'Monster Girl', 19: 'Alien', 20: 'Robot', 21: 'Politics', 22: 'Vampire', 23: 'Giant', 24: 'OpenAI', 25: 'Elf', 26: 'Multiple', 27: 'VTuber', 28: 'Dominant', 29: 'Submissive', 30: 'Scenario', 31: 'Pokemon', 32: 'Assistant', 34: 'Non-English', 36: 'Philosophy', 38: 'RPG', 39: 'Religion', 41: 'Books', 42: 'AnyPOV', 43: 'Angst', 44: 'Demi-Human', 45: 'Enemies to Lovers', 46: 'Smut', 47: 'MLM', 48: 'WLW', 49: 'Action', 50: 'Romance', 51: 'Horror', 52: 'Slice of Life', 53: 'Fantasy', 54: 'Drama', 55: 'Comedy', 56: 'Mystery', 57: 'Sci-Fi', 59: 'Yandere', 60: 'Furry', 61: 'Movies/TV' };
const TAG_IDS = new Map(Object.entries(JANNY_TAGS).map(([id, n]) => [n.toLowerCase(), Number(id)]));
const SORTS: Record<string, string[]> = { newest: ["createdAtStamp:desc"], oldest: ["createdAtStamp:asc"], tokens_desc: ["totalToken:desc"], tokens_asc: ["totalToken:asc"], relevant: [] };

let key = { value: "", fallback: false, at: 0 };
/** Only for tests. */
export const resetJannyKey = () => { key = { value: "", fallback: false, at: 0 }; loaded = new WeakMap(); };

async function page(t: SiteTransport, path: string, base = SITE): Promise<string | null> {
  try { return (await ask(t, base === SITE ? "janny:page" : "janny:mirror", { url: base + path, method: "GET", expect: "text", headers: { Accept: "text/html,application/xhtml+xml,*/*" } })).text; }
  catch { return null; }
}
/** The public search key JannyAI's own site uses, read from its page bundle; cached 5 min (1 min when the known one was used). */
export async function searchKey(t: SiteTransport, force = false): Promise<string> {
  if (!force && key.value && Date.now() - key.at < (key.fallback ? 60_000 : 5 * 60_000)) return key.value;
  let value = "";
  const html = await page(t, "/characters/search");
  let config = html?.match(/client-config\.[\w-]+\.js/)?.[0] ?? null;
  if (!config && html) {
    const sp = html.match(/SearchPage\.[\w-]+\.js/)?.[0];
    const js = sp ? await page(t, `/_astro/${sp}`) : null;
    config = js?.match(/client-config\.[\w-]+\.js/)?.[0] ?? null;
  }
  if (config) value = (await page(t, `/_astro/${config}`))?.match(/"([a-f0-9]{64})"/)?.[1] ?? "";
  key = { value: value || FALLBACK_KEY, fallback: !value, at: Date.now() };
  return key.value;
}
const headers = (k: string) => ({
  Accept: "*/*", "Content-Type": "application/json", Authorization: `Bearer ${k}`, Origin: SITE, Referer: `${SITE}/`,
  "x-meilisearch-client": "Meilisearch instant-meilisearch (v0.19.0) ; Meilisearch JavaScript (v0.41.0)",
});

function decodeAstro(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  const [type, data] = v as [number, unknown];
  if (type === 0 && data && typeof data === "object" && !Array.isArray(data)) return Object.fromEntries(Object.entries(data).map(([k, x]) => [k, decodeAstro(x)]));
  if (type === 1 && Array.isArray(data)) return data.map(decodeAstro);
  return data;
}
/** The character data JannyAI's page embeds for its own scripts; null when blocked or changed. */
export function parseJannyPage(html: string | null): Record<string, unknown> | null {
  if (!html || /Just a moment|cf-challenge|challenge-platform/.test(html)) return null;
  const m = html.match(/<astro-island[^>]*component-export="CharacterButtons"[^>]*\sprops="([^"]+)"/) ?? html.match(/<astro-island[^>]*\sprops="([^"]*character[^"]*)"/);
  if (!m) return null;
  try {
    const json = m[1]!.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    return (decodeAstro((JSON.parse(json) as { character?: unknown }).character) as Record<string, unknown>) ?? null;
  } catch { return null; }
}

type Hit = { id?: string; name?: string; creatorUsername?: string; description?: string; tagIds?: number[]; avatar?: string; totalToken?: number; isNsfw?: boolean };

type PageData = Record<string, unknown>;
// Marinara's full-card/page recovery; CODEX, 2026-11-02. The PNG decoder stays at the app boundary.
let loaded = new WeakMap<SiteTransport, { id: string; at: number; file: Promise<CardFile> }>();
const pick = (...values: unknown[]) => values.map(text).find(Boolean) ?? "";
function pageCard(c: PageData, item: CardItem): Record<string, unknown> | null {
  const d = c.definition && typeof c.definition === "object" && !Array.isArray(c.definition) ? c.definition as PageData : {};
  const card = buildCard({
    name: pick(c.name, d.name, item.name), creator: pick(c.creatorUsername, item.creator), tags: item.tags,
    description: pick(c.personality, c.description, c.definition_character_description, d.description, d.personality),
    personality: pick(c.tavern_personality, c.definition_personality, c.definition, d.tavern_personality, d.personality),
    scenario: pick(c.scenario, c.definition_scenario, d.scenario),
    first_mes: pick(c.firstMessage, c.first_message, c.first_mes, c.definition_first_message, d.firstMessage, d.first_message, d.first_mes),
    mes_example: pick(c.exampleDialogs, c.example_dialogs, c.mes_example, c.definition_example_messages, d.exampleDialogs, d.example_dialogs, d.mes_example),
    creator_notes: plain(pick(c.creatorNotes, c.creator_notes, c.creatorNote, c.description_html, d.creator_notes)),
    alternate_greetings: list(c.alternateGreetings ?? c.alternate_greetings ?? d.alternateGreetings ?? d.alternate_greetings),
    system_prompt: pick(c.systemPrompt, c.system_prompt, d.systemPrompt, d.system_prompt),
    post_history_instructions: pick(c.postHistoryInstructions, c.post_history_instructions, d.postHistoryInstructions, d.post_history_instructions),
    character_version: pick(c.characterVersion, c.character_version, d.characterVersion, d.character_version),
    character_book: c.character_book ?? c.embedded_lorebook ?? d.character_book, extensions: c.extensions ?? d.extensions,
  });
  const detail = detailsFromCard(card);
  return [detail.description, detail.personality, detail.scenario, detail.firstMessage, detail.exampleDialogue, detail.systemPrompt, detail.postHistory, ...detail.alternateGreetings].some(Boolean) ? card : null;
}
async function loadCard(item: CardItem, t: SiteTransport): Promise<CardFile> {
  let failure: unknown;
  try {
    const payload = await askJson<{ status?: string; downloadUrl?: string; error?: string }>(t, "janny:download", {
      url: DOWNLOAD, method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ characterId: item.id }),
    });
    if (payload.status !== "ok" || typeof payload.downloadUrl !== "string") throw new SiteError(payload.error || "JannyAI did not provide the card.", "janny", "data");
    const r = await ask(t, "janny:download", { url: payload.downloadUrl, method: "GET", expect: "card", headers: { Accept: "image/png,application/octet-stream;q=0.9" } });
    if (!r.bytes?.length) throw new SiteError("JannyAI sent an empty card file.", "janny", "data");
    t.decodeCard?.(r.bytes);
    return { kind: "png", bytes: r.bytes };
  } catch (e) { if (e instanceof SiteError && e.kind === "rate") throw e; failure = e; }
  const path = `/characters/${item.id}_character-${slugify(item.name)}`;
  for (const base of ["https://api.jannyai.com", SITE]) {
    const c = parseJannyPage(await page(t, path, base));
    const card = c ? pageCard(c, item) : null;
    if (card) return { kind: "json", card, avatar: await askImage(t, "janny:avatar", item.thumb) };
  }
  throw failure;
}
function fullCard(item: CardItem, t: SiteTransport): Promise<CardFile> {
  const cached = loaded.get(t);
  if (cached?.id === item.id && Date.now() - cached.at < 60_000) return cached.file;
  const file = loadCard(item, t).catch((e) => { if (loaded.get(t)?.file === file) loaded.delete(t); throw e; });
  loaded.set(t, { id: item.id, at: Date.now(), file });
  return file;
}

export const janny: CardSource = {
  id: "janny", name: "JannyAI", site: SITE,
  sorts: [{ id: "newest", label: "Newest" }, { id: "oldest", label: "Oldest" }, { id: "tokens_desc", label: "Most Tokens" }, { id: "tokens_asc", label: "Fewest Tokens" }, { id: "relevant", label: "Relevance" }],
  defaultSort: "newest", nsfw: "toggle", pageSize: 80, mustHave: [], ascending: false, tokens: true, lowQuality: true,
  suggestedTags: Object.values(JANNY_TAGS),
  async search(q, t) {
    const filter = [`totalToken >= ${Math.max(29, q.filters.minTokens || 0)}`, `totalToken <= ${q.filters.maxTokens || 100000}`];
    if (!q.filters.lowQuality) filter.push("isLowQuality = false");
    if (!q.nsfw) filter.push("isNsfw = false");
    const known = q.include.map((x) => TAG_IDS.get(x.toLowerCase())).filter((x): x is number => x !== undefined);
    if (known.length) filter.push(known.map((id) => `tagIds = ${id}`).join(" AND "));
    const sort = SORTS[q.sort] ?? SORTS.newest!;
    const body = JSON.stringify({ queries: [{ indexUid: "janny-characters", q: q.text, facets: ["isNsfw", "tagIds"], filter, hitsPerPage: 80, page: q.page, ...(sort.length ? { sort } : {}) }] });
    pauses.check("janny:search");
    let r = await t.request({ url: SEARCH, method: "POST", headers: headers(await searchKey(t)), body, expect: "json" }).catch((e) => { throw new SiteError(String((e as Error)?.message ?? e), "janny", "http"); });
    // A 401/403 that is not a Cloudflare page means the search key changed: read it again once.
    if ((r.status === 401 || r.status === 403) && !r.cfMitigated && !/Just a moment|challenge-platform/.test(r.text ?? "")) {
      const k = await searchKey(t, true);
      r = await t.request({ url: SEARCH, method: "POST", headers: headers(k), body, expect: "json" });
    }
    const result = await askJsonFrom(r);
    const hits: Hit[] = Array.isArray(result?.hits) ? result.hits : [];
    const custom = q.include.filter((x) => !TAG_IDS.has(x.toLowerCase())).map((x) => x.toLowerCase());
    let items = hits.filter((h) => h.id).map((h): CardItem => ({
      source: "janny", id: h.id!, name: h.name || "Unnamed", creator: h.creatorUsername || "",
      tagline: plain(h.description).slice(0, 220), tags: (h.tagIds ?? []).map((id) => JANNY_TAGS[id] ?? `Tag ${id}`),
      thumb: h.avatar ? IMAGES + h.avatar.split("/").map(encodeURIComponent).join("/") : "", nsfw: Boolean(h.isNsfw),
      url: `${SITE}/characters/${h.id}_character-${slugify(h.name ?? "")}`, stats: { tokens: num(h.totalToken) },
    }));
    if (custom.length) items = items.filter((c) => custom.every((x) => c.tags.some((y) => y.toLowerCase() === x)));
    const totalPages = num(result?.totalPages) ?? 1;
    return { items: withoutExcluded(items, q.exclude), total: num(result?.totalHits) ?? null, hasMore: q.page < totalPages };

    async function askJsonFrom(res: typeof r) {
      // Re-use ask()'s refusal handling by replaying the answer through a one-shot transport.
      const once: SiteTransport = { request: async () => res };
      const out = await askJson<{ results?: { hits?: Hit[]; totalPages?: number; totalHits?: number }[] }>(once, "janny:search", { url: SEARCH, method: "POST" });
      return out.results?.[0];
    }
  },
  async details(item, t) {
    try {
      const file = await fullCard(item, t);
      const card = file.kind === "json" ? file.card : t.decodeCard?.(file.bytes);
      if (card) return detailsFromCard(card, item.tags);
    } catch (e) { if (e instanceof SiteError && e.kind === "rate") throw e; }
    return { ...detailsFromCard({}, item.tags), creatorNotes: item.tagline, partial: true };
  },
  download: fullCard,
};
