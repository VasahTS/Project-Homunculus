// Tests of slice 2: macros, building the prompt from a preset, the context budget, and the turn using
// the session's preset. Author: CLAUDE, 2026-10-28.
import { describe, expect, it } from "vitest";
import { Character, Preset, type Message } from "@homunculus/schemas";
import { buildPrompt, DEFAULT_PRESET, expandMacros, squashSystem, type BuildPromptInput } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

describe("macros", () => {
  const ctx = { char: "Lyra", user: "Dan", description: "A ranger.", state: { world: { time: "21:40", weather: { sky: "rain" } } } };
  it("fill names, card fields, state, variables, and keep unknown ones as written", () => {
    expect(expandMacros("{{char}} meets {{user}}. <BOT>/<USER>. {{description}}", ctx)).toBe("Lyra meets Dan. Lyra/Dan. A ranger.");
    expect(expandMacros("It is {{state.world.time}}; {{state::world.weather.sky}}.", ctx)).toBe("It is 21:40; rain.");
    expect(expandMacros("{{setvar::mood::calm}}Mood: {{getvar::mood}}. {{incvar::n}}{{incvar::n}}", ctx)).toBe("Mood: calm. 12");
    expect(expandMacros("{{// a note}}A{{newline}}B {{unknownMacro::x}}", ctx)).toBe("A\nB {{unknownMacro::x}}");
    expect(expandMacros("  x {{trim}}  ", ctx)).toBe("x");
  });
  it("random, roll and pick; pick is the same for the same seed (stable across swipes)", () => {
    const rnd = () => 0.99;
    expect(expandMacros("{{random::a::b::c}} {{random:x,y}} {{roll:1d6}} {{roll::2d10+3}}", { ...ctx, random: rnd })).toBe("c y 6 23");
    const a = expandMacros("{{pick::red::green::blue::gold}}", { ...ctx, seed: "msg-1" });
    expect(expandMacros("{{pick::red::green::blue::gold}}", { ...ctx, seed: "msg-1" })).toBe(a);
    expect(["red", "green", "blue", "gold"]).toContain(a);
    expect(expandMacros("{{getvar::{{char}}}}", { ...ctx, vars: new Map([["Lyra", "found"]]) })).toBe("found");
  });
});

const char = Character.parse({
  id: "c", name: "Lyra", description: "A ranger.", personality: "Dry.", scenario: "At the mill.", exampleMessages: "<START>\n{{char}}: Hm.",
});
const msg = (i: number, user: boolean, content = `message ${i}`): Message => ({
  id: `m${i}`, sessionId: "s", parentId: null, speaker: user ? { kind: "user" } : { kind: "character", characterId: "c" },
  kind: user ? "user" : "reply", visibility: { ai: "full", user: true }, content, createdAt: i, meta: {},
});
const base = (over: Partial<BuildPromptInput> = {}): BuildPromptInput => ({
  preset: DEFAULT_PRESET, generationType: "normal", character: char, sessionScenario: "",
  history: [msg(1, true), msg(2, false), msg(3, true)], names: { char: "Lyra", user: "Dan" },
  scene: [], injections: [], inline: [], reserve: 0, ...over,
});

