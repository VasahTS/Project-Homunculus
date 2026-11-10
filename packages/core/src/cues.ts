// Homunculus 2 — the cue engine (D-113). Author: CLAUDE, 2026-11-10.
//
// A cue runs once per turn, before the agents and the prompt (turn.ts step 2b), with no AI call:
//   1. signals  — read the chat now (word counts, messages, chance, clock, a tracker field, the kind of generation);
//   2. values   — what it remembers: each value's first passing rule sets / adds / resets it, else keep or reset;
//   3. groups   — each group picks text(s) whose own tests pass (first / random by weight / rotate / all), with
//                 don't-repeat, chance and cooldown, wraps them and says where they go.
// Everything here is pure: the turn gives it the messages, the state before this turn and a random sequence, and
// writes what it returns into the world state at the message being answered (so a swipe starts from the same place
// and a counter never adds twice). Nothing here knows about the database or the prompt's layout.
import type { AgentConfig, Cue, CueCondition, CueFrom, CueGroup, CueInput, CueReport, CueSignal, CueText, CueTextInput, GenerationType, LoreEntry, UserRole } from "@homunculus/schemas";
import { Cue as CueSchema } from "@homunculus/schemas";
import { parseKeyRegex, type LoreDepthItem } from "./lorebook.ts";
import { estimateTokens, type LoreForPrompt, type PromptInjection } from "./presets.ts";
import { readStatePath, type ResolvedState } from "./state.ts";

/** One message as a cue reads it (already with {{char}}/{{user}} filled in). */
export interface CueMessage { from: "user" | "ai"; text: string }

export interface CueRunInput {
  cue: Cue;
  /** The messages on this branch up to (and including) the one being answered, oldest first, only what the AI sees. */
  history: CueMessage[];
  /** The cue's own values before this turn (its namespace in the state at the previous message). */
  previous: Record<string, unknown> | undefined;
  /** The world state now (trackers, other cues), for tracker signals and conditions. */
  state: ResolvedState;
  type: GenerationType;
  role: UserRole;
  /** The rolls of this turn (repeatable on a swipe when the cue says so). */
  random: () => number;
  /** Clock time (ms). */
  now: number;
  /** Macros in texts ({{char}}, {{user}}, {{state.…}}…). `own` = the cue's values after this turn. */
  expand?: (text: string, own: Record<string, unknown>) => string;
  countTokens?: (text: string) => number;
}

/** A text a cue wrote this turn, and where it goes. */
export interface CueOutput { cueId: string; groupKey: string; text: string; placement: CueGroup["placement"] }

export interface CueRunResult {
  /** What to write into the cue's namespace (its values and its own bookkeeping). Empty = nothing changes. */
  values: Record<string, unknown>;
  texts: CueOutput[];
  report: CueReport;
}

// ------------------------------------------------------------------ words

/** Words that turn a match around when they come just before it ("did not kiss"). */
export const NEGATIONS = ["not", "no", "never", "don't", "dont", "doesn't", "didn't", "won't", "can't", "cannot", "isn't", "wasn't",
  "aren't", "weren't", "nor", "without", "não", "nao", "nunca", "sem", "nem", "jamais", "ni", "sin"];

export interface WordOptions { wholeWords: boolean; caseSensitive: boolean; ignoreNegated?: boolean }

/** Curly quotes and apostrophes as plain ones, so "don’t" and "don't" are the same word. */
const plainQuotes = (text: string) => text.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, "\"");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
const LETTER = "[\\p{L}\\p{N}_]";

/** A word, a phrase (any spaces between its words) or a `/regex/flags` → a global regex. Invalid regex = null. */
export function wordPattern(word: string, o: WordOptions): RegExp | null {
  const w = plainQuotes(word.trim());
  if (!w) return null;
  const re = w.startsWith("/") ? parseKeyRegex(w) : null;
  if (re) {
    const flags = new Set([...re.flags, "g", "u"]);
    if (!o.caseSensitive) flags.add("i");
    try { return new RegExp(re.source, [...flags].join("")); } catch { return null; }
  }
  const body = w.split(/\s+/).map(escapeRe).join("\\s+");
  const src = o.wholeWords ? `(?<!${LETTER})${body}(?!${LETTER})` : body;
  return new RegExp(src, `gu${o.caseSensitive ? "" : "i"}`);
}

