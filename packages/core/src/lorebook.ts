// Homunculus 2 — lorebook activation (BLUEPRINT §5.3, slice 3, D-027). Author: CLAUDE, 2026-10-28.
//
// A faithful port of SillyTavern's World Info scan (public/scripts/world-info.js at the commit pinned in
// docs/reference/pins.json): `WorldInfoBuffer` (what text is read, how keys match), `WorldInfoTimedEffects`
// (sticky / cooldown / delay), `checkWorldInfo` (the loop: filters, primary + secondary keys, probability,
// budget, recursion, min activations, delayed recursion levels), `filterByInclusionGroups` (groups, priority,
// weights, scoring) and the final placement by position. Same input → same entries, same order.
//
// Differences, on purpose:
// - It is a pure function: no global settings, no chat metadata. Sticky/cooldown timers come in and go out
//   (`timers`), and the turn pins them to the reply, so swipes and branches always see the right ones.
// - Ours: `conditions` on the world state. An entry with conditions only goes in when they hold
//   (checked last, for every way of activating: keywords, constant, sticky, decorators).
// - Timers find their entry by book + entry id (SillyTavern by a hash of the whole entry, so editing an
//   entry in SillyTavern drops its timer; here the timer survives the edit).
// Kept on purpose, to give the same results: SillyTavern's group filter removes an entry with
// `splice(indexOf(entry), 1)`; for an entry in two groups that already lost in the first one, indexOf is -1
// and the LAST candidate of the round is dropped instead (it can still come back in a recursion round).
// - No regex scripts on entry text (SillyTavern's Regex extension) and no vector search.
import type { GenerationType, LoreEntry, LoreReport, LoreSettings, LoreTimers, Lorebook } from "@homunculus/schemas";
import { readStatePath } from "./state.ts";

/** Where a book comes from. Decides the order (SillyTavern: chat, persona, then global/character by strategy). */
export type LoreScope = "chat" | "persona" | "character" | "global";

export interface LoreScanInput {
  books: Array<{ book: Lorebook; scope: LoreScope }>;
  /** The chat to read, NEWEST FIRST, already as "Name: text" when names are included. */
  chat: string[];
  /** How many messages the chat has (for delay and timers). Usually chat.length. */
  chatLength: number;
  /** Texts entries may also read (each entry chooses). */
  global?: Partial<Record<keyof LoreEntry["scan"], string>>;
  trigger: GenerationType;
  /** The character who will reply (for entries limited to some characters / tags). */
  character?: { name: string; tags: string[] };
  settings: LoreSettings;
  /** The context size in tokens (the budget is a share of it). Missing = no budget. */
  maxContext?: number;
  timers?: LoreTimers;
  /** World state for `conditions`. */
  state?: Record<string, unknown>;
  /** Macros for keys and content ({{char}}, {{user}}…). */
  expand?: (text: string) => string;
  countTokens?: (text: string) => number;
  random?: () => number;
}

export interface LoreDepthItem { depth: number; role: "system" | "user" | "assistant"; content: string }

export interface LoreScanResult {
  before: string[];
  after: string[];
  /** Inside the chat, one item per depth + role (entries joined), like SillyTavern. */
  depth: LoreDepthItem[];
  /** Example dialogue blocks to put before / after the card's examples, in final order. */
  examplesTop: string[];
  examplesBottom: string[];
  /** Around the Author's Note. */
  noteTop: string[];
  noteBottom: string[];
  /** For {{outlet::name}}. */
  outlets: Record<string, string[]>;
  report: LoreReport;
}

const DEFAULT_DEPTH = 4;
const DEFAULT_WEIGHT = 100;
const MAX_SCAN_DEPTH = 1000;
const KNOWN_DECORATORS = ["@@activate", "@@dont_activate"];

enum ScanState { NONE = 0, INITIAL = 1, RECURSION = 2, MIN_ACTIVATIONS = 3 }

/** An entry while scanning (a copy: its content gets macros applied). */
interface ScanEntry extends LoreEntry {
  key: string; // `${bookId}.${entryId}`
  bookId: string;
  bookName: string;
  decorators: string[];
}

