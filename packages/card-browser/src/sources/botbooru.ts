// BotBooru adapter. Search syntax/mapping adapted from SillyBunny-BotSearcher 2e175ff, AGPL-3.0.
// CODEX, 2026-11-02. Authentication stays in the site's isolated native browser session.
import type { CardItem, CardQuery, CardSource } from "../types.ts";
import { ask, askJson, detailsFromCard, list, num, plain, text } from "../build.ts";
import { SiteError } from "../pauses.ts";

const SITE = "https://botbooru.com";
const PAGE = 40;
const SORTS = ["latest", "curated", "downloads", "favorites", "views", "random"];
const PREFIXES = ["writer", "character", "artist", "copyright", "scenario", "language", "meta", "name"];
type Tag = { name?: string; category?: string };
type Post = { id?: number; filename?: string; card_image_revision?: number; character_name?: string; meta_name?: string; tagline?: string; creator_notes_excerpt?: string; description_excerpt?: string; tags?: Tag[]; token_count?: number; downloads?: number; favorite_count?: number; views?: number };
const tagTerm = (v: string) => v.trim().replace(/\s+/g, "_");
export function botbooruSearchUrl(q: CardQuery): string {
  const p = new URLSearchParams({ limit: String(PAGE), offset: String((Math.max(1, q.page) - 1) * PAGE), sort: SORTS.includes(q.sort) ? q.sort : "latest" });
  const exact: string[] = [], words: string[] = [];
  for (const part of q.text.slice(0, 128).trim().split(/\s+/).filter(Boolean)) {
    (part.startsWith("-") || part.startsWith("~") || PREFIXES.some((x) => part.startsWith(x + ":")) ? exact : words).push(part);
  }
  exact.push(...q.include.map(tagTerm).filter(Boolean), ...q.exclude.map(tagTerm).filter(Boolean).map((t) => "-" + t));
  if (exact.length) p.set("q", exact.join(" "));
  if (words.length) p.set("qtext", words.join(" "));
  if (!q.nsfw) p.set("sfw_only", "true");
  for (const [key, v] of [["min_tokens", q.filters.minTokens], ["max_tokens", q.filters.maxTokens]] as const) if (v !== undefined && Number.isFinite(v) && v > 0) p.set(key, String(Math.round(v)));
  return SITE + "/posts/?" + p;
}
function cardId(id: string): string {
  if (!/^\d{1,12}$/.test(id)) throw new SiteError("Invalid BotBooru card.", "botbooru", "data");
  return id;
}
export const botbooru: CardSource = {
  id: "botbooru", name: "BotBooru", site: SITE,
  sorts: SORTS.map((id) => ({ id, label: ({ latest: "Latest", curated: "Curated", downloads: "Most Downloaded", favorites: "Most Favorited", views: "Most Viewed", random: "Random" })[id]! })), defaultSort: "latest",
  nsfw: "toggle", pageSize: PAGE, mustHave: [], ascending: false, tokens: true, lowQuality: false, suggestedTags: [],
  async loadTags(t) {
    const tags = await askJson<Tag[]>(t, "botbooru:tags", { url: SITE + "/tags/", method: "GET" });
    return Array.isArray(tags) ? [...new Set(tags.map((x) => text(x?.name)).filter(Boolean))].slice(0, 10000) : [];
  },
  async search(q, t) {
    const d = await askJson<{ posts?: Post[]; total?: number }>(t, "botbooru:search", { url: botbooruSearchUrl(q), method: "GET" });
    if (!Array.isArray(d.posts)) throw new SiteError("BotBooru did not return its catalog.", "botbooru", "data");
    const items = d.posts.filter((p) => /^\d{1,12}$/.test(String(p.id))).map((p): CardItem => {
      const tags = Array.isArray(p.tags) ? p.tags.filter((x) => x && typeof x === "object") : [];
      const names = list(tags);
      const nsfl = tags.some((t) => /^(nsfl)$/i.test(t.category ?? "") || /^(nsfl)$/i.test(t.name ?? ""));
      const safe = names.some((n) => n.toLowerCase() === "sfw") && !nsfl;
      const filename = typeof p.filename === "string" && /^(?=.*[a-z0-9])[a-z0-9._-]{1,128}$/i.test(p.filename) ? p.filename : "";
      return { source: "botbooru", id: String(p.id), name: text(p.character_name) || text(p.meta_name) || "Unnamed",
        creator: text(tags.find((x) => text(x.category).toLowerCase() === "writer")?.name),
        tagline: plain(p.tagline || p.creator_notes_excerpt || p.description_excerpt).slice(0, 220), tags: names, nsfw: !safe, nsfl,
        thumb: filename ? SITE + "/images/preview/320/" + encodeURIComponent(filename) + "?v=" + (num(p.card_image_revision) ?? 1) : "",
        url: SITE + "/character/" + p.id, stats: { tokens: num(p.token_count), downloads: num(p.downloads), likes: num(p.favorite_count), views: num(p.views) } };
    });
    const total = num(d.total) ?? null;
    return { items: q.nsfw ? items : items.filter((i) => !i.nsfw), total, hasMore: d.posts.length > 0 && (total === null ? d.posts.length >= PAGE : q.page * PAGE < total) };
  },
  async details(item, t) {
    const card = await askJson<Record<string, unknown>>(t, "botbooru:details", { url: SITE + "/download/json/" + cardId(item.id), method: "GET" });
    if (card.spec !== "chara_card_v2" || !card.data || typeof card.data !== "object") throw new SiteError("BotBooru did not return a V2 card.", "botbooru", "data");
    return detailsFromCard(card, item.tags);
  },
  async download(item, t) {
    const r = await ask(t, "botbooru:download", { url: SITE + "/download/png/" + cardId(item.id), method: "GET", expect: "card" });
    if (!r.bytes?.length) throw new SiteError("BotBooru sent an empty card file.", "botbooru", "data");
    return { kind: "png", bytes: r.bytes };
  },
};
