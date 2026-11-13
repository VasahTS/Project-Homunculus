// Homunculus 2 — replies that keep going when you leave the chat. Author: CLAUDE, 2026-10-29.
// Before: the turn (text arriving, Stop, "trackers are updating…") lived inside the chat's screen, so opening another
// chat threw it away. Now each chat's turn lives here, outside React: it keeps streaming, saves, moves its branch's end
// and runs the trackers whether the chat is on screen or not, and several chats can write at the same time (like
// Marinara). The chat screen only watches the turn of its own chat (`useTurn`) and shows it.
import { useSyncExternalStore } from "react";
import type { ConnectionConfig, CoreEvents, HomunculusCore } from "@homunculus/core";
import type { Message } from "@homunculus/schemas";
import type { AppServices } from "./core-instance.ts";
import { getPrefs } from "./prefs.ts";

/** What the stream sends while a reply is written (the same callbacks ChatService takes). */
export interface StreamTo {
  branchId: string | null;
  onToken: (piece: string, all: string) => void;
  onReasoning: (all: string) => void;
  onReply: (reply: Message) => void;
  /** Settings → Chat (D-082): how many times a reply cut off by the length limit is continued (0 = off). */
  continueOnLength: number;
}

/** One chat's turn, as the screens see it. */
export interface LiveTurn {
  sessionId: string;
  /** Tells turns of the same chat apart. */
  id: number;
  /** The branch the turn writes on (its end follows the new messages). */
  branchId: string | null;
  /** A reply, its after-agents, a manual run, or a finished turn kept until seen. */
  phase: "writing" | "trackers" | "agents" | "done";
  manual?: { messageId: string; agentId: string } | undefined;
  activeAgents: ReadonlyMap<string, number>;
  agentSeq: number;
  /** Where the reply hangs, and the words you sent (shown until the reply is saved). */
  parentId: string | null;
  userText?: string | undefined;
  text: string;
  reasoning: string;
  /** The newest message this turn put on its branch (the reply, then what a stopped turn left). */
  head: string | null;
  /** Grows every time `head` moves: the chat reloads its messages. */
  headSeq: number;
  /** The turn failed (not when you pressed Stop). */
  error?: string | undefined;
}

interface Entry extends LiveTurn { ctrl: AbortController; onActivity: () => void }

let nextId = 1;

/** One per app (the services are booted once too). */
class TurnManager {
  private turns = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  /** A copy per change, so React sees a new value (useSyncExternalStore compares by reference). */
  private snapshot: ReadonlyMap<string, LiveTurn> = new Map();

  /** Only each chat's phase (and error): a new copy when one starts, changes phase or ends — not on every word (D-122). */
  private phaseSnapshot: ReadonlyMap<string, TurnPhase> = new Map();

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  all = () => this.snapshot;
  phases = () => this.phaseSnapshot;
  /** Each chat's turn without following its words: a new copy only when something else changes (D-122). */
  private quietSnapshot: ReadonlyMap<string, LiveTurn> = new Map();
  quiet = () => this.quietSnapshot;

  private emit(sessionId: string) {
    const snapshot = new Map(this.snapshot);
    const entry = this.turns.get(sessionId);
    if (entry) snapshot.set(sessionId, publicView(entry));
    else snapshot.delete(sessionId);
    this.snapshot = snapshot;
    const view = snapshot.get(sessionId);
    const before = this.quietSnapshot.get(sessionId);
    if (!view !== !before || (view && before && !sameButWords(view, before))) {
      const quiet = new Map(this.quietSnapshot);
      if (view) quiet.set(sessionId, view); else quiet.delete(sessionId);
      this.quietSnapshot = quiet;
    }
    const was = this.phaseSnapshot.get(sessionId);
    const now = entry ? { phase: entry.phase, error: entry.error } : undefined;
    if (was?.phase !== now?.phase || was?.error !== now?.error) {
      const phases = new Map(this.phaseSnapshot);
      if (now) phases.set(sessionId, now); else phases.delete(sessionId);
      this.phaseSnapshot = phases;
    }
    for (const fn of this.listeners) fn();
  }
  private patch(sessionId: string, e: Entry, change: Partial<Entry>) {
    if (this.turns.get(sessionId) !== e) return; // an older turn of this chat (it was cleared or replaced)
    Object.assign(e, change);
    this.emit(sessionId);
  }