/** SillyTavern `parseRegexFromString`: "/pattern/flags" → RegExp, anything else → null. */
export function parseKeyRegex(input: string): RegExp | null {
  const match = input.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
  if (!match) return null;
  let [, pattern, flags] = match as unknown as [string, string, string];
  if (pattern.match(/(^|[^\\])\//)) return null;
  pattern = pattern.replace("\\/", "/");
  try { return new RegExp(pattern, flags); } catch { return null; }
}

const escapeRegex = (s: string) => s.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");

/** SillyTavern `parseDecorators`: leading "@@activate" / "@@dont_activate" lines. */
export function parseDecorators(content: string): [string[], string] {
  const isKnown = (data: string) => {
    if (data.startsWith("@@@")) data = data.substring(1);
    return KNOWN_DECORATORS.some((d) => data.startsWith(d));
  };
  if (!content.startsWith("@@")) return [[], content];
  let newContent = content;
  const lines = content.split("\n");
  const decorators: string[] = [];
  let fallbacked = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith("@@")) {
      if (line.startsWith("@@@") && !fallbacked) continue;
      if (isKnown(line)) { decorators.push(line.startsWith("@@@") ? line.substring(1) : line); fallbacked = false; }
      else fallbacked = true;
    } else {
      newContent = lines.slice(i).join("\n");
      break;
    }
  }
  return [decorators, newContent];
}

class ScanBuffer {
  private depthBuffer: Array<string | undefined> = [];
  private recurseBuffer: string[] = [];
  private skew = 0;
  private readonly startDepth = 0;

  constructor(messages: string[], private readonly global: LoreScanInput["global"], private readonly settings: LoreSettings) {
    for (let depth = 0; depth < MAX_SCAN_DEPTH; depth++) {
      if (messages[depth]) this.depthBuffer[depth] = messages[depth]!.trim();
      if (depth === messages.length - 1) break;
    }
  }

  private transform(str: string, entry: ScanEntry): string {
    const caseSensitive = entry.caseSensitive ?? this.settings.caseSensitive;
    return caseSensitive ? str : str.toLowerCase();
  }

  get(entry: ScanEntry, state: ScanState): string {
    let depth = entry.scanDepth ?? this.getDepth();
    if (depth <= this.startDepth) return "";
    if (depth < 0) return "";
    if (depth > MAX_SCAN_DEPTH) depth = MAX_SCAN_DEPTH;
    const MATCHER = "\x01";
    const JOINER = "\n" + MATCHER;
    let result = MATCHER + this.depthBuffer.slice(this.startDepth, depth).map((x) => x ?? "").join(JOINER);
    const g = this.global ?? {};
    const scan = entry.scan;
    if (scan.personaDescription && g.personaDescription) result += JOINER + g.personaDescription;
    if (scan.characterDescription && g.characterDescription) result += JOINER + g.characterDescription;
    if (scan.characterPersonality && g.characterPersonality) result += JOINER + g.characterPersonality;
    if (scan.characterDepthPrompt && g.characterDepthPrompt) result += JOINER + g.characterDepthPrompt;
    if (scan.scenario && g.scenario) result += JOINER + g.scenario;
    if (scan.creatorNotes && g.creatorNotes) result += JOINER + g.creatorNotes;
    if (this.recurseBuffer.length > 0 && state !== ScanState.MIN_ACTIVATIONS) result += JOINER + this.recurseBuffer.join(JOINER);
    return result;
  }

  matchKeys(haystack: string, needle: string, entry: ScanEntry): boolean {
    const keyRegex = parseKeyRegex(needle);
    if (keyRegex) return keyRegex.test(haystack);
    haystack = this.transform(haystack, entry);
    const t = this.transform(needle, entry);
    const wholeWords = entry.matchWholeWords ?? this.settings.matchWholeWords;
    if (wholeWords) {
      const words = t.split(/\s+/);
      if (words.length > 1) return haystack.includes(t);
      return new RegExp(`(?:^|\\W)(${escapeRegex(t)})(?:$|\\W)`).test(haystack);
    }
    return haystack.includes(t);
  }

