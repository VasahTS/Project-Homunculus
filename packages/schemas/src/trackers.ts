// Homunculus 2 — tracker schemas: the fields a tracker fills and the Scene panel draws.
// BLUEPRINT §4.5. Author: CLAUDE, 2026-10-27; field sets, sections, columns, characters (D-017) same day.
import { z } from "zod";
import { Id } from "./common.ts";

export const FieldType = z.enum([
  "text", // free text
  "number", // e.g. coins
  "meter", // a bar between min and max, e.g. affection 0–100
  "status", // one of `options`, e.g. quest active / done / failed
  "list", // several items: plain (with an optional quantity) or, with `fields`, rows with columns (quests: title/status/note)
  "datetime", // in-story date and time
  "group", // a group of sub-fields
]);
export type FieldType = z.infer<typeof FieldType>;

/**
 * How the Scene panel shows a field (presentation only; the AI and the prompt don't see it). 2026-10-28 (D-024),
 * after Homunculus v1's character card: everything visible at once, each kind of value in its own shape.
 *  - auto:     by type (short values as tiles, text as a labelled block, lists as chips or rows)
 *  - header:   the panel's top strip (date, time, place, weather…) — global fields only
 *  - subtitle: the small line under a character's name (role)
 *  - lead:     plain text or chips at the top of the card, without a label (description, traits)
 *  - pill:     a rounded line with an icon (mood)
 *  - line:     a compact icon + text row (where, doing)
 *  - tile:     a small box with label and short value, three per line (age, height, level)
 *  - block:    a coloured label over the text (face, hair, outfit)
 *  - note:     italic text with an accent line, at the end (notes)
 */
export const FieldDisplay = z.enum(["auto", "header", "subtitle", "lead", "pill", "line", "tile", "block", "note"]);
export type FieldDisplay = z.infer<typeof FieldDisplay>;

export interface TrackerFieldShape {
  key: string;
  label: string;
  help: string;
  /** What the value means in the story, sent to the story AI with the values (e.g. "0 = exhausted"). */
  note?: string | undefined;
  type: FieldType;
  options: string[];
  min?: number | undefined;
  max?: number | undefined;
  scope: "global" | "perCharacter" | "perPair";
  lockedForAgents: boolean;
  toPrompt: boolean;
  required: boolean;
  section: string;
  fields: TrackerFieldShape[];
  display?: FieldDisplay | undefined;
  icon?: string | undefined;
  color?: string | undefined;
}

export const TrackerField: z.ZodType<TrackerFieldShape, any> = z.lazy(() =>
  z.object({
    /** Key inside the namespace, e.g. "coins". Letters, digits, _ and -. */
    key: z.string().regex(/^[A-Za-z][\w-]*$/),
    label: z.string().min(1),
    help: z.string().default(""),
    /**
     * What the value means in the story (Daniel, 30/10: "Stamina: 1" alone tells the story nothing). Sent to the
     * story's AI once, under the tracker's values, and to the tracker's AI with the field. Empty = nothing sent.
     */
    note: z.string().optional(),
    type: FieldType,
    /** For `status`. */
    options: z.array(z.string()).default([]),
    min: z.number().optional(),
    max: z.number().optional(),
    /** global: one value · perCharacter: one per cast member · perPair: one per pair (A→B). */
    scope: z.enum(["global", "perCharacter", "perPair"]).default("global"),
    /** Only the user may change it; the tracker reads it but never writes it. */
    lockedForAgents: z.boolean().default(false),
    /** Sent to the AI in the "current scene" block. */
    toPrompt: z.boolean().default(true),
    /** The AI fills it as soon as the thing it describes appears (e.g. a new character) and never leaves it empty. */
    required: z.boolean().default(false),
    /** Heading the field is shown under in the panel and the prompt ("Appearance"). Empty = no heading. Display only. */
    section: z.string().default(""),
    /** For `group`: its sub-fields. For `list`: the columns of each row (empty = plain items). */
    fields: z.array(TrackerField).default([]),
    /** Presentation in the Scene panel (see FieldDisplay). Missing = auto. */
    display: FieldDisplay.optional(),
    /** Name of a built-in icon shown with the value (Scene panel). */
    icon: z.string().optional(),
    /** Colour of the label (CSS colour). Missing = one made from the field's key. */
    color: z.string().optional(),
  }),
);
export type TrackerField = TrackerFieldShape;

/**
 * Who has a value in per-character / per-pair fields:
 *  - cast:        only the session's cast
 *  - castAndUser: the cast and the user's character
 *  - anyone:      the cast, the user, and any named character the tracker adds from the story (NPCs)
 */
export const TrackerCharacters = z.enum(["cast", "castAndUser", "anyone"]);
export type TrackerCharacters = z.infer<typeof TrackerCharacters>;

/**
 * A field set. A tracker can have several (e.g. "Standard", "Fantasy"); the session picks one
 * (SetupLayer.agentOverrides[trackerId].schemaId), else the tracker's default (AgentConfig.state.schemaId).
 */
export const TrackerSchema = z.object({
  id: Id,
  name: z.string().min(1),
  help: z.string().default(""),
  version: z.number().int().default(1),
  /** The tracker (agent id) this field set belongs to. */
  trackerId: Id.optional(),
  characters: TrackerCharacters.default("cast"),
  /**
   * Optional: the per-character field that says who is in the scene, and its "in the scene" value
   * (e.g. { field: "present", value: "here" }). Characters with another value are sent to the
   * story's prompt by name only (plus the other fields of that field's section), and the panel
   * lists them after the others.
   */
  presence: z.object({ field: z.string().min(1), value: z.string().min(1) }).optional(),
  fields: z.array(TrackerField).min(1),
});
export type TrackerSchema = z.infer<typeof TrackerSchema>;
export type TrackerSchemaInput = z.input<typeof TrackerSchema>;
