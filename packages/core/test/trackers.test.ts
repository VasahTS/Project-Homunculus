// Trackers driven only by their field schema (BLUEPRINT §4.5). Author: CLAUDE, 2026-10-27.
// The fields below are arbitrary test data: the engine must work for ANY fields the user makes.
import type { TrackerSchemaInput } from "@homunculus/schemas";
import { TrackerSchema } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { normalizeTrackerAnswer, trackerInstruction, trackerPeople, trackerSummary, fieldKeyFrom } from "../src/index.ts";
import { connection, isAgentCall, world } from "./helpers.ts";

const fields: TrackerSchemaInput = {
  id: "t1", name: "Test tracker",
  fields: [
    { key: "place", label: "Place", type: "text" },
    { key: "coins", label: "Coins", type: "number", min: 0 },
    { key: "level", label: "Level", type: "meter", min: 0, max: 10, scope: "perCharacter" },
    { key: "phase", label: "Phase", type: "status", options: ["calm", "tense"], scope: "perCharacter" },
    { key: "bag", label: "Bag", type: "list" },
    { key: "secret", label: "Secret", type: "text", lockedForAgents: true },
    { key: "hidden", label: "Hidden", type: "text", toPrompt: false },
  ],
};
const schema = TrackerSchema.parse(fields);
const cast = [{ id: "lyra", name: "Lyra" }, { id: "bram", name: "Bram" }];