  addRecurse(text: string) { this.recurseBuffer.push(text); }
  hasRecurse() { return this.recurseBuffer.length > 0; }
  advanceScan() { this.skew++; }
  getDepth() { return this.settings.scanDepth + this.skew; }

  getScore(entry: ScanEntry, state: ScanState): number {
    const text = this.get(entry, state);
    let primary = 0, secondary = 0;
    const nPrimary = entry.keys.length, nSecondary = entry.secondaryKeys.length;
    for (const k of entry.keys) if (this.matchKeys(text, k, entry)) primary++;
    for (const k of entry.secondaryKeys) if (this.matchKeys(text, k, entry)) secondary++;
    if (!nPrimary) return 0;
    if (nSecondary > 0) {
      if (entry.logic === "andAny") return primary + secondary;
      if (entry.logic === "andAll") return secondary === nSecondary ? primary + secondary : primary;
    }
    return primary;
  }
}

class TimedEffects {
  readonly timers: LoreTimers;
  private active: Record<"sticky" | "cooldown" | "delay", Set<string>> = { sticky: new Set(), cooldown: new Set(), delay: new Set() };

  constructor(private readonly chatLength: number, private readonly entries: ScanEntry[], previous: LoreTimers | undefined) {
    this.timers = { sticky: { ...(previous?.sticky ?? {}) }, cooldown: { ...(previous?.cooldown ?? {}) } };
  }

  private effect(type: "sticky" | "cooldown", e: ScanEntry, isProtected: boolean) {
    return { start: this.chatLength, end: this.chatLength + Number(e[type] ?? 0), protected: isProtected };
  }

  check(): void {
    for (const type of ["sticky", "cooldown"] as const) {
      for (const [key, value] of Object.entries(this.timers[type])) {
        const entry = this.entries.find((x) => x.key === key);
        if (this.chatLength <= value.start && !value.protected) { delete this.timers[type][key]; continue; }
        if (!entry) { if (this.chatLength >= value.end) delete this.timers[type][key]; continue; }
        if (!entry[type]) { delete this.timers[type][key]; continue; }
        if (this.chatLength >= value.end) {
          delete this.timers[type][key];
          // a sticky entry that ends goes on cooldown at once (if it has one)
          if (type === "sticky" && entry.cooldown) {
            this.timers.cooldown[key] = this.effect("cooldown", entry, true);
            this.active.cooldown.add(key);
          }
          continue;
        }
        this.active[type].add(key);
      }
    }
    for (const e of this.entries) if (e.delay && this.chatLength < e.delay) this.active.delay.add(e.key);
  }

  isActive(type: "sticky" | "cooldown" | "delay", e: ScanEntry): boolean { return this.active[type].has(e.key); }

  set(activated: ScanEntry[]): void {
    for (const e of activated) {
      for (const type of ["sticky", "cooldown"] as const) {
        if (!e[type]) continue;
        if (!this.timers[type][e.key]) this.timers[type][e.key] = this.effect(type, e, false);
      }
    }
  }
}

/** Book precedence when the same book is picked twice: global > chat > persona > character (SillyTavern skips repeats). */
const SCOPE_RANK: Record<LoreScope, number> = { global: 0, chat: 1, persona: 2, character: 3 };

/** The entries to scan, in SillyTavern's order (`getSortedEntries`). */
function sortedEntries(input: LoreScanInput): ScanEntry[] {
  const chosen = new Map<string, { book: Lorebook; scope: LoreScope }>();
  for (const b of input.books) {
    const prev = chosen.get(b.book.id);
    if (!prev || SCOPE_RANK[b.scope] < SCOPE_RANK[prev.scope]) chosen.set(b.book.id, b);
  }
  const byScope = (scope: LoreScope) => [...chosen.values()].filter((b) => b.scope === scope).flatMap(({ book }) =>
    book.entries.map((e): ScanEntry => {
      const [decorators, content] = parseDecorators(e.content || "");
      return { ...e, content, decorators, key: `${book.id}.${e.id}`, bookId: book.id, bookName: book.name };
    }));
  const desc = (list: ScanEntry[]) => list.sort((a, b) => b.order - a.order);
  const globalLore = byScope("global"), characterLore = byScope("character");
  let rest: ScanEntry[];
  switch (input.settings.insertionStrategy) {
    case "evenly": rest = desc([...globalLore, ...characterLore]); break;
    case "globalFirst": rest = [...desc(globalLore), ...desc(characterLore)]; break;
    default: rest = [...desc(characterLore), ...desc(globalLore)];
  }
  return [...desc(byScope("chat")), ...desc(byScope("persona")), ...rest];
}