  /** CODEX: follow both automatic and manual agents for the lifetime of the app. */
  watchAgentRuns(core: HomunculusCore) {
    const update = (event: CoreEvents["agent.started"], started: boolean, reason?: string) => {
      const entry = this.turns.get(event.sessionId);
      if (!entry || entry.phase === "done") return;
      const activeAgents = new Map(entry.activeAgents);
      if (started) activeAgents.set(event.agentId, Date.now());
      else activeAgents.delete(event.agentId);
      this.patch(event.sessionId, entry, {
        activeAgents, agentSeq: entry.agentSeq + (started ? 0 : 1),
        error: entry.manual && reason && !entry.ctrl.signal.aborted ? reason : entry.error,
      });
    };
    core.events.on("agent.started", (e) => update(e, true), "turns");
    core.events.on("agent.finished", (e) => update(e, false), "turns");
    core.events.on("agent.failed", (e) => update(e, false, e.reason), "turns");
  }

  /** Is a reply being written or are trackers working in this chat? */
  running(sessionId: string) {
    const t = this.turns.get(sessionId);
    return !!t && t.phase !== "done";
  }

  /**
   * Starts a turn for a chat. `branchId` = the branch you are on (its end follows the new messages, also when the chat
   * is not on screen); `before` = the end before the turn (a stopped turn goes back to what it saved after it).
   */
  start(svc: AppServices, opts: {
    sessionId: string; parentId: string | null; userText?: string | undefined; before: string | null; branchId: string | null;
    onActivity: () => void; task: (signal: AbortSignal, stream: StreamTo) => Promise<string | null>;
  }) {
    if (this.running(opts.sessionId)) return;
    const e: Entry = {
      sessionId: opts.sessionId, id: nextId++, phase: "writing", parentId: opts.parentId, userText: opts.userText, text: "", reasoning: "",
      head: opts.before, headSeq: 0, ctrl: new AbortController(), branchId: opts.branchId, onActivity: opts.onActivity,
      activeAgents: new Map(), agentSeq: 0,
    };
    this.turns.set(opts.sessionId, e);
    this.emit(opts.sessionId);
    const startedAt = Date.now();
    const p = getPrefs();
    const stream: StreamTo = {
      branchId: opts.branchId,
      continueOnLength: p.autoContinue ? p.continueTimes : 0,
      onToken: (_p, all) => this.patch(opts.sessionId, e, { text: all }),
      onReasoning: (all) => this.patch(opts.sessionId, e, { reasoning: all }),
      // the reply is saved: the branch ends at it and it shows now (the "writing…" bubble goes away together with it);
      // trackers keep running ("updating…")
      onReply: (reply) => {
        void moveBranchEnd(svc, opts.sessionId, e.branchId, reply.id).then(() => {
          if (e.phase === "writing") this.patch(opts.sessionId, e, { phase: "trackers", head: reply.id, headSeq: e.headSeq + 1 });
          e.onActivity();
        });
      },
    };
    void (async () => {
      let next: string | null;
      let error: string | undefined;
      try {
        next = await opts.task(e.ctrl.signal, stream);
      } catch (err) {
        if (!e.ctrl.signal.aborted) error = err instanceof Error ? err.message : String(err);
        // what this turn saved before it stopped (never another branch's messages)
        next = await newSince(svc, opts.sessionId, opts.before, startedAt);
      }
      await moveBranchEnd(svc, opts.sessionId, e.branchId, next);
      this.patch(opts.sessionId, e, { phase: "done", head: next, headSeq: e.headSeq + 1, error });
      e.onActivity();
    })();
  }

