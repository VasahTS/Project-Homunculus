// DataCat (adult cards only). Port of Homunculus v1 (VasahTS/Homunculus 0884338a): server `datacat*` routes (session token,
// recent-public, fresh, faceted tags, building a card from the character page) and client `SOURCES.datacat`; answer shapes
// checked live on 2026-11-02. Daniel chose to include it knowing its cards are extracted from JanitorAI (D-081); a card whose
// creator turned downloads off on DataCat is not added. CLAUDE (T-011b).
import type { CardItem, CardSource, SiteTransport } from "../types.ts";
import { askImage, askJson, buildCard, list, num, plain, text, withoutExcluded } from "../build.ts";
import { SiteError } from "../pauses.ts";

const API = "https://datacat.run";
/** DataCat answers at most 50 a page (asked for 80 on 2026-11-02, got 50), so pages are 50 apart. */
const PAGE = 50;
const IMAGES = "https://ella.janitorai.com/bot-avatars/";
const HEADERS = { Origin: API, Referer: `${API}/` };
export const datacatAvatarUrl = (src: unknown) => { const v = typeof src === "string" ? src : ""; return !v ? "" : v.startsWith("http") ? v : IMAGES + v.replace(/^\/+/, ""); };
/** "👩‍🦰 Female" → "Female": DataCat puts an emoji before some tag names. */
const tagName = (t: unknown): string => {
  const n = typeof t === "string" ? t : typeof t === "object" && t ? String((t as { name?: unknown }).name ?? "") : "";
  return n.replace(/^[^\p{L}\p{N}#]+/u, "").trim();
};

let session = "";
/** Only for tests. */
export const resetDatacat = () => { session = ""; tags = null; };
async function token(t: SiteTransport, force = false): Promise<string> {
  if (session && !force) return session;
  const r = await askJson<{ success?: boolean; sessionToken?: string }>(t, "datacat", {
    url: `${API}/api/liberator/identify`, method: "POST", headers: { "Content-Type": "application/json", ...HEADERS }, body: JSON.stringify({ deviceToken: crypto.randomUUID() }),
  });
  if (!r.success || !r.sessionToken) throw new SiteError("DataCat did not open a session.", "datacat", "data");
  return (session = r.sessionToken);
}
/** A DataCat GET with the session; a 401 means the session ended: one new session, one retry. */
async function get<T>(t: SiteTransport, path: string, key = "datacat"): Promise<T> {
  const call = async (force: boolean) => askJson<T>(t, key, { url: API + path, method: "GET", headers: { ...HEADERS, "X-Session-Token": await token(t, force) } });
  try { return await call(false); }
  catch (e) { if (e instanceof SiteError && e.status === 401) return call(true); throw e; }
}

let tags: { at: number; byName: Map<string, number>; names: string[] } | null = null;
/** The 200 most used tags with their ids (search filters by id), cached for an hour. */
async function tagList(t: SiteTransport) {
  if (tags && Date.now() - tags.at < 3_600_000) return tags;
  const d = await get<{ tags?: { id?: number; name?: string }[] }>(t, `/api/tags/faceted?${new URLSearchParams({ mode: "recent", minTotalTokens: "889", limit: "200" })}`);
  const rows = (d.tags ?? []).filter((x) => Number.isInteger(x.id) && tagName(x.name));
  tags = { at: Date.now(), byName: new Map(rows.map((x) => [tagName(x.name).toLowerCase(), x.id!])), names: rows.map((x) => tagName(x.name)) };
  return tags;
}

type Row = { characterId?: string; character_id?: string; id?: string; name?: string; chatName?: string; chat_name?: string; creatorName?: string; creator_name?: string; description?: string;
  avatar?: string; avatarDisplayUrl?: string; avatarVariantUrls?: { thumb?: string }; totalTokens?: number; total_tokens?: number; stats?: { chat?: number }; tags?: unknown; custom_tags?: unknown };
const rowId = (r: Row) => r.characterId || r.character_id || r.id || "";

export const datacat: CardSource = {
  id: "datacat", name: "DataCat", site: API,
  sorts: [{ id: "relevance", label: "Relevance" }, { id: "fresh", label: "Fresh (Last 24h)" }], defaultSort: "relevance",
  nsfw: "always", nsfwNote: "DataCat lists adult cards only.",
  pageSize: PAGE, mustHave: [], ascending: false, tokens: true, lowQuality: false, suggestedTags: [],
  async loadTags(t) { return (await tagList(t)).names; },
  async search(q, t) {
    const known = await tagList(t).catch(() => null);
    const ids = (names: string[]) => names.map((n) => known?.byName.get(n.toLowerCase())).filter((x): x is number => x !== undefined);
    const tagIds = ids(q.include), blocked = ids(q.exclude);
    const fresh = q.sort === "fresh" && !tagIds.length && !blocked.length && !q.filters.minTokens && !q.filters.maxTokens && !q.text.trim();
    let rows: Row[]; let total: number | null; let hasMore: boolean;
    if (fresh) {
      const d = await get<{ windows?: { last24h?: Row[] | { characters?: Row[] } }; last24h?: Row[] | { characters?: Row[] } }>(t, `/api/characters/fresh?${new URLSearchParams({ summary: "1", sortBy: "score", limit24: "80", limitWeek: "0" })}`, "datacat:search");
      const last = d.windows?.last24h ?? d.last24h;
      rows = Array.isArray(last) ? last : Array.isArray(last?.characters) ? last.characters : [];
      total = rows.length; hasMore = false;
    } else {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String((q.page - 1) * PAGE), summary: "1", minTotalTokens: String(q.filters.minTokens ?? 889) });
      if (tagIds.length) p.set("tagIds", tagIds.join(","));
      if (blocked.length) p.set("blockedTagIds", blocked.join(","));
      if (q.filters.maxTokens) p.set("maxTotalTokens", String(q.filters.maxTokens));
      if (q.text.trim()) p.set("search", q.text.trim());
      const d = await get<{ characters?: Row[]; totalCount?: number; hasMore?: boolean }>(t, `/api/characters/recent-public?${p}`, "datacat:search");
      rows = Array.isArray(d.characters) ? d.characters : [];
      total = num(d.totalCount) ?? null;
      hasMore = d.hasMore ?? (total ? q.page * PAGE < total : rows.length >= PAGE);
    }
    const items = rows.filter(rowId).map((r): CardItem => ({
      source: "datacat", id: rowId(r), name: text(r.name) || text(r.chatName) || text(r.chat_name) || "Unnamed", creator: r.creatorName || r.creator_name || "",
      tagline: plain(r.description).slice(0, 220), tags: [...list(r.tags).map(tagName), ...list(r.custom_tags)].filter(Boolean),
      thumb: datacatAvatarUrl(r.avatarVariantUrls?.thumb || r.avatarDisplayUrl || r.avatar), nsfw: true,
      url: `${API}/characters/${rowId(r)}`, stats: { chats: num(r.stats?.chat), tokens: num(r.totalTokens ?? r.total_tokens) },
    }));
    // custom tags DataCat has no id for are matched here
    const unknown = q.include.filter((n) => !known?.byName.has(n.toLowerCase())).map((n) => n.toLowerCase());
    const shown = unknown.length ? items.filter((c) => unknown.every((n) => c.tags.some((x) => x.toLowerCase() === n))) : items;
    return { items: withoutExcluded(shown, q.exclude), total, hasMore };
  },
  async details(item, t) {
    const c = await character(item, t);
    const greetings = list(c.alternate_greetings ?? c.alternateGreetings).filter((g) => g !== text(c.first_message));
    return {
      description: text(c.personality), personality: "", scenario: text(c.scenario), firstMessage: text(c.first_message ?? c.firstMessage),
      alternateGreetings: greetings, exampleDialogue: text(c.mes_example ?? c.example_dialogs), creatorNotes: plain(c.description),
      systemPrompt: "", postHistory: "", hasLorebook: false,
      tags: [...list(c.tags).map(tagName), ...list(c.custom_tags)].filter(Boolean),
    };
  },
  async download(item, t) {
    const c = await character(item, t);
    if (c.downloadsDisabled || c.downloads_disabled || c.deletedByCreatorPolicy || c.deleted_by_creator_policy) {
      throw new SiteError("The creator turned off downloads of this card on DataCat.", "datacat", "data");
    }
    const first = text(c.first_message ?? c.firstMessage);
    const avatar = await askImage(t, "datacat:avatar", datacatAvatarUrl(c.avatarDisplayUrl ?? c.avatar) || item.thumb, HEADERS);
    return {
      kind: "json", avatar,
      card: buildCard({
        name: text(c.name) || text(c.chat_name) || item.name, description: c.personality, scenario: c.scenario, first_mes: first,
        mes_example: c.mes_example ?? c.example_dialogs, creator_notes: plain(c.description),
        alternate_greetings: list(c.alternate_greetings ?? c.alternateGreetings).filter((g) => g !== first),
        tags: [...list(c.tags).map(tagName), ...list(c.custom_tags)].filter(Boolean), creator: text(c.creator_name) || item.creator,
        extensions: { datacat: { id: item.id } },
      }),
    };
  },
};
async function character(item: CardItem, t: SiteTransport): Promise<Record<string, unknown>> {
  const d = await get<{ character?: Record<string, unknown> }>(t, `/api/characters/${encodeURIComponent(item.id)}`, "datacat:details");
  if (!d.character) throw new SiteError("DataCat did not return this character.", "datacat", "data");
  return d.character;
}
