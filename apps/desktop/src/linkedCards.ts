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
//
// D-137 (Daniel: "make the library link read-only and import only what you are going to use"): each folder has a mode.
// "use" (the default for folders linked from now on): a check only reads each new or changed file's name, creator, tags,
// an excerpt and a small picture into the index; the card shows in Characters as "In folder" (a shelf entry, `shelf:` id)
// and comes in (`useLinkedCard`) the first time it is used — a chat, a story, Edit, Add to Library. "all": the D-129
// behaviour, every card copied. Folders linked before D-137 have no mode and count as "all".
import { Character as CharacterSchema, type Avatar, type Character } from "@homunculus/schemas";
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
  /** D-137 ("use" mode): what Characters shows of a card that is not in the library yet. */
  card?: LinkedCardInfo;
}
export interface LinkedCardInfo { name: string; creator: string; tags: string[]; excerpt: string; tokens: number; greetings: number; book: boolean }
export type LinkedMode = "use" | "all";
export interface LinkedFolderIndex { folderItemId?: string; checkedAt: number; files: Record<string, LinkedFile>; mode?: LinkedMode }

/** A folder's mode: folders linked before D-137 copied every card. */
export const modeOf = (entry: LinkedFolderIndex | undefined): LinkedMode => entry ? entry.mode ?? "all" : "use";
/** The id a shelf entry (a card in a linked folder, not in the library) has in Characters. */
export const shelfId = (folderId: string, path: string) => `shelf:${folderId}:${path}`;
export const isShelfId = (id: string | null | undefined): boolean => !!id && id.startsWith("shelf:");
export function parseShelfId(id: string): { folderId: string; path: string } | null {
  if (!isShelfId(id)) return null;
  const rest = id.slice(6);
  const at = rest.indexOf(":");
  return at < 0 ? null : { folderId: rest.slice(0, at), path: rest.slice(at + 1) };
}
/** Where a shelf entry's small picture is kept (the pictures table, so previews and addresses work as for cards). */
export const shelfPictureKey = shelfId;

/** What Characters shows of a card before it comes in. */
function infoOf(c: Character): LinkedCardInfo {
  const text = [c.description, c.personality, c.scenario, ...c.firstMessages.slice(0, 1), c.exampleMessages].join("\n");
  const embedded = (c.original as { data?: { character_book?: unknown } } | undefined)?.data?.character_book;
  return { name: c.name, creator: c.creator ?? "", tags: c.tags ?? [], excerpt: (c.scenario.trim() || c.description.trim()).slice(0, 300),
    tokens: Math.ceil(text.length / 3.6), greetings: c.firstMessages.length, book: !!embedded };
}

/** Sets a folder's mode (D-137). Switching to "use" can turn copies nobody used back into shelf entries. */
export async function setLinkedMode(svc: Svc, folderId: string, mode: LinkedMode, opts: { removeUnused?: boolean } = {}): Promise<{ removed: number }> {
  const store = svc.store;
  const index = await readIndex(store);
  const entry = index[folderId] ?? { checkedAt: 0, files: {} };
  entry.mode = mode;
  let removed = 0;
  if (mode === "use" && opts.removeUnused) {
    for (const [path, f] of Object.entries(entry.files)) {
      if (!f.characterId) continue;
      const c = await store.getCharacter(f.characterId);
      if (!c) continue;
      if (!(await unusedCopy(store, c, f))) continue;
      const pic = await store.getAvatar(c.id);
      await store.deleteCharacter(c.id);
      if (pic) await store.setAvatar(shelfPictureKey(folderId, path), pic);
      entry.files[path] = { size: f.size, modified: f.modified, card: infoOf(c) };
      removed++;
    }
  }
  index[folderId] = entry;
  await writeIndex(store, index);
  return { removed };
}

/** A copy nobody used: no chats (any, Trash included), no story or Kit, not edited here, nothing waiting. */
async function unusedCopy(store: Svc["store"], c: Character, f: LinkedFile): Promise<boolean> {
  if (f.conflict || fingerprint(c) !== f.synced) return false;
  if ((await store.sessionsUsingCharacter(c.id, true)).length) return false;
  if ((await store.storiesUsingCharacter(c.id)).length) return false;
  const kits = await store.kits.list();
  if (kits.some((k) => (k.narrator?.kind === "card" && k.narrator.characterId === c.id) || (k.cast ?? []).some((m) => m.characterId === c.id))) return false;
  return true;
}

