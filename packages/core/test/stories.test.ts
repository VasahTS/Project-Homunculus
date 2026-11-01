// Tests for stories, narrators and NPCs (slice 4, D-029). Author: CLAUDE, 2026-10-29.
import { TrackerSchema } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { castOf, castPart, narratorText, npcSheetFields, npcSheetText, roleNote, SIMPLE_NARRATOR, storyFromCard } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

const FANTASY = {
  id: "chars-fantasy", name: "Fantasy", characters: "anyone" as const, presence: { field: "present", value: "here" },
  fields: [
    { key: "present", label: "In the scene", type: "status" as const, options: ["here", "away"], scope: "perCharacter" as const, section: "Now" },
    { key: "mood", label: "Mood", type: "text" as const, scope: "perCharacter" as const, section: "Now" },
    { key: "description", label: "Description", type: "text" as const, scope: "perCharacter" as const, section: "About" },
    { key: "race", label: "Race", type: "text" as const, scope: "perCharacter" as const, section: "Fantasy" },
    { key: "class", label: "Class", type: "text" as const, scope: "perCharacter" as const, section: "Fantasy" },
    { key: "level", label: "Level", type: "number" as const, scope: "perCharacter" as const, section: "Fantasy" },
    { key: "date", label: "Date", type: "text" as const, scope: "global" as const },
  ],
};

/** All the text the AI got in its first call, joined. */
const sent = (w: Awaited<ReturnType<typeof world>>, call = 0) => w.ai.prompts[call]!.map((t) => t.content).join("\n---\n");

describe("NPC sheets", () => {
  it("keep the per-character fields that don't change while playing (not 'Now', not the presence field)", () => {
    expect(npcSheetFields(TrackerSchema.parse(FANTASY)).map((f) => f.key)).toEqual(["description", "race", "class", "level"]);
  });

  it("are sent as text by section, empty fields left out", () => {
    const schema = TrackerSchema.parse(FANTASY);
    const text = npcSheetText({ id: "n", name: "Sister Maelle", storyId: null, schemaId: "chars-fantasy", notes: "", values: { race: "Half-elf", class: "Healer", level: 5, mood: "calm", description: "" } }, schema);
    expect(text).toBe("### Sister Maelle\nFantasy:\n- Race: Half-elf\n- Class: Healer\n- Level: 5");
  });
});

describe("the narrator and the role", () => {
  it("the narrator's style and 'may bring in new people' become text", () => {
    const t = narratorText({ ...SIMPLE_NARRATOR, style: { pov: "second person", tense: "present", length: "", tone: "", pacing: "slow burn", dialogue: "", mature: "" }, mayAddNpcs: false });
    expect(t).toContain("Style — point of view: second person; tense: present; pacing: slow burn.");
    expect(t).toContain("Do not bring in new named people");
    // everything inside one <narrator> block (D-059)
    expect(t.startsWith("<narrator>\n")).toBe(true);
    expect(t.endsWith("\n</narrator>")).toBe(true);
  });

  it("blocks are sent in order and a switched-off block is left out (D-059)", () => {
    const t = narratorText({ ...SIMPLE_NARRATOR, instructions: "old text", blocks: [
      { id: "a", name: "Role", on: true, text: "<role>A</role>" }, { id: "b", name: "Dialogue", on: false, text: "<dialogue>B</dialogue>" },
      { id: "c", name: "Story", on: true, text: "<story>C</story>" }] });
    expect(t).toContain("<role>A</role>\n\n<story>C</story>");
    expect(t).not.toContain("<dialogue>");
    expect(t).not.toContain("old text");
  });

  it("a player in a 1:1 chat gets no role note (prompts stay as before stories)", () => {
    expect(roleNote("player", false)).toBe("");
    expect(roleNote("player", true)).toContain("Never write {{user}}'s words");
    expect(roleNote("director", false)).toContain("not in the story");
    expect(castPart({ inStory: false, role: "player", npcs: [], cards: [] })).toBe("");
  });
});

