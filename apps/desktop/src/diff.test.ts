// The word diff stays exact on ordinary edits and bounded on big rewrites (CLAUDE, 2026-11-17).
import { describe, expect, it } from "vitest";
import { diffWords, mergeParts, type DiffPart } from "./diff.ts";

const changes = (p: DiffPart[]) => p.filter((x) => x.kind === "change") as Array<Extract<DiffPart, { kind: "change" }>>;
const roundTrip = (a: string, b: string) => {
  const p = diffWords(a, b);
  expect(mergeParts(p, new Set())).toBe(b);
  expect(mergeParts(p, new Set(changes(p).map((c) => c.id)))).toBe(a);
  return p;
};
const words = (n: number, seed: number) => {
  let s = seed; const out: string[] = [];
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; out.push(`w${s % 500}${s % 13 === 0 ? ".\n" : s % 7 === 0 ? "." : ""}`); }
  return out.join(" ");
};

describe("diffWords", () => {
  it("marks a single changed word", () => {
    const p = roundTrip("She has red hair and green eyes.", "She has black hair and green eyes.");
    expect(changes(p)).toEqual([{ kind: "change", id: 0, before: "red", after: "black" }]);
  });

  it("handles empty sides", () => {
    expect(changes(roundTrip("", "New text."))).toHaveLength(1);
    expect(changes(roundTrip("Old text.", ""))).toHaveLength(1);
    expect(roundTrip("", "")).toEqual([]);
  });

  it("keeps many scattered edits word by word", () => {
    const a = words(6000, 1);
    const p = roundTrip(a, a.replace(/w1(\d)/g, "z$1"));
    expect(changes(p).length).toBeGreaterThan(500);
  });

  it("a full rewrite of a long text stays fast and small", () => {
    const t = performance.now();
    const before = process.memoryUsage().arrayBuffers;
    roundTrip(words(20000, 1), words(20000, 2));
    expect(performance.now() - t).toBeLessThan(5000);
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(200e6);
  });
});
