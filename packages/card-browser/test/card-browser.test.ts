// Card Browser package: requests built per site, answers mapped, pauses, built cards. No network. CLAUDE, 2026-11-02.
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildCard, cardSource, CARD_SOURCES, NO_FILTERS, parseJannyPage, pauses, Pauses, plain, refusalKind, resetDatacat, resetJannyKey, SiteError, wyvernAvatarUrl } from "../src/index.ts";
import type { CardQuery, SiteRequest, SiteResponse, SiteTransport } from "../src/index.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const json = (text: string, status = 200): SiteResponse => ({ status, finalUrl: "", contentType: "application/json", cfMitigated: false, text });
const query = (over: Partial<CardQuery> = {}): CardQuery => ({ text: "", sort: "", page: 1, nsfw: false, include: [], exclude: [], filters: NO_FILTERS, ...over });
/** A fake site: answers by the first route whose test matches the address; records every request. */
function sites(routes: [RegExp, (r: SiteRequest) => SiteResponse | Promise<SiteResponse>][]) {
  const seen: SiteRequest[] = [];
  const t: SiteTransport = { async request(r) { seen.push(r); const hit = routes.find(([re]) => re.test(r.url)); if (!hit) throw new Error(`no route for ${r.url}`); return hit[1](r); } };
  return { t, seen };
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3]);
beforeEach(() => { pauses.clear(); resetJannyKey(); resetDatacat(); });

describe("sources", () => {
  it("lists the five sites in the picker's order, each with a default sort it offers", () => {
    expect(CARD_SOURCES.map((s) => s.name)).toEqual(["ChubAI", "JannyAI", "Wyvern", "Pygmalion", "DataCat"]);
    for (const s of CARD_SOURCES) expect(s.sorts.map((x) => x.id)).toContain(s.defaultSort);
    expect(cardSource("nope").id).toBe("chub");
  });
});

