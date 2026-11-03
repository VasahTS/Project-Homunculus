// Large-card pagination must survive history replay without guessed offsets or overlapping reads. CODEX, 2026-11-03.
import { describe, expect, it } from "vitest";
import { AssistantChat, Character, Lorebook, type AssistantMessage } from "@homunculus/schemas";
import { HomunculusCore } from "@homunculus/core";
import { newTestStore } from "../../../../packages/core/test/helpers.ts";
import { loadSettings, runAssistant, saveSettings, toTurns } from "./engine.ts";
import { runTool, type ToolContext } from "./tools.ts";
const msg = (role: "user" | "assistant", text = ""): AssistantMessage => ({ id: crypto.randomUUID(), role, text, reasoning: "", attachments: [], steps: [], rounds: [], results: [], createdAt: 1 });
async function setup() {
  const { store } = await newTestStore();
  const ctx: ToolContext = { store, saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
  return { store, ctx };
}
const read = async (ctx: ToolContext, args: unknown) => JSON.parse((await runTool("read", JSON.stringify(args), ctx)).result);
function replay(args: unknown, result: string, contextLength?: number) {
  const reply = msg("assistant", "Reading.");
  reply.rounds = [{ text: "", calls: [{ id: "read-page", name: "read", arguments: JSON.stringify(args) }] }];
  reply.steps = [{ id: "read-page", name: "read", args: JSON.stringify(args), result, label: "Read", error: false }];
  return AssistantChat.parse({ id: "reads", createdAt: 1, updatedAt: 1, contextLength, messages: [msg("user", "Read it."), reply, msg("user", "Continue.")] });
}
describe("large Assistant reads", () => {
  it("returns clean field text and authoritative source ranges/cursors", async () => {
    const { store, ctx } = await setup(), text = "a".repeat(13000);
    await store.saveCharacter(Character.parse({ id: "big", name: "Big", description: text }));
    const a = await read(ctx, { id: "character:big", fields: ["description"] });
    expect(a.description).toBe(text.slice(0, 6000));
    expect(a._read[0]).toMatchObject({ field: "description", offset: 0, end: 6000, total: 13000, nextOffset: 6000, done: false });
    const b = await read(ctx, a._read[0].next), c = await read(ctx, b._read[0].next);
    expect(a.description + b.description + c.description).toBe(text);
    expect(c._read[0]).toMatchObject({ end: 13000, nextOffset: null, done: true });
  });
  it("keeps recent page bodies and cursors after a user says continue", async () => {
    const { store, ctx } = await setup();
    await store.saveCharacter(Character.parse({ id: "big", name: "Big", description: "0123456789".repeat(1300) }));
    const args = { id: "character:big", fields: ["description"] }, out = await runTool("read", JSON.stringify(args), ctx);
    const turn = toTurns(replay(args, out.result), await loadSettings(store), "1 character").find(t => t.role === "tool")!;
    const page = JSON.parse(turn.content as string);
    expect(page.description).toHaveLength(6000); expect(page._read[0].nextOffset).toBe(6000);
  });
  it("excerpted legacy pages keep their original cursor instead of a broken 400-character JSON fragment", async () => {
    const { store } = await setup(), args = { id: "character:big", fields: ["description"], offset: 2500 };
    const legacy = JSON.stringify({ description: "b".repeat(2500) + ' …(8,000 more characters: read with fields ["description"] and offset 5000)' });
    const turn = toTurns(replay(args, legacy, 1), await loadSettings(store), "1 character").find(t => t.role === "tool")!;
    const page = JSON.parse(turn.content as string);
    expect(page._replay.excerpted).toBe(true);
    expect(page._read[0]).toMatchObject({ offset: 2500, end: 5000, total: 13000, nextOffset: 5000 });
    expect(page.description.length).toBeLessThan(2500);
  });
  it("paginates a selected version field without falling back to the main description", async () => {
    const { store, ctx } = await setup(), text = "v".repeat(13000);
    await store.saveCharacter(Character.parse({ id: "c", name: "C", description: "Main.", variants: [{ id: "v", label: "Modern", overrides: { description: text } }] }));
    const a = await read(ctx, { id: "character:c", fields: ["variant:Modern", "description"] });
    const b = await read(ctx, a._read[0].next), c = await read(ctx, b._read[0].next);
    expect(a.description + b.description + c.description).toBe(text);
    expect(a._read[0].next.fields).toEqual(["variant:v", "description"]);
  });
  it("bounds lore entry content and exposes a working continuation", async () => {
    const { store, ctx } = await setup(), text = "l".repeat(13000);
    await store.saveLorebook(Lorebook.parse({ id: "l", name: "L", entries: [{ id: "e", title: "Entry", content: text }] }));
    const a = await read(ctx, { id: "lorebook:l", fields: ["entry:e", "content"] });
    const b = await read(ctx, a._read[0].next), c = await read(ctx, b._read[0].next);
    expect(a.content + b.content + c.content).toBe(text);
    expect(a._read[0].next.fields).toEqual(["entry:e", "content"]);
  });
  it("Unicode/JSON escapes do not change the source cursor or lose characters", async () => {
    const { store, ctx } = await setup(), text = '🙂 "quoted"\nback\\slash '.repeat(1000);
    await store.saveCharacter(Character.parse({ id: "unicode", name: "Unicode", description: text }));
    let next: unknown = { id: "character:unicode", fields: ["description"] }, combined = "", count = 0;
    while (next) { const page = await read(ctx, next); combined += page.description; const range = page._read[0]; expect(page.description.length).toBe(range.end - range.offset); expect(page.description).not.toMatch(/[\uD800-\uDBFF]$/); next = range.next; if (++count > 10) throw new Error("Cursor did not finish"); }
    expect(combined).toBe(text);
  });
  it("the character's variant index does not claim unseen override pages were read", async () => {
    const { store, ctx } = await setup();
    await store.saveCharacter(Character.parse({ id: "c", name: "C", description: "Main.", variants: [{ id: "v", label: "Modern", overrides: { description: "v".repeat(13000) } }] }));
    const page = await read(ctx, { id: "character:c" });
    expect(page._read).toBeUndefined(); expect(page.variants[0]).toContain("Modern");
  });
  it("a tiny context excerpts new pages as valid JSON while retaining exact ranges", async () => {
    const { store, ctx } = await setup(); await store.saveCharacter(Character.parse({ id: "c", name: "C", description: "a".repeat(13000) }));
    const args = { id: "character:c", fields: ["description"] }, out = await runTool("read", JSON.stringify(args), ctx);
    const p = JSON.parse(toTurns(replay(args, out.result, 1), await loadSettings(store), "1 character").find(t => t.role === "tool")!.content as string);
    expect(p.description.length).toBeLessThan(6000); expect(p._replay.excerpted).toBe(true); expect(p._read[0].nextOffset).toBe(6000);
  });
  it("a retained legacy page is upgraded without putting its old continuation hint in source text", async () => {
    const { store } = await setup(), args = { id: "character:c", fields: ["description"] };
    const result = JSON.stringify({ description: "a".repeat(2500) + ' …(10,500 more characters: read with fields ["description"] and offset 2500)' });
    const p = JSON.parse(toTurns(replay(args, result), await loadSettings(store), "1 character").find(t => t.role === "tool")!.content as string);
    expect(p.description).toBe("a".repeat(2500)); expect(p._read[0].nextOffset).toBe(2500);
  });
  it("file-read excerpts retain the original continuation footer", async () => {
    const { store } = await setup(), footer = '\n(7000 more characters; read_file with path "data.description" and offset 6000)';
    const chat = replay({ file: "f", path: "data.description" }, "a".repeat(6000) + footer, 1);
    chat.messages[1]!.steps[0]!.name = "read_file"; chat.messages[1]!.rounds[0]!.calls[0]!.name = "read_file";
    const result = toTurns(chat, await loadSettings(store), "empty").find(t => t.role === "tool")!.content as string;
    expect(result.length).toBeLessThan(500); expect(result).toContain(footer);
  });
  it("requesting past EOF returns a complete empty page, with no new cursor", async () => {
    const { store, ctx } = await setup(); await store.saveCharacter(Character.parse({ id: "c", name: "C", description: "a".repeat(13000) }));
    const p = await read(ctx, { id: "character:c", fields: ["description"], offset: 20000 });
    expect(p.description).toBe(""); expect(p._read[0]).toMatchObject({ offset: 13000, end: 13000, done: true, next: null });
  });
  it("an excerpted lore entry list retains each entry's own source cursor", async () => {
    const { store, ctx } = await setup();
    await store.saveLorebook(Lorebook.parse({ id: "l", name: "L", entries: [{ id: "e", title: "E", content: "x".repeat(13000) }] }));
    const args = { id: "lorebook:l", fields: ["entries"] }, out = await runTool("read", JSON.stringify(args), ctx);
    const result = toTurns(replay(args, out.result, 1), await loadSettings(store), "1 book").find(t => t.role === "tool")!.content as string;
    const p = JSON.parse(result); expect(p._replay.excerpted).toBe(true);
    expect(p.data[0]._read[0].next).toEqual({ id: "lorebook:l", fields: ["entry:e", "content"], offset: 6000 });
  });
  it("retains page data across step-limit continuations in the actual model requests", async () => {
    const { store } = await setup(), core = new HomunculusCore({ tree: store, stateRepository: store });
    await store.saveCharacter(Character.parse({ id: "big", name: "Big", description: "x".repeat(13000) }));
    const offsets: number[] = [];
    await core.loadModules([{ manifest: { id: "read-ai", version: "1" }, register(api) {
      api.registerProvider({ id: "read-ai", name: "Test", help: "", async *stream(req) {
        const pages = (req.rich ?? []).filter(t => t.role === "tool").map(t => JSON.parse(t.content as string));
        const last = pages.at(-1);
        if (last?._read[0].done) { expect(pages.map(p => p.description).join("")).toBe("x".repeat(13000)); yield "DONE"; return; }
        const args = last?._read[0].next ?? { id: "character:big", fields: ["description"], offset: 0 };
        yield { toolCalls: [{ id: crypto.randomUUID(), name: "read", arguments: JSON.stringify(args) }] };
      } });
    } }]);
    const settings = await loadSettings(store);
    await saveSettings(store, { ...settings, assistants: settings.assistants.map(a => ({ ...a, maxSteps: 1 })) });
    let chat = AssistantChat.parse({ id: "continuations", createdAt: 1, updatedAt: 1, messages: [msg("user", "Read the full description.")] });
    for (let i = 0; i < 3; i++) {
      chat = await runAssistant({ core, store, chat, main: { providerId: "read-ai", model: "test" }, connections: {}, onUpdate: () => {} });
      const reply = chat.messages.at(-1)!; expect(reply.error).toBeUndefined();
      offsets.push(...reply.steps.map(s => JSON.parse(s.args).offset ?? 0));
      if (i < 2) chat.messages.push(msg("user", "Continue."));
    }
    expect(offsets).toEqual([0, 6000, 12000]); expect(chat.messages.at(-1)!.text).toBe("DONE");
  });
});
