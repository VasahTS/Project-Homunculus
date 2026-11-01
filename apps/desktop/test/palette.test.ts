// Ctrl+K results (D-069). Author: CLAUDE, 2026-11-01.
import { describe, expect, it } from "vitest";
import { paletteResults, type PaletteItem } from "../src/palette.ts";

const ORDER = ["Recent chats", "Go to", "Characters", "Lorebooks", "Agents"];
const item = (group: string, name: string, keywords?: string): PaletteItem => ({ id: `${group}:${name}`, name, group, keywords, onOpen: () => {} });
const items = [
  item("Agents", "Prose Polisher"), item("Agents", "Prose Polisher v2"), item("Agents", "Grounded Prose"),
  item("Lorebooks", "Astraea"), item("Characters", "Astra"), item("Go to", "Lorebooks", "library"), item("Go to", "Settings"),
  item("Recent chats", "Chat 1"),
];

describe("paletteResults", () => {
  it("lists the places and the last chats when nothing is typed", () => {
    expect(paletteResults(items, ORDER, "  ").map((x) => x.name)).toEqual(["Chat 1", "Lorebooks", "Settings"]);
  });
  it("keeps the group order and puts names that start with the search first", () => {
    expect(paletteResults(items, ORDER, "pro").map((x) => x.name)).toEqual(["Prose Polisher", "Prose Polisher v2", "Grounded Prose"]);
    expect(paletteResults(items, ORDER, "astr").map((x) => x.group)).toEqual(["Characters", "Lorebooks"]);
  });
  it("finds by every word, in the name, the group or the keywords, never the recent copies", () => {
    expect(paletteResults(items, ORDER, "library lore").map((x) => x.id)).toEqual(["Go to:Lorebooks"]);
    expect(paletteResults(items, ORDER, "chat 1")).toEqual([]);
  });
  it("shows at most six per group", () => {
    const many = Array.from({ length: 9 }, (_, i) => item("Agents", `Agent ${i}`));
    expect(paletteResults(many, ORDER, "agent")).toHaveLength(6);
  });
});