/** The few words just before a position, in the same sentence (to look for a negation). */
function wordsBefore(text: string, at: number, n = 3): string[] {
  const sentence = text.slice(Math.max(0, at - 60), at).split(/[.!?;:\n]/).at(-1) ?? "";
  return sentence.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean).slice(-n);
}

/** How many times the words show up in the texts, and which ones did ("pins" → 2). */
export function countWords(texts: string[], words: string[], o: WordOptions): { total: number; hits: Record<string, number> } {
  const hits: Record<string, number> = {};
  let total = 0;
  const negations = new Set(NEGATIONS);
  for (const word of words) {
    const re = wordPattern(word, o);
    if (!re) continue;
    let n = 0;
    for (const raw of texts) {
      const text = plainQuotes(raw);
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        if (m[0] === "") { re.lastIndex++; continue; }
        if (o.ignoreNegated && wordsBefore(text, m.index).some((w) => negations.has(w))) continue;
        n++;
      }
    }
    if (n) { hits[word.trim()] = n; total += n; }
  }
  return { total, hits };
}

/** "pins ×2, wall, hand" (the most frequent first, at most 6). */
export function hitsText(hits: Record<string, number>): string {
  const list = Object.entries(hits).sort((a, b) => b[1] - a[1]);
  const shown = list.slice(0, 6).map(([w, n]) => (n > 1 ? `${w} ×${n}` : w)).join(", ");
  return list.length > 6 ? `${shown}…` : shown;
}

/** The texts of the last `last` messages, kept only when they come from `from`. */
function recent(history: CueMessage[], last: number, from: CueFrom): string[] {
  return history.slice(-Math.max(1, last)).filter((m) => from === "both" || m.from === from).map((m) => m.text);
}

// ------------------------------------------------------------------ conditions

const asText = (x: unknown) => (typeof x === "object" && x !== null ? JSON.stringify(x) : String(x ?? "")).trim().toLowerCase();

/** One test (the lorebook's rules, plus at least / at most). */
export function cueConditionHolds(c: CueCondition, ctx: Record<string, unknown>): boolean {
  const v = readStatePath(ctx as ResolvedState, c.path);
  const present = v !== undefined && v !== null && v !== "";
  if (c.op === "exists") return present;
  if (c.op === "missing") return !present;
  const a = asText(v), b = c.value.trim().toLowerCase();
  const na = typeof v === "boolean" ? Number(v) : Number(a), nb = Number(b);
  const numeric = a !== "" && b !== "" && Number.isFinite(na) && Number.isFinite(nb);
  switch (c.op) {
    case "equals": return numeric ? na === nb : a === b;
    case "notEquals": return numeric ? na !== nb : a !== b;
    case "contains": return a.includes(b);
    case "notContains": return !a.includes(b);
    case "greater": return numeric && na > nb;
    case "less": return numeric && na < nb;
    case "atLeast": return numeric && na >= nb;
    case "atMost": return numeric && na <= nb;
  }
  return false;
}

export function cueConditionsHold(list: CueCondition[], logic: "all" | "any", ctx: Record<string, unknown>): boolean {
  if (!list.length) return true;
  return logic === "any" ? list.some((c) => cueConditionHolds(c, ctx)) : list.every((c) => cueConditionHolds(c, ctx));
}

const OP_TEXT: Record<CueCondition["op"], string> = {
  equals: "is", notEquals: "is not", contains: "has", notContains: "lacks", exists: "is set", missing: "is empty",
  greater: ">", less: "<", atLeast: "≥", atMost: "≤",
};

/** "heat ≥ 5", "scene is active" — for receipts. */
export function conditionText(c: CueCondition): string {
  const path = c.path.replace(/^(signal|value)\./, "");
  return c.op === "exists" || c.op === "missing" ? `${path} ${OP_TEXT[c.op]}` : `${path} ${OP_TEXT[c.op]} ${c.value}`;
}

// ------------------------------------------------------------------ signals

/** Morning 5–11, afternoon 12–16, evening 17–20, night otherwise. */
export function periodOf(hour: number): "morning" | "afternoon" | "evening" | "night" {
  return hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 17 ? "afternoon" : hour >= 17 && hour < 21 ? "evening" : "night";
}

