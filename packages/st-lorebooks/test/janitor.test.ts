// JanitorAI lorebook scripts import as lorebooks (D-113, phase 0). Author: CLAUDE, 2026-11-10.
// The entries below use JanitorAI's names as its lorebook-script export writes them (a bare array).
import { describe, expect, it } from "vitest";
import { importStLorebook, splitRegexKey } from "../src/index.ts";

const bytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x));

const janitor = [
  { key: ["None."], constant: true, content: "Physical plausibility.", comment: "Plausibility", priority: 10 },
  { key: ["/\\b(oral|lick|licks)\\b/i"], keysecondary: [], content: "Oral as a complete act.", comment: "Oral", depth: 3, minMessages: 2,
    inclusionGroup: ["acts", "intimacy"], groupWeight: 40, keyMatchPriority: true, placement: "personality", probability: 0.7, priority: 20 },
  { key: ["sext", "texting"], keysecondary: ["phone"], secondaryLogic: "NOT ANY", content: "Sexting rules.", title: "Sexting", enabled: false },
];

describe("JanitorAI lorebook scripts", () => {
  it("a bare array of entries becomes a lorebook with JanitorAI's fields mapped", () => {
    const { lorebook, warnings } = importStLorebook(bytes(janitor), "yhul lorebook.json");
    expect(lorebook.name).toBe("yhul lorebook");
    const [always, oral, sext] = lorebook.entries!;
    expect(always).toMatchObject({ title: "Plausibility", keys: [], constant: true, order: 10, content: "Physical plausibility." });
    expect(oral).toMatchObject({
      keys: ["/\\b(oral|lick|licks)\\b/i"], scanDepth: 3, delay: 2, group: "acts,intimacy", groupWeight: 40, useGroupScoring: true,
      position: "after", probability: 70, order: 20,
    });
    expect(sext).toMatchObject({ title: "Sexting", secondaryKeys: ["phone"], logic: "notAny", enabled: false });
    expect(oral!.original).toMatchObject({ placement: "personality" });
    expect(warnings.join(" ")).toContain("personality or scenario");
    expect(warnings.join(" ")).toContain("Split regex keywords");
  });

  it("Split regex keywords turns word-list regexes into keys you can edit", () => {
    expect(splitRegexKey("/\\b(oral|lick|licks)\\b/i")).toEqual({ words: ["oral", "lick", "licks"], whole: true, caseSensitive: false });
    expect(splitRegexKey("/kiss|hug him/")).toEqual({ words: ["kiss", "hug him"], whole: false, caseSensitive: true });
    expect(splitRegexKey("/kis+/i")).toBeNull();
    expect(splitRegexKey("plain")).toBeNull();
    const { lorebook, warnings } = importStLorebook(bytes(janitor), "yhul.json", { splitRegex: true });
    expect(lorebook.entries![1]).toMatchObject({ keys: ["oral", "lick", "licks"], matchWholeWords: true, caseSensitive: false });
    expect(warnings.join(" ")).not.toContain("Split regex keywords");
  });

  it("JanitorAI's script record (entries as JSON text) works; code scripts are refused with a pointer to cues", () => {
    const { lorebook } = importStLorebook(bytes({ title: "Rules", script: JSON.stringify(janitor) }), "x.json");
    expect(lorebook.name).toBe("Rules");
    expect(lorebook.entries).toHaveLength(3);
    expect(() => importStLorebook(bytes({ title: "Engine", script: "context.character.personality += 'x';" }), "e.json")).toThrow(/converted to cues/);
  });

  it("a pasted SillyTavern entries array still reads as SillyTavern", () => {
    const { lorebook } = importStLorebook(bytes([{ uid: 5, key: ["castle"], keysecondary: [], content: "A castle.", position: 4, depth: 2, comment: "Castle" }]), "st.json");
    expect(lorebook.entries![0]).toMatchObject({ id: "5", keys: ["castle"], position: "atDepth", depth: 2, title: "Castle" });
  });
});
