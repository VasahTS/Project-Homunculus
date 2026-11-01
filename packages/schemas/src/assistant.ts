// Homunculus 2 — the Assistant: its settings and its chats (D-062). Author: CLAUDE, 2026-11-01.
// Plan: docs/UI-PLAN.md → "Library Assistant". The Assistant builds and changes Library items with tools; nothing is
// deleted by it, and changes to existing items wait for the user's OK.
import { z } from "zod";
import { Id } from "./common.ts";

/** Kinds the Assistant can make and change. Others (NPCs, presets, personas, stories) it can only read. */
export const AssistantKind = z.enum(["character", "lorebook", "tracker", "kit", "narrator"]);
export type AssistantKind = z.infer<typeof AssistantKind>;
/** Kinds it can read (find / read / add as context). */
export const AssistantReadKind = z.enum(["character", "lorebook", "tracker", "kit", "narrator", "npc", "persona", "preset", "story"]);
export type AssistantReadKind = z.infer<typeof AssistantReadKind>;

export const AssistantRule = z.object({ id: Id, text: z.string().min(1), on: z.boolean().default(true) });
export type AssistantRule = z.infer<typeof AssistantRule>;
export const AssistantMemory = z.object({ id: Id, text: z.string().min(1), from: z.string().default(""), at: z.number().int() });
export type AssistantMemory = z.infer<typeof AssistantMemory>;

export const AssistantSettings = z.object({
  /** A connection profile id; null = the one stories use. */
  connectionId: Id.nullable().default(null),
  /** Empty = the connection's model. */
  model: z.string().default(""),
  effort: z.enum(["", "low", "medium", "high"]).default(""),
  temperature: z.number().min(0).max(2).default(0.7),
  /** Tool calls per message before it stops and asks. */
  maxSteps: z.number().int().min(1).max(100).default(25),
  /** New items are saved right away (Undo on the card); false = they wait like changes. */
  saveNew: z.boolean().default(true),
  /** Its main instructions; empty = the built-in ones. */
  instructions: z.string().default(""),
  rules: z.array(AssistantRule).default([]),
  memory: z.array(AssistantMemory).default([]),
  memoryOn: z.boolean().default(true),
});
export type AssistantSettings = z.infer<typeof AssistantSettings>;

/** Something a reply made or proposes, shown as a card. */
export const AssistantResult = z.discriminatedUnion("type", [
  z.object({ type: z.literal("created"), kind: AssistantKind, itemId: Id, name: z.string(), detail: z.string().default(""), undone: z.boolean().default(false) }),
  z.object({
    type: z.literal("change"), id: Id, kind: AssistantKind, itemId: Id, name: z.string(), summary: z.string().default(""),
    /** Only the fields that change, as they were and as proposed. */
    before: z.record(z.string(), z.unknown()), after: z.record(z.string(), z.unknown()),
    status: z.enum(["waiting", "applied", "discarded", "stale"]).default("waiting"),
  }),
  z.object({ type: z.literal("trash"), id: Id, kind: AssistantKind, itemId: Id, name: z.string(), reason: z.string().default(""), status: z.enum(["waiting", "applied", "discarded"]).default("waiting") }),
  z.object({ type: z.literal("new"), id: Id, kind: AssistantKind, name: z.string(), data: z.unknown(), status: z.enum(["waiting", "applied", "discarded"]).default("waiting"), itemId: Id.optional() }),
  z.object({ type: z.literal("memory"), text: z.string() }),
]);
export type AssistantResult = z.infer<typeof AssistantResult>;

/** Something added to a message: an item of the app (read with tools), a file, or an image. */
export const AssistantAttachment = z.discriminatedUnion("type", [
  z.object({ type: z.literal("item"), kind: AssistantReadKind, id: Id, name: z.string() }),
  z.object({ type: z.literal("file"), id: Id, name: z.string(), mime: z.string().default(""), text: z.string(), summary: z.string().default("") }),
  z.object({ type: z.literal("image"), id: Id, name: z.string(), mime: z.string(), base64: z.string() }),
]);
export type AssistantAttachment = z.infer<typeof AssistantAttachment>;

export const AssistantToolStep = z.object({ id: z.string(), name: z.string(), args: z.string().default(""), result: z.string().default(""), label: z.string().default(""), error: z.boolean().default(false) });
export type AssistantToolStep = z.infer<typeof AssistantToolStep>;

export const AssistantMessage = z.object({
  id: Id,
  role: z.enum(["user", "assistant"]),
  text: z.string().default(""),
  reasoning: z.string().default(""),
  attachments: z.array(AssistantAttachment).default([]),
  /** Assistant only: the tool calls of this reply, in order (the model's turns between them are in `rounds`). */
  steps: z.array(AssistantToolStep).default([]),
  /** Assistant only: the text the model wrote before each round of tool calls (kept so the next request is exact). */
  rounds: z.array(z.object({ text: z.string(), calls: z.array(z.object({ id: z.string(), name: z.string(), arguments: z.string() })) })).default([]),
  results: z.array(AssistantResult).default([]),
  /** What it used (Flint's "what is being used"): model, rules, memory, guides, tokens. */
  used: z.object({ model: z.string().default(""), tokensIn: z.number().optional(), tokensOut: z.number().optional(), cost: z.number().optional(), guides: z.array(z.string()).default([]) }).optional(),
  error: z.string().optional(),
  createdAt: z.number().int(),
});
export type AssistantMessage = z.infer<typeof AssistantMessage>;

export const AssistantChat = z.object({
  id: Id,
  title: z.string().default("New chat"),
  /** One line of what was made (for the Recents list). */
  summary: z.string().default(""),
  messages: z.array(AssistantMessage).default([]),
  /** Guides already given in this chat (not sent again). */
  guides: z.array(z.string()).default([]),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type AssistantChat = z.infer<typeof AssistantChat>;