/** How many copies of a folder nobody used (for the switch window). */
export async function countUnused(svc: Svc, folderId: string): Promise<{ used: number; unused: number }> {
  const entry = (await readIndex(svc.store))[folderId];
  let used = 0, unused = 0;
  for (const f of Object.values(entry?.files ?? {})) {
    if (!f.characterId) continue;
    const c = await svc.store.getCharacter(f.characterId);
    if (!c) continue;
    if (await unusedCopy(svc.store, c, f)) unused++; else used++;
  }
  return { used, unused };
}

/** Shelf entries (cards in "use" folders not in the library) as cards for the lists: name, creator, tags, an excerpt. */
export function shelfCards(index: LinkedIndex): Array<Character & { shelf: { folderId: string; path: string; tokens: number; greetings: number; book: boolean } }> {
  const out: Array<Character & { shelf: { folderId: string; path: string; tokens: number; greetings: number; book: boolean } }> = [];
  for (const [folderId, entry] of Object.entries(index)) {
    for (const [path, f] of Object.entries(entry.files)) {
      if (f.characterId || !f.card || f.notCard) continue;
      const c = CharacterSchema.parse({ id: shelfId(folderId, path), name: f.card.name || path, creator: f.card.creator, tags: f.card.tags, description: f.card.excerpt,
        source: { site: linkedSite(folderId), id: path, url: path, addedAt: 0 } });
      out.push(Object.assign(c, { shelf: { folderId, path, tokens: f.card.tokens, greetings: f.card.greetings, book: f.card.book } }));
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** A shelf entry's whole card, read from its file (its sheet; nothing is saved). */
export async function readShelfCard(svc: Svc, src: FolderSource, path: string): Promise<{ character: Character; avatar?: Avatar } | null> {
  return parseFile(svc, await src.read(path), path);
}

/**
 * Brings a shelf entry into the library (D-137): the same import as a card file, linked to its file as a "linked" card
 * from now on. Returns the card's id (also when it came in earlier).
 */
export async function useLinkedCard(svc: Svc, folder: Pick<PickedFolder, "id" | "name">, src: FolderSource, path: string): Promise<string> {
  const store = svc.store;
  const index = await readIndex(store);
  const entry = index[folder.id];
  const f = entry?.files[path];
  if (!entry || !f) throw new Error("That card is no longer in the linked folder.");
  if (f.characterId && await store.getCharacter(f.characterId)) return f.characterId;
  const bytes = await src.read(path);
  const into = await folderItem(store, entry, folder.name);
  const [r] = await importCharacterFile(svc, bytes, path.split("/").pop()!, {
    source: { site: linkedSite(folder.id), id: path, url: path, addedAt: Date.now() }, folder: { id: into },
  });
  if (!r) throw new Error("The file is no longer a card.");
  entry.files[path] = { size: f.size, modified: f.modified, characterId: r.character.id, synced: fingerprint(r.character) };
  await store.setAvatar(shelfPictureKey(folder.id, path), null).catch(() => {});
  await writeIndex(store, index);
  return r.character.id;
}
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
export async function checkLinkedFolder(svc: Svc, folder: Pick<PickedFolder, "id" | "name">, src: FolderSource, onProgress?: (done: number, total: number) => void,
  shrink?: (a: Avatar) => Promise<Avatar | null>): Promise<CheckResult> {
  const store = svc.store;
  const index = await readIndex(store);
  const entry: LinkedFolderIndex = index[folder.id] ?? { checkedAt: 0, files: {}, mode: "use" };
  const mode = modeOf(entry);
  if (mode === "use") await folderItem(store, entry, folder.name);
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
        if (mode === "use") {
          // D-137: only what Characters shows, and a small picture; the card comes in when used
          const small = parsed.avatar ? (shrink ? await shrink(parsed.avatar).catch(() => null) : null) : null;
          await store.setAvatar(shelfPictureKey(folder.id, e.path), small);
          entry.files[e.path] = { size: e.size, modified: e.modified, card: infoOf(parsed.character), isNew: !known };
          if (!known) result.added++; else result.updated++;
          continue;
        }
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
    if (!seen.has(path) && !f.characterId) {
      if (f.card) await store.setAvatar(shelfPictureKey(folder.id, path), null).catch(() => {});
      delete entry.files[path];
    }
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
  for (const [path, f] of Object.entries(entry?.files ?? {})) {
    if (f.card && !f.characterId) await store.setAvatar(shelfPictureKey(folderId, path), null).catch(() => {}); // D-137: shelf pictures go
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
