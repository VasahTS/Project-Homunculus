// Follow saved before/after snapshots, including an Undo and same-millisecond writes. Author: CODEX, 2026-11-03.
import type { MessageRevision } from "@homunculus/schemas";

export interface RewriteGroup { agentId: string; revisions: MessageRevision[]; current: boolean }

export function rewriteGroups(revisions: MessageRevision[], current: string): RewriteGroup[] {
  const pending = revisions.map((revision, index) => ({ revision, index }))
    .sort((a, b) => b.revision.createdAt - a.revision.createdAt || b.index - a.index).map((r) => r.revision);
  const chain: MessageRevision[] = [];
  let expected = current;
  let at = Infinity;
  while (pending.length) {
    const index = pending.findIndex((r) => r.createdAt <= at && r.after === expected);
    if (index < 0) break;
    const revision = pending.splice(index, 1)[0]!;
    at = revision.createdAt;
    // An exact restoration reconnects to that earlier version; a different manual edit ends the chain.
    if (revision.author.kind === "user") continue;
    chain.unshift(revision);
    expected = revision.before;
  }
  const groups = new Map<string, RewriteGroup>();
  for (const revision of chain) {
    if (revision.author.kind !== "agent") continue;
    const id = revision.author.agentId;
    const group = groups.get(id) ?? { agentId: id, revisions: [], current: false };
    group.revisions.push(revision);
    group.current = revision === chain.at(-1);
    groups.set(id, group);
  }
  return [...groups.values()];
}
