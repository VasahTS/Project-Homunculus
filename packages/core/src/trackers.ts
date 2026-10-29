// Homunculus 2 — trackers driven only by their field set (BLUEPRINT §4.5). Author: CLAUDE, 2026-10-27.
// v2 same day (D-017): sections, required fields, lists with columns, characters added by the story.
//
// A tracker is an agent with output "state" + a field set (TrackerSchema). Nothing here knows
// WHAT is tracked: the user (or starter data) decides the fields. From the field set alone this file:
//  - tells the AI which fields exist and what an answer looks like (trackerInstruction),
//  - checks and cleans the AI's answer before it is saved (normalizeTrackerAnswer),
//  - writes the short "current scene" text that goes back into the main prompt (trackerSummary).
//
// Values are stored in the tracker's own state namespace:
//  - global field:        { key: value }
//  - per character field: { key: { <who>: value } }      who = character id, "user", or "n:<Name>" for
//                                                          characters the tracker added from the story
//  - per pair field:      { key: { "<whoA>→<whoB>": value } }
// The AI reads and writes NAMES; the ids stay inside the app (renaming a character is safe).
import type { TrackerField, TrackerSchema } from "@homunculus/schemas";

/** Someone who can have per-character values. */
export interface TrackerCastMember { id: string; name: string }

export const PAIR = "→";
export const USER_ID = "user";
const ADDED = "n:";

export interface ListItem { name: string; qty?: number }
type Row = Record<string, unknown>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const hasColumns = (f: TrackerField) => f.type === "list" && f.fields.length > 0;

// ---------------------------------------------------------------- who has values

/**
 * Everyone who can have per-character values in this field set: the cast, the user (unless the
 * set is cast-only) and, for "anyone" sets, the characters already added from the story.
 */
export function trackerPeople(schema: TrackerSchema, values: Record<string, unknown> | undefined,
  cast: TrackerCastMember[], userName: string, withUser = true): TrackerCastMember[] {
  const people = [...cast];
  // in Director mode the user is not in the story, so nobody tracks them (D-031)
  if (schema.characters !== "cast" && withUser) people.push({ id: USER_ID, name: userName });
  if (schema.characters === "anyone" && values) {
    for (const f of schema.fields) {
      if (f.scope === "global" || !isObj(values[f.key])) continue;
      for (const k of Object.keys(values[f.key] as object)) {
        for (const id of f.scope === "perPair" ? k.split(PAIR) : [k]) {
          if (id.startsWith(ADDED) && !people.some((p) => p.id === id)) people.push({ id, name: id.slice(ADDED.length) });
        }
      }
    }
  }
  return people;
}

// ---------------------------------------------------------------- what the AI is told

function simpleExample(f: TrackerField): unknown {
  switch (f.type) {
    case "number": return f.min ?? 0;
    case "meter": return Math.round(((f.min ?? 0) + (f.max ?? 100)) / 2);
    case "status": return f.options[0] ?? "…";
    case "list": return hasColumns(f) ? [Object.fromEntries(f.fields.map((c) => [c.key, simpleExample(c)]))] : ["…"];
    case "group": return Object.fromEntries(f.fields.filter((s) => !s.lockedForAgents).map((s) => [s.key, simpleExample(s)]));
    default: return "…";
  }
}

function describeType(f: TrackerField): string {
  switch (f.type) {
    case "number": return `a number${f.min !== undefined ? `, at least ${f.min}` : ""}${f.max !== undefined ? `, at most ${f.max}` : ""}`;
    case "meter": return `a whole number from ${f.min ?? 0} to ${f.max ?? 100}`;
    case "status": return `one of: ${f.options.map((o) => JSON.stringify(o)).join(", ")}`;
    case "list":
      return hasColumns(f)
        ? `a list of rows, each {${f.fields.map((c) => `"${c.key}": ${describeType(c)}${c.help ? ` (${c.help})` : ""}`).join("; ")}}; write the WHOLE list`
        : 'a list of short items; write the WHOLE list (an item can be {"name": "…", "qty": 2} when the amount matters)';
    case "datetime": return "the in-story date and/or time, as short text";
    case "group": return `an object with: ${f.fields.map((s) => `"${s.key}" (${describeType(s)})`).join("; ")}`;
    default: return "short text";
  }
}