describe("tracker engine (schema only)", () => {
  it("tells the AI the fields, the names in the scene, and an example answer", () => {
    const text = trackerInstruction(schema, cast);
    expect(text).toContain("Characters: Lyra, Bram. Only these characters.");
    expect(text).toContain('"level" — Level: a whole number from 0 to 10. One value per character, keyed by name.');
    expect(text).toContain('"phase" — Phase: one of: "calm", "tense"');
    expect(text).toContain('Read-only (the user sets these; read them, never write them): "secret" (Secret)');
    expect(text).not.toContain('"secret" —');
    const example = JSON.parse(text.split("Example answer: ")[1]!);
    expect(example.level).toEqual({ Lyra: 5, Bram: 5 });
    expect(example.bag).toEqual(["…"]);
  });

  it("keeps only what fits: clamps, matches options, maps names to ids, merges per character", () => {
    const { values, ignored } = normalizeTrackerAnswer(schema, {
      place: "The mill", coins: "-5", Level: { lyra: 14, Nobody: 3 }, phase: { Bram: "TENSE", Lyra: "angry" },
      bag: ["rope", { name: "apple", qty: 3 }, { nope: 1 }], secret: "x", unknown: 1,
    }, { level: { bram: 2 } }, cast);
    expect(values).toEqual({
      place: "The mill", coins: 0, level: { bram: 2, lyra: 10 }, phase: { bram: "tense" },
      bag: [{ name: "rope" }, { name: "apple", qty: 3 }],
    });
    expect(ignored.join("\n")).toMatch(/"Nobody" is not in the scene/);
    expect(ignored.join("\n")).toMatch(/"angry" does not fit/);
    expect(ignored.join("\n")).toMatch(/"secret": only the user may change it/);
    expect(ignored.join("\n")).toMatch(/"unknown": not a field/);
  });

  it("writes a short summary with names, only for fields sent to the AI", () => {
    const s = trackerSummary(schema, { place: "Mill", hidden: "no", level: { lyra: 7 }, phase: { lyra: "calm" } }, cast);
    expect(s).toBe("[Test tracker]\nPlace: Mill\nLyra — Level: 7/10; Phase: calm");
  });

  it("adds what a field means, once, for fields shown with a story note (Daniel, 30/10)", () => {
    const withNote = TrackerSchema.parse({ id: "t2", name: "Body", fields: [
      { key: "stamina", label: "Stamina", type: "meter", min: 0, max: 10, scope: "perCharacter", note: "0 = collapses; rest restores it." },
      { key: "gold", label: "Gold", type: "number", note: "Never shown when empty." },
    ] });
    const s = trackerSummary(withNote, { stamina: { lyra: 1, bram: 8 } }, cast);
    expect(s).toBe("[Body]\nLyra — Stamina: 1/10\nBram — Stamina: 8/10\nWhat these mean:\n- Stamina: 0 = collapses; rest restores it.");
    expect(trackerInstruction(withNote, cast)).toContain("In the story: 0 = collapses; rest restores it.");
  });

  it("makes field keys from labels", () => {
    expect(fieldKeyFrom("Naïve résumé café!")).toBe("naive_resume_cafe");
    expect(fieldKeyFrom("Coins", ["coins"])).toBe("coins_2");
    expect(fieldKeyFrom("123")).toBe("f_123");
  });

  it("'anyone' sets: the user and characters named by the story get their own values", () => {
    const open = TrackerSchema.parse({
      id: "o", name: "People", characters: "anyone",
      fields: [{ key: "mood", label: "Mood", type: "text", scope: "perCharacter", required: true, section: "Now" }],
    });
    const people = trackerPeople(open, undefined, cast, "Dan");
    expect(people.map((p) => p.id)).toEqual(["lyra", "bram", "user"]);
    expect(trackerInstruction(open, people)).toContain("You may ADD a character the story names");
    expect(trackerInstruction(open, people)).toContain("Now:\n- \"mood\" — Mood: short text. One value per character, keyed by name. ALWAYS FILLED");
    const { values } = normalizeTrackerAnswer(open, { mood: { Dan: "tired", Mira: "cheerful", "{{user}}": "sleepy" } }, undefined, people);
    expect(values).toEqual({ mood: { user: "sleepy", "n:Mira": "cheerful" } });
    const later = trackerPeople(open, values, cast, "Dan");
    expect(later.map((p) => p.name)).toEqual(["Lyra", "Bram", "Dan", "Mira"]);
    // the same name later (any case) is the same character
    expect(normalizeTrackerAnswer(open, { mood: { mira: "calm" } }, values, later).values).toEqual({ mood: { user: "sleepy", "n:Mira": "calm" } });
    expect(trackerSummary(open, values, later)).toBe("[People]\nDan — Mood: sleepy\nMira — Mood: cheerful");
  });

  it("characters out of the scene are sent by name and their presence section only", () => {
    const s = TrackerSchema.parse({
      id: "c", name: "Cast", characters: "anyone", presence: { field: "present", value: "here" },
      fields: [
        { key: "present", label: "In the scene", type: "status", options: ["here", "away"], scope: "perCharacter", section: "Now" },
        { key: "mood", label: "Mood", type: "text", scope: "perCharacter", section: "Now" },
        { key: "hair", label: "Hair", type: "text", scope: "perCharacter", section: "Looks" },
      ],
    });
    const values = { present: { lyra: "here", bram: "away" }, mood: { lyra: "calm", bram: "angry" }, hair: { lyra: "silver", bram: "red" } };
    expect(trackerSummary(s, values, cast)).toBe("[Cast]\nLyra — In the scene: here; Mood: calm; Hair: silver\nNot in the scene: Bram (angry)");
  });

  it("lists with columns keep rows that fit their columns", () => {
    const quests = TrackerSchema.parse({
      id: "q", name: "W",
      fields: [{ key: "quests", label: "Quests", type: "list", fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "status", label: "Status", type: "status", options: ["active", "completed", "failed"] },
      ] }],
    });
    const { values } = normalizeTrackerAnswer(quests, { quests: [{ title: "Find the mill", status: "ACTIVE" }, "Bare title", { status: "lost" }] }, undefined, []);
    expect(values).toEqual({ quests: [{ title: "Find the mill", status: "active" }, { title: "Bare title" }] });
    expect(trackerInstruction(quests, [])).toContain('a list of rows, each {"title": short text; "status": one of: "active", "completed", "failed"}');
    expect(trackerSummary(quests, values, [])).toBe("[W]\nQuests: Find the mill — active; Bare title");
  });
});

