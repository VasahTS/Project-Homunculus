// The Assistant and field sets (D-139): it sees every set of every tracker, reads one whole, adds/updates/removes sets
// and picks the default; a Kit or a story switches trackers on with the field set each uses. Author: CLAUDE, 2026-11-17.
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { AssistantChat, AssistantSettings, Story, type AssistantMessage, type TrackerField } from "@homunculus/schemas";
import { SqlJsDriver, SqlStore, coreMigrations, migrate } from "@homunculus/core";
import { applyChange, runTool, type ToolContext } from "./tools.ts";
import { toTurns } from "./engine.ts";
import { blankAgent, saveAgent } from "../agents.ts";
import { blankTracker, copySet, listTrackers, saveTracker } from "../trackers.ts";

const field = (key: string, label: string, scope: TrackerField["scope"] = "perCharacter"): TrackerField =>
  ({ key, label, help: `Write ${label}.`, type: "text", options: [], scope, lockedForAgents: false, toPrompt: true, required: false, section: "", fields: [] });

async function setup() {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  const store = new SqlStore(driver);
  const t = blankTracker(); t.id = "chars"; t.name = "Scene: Characters";
  t.sets[0]!.fields = [field("look", "Appearance"), field("mood", "Mood")];
  const fantasy = copySet(t.sets[0]!, "Fantasy"); fantasy.fields = [...fantasy.fields, field("mana", "Mana")];
  t.sets.push(fantasy);
  await saveTracker(store, t);
  const w = blankTracker(); w.id = "world"; w.name = "Scene: World"; w.sets[0]!.fields = [field("place", "Place", "global")];
  await saveTracker(store, w);
  const agent = await saveAgent(store, { ...blankAgent(), id: "polish", name: "Prose Polisher", prompt: "p" });
  const ctx: ToolContext = { store, saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
  return { store, ctx, fantasyId: fantasy.id, agent };
}
const sets = async (store: SqlStore) => (await listTrackers(store)).find((x) => x.agent.id === "chars")!.sets;
const lastChange = (ctx: ToolContext) => ctx.results.at(-1) as Parameters<typeof applyChange>[1];

describe("the Assistant and field sets (D-139)", () => {
  it("find and read show every field set; one set reads whole", async () => {
    const { ctx } = await setup();
    const found = (await runTool("find", JSON.stringify({ kind: "tracker" }), ctx)).result;
    expect(found).toContain("Scene: Characters — field sets: Standard (default) 2, Fantasy 3");
    const read = JSON.parse((await runTool("read", JSON.stringify({ id: "tracker:chars" }), ctx)).result);
    expect(read.defaultFieldSet).toBe("Standard");
    expect(read.fieldSets).toEqual([
      { name: "Standard", default: true, characters: "cast", fields: "2: Appearance (perCharacter), Mood (perCharacter)" },
      { name: "Fantasy", characters: "cast", fields: "3: Appearance (perCharacter), Mood (perCharacter), Mana (perCharacter)" },
    ]);
    expect(read.fieldSetsFull).toBeUndefined();
    const one = JSON.parse((await runTool("read", JSON.stringify({ id: "tracker:chars", fields: ["fieldSet:fantasy"] }), ctx)).result);
    expect(one.name).toBe("Fantasy");
    expect(one.fields.map((f: TrackerField) => f.key)).toEqual(["look", "mood", "mana"]);
    expect((await runTool("read", JSON.stringify({ id: "tracker:chars", fields: ["fieldSet:Horror"] }), ctx)).result).toContain("no field set “Horror”");
  });

  it("adds a set from a copy (keys kept), updates one, picks the default", async () => {
    const { store, ctx } = await setup();
    const out = await runTool("change", JSON.stringify({ id: "tracker:chars", summary: "Cyberpunk set", changes: {
      fieldSets: {
        add: [{ name: "Cyberpunk", from: "Fantasy", fields: [{ key: "look", label: "Appearance", type: "text", scope: "perCharacter" }, { label: "Cyberware", type: "text", scope: "perCharacter" }] }],
        update: [{ name: "Fantasy", rename: "High Fantasy", help: "Swords and spells." }],
      },
      defaultFieldSet: "Cyberpunk",
    } }), ctx);
    expect(out.error, out.result).toBeFalsy();
    expect((await sets(store)).map((s) => s.name)).toEqual(["Standard", "Fantasy"]);
    expect(await applyChange(store, lastChange(ctx), ctx.newId)).toBe("applied");
    const now = await sets(store);
    expect(now.map((s) => s.name)).toEqual(["Cyberpunk", "High Fantasy", "Standard"]);
    expect(now[0]!.fields.map((f) => f.key)).toEqual(["look", "cyberware"]);
    expect(now[1]!.help).toBe("Swords and spells.");
    expect(await runTool("change", JSON.stringify({ id: "tracker:chars", changes: { fieldSets: { add: [{ name: "standard", from: "Standard" }] } } }), ctx)).toMatchObject({ error: true });
    expect((await runTool("change", JSON.stringify({ id: "tracker:chars", changes: { fieldSets: { remove: ["Cyberpunk"] } } }), ctx)).result).toContain("is the default field set");
  });

  it("never removes a set a story, Kit, chat or NPC uses", async () => {
    const { store, ctx, fantasyId } = await setup();
    await store.stories.save(Story.parse({ id: "s1", name: "Elves", createdAt: 1, setup: { agents: { mode: "add", add: ["chars"], remove: [] }, agentOverrides: { chars: { schemaId: fantasyId } } } }));
    expect((await runTool("change", JSON.stringify({ id: "tracker:chars", changes: { fieldSets: { remove: ["Fantasy"] } } }), ctx)).result).toContain("in the story “Elves”");
    await store.stories.save(Story.parse({ id: "s1", name: "Elves", createdAt: 1 }));
    expect((await runTool("change", JSON.stringify({ id: "tracker:chars", changes: { fieldSets: { remove: ["Fantasy"] } } }), ctx)).error).toBeFalsy();
    expect(await applyChange(store, lastChange(ctx), ctx.newId)).toBe("applied");
    expect((await sets(store)).map((s) => s.name)).toEqual(["Standard"]);
  });

  it("creates a tracker with several field sets in one call", async () => {
    const { store, ctx } = await setup();
    const out = await runTool("create", JSON.stringify({ kind: "tracker", data: { name: "Heist Board", fieldSetName: "Classic",
      fields: [{ label: "Target", type: "text", scope: "global" }],
      fieldSets: { add: [{ name: "Space", from: "Classic", fields: [{ key: "target", label: "Target", type: "text" }, { label: "Ship", type: "text" }] }] } } }), ctx);
    expect(out.error, out.result).toBeFalsy();
    const t = (await listTrackers(store)).find((x) => x.agent.name === "Heist Board")!;
    expect(t.sets.map((s) => s.name)).toEqual(["Classic", "Space"]);
  });

  it("a Kit switches trackers on with their field sets; a read shows them; agents are kept", async () => {
    const { store, ctx, fantasyId, agent } = await setup();
    const made = await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Elf Road", agentIds: ["Prose Polisher"],
      trackers: [{ tracker: "Scene: Characters", fieldSet: "Fantasy" }, "Scene: World"] } }), ctx);
    expect(made.error, made.result).toBeFalsy();
    const kit = (await store.kits.list())[0]!;
    expect(kit.setup.agents).toEqual({ mode: "add", add: [agent.id, "chars", "world"], remove: [] });
    expect(kit.setup.agentOverrides).toEqual({ chars: { schemaId: fantasyId } });
    const read = JSON.parse((await runTool("read", JSON.stringify({ id: `kit:${kit.id}`, fields: ["trackers"] }), ctx)).result);
    expect(read.trackers).toEqual([
      { tracker: "Scene: Characters", id: "tracker:chars", fieldSet: "Fantasy" },
      { tracker: "Scene: World", id: "tracker:world", fieldSet: "Standard" },
    ]);
    expect((await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Bad", trackers: [{ tracker: "Scene: Characters", fieldSet: "Horror" }] } }), ctx)).result).toContain("no field set “Horror”");
    expect((await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Bad", trackers: ["Prose Polisher"] } }), ctx)).result).toContain("that is an agent");
  });

  it("a story's trackers change (the default set clears its pick); its agents stay", async () => {
    const { store, ctx, fantasyId, agent } = await setup();
    await store.stories.save(Story.parse({ id: "s1", name: "Elves", createdAt: 1, setup: { agents: { mode: "add", add: [agent.id, "chars"], remove: [] }, agentOverrides: { chars: { schemaId: fantasyId } } } }));
    expect((await runTool("change", JSON.stringify({ id: "story:s1", changes: { trackers: [{ tracker: "chars", fieldSet: "Standard" }, "world"] } }), ctx)).error).toBeFalsy();
    expect(await applyChange(store, lastChange(ctx), ctx.newId)).toBe("applied");
    const s = (await store.stories.get("s1"))!;
    expect(s.setup.agents).toEqual({ mode: "add", add: [agent.id, "chars", "world"], remove: [] });
    expect(s.setup.agentOverrides).toBeUndefined();
  });

  it("D-140: a tracker added with a field set tells the Assistant which set to work on", () => {
    const msg: AssistantMessage = { id: "m", role: "user", text: "Add mana.", reasoning: "", steps: [], rounds: [], results: [], createdAt: 1,
      attachments: [{ type: "item", kind: "tracker", id: "chars", name: "Scene: Characters · Fantasy", fieldSet: "Fantasy" }, { type: "item", kind: "tracker", id: "world", name: "Scene: World" }] };
    const turns = toTurns(AssistantChat.parse({ id: "c", messages: [msg], createdAt: 1, updatedAt: 1 }), AssistantSettings.parse({}), "");
    const text = JSON.stringify(turns.at(-1));
    expect(text).toContain("the user picked its field set “Fantasy”");
    expect(text).toContain('fieldSet:Fantasy');
    expect(text).toContain("[Added: tracker:world · Scene: World]");
  });
});