function pairKeys(people: TrackerCastMember[]): string[] {
  return people.flatMap((a) => people.filter((b) => b !== a).map((b) => `${a.name}${PAIR}${b.name}`));
}

/** The part of a tracker agent's prompt that explains its fields and the answer format (macros not yet applied). */
export function trackerInstruction(schema: TrackerSchema, people: TrackerCastMember[]): string {
  const writable = schema.fields.filter((f) => !f.lockedForAgents);
  const names = people.map((c) => c.name);
  const who = schema.characters === "anyone"
    ? `Characters: ${names.join(", ") || "none yet"}. You may ADD a character the story names (a proper name, someone who did or said something); write them by name. Never remove anyone.`
    : `Characters: ${names.join(", ") || "none in the scene"}. Only these characters.`;
  const lines: string[] = [];
  let section = "";
  for (const f of writable) {
    if (f.section !== section) { section = f.section; if (section) lines.push(`${section}:`); }
    const scope = f.scope === "perCharacter" ? " One value per character, keyed by name."
      : f.scope === "perPair" ? ` One value per pair, keyed "A${PAIR}B" (how A stands toward B).` : "";
    // optional fields say so (29/10: Daniel needs "Mana" left out for characters who don't use magic)
    const req = f.required ? " ALWAYS FILLED (from the moment it applies, never empty)." : f.scope === "global" ? "" : " Optional: leave it out for anyone it does not apply to.";
    lines.push(`- "${f.key}" — ${f.label}: ${describeType(f)}.${scope}${req}${f.help ? ` ${f.help}` : ""}`);
  }
  const readOnly = schema.fields.filter((f) => f.lockedForAgents).map((f) => `"${f.key}" (${f.label})`);
  const example: Record<string, unknown> = {};
  const exampleNames = names.length ? names.slice(0, 2) : ["Name"];
  for (const f of writable) {
    const v = simpleExample(f);
    if (f.scope === "perCharacter") example[f.key] = Object.fromEntries(exampleNames.map((n) => [n, v]));
    else if (f.scope === "perPair") example[f.key] = { [pairKeys(people)[0] ?? `A${PAIR}B`]: v };
    else example[f.key] = v;
  }
  const hasPeople = schema.fields.some((f) => f.scope !== "global");
  return [
    `## Fields of "${schema.name}"`,
    ...(hasPeople ? [who] : []),
    ...lines,
    readOnly.length ? `Read-only (the user sets these; read them, never write them): ${readOnly.join(", ")}.` : "",
    "Write only the fields whose value changed (and REQUIRED fields that are still empty). If nothing changed, answer {}.",
    `Example answer: ${JSON.stringify(example)}`,
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------- cleaning the AI's answer

const clamp = (n: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

/** One value made to fit its field, or undefined when it cannot fit. `prev` lets groups keep untouched sub-fields. */
export function coerceFieldValue(f: TrackerField, v: unknown, prev?: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  switch (f.type) {
    case "number": case "meter": {
      const n = typeof v === "number" ? v : typeof v === "string" && /\d/.test(v) ? Number(v.replace(/[^\d.+-]/g, "")) : NaN;
      if (!Number.isFinite(n)) return undefined;
      const c = f.type === "meter" ? clamp(n, f.min ?? 0, f.max ?? 100) : clamp(n, f.min, f.max);
      return f.type === "meter" ? Math.round(c) : c;
    }
    case "status": {
      const s = String(v).trim().toLowerCase();
      return f.options.find((o) => o.toLowerCase() === s);
    }
    case "list": {
      if (!Array.isArray(v)) return undefined;
      if (hasColumns(f)) {
        const rows: Row[] = [];
        for (const it of v) {
          const raw: Record<string, unknown> = isObj(it) ? it : typeof it === "string" && it.trim() ? { [f.fields[0]!.key]: it } : {};
          const row: Row = {};
          for (const c of f.fields) {
            const val = raw[c.key] ?? raw[c.label] ?? raw[c.label.toLowerCase()];
            const cv = coerceFieldValue(c, val);
            if (cv !== undefined) row[c.key] = cv;
          }
          if (Object.keys(row).length) rows.push(row);
        }
        return rows;
      }
      const items: ListItem[] = [];
      for (const it of v) {
        if ((typeof it === "string" || typeof it === "number") && String(it).trim()) items.push({ name: String(it).trim() });
        else if (isObj(it) && typeof it.name === "string" && it.name.trim()) {
          const q = Number(it.qty);
          items.push(it.qty !== undefined && Number.isFinite(q) ? { name: it.name.trim(), qty: q } : { name: it.name.trim() });
        }
      }
      return items;
    }
    case "group": {
      if (!isObj(v)) return undefined;
      const out: Record<string, unknown> = isObj(prev) ? { ...prev } : {};
      let changed = false;
      for (const s of f.fields) {
        if (s.lockedForAgents) continue;
        const c = coerceFieldValue(s, v[s.key]);
        if (c !== undefined) { out[s.key] = c; changed = true; }
      }
      return changed ? out : undefined;
    }
    default:
      return typeof v === "string" ? v.trim() || undefined : typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;
  }
}

/**
 * Turns the AI's answer into the values to save, using only the field set.
 * Unknown fields, read-only fields, unknown characters (in cast-only sets) and values that don't
 * fit are left out and reported in `ignored` (shown in the agent's log, never silently lost).
 * Per-character / per-pair values are merged with the current ones, so writing one character never
 * erases the others. In "anyone" sets a new name becomes a new character.
 */
export function normalizeTrackerAnswer(schema: TrackerSchema, answer: Record<string, unknown>,
  current: Record<string, unknown> | undefined, people: TrackerCastMember[]): { values: Record<string, unknown>; ignored: string[] } {
  const values: Record<string, unknown> = {};
  const ignored: string[] = [];
  const known = [...people];
  const idOf = (name: string): string | undefined => {
    const n = name.trim().replace(/^\{\{user\}\}$/i, people.find((p) => p.id === USER_ID)?.name ?? "{{user}}");
    if (!n) return undefined;
    const lower = n.toLowerCase();
    const hit = known.find((p) => p.name.toLowerCase() === lower || p.id.toLowerCase() === lower);
    if (hit) return hit.id;
    if (schema.characters !== "anyone") return undefined;
    const id = `${ADDED}${n}`;
    known.push({ id, name: n });
    return id;
  };
  for (const [rawKey, v] of Object.entries(answer)) {
    const f = schema.fields.find((x) => x.key === rawKey)
      ?? schema.fields.find((x) => x.key.toLowerCase() === rawKey.toLowerCase() || x.label.toLowerCase() === rawKey.toLowerCase());
    if (!f) { ignored.push(`"${rawKey}": not a field of this tracker`); continue; }
    if (f.lockedForAgents) { ignored.push(`"${f.key}": only the user may change it`); continue; }
    if (f.scope === "global") {
      const c = coerceFieldValue(f, v, current?.[f.key]);
      if (c === undefined) ignored.push(`"${f.key}": ${JSON.stringify(v)} does not fit (${describeType(f)})`);
      else values[f.key] = c;
      continue;
    }
    if (!isObj(v)) { ignored.push(`"${f.key}": expected one value per ${f.scope === "perPair" ? "pair" : "character"}`); continue; }
    const prev = current?.[f.key];
    const merged: Record<string, unknown> = isObj(prev) ? { ...prev } : {};
    let changed = false;
    for (const [who, val] of Object.entries(v)) {
      let id: string | undefined;
      if (f.scope === "perPair") {
        const [a, b] = who.split(/\s*(?:→|->|>)\s*/);
        const ia = a ? idOf(a) : undefined;
        const ib = b ? idOf(b) : undefined;
        id = ia && ib && ia !== ib ? `${ia}${PAIR}${ib}` : undefined;
      } else id = idOf(who);
      if (!id) { ignored.push(`"${f.key}": "${who}" is not in the scene`); continue; }
      const c = coerceFieldValue(f, val, merged[id]);
      if (c === undefined) { ignored.push(`"${f.key}" for ${who}: ${JSON.stringify(val)} does not fit (${describeType(f)})`); continue; }
      merged[id] = c;
      changed = true;
    }
    if (changed) values[f.key] = merged;
  }
  return { values, ignored };
}

// ---------------------------------------------------------------- showing values

/** A value as short text (for the prompt and the panel). */
export function formatFieldValue(f: TrackerField, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  switch (f.type) {
    case "meter": return `${v as number}/${f.max ?? 100}`;
    case "list":
      if (!Array.isArray(v) || !v.length) return "—";
      if (hasColumns(f)) {
        return (v as Row[]).map((r) => f.fields.map((c) => (r[c.key] === undefined || r[c.key] === "" ? "" : formatFieldValue(c, r[c.key])))
          .filter(Boolean).join(" — ")).join("; ");
      }
      return (v as ListItem[]).map((i) => (i.qty !== undefined && i.qty !== 1 ? `${i.name} ×${i.qty}` : i.name)).join(", ");
    case "group": return f.fields.map((s) => `${s.label}: ${formatFieldValue(s, (v as Row)[s.key])}`).join(", ");
    default: return String(v);
  }
}

/** Replaces ids by names in a tracker's values (what the AI sees). */
export function valuesWithNames(schema: TrackerSchema, values: Record<string, unknown> | undefined, people: TrackerCastMember[]): Record<string, unknown> {
  const name = (id: string) => people.find((c) => c.id === id)?.name ?? (id.startsWith(ADDED) ? id.slice(ADDED.length) : id);
  const out: Record<string, unknown> = {};
  for (const f of schema.fields) {
    const v = values?.[f.key];
    if (v === undefined) continue;
    if (f.scope === "global" || !isObj(v)) { out[f.key] = v; continue; }
    out[f.key] = Object.fromEntries(Object.entries(v).map(([k, x]) =>
      [f.scope === "perPair" ? k.split(PAIR).map(name).join(PAIR) : name(k), x]));
  }
  return out;
}

/** The short text a tracker adds to the main prompt ("current scene"). Empty when there is nothing to say. */
export function trackerSummary(schema: TrackerSchema, values: Record<string, unknown> | undefined, people: TrackerCastMember[]): string {
  if (!values) return "";
  const shown = schema.fields.filter((f) => f.toPrompt && values[f.key] !== undefined && formatFieldValue(f, values[f.key]) !== "—");
  if (!shown.length) return "";
  const lines: string[] = [];
  for (const f of shown.filter((x) => x.scope === "global")) lines.push(`${f.label}: ${formatFieldValue(f, values[f.key])}`);
  const named = valuesWithNames(schema, values, people);
  const perWho = new Map<string, string[]>();
  for (const f of shown.filter((x) => x.scope !== "global")) {
    for (const [who, v] of Object.entries((named[f.key] ?? {}) as Record<string, unknown>)) {
      const text = formatFieldValue(f, v);
      if (text === "—") continue;
      if (!perWho.has(who)) perWho.set(who, []);
      perWho.get(who)!.push(`${f.label}: ${text}`);
    }
  }
  // characters out of the scene: name + the presence field's section only (e.g. role, mood, where they went)
  const pf = schema.presence ? schema.fields.find((f) => f.key === schema.presence!.field) : undefined;
  const presenceMap = pf ? (named[pf.key] ?? {}) as Record<string, unknown> : {};
  const away: string[] = [];
  for (const [who, parts] of perWho) {
    const p = presenceMap[who];
    if (pf && p !== undefined && String(p).toLowerCase() !== schema.presence!.value.toLowerCase()) {
      const brief = shown.filter((f) => f.section === pf.section && f !== pf && f.scope === "perCharacter")
        .map((f) => formatFieldValue(f, ((named[f.key] ?? {}) as Record<string, unknown>)[who])).filter((t) => t !== "—");
      away.push(brief.length ? `${who} (${brief.join(", ")})` : who);
    } else lines.push(`${who} — ${parts.join("; ")}`);
  }
  if (away.length) lines.push(`Not in the scene: ${away.join("; ")}`);
  return lines.length ? `[${schema.name}]\n${lines.join("\n")}` : "";
}

/** A field key made from a label: "Trust in me" → "trust_in_me". */
export function fieldKeyFrom(label: string, taken: Iterable<string> = []): string {
  const base = (label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field");
  const key = /^[a-z]/.test(base) ? base : `f_${base}`;
  const used = new Set(taken);
  let k = key;
  for (let i = 2; used.has(k); i++) k = `${key}_${i}`;
  return k;
}
