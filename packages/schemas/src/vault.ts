// Homunculus 2 — the Vault: pieces of stories kept for reuse (narrators and NPCs; stories live in play.ts).
// Author: CLAUDE, 2026-10-29 (slice 4, D-029). Library = SillyTavern-format things and the engine (characters, personas,
// presets, lorebooks, trackers); Vault = story pieces made in Homunculus.
import { z } from "zod";
import { Id, Json } from "./common.ts";
import { NarratorFields } from "./play.ts";

/** A narrator kept in the Vault. Stories point to it (editing it reaches every story that uses it). */
export const Narrator = NarratorFields.extend({
  id: Id,
  /** Came with the app (the Simple Narrator): it can be edited and restored, not moved to the Trash. */
  builtin: z.boolean().default(false),
});
export type Narrator = z.infer<typeof Narrator>;
export type NarratorInput = z.input<typeof Narrator>;

/**
 * An NPC: a light sheet, not a full character card. Its fields are the ones of a Scene: Characters field set
 * (Fantasy, Standard…) minus the ones that change while playing ("Now"). The same NPC can be in several stories and
 * chats; `storyId` is the story whose folder it lives in (null = not in a story).
 */
export const Npc = z.object({
  id: Id,
  name: z.string().min(1),
  /** Folder in the Vault: the story it was made for. null = kept on its own. */
  storyId: Id.nullable().default(null),
  /** The tracker field set its sheet uses (a TrackerSchema id), e.g. "scene-characters-fantasy". */
  schemaId: Id.default("scene-characters"),
  /** Values by field key. Missing or empty = not set. */
  values: z.record(z.string(), Json).default({}),
  /** Notes for you (not sent to the AI). */
  notes: z.string().default(""),
});
export type Npc = z.infer<typeof Npc>;
export type NpcInput = z.input<typeof Npc>;

// ---------------------------------------------------------------- folders (round 3, D-036) — CLAUDE, 2026-10-29
// Daniel: "make everything able to use folders"; folders inside folders are allowed (a search over "All" finds everything).
/** What a folder holds. Each kind has its own tree. */
export const FolderKind = z.enum(["character", "npc", "narrator", "lorebook", "kit", "story"]);
export type FolderKind = z.infer<typeof FolderKind>;

/** A folder: a name in a tree (parentId null = at the top). Items point to it through the folder_items table. */
export const Folder = z.object({
  id: Id,
  kind: FolderKind,
  name: z.string().min(1),
  parentId: Id.nullable().default(null),
  createdAt: z.number().int().default(0),
});
export type Folder = z.infer<typeof Folder>;
export type FolderInput = z.input<typeof Folder>;
