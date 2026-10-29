// Homunculus 2 — branches of a chat (D-032). Author: CLAUDE, 2026-10-29.
//
// v2 (10/29, after Daniel's test: "it should be straight to the point", like SillyTavern and Marinara): a branch is a NAMED
// END in the message tree — a saved row whose `endMessageId` is the newest message of that line. "Branch from here"
// on any message makes a new row ending at that message and you are on it at once (SillyTavern `createBranch` +
// `branchChat`, Marinara `POST /chats/:id/branch` then switch). Whatever you do next moves only that branch's end.
// Nothing is copied: the messages before the split are shared, and the world state is pinned to each message.
// A branch's OWN messages are the ones no other branch uses; deleting removes only those.
//
// v1 (first D-032 version, below as `computeBranches`/`nameBranches`) found branches from the tree's leaves; it is
// kept only to turn the rows it saved (head only, no end) into ends, once per chat.
// Pure functions: the store loads the links and rows, these compute.

export interface MessageLink { id: string; parentId: string | null; createdAt: number }

export interface ComputedBranch {
  /** The first message only this branch has (null for an empty chat). Also the key of its saved name. */
  key: string | null;
  /** The newest message at the end of the branch: where "Go" leads. */
  endId: string | null;
  /** First message → end, without the other versions along the way. */
  path: string[];
  /** The last message this branch shares with another one (null = it starts at the first message). */
  forkAt: string | null;
  /** Messages only this branch has (the key and everything under it, versions included): what Delete removes. */
  own: string[];
  /** When it started (its key's time) and when its newest message was written. */
  createdAt: number;
  lastAt: number;
  /** Held at a message the story went on from in other branches: it has no messages of its own. */
  pinned: boolean;
}

/** The key of a branch held at a message (never a message id, so it can't clash with a real branch's key). */
export const pinKey = (messageId: string) => `pin:${messageId}`;

interface Tree { kids: Map<string | null, MessageLink[]>; byId: Map<string, MessageLink> }

function treeOf(links: MessageLink[]): Tree {
  const kids = new Map<string | null, MessageLink[]>();
  const byId = new Map<string, MessageLink>();
  for (const l of links) {
    byId.set(l.id, l);
    const list = kids.get(l.parentId) ?? [];
    list.push(l);
    kids.set(l.parentId, list);
  }
  for (const list of kids.values()) list.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return { kids, byId };
}

const newest = (xs: MessageLink[]) => xs.reduce((a, b) => (b.createdAt >= a.createdAt ? b : a));

function subtree(t: Tree, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const x = stack.pop()!;
    out.push(x);
    for (const k of t.kids.get(x) ?? []) stack.push(k.id);
  }
  return out;
}

/**
 * Every branch of a chat, Main (the oldest) first, then by when they started. `heldAt` = messages where a branch is
 * held (saved rows with an end); a held message that the story went on from becomes a branch of its own.
 */
export function computeBranches(links: MessageLink[], heldAt: Iterable<string> = []): ComputedBranch[] {
  const t = treeOf(links);
  const paths: string[][] = [];
  const walk = (parent: string | null, prefix: string[]) => {
    const children = t.kids.get(parent) ?? [];
    const continued = children.filter((c) => (t.kids.get(c.id)?.length ?? 0) > 0);
    if (continued.length === 0) {
      paths.push(children.length ? [...prefix, newest(children).id] : prefix);
      return;
    }
    for (const c of continued) walk(c.id, [...prefix, c.id]);
  };
  walk(null, []);
  if (paths.length === 1 && paths[0]!.length === 0) return [{ key: null, endId: null, path: [], forkAt: null, own: [], createdAt: 0, lastAt: 0, pinned: false }];

  // held ends with children: the path from the first message to them (ends at a leaf are ordinary branches already)
  const held: string[][] = [];
  for (const id of new Set(heldAt)) {
    if (!t.byId.has(id) || !(t.kids.get(id)?.length)) continue;
    const path: string[] = [];
    for (let at: string | null = id; at !== null; at = t.byId.get(at)?.parentId ?? null) path.unshift(at);
    held.push(path);
  }
  const all = [...paths, ...held];

  const out = paths.map((path, i): ComputedBranch => {
    const others = new Set(all.filter((_, j) => j !== i).flat());
    const k = path.findIndex((id) => !others.has(id));
    const keyIndex = k < 0 ? path.length - 1 : k;
    const key = path[keyIndex] ?? null;
    const endId = path[path.length - 1] ?? null;
    const own = key && all.length > 1 ? subtree(t, key) : key ? links.map((l) => l.id) : [];
    return {
      key, endId, path,
      forkAt: keyIndex > 0 ? path[keyIndex - 1]! : null,
      own,
      createdAt: key ? t.byId.get(key)!.createdAt : 0,
      lastAt: Math.max(...own.map((id) => t.byId.get(id)?.createdAt ?? 0), endId ? t.byId.get(endId)!.createdAt : 0),
      pinned: false,
    };
  });
  for (const path of held) {
    const endId = path[path.length - 1]!;
    const at = t.byId.get(endId)!.createdAt;
    out.push({ key: pinKey(endId), endId, path, forkAt: null, own: [], createdAt: at, lastAt: at, pinned: true });
  }
  return out.sort((a, b) => a.createdAt - b.createdAt || Number(b.pinned) - Number(a.pinned));
}

