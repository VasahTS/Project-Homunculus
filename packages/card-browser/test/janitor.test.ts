// JanitorAI source: read-only addresses, mapping, hidden definitions, public lorebooks. CLAUDE, 2026-11-08 (D-098).
import { beforeEach, expect, it } from "vitest";
import { cardSource, NO_FILTERS, pauses, resetJanitor } from "../src/index.ts";
import { bookEntry, definitionPublic, janitorAvatarUrl, janitorSearchUrl, publicScripts, scriptEntries } from "../src/sources/janitor.ts";
import type { CardQuery, SiteRequest, SiteResponse, SiteTransport } from "../src/types.ts";

const source = cardSource("janitor");
const q = (over: Partial<CardQuery> = {}): CardQuery => ({ text: "", sort: "trending", page: 1, nsfw: false, include: [], exclude: [], filters: NO_FILTERS, ...over });
const ok = (data: unknown): SiteResponse => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text: JSON.stringify(data) });
function site(fn: (r: SiteRequest) => SiteResponse) { const seen: SiteRequest[] = []; const t: SiteTransport = { async request(r) { seen.push(r); return fn(r); } }; return { t, seen }; }
const ID = "0b6e4c1a-1111-4c2b-9a77-2f1d2b3c4d5e";
const row = { id: ID, name: "Fixture Keeper", creator_name: "someone", description: "<p>A <b>public</b> bio.</p>", avatar: "abc.webp", tagIds: [2, 53], custom_tags: ["cozy"], is_nsfw: false, totalToken: 1234, stats: { chat: 50 }, slug: "character-fixture-keeper" };
const open = { ...row, showdefinition: true, personality: "{{char}} keeps the lighthouse.", scenario: "A stormy night.", first_message: "Hello.", first_messages: ["Hello.", "Welcome back."], example_dialogs: "<START>", scripts: [{ type: "lorebook", id: "11111111-aaaa-4bbb-8ccc-222222222222", title: "Coast", is_public: true }, { type: "lorebook", id: "33333333-aaaa-4bbb-8ccc-444444444444", title: "Secrets", is_public: false }, { type: "regex", id: "5", title: "Not lore" }] };
const closed = { ...row, showdefinition: false, personality: "", scenario: "", first_message: "Hello." };

beforeEach(() => { pauses.clear(); resetJanitor(); });

it("builds read-only search addresses: curated tags by id, the rest as custom tags, guest-safe mode", () => {
  const u = new URL(janitorSearchUrl(q({ text: " lighthouse ", page: 2, sort: "latest", include: ["Fantasy", "#cozy", "lighthouse keeper"] })));
  expect(u.origin + u.pathname).toBe("https://janitorai.com/hampter/characters");
  expect(u.searchParams.get("page")).toBe("2"); expect(u.searchParams.get("mode")).toBe("sfw"); expect(u.searchParams.get("sort")).toBe("latest");
  expect(u.searchParams.get("search")).toBe("lighthouse");
  expect(u.searchParams.getAll("tag_id[]")).toEqual(["53"]);
  expect(u.searchParams.getAll("custom_tags[]")).toEqual(["cozy", "lighthouse keeper"]);
  expect(new URL(janitorSearchUrl(q({ nsfw: true, sort: "nonsense" }))).searchParams.get("mode")).toBe("all");
  expect(new URL(janitorSearchUrl(q({ sort: "nonsense" }))).searchParams.get("sort")).toBe("trending");
});

it("maps catalog rows: tag names, custom tags, plain bio, avatar on JanitorAI's picture host, paging by total", async () => {
  const { t } = site(() => ok({ data: [row, { ...row, id: "../evil" }], total: 40, size: 34 }));
  const r = await source.search(q(), t);
  expect(r.items).toHaveLength(1);
  expect(r.items[0]).toMatchObject({ source: "janitor", id: ID, name: "Fixture Keeper", creator: "someone", tagline: "A public bio.", tags: ["Female", "Fantasy", "#cozy"], nsfw: false,
    thumb: "https://ella.janitorai.com/bot-avatars/abc.webp?width=400", image: "https://ella.janitorai.com/bot-avatars/abc.webp",
    url: `https://janitorai.com/characters/${ID}_character-fixture-keeper`, stats: { chats: 50, tokens: 1234 } });
  expect(r.total).toBe(40); expect(r.hasMore).toBe(true);
  expect((await source.search(q({ page: 2 }), t)).hasMore).toBe(false);
});

it("hides adult rows when NSFW is off, drops excluded tags, and refuses a malformed catalog", async () => {
  const { t } = site(() => ok({ data: [row, { ...row, id: "a-2", is_nsfw: true }, { ...row, id: "a-3", custom_tags: ["horror"] }] }));
  expect((await source.search(q({ exclude: ["#horror"] }), t)).items.map((i) => i.id)).toEqual([ID]);
  expect((await source.search(q({ nsfw: true }), t)).items).toHaveLength(3);
  await expect(source.search(q(), site(() => ok({ error: "nope" })).t)).rejects.toThrow("did not return its catalog");
});

it("only trusts JanitorAI's picture host", () => {
  expect(janitorAvatarUrl("https://evil.test/x.png")).toBe("");
  expect(janitorAvatarUrl("/bot-avatars/x.png", 400)).toBe("https://ella.janitorai.com/bot-avatars/x.png?width=400");
  expect(janitorAvatarUrl("")).toBe("");
});

