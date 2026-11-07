// Tests for Homunculus files: exporting and importing narrators, NPCs, stories, Kits, agents and Directors (D-094).
// Author: CLAUDE, 2026-11-07.
import { describe, expect, it } from "vitest";
import {
  bundleFile, collectBundle, countsText, directorLinks, directorProfiles, importBundle, isBundleText, parseBundle,
  saveDirectorLinks, saveDirectorProfiles, DEFAULT_DIRECTOR, type SqlStore,
} from "../src/index.ts";
import { newTestStore } from "./helpers.ts";

const PNG = { mime: "image/png", base64: "iVBORw0KGgo=" };
const FIELDS = [{ key: "mood", label: "Mood", type: "text" as const, scope: "perCharacter" as const }];

/** A story with one of everything it can point to. */
async function seed(store: SqlStore) {
  await store.saveConnectionProfile({ id: "conn-mine", name: "Mine", providerId: "openai" });
  await store.savePersona({ id: "persona-me", name: "Me" });
  await store.saveLorebook({ id: "book-1", name: "Old Roads", entries: [] });
  await store.saveLorebook({ id: "book-2", name: "Story lore", entries: [] });
  await store.saveCharacter({ id: "char-1", name: "Lyra", description: "A ranger.", lorebookIds: ["book-1"] });
  await store.setAvatar("char-1", PNG);
  await store.savePreset({ id: "preset-1", name: "Long replies", blocks: [] });
  await store.saveNarrator({ id: "narr-1", name: "Grim Teller", instructions: "Tell it grim." });
  await store.setAvatar("narr-1", PNG);
  await store.saveTrackerSchema({ id: "set-mood", name: "Moods", trackerId: "agent-moods", fields: FIELDS });
  await store.saveAgentConfig({ id: "agent-moods", name: "Moods", triggers: [{ on: "turn", phase: "after" }], output: "state",
    input: { state: ["agent-moods"] }, state: { namespace: "agent-moods", schemaId: "set-mood" }, connectionId: "conn-mine" });
  await store.saveAgentConfig({ id: "agent-reader", name: "Reader", triggers: [{ on: "turn", phase: "after" }], output: "note",
    input: { readsAgents: ["agent-moods"] }, conditions: { state: [{ path: "agent-moods.mood", equals: "sad" }] } });
  await store.saveStory({
    id: "story-1", name: "The Long Road", narrator: { kind: "vault", id: "narr-1" }, npcIds: ["npc-1"],
    cast: [{ characterId: "char-1" }], scenario: "A road.", createdAt: 1,
    setup: {
      presetId: "preset-1", personaId: "persona-me", connectionId: "conn-mine",
      lorebooks: { mode: "add", add: ["book-2"], remove: [] }, agents: { mode: "add", add: ["agent-reader"], remove: [] },
      agentOverrides: { "agent-moods": { schemaId: "set-mood", connectionId: "conn-mine" } },
    },
    lorePatches: { "book-1": { entries: {}, removed: [], meta: {} } },
  });
  await store.setAvatar("story-1", PNG);
  await store.saveNpc({ id: "npc-1", name: "Old Tom", storyId: "story-1", schemaId: "set-mood", values: { mood: "gruff" } });
  await saveDirectorProfiles(store, [DEFAULT_DIRECTOR, { ...DEFAULT_DIRECTOR, id: "dir-road", name: "Road Director", connectionId: "conn-mine" }]);
  await saveDirectorLinks(store, { defaultId: "", stories: { "story-1": "dir-road" } });
}

const roundTrip = async (from: SqlStore, roots: Parameters<typeof collectBundle>[1]) => {
  const file = bundleFile(await collectBundle(from, roots), "x");
  return parseBundle(new TextDecoder().decode(file.bytes));
};