export interface SavedBranchName { id: string; name: string; headMessageId: string | null; endMessageId?: string | null }
export interface NamedBranch extends ComputedBranch { name: string; recordId: string | null }

/** The messages where saved branches are held (pass to `computeBranches`). */
export const heldEnds = (saved: SavedBranchName[]): string[] => saved.flatMap((r) => (r.endMessageId ? [r.endMessageId] : []));

/**
 * Gives every branch its name: a held row names the branch that ends at its message; any other saved row names the
 * branch whose path holds its head (the oldest branch wins when two share it); else "Main" for the oldest, else the
 * next free "Branch N". Rows that match nothing are returned as `unused` (their branch was deleted) and branches
 * without a row as `toSave` (the caller saves them once).
 */
export function nameBranches(branches: ComputedBranch[], saved: SavedBranchName[]): { named: NamedBranch[]; toSave: NamedBranch[]; unused: SavedBranchName[] } {
  const named: Array<NamedBranch | null> = branches.map(() => null);
  const unused: SavedBranchName[] = [];
  const held = saved.filter((r) => r.endMessageId);
  for (const row of held) {
    // a held branch first; when the message has nothing after it any more, the ordinary branch ending there
    let i = branches.findIndex((b, j) => !named[j] && b.pinned && b.endId === row.endMessageId);
    if (i < 0) i = branches.findIndex((b, j) => !named[j] && !b.pinned && b.endId === row.endMessageId);
    if (i < 0) { unused.push(row); continue; }
    named[i] = { ...branches[i]!, name: row.name, recordId: row.id };
  }
  for (const row of saved.filter((r) => !r.endMessageId)) {
    const i = branches.findIndex((b, j) => !named[j] && !b.pinned && row.headMessageId !== null && b.path.includes(row.headMessageId));
    if (i < 0) { unused.push(row); continue; }
    named[i] = { ...branches[i]!, name: row.name, recordId: row.id };
  }
  const taken = new Set(named.filter(Boolean).map((b) => b!.name));
  let n = 2;
  const toSave: NamedBranch[] = [];
  const result = branches.map((b, i) => {
    if (named[i]) return named[i]!;
    let name: string;
    if (i === 0 && !taken.has("Main")) name = "Main";
    else { while (taken.has(`Branch ${n}`)) n += 1; name = `Branch ${n}`; }
    taken.add(name);
    const nb: NamedBranch = { ...b, name, recordId: null };
    if (b.key && !b.pinned) toSave.push(nb);
    return nb;
  });
  return { named: result, toSave, unused };
}

/** The branch a message on screen belongs to: the one whose path holds the end shown (or, failing that, the message). */
export function branchOf(branches: NamedBranch[], headId: string | null): NamedBranch | undefined {
  if (!headId) return branches[0];
  return branches.find((b) => b.endId === headId) ?? branches.find((b) => b.path.includes(headId));
}