describe("ChubAI", () => {
  const chub = cardSource("chub");
  const page = { data: { count: 2, nodes: [
    { fullPath: "anna/elf-queen", name: "Elf Queen", tagline: "<b>Rules</b> the woods", topics: ["Fantasy", "Elf"], starCount: 120, nChats: 9, nTokens: 1800, nsfw: false },
    { fullPath: "bo/night", name: "Night", tagline: "", topics: ["NSFW"], nTokens: 900 },
  ] } };
  it("builds the search address like v1: sort preset, days, tags, must-haves, tokens, NSFW", async () => {
    const { t, seen } = sites([[/api\.chub\.ai\/search/, () => json(JSON.stringify(page))]]);
    await chub.search(query({ sort: "popular_week", include: ["Fantasy"], exclude: ["Horror"], filters: { must: ["lorebook", "greetings"], ascending: true, minTokens: 100, maxTokens: 4000, lowQuality: false } }), t);
    const u = new URL(seen[0]!.url);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ sort: "download_count", max_days_ago: "7", topics: "Fantasy", excludetopics: "Horror", require_lore: "true", require_alternate_greetings: "true", asc: "true", min_tokens: "100", max_tokens: "4000", nsfw: "false", nsfl: "false", first: "48", page: "1" });
    await chub.search(query({ text: "elf", sort: "popular_week", nsfw: true }), t);
    const v = new URL(seen[1]!.url).searchParams;
    expect([v.get("search"), v.get("sort"), v.get("max_days_ago"), v.get("nsfw")]).toEqual(["elf", "download_count", null, "true"]);
  });
  it("maps a search page into cards", async () => {
    const { t } = sites([[/search/, () => json(JSON.stringify(page))]]);
    const r = await chub.search(query(), t);
    expect(r.total).toBe(2);
    expect(r.items[0]).toMatchObject({ id: "anna/elf-queen", name: "Elf Queen", creator: "anna", tagline: "Rules the woods", tags: ["Fantasy", "Elf"], nsfw: false, url: "https://chub.ai/characters/anna/elf-queen", thumb: "https://avatars.charhub.io/avatars/anna/elf-queen/avatar.webp", stats: { downloads: 120, chats: 9, tokens: 1800 } });
    expect(r.items[1]!.nsfw).toBe(true);
  });
  const def = { node: { definition: { name: "Elf Queen", personality: "Proud.", tavern_personality: "", scenario: "A court.", first_message: "Kneel.", alternate_greetings: ["Rise."], example_dialogs: "", description: "<p>Made with <i>love</i></p>", system_prompt: "", post_history_instructions: "", embedded_lorebook: { entries: [{ keys: ["court"], content: "Old." }] } } } };
  it("reads the definition into details", async () => {
    const { t } = sites([[/api\/characters/, () => json(JSON.stringify(def))]]);
    const item = (await chub.search(query(), sites([[/search/, () => json(JSON.stringify(page))]]).t)).items[0]!;
    expect(await chub.details(item, t)).toMatchObject({ description: "Proud.", scenario: "A court.", firstMessage: "Kneel.", alternateGreetings: ["Rise."], creatorNotes: "Made with love", hasLorebook: true });
  });
  it("downloads the ready card PNG, or builds one from the definition when there is none", async () => {
    const item = (await chub.search(query(), sites([[/search/, () => json(JSON.stringify(page))]]).t)).items[0]!;
    const ready = sites([[/chara_card_v2\.png/, () => ({ ...json(""), bytes: PNG, mime: "image/png" })]]);
    expect(await chub.download(item, ready.t)).toEqual({ kind: "png", bytes: PNG });
    expect(ready.seen[0]!.expect).toBe("card");
    const built = sites([
      [/chara_card_v2\.png/, () => { throw new Error("The card site did not return a PNG with a chara or ccv3 text chunk."); }],
      [/api\/characters/, () => json(JSON.stringify(def))],
      [/avatar\.webp/, () => ({ ...json(""), bytes: PNG, mime: "image/webp" })],
    ]);
    const f = await chub.download(item, built.t);
    expect(f.kind).toBe("json");
    if (f.kind !== "json") return;
    expect(f.card).toMatchObject({ spec: "chara_card_v2", data: { name: "Elf Queen", description: "Proud.", first_mes: "Kneel.", alternate_greetings: ["Rise."], creator: "anna", tags: ["Fantasy", "Elf"] } });
    expect((f.card.data as { character_book?: unknown }).character_book).toBeTruthy();
    expect(f.avatar?.mime).toBe("image/webp");
  });
});

