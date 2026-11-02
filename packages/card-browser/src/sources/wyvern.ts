// Wyvern. Port of Homunculus v1 (VasahTS/Homunculus 0884338a): server `wyvern*` routes and client `SOURCES.wyvern`;
// answer shapes checked live on 2026-11-02. CLAUDE (T-011).
import type { CardItem, CardSource } from "../types.ts";
import { askImage, askJson, buildCard, list, num, plain, text, withoutExcluded } from "../build.ts";

const API = "https://api.wyvern.chat";
/** Wyvern keeps pictures on Cloudflare Images; a bare id becomes a full address. */
export function wyvernAvatarUrl(src: unknown): string {
  const v = typeof src === "string" ? src : "";
  if (!v) return "";
  if (v.startsWith("http")) return v;
  return `https://imagedelivery.net/${v.replace(/^\/+/, "")}${v.includes("/public") ? "" : "/public"}`;
}
type W = Record<string, unknown> & { id?: string; creator?: { displayName?: string; username?: string }; statistics_record?: Record<string, unknown>; entity_statistics?: Record<string, unknown> };

export const wyvern: CardSource = {
  id: "wyvern", name: "Wyvern", site: "https://app.wyvern.chat",
  sorts: [{ id: "popular", label: "Popular" }, { id: "nsfw-popular", label: "Popular NSFW" }, { id: "recommended", label: "Recommended" }, { id: "created_at", label: "New" }, { id: "votes", label: "Most Likes" }, { id: "messages", label: "Most Messages" }],
  defaultSort: "popular", nsfw: "toggle", pageSize: 48, mustHave: [], ascending: false, tokens: false, lowQuality: false, suggestedTags: [],
  async search(q, t) {
    const p = new URLSearchParams({ limit: "48", page: String(q.page) });
    if (q.include.length) p.set("tags", q.include.join(","));
    if (q.text.trim()) p.set("q", q.text.trim());
    else { p.set("sort", q.sort || "popular"); p.set("order", "DESC"); }
    if (!q.nsfw && q.sort !== "nsfw-popular") p.set("rating", "none");
    const data = await askJson<{ results?: W[]; total?: number; hasMore?: boolean }>(t, "wyvern:search", { url: `${API}/exploreSearch/characters?${p}`, method: "GET" });
    const results = Array.isArray(data.results) ? data.results : [];
    const items = results.filter((c) => c.id).map((c): CardItem => {
      const s = c.statistics_record ?? c.entity_statistics ?? {};
      return {
        source: "wyvern", id: c.id!, name: text(c.name) || "Unnamed", creator: c.creator?.displayName || c.creator?.username || "",
        tagline: plain(c.tagline), tags: list(c.tags), thumb: wyvernAvatarUrl(c.avatar_url ?? c.avatar),
        nsfw: Boolean(c.rating && c.rating !== "none"), url: `https://app.wyvern.chat/characters/${c.id}`,
        stats: { likes: num(s.likes ?? s.total_likes ?? c.likes), chats: num(s.messages ?? s.total_messages), views: num(s.views ?? s.total_views), tokens: num(c.token_count) },
      };
    });
    return { items: withoutExcluded(items, q.exclude), total: num(data.total) ?? null, hasMore: Boolean(data.hasMore) || results.length >= 48 };
  },
  async details(item, t) {
    const c = await character(item, t);
    const book = (c.character_book ?? c.embedded_lorebook) as { entries?: unknown[] } | undefined;
    return {
      description: text(c.description), personality: text(c.personality), scenario: text(c.scenario), firstMessage: text(c.first_mes),
      alternateGreetings: list(c.alternate_greetings), exampleDialogue: text(c.mes_example), creatorNotes: plain(c.creator_notes),
      systemPrompt: text(c.system_prompt ?? c.systemPrompt), postHistory: text(c.post_history_instructions ?? c.postHistoryInstructions),
      hasLorebook: Array.isArray(book?.entries) ? book!.entries!.length > 0 : Array.isArray(c.lorebooks) && (c.lorebooks as unknown[]).length > 0,
      tags: list(c.tags).length ? list(c.tags) : item.tags,
    };
  },
  async download(item, t) {
    const c = await character(item, t);
    const avatar = await askImage(t, "wyvern:avatar", wyvernAvatarUrl(c.avatar_url ?? c.avatar) || item.thumb);
    return {
      kind: "json", avatar,
      card: buildCard({
        name: c.name || item.name, description: c.description, personality: c.personality, scenario: c.scenario, first_mes: c.first_mes,
        mes_example: c.mes_example, creator_notes: c.creator_notes, system_prompt: c.system_prompt ?? c.systemPrompt,
        post_history_instructions: c.post_history_instructions ?? c.postHistoryInstructions, alternate_greetings: c.alternate_greetings,
        character_book: c.character_book ?? c.embedded_lorebook, tags: c.tags, creator: item.creator, character_version: c.character_version,
      }),
    };
  },
};
const character = (item: CardItem, t: Parameters<CardSource["details"]>[1]) =>
  askJson<W>(t, "wyvern:details", { url: `${API}/characters/${encodeURIComponent(item.id)}`, method: "GET" });
