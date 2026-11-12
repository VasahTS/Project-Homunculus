// The words and shapes Library → Cues shows (D-119): stages, the stage table, "one of" names, words of a /pattern/,
// a part's sentence and what a cue costs per reply. Author: CLAUDE, 2026-11-12.
import { describe, expect, it } from "vitest";
import { Cue, type CueInput } from "@homunculus/schemas";
import { cueCost, cueOnText, cueSizeText, isAlways, keyWords, oneOfShort, partSentence, stageView, valueStages } from "./cues.ts";

const is = (value: string) => ({ path: "value.phase", op: "equals" as const, value });
const cue = (x: Partial<CueInput>) => Cue.parse({ id: "c", name: "C", namespace: "cue-c", ...x });

const phase = {
  key: "phase", initial: "inactive", otherwise: "reset" as const, rules: [
    { when: [], do: "set" as const, value: "post" }, { when: [], do: "set" as const, value: "early" },
    { when: [], do: "set" as const, value: "approaching" },
  ],
};

describe("Cues screen helpers (D-119)", () => {
  it("a value's stages: the saved order first, else the start then the rules from the last up; counters have none", () => {
    const c = cue({ values: [phase] });
    expect(valueStages(c.values[0]!)).toEqual(["inactive", "approaching", "early", "post"]);
    expect(valueStages({ ...c.values[0]!, stages: ["inactive", "approaching", "early", "mid"] })).toEqual(["inactive", "approaching", "early", "mid", "post"]);
    expect(valueStages({ ...c.values[0]!, rules: [{ when: [], logic: "all", do: "add", value: 1 }] })).toEqual([]);
  });

  it("a part whose texts only test one value is a stage table; anything else is not", () => {
    const c = cue({
      values: [phase],
      groups: [{ key: "dir", items: [{ id: "a", text: "A", when: [is("approaching")] }, { id: "b", text: "B", when: [is("early"), is("post")], logic: "any" }] }],
    });
    const sv = stageView(c.groups[0]!, c.values)!;
    expect(sv.key).toBe("phase");
    expect([...sv.of.get("b")!]).toEqual(["early", "post"]);
    const words = cue({ values: [phase], groups: [{ key: "g", items: [{ id: "a", text: "A", when: [is("early")] }, { id: "b", text: "B", words: { keys: ["kiss"] } }] }] });
    expect(stageView(words.groups[0]!, words.values)).toBeNull();
    const both = cue({ values: [phase], groups: [{ key: "g", items: [{ id: "a", text: "A", when: [is("early"), is("post")] }, { id: "b", text: "B", when: [is("early")] }] }] });
    expect(stageView(both.groups[0]!, both.values)).toBeNull();
  });

  it("one-of names lose the prefix they share; patterns read as their words", () => {
    const short = oneOfShort(["comprehension-intimacy", "comprehension-behavior", ""]);
    expect(short("comprehension-intimacy")).toBe("intimacy");
    expect(oneOfShort(["comprehension-intimacy", "dynamics-power"])("dynamics-power")).toBe("dynamics-power");
    expect(keyWords(["/oral|mouth|lick/i", "kiss"])).toEqual({ words: ["oral", "mouth", "lick", "kiss"], patterns: 1 });
    expect(keyWords(["/between (her|his) legs|taste/i"]).patterns).toBe(1);
  });

  it("a part in one sentence, and what a cue costs per reply", () => {
    const c = cue({
      groups: [
        { key: "rules", name: "Rules", pick: "all", placement: { position: "after" }, items: [
          { id: "a", text: "x".repeat(360) }, { id: "b", text: "y".repeat(720), words: { keys: ["kiss"] } }] },
        { key: "dir", name: "Direction", pick: "rotate", noRepeat: 1, wrap: "[{{text}}]", items: [{ id: "c", text: "z".repeat(36) }, { id: "d", text: "w".repeat(72) }] },
      ],
    });
    expect(partSentence(c.groups[0]!).map((p) => p.text).join("")).toBe("Puts in every text whose words show up, after the character.");
    expect(partSentence(c.groups[1]!, "phase").map((p) => p.text).join("")).toBe("Puts in one text, taking turns (not the last one) for the current phase, in the chat, 1 back, as System, inside a wrap.");
    expect(isAlways(c.groups[0]!.items[0]!)).toBe(true);
    expect(cueCost(c)).toEqual({ always: 104, extra: [{ part: "Rules", min: 204, max: 204, one: false }, { part: "Direction", min: 14, max: 24, one: true }] });
    expect(cueSizeText(c)).toBe("2 parts · 4 texts");
  });

  it("a cue that is off says Off", () => {
    expect(cueOnText(cue({}), {}, [], [], () => undefined)).toBe("Off");
    expect(cueOnText(cue({}), { cues: { mode: "add", add: ["c"], remove: [] } }, [], [], () => undefined)).toBe("Every chat");
  });
});
