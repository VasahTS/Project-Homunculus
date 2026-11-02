// Pygmalion, public cards only (no login: adult cards need one, as in v1). Port of Homunculus v1 (VasahTS/Homunculus 0884338a):
// server `pygmalion*` routes and client `SOURCES.pygmalion`; answer shapes checked live on 2026-11-02. CLAUDE (T-011).
import type { CardItem, CardSource } from "../types.ts";
import { askImage, askJson, buildCard, list, num, plain, text } from "../build.ts";

const API = "https://server.pygmalion.chat/galatea.v1.PublicCharacterService";
const ASSETS = "https://assets.pygmalion.chat";
export const pygAvatarUrl = (src: unknown) => { const v = typeof src === "string" ? src : ""; return !v ? "" : v.startsWith("http") ? v : `${ASSETS}/${v.replace(/^\/+/, "")}`; };
const call = (method: string, message: unknown) => `${API}/${method}?${new URLSearchParams({ connect: "v1", encoding: "json", message: JSON.stringify(message) })}`;
type P = { id?: string; displayName?: string; description?: string; avatarUrl?: string; tags?: unknown; isSensitive?: boolean; downloads?: unknown; stars?: unknown; chatCount?: unknown; views?: unknown; personalityTokenCount?: unknown; owner?: { username?: string; displayName?: string }; personality?: Record<string, unknown> };

export const pygmalion: CardSource = {
  id: "pygmalion", name: "Pygmalion", site: "https://pygmalion.chat",
  sorts: [{ id: "downloads", label: "Downloads" }, { id: "stars", label: "Stars" }, { id: "views", label: "Views" }, { id: "approved_at", label: "Newest" }, { id: "token_count", label: "Tokens" }, { id: "display_name", label: "Name" }],
  defaultSort: "downloads", nsfw: "never", nsfwNote: "Pygmalion shows only safe cards without a login.",
  pageSize: 48, mustHave: [], ascending: true, tokens: false, lowQuality: false, suggestedTags: [],
  async search(q, t) {
    const message: Record<string, unknown> = { query: q.text.trim(), orderBy: q.sort || "downloads", orderDescending: !q.filters.ascending, pageSize: 48, page: Math.max(0, q.page - 1) };
    if (q.include.length) message.tagsNamesInclude = q.include;
    if (q.exclude.length) message.tagsNamesExclude = q.exclude;
    const data = await askJson<{ characters?: P[]; totalItems?: string | number }>(t, "pygmalion:search", { url: call("CharacterSearch", message), method: "GET" });
    const chars = Array.isArray(data.characters) ? data.characters : [];
    const total = num(data.totalItems) ?? null;
    return {
      total, hasMore: total ? q.page * 48 < total : chars.length >= 48,
      items: chars.filter((c) => c.id).map((c): CardItem => ({
        source: "pygmalion", id: c.id!, name: c.displayName || "Unnamed", creator: c.owner?.username || c.owner?.displayName || "",
        tagline: plain(c.description), tags: list(c.tags), thumb: pygAvatarUrl(c.avatarUrl), nsfw: Boolean(c.isSensitive),
        url: `https://pygmalion.chat/character/${c.id}`,
        stats: { downloads: num(c.downloads), stars: num(c.stars), chats: num(c.chatCount), tokens: num(c.personalityTokenCount) },
      })),
    };
  },
  async details(item, t) {
    const c = await character(item, t);
    const p = c.personality ?? {};
    return {
      description: text(p.persona), personality: "", scenario: "", firstMessage: text(p.greeting), alternateGreetings: list(p.alternateGreetings),
      exampleDialogue: text(p.mesExample), creatorNotes: plain(p.characterNotes || c.description), systemPrompt: text(p.systemPrompt),
      postHistory: text(p.postHistoryInstructions), hasLorebook: false, tags: list(c.tags).length ? list(c.tags) : item.tags,
    };
  },
  async download(item, t) {
    const c = await character(item, t);
    const p = c.personality ?? {};
    const avatar = await askImage(t, "pygmalion:avatar", pygAvatarUrl(c.avatarUrl) || item.thumb);
    return {
      kind: "json", avatar,
      card: buildCard({
        name: c.displayName || p.name || item.name, description: p.persona, first_mes: p.greeting, mes_example: p.mesExample,
        creator_notes: p.characterNotes || c.description, system_prompt: p.systemPrompt, post_history_instructions: p.postHistoryInstructions,
        alternate_greetings: p.alternateGreetings, tags: c.tags ?? item.tags, creator: item.creator,
      }),
    };
  },
};
async function character(item: CardItem, t: Parameters<CardSource["details"]>[1]): Promise<P> {
  const data = await askJson<{ character?: P }>(t, "pygmalion:details", { url: call("Character", { characterMetaId: item.id }), method: "GET" });
  return data.character ?? {};
}
