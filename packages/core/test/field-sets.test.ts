// Portable definition validation and lossless transfers. CODEX, D-043.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { TrackerField } from "@homunculus/schemas";
import { parseFieldSetFile, serializeFieldSets, transferFields } from "../src/index.ts";
import { portableSetOf } from "../../../apps/desktop/src/trackers.ts";

const field = (key: string, extra = {}) => TrackerField.parse({ key, label: key, type: "text", ...extra });
const sets = () => [
  { id: "a", name: "A", help: "", characters: "cast" as const, presence: { field: "presence", value: "here" }, fields: [
    field("presence", { type: "status", scope: "perCharacter", options: ["here", "away"], color: "gold" }),
    field("inventory", { type: "list", fields: [field("item")], display: "lead", help: "Keep possessions." }),
    field("place"),
  ] },
  { id: "b", name: "B", help: "", characters: "cast" as const, fields: [field("other")] },
];
describe("field-set reuse", () => {
  it("copies multiple fields with independent nested definitions and stable keys", () => {
    const before = sets();
    const next = transferFields(before, "a", "b", ["inventory", "presence"], "copy");
    expect(before[1]!.fields).toHaveLength(1);
    expect(next[1]!.fields.map((f) => f.key)).toEqual(["other", "presence", "inventory"]);
    expect(next[1]!.presence).toEqual(before[0]!.presence);
    next[1]!.fields[2]!.fields[0]!.label = "Changed";
    expect(before[0]!.fields[1]!.fields[0]!.label).toBe("item");
    expect(next[1]!.fields[2]).toMatchObject({ display: "lead", help: "Keep possessions." });
  });
  it("moves atomically, transfers presence and preserves the destination's existing rule", () => {
    const before = sets();
    const next = transferFields(before, "a", "b", ["presence"], "move");
    expect(next[0]!.presence).toBeUndefined();
    expect(next[0]!.fields.map((f) => f.key)).toEqual(["inventory", "place"]);
    expect(before[0]!.fields).toHaveLength(3);
    before[1]!.presence = { field: "other", value: "existing" };
    expect(transferFields(before, "a", "b", ["presence"], "copy")[1]!.presence).toEqual(before[1]!.presence);
  });
  it("rejects collisions, empty/invalid selections, self transfers and empty-source moves without mutation", () => {
    const before = sets(); before[1]!.fields.push(field("place"));
    const snapshot = structuredClone(before);
    expect(() => transferFields(before, "a", "b", ["place", "inventory"], "move")).toThrow(/already has/);
    for (const keys of [[], ["missing"]]) expect(() => transferFields(before, "a", "b", keys, "copy")).toThrow(/Select/);
    expect(() => transferFields(before, "a", "a", ["place"], "copy")).toThrow(/different/);
    expect(() => transferFields(sets(), "a", "b", ["presence", "inventory", "place"], "move")).toThrow(/at least one/);
    expect(before).toEqual(snapshot);
  });
});
describe("field-set JSON", () => {
  it("round-trips the documented example with nested fields and presentation intact", async () => {
    const text = await readFile(new URL("../../../docs/examples/travel-field-sets.json", import.meta.url), "utf8");
    const file = parseFieldSetFile(text);
    expect(file.sets).toHaveLength(2);
    expect(parseFieldSetFile(serializeFieldSets(file.sets))).toEqual(file);
    expect(file.sets[0]!.fields[3]!.fields[1]!.type).toBe("number");
  });
  it("the AI guide's complete example imports as written (D-046)", async () => {
    const guide = await readFile(new URL("../../../docs/FIELD-SET-AI-GUIDE.md", import.meta.url), "utf8");
    const blocks = [...guide.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((m) => m[1]!).filter((b) => b.includes('"sets"') && !b.includes("…"));
    expect(blocks).toHaveLength(1);
    const file = parseFieldSetFile(blocks[0]!);
    expect(file.sets[0]!.fields.map((f) => f.key)).toContain("presence");
  });
  it("normalizes temporary keys exactly as saving, including the presence reference", () => {
    const set = sets()[0]!;
    set.fields[0]!.key = "~new"; set.presence!.field = "~new";
    const portable = portableSetOf(set);
    expect(portable.fields[0]!.key).toBe("presence");
    expect(portable.presence!.field).toBe("presence");
    expect(parseFieldSetFile(serializeFieldSets([portable])).sets[0]).toEqual(portable);
    expect(set.fields[0]!.key).toBe("~new");
  });
  it("rejects malformed/unsupported files and invalid definitions before returning any sets", () => {
    const valid = JSON.parse(serializeFieldSets([portableSetOf(sets()[0]!)]));
    expect(() => parseFieldSetFile("not json")).toThrow();
    expect(() => parseFieldSetFile({ ...valid, version: 2 })).toThrow();
    expect(() => parseFieldSetFile({ ...valid, sets: [] })).toThrow();
    expect(() => parseFieldSetFile({ ...valid, surprise: true })).toThrow();
    for (const change of [
      (s: any) => { s.id = "foreign"; },
      (s: any) => { s.fields.push(s.fields[0]); },
      (s: any) => { s.fields[1].fields.push(s.fields[1].fields[0]); },
      (s: any) => { s.presence.value = "unknown"; },
      (s: any) => { s.fields[0].options = []; },
      (s: any) => { s.fields[2].min = 5; s.fields[2].max = 1; },
    ]) {
      const invalid = structuredClone(valid); change(invalid.sets[0]);
      expect(() => parseFieldSetFile(invalid)).toThrow();
    }
  });
});