/** Ours: does the world state allow this entry? */
export function loreConditionsHold(entry: Pick<LoreEntry, "conditions" | "conditionLogic">, state: Record<string, unknown> | undefined): boolean {
  if (!entry.conditions.length) return true;
  const test = (c: LoreEntry["conditions"][number]) => {
    const v = readStatePath((state ?? {}) as never, c.path);
    const present = v !== undefined && v !== null && v !== "";
    if (c.op === "exists") return present;
    if (c.op === "missing") return !present;
    const text = (x: unknown) => (typeof x === "object" && x !== null ? JSON.stringify(x) : String(x ?? "")).trim().toLowerCase();
    const a = text(v), b = c.value.trim().toLowerCase();
    const na = Number(a), nb = Number(b);
    const numeric = a !== "" && b !== "" && Number.isFinite(na) && Number.isFinite(nb);
    switch (c.op) {
      case "equals": return numeric ? na === nb : a === b;
      case "notEquals": return numeric ? na !== nb : a !== b;
      case "contains": return a.includes(b);
      case "notContains": return !a.includes(b);
      case "greater": return numeric && na > nb;
      case "less": return numeric && na < nb;
    }
    return false;
  };
  return entry.conditionLogic === "any" ? entry.conditions.some(test) : entry.conditions.every(test);
}

