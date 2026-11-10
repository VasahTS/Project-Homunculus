// Tests for the Assistant (D-062): the tool loop, light reading, proposals, files, and the guides. Author: CLAUDE, 2026-11-01.
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { Cue, Character, Persona, LoreEntry, Lorebook, Narrator, Preset, PresetBlock, Story, TrackerField, FieldDisplay, FieldType, AssistantChat, type AssistantMessage } from "@homunculus/schemas";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate, type GenerateRequest, type StreamChunk } from "@homunculus/core";
import { compactChat, loadChat, needsCompaction, runAssistant, saveSettings, toTurns, loadSettings } from "./engine.ts";
import { applyChange, approveNew, redoMove, runTool, undoMove, type ToolContext } from "./tools.ts";
import { parseFile, readPart } from "./files.ts";
import { GUIDES } from "./guides.ts";
import { blankSet, blankTracker, listTrackers, saveTracker } from "../trackers.ts";

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
  // Tracker help is the filling instruction; note explains the story consequences. Keep both through every tool path. CODEX, 2026-11-03.
  const quest = {
    key: "quest", label: "Quest", type: "text", scope: "global", display: "block", icon: "scroll",
    help: "Write the active quest, its giver and known objectives. Leave empty when no quest is active. Never invent hidden traps.",
    note: "A quest is a commitment; its stakes and known conditions should shape the story.",
  };
  it.each([true, false])("preserves separate tracker field help and note when saveNew is %s", async (saveNew) => {
    const { store } = await setup(() => []);
    const ctx = { ...ctxOf(store), saveNew };
    expect((await runTool("create", JSON.stringify({ kind: "tracker", data: { name: "Adventure", help: "Track the adventure.", fields: [quest] } }), ctx)).error).toBeFalsy();
    if (!saveNew) {
      expect(await listTrackers(store)).toHaveLength(0);
      await approveNew(store, ctx.results[0] as Extract<(typeof ctx.results)[number], { type: "new" }>, ctx.newId);
    }
    const t = (await listTrackers(store))[0]!;
    expect(t.agent.help).toBe("Track the adventure.");
    expect(t.sets[0]!.fields[0]).toMatchObject({ help: quest.help, note: quest.note, display: quest.display, icon: quest.icon });
  });
  it("reads field help and note separately and retains them when applying a tracker change", async () => {
    const { store } = await setup(() => []);
    const draft = blankTracker(); draft.name = "Adventure";
    draft.sets[0]!.fields = [TrackerField.parse(quest)];
    await saveTracker(store, draft);
    const ctx = ctxOf(store), ref = `tracker:${draft.id}`;
    const current = JSON.parse((await runTool("read", JSON.stringify({ id: ref, fields: ["fields"] }), ctx)).result);
    expect(current.fields[0]).toMatchObject({ help: quest.help, note: quest.note });
    const updated = { ...current.fields[0], help: "Write only the currently accepted quest. Leave empty after completion." };
    expect((await runTool("change", JSON.stringify({ id: ref, changes: { fields: [updated] } }), ctx)).error).toBeFalsy();
    const proposal = ctx.results[0] as Extract<(typeof ctx.results)[number], { type: "change" }>;
    expect(await applyChange(store, proposal, ctx.newId)).toBe("applied");
    expect((await listTrackers(store))[0]!.sets[0]!.fields[0]).toMatchObject({ help: updated.help, note: quest.note });
  });
  it("gives the Assistant the two tracker field meanings, their editor labels and a correctly split Quest example", async () => {
    const { store, core, seen } = await setup((_req, i) => i === 0 ? [call("guide", { kind: "tracker" })] : ["Ready."]);
    await runAssistant({ core, store, chat: chatWith(userMsg("Build a Quest tracker")), main, connections: {}, onUpdate: () => {} });
    expect(String(seen[0]!.rich![0]!.content)).toContain("fields[].help");
    const guide = seen[1]!.rich!.find((t) => t.role === "tool")!.content as string;
    expect(guide).toContain('help: "What the AI should write here — and when to leave it empty"');
    expect(guide).toContain('note: "What it means in the story"');
    expect(guide).toContain("tracker AI");
    expect(guide).toContain("story AI");
    expect(guide).toContain('"label": "Quest"');
    const example = JSON.parse(guide.match(/\{ "label": "Quest"[^\n]+/u)![0]);
    expect(example.help).toMatch(/leave.*empty/i);
    expect(example.note).toBeTruthy();
    expect(example.help).not.toBe(example.note);
  });
  // Full field-schema audit after the reported all-Auto problem. CODEX, 2026-11-03.
  it("retains presentation, manual locks, list columns and presence through create, read and change", async () => {
    const { store } = await setup(() => []), ctx = ctxOf(store);
    const fields = [
      TrackerField.parse({ ...quest, display: "block", icon: "scroll", color: "#336699", lockedForAgents: true, required: false, toPrompt: false, section: "Adventure" }),
      TrackerField.parse({ key: "present", label: "Presence", type: "status", options: ["here", "away"], scope: "perCharacter", display: "line", icon: "pin", help: "Where they are.", section: "Now" }),
      TrackerField.parse({ key: "inventory", label: "Inventory", type: "list", scope: "perCharacter", display: "block", icon: "bag", fields: [
        TrackerField.parse({ key: "title", label: "Title", type: "text", help: "The item's name." }),
        TrackerField.parse({ key: "quantity", label: "Quantity", type: "number", min: 0, max: 99, help: "How many they carry." }),
      ] }),
    ];
    const presence = { field: "present", value: "here" };
    const result = await runTool("create", JSON.stringify({ kind: "tracker", data: { name: "All options", fields, characters: "anyone", presence } }), ctx);
    expect(result.error, result.result).toBeFalsy();
    const t = (await listTrackers(store))[0]!;
    expect(t.sets[0]).toMatchObject({ fields, characters: "anyone", presence });
    const current = JSON.parse((await runTool("read", JSON.stringify({ id: `tracker:${t.agent.id}` }), ctx)).result);
    // read omits empty/default values to save tokens; the schema restores those without losing nondefault options.
    expect({ ...current, fields: current.fields.map((f: unknown) => TrackerField.parse(f)) }).toMatchObject({ fields, presence });
    current.fields[0].note = "Updated story meaning.";
    expect((await runTool("change", JSON.stringify({ id: `tracker:${t.agent.id}`, changes: { fields: current.fields } }), ctx)).error).toBeFalsy();
    const proposal = ctx.results.at(-1) as Extract<(typeof ctx.results)[number], { type: "change" }>;
    expect(await applyChange(store, proposal, ctx.newId)).toBe("applied");
    expect((await listTrackers(store))[0]!.sets[0]).toMatchObject({ fields: current.fields, presence });
    await runTool("change", JSON.stringify({ id: `tracker:${t.agent.id}`, changes: { presence: null } }), ctx);
    expect(await applyChange(store, ctx.results.at(-1) as typeof proposal, ctx.newId)).toBe("applied");
    expect((await listTrackers(store))[0]!.sets[0]!.presence).toBeUndefined();
  });
  it("preserves every schema field type and every supported presentation instead of coercing them to text or Auto", async () => {
    const { store } = await setup(() => []), ctx = ctxOf(store);
    const fields = [
      ...["auto", "header", "block"].map((display, i) => ({ key: `global${i}`, label: `Global ${i}`, type: "text", scope: "global", display })),
      ...["auto", "subtitle", "lead", "pill", "line", "tile", "block", "note"].map((display, i) => ({ key: `person${i}`, label: `Person ${i}`, type: "text", scope: "perCharacter", display })),
      { key: "date", label: "Date", type: "datetime" },
      { key: "group", label: "Legacy group", type: "group", fields: [{ key: "child", label: "Child", type: "meter", help: "A whole number.", min: 0, max: 10 }] },
      { key: "trust", label: "Trust", type: "meter", scope: "perPair", display: "tile", min: 0, max: 10 },
    ];
    const result = await runTool("create", JSON.stringify({ kind: "tracker", data: { name: "Layouts and types", fields } }), ctx);
    expect(result.error, result.result).toBeFalsy();
    const saved = (await listTrackers(store))[0]!.sets[0]!.fields;
    for (const field of fields) {
      const actual = saved.find(f => f.key === field.key)!;
      expect(actual.type).toBe(field.type);
      if ("display" in field) expect(actual.display ?? "auto").toBe(field.display);
      if ("fields" in field) expect(actual.fields[0]).toMatchObject(field.fields![0]!);
    }
  });
  it("explains the tracker options and the default-field-set tool boundary", () => {
    const guide = GUIDES.tracker!.text;
    for (const term of ["display", '"header"', '"block"', '"tile"', '"pill"', "lockedForAgents", "icon", "color", "columns", "presence", "default field set", "key", "complete replacement"]) expect(guide).toContain(term);
    for (const option of [...FieldDisplay.options, ...FieldType.options]) expect(guide).toContain(`"${option}"`);
    const fieldShape = (TrackerField as unknown as { unwrap(): { shape: Record<string, unknown> } }).unwrap().shape;
    for (const name of Object.keys(fieldShape)) expect(GUIDES.tracker!.fields).toContain(name);
  });
  it("generates unique permanent keys for new fields and nested list columns with no supplied keys", async () => {
    const { store } = await setup(() => []);
    const out = await runTool("create", JSON.stringify({ kind: "tracker", data: { name: "New table", fields: [
      { label: "Items", type: "list", fields: [{ label: "Name", type: "text" }, { label: "Name", type: "number" }] },
      { key: "items", label: "Existing key", type: "text" },
    ] } }), ctxOf(store));
    expect(out.error, out.result).toBeFalsy();
    const fields = (await listTrackers(store))[0]!.sets[0]!.fields;
    expect(new Set(fields.map(f => f.key)).size).toBe(2);
    expect(fields[1]!.key).toBe("items");
    const columns = fields[0]!.fields;
    expect(new Set(columns.map(f => f.key)).size).toBe(2);
    for (const f of [...fields, ...columns]) expect(f.key).toMatch(/^[A-Za-z][\w-]*$/);
  });
  it("keeps nondefault field sets untouched and detects a manual help-only edit before applying a proposal", async () => {
    const { store } = await setup(() => []), ctx = ctxOf(store);
    const draft = blankTracker(); draft.name = "Sets"; draft.sets[0]!.fields = [TrackerField.parse(quest)];
    const other = blankSet("Other"); other.fields = [TrackerField.parse({ key: "mana", label: "Mana", type: "meter", scope: "perCharacter", display: "tile", icon: "bolt", help: "Only for mages.", min: 0, max: 20 })];
    draft.sets.push(other); await saveTracker(store, draft);
    const ref = `tracker:${draft.id}`;
    await runTool("change", JSON.stringify({ id: ref, changes: { fields: [{ ...quest, note: "New meaning." }] } }), ctx);
    expect(await applyChange(store, ctx.results.at(-1) as Extract<(typeof ctx.results)[number], { type: "change" }>, ctx.newId)).toBe("applied");
    expect((await listTrackers(store))[0]!.sets.find(s => s.id === other.id)).toMatchObject({ fields: other.fields });
    await runTool("change", JSON.stringify({ id: ref, changes: { fields: [quest] } }), ctx);
    const latest = (await listTrackers(store))[0]!;
    await store.saveTrackerSchema({ ...latest.sets[0]!, fields: latest.sets[0]!.fields.map(f => ({ ...f, help: "Edited by hand after the proposal." })) });
    expect(await applyChange(store, ctx.results.at(-1) as Extract<(typeof ctx.results)[number], { type: "change" }>, ctx.newId)).toBe("stale");
  });
  it.each([
    { fields: [{ ...quest, type: "imaginary" }] },
    { fields: [{ ...quest, display: "bubble" }] },
    { fields: [{ ...quest, display: "tile" }] },
    { fields: [{ ...quest, type: "list", fields: "not a list" }] },
    { fields: [quest], characters: "everyone" },
    { fields: [quest], presence: { field: "quest", value: "here" } },
    { fields: [quest, { ...quest, label: "Duplicate key" }] },
  ])("refuses invalid tracker options instead of silently defaulting them (%j)", async (data) => {
    const { store } = await setup(() => []);
    const result = await runTool("create", JSON.stringify({ kind: "tracker", data: { name: "Invalid", ...data } }), ctxOf(store));
    expect(result.error).toBe(true);
    expect(await listTrackers(store)).toHaveLength(0);
  });
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
    for (let i = 0; i < 60; i++) await store.saveCharacter(Character.parse({ id: `c${i}`, name: `Person ${i}`, description: "x".repeat(9000) }));
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
    // Paging now has clean data and a machine-readable cursor rather than prose embedded in description. CODEX.
    expect(char.length).toBeLessThan(7000);
    expect(JSON.parse(char)._read[0].next).toMatchObject({ fields: ["description"], offset: 6000 });
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
    // A tiny known context forces an excerpt; recent reads normally remain intact within the read budget. CODEX.
    const chat = { ...chatWith(userMsg("one", { attachments: [img] }), old, userMsg("two"), userMsg("three")), contextLength: 1 };
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
    const have: Record<string, string[]> = { persona: shape(Persona),
      character: shape(Character),
      lorebook: [...shape(Lorebook), ...shape(LoreEntry)],
      tracker: ["name", "help", "prompt", "messages", "fields", "characters", "presence", ...shape((TrackerField as unknown as { unwrap(): never }).unwrap())],
      kit: [...shape(Story), "narratorId", "lorebookIds"],
      narrator: [...shape(Narrator), ...shape(Narrator.shape.style.unwrap() as never)],
      preset: ["from", ...shape(Preset), ...shape(PresetBlock)],
      cue: shape(Cue),
    };
    for (const [k, g] of Object.entries(GUIDES)) for (const f of g.fields) expect(have[k], `${k}.${f}`).toContain(f);
  });
});
