// D-057 (Daniel, 31/10): notes go back to the story's AI; a run can get a direction; an agent can use its own connection.
// Author: CLAUDE, 2026-10-31.
import type { AgentConfigInput } from "@homunculus/schemas";
import { AgentConfig } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { noteFeedback, withDirection } from "../src/index.ts";
import { connection, isAgentCall, world } from "./helpers.ts";

const after = [{ on: "turn" as const, phase: "after" as const }];

async function install(store: Awaited<ReturnType<typeof world>>["store"], agents: AgentConfigInput[]) {
  for (const a of agents) await store.saveAgentConfig(a);
  await store.setDefaultSetup({ agents: { mode: "add", add: agents.map((a) => a.id), remove: [] } });
}

describe("notes back to the story's AI (D-057)", () => {
  it("is on for notes in the chat, off for views and panel-only notes, unless the agent says", () => {
    const base = { id: "n", name: "N", triggers: after, output: "note" as const };
    expect(noteFeedback(AgentConfig.parse(base))).toEqual({ on: true, notes: 1 });
    expect(noteFeedback(AgentConfig.parse({ ...base, display: { note: "view" } })).on).toBe(false);
    expect(noteFeedback(AgentConfig.parse({ ...base, display: { note: "menu" } })).on).toBe(false);
    expect(noteFeedback(AgentConfig.parse({ ...base, display: { note: "menu" }, feedback: { on: true, notes: 2 } }))).toEqual({ on: true, notes: 2 });
    expect(noteFeedback(AgentConfig.parse({ ...base, output: "choices" })).on).toBe(false);
  });

  it("the next reply's prompt carries the latest note of this branch, just before your message", async () => {
    let notes = 0;
    const w = await world((m) => isAgentCall(m) ? `Note ${++notes}: the lantern was blue.` : "She nods.");
    await install(w.store, [
      { id: "continuity", name: "Continuity", triggers: after, output: "note" },
      { id: "feed", name: "Feed", triggers: after, output: "note", display: { note: "view" } },
    ]);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    expect((await w.store.listNotes(reply.id, "continuity")).length).toBe(1);
    await w.chat.send(session.id, reply.id, "And then?", connection);
    const main = w.ai.prompts.filter((p) => !isAgentCall(p)).at(-1)!;
    const i = main.findIndex((t) => t.content.includes("[Continuity — note on the latest reply]"));
    expect(i).toBeGreaterThan(-1);
    expect(main[i]!.content).toMatch(/Note \d: the lantern was blue\./);
    expect(main.at(-1)!.content).toContain("And then?");
    expect(i).toBe(main.length - 2);
    expect(main.some((t) => t.content.includes("[Feed"))).toBe(false);
  });

  it("a manual run takes a direction for that run only, records it, and the note keeps its model", async () => {
    const w = await world((m) => isAgentCall(m) ? "Go to the docks." : "ok");
    await install(w.store, [{ id: "cyoa", name: "CYOA", triggers: [{ on: "manual" }], output: "note", prompt: "Offer options." }]);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    await w.chat.turns.runManual(session.id, "cyoa", reply.id, connection, undefined, undefined, { direction: "options that lead to the docks" });
    const sent = w.ai.prompts.filter((p) => isAgentCall(p)).at(-1)!.map((t) => t.content).join("\n");
    expect(sent).toContain("For this run only, follow this direction from User: options that lead to the docks");
    const [run] = await w.store.listAgentRuns(reply.id);
    expect(run).toMatchObject({ status: "ok", direction: "options that lead to the docks", model: "fake-1" });
    const [note] = await w.store.listNotes(reply.id, "cyoa");
    expect(note!.data).toEqual({ model: "fake-1" });
    // the saved agent did not change
    expect((await w.store.agentConfigs.get("cyoa"))!.prompt).toBe("Offer options.");
    // text agents never get it (they make no AI call)
    const text = AgentConfig.parse({ id: "t", name: "T", triggers: after, output: "inject", runMode: "text", prompt: "Rain." });
    expect(withDirection(text, "snow").prompt).toBe("Rain.");
  });

  it("an agent can use its own connection; a story/chat pick for that agent still wins", async () => {
    const w = await world((m) => isAgentCall(m) ? "A note." : "ok");
    await install(w.store, [{ id: "n", name: "N", triggers: [{ on: "manual" }], output: "note", connectionId: "cheap" }]);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    const connections = { cheap: { providerId: "fake", model: "fake-cheap" }, big: { providerId: "fake", model: "fake-big" } };
    await w.chat.turns.runManual(session.id, "n", reply.id, connection, undefined, connections);
    expect((await w.store.listAgentRuns(reply.id)).at(-1)?.model).toBe("fake-cheap");
    await w.store.saveSession({ ...(await w.store.getSession(session.id))!, setup: { ...session.setup, agentOverrides: { n: { connectionId: "big" } } } });
    await w.chat.turns.runManual(session.id, "n", reply.id, connection, undefined, connections);
    const runs = (await w.store.listAgentRuns(reply.id)).sort((a, b) => a.startedAt - b.startedAt);
    expect(runs.at(-1)?.model).toBe("fake-big");
  });
});