function readSignal(s: CueSignal, input: CueRunInput): { value: unknown; detail?: string } {
  switch (s.kind) {
    case "words": {
      const { total, hits } = countWords(recent(input.history, s.last, s.from), s.words, s);
      return { value: total, ...(total ? { detail: hitsText(hits) } : {}) };
    }
    case "messages":
      return { value: s.count === "both" ? input.history.length : input.history.filter((m) => m.from === s.count).length };
    case "chance": {
      const roll = input.random();
      return { value: roll * 100 < s.percent, detail: `${s.percent}%` };
    }
    case "clock": {
      const hour = new Date(input.now).getHours();
      return s.read === "hour" ? { value: hour } : { value: periodOf(hour), detail: `${hour}h` };
    }
    case "tracker": return { value: readStatePath(input.state, s.path) ?? "" };
    case "generation": return { value: input.type };
  }
}

// ------------------------------------------------------------------ values

const num = (x: unknown) => { const n = typeof x === "boolean" ? Number(x) : Number(x); return Number.isFinite(n) ? n : 0; };

// ------------------------------------------------------------------ texts

/** A text's own trigger (words, chance, messages) and tests. Returns why it is out, or "" when it may go in. */
function textBlocked(t: CueText, input: CueRunInput, ctx: Record<string, unknown>): string {
  if (!t.enabled || !t.text.trim()) return "off";
  if (input.history.length < t.minMessages) return `needs ${t.minMessages} messages`;
  if (!cueConditionsHold(t.when, t.logic, ctx)) return "tests";
  if (t.words) {
    const texts = recent(input.history, t.words.last, t.words.from);
    const has = (list: string[]) => countWords(texts, list, t.words!).total > 0;
    if (t.words.keys.length && !has(t.words.keys)) return "words";
    if (t.words.also.length && !has(t.words.also)) return "words";
    if (t.words.not.length && has(t.words.not)) return "words";
  }
  if (t.chance < 100 && input.random() * 100 >= t.chance) return "chance";
  return "";
}

/** One of several by weight (all weights 0 = the first). */
function byWeight<T extends { weight: number }>(list: T[], random: () => number): T | undefined {
  const total = list.reduce((n, x) => n + Math.max(0, x.weight), 0);
  if (!list.length) return undefined;
  if (total <= 0) return list[0];
  let r = random() * total;
  for (const x of list) { r -= Math.max(0, x.weight); if (r < 0) return x; }
  return list[list.length - 1];
}

const titleOf = (t: CueText) => t.title.trim() || (t.text.trim().split(/\s+/).slice(0, 6).join(" ") + (t.text.trim().split(/\s+/).length > 6 ? "…" : ""));

interface GroupMemory { last: Record<string, string[]>; cooldown: Record<string, number> }

function runGroup(g: CueGroup, input: CueRunInput, ctx: Record<string, unknown>, mem: GroupMemory):
  { picked: CueText[]; reason: string } {
  const count = input.history.length;
  const usedAt = mem.cooldown[g.key];
  if (g.cooldown > 0 && usedAt !== undefined && count - usedAt <= g.cooldown) {
    const left = g.cooldown - (count - usedAt) + 1;
    return { picked: [], reason: `cooldown: ${left} more message${left === 1 ? "" : "s"}` };
  }
  if (g.chance < 100 && input.random() * 100 >= g.chance) return { picked: [], reason: `chance (${g.chance}%) said no` };
  let candidates = g.items.filter((t) => !textBlocked(t, input, ctx));
  if (!candidates.length) return { picked: [], reason: g.items.length ? "nothing matched" : "no texts" };
  // "one of": among texts sharing a name, one stays (by weight)
  const shared = new Map<string, CueText[]>();
  for (const t of candidates) if (t.oneOf.trim()) shared.set(t.oneOf.trim(), [...(shared.get(t.oneOf.trim()) ?? []), t]);
  if (shared.size) {
    const keep = new Set([...shared.values()].map((list) => byWeight(list, input.random)!.id));
    candidates = candidates.filter((t) => !t.oneOf.trim() || keep.has(t.id));
  }
  const matched = candidates.length;
  // don't repeat the last N (while something else is left)
  const last = mem.last[g.key] ?? [];
  if (g.noRepeat > 0 && g.pick !== "all") {
    const recentIds = new Set(last.slice(-g.noRepeat));
    const fresh = candidates.filter((t) => !recentIds.has(t.id));
    if (fresh.length) candidates = fresh;
    else if (candidates.length > 1) candidates = candidates.filter((t) => t.id !== last[last.length - 1]);
  }
  switch (g.pick) {
    case "first": return { picked: [candidates[0]!], reason: matched > 1 ? `first of ${matched} that matched` : "it matched" };
    case "all": return { picked: candidates, reason: `${candidates.length} matched` };
    case "random": return { picked: [byWeight(candidates, input.random)!], reason: candidates.length > 1 ? `random from ${candidates.length}` : "the only one left" };
    case "rotate": {
      const prevIndex = g.items.findIndex((t) => t.id === last[last.length - 1]);
      const next = candidates.find((t) => g.items.indexOf(t) > prevIndex) ?? candidates[0]!;
      return { picked: [next], reason: `next in turn (${candidates.length} matched)` };
    }
  }
}