/** Runs one scan. Same rules as SillyTavern's checkWorldInfo (see the header for the few differences). */
export function scanLorebooks(input: LoreScanInput): LoreScanResult {
  const settings = input.settings;
  const expand = input.expand ?? ((t: string) => t);
  const tokens = input.countTokens ?? ((t: string) => Math.ceil(t.length / 3.6));
  const random = input.random ?? Math.random;
  const buffer = new ScanBuffer(input.chat, input.global, settings);
  const entries = sortedEntries(input);
  const timed = new TimedEffects(input.chatLength, entries, input.timers);
  timed.check();

  const reasons = new Map<string, string>();
  const skipped: LoreReport["skipped"] = [];
  const skip = (e: ScanEntry, reason: string) => skipped.push({ bookId: e.bookId, entryId: e.id, title: e.title, reason });
  const books = [...new Set(entries.map((e) => e.bookId))];
  const empty = (): LoreScanResult => ({
    before: [], after: [], depth: [], examplesTop: [], examplesBottom: [], noteTop: [], noteBottom: [], outlets: {},
    report: { activated: [], skipped, timers: timed.timers, books, ...(budgetLimit !== undefined ? { budget: { limit: budgetLimit, used: 0, overflowed: false } } : {}) },
  });

  let budgetLimit: number | undefined;
  if (input.maxContext !== undefined) {
    budgetLimit = Math.round(settings.budgetPercent * input.maxContext / 100) || 1;
    if (settings.budgetCap > 0 && budgetLimit > settings.budgetCap) budgetLimit = settings.budgetCap;
  }
  const budget = budgetLimit ?? Number.POSITIVE_INFINITY;
  if (entries.length === 0) return empty();

  let scanState = ScanState.INITIAL;
  let overflowed = false;
  let count = 0;
  const allActivated = new Map<string, ScanEntry>();
  const failedProbability = new Set<ScanEntry>();
  let allActivatedText = "";

  const levels = [...new Set(entries.filter((e) => e.delayUntilRecursion).map((e) => e.delayUntilRecursion))].sort((a, b) => a - b);
  let currentLevel = levels.shift() ?? 0;

  while (scanState) {
    if (settings.maxRecursionSteps && settings.maxRecursionSteps <= count) break;
    count++;
    let nextState = ScanState.NONE;
    const activatedNow = new Set<ScanEntry>();
    const activate = (e: ScanEntry, reason: string) => {
      if (!loreConditionsHold(e, input.state)) { skip(e, "the world state doesn't match its conditions"); return; }
      reasons.set(e.key, scanState === ScanState.RECURSION && reason.startsWith("keyword") ? `recursion, ${reason}` : reason);
      activatedNow.add(e);
    };

    for (const e of entries) {
      if (failedProbability.has(e) || allActivated.has(e.key)) continue;
      if (!e.enabled) continue;
      if (e.triggers.length > 0 && !e.triggers.includes(input.trigger)) continue;
      const names = e.characterFilter.names, tags = e.characterFilter.tags;
      if (names.length > 0) {
        const included = !!input.character && names.includes(input.character.name);
        if (e.characterFilter.exclude ? included : !included) continue;
      }
      // SillyTavern only filters by tags when the character has tags (no tag list = no tag filter)
      if (tags.length > 0 && input.character && input.character.tags.length > 0) {
        const has = input.character.tags.some((t) => tags.includes(t));
        if (e.characterFilter.exclude ? has : !has) continue;
      }

      const isSticky = timed.isActive("sticky", e);
      const isCooldown = timed.isActive("cooldown", e);
      if (timed.isActive("delay", e)) continue;
      if (isCooldown && !isSticky) continue;
      if (scanState !== ScanState.RECURSION && e.delayUntilRecursion && !isSticky) continue;
      if (scanState === ScanState.RECURSION && e.delayUntilRecursion && e.delayUntilRecursion > currentLevel && !isSticky) continue;
      if (scanState === ScanState.RECURSION && settings.recursive && e.excludeRecursion && !isSticky) continue;

      if (e.decorators.includes("@@activate")) { activate(e, "@@activate"); continue; }
      if (e.decorators.includes("@@dont_activate")) continue;
      if (e.constant) { activate(e, "always on"); continue; }
      if (isSticky) { activate(e, "sticky"); continue; }
      if (!e.keys.length) continue;

      const text = buffer.get(e, scanState);
      const primary = e.keys.find((k) => { const s = expand(k); return s && buffer.matchKeys(text, s.trim(), e); });
      if (!primary) continue;
      const hasSecondary = e.selective && e.secondaryKeys.length > 0;
      if (!hasSecondary) { activate(e, `keyword: ${primary}`); continue; }

      let matched = false;
      let anyMatch = false, allMatch = true;
      for (const k of e.secondaryKeys) {
        const s = expand(k);
        const hit = !!s && buffer.matchKeys(text, s.trim(), e);
        if (hit) anyMatch = true; else allMatch = false;
        if (e.logic === "andAny" && hit) { matched = true; break; }
        if (e.logic === "notAll" && !hit) { matched = true; break; }
      }
      if (!matched && e.logic === "notAny" && !anyMatch) matched = true;
      if (!matched && e.logic === "andAll" && allMatch) matched = true;
      if (matched) activate(e, `keyword: ${primary} + secondary (${e.logic})`);
    }

    // sticky first, then the scan order
    const index = new Map(entries.map((e, i) => [e, i]));
    let newEntries = [...activatedNow];
    if (newEntries.length > 1) {
      newEntries.sort((a, b) => (timed.isActive("sticky", b) ? 1 : 0) - (timed.isActive("sticky", a) ? 1 : 0) || (index.get(a) ?? -1) - (index.get(b) ?? -1));
    }

    let newContent = "";
    const textTokens = tokens(allActivatedText);
    filterByInclusionGroups(newEntries, allActivated, buffer, scanState, timed, settings, random, (e, why) => skip(e, why));

    let ignoresBudget = newEntries.filter((e) => e.ignoreBudget).length;
    for (const e of newEntries) {
      ignoresBudget -= e.ignoreBudget ? 1 : 0;
      if (overflowed && !e.ignoreBudget) {
        skip(e, "the lorebook budget was full");
        if (ignoresBudget > 0) continue;
        break;
      }
      const passes = !e.useProbability || e.probability === 100 || timed.isActive("sticky", e) || random() * 100 <= e.probability;
      if (!passes) { failedProbability.add(e); skip(e, `lost its ${e.probability}% chance`); continue; }
      e.content = expand(e.content);
      newContent += `${e.content}\n`;
      if (!e.ignoreBudget && textTokens + tokens(newContent) >= budget) {
        overflowed = true;
        skip(e, "the lorebook budget was full");
        continue;
      }
      allActivated.set(e.key, e);
    }

    const successful = newEntries.filter((e) => !failedProbability.has(e));
    const forRecursion = successful.filter((e) => !e.preventRecursion);
    if (settings.recursive && !overflowed && forRecursion.length) nextState = ScanState.RECURSION;
    if (settings.recursive && !overflowed && scanState === ScanState.MIN_ACTIVATIONS && buffer.hasRecurse()) nextState = ScanState.RECURSION;
    const minNotMet = settings.minActivations > 0 && allActivated.size < settings.minActivations;
    if (!nextState && !overflowed && minNotMet) {
      const overMax = (settings.minActivationsDepthMax > 0 && buffer.getDepth() > settings.minActivationsDepthMax) || buffer.getDepth() > input.chat.length;
      if (!overMax) { nextState = ScanState.MIN_ACTIVATIONS; buffer.advanceScan(); }
    }
    if (nextState === ScanState.NONE && levels.length) { nextState = ScanState.RECURSION; currentLevel = levels.shift()!; }

    scanState = nextState;
    if (scanState) {
      const text = forRecursion.map((x) => x.content).join("\n");
      if (text) { buffer.addRecurse(text); allActivatedText = text + "\n" + allActivatedText; }
    }
  }

  // placing the entries (lowest order first; higher order = later in the prompt)
  const out = empty();
  const emEntries: Array<{ top: boolean; content: string }> = [];
  const sorted = [...allActivated.values()].sort((a, b) => b.order - a.order);
  for (const e of sorted) {
    const content = e.content;
    if (!content) continue;
    switch (e.position) {
      case "before": out.before.unshift(content); break;
      case "after": out.after.unshift(content); break;
      case "emTop": emEntries.unshift({ top: true, content }); break;
      case "emBottom": emEntries.unshift({ top: false, content }); break;
      case "anTop": out.noteTop.unshift(content); break;
      case "anBottom": out.noteBottom.unshift(content); break;
      case "atDepth": {
        const depth = e.depth ?? DEFAULT_DEPTH;
        const found = out.depth.find((d) => d.depth === depth && d.role === e.role) as (LoreDepthItem & { list?: string[] }) | undefined;
        if (found) found.list!.unshift(content);
        else out.depth.push({ depth, role: e.role, content: "", list: [content] } as LoreDepthItem & { list: string[] });
        break;
      }
      case "outlet":
        if (!e.outletName) { skip(e, "its position is 'outlet' but it has no outlet name"); break; }
        (out.outlets[e.outletName] ??= []).push(content);
        break;
    }
  }
  for (const d of out.depth as Array<LoreDepthItem & { list?: string[] }>) { d.content = (d.list ?? []).join("\n"); delete d.list; }
  // example blocks: SillyTavern unshifts "before" ones and pushes "after" ones, in this order
  for (const x of emEntries) {
    const block = x.content.startsWith("<START>") ? x.content : `<START>\n${x.content.trim()}`;
    if (x.top) out.examplesTop.unshift(block); else out.examplesBottom.push(block);
  }

  timed.set([...allActivated.values()]);
  // one line per entry and reason (later rounds of the scan may see the same entry again); not for entries that went in
  const seen = new Set<string>();
  const skippedOnce = skipped.filter((x) => {
    const k = `${x.bookId}.${x.entryId}|${x.reason}`;
    if (seen.has(k) || allActivated.has(`${x.bookId}.${x.entryId}`)) return false;
    seen.add(k);
    return true;
  });
  // the report, in the order the entries reach the prompt
  const rank: Record<string, number> = { before: 0, emTop: 1, emBottom: 2, after: 3, anTop: 4, anBottom: 5, atDepth: 6, outlet: 7 };
  out.report = {
    activated: [...allActivated.values()]
      .sort((a, b) => (rank[a.position] ?? 9) - (rank[b.position] ?? 9) || a.order - b.order)
      .map((e) => ({ bookId: e.bookId, bookName: e.bookName, entryId: e.id, title: e.title || e.keys[0] || `Entry ${e.id}`, position: e.position, reason: reasons.get(e.key) ?? "", tokens: tokens(e.content) })),
    skipped: skippedOnce, timers: timed.timers, books,
    ...(budgetLimit !== undefined ? { budget: { limit: budgetLimit, used: tokens([...allActivated.values()].map((e) => e.content).join("\n")), overflowed } } : {}),
  };
  return out;
}

