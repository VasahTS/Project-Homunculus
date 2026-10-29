// Homunculus 2 — replies that keep going when you leave the chat. Author: CLAUDE, 2026-10-29.
// Before: the turn (text arriving, Stop, "trackers are updating…") lived inside the chat's screen, so opening another
// chat threw it away. Now each chat's turn lives here, outside React: it keeps streaming, saves, moves its branch's end
// and runs the trackers whether the chat is on screen or not, and several chats can write at the same time (like
// Marinara). The chat screen only watches the turn of its own chat (`useTurn`) and shows it.
import { useSyncExternalStore } from "react";
import type { Message } from "@homunculus/schemas";
import type { AppServices } from "./core-instance.ts";

/** What the stream sends while a reply is written (the same callbacks ChatService takes). */
export interface StreamTo {
  onToken: (piece: string, all: string) => void;
  onReasoning: (all: string) => void;
  onReply: (reply: Message) => void;
}

/** One chat's turn, as the screens see it. */
export interface LiveTurn {
  sessionId: string;
  /** Tells turns of the same chat apart. */
  id: number;
  /** The branch the turn writes on (its end follows the new messages). */
  branchId: string | null;
  /** writing = the reply is arriving; trackers = the reply is saved, trackers still work; done = finished (kept until seen). */
  phase: "writing" | "trackers" | "done";
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

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  all = () => this.snapshot;

  private emit() {
    this.snapshot = new Map([...this.turns].map(([k, v]) => [k, publicView(v)]));
    for (const fn of this.listeners) fn();
  }
  private patch(sessionId: string, e: Entry, change: Partial<Entry>) {
    if (this.turns.get(sessionId) !== e) return; // an older turn of this chat (it was cleared or replaced)
    Object.assign(e, change);
    this.emit();
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
    };
    this.turns.set(opts.sessionId, e);
    this.emit();
    const startedAt = Date.now();
    const stream: StreamTo = {
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

  /** Stop: the reply keeps what arrived so far (saved as incomplete by the core). */
  stop(sessionId: string) { this.turns.get(sessionId)?.ctrl.abort(); }

  /** The chat on screen saw the finished turn: forget it. */
  clear(sessionId: string, turn: LiveTurn) {
    const t = this.turns.get(sessionId);
    if (t && t.phase === "done" && t.id === turn.id) { this.turns.delete(sessionId); this.emit(); }
  }
}

function publicView(e: Entry): LiveTurn {
  return { sessionId: e.sessionId, id: e.id, branchId: e.branchId, phase: e.phase, parentId: e.parentId, userText: e.userText, text: e.text, reasoning: e.reasoning,
    head: e.head, headSeq: e.headSeq, error: e.error };
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

/** One chat's turn, or undefined when nothing runs there. */
export function useTurn(sessionId: string): LiveTurn | undefined {
  return useTurns().get(sessionId);
}