// ------------------------------------------------------------------ one cue

/** Runs one cue for one turn (pure). */
export function runCue(input: CueRunInput): CueRunResult {
  const { cue } = input;
  const report: CueReport = { cueId: cue.id, name: cue.name, namespace: cue.namespace, signals: [], values: [], groups: [], tokens: 0 };
  const w = cue.when;
  const skip = (why: string): CueRunResult => ({ values: {}, texts: [], report: { ...report, skipped: why } });
  if (w.generationTypes.length && !w.generationTypes.includes(input.type)) return skip(`not on ${input.type}`);
  if (w.roles.length && !w.roles.includes(input.role)) return skip(`not for the ${input.role} role`);
  if (input.history.length < w.minMessages) return skip(`starts after ${w.minMessages} messages`);

  const prev = input.previous ?? {};
  // 1. signals
  const signals: Record<string, unknown> = {};
  for (const s of cue.signals) {
    const r = readSignal(s, input);
    signals[s.key] = r.value;
    report.signals.push({ key: s.key, value: r.value as never, ...(r.detail ? { detail: r.detail } : {}) });
  }
  // 2. values, in order: a value sees the new values above it and its own old one
  const values: Record<string, unknown> = {};
  for (const v of cue.values) values[v.key] = v.key in prev ? prev[v.key] : v.initial;
  const ctx = () => ({ ...input.state, [cue.namespace]: { ...(input.state[cue.namespace] ?? {}), ...values }, signal: signals, value: values });
  for (const v of cue.values) {
    const before = values[v.key];
    const index = v.rules.findIndex((r) => cueConditionsHold(r.when, r.logic, ctx()));
    const rule = index >= 0 ? v.rules[index]! : undefined;
    let after: unknown, why: string;
    if (!rule) {
      after = v.otherwise === "keep" ? before : v.initial;
      why = v.otherwise === "keep" ? "kept (no rule matched)" : "reset (no rule matched)";
    } else {
      const tests = rule.when.length ? rule.when.map(conditionText).join(rule.logic === "any" ? " or " : " · ") : "always";
      after = rule.do === "set" ? rule.value : rule.do === "add" ? num(before) + num(rule.value) : v.initial;
      why = `${tests} → ${rule.do === "add" ? `add ${rule.value}` : rule.do === "set" ? `set ${rule.value}` : "reset"}`;
    }
    values[v.key] = after;
    report.values.push({ key: v.key, before: (before ?? null) as never, after: (after ?? null) as never, why });
  }
  // 3. groups
  const memory: GroupMemory = {
    last: { ...((prev._last as GroupMemory["last"] | undefined) ?? {}) },
    cooldown: { ...((prev._cooldown as GroupMemory["cooldown"] | undefined) ?? {}) },
  };
  const texts: CueOutput[] = [];
  const count = input.countTokens ?? estimateTokens;
  for (const g of cue.groups) {
    const { picked, reason } = runGroup(g, input, ctx(), memory);
    let tokens = 0;
    if (picked.length) {
      const fill = (t: string) => t.replace(/\{\{\s*(signal|value)\.([a-z][a-z0-9_]*)\s*\}\}/g, (_m, kind: string, key: string) => {
        const x = kind === "signal" ? signals[key] : values[key];
        return x === undefined || x === null ? "" : String(x);
      });
      const joined = picked.map((t) => fill(t.text).trim()).join(g.separator);
      const wrapped = g.wrap.trim() ? fill(g.wrap).replace(/\{\{\s*text\s*\}\}/gi, () => joined) : joined;
      const text = (input.expand ? input.expand(wrapped, values) : wrapped).trim();
      if (text) {
        tokens = count(text);
        texts.push({ cueId: cue.id, groupKey: g.key, text, placement: g.placement });
      }
      memory.last[g.key] = [...(memory.last[g.key] ?? []), ...picked.map((t) => t.id)].slice(-Math.max(1, g.noRepeat, g.items.length));
      memory.cooldown[g.key] = input.history.length;
    }
    report.groups.push({ key: g.key, name: g.name, picked: picked.map((t) => ({ id: t.id, title: titleOf(t) })), reason, position: g.placement.position, tokens });
    report.tokens += tokens;
  }
  const out: Record<string, unknown> = { ...values };
  if (cue.groups.length) { out._last = memory.last; out._cooldown = memory.cooldown; }
  return { values: out, texts, report };
}

