// Homunculus 2 — presets: the recipe of the prompt (BLUEPRINT §5). Author: CLAUDE, 2026-10-28 (slice 2, D-021).
// A preset is an ordered list of blocks. A block is either text the user writes (with macros) or a
// MARKER that the app fills (the character's description, the chat history, the current scene…).
// SillyTavern Chat Completion presets import into this shape and export back without loss (`original`).
import { z } from "zod";
import { GenerationType, Id, Json } from "./common.ts";

/**
 * Places the app fills. The first ones are SillyTavern's markers (same names); `scene` and `agentPrompts`
 * are ours (trackers' current values, and what agents add to the prompt).
 */
export const PromptMarker = z.enum([
  "charDescription", "charPersonality", "scenario", "personaDescription", "dialogueExamples", "chatHistory",
  "worldInfoBefore", "worldInfoAfter", "scene", "agentPrompts",
]);
export type PromptMarker = z.infer<typeof PromptMarker>;

export const PromptRole = z.enum(["system", "user", "assistant"]);

export const PresetBlock = z.object({
  /** Stable id. SillyTavern's identifiers are kept ("main", "jailbreak", "charDescription"…). */
  id: Id,
  name: z.string().default(""),
  enabled: z.boolean().default(true),
  /** Set = the app fills this block; `content` is not used. */
  marker: PromptMarker.optional(),
  role: PromptRole.default("system"),
  content: z.string().default(""),
  /** list = where it is in the list · depth = inside the chat, `depth` messages before the end. */
  position: z.enum(["list", "depth"]).default("list"),
  depth: z.number().int().min(0).max(999).default(4),
  /** For blocks at the same depth: higher comes first (SillyTavern's injection order). */
  order: z.number().int().default(100),
  /** Only for these kinds of generation (empty = always). */
  triggers: z.array(GenerationType).default([]),
  /** A card's own system prompt / post-history instructions may not replace this block. */
  noOverride: z.boolean().default(false),
});
export type PresetBlock = z.infer<typeof PresetBlock>;
export type PresetBlockInput = z.input<typeof PresetBlock>;

export const Preset = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().default(""),
  blocks: z.array(PresetBlock).default([]),
  /** Largest prompt + reply, in tokens. Older messages are left out to fit. Missing = no limit. */
  contextSize: z.number().int().positive().optional(),
  /** Samplers the preset sets. Each one set here wins over the connection's. */
  params: z.object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    maxTokens: z.number().int().positive().optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
    topK: z.number().int().min(0).optional(),
    minP: z.number().min(0).max(1).optional(),
    repetitionPenalty: z.number().min(0).max(3).optional(),
  }).default({}),
  /** How marker text is wrapped. {{description}}, {{personality}}, {{scenario}}, {{persona}}, {{mesExamples}}, {{worldInfo}} are the values. */
  formats: z.object({
    description: z.string().default("{{description}}"),
    personality: z.string().default("{{personality}}"),
    scenario: z.string().default("{{scenario}}"),
    persona: z.string().default("{{persona}}"),
    examples: z.string().default("{{mesExamples}}"),
    worldInfo: z.string().default("{{worldInfo}}"),
  }).default({ description: "{{description}}", personality: "{{personality}}", scenario: "{{scenario}}", persona: "{{persona}}", examples: "{{mesExamples}}", worldInfo: "{{worldInfo}}" }),
  /** Short texts SillyTavern adds in some places (empty = not added). */
  prompts: z.object({
    /** Before the chat history ("[Start a new Chat]"). */
    newChat: z.string().default(""),
    /** Replaces <START> in example dialogue ("[Example Chat]"). */
    newExampleChat: z.string().default(""),
    continueNudge: z.string().default(""),
    impersonation: z.string().default(""),
    /** Text the reply must start with (sent as the last, assistant message). */
    prefill: z.string().default(""),
  }).default({ newChat: "", newExampleChat: "", continueNudge: "", impersonation: "", prefill: "" }),
  /** Join system messages that follow each other into one (some models want a single system message). */
  squashSystem: z.boolean().default(false),
  /** The original imported file (SillyTavern preset), kept for lossless export. */
  original: Json.optional(),
});
export type Preset = z.infer<typeof Preset>;
export type PresetInput = z.input<typeof Preset>;
