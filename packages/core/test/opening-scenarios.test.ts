// D-138: each opening of a story has its own scenario; a chat keeps a copy on its first message, so the scenario follows
// the first message of the branch on screen. Author: CLAUDE, 2026-11-17.
import { Story, openingMetaOf, scenarioAt, storyOpenings, storyScenario } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { connection, world } from "./helpers.ts";

type W = Awaited<ReturnType<typeof world>>;
/** Everything the main model was sent in call `call` (1-based, like the fake AI counts). */
const sent = (w: W, call: number) => w.ai.prompts[call - 1]!.map((t) => t.content).join("\n---\n");

const MODERN = "Modern day. Aru'Kala was left at Alice's house.";
const FANTASY = "Fantasy. Alice is the queen of Valdren.";

async function twoWorlds(w: W) {
  await w.store.saveStory({
    id: "s", name: "Aru'Kala and Alice", createdAt: 1, scenario: "",
    openings: [
      { text: "The car drives off too fast.", scenario: MODERN },
      { text: "The house is dark.", scenario: MODERN },
      { text: "Chains ring on the marble floor.", scenario: FANTASY },
    ],
  });
}

describe("openings with their own scenario (D-138)", () => {
  it("reads openings saved as plain texts: they keep the story's old scenario", () => {
    const old = Story.parse({ id: "o", name: "Old", createdAt: 1, scenario: "A summoning hall.", openings: ["You wake up.", "Light."] });
    expect(old.openings).toEqual([{ text: "You wake up." }, { text: "Light." }]);
    expect(storyOpenings(old)).toEqual([{ text: "You wake up.", scenario: "A summoning hall." }, { text: "Light.", scenario: "A summoning hall." }]);
    expect(storyScenario(old)).toBe("A summoning hall.");
    expect(storyScenario(Story.parse({ id: "n", name: "None", createdAt: 1, scenario: "Kept." }))).toBe("Kept.");
  });

  it("each first message keeps its opening's scenario; the chat starts with the chosen one's", async () => {
    const w = await world(() => "ok");
    await twoWorlds(w);
    const { session, firstMessage } = await w.chat.createSession({ storyId: "s", openingIndex: 2 });
    expect(session.scenario).toBe(FANTASY);
    expect(openingMetaOf(firstMessage)).toEqual({ index: 2, scenario: FANTASY });
    const firsts = await w.store.childrenOf(session.id, null);
    expect(firsts.map((m) => openingMetaOf(m))).toEqual([{ index: 2, scenario: FANTASY }, { index: 0, scenario: MODERN }, { index: 1, scenario: MODERN }]);
    expect(scenarioAt(session, firsts[1])).toBe(MODERN);
    // the story's chats list knows which opening each chat started with
    expect((await w.store.openingsOf([session.id])).get(session.id)).toEqual({ content: "Chains ring on the marble floor.", index: 2 });
  });

  it("a swipe of the first message brings its scenario; replies below an opening keep that opening's", async () => {
    const w = await world(() => "A reply.");
    await twoWorlds(w);
    const { session, firstMessage } = await w.chat.createSession({ storyId: "s" });
    const [modern, , fantasy] = await w.store.childrenOf(session.id, null);
    expect(firstMessage!.id).toBe(modern!.id);
    const { reply } = await w.chat.send(session.id, modern!.id, "Hello?", connection);
    expect(sent(w, 1)).toContain(MODERN);
    expect(sent(w, 1)).not.toContain(FANTASY);
    // deeper in the same branch, and a swipe of that reply: still the modern scenario
    await w.chat.send(session.id, reply.id, "Come in.", connection);
    expect(sent(w, 2)).toContain(MODERN);
    await w.chat.generate(session.id, reply.parentId, connection);
    expect(sent(w, 3)).toContain(MODERN);
    // the first message swiped to the fantasy opening: its scenario
    await w.chat.send(session.id, fantasy!.id, "Your Majesty.", connection);
    expect(sent(w, 4)).toContain(FANTASY);
    expect(sent(w, 4)).not.toContain(MODERN);
    // Preview Prompt follows the same rule
    const preview = await w.chat.turns.previewPrompt(session.id, fantasy!.id, connection);
    expect(preview.parts.map((p) => p.content).join("\n")).toContain(FANTASY);
  });

  it("Edit for This Chat changes this chat's copy for that opening, never the story", async () => {
    const w = await world(() => "ok");
    await twoWorlds(w);
    const { session, firstMessage } = await w.chat.createSession({ storyId: "s" });
    await w.chat.setOpeningScenario(session.id, firstMessage!.id, "Modern day, but it is raining.");
    const first = await w.store.getMessage(firstMessage!.id);
    expect(openingMetaOf(first)).toEqual({ index: 0, scenario: "Modern day, but it is raining." });
    expect(storyOpenings((await w.store.getStory("s"))!)[0]!.scenario).toBe(MODERN);
    await w.chat.send(session.id, firstMessage!.id, "Hi.", connection);
    expect(sent(w, 1)).toContain("Modern day, but it is raining.");
  });

  it("a chat made before D-138 (no scenario on its first message) keeps using and editing its own", async () => {
    const w = await world(() => "ok");
    await w.store.saveSession({ id: "old", title: "Old chat", storyId: null, scenario: "The old premise.", createdAt: 1 });
    const m = await w.store.addMessage({ id: "m1", sessionId: "old", parentId: null, speaker: { kind: "narrator" }, content: "Once.", createdAt: 1 });
    expect(scenarioAt((await w.store.getSession("old"))!, m)).toBe("The old premise.");
    await w.chat.setOpeningScenario("old", "m1", "A new premise.");
    expect((await w.store.getSession("old"))!.scenario).toBe("A new premise.");
  });

  it("a first message written for the chat gets its own scenario (default: the first opening's)", async () => {
    const w = await world(() => "ok");
    await twoWorlds(w);
    const a = await w.chat.createSession({ storyId: "s", openingText: "Snow.", openingScenario: "Winter." });
    expect(openingMetaOf(a.firstMessage)).toEqual({ index: null, scenario: "Winter." });
    expect(a.session.scenario).toBe("Winter.");
    const b = await w.chat.createSession({ storyId: "s", openingText: "Rain." });
    expect(openingMetaOf(b.firstMessage)).toEqual({ index: null, scenario: MODERN });
  });

  it("no opening with text: the card narrator's greetings come with the first opening's scenario", async () => {
    const w = await world(() => "ok");
    await w.store.saveCharacter({ id: "world", name: "World", description: "A world card.", scenario: "The card's own.", firstMessages: ["Dawn.", "Dusk."] });
    await w.store.saveStory({ id: "c", name: "World", createdAt: 1, narrator: { kind: "card", characterId: "world", variantId: null },
      openings: [{ text: "", scenario: "Written on the story page." }] });
    const { session } = await w.chat.createSession({ storyId: "c", openingIndex: 1 });
    expect(session.scenario).toBe("Written on the story page.");
    expect((await w.store.childrenOf(session.id, null)).map((m) => [m.content, openingMetaOf(m)?.index])).toEqual([["Dusk.", 1], ["Dawn.", 0]]);
  });
});