/** SillyTavern `filterByInclusionGroups` (+ `filterGroupsByTimedEffects`, `filterGroupsByScoring`). Changes `newEntries` in place. */
function filterByInclusionGroups(newEntries: ScanEntry[], allActivated: Map<string, ScanEntry>, buffer: ScanBuffer, scanState: ScanState,
  timed: TimedEffects, settings: LoreSettings, random: () => number, onLose: (e: ScanEntry, why: string) => void): void {
  const grouped: Record<string, ScanEntry[]> = {};
  for (const item of newEntries.filter((x) => x.group)) {
    for (const g of item.group.split(/,\s*/).filter((x) => x)) (grouped[g] ??= []).push(item);
  }
  if (Object.keys(grouped).length === 0) return;
  // same as SillyTavern, including indexOf = -1 (see the header)
  const remove = (e: ScanEntry) => { newEntries.splice(newEntries.indexOf(e), 1); };
  const removeAllBut = (group: ScanEntry[], chosen: ScanEntry | null, key: string) => {
    for (const e of group) if (e !== chosen) { if (newEntries.includes(e)) onLose(e, `another entry of the group "${key}" won`); remove(e); }
  };

  // timed effects: sticky entries win their group; cooldown / delay leave it
  const hasSticky = new Map<string, boolean>();
  for (const [key, group] of Object.entries(grouped)) {
    hasSticky.set(key, false);
    const sticky = group.filter((x) => timed.isActive("sticky", x));
    if (sticky.length) {
      for (const e of group) if (!sticky.includes(e)) { onLose(e, `a sticky entry of the group "${key}" is active`); remove(e); }
      hasSticky.set(key, true);
    }
    for (const e of group.filter((x) => timed.isActive("cooldown", x) || timed.isActive("delay", x))) remove(e);
  }

  // scoring: only the entries with the most keyword hits stay
  for (const [key, group] of Object.entries(grouped)) {
    if (!settings.useGroupScoring && !group.some((x) => x.useGroupScoring)) continue;
    if (hasSticky.get(key)) continue;
    const scores = group.map((e) => buffer.getScore(e, scanState));
    const max = Math.max(...scores);
    for (let i = 0; i < group.length; i++) {
      const scored = group[i]!.useGroupScoring ?? settings.useGroupScoring;
      if (!scored) continue;
      if (scores[i]! < max) {
        onLose(group[i]!, `fewer keyword hits than another entry of the group "${key}"`);
        remove(group[i]!);
        group.splice(i, 1);
        scores.splice(i, 1);
        i--;
      }
    }
  }

  for (const [key, group] of Object.entries(grouped)) {
    if (hasSticky.get(key)) continue;
    if ([...allActivated.values()].some((x) => x.group === key)) { removeAllBut(group, null, key); continue; }
    if (group.length <= 1) continue;
    const prios = group.filter((x) => x.groupOverride).sort((a, b) => b.order - a.order);
    if (prios.length) { removeAllBut(group, prios[0]!, key); continue; }
    const total = group.reduce((n, e) => n + (e.groupWeight ?? DEFAULT_WEIGHT), 0);
    const roll = random() * total;
    let current = 0;
    let winner: ScanEntry | null = null;
    for (const e of group) {
      current += e.groupWeight ?? DEFAULT_WEIGHT;
      if (roll <= current) { winner = e; break; }
    }
    if (!winner) continue;
    removeAllBut(group, winner, key);
  }
}
