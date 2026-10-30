// Prompt scope, inheritance and narrator placement regressions. CODEX, D-042.
import { describe, expect, it } from "vitest";
import { Character, Message, Preset, SetupLayer } from "@homunculus/schemas";
import { applyPresetOverride, buildPrompt, mergePresetOverride, NARRATOR_PROMPT_DEFAULTS, resolveSetup, withPresetBlockOverride, withPresetOrderOverride, withoutPresetOverride, type BuildPromptInput } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

const preset = Preset.parse({ id: "p", name: "Shared", original: { retained: true }, blocks: [
  { id: "main", name: "Main", content: "Shared instructions." },
  { id: "description", marker: "charDescription" },
  { id: "history", marker: "chatHistory" },
] });
const narrator = Character.parse({ id: "n", name: "Guide", description: "Narrate the journey of {{user}}.", postHistoryInstructions: "Leave a choice." });
const input = (extra: Partial<BuildPromptInput> = {}): BuildPromptInput => ({
  preset, generationType: "normal", character: narrator, names: { char: "Guide", user: "Dan" },
  sessionScenario: "", history: [Message.parse({ id: "m", sessionId: "s", parentId: null, speaker: { kind: "user" }, content: "I enter.", createdAt: 1 })],
  scene: [], injections: [], inline: [], reserve: 100, ...extra,
});

describe("scoped preset edits", () => {
  it("inherits Story patches and narrator placement in the recorded prompt for an actual reply", async () => {
    const { store, chat, ai } = await world(() => "A story reply.");
    await store.savePreset(preset);
    await store.saveStory({ id: "story", name: "Story", createdAt: 1, narrator: { kind: "card", characterId: "lyra" },
      setup: { ...withPresetBlockOverride({ presetId: preset.id }, preset, "main", { content: "STORY SQLITE INSTRUCTIONS." }), narratorPrompt: { position: "system", alsoInChat: true, depth: 0 } } });
    const { session } = await chat.createSession({ storyId: "story" });
    const { reply } = await chat.send(session.id, null, "Begin", connection);
    const record = await store.getGenerationRecord(reply.id);
    expect(record?.prompt.filter((p) => p.source === "narrator:system")).toHaveLength(1);
    expect(record?.prompt.filter((p) => p.source === "narrator:inChat")).toHaveLength(1);
    expect(ai.prompts[0]?.some((m) => m.content.includes("STORY SQLITE INSTRUCTIONS."))).toBe(true);
    expect((await store.getSession(session.id))?.setup.presetOverrides).toBeUndefined();
  });
  it("round-trips local patches through SQLite and uses them in actual generation without changing the preset", async () => {
    const { store, chat, ai } = await world(() => "A reply.");
    await store.savePreset(preset);
    const { session } = await chat.createSession({ characterIds: ["lyra"] });
    const setup = withPresetBlockOverride({ presetId: preset.id }, preset, "main", { content: "LOCAL SQLITE INSTRUCTIONS." });
    await store.saveSession({ ...session, setup });
    expect((await store.getSession(session.id))?.setup).toEqual(setup);
    await chat.send(session.id, null, "Hello", connection);
    expect(ai.prompts[0]?.some((m) => m.content.includes("LOCAL SQLITE INSTRUCTIONS."))).toBe(true);
    expect((await store.presets.get(preset.id))?.blocks[0]?.content).toBe("Shared instructions.");
    await store.saveSession({ ...session, setup: withoutPresetOverride(setup, preset.id) });
    await chat.send(session.id, null, "Hello again", connection);
    expect(ai.prompts[1]?.some((m) => m.content.includes("Shared instructions."))).toBe(true);
    expect(ai.prompts[1]?.some((m) => m.content.includes("LOCAL SQLITE INSTRUCTIONS."))).toBe(false);
  });
  it("old setup JSON keeps the exact existing defaults", () => {
    expect(SetupLayer.parse({})).toEqual({});
    expect(resolveSetup({}).narratorPrompt).toEqual(NARRATOR_PROMPT_DEFAULTS);
    expect(applyPresetOverride(preset, undefined)).toBe(preset);
  });
  it("inherits individual fields, preserves intentional empty/false and isolates presets", () => {
    const setup = resolveSetup({
      story: { presetOverrides: { p: { blocks: { main: { content: "Story", enabled: false } } }, other: { blocks: { main: { content: "Other" } } } } },
      session: { presetOverrides: { p: { blocks: { main: { content: "" } } } } },
    });
    const result = applyPresetOverride(preset, setup.presetOverrides.p);
    expect(result.blocks[0]).toMatchObject({ content: "", enabled: false });
    expect(preset.blocks[0]).toMatchObject({ content: "Shared instructions.", enabled: true });
    expect(setup.sources["presetOverrides:p:main:content"]).toBe("session");
    expect(setup.sources["presetOverrides:p:main:enabled"]).toBe("story");
    expect(result.original).toEqual({ retained: true });
    expect(result.blocks[0]!.content).not.toBe("Other");
  });
  it("restoring one field resumes inheritance without losing the other edits", () => {
    let layer = withPresetBlockOverride({}, preset, "main", { content: "Local", enabled: false });
    layer = withPresetBlockOverride(layer, preset, "main", { content: "Shared instructions." });
    expect(layer.presetOverrides?.p?.blocks?.main).toEqual({ enabled: false });
    expect(withoutPresetOverride({ ...layer, presetOverrides: { ...layer.presetOverrides, other: { order: ["x"] } } }, "p").presetOverrides).toEqual({ other: { order: ["x"] } });
  });
  it("reorders by stable ids and retains new blocks and unknown metadata", () => {
    const layer = withPresetOrderOverride({}, preset, ["history", "main", "description"]);
    const updated = Preset.parse({ ...preset, blocks: [...preset.blocks, { id: "new", content: "New shared block" }] });
    expect(applyPresetOverride(updated, layer.presetOverrides?.p).blocks.map((b) => b.id)).toEqual(["history", "main", "description", "new"]);
    expect(withPresetOrderOverride(layer, preset, preset.blocks.map((b) => b.id))).toEqual({});
  });
  it("UI and turn resolution agree when an explicit order replaces an inherited order", () => {
    const story = { order: ["history", "main", "description"], blocks: { main: { content: "Story" } } };
    const chat = { order: [] as string[], blocks: { main: { enabled: false } } };
    const resolved = resolveSetup({ story: { presetOverrides: { p: story } }, session: { presetOverrides: { p: chat } } });
    expect(applyPresetOverride(preset, mergePresetOverride(story, chat))).toEqual(applyPresetOverride(preset, resolved.presetOverrides.p));
  });
});

