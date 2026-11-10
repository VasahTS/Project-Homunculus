// The JanitorAI "Scene Direction" script (by yhul) as a cue (D-113): the cue reaches the same phase as the script's own
// logic in 1000 random chats, and always picks a direction from the pool the script would use. The script's word lists
// are kept (common words); its directions are placeholders here (A1…C6) — the texts are yhul's. Author: CLAUDE, 2026-11-10.
import type { CueInput } from "@homunculus/schemas";
import { Cue } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { runCue, seededSequence, type CueMessage } from "../src/index.ts";

const intimacy = ["kiss", "lips", "tongue", "neck", "throat", "chest", "breast", "nipple", "stomach", "hip", "thigh", "between", "beneath",
  "under", "straddle", "grind", "press", "pin", "pull", "grip", "moan", "gasp", "pant", "breath", "whisper", "shiver", "tremble", "arousal",
  "hard", "wet", "ache", "want", "need", "desire", "skin", "bare", "naked", "undress", "strip", "cloth", "button", "zipper", "touch", "stroke",
  "finger", "hand", "mouth", "taste", "lick", "suck", "bite", "mark", "bruise", "bed", "wall", "desk", "floor", "couch", "shower", "thrust",
  "ride", "inside", "deep", "slow", "fast", "rough", "gentle", "harder", "more", "please", "don't stop", "cum", "orgasm", "climax", "edge",
  "close", "coming"];
const climax = ["came", "cum", "orgasm", "climax", "finish", "spent", "collapsed", "spill", "release", "over the edge", "let go"];
// which phases may use each "active" direction (the script's earlyIndices / midIndices / lateIndices)
const ACTIVE_PHASES = [["mid", "late"], ["early", "mid"], ["early", "mid"], ["early", "mid"], ["early", "mid"], ["early", "mid", "late"],
  ["mid", "late"], ["early", "mid"], ["mid", "late"], ["mid", "late"], ["mid", "late"], ["mid", "late"]];

const is = (phase: string) => ({ path: "value.phase", op: "equals" as const, value: phase });

function sceneDirection(texts: { approaching: string[]; active: string[]; post: string[] }): CueInput {
  return {
    id: "scene-direction", name: "Scene Direction", help: "Adds one direction for intimate scenes as they build, peak and end.",
    author: "yhul (JanitorAI script), as a cue", namespace: "cue-scene-direction",
    signals: [
      { key: "heat", kind: "words", words: intimacy, last: 4 },
      { key: "climax", kind: "words", words: climax, last: 2 },
      { key: "streak", kind: "words", words: intimacy, last: 6, measure: "streak", perMessage: 2 },
    ],
    values: [
      { key: "scene", initial: "none", otherwise: "reset", showInScene: true, rules: [
        { when: [{ path: "signal.heat", op: "atLeast", value: "5" }], do: "set", value: "active" },
        { when: [{ path: "signal.heat", op: "atLeast", value: "2" }], do: "set", value: "approaching" },
      ] },
      { key: "phase", initial: "none", otherwise: "reset", showInScene: true, rules: [
        { when: [{ path: "value.scene", op: "equals", value: "active" }, { path: "signal.climax", op: "atLeast", value: "1" }], do: "set", value: "post" },
        { when: [{ path: "value.scene", op: "equals", value: "active" }, { path: "signal.streak", op: "atMost", value: "2" }], do: "set", value: "early" },
        { when: [{ path: "value.scene", op: "equals", value: "active" }, { path: "signal.streak", op: "atMost", value: "5" }], do: "set", value: "mid" },
        { when: [{ path: "value.scene", op: "equals", value: "active" }], do: "set", value: "late" },
        { when: [{ path: "value.scene", op: "equals", value: "approaching" }], do: "set", value: "approaching" },
      ] },
    ],
    groups: [{
      key: "direction", name: "Direction", pick: "rotate",
      wrap: "[Write your next response incorporating the following direction naturally into the scene. Do not reference this instruction or acknowledge it explicitly. Direction: {{text}}]",
      placement: { position: "after" },
      items: [
        ...texts.approaching.map((text, i) => ({ id: `a${i + 1}`, title: `A${i + 1}`, text, when: [is("approaching")] })),
        ...texts.active.map((text, i) => ({ id: `b${i + 1}`, title: `B${i + 1}`, text, when: ACTIVE_PHASES[i]!.map(is), logic: "any" as const })),
        ...texts.post.map((text, i) => ({ id: `c${i + 1}`, title: `C${i + 1}`, text, when: [is("post")] })),
      ],
    }],
  };
}

