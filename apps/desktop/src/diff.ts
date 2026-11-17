// Homunculus 2 — word-level differences between two texts (the rewrite comparison, D-048). Author: CLAUDE, 2026-10-30.
// Myers' O(ND) algorithm over words, spaces and punctuation, so a change reads like an editor's mark-up. Neighbouring
// deletions and insertions form one "change", which can be kept or put back on its own.
//
// Memory (CLAUDE, 2026-11-17): the trace Myers keeps for the backtrack grows with the square of the number of edits.
// It used to copy the whole vector every step (a 3,000-word rewrite took ~560 MB; the Assistant's "See change" and the
// Text Mode comparison ran it on every render, and WebView2 went past 5 GB). Now each step keeps only the diagonals it
// reached, and a diff that would need more than BUDGET cells stops and is done coarser: by sentences and lines first,
// then word by word inside each changed block that fits, and a block that still doesn't fit shows as one change.

export type DiffPart = { kind: "same"; text: string } | { kind: "change"; id: number; before: string; after: string };
type Op = ["=" | "-" | "+", string];

const tokens = (t: string) => t.match(/\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}]/gu) ?? [];
/** Sentences and lines, with the spaces after them: the coarse pass for very different texts. */
const sentences = (t: string) => t.match(/[^\n.!?]*(?:[.!?]+|\n)\s*|[^\n.!?]+/g) ?? [];

/** Trace cells kept for one Myers run (4 bytes each): ~8 MB, about 2,000 edits. */
const BUDGET = 2_000_000;

/** Myers' shortest edit script on token arrays, or null when it would need more than `budget` trace cells. */
function myers(a: string[], b: string[], budget = BUDGET): Op[] | null {
  const n = a.length, m = b.length, max = n + m;
  if (!n && !m) return [];
  const v = new Int32Array(2 * max + 2);
  // trace[d] = the diagonals -(d-1)…d-1 (step 2) as they were before step d: all the backtrack reads
  const trace: Int32Array[] = [];
  let cells = 0;
  for (let d = 0; d <= max; d++) {
    cells += d;
    if (cells > budget) return null;
    const row = new Int32Array(d);
    for (let i = 0, k = -(d - 1); i < d; i++, k += 2) row[i] = v[max + k]!;
    trace.push(row);
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[max + k - 1]! < v[max + k + 1]!) ? v[max + k + 1]! : v[max + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[max + k] = x;
      if (x >= n && y >= m) return backtrack(trace, a, b, d);
    }
  }
  return [];
}

function backtrack(trace: Int32Array[], a: string[], b: string[], dEnd: number): Op[] {
  const out: Op[] = [];
  let x = a.length, y = b.length;
  for (let d = dEnd; d >= 0; d--) {
    const row = trace[d]!;
    const at = (k: number) => row[(k + d - 1) >> 1]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { out.push(["=", a[x - 1]!]); x--; y--; }
    if (d > 0) { if (x === prevX) { out.push(["+", b[y - 1]!]); y--; } else { out.push(["-", a[x - 1]!]); x--; } }
  }
  return out.reverse();
}

/** Two very different texts: sentence by sentence, then word by word inside each changed block when it fits. */
function coarse(before: string, after: string): Op[] {
  const sa = sentences(before), sb = sentences(after);
  const ops = myers(sa, sb);
  if (!ops) return [["-", before], ["+", after]].filter(([, t]) => t) as Op[];
  const out: Op[] = [];
  let del: string[] = [], ins: string[] = [];
  const flush = () => {
    if (!del.length && !ins.length) return;
    const ta = tokens(del.join("")), tb = tokens(ins.join(""));
    const fine = myers(ta, tb);
    if (fine) out.push(...fine);
    else { if (del.length) out.push(["-", del.join("")]); if (ins.length) out.push(["+", ins.join("")]); }
    del = []; ins = [];
  };
  for (const [op, t] of ops) {
    if (op === "=") { flush(); out.push(["=", t]); }
    else if (op === "-") del.push(t); else ins.push(t);
  }
  flush();
  return out;
}

/** The two texts as runs of unchanged text and numbered changes. Whitespace-only edits between changes join them. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before), b = tokens(after);
  // trim the common start and end first (most rewrites keep most of the text)
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const midA = a.slice(s, a.length - e), midB = b.slice(s, b.length - e);
  const ops: Op[] = [
    ...a.slice(0, s).map((t) => ["=", t] as Op),
    ...(myers(midA, midB) ?? coarse(midA.join(""), midB.join(""))),
    ...a.slice(a.length - e).map((t) => ["=", t] as Op),
  ];
  const parts: DiffPart[] = [];
  let id = 0;
  let cur: { before: string; after: string } | null = null;
  const flush = () => { if (cur) { parts.push({ kind: "change", id: id++, ...cur }); cur = null; } };
  for (let i = 0; i < ops.length; i++) {
    const [op, t] = ops[i]!;
    if (op === "=") {
      // a lone space between two edits belongs to the same change
      if (cur && /^\s+$/.test(t) && i + 1 < ops.length && ops[i + 1]![0] !== "=") { cur.before += t; cur.after += t; continue; }
      flush();
      const last = parts.at(-1);
      if (last?.kind === "same") last.text += t; else parts.push({ kind: "same", text: t });
    } else {
      cur ??= { before: "", after: "" };
      if (op === "-") cur.before += t; else cur.after += t;
    }
  }
  flush();
  return parts;
}

/** The text with every change taken from `after`, except the ones listed in `keepBefore`. */
export function mergeParts(parts: DiffPart[], keepBefore: ReadonlySet<number>): string {
  return parts.map((p) => (p.kind === "same" ? p.text : keepBefore.has(p.id) ? p.before : p.after)).join("");
}
