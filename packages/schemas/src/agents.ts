// Homunculus 2 — agents as data (BLUEPRINT §4). Author: CLAUDE, 2026-10-27.
//
// Every agent — built in or made by the user — is a trigger, what it reads and where its
// result goes, plus options. Built-in agents add a `run` function in code (core
// AgentDefinition); user agents are just this data and run through an executor.
import { z } from "zod";
import { GenerationType, Id, Json, UserRole } from "./common.ts";

export const TurnPhase = z.enum(["before", "parallel", "after"]);
export type TurnPhase = z.infer<typeof TurnPhase>;

export const AgentTrigger = z.discriminatedUnion("on", [
  z.object({ on: z.literal("turn"), phase: TurnPhase }),
  z.object({ on: z.literal("everyN"), n: z.number().int().positive() }),
  /** When a world-state value changes, e.g. path "world.location". */
  z.object({ on: z.literal("stateChange"), path: z.string().min(1) }),
  z.object({ on: z.literal("sessionStart") }),
  z.object({ on: z.literal("chapterEnd") }),
  z.object({ on: z.literal("manual") }),
]);
export type AgentTrigger = z.infer<typeof AgentTrigger>;

/** Where the agent's result goes (BLUEPRINT §4.1). */
export const AgentOutputKind = z.enum([
  "inject", // text added to the main prompt
  "intercept", // rewrites the user's message before sending
  "rewrite", // rewrites the reply (kept as a revision, can be undone)
  "state", // structured data → world state (validated by a tracker schema)
  "note", // the agent's own note, shown in its panel (companions)
  "check", // pass/fail on the reply → warn, fix or regenerate
  "choices", // clickable options in the UI
  "proposal", // proposed change to library data, the user approves
  "speaker", // who speaks next in a group
  "media", // image / music / voice (later)
]);
export type AgentOutputKind = z.infer<typeof AgentOutputKind>;

/**
 * How the agent produces its answer:
 *  - code:     a built-in agent's own function (modules only)
 *  - separate: its own AI call (can use a cheap model)
 *  - inline:   the main model writes a tagged block inside its reply; the app removes and keeps it
 *  - text:     no AI call: the agent's own text (macros expanded, {{random}} included) is the answer — rules and
 *              randomizers that only add instructions to the prompt (D-047)
 */
export const AgentRunMode = z.enum(["code", "separate", "inline", "text"]);
export type AgentRunMode = z.infer<typeof AgentRunMode>;

export const AgentConditions = z.object({
  /** Run only if one of these words/regexes appears in the latest messages. Empty = always. */
  keywords: z.array(z.string()).default([]),
  /** 0–100. */
  probability: z.number().min(0).max(100).default(100),
  /** Empty = every generation type. */
  generationTypes: z.array(GenerationType).default([]),
  /** Empty = every user role. */
  roles: z.array(UserRole).default([]),
  /** Run only after the session has at least this many messages. */
  minMessages: z.number().int().min(0).default(0),
  /** Run only if every listed state value matches, e.g. { path: "world.location", equals: "Tavern" }. */
  state: z.array(z.object({ path: z.string().min(1), equals: Json })).default([]),
});
export type AgentConditions = z.infer<typeof AgentConditions>;

