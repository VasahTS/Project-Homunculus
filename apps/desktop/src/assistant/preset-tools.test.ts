// The Assistant creates presets and edits them only as copies (D-103). Author: CLAUDE, 2026-11-08.
import { describe, expect, it } from "vitest";
import { Preset, type AssistantResult } from "@homunculus/schemas";
import { DEFAULT_PRESET } from "@homunculus/core";
import { newTestStore } from "../../../../packages/core/test/helpers.ts";
import { approveNew, runTool, saveDraftItem, undoCreate, type ToolContext } from "./tools.ts";
import { DRAFT_BLOCK, GUIDES } from "./guides.ts";

async function setup(saveNew = true) {
  const { store } = await newTestStore();
  const ctx: ToolContext = { store, saveNew, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
  return { store, ctx };
}
const args = JSON.stringify;
const SOURCE = Preset.parse({
  id: "src", name: "Story Mode", description: "Imported.", contextSize: 16000, params: { temperature: 0.9, topP: 0.95 },
  blocks: [
    { id: "main", name: "Main Prompt", content: "Write the story." },
    { id: "charDescription", name: "Char Description", marker: "charDescription" },
    { id: "chatHistory", name: "Chat History", marker: "chatHistory" },
    { id: "jailbreak", name: "Post-History Instructions", content: "Stay in character." },
  ],
  regexScripts: [{ id: "r1", name: "Trim", find: "/x/g", replace: "" }],
  original: { prompts: [] },
});

describe("Assistant presets (D-103)", () => {
  it("change on a preset saves an edited copy and leaves the original untouched", async () => {
    const { store, ctx } = await setup();
    await store.savePreset(SOURCE);
    const out = await runTool("change", args({ id: "preset:src", summary: "Shorter replies", changes: {
      params: { temperature: 0.7, topP: null },
      blocks: { update: [{ id: "main", content: "Write short, vivid replies." }], add: [{ name: "Style", content: "Use past tense.", after: "main" }] },
    } }), ctx);
    expect(out.error, out.result).toBeFalsy();
    expect(out.result).toMatch(/original preset:src is unchanged/);
    expect(await store.presets.get("src")).toEqual(SOURCE);
    const card = ctx.results.at(-1) as Extract<AssistantResult, { type: "created" }>;
    expect(card).toMatchObject({ type: "created", kind: "preset", name: "Story Mode (copy)" });
    expect(card.detail).toMatch(/copy of “Story Mode”.*Shorter replies/);
    const copy = (await store.presets.get(card.itemId))!;
    expect(copy.id).not.toBe("src");
    expect(copy.blocks.map((b) => b.name)).toEqual(["Main Prompt", "Style", "Char Description", "Chat History", "Post-History Instructions"]);
    expect(copy.blocks[0]!.content).toBe("Write short, vivid replies.");
    expect(copy.params).toEqual({ temperature: 0.7 });
    // everything else comes along: context, regex scripts, the imported original for export
    expect(copy).toMatchObject({ contextSize: 16000, description: "Imported.", regexScripts: SOURCE.regexScripts, original: SOURCE.original });
    // a second copy gets its own name
    await runTool("change", args({ id: "preset:src", changes: { description: "Again." } }), ctx);
    expect((ctx.results.at(-1) as { name: string }).name).toBe("Story Mode (copy 2)");
  });

  it("undo of a copy moves it to the Trash", async () => {
    const { store, ctx } = await setup();
    await store.savePreset(SOURCE);
    await runTool("change", args({ id: "preset:src", changes: { name: "Mine" } }), ctx);
    const card = ctx.results.at(-1) as Extract<AssistantResult, { type: "created" }>;
    await undoCreate(store, "preset", card.itemId);
    expect((await store.presets.list()).map((p) => p.id)).toEqual(["src"]);
  });

  it("create starts from Homunculus Default, or from another preset with from", async () => {
    const { store, ctx } = await setup();
    await store.savePreset(SOURCE);
    const fresh = await runTool("create", args({ kind: "preset", data: { name: "Fresh", prompts: { prefill: "Okay." } } }), ctx);
    expect(fresh.error, fresh.result).toBeFalsy();
    const made = (await store.presets.list()).find((p) => p.name === "Fresh")!;
    expect(made.blocks.map((b) => b.id)).toEqual(DEFAULT_PRESET.blocks.map((b) => b.id));
    expect(made).toMatchObject({ description: "", contextSize: DEFAULT_PRESET.contextSize, formats: DEFAULT_PRESET.formats, prompts: { prefill: "Okay." } });
    const from = await runTool("create", args({ kind: "preset", data: { from: "preset:src", blocks: { order: ["chatHistory", "main", "charDescription", "jailbreak"] } } }), ctx);
    expect(from.error, from.result).toBeFalsy();
    const copy = (await store.presets.list()).find((p) => p.name === "Story Mode (copy)")!;
    expect(copy.blocks.map((b) => b.id)).toEqual(["chatHistory", "main", "charDescription", "jailbreak"]);
    // Homunculus Default can be the base even when it is not stored
    const def = await runTool("create", args({ kind: "preset", data: { from: `preset:${DEFAULT_PRESET.id}`, name: "From default" } }), ctx);
    expect(def.error, def.result).toBeFalsy();
  });

  it("refuses writes that would break or silently ignore something", async () => {
    const { store, ctx } = await setup();
    await store.savePreset(SOURCE);
    const bad = async (tool: string, a: object, re: RegExp) => { const out = await runTool(tool, args(a), ctx); expect(out.error, out.result).toBe(true); expect(out.result).toMatch(re); };
    await bad("change", { id: "preset:src", changes: { blocks: { remove: ["chatHistory"] } } }, /no Chat History/);
    await bad("change", { id: "preset:src", changes: { blocks: { update: [{ id: "charDescription", content: "text" }] } } }, /filled by the app/);
    await bad("change", { id: "preset:src", changes: { blocks: { order: ["main"] } } }, /every block id/);
    await bad("change", { id: "preset:src", changes: { blocks: { add: [{ id: "main", content: "x" }] } } }, /already a block/);
    await bad("change", { id: "preset:src", changes: { blocks: { update: [{ id: "nope", content: "x" }] } } }, /missing/);
    await bad("change", { id: "preset:src", changes: { regexScripts: [] } }, /Unknown field/);
    await bad("change", { id: "preset:src", changes: { params: { heat: 1 } } }, /Unknown preset params/);
    await bad("change", { id: "preset:src", changes: {} }, /No changes/);
    await bad("create", { kind: "preset", data: { description: "no name" } }, /needs a name/);
    await bad("create", { kind: "preset", data: { from: "preset:missing" } }, /No preset/);
    await bad("propose_trash", { id: "preset:src", reason: "old" }, /can't be proposed/);
    expect(ctx.results).toHaveLength(0);
    expect(await store.presets.list()).toHaveLength(1);
  });

  it("when new items wait for approval, the copy waits too and is saved on OK", async () => {
    const { store, ctx } = await setup(false);
    await store.savePreset(SOURCE);
    const out = await runTool("change", args({ id: "preset:src", changes: { contextSize: null } }), ctx);
    expect(out.error, out.result).toBeFalsy();
    expect(await store.presets.list()).toHaveLength(1);
    const card = ctx.results.at(-1) as Extract<AssistantResult, { type: "new" }>;
    expect(card).toMatchObject({ type: "new", kind: "preset", name: "Story Mode (copy)" });
    const made = await approveNew(store, card, ctx.newId);
    const copy = (await store.presets.get(made.id))!;
    expect(copy.name).toBe("Story Mode (copy)");
    expect(copy.contextSize).toBeUndefined();
    expect(await store.presets.get("src")).toEqual(SOURCE);
  });

  it("a preset draft with an id saves as a copy", async () => {
    const { store, ctx } = await setup();
    await store.savePreset(SOURCE);
    expect([..."```homunculus-preset\n{}\n```".matchAll(DRAFT_BLOCK)]).toHaveLength(1);
    const r = await saveDraftItem(store, "preset", { id: "preset:src", name: "Drafted" }, ctx.newId);
    expect(r).toMatchObject({ type: "created", kind: "preset", name: "Drafted" });
    expect(await store.presets.get("src")).toEqual(SOURCE);
  });

  it("the guide names only fields the app has", async () => {
    const { ctx } = await setup();
    const g = await runTool("guide", args({ kind: "preset" }), ctx);
    expect(g.error).toBeFalsy(); expect(g.result).toContain("EDITED COPY");
    const have = ["from", ...Object.keys(Preset.shape), ...Object.keys((await import("@homunculus/schemas")).PresetBlock.shape)];
    for (const f of GUIDES.preset!.fields) expect(have).toContain(f);
  });
});
