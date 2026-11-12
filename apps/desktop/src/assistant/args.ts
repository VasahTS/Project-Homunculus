// Homunculus 2 — tool arguments as models really send them (D-120). Author: CLAUDE, 2026-11-12.
// Some models write tool calls in an XML-like format that the provider turns back into JSON without knowing the
// shape of nested values (our `changes` / `data` are open objects). What arrives then is still unambiguous, just
// wrapped: a list as { "item": [...] } (or { "item": {...} } for one element), `true` as "true", `100` as "100",
// an empty list as "", a list or object as JSON text. Seen with MiniMax M3.1 Flash on NanoGPT: 14 failed `change`
// calls in a row, none of them the model's fault. We undo those wrappings before validating, guided by the app's own
// data shapes (a key is coerced only when no schema allows a string there), so a real mistake still fails.
import * as S from "@homunculus/schemas";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Operation keys used inside `changes` (entries, variants, blocks…): always lists. */
const OP_KEYS = ["add", "update", "remove", "order"];

interface KeyKinds { bool: Set<string>; num: Set<string>; text: Set<string>; nested: Set<string> }
let kinds: KeyKinds | null = null;

/** Every object key in the app's schemas, by what it may hold. */
function keyKinds(): KeyKinds {
  if (kinds) return kinds;
  const k: KeyKinds = { bool: new Set(), num: new Set(), text: new Set(), nested: new Set() };
  const seen = new Set<unknown>();
  const leaf = (s: unknown, out: Set<string>, depth = 0): void => {
    const def = (s as { _zod?: { def?: Obj } })?._zod?.def;
    if (!def || depth > 8) return;
    switch (def.type) {
      case "boolean": out.add("bool"); break;
      case "number": case "int": case "bigint": out.add("num"); break;
      case "string": case "enum": case "literal": case "template_literal": out.add("text"); break;
      case "array": case "tuple": case "object": case "record": case "map": case "set": out.add("nested"); walk(s); break;
      case "union": for (const o of (def.options as unknown[]) ?? []) leaf(o, out, depth + 1); break;
      case "intersection": leaf(def.left, out, depth + 1); leaf(def.right, out, depth + 1); break;
      case "pipe": leaf(def.in, out, depth + 1); break;
      case "lazy": try { leaf((def.getter as () => unknown)(), out, depth + 1); } catch { /* ignore */ } break;
      default: if (def.innerType) leaf(def.innerType, out, depth + 1); else out.add("text"); // unknown/any: leave as is
    }
  };
  const walk = (s: unknown): void => {
    if (seen.has(s)) return; seen.add(s);
    const def = (s as { _zod?: { def?: Obj } })?._zod?.def;
    if (!def) return;
    if (def.type === "object") {
      for (const [key, v] of Object.entries((def.shape as Obj) ?? {})) {
        const out = new Set<string>(); leaf(v, out);
        for (const o of out) (k as unknown as Record<string, Set<string>>)[o]!.add(key);
      }
      if (def.catchall) walk(def.catchall);
    } else if (def.type === "array") walk(def.element);
    else if (def.type === "tuple") for (const i of (def.items as unknown[]) ?? []) walk(i);
    else if (def.type === "record" || def.type === "map") walk(def.valueType);
    else if (def.type === "union") for (const o of (def.options as unknown[]) ?? []) walk(o);
    else if (def.type === "intersection") { walk(def.left); walk(def.right); }
    else if (def.type === "pipe") walk(def.in);
    else if (def.innerType) walk(def.innerType);
  };
  for (const v of Object.values(S)) walk(v);
  kinds = k;
  return k;
}

const parsesAsJson = (t: string) => { try { return { ok: true as const, v: JSON.parse(t) as unknown }; } catch { return { ok: false as const, v: undefined }; } };

/** Undoes the wrappings above. Anything it does not recognize is passed through unchanged for the normal checks. */
export function looseArgs(v: unknown, key = ""): unknown {
  const k = keyKinds();
  const textOk = k.text.has(key);
  if (typeof v === "string") {
    const t = v.trim();
    if (!textOk && (OP_KEYS.includes(key) || k.nested.has(key) || key === "changes" || key === "data") && /^[[{]/.test(t)) {
      const p = parsesAsJson(t); if (p.ok) return looseArgs(p.v, key);
    }
    if (OP_KEYS.includes(key) && t === "") return undefined;
    if (!textOk && k.bool.has(key) && (t === "true" || t === "false")) return t === "true";
    if (!textOk && k.num.has(key) && t !== "" && Number.isFinite(Number(t))) return Number(t);
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => looseArgs(x));
  if (isObj(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === "item") { const x = looseArgs(v.item, key); return Array.isArray(x) ? x : x === undefined ? [] : [x]; }
    const out: Obj = {};
    for (const [kk, vv] of Object.entries(v)) { const x = looseArgs(vv, kk); if (x !== undefined) out[kk] = x; }
    return out;
  }
  return v;
}

/** A validation error the model can act on: one short line per problem with its path, not a JSON dump. */
export function errorText(e: unknown): string {
  const issues = (e as { issues?: Array<{ path?: PropertyKey[]; message?: string }> })?.issues;
  if (!Array.isArray(issues) || !issues.length) return e instanceof Error ? e.message : String(e);
  const lines = issues.slice(0, 6).map((i) => {
    const path = (i.path ?? []).map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`)).join("").replace(/^\./, "");
    return `${path ? `${path}: ` : ""}${(i.message ?? "invalid").replace(/^Invalid input: /, "")}.`;
  });
  return `${lines.join(" ")}${issues.length > 6 ? ` (+${issues.length - 6} more)` : ""} Call guide() for the field types.`;
}
