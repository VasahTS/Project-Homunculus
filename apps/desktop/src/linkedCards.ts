// Homunculus 2 — linked folders: an external card source Homunculus reads but never writes (D-129). Author: CLAUDE, 2026-11-13.
// A friend (via Daniel): "allow an external card source, so I can link my ST lib, I have an external card management thing".
// Daniel's answers (11/13): linked cards appear in Characters with the others (a link mark, a folder named after the linked
// folder); editing one saves only in Homunculus, and if the file changes later the app asks which version to keep.
//
// A check lists the folder (size + date per file) and reads only new or changed files:
// - new card file → imported (Character.source = { site: "linked:<folder id>", id: <path in the folder> });
// - changed file, card not edited here → the card takes the file's version (the old one stays in History);
// - changed file, card edited here too → "changed in both": the user picks Keep Mine / Take the File's / Keep Both;
// - file gone → "file missing" (the card and its chats stay).
// The index (app setting `linkedIndex`) remembers each file's size, date, card and the card as it was last synced.
import type { Avatar, Character } from "@homunculus/schemas";
import type { AppServices } from "./core-instance.ts";
import { importCharacterFile } from "./importCharacters.ts";
import type { FolderSource, PickedFolder } from "./stFolder.ts";

export const LINKED_INDEX_KEY = "linkedIndex";
const CARD_FILE = /\.(png|json|charx)$/i;

export interface LinkedFile {
  size: number;
  modified: number;
  characterId?: string;
  /** The card as it was when it last matched the file (a fingerprint): differs from now = edited here. */
  synced?: string;
  /** A picture that is not a card (SillyTavern keeps sprites next to cards): not read again until it changes. */
  notCard?: boolean;
  missing?: boolean;
  /** The file changed while the card was edited here: waiting for the user's choice. The file's size/date are these. */
  conflict?: { size: number; modified: number };
  /** Added by the latest check. */
  isNew?: boolean;
}
export interface LinkedFolderIndex { folderItemId?: string; checkedAt: number; files: Record<string, LinkedFile> }
export type LinkedIndex = Record<string, LinkedFolderIndex>;

export type LinkedStatus = "linked" | "edited" | "conflict" | "missing" | "new";
export interface CheckResult { added: number; updated: number; conflicts: number; missing: number; errors: string[] }

type Svc = Pick<AppServices, "core" | "store">;

export const linkedSite = (folderId: string) => `linked:${folderId}`;
export const linkedFolderOf = (c: Pick<Character, "source">): string | null => (c.source?.site.startsWith("linked:") ? c.source.site.slice(7) : null);