describe("building the prompt from a preset", () => {
  it("the default preset gives the card, the persona, the scene and the chat, in order, with sources", () => {
    const r = buildPrompt(base({
      persona: { name: "Dan", description: "A traveller.", placement: { position: "inPrompt", depth: 2, role: "system" } },
      scene: [{ agentId: "world", text: "Time: dusk" }],
    }));
    expect(r.parts.map((p) => p.source)).toEqual([
      "block:Main Prompt", "card:description", "card:personality", "card:scenario", "card:examples", "persona", "state:world", "history", "history", "history",
    ]);
    expect(r.parts[1]!.content).toBe("Description:\nA ranger.");
    expect(r.parts[4]!.content).toBe("Example dialogue:\n<START>\nLyra: Hm.");
    expect(r.notes).toEqual([]);
    // squashed for sending: one system message, then the chat
    expect(squashSystem(r.parts).map((p) => p.role)).toEqual(["system", "user", "assistant", "user"]);
  });

  it("a card's system prompt replaces Main ({{original}} = the preset's text); post-history replaces Post-History Instructions", () => {
    const c = Character.parse({ ...char, systemPrompt: "Card rules. {{original}}", postHistoryInstructions: "Be brief, {{user}}." });
    const r = buildPrompt(base({ character: c }));
    expect(r.parts[0]).toMatchObject({ source: "card:systemPrompt", content: "Card rules. You are Lyra. Stay in character and continue the roleplay with Dan." });
    expect(r.parts.at(-1)).toEqual({ role: "system", content: "Be brief, Dan.", source: "postHistory" });
    // a block that forbids overrides keeps its own text
    const strict = Preset.parse({ ...DEFAULT_PRESET, blocks: DEFAULT_PRESET.blocks.map((b) => (b.id === "main" ? { ...b, noOverride: true } : b)) });
    expect(buildPrompt(base({ preset: strict, character: c })).parts[0]!.source).toBe("block:Main Prompt");
  });

  it("blocks at a depth go inside the chat (higher order first), and triggers pick when a block is used", () => {
    const p = Preset.parse({ id: "p", name: "P", blocks: [
      { id: "chatHistory", marker: "chatHistory" },
      { id: "a", name: "A", content: "A", position: "depth", depth: 1, order: 50 },
      { id: "b", name: "B", content: "B", position: "depth", depth: 1, order: 200, role: "user" },
      { id: "z", name: "Z", content: "Z", position: "depth", depth: 0 },
      { id: "swipeOnly", name: "S", content: "S", triggers: ["swipe"] },
    ] });
    const r = buildPrompt(base({ preset: p }));
    expect(r.parts.map((x) => x.content)).toEqual(["message 1", "message 2", "B", "A", "message 3", "Z"]);
    expect(buildPrompt(base({ preset: p, generationType: "swipe" })).parts.at(-1)!.content).toBe("S");
  });

  it("leaves out the oldest messages when the context is full, and says so", () => {
    const long = Array.from({ length: 30 }, (_, i) => msg(i, i % 2 === 0, "x".repeat(360))); // ~104 tokens each
    const p = Preset.parse({ ...DEFAULT_PRESET, contextSize: 1500 });
    const r = buildPrompt(base({ preset: p, history: long, reserve: 300 }));
    const kept = r.parts.filter((x) => x.source === "history").length;
    expect(kept).toBeGreaterThan(5);
    expect(kept).toBeLessThan(30);
    expect(r.budget).toMatchObject({ limit: 1500, reserved: 300, droppedMessages: 30 - kept });
    expect(r.budget.used + 300).toBeLessThanOrEqual(1500);
    expect(r.notes.join(" ")).toMatch(/older message\(s\) were left out/);
  });

  it("puts the scene before the chat when the preset has no place for it, and explains a missing chat history", () => {
    const noScene = Preset.parse({ id: "p", name: "P", blocks: [{ id: "main", content: "Hi" }, { id: "chatHistory", marker: "chatHistory" }] });
    const r = buildPrompt(base({ preset: noScene, scene: [{ agentId: "w", text: "Rain" }] }));
    expect(r.parts.map((x) => x.source)).toEqual(["block:main", "state:w", "history", "history", "history"]);
    expect(r.notes[0]).toMatch(/Current Scene was placed automatically/);
    const noHistory = Preset.parse({ id: "p", name: "P", blocks: [{ id: "main", content: "Hi" }] });
    expect(buildPrompt(base({ preset: noHistory })).notes.join(" ")).toMatch(/no Chat History block/);
  });

  it("formats, new-chat text, example-chat text and prefill come from the preset", () => {
    const p = Preset.parse({
      id: "p", name: "P",
      blocks: [{ id: "d", marker: "charDescription" }, { id: "e", marker: "dialogueExamples" }, { id: "h", marker: "chatHistory" }],
      formats: { description: "[{{char}}: {{description}}]" },
      prompts: { newChat: "[Start a new Chat]", newExampleChat: "[Example Chat]", prefill: "*{{char}}" },
    });
    const r = buildPrompt(base({ preset: p }));
    expect(r.parts[0]!.content).toBe("[Lyra: A ranger.]");
    expect(r.parts[1]!.content).toBe("[Example Chat]\nLyra: Hm.");
    expect(r.parts[2]).toEqual({ role: "system", content: "[Start a new Chat]", source: "history" });
    expect(r.parts.at(-1)).toEqual({ role: "assistant", content: "*Lyra", source: "prefill" });
  });
});

describe("the turn uses the session's preset", () => {
  it("prompt, samplers and the reply record follow the preset; preview builds the same prompt without sending", async () => {
    const { store, chat, ai } = await world(() => "Hello.");
    await store.savePreset({
      id: "terse", name: "Terse", params: { temperature: 1.3 }, squashSystem: false,
      blocks: [{ id: "main", content: "Write as {{char}}. Model: {{model}}." }, { id: "chatHistory", marker: "chatHistory" }],
    });
    const { session } = await chat.createSession({ title: "S", characterIds: ["lyra"] });
    await store.saveSession({ ...session, setup: { presetId: "terse" } });
    const preview = await chat.turns.previewPrompt(session.id, null, connection, { userText: "Hi" });
    expect(preview.parts.map((p) => p.content)).toEqual(["Write as Lyra. Model: fake-1.", "Hi"]);
    expect(preview.presetName).toBe("Terse");
    expect(ai.prompts).toHaveLength(0); // nothing was sent

    const { reply } = await chat.send(session.id, null, "Hi", connection);
    expect(ai.prompts[0]).toEqual([{ role: "system", content: "Write as Lyra. Model: fake-1." }, { role: "user", content: "Hi" }]);
    const rec = await store.getGenerationRecord(reply.id);
    expect(rec).toMatchObject({ presetId: "terse", params: { temperature: 1.3 }, budget: { droppedMessages: 0 } });
  });

  it("without a preset the built-in default is used, so old sessions keep the same prompt", async () => {
    const { chat, ai } = await world(() => "Hello.");
    const { session } = await chat.createSession({ title: "S", characterIds: ["lyra"] });
    await chat.send(session.id, null, "Hi", connection);
    expect(ai.prompts[0]![0]!.content).toContain("You are Lyra. Stay in character");
    expect(ai.prompts[0]![0]!.content).toContain("Description:\nA wary ranger.");
  });
});
