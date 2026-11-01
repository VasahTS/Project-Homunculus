// Homunculus 2 — library items: characters (with variants), personas, avatars. Author: CLAUDE.
// BLUEPRINT §2.1 and §2.5. Variants store only what differs from the main version.
import { z } from "zod";
import { RegexScript } from "./regex.ts";
import { Id, Json } from "./common.ts";

/**
 * The Character's Note (SillyTavern's `depth_prompt`, D-063): text put into the chat at a depth (messages from the end)
 * with a role, in every reply with this character.
 */
export const CharacterNote = z.object({
  text: z.string().default(""),
  depth: z.number().int().min(0).max(999).default(4),
  role: z.enum(["system", "user", "assistant"]).default("system"),
});
export type CharacterNote = z.infer<typeof CharacterNote>;

/** Card fields a variant may change. Same names as on Character. */
export const CharacterFields = z.object({
  name: z.string().min(1),
  description: z.string(),
  personality: z.string(),
  scenario: z.string(),
  firstMessages: z.array(z.string()),
  exampleMessages: z.string(),
  systemPrompt: z.string(),
  postHistoryInstructions: z.string(),
  creatorNotes: z.string(),
  tags: z.array(z.string()),
  characterNote: CharacterNote,
});

export const CharacterVariant = z.object({
  id: Id,
  /** Shown in pickers: "Modern AU", "Wounded", "Fantasy". */
  label: z.string().min(1),
  /** Only the fields that differ from the main version. */
  overrides: CharacterFields.partial().default({}),
  /** A variant may have its own picture (stored in the avatars table under this variant's id). */
  hasOwnAvatar: z.boolean().default(false),
});
export type CharacterVariant = z.infer<typeof CharacterVariant>;

export const Character = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().default(""),
  personality: z.string().default(""),
  scenario: z.string().default(""),
  firstMessages: z.array(z.string()).default([]),
  exampleMessages: z.string().default(""),
  /** Card-level system prompt / post-history instructions (SillyTavern card fields). */
  systemPrompt: z.string().default(""),
  postHistoryInstructions: z.string().default(""),
  /** Missing = the one in the imported card (`original`), if any. D-063. */
  characterNote: CharacterNote.optional(),
  creatorNotes: z.string().default(""),
  creator: z.string().default(""),
  characterVersion: z.string().default(""),
  tags: z.array(z.string()).default([]),
  /** The card holds several characters (or a whole cast): sent to the AI as usual, but trackers follow each of its
   * people by name instead of the card (D-065). Shared by all versions; missing = one character. */
  ensemble: z.boolean().optional(),
  /** Extra versions of this character, chosen per session. The fields above are the main version. */
  variants: z.array(CharacterVariant).default([]),
  /** Lorebooks that come with this character (SillyTavern: the card's linked world + its embedded book). */
  lorebookIds: z.array(Id).default([]),
  /** Regex scripts that come with it (SillyTavern: embedded scripts). Missing = the ones in `original`, if any. D-060. */
  regexScripts: z.array(RegexScript).optional(),
  /** The original imported file (e.g. a SillyTavern V2/V3 card), kept intact for lossless export. */
  original: Json.optional(),
});
export type Character = z.infer<typeof Character>;
/** What callers may pass in: optional card fields can be left out. */
export type CharacterInput = z.input<typeof Character>;

