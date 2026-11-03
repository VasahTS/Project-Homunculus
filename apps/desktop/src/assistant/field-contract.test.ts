// Assistant field-contract audit: advertised writes, read/edit round-trips and unchanged settings. CODEX, 2026-11-03.
import { describe, expect, it } from "vitest";
import { Character, Lorebook, LoreEntry, Narrator, Story, type AssistantResult } from "@homunculus/schemas";
import { newTestStore } from "../../../../packages/core/test/helpers.ts";
import { applyChange, approveNew, runTool, saveDraftItem, type ToolContext } from "./tools.ts";

async function setup() {
  const { store } = await newTestStore();
  const ctx: ToolContext = { store, saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
  return { store, ctx };
}
const args = JSON.stringify;
async function propose(ctx: ToolContext, id: string, changes: Record<string, unknown>) {
  const out = await runTool("change", args({ id, changes }), ctx);
  expect(out.error, out.result).toBeFalsy();
  return ctx.results.at(-1) as Extract<AssistantResult, { type: "change" }>;
}
describe("Assistant field contract regressions", () => {
  it("editing a narrator preserves NPC permission and the last-turn instruction", async () => {
    const { store, ctx } = await setup();
    await store.saveNarrator(Narrator.parse({ id: "n", name: "N", mayAddNpcs: false, turnInstruction: "Do not advance time." }));
    expect(await applyChange(store, await propose(ctx, "narrator:n", { about: "Updated card blurb." }), ctx.newId)).toBe("applied");
    expect(await store.narrators.get("n")).toMatchObject({ mayAddNpcs: false, turnInstruction: "Do not advance time." });
  });
  it("accepts the advertised narrator style aliases and reads them back", async () => {
    const { store, ctx } = await setup();
    const out = await runTool("create", args({ kind: "narrator", data: { name: "N", pov: "second person", pacing: "slow" } }), ctx);
    expect(out.error).toBeFalsy(); const n = (await store.narrators.list())[0]!;
    expect(n.style).toMatchObject({ pov: "second person", pacing: "slow" });
    expect(JSON.parse((await runTool("read", args({ id: `narrator:${n.id}`, fields: ["pov", "pacing"] }), ctx)).result)).toEqual({ pov: "second person", pacing: "slow" });
    expect(await applyChange(store, await propose(ctx, `narrator:${n.id}`, { tense: "past" }), ctx.newId)).toBe("applied");
    expect((await store.narrators.get(n.id))!.style).toMatchObject({ pov: "second person", pacing: "slow", tense: "past" });
  });
  it("a style-alias proposal detects a concurrent manual style edit", async () => {
    const { store, ctx } = await setup(); const n = Narrator.parse({ id: "n", name: "N", style: { pov: "first" } });
    await store.saveNarrator(n); const p = await propose(ctx, "narrator:n", { pov: "second" });
    await store.saveNarrator({ ...n, style: { ...n.style, pov: "third" } });
    expect(await applyChange(store, p, ctx.newId)).toBe("stale");
  });
  it("refuses a plain-instruction edit that would be ignored behind narrator blocks", async () => {
    const { store, ctx } = await setup();
    await store.saveNarrator(Narrator.parse({ id: "n", name: "N", blocks: [{ id: "role", name: "Role", text: "Old instructions.", on: true }], instructions: "Old instructions." }));
    const out = await runTool("change", args({ id: "narrator:n", changes: { instructions: "New instructions." } }), ctx);
    expect(out.error).toBe(true); expect(out.result).toMatch(/blocks/i); expect(ctx.results).toHaveLength(0);
  });
  it("explicitly clearing narrator blocks allows replacement with plain instructions", async () => {
    const { store, ctx } = await setup();
    await store.saveNarrator(Narrator.parse({ id: "n", name: "N", blocks: [{ id: "role", text: "Old." }], instructions: "Old." }));
    expect(await applyChange(store, await propose(ctx, "narrator:n", { blocks: [], instructions: "New plain instructions." }), ctx.newId)).toBe("applied");
    expect(await store.narrators.get("n")).toMatchObject({ blocks: [], instructions: "New plain instructions." });
  });
  it("reads Kit narrator/lorebook aliases instead of hiding the selected links", async () => {
    const { store, ctx } = await setup();
    await store.kits.save(Story.parse({ id: "k", name: "K", createdAt: 1, narrator: { kind: "vault", id: "n" }, setup: { lorebooks: { mode: "only", add: ["l"], remove: [] } } }));
    const read = await runTool("read", args({ id: "kit:k", fields: ["narratorId", "lorebookIds"] }), ctx);
    expect(JSON.parse(read.result)).toEqual({ narratorId: "n", lorebookIds: ["l"] });
  });
  it("round-tripping a Kit cast retains its version, presence, manual tracking and other member settings", async () => {
    const { store, ctx } = await setup();
    await store.saveCharacter(Character.parse({ id: "c", name: "C", variants: [{ id: "v", label: "Modern", overrides: { scenario: "City" } }] }));
    const k = Story.parse({ id: "k", name: "K", createdAt: 1, cast: [{ characterId: "c", variantId: "v", presence: "offscreen", tracked: false, muted: true, sheet: "Brief custom sheet." }] });
    await store.kits.save(k);
    const cast = JSON.parse((await runTool("read", args({ id: "kit:k", fields: ["cast"] }), ctx)).result).cast;
    expect(await applyChange(store, await propose(ctx, "kit:k", { cast }), ctx.newId)).toBe("applied");
    expect((await store.kits.get("k"))!.cast).toEqual(k.cast);
  });
  it("an empty narratorId switches an existing Kit back to Simple Narrator", async () => {
    const { store, ctx } = await setup();
    await store.kits.save(Story.parse({ id: "k", name: "K", createdAt: 1, narrator: { kind: "vault", id: "custom" } }));
    expect(await applyChange(store, await propose(ctx, "kit:k", { narratorId: "" }), ctx.newId)).toBe("applied");
    expect((await store.kits.get("k"))!.narrator).toEqual({ kind: "vault", id: "simple-narrator" });
  });
  it("updating Kit lorebooks keeps the inheritance mode, exclusions and unrelated setup", async () => {
    const { store, ctx } = await setup();
    await store.kits.save(Story.parse({ id: "k", name: "K", createdAt: 1, setup: { presetId: "p", lorebooks: { mode: "only", add: ["old"], remove: ["excluded"] } } }));
    expect(await applyChange(store, await propose(ctx, "kit:k", { lorebookIds: ["new"] }), ctx.newId)).toBe("applied");
    expect((await store.kits.get("k"))!.setup).toMatchObject({ presetId: "p", lorebooks: { mode: "only", add: ["new"], remove: ["excluded"] } });
  });
  const advanced = { title: "Gate", keys: ["gate"], content: "A locked gate.", logic: "notAny", probability: 35, useProbability: true, role: "user", position: "outlet", outletName: "gates", group: "places", cooldown: 3, sticky: 2, scan: { scenario: true }, conditions: [{ path: "world.gate", op: "equals", value: "open" }] };
  it.each([true, false])("retains advanced lore entry options when saveNew is %s", async (saveNew) => {
    const { store, ctx } = await setup(); ctx.saveNew = saveNew;
    const out = await runTool("create", args({ kind: "lorebook", data: { name: "World", entries: [advanced] } }), ctx);
    expect(out.error).toBeFalsy();
    if (!saveNew) await approveNew(store, ctx.results[0] as Extract<AssistantResult, { type: "new" }>, ctx.newId);
    const b = (await store.lorebooks.list())[0]!;
    expect(b.entries[0]).toMatchObject(advanced);
    const entry = JSON.parse((await runTool("read", args({ id: `lorebook:${b.id}`, fields: [`entry:${b.entries[0]!.id}`] }), ctx)).result);
    expect(entry).toMatchObject(advanced);
  });
  it("advanced lore settings participate in stale checks", async () => {
    const { store, ctx } = await setup(); const b = Lorebook.parse({ id: "l", name: "L", entries: [{ ...advanced, id: "e" }] });
    await store.saveLorebook(b);
    const p = await propose(ctx, "lorebook:l", { entries: { update: [{ id: "e", content: "New content." }] } });
    await store.saveLorebook({ ...b, entries: [{ ...b.entries[0]!, probability: 99 }] });
    expect(await applyChange(store, p, ctx.newId)).toBe("stale");
  });
  it.each([
    { update: [{ id: "missing", content: "Ignored?" }] },
    { update: [{ title: "Same", content: "Both?" }] },
    [{ title: "Replacement array" }],
  ])("refuses lore changes with a missing/ambiguous target or replacement-array format (%j)", async (entries) => {
    const { store, ctx } = await setup();
    await store.saveLorebook(Lorebook.parse({ id: "l", name: "L", entries: ["a", "b"].map(id => ({ id, title: "Same", content: id })) }));
    const out = await runTool("change", args({ id: "lorebook:l", changes: { entries } }), ctx);
    expect(out.error).toBe(true); expect(ctx.results).toHaveLength(0);
  });
  it("a partial Character Note edit retains its existing depth and role", async () => {
    const { store, ctx } = await setup();
    await store.saveCharacter(Character.parse({ id: "c", name: "C", characterNote: { text: "Old.", depth: 12, role: "user" } }));
    expect(await applyChange(store, await propose(ctx, "character:c", { characterNote: { text: "New." } }), ctx.newId)).toBe("applied");
    expect((await store.getCharacter("c"))!.characterNote).toEqual({ text: "New.", depth: 12, role: "user" });
  });
  it("a partial version-note edit retains that version's note placement", async () => {
    const { store, ctx } = await setup();
    await store.saveCharacter(Character.parse({ id: "c", name: "C", characterNote: { text: "Main.", depth: 8, role: "user" }, variants: [{ id: "v", label: "Modern", overrides: { characterNote: { text: "Version.", depth: 15, role: "assistant" } } }] }));
    const p = await propose(ctx, "character:c", { variants: { update: [{ id: "v", characterNote: { text: "New version note." } }] } });
    expect(await applyChange(store, p, ctx.newId)).toBe("applied");
    expect((await store.getCharacter("c"))!.variants[0]!.overrides.characterNote).toEqual({ text: "New version note.", depth: 15, role: "assistant" });
  });
  it("lore updates merge partial scan/filter settings and retain original import data", async () => {
    const { store, ctx } = await setup();
    const b = Lorebook.parse({ id: "l", name: "L", entries: [LoreEntry.parse({ ...advanced, id: "e", scan: { scenario: true, characterDescription: true }, characterFilter: { names: ["C"], tags: ["Fantasy"], exclude: true }, original: { extra: "keep" } })] });
    await store.saveLorebook(b);
    expect(await applyChange(store, await propose(ctx, "lorebook:l", { entries: { update: [{ id: "e", scan: { scenario: false }, characterFilter: { tags: ["City"] } }] } }), ctx.newId)).toBe("applied");
    expect((await store.lorebooks.get("l"))!.entries[0]).toMatchObject({ scan: { scenario: false, characterDescription: true }, characterFilter: { names: ["C"], tags: ["City"], exclude: true }, original: { extra: "keep" } });
  });
  it("valid draft changes use the same contract and reject unknown/mismatched targets", async () => {
    const { store, ctx } = await setup();
    await store.saveCharacter(Character.parse({ id: "c", name: "C", characterNote: { text: "Old.", depth: 12, role: "user" } }));
    expect(await saveDraftItem(store, "character", { id: "character:c", characterNote: { text: "Draft note." } }, ctx.newId)).toMatchObject({ type: "change", status: "applied" });
    expect((await store.getCharacter("c"))!.characterNote).toMatchObject({ depth: 12, role: "user" });
    await expect(saveDraftItem(store, "narrator", { id: "character:c", name: "Wrong" }, ctx.newId)).rejects.toThrow("does not match");
    await expect(saveDraftItem(store, "character", { id: "character:c", unknownField: 1 }, ctx.newId)).rejects.toThrow("Unknown field");
    expect((await store.getCharacter("c"))!.name).toBe("C");
  });
  it.each([
    { kind: "lorebook", data: { name: "L", entries: [], title: "Misplaced entry title" } },
    { kind: "tracker", data: { name: "T", fields: [{ label: "Time", type: "text" }], display: "header" } },
  ])("refuses nested-only options misplaced at the root (%j)", async (a) => {
    const { ctx } = await setup(); expect((await runTool("create", args(a), ctx)).error).toBe(true);
  });
  it.each([
    { kind: "character", data: { name: "C", firstMessages: "not an array" } },
    { kind: "narrator", data: { name: "N", style: { pov: 123 } } },
    { kind: "tracker", data: { name: "T", fields: [{ label: "X", type: "imaginary" }] } },
  ])("returns invalid new-item data to the model before approval (%j)", async (a) => {
    const { ctx } = await setup(); ctx.saveNew = false;
    expect((await runTool("create", args(a), ctx)).error).toBe(true); expect(ctx.results).toHaveLength(0);
  });
  it("an exact lore entry id wins over another entry's matching title", async () => {
    const { store, ctx } = await setup();
    await store.saveLorebook(Lorebook.parse({ id: "l", name: "L", entries: [{ id: "entry-a", title: "First", content: "Keep?" }, { id: "entry-b", title: "entry-a", content: "Keep." }] }));
    const p = await propose(ctx, "lorebook:l", { entries: { update: [{ id: "entry-a", content: "Changed." }] } });
    expect(await applyChange(store, p, ctx.newId)).toBe("applied");
    expect((await store.lorebooks.get("l"))!.entries.map(e => e.content)).toEqual(["Changed.", "Keep."]);
  });
});
