// BotBooru requests, card preservation, and refusal handling. CODEX, 2026-11-02.
import { beforeEach, expect, it } from "vitest";
import { cardSource, NO_FILTERS, pauses } from "../src/index.ts";
import { botbooruSearchUrl } from "../src/sources/botbooru.ts";
import type { CardQuery, SiteRequest, SiteResponse, SiteTransport } from "../src/types.ts";
// @ts-expect-error Verbatim JavaScript reference, deliberately not rewritten in TypeScript.
import { original } from "./fixtures/botsearcher-query.mjs";
const source = cardSource("botbooru");
const q = (over: Partial<CardQuery> = {}): CardQuery => ({ text: "", sort: "latest", page: 1, nsfw: false, include: [], exclude: [], filters: NO_FILTERS, ...over });
const ok = (data: unknown): SiteResponse => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text: JSON.stringify(data) });
const post = { id: 42, character_name: "Fixture Explorer", filename: "fixture.png", card_image_revision: 3, tags: [{ name: "sfw", category: "Meta" }, { name: "Story Teller", category: "Writer" }], token_count: 900, favorite_count: 3, downloads: 7, views: 12, tagline: "<b>A harmless fixture</b>" };
function site(fn: (r: SiteRequest) => SiteResponse) { const seen: SiteRequest[] = []; const t: SiteTransport = { async request(r) { seen.push(r); return fn(r); } }; return { t, seen }; }
beforeEach(() => pauses.clear());
it.each([q(), q({ text: "silver knight -male writer:someone Re:Zero", page: 3, sort: "downloads", include: ["long hair", "Fantasy"], exclude: ["Horror"], filters: { ...NO_FILTERS, minTokens: 100, maxTokens: 4000 } }), q({ nsfw: true, sort: "random" })])("matches BotSearcher's original query builder for supported filters", (query) => {
  const expected = original.buildSearchUrl({ query: query.text, cursor: { o: (query.page - 1) * 40 }, limit: 40, sort: query.sort, sfwOnly: !query.nsfw, filters: { tags: query.include, excludeTags: query.exclude, minTokens: query.filters.minTokens, maxTokens: query.filters.maxTokens } });
  expect(new URL(botbooruSearchUrl(query)).searchParams).toEqual(expected.searchParams);
});
it("keeps native name/OR syntax exact and does not fake account flags in the query", () => {
  const p = new URL(botbooruSearchUrl(q({ text: "name:Alice ~elf ~dwarf mage", nsfw: true }))).searchParams;
  expect(p.get("q")).toBe("name:Alice ~elf ~dwarf"); expect(p.get("qtext")).toBe("mage");
  expect(p.has("sfw_only")).toBe(false); expect(p.has("nsfw")).toBe(false); expect(p.has("show_nsfl")).toBe(false);
});
it("maps writer, rating, actual 320px preview and stats, then pages by the raw server count", async () => {
  const { t, seen } = site(() => ok({ posts: [post], total: 41 }));
  const result = await source.search(q(), t);
  expect(result.items[0]).toMatchObject({ source: "botbooru", id: "42", name: "Fixture Explorer", creator: "Story Teller", tagline: "A harmless fixture", nsfw: false, nsfl: false, thumb: "https://botbooru.com/images/preview/320/fixture.png?v=3", url: "https://botbooru.com/character/42", stats: { tokens: 900, downloads: 7, likes: 3, views: 12 } });
  expect(result.hasMore).toBe(true);
  expect((await source.search(q({ page: 2 }), t)).hasMore).toBe(false);
  expect(new URL(seen[1]!.url).searchParams.get("offset")).toBe("40");
});
it("does not render adult/unknown rows from an incorrectly filtered SFW response; NSFL is marked separately", async () => {
  const rows = [post, { ...post, id: 43, tags: [{ name: "horror", category: "NSFL" }] }, { ...post, id: 44, tags: [] }];
  const { t } = site(() => ok({ posts: rows, total: 3 }));
  expect((await source.search(q(), t)).items.map((i) => i.id)).toEqual(["42"]);
  const adult = await source.search(q({ nsfw: true }), t);
  expect(adult.items[1]).toMatchObject({ nsfw: true, nsfl: true });
  expect(adult.items[2]!.nsfw).toBe(true);
});
it("does not turn malformed catalog payloads into an empty successful search", async () => {
  const { t } = site(() => ok({ error: "no catalog" }));
  await expect(source.search(q(), t)).rejects.toThrow("did not return its catalog");
});
it("reads full V2 definition and embedded lore, and returns the original PNG unchanged", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const data = { name: "Fixture Explorer", description: "Full definition.", personality: "Patient.", scenario: "A library.", first_mes: "Welcome.", alternate_greetings: ["Come in."], mes_example: "Example.", creator_notes: "Notes.", character_book: { entries: [{ keys: ["library"], content: "Quiet." }] } };
  const { t, seen } = site((r) => r.expect === "card" ? { ...ok(null), bytes } : ok({ spec: "chara_card_v2", spec_version: "2.0", data }));
  const item = (await source.search(q(), site(() => ok({ posts: [post], total: 1 })).t)).items[0]!;
  expect(await source.details(item, t)).toMatchObject({ description: data.description, personality: data.personality, firstMessage: data.first_mes, alternateGreetings: data.alternate_greetings, hasLorebook: true });
  expect(await source.download(item, t)).toEqual({ kind: "png", bytes });
  expect(seen.map((r) => new URL(r.url).pathname)).toEqual(["/download/json/42", "/download/png/42"]);
  await expect(source.download({ ...item, id: "../auth/me" }, t)).rejects.toThrow("Invalid BotBooru card");
  expect(seen).toHaveLength(2);
});
it("honors Retry-After across search, tags and download without hammering the site", async () => {
  const { t, seen } = site(() => ({ ...ok({}), status: 429, retryAfterSecs: 90 }));
  await expect(source.search(q(), t)).rejects.toThrow("BotBooru asked this app to slow down");
  await expect(source.loadTags!(t)).rejects.toThrow("slow down");
  expect(seen).toHaveLength(1);
});
it("preserves Cloudflare refusals and rejects incomplete downloaded cards", async () => {
  const item = (await source.search(q(), site(() => ok({ posts: [post], total: 1 })).t)).items[0]!;
  await expect(source.download(item, site(() => ({ ...ok(null), status: 403, cfMitigated: true })).t)).rejects.toThrow("checking your browser");
  pauses.clear();
  await expect(source.download(item, site(() => ok(null)).t)).rejects.toThrow("empty card file");
  await expect(source.details(item, site(() => ok({ description: "only a blurb" })).t)).rejects.toThrow("did not return a V2 card");
});