describe("exporting", () => {
  it("a story brings everything it needs, never connections or personas", async () => {
    const { store } = await newTestStore();
    await seed(store);
    const b = await collectBundle(store, [{ kind: "story", id: "story-1" }]);
    expect(b.stories.map((x) => x.id)).toEqual(["story-1"]);
    expect(b.narrators.map((x) => x.id)).toEqual(["narr-1"]);
    expect(b.npcs.map((x) => x.id)).toEqual(["npc-1"]);
    expect(b.characters.map((x) => x.id)).toEqual(["char-1"]);
    expect(b.lorebooks.map((x) => x.id).sort()).toEqual(["book-1", "book-2"]);
    expect(b.presets.map((x) => x.id)).toEqual(["preset-1"]);
    expect(b.agents.map((x) => x.id).sort()).toEqual(["agent-moods", "agent-reader"]);
    expect(b.trackerSchemas.map((x) => x.id)).toEqual(["set-mood"]);
    expect(b.directors.map((x) => x.id)).toEqual(["dir-road"]);
    expect(b.directorLinks).toEqual({ "story-1": "dir-road" });
    expect(Object.keys(b.avatars).sort()).toEqual(["char-1", "narr-1", "story-1"]);
    const text = JSON.stringify(b);
    expect(text).not.toContain("Mine"); // the connection's name
    expect(text).not.toContain("\"Me\""); // the persona
  });

  it("names the file after the item and says it is a Homunculus file", async () => {
    const { store } = await newTestStore();
    await seed(store);
    const f = bundleFile(await collectBundle(store, [{ kind: "narrator", id: "narr-1" }]), "Grim Teller");
    expect(f.fileName).toBe("Grim-Teller.h2.json");
    expect(isBundleText(new TextDecoder().decode(f.bytes))).toBe(true);
    expect(isBundleText('{"spec":"chara_card_v2"}')).toBe(false);
  });

  it("refuses an item that doesn't exist", async () => {
    const { store } = await newTestStore();
    await expect(collectBundle(store, [{ kind: "kit", id: "nope" }])).rejects.toThrow(/Kit was not found/);
  });
});

describe("importing into another install", () => {
  it("keeps every id and link, and drops what the install doesn't have", async () => {
    const a = await newTestStore(); const b = await newTestStore();
    await seed(a.store);
    const file = await roundTrip(a.store, [{ kind: "story", id: "story-1" }]);
    const r = await importBundle(b.store, file, "road.h2.json");
    expect(r.roots).toEqual([{ kind: "story", id: "story-1", name: "The Long Road", what: "story" }]);
    expect(r.added).toMatchObject({ story: 1, narrator: 1, NPC: 1, character: 1, lorebook: 2, preset: 1, agent: 2, "field set": 1, Director: 1 });
    const st = (await b.store.getStory("story-1"))!;
    expect(st.narrator).toEqual({ kind: "vault", id: "narr-1" });
    expect(st.setup.presetId).toBe("preset-1");
    expect(st.setup.personaId).toBeUndefined();
    expect(st.setup.connectionId).toBeUndefined();
    expect(st.setup.agentOverrides).toEqual({ "agent-moods": { schemaId: "set-mood" } });
    expect(Object.keys(st.lorePatches)).toEqual(["book-1"]);
    expect((await b.store.getCharacter("char-1"))!.lorebookIds).toEqual(["book-1"]);
    expect((await b.store.npcs.get("npc-1"))!.storyId).toBe("story-1");
    const moods = (await b.store.agentConfigs.get("agent-moods"))!;
    expect(moods.connectionId).toBeNull();
    expect(moods.source).toEqual({ kind: "imported", from: "road.h2.json" });
    expect(await b.store.getAvatar("narr-1")).toEqual(PNG);
    expect((await directorProfiles(b.store)).find((d) => d.id === "dir-road")?.connectionId).toBe("");
    expect((await directorLinks(b.store)).stories).toEqual({ "story-1": "dir-road" });
    expect(r.notes.join(" ")).toMatch(/Connections are never in the file/);
  });
});