// ------------------------------------------------------------------ into the prompt

/**
 * Cue texts → the prompt: places the lorebook has go with the lorebook's texts (after them), "in the chat" and "with the
 * agents' prompts" go as injections (so they show as their own parts, `agent:cue:<id>`).
 */
export function cueTextsForPrompt(texts: CueOutput[], lore: LoreForPrompt | undefined): { worldInfo: LoreForPrompt | undefined; injections: PromptInjection[] } {
  const injections: PromptInjection[] = [];
  if (!texts.length) return { worldInfo: lore, injections };
  const wi: Required<LoreForPrompt> = {
    before: [...(lore?.before ?? [])], after: [...(lore?.after ?? [])], depth: [...(lore?.depth ?? [])] as LoreDepthItem[],
    examplesTop: [...(lore?.examplesTop ?? [])], examplesBottom: [...(lore?.examplesBottom ?? [])],
    noteTop: [...(lore?.noteTop ?? [])], noteBottom: [...(lore?.noteBottom ?? [])], outlets: { ...(lore?.outlets ?? {}) },
  };
  let usedLore = false;
  for (const t of texts) {
    const p = t.placement;
    switch (p.position) {
      case "atDepth": injections.push({ agentId: `cue:${t.cueId}`, text: t.text, position: "depth", depth: p.depth, role: p.role }); break;
      case "agentPrompts": injections.push({ agentId: `cue:${t.cueId}`, text: t.text, position: "marker", depth: p.depth, role: p.role }); break;
      case "before": wi.before.push(t.text); usedLore = true; break;
      case "after": wi.after.push(t.text); usedLore = true; break;
      case "emTop": wi.examplesTop.push(t.text); usedLore = true; break;
      case "emBottom": wi.examplesBottom.push(t.text); usedLore = true; break;
      case "anTop": wi.noteTop.push(t.text); usedLore = true; break;
      case "anBottom": wi.noteBottom.push(t.text); usedLore = true; break;
      case "outlet": if (p.outletName.trim()) { (wi.outlets[p.outletName.trim()] = [...(wi.outlets[p.outletName.trim()] ?? [])]).push(t.text); usedLore = true; } break;
    }
  }
  return { worldInfo: usedLore || lore ? wi : undefined, injections };
}

// ------------------------------------------------------------------ making cues

/** "Scene Direction" → "cue-scene-direction". */
export function cueNamespace(name: string, taken: Iterable<string> = []): string {
  const base = `cue-${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "rule"}`;
  const used = new Set(taken);
  let ns = base;
  for (let i = 2; used.has(ns); i++) ns = `${base}-${i}`;
  return ns;
}

/**
 * An agent with "No AI call" (runMode "text", D-047) → a cue of one text that gives the same prompt (D-113: the mode moves
 * to cues). Its style and variables are written in with their default values; `notes` says what a story or chat had
 * changed and what did not fit.
 */
