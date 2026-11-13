// Homunculus 2 — module: SillyTavern chats (.jsonl) into the message tree. Author: CLAUDE, 2026-11-13 (D-126).
//
// A SillyTavern chat file is one JSON object per line: a header (`user_name`, `character_name`, `create_date`,
// `chat_metadata`), then one line per message (`name`, `is_user`, `is_system`, `send_date`, `mes`, `swipes`, `swipe_id`,
// `swipe_info`, `extra`, and in group chats `original_avatar`). Here:
// - swipes become sibling replies (the one SillyTavern showed is on the path shown);
// - `is_system` (hidden in ST) is kept but never sent to the AI;
// - ST branches and checkpoints are separate files that copy the start of their main chat (`chat_metadata.main_chat`):
//   they are merged into the main chat's tree, so the shared start is stored once and each file becomes a branch;
// - the chat's Author's Note, lorebook and locked persona are read from `chat_metadata` (the caller turns names into ids).
// Pure: no database. `saveStChat` writes a built chat in one batch (D-125).
import type { AuthorsNote, BranchInput, MessageInput, SessionInput, Speaker } from "@homunculus/schemas";
import type { SqlStore } from "@homunculus/core";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export interface StChatLine {
  name: string;
  isUser: boolean;
  /** Hidden in SillyTavern (the eye icon / `/hide`): kept, never sent to the AI. */
  isSystem: boolean;
  /** ST's `extra.type === "narrator"` (`/sys` messages): written by no character. */
  isNarrator: boolean;
  sendDate: number;
  text: string;
  reasoning?: string;
  /** The card file a group message came from (`original_avatar`), when SillyTavern wrote it. */
  avatar?: string;
  swipes: Array<{ text: string; sendDate: number; reasoning?: string }>;
  /** Which swipe SillyTavern showed (its text is `text`). */
  swipeId: number;
  model?: string;
}

export interface StChatHeader {
  userName: string;
  characterName: string;
  createdAt: number;
  metadata: Obj;
}

export interface ParsedStChat {
  /** The file name without `.jsonl` (SillyTavern names chats by file). */
  name: string;
  header: StChatHeader;
  lines: StChatLine[];
  /** The chat this one was branched from (`chat_metadata.main_chat`), when it is a branch or a checkpoint. */
  mainChat?: string;
  warnings: string[];
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * SillyTavern's dates, in every shape it has written over the years: epoch ms, ISO, "2024-1-5@12h30m10s" (with or without
 * spaces and "123ms"), and the old humanized "June 1, 2023 5:32pm". Unreadable → `fallback`.
 */
