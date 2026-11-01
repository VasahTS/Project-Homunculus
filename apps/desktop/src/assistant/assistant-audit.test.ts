// Assistant audit reproductions. Author: CODEX, 2026-11-01.
// Ordinary regression tests for the seven audited findings.
import initSqlJs from "sql.js";
import { describe, expect, it, vi } from "vitest";
import { AssistantChat, Character, Story, type AssistantMessage, type AssistantResult } from "@homunculus/schemas";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate, type GenerateRequest, type StreamChunk } from "@homunculus/core";
import { compactChat, loadSettings, runAssistant, toTurns } from "./engine.ts";
import { applyChange, approveNew, runTool, type ToolContext } from "./tools.ts";
import { GUIDES } from "./guides.ts";

async function setup(script: (req: GenerateRequest, n: number) => StreamChunk[] = () => ["ok"]) {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  const store = new SqlStore(driver);
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  let n = 0;
  await core.loadModules([{ manifest: { id: "audit-ai", version: "1" }, register(api) {
    api.registerProvider({ id: "audit", name: "Audit", help: "", async *stream(req) {
      for (const c of script(req, n++)) yield c;
    } });
  } }]);
  const ctx: ToolContext = { store, saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
  return { store, core, ctx };
}
const audit = it;
const main = { providerId: "audit", model: "audit" };
const message = (role: "user" | "assistant", text: string): AssistantMessage => ({ id: crypto.randomUUID(), role, text, reasoning: "", attachments: [], steps: [], rounds: [], results: [], createdAt: 1 });
const tool = (name: string, args: unknown): StreamChunk => ({ toolCalls: [{ id: crypto.randomUUID(), name, arguments: JSON.stringify(args) }] });
const proposal = (r: AssistantResult): Extract<AssistantResult, { type: "change" }> => {
  if (r.type !== "change") throw new Error("Expected a change proposal");
  return r;
};

describe("Assistant audit: reliability regressions", () => {
  audit("A1: importing a file must respect Ask me first", async () => {
    const { store, ctx } = await setup();
    ctx.saveNew = false;
    ctx.files.set("file", { name: "card.json", mime: "application/json", text: JSON.stringify({ spec: "chara_card_v2", data: { name: "Imported", description: "Description", personality: "", scenario: "", first_mes: "Hello", mes_example: "" } }) });
    const out = await runTool("import_file", JSON.stringify({ file: "file", as: "character" }), ctx);
    expect(out.error).toBeFalsy();
    expect(await store.listCharacters()).toHaveLength(0);
    expect(ctx.results[0]).toMatchObject({ type: "new", status: "waiting" });
  });

  audit("A2: Stop before a tool starts must prevent the library write", async () => {
    const ctrl = new AbortController();
    const { store, core } = await setup((_req, n) => n === 0 ? [tool("create", { kind: "character", data: { name: "Late write" } })] : ["ok"]);
    await runAssistant({ core, store, main, connections: {}, signal: ctrl.signal,
      chat: AssistantChat.parse({ id: "stop", messages: [message("user", "Make a character")], createdAt: 1, updatedAt: 1 }),
      onUpdate: (m) => { if (m.steps.some((s) => s.label === "…")) ctrl.abort(); },
    });
    expect(await store.listCharacters()).toHaveLength(0);
  });

  audit("A3: a Kit narrator proposal must detect a later manual narrator edit", async () => {
    const { store, ctx } = await setup();
    const kit = Story.parse({ id: "kit", name: "Kit", createdAt: 1, narrator: { kind: "vault", id: "old" } });
    await store.kits.save(kit);
    await runTool("change", JSON.stringify({ id: "kit:kit", changes: { narratorId: "proposed" } }), ctx);
    await store.kits.save({ ...kit, narrator: { kind: "vault", id: "manual" } });
    expect(await applyChange(store, proposal(ctx.results[0]!), ctx.newId)).toBe("stale");
    expect((await store.kits.get("kit"))!.narrator).toEqual({ kind: "vault", id: "manual" });
  });

  audit("A3b: a Kit lore proposal must detect later manual lore selection", async () => {
    const { store, ctx } = await setup();
    const kit = Story.parse({ id: "kit", name: "Kit", createdAt: 1, setup: { lorebooks: { mode: "add", add: ["old"], remove: [] } } });
    await store.kits.save(kit);
    await runTool("change", JSON.stringify({ id: "kit:kit", changes: { lorebookIds: ["proposed"] } }), ctx);
    await store.kits.save({ ...kit, setup: { ...kit.setup, lorebooks: { mode: "add", add: ["manual"], remove: [] } } });
    expect(await applyChange(store, proposal(ctx.results[0]!), ctx.newId)).toBe("stale");
  });

  audit("A4: tool replay must tell the model a created item was undone", async () => {
    const { store } = await setup();
    const reply = message("assistant", "Created it");
    reply.rounds = [{ text: "", calls: [{ id: "create", name: "create", arguments: "{}" }] }];
    reply.steps = [{ id: "create", name: "create", args: "{}", result: "Created character:item", label: "Created", error: false }];
    reply.results = [{ type: "created", kind: "character", itemId: "item", name: "Item", detail: "", undone: true }];
    const chat = AssistantChat.parse({ id: "replay", createdAt: 1, updatedAt: 1, messages: [message("user", "Make it"), reply, message("user", "What exists now?")] });
    expect(JSON.stringify(toTurns(chat, await loadSettings(store), "empty").slice(1))).toMatch(/undone|removed|trash/i);
  });

  audit("A5: a previously read guide must remain retrievable after history compaction", async () => {
    const { core, store, ctx } = await setup((_req, n) => n === 0 ? [tool("guide", { kind: "character" })] : ["A short summary"]);
    let chat = await runAssistant({ core, store, main, connections: {}, onUpdate: () => {},
      chat: AssistantChat.parse({ id: "guides", createdAt: 1, updatedAt: 1, messages: [message("user", "Read the character guide")] }),
    });
    for (let i = 0; i < 4; i++) chat.messages.push(message("user", `Question ${i}`), message("assistant", `Answer ${i}`));
    chat = await compactChat({ core, store, main, connections: {}, chat });
    expect(chat.compact).toBeDefined();
    expect(chat.guides).toContain("character");
    expect(JSON.stringify(toTurns(chat, await loadSettings(store), "empty").slice(1))).not.toContain("SillyTavern-compatible");
    ctx.guides = new Set(chat.guides); // Same restoration as runAssistant, after the guide has left the request.
    const out = await runTool("guide", JSON.stringify({ kind: "character" }), ctx);
    expect(out.result).toBe(GUIDES.character!.text);
  });

  audit("A6: read-more hints must advance by the absolute offset", async () => {
    const { store, ctx } = await setup();
    await store.saveCharacter(Character.parse({ id: "long", name: "Long", description: "a".repeat(9000) }));
    const next = await runTool("read", JSON.stringify({ id: "character:long", fields: ["description"], offset: 2500 }), ctx);
    expect(next.result).toContain("offset 5000");
    expect(next.result).toContain("4,000 more characters");
  });
});

const importedCard = JSON.stringify({ spec: "chara_card_v2", data: { name: "Imported", description: "Description", personality: "", scenario: "", first_mes: "Hello", mes_example: "", character_book: { name: "Embedded", entries: [{ keys: ["place"], content: "Canon", enabled: true, insertion_order: 1, position: "before_char" }] }, extensions: { custom: "preserve me" } } });

describe("Assistant audit: related boundary cases", () => {
  it.each(["character", "lorebook"] as const)("A1: %s imports wait, then retain their original data on approval", async (kind) => {
    const { store, ctx } = await setup();
    ctx.saveNew = false;
    ctx.files.set("file", { name: "card.json", mime: "application/json", text: importedCard });
    const out = await runTool("import_file", JSON.stringify({ file: "file", as: kind }), ctx);
    expect(out.error).toBeFalsy();
    expect(await store.listCharacters()).toHaveLength(0);
    expect(await store.lorebooks.list()).toHaveLength(0);
    const pending = ctx.results[0]!;
    if (pending.type !== "new") throw new Error("Expected approval");
    const made = await approveNew(store, pending, ctx.newId);
    if (kind === "character") {
      const c = (await store.getCharacter(made.id))!;
      expect(c.original).toEqual(JSON.parse(importedCard));
      expect(c.lorebookIds).toHaveLength(1);
      expect((await store.lorebooks.get(c.lorebookIds[0]!))!.entries[0]!.content).toBe("Canon");
    } else expect((await store.lorebooks.get(made.id))!.entries[0]!.content).toBe("Canon");
  });

  it("A2: an already stopped reply makes no model call", async () => {
    const requests = vi.fn((): StreamChunk[] => ["late"]);
    const { core, store } = await setup(requests);
    const ctrl = new AbortController(); ctrl.abort();
    await runAssistant({ core, store, main, connections: {}, signal: ctrl.signal, onUpdate: () => {}, chat: AssistantChat.parse({ id: "stopped", createdAt: 1, updatedAt: 1 }) });
    expect(requests).not.toHaveBeenCalled();
  });

  it.each(["character", "tracker", "move"])("A2: %s stops between writes and reports completed work", async (kind) => {
    const { store, ctx } = await setup();
    const ctrl = new AbortController(); ctx.signal = ctrl.signal;
    let name: string, args: unknown;
    if (kind === "character") {
      ctx.files.set("file", { name: "card.json", mime: "application/json", text: importedCard });
      const save = store.saveCharacter.bind(store);
      vi.spyOn(store, "saveCharacter").mockImplementation(async (...a) => { const saved = await save(...a); ctrl.abort(); return saved; });
      name = "import_file"; args = { file: "file", as: "character" };
    } else if (kind === "tracker") {
      const save = store.saveTrackerSchema.bind(store);
      vi.spyOn(store, "saveTrackerSchema").mockImplementation(async (...a) => { const saved = await save(...a); ctrl.abort(); return saved; });
      name = "create"; args = { kind: "tracker", data: { name: "Partial tracker", fields: [{ key: "mood", label: "Mood", type: "text" }] } };
    } else {
      for (const id of ["one", "two"]) await store.saveCharacter(Character.parse({ id, name: id }));
      const save = store.setFolder.bind(store);
      vi.spyOn(store, "setFolder").mockImplementation(async (...a) => { await save(...a); ctrl.abort(); });
      name = "move"; args = { items: ["character:one", "character:two"], folder: "Party" };
    }
    const out = await runTool(name, JSON.stringify(args), ctx);
    expect(out.error).toBe(true);
    expect(out.result).toMatch(/completed writes:/i);
    if (kind === "character") { expect(await store.listCharacters()).toHaveLength(1); expect(await store.lorebooks.list()).toHaveLength(0); }
    if (kind === "tracker") { expect(await store.trackerSchemas.list()).toHaveLength(1); expect(await store.agentConfigs.list()).toHaveLength(0); }
    if (kind === "move") { expect((await store.folderMap("character")).one).toBeTruthy(); expect((await store.folderMap("character")).two).toBeFalsy(); }
  });

  it("A4: current outcomes follow complete tool-call/result pairs, even after compaction", async () => {
    const { store } = await setup();
    const reply = message("assistant", "Done");
    reply.rounds = [{ text: "", calls: [{ id: "one", name: "create", arguments: "{}" }, { id: "two", name: "move", arguments: "{}" }] }];
    reply.steps = ["one", "two"].map((id) => ({ id, name: id, args: "{}", result: "Original", label: "", error: false }));
    reply.results = [
      { type: "new", id: "new", kind: "character", name: "Approved", data: {}, status: "applied", itemId: "approved" },
      { type: "change", id: "change", kind: "character", itemId: "changed", name: "Discarded", before: {}, after: {}, summary: "", status: "discarded" },
      { type: "moved", id: "move", items: [{ kind: "character", itemId: "approved", name: "Approved", from: null }], folder: "Party", made: [], undone: false },
    ];
    let chat = AssistantChat.parse({ id: "outcomes", createdAt: 1, updatedAt: 1, messages: [message("user", "Make it"), reply, message("user", "Now?")] });
    const settings = await loadSettings(store);
    const turns = toTurns(chat, settings, "empty");
    const call = turns.findIndex((t) => t.toolCalls?.length);
    expect(turns.slice(call + 1, call + 3).map((t) => t.role)).toEqual(["tool", "tool"]);
    for (const text of ["approved", "discarded", "moved", "Party"]) expect(JSON.stringify(turns)).toContain(text);
    chat = { ...chat, compact: { uptoId: reply.id, summary: "Made items", at: 1 } };
    expect(JSON.stringify(toTurns(chat, settings, "empty"))).toContain("discarded");
  });

  it("A5: full guides suppress repeats, but trimmed guides can be read again", async () => {
    const { core, store } = await setup((_req, n) => n % 2 === 0 ? [tool("guide", { kind: "character" })] : ["Done"]);
    let chat = await runAssistant({ core, store, main, connections: {}, onUpdate: () => {}, chat: AssistantChat.parse({ id: "trim-guide", createdAt: 1, updatedAt: 1, messages: [message("user", "Guide")] }) });
    chat.messages.push(message("user", "Read it again"));
    chat = await runAssistant({ core, store, main, connections: {}, onUpdate: () => {}, chat });
    expect(chat.messages.at(-1)!.steps[0]!.result).toBe(GUIDES.character!.text);
    const { ctx } = await setup();
    ctx.availableGuides = new Set(["character"]);
    expect((await runTool("guide", '{"kind":"character"}', ctx)).result).toContain("already have");
  });

  it("A6: following every hint reads the complete field once", async () => {
    const { store, ctx } = await setup();
    const text = "a".repeat(2500) + "b".repeat(2500) + "c".repeat(2500) + "d".repeat(1500);
    await store.saveCharacter(Character.parse({ id: "pages", name: "Pages", description: text }));
    let all = "";
    for (const offset of [0, 2500, 5000, 7500]) {
      const out = await runTool("read", JSON.stringify({ id: "character:pages", fields: ["description"], offset }), ctx);
      const field = (JSON.parse(out.result) as { description: string }).description;
      all += field.split(" …(")[0];
      if (offset < 7500) expect(field).toContain(`offset ${offset + 2500}`);
      else expect(field).not.toContain("more characters");
    }
    expect(all).toBe(text);
  });
});


describe("Assistant audit: Stop boundaries", () => {
  it("A2: Stop after the first tool prevents remaining tools and the next request", async () => {
    const ctrl = new AbortController();
    const requests = vi.fn((): StreamChunk[] => [{ toolCalls: ["first", "second"].map((id) => ({ id, name: "create", arguments: JSON.stringify({ kind: "character", data: { name: id } }) })) }]);
    const { core, store } = await setup(requests);
    const chat = await runAssistant({ core, store, main, connections: {}, signal: ctrl.signal, chat: AssistantChat.parse({ id: "two-tools", createdAt: 1, updatedAt: 1, messages: [message("user", "Two")] }), onUpdate: (m) => { if (m.results.length) ctrl.abort(); } });
    expect(requests).toHaveBeenCalledTimes(1);
    expect((await store.listCharacters()).map((c) => c.name)).toEqual(["first"]);
    expect(chat.messages.at(-1)!.steps.map((s) => s.id)).toEqual(["first", "second"]);
    expect(chat.messages.at(-1)!.steps[1]!.result).toContain("Stopped");
  });

  it("A2: Stop after creating an item prevents folder creation", async () => {
    const { store, ctx } = await setup();
    const ctrl = new AbortController(); ctx.signal = ctrl.signal;
    const save = store.saveCharacter.bind(store);
    vi.spyOn(store, "saveCharacter").mockImplementation(async (...a) => { const c = await save(...a); ctrl.abort(); return c; });
    const out = await runTool("create", JSON.stringify({ kind: "character", data: { name: "Saved" }, folder: "Not yet" }), ctx);
    expect(await store.listCharacters()).toHaveLength(1);
    expect(await store.listFolders("character")).toHaveLength(0);
    expect(out.result).toMatch(/Completed writes: character:/);
  });

  it("A2: Stop after embedded lore is saved prevents its character link", async () => {
    const { store, ctx } = await setup();
    const ctrl = new AbortController(); ctx.signal = ctrl.signal;
    ctx.files.set("file", { name: "card.json", text: importedCard, mime: "application/json" });
    const save = store.saveLorebook.bind(store);
    vi.spyOn(store, "saveLorebook").mockImplementation(async (...a) => { const b = await save(...a); ctrl.abort(); return b; });
    const out = await runTool("import_file", JSON.stringify({ file: "file", as: "character" }), ctx);
    expect(await store.listCharacters()).toHaveLength(1);
    expect(await store.lorebooks.list()).toHaveLength(1);
    expect((await store.listCharacters())[0]!.lorebookIds).toEqual([]);
    expect(out.result).toMatch(/Completed writes: character:.*lorebook:/);
  });
});