describe("JannyAI", () => {
  const janny = cardSource("janny");
  const KEY = "a".repeat(64);
  const hits = { results: [{ totalHits: 1, totalPages: 3, hits: [{ id: "abc-1", name: "Mira Vale", creatorUsername: "zed", description: "<p>A thief</p>", tagIds: [2, 53], avatar: "x/y.webp", totalToken: 1500, isNsfw: false }] }] };
  const bundle: [RegExp, (r: SiteRequest) => SiteResponse][] = [
    [/jannyai\.com\/characters\/search$/, () => json('<script src="/_astro/client-config.Ab12.js"></script>')],
    [/_astro\/client-config/, () => json(`export const k="${KEY}";`)],
  ];
  it("reads the search key from the site's bundle and sends v1's Meilisearch query", async () => {
    const { t, seen } = sites([...bundle, [/multi-search/, () => json(JSON.stringify(hits))]]);
    const r = await janny.search(query({ text: "thief", sort: "tokens_desc", include: ["Female", "Pirates"], filters: { must: [], ascending: false, minTokens: 500, lowQuality: false } }), t);
    const call = seen.find((x) => x.url.includes("multi-search"))!;
    expect(call.method).toBe("POST");
    expect(call.headers?.Authorization).toBe(`Bearer ${KEY}`);
    const q = JSON.parse(call.body!).queries[0];
    expect(q).toMatchObject({ indexUid: "janny-characters", q: "thief", sort: ["totalToken:desc"], hitsPerPage: 80, page: 1 });
    expect(q.filter).toEqual(["totalToken >= 500", "totalToken <= 100000", "isLowQuality = false", "isNsfw = false", "tagIds = 2"]);
    // "Pirates" is not a JannyAI tag id, so it filters the results here: Mira has no such tag
    expect(r.items).toEqual([]);
    expect(r.hasMore).toBe(true);
  });
  it("maps hits and falls back to the known key when the bundle can't be read", async () => {
    const { t, seen } = sites([[/jannyai\.com\/characters/, () => json("", 403)], [/multi-search/, () => json(JSON.stringify(hits))]]);
    const r = await janny.search(query(), t);
    expect(seen.find((x) => x.url.includes("multi-search"))!.headers?.Authorization).toMatch(/^Bearer 88a6/);
    expect(r.items[0]).toMatchObject({ id: "abc-1", name: "Mira Vale", creator: "zed", tagline: "A thief", tags: ["Female", "Fantasy"], thumb: "https://image.jannyai.com/bot-avatars/x/y.webp", url: "https://jannyai.com/characters/abc-1_character-mira-vale", stats: { tokens: 1500 } });
  });
  it("reads the key again once when the search answers 401 without a Cloudflare page", async () => {
    let n = 0;
    const { t } = sites([...bundle, [/multi-search/, () => (++n === 1 ? json("{}", 401) : json(JSON.stringify(hits)))]]);
    expect((await janny.search(query(), t)).items).toHaveLength(1);
    expect(n).toBe(2);
  });
  it("a Cloudflare page pauses the search with v1's message", async () => {
    const { t, seen } = sites([...bundle, [/multi-search/, () => ({ ...json("<title>Just a moment...</title>", 403), cfMitigated: true })]]);
    const e = await janny.search(query(), t).catch((x) => x);
    expect(e).toBeInstanceOf(SiteError);
    expect(e.paused).toBe(true);
    expect(e.message).toMatch(/JannyAI is blocking requests from this app right now \(Cloudflare\)\. Try again in about 5 min\./);
    const before = seen.length;
    await expect(janny.search(query(), t)).rejects.toThrow(/Cloudflare/);
    expect(seen.length).toBe(before); // paused: nothing was asked
  });
  it("reads details from the page's astro-island props", () => {
    const props = JSON.stringify({ character: [0, { personality: [0, "Quick hands."], firstMessage: [0, "Hey."], alternateGreetings: [1, [[0, "Yo."]]] }] }).replace(/"/g, "&quot;");
    const c = parseJannyPage(`<astro-island component-export="CharacterButtons" props="${props}"></astro-island>`);
    expect(c).toEqual({ personality: "Quick hands.", firstMessage: "Hey.", alternateGreetings: ["Yo."] });
    expect(parseJannyPage("<title>Just a moment...</title>")).toBeNull();
  });
  it("downloads through the download API and its file link", async () => {
    const { t, seen } = sites([
      [/api\/v1\/download/, () => json(JSON.stringify({ status: "ok", downloadUrl: "https://files.example-storage.com/c.png" }))],
      [/example-storage/, () => ({ ...json(""), bytes: PNG, mime: "image/png" })],
    ]);
    const item = { source: "janny", id: "abc-1", name: "Mira", creator: "", tagline: "", tags: [], thumb: "", nsfw: false, url: "", stats: {} } as const;
    expect(await janny.download({ ...item, tags: [] }, t)).toEqual({ kind: "png", bytes: PNG });
    expect(JSON.parse(seen[0]!.body!)).toEqual({ characterId: "abc-1" });
    expect(seen[1]!.expect).toBe("card");
  });
});

describe("Wyvern (recorded 2026-11-02)", () => {
  const wyvern = cardSource("wyvern");
  it("asks like v1 and maps the recorded answer", async () => {
    const { t, seen } = sites([[/exploreSearch/, () => json(fixture("wyvern-search.json"))]]);
    const r = await wyvern.search(query({ include: ["Fantasy"] }), t);
    expect(Object.fromEntries(new URL(seen[0]!.url).searchParams)).toEqual({ limit: "48", page: "1", tags: "Fantasy", sort: "popular", order: "DESC", rating: "none" });
    expect(r.items.length).toBe(2);
    expect(r.items[0]).toMatchObject({ source: "wyvern", name: "Clara Valentine", url: expect.stringMatching(/^https:\/\/app\.wyvern\.chat\/characters\//), thumb: expect.stringMatching(/^https:\/\/imagedelivery\.net\//) });
    await wyvern.search(query({ text: "clara", sort: "nsfw-popular" }), t);
    const v = new URL(seen[1]!.url).searchParams;
    expect([v.get("q"), v.get("sort"), v.get("rating")]).toEqual(["clara", null, null]);
  });
  it("details and a built card from the recorded character", async () => {
    const item = (await wyvern.search(query(), sites([[/exploreSearch/, () => json(fixture("wyvern-search.json"))]]).t)).items[0]!;
    const { t } = sites([[/\/characters\//, () => json(fixture("wyvern-character.json"))], [/imagedelivery/, () => ({ ...json(""), bytes: PNG, mime: "image/png" })]]);
    const d = await wyvern.details(item, t);
    expect(d.firstMessage.length).toBeGreaterThan(0);
    expect(d.tags).toContain("Fantasy");
    const f = await wyvern.download(item, t);
    expect(f.kind === "json" && f.card.data).toMatchObject({ name: "Clara Valentine", tags: expect.arrayContaining(["Fantasy"]) });
    expect(f.kind === "json" && f.avatar?.mime).toBe("image/png");
  });
  it("turns a bare picture id into an address", () => {
    expect(wyvernAvatarUrl("abc/def")).toBe("https://imagedelivery.net/abc/def/public");
    expect(wyvernAvatarUrl("https://x.wyvern.chat/a.png")).toBe("https://x.wyvern.chat/a.png");
  });
});

describe("Pygmalion (recorded 2026-11-02)", () => {
  const pyg = cardSource("pygmalion");
  it("sends the Connect message like v1 and maps the answer; NSFW is never on", async () => {
    const { t, seen } = sites([[/CharacterSearch/, () => json(fixture("pygmalion-search.json"))]]);
    const r = await pyg.search(query({ sort: "stars", page: 2, include: ["Fantasy"] }), t);
    const msg = JSON.parse(new URL(seen[0]!.url).searchParams.get("message")!);
    expect(msg).toEqual({ query: "", orderBy: "stars", orderDescending: true, pageSize: 48, page: 1, tagsNamesInclude: ["Fantasy"] });
    expect(pyg.nsfw).toBe("never");
    expect(r.total).toBeGreaterThan(1000);
    expect(r.items[0]).toMatchObject({ name: "World RPG", url: expect.stringMatching(/^https:\/\/pygmalion\.chat\/character\//), thumb: expect.stringMatching(/^https:\/\/assets\.pygmalion\.chat\//) });
  });
  it("builds a card from the recorded character", async () => {
    const item = (await pyg.search(query(), sites([[/CharacterSearch/, () => json(fixture("pygmalion-search.json"))]]).t)).items[0]!;
    const { t } = sites([[/\/Character\?/, () => json(fixture("pygmalion-character.json"))], [/assets\.pygmalion/, () => ({ ...json(""), bytes: PNG, mime: "image/png" })]]);
    const f = await pyg.download(item, t);
    expect(f.kind === "json" && (f.card.data as { first_mes: string }).first_mes.length).toBeGreaterThan(0);
    expect((await pyg.details(item, t)).description.length).toBeGreaterThan(0);
  });
});

describe("DataCat (shapes checked live 2026-11-02; synthetic text)", () => {
  const dc = cardSource("datacat");
  const tagsAnswer = { success: true, tags: [{ id: 3, name: "Female", count: 9 }, { id: 40, name: "🧝 Elf", count: 5 }] };
  const row = { characterId: "c-1", name: "Mira Vale", chatName: "Narrator", creatorName: "zed", description: "<p>A thief</p>", avatarVariantUrls: { thumb: "https://media.datacat.run/v/thumb.webp" }, isNsfw: true, stats: { chat: 12 }, totalTokens: 3400 };
  const recent = { success: true, totalCount: 200, hasMore: true, characters: [row] };
  const char = (over: Record<string, unknown> = {}) => ({ success: true, character: { character_id: "c-1", name: "Mira Vale", personality: "Quick hands.", scenario: "A port town.", first_message: "Hey.", alternate_greetings: ["Hey.", "Yo."], description: "Made with <b>care</b>", tags: [{ id: 2, name: "👩‍🦰 Female" }], custom_tags: ["thief"], creator_name: "zed", avatarDisplayUrl: "https://media.datacat.run/v/card.webp", downloadsDisabled: false, deletedByCreatorPolicy: false, ...over } });
  const routes = (charOver: Record<string, unknown> = {}): [RegExp, (r: SiteRequest) => SiteResponse][] => [
    [/liberator\/identify/, () => json(JSON.stringify({ success: true, sessionToken: "s-1" }))],
    [/tags\/faceted/, () => json(JSON.stringify(tagsAnswer))],
    [/recent-public/, () => json(JSON.stringify(recent))],
    [/characters\/fresh/, () => json(JSON.stringify({ windows: { last24h: [row] } }))],
    [/api\/characters\/c-1/, () => json(JSON.stringify(char(charOver)))],
    [/media\.datacat/, () => ({ ...json(""), bytes: PNG, mime: "image/webp" })],
  ];
  it("is adult only, opens a session, and searches by tag ids like v1", async () => {
    expect(dc.nsfw).toBe("always");
    const { t, seen } = sites(routes());
    const r = await dc.search(query({ text: "thief", include: ["Elf", "pirate"], exclude: ["Female"], filters: { must: [], ascending: false, maxTokens: 5000, lowQuality: false } }), t);
    const call = seen.find((x) => x.url.includes("recent-public"))!;
    expect(call.headers).toMatchObject({ "X-Session-Token": "s-1", Origin: "https://datacat.run" });
    expect(Object.fromEntries(new URL(call.url).searchParams)).toEqual({ limit: "50", offset: "0", summary: "1", minTotalTokens: "889", tagIds: "40", blockedTagIds: "3", maxTotalTokens: "5000", search: "thief" });
    // "pirate" has no DataCat id: matched against the cards' tags here, and Mira has none
    expect(r.items).toEqual([]);
    expect(await dc.loadTags!(t)).toEqual(["Female", "Elf"]);
  });
  it("maps rows; Fresh uses the 24 h list only without search, tags or tokens", async () => {
    const { t, seen } = sites(routes());
    const r = await dc.search(query(), t);
    expect(r).toMatchObject({ total: 200, hasMore: true });
    expect(r.items[0]).toMatchObject({ id: "c-1", name: "Mira Vale", creator: "zed", tagline: "A thief", thumb: "https://media.datacat.run/v/thumb.webp", nsfw: true, url: "https://datacat.run/characters/c-1", stats: { chats: 12, tokens: 3400 } });
    await dc.search(query({ sort: "fresh" }), t);
    expect(seen.some((x) => x.url.includes("characters/fresh"))).toBe(true);
    const before = seen.filter((x) => x.url.includes("fresh")).length;
    await dc.search(query({ sort: "fresh", text: "mira" }), t);
    expect(seen.filter((x) => x.url.includes("fresh")).length).toBe(before);
  });
  it("opens a new session once when DataCat answers 401", async () => {
    let n = 0;
    const r = routes();
    r.splice(2, 1, [/recent-public/, () => (++n === 1 ? json("{}", 401) : json(JSON.stringify(recent)))]);
    const { t, seen } = sites(r);
    expect((await dc.search(query(), t)).items).toHaveLength(1);
    expect(seen.filter((x) => x.url.includes("identify"))).toHaveLength(2);
  });
  it("details and a built card from the character page (tags cleaned, greetings without the first)", async () => {
    const { t } = sites(routes());
    const item = (await dc.search(query(), t)).items[0]!;
    expect(await dc.details(item, t)).toMatchObject({ description: "Quick hands.", scenario: "A port town.", firstMessage: "Hey.", alternateGreetings: ["Yo."], creatorNotes: "Made with care", tags: ["Female", "thief"] });
    const f = await dc.download(item, t);
    expect(f.kind === "json" && f.card.data).toMatchObject({ name: "Mira Vale", first_mes: "Hey.", alternate_greetings: ["Yo."], tags: ["Female", "thief"], creator: "zed", extensions: { datacat: { id: "c-1" } } });
    expect(f.kind === "json" && f.avatar?.mime).toBe("image/webp");
  });
  it("does not add a card whose creator turned downloads off on DataCat", async () => {
    const { t } = sites(routes({ downloadsDisabled: true }));
    const item = (await dc.search(query(), t)).items[0]!;
    await expect(dc.download(item, t)).rejects.toThrow("The creator turned off downloads of this card on DataCat.");
  });
});

describe("pauses (v1 timings and messages)", () => {
  it("429 pauses the whole site for Retry-After (at least 30 s) or 10 min; Cloudflare 5 min the part; turnstile 30 min", () => {
    let now = 0;
    const p = new Pauses(() => now);
    expect(p.pause("chub:search", "rate", 429)).toBe(600_000);
    expect(() => p.check("chub:download")).toThrow(/ChubAI asked this app to slow down \(too many requests\)\. Try again in about 10 min\./);
    now = 600_001; expect(() => p.check("chub:download")).not.toThrow();
    expect(p.pause("chub:search", "rate", 429, 5)).toBe(30_000);
    p.clear();
    expect(p.pause("janny:download", "cloudflare", 403)).toBe(300_000);
    expect(() => p.check("janny:search")).not.toThrow();
    expect(() => p.check("janny:download")).toThrow(/checking your browser/);
    expect(p.pause("janny:download", "verify", 403)).toBe(1_800_000);
    expect(() => p.check("janny:download")).toThrow(/human check/);
  });
  it("tells refusals apart", () => {
    expect(refusalKind({ status: 429, cfMitigated: false })).toBe("rate");
    expect(refusalKind({ status: 403, cfMitigated: true })).toBe("cloudflare");
    expect(refusalKind({ status: 403, cfMitigated: false, text: '{"turnstile": true}' })).toBe("verify");
    expect(refusalKind({ status: 403, cfMitigated: false, text: "forbidden" })).toBe("");
    expect(refusalKind({ status: 500, cfMitigated: true })).toBe("");
  });
});

describe("building cards", () => {
  it("matches v1's buildCard: cleans greetings and tags, keeps a non-empty book only", () => {
    const c = buildCard({ name: "", description: "D", alternate_greetings: ["Hi", "", 3], tags: ["A", { name: "B" }, ""], character_book: { entries: [] }, extensions: [] });
    expect(c).toEqual({ spec: "chara_card_v2", spec_version: "2.0", data: { name: "Unnamed", description: "D", personality: "", scenario: "", first_mes: "", mes_example: "", creator_notes: "", system_prompt: "", post_history_instructions: "", alternate_greetings: ["Hi"], tags: ["A", "B"], creator: "", character_version: "", extensions: {} } });
  });
  it("shows site HTML as plain text", () => {
    expect(plain("<p>One &amp; <b>two</b></p><br>Three<script>x()</script>&#33;")).toBe("One & two\n\nThree!");
  });
});
