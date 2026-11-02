// Homunculus 2 — the user's choice of how messages look (Settings → Messages), shared by every screen. CLAUDE, 2026-11-01 (D-061).
import { useSyncExternalStore } from "react";
import { DEFAULT_LOOK, type MessageLook } from "./messageFormat.ts";

const KEY = "messages.look";
let look: MessageLook = DEFAULT_LOOK;
const listeners = new Set<() => void>();

// only what this module set is taken back, so a look's own --dialogue / --narration (D-075) survives
let mine: string[] = [];
function apply(l: MessageLook = look) {
  const root = document.documentElement.style;
  const want: Array<[string, string]> = [["--dialogue", l.dialogueColor], ["--narration", l.narrationColor]];
  for (const [name, value] of want) {
    if (value) root.setProperty(name, value);
    else if (mine.includes(name)) root.removeProperty(name);
  }
  mine = want.filter(([, v]) => !!v).map(([n]) => n);
}

interface Store { getAppSetting<T>(key: string): Promise<T | undefined>; setAppSetting(key: string, value: unknown): Promise<void> }
let store: Store | null = null;

/** Reads the saved choice once the database is open. */
export async function loadMessageLook(s: Store): Promise<void> {
  if (store === s) return;
  store = s;
  const saved = await s.getAppSetting<Partial<MessageLook>>(KEY).catch(() => undefined);
  look = { ...DEFAULT_LOOK, ...(saved ?? {}) };
  apply(look);
  listeners.forEach((f) => f());
}

export async function setMessageLook(patch: Partial<MessageLook>): Promise<void> {
  look = { ...look, ...patch };
  apply(look);
  listeners.forEach((f) => f());
  await store?.setAppSetting(KEY, look);
}

export function useMessageLook(): MessageLook {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => look, () => look);
}

/** Puts the user's message colors back over a look's (a look sets its own --dialogue / --narration). D-075. */
export const applyMessageLook = (): void => { if (typeof document !== "undefined") apply(look); };
