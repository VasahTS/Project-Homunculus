// Library personas are writable Assistant items with the same approval/history/draft guarantees. CODEX, 2026-11-03.
import { describe, expect, it } from "vitest";
import { AssistantChat, Persona, Lorebook, type AssistantResult } from "@homunculus/schemas";
import { newTestStore } from "../../../../packages/core/test/helpers.ts";
import { applyChange, approveNew, runTool, saveDraftItem, undoCreate, type ToolContext } from "./tools.ts";
import { DRAFT_BLOCK, GUIDES } from "./guides.ts";
async function setup() {
  const { store } = await newTestStore();
  const ctx: ToolContext = { store, saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
  return { store, ctx };
}
const args = JSON.stringify;
describe("Assistant library personas", () => {
  it.each([true, false])("creates a complete persona with saveNew=%s without changing the selected persona", async saveNew => {
    const { store, ctx } = await setup(); ctx.saveNew = saveNew;
    await store.saveLorebook(Lorebook.parse({ id: "world", name: "World" }));
    const before = await store.getDefaultSetup();
    const out = await runTool("create", args({ kind: "persona", data: { name: "Rin", description: "An explorer with a green notebook.", placement: { position: "atDepth", depth: 7, role: "user" }, lorebookIds: ["lorebook:world"], variants: [{ label: "Modern", description: "A city explorer." }] } }), ctx);
    expect(out.error, out.result).toBeFalsy();
    if (!saveNew) { expect(await store.personas.list()).toHaveLength(0); await approveNew(store, ctx.results[0] as Extract<AssistantResult, { type: "new" }>, ctx.newId); }
    const p = (await store.personas.list())[0]!;
    expect(p).toMatchObject({ name: "Rin", description: "An explorer with a green notebook.", placement: { position: "atDepth", depth: 7, role: "user" }, lorebookIds: ["world"], variants: [{ label: "Modern", overrides: { description: "A city explorer." } }] });
    expect(await store.getDefaultSetup()).toEqual(before);
    expect(() => AssistantChat.parse({ id: "chat", createdAt: 1, updatedAt: 1, messages: [{ id: "m", role: "assistant", results: ctx.results, createdAt: 1 }] })).not.toThrow();
  });
  it("partial placement changes retain depth/role, versions and original import data", async () => {
    const { store, ctx } = await setup();
    const p = Persona.parse({ id: "p", name: "P", placement: { position: "atDepth", depth: 8, role: "user" }, variants: [{ id: "v", label: "Modern", overrides: { description: "City." }, hasOwnAvatar: true }], original: { keep: true } });
    await store.savePersona(p);
    const out = await runTool("change", args({ id: "persona:p", changes: { description: "New main.", placement: { position: "none" } } }), ctx);
    expect(out.error, out.result).toBeFalsy();
    expect((await store.personas.get("p"))!.description).toBe("");
    expect(await applyChange(store, ctx.results[0] as never, ctx.newId)).toBe("applied");
    expect(await store.personas.get("p")).toMatchObject({ description: "New main.", placement: { position: "none", depth: 8, role: "user" }, variants: p.variants, original: { keep: true } });
  });
  it("supports persona version operations and detects concurrent edits", async () => {
    const { store, ctx } = await setup();
    await store.savePersona(Persona.parse({ id: "p", name: "P", description: "Main.", variants: [{ id: "v", label: "Modern", overrides: { description: "City." }, hasOwnAvatar: true }] }));
    const change = { variants: { update: [{ id: "v", description: "Updated city." }], add: [{ label: "Fantasy", description: "Forest." }] } };
    expect((await runTool("change", args({ id: "persona:p", changes: change }), ctx)).error).toBeFalsy();
    expect(ctx.results[0]).toMatchObject({ before: { variants: [{ id: "v", label: "Modern", description: "City." }] } });
    expect(await applyChange(store, ctx.results.at(-1) as never, ctx.newId)).toBe("applied");
    const p = (await store.personas.get("p"))!;
    expect(p.variants[0]).toMatchObject({ id: "v", hasOwnAvatar: true, overrides: { description: "Updated city." } });
    expect(p.variants[1]!.label).toBe("Fantasy");
    expect((await runTool("change", args({ id: "persona:p", changes: { description: "Proposed." } }), ctx)).error).toBeFalsy();
    await store.savePersona({ ...p, description: "Manual." });
    expect(await applyChange(store, ctx.results.at(-1) as never, ctx.newId)).toBe("stale");
    const v = JSON.parse((await runTool("read", args({ id: "persona:p", fields: ["variant:Modern"] }), ctx)).result);
    expect(v).toMatchObject({ id: "v", description: "Updated city.", picture: "its own" });
  });
  it("recognizes persona drafts and saves new/revised personas through the shared contract", async () => {
    const { store, ctx } = await setup();
    expect([...('```homunculus-persona\n{"name":"Draft Rin","description":"Explorer."}\n```').matchAll(DRAFT_BLOCK)]).toHaveLength(1);
    const made = await saveDraftItem(store, "persona" as never, { name: "Draft Rin", description: "Explorer." }, ctx.newId);
    expect(made).toMatchObject({ type: "created", kind: "persona" });
    if (made.type !== "created") throw Error("Expected created persona");
    expect(await saveDraftItem(store, "persona" as never, { id: `persona:${made.itemId}`, description: "Revised." }, ctx.newId)).toMatchObject({ type: "change", status: "applied" });
    expect((await store.personas.get(made.itemId))!.description).toBe("Revised.");
  });
  it("undo uses the Trash and respects default-persona safeguards", async () => {
    const { store, ctx } = await setup();
    await store.savePersona(Persona.parse({ id: "p", name: "P" }));
    await undoCreate(store, "persona" as never, "p");
    expect(await store.personas.list()).toHaveLength(0);
    await store.restoreFromTrash("persona", "p");
    expect(await store.personas.list()).toHaveLength(1);
    await store.setDefaultSetup({ personaId: "p" });
    await expect(undoCreate(store, "persona" as never, "p")).rejects.toThrow("default persona");
  });
  it("explains persona semantics and exposes only supported fields", async () => {
    const { ctx } = await setup(); const guide = await runTool("guide", args({ kind: "persona" }), ctx);
    expect(guide.error, guide.result).toBeFalsy(); expect(guide.result).toContain("the user"); expect(guide.result).toContain("placement"); expect(guide.result).toContain("not select");
    for (const key of GUIDES.persona!.fields) expect(Object.keys(Persona.shape)).toContain(key);
  });
  it("rejects unsupported persona fields and invalid pending placement", async () => {
    const { store, ctx } = await setup(); ctx.saveNew = false;
    for (const data of [{ name: "P", placement: { position: "invented" } }, { name: "P", systemPrompt: "not a persona field" }]) expect((await runTool("create", args({ kind: "persona", data }), ctx)).error).toBe(true);
    expect(ctx.results).toHaveLength(0); expect(await store.personas.list()).toHaveLength(0);
  });
});