describe("a story session's prompt", () => {
  it("is told by the Simple Narrator, with the story's NPCs right after it, and the narrator's name in the chat", async () => {
    const w = await world(() => "Rain on the shutters.");
    await w.store.saveTrackerSchema(FANTASY);
    await w.store.saveNpc({ id: "maelle", name: "Sister Maelle", storyId: "st", schemaId: "chars-fantasy", values: { race: "Half-elf", class: "Healer", mood: "calm" } });
    await w.store.saveStory({ id: "st", name: "High Fantasy Party", scenario: "A tavern in Greywater.", npcIds: ["maelle"], openings: ["The tavern is loud."], createdAt: 1 });
    const { session, firstMessage } = await w.chat.createSession({ storyId: "st" });
    await w.chat.send(session.id, firstMessage!.id, "I look around.", connection);
    const text = sent(w);
    expect(text).toContain("You are the narrator of this story.");
    expect(text).toContain("[People in this story. You voice them; they are not you.]\n\n### Sister Maelle\nFantasy:\n- Race: Half-elf\n- Class: Healer");
    expect(text).not.toContain("calm"); // "Now" fields are the trackers' job
    expect(text).toContain("User plays their own character"); // the default user name, player role
    expect(text).toContain("A tavern in Greywater.");
    // the people part comes right after the narrator's description, before the scenario
    expect(text.indexOf("You are the narrator")).toBeLessThan(text.indexOf("[People in this story"));
    expect(text.indexOf("[People in this story")).toBeLessThan(text.indexOf("A tavern in Greywater."));
    // the opening is the narrator's message, named after the narrator
    expect(w.ai.prompts[0]!.some((t) => t.role === "assistant" && t.content === "The tavern is loud.")).toBe(true);
  });

  it("a Vault narrator replaces the Simple one, and a trashed NPC is no longer sent", async () => {
    const w = await world(() => "ok");
    await w.store.saveNarrator({ id: "gm", name: "Game Master", instructions: "You run a gritty campaign.", turnInstruction: "Keep replies under 200 words." });
    await w.store.saveNpc({ id: "orin", name: "Orin" });
    await w.store.saveStory({ id: "st", name: "Grit", narrator: { kind: "vault", id: "gm" }, npcIds: ["orin"], createdAt: 1 });
    await w.store.moveToTrash("npc", "orin");
    const { session } = await w.chat.createSession({ storyId: "st" });
    await w.chat.send(session.id, null, "Begin.", connection);
    const text = sent(w);
    expect(text).toContain("You run a gritty campaign.");
    expect(text).toContain("Keep replies under 200 words.");
    expect(text).not.toContain("Orin");
  });

  it("a card can tell the story: its description goes as it is, its greetings are the openings, its lorebooks come with it", async () => {
    const w = await world(() => "ok");
    await w.store.saveLorebook({ id: "astraea", name: "Astraea", entries: [{ id: "e1", keys: ["status"], content: "Status windows show stats." }] });
    await w.store.saveCharacter({ id: "isekai", name: "Isekai RPG", description: "STATS: Gold, Level, BP.", scenario: "Transported to a fantasy world.",
      firstMessages: ["You open your eyes on a bus.", "A bell rings."], lorebookIds: ["astraea"] });
    const story = storyFromCard((await w.store.getCharacter("isekai"))!, "st", 1);
    expect(story).toMatchObject({ name: "Isekai RPG", narrator: { kind: "card", characterId: "isekai" }, openings: ["You open your eyes on a bus.", "A bell rings."] });
    await w.store.saveStory(story);
    const { session, firstMessage } = await w.chat.createSession({ storyId: "st" });
    expect(session.scenario).toBe("Transported to a fantasy world.");
    expect((await w.store.childrenOf(session.id, null)).length).toBe(2);
    await w.chat.send(session.id, firstMessage!.id, "Status.", connection);
    const text = sent(w);
    expect(text).toContain("STATS: Gold, Level, BP.");
    expect(text).toContain("Status windows show stats.");
  });

  it("the story's role decides: a director's messages are directions, and every character is written equally", async () => {
    const w = await world(() => "ok");
    await w.store.saveStory({ id: "st", name: "Watch", userRole: "director", cast: [{ characterId: "lyra" }], createdAt: 1 });
    const { session } = await w.chat.createSession({ storyId: "st" });
    const { userMessage } = await w.chat.send(session.id, null, "have them argue", connection);
    expect(userMessage.kind).toBe("direction");
    const text = sent(w);
    expect(text).toContain("User is not in the story.");
    // a full card in the story is sent as a sheet the narrator voices
    expect(text).toContain("### Lyra\nA wary ranger.\nPersonality: Dry humor.");
  });
});

