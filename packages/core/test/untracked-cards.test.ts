// Cards with several characters and brief people out of the scene (D-065). Author: CLAUDE, 2026-11-01.
// Daniel: a card holding 2+ characters must not be tracked as one person (its content is still sent), and someone who
// left the scene keeps a short line instead of a sheet the tracker keeps rewriting (Aventuras' "withheld" characters).
import { TrackerSchema } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { awayIds, briefFields, castOf, isTracked, normalizeTrackerAnswer, trackerInstruction, untrackedCards, valuesForTracker } from "../src/index.ts";
import { connection, isAgentCall, world } from "./helpers.ts";

const PEOPLE = TrackerSchema.parse({
  id: "people", name: "People", characters: "anyone", presence: { field: "present", value: "here" },
  fields: [
    { key: "present", label: "In the scene", type: "status", options: ["here", "away"], scope: "perCharacter", section: "Now" },
    { key: "role", label: "Role", type: "text", scope: "perCharacter", section: "Now", display: "subtitle" },
    { key: "mood", label: "Mood", type: "text", scope: "perCharacter", section: "Now", display: "pill" },
    { key: "spot", label: "Spot", type: "text", scope: "perCharacter", section: "Now", display: "line" },
    { key: "outfit", label: "Outfit", type: "text", scope: "perCharacter", section: "Appearance", display: "block" },
    { key: "description", label: "Description", type: "text", scope: "perCharacter", section: "About", display: "lead" },
    { key: "traits", label: "Traits", type: "list", scope: "perCharacter", section: "About", display: "lead" },
    { key: "bond", label: "Bond", type: "text", scope: "perPair" },
    { key: "place", label: "Place", type: "text" },
  ],
});

const values = {
  place: "Quay",
  present: { "n:Marcus": "away", "n:Ana": "here" },
  mood: { "n:Marcus": "irritated", "n:Ana": "calm" },
  outfit: { "n:Marcus": "leather apron", "n:Ana": "blue coat" },
  description: { "n:Marcus": "Dock foreman." },
  traits: { "n:Marcus": [{ name: "gruff" }] },
  bond: { "n:Ana→n:Marcus": "wary", "n:Ana→user": "fond" },
};
const people = [{ id: "n:Marcus", name: "Marcus" }, { id: "n:Ana", name: "Ana" }, { id: "user", name: "Henry" }];

describe("people out of the scene (pure)", () => {
  it("are found from the presence field, and keep presence, its section, the line under the name and the lead text", () => {
    expect([...awayIds(PEOPLE, values)]).toEqual(["n:Marcus"]);
    expect(briefFields(PEOPLE).map((f) => f.key)).toEqual(["present", "role", "mood", "spot", "description"]);
  });

  it("show the tracker only their brief fields; people in the scene and global values stay whole", () => {
    const shown = valuesForTracker(PEOPLE, values)!;
    expect(shown.outfit).toEqual({ "n:Ana": "blue coat" });
    expect(shown.traits).toEqual({});
    expect(shown.bond).toEqual({ "n:Ana→user": "fond" });
    expect(shown.mood).toEqual(values.mood);
    expect(shown.description).toEqual(values.description);
    expect(shown.place).toBe("Quay");
  });

  it("an answer cannot rewrite their withheld values, but can bring them back and dress them in the same answer", () => {
    const stays = normalizeTrackerAnswer(PEOPLE, { outfit: { Marcus: "a whole new long outfit", Ana: "red coat" }, mood: { Marcus: "calmer" } }, values, people);
    expect(stays.values.outfit).toEqual({ "n:Marcus": "leather apron", "n:Ana": "red coat" });
    expect(stays.values.mood).toEqual({ "n:Marcus": "calmer", "n:Ana": "calm" });
    expect(stays.ignored).toContain('"outfit" for Marcus: not in the scene (kept as it was)');

    const back = normalizeTrackerAnswer(PEOPLE, { present: { Marcus: "here" }, outfit: { Marcus: "wet coat" } }, values, people);
    expect(back.values.outfit).toEqual({ "n:Marcus": "wet coat", "n:Ana": "blue coat" });
    expect(back.ignored).toEqual([]);
  });

  it("a field that only changed for someone away is left out of the answer", () => {
    const r = normalizeTrackerAnswer(PEOPLE, { outfit: { Marcus: "new" } }, values, people);
    expect(r.values.outfit).toBeUndefined();
  });

  it("the instructions say which fields stay live for them and how to bring them back", () => {
    const text = trackerInstruction(PEOPLE, people);
    expect(text).toContain('People out of the scene ("present" is not "here") show only "present", "role", "mood", "spot", "description"');
    expect(text).toContain('set "present" to "here"');
  });

  it("a set without a presence field has nobody out of the scene and no extra line", () => {
    const flat = TrackerSchema.parse({ id: "f", name: "Flat", fields: [{ key: "mood", label: "Mood", type: "text", scope: "perCharacter" }] });
    expect(briefFields(flat)).toEqual([]);
    expect(valuesForTracker(flat, { mood: { a: "x" } })).toEqual({ mood: { a: "x" } });
    expect(trackerInstruction(flat, people)).not.toContain("out of the scene");
  });
});

