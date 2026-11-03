// Authoritative source cursors and bounded historical read replay. CODEX, 2026-11-03.
import type { AssistantMessage } from "@homunculus/schemas";

export const READ_PAGE = 6000;
type Obj = Record<string, unknown>;
const obj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
type Step = AssistantMessage["steps"][number];
const LEGACY_SUFFIX = / …\(([\d,]+) more characters: read with fields \["([^"]+)"\] and offset (\d+)\)$/;
export interface ReadRange {
  field: string; offset: number; end: number; total: number; nextOffset: number | null; done: boolean;
  next: { id: string; fields: string[]; offset: number } | null;
}
export interface ReadScope { id: string; selector?: string; ranges: ReadRange[] }
export const readScope = (id: string, selector?: string): ReadScope => ({ id, selector, ranges: [] });

export function readText(text: string, field: string, scope: ReadScope, offset = 0): string {
  const start = Math.min(text.length, Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0);
  let end = Math.min(text.length, start + READ_PAGE);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!) && /[\uDC00-\uDFFF]/.test(text[end]!)) end--;
  if (text.length > READ_PAGE || offset > 0) {
    const nextOffset = end < text.length ? end : null;
    scope.ranges.push({ field, offset: start, end, total: text.length, nextOffset, done: nextOffset === null,
      next: nextOffset === null ? null : { id: scope.id, fields: [...(scope.selector ? [scope.selector] : []), field], offset: nextOffset } });
  }
  return text.slice(start, end);
}
export const withReadRanges = (data: Obj, scope: ReadScope): Obj => scope.ranges.length ? { ...data, _read: scope.ranges } : data;
export const isRead = (name: string) => name === "read" || name === "read_file";

/** Keep recent, distinct read bodies, bounded to 24k characters or one third of a known context window. */
export function retainedReads(messages: AssistantMessage[], contextLength?: number): Set<Step> {
  let budget = Math.min(24000, contextLength && contextLength > 0 ? Math.floor(contextLength * 3.6 / 3) : 24000);
  const keep = new Set<Step>(), seen = new Set<string>();
  const steps = messages.flatMap(m => m.steps);
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!; if (!isRead(s.name) || s.error) continue;
    let args = s.args;
    try { args = JSON.stringify(JSON.parse(args), Object.keys(JSON.parse(args)).sort()); } catch { /* Keep malformed arguments distinct. */ }
    const key = `${s.name}|${args}`; if (seen.has(key)) continue; seen.add(key);
    const cost = excerptRead(s, false).length;
    if (cost <= budget) { keep.add(s); budget -= cost; }
  }
  return keep;
}

/** Old saved pages used a suffix inside the text. Recover its original source range before excerpting. */
function legacyRanges(data: unknown, args: Obj): ReadRange[] {
  const ranges: ReadRange[] = [];
  const fields = Array.isArray(args.fields) ? args.fields.filter((f): f is string => typeof f === "string") : [];
  const selector = fields.find(f => f.startsWith("variant:") || f.startsWith("entry:"));
  const visit = (v: unknown, path: string) => {
    if (typeof v === "string") {
      const m = LEGACY_SUFFIX.exec(v);
      if (m) {
        const end = Number(m[3]), total = end + Number(m[1]!.replaceAll(",", "")), field = m[2]!;
        ranges.push({ field, offset: end - v.slice(0, m.index).length, end, total, nextOffset: end, done: false, next: { id: String(args.id ?? ""), fields: [...(selector ? [selector] : []), field], offset: end } });
      } else if (fields.includes(path)) {
        const start = typeof args.offset === "number" ? args.offset : 0, end = start + v.length;
        ranges.push({ field: path, offset: start, end, total: end, nextOffset: null, done: true, next: null });
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}.${i}`));
    else if (obj(v)) for (const [k, x] of Object.entries(v)) if (k !== "_read") visit(x, path ? `${path}.${k}` : k);
  };
  visit(data, ""); return ranges;
}

/** An excerpt is valid JSON with the source cursor intact, never a 400-character cut through a JSON string. */
export function excerptRead(step: Pick<Step, "result" | "args" | "name">, excerpted = true): string {
  try {
    const parsed: unknown = JSON.parse(step.result), args: unknown = JSON.parse(step.args);
    const hasRanges = obj(parsed) && Array.isArray(parsed._read);
    const ranges = hasRanges ? parsed._read as unknown[] : step.name === "read" ? legacyRanges(parsed, obj(args) ? args : {}) : [];
    const clean = (v: unknown): unknown => typeof v === "string" ? v.replace(LEGACY_SUFFIX, "") : Array.isArray(v) ? v.map(clean)
      : obj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v;
    const data = !hasRanges && ranges.length ? clean(parsed) : parsed;
    if (!excerpted) return !hasRanges && ranges.length && obj(data) ? JSON.stringify({ ...data, _read: ranges }) : step.result;
    const preview = (v: unknown): unknown => typeof v === "string" ? v.slice(0, 120) : Array.isArray(v) ? v.slice(0, 10).map(preview)
      : obj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "_read" && step.name === "read" ? x : preview(x)])) : v;
    return JSON.stringify({ ...(obj(data) ? preview(data) as Obj : { data: preview(data) }), ...(ranges.length ? { _read: ranges } : {}),
      _replay: { excerpted: true, note: "Earlier read body preview only. Source ranges/cursors are unchanged; preview length is not a source offset. Re-read only if this task needs omitted text." } });
  } catch {
    if (!excerpted) return step.result;
    // Text/file reads keep their continuation footer; that footer refers to the original source, not this preview.
    const footer = step.result.match(/\n\([^\n]*(?:offset|lines)[^\n]*\)$/)?.[0] ?? "";
    return `${step.result.slice(0, 220)} …[Earlier read excerpted; do not infer source offsets from preview length.]${footer}`;
  }
}
