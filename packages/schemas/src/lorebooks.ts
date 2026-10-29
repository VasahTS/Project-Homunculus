// Homunculus 2 — lorebooks (SillyTavern's World Info). Author: CLAUDE, 2026-10-28 (slice 3, D-027).
//
// A lorebook is a list of entries. An entry goes into the prompt when its keywords show up in the recent
// chat (or always, when "constant"). Every field and default below follows SillyTavern
// (public/scripts/world-info.js `newWorldInfoEntryDefinition`), with clearer names; the importer maps
// SillyTavern's names to these and back. Ours on top: `conditions` (activate only when the world state says
// so, BLUEPRINT §5.3). Without conditions an entry activates exactly as in SillyTavern.
import { z } from "zod";
import { GenerationType, Id, Json } from "./common.ts";

/** How secondary keywords combine with the primary match (SillyTavern `world_info_logic`). */
export const LoreLogic = z.enum(["andAny", "notAll", "notAny", "andAll"]);
export type LoreLogic = z.infer<typeof LoreLogic>;

/**
 * Where an activated entry goes (SillyTavern `world_info_position`, same order):
 * before / after = the "World Info (before/after)" blocks of the preset · anTop / anBottom = around the
 * Author's Note · atDepth = inside the chat, `depth` messages before the end · emTop / emBottom = before /
 * after the example dialogue · outlet = only where a {{outlet::name}} macro asks for it.
 */
export const LorePosition = z.enum(["before", "after", "anTop", "anBottom", "atDepth", "emTop", "emBottom", "outlet"]);
export type LorePosition = z.infer<typeof LorePosition>;

/** One test on the world state (ours). `path` = "<tracker namespace>.<field>[.<more>]". */
export const LoreCondition = z.object({
  path: z.string().min(1),
  op: z.enum(["equals", "notEquals", "contains", "notContains", "exists", "missing", "greater", "less"]),
  /** Compared as text (case does not matter) unless both sides are numbers. Not used by exists/missing. */
  value: z.string().default(""),
});
export type LoreCondition = z.infer<typeof LoreCondition>;

const nullableInt = z.number().int().nullable().default(null);
const nullableBool = z.boolean().nullable().default(null);

export const LoreEntry = z.object({
  /** Stable id inside the book. SillyTavern's `uid` is kept as text ("0", "1"…). */
  id: Id,
  /** The title in the editor (SillyTavern `comment`, also called "memo"). */
  title: z.string().default(""),
  keys: z.array(z.string()).default([]),
  secondaryKeys: z.array(z.string()).default([]),
  logic: LoreLogic.default("andAny"),
  content: z.string().default(""),
  enabled: z.boolean().default(true),
  /** Always in the prompt (still subject to the other filters). */
  constant: z.boolean().default(false),
  /** Kept for SillyTavern's vector storage; Homunculus does not use it. */
  vectorized: z.boolean().default(false),
  /** SillyTavern `selective`: secondary keys are checked (always on in new SillyTavern entries). */
  selective: z.boolean().default(true),
  /** Higher goes later in the prompt, and wins the budget first. */
  order: z.number().int().default(100),
  position: LorePosition.default("before"),
  depth: z.number().int().min(0).max(1000).default(4),
  role: z.enum(["system", "user", "assistant"]).default("system"),
  outletName: z.string().default(""),
  probability: z.number().min(0).max(100).default(100),
  useProbability: z.boolean().default(true),
  /** Inclusion groups: names separated by commas; only one entry per group goes in. */
  group: z.string().default(""),
  groupOverride: z.boolean().default(false),
  groupWeight: z.number().min(0).default(100),
  /** null = use the book settings. */
  useGroupScoring: nullableBool,
  /** How many recent messages to read (null = the book settings). */
  scanDepth: nullableInt,
  caseSensitive: nullableBool,
  matchWholeWords: nullableBool,
  /** Stays active this many messages after it activates (null/0 = off). */
  sticky: nullableInt,
  /** Can't activate again for this many messages. */
  cooldown: nullableInt,
  /** Can't activate before the chat has this many messages. */
  delay: nullableInt,
  /** Can't be activated by other entries (recursion). */
  excludeRecursion: z.boolean().default(false),
  /** Its text doesn't activate other entries. */
  preventRecursion: z.boolean().default(false),
  /** Only activates on recursion, at this level or later (0 = off; SillyTavern `true` = 1). */
  delayUntilRecursion: z.number().int().min(0).default(0),
  /** Goes in even when the budget is full. */
  ignoreBudget: z.boolean().default(false),
  /** Also read these texts when looking for keywords (besides the chat). */
  scan: z.object({
    personaDescription: z.boolean().default(false),
    characterDescription: z.boolean().default(false),
    characterPersonality: z.boolean().default(false),
    characterDepthPrompt: z.boolean().default(false),
    scenario: z.boolean().default(false),
    creatorNotes: z.boolean().default(false),
  }).default({ personaDescription: false, characterDescription: false, characterPersonality: false, characterDepthPrompt: false, scenario: false, creatorNotes: false }),
  /** Only (or never, with `exclude`) for these characters (names) or card tags. */
  characterFilter: z.object({
    names: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    exclude: z.boolean().default(false),
  }).default({ names: [], tags: [], exclude: false }),
  /** Only for these kinds of generation (empty = always). */
  triggers: z.array(GenerationType).default([]),
  automationId: z.string().default(""),
  /** Ours: the entry also needs the world state to match (all or any of the tests). Empty = no test. */
  conditions: z.array(LoreCondition).default([]),
  conditionLogic: z.enum(["all", "any"]).default("all"),
  /** Order in the editor (SillyTavern `displayIndex`). */
  displayIndex: z.number().int().optional(),
  /** The original SillyTavern entry, kept for lossless export (fields we don't know about survive). */
  original: Json.optional(),
});
export type LoreEntry = z.infer<typeof LoreEntry>;
export type LoreEntryInput = z.input<typeof LoreEntry>;