export const Avatar = z.object({
  mime: z.string().regex(/^image\//),
  base64: z.string().min(1),
});
export type Avatar = z.infer<typeof Avatar>;

export const PersonaFields = z.object({
  name: z.string().min(1),
  description: z.string(),
});

export const PersonaVariant = z.object({
  id: Id,
  label: z.string().min(1),
  overrides: PersonaFields.partial().default({}),
  hasOwnAvatar: z.boolean().default(false),
});
export type PersonaVariant = z.infer<typeof PersonaVariant>;

/** Where the persona description goes in the prompt (SillyTavern's persona positions). */
export const PersonaPlacement = z.object({
  position: z.enum(["inPrompt", "atDepth", "none"]).default("inPrompt"),
  depth: z.number().int().min(0).default(2),
  role: z.enum(["system", "user", "assistant"]).default("system"),
});

export const Persona = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().default(""),
  placement: PersonaPlacement.default({ position: "inPrompt", depth: 2, role: "system" }),
  variants: z.array(PersonaVariant).default([]),
  /** Lorebooks that come with this persona (SillyTavern: the persona's lorebook). */
  lorebookIds: z.array(Id).default([]),
  /** The original imported data (e.g. from SillyTavern), kept for lossless export. */
  original: Json.optional(),
});
export type Persona = z.infer<typeof Persona>;
export type PersonaInput = z.input<typeof Persona>;

// ---------------------------------------------------------------- history and trash (BLUEPRINT §2.6) — 2026-10-28, slice 1

/** Kinds of things that keep a history of saved versions. More kinds join as they get editors. */
export const HistoryKind = z.enum(["character", "persona", "preset", "lorebook", "narrator", "npc"]);
export type HistoryKind = z.infer<typeof HistoryKind>;

/** One saved version of a library item (the whole item, as it was saved). */
export const HistoryEntry = z.object({
  id: Id,
  kind: HistoryKind,
  itemId: Id,
  data: Json,
  createdAt: z.number().int(),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;

/** Kinds of things that go to the Trash instead of being deleted at once. */
export const TrashKind = z.enum(["session", "character", "persona", "preset", "lorebook", "story", "narrator", "npc", "kit"]);
export type TrashKind = z.infer<typeof TrashKind>;

export const TrashItem = z.object({
  kind: TrashKind,
  id: Id,
  name: z.string(),
  trashedAt: z.number().int(),
});
export type TrashItem = z.infer<typeof TrashItem>;

// ---------------------------------------------------------------- connection profiles (BLUEPRINT §2.1, §7.3) — 2026-10-28, slice 1b

/** How hard a thinking model thinks (sent as `reasoning: { effort }`, which OpenRouter and nano-gpt accept). */
export const ReasoningEffort = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
export type ReasoningEffort = z.infer<typeof ReasoningEffort>;

/**
 * A saved connection: which AI service, address and model, with its own settings. The API key is
 * NOT here: it lives in the Windows Credential Manager, one per provider + address (D-011).
 */
export const ConnectionProfile = z.object({
  id: Id,
  name: z.string().min(1),
  providerId: z.string().min(1),
  /** Empty = the provider's default address (OpenRouter for the OpenAI-compatible provider). */
  baseUrl: z.string().default(""),
  model: z.string().default(""),
  /** Missing value = the model's own default. */
  params: z.object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    maxTokens: z.number().int().positive().optional(),
    reasoningEffort: ReasoningEffort.optional(),
  }).default({}),
  limits: z.object({
    /** At most this many calls at the same time (agents run in parallel). */
    maxConcurrent: z.number().int().min(1).max(32).optional(),
    /** Wait at least this long between two calls. */
    minIntervalMs: z.number().int().min(0).max(600_000).optional(),
    /** When the service refuses for being busy (429, 5xx, "rate limit") before writing anything: try again this many times. */
    retries: z.number().int().min(0).max(8).optional(),
    /** Give up when nothing arrives for this long (seconds). Missing = wait as long as it takes. */
    timeoutSec: z.number().int().min(5).max(3600).optional(),
  }).default({}),
  /** Tried when this connection fails before writing anything. */
  fallbackId: Id.nullable().default(null),
  /** Extra fields added to every request body (for options the app has no control for yet). */
  extraBody: z.record(z.string(), Json).default({}),
  notes: z.string().default(""),
});
export type ConnectionProfile = z.infer<typeof ConnectionProfile>;
export type ConnectionProfileInput = z.input<typeof ConnectionProfile>;