describe("a card not tracked in the Scene, in a real turn", () => {
  it("the story/chat choice wins over the card's; missing = tracked", () => {
    expect(isTracked({}, {})).toBe(true);
    expect(isTracked({}, { tracked: false })).toBe(false);
    expect(isTracked({ tracked: true }, { tracked: false })).toBe(true);
    expect(isTracked({ tracked: false }, {})).toBe(false);
  });

  it("is not tracked as a person, is still sent, and its people are added by name", async () => {
    let i = 0;
    const answers = [{ present: { Brenda: "here", Jessica: "here" }, role: { Brenda: "older sister" } }];
    const w = await world((m) => (isAgentCall(m) ? JSON.stringify(answers[i++ % answers.length]) : "Brenda waves."));
    const lyra = (await w.store.getCharacter("lyra"))!;
    await w.store.saveCharacter({ ...lyra, name: "Brenda & Jessica", tracked: false });
    await w.store.saveTrackerSchema(PEOPLE);
    await w.store.saveAgentConfig({
      id: "people", name: "People", prompt: "Track the people.", output: "state", input: { cards: true },
      triggers: [{ on: "turn", phase: "after" }], state: { namespace: "people", schemaId: "people" },
    });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    await w.store.saveSession({ ...session, setup: { agents: { mode: "add", add: ["people"], remove: [] } } });

    expect(await castOf(w.store, session)).toEqual([]);
    expect(await untrackedCards(w.store, session)).toEqual(["Brenda & Jessica"]);

    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Hello", connection);
    // the main prompt still has the card
    const record = await w.store.getGenerationRecord(reply.id);
    expect(record?.prompt.some((p) => p.source === "card:description" && p.content.includes("A wary ranger."))).toBe(true);
    // the tracker is told it is a card of several people, and is not given it as a name to track
    const agent = w.ai.prompts.find(isAgentCall)!.at(-1)!.content;
    expect(agent).toContain("### Brenda & Jessica (not tracked as one person: if it holds several characters, follow each of them by their own name)");
    expect(agent).toContain("Characters: User. You may ADD");
    expect(agent).not.toContain("Characters: Brenda & Jessica");
    const state = (await w.core.state.resolve(session.id, reply.id)).people as Record<string, Record<string, unknown>>;
    expect(Object.keys(state.present!)).toEqual(["n:Brenda", "n:Jessica"]);
  });
});

describe("a chat can track a card the card itself does not, and the other way round", () => {
  it("follows the cast member's choice", async () => {
    const w = await world(() => "ok");
    const { session } = await w.chat.createSession({ characterIds: ["lyra"] });
    expect(await castOf(w.store, session)).toEqual([{ id: "lyra", name: "Lyra" }]);
    const off = { ...session, cast: session.cast.map((m) => ({ ...m, tracked: false })) };
    expect(await castOf(w.store, off)).toEqual([]);
    expect(await untrackedCards(w.store, off)).toEqual(["Lyra"]);
    const lyra = (await w.store.getCharacter("lyra"))!;
    await w.store.saveCharacter({ ...lyra, tracked: false });
    const on = { ...session, cast: session.cast.map((m) => ({ ...m, tracked: true })) };
    expect(await castOf(w.store, on)).toEqual([{ id: "lyra", name: "Lyra" }]);
  });
});
