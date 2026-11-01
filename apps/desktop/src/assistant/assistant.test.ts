// Tests for the Assistant (D-062): the tool loop, light reading, proposals, files, and the guides. Author: CLAUDE, 2026-11-01.
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { Character, LoreEntry, Lorebook, Narrator, Story, TrackerField, AssistantChat, type AssistantMessage } from "@homunculus/schemas";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate, type GenerateRequest, type StreamChunk } from "@homunculus/core";
import { compactChat, loadChat, needsCompaction, runAssistant, saveSettings, toTurns, loadSettings } from "./engine.ts";
import { applyChange, redoMove, runTool, undoMove, type ToolContext } from "./tools.ts";
import { parseFile, readPart } from "./files.ts";
import { GUIDES } from "./guides.ts";
import { listTrackers } from "../trackers.ts";

async function setup(script: (req: GenerateRequest, call: number) => StreamChunk[]) {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  const store = new SqlStore(driver);
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  const seen: GenerateRequest[] = [];
  let n = 0;
  await core.loadModules([{ manifest: { id: "fake-ai", version: "1" }, register(api) {
    api.registerProvider({ id: "fake", name: "", help: "", async *stream(req) { seen.push(req); for (const c of script(req, n++)) yield c; } });
  } }]);
  return { store, core, seen };
}
const main = { providerId: "fake", model: "fake-1" };
const call = (name: string, args: unknown, id = name) => ({ toolCalls: [{ id, name, arguments: JSON.stringify(args) }] });
const userMsg = (text: string, extra: Partial<AssistantMessage> = {}): AssistantMessage =>
  ({ id: crypto.randomUUID(), role: "user", text, reasoning: "", attachments: [], steps: [], rounds: [], results: [], createdAt: 1, ...extra });
const chatWith = (...messages: AssistantMessage[]) => AssistantChat.parse({ id: "c1", messages, createdAt: 1, updatedAt: 1 });
const ctxOf = (store: SqlStore): ToolContext => ({ store, saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} });

