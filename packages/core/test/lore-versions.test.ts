// A story's own version of a lorebook (D-049). CLAUDE, 2026-10-30.
import { describe, expect, it } from "vitest";
import { LoreEntry, Lorebook } from "@homunculus/schemas";
import { applyLorePatch, applyToOriginal, loreChanges, patchFrom, patchWithEntry } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

const book = Lorebook.parse({ id: "b", name: "Isekai World", entries: [
  { id: "1", title: "Great Sage", keys: ["sage"], content: "An old wizard." },
  { id: "2", title: "Old Capital", keys: ["capital"], content: "Ruins." },
] });
const entry = (e: object) => LoreEntry.parse(e);

describe("lorebook versions", () => {
  it("keeps only the differences, and reverts to following the original", () => {
    const edited = { ...book, entries: [{ ...book.entries[0]!, content: "An old wizard. His grandchild is Sion." }, entry({ id: "3", title: "Shura Path", content: "Grows stronger in long fights." })] };
    const patch = patchFrom(book, edited, undefined, "user", 5);
    expect(Object.keys(patch.entries).sort()).toEqual(["1", "3"]);
    expect(patch.removed).toEqual(["2"]);
    expect(applyLorePatch(book, patch).entries.map((e) => e.id)).toEqual(["1", "3"]);
    expect([...loreChanges(book, patch)]).toEqual([["1", "edited"], ["3", "new"], ["2", "removed"]]);
    expect(patchFrom(book, book, patch, "user", 6)).toEqual({ entries: {}, removed: [], meta: {} });
  });
  it("an agent's entry goes into the story only; part of it can go to the original", () => {
    const p = patchWithEntry(undefined, entry({ id: "3", title: "Shura Path", content: "x" }), "lorebook-keeper", 9, "m48");
    expect(p.meta["3"]).toEqual({ by: "lorebook-keeper", at: 9, messageId: "m48" });
    const { book: merged, patch: rest } = applyToOriginal(book, p, new Set(["3"]));
    expect(merged.entries.map((e) => e.id)).toEqual(["1", "2", "3"]);
    expect(rest.entries).toEqual({});
  });
  it("a story's chats read its version; the Library book and other chats do not change", async () => {
    const w = await world(() => "ok");
    await w.store.saveLorebook({ id: "b", name: "Isekai World", entries: [{ id: "1", constant: true, content: "ORIGINAL ENTRY" }] });
    await w.store.saveStory({ id: "st", name: "Isekai RPG", openings: ["The bus stops."], createdAt: 1, setup: { lorebooks: { mode: "add", add: ["b"], remove: [] } },
      lorePatches: { b: patchWithEntry(undefined, entry({ id: "9", constant: true, content: "STORY-ONLY ENTRY" }), "user", 1) } });
    const { session, firstMessage } = await w.chat.createSession({ storyId: "st" });
    await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    const text = w.ai.prompts.at(-1)!.map((t) => t.content).join("\n");
    expect(text).toContain("ORIGINAL ENTRY");
    expect(text).toContain("STORY-ONLY ENTRY");
    expect((await w.store.lorebooks.get("b"))!.entries).toHaveLength(1);
    const other = await w.chat.createSession({ characterIds: ["lyra"] });
    await w.store.saveSession({ ...other.session, setup: { ...other.session.setup, lorebooks: { mode: "add", add: ["b"], remove: [] } } });
    await w.chat.send(other.session.id, other.firstMessage!.id, "Hi", connection);
    expect(w.ai.prompts.at(-1)!.map((t) => t.content).join("\n")).not.toContain("STORY-ONLY ENTRY");
  });
});
