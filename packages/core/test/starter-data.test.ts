// The starter trackers shipped as data (D-017) must be valid and complete. Author: CLAUDE, 2026-10-27.
import { readFileSync } from "node:fs";
import { AgentConfig, TrackerSchema } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { trackerInstruction } from "../src/index.ts";

const starter = JSON.parse(readFileSync(new URL("../../../apps/desktop/src/starter/trackers.json", import.meta.url), "utf8")) as {
  trackers: Array<{ agent: unknown; sets: unknown[] }>;
};

describe("starter trackers (data)", () => {
  it("every tracker and field set is valid, and each default set exists", () => {
    for (const t of starter.trackers) {
      const agent = AgentConfig.parse(t.agent);
      const sets = t.sets.map((s) => TrackerSchema.parse(s));
      expect(agent.output).toBe("state");
      expect(agent.state?.namespace).toBe(agent.id);
      expect(sets.map((s) => s.id)).toContain(agent.state?.schemaId);
      for (const s of sets) {
        expect(s.trackerId).toBe(agent.id);
        if (s.presence) expect(s.fields.some((f) => f.key === s.presence!.field && f.options.includes(s.presence!.value))).toBe(true);
        expect(new Set(s.fields.map((f) => f.key)).size).toBe(s.fields.length);
      }
    }
    expect(starter.trackers.map((t) => (t.agent as { name: string }).name)).toEqual(["Scene: World", "Scene: Characters", "Scene: Plot"]);
  });

  it("the Characters tracker has a Fantasy set with race, mana, skill slots, skills and spells", () => {
    const chars = starter.trackers.find((t) => (t.agent as { id: string }).id === "scene-characters")!;
    const fantasy = TrackerSchema.parse(chars.sets.find((s) => (s as { name: string }).name === "Fantasy"));
    const keys = fantasy.fields.map((f) => f.key);
    for (const k of ["race", "class", "level", "health", "mana", "skill_slots", "skills", "spells", "equipment", "conditions"]) expect(keys).toContain(k);
    expect(fantasy.characters).toBe("anyone");
    const text = trackerInstruction(fantasy, [{ id: "lyra", name: "Lyra" }]);
    expect(text).toContain('"spells" — Spells: a list of rows, each {"name": short text; "cost": a number, at least 0, at most 100 (percent of mana it uses)');
  });
});