  /** A manual run edits a saved message or its state. It does not advance a branch. CODEX. */
  async runAgents(svc: AppServices, opts: {
    sessionId: string; messageId: string; agentIds: string[]; direction?: string; branchId?: string | null;
    connection: ConnectionConfig; connections: Record<string, ConnectionConfig>; onActivity: () => void;
  }): Promise<string | undefined> {
    const { sessionId, messageId, agentIds, direction, connection, connections } = opts;
    const firstAgentId = agentIds[0];
    if (!firstAgentId || this.running(sessionId)) return;
    const ctrl = new AbortController();
    const entry: Entry = {
      sessionId, id: nextId++, phase: "agents", manual: { messageId, agentId: firstAgentId },
      activeAgents: new Map(), agentSeq: 0, parentId: null, branchId: null, head: null, headSeq: 0,
      text: "", reasoning: "", ctrl, onActivity: opts.onActivity,
    };
    this.turns.set(sessionId, entry);
    this.emit(sessionId);
    for (const agentId of agentIds) {
      if (ctrl.signal.aborted) break;
      if (entry.manual?.agentId !== agentId) this.patch(sessionId, entry, { manual: { messageId, agentId } });
      try {
        await svc.chat.turns.runManual(sessionId, agentId, messageId, connection, ctrl.signal, connections, { direction, branchId: opts.branchId ?? null });
      } catch (err) {
        if (!ctrl.signal.aborted) entry.error = err instanceof Error ? err.message : String(err);
      }
    }
    this.patch(sessionId, entry, { phase: "done", activeAgents: new Map() });
    entry.onActivity();
    return entry.error;
  }

  /** Stop: the reply keeps what arrived so far (saved as incomplete by the core). */
  stop(sessionId: string) { this.turns.get(sessionId)?.ctrl.abort(); }

  /** The chat on screen saw the finished turn: forget it. */
  clear(sessionId: string, turn: LiveTurn) {
    const t = this.turns.get(sessionId);
    if (t && t.phase === "done" && t.id === turn.id) { this.turns.delete(sessionId); this.emit(sessionId); }
  }
}

/** Two views of a turn equal apart from the words written so far. */
function sameButWords(a: LiveTurn, b: LiveTurn): boolean {
  for (const k of Object.keys(a) as Array<keyof LiveTurn>) if (k !== "text" && k !== "reasoning" && a[k] !== b[k]) return false;
  return true;
}

function publicView(e: Entry): LiveTurn {
  return { sessionId: e.sessionId, id: e.id, branchId: e.branchId, phase: e.phase, parentId: e.parentId, userText: e.userText, text: e.text, reasoning: e.reasoning,
    head: e.head, headSeq: e.headSeq, error: e.error, manual: e.manual, activeAgents: e.activeAgents, agentSeq: e.agentSeq };
}

/** The branch the turn started on now ends at `head` (D-032 v2: a branch is a named end). */
async function moveBranchEnd(svc: AppServices, sessionId: string, branchId: string | null, head: string | null) {
  if (!branchId) return;
  const row = (await svc.store.listBranches(sessionId)).find((b) => b.id === branchId);
  if (row && row.endMessageId !== head) await svc.store.saveBranch({ ...row, endMessageId: head });
}

/**
 * What a turn that stopped (error or Stop) saved after `from`: its newest message written since `since`, followed down,
 * else `from` itself. Never goes into another branch's older messages.
 */
async function newSince(s: AppServices, sessionId: string, from: string | null, since: number): Promise<string | null> {
  let current = from;
  for (;;) {
    const kids = (await s.store.childrenOf(sessionId, current)).filter((k) => k.createdAt >= since);
    if (kids.length === 0) return current;
    current = kids[kids.length - 1]!.id;
  }
}

export const turns = new TurnManager();

/** Every chat's turn (for the sidebar: which chats are writing). */
export function useTurns(): ReadonlyMap<string, LiveTurn> {
  return useSyncExternalStore(turns.subscribe, turns.all);
}

/** A chat's phase while a turn runs. */
export interface TurnPhase { phase: LiveTurn["phase"]; error?: string | undefined }

/** Every chat's phase: for screens that only need to know who is writing (App, Sidebar). They no longer re-render on
 *  every word of a reply (D-122: the whole app used to). */
export function useTurnPhases(): ReadonlyMap<string, TurnPhase> {
  return useSyncExternalStore(turns.subscribe, turns.phases);
}

/** One chat's turn, without re-rendering for each word (its `text`/`reasoning` may be behind): the chat screen; the
 *  words themselves are drawn by the small streaming bubble, which uses `useTurn` (D-122). */
export function useTurnQuiet(sessionId: string): LiveTurn | undefined {
  return useSyncExternalStore(turns.subscribe, () => turns.quiet().get(sessionId));
}

/** One chat's turn, or undefined when nothing runs there. */
export function useTurn(sessionId: string): LiveTurn | undefined {
  return useSyncExternalStore(turns.subscribe, () => turns.all().get(sessionId));
}
