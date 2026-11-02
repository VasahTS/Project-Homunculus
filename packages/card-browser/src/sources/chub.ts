// ChubAI. Port of Homunculus v1 (VasahTS/Homunculus 0884338a): server `chub*` routes and client `SOURCES.chub`,
// `CHUB_SORTS`, `CHUB_TAGS`, `MUST_HAVE` in public/scripts/classic-card-browser.js. CLAUDE, 2026-11-02 (T-008).
import type { CardFile, CardItem, CardSource, MustHave } from "../types.ts";
import { ask, askImage, askJson, buildCard, encodePath, list, num, plain, text } from "../build.ts";
import { SiteError } from "../pauses.ts";

const API = "https://api.chub.ai";
const AVATARS = "https://avatars.charhub.io/avatars";
const SORTS: Record<string, { label: string; sort: string; days: number; special?: string }> = {
  popular_all: { label: "Most Downloaded", sort: "download_count", days: 0 },
  popular_week: { label: "Hot This Week", sort: "download_count", days: 7 },
  popular_month: { label: "Hot This Month", sort: "download_count", days: 30 },
  rated_week: { label: "Top Rated (Week)", sort: "star_count", days: 7 },
  rated_all: { label: "Top Rated (All Time)", sort: "star_count", days: 0 },
  newest: { label: "Newest", sort: "id", days: 30 },
  updated: { label: "Recently Updated", sort: "last_activity_at", days: 0 },
  recent_hits: { label: "Recent Hits", sort: "default", days: 0, special: "newcomer" },
  random: { label: "Random", sort: "random", days: 0 },
};
const MUST: Record<MustHave, string> = { gallery: "require_images", lorebook: "require_lore", expressions: "require_expressions", greetings: "require_alternate_greetings" };
const TAGS: string[] = ['Action', 'Adventure', 'Alternate Greetings', 'Angst', 'Anime', 'Anime Game Characters', 'AnyPOV', 'Assistant', 'Books', 'Celebrity', 'Childhood Friend', 'Comedy', 'Cute', 'Cyberpunk', 'Dark Fantasy', 'Demon', 'Detective', 'Dominant', 'Drama', 'Elf', 'Enemies to Lovers', 'Fantasy', 'Female', 'Fluff', 'Furry', 'Game Characters', 'Historical', 'Horror', 'Human', 'Isekai', 'Knight', 'Kuudere', 'Lorebook', 'Magic', 'Male', 'Medieval', 'Military', 'Modern', 'Monster', 'Monster Girl', 'Movies & TV', 'Multiple Characters', 'Mystery', 'NSFW', 'OC', 'Original Character', 'Post-apocalyptic', 'Psychological', 'Robot', 'Roleplay', 'Romance', 'Royalty', 'RPG', 'Scenario', 'School', 'Sci-Fi', 'Simulator', 'Slice of Life', 'Submissive', 'Supernatural', 'Tomboy', 'Tsundere', 'Utility', 'Vampire', 'Villain', 'Western', 'Wholesome', 'Witch', 'Yandere'];

type Node = { fullPath?: string; name?: string; tagline?: string; topics?: unknown; starCount?: number; downloadCount?: number; nChats?: number; nTokens?: number; nsfw?: boolean; definition?: Record<string, unknown> };

