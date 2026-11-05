// Homunculus 2 — the Quick Reply sets and where they are on, shared by the chat, the Prompt tab and Library → Quick
// Replies (like prefs.ts: one object in app_settings, every screen sees changes at once). CLAUDE, 2026-11-04 (D-090).
import { useSyncExternalStore } from "react";
import type { QuickReplyData } from "@homunculus/schemas";
import { emptyQuickReplyData } from "@homunculus/core";

interface Store { getQuickReplies(): Promise<QuickReplyData>; setQuickReplies(data: QuickReplyData): Promise<QuickReplyData> }

let data: QuickReplyData = emptyQuickReplyData();
let store: Store | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export async function loadQuickReplies(s: Store): Promise<QuickReplyData> {
  store = s;
  data = await s.getQuickReplies().catch(() => emptyQuickReplyData());
  emit();
  return data;
}

/** Saves at once (the screen changes first; a failed save is reported by the caller). */
export async function saveQuickReplies(next: QuickReplyData): Promise<void> {
  data = next;
  emit();
  if (store) data = await store.setQuickReplies(next);
}

export const getQuickReplies = (): QuickReplyData => data;

export function useQuickReplies(): QuickReplyData {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => data, () => data);
}
