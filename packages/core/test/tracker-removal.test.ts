// Trackers remove values that no longer apply (D-066). Author: CLAUDE, 2026-11-01.
// Daniel: "the world state should REMOVE fields that are no longer in use — if a character has a berserk mode, when he
// leaves it the status disappears completely".
import { TrackerSchema } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { normalizeTrackerAnswer, trackerInstruction } from "../src/index.ts";
import { connection, isAgentCall, world } from "./helpers.ts";

const FIELDS = {
  id: "t", name: "Modes",
  fields: [
    { key: "mode", label: "Mode", type: "status" as const, options: ["berserk", "focused"], scope: "perCharacter" as const },
    { key: "hp", label: "Health", type: "meter" as const, scope: "perCharacter" as const, required: true },
    { key: "weather", label: "Weather", type: "text" as const },
  ],
};
const schema = TrackerSchema.parse(FIELDS);
const people = [{ id: "lyra", name: "Lyra" }, { id: "bram", name: "Bram" }];
const current = { mode: { lyra: "berserk", bram: "focused" }, hp: { lyra: 40 }, weather: "storm" };

describe("removing values (pure)", () => {
  it("null removes one character's value, and the others stay", () => {
    const r = normalizeTrackerAnswer(schema, { mode: { Lyra: null } }, current, people);
    expect(r.values).toEqual({ mode: { bram: "focused" } });
    expect(r.ignored).toEqual([]);
  });

  it("the last value of a field going away removes the field; a global value can be removed too", () => {
    const r = normalizeTrackerAnswer(schema, { mode: { Lyra: null, Bram: null }, weather: null }, current, people);
    expect(r.values).toEqual({ mode: null, weather: null });
  });

  it("removing something that is not there changes nothing", () => {
    expect(normalizeTrackerAnswer(schema, { mode: { Lyra: null } }, { hp: { lyra: 1 } }, people).values).toEqual({});
    expect(normalizeTrackerAnswer(schema, { weather: null }, {}, people).values).toEqual({});
  });

  it("the instructions say how, when a field is optional", () => {
    expect(trackerInstruction(schema, people)).toContain('remove its value with null, for one character: {"field": {"Name": null}}');
  });
});

describe("removing values, in a real turn", () => {
  it("the status is gone from the state and from the next prompt", async () => {
    let i = 0;
    const answers = [{ mode: { Lyra: "berserk" } }, { mode: { Lyra: null } }];
    const w = await world((m) => (isAgentCall(m) ? JSON.stringify(answers[Math.min(i++, answers.length - 1)]) : "She roars."));
    await w.store.saveTrackerSchema(FIELDS);
    await w.store.saveAgentConfig({ id: "t", name: "Modes", prompt: "Track modes.", output: "state",
      triggers: [{ on: "turn", phase: "after" }], state: { namespace: "t", schemaId: "t" } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    await w.store.saveSession({ ...session, setup: { agents: { mode: "add", add: ["t"], remove: [] } } });
    const { reply: a } = await w.chat.send(session.id, firstMessage!.id, "Fight!", connection);
    expect((await w.core.state.resolve(session.id, a.id)).t).toEqual({ mode: { lyra: "berserk" } });
    const { reply: b } = await w.chat.send(session.id, a.id, "Calm down.", connection);
    expect((await w.core.state.resolve(session.id, b.id)).t).toBeUndefined();
    // the earlier message still shows it (state belongs to each message)
    expect((await w.core.state.resolve(session.id, a.id)).t).toEqual({ mode: { lyra: "berserk" } });
  });
});
