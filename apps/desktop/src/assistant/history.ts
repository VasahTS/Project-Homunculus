// Assistant paths preserve full answers without replaying Library effects. CODEX, 2026-11-03.
import type { AssistantChat, AssistantMessage } from "@homunculus/schemas";
/** Compact shared prefixes on disk, including large attachment payloads. */
export function encodeHistory(chat: AssistantChat): AssistantChat {
  if (!chat.branches?.length) return chat;
  const messages = new Map(chat.messages.map(m => [m.id, m]));
  const active = new Set(messages.keys());
  const branches = pathsOf(chat).map(p => {
    for (const m of p.messages) if (!messages.has(m.id)) messages.set(m.id, m);
    return { ...p, messageIds: p.messages.map(m => m.id), messages: [] };
  });
  return { ...chat, branches, historyMessages: [...messages.values()].filter(m => !active.has(m.id)) };
}
export function decodeHistory(chat: AssistantChat): AssistantChat {
  if (!chat.branches?.some(p => p.messageIds)) return chat;
  const messages = new Map([...(chat.historyMessages ?? []), ...chat.messages].map(m => [m.id, m]));
  return { ...chat, branches: chat.branches.map(p => !p.messageIds ? p : { ...p, messages: p.messageIds.map(id => {
    const m = messages.get(id); if (!m) throw new Error("A saved conversation branch has a missing message."); return m;
  }) }) };
}
export function pathsOf(chat: AssistantChat) {
  const id = chat.activeBranchId ?? "main";
  const saved = chat.branches ?? [];
  const current = { id, name: saved.find(p => p.id === id)?.name ?? (id === "main" ? "Main" : "Branch"), messages: chat.messages, compact: chat.compact, guides: chat.guides };
  return saved.some(p => p.id === id) ? saved.map(p => p.id === id ? current : p) : [...saved, current];
}
export function selectPath(chat: AssistantChat, id: string): AssistantChat {
  const paths = pathsOf(chat), path = paths.find(p => p.id === id);
  if (!path) return chat;
  return { ...chat, activeBranchId: id, branches: paths, messages: path.messages, compact: path.compact, guides: path.guides, updatedAt: Date.now() };
}
export function forkAt(chat: AssistantChat, messageId: string, editedText?: string): AssistantChat {
  const at = chat.messages.findIndex(m => m.id === messageId); if (at < 0) return chat;
  const id = crypto.randomUUID(), paths = pathsOf(chat);
  const messages = chat.messages.slice(0, at + 1).map((m, i) => i === at && editedText !== undefined ? { ...m, id: crypto.randomUUID(), text: editedText } : m);
  return { ...chat, activeBranchId: id, branches: [...paths, { id, name: `Branch ${paths.length + 1}`, messages, guides: [] }], messages, compact: undefined, guides: [], updatedAt: Date.now() };
}
export function deleteMessage(chat: AssistantChat, id: string): AssistantChat {
  return { ...chat, messages: chat.messages.filter(m => m.id !== id), compact: undefined, guides: [], summary: "", updatedAt: Date.now() };
}
export function versionsOf(chat: AssistantChat, id: string): Array<{ pathId: string; message: AssistantMessage }> {
  const at = chat.messages.findIndex(m => m.id === id); if (at < 0) return [];
  const prefix = chat.messages.slice(0, at).map(m => m.id).join("|");
  const seen = new Set<string>();
  return pathsOf(chat).flatMap(p => {
    const m = p.messages[at];
    if (!m || m.role !== "assistant" || seen.has(m.id) || p.messages.slice(0, at).map(m => m.id).join("|") !== prefix) return [];
    seen.add(m.id); return [{ pathId: p.id, message: m }];
  });
}
