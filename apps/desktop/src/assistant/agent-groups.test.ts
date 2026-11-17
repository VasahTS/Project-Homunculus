// Agent groups with the Assistant (D-134): a Kit and a story take agents by group name; trackers are kept. Author: CLAUDE, 2026-11-16.
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { Story } from "@homunculus/schemas";
import { SqlJsDriver, SqlStore, coreMigrations, migrate } from "@homunculus/core";
import { applyChange, runTool, type ToolContext } from "./tools.ts";
import { blankAgent, saveAgent } from "../agents.ts";
import { blankTracker, saveTracker } from "../trackers.ts";
import { cleanGroups, findGroup, saveAgentGroups } from "../agentGroups.ts";

async function setup() {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  const store = new SqlStore(driver);
  const a = await saveAgent(store, { ...blankAgent(), id: "agent-a", name: "Prose Polisher", prompt: "p" });
  const b = await saveAgent(store, { ...blankAgent(), id: "agent-b", name: "Choices", prompt: "p" });
  const c = await saveAgent(store, { ...blankAgent(), id: "agent-c", name: "Narrator Check", prompt: "p" });
  const t = blankTracker(); t.name = "World"; t.sets[0]!.fields = t.sets[0]!.fields.map((f) => ({ ...f, label: f.label || "Place" })); await saveTracker(store, t);
  await saveAgentGroups(store, [{ id: "g1", name: "RPG", agentIds: [a.id, b.id] }]);
  const ctx: ToolContext = { store, saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
  return { store, ctx, a, b, c, trackerId: t.id };
}

describe("agent groups", () => {
  it("cleans and finds groups by id or name", () => {
    const g = cleanGroups([{ id: "x", name: " Drama ", agentIds: ["a", "a", 3] }, { id: "x", name: "dup", agentIds: [] }, { name: "no id" }]);
    expect(g).toEqual([{ id: "x", name: "Drama", agentIds: ["a"] }]);
    expect(findGroup(g, "drama")?.id).toBe("x");
    expect(findGroup(g, "group:x")?.name).toBe("Drama");
  });

  it("a new Kit takes a group and single agents; find lists the groups", async () => {
    const { store, ctx, a, b, c } = await setup();
    expect((await runTool("find", JSON.stringify({ kind: "agent" }), ctx)).result).toMatch(/group “RPG” — (Prose Polisher, Choices|Choices, Prose Polisher)/);
    const made = await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Dungeon", agentGroups: ["rpg"], agentIds: ["Narrator Check"] } }), ctx);
    expect(made.error).toBeFalsy();
    const kit = (await store.kits.list())[0]!;
    expect(kit.setup.agents).toEqual({ mode: "add", add: [c.id, a.id, b.id], remove: [] });
    expect((await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Bad", agentGroups: ["Horror"] } }), ctx)).result).toMatch(/No agent group “Horror”. Groups: “RPG”/);
  });

  it("changes a story's agents only, keeping its trackers and other setup", async () => {
    const { store, ctx, a, b, c, trackerId } = await setup();
    await store.stories.save(Story.parse({ id: "s1", name: "Isekai", createdAt: 1, setup: { agents: { mode: "add", add: [trackerId, c.id], remove: [] }, lorebooks: { mode: "add", add: ["l"], remove: [] } } }));
    const read = JSON.parse((await runTool("read", JSON.stringify({ id: "story:s1", fields: ["agentIds"] }), ctx)).result);
    expect(read.agentIds).toEqual([c.id]);
    expect((await runTool("create", JSON.stringify({ kind: "story", data: { name: "x" } }), ctx)).error).toBe(true);
    expect((await runTool("change", JSON.stringify({ id: "story:s1", changes: { agentGroups: ["RPG"] }, summary: "RPG agents" }), ctx)).error).toBeFalsy();
    const proposal = ctx.results.at(-1) as Parameters<typeof applyChange>[1];
    expect((await store.stories.get("s1"))!.setup.agents!.add).toEqual([trackerId, c.id]);
    expect(await applyChange(store, proposal, ctx.newId)).toBe("applied");
    const s = (await store.stories.get("s1"))!;
    expect(s.setup.agents).toEqual({ mode: "add", add: [trackerId, a.id, b.id], remove: [] });
    expect(s.setup.lorebooks?.add).toEqual(["l"]);
    expect((await runTool("change", JSON.stringify({ id: "story:s1", changes: { name: "Renamed" } }), ctx)).result).toMatch(/Unknown field/);
  });

  it("D-141: a Kit gets agents, a group and an Author's Note in one go; a read shows them", async () => {
    const { store, ctx, a, b, c } = await setup();
    const made = await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Noir", agentGroups: ["RPG"], agentIds: ["Narrator Check"],
      authorsNote: { text: "Keep it terse and rainy.", depth: 2 } } }), ctx);
    expect(made.error, made.result).toBeFalsy();
    const kit = (await store.kits.list())[0]!;
    expect(kit.setup.agents).toEqual({ mode: "add", add: [c.id, a.id, b.id], remove: [] });
    expect(kit.setup.authorsNote).toEqual({ text: "Keep it terse and rainy.", depth: 2 });
    const read = JSON.parse((await runTool("read", JSON.stringify({ id: `kit:${kit.id}`, fields: ["agentIds", "authorsNote"] }), ctx)).result);
    expect(read.agentIds).toEqual([c.id, a.id, b.id]);
    expect(read.authorsNote).toEqual({ text: "Keep it terse and rainy.", depth: 2 });
    expect((await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Bad", authorsNote: { text: "x", where: "top" } } }), ctx)).result).toContain("Unknown Author's Note field(s): where");
    expect((await runTool("create", JSON.stringify({ kind: "kit", data: { name: "Bad", authorsNote: { position: "middle" } } }), ctx)).error).toBe(true);
  });

  it("D-141: a story's Author's Note changes part by part, and null removes it; agents and trackers stay", async () => {
    const { store, ctx, c, trackerId } = await setup();
    await store.stories.save(Story.parse({ id: "s1", name: "Isekai", createdAt: 1, setup: { agents: { mode: "add", add: [trackerId, c.id], remove: [] }, authorsNote: { text: "Old note.", interval: 2 } } }));
    expect((await runTool("change", JSON.stringify({ id: "story:s1", changes: { authorsNote: { text: "Slow burn; no time skips." } } }), ctx)).error).toBeFalsy();
    expect(await applyChange(store, ctx.results.at(-1) as Parameters<typeof applyChange>[1], ctx.newId)).toBe("applied");
    let s = (await store.stories.get("s1"))!;
    expect(s.setup.authorsNote).toEqual({ text: "Slow burn; no time skips.", interval: 2 });
    expect(s.setup.agents).toEqual({ mode: "add", add: [trackerId, c.id], remove: [] });
    expect((await runTool("change", JSON.stringify({ id: "story:s1", changes: { authorsNote: null } }), ctx)).error).toBeFalsy();
    expect(await applyChange(store, ctx.results.at(-1) as Parameters<typeof applyChange>[1], ctx.newId)).toBe("applied");
    s = (await store.stories.get("s1"))!;
    expect(s.setup.authorsNote).toBeUndefined();
  });
});
