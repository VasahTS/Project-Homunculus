// The rewrite comparison's word diff (apps/desktop/src/diff.ts, D-048). CLAUDE, 2026-10-30.
import { describe, expect, it } from "vitest";
import { diffWords, mergeParts } from "../../../apps/desktop/src/diff.ts";

describe("word diff", () => {
  it("marks replaced words as one change and keeps the rest", () => {
    const parts = diffWords("A girl, seemingly only a bit older, steps through.", "A girl only a bit older, steps through.");
    const changes = parts.filter((p) => p.kind === "change");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ before: ", seemingly", after: "" });
  });
  it("rebuilds either text, and any mix of kept originals", () => {
    const before = "In the blink of an eye, there's a spray of blood where his head once was.";
    const after = "Before anyone can react, there's a spray of blood where his head used to be.";
    const parts = diffWords(before, after);
    const ids = parts.flatMap((p) => (p.kind === "change" ? [p.id] : []));
    expect(ids.length).toBe(2);
    expect(mergeParts(parts, new Set())).toBe(after);
    expect(mergeParts(parts, new Set(ids))).toBe(before);
    expect(mergeParts(parts, new Set([ids[0]!]))).toBe("In the blink of an eye, there's a spray of blood where his head used to be.");
  });
  it("is exact on random edits", () => {
    const words = ["the", "bus", "girl", " ", ", ", "said", "\n\n", "Sion", "blood", "."];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let n = 0; n < 200; n++) {
      const a = Array.from({ length: 1 + Math.floor(rnd() * 40) }, () => words[Math.floor(rnd() * words.length)]).join("");
      const b = Array.from({ length: 1 + Math.floor(rnd() * 40) }, () => words[Math.floor(rnd() * words.length)]).join("");
      const parts = diffWords(a, b);
      expect(mergeParts(parts, new Set())).toBe(b);
      expect(mergeParts(parts, new Set(parts.flatMap((p) => (p.kind === "change" ? [p.id] : []))))).toBe(a);
    }
  });
});