it("public definition: details show it, greetings are not repeated, public lorebooks are counted", async () => {
  const item = (await source.search(q(), site(() => ok({ data: [row] })).t)).items[0]!;
  const d = await source.details(item, site(() => ok(open)).t);
  expect(d).toMatchObject({ description: open.personality, scenario: open.scenario, firstMessage: "Hello.", alternateGreetings: ["Welcome back."], creatorNotes: "A public bio.", hasLorebook: true });
  expect(d.hidden).toBeUndefined();
  expect(definitionPublic(open)).toBe(true);
});

it("hidden definition: the sheet gets the public parts and a reason; download never builds a card", async () => {
  const item = (await source.search(q(), site(() => ok({ data: [row] })).t)).items[0]!;
  const { t, seen } = site(() => ok(closed));
  const d = await source.details(item, t);
  expect(d.hidden).toMatch(/definition hidden/);
  expect(d.description).toBe(""); expect(d.firstMessage).toBe("Hello."); expect(d.hasLorebook).toBe(false);
  await expect(source.download(item, t)).rejects.toThrow(/definition hidden/);
  // only GETs of the character itself — nothing that could change the account
  expect(seen.every((r) => r.method === "GET" && new URL(r.url).pathname === `/hampter/characters/${ID}`)).toBe(true);
  // "showdefinition" alone with empty fields is not a public card
  expect(definitionPublic({ ...closed, showdefinition: true })).toBe(false);
});

it("download: V2 card with JanitorAI's definition as the description, public lorebooks merged, closed ones skipped", async () => {
  const item = (await source.search(q(), site(() => ok({ data: [row] })).t)).items[0]!;
  const script = { script: JSON.stringify([{ key: ["lighthouse", "tower"], keysecondary: "storm", content: "The lighthouse is old.", insertion_order: 50, probability: 0.5, comment: "Tower" }, { key: "x", content: "   " }, { keys: "harbor", content: "Boats.", position: "before_char", constant: true }]) };
  const { t, seen } = site((r) => r.expect === "image" ? { ...ok(null), bytes: new Uint8Array([1]), mime: "image/webp" } : r.url.includes("/script/") ? ok(script) : ok(open));
  const file = await source.download(item, t);
  expect(file.kind).toBe("json");
  if (file.kind !== "json") return;
  const data = file.card.data as Record<string, unknown>;
  expect(data).toMatchObject({ name: "Fixture Keeper", description: open.personality, personality: "", scenario: open.scenario, first_mes: "Hello.", alternate_greetings: ["Welcome back."], mes_example: "<START>", creator_notes: "A public bio.", creator: "someone" });
  const book = data.character_book as { name: string; entries: Record<string, unknown>[] };
  expect(book.name).toBe("Coast");
  expect(book.entries).toHaveLength(2);
  expect(book.entries[0]).toMatchObject({ keys: ["lighthouse", "tower"], secondary_keys: ["storm"], content: "The lighthouse is old.", comment: "Coast · Tower", insertion_order: 50, position: "after_char", extensions: { probability: 50 } });
  expect(book.entries[1]).toMatchObject({ keys: ["harbor"], constant: true, selective: false, position: "before_char" });
  expect(file.avatar).toEqual({ mime: "image/webp", bytes: new Uint8Array([1]) });
  expect(seen.map((r) => new URL(r.url).pathname)).toEqual([`/hampter/characters/${ID}`, "/hampter/script/11111111-aaaa-4bbb-8ccc-222222222222", "/bot-avatars/abc.webp"]);
  expect(seen.every((r) => r.method === "GET")).toBe(true);
});

it("lorebook helpers: only public lorebook scripts with safe ids; scripted books have no entries", () => {
  expect(publicScripts(open).map((s) => s.title)).toEqual(["Coast"]);
  expect(publicScripts({ scripts: [{ type: "lorebook", id: "../x", title: "Bad" }] })).toEqual([]);
  expect(scriptEntries({ script: "export default function () {}" })).toEqual([]);
  expect(scriptEntries({ script: [{ content: "ok" }] })).toHaveLength(1);
  expect(bookEntry({ content: "c", selectiveLogic: 5 }, 0, "")).toMatchObject({ comment: "Entry 1", extensions: { selectiveLogic: 0, probability: 100 } });
});

it("Cloudflare in the site's window pauses JanitorAI instead of hammering it; refused ids never leave the app", async () => {
  const { t, seen } = site(() => ({ ...ok(null), status: 403, cfMitigated: true, text: "<html>Access Restricted</html>" }));
  await expect(source.search(q(), t)).rejects.toThrow(/JanitorAI is blocking/);
  await expect(source.search(q(), t)).rejects.toThrow(/JanitorAI is blocking/);
  expect(seen).toHaveLength(1);
  pauses.clear();
  await expect(source.download({ ...(await source.search(q(), site(() => ok({ data: [row] })).t)).items[0]!, id: "../auth" }, t)).rejects.toThrow("Invalid JanitorAI card");
});

it("tags: JanitorAI's own list replaces the built-in one, and a failure keeps the built-in names", async () => {
  expect(await source.loadTags!(site(() => ok({ error: 1 })).t)).toContain("Fantasy");
  const names = await source.loadTags!(site(() => ok([{ id: 900, name: "Lighthouses" }, { id: 53, name: "Fantasy" }])).t);
  expect(names).toEqual(["Lighthouses", "Fantasy"]);
  expect(new URL(janitorSearchUrl(q({ include: ["Lighthouses"] }))).searchParams.getAll("tag_id[]")).toEqual(["900"]);
});
