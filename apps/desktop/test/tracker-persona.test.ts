// Tracker persona delivery regressions. Author: CODEX, 2026-11-03.
import { describe, expect, it } from "vitest";
import { connection, isAgentCall, newTestStore, world } from "../../../packages/core/test/helpers.ts";
import { blankTracker, draftOf, installStarterTrackers, listTrackers, saveTracker } from "../src/trackers.ts";
import starter from "../src/starter/trackers.json";

async function legacyInstall(store: Awaited<ReturnType<typeof newTestStore>>["store"]) {
  await installStarterTrackers(store);
  for (const t of starter.trackers) {
    const agent = (await store.agentConfigs.get(t.agent.id))!;
    await store.saveAgentConfig({ ...agent, version: 1, input: { ...agent.input, persona: false } });
  }
}

describe("trackers read the user's persona", () => {
  it("installs every starter tracker with persona context enabled", async () => {
    const { store } = await newTestStore();
    await installStarterTrackers(store);
    for (const t of starter.trackers) {
      expect((await store.agentConfigs.get(t.agent.id))!.input.persona, t.agent.id).toBe(true);
    }
  });

  it("repairs existing starter inputs once without replacing custom instructions or field sets", async () => {
    const { store } = await newTestStore();
    await legacyInstall(store);
    const agent = (await store.agentConfigs.get("scene-characters"))!;
    await store.saveAgentConfig({ ...agent, prompt: "Keep my custom tracking rules.", connectionId: "tracker-model", input: { ...agent.input, messages: 3 } });
    const before = (await store.agentConfigs.get(agent.id))!;
    const set = (await store.trackerSchemas.get(agent.state!.schemaId!))!;
    await store.saveTrackerSchema({ ...set, name: "My field set" });
    const fieldsBefore = await store.trackerSchemas.list();

    await installStarterTrackers(store);
    const after = (await store.agentConfigs.get(agent.id))!;
    expect(after.input.persona).toBe(true);
    expect(after).toEqual({ ...before, version: after.version, input: { ...before.input, persona: true } });
    expect(after.version).toBeGreaterThan(before.version);
    expect(await store.trackerSchemas.list()).toEqual(fieldsBefore);

    // Once upgraded, a later explicit opt-out belongs to the user.
    await store.saveAgentConfig({ ...after, input: { ...after.input, persona: false } });
    await installStarterTrackers(store);
    expect((await store.agentConfigs.get(agent.id))!.input.persona).toBe(false);
  });

  it("keeps deleted starters deleted and leaves imported replacements alone", async () => {
    const { store } = await newTestStore();
    await legacyInstall(store);
    await store.agentConfigs.delete("scene-world");
    const old = (await store.agentConfigs.get("scene-characters"))!;
    const replacement = await store.saveAgentConfig({ ...old, source: { kind: "imported", from: "My tracker" } });
    await installStarterTrackers(store);
    expect(await store.agentConfigs.get("scene-world")).toBeUndefined();
    expect(await store.agentConfigs.get(replacement.id)).toEqual(replacement);
  });

  it("includes the persona for new custom trackers and preserves an existing explicit opt-out", async () => {
    const { store } = await newTestStore();
    const draft = blankTracker();
    draft.name = "Custom people";
    draft.sets[0]!.fields[0]!.label = "Hair";
    await saveTracker(store, draft);
    const agent = (await store.agentConfigs.get(draft.id))!;
    expect(agent.input.persona).toBe(true);
    await store.saveAgentConfig({ ...agent, input: { ...agent.input, persona: false } });
    const tracker = (await listTrackers(store)).find(t => t.agent.id === draft.id)!;
    await saveTracker(store, { ...draftOf(tracker), name: "Renamed people" });
    expect((await store.agentConfigs.get(draft.id))!.input.persona).toBe(false);
  });

  it.each([
    { position: "inPrompt" as const, depth: 2, role: "system" as const },
    { position: "atDepth" as const, depth: 0, role: "user" as const },
    { position: "atDepth" as const, depth: 2, role: "system" as const },
    { position: "atDepth" as const, depth: 100, role: "assistant" as const },
  ])("sends the selected persona version to an installed Characters tracker at $position/$depth/$role", async placement => {
    const w = await world(m => isAgentCall(m) ? "{}" : "Lyra opens the gate.");
    await legacyInstall(w.store);
    await installStarterTrackers(w.store);
    await w.store.savePersona({ id: "player", name: "Main courier", description: "Black hair. 160 cm.", placement,
      variants: [{ id: "knight", label: "Knight", overrides: { name: "Mira", description: "{{char}} has silver hair, green eyes, and is 183 cm tall. {{user}} carries a bronze shield." } }] });
    await w.store.setDefaultSetup({ personaId: "player", personaVariantId: "knight", agents: { mode: "only", add: ["scene-characters"], remove: [] } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "I enter.", connection);
    const main = w.ai.prompts.find(p => !isAgentCall(p))!;
    expect(JSON.stringify(main)).toContain("silver hair");
    const [run] = await w.store.listAgentRuns(reply.id);
    expect(run).toMatchObject({ agentId: "scene-characters", status: "ok" });
    const sent = run!.prompt!.at(-1)!.content;
    expect(sent).toContain("## The user's character (persona)\nMira: Mira has silver hair, green eyes, and is 183 cm tall. Mira carries a bronze shield.");
    expect(sent).not.toContain("Black hair");
    expect(sent).toContain("### Lyra");
    expect(sent.match(/## The user's character \(persona\)/g)).toHaveLength(1);

    // Manual reruns and Compare use the same independent source, rather than the main prompt's depth.
    await w.chat.turns.runManual(session.id, "scene-characters", reply.id, connection);
    expect((await w.store.listAgentRuns(reply.id)).at(-1)!.prompt!.at(-1)!.content).toContain("Mira has silver hair");
    const beforeCompare = (await w.store.listAgentRuns(reply.id)).length;
    const [compared] = await w.chat.turns.compareAgent(session.id, "scene-characters", reply.id, connection, [undefined]);
    expect(compared!.prompt!.at(-1)!.content).toContain("Mira has silver hair");
    expect(await w.store.listAgentRuns(reply.id)).toHaveLength(beforeCompare);
  });

  it.each(["none", "missing"])("does not send persona text when its placement is %s", async kind => {
    const w = await world(m => isAgentCall(m) ? "{}" : "The gate opens.");
    await installStarterTrackers(w.store);
    if (kind === "none") await w.store.savePersona({ id: "player", name: "Mira", description: "Private silver-hair detail.", placement: { position: "none", depth: 2, role: "system" } });
    await w.store.setDefaultSetup({ personaId: "player", agents: { mode: "only", add: ["scene-characters"], remove: [] } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "I enter.", connection);
    expect(JSON.stringify(w.ai.prompts)).not.toContain("Private silver-hair detail");
    const [run] = await w.store.listAgentRuns(reply.id);
    expect(run!.prompt!.at(-1)!.content).not.toContain("## The user's character (persona)");
  });
});