describe("narrator prompt placement", () => {
  it("card placement is byte-for-byte compatible with the old prompt", () => {
    expect(buildPrompt(input({ narrator: NARRATOR_PROMPT_DEFAULTS }))).toEqual(buildPrompt(input()));
  });
  it("system placement moves all narrator instructions after Main, without a card duplicate", () => {
    const parts = buildPrompt(input({ narrator: { ...NARRATOR_PROMPT_DEFAULTS, position: "system" } })).parts;
    expect(parts[1]).toMatchObject({ role: "system", source: "narrator:system" });
    expect(parts[1]!.content).toContain("Narrate the journey of Dan.");
    expect(parts[1]!.content).toContain("Leave a choice.");
    expect(parts.some((p) => p.source === "card:description" || p.source === "postHistory")).toBe(false);
  });
  it("depth zero goes after the last message and does not mutate stored history", () => {
    const data = input({ narrator: { ...NARRATOR_PROMPT_DEFAULTS, position: "inChat", depth: 0, role: "assistant", alsoInChat: true } });
    const before = structuredClone(data.history);
    const parts = buildPrompt(data).parts;
    expect(parts.at(-1)).toMatchObject({ source: "narrator:inChat", role: "assistant" });
    expect(parts.filter((p) => p.source.startsWith("narrator:")).length).toBe(1);
    expect(data.history).toEqual(before);
  });
  it("repeats narrator instructions only when the extra chat placement is explicit", () => {
    const parts = buildPrompt(input({ narrator: { ...NARRATOR_PROMPT_DEFAULTS, position: "system", alsoInChat: true } })).parts;
    expect(parts.filter((p) => p.source.startsWith("narrator:")).map((p) => p.source)).toEqual(["narrator:system", "narrator:inChat"]);
  });
  it("warns and retains narrator instructions when a preset lacks a history marker", () => {
    const noHistory = Preset.parse({ ...preset, blocks: preset.blocks.filter((b) => b.marker !== "chatHistory") });
    const result = buildPrompt(input({ preset: noHistory, narrator: { ...NARRATOR_PROMPT_DEFAULTS, position: "inChat" } }));
    expect(result.parts.some((p) => p.source === "narrator:fallback")).toBe(true);
    expect(result.parts.some((p) => p.source === "history")).toBe(false);
    expect(result.notes.join(" ")).toContain("Narrator instructions were sent as a system block");
  });
  it("inherits placement fields individually across the story and its chat", () => {
    const result = resolveSetup({ story: { narratorPrompt: { position: "system", depth: 8 } }, session: { narratorPrompt: { alsoInChat: true } } });
    expect(result.narratorPrompt).toMatchObject({ position: "system", depth: 8, alsoInChat: true });
    expect(result.sources["narratorPrompt.position"]).toBe("story");
    expect(result.sources["narratorPrompt.alsoInChat"]).toBe("session");
  });
});
