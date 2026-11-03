// Sorting must be deterministic, non-mutating and separate from executable order. Author: CODEX, 2026-11-03.
import { describe, expect, it } from "vitest";
import { itemId, itemSortInfo, preserveDisplayEdits, sortRows, type SortMode } from "../src/collection-sort.ts";

const rows = [
  { id: "z", name: "Zulu", created: 10, added: 1, favorite: true, recent: 30, chats: 1, tokens: 100 },
  { id: "a", name: "Alpha", created: 30, added: 2, favorite: false, recent: 20, chats: 3, tokens: 10 },
  { id: "b", name: "Bravo", created: 20, added: 3, favorite: false, recent: 0, chats: 0, tokens: 1000 },
];
describe("collection sorting", () => {
  for (const [mode, expected] of Object.entries({ az: "abz", za: "zba", newest: "abz", oldest: "zba", added: "baz", favorites: "zab", recent: "zab", mostChats: "azb", leastChats: "bza", mostTokens: "bza", leastTokens: "azb" })) {
    it(mode, () => expect(sortRows(rows, mode as SortMode, (x) => x).map((x) => x.id).join("")).toBe(expected));
  }
  it("does not mutate the input or change default execution order", () => {
    const before = [...rows]; sortRows(rows, "az", (x) => x);
    expect(rows).toEqual(before); expect(sortRows(rows, "original", (x) => x)).toEqual(before);
  });
  it("keeps random ranks stable across filtering and changes them only with a new seed", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), name: String(i) }));
    const order = sortRows(many, "random", (x) => x, 42);
    expect(sortRows(many.filter((x) => Number(x.id) % 2), "random", (x) => x, 42)).toEqual(order.filter((x) => Number(x.id) % 2));
    expect(sortRows(many, "random", (x) => x, 99)).not.toEqual(order);
  });
  it("reads source creation dates and true imported favorites without treating false as a favorite", () => {
    expect(itemSortInfo("characters", { id: "x", name: "X", original: { create_date: "2020-04-03 @12h00m00s000ms", data: { extensions: { fav: true } } } }, { added: 1, created: 999 })).toMatchObject({ favorite: true });
    expect(itemSortInfo("characters", { id: "x", name: "X", original: { create_date: "2020-04-03T12:00:00Z", fav: "false" } }, { added: 1, created: 999 })).toMatchObject({ created: Date.parse("2020-04-03T12:00:00Z"), favorite: false });
  });
  it("uses prompt text for tokens and ignores original-file metadata size", () => {
    const a = itemSortInfo("agents", { id: "a", name: "A", prompt: "short", original: { ignored: "x".repeat(10000) } });
    const b = itemSortInfo("agents", { id: "b", name: "B", prompt: "long ".repeat(100) });
    expect(b.tokens).toBeGreaterThan(a.tokens!);
  });
  it("saves a sorted regex edit in its original execution position and retains filtered-out scripts", () => {
    const all = [{ id: "b", on: true }, { id: "a", on: true }, { id: "c", on: true }];
    expect(preserveDisplayEdits(all, [all[1]!, all[0]!], [{ id: "a", on: false }, all[0]!])).toEqual([{ id: "b", on: true }, { id: "a", on: false }, { id: "c", on: true }]);
  });
});


it("counts nested NPC values instead of replacing them with object labels", () => {
  const small = itemSortInfo("npcs", { id: "s", name: "Small", values: { items: [{ description: "short" }] } });
  const large = itemSortInfo("npcs", { id: "l", name: "Large", values: { items: [{ description: "long ".repeat(100) }] } });
  expect(large.tokens).toBeGreaterThan(small.tokens!);
});


it("includes a story's own narrator text in its token estimate", () => {
  const short = itemSortInfo("stories", { id: "s", name: "Small", narrator: { kind: "own", narrator: { instructions: "Short" } } });
  const long = itemSortInfo("stories", { id: "l", name: "Large", narrator: { kind: "own", narrator: { instructions: "Long ".repeat(100) } } });
  expect(long.tokens).toBeGreaterThan(short.tokens!);
});


it("keeps Trash items with the same id in different kinds distinct", () => {
  const a = { id: "same", kind: "character", name: "A", trashedAt: 1 };
  const b = { id: "same", kind: "persona", name: "B", trashedAt: 2 };
  expect(itemId(a)).not.toBe(itemId(b));
  expect(itemSortInfo("trash", a).id).not.toBe(itemSortInfo("trash", b).id);
});