/** The script's own logic (modules 1–3), newest message first, as in its code. */
function scriptPhase(newestFirst: string[]): string {
  const re = (words: string[]) => words.map((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"));
  const count = (text: string, list: RegExp[]) => list.reduce((n, r) => n + (text.match(r)?.length ?? 0), 0);
  const im = re(intimacy), cl = re(climax);
  const join = (n: number) => newestFirst.slice(0, n).join(" ");
  const markers = count(join(4), im);
  const scene = markers >= 5 ? "active" : markers >= 2 ? "approaching" : "none";
  if (scene !== "active") return scene;
  if (count(join(2), cl) >= 1) return "post";
  let streak = 0;
  for (let c = 0; c < Math.min(6, newestFirst.length); c++) { if (count(newestFirst[c]!, im) >= 2) streak++; else break; }
  return streak <= 2 ? "early" : streak <= 5 ? "mid" : "late";
}

const placeholders = { approaching: ["A1", "A2", "A3", "A4", "A5"], active: Array.from({ length: 12 }, (_, i) => `B${i + 1}`), post: ["C1", "C2", "C3", "C4", "C5", "C6"] };
const allowed = (phase: string, id: string) => phase === "approaching" ? id.startsWith("a") : phase === "post" ? id.startsWith("c")
  : id.startsWith("b") && ACTIVE_PHASES[Number(id.slice(1)) - 1]!.includes(phase);

describe("Scene Direction as a cue", () => {
  it("reaches the script's phase and uses its pool, in 1000 random chats", () => {
    const cue = Cue.parse(sceneDirection(placeholders));
    const filler = "the she he looks at the room then says nothing quiet window evening a little later".split(" ");
    const vocab = [...intimacy, ...climax];
    const rnd = seededSequence("scene-direction");
    const seen = new Set<string>();
    let previous: Record<string, unknown> | undefined;
    for (let n = 0; n < 1000; n++) {
      const heat = rnd();
      const chat: CueMessage[] = Array.from({ length: 1 + Math.floor(rnd() * 10) }, (_, i) => ({
        from: i % 2 ? "ai" : "user",
        text: Array.from({ length: 5 + Math.floor(rnd() * 15) }, () => rnd() < heat * 0.5 ? vocab[Math.floor(rnd() * vocab.length)] : filler[Math.floor(rnd() * filler.length)]).join(" "),
      }));
      const r = runCue({ cue, history: chat, previous, state: {}, type: "normal", role: "player", random: rnd, now: 0 });
      const want = scriptPhase(chat.map((m) => m.text).reverse());
      expect(r.values.phase, JSON.stringify(chat)).toBe(want);
      const picked = r.report.groups[0]!.picked;
      if (want === "none") expect(picked).toEqual([]);
      else { expect(picked).toHaveLength(1); expect(allowed(want, picked[0]!.id)).toBe(true); seen.add(want); }
      previous = r.values;
    }
    expect([...seen].sort()).toEqual(["approaching", "early", "late", "mid", "post"]);
  });

  it("goes round its pool instead of repeating (the script could only rotate by message count)", () => {
    const cue = Cue.parse(sceneDirection(placeholders));
    const hot: CueMessage[] = Array.from({ length: 8 }, (_, i) => ({ from: i % 2 ? "ai" : "user", text: "kiss lips tongue neck skin hand" }));
    let previous: Record<string, unknown> | undefined;
    const picks: string[] = [];
    for (let i = 0; i < 7; i++) {
      const r = runCue({ cue, history: hot, previous, state: {}, type: "normal", role: "player", random: Math.random, now: 0 });
      picks.push(r.report.groups[0]!.picked[0]!.id);
      previous = r.values;
    }
    expect(picks).toEqual(["b1", "b6", "b7", "b9", "b10", "b11", "b12"]); // the late pool, in turn
    expect(runCue({ cue, history: hot, previous, state: {}, type: "normal", role: "player", random: Math.random, now: 0 }).texts[0]!.text)
      .toBe("[Write your next response incorporating the following direction naturally into the scene. Do not reference this instruction or acknowledge it explicitly. Direction: B1]");
  });
});
