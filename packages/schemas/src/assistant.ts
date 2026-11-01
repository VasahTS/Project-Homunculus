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

/**
 * An assistant (round 2, like Flint's assistants): a name, an emoji, what it is for, its own instructions and model.
 * The app's tool rules are always added before its instructions, so an assistant can change its voice and focus but
 * never break how tools are used.
 */
export const AssistantPersona = z.object({
  id: Id,
  emoji: z.string().default("✦"),
  name: z.string().min(1),
  description: z.string().default(""),
  instructions: z.string().default(""),
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
  /** Came with the app: can be edited and reset, not deleted. */
  builtin: z.boolean().default(false),
});
export type AssistantPersona = z.infer<typeof AssistantPersona>;

/** A note in a preset: lore, a world's facts, a style sample… sent while it is on. */
export const PresetNote = z.object({ id: Id, title: z.string().default(""), text: z.string().default(""), on: z.boolean().default(true) });
export type PresetNote = z.infer<typeof PresetNote>;

/**
 * A preset (Daniel: "a place to keep how I like it written, lore, things I don't want to repeat"): what the assistant
 * should always know. One per chat (the default one for new chats); any assistant can use any preset.
 */
export const AssistantPreset = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().default(""),
  /** How the user likes things written (style, length, format). */
  style: z.string().default(""),
  rules: z.array(AssistantRule).default([]),
  notes: z.array(PresetNote).default([]),
  memory: z.array(AssistantMemory).default([]),
  memoryOn: z.boolean().default(true),
  /** The assistant may add to this memory by itself (with `remember`). */
  autoMemory: z.boolean().default(true),
});
export type AssistantPreset = z.infer<typeof AssistantPreset>;

export const AssistantSettings = z.object({
  assistants: z.array(AssistantPersona).default([]),
  presets: z.array(AssistantPreset).default([]),
  defaultAssistantId: z.string().default(""),
  /** "" = none. */
  defaultPresetId: z.string().default(""),
  /** Tool groups switched off for every chat: "create", "change", "files", "memory". */
  toolsOff: z.array(z.string()).default([]),
  /** Round 1 fields (read once to fill the default assistant and preset; never written again). */
  connectionId: Id.nullable().optional(),
  model: z.string().optional(),
  effort: z.enum(["", "low", "medium", "high"]).optional(),
  temperature: z.number().optional(),
  maxSteps: z.number().optional(),
  saveNew: z.boolean().optional(),
  instructions: z.string().optional(),
  rules: z.array(AssistantRule).optional(),
  memory: z.array(AssistantMemory).optional(),
  memoryOn: z.boolean().optional(),
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
  /** Items put in a folder (applied at once; Undo puts each back and removes the folders it made, if empty). D-064. */
  z.object({
    type: z.literal("moved"), id: Id, folder: z.string().default(""),
    items: z.array(z.object({ kind: AssistantReadKind, itemId: Id, name: z.string(), from: Id.nullable().default(null) })).default([]),
    /** Folders it created for this (removed again by Undo when nothing else is in them). */
    made: z.array(Id).default([]),
    undone: z.boolean().default(false),
  }),
]);
export type AssistantResult = z.infer<typeof AssistantResult>;

/** Something added to a message: an item of the app (read with tools), a file, or an image. */
export const AssistantAttachment = z.discriminatedUnion("type", [
  z.object({ type: z.literal("item"), kind: AssistantReadKind, id: Id, name: z.string() }),
  z.object({ type: z.literal("file"), id: Id, name: z.string(), mime: z.string().default(""), text: z.string(), summary: z.string().default("") }),
  z.object({ type: z.literal("image"), id: Id, name: z.string(), mime: z.string(), base64: z.string() }),
]);
export type AssistantAttachment = z.infer<typeof AssistantAttachment>;

export const AssistantToolStep = z.object({ id: z.string(), name: z.string(), args: z.string().default(""), result: z.string().default(""), label: z.string().default(""), error: z.boolean().default(false),
  /** How long the tool took. */
  ms: z.number().optional() });
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
  used: z.object({
    model: z.string().default(""), tokensIn: z.number().optional(), tokensOut: z.number().optional(), cost: z.number().optional(),
    guides: z.array(z.string()).default([]),
    /** The prompt of the last request of this reply (how full the context is). */
    lastPrompt: z.number().optional(),
    assistant: z.string().optional(), preset: z.string().optional(),
    /** Estimated tokens by part of the request: instructions, preset, tools, chat. */
    parts: z.record(z.string(), z.number()).optional(),
    /** Ids of what was really in the last request: preset rules / notes / memory lines, attachments. */
    sent: z.array(z.string()).optional(),
    /** Wall time of the whole reply, and of the model's writing (for tokens per second). */
    ms: z.number().optional(), thinkMs: z.number().optional(), writeMs: z.number().optional(),
    /** Calls to the model in this reply. */
    calls: z.number().optional(),
  }).optional(),
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
  /** Who answers and what it knows ("" = the defaults); the model can be changed per chat from the composer. */
  assistantId: z.string().default(""),
  presetId: z.string().default(""),
  connectionId: Id.nullable().optional(),
  model: z.string().optional(),
  /** The model's context size, when known (from the model list). */
  contextLength: z.number().int().optional(),
  /** Older messages summed up (Flint's compaction): messages up to `uptoId` are sent as this summary. */
  compact: z.object({ uptoId: z.string(), summary: z.string(), at: z.number().int(), before: z.number().optional() }).optional(),
  /** Compact by itself when the context gets full (80%). */
  autoCompact: z.boolean().default(true),
  /** Draft first: it shows drafts in the chat (```homunculus-<kind> blocks) and saves nothing until the user does. */
  draftFirst: z.boolean().default(false),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type AssistantChat = z.infer<typeof AssistantChat>;
