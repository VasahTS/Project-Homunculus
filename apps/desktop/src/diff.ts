// Homunculus 2 — word-level differences between two texts (the rewrite comparison, D-048). Author: CLAUDE, 2026-10-30.
// Myers' O(ND) algorithm over words, spaces and punctuation, so a change reads like an editor's mark-up. Neighbouring
// deletions and insertions form one "change", which can be kept or put back on its own.

export type DiffPart = { kind: "same"; text: string } | { kind: "change"; id: number; before: string; after: string };

const tokens = (t: string) => t.match(/\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}]/gu) ?? [];

/** Myers' shortest edit script on token arrays; returns [op, token] with op "=" | "-" | "+". */
function myers(a: string[], b: string[]): Array<["=" | "-" | "+", string]> {
  const n = a.length, m = b.length, max = n + m;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[max + k - 1]! < v[max + k + 1]!) ? v[max + k + 1]! : v[max + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[max + k] = x;
      if (x >= n && y >= m) return backtrack(trace, a, b, d, max);
    }
  }
  return [];
}

function backtrack(trace: Int32Array[], a: string[], b: string[], dEnd: number, max: number): Array<["=" | "-" | "+", string]> {
  const out: Array<["=" | "-" | "+", string]> = [];
  let x = a.length, y = b.length;
  for (let d = dEnd; d >= 0; d--) {
    const v = trace[d]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && v[max + k - 1]! < v[max + k + 1]!) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : v[max + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { out.push(["=", a[x - 1]!]); x--; y--; }
    if (d > 0) { if (x === prevX) { out.push(["+", b[y - 1]!]); y--; } else { out.push(["-", a[x - 1]!]); x--; } }
  }
  return out.reverse();
}

/** The two texts as runs of unchanged text and numbered changes. Whitespace-only edits between changes join them. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before), b = tokens(after);
  // trim the common start and end first (most rewrites keep most of the text)
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const ops: Array<["=" | "-" | "+", string]> = [
    ...a.slice(0, s).map((t) => ["=", t] as ["=", string]),
    ...myers(a.slice(s, a.length - e), b.slice(s, b.length - e)),
    ...a.slice(a.length - e).map((t) => ["=", t] as ["=", string]),
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
