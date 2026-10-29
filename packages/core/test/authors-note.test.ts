// Tests of the Author's Note and the card's Character's Note (SillyTavern authors-note.js, depth_prompt). Author: CLAUDE, 2026-10-29.
import { describe, expect, it } from "vitest";
import { Character, type Message } from "@homunculus/schemas";
import { authorsNoteGoes, buildPrompt, DEFAULT_PRESET, resolveSetup, type BuildPromptInput } from "../src/index.ts";

const char = Character.parse({ id: "c", name: "Lyra", description: "A ranger." });
const msg = (i: number, user: boolean): Message => ({
  id: `m${i}`, sessionId: "s", parentId: null, speaker: user ? { kind: "user" } : { kind: "character", characterId: "c" },
  kind: user ? "user" : "reply", visibility: { ai: "full", user: true }, content: `message ${i}`, createdAt: i, meta: {},
});
const history = [1, 2, 3, 4, 5, 6, 7].map((i) => msg(i, i % 2 === 1)); // 4 of yours
const note = (over: Partial<NonNullable<BuildPromptInput["authorsNote"]>> = {}) =>
  ({ text: "Keep it dark, {{user}}.", position: "inChat" as const, depth: 2, role: "system" as const, interval: 1, goes: true, ...over });
const base = (over: Partial<BuildPromptInput> = {}): BuildPromptInput => ({
  preset: DEFAULT_PRESET, generationType: "normal", character: char, sessionScenario: "", history,
  names: { char: "Lyra", user: "Dan" }, scene: [], injections: [], inline: [], reserve: 0, ...over,
});

describe("Author's Note", () => {
  it("each field is inherited on its own: Default → Story → chat", () => {
    const r = resolveSetup({ default: { authorsNote: { text: "Global", depth: 6 } }, story: { authorsNote: { text: "Story note" } }, session: { authorsNote: { interval: 3 } } });
    expect(r.authorsNote).toEqual({ text: "Story note", interval: 3, position: "inChat", depth: 6, role: "system" });
    expect(r.sources["authorsNote.text"]).toBe("story");
    expect(r.sources["authorsNote.depth"]).toBe("default");
    expect(r.sources["authorsNote.interval"]).toBe("session");
  });

  it("goes every turn at 1, never at 0, else when your message count is a multiple (like SillyTavern)", () => {
    expect(authorsNoteGoes(1, [])).toBe(true);
    expect(authorsNoteGoes(0, history)).toBe(false);
    expect(authorsNoteGoes(2, history)).toBe(true); // 4 of yours
    expect(authorsNoteGoes(3, history)).toBe(false);
    expect(authorsNoteGoes(4, history)).toBe(true);
  });

  it("in the chat, N messages from the end, with the lorebook entries around it", () => {
    const r = buildPrompt(base({ authorsNote: note(), worldInfo: { before: [], after: [], noteTop: ["TOP"], noteBottom: ["BOTTOM"] } }));
    const at = r.parts.findIndex((p) => p.source === "authorsNote");
    expect(r.parts[at]).toEqual({ role: "system", content: "TOP\nKeep it dark, Dan.\nBOTTOM", source: "authorsNote" });
    expect(r.parts.slice(at + 1).map((p) => p.source)).toEqual(["history", "history"]);
  });

  it("after (or before) the main prompt", () => {
    const after = buildPrompt(base({ authorsNote: note({ position: "afterMain", role: "user" }) }));
    expect(after.parts.slice(0, 2).map((p) => p.source)).toEqual(["block:Main Prompt", "authorsNote"]);
    expect(after.parts[1]!.role).toBe("user");
    const before = buildPrompt(base({ authorsNote: note({ position: "beforeMain" }) }));
    expect(before.parts.slice(0, 2).map((p) => p.source)).toEqual(["authorsNote", "block:Main Prompt"]);
  });

  it("not this turn: the note and the entries around it stay out, and the record says why", () => {
    const r = buildPrompt(base({ authorsNote: note({ interval: 3, goes: false }), worldInfo: { before: [], after: [], noteTop: ["TOP"] } }));
    expect(r.parts.some((p) => p.source === "authorsNote" || p.source === "lore:note")).toBe(false);
    expect(r.notes.join(" ")).toContain("goes every 3 of your messages. 1 lorebook entry placed around it stayed out too.");
  });

  it("empty note: the entries around it still go where the note would be", () => {
    const r = buildPrompt(base({ authorsNote: note({ text: "" }), worldInfo: { before: [], after: [], noteBottom: ["BOTTOM"] } }));
    expect(r.parts.find((p) => p.source === "lore:note")).toMatchObject({ content: "BOTTOM" });
  });

  it("the card's Character's Note goes at its own depth and role", () => {
    const c = Character.parse({ ...char, original: { data: { extensions: { depth_prompt: { prompt: "{{char}} hums.", depth: 1, role: "assistant" } } } } });
    const r = buildPrompt(base({ character: c }));
    const at = r.parts.findIndex((p) => p.source === "card:note");
    expect(r.parts[at]).toEqual({ role: "assistant", content: "Lyra hums.", source: "card:note" });
    expect(r.parts.slice(at + 1).map((p) => p.source)).toEqual(["history"]);
  });
});
