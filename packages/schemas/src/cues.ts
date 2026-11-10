// Homunculus 2 — Cues: rules that react to the chat without calling the AI (D-113). Author: CLAUDE, 2026-11-10.
//
// A cue reads the chat (signals), remembers values between turns (kept in the world state, pinned to messages, so
// swipes and branches are right), and writes texts into the prompt (groups of texts, each text with its own trigger).
// Agents think (they call an AI); cues react (no AI call, instant, free). JanitorAI's "advanced scripts" are the
// model: everything their JavaScript does by hand is a field here (docs/BLUEPRINT.md §4.10). A cue is standalone: it
// does not need a lorebook, and the lorebook does not change because of cues.
import { z } from "zod";
import { GenerationType, Id, Json, UserRole } from "./common.ts";
import { LoreCondition, LorePosition } from "./lorebooks.ts";

/** Names of signals and values: what conditions and macros use ("signal.heat", "value.scene", {{value.scene}}). */
export const CueKey = z.string().regex(/^[a-z][a-z0-9_]*$/, "Use lower-case letters, digits and _ (starting with a letter).");
export type CueKey = z.infer<typeof CueKey>;

/**
 * One test, in the lorebook's format (D-113: one format in the whole app) plus "at least" / "at most".
 * `path`: "signal.<key>", "value.<key>", or "<tracker namespace>.<field>" (another cue: "<its namespace>.<key>").
 */
export const CueCondition = LoreCondition.extend({
  op: z.enum([...LoreCondition.shape.op.options, "atLeast", "atMost"]),
});
export type CueCondition = z.infer<typeof CueCondition>;
export type CueConditionInput = z.input<typeof CueCondition>;

/** Who said it: you, the AI (characters, narrator), or both. */
export const CueFrom = z.enum(["both", "user", "ai"]);
export type CueFrom = z.infer<typeof CueFrom>;

/** A list of words or phrases looked for in the last messages. `/regex/flags` works too, as in lorebook keys. */
export const CueWords = z.object({
  words: z.array(z.string()).default([]),
  /** How many of the latest messages are read (the message you just sent counts as one). */
  last: z.number().int().min(1).max(100).default(4),
  from: CueFrom.default("both"),
  /** "hand" does not match "handle". */
  wholeWords: z.boolean().default(true),
  caseSensitive: z.boolean().default(false),
  /** Skip a match right after not / never / no… ("she did not kiss him"). */
  ignoreNegated: z.boolean().default(false),
});
export type CueWords = z.infer<typeof CueWords>;

const signalBase = { key: CueKey, label: z.string().default("") };

/** What a cue reads every turn. Signals are computed, never stored. */
export const CueSignal = z.discriminatedUnion("kind", [
  /** How many times the words show up (a number). */
  z.object({ ...signalBase, kind: z.literal("words"), ...CueWords.shape }),
  /** How many messages there are on this branch (a number): all, yours, or the AI's. */
  z.object({ ...signalBase, kind: z.literal("messages"), count: CueFrom.default("both") }),
  /** Yes or no, with this chance (0–100). */
  z.object({ ...signalBase, kind: z.literal("chance"), percent: z.number().min(0).max(100).default(50) }),
  /** The computer's clock: the hour (0–23) or the part of the day (morning / afternoon / evening / night). */
  z.object({ ...signalBase, kind: z.literal("clock"), read: z.enum(["hour", "period"]).default("period") }),
  /** A tracker's field or another cue's value, e.g. "world.location". */
  z.object({ ...signalBase, kind: z.literal("tracker"), path: z.string().min(1) }),
  /** What kind of generation this is: normal / swipe / continue / impersonate… */
  z.object({ ...signalBase, kind: z.literal("generation") }),
]);
export type CueSignal = z.infer<typeof CueSignal>;
export type CueSignalInput = z.input<typeof CueSignal>;

const Scalar = z.union([z.string(), z.number(), z.boolean()]);

/** "When … then …": the first rule whose test passes changes the value. No tests = always. */
export const CueRule = z.object({
  when: z.array(CueCondition).default([]),
  logic: z.enum(["all", "any"]).default("all"),
  /** set = this value · add = plus this number (minus with a negative one) · reset = back to the starting value. */
  do: z.enum(["set", "add", "reset"]).default("set"),
  value: Scalar.default(""),
});
export type CueRule = z.infer<typeof CueRule>;

/** A value the cue remembers between turns. */
export const CueValue = z.object({
  key: CueKey,
  label: z.string().default(""),
  initial: Scalar.default(""),
  rules: z.array(CueRule).default([]),
  /** When no rule passes: keep the value (memory) or go back to the start (a value worked out each turn). */
  otherwise: z.enum(["keep", "reset"]).default("keep"),
  /** Shown (and editable) in the chat's Scene tab, like a tracker field (D-113, decision 2). */
  showInScene: z.boolean().default(false),
});
export type CueValue = z.infer<typeof CueValue>;

/** A text's own trigger: words in the last messages, without any lorebook. */
export const CueTextWords = z.object({
  /** At least one of these… */
  keys: z.array(z.string()).default([]),
  /** …and at least one of these, when there are any ("also needs")… */
  also: z.array(z.string()).default([]),
  /** …and none of these ("but not"). */
  not: z.array(z.string()).default([]),
  last: z.number().int().min(1).max(100).default(4),
  from: CueFrom.default("both"),
  wholeWords: z.boolean().default(true),
  caseSensitive: z.boolean().default(false),
});
export type CueTextWords = z.infer<typeof CueTextWords>;

