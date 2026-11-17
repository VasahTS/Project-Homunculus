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
  // A missing message (damaged save) is skipped: the rest of that branch and the whole chat still open. CLAUDE.
  return { ...chat, branches: chat.branches.map(p => !p.messageIds ? p : { ...p, messages: p.messageIds.flatMap(id => messages.get(id) ?? []) }) };
}
export function pathsOf(chat: AssistantChat) {
  const id = chat.activeBranchId ?? "main";
  const saved = chat.branches ?? [];
  const was = saved.find(p => p.id === id);
  const current = { id, name: was?.name ?? (id === "main" ? "Main" : "Branch"), ...(was?.group ? { group: was.group } : {}), messages: chat.messages, compact: chat.compact, guides: chat.guides };
  return was ? saved.map(p => p.id === id ? current : p) : [...saved, current];
}

// ---- D-144: versions and branches like the chat's (Play). A version (New Version, an edited message) is another path
// of the SAME branch; only Branch From Here makes a branch, and the branch list shows branches, not versions.
type Path = ReturnType<typeof pathsOf>[number];
/** The named branch a path belongs to. */
export const branchOf = (p: { id: string; group?: string | undefined }) => p.group ?? p.id;
/** The named branches (one entry per branch, whatever version it shows), in the order they were made. */
export function branchesOf(chat: AssistantChat): Array<{ id: string; name: string; current: boolean }> {
  const paths = pathsOf(chat), active = chat.activeBranchId ?? "main";
  const activePath = paths.find(p => p.id === active);
  const here = activePath ? branchOf(activePath) : active;
  return paths.filter(p => branchOf(p) === p.id || !paths.some(q => q.id === branchOf(p)))
    .filter((p, i, all) => all.findIndex(q => branchOf(q) === branchOf(p)) === i)
    .map(p => ({ id: branchOf(p), name: paths.find(q => q.id === branchOf(p))?.name ?? p.name, current: branchOf(p) === here }));
}
export function selectPath(chat: AssistantChat, id: string): AssistantChat {
  const paths = pathsOf(chat), path = paths.find(p => p.id === id);
  if (!path) return chat;
  return { ...chat, activeBranchId: id, branches: paths, messages: path.messages, compact: path.compact, guides: path.guides, lastPath: { ...(chat.lastPath ?? {}), [branchOf(path)]: id }, updatedAt: Date.now() };
}
/** Opens a named branch on the version it showed last. */
export function selectBranch(chat: AssistantChat, branchId: string): AssistantChat {
  const paths = pathsOf(chat);
  const last = chat.lastPath?.[branchId];
  const target = paths.find(p => p.id === last && branchOf(p) === branchId) ?? paths.find(p => p.id === branchId) ?? paths.find(p => branchOf(p) === branchId);
  return target ? selectPath(chat, target.id) : chat;
}
/** Branch From Here: a new named branch that keeps the conversation up to this message. */
export function forkAt(chat: AssistantChat, messageId: string, editedText?: string): AssistantChat {
  const at = chat.messages.findIndex(m => m.id === messageId); if (at < 0) return chat;
  const id = crypto.randomUUID(), paths = pathsOf(chat);
  const messages = chat.messages.slice(0, at + 1).map((m, i) => i === at && editedText !== undefined ? { ...m, id: crypto.randomUUID(), text: editedText } : m);
  const named = branchesOf(chat).length;
  return { ...chat, activeBranchId: id, branches: [...paths, { id, name: `Branch ${named + 1}`, messages, guides: [] }], messages, compact: undefined, guides: [], lastPath: { ...(chat.lastPath ?? {}), [id]: id }, updatedAt: Date.now() };
}
/**
 * A new version in the SAME branch: the conversation up to `messageId` (that message replaced by an edited copy when
 * `editedText` is given — the old one stays as a version of it, ‹ ›). The branch list does not grow.
 */
export function newVersion(chat: AssistantChat, messageId: string, editedText?: string): AssistantChat {
  const at = chat.messages.findIndex(m => m.id === messageId); if (at < 0) return chat;
  const paths = pathsOf(chat);
  const current: Path | undefined = paths.find(p => p.id === (chat.activeBranchId ?? "main"));
  const group = current ? branchOf(current) : chat.activeBranchId ?? "main";
  const id = crypto.randomUUID();
  const messages = chat.messages.slice(0, at + 1).map((m, i) => i === at && editedText !== undefined ? { ...m, id: crypto.randomUUID(), text: editedText } : m);
  const name = paths.find(p => p.id === group)?.name ?? current?.name ?? "Main";
  return { ...chat, activeBranchId: id, branches: [...paths, { id, name, group, messages, guides: [] }], messages, compact: undefined, guides: [], lastPath: { ...(chat.lastPath ?? {}), [group]: id }, updatedAt: Date.now() };
}
export function deleteMessage(chat: AssistantChat, id: string): AssistantChat {
  return { ...chat, messages: chat.messages.filter(m => m.id !== id), compact: undefined, guides: [], summary: "", updatedAt: Date.now() };
}
/** The versions of a message (an answer, or a message of the user's that was edited): the same message position after
 *  the same conversation, in every path; picking one opens its path. */
export function versionsOf(chat: AssistantChat, id: string): Array<{ pathId: string; message: AssistantMessage }> {
  const at = chat.messages.findIndex(m => m.id === id); if (at < 0) return [];
  const role = chat.messages[at]!.role;
  const prefix = chat.messages.slice(0, at).map(m => m.id).join("|");
  const seen = new Set<string>();
  return pathsOf(chat).flatMap(p => {
    const m = p.messages[at];
    if (!m || m.role !== role || seen.has(m.id) || p.messages.slice(0, at).map(m => m.id).join("|") !== prefix) return [];
    seen.add(m.id); return [{ pathId: p.id, message: m }];
  });
}