describe("NPCs in a 1:1 chat", () => {
  it("join the chat's prompt as people the character voices when needed", async () => {
    const w = await world(() => "ok");
    await w.store.saveNpc({ id: "bard", name: "The Bard", values: { description: "Sings too loudly." } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"], npcIds: ["bard"] });
    await w.chat.send(session.id, firstMessage!.id, "Hello.", connection);
    const text = sent(w);
    expect(text).toContain("[Other people in the scene. Lyra voices them when the story needs them.]\n\n### The Bard\ndescription: Sings too loudly.");
    expect(text).toContain("A wary ranger.");
  });
});

describe("trackers in a story", () => {
  it("know the story's NPCs by name (like people they add from the story), next to its cards", async () => {
    const w = await world(() => "ok");
    await w.store.saveNpc({ id: "maelle", name: "Sister Maelle" });
    await w.store.saveStory({ id: "st", name: "Party", npcIds: ["maelle"], cast: [{ characterId: "lyra" }], createdAt: 1 });
    const { session } = await w.chat.createSession({ storyId: "st" });
    expect(await castOf(w.store, session)).toEqual([{ id: "lyra", name: "Lyra" }, { id: "n:Sister Maelle", name: "Sister Maelle" }]);
  });
});

// D-031 (2026-10-29): story chats ("Chat N"), the user out of the cast in Director mode
describe("chats of a story and Director mode", () => {
  it("names a story's next chat after the highest number used, old \"<Story>, session N\" names included", async () => {
    const { nextChatTitle } = await import("../src/index.ts");
    expect(nextChatTitle([])).toBe("Chat 1");
    expect(nextChatTitle([{ title: "Chat 1" }, { title: "My run" }])).toBe("Chat 3");
    expect(nextChatTitle([{ title: "Isekai RPG, session 4" }])).toBe("Chat 5");
  });

  it("leaves the user out of the tracker's people in Director mode", async () => {
    const { trackerPeople, USER_ID } = await import("../src/index.ts");
    const schema = TrackerSchema.parse(FANTASY);
    const cast = [{ id: "c1", name: "Alice" }];
    expect(trackerPeople(schema, {}, cast, "Dan").map((p) => p.id)).toEqual(["c1", USER_ID]);
    expect(trackerPeople(schema, {}, cast, "Dan", false).map((p) => p.id)).toEqual(["c1"]);
  });

  it("a story chat may start with its own first message and its own setup layer", async () => {
    const w = await world(() => "ok");
    await w.store.saveStory({ id: "st", name: "Road", openings: ["The road is quiet.", "Rain."], userRole: "director", createdAt: 1 });
    const { session, firstMessage } = await w.chat.createSession({ storyId: "st", openingText: "Written for this chat.", setup: { presetId: "p2" } });
    expect(session.title).toBe("Chat 1");
    expect(session.setup.presetId).toBe("p2");
    expect(firstMessage?.content).toBe("Written for this chat.");
    const { userInStory } = await import("../src/index.ts");
    expect(await userInStory(w.store, session)).toBe(false);
  });
});