describe("importing into the same install", () => {
  it("a story comes in as a copy that uses the cards, books and agents already here", async () => {
    const { store } = await newTestStore();
    await seed(store);
    const file = await roundTrip(store, [{ kind: "story", id: "story-1" }]);
    // the same story: nothing to add
    expect((await importBundle(store, file)).roots[0]!.id).toBe("story-1");
    expect((await store.listStories()).length).toBe(1);
    // changed here since: the file's version comes in beside it
    await store.saveStory({ ...(await store.getStory("story-1"))!, scenario: "Changed here." });
    const r = await importBundle(store, file);
    const copy = r.roots[0]!;
    expect(copy.id).not.toBe("story-1");
    expect(copy.name).toBe("The Long Road (imported)");
    expect(r.reused).toMatchObject({ character: 1, lorebook: 2, preset: 1, narrator: 1, agent: 2, "field set": 1 });
    expect((await store.listCharacters()).length).toBe(1);
    const st = (await store.getStory(copy.id))!;
    expect(st.cast[0]!.characterId).toBe("char-1");
    expect(st.setup.connectionId).toBe("conn-mine"); // the connection exists here
    expect(st.setup.personaId).toBe("persona-me");
    // its own NPC came as a copy in the new story's folder (identical: so the one here is used)
    expect(st.npcIds).toEqual(["npc-1"]);
    expect(await store.getAvatar(copy.id)).toEqual(PNG);
    expect((await directorLinks(store)).stories[copy.id]).toBe("dir-road");
  });

  it("a picked item that is the same as the one here is not duplicated; a changed one comes as a copy", async () => {
    const { store } = await newTestStore();
    await seed(store);
    const file = await roundTrip(store, [{ kind: "narrator", id: "narr-1" }]);
    let r = await importBundle(store, file);
    expect(r.roots[0]!.id).toBe("narr-1");
    expect(r.reused).toEqual({ narrator: 1 });
    await store.saveNarrator({ ...(await store.narrators.get("narr-1"))!, instructions: "Changed here." });
    r = await importBundle(store, file);
    const copy = (await store.narrators.get(r.roots[0]!.id))!;
    expect(copy.id).not.toBe("narr-1");
    expect(copy.name).toBe("Grim Teller (imported)");
    expect(copy.instructions).toBe("Tell it grim.");
    expect(await store.getAvatar(copy.id)).toEqual(PNG);
  });

  it("a tracker copy gets its own field sets and namespace, and the agents that read it follow", async () => {
    const { store } = await newTestStore();
    await seed(store);
    const file = await roundTrip(store, [{ kind: "agent", id: "agent-reader" }]);
    expect(file.agents.map((a) => a.id).sort()).toEqual(["agent-moods", "agent-reader"]);
    // change both here, so both come in as copies
    for (const id of ["agent-moods", "agent-reader"]) await store.saveAgentConfig({ ...(await store.agentConfigs.get(id))!, help: "edited" });
    const bundle = { ...file, roots: [{ kind: "agent" as const, id: "agent-reader" }, { kind: "agent" as const, id: "agent-moods" }] };
    const r = await importBundle(store, bundle);
    const reader = (await store.agentConfigs.get(r.roots[0]!.id))!;
    const moods = (await store.agentConfigs.get(r.roots[1]!.id))!;
    expect(moods.id).toMatch(/^agent-/);
    expect(moods.id).not.toBe("agent-moods");
    expect(moods.state!.namespace).toBe(moods.id);
    expect(moods.state!.schemaId).not.toBe("set-mood");
    expect((await store.trackerSchemas.get(moods.state!.schemaId!))!.trackerId).toBe(moods.id);
    expect(reader.input.readsAgents).toEqual([moods.id]);
    expect(reader.conditions.state[0]!.path).toBe(`${moods.id}.mood`);
    expect((await store.trackerSchemas.get("set-mood"))!.trackerId).toBe("agent-moods");
  });

  it("a built-in agent this install doesn't have is left out", async () => {
    const a = await newTestStore(); const b = await newTestStore();
    await a.store.saveAgentConfig({ id: "builtin-x", name: "Built in", triggers: [{ on: "manual" }], output: "note", runMode: "code", source: { kind: "builtin" } });
    const r = await importBundle(b.store, await roundTrip(a.store, [{ kind: "agent", id: "builtin-x" }]));
    expect(r.roots).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/Left out the agent “Built in”/);
    expect(await b.store.agentConfigs.get("builtin-x")).toBeUndefined();
  });
});

describe("reading a file", () => {
  it("explains files it can't use", () => {
    expect(() => parseBundle("nope")).toThrow(/not valid JSON/);
    expect(() => parseBundle('{"format":"homunculus-chat"}')).toThrow(/Homunculus chat/);
    expect(() => parseBundle('{"spec":"chara_card_v2"}')).toThrow(/not a Homunculus file/);
    expect(() => parseBundle('{"format":"homunculus-bundle","version":9}')).toThrow(/newer Homunculus/);
    expect(() => parseBundle('{"format":"homunculus-bundle","version":1,"narrators":[{"id":""}]}')).toThrow(/can't be read/);
  });

  it("counts in words", () => {
    expect(countsText({ character: 2, lorebook: 1, story: 1 })).toBe("2 characters, 1 lorebook and 1 story");
  });
});
