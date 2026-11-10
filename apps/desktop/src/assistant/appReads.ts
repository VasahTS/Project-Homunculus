// Homunculus 2 — what the Assistant can read beyond the Library's writable kinds (D-110): chats (the branch on screen,
// paged, searchable), agents, regex scripts, Quick Reply sets and Directors. Daniel (translated): "add context for
// Stories, NPCs, regex, quick replies and Director… so the assistant consults and does it properly". Read-only: the
// Assistant never writes messages, and it edits these kinds in a later step (UI-PLAN "The Assistant, smarter", step 4).
// CLAUDE, 2026-11-10.
import type { Message, Session } from "@homunculus/schemas";
import { directorLinks, directorProfiles, newestLeaf, type SqlStore } from "@homunculus/core";
import { listAgents, whenText } from "../agents.ts";

type Obj = Record<string, unknown>;
const one = (s: string, n = 90) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export interface AppRow { id: string; name: string; line: string }

/** A link the app opens at that message number of the chat (on the branch on screen). Assistant replies use it. */
export const chatLink = (sessionId: string, n: number) => `https://open.homunculus.invalid/chat/${sessionId}/${n}`;
/** "https://open.homunculus.invalid/chat/<id>/<n>" → its parts (MessageText hands it to the app instead of a browser). */
export function parseChatLink(url: string): { sessionId: string; n: number | null } | null {
  const m = /^https:\/\/open\.homunculus\.invalid\/chat\/([^/?#]+)(?:\/(\d+))?/i.exec(url);
  return m ? { sessionId: decodeURIComponent(m[1]!), n: m[2] ? Number(m[2]) : null } : null;
}

async function names(store: SqlStore): Promise<{ character: Map<string, string>; story: Map<string, string> }> {
  return {
    character: new Map((await store.listCharacters()).map((c) => [c.id, c.name])),
    story: new Map((await store.stories.list()).map((s) => [s.id, s.name])),
  };
}
const fromOf = (s: Session, n: Awaited<ReturnType<typeof names>>) =>
  s.storyId ? `story “${n.story.get(s.storyId) ?? "?"}”` : `1:1 with ${n.character.get(s.cast[0]?.characterId ?? "") ?? "?"}`;

// ------------------------------------------------------------------ chats

export async function chatRows(store: SqlStore, query = ""): Promise<AppRow[]> {
  const sessions = await store.listSessions();
  const n = await names(store);
  let hits: Record<string, { count: number }> = {};
  if (query.trim()) hits = await store.searchMessages(sessions.map((s) => s.id), query.trim(), 1).catch(() => ({}));
  return sessions.map((s) => ({ id: s.id, name: s.title,
    line: `${fromOf(s, n)}${hits[s.id] ? ` · ${hits[s.id]!.count} message(s) match “${one(query, 30)}”` : ""}` }))
    .filter((r) => !query.trim() || hits[r.id] || `${r.name} ${r.line}`.toLowerCase().includes(query.trim().toLowerCase()));
}

/** Where the chat is now: the end of a named branch, or the newest message (what the chat shows when opened). */
async function endOf(store: SqlStore, sessionId: string, branch: string): Promise<{ end: string | null; name: string; count: number }> {
  const branches = await store.listBranches(sessionId);
  const named = branch.trim() ? branches.find((b) => b.name.toLowerCase() === branch.trim().toLowerCase()) : undefined;
  if (branch.trim() && !named) throw new Error(`No branch named “${branch}”. Branches: ${branches.map((b) => b.name).join(", ") || "main"}.`);
  if (named?.endMessageId) {
    const links = await store.messageLinks(sessionId);
    return { end: newestLeaf(links, named.endMessageId), name: named.name, count: branches.length };
  }
  const latest = await store.latestMessage(sessionId);
  const at = latest ? branches.find((b) => b.endMessageId === latest.id) : undefined;
  return { end: latest?.id ?? null, name: at?.name ?? "the newest", count: branches.length };
}

const PAGE_CHARS = 12_000;
const DEFAULT_LAST = 30;

/**
 * A chat's messages as "#N Speaker: text", numbered along the branch (as the chat numbers them). By default the last 30;
 * `from`/`to` pick a range; `search` lists the numbers whose text matches. Long pages stop early and say where to go on.
 */
export async function readChat(store: SqlStore, sessionId: string, opts: { from?: number; to?: number; search?: string; branch?: string } = {}): Promise<string> {
  const s = await store.getSession(sessionId);
  if (!s) throw new Error(`No chat with id ${sessionId}. Use find with kind "chat".`);
  const n = await names(store);
  const { end, name, count } = await endOf(store, sessionId, opts.branch ?? "");
  const path: Message[] = end ? await store.pathTo(end) : [];
  const who = (m: Message) => m.speaker.kind === "user" ? "User" : m.speaker.kind === "character" ? (n.character.get(m.speaker.characterId) ?? "Character")
    : m.speaker.kind === "narrator" ? "Narrator" : "System";
  const tag = (m: Message) => (m.kind === "ooc" ? " (OOC)" : m.kind === "event" ? " (event)" : m.kind === "direction" ? " (direction)" : "") + (m.visibility.ai === "none" ? " (hidden from the AI)" : "");
  const head = `chat:${s.id} “${s.title}” · ${fromOf(s, n)} · branch: ${name}${count > 1 ? ` (${count} branches)` : ""} · ${path.length} messages on it.\n`
    + `Cite a message as a Markdown link [#N](${chatLink(s.id, 0).replace(/0$/, "N")}) — the user can click it to open the chat there.`;
  if (!path.length) return `${head}\nNo messages yet.`;

  const q = (opts.search ?? "").trim().toLowerCase();
  if (q) {
    const found = path.map((m, i) => ({ m, i })).filter(({ m }) => m.content.toLowerCase().includes(q));
    if (!found.length) return `${head}\nNo message on this branch contains “${opts.search}”.`;
    const lines = found.slice(0, 25).map(({ m, i }) => {
      const k = m.content.toLowerCase().indexOf(q);
      return `#${i + 1} ${who(m)}: …${one(m.content.slice(Math.max(0, k - 60), k + q.length + 80), 160)}…`;
    });
    return `${head}\n${found.length} message(s) contain “${opts.search}”${found.length > 25 ? " (first 25)" : ""}. Read around one with from/to.\n${lines.join("\n")}`;
  }

  const total = path.length;
  let from = Math.max(1, Math.floor(opts.from ?? total - DEFAULT_LAST + 1));
  const to = Math.min(total, Math.floor(opts.to ?? total));
  if (from > to) from = to;
  const out: string[] = [];
  let used = 0;
  let last = from - 1;
  for (let i = from - 1; i < to; i++) {
    const m = path[i]!;
    const text = `#${i + 1} ${who(m)}${tag(m)}: ${m.content.trim()}`;
    if (used + text.length > PAGE_CHARS && out.length) break;
    out.push(text.length > PAGE_CHARS ? `${text.slice(0, PAGE_CHARS)}… (cut; ${text.length} chars)` : text);
    used += text.length;
    last = i + 1;
  }
  const more = last < to ? `\nStopped at #${last} to keep this short. Next: from=${last + 1}, to=${to}.` : "";
  const before = from > 1 ? `\nEarlier messages: #1–#${from - 1} (read them with from/to, or search).` : "";
  return `${head}\nMessages #${from}–#${last}:${before}\n\n${out.join("\n\n")}${more}`;
}

/** A chat number → the message id on the branch the chat shows (for links in replies). */
export async function messageAt(store: SqlStore, sessionId: string, n: number): Promise<string | null> {
  const { end } = await endOf(store, sessionId, "");
  if (!end) return null;
  const path = await store.pathTo(end);
  return path[Math.min(path.length, Math.max(1, n)) - 1]?.id ?? null;
}

// ------------------------------------------------------------------ agents, regex, quick replies, directors

export async function agentRows(store: SqlStore): Promise<AppRow[]> {
  return (await listAgents(store)).map((a) => ({ id: a.id, name: a.name, line: `${a.output} · ${whenText(a)}${a.help ? ` · ${one(a.help, 60)}` : ""}` }));
}
export async function regexRows(store: SqlStore): Promise<AppRow[]> {
  return (await store.getGlobalRegex()).map((r) => ({ id: r.id, name: r.name || "(unnamed)",
    line: `${r.on ? "" : "off · "}${r.targets.join(", ") || "no targets"}${r.displayOnly ? " · display only" : r.promptOnly ? " · prompt only" : ""} · find ${one(r.find, 50)}` }));
}
export async function quickReplyRows(store: SqlStore): Promise<AppRow[]> {
  const d = await store.getQuickReplies();
  return d.sets.map((x) => ({ id: x.id, name: x.name, line: `${x.replies.length} replies${d.global.some((l) => l.setId === x.id) ? " · on in every chat" : ""}${x.send ? "" : " · into the box"}` }));
}
export async function directorRows(store: SqlStore): Promise<AppRow[]> {
  const links = await directorLinks(store);
  return (await directorProfiles(store)).map((p) => ({ id: p.id, name: p.name,
    line: `${p.id === links.defaultId ? "default · " : ""}${p.weights.length} weights · notes at depth ${p.depth}${p.checkReplies ? " · checks replies" : ""}${p.autoEvery ? ` · asks itself every ${p.autoEvery}` : ""}` }));
}

export async function getAppItem(store: SqlStore, kind: "chat" | "agent" | "regex" | "quickreply" | "director", id: string): Promise<Obj | undefined> {
  switch (kind) {
    case "chat": { const s = await store.getSession(id); return s ? { id: s.id, title: s.title, storyId: s.storyId, userRole: s.userRole, cast: s.cast, npcIds: s.npcIds, scenario: s.scenario, setup: s.setup } : undefined; }
    case "agent": return (await listAgents(store)).find((a) => a.id === id) as unknown as Obj | undefined;
    case "regex": return (await store.getGlobalRegex()).find((r) => r.id === id) as unknown as Obj | undefined;
    case "quickreply": return (await store.getQuickReplies()).sets.find((x) => x.id === id) as unknown as Obj | undefined;
    case "director": return (await directorProfiles(store)).find((p) => p.id === id) as unknown as Obj | undefined;
  }
}
