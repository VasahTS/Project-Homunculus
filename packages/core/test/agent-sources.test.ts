// D-059: variables, more context sources, model override, "use as written", minimum tokens. Author: CLAUDE, 2026-10-31.
import type { AgentConfigInput } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { connection, isAgentCall, world } from "./helpers.ts";

async function install(store: Awaited<ReturnType<typeof world>>["store"], agents: AgentConfigInput[]) {
  for (const a of agents) await store.saveAgentConfig(a);
  await store.setDefaultSetup({ agents: { mode: "add", add: agents.map((a) => a.id), remove: [] }, authorsNote: { text: "Keep it rainy." } });
}

describe("agent options from v1 and Marinara (D-059)", () => {
  it("variables fill the instructions; a chat's value wins and is not sent again as a setting", async () => {
    let notes = 0;
    const w = await world((m) => isAgentCall(m) ? `note ${++notes}` : "ok");
    await install(w.store, [{ id: "pol", name: "Pol", triggers: [{ on: "manual" }], output: "note", prompt: "Never use: {{banned}}.",
      variables: [{ key: "banned", label: "Banned words", value: "ozone" }],
      input: { messages: 2, lorebooks: false, cards: false, state: false, readsAgents: [], persona: false, scenario: false, authorsNote: true, chapters: false, previousNotes: 2, minTokens: 0 },
      modelOverride: "fake-special", rawPrompt: true }]);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    await w.chat.turns.runManual(session.id, "pol", reply.id, connection);
    let sent = w.ai.prompts.at(-1)!;
    expect(sent[0]!.content).toBe("Never use: ozone.");
    expect(sent[1]!.content).toContain("## Author's Note\nKeep it rainy.");
    expect(sent[1]!.content).not.toContain("Answer with ONLY"); // use as written
    expect((await w.store.listAgentRuns(reply.id)).at(-1)?.model).toBe("fake-special");
    await w.store.saveSession({ ...(await w.store.getSession(session.id))!, setup: { ...session.setup, agentOverrides: { pol: { settings: { banned: "velvet" } } } } });
    await w.chat.turns.runManual(session.id, "pol", reply.id, connection);
    sent = w.ai.prompts.at(-1)!;
    expect(sent[0]!.content).toBe("Never use: velvet.");
    expect(sent[1]!.content).not.toContain("## Settings");
    // with "use as written" the fake AI can't tell it is an agent call and answers "ok": that is the previous note
    expect(sent[1]!.content).toContain("## Your previous notes (oldest first)\nok");
  });

  it("an agent waits until the messages it reads reach its minimum tokens", async () => {
    const w = await world((m) => isAgentCall(m) ? "n" : "ok");
    await install(w.store, [{ id: "big", name: "Big", triggers: [{ on: "turn", phase: "after" }], output: "note",
      input: { messages: 4, lorebooks: false, cards: false, state: false, readsAgents: [], persona: false, scenario: false, authorsNote: false, chapters: false, previousNotes: 0, minTokens: 5000 } }]);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    expect(await w.store.listNotes(reply.id)).toHaveLength(0);
  });
});