export const Lorebook = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().default(""),
  entries: z.array(LoreEntry).default([]),
  /** Where it came from (the card it was embedded in, or a SillyTavern file). */
  source: z.object({
    kind: z.enum(["user", "stFile", "card"]),
    /** For "card": the character it came with (its export writes this book back into the card). */
    characterId: Id.optional(),
    fileName: z.string().optional(),
    /** The file had no name, so the app gave it this one (export leaves the name out while it is unchanged). */
    inventedName: z.string().optional(),
  }).default({ kind: "user" }),
  /** The original file without its entries (SillyTavern `originalData`, card book fields…), for lossless export. */
  original: Json.optional(),
});
export type Lorebook = z.infer<typeof Lorebook>;
export type LorebookInput = z.input<typeof Lorebook>;

/**
 * How lorebooks are read (SillyTavern's global World Info settings; defaults = SillyTavern's
 * default/content/settings.json). One set for the whole app for now; per story/session later.
 */
export const LoreSettings = z.object({
  /** How many recent messages are read for keywords. */
  scanDepth: z.number().int().min(0).max(1000).default(2),
  /** Lorebook entries may use at most this share of the context size… */
  budgetPercent: z.number().min(1).max(100).default(25),
  /** …and at most this many tokens (0 = no cap). */
  budgetCap: z.number().int().min(0).default(0),
  /** Keep reading older messages until at least this many entries are in (0 = off). */
  minActivations: z.number().int().min(0).default(0),
  /** …but never deeper than this (0 = the whole chat). */
  minActivationsDepthMax: z.number().int().min(0).default(0),
  /** Entries' text can activate other entries. */
  recursive: z.boolean().default(true),
  /** Stop recursion after this many rounds (0 = no limit; turns off min activations). */
  maxRecursionSteps: z.number().int().min(0).default(0),
  /** Read the chat as "Name: message". */
  includeNames: z.boolean().default(true),
  caseSensitive: z.boolean().default(false),
  matchWholeWords: z.boolean().default(true),
  useGroupScoring: z.boolean().default(false),
  /** Character books and the other books: by order together, character's first, or the others first. */
  insertionStrategy: z.enum(["evenly", "characterFirst", "globalFirst"]).default("characterFirst"),
});
export type LoreSettings = z.infer<typeof LoreSettings>;

/** Sticky / cooldown timers at one message (SillyTavern keeps them in chat metadata; we pin them to the message). */
export const LoreTimer = z.object({ start: z.number().int(), end: z.number().int(), protected: z.boolean().default(false) });
export const LoreTimers = z.object({
  sticky: z.record(z.string(), LoreTimer).default({}),
  cooldown: z.record(z.string(), LoreTimer).default({}),
});
export type LoreTimers = z.infer<typeof LoreTimers>;

/** What the lorebooks did for one reply (kept in the generation record, shown in the Reply tab). */
export const LoreReport = z.object({
  /** Entries that went in, in prompt order. */
  activated: z.array(z.object({
    bookId: Id, bookName: z.string(), entryId: Id, title: z.string(), position: LorePosition,
    /** "keyword: castle", "constant", "sticky", "recursion: castle", "@@activate"… */
    reason: z.string(), tokens: z.number().int(),
  })).default([]),
  /** Entries that matched but stayed out, and why ("budget", "probability", "group: …"). */
  skipped: z.array(z.object({ bookId: Id, entryId: Id, title: z.string(), reason: z.string() })).default([]),
  budget: z.object({ limit: z.number().int(), used: z.number().int(), overflowed: z.boolean() }).optional(),
  /** Timers after this reply (read by the next one). */
  timers: LoreTimers.default({ sticky: {}, cooldown: {} }),
  books: z.array(Id).default([]),
});
export type LoreReport = z.infer<typeof LoreReport>;
