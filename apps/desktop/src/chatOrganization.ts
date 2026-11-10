// Homunculus 2 — how the sidebar organizes chats: pinned chats and chat folders, for Play and for the Assistant (D-108).
// Daniel (translated): "a limit for the latest chats, with folders for these chats too, to organize" (Flint's sidebar).
// A folder is ONLY a sidebar grouping: a chat still lives on its character's sheet or its story's page. Stored as one
// object in app_settings; a chat id that no longer exists is simply not shown (a chat restored from the Trash comes back
// to its folder). CLAUDE, 2026-11-10.
import { useSyncExternalStore } from "react";

export type ChatScope = "play" | "assistant";
export interface ChatFolder { id: string; name: string; chatIds: string[] }
export interface ChatOrganization { pinned: string[]; folders: ChatFolder[]; folded: string[] }
type Saved = Record<ChatScope, ChatOrganization>;

export const EMPTY_ORGANIZATION: ChatOrganization = { pinned: [], folders: [], folded: [] };
const KEY = "sidebar.chats";
const strings = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((y): y is string => typeof y === "string" && y !== ""))] : []);

/** Only well-formed parts survive; a chat is in one folder at most, and a pinned chat in none. */
export function cleanOrganization(raw: unknown): ChatOrganization {
  if (!raw || typeof raw !== "object") return EMPTY_ORGANIZATION;
  const r = raw as Record<string, unknown>;
  const pinned = strings(r.pinned);
  const seen = new Set(pinned);
  const folders: ChatFolder[] = [];
  for (const f of Array.isArray(r.folders) ? r.folders : []) {
    if (!f || typeof f !== "object") continue;
    const x = f as Record<string, unknown>;
    if (typeof x.id !== "string" || !x.id || folders.some((y) => y.id === x.id)) continue;
    const chatIds = strings(x.chatIds).filter((id) => !seen.has(id));
    chatIds.forEach((id) => seen.add(id));
    folders.push({ id: x.id, name: typeof x.name === "string" && x.name.trim() ? x.name.trim() : "Folder", chatIds });
  }
  const folded = strings(r.folded).filter((id) => folders.some((f) => f.id === id));
  return { pinned, folders, folded };
}

// ---------------------------------------------------------------- pure changes (unit-tested)

const without = (o: ChatOrganization, chatId: string): ChatOrganization => ({
  ...o, pinned: o.pinned.filter((x) => x !== chatId), folders: o.folders.map((f) => ({ ...f, chatIds: f.chatIds.filter((x) => x !== chatId) })),
});
/** Pinning takes the chat out of its folder (it shows once, on top); unpinning puts it back in Recent. */
export const pinChat = (o: ChatOrganization, chatId: string, on: boolean): ChatOrganization =>
  on ? { ...without(o, chatId), pinned: [chatId, ...o.pinned.filter((x) => x !== chatId)] } : { ...o, pinned: o.pinned.filter((x) => x !== chatId) };
/** Into a folder (the newest first), or out of every folder with `folderId` null. */
export function moveChat(o: ChatOrganization, chatId: string, folderId: string | null): ChatOrganization {
  const base = without(o, chatId);
  if (!folderId || !base.folders.some((f) => f.id === folderId)) return base;
  return { ...base, folders: base.folders.map((f) => (f.id === folderId ? { ...f, chatIds: [chatId, ...f.chatIds] } : f)) };
}
export const addFolder = (o: ChatOrganization, id: string, name: string): ChatOrganization =>
  ({ ...o, folders: [...o.folders, { id, name: name.trim() || "New Folder", chatIds: [] }] });
export const renameFolder = (o: ChatOrganization, id: string, name: string): ChatOrganization =>
  ({ ...o, folders: o.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)) });
/** Deleting a folder deletes no chat: they go back to Recent. */
export const deleteFolder = (o: ChatOrganization, id: string): ChatOrganization =>
  ({ ...o, folders: o.folders.filter((f) => f.id !== id), folded: o.folded.filter((x) => x !== id) });
export const foldFolder = (o: ChatOrganization, id: string, folded: boolean): ChatOrganization =>
  ({ ...o, folded: folded ? [...new Set([...o.folded, id])] : o.folded.filter((x) => x !== id) });
export const folderOf = (o: ChatOrganization, chatId: string): ChatFolder | undefined => o.folders.find((f) => f.chatIds.includes(chatId));

/**
 * The sidebar's groups for the chats that exist now (in their own order, newest first): pinned, each folder, and the
 * rest (Recent). Ids of chats that are gone are left out.
 */
export function groupChats<T extends { id: string }>(o: ChatOrganization, chats: T[]): { pinned: T[]; folders: Array<{ folder: ChatFolder; chats: T[] }>; rest: T[] } {
  const pinnedSet = new Set(o.pinned);
  const inFolder = new Map<string, string>();
  for (const f of o.folders) for (const id of f.chatIds) if (!pinnedSet.has(id)) inFolder.set(id, f.id);
  return {
    pinned: chats.filter((c) => pinnedSet.has(c.id)),
    folders: o.folders.map((folder) => ({ folder, chats: chats.filter((c) => inFolder.get(c.id) === folder.id) })),
    rest: chats.filter((c) => !pinnedSet.has(c.id) && !inFolder.has(c.id)),
  };
}

// ---------------------------------------------------------------- the store

interface Store { getAppSetting<T>(key: string): Promise<T | undefined>; setAppSetting(key: string, value: unknown): Promise<void> }
let store: Store | null = null;
let saved: Saved = { play: EMPTY_ORGANIZATION, assistant: EMPTY_ORGANIZATION };
const listeners = new Set<() => void>();

export async function loadChatOrganization(s: Store): Promise<void> {
  if (store === s) return;
  store = s;
  const raw = (await s.getAppSetting<Partial<Saved>>(KEY).catch(() => undefined)) ?? {};
  saved = { play: cleanOrganization(raw.play), assistant: cleanOrganization(raw.assistant) };
  listeners.forEach((f) => f());
}

export function changeOrganization(scope: ChatScope, change: (o: ChatOrganization) => ChatOrganization): void {
  saved = { ...saved, [scope]: cleanOrganization(change(saved[scope])) };
  listeners.forEach((f) => f());
  void store?.setAppSetting(KEY, saved).catch(() => {});
}

export function useChatOrganization(scope: ChatScope): ChatOrganization {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => saved[scope], () => saved[scope]);
}

/** "5h", "2d", "3w" — how long ago, short enough for a one-line row. */
export function ago(at: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - at) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
