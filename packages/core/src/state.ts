// Homunculus 2 — world state attached to messages (decision D-001). Author: CLAUDE, 2026-10-23; v2 2026-10-27.
//
// Each message stores only what changed (a delta). The state "at" a message is
// rebuilt by walking from the first message down to it and applying the deltas
// in order. Swipes and branches are just different paths in the message tree,
// so going back, swiping or branching automatically gives the right state.
//
// v2 (BLUEPRINT §4.5, §7.1):
//  - two deltas per message: the agents' and the user's. The user's is applied after
//    the agents', so a user edit always wins at that message.
//  - pinned values apply on every branch (applied last).
//  - optional snapshots every SNAPSHOT_EVERY messages along a path, so long chats stay fast.
//    Snapshots are a cache: the repository deletes them when an earlier delta changes.
import type { StateDelta } from "@homunculus/schemas";

export type ResolvedState = Record<string, Record<string, unknown>>;

export const SNAPSHOT_EVERY = 50;

/** Where deltas are stored. In-memory for tests; SQLite in the app (SqlStore). */
export interface StateRepository {
  getDelta(messageId: string): Promise<StateDelta | undefined>;
  setDelta(messageId: string, delta: StateDelta): Promise<void>;
  getUserDelta(messageId: string): Promise<StateDelta | undefined>;
  setUserDelta(messageId: string, delta: StateDelta): Promise<void>;
  getPins(sessionId: string): Promise<StateDelta>;
  setPins(sessionId: string, pins: StateDelta): Promise<void>;
  /** Optional cache (agents' + user's deltas up to and including this message, without pins). */
  getSnapshot?(messageId: string): Promise<ResolvedState | undefined>;
  setSnapshot?(messageId: string, state: ResolvedState): Promise<void>;
}

/** Tells the state system how messages are connected. */
export interface MessageTree {
  parentOf(messageId: string): Promise<string | null | undefined>;
}

export class MemoryStateRepository implements StateRepository {
  private deltas = new Map<string, StateDelta>();
  private user = new Map<string, StateDelta>();
  private pins = new Map<string, StateDelta>();
  async getDelta(id: string) { return this.deltas.get(id); }
  async setDelta(id: string, d: StateDelta) { this.deltas.set(id, d); }
  async getUserDelta(id: string) { return this.user.get(id); }
  async setUserDelta(id: string, d: StateDelta) { this.user.set(id, d); }
  async getPins(s: string) { return this.pins.get(s) ?? {}; }
  async setPins(s: string, p: StateDelta) { this.pins.set(s, p); }
}

export function applyInto(target: ResolvedState, delta: StateDelta): void {
  for (const [ns, values] of Object.entries(delta)) {
    const bucket = (target[ns] ??= {});
    for (const [key, value] of Object.entries(values)) {
      if (value === null) delete bucket[key];
      else bucket[key] = structuredClone(value);
    }
    if (Object.keys(bucket).length === 0) delete target[ns];
  }
}

export function mergeDelta(base: StateDelta, extra: StateDelta): StateDelta {
  const out: StateDelta = structuredClone(base);
  for (const [ns, values] of Object.entries(extra)) out[ns] = { ...(out[ns] ?? {}), ...values };
  return out;
}

/** Reads "world.location" or "relationships.Lyra" from a resolved state. */
export function readStatePath(state: ResolvedState, path: string): unknown {
  const [ns, ...rest] = path.split(".");
  let value: unknown = ns ? state[ns] : undefined;
  for (const part of rest) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export class WorldState {
  constructor(
    private readonly tree: MessageTree,
    private readonly repo: StateRepository = new MemoryStateRepository(),
  ) {}

  /** Record changes made by agents at a message (merged with changes already recorded there). */
  async applyDelta(messageId: string, delta: StateDelta): Promise<void> {
    const existing = (await this.repo.getDelta(messageId)) ?? {};
    await this.repo.setDelta(messageId, mergeDelta(existing, delta));
  }

  /** Record a change made by the user at a message (e.g. editing a value in the Scene panel). */
  async applyUserDelta(messageId: string, delta: StateDelta): Promise<void> {
    const existing = (await this.repo.getUserDelta(messageId)) ?? {};
    await this.repo.setUserDelta(messageId, mergeDelta(existing, delta));
  }

  /** The full state as it was right after `messageId` (null = before any message). */
  async resolve(sessionId: string, messageId: string | null): Promise<ResolvedState> {
    const path: string[] = [];
    const seen = new Set<string>();
    let current: string | null | undefined = messageId;
    while (current) {
      if (seen.has(current)) throw new Error(`Message tree has a cycle at "${current}"`);
      seen.add(current);
      path.push(current);
      current = await this.tree.parentOf(current);
    }
    path.reverse(); // root first

    // Start from the nearest snapshot on the path, if the repository keeps them.
    let state: ResolvedState = {};
    let start = 0;
    if (this.repo.getSnapshot) {
      for (let i = path.length - 1; i >= 0; i--) {
        if ((i + 1) % SNAPSHOT_EVERY !== 0) continue;
        const snap = await this.repo.getSnapshot(path[i]!);
        if (snap) { state = structuredClone(snap); start = i + 1; break; }
      }
    }
    for (let i = start; i < path.length; i++) {
      const id = path[i]!;
      const delta = await this.repo.getDelta(id);
      if (delta) applyInto(state, delta);
      const user = await this.repo.getUserDelta(id);
      if (user) applyInto(state, user);
      if (this.repo.setSnapshot && (i + 1) % SNAPSHOT_EVERY === 0) await this.repo.setSnapshot(id, structuredClone(state));
    }
    applyInto(state, await this.repo.getPins(sessionId));
    return state;
  }

  /** Pin a value so it applies on every branch. */
  async pin(sessionId: string, namespace: string, key: string, value: unknown): Promise<void> {
    const pins = await this.repo.getPins(sessionId);
    await this.repo.setPins(sessionId, mergeDelta(pins, { [namespace]: { [key]: value } }));
  }

  async unpin(sessionId: string, namespace: string, key: string): Promise<void> {
    const pins = structuredClone(await this.repo.getPins(sessionId));
    if (pins[namespace]) {
      delete pins[namespace][key];
      if (Object.keys(pins[namespace]).length === 0) delete pins[namespace];
    }
    await this.repo.setPins(sessionId, pins);
  }
}