export function stDate(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e11 ? Math.round(v * 1000) : Math.round(v);
  const s = str(v).trim();
  if (!s) return fallback;
  if (/^\d{10,13}$/.test(s)) return stDate(Number(s), fallback);
  const st = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s(?:\s*(\d{1,3})ms)?$/);
  if (st) {
    const [, y, mo, d, h, mi, se, ms] = st.map(Number) as number[];
    return new Date(y!, mo! - 1, d!, h!, mi!, se!, Number.isFinite(ms) ? ms! : 0).getTime();
  }
  const human = s.match(/^([a-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (human) {
    const month = MONTHS.indexOf(human[1]!.toLowerCase());
    if (month >= 0) {
      let hour = Number(human[4]) % 12;
      if (human[6]!.toLowerCase() === "pm") hour += 12;
      return new Date(Number(human[3]), month, Number(human[2]), hour, Number(human[5])).getTime();
    }
  }
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Reads one SillyTavern chat file. Broken lines are skipped with a warning; a file with no header still reads. */
export function parseStChat(text: string, fileName: string): ParsedStChat {
  const name = fileName.replace(/^.*[\\/]/, "").replace(/\.jsonl$/i, "");
  const warnings: string[] = [];
  const rows: Obj[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const v = JSON.parse(line);
      if (isObj(v)) rows.push(v); else warnings.push(`line ${i + 1}: not an object`);
    } catch {
      warnings.push(`line ${i + 1}: not valid JSON`);
    }
  });
  const first = rows[0];
  const hasHeader = !!first && ("chat_metadata" in first || ("user_name" in first && !("mes" in first)));
  const head = hasHeader ? rows.shift()! : {};
  const metadata = isObj(head.chat_metadata) ? head.chat_metadata : {};
  const header: StChatHeader = {
    userName: str(head.user_name) || "User",
    characterName: str(head.character_name),
    createdAt: stDate(head.create_date, 0),
    metadata,
  };
  let clock = header.createdAt || 0;
  const lines: StChatLine[] = [];
  for (const r of rows) {
    if (!("mes" in r) && !("name" in r)) continue;
    const extra = isObj(r.extra) ? r.extra : {};
    // keep the order even when dates are missing or equal
    const sendDate = Math.max(stDate(r.send_date, clock + 1), clock + 1);
    clock = sendDate;
    const text = str(r.mes);
    const rawSwipes = Array.isArray(r.swipes) ? r.swipes : [];
    const info = Array.isArray(r.swipe_info) ? r.swipe_info : [];
    let swipeId = typeof r.swipe_id === "number" && Number.isInteger(r.swipe_id) ? r.swipe_id : 0;
    const swipes = rawSwipes.map((s, k) => {
      const inf = isObj(info[k]) ? info[k] as Obj : {};
      const ex = isObj(inf.extra) ? inf.extra as Obj : {};
      return { text: str(s), sendDate: stDate(inf.send_date, 0), ...(str(ex.reasoning) ? { reasoning: str(ex.reasoning) } : {}) };
    });
    if (swipes.length > 0 && (swipeId < 0 || swipeId >= swipes.length)) swipeId = Math.max(0, swipes.findIndex((s) => s.text === text));
    lines.push({
      name: str(r.name),
      isUser: r.is_user === true,
      isSystem: r.is_system === true,
      isNarrator: extra.type === "narrator",
      sendDate,
      text,
      ...(str(extra.reasoning) ? { reasoning: str(extra.reasoning) } : {}),
      ...(str(r.original_avatar) ? { avatar: str(r.original_avatar) } : {}),
      swipes,
      swipeId,
      ...(str(extra.model) ? { model: str(extra.model) } : {}),
    });
  }
  const mainChat = str(metadata.main_chat).replace(/\.jsonl$/i, "") || undefined;
  return { name, header, lines, ...(mainChat ? { mainChat } : {}), warnings };
}

/**
 * Groups a character's chat files: each main chat with the branches and checkpoints made from it (also branches of
 * branches). A branch whose main chat is missing stands on its own.
 */
export function groupStChats(chats: ParsedStChat[]): Array<{ main: ParsedStChat; branches: ParsedStChat[] }> {
  const byName = new Map(chats.map((c) => [c.name, c]));
  const rootOf = (c: ParsedStChat): ParsedStChat => {
    const seen = new Set<string>();
    let cur = c;
    while (cur.mainChat && byName.has(cur.mainChat) && !seen.has(cur.name)) { seen.add(cur.name); cur = byName.get(cur.mainChat)!; }
    return cur;
  };
  const groups = new Map<string, { main: ParsedStChat; branches: ParsedStChat[] }>();
  for (const c of chats) {
    const root = rootOf(c);
    const g = groups.get(root.name) ?? { main: root, branches: [] };
    if (c !== root) g.branches.push(c);
    groups.set(root.name, g);
  }
  for (const g of groups.values()) g.branches.sort((a, b) => (a.lines.at(-1)?.sendDate ?? 0) - (b.lines.at(-1)?.sendDate ?? 0));
  return [...groups.values()];
}

export interface BuildOptions {
  sessionId: string;
  /** Who wrote a line that is not the user's (a character id, or the narrator). */
  speakerOf: (line: StChatLine) => Speaker;
  newId?: () => string;
}

export interface BuiltStChat {
  messages: MessageInput[];
  /** One per file: the main chat first ("Main"), then each branch by its file name. */
  branches: Array<{ name: string; endMessageId: string | null }>;
  /** Messages read (all files) and messages stored (the shared starts of branches are stored once). */
  read: number;
  stored: number;
  /** Swipes SillyTavern did not show, kept as sibling replies. */
  swipes: number;
}

/**
 * Builds the tree of a main chat and its branches. A line equal to one already in the tree at the same place (same
 * speaker, same text, same parent) is that message: so a branch shares its start with the main chat, and a branch made
 * from a swipe joins that swipe.
 */
export function buildStChatTree(group: { main: ParsedStChat; branches?: ParsedStChat[] }, opts: BuildOptions): BuiltStChat {
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const messages: MessageInput[] = [];
  const children = new Map<string | null, Array<{ id: string; key: string }>>();
  const keyOf = (speaker: Speaker, text: string) => `${JSON.stringify(speaker)}\n${text}`;
  const speakerFor = (l: StChatLine): Speaker => (l.isUser ? { kind: "user" } : l.isNarrator ? { kind: "narrator" } : opts.speakerOf(l));
  let read = 0;
  let swipes = 0;

  const add = (parentId: string | null, l: StChatLine, speaker: Speaker, text: string, createdAt: number, reasoning: string | undefined, extraMeta: Obj): string => {
    const id = newId();
    messages.push({
      id, sessionId: opts.sessionId, parentId, speaker,
      kind: speaker.kind === "user" ? "user" : "reply",
      visibility: l.isSystem ? { ai: "none", user: true } : { ai: "full", user: true },
      content: text, createdAt,
      ...(reasoning ? { reasoning } : {}),
      meta: { st: { name: l.name, ...(l.model ? { model: l.model } : {}), ...extraMeta } },
    });
    const list = children.get(parentId) ?? [];
    list.push({ id, key: keyOf(speaker, text) });
    children.set(parentId, list);
    return id;
  };

  const walk = (chat: ParsedStChat): string | null => {
    let parent: string | null = null;
    for (const l of chat.lines) {
      read++;
      const speaker = speakerFor(l);
      const found: { id: string; key: string } | undefined = (children.get(parent) ?? []).find((c) => c.key === keyOf(speaker, l.text));
      if (found) { parent = found.id; continue; }
      // the swipes SillyTavern did not show: siblings written just before the shown one, so the shown one is newest
      const others = l.swipes.map((s, k) => ({ ...s, k })).filter((s) => s.k !== l.swipeId && s.text !== l.text);
      others.forEach((s, n) => {
        if ((children.get(parent) ?? []).some((c) => c.key === keyOf(speaker, s.text))) return;
        add(parent, l, speaker, s.text, Math.min(s.sendDate || l.sendDate, l.sendDate) - (others.length - n), s.reasoning, { swipe: s.k });
        swipes++;
      });
      parent = add(parent, l, speaker, l.text, l.sendDate, l.reasoning, l.swipes.length > 1 ? { swipe: l.swipeId } : {});
    }
    return parent;
  };

  const branches: BuiltStChat["branches"] = [{ name: "Main", endMessageId: walk(group.main) }];
  for (const b of group.branches ?? []) branches.push({ name: b.name, endMessageId: walk(b) });
  return { messages, branches, read, stored: messages.length, swipes };
}

/** SillyTavern's Author's Note in `chat_metadata` → the chat's Author's Note (undefined when it has no text). */
export function authorsNoteOf(meta: Obj): AuthorsNote | undefined {
  const text = str(meta.note_prompt);
  if (!text.trim()) return undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(999, Math.round(v))) : undefined);
  // ST: 0 = after the main prompt, 1 = in the chat, 2 = before the main prompt; role 0 system, 1 user, 2 assistant
  const position = ({ 0: "afterMain", 1: "inChat", 2: "beforeMain" } as const)[Number(meta.note_position) as 0 | 1 | 2];
  const role = ({ 0: "system", 1: "user", 2: "assistant" } as const)[Number(meta.note_role) as 0 | 1 | 2];
  const interval = num(meta.note_interval);
  const depth = num(meta.note_depth);
  return { text, ...(interval !== undefined ? { interval } : {}), ...(position ? { position } : {}), ...(depth !== undefined ? { depth } : {}), ...(role ? { role } : {}) };
}

/** The lorebook a chat names (`chat_metadata.world_info`) and the persona it is locked to (`chat_metadata.persona`). */
export function chatLinksOf(meta: Obj): { lorebook?: string; persona?: string } {
  const lorebook = str(meta.world_info).trim();
  const persona = str(meta.persona).trim();
  return { ...(lorebook ? { lorebook } : {}), ...(persona ? { persona } : {}) };
}

/**
 * Saves a built chat: the session, every message and the branch rows, together in one transaction (D-125). Messages go
 * parents first, as built.
 */
export async function saveStChat(store: SqlStore, session: SessionInput, built: BuiltStChat, newId: () => string = () => crypto.randomUUID()): Promise<void> {
  const { store: b, flush } = store.batched();
  await b.saveSession(session);
  await b.importMessages(built.messages);
  for (const br of built.branches) {
    const row: BranchInput = { id: newId(), sessionId: session.id, name: br.name, headMessageId: null, endMessageId: br.endMessageId };
    await b.saveBranch(row);
  }
  await flush();
}
