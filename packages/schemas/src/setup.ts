// Homunculus 2 — the layered Setup (BLUEPRINT §3). Author: CLAUDE, 2026-10-27.
//
// A SetupLayer exists at three levels: the user's Default, a Story and a Session (a 1:1 chat has no story layer).
// Every field is optional: a missing field means "inherit from the layer above".
// The core resolves the layers with ONE function (resolveSetup); nothing else reads layers.
import { z } from "zod";
import { Id, Json } from "./common.ts";

/**
 * How a list (agents, lorebooks) combines with the layer above:
 *  - keep:  use the list from above unchanged (same as leaving the field out)
 *  - only:  use exactly `add`, ignore the list from above
 *  - add:   the list from above + `add` − `remove`
 */
export const ListOverride = z.object({
  mode: z.enum(["keep", "only", "add"]),
  add: z.array(Id).default([]),
  remove: z.array(Id).default([]),
});
export type ListOverride = z.infer<typeof ListOverride>;

/** Per-agent settings that a layer can change without editing the agent itself. */
export const AgentOverride = z.object({
  /** Connection to use for this agent (null = the session's main connection). */
  connectionId: Id.nullable().optional(),
  /** For trackers: which field schema to use (e.g. "rpg-world" vs "drama-relationships"). */
  schemaId: Id.optional(),
  /** Extra prompt text or values an agent understands (e.g. a story-specific instruction). */
  settings: z.record(z.string(), Json).optional(),
});
export type AgentOverride = z.infer<typeof AgentOverride>;

export const TurnOrder = z.enum(["natural", "list", "pooled", "manual", "agent"]);
export type TurnOrder = z.infer<typeof TurnOrder>;

/**
 * Author's Note (SillyTavern `authors-note.js`): a note the AI reads every N of your messages, placed in the chat
 * N messages from the end (or before/after the main prompt). Each field is inherited on its own: Default → Story → chat.
 */
export const AuthorsNote = z.object({
  text: z.string().optional(),
  /** Every how many of your messages it is sent (1 = every turn, 0 = never). */
  interval: z.number().int().min(0).max(999).optional(),
  position: z.enum(["inChat", "afterMain", "beforeMain"]).optional(),
  /** In the chat: how many messages before the end (0 = after the last one). */
  depth: z.number().int().min(0).max(999).optional(),
  role: z.enum(["system", "user", "assistant"]).optional(),
});
export type AuthorsNote = z.infer<typeof AuthorsNote>;

export const SetupLayer = z.object({
  presetId: Id.nullable().optional(),
  personaId: Id.nullable().optional(),
  personaVariantId: Id.nullable().optional(),
  /** Main connection (where the story is written): a connection profile id. */
  connectionId: Id.nullable().optional(),
  /** Connection for agents and trackers that don't pick their own (null = same as the story). */
  agentConnectionId: Id.nullable().optional(),
  lorebooks: ListOverride.optional(),
  /** Agents, trackers and companions are all agents (BLUEPRINT §4). */
  agents: ListOverride.optional(),
  agentOverrides: z.record(z.string(), AgentOverride).optional(),
  /** Story style variables: pov, tense, length, tone… (module story-style). */
  storyStyle: z.record(z.string(), z.string()).optional(),
  turnOrder: TurnOrder.optional(),
  /** Run state trackers on every swipe (true) or only when the story continues (false). */
  trackersOnSwipe: z.boolean().optional(),
  limits: z
    .object({
      /** Stop auto-play after this many turns. */
      autoPlayMaxTurns: z.number().int().positive().optional(),
      /** Warn/stop when a session's known cost passes this amount (USD). */
      maxSessionCost: z.number().positive().optional(),
    })
    .optional(),
  authorsNote: AuthorsNote.optional(),
  /** Values for setup fields added by modules (registerSetupField), keyed by field id. */
  extra: z.record(z.string(), Json).optional(),
});
export type SetupLayer = z.infer<typeof SetupLayer>;

export const SetupLevel = z.enum(["builtin", "default", "story", "session"]);
export type SetupLevel = z.infer<typeof SetupLevel>;

// (The setup-only "Kit" of the first blueprint was never used; a Kit is now a story's starting pack: play.ts, D-036.)