/** Where the story splits: for each message after which branches go different ways, the branches that pass it. */
export function forkPoints(branches: ComputedBranch[]): Map<string, ComputedBranch[]> {
  const out = new Map<string, ComputedBranch[]>();
  for (const b of branches) {
    if (!b.forkAt) continue;
    // a branch held at the split counts too: it is the way that stops here
    const through = branches.filter((x) => x.path.includes(b.forkAt!) && (x.pinned || x.path[x.path.length - 1] !== b.forkAt));
    if (through.length > 1) out.set(b.forkAt, through);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ v2: named ends
export interface BranchRow { id: string; name: string; headMessageId: string | null; endMessageId: string | null }

export interface ChatBranch {
  recordId: string;
  name: string;
  /** The newest message of this branch (null = empty chat). */
  endId: string | null;
  /** First message → end. */
  path: string[];
  /** The last message it shares with another branch (null = shares nothing). */
  forkAt: string | null;
  /** Messages only this branch uses (with the versions under them): what deleting it removes. */
  own: string[];
  /** When its newest own message was written (else its end's time). */
  lastAt: number;
}

/** From a message (null = the start), the newest child at every step down to an end. */
export function newestLeaf(links: MessageLink[], from: string | null = null): string | null {
  const t = treeOf(links);
  let at = from;
  for (;;) {
    const kids = t.kids.get(at) ?? [];
    if (!kids.length) return at;
    at = kids[kids.length - 1]!.id;
  }
}

/** The path from the first message to `id`. */
export function pathOf(links: MessageLink[], id: string | null): string[] {
  if (!id) return [];
  const byId = new Map(links.map((l) => [l.id, l]));
  const out: string[] = [];
  for (let at: string | null = id; at !== null && byId.has(at); at = byId.get(at)!.parentId) out.unshift(at);
  return out;
}

/**
 * The branches of a chat from its saved rows. Also says which rows to save or remove so the rows stay right:
 * rows from v1 (a head and no end) become ends once; a chat with messages and no row gets "Main" at its newest end;
 * a row whose end was deleted goes away. `newId` makes ids for new rows.
 */
export function resolveBranches(links: MessageLink[], rows: BranchRow[], newId: () => string): { branches: ChatBranch[]; save: BranchRow[]; remove: string[] } {
  const t = treeOf(links);
  const save: BranchRow[] = [];
  const remove: string[] = [];
  let tips: BranchRow[];
  if (rows.some((r) => r.endMessageId === null && r.headMessageId !== null)) {
    // v1 rows: find the branches the old way and give each one an end
    const old = nameBranches(computeBranches(links, heldEnds(rows)), rows);
    tips = [];
    for (const b of old.named) {
      if (!b.endId) continue;
      const row: BranchRow = { id: b.recordId ?? newId(), name: b.name, headMessageId: null, endMessageId: b.endId };
      tips.push(row);
      save.push(row);
    }
    remove.push(...old.unused.map((u) => u.id));
  } else {
    tips = [];
    for (const r of rows) {
      if (r.endMessageId !== null && !t.byId.has(r.endMessageId)) { remove.push(r.id); continue; }
      if (r.endMessageId === null && links.length) {
        const fixed = { ...r, endMessageId: newestLeaf(links) };
        save.push(fixed);
        tips.push(fixed);
        continue;
      }
      tips.push(r);
    }
  }
  if (!tips.length) {
    const main: BranchRow = { id: newId(), name: "Main", headMessageId: null, endMessageId: newestLeaf(links) };
    tips.push(main);
    save.push(main);
  }
  const paths = tips.map((r) => pathOf(links, r.endMessageId));
  const branches = tips.map((r, i): ChatBranch => {
    const others = new Set(paths.filter((_, j) => j !== i).flat());
    const path = paths[i]!;
    const k = path.findIndex((id) => !others.has(id));
    const own = k < 0 ? [] : subtree(t, path[k]!);
    const forkAt = k < 0 ? (path[path.length - 1] ?? null) : k > 0 ? path[k - 1]! : null;
    const end = r.endMessageId ? t.byId.get(r.endMessageId)?.createdAt ?? 0 : 0;
    return {
      recordId: r.id, name: r.name, endId: r.endMessageId, path, forkAt, own,
      lastAt: Math.max(end, ...own.map((id) => t.byId.get(id)?.createdAt ?? 0)),
    };
  });
  return { branches, save, remove };
}

/** Where the story splits: for each message after which branches go different ways, the branches that pass it. */
export function splitPoints(branches: ChatBranch[]): Map<string, ChatBranch[]> {
  const out = new Map<string, ChatBranch[]>();
  for (const b of branches) {
    if (!b.forkAt || out.has(b.forkAt)) continue;
    const through = branches.filter((x) => x.path.includes(b.forkAt!));
    if (through.length > 1) out.set(b.forkAt, through);
  }
  return out;
}

/**
 * What deleting a message removes when you are on `current`: the message and everything after it, except what
 * other branches still use (they keep their messages, like SillyTavern's and Marinara's copies would).
 */
export function deletableFrom(links: MessageLink[], branches: ChatBranch[], current: ChatBranch | undefined, messageId: string): string[] {
  const keep = new Set(branches.filter((b) => b !== current).flatMap((b) => b.path));
  return subtree(treeOf(links), messageId).filter((id) => !keep.has(id));
}

/** The next free "Branch N" name. */
export function nextBranchName(names: string[]): string {
  let n = 2;
  while (names.includes(`Branch ${n}`)) n += 1;
  return `Branch ${n}`;
}