describe("the Assistant", () => {
  it("runs tools until it answers: reads the guide, creates a tracker, and the chat is saved with its steps", async () => {
    const { store, core, seen } = await setup((_req, i) => [
      [call("guide", { kind: "tracker" })],
      [call("create", { kind: "tracker", data: { name: "World", fields: [{ label: "Time of day", type: "text" }, { label: "Weather", type: "status", options: ["clear", "rain"] }] } })],
      ["Done — your World tracker is ready."],
    ][i]!);
    const out = await runAssistant({ core, store, chat: chatWith(userMsg("Make a world tracker")), main, connections: {}, onUpdate: () => {} });
    const reply = out.messages.at(-1)!;
    expect(reply.text).toBe("Done — your World tracker is ready.");
    expect(reply.steps.map((s) => s.label)).toEqual(["Read the tracker guide", "Created tracker “World”"]);
    expect(reply.results[0]).toMatchObject({ type: "created", kind: "tracker", name: "World" });
    expect((await listTrackers(store)).find((t) => t.agent.name === "World")?.sets[0]!.fields.map((f) => f.label)).toEqual(["Time of day", "Weather"]);
    // the requests carry the tools and replay the exact rounds
    expect(seen[0]!.tools!.map((t) => t.name)).toContain("create");
    const last = seen[2]!.rich!;
    expect(last.filter((t) => t.role === "tool")).toHaveLength(2);
    expect((await loadChat(store, "c1"))?.title).toBe("Make a world tracker");
    expect((await loadChat(store, "c1"))?.guides).toEqual(["tracker"]);
  });

  it("never sends the library: only counts; find pages 25 lines; a lorebook is read as an index", async () => {
    const { store, core, seen } = await setup(() => ["ok"]);
    for (let i = 0; i < 60; i++) await store.saveCharacter(Character.parse({ id: `c${i}`, name: `Person ${i}`, description: "x".repeat(5000) }));
    await store.saveLorebook(Lorebook.parse({ id: "b1", name: "Woods", entries: Array.from({ length: 30 }, (_, i) => LoreEntry.parse({ id: `e${i}`, title: `Place ${i}`, keys: [`p${i}`], content: "long ".repeat(200) })) }));
    await runAssistant({ core, store, chat: chatWith(userMsg("hi")), main, connections: {}, onUpdate: () => {} });
    const sys = String(seen[0]!.rich![0]!.content);
    expect(sys).toContain("characters: 60");
    expect(sys).not.toContain("Person 1");
    const ctx = ctxOf(store);
    const page = (await runTool("find", JSON.stringify({ kind: "character" }), ctx)).result;
    expect(page.split("\n")).toHaveLength(26);
    expect(page).toContain("35 more; page 2");
    expect((await runTool("find", JSON.stringify({ query: "person 42" }), ctx)).result.split("\n")[0]).toContain("character:c42");
    const char = (await runTool("read", JSON.stringify({ id: "character:c3" }), ctx)).result;
    expect(char.length).toBeLessThan(3000);
    expect(char).toContain("read with fields [\\\"description\\\"] and offset 2500");
    const book = (await runTool("read", JSON.stringify({ id: "lorebook:b1" }), ctx)).result;
    expect(book).toContain("e7 · Place 7 — keys: p7");
    expect(book).not.toContain("long long");
    expect((await runTool("read", JSON.stringify({ id: "lorebook:b1", fields: ["entry:Place 3"] }), ctx)).result).toContain("\"content\":\"long");
  });

  it("change is a proposal; applying it notices edits made in between", async () => {
    const { store } = await setup(() => []);
    await store.saveCharacter(Character.parse({ id: "lyra", name: "Lyra", description: "A ranger." }));
    const ctx = ctxOf(store);
    await runTool("change", JSON.stringify({ id: "character:lyra", changes: { description: "Lyra has kept the woods for eleven winters." } }), ctx);
    const r = ctx.results[0]! as Extract<(typeof ctx.results)[number], { type: "change" }>;
    expect(r).toMatchObject({ status: "waiting", before: { description: "A ranger." } });
    expect((await store.getCharacter("lyra"))!.description).toBe("A ranger.");
    expect(await applyChange(store, r, () => "x")).toBe("applied");
    expect((await store.getCharacter("lyra"))!.description).toContain("eleven winters");
    await runTool("change", JSON.stringify({ id: "character:lyra", changes: { personality: "dry" } }), ctx);
    await store.saveCharacter({ ...(await store.getCharacter("lyra"))!, personality: "edited by hand" });
    expect(await applyChange(store, ctx.results[1] as typeof r, () => "x")).toBe("stale");
    // unknown fields and deleting are refused
    expect((await runTool("change", JSON.stringify({ id: "character:lyra", changes: { soul: 1 } }), ctx)).error).toBe(true);
    expect((await runTool("delete", "{}", ctx)).error).toBe(true);
  });

  it("a Kit ties characters, a narrator and lorebooks; lorebook entries change by add/update", async () => {
    const { store } = await setup(() => []);
    await store.saveCharacter(Character.parse({ id: "a", name: "A" }));
    await store.saveLorebook(Lorebook.parse({ id: "w", name: "World", entries: [LoreEntry.parse({ id: "e1", title: "Mill", keys: ["mill"], content: "old" })] }));
    const ctx = ctxOf(store);
    const made = await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Old Mill", scenario: "Rain.", openings: ["*The wheel creaks.*"], cast: ["character:a"], lorebookIds: ["lorebook:w"] } }), ctx);
    expect(made.error).toBeFalsy();
    const kit = (await store.kits.list())[0]!;
    expect(kit.cast.map((c) => c.characterId)).toEqual(["a"]);
    expect(kit.setup.lorebooks).toMatchObject({ mode: "add", add: ["w"] });
    await runTool("change", JSON.stringify({ id: "lorebook:w", changes: { entries: { update: [{ title: "Mill", content: "flooded" }], add: [{ title: "Order", keys: ["order"], content: "rangers" }] } } }), ctx);
    expect(await applyChange(store, ctx.results[1] as never, () => "e2")).toBe("applied");
    expect((await store.lorebooks.get("w"))!.entries.map((e) => `${e.title}:${e.content}`)).toEqual(["Mill:flooded", "Order:rangers"]);
  });

  it("files: a card is summarized, read by path, imported; old tool results and pictures are trimmed", async () => {
    const card = JSON.stringify({ spec: "chara_card_v2", data: { name: "Kessa", description: "d".repeat(9000), first_mes: "Hi.", personality: "", scenario: "", mes_example: "" } });
    const f = parseFile("kessa.json", new TextEncoder().encode(card));
    expect(f.kind).toBe("card");
    expect(f.summary).toContain("“Kessa”");
    expect(readPart(f.text, f.mime, { path: "data.first_mes" })).toBe("Hi.");
    expect(readPart(f.text, f.mime, { path: "data.description" })).toContain("3,000 more characters");
    const { store } = await setup(() => []);
    const ctx = ctxOf(store);
    ctx.files.set("f1", { name: "kessa.json", text: f.text, mime: f.mime });
    expect((await runTool("import_file", JSON.stringify({ file: "f1", as: "character" }), ctx)).result).toContain("Imported as character:");
    expect((await store.listCharacters()).map((c) => c.name)).toEqual(["Kessa"]);

    const old: AssistantMessage = { ...userMsg(""), role: "assistant", rounds: [{ text: "", calls: [{ id: "t1", name: "read", arguments: "{}" }] }], steps: [{ id: "t1", name: "read", args: "{}", result: "z".repeat(3000), label: "", error: false }], text: "ok" };
    const img = { type: "image" as const, id: "i1", name: "a.png", mime: "image/png", base64: "AAAA" };
    const chat = chatWith(userMsg("one", { attachments: [img] }), old, userMsg("two"), userMsg("three"));
    const turns = toTurns(chat, await loadSettings(store), "characters: 1");
    expect(String(turns.find((t) => t.role === "tool")!.content).length).toBeLessThan(500);
    expect(turns[1]!.content).toContain("[Image i1: a.png (sent earlier)]");
  });

  it("an assistant's instructions and a preset's style, rules, notes and memory go in; memory is written to the chat's preset", async () => {
    const { store, core, seen } = await setup((_r, i) => [[call("remember", { text: "Likes slow burn." })], ["Noted."]][i]!);
    const s0 = await loadSettings(store);
    expect(s0.assistants.map((a) => a.id)).toEqual(["homunculus", "card-smith", "loremaster", "story-architect", "editor"]);
    expect(s0.defaultPresetId).toBe("my-preferences");
    await saveSettings(store, { ...s0, presets: [...s0.presets, {
      id: "dark", name: "Dark fantasy", description: "", style: "Prose, 800 tokens.", memory: [], memoryOn: true, autoMemory: true,
      rules: [{ id: "r", text: "Cards in English.", on: true }, { id: "r2", text: "OFF RULE", on: false }, { id: "r3", text: "  ", on: true }],
      notes: [{ id: "n", title: "The Grey Order", text: "Rangers of the north.", on: true }],
    }] });
    const chat = { ...chatWith(userMsg("remember I like slow burn")), assistantId: "card-smith", presetId: "dark" };
    await runAssistant({ core, store, chat, main, connections: {}, onUpdate: () => {} });
    const sys = String(seen[0]!.rich![0]!.content);
    expect(sys).toContain("Your role — Card Smith");
    expect(sys).toContain("How the user likes things written:\nProse, 800 tokens.");
    expect(sys).toContain("- Cards in English.");
    expect(sys).not.toContain("OFF RULE");
    expect(sys).toContain("The Grey Order:\nRangers of the north.");
    const after = await loadSettings(store);
    expect(after.presets.find((p) => p.id === "dark")!.memory.map((m) => m.text)).toEqual(["Likes slow burn."]);
    expect(after.presets.find((p) => p.id === "dark")!.rules).toHaveLength(2); // the empty rule was dropped
    const reply = (await loadChat(store, "c1"))!.messages.at(-1)!;
    expect(reply.used).toMatchObject({ assistant: "Card Smith", preset: "Dark fantasy" });
    expect(reply.used!.parts!.preset).toBeGreaterThan(0);
  });

  it("round-1 settings move into the default assistant and a “My preferences” preset", async () => {
    const { store } = await setup(() => []);
    await store.setAppSetting("assistant.settings", { instructions: "Be terse.", model: "glm-5", rules: [{ id: "r", text: "No W++.", on: true }], memory: [{ id: "m", text: "Likes noir.", from: "", at: 1 }] });
    const s = await loadSettings(store);
    expect(s.assistants.find((a) => a.id === "homunculus")).toMatchObject({ instructions: "Be terse.", model: "glm-5" });
    expect(s.presets[0]).toMatchObject({ name: "My preferences", rules: [{ text: "No W++." }], memory: [{ text: "Likes noir." }] });
    expect(((await store.getAppSetting("assistant.settings")) as Record<string, unknown>).instructions).toBeUndefined();
  });

  it("stops a tool call that keeps repeating; switched-off tools are not offered; the reply records what was sent and how long it took", async () => {
    const { store, core, seen } = await setup((_r, i) => (i < 4 ? [call("find", { query: "x" }, `c${i}`)] : ["done"]));
    const s0 = await loadSettings(store);
    await saveSettings(store, { ...s0, toolsOff: ["create", "memory"], presets: s0.presets.map((p) => ({ ...p, rules: [{ id: "rule1", text: "Be brief.", on: true }] })) });
    const out = await runAssistant({ core, store, chat: chatWith(userMsg("look")), main, connections: {}, onUpdate: () => {} });
    const reply = out.messages.at(-1)!;
    expect(seen[0]!.tools!.map((t) => t.name)).not.toContain("create");
    expect(seen[0]!.tools!.map((t) => t.name)).not.toContain("remember");
    expect(reply.steps[2]).toMatchObject({ label: "Stopped a repeated find", error: true });
    expect(reply.text).toContain("kept repeating");
    expect(reply.used!.sent).toContain("rule1");
    expect(reply.steps[0]!.ms).toBeTypeOf("number");
    expect(reply.used!.calls).toBe(4);
  });

  it("compaction sums up older messages; the request then carries the summary instead", async () => {
    const { store, core, seen } = await setup((req) => (req.rich ? ["ok"] : ["The user is building a dark fantasy Kit; Lyra was made (character:lyra)."]));
    let chat = chatWith();
    for (let i = 0; i < 4; i++) chat = { ...chat, messages: [...chat.messages, userMsg(`question ${i}`), { ...userMsg(`answer ${i}`), role: "assistant" as const }] };
    chat = await compactChat({ core, store, chat, main, connections: {} });
    expect(chat.compact!.summary).toContain("dark fantasy");
    const turns = toTurns(chat, await loadSettings(store), "characters: 1");
    expect(String(turns[1]!.content)).toContain("[Summary of the earlier conversation");
    expect(turns.map((t) => String(t.content))).not.toContain("question 0");
    expect(turns.map((t) => String(t.content))).toContain("question 3");
    expect(seen[0]!.messages[0]!.content).toContain("You sum up a conversation");
    expect(needsCompaction({ ...chat, contextLength: 1000, messages: [...chat.messages, { ...userMsg(""), role: "assistant", used: { model: "", guides: [], lastPrompt: 900 } }] })).toBe(true);
    expect(needsCompaction({ ...chat, autoCompact: false, contextLength: 1000, messages: [...chat.messages, { ...userMsg(""), role: "assistant", used: { model: "", guides: [], lastPrompt: 900 } }] })).toBe(false);
  });

  it("folders (D-064): find shows them, create and move put items in them (made when missing), Undo puts things back", async () => {
    const { store } = await setup(() => []);
    await store.saveFolder({ id: "rpg", kind: "character", name: "RPG", parentId: null, createdAt: 1 });
    await store.saveCharacter(Character.parse({ id: "k1", name: "Kessa", description: "Mercenary, fantasy roleplay" }));
    await store.saveCharacter(Character.parse({ id: "k2", name: "Kessa", description: "Detective, modern roleplay" }));
    await store.setFolder("character", "k2", "rpg");
    const ctx = ctxOf(store);
    // two cards with one name are told apart by id and folder
    const found = (await runTool("find", JSON.stringify({ query: "kessa" }), ctx)).result;
    expect(found).toContain("character:k1 · Kessa — Mercenary");
    expect(found).toContain("character:k2 · Kessa [RPG] — Detective");
    expect((await runTool("find", JSON.stringify({ folder: "rpg" }), ctx)).result).not.toContain("k1");
    // a new character straight into a party folder inside RPG (case of the existing folder does not matter)
    const made = await runTool("create", JSON.stringify({ kind: "character", data: { name: "Bram" }, folder: "rpg/Iron Party" }), ctx);
    expect(made.error).toBeFalsy();
    const party = (await store.listFolders("character")).find((f) => f.name === "Iron Party")!;
    expect(party.parentId).toBe("rpg");
    expect((await store.listFolders("character"))).toHaveLength(2);
    // move the two Kessas in; a tracker can't be in folders
    const moved = await runTool("move", JSON.stringify({ items: ["character:k1", "character:k2", "tracker:x"], folder: "RPG/Iron Party" }), ctx);
    expect(moved.result).toContain("Moved 2 item(s)");
    expect(moved.result).toContain("Skipped: tracker:x");
    const map = await store.folderMap("character");
    expect([map.k1, map.k2]).toEqual([party.id, party.id]);
    expect((await runTool("folders", "{}", ctx)).result).toContain("RPG/Iron Party (3)");
    const card = ctx.results.find((r) => r.type === "moved")!;
    if (card.type !== "moved") throw new Error();
    expect(card.made).toEqual([]);
    await undoMove(store, card);
    expect(await store.folderMap("character")).toMatchObject({ k2: "rpg" });
    expect((await store.folderMap("character")).k1).toBeUndefined();
    await redoMove(store, card, () => crypto.randomUUID());
    expect((await store.folderMap("character")).k1).toBe(party.id);
    // a move into a new folder: Undo removes the folder it made when it is empty again
    const ctx2 = ctxOf(store);
    await runTool("move", JSON.stringify({ items: ["character:k1"], folder: "Drafts/Old" }), ctx2);
    const c2 = ctx2.results[0]!;
    if (c2.type !== "moved") throw new Error();
    expect(c2.made).toHaveLength(2);
    await undoMove(store, c2);
    expect((await store.listFolders("character")).map((f) => f.name).sort()).toEqual(["Iron Party", "RPG"]);
    // a change can't move things
    expect((await runTool("change", JSON.stringify({ id: "character:k1", changes: { folder: "X" } }), ctx)).error).toBe(true);
  });

  it("character versions (D-064): made with the card, added and updated by change, read one by one, used by a Kit's cast", async () => {
    const { store } = await setup(() => []);
    const ctx = ctxOf(store);
    const made = await runTool("create", JSON.stringify({ kind: "character", data: { name: "Ayaka", description: "A shrine maiden.", scenario: "Edo",
      variants: [{ label: "Modern AU", description: "A barista in Tokyo.", scenario: "Edo" }] } }), ctx);
    expect(made.result).toContain("2 versions");
    const id = (ctx.results[0] as { itemId: string }).itemId;
    let c = (await store.getCharacter(id))!;
    // a version keeps only what differs from the main one
    expect(c.variants[0]).toMatchObject({ label: "Modern AU", overrides: { description: "A barista in Tokyo." } });
    expect(c.variants[0]!.overrides.scenario).toBeUndefined();
    expect((await runTool("read", JSON.stringify({ id: `character:${id}` }), ctx)).result).toContain("Modern AU — changes: description");
    expect((await runTool("read", JSON.stringify({ id: `character:${id}`, fields: ["variant:modern au"] }), ctx)).result).toContain("barista");
    expect((await runTool("find", JSON.stringify({ query: "ayaka" }), ctx)).result).toContain("versions: Main, Modern AU");
    // add one and update the other in one proposal
    await runTool("change", JSON.stringify({ id: `character:${id}`, changes: { variants: { add: [{ label: "Wounded", firstMessages: ["*She limps.*"] }], update: [{ label: "Modern AU", scenario: "Shibuya, 2024" }] } }, summary: "Two versions" }), ctx);
    const prop = ctx.results.at(-1)!;
    if (prop.type !== "change") throw new Error();
    expect(prop.before.variants).toEqual([{ id: c.variants[0]!.id, label: "Modern AU", description: "A barista in Tokyo." }]);
    expect(await applyChange(store, prop, () => crypto.randomUUID())).toBe("applied");
    c = (await store.getCharacter(id))!;
    expect(c.variants.map((v) => v.label)).toEqual(["Modern AU", "Wounded"]);
    expect(c.variants[0]!.overrides).toEqual({ description: "A barista in Tokyo.", scenario: "Shibuya, 2024" });
    // adding a label that exists is refused; unknown fields are refused
    const dup = await runTool("change", JSON.stringify({ id: `character:${id}`, changes: { variants: { add: [{ label: "wounded" }] } } }), ctx);
    expect(dup.result).toMatch(/already a version “wounded”/);
    expect((await runTool("change", JSON.stringify({ id: `character:${id}`, changes: { variants: { update: [{ label: "Pirate", description: "Arr" }] } } }), ctx)).result).toMatch(/No version “Pirate”/);
    expect((await runTool("create", JSON.stringify({ kind: "character", data: { name: "X", variants: [{ label: "A", mood: "sad" }] } }), ctx)).result).toMatch(/Unknown field/);
    // a Kit can cast a version by its label
    await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Cafe", cast: [{ id: `character:${id}`, version: "Modern AU" }] } }), ctx);
    const kit = (await store.kits.list())[0]!;
    expect(kit.cast[0]).toMatchObject({ characterId: id, variantId: c.variants[0]!.id });
    expect((await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Bad", cast: [{ id: `character:${id}`, version: "Pirate" }] } }), ctx)).result).toMatch(/no version “Pirate”/);
  });

  it("each guide only names fields the app really has", () => {
    const shape = (s: { shape: Record<string, unknown> }) => Object.keys(s.shape);
    const have: Record<string, string[]> = {
      character: shape(Character),
      lorebook: [...shape(Lorebook), ...shape(LoreEntry)],
      tracker: ["name", "help", "prompt", "messages", "fields", "characters", ...shape((TrackerField as unknown as { unwrap(): never }).unwrap())],
      kit: [...shape(Story), "narratorId", "lorebookIds"],
      narrator: [...shape(Narrator), ...shape(Narrator.shape.style.unwrap() as never)],
    };
    for (const [k, g] of Object.entries(GUIDES)) for (const f of g.fields) expect(have[k], `${k}.${f}`).toContain(f);
  });
});
