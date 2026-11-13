// Importing characters: one path for Library → Import (files) and the Card Browser (cards from sites). CLAUDE, 2026-11-02 (T-009, D-081).
import type { Avatar, Character } from "@homunculus/schemas";
import { embeddedBookOf, lorebookFromCardBook } from "@homunculus/st-lorebooks";
import { bytesToBase64, exportCardPng, importCardJson, parseCard, utf8 } from "@homunculus/st-cards";
import type { CardFile, CardItem } from "@homunculus/card-browser";
import type { AppServices } from "./core-instance.ts";

export const FROM_THE_WEB = "From the Web";
/** Where a card from a site goes: a folder, the "From the Web" folder (made the first time), or none. */
export type FolderChoice = { id: string } | "from-the-web" | null;
export interface ImportOptions { source?: Character["source"]; folder?: FolderChoice; importTags?: boolean }
export interface Imported { character: Character; warnings: string[] }

/** One file (PNG/JSON card, or anything a character importer reads). Same behaviour as Library → Import. Throws when it can't. */
export async function importCharacterFile(svc: Pick<AppServices, "core" | "store">, bytes: Uint8Array, fileName: string, opts: ImportOptions = {}): Promise<Imported[]> {
  const importer = svc.core.characterImporters.all().find((i) => i.extensions.some((ext) => fileName.toLowerCase().endsWith(ext)));
  if (!importer) throw new Error("this kind of file can't be imported.");
  const out: Imported[] = [];
  for (const r of await importer.import(bytes, fileName)) out.push(await saveImported(svc, r.character, r.avatar, r.warnings, opts));
  return out;
}

/**
 * Saves one imported card. D-125: everything it needs is read first (its folder, the books its card names as its world),
 * then the card, its picture, its embedded lorebook and its folder are written together in one transaction — one trip
 * to the database instead of about fourteen, and never half a card.
 */
async function saveImported(svc: Pick<AppServices, "store">, character: Imported["character"] | Record<string, unknown>, avatar: Avatar | undefined, warnings: string[], opts: ImportOptions): Promise<Imported> {
  const id = crypto.randomUUID();
  let c: Character = { ...(character as Character), id, ...(opts.importTags === false ? { tags: [] } : {}), ...(opts.source ? { source: opts.source } : {}) };
  // reads first, so the writes below go together
  const folderId = await resolveFolder(svc, opts.folder ?? null);
  const world = worldOf(c);
  const named = world ? await svc.store.lorebooksNamed(world) : [];
  // its embedded lorebook becomes a lorebook linked to it; books it names as its world get linked too
  const embedded = embeddedBookOf(c);
  const bookInput = embedded ? { id: crypto.randomUUID(), ...lorebookFromCardBook(embedded, `${c.name}'s lorebook`, id) } : undefined;
  c = { ...c, lorebookIds: [...new Set([...(c.lorebookIds ?? []), ...(bookInput ? [bookInput.id] : []), ...named.map((b) => b.id)])] };

  const { store, flush } = svc.store.batched();
  const saved = await store.saveCharacter(c, { isNew: true });
  if (avatar) await store.setAvatar(id, avatar);
  const book = bookInput ? await store.saveLorebook(bookInput, { isNew: true }) : undefined;
  if (folderId) await store.setFolder("character", id, folderId);
  await flush();

  const notes = [...warnings];
  if (book) notes.unshift(`${saved.name}: its embedded lorebook "${book.name}" (${book.entries.length} entries) was added to your lorebooks and is used with ${saved.name}.`);
  return { character: saved, warnings: notes };
}

/** The lorebook a card names as its world (SillyTavern's `data.extensions.world`). */
function worldOf(c: Character): string | undefined {
  const world = (c.original as { data?: { extensions?: { world?: unknown } } } | undefined)?.data?.extensions?.world;
  return typeof world === "string" && world.trim() ? world : undefined;
}

/** The folder id for a choice; "from-the-web" finds the top-level folder by name or makes it. */
export async function resolveFolder(svc: Pick<AppServices, "store">, choice: FolderChoice): Promise<string | null> {
  if (!choice) return null;
  if (choice !== "from-the-web") return choice.id;
  const found = (await svc.store.listFolders("character")).find((f) => f.parentId === null && f.name === FROM_THE_WEB);
  if (found) return found.id;
  return (await svc.store.saveFolder({ id: crypto.randomUUID(), kind: "character", name: FROM_THE_WEB, parentId: null, createdAt: Date.now() })).id;
}

/** A picture from a site as a PNG avatar (cards export cleanly as PNG). */
export type ToPng = (picture: { mime: string; bytes: Uint8Array }) => Promise<Avatar>;

/** A card from a site → saved in Characters, remembering where it came from. */
export async function importFromSite(svc: Pick<AppServices, "core" | "store">, file: CardFile, item: CardItem, opts: { folder: FolderChoice; importTags: boolean }, toPng: ToPng): Promise<Imported> {
  const source = { site: item.source, id: item.id, url: item.url, addedAt: Date.now() };
  if (file.kind === "png") {
    const [first] = await importCharacterFile(svc, file.bytes, `${item.name}.png`, { ...opts, source });
    if (!first) throw new Error("The card file had no character in it.");
    return first;
  }
  const r = importCardJson(utf8.encode(JSON.stringify(file.card)));
  const avatar = file.avatar ? await toPng(file.avatar).catch(() => undefined) : undefined;
  return saveImported(svc, r.character, avatar, r.warnings, { ...opts, source });
}

/** "site:id" → the character added from it (the newest when added more than once). */
export function siteIndex(characters: Character[]): Map<string, string> {
  const m = new Map<string, { id: string; at: number }>();
  for (const c of characters) {
    if (!c.source) continue;
    const k = `${c.source.site}:${c.source.id}`;
    if ((m.get(k)?.at ?? -1) < c.source.addedAt) m.set(k, { id: c.id, at: c.source.addedAt });
  }
  return new Map([...m].map(([k, v]) => [k, v.id]));
}

/** Save as PNG: the card as a file, nothing added to Characters. */
export async function cardPngForSite(file: CardFile, toPng: ToPng): Promise<Uint8Array> {
  if (file.kind === "png") return file.bytes;
  const parsed = parseCard(file.card);
  const avatar = file.avatar ? await toPng(file.avatar).catch(() => undefined) : undefined;
  return exportCardPng({ ...(parsed.character as Character), id: "export" }, avatar);
}

/** Any picture bytes → PNG, through the browser's canvas (same as choosing a picture by hand). */
export async function picturePng(picture: { mime: string; bytes: Uint8Array }): Promise<Avatar> {
  if (picture.mime === "image/png") return { mime: "image/png", base64: bytesToBase64(picture.bytes) };
  const { imageFileToPngAvatar } = await import("./files.ts");
  return imageFileToPngAvatar(new File([picture.bytes as BlobPart], "picture", { type: picture.mime }));
}
