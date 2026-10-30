// Homunculus 2 — a story's own version of a lorebook (D-049). Author: CLAUDE, 2026-10-30.
// Daniel: "the Lorebook Keeper kept changing my lorebook… I lost the original. Let the lorebook evolve in that story,
// as that story's version, and keep the original for the other stories." A story keeps only the differences
// (LorePatch); the Library's book is never written by a story.
import type { LoreEntry, Lorebook, LorePatch } from "@homunculus/schemas";

export const EMPTY_PATCH: LorePatch = { entries: {}, removed: [], meta: {} };

/** The book as this story sees it: changed entries in place, its new entries after the others, removed ones gone. */
export function applyLorePatch(book: Lorebook, patch: LorePatch | undefined): Lorebook {
  if (!patch || (!Object.keys(patch.entries).length && !patch.removed.length)) return book;
  const removed = new Set(patch.removed);
  const kept = book.entries.filter((e) => !removed.has(e.id)).map((e) => patch.entries[e.id] ?? e);
  const known = new Set(book.entries.map((e) => e.id));
  const added = Object.values(patch.entries).filter((e) => !known.has(e.id) && !removed.has(e.id));
  return { ...book, entries: [...kept, ...added] };
}

/** Same entry content, whatever the key order, ignoring its place on screen (displayIndex) and undefined values. */
const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== undefined && k !== "displayIndex").sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)])) : v;
const same = (a: LoreEntry, b: LoreEntry) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/**
 * The patch that turns `book` into `edited` (what the editor saved while showing the story's version). Entries equal to
 * the original are dropped from the patch, so changing something back resumes following the original.
 */
export function patchFrom(book: Lorebook, edited: Lorebook, previous: LorePatch | undefined, by: string, at: number, messageId?: string): LorePatch {
  const original = new Map(book.entries.map((e) => [e.id, e]));
  const entries: Record<string, LoreEntry> = {};
  const meta: LorePatch["meta"] = {};
  for (const e of edited.entries) {
    const o = original.get(e.id);
    if (o && same(o, e)) continue;
    entries[e.id] = e;
    const before = previous?.entries[e.id];
    meta[e.id] = before && same(before, e) && previous?.meta[e.id] ? previous.meta[e.id]! : { by, at, ...(messageId ? { messageId } : {}) };
  }
  const still = new Set(edited.entries.map((e) => e.id));
  const removed = book.entries.filter((e) => !still.has(e.id)).map((e) => e.id);
  for (const id of removed) meta[id] = previous?.removed.includes(id) && previous.meta[id] ? previous.meta[id]! : { by, at, ...(messageId ? { messageId } : {}) };
  return { entries, removed, meta };
}

/** Adds or replaces one entry in a story's version (an agent's proposal, D-049). */
export function patchWithEntry(patch: LorePatch | undefined, entry: LoreEntry, by: string, at: number, messageId?: string): LorePatch {
  const p = patch ?? EMPTY_PATCH;
  return {
    entries: { ...p.entries, [entry.id]: entry },
    removed: p.removed.filter((id) => id !== entry.id),
    meta: { ...p.meta, [entry.id]: { by, at, ...(messageId ? { messageId } : {}) } },
  };
}

export type LoreChange = "new" | "edited" | "removed";

/** What a story's version changes, entry by entry. */
export function loreChanges(book: Lorebook, patch: LorePatch | undefined): Map<string, LoreChange> {
  const out = new Map<string, LoreChange>();
  if (!patch) return out;
  const known = new Set(book.entries.map((e) => e.id));
  for (const id of Object.keys(patch.entries)) out.set(id, known.has(id) ? "edited" : "new");
  for (const id of patch.removed) out.set(id, "removed");
  return out;
}

/** Some of the changes put into the original book (the rest stay in the story). */
export function applyToOriginal(book: Lorebook, patch: LorePatch, ids: ReadonlySet<string>): { book: Lorebook; patch: LorePatch } {
  const part: LorePatch = {
    entries: Object.fromEntries(Object.entries(patch.entries).filter(([id]) => ids.has(id))),
    removed: patch.removed.filter((id) => ids.has(id)),
    meta: {},
  };
  const rest: LorePatch = {
    entries: Object.fromEntries(Object.entries(patch.entries).filter(([id]) => !ids.has(id))),
    removed: patch.removed.filter((id) => !ids.has(id)),
    meta: Object.fromEntries(Object.entries(patch.meta).filter(([id]) => !ids.has(id))),
  };
  return { book: applyLorePatch(book, part), patch: rest };
}