export function cueFromTextAgent(a: AgentConfig, opts: { id: string; namespace: string; text: string }): { cue: Cue; notes: string[] } {
  const notes: string[] = [];
  const c = a.conditions;
  const keywords = c.keywords.filter((k) => k.trim());
  const position = a.injection?.position === "depth" ? "atDepth" : "agentPrompts";
  if (a.output !== "inject") notes.push(`Its result was "${a.output}"; cues only add text to the prompt.`);
  if (!a.triggers.some((t) => t.on === "turn" && t.phase === "before")) notes.push("It did not run before each reply; a cue runs before each reply.");
  if (a.styles?.length) notes.push("Its style is written in with the default one; stories or chats that picked another style get the default.");
  if (a.variables?.length) notes.push("Its variables are written in with their default values.");
  const item: CueTextInput = {
    id: "text", title: a.name, text: opts.text,
    when: c.state.map((s) => ({ path: s.path, op: "equals" as const, value: typeof s.equals === "string" ? s.equals : JSON.stringify(s.equals) })),
    chance: c.probability,
    // a text agent read its last message(s) for keywords, as plain text inside words (not whole words)
    ...(keywords.length ? { words: { keys: keywords, last: Math.max(1, a.input.messages), wholeWords: false } } : {}),
  };
  const input: CueInput = {
    id: opts.id, name: a.name, help: a.help, ...(a.icon ? { icon: a.icon } : {}), ...(a.author ? { author: a.author } : {}),
    namespace: opts.namespace,
    groups: [{ key: "text", name: a.name, pick: "all", placement: { position, depth: a.injection?.depth ?? 4, role: a.injection?.role ?? "system" }, items: [item] }],
    when: { generationTypes: c.generationTypes, roles: c.roles, minMessages: c.minMessages },
    randomness: a.randomness,
    source: { kind: "agent", from: a.id },
    original: a as never,
  };
  return { cue: CueSchema.parse(input), notes };
}

/**
 * Lorebook entries that are writing rules (JanitorAI "lorebook scripts", D-113) → one cue: a group "all that match" where
 * every entry is a text with the same trigger (keys, secondary keys, chance, delay, inclusion group). Order: by the
 * entries' order (higher later, as in the prompt).
 */
export function cueFromLoreEntries(name: string, entries: LoreEntry[], opts: { id: string; namespace: string; scanDepth?: number }): { cue: Cue; notes: string[] } {
  const notes: string[] = [];
  const items: CueTextInput[] = [];
  const list = [...entries].filter((e) => e.enabled && e.content.trim()).sort((a, b) => a.order - b.order);
  const positions = new Set(list.map((e) => e.position));
  const placement = positions.size === 1 && !positions.has("atDepth") ? { position: list[0]!.position, depth: 4, role: "system" as const }
    : { position: "after" as const, depth: 4, role: "system" as const };
  if (positions.size > 1) notes.push("The entries went to different places; they all go after the character now.");
  for (const [i, e] of list.entries()) {
    const keys = e.keys.filter((k) => k.trim());
    const secondary = e.secondaryKeys.filter((k) => k.trim());
    if (secondary.length && e.logic !== "andAny" && e.logic !== "notAny") notes.push(`"${e.title || `Entry ${i + 1}`}": its secondary keys needed all (or not all) of them; now one of them is enough.`);
    if (e.sticky || e.cooldown) notes.push(`"${e.title || `Entry ${i + 1}`}": sticky and cooldown are not used in cues.`);
    items.push({
      id: e.id || `entry-${i}`, title: e.title, text: e.content, weight: e.groupWeight,
      ...(e.constant || !keys.length ? {} : {
        words: {
          keys, last: Math.max(1, e.scanDepth ?? opts.scanDepth ?? 2), wholeWords: e.matchWholeWords ?? true, caseSensitive: e.caseSensitive ?? false,
          ...(secondary.length ? (e.logic === "notAny" || e.logic === "notAll" ? { not: secondary } : { also: secondary }) : {}),
        },
      }),
      chance: e.useProbability ? e.probability : 100,
      minMessages: e.delay ?? 0,
      oneOf: e.group.split(",")[0]?.trim() ?? "",
      when: e.conditions, logic: e.conditionLogic,
    });
  }
  const cue = CueSchema.parse({
    id: opts.id, name, namespace: opts.namespace,
    groups: [{ key: "rules", name, pick: "all", placement, items }],
    source: { kind: "imported", from: "lorebook" },
  } satisfies CueInput);
  return { cue, notes: [...new Set(notes)] };
}
