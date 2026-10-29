// Tests of slice 1: history of saved versions, the Trash, variants and personas in the prompt.
// Author: CLAUDE, 2026-10-28.
import { describe, expect, it } from "vitest";
import { buildPrompt, DEFAULT_PRESET, effectiveCharacter, pruneOverrides } from "../src/index.ts";
import { connection, newTestStore, world } from "./helpers.ts";

describe("history of saved versions", () => {
  it("keeps every saved version, newest first, and the version from before history existed", async () => {
    const { store } = await newTestStore();
    await store.saveCharacter({ id: "c", name: "Lyra", description: "one" });
    await store.saveCharacter({ id: "c", name: "Lyra", description: "one" }); // no change → no new version
    await store.saveCharacter({ id: "c", name: "Lyra", description: "two" });
    const h = await store.listHistory("character", "c");
    expect(h.map((e) => (e.data as { description: string }).description)).toEqual(["two", "one"]);

    // a character saved before migration 4 has no history: its first edit keeps the old version too
    await store.saveCharacter({ id: "old", name: "Old", description: "before" });
    await store["db"].execute("DELETE FROM item_history WHERE item_id = 'old'");
    await store.saveCharacter({ id: "old", name: "Old", description: "after" });
    expect((await store.listHistory("character", "old")).map((e) => (e.data as { description: string }).description)).toEqual(["after", "before"]);
  });

  it("works for personas and keeps at most HISTORY_LIMIT versions", async () => {
    const { store } = await newTestStore();
    for (let i = 0; i < 105; i++) await store.savePersona({ id: "p", name: "Me", description: `v${i}` });
    const h = await store.listHistory("persona", "p");
    expect(h).toHaveLength(100);
    expect((h[0]!.data as { description: string }).description).toBe("v104");
  });
});

describe("the Trash", () => {
  it("hides trashed things from the lists, restores them, and deletes them for good only when asked", async () => {
    const { store, chat } = await world(() => "ok");
    const { session } = await chat.createSession({ title: "Story", characterIds: ["lyra"] });
    await store.savePersona({ id: "me", name: "Dan" });

    // a character used by a story can't go to the Trash
    await expect(store.moveToTrash("character", "lyra")).rejects.toThrow(/used by 1 session/);
    await store.moveToTrash("session", session.id);
    expect(await store.listSessions()).toEqual([]);
    await store.moveToTrash("character", "lyra");
    await store.moveToTrash("persona", "me");
    expect(await store.listCharacters()).toEqual([]);
    expect(await store.personas.list()).toEqual([]);
    expect((await store.listTrash()).map((t) => t.kind).sort()).toEqual(["character", "persona", "session"]);
    // trashed things still open from old references (nothing breaks)
    expect(await store.getCharacter("lyra")).toMatchObject({ name: "Lyra" });

    // the character can't be deleted for good while a trashed session still uses it
    await expect(store.deleteForever("character", "lyra")).rejects.toThrow(/still used/);
    await store.restoreFromTrash("session", session.id);
    expect((await store.listSessions()).map((s) => s.title)).toEqual(["Story"]);
    await store.moveToTrash("session", session.id);

    // saving a trashed item does not take it out of the Trash
    await store.saveCharacter({ id: "lyra", name: "Lyra", description: "edited" });
    expect(await store.listCharacters()).toEqual([]);

    await store.emptyTrash();
    expect(await store.listTrash()).toEqual([]);
    expect(await store.getCharacter("lyra")).toBeUndefined();
    expect(await store.getSession(session.id)).toBeUndefined();
    expect(await store.listHistory("character", "lyra")).toEqual([]);
  });

  it("refuses to trash the default persona or one a session uses", async () => {
    const { store, chat } = await world(() => "ok");
    await store.savePersona({ id: "me", name: "Dan" });
    await store.setDefaultSetup({ personaId: "me" });
    await expect(store.moveToTrash("persona", "me")).rejects.toThrow(/default persona/);
    await store.setDefaultSetup({});
    const { session } = await chat.createSession({ title: "Story", characterIds: ["lyra"] });
    await store.saveSession({ ...session, setup: { personaId: "me" } });
    await expect(store.moveToTrash("persona", "me")).rejects.toThrow(/used by 1 session/);
  });
});

describe("variants and personas in the story", () => {
  it("prunes overrides equal to the main version", () => {
    expect(pruneOverrides({ name: "Lyra", description: "a" }, { name: "Lyra", description: "b" })).toEqual({ description: "b" });
  });

  it("the session's character version and persona (with its version) reach the prompt and the reply record", async () => {
    const { store, chat, ai } = await world(() => "Hello.");
    const lyra = (await store.getCharacter("lyra"))!;
    await store.saveCharacter({ ...lyra, variants: [{ id: "modern", label: "Modern", overrides: { description: "A barista in the city." } }] });
    await store.savePersona({
      id: "me", name: "Dan", description: "A traveller.",
      variants: [{ id: "knight", label: "Knight", overrides: { name: "Sir Dan", description: "A knight of the realm." } }],
    });
    const { session } = await chat.createSession({ title: "S", cast: [{ characterId: "lyra", variantId: "modern" }] });
    await store.saveSession({ ...session, setup: { personaId: "me", personaVariantId: "knight" } });

    const { reply } = await chat.send(session.id, null, "Hi, {{char}}", connection);
    const system = ai.prompts[0]![0]!.content;
    expect(system).toContain("A barista in the city.");
    expect(system).not.toContain("A wary ranger.");
    expect(system).toContain("About Sir Dan:\nA knight of the realm.");
    expect((await store.getGenerationRecord(reply.id))?.who).toEqual({
      personaId: "me", personaVariantId: "knight", cast: [{ characterId: "lyra", variantId: "modern" }],
    });
  });

  it("puts the persona description at a depth, or leaves it out, as the persona says", () => {
    const history = [1, 2, 3].map((i) => ({
      id: `m${i}`, sessionId: "s", parentId: null, speaker: { kind: i % 2 ? "user" as const : "narrator" as const },
      kind: (i % 2 ? "user" : "reply") as "user" | "reply", visibility: { ai: "full" as const, user: true }, content: `m${i}`, createdAt: i, meta: {},
    }));
    const base = {
      preset: DEFAULT_PRESET, generationType: "normal" as const, sessionScenario: "", scene: [], reserve: 0,
      character: effectiveCharacter({ id: "c", name: "C", description: "", personality: "", scenario: "", firstMessages: [], exampleMessages: "", systemPrompt: "", postHistoryInstructions: "", creatorNotes: "", creator: "", characterVersion: "", tags: [], variants: [], lorebookIds: [] }, null),
      history, names: { char: "C", user: "Dan" }, injections: [], inline: [],
    };
    const atDepth = buildPrompt({ ...base, persona: { name: "Dan", description: "Tall.", placement: { position: "atDepth", depth: 1, role: "user" } } }).parts;
    expect(atDepth[0]!.content).not.toContain("Tall.");
    expect(atDepth.at(-2)).toEqual({ role: "user", content: "About Dan:\nTall.", source: "persona" });
    const none = buildPrompt({ ...base, persona: { name: "Dan", description: "Tall.", placement: { position: "none", depth: 2, role: "system" } } }).parts;
    expect(none.some((p) => p.content.includes("Tall."))).toBe(false);
  });
});
