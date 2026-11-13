// Homunculus 2 — where the Assistant's chats are kept (app settings). CLAUDE, 2026-11-13 (D-122).
// Split out of engine.ts so the sidebar and the app's start don't load the whole Assistant (engine, tools, guides).
import { AssistantChat } from "@homunculus/schemas";
import type { SqlStore } from "@homunculus/core";
import { decodeHistory, encodeHistory } from "./history.ts";

export interface ChatRow { id: string; title: string; summary: string; updatedAt: number }

const INDEX_KEY = "assistant.chats";
export const chatKey = (id: string) => `assistant.chat:${id}`;

export async function listChats(store: SqlStore): Promise<ChatRow[]> {
  const v = await store.getAppSetting<ChatRow[]>(INDEX_KEY);
  return (Array.isArray(v) ? v : []).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function loadChat(store: SqlStore, id: string): Promise<AssistantChat | undefined> {
  const v = await store.getAppSetting(chatKey(id));
  return v ? decodeHistory(AssistantChat.parse(v)) : undefined;
}
export async function saveChat(store: SqlStore, chat: AssistantChat): Promise<void> {
  await store.setAppSetting(chatKey(chat.id), encodeHistory(chat));
  const rows = (await listChats(store)).filter((r) => r.id !== chat.id);
  await store.setAppSetting(INDEX_KEY, [{ id: chat.id, title: chat.title, summary: chat.summary, updatedAt: chat.updatedAt }, ...rows]);
}
export async function deleteChat(store: SqlStore, id: string): Promise<void> {
  await store.setAppSetting(chatKey(id), null);
  await store.setAppSetting(INDEX_KEY, (await listChats(store)).filter((r) => r.id !== id));
}