/** One text a group can write. */
export const CueText = z.object({
  id: Id,
  /** A short name for lists and receipts ("A1 Clothing awareness"). Empty = the start of the text. */
  title: z.string().default(""),
  text: z.string().default(""),
  /** For "random by weight" and for "one of" a group. */
  weight: z.number().min(0).default(100),
  when: z.array(CueCondition).default([]),
  logic: z.enum(["all", "any"]).default("all"),
  words: CueTextWords.optional(),
  /** 0–100. */
  chance: z.number().min(0).max(100).default(100),
  /** Only once the branch has at least this many messages. */
  minMessages: z.number().int().min(0).default(0),
  /** Texts with the same name here: only one of them goes in (by weight), like a lorebook inclusion group. */
  oneOf: z.string().default(""),
  enabled: z.boolean().default(true),
});
export type CueText = z.infer<typeof CueText>;
export type CueTextInput = z.input<typeof CueText>;

/**
 * Where a group's text goes: the lorebook's places (before/after the character, around the examples or the Author's
 * Note, in the chat at a depth, an outlet), or with the agents' prompts (the preset's "Agent Prompts" block).
 */
export const CuePosition = z.enum([...LorePosition.options, "agentPrompts"]);
export type CuePosition = z.infer<typeof CuePosition>;

export const CuePlacement = z.object({
  position: CuePosition.default("atDepth"),
  depth: z.number().int().min(0).max(1000).default(1),
  role: z.enum(["system", "user", "assistant"]).default("system"),
  outletName: z.string().default(""),
});
export type CuePlacement = z.infer<typeof CuePlacement>;

/** A group of texts: how one (or several) is picked, and where it goes. A cue can have several groups. */
export const CueGroup = z.object({
  key: CueKey,
  name: z.string().default(""),
  /** first = the first that matches · random = by weight · rotate = the next one each time · all = every one that matches. */
  pick: z.enum(["first", "random", "rotate", "all"]).default("random"),
  /** Don't pick any of the last N texts again (while others match). */
  noRepeat: z.number().int().min(0).max(100).default(0),
  /** 0–100: the whole group's chance this turn ("15% and only one event"). */
  chance: z.number().min(0).max(100).default(100),
  /** After writing, wait this many messages before writing again. */
  cooldown: z.number().int().min(0).max(1000).default(0),
  /** Around what was picked: "{{text}}" is replaced by it. Empty = just the text. */
  wrap: z.string().default(""),
  /** Between texts when several are picked. */
  separator: z.string().default("\n"),
  placement: CuePlacement.default({ position: "atDepth", depth: 1, role: "system", outletName: "" }),
  items: z.array(CueText).default([]),
});
export type CueGroup = z.infer<typeof CueGroup>;
export type CueGroupInput = z.input<typeof CueGroup>;

export const Cue = z.object({
  id: Id,
  name: z.string().min(1),
  /** One line: what it does. */
  help: z.string().default(""),
  icon: z.string().optional(),
  author: z.string().optional(),
  version: z.number().int().default(1),
  /** Where its values live in the world state ("cue-scene-direction"); unique. Macros: {{state.<namespace>.<key>}}. */
  namespace: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  signals: z.array(CueSignal).default([]),
  values: z.array(CueValue).default([]),
  groups: z.array(CueGroup).default([]),
  when: z.object({
    /** Empty = every kind of generation. */
    generationTypes: z.array(GenerationType).default([]),
    /** Empty = every user role. */
    roles: z.array(UserRole).default([]),
    /** Only once the branch has at least this many messages. */
    minMessages: z.number().int().min(0).default(0),
  }).default({ generationTypes: [], roles: [], minMessages: 0 }),
  /** On a swipe: the same rolls (default; the swipe only changes the AI's writing) or new ones. Counters never add twice. */
  randomness: z.enum(["stable", "perSwipe"]).default("stable"),
  /** Switched on by itself in chats where one of these characters is (D-113, decision 3), besides Default / Story / chat. */
  characterIds: z.array(Id).default([]),
  source: z.object({ kind: z.enum(["user", "example", "imported", "agent"]), from: z.string().optional() }).default({ kind: "user" }),
  /** What it came from (a JanitorAI script, a converted agent…), kept intact. */
  original: Json.optional(),
});
export type Cue = z.infer<typeof Cue>;
export type CueInput = z.input<typeof Cue>;

/** What one cue did for one reply (kept in the generation record, shown in the Reply tab). */
export const CueReport = z.object({
  cueId: Id,
  name: z.string(),
  namespace: z.string(),
  /** Each signal's value, and for words which ones matched ("pins ×2, wall"). */
  signals: z.array(z.object({ key: z.string(), value: Json, detail: z.string().optional() })).default([]),
  values: z.array(z.object({ key: z.string(), before: Json, after: Json, why: z.string() })).default([]),
  groups: z.array(z.object({
    key: z.string(), name: z.string(),
    /** The texts that went in (ids and titles). */
    picked: z.array(z.object({ id: z.string(), title: z.string() })).default([]),
    /** "picked at random from 3", "nothing matched", "cooldown: 2 more messages", "chance (15%)". */
    reason: z.string(),
    position: CuePosition,
    tokens: z.number().int().default(0),
  })).default([]),
  /** Did not run at all, and why ("not on impersonate"). */
  skipped: z.string().optional(),
  tokens: z.number().int().default(0),
});
export type CueReport = z.infer<typeof CueReport>;
