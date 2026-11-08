// DataCat's copy of a hidden JanitorAI card (D-101): looked up by JanitorAI's id, never throws. CLAUDE, 2026-11-08.
import { beforeEach, expect, it } from "vitest";
import { datacatCopy, pauses, resetDatacat } from "../src/index.ts";
import type { SiteRequest, SiteResponse, SiteTransport } from "../src/types.ts";

const ID = "aaaaaaaa-0000-4000-8000-000000000002";
const json = (data: unknown, status = 200): SiteResponse => ({ status, finalUrl: "", contentType: "application/json", cfMitigated: false, text: JSON.stringify(data) });
function site(character: (() => SiteResponse)) {
  const seen: SiteRequest[] = [];
  const t: SiteTransport = { async request(r) {
    seen.push(r);
    if (r.url.endsWith("/api/liberator/identify")) return json({ success: true, sessionToken: "s" });
    if (r.url.endsWith(`/api/characters/${ID}`)) return character();
    return json({}, 404);
  } };
  return { t, seen };
}
const fallback = { name: "Hidden Keeper", creator: "kit", thumb: "t.webp", image: undefined, url: "" };
const record = (over: Record<string, unknown> = {}) => ({ character: { character_id: ID, name: "Hidden Keeper", personality: "Guards a secret lamp.", scenario: "Night.", first_message: "Psst.", updatedAt: "2026-10-03T12:00:00Z",
  chara_card_v2_json: { spec: "chara_card_v2", data: { name: "Hidden Keeper", description: "Guards a secret lamp.", character_book: { entries: [{ keys: ["lamp"], content: "It never goes out." }, { keys: ["tower"], content: "Old." }] } } }, ...over } });

beforeEach(() => { pauses.clear(); resetDatacat(); });

it("finds the copy by JanitorAI's id: date, lorebook size, the item to download", async () => {
  const { t, seen } = site(() => json(record()));
  const c = await datacatCopy(ID, fallback, t);
  expect(c).toMatchObject({ date: "2026-10-03T12:00:00.000Z", loreEntries: 2, downloadsOff: false, item: { source: "datacat", id: ID, name: "Hidden Keeper", creator: "kit", url: `https://datacat.run/characters/${ID}` } });
  expect(seen.map((r) => new URL(r.url).pathname)).toEqual(["/api/liberator/identify", `/api/characters/${ID}`]);
});

it("not there, an error, a record without a definition or a bad id: no copy, and nothing thrown", async () => {
  expect(await datacatCopy(ID, fallback, site(() => json({ error: "not found" }, 404)).t)).toBeNull();
  pauses.clear();
  expect(await datacatCopy(ID, fallback, site(() => { throw new Error("offline"); }).t)).toBeNull();
  expect(await datacatCopy(ID, fallback, site(() => json({ character: { character_id: ID, name: "X", personality: null, scenario: "" } })).t)).toBeNull();
  const { t, seen } = site(() => json(record()));
  expect(await datacatCopy("../auth", fallback, t)).toBeNull();
  expect(seen).toEqual([]);
});

it("downloads turned off there are reported; dates in seconds and no date at all are handled", async () => {
  expect((await datacatCopy(ID, fallback, site(() => json(record({ downloadsDisabled: true }))).t))?.downloadsOff).toBe(true);
  resetDatacat();
  expect((await datacatCopy(ID, fallback, site(() => json(record({ updatedAt: undefined, created_at: 1790000000 }))).t))?.date).toBe(new Date(1790000000 * 1000).toISOString());
  resetDatacat();
  const none = await datacatCopy(ID, fallback, site(() => json(record({ updatedAt: undefined, chara_card_v2_json: undefined }))).t);
  expect(none).toMatchObject({ date: "", loreEntries: 0 });
});