/** A short fingerprint of what the user can edit (not links, not where it came from, not the raw card). */
export function fingerprint(c: Character): string {
  const { lorebookIds: _l, source: _s, original: _o, ...rest } = c as Character & Record<string, unknown>;
  const text = JSON.stringify(rest, Object.keys(rest).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${(h >>> 0).toString(16)}:${text.length}`;
}

export async function readIndex(store: Svc["store"]): Promise<LinkedIndex> {
  return (await store.getAppSetting<LinkedIndex>(LINKED_INDEX_KEY)) ?? {};
}
async function writeIndex(store: Svc["store"], index: LinkedIndex) { await store.setAppSetting(LINKED_INDEX_KEY, index); }

/** Desktop: the linked folders the native side remembers. */
export async function listLinkedFolders(): Promise<PickedFolder[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<PickedFolder[]>("folders_linked");
}

/** The folder in Characters named after the linked folder (made the first time). */
async function folderItem(store: Svc["store"], entry: LinkedFolderIndex, name: string): Promise<string> {
  const have = entry.folderItemId ? (await store.listFolders("character")).find((f) => f.id === entry.folderItemId) : undefined;
  if (have) return have.id;
  const made = await store.saveFolder({ id: crypto.randomUUID(), kind: "character", name, parentId: null, createdAt: Date.now() });
  entry.folderItemId = made.id;
  return made.id;
}

/** The card in a file, without saving it. */
async function parseFile(svc: Svc, bytes: Uint8Array, path: string): Promise<{ character: Character; avatar?: Avatar } | null> {
  const name = path.split("/").pop() ?? path;
  const importer = svc.core.characterImporters.all().find((i) => i.extensions.some((ext) => name.toLowerCase().endsWith(ext)));
  if (!importer) return null;
  try {
    const [r] = await importer.import(bytes, name);
    return r ? { character: r.character as Character, ...(r.avatar ? { avatar: r.avatar } : {}) } : null;
  } catch { return null; }
}

/** Puts the file's version into the card (same id, its links and folder kept). */
async function takeFile(svc: Svc, current: Character, parsed: { character: Character; avatar?: Avatar }): Promise<Character> {
  const next = await svc.store.saveCharacter({ ...parsed.character, id: current.id, lorebookIds: current.lorebookIds, ...(current.source ? { source: current.source } : {}) });
  if (parsed.avatar) await svc.store.setAvatar(current.id, parsed.avatar);
  return next;
}

/** Checks one linked folder. Only new or changed files are read. */
export async function checkLinkedFolder(svc: Svc, folder: Pick<PickedFolder, "id" | "name">, src: FolderSource, onProgress?: (done: number, total: number) => void): Promise<CheckResult> {
  const store = svc.store;
  const index = await readIndex(store);
  const entry: LinkedFolderIndex = index[folder.id] ?? { checkedAt: 0, files: {} };
  const result: CheckResult = { added: 0, updated: 0, conflicts: 0, missing: 0, errors: [] };
  const listing = (await src.list("", true)).filter((e) => !e.dir && CARD_FILE.test(e.path));
  const seen = new Set(listing.map((e) => e.path));
  for (const f of Object.values(entry.files)) delete f.isNew;

  const work = listing.filter((e) => {
    const k = entry.files[e.path];
    return !k || k.missing || (k.size !== e.size || k.modified !== e.modified) && !(k.conflict && k.conflict.size === e.size && k.conflict.modified === e.modified);
  });
  for (const [i, e] of work.entries()) {
    onProgress?.(i, work.length);
    const known = entry.files[e.path];
    try {
      const current = known?.characterId ? await store.getCharacter(known.characterId) : undefined;
      if (known?.characterId && !current) {
        // the user deleted the card: leave the file alone until it changes again
        entry.files[e.path] = { size: e.size, modified: e.modified };
        continue;
      }
      if (known?.missing && current && known.size === e.size && known.modified === e.modified) {
        entry.files[e.path] = { ...known, missing: false };
        continue;
      }
      const bytes = await src.read(e.path);
      if (!current) {
        const parsed = await parseFile(svc, bytes, e.path);
        if (!parsed) { entry.files[e.path] = { size: e.size, modified: e.modified, notCard: true }; continue; }
        const into = await folderItem(store, entry, folder.name);
        const [r] = await importCharacterFile(svc, bytes, e.path.split("/").pop()!, {
          source: { site: linkedSite(folder.id), id: e.path, url: e.path, addedAt: Date.now() }, folder: { id: into },
        });
        if (!r) continue;
        entry.files[e.path] = { size: e.size, modified: e.modified, characterId: r.character.id, synced: fingerprint(r.character), isNew: true };
        result.added++;
        continue;
      }
      const parsed = await parseFile(svc, bytes, e.path);
      if (!parsed) { result.errors.push(`${e.path}: no longer a card`); entry.files[e.path] = { ...known!, size: e.size, modified: e.modified }; continue; }
      if (fingerprint(current) === known!.synced) {
        const next = await takeFile(svc, current, parsed);
        entry.files[e.path] = { size: e.size, modified: e.modified, characterId: current.id, synced: fingerprint(next) };
        result.updated++;
      } else {
        entry.files[e.path] = { ...known!, missing: false, conflict: { size: e.size, modified: e.modified } };
        result.conflicts++;
      }
    } catch (err) { result.errors.push(`${e.path}: ${err instanceof Error ? err.message : String(err)}`); }
  }
  for (const [path, f] of Object.entries(entry.files)) {
    if (!seen.has(path) && f.characterId && !f.missing) { f.missing = true; result.missing++; }
    if (!seen.has(path) && !f.characterId) delete entry.files[path];
  }
  entry.checkedAt = Date.now();
  index[folder.id] = entry;
  await writeIndex(store, index);
  onProgress?.(work.length, work.length);
  return result;
}

/** Each linked card's state, for the marks in Characters. */
export function linkedStatuses(index: LinkedIndex, characters: Character[]): Map<string, LinkedStatus> {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const out = new Map<string, LinkedStatus>();
  for (const entry of Object.values(index)) {
    for (const f of Object.values(entry.files)) {
      if (!f.characterId) continue;
      const c = byId.get(f.characterId);
      if (!c) continue;
      out.set(c.id, f.conflict ? "conflict" : f.missing ? "missing" : fingerprint(c) !== f.synced ? "edited" : f.isNew ? "new" : "linked");
    }
  }
  return out;
}

/** Where a linked card's file is: its folder id and path. */
export function fileOf(index: LinkedIndex, characterId: string): { folderId: string; path: string; file: LinkedFile } | null {
  for (const [folderId, entry] of Object.entries(index)) {
    for (const [path, file] of Object.entries(entry.files)) if (file.characterId === characterId) return { folderId, path, file };
  }
  return null;
}

/** For "changed in both": the card here and the file's card, without saving anything. */
export async function compareLinked(svc: Svc, src: FolderSource, path: string): Promise<{ file: Character } | null> {
  const parsed = await parseFile(svc, await src.read(path), path);
  return parsed ? { file: parsed.character } : null;
}

export type ConflictChoice = "mine" | "file" | "both";

/** The user's choice for a card changed in both places. Keep Both: your version becomes a separate card of your own. */
export async function resolveLinked(svc: Svc, src: FolderSource, characterId: string, choice: ConflictChoice): Promise<void> {
  const store = svc.store;
  const index = await readIndex(store);
  const where = fileOf(index, characterId);
  const current = await store.getCharacter(characterId);
  if (!where || !current || !where.file.conflict) return;
  const at = where.file.conflict;
  if (choice === "mine") {
    index[where.folderId]!.files[where.path] = { ...where.file, ...at, conflict: undefined, synced: fingerprint(current) } as LinkedFile;
  } else {
    const parsed = await parseFile(svc, await src.read(where.path), where.path);
    if (!parsed) throw new Error("The file is no longer a card.");
    if (choice === "both") {
      const { source: _s, ...mine } = current;
      const copy = await store.saveCharacter({ ...mine, id: crypto.randomUUID() }, { isNew: true });
      const pic = await store.getAvatar(characterId);
      if (pic) await store.setAvatar(copy.id, pic);
    }
    const next = await takeFile(svc, current, parsed);
    index[where.folderId]!.files[where.path] = { size: at.size, modified: at.modified, characterId, synced: fingerprint(next) };
  }
  await writeIndex(store, index);
}

/** A card whose file is missing becomes a card of your own (no longer linked). */
export async function keepAsOwn(svc: Svc, characterId: string): Promise<void> {
  const store = svc.store;
  const c = await store.getCharacter(characterId);
  if (!c) return;
  const { source: _s, ...rest } = c;
  await store.saveCharacter(rest);
  const index = await readIndex(store);
  const where = fileOf(index, characterId);
  if (where) { delete index[where.folderId]!.files[where.path]; await writeIndex(store, index); }
}

/** Stop linking a folder: its cards stay as your own (or go to the Trash). Nothing is deleted from the folder. */
export async function unlinkFolder(svc: Svc, folderId: string, cards: "keep" | "trash"): Promise<{ kept: number; trashed: number; failed: string[] }> {
  const store = svc.store;
  const index = await readIndex(store);
  const entry = index[folderId];
  const out = { kept: 0, trashed: 0, failed: [] as string[] };
  for (const f of Object.values(entry?.files ?? {})) {
    if (!f.characterId) continue;
    const c = await store.getCharacter(f.characterId);
    if (!c) continue;
    if (cards === "trash") {
      try { await store.moveToTrash("character", c.id); out.trashed++; continue; }
      catch { out.failed.push(c.name); }
    }
    const { source: _s, ...rest } = c;
    await store.saveCharacter(rest);
    out.kept++;
  }
  delete index[folderId];
  await writeIndex(store, index);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("folder_unlink", { id: folderId });
  } catch { /* browser preview: nothing native to forget */ }
  return out;
}
