// Homunculus 2 — records kept per message (BLUEPRINT §2.4). Author: CLAUDE, 2026-10-27.
// Everything that happens at a message is tied to it, so swipes, rewinds and branches
// always show the right thing.
import { z } from "zod";
import { GenerationType, Id, Json } from "./common.ts";
import { LoreReport } from "./lorebooks.ts";

/**
 * World state is stored as small changes ("deltas") attached to messages (D-001).
 * namespace = the tracker/module that owns the data. A value of null deletes the key.
 */
export const StateDelta = z.record(z.string(), z.record(z.string(), Json));
export type StateDelta = z.infer<typeof StateDelta>;

export const AgentRunStatus = z.enum(["ok", "failed", "skipped", "cancelled"]);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

/** What one agent did at one message. */
export const AgentRun = z.object({
  id: Id,
  sessionId: Id,
  messageId: Id,
  agentId: Id,
  /** e.g. "turn.after", "everyN", "manual". */
  trigger: z.string(),
  status: AgentRunStatus,
  /** Set when an earlier message was edited after this run (BLUEPRINT §2.4). */
  stale: z.boolean().default(false),
  startedAt: z.number().int(),
  durationMs: z.number().int().min(0).default(0),
  model: z.string().optional(),
  tokensIn: z.number().int().optional(),
  tokensOut: z.number().int().optional(),
  cost: z.number().optional(),
  output: Json.optional(),
  error: z.string().optional(),
  /** Parts of a valid answer that were left out (e.g. a tracker value that did not fit its field). */
  warnings: z.array(z.string()).optional(),
  /** Why it answered that (D-048): the model's thinking, what it was sent, and its answer before parsing. */
  reasoning: z.string().optional(),
  prompt: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  raw: z.string().optional(),
  /** A direction you gave for this run only (D-057), e.g. "options that lead to the docks". */
  direction: z.string().optional(),
});
export type AgentRun = z.infer<typeof AgentRun>;
export type AgentRunInput = z.input<typeof AgentRun>;

/** A change to a message's text, by an agent or the user. The message keeps the current text. */
export const MessageRevision = z.object({
  id: Id,
  messageId: Id,
  author: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("agent"), agentId: Id }),
    z.object({ kind: z.literal("user") }),
  ]),
  before: z.string(),
  after: z.string(),
  createdAt: z.number().int(),
});
export type MessageRevision = z.infer<typeof MessageRevision>;

/** An agent's own note at a message (companions). */
export const AgentNote = z.object({
  id: Id,
  sessionId: Id,
  messageId: Id,
  agentId: Id,
  content: z.string(),
  data: Json.optional(),
  createdAt: z.number().int(),
});
export type AgentNote = z.infer<typeof AgentNote>;

/** One piece of the prompt and where it came from (block/marker/agent), for "see the prompt". */
export const PromptPart = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  source: z.string(),
});
export type PromptPart = z.infer<typeof PromptPart>;

/** How a reply was generated: what was sent, with what, and what it cost. */
export const GenerationRecord = z.object({
  messageId: Id,
  sessionId: Id,
  generationType: GenerationType,
  providerId: z.string(),
  model: z.string(),
  /** The connection profile used (its name may change later; the id stays). */
  connectionId: Id.optional(),
  params: z.record(z.string(), Json).default({}),
  prompt: z.array(PromptPart),
  /** Who was in the story for this reply: the persona and the versions (variants) used. */
  who: z.object({
    personaId: Id.nullable(),
    personaVariantId: Id.nullable(),
    cast: z.array(z.object({ characterId: Id.nullable(), variantId: Id.nullable() })),
  }).optional(),
  /** The preset used, and how the prompt fit the context (older messages left out). */
  presetId: Id.optional(),
  budget: z.object({
    limit: z.number().int().optional(),
    used: z.number().int(),
    reserved: z.number().int().default(0),
    droppedMessages: z.number().int().default(0),
  }).optional(),
  /** Plain notes about how the prompt was built ("Current scene was placed automatically…"). */
  promptNotes: z.array(z.string()).optional(),
  /** Which lorebook entries went in (and the sticky/cooldown timers after this reply). Slice 3. */
  lore: LoreReport.optional(),
  /** Ids of agents that ran for this reply, by phase. */
  agents: z.record(z.string(), z.array(Id)).default({}),
  tokensIn: z.number().int().optional(),
  tokensOut: z.number().int().optional(),
  cost: z.number().optional(),
  durationMs: z.number().int().min(0),
  createdAt: z.number().int(),
});
export type GenerationRecord = z.infer<typeof GenerationRecord>;