describe("a tracker made only of data, in a real turn", () => {
  async function setup(answers: unknown[]) {
    let i = 0;
    const w = await world((m) => isAgentCall(m) ? JSON.stringify(answers[i++ % answers.length]) : "She lowers the bow.");
    await w.store.saveTrackerSchema(fields);
    await w.store.saveAgentConfig({
      id: "t1", name: "Test tracker", prompt: "Keep these values up to date.", output: "state",
      triggers: [{ on: "turn", phase: "after" }], state: { namespace: "t1", schemaId: "t1" },
    });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    await w.store.saveSession({ ...session, setup: { agents: { mode: "add", add: ["t1"], remove: [] } } });
    return { w, session, first: firstMessage! };
  }

  it("asks with the fields, saves cleaned values per swipe, and logs what it left out", async () => {
    const { w, session, first } = await setup([{ level: { Lyra: 3 }, coins: 5 }, { level: { Lyra: 9 }, nope: 1 }]);
    let shownEarly: string | undefined;
    const { userMessage, reply: a } = await w.chat.send(session.id, first.id, "Hello", connection, { onReply: (r) => { shownEarly = r.id; } });
    expect(shownEarly).toBe(a.id);
    const b = await w.chat.generate(session.id, userMessage.id, connection);
    expect((await w.core.state.resolve(session.id, a.id)).t1).toEqual({ level: { lyra: 3 }, coins: 5 });
    expect((await w.core.state.resolve(session.id, b.id)).t1).toEqual({ level: { lyra: 9 } });
    const agentPrompt = w.ai.prompts.find(isAgentCall)!;
    expect(agentPrompt.at(-1)!.content).toContain('## Fields of "Test tracker"');
    const [runB] = await w.store.listAgentRuns(b.id);
    expect(runB).toMatchObject({ status: "ok", warnings: ['"nope": not a field of this tracker'] });
  });

  it("the values go back into the next prompt, and the user's edit wins", async () => {
    const { w, session, first } = await setup([{ level: { Lyra: 3 } }]);
    const { reply } = await w.chat.send(session.id, first.id, "Hello", connection);
    await w.chat.editState(reply.id, { t1: { level: { lyra: 1 } } });
    const { reply: next } = await w.chat.send(session.id, reply.id, "And now?", connection);
    const record = await w.store.getGenerationRecord(next.id);
    expect(record?.prompt.find((p) => p.source === "state:t1")?.content).toBe("Current scene (for continuity; do not repeat it back):\n[Test tracker]\nLyra — Level: 1/10");
  });

  it("the session can pick another field set of the tracker; agents get the cast's cards", async () => {
    const { w, session, first } = await setup([{ race: { Lyra: "elf" } }]);
    await w.store.saveTrackerSchema({ id: "t1-other", name: "Other set", trackerId: "t1", fields: [{ key: "race", label: "Race", type: "text", scope: "perCharacter" }] });
    const s = (await w.store.getSession(session.id))!;
    await w.store.saveSession({ ...s, setup: { ...s.setup, agentOverrides: { t1: { schemaId: "t1-other" } } } });
    const { reply } = await w.chat.send(session.id, first.id, "Hello", connection);
    expect((await w.core.state.resolve(session.id, reply.id)).t1).toEqual({ race: { lyra: "elf" } });
    const agentPrompt = w.ai.prompts.find(isAgentCall)!.at(-1)!.content;
    expect(agentPrompt).toContain('## Fields of "Other set"');
    expect(agentPrompt).toContain("## Characters (from their cards)\n### Lyra\nA wary ranger.\nPersonality: Dry humor.");
  });

  it("an answer where nothing fits is a visible failure, and the reply is kept", async () => {
    const { w, session, first } = await setup([{ wrong: 1 }]);
    const { reply } = await w.chat.send(session.id, first.id, "Hello", connection);
    expect(reply.content).toBe("She lowers the bow.");
    const [run] = await w.store.listAgentRuns(reply.id);
    expect(run?.status).toBe("failed");
    expect(run?.error).toContain("Nothing in the answer fit the fields");
  });
});