export const AgentConfig = z.object({
  id: Id,
  name: z.string().min(1),
  /** Short explanation shown by the "?" button. */
  help: z.string().default(""),
  version: z.number().int().default(1),
  triggers: z.array(AgentTrigger).min(1),
  output: AgentOutputKind,
  runMode: AgentRunMode.default("separate"),
  /** Prompt template (macros allowed). Code agents may leave it empty. */
  prompt: z.string().default(""),
  input: z
    .object({
      /** How many of the latest messages it reads. */
      messages: z.number().int().min(0).default(6),
      lorebooks: z.boolean().default(false),
      cards: z.boolean().default(true),
      /** true = all world state; a list = only these namespaces. */
      state: z.union([z.boolean(), z.array(z.string())]).default(true),
      /** Agents whose result this one reads. They run first (dependencies). */
      readsAgents: z.array(Id).default([]),
      /** The user's persona (D-048). */
      persona: z.boolean().default(false),
      /** The story's / chat's scenario (D-048). */
      scenario: z.boolean().default(false),
    })
    .default({ messages: 6, lorebooks: false, cards: true, state: true, readsAgents: [], persona: false, scenario: false }),
  conditions: AgentConditions.default({
    keywords: [], probability: 100, generationTypes: [], roles: [], minMessages: 0, state: [],
  }),
  /** Order inside a wave (rewrites run in this order, lowest first). */
  order: z.number().int().default(100),
  limits: z
    .object({
      maxTokens: z.number().int().positive().optional(),
      maxRunsPerTurn: z.number().int().positive().default(1),
    })
    .default({ maxRunsPerTurn: 1 }),
  /** Random agents: roll again on every swipe, or keep the same roll for the same parent message. */
  randomness: z.enum(["perSwipe", "stable"]).default("perSwipe"),
  /** Tool ids this agent may use (registerAgentTool). A capability, not an output kind. */
  tools: z.array(z.string()).default([]),
  /** For `inject`: where the text goes. */
  injection: z
    .object({
      position: z.enum(["marker", "depth"]).default("marker"),
      depth: z.number().int().min(0).default(4),
      role: z.enum(["system", "user", "assistant"]).default("system"),
    })
    .optional(),
  /** For `state`: the namespace this agent owns and the tracker schema it fills. */
  state: z.object({ namespace: z.string().min(1), schemaId: Id.optional() }).optional(),
  /** For `check`: what happens when the reply fails. */
  check: z
    .object({ onFail: z.enum(["warn", "fix", "regenerate"]).default("warn"), maxRetries: z.number().int().min(0).default(1) })
    .optional(),
  /** How the app shows the result (D-047, D-048). Each kind has a default; nothing here changes what the agent does. */
  display: z.object({
    /** Notes: a closed label under the reply, an open card under it, only in the agents panel, or a view (D-049). */
    note: z.enum(["message", "card", "menu", "view"]).default("message"),
    /** For note = "view": how the app draws the agent's structured answer, with its own parts (never the agent's HTML). */
    view: z.enum(["feed", "phone", "sheet", "cards"]).default("feed"),
    /** Choices: buttons under the reply, a numbered list in the reply, above the message box, or only in the panel. */
    choices: z.enum(["buttons", "list", "composer", "menu"]).default("buttons"),
    /** Checks: a mark beside the name, a line under the reply, or nothing in the chat. */
    check: z.enum(["mark", "line", "silent"]).default("mark"),
    /** Rewrites: a mark beside the name, or nothing in the chat. */
    rewrite: z.enum(["mark", "silent"]).default("mark"),
  }).partial().optional(),
  /**
   * Versions of the same agent (Daniel, 30/10): e.g. a group chat as "Classmates", "Redditors" or "4chan". The text
   * replaces {{style}} in the instructions (or is added at the end). The story/chat picks one; `styleId` is the default.
   */
  styles: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), text: z.string().default("") })).optional(),
  styleId: z.string().optional(),
  /** For `proposal`: what it proposes to change (D-049). "lorebook": new or updated entries in the story's own version. */
  proposal: z.object({ target: z.enum(["lorebook"]) }).optional(),
  /** For `inline`: the tag the main model writes, e.g. "SCENE" for [SCENE]…[/SCENE]. */
  inlineTag: z.string().optional(),
  source: z
    .object({ kind: z.enum(["builtin", "user", "imported"]), from: z.string().optional() })
    .default({ kind: "user" }),
  /** The original imported definition (e.g. a Homunculus v1 agent JSON), kept intact. */
  original: Json.optional(),
});
export type AgentConfig = z.infer<typeof AgentConfig>;
export type AgentConfigInput = z.input<typeof AgentConfig>;