export const chub: CardSource = {
  id: "chub", name: "ChubAI", site: "https://chub.ai",
  sorts: Object.entries(SORTS).map(([id, s]) => ({ id, label: s.label })), defaultSort: "popular_all",
  nsfw: "toggle", pageSize: 48, mustHave: ["lorebook", "greetings", "gallery", "expressions"], ascending: true, tokens: true, lowQuality: false,
  suggestedTags: TAGS,
  async search(q, t) {
    const preset = SORTS[q.sort] ?? SORTS.popular_all!;
    const p = new URLSearchParams({
      search: q.text.trim(), first: "48", page: String(q.page), namespace: "characters",
      nsfw: String(q.nsfw), nsfl: String(q.nsfw), nsfw_only: "false", chub: "true", count: "true", include_forks: "true", venus: "false",
      min_tokens: String(q.filters.minTokens ?? 50),
    });
    if (q.text.trim()) { if (preset.sort !== "default") p.set("sort", preset.sort); }
    else {
      p.set("sort", preset.sort);
      if (preset.days) p.set("max_days_ago", String(preset.days));
      if (preset.special) p.set("special_mode", preset.special);
    }
    if (q.filters.ascending) p.set("asc", "true");
    if (q.filters.maxTokens) p.set("max_tokens", String(q.filters.maxTokens));
    if (q.include.length) p.set("topics", q.include.join(","));
    if (q.exclude.length) p.set("excludetopics", q.exclude.join(","));
    for (const m of q.filters.must) p.set(MUST[m], "true");
    const raw = await askJson<{ data?: { nodes?: Node[]; count?: number; cursor?: unknown }; nodes?: Node[]; count?: number; cursor?: unknown }>(t, "chub:search", { url: `${API}/search?${p}`, method: "GET" });
    const data = raw.data ?? raw;
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    return {
      total: num(data.count) && num(data.count)! > 0 ? num(data.count)! : null,
      hasMore: Boolean(data.cursor) || nodes.length >= 48,
      items: nodes.filter((n) => n.fullPath).map((n): CardItem => ({
        source: "chub", id: n.fullPath!, name: n.name || "Unnamed", creator: n.fullPath!.split("/")[0] ?? "",
        tagline: plain(n.tagline), tags: list(n.topics), thumb: `${AVATARS}/${encodePath(n.fullPath!)}/avatar.webp`,
        nsfw: n.nsfw === true || list(n.topics).some((x) => x.toLowerCase() === "nsfw"),
        url: `https://chub.ai/characters/${n.fullPath}`,
        stats: { downloads: num(n.downloadCount) ?? num(n.starCount), chats: num(n.nChats), tokens: num(n.nTokens) },
      })),
    };
  },
  async details(item, t) {
    const def = await definition(item, t);
    return {
      description: text(def.personality), personality: text(def.tavern_personality), scenario: text(def.scenario),
      firstMessage: text(def.first_message), alternateGreetings: list(def.alternate_greetings), exampleDialogue: text(def.example_dialogs),
      creatorNotes: plain(def.description), systemPrompt: text(def.system_prompt), postHistory: text(def.post_history_instructions),
      hasLorebook: Boolean(def.embedded_lorebook), tags: item.tags,
    };
  },
  async download(item, t): Promise<CardFile> {
    // The ready-made card first; when it has none inside (or can't be had), build one from the definition.
    try {
      const r = await ask(t, "chub:download", { url: `${AVATARS}/${encodePath(item.id)}/chara_card_v2.png`, method: "GET", expect: "card" });
      if (r.bytes?.length) return { kind: "png", bytes: r.bytes };
    } catch (e) { if (e instanceof SiteError && e.kind === "rate") throw e; }
    const def = await definition(item, t);
    const avatar = await askImage(t, "chub:avatar", `${AVATARS}/${encodePath(item.id)}/avatar.webp`);
    return {
      kind: "json", avatar,
      card: buildCard({
        name: def.name || item.name, description: def.personality, personality: def.tavern_personality, scenario: def.scenario,
        first_mes: def.first_message, mes_example: def.example_dialogs, creator_notes: def.description, system_prompt: def.system_prompt,
        post_history_instructions: def.post_history_instructions, alternate_greetings: def.alternate_greetings, character_book: def.embedded_lorebook,
        tags: item.tags, creator: item.creator, extensions: def.extensions,
      }),
    };
  },
};

async function definition(item: CardItem, t: Parameters<CardSource["search"]>[1]): Promise<Record<string, unknown>> {
  const raw = await askJson<{ node?: Node; data?: { node?: Node } }>(t, "chub:details", { url: `${API}/api/characters/${encodePath(item.id)}?full=true`, method: "GET", headers: { "Cache-Control": "no-cache" } });
  const def = (raw.node ?? raw.data?.node)?.definition;
  if (!def) throw new SiteError("ChubAI did not return this character.", "chub", "data");
  return def;
}
