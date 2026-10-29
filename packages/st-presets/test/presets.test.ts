// Tests of the SillyTavern preset importer/exporter. Author: CLAUDE, 2026-10-28.
// The fixture follows SillyTavern's own default/content/presets/openai/Default.json (shortened);
// the last test reads the real file when the reference projects are downloaded (npm run refs).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Character, Preset } from "@homunculus/schemas";
import { buildPrompt } from "@homunculus/core";
import { exportStPreset, importStPreset } from "../src/index.ts";

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const st = {
  chat_completion_source: "openrouter", openrouter_model: "some/model",
  temperature: 0.9, top_p: 0.95, top_k: 40, frequency_penalty: 0, openai_max_context: 16000, openai_max_tokens: 500,
  scenario_format: "[Scenario: {{scenario}}]", personality_format: "{{char}}'s personality: {{personality}}", wi_format: "[Lore: {0}]",
  new_chat_prompt: "[Start a new Chat]", new_example_chat_prompt: "[Example Chat]", squash_system_messages: true,
  prompts: [
    { name: "Main Prompt", system_prompt: true, role: "system", content: "Write {{char}}'s next reply.", identifier: "main" },
    { identifier: "chatHistory", name: "Chat History", system_prompt: true, marker: true },
    { identifier: "charPersonality", name: "Char Personality", system_prompt: true, marker: true },
    { identifier: "summary", name: "Summary", system_prompt: true, marker: true },
    { identifier: "reminder", name: "Reminder", role: "user", content: "Stay in character.", injection_position: 1, injection_depth: 2, injection_order: 120, injection_trigger: ["normal", "regenerate"] },
    { identifier: "unused", name: "Unused", role: "system", content: "Never ordered." },
  ],
  prompt_order: [
    { character_id: 100000, order: [{ identifier: "main", enabled: true }] },
    { character_id: 100001, order: [
      { identifier: "main", enabled: true }, { identifier: "charPersonality", enabled: true }, { identifier: "summary", enabled: true },
      { identifier: "chatHistory", enabled: true }, { identifier: "reminder", enabled: false }, { identifier: "ghost", enabled: true },
    ] },
    { character_id: 4242, order: [{ identifier: "main", enabled: false }] },
  ],
};

describe("SillyTavern presets", () => {
  it("import: the global order, switches, markers, depth blocks, triggers, samplers, formats and what was left out", () => {
    const { preset, warnings } = importStPreset(enc(st), "My Preset.json");
    const p = Preset.parse(preset);
    expect(p.name).toBe("My Preset");
    expect(p.blocks.map((b) => `${b.enabled ? "+" : "-"}${b.id}${b.marker ? "*" : ""}`)).toEqual(["+main", "+charPersonality*", "+summary", "+chatHistory*", "-reminder", "-unused"]);
    expect(p.blocks.find((b) => b.id === "reminder")).toMatchObject({ role: "user", position: "depth", depth: 2, order: 120, triggers: ["normal", "swipe"] });
    expect(p.params).toEqual({ temperature: 0.9, topP: 0.95, maxTokens: 500, topK: 40 });
    expect(p).toMatchObject({ contextSize: 16000, squashSystem: true, formats: { scenario: "[Scenario: {{scenario}}]", worldInfo: "[Lore: {0}]" }, prompts: { newChat: "[Start a new Chat]" } });
    expect(warnings.join("\n")).toMatch(/"Summary" is filled by a SillyTavern feature/);
    expect(warnings.join("\n")).toMatch(/no such prompt.*ghost|ghost.*no such prompt/);
    expect(warnings.join("\n")).toMatch(/service and model .* not imported/);

    const built = buildPrompt({ preset: p, generationType: "normal", character: Character.parse({ id: "c", name: "Lyra", personality: "Dry." }), sessionScenario: "",
      history: [], names: { char: "Lyra", user: "Dan" }, scene: [], injections: [], inline: [], reserve: 0 });
    expect(built.parts.map((x) => x.content)).toEqual(["Write Lyra's next reply.", "Lyra's personality: Dry.", "[Start a new Chat]"]);
  });

  it("export: SillyTavern reads back the same order and settings, and nothing it had is lost", () => {
    const p = Preset.parse(importStPreset(enc(st), "My Preset.json").preset);
    const edited = Preset.parse({ ...p, params: { ...p.params, temperature: 1.1 }, blocks: [...p.blocks.map((b) => (b.id === "reminder" ? { ...b, enabled: true } : b)), { id: "scene", marker: "scene", name: "Current Scene" }] });
    const { json, warnings } = exportStPreset(edited);
    const order = (json.prompt_order as Array<{ character_id: number; order: Array<{ identifier: string; enabled: boolean }> }>);
    expect(order.find((o) => o.character_id === 100001)!.order.find((x) => x.identifier === "reminder")!.enabled).toBe(true);
    expect(order.some((o) => o.character_id === 4242)).toBe(true); // other characters' orders are kept
    expect(json).toMatchObject({ temperature: 1.1, openrouter_model: "some/model", top_k: 40, openai_max_context: 16000, wi_format: "[Lore: {0}]" });
    expect((json.prompts as Array<{ identifier: string }>).some((x) => x.identifier === "scene")).toBe(false);
    expect(warnings.join(" ")).toMatch(/Homunculus-only/);
    // and it imports again to the same thing
    const again = Preset.parse(importStPreset(enc(json), "My Preset.json").preset);
    expect(again.blocks.map((b) => [b.id, b.enabled, b.position])).toEqual(edited.blocks.filter((b) => b.id !== "scene").map((b) => [b.id, b.enabled, b.position]));
  });

  it("explains files that are not Chat Completion presets", () => {
    expect(() => importStPreset(new TextEncoder().encode("{oops"), "x.json")).toThrow(/not valid JSON/);
    expect(() => importStPreset(enc({ temp: 1, rep_pen: 1.1 }), "textgen.json")).toThrow(/not a SillyTavern Chat Completion preset/);
  });

  const real = ".refs/sillytavern/default/content/presets/openai/Default.json";
  it.skipIf(!existsSync(real))("SillyTavern's own Default preset imports and gives SillyTavern's prompt", () => {
    const p = Preset.parse(importStPreset(readFileSync(real), "Default.json").preset);
    expect(p.blocks.filter((b) => b.enabled).map((b) => b.id)).toContain("chatHistory");
    const built = buildPrompt({ preset: p, generationType: "normal", character: Character.parse({ id: "c", name: "Lyra", description: "Ranger." }), sessionScenario: "",
      history: [], names: { char: "Lyra", user: "Dan" }, scene: [], injections: [], inline: [], reserve: 300 });
    expect(built.parts[0]!.content).toBe("Write Lyra's next reply in a fictional chat between Lyra and Dan.");
    expect(built.parts[1]!.content).toBe("Ranger.");
  });
});
