// Tests for a whole turn with agents (BLUEPRINT §4 and §6). Author: CLAUDE, 2026-10-27.
// Each test drives the real pipeline with a scripted fake AI.
import type { AgentConfigInput } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ChatTurn, HomunculusModule } from "../src/index.ts";
import { connection, isAgentCall, world } from "./helpers.ts";

const after = [{ on: "turn" as const, phase: "after" as const }];
const before = [{ on: "turn" as const, phase: "before" as const }];

/** Saves user agents and switches them on in the Default setup. */
async function install(store: Awaited<ReturnType<typeof world>>["store"], agents: AgentConfigInput[]) {
  for (const a of agents) await store.saveAgentConfig(a);
  await store.setDefaultSetup({ agents: { mode: "add", add: agents.map((a) => a.id), remove: [] } });
}

async function start(w: Awaited<ReturnType<typeof world>>) {
  const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
  return { session, first: firstMessage! };
}

const lastUser = (m: ChatTurn[]) => m.at(-1)?.content ?? "";

describe("a turn with agents", () => {
  it("a tracker made only of data fills the world state, per swipe", async () => {
    let tracker = 0;
    const w = await world((m) => isAgentCall(m) ? "```json\n" + JSON.stringify({ lyra: ++tracker === 1 ? "wary" : "amused" }) + "\n```" : "She lowers the bow.");
    await install(w.store, [{ id: "emotions", name: "Emotions", prompt: "Track how {{char}} feels.", triggers: after, output: "state", state: { namespace: "emotions" } }]);
    const { session, first } = await start(w);
    const { userMessage, reply: a } = await w.chat.send(session.id, first.id, "A friend.", connection);
    const b = await w.chat.generate(session.id, userMessage.id, connection);

    expect(await w.core.state.resolve(session.id, a.id)).toEqual({ emotions: { lyra: "wary" } });
    expect(await w.core.state.resolve(session.id, b.id)).toEqual({ emotions: { lyra: "amused" } });
    const [run] = await w.store.listAgentRuns(a.id);
    expect(run).toMatchObject({ agentId: "emotions", status: "ok", trigger: "turn.after" });
    // the agent's prompt used macros and saw the reply
    const agentPrompt = w.ai.prompts.find((p) => isAgentCall(p))!;
    expect(agentPrompt[0]!.content).toBe("Track how Lyra feels.");
    expect(lastUser(agentPrompt)).toContain("## The reply\nShe lowers the bow.");
  });

  it("an inject agent adds text to the main prompt, and the generation record says where it came from", async () => {
    const w = await world((m) => isAgentCall(m) ? "Remember: it is raining." : "ok");
    await install(w.store, [{ id: "weather", name: "Weather", triggers: before, output: "inject" }]);
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    const main = w.ai.prompts.find((p) => !isAgentCall(p))!;
    // the default preset joins system messages into one, so the injection is inside it
    expect(main.some((t) => t.content.includes("Remember: it is raining."))).toBe(true);
    const record = await w.store.getGenerationRecord(reply.id);
    expect(record?.prompt.find((p) => p.source === "agent:weather")?.content).toBe("Remember: it is raining.");
    expect(record?.generationType).toBe("normal");
  });

  it("rewrites run in order, are kept as revisions, and readers see the final text", async () => {
    const w = await world((m) => {
      if (!isAgentCall(m)) return "she smiled softly";
      if (m[0]!.content === "UPPER") return lastUser(m).split("## The reply\n")[1]!.split("\n\n")[0]!.toUpperCase();
      if (m[0]!.content === "BANG") return lastUser(m).split("## The reply\n")[1]!.split("\n\n")[0]! + "!";
      return JSON.stringify({ seen: lastUser(m).split("## The reply\n")[1]!.split("\n\n")[0] });
    });
    await install(w.store, [
      { id: "bang", name: "Bang", prompt: "BANG", triggers: after, output: "rewrite", order: 2 },
      { id: "upper", name: "Upper", prompt: "UPPER", triggers: after, output: "rewrite", order: 1 },
      { id: "reader", name: "Reader", triggers: after, output: "state", state: { namespace: "reader" } },
    ]);
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect(reply.content).toBe("SHE SMILED SOFTLY!");
    const revs = await w.store.listRevisions(reply.id);
    expect(revs.map((r) => [r.before, r.after])).toEqual([["she smiled softly", "SHE SMILED SOFTLY"], ["SHE SMILED SOFTLY", "SHE SMILED SOFTLY!"]]);
    expect((await w.core.state.resolve(session.id, reply.id)).reader).toEqual({ seen: "SHE SMILED SOFTLY!" });
  });

  it("an agent reads the result of the agent it depends on", async () => {
    const w = await world((m) => {
      if (!isAgentCall(m)) return "reply";
      if (m[0]!.content === "REL") return JSON.stringify({ trust: 80 });
      return lastUser(m).includes('Result of agent "relationships"') && lastUser(m).includes('"trust": 80') ? "Push toward the alliance." : "no input";
    });
    await install(w.store, [
      { id: "director", name: "Director", triggers: after, output: "note", input: { readsAgents: ["relationships"] } },
      { id: "relationships", name: "Relationships", prompt: "REL", triggers: after, output: "state", state: { namespace: "relationships" } },
    ]);
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect((await w.store.listNotes(reply.id, "director"))[0]?.content).toBe("Push toward the alliance.");
  });

  it("two trackers cannot own the same values; locked fields are never written by agents", async () => {
    const w = await world((m) => isAgentCall(m) ? JSON.stringify({ coins: 999, place: "castle" }) : "ok");
    await w.store.saveTrackerSchema({ id: "rpg", name: "RPG", fields: [
      { key: "coins", label: "Coins", type: "number", lockedForAgents: true }, { key: "place", label: "Place", type: "text" },
    ] });
    await install(w.store, [
      { id: "world-a", name: "A", triggers: after, output: "state", state: { namespace: "world", schemaId: "rpg" }, order: 1 },
      { id: "world-b", name: "B", triggers: after, output: "state", state: { namespace: "world" }, order: 2 },
    ]);
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect((await w.core.state.resolve(session.id, reply.id)).world).toEqual({ place: "castle" });
    const runs = await w.store.listAgentRuns(reply.id);
    expect(runs.find((r) => r.agentId === "world-b")).toMatchObject({ status: "failed", error: expect.stringMatching(/belongs to agent "world-a"/) });
  });

  it("conditions: keywords, roles and stable probability (same roll on every swipe)", async () => {
    const w = await world((m) => isAgentCall(m) ? "note" : "reply", [], { random: () => 0.99 });
    await install(w.store, [
      { id: "sword", name: "Sword", triggers: after, output: "note", conditions: { keywords: ["sword"] } },
      { id: "director-only", name: "D", triggers: after, output: "note", conditions: { roles: ["director"] } },
      { id: "dice", name: "Dice", triggers: after, output: "note", conditions: { probability: 50 }, randomness: "stable" },
    ]);
    const { session, first } = await start(w);
    const { userMessage, reply } = await w.chat.send(session.id, first.id, "I draw my sword", connection);
    const swipe = await w.chat.generate(session.id, userMessage.id, connection);
    const ran = async (id: string) => (await w.store.listAgentRuns(id)).map((r) => r.agentId).sort();
    expect((await ran(reply.id)).includes("sword")).toBe(true);
    expect((await ran(reply.id)).includes("director-only")).toBe(false);
    expect((await ran(reply.id)).includes("dice")).toBe((await ran(swipe.id)).includes("dice"));
  });

  it("a failing agent never loses the reply and says why", async () => {
    const w = await world((m) => isAgentCall(m) ? new Error("tracker model is down") : "The reply.");
    await install(w.store, [{ id: "t", name: "T", triggers: after, output: "state", state: { namespace: "t" } }]);
    const failures: string[] = [];
    w.core.events.on("agent.failed", (e) => { failures.push(`${e.agentId}: ${e.reason}`); });
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect(reply.content).toBe("The reply.");
    expect(failures).toEqual(["t: tracker model is down"]);
  });

  it("an answer with the wrong shape is rejected and nothing is saved", async () => {
    const w = await world((m) => isAgentCall(m) ? "not json at all" : "ok");
    await install(w.store, [{ id: "t", name: "T", triggers: after, output: "state", state: { namespace: "t" } }]);
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect(await w.core.state.resolve(session.id, reply.id)).toEqual({});
    expect((await w.store.listAgentRuns(reply.id))[0]?.error).toMatch(/not valid JSON/);
  });

  it("inline agents: the main model writes the block, the app takes it out and keeps the data", async () => {
    const w = await world(() => 'She nods.\n\n[MOOD]{"lyra": "relieved"}[/MOOD]');
    await install(w.store, [{ id: "mood", name: "Mood", prompt: "Track Lyra's mood.", triggers: after, output: "state", runMode: "inline", inlineTag: "MOOD", state: { namespace: "mood" } }]);
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect(reply.content).toBe("She nods.");
    expect((await w.core.state.resolve(session.id, reply.id)).mood).toEqual({ lyra: "relieved" });
    expect(w.ai.prompts[0]!.at(-1)?.content).toMatch(/Track Lyra's mood\.[\s\S]*\[MOOD\] and \[\/MOOD\]/);
  });

  it("trackers only when the story continues: a swipe skips them, continuing catches up", async () => {
    let n = 0;
    const w = await world((m) => isAgentCall(m) ? JSON.stringify({ n: ++n }) : "reply");
    await install(w.store, [{ id: "t", name: "T", triggers: after, output: "state", state: { namespace: "t" } }]);
    await w.store.setDefaultSetup({ agents: { mode: "add", add: ["t"], remove: [] }, trackersOnSwipe: false });
    const { session, first } = await start(w);
    const { userMessage } = await w.chat.send(session.id, first.id, "Hi", connection);
    const swipe = await w.chat.generate(session.id, userMessage.id, connection);
    expect(await w.store.listAgentRuns(swipe.id)).toEqual([]);
    await w.chat.send(session.id, swipe.id, "Go on", connection);
    expect((await w.core.state.resolve(session.id, swipe.id)).t).toEqual({ n: 2 });
  });

  it("every N messages and on a state change", async () => {
    let place = 0;
    const w = await world((m) => {
      if (!isAgentCall(m)) return "reply";
      if (m[0]!.content === "PLACE") return JSON.stringify({ place: ++place <= 1 ? "mill" : "forest" });
      return m[0]!.content;
    });
    await install(w.store, [
      { id: "where", name: "Where", prompt: "PLACE", triggers: after, output: "state", state: { namespace: "world" } },
      { id: "chapter", name: "Chapter", prompt: "summary", triggers: [{ on: "everyN", n: 4 }], output: "note" },
      { id: "scenery", name: "Scenery", prompt: "describe the new place", triggers: [{ on: "stateChange", path: "world.place" }], output: "note" },
    ]);
    const { session, first } = await start(w);
    const t1 = await w.chat.send(session.id, first.id, "a", connection); // path length 3: place mill (changed from nothing)
    const t2 = await w.chat.send(session.id, t1.reply.id, "b", connection); // length 5: forest (changed)
    expect((await w.store.listNotes(t1.reply.id, "scenery"))).toHaveLength(1);
    expect((await w.store.listNotes(t2.reply.id, "scenery"))).toHaveLength(1);
    expect(await w.store.listNotes(t1.reply.id, "chapter")).toHaveLength(0);
    const t3 = await w.chat.send(session.id, t2.reply.id, "c", connection); // length 7
    const t4 = await w.chat.send(session.id, t3.reply.id, "d", connection); // length 9 → no; 8 would be
    const counts = await Promise.all([t1, t2, t3, t4].map(async (t) => (await w.store.listNotes(t.reply.id, "chapter")).length));
    expect(counts).toEqual([0, 0, 0, 0]);
    const t5 = await w.chat.send(session.id, t4.reply.id, "e", connection); // length 11
    const g = await w.chat.generate(session.id, t5.reply.id, connection); // AI after AI: length 12 → every 4
    expect(await w.store.listNotes(g.id, "chapter")).toHaveLength(1);
  });

  it("a failed check with 'regenerate' writes the reply again, keeping the first version", async () => {
    let mainCalls = 0;
    const w = await world((m) => {
      if (isAgentCall(m)) return lastUser(m).includes("User says") ? '{"pass": false, "reason": "wrote for the user"}' : '{"pass": true}';
      return ++mainCalls === 1 ? "User says hello. Lyra nods." : "Lyra nods.";
    });
    await install(w.store, [{ id: "guard", name: "Guard", triggers: after, output: "check", check: { onFail: "regenerate", maxRetries: 2 } }]);
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect(reply.content).toBe("Lyra nods.");
    expect((await w.store.listRevisions(reply.id))[0]).toMatchObject({ before: "User says hello. Lyra nods.", author: { kind: "agent", agentId: "guard" } });
  });

  it("a connection with a fallback switches when it fails before any text", async () => {
    const w = await world(() => "from fallback");
    const broken: HomunculusModule = { manifest: { id: "broken", version: "1" }, register(api) {
      api.registerProvider({ id: "broken", name: "", help: "", async *stream() { throw new Error("401 bad key"); } });
    } };
    await w.core.loadModules([broken]);
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", { providerId: "broken", model: "x", fallback: connection });
    expect(reply.content).toBe("from fallback");
  });

  it("connection limits: agents on a 1-at-a-time connection never overlap", async () => {
    const w = await world((m) => isAgentCall(m) ? "{}" : "ok");
    await install(w.store, ["a", "b", "c"].map((id) => ({ id, name: id, triggers: after, output: "state" as const, state: { namespace: id } })));
    const { session, first } = await start(w);
    await w.chat.send(session.id, first.id, "Hi", { ...connection, limits: { maxConcurrent: 1 } });
    expect(w.ai.stats.maxActive).toBe(1);
  });

  it("Stop cancels the agents of the turn", async () => {
    const ctl = new AbortController();
    const w = await world((m) => { if (isAgentCall(m)) ctl.abort(); return isAgentCall(m) ? "{}" : "reply"; });
    await install(w.store, [{ id: "t", name: "T", triggers: after, output: "state", state: { namespace: "t" } }]);
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection, { signal: ctl.signal });
    expect((await w.store.listAgentRuns(reply.id))[0]?.status).toBe("cancelled");
  });

  it("built-in (code) agents and user agents run side by side", async () => {
    const clock: HomunculusModule = { manifest: { id: "clock", version: "1" }, register(api) {
      api.registerAgent({ config: { id: "clock", name: "Clock", triggers: after, output: "state", state: { namespace: "clock" } }, output: z.object({ time: z.string() }), run: async () => ({ time: "21:00" }) });
    } };
    const w = await world((m) => isAgentCall(m) ? "a note" : "ok", [clock]);
    await install(w.store, [{ id: "notes", name: "Notes", triggers: after, output: "note" }]);
    await w.store.setDefaultSetup({ agents: { mode: "add", add: ["clock", "notes"], remove: [] } });
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect((await w.core.state.resolve(session.id, reply.id)).clock).toEqual({ time: "21:00" });
    expect((await w.store.listNotes(reply.id))[0]?.content).toBe("a note");
  });

  it("a text agent adds its own words without an AI call; a stable roll repeats on swipes (D-047)", async () => {
    const w = await world(() => "ok");
    await install(w.store, [
      { id: "rules", name: "Rules", prompt: "Never write {{user}}'s actions.", triggers: before, output: "inject", runMode: "text" },
      { id: "dice", name: "Dice", prompt: "Mood: {{random::calm::storm::fog::rain::snow}}", triggers: before, output: "inject", runMode: "text", randomness: "stable" },
    ]);
    const { session, first } = await start(w);
    const { userMessage, reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    const swipe = await w.chat.generate(session.id, userMessage.id, connection);
    expect(w.ai.prompts.some((p) => isAgentCall(p))).toBe(false);
    const prompt = async (id: string) => (await w.store.getGenerationRecord(id))!.prompt;
    const rule = (await prompt(reply.id)).find((p) => p.source === "agent:rules")!.content;
    expect(rule).toBe("Never write User's actions.");
    const roll = (await prompt(reply.id)).find((p) => p.source === "agent:dice")!.content;
    expect(roll).toMatch(/^Mood: (calm|storm|fog|rain|snow)$/);
    expect((await prompt(swipe.id)).find((p) => p.source === "agent:dice")!.content).toBe(roll);
  });

  it("choices and other results are announced for the UI", async () => {
    const w = await world((m) => isAgentCall(m) ? '["Follow her", "Stay"]' : "ok");
    await install(w.store, [{ id: "cyoa", name: "CYOA", triggers: after, output: "choices" }]);
    const seen: unknown[] = [];
    w.core.events.on("agent.output", (e) => { if (e.kind === "choices") seen.push(e.output); });
    const { session, first } = await start(w);
    await w.chat.send(session.id, first.id, "Hi", connection);
    expect(seen).toEqual([["Follow her", "Stay"]]);
  });
});

describe("turn basics (v2)", () => {
  it("reasoning is saved apart and never sent back in the prompt", async () => {
    const w = await world((_m, call) => call === 1 ? [{ reasoning: "She is scared." }, "Who goes there?"] : "next");
    const { session, first } = await start(w);
    const { reply } = await w.chat.send(session.id, first.id, "Hi", connection);
    expect(reply).toMatchObject({ content: "Who goes there?", reasoning: "She is scared." });
    await w.chat.send(session.id, reply.id, "Me", connection);
    expect(JSON.stringify(w.ai.prompts[1])).not.toContain("She is scared");
  });

  it("the user editing a message keeps the old text and marks later records out of date", async () => {
    const w = await world((m) => isAgentCall(m) ? "{}" : "ok");
    await install(w.store, [{ id: "t", name: "T", triggers: after, output: "state", state: { namespace: "t" } }]);
    const { session, first } = await start(w);
    const t1 = await w.chat.send(session.id, first.id, "Hi", connection);
    const t2 = await w.chat.send(session.id, t1.reply.id, "Again", connection);
    await w.chat.editMessage(t1.userMessage.id, "Hello there");
    expect((await w.store.listRevisions(t1.userMessage.id))[0]).toMatchObject({ before: "Hi", after: "Hello there", author: { kind: "user" } });
    expect((await w.store.listAgentRuns(t1.reply.id))[0]?.stale).toBe(true);
    expect((await w.store.listAgentRuns(t2.reply.id))[0]?.stale).toBe(true);
  });

  it("OOC and hidden messages stay out of the prompt; directions are marked", async () => {
    const w = await world(() => "ok");
    const { session, first } = await start(w);
    const t1 = await w.chat.send(session.id, first.id, "brb", connection);
    await w.store.updateMessage(t1.userMessage.id, { kind: "ooc", visibility: { ai: "none", user: true } });
    await w.store.saveSession({ ...session, userRole: "director" });
    await w.chat.send(session.id, t1.reply.id, "have them argue", connection);
    const p = w.ai.prompts[1]!.map((t) => t.content);
    expect(p).not.toContain("brb");
    expect(p).toContain("[Direction] have them argue");
  });

  it("a story gives a new session its scenario, openings (the chosen one first) and setup layer", async () => {
    const w = await world((m) => isAgentCall(m) ? "camp" : "ok");
    await w.store.saveAgentConfig({ id: "camp-note", name: "N", triggers: after, output: "note" });
    await w.store.saveStory({
      id: "c1", name: "Ninth Summoning", scenario: "A summoning hall.", createdAt: 1,
      openings: ["You wake up.", "Light. Voices."],
      setup: { agents: { mode: "add", add: ["camp-note"], remove: [] } },
    });
    const { session, firstMessage } = await w.chat.createSession({ storyId: "c1", openingIndex: 1 });
    expect(session).toMatchObject({ storyId: "c1", scenario: "A summoning hall.", title: "Chat 1" });
    expect((await w.store.childrenOf(session.id, null)).map((m) => m.content)).toEqual(["Light. Voices.", "You wake up."]);
    expect(firstMessage?.speaker).toEqual({ kind: "narrator" });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Where am I?", connection);
    expect((await w.store.listNotes(reply.id))[0]?.content).toBe("camp");
  });

  it("a session uses the chosen variant of a character and the persona from the setup", async () => {
    const w = await world(() => "ok");
    await w.store.saveCharacter({ id: "lyra", name: "Lyra", description: "A wary ranger.", firstMessages: ["Hm."],
      variants: [{ id: "modern", label: "Modern AU", overrides: { description: "A park ranger in Seattle." } }] });
    await w.store.savePersona({ id: "daniel", name: "Daniel", description: "A tired mercenary.", variants: [{ id: "young", label: "Young", overrides: { name: "Dani" } }] });
    await w.store.setDefaultSetup({ personaId: "daniel", personaVariantId: "young" });
    const { session, firstMessage } = await w.chat.createSession({ cast: [{ characterId: "lyra", variantId: "modern" }] });
    await w.chat.send(session.id, firstMessage!.id, "Hi {{char}}", connection);
    const system = w.ai.prompts[0]![0]!.content;
    expect(system).toContain("A park ranger in Seattle.");
    expect(system).not.toContain("A wary ranger.");
    expect(system).toContain("About Dani:\nA tired mercenary.");
    expect(w.ai.prompts[0]!.at(-1)?.content).toBe("Hi Lyra");
  });
});
