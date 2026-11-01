// Homunculus 2 — regex scripts engine (D-060). Author: CLAUDE, 2026-11-01.
//
// A faithful port of SillyTavern's regex extension (public/scripts/extensions/regex/engine.js at the commit
// pinned in docs/reference/pins.json): `regexFromString` (utils.js), `runRegexScript`, `filterString`,
// `sanitizeRegexMacro` and the filter of `getRegexedString`. Same scripts + same text → same result
// (checked against SillyTavern's own code in packages/st-regex/test/st-parity.test.ts).
//
// Where SillyTavern calls it, and where we do (see D-060):
//   saved   — a user message when it is sent (user), a reply when it arrives (ai), an edit (runOnEdit),
//             a first message (ai), reasoning when it arrives (reasoning): changes the saved text.
//   display — every message when it is drawn (depth = 0 for the newest): displayOnly scripts.
//   prompt  — chat history (user/ai, depth like the prompt) and lorebook entries (lore, depth = the entry's
//             depth when it goes "in the chat", else none): promptOnly scripts.
//
// Differences, on purpose:
// - Pure: scripts, macros and the character name come in as arguments (no globals, no "allowed" lists;
//   which scripts are on is decided by the setup).
// - A script that takes longer than SLOW_MS on one text is reported (`onSlow`), so the app can pause it.
//   JavaScript cannot stop a running regex; the guard keeps one bad script from slowing every message.
import { RegexScript, type RegexTarget } from "@homunculus/schemas";

/** SillyTavern's utils.js regexFromString: "/pattern/flags" or a plain pattern. undefined = invalid. */
export function regexFromString(input: string): RegExp | undefined {
  try {
    const m = input.match(/(\/?)(.+)\1([a-z]*)/i);
    if (!m) return undefined;
    if (m[3] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(m[3])) return RegExp(input);
    return new RegExp(m[2]!, m[3]);
  } catch {
    return undefined;
  }
}

/** Why a pattern does not compile (for the editor), or null when it does. */
export function regexError(input: string): string | null {
  if (!input) return null;
  try {
    const m = input.match(/(\/?)(.+)\1([a-z]*)/i);
    if (!m) return "Empty pattern";
    if (m[3] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(m[3])) RegExp(input);
    else new RegExp(m[2]!, m[3]);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.replace(/^Invalid regular expression: /, "") : String(e);
  }
}

/** Compiled patterns, least recently used dropped first (SillyTavern's RegexProvider). */
const cache = new Map<string, RegExp | null>();
const CACHE_MAX = 1000;
function compiled(source: string): RegExp | null {
  let re = cache.get(source);
  if (re === undefined) {
    re = regexFromString(source) ?? null;
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  } else cache.delete(source);
  cache.set(source, re);
  if (re && (re.global || re.sticky)) re.lastIndex = 0;
  return re;
}

/** SillyTavern's sanitizeRegexMacro: a macro's value made safe to sit inside a pattern. */
export function escapeForRegex(x: string): string {
  return x.replaceAll(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs, (s) => {
    switch (s) {
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\t": return "\\t";
      case "\v": return "\\v";
      case "\f": return "\\f";
      case "\0": return "\\0";
      default: return "\\" + s;
    }
  });
}

export interface RegexMacros {
  /** SillyTavern's substituteParams; `char` replaces the character's name ({{char}}) when given. */
  (text: string, char?: string): string;
}

export interface RegexRunContext {
  macros: RegexMacros;
  /** The speaker's name, for {{char}} inside trim strings (SillyTavern's characterOverride). */
  char?: string;
  /** Called when one script took longer than SLOW_MS on one text. */
  onSlow?: (script: RegexScript, ms: number) => void;
}

export const SLOW_MS = 150;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function patternOf(script: RegexScript, macros: RegexMacros): string {
  switch (script.findMacros) {
    case "raw": return macros(script.find);
    // substituteParamsExtended(find, {}, sanitizeRegexMacro): only the macros' values are escaped
    case "escaped": return script.find.replace(/\{\{[\s\S]*?\}\}/g, (m) => {
      const v = macros(m);
      return v === m ? m : escapeForRegex(v);
    });
    default: return script.find;
  }
}

/** SillyTavern's runRegexScript: one script on one text. */
export function runRegexScript(script: RegexScript, text: string, ctx: RegexRunContext): string {
  if (!script || !script.on || !script.find || !text) return text;
  const re = compiled(patternOf(script, ctx.macros));
  if (!re) return text;
  const t0 = now();
  const out = text.replace(re, function (this: unknown, match: string, ...rest: unknown[]) {
    const args: unknown[] = [match, ...rest];
    const replaceString = script.replace.replace(/{{match}}/gi, "$0");
    const withGroups = replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_s, num: string | undefined, groupName: string | undefined) => {
      let m: unknown = match;
      if (num) m = args[Number(num)];
      else if (groupName) {
        const groups = args[args.length - 1];
        m = groups && typeof groups === "object" && (groups as Record<string, unknown>)[groupName];
      }
      if (!m) return "";
      let filtered = String(m);
      for (const t of script.trim) filtered = filtered.replaceAll(ctx.macros(t, ctx.char), "");
      return filtered;
    });
    return ctx.macros(withGroups);
  });
  const ms = now() - t0;
  if (ms > SLOW_MS) ctx.onSlow?.(script, ms);
  return out;
}

/** Where a text is going (SillyTavern's isMarkdown / isPrompt / neither). */
export type RegexMode = "saved" | "display" | "prompt";

export interface RegexRun {
  target: Exclude<RegexTarget, "display">;
  mode: RegexMode;
  /** The text is a user's edit of a saved message. */
  edit?: boolean;
  /** 0 = the newest message. Missing = depth limits do not apply. */
  depth?: number | null;
}

/** Does this script run here? (SillyTavern's getRegexedString filter.) */
export function regexApplies(script: RegexScript, run: RegexRun): boolean {
  const isMarkdown = run.mode === "display";
  const isPrompt = run.mode === "prompt";
  if (!((script.displayOnly && isMarkdown) || (script.promptOnly && isPrompt) || (!script.displayOnly && !script.promptOnly && !isMarkdown && !isPrompt))) return false;
  if (run.edit && !script.runOnEdit) return false;
  if (typeof run.depth === "number") {
    if (script.minDepth !== null && script.minDepth >= -1 && run.depth < script.minDepth) return false;
    if (script.maxDepth !== null && script.maxDepth >= 0 && run.depth > script.maxDepth) return false;
  }
  return script.targets.includes(run.target);
}

/** SillyTavern's getRegexedString: every script that applies, in order (global → preset → character). */
export function applyRegexScripts(scripts: readonly RegexScript[], text: string, run: RegexRun, ctx: RegexRunContext): string {
  if (typeof text !== "string") return "";
  if (!text || scripts.length === 0) return text;
  let out = text;
  for (const s of scripts) if (regexApplies(s, run)) out = runRegexScript(s, out, ctx);
  return out;
}

/** Scripts in SillyTavern's priority order: global, then the preset's, then the character's. Off ones are dropped. */
export function orderRegexScripts(lists: { global?: readonly RegexScript[]; preset?: readonly RegexScript[]; character?: readonly RegexScript[] }): RegexScript[] {
  return [...(lists.global ?? []), ...(lists.preset ?? []), ...(lists.character ?? [])].filter((s) => s.on);
}

// ——— SillyTavern's shape (import/export; packages/schemas/src/regex.ts has the field table) ———

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const PLACEMENT: Record<number, RegexTarget> = { 0: "display", 1: "user", 2: "ai", 3: "command", 5: "lore", 6: "reasoning" };
const PLACEMENT_BACK: Record<RegexTarget, number> = { display: 0, user: 1, ai: 2, command: 3, lore: 5, reasoning: 6 };
const MACROS = ["none", "raw", "escaped"] as const;

const depthOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/** One SillyTavern script → ours. */
export function fromStRegexScript(s: Obj, newId: () => string = () => crypto.randomUUID()): RegexScript {
  const placement = Array.isArray(s.placement) ? (s.placement as unknown[]).map(Number) : [];
  return RegexScript.parse({
    id: typeof s.id === "string" && s.id ? s.id : newId(),
    name: typeof s.scriptName === "string" ? s.scriptName : "",
    find: typeof s.findRegex === "string" ? s.findRegex : "",
    replace: typeof s.replaceString === "string" ? s.replaceString : "",
    trim: Array.isArray(s.trimStrings) ? (s.trimStrings as unknown[]).filter((x): x is string => typeof x === "string") : [],
    targets: [...new Set(placement.map((p) => PLACEMENT[p]).filter((t): t is RegexTarget => !!t))],
    on: !s.disabled,
    displayOnly: !!s.markdownOnly,
    promptOnly: !!s.promptOnly,
    runOnEdit: !!s.runOnEdit,
    findMacros: MACROS[Number(s.substituteRegex)] ?? "none",
    minDepth: depthOf(s.minDepth),
    maxDepth: depthOf(s.maxDepth),
  });
}

/** Ours → SillyTavern's shape (for export and the parity test). */
export function toStRegexScript(s: RegexScript): Obj {
  return {
    id: s.id,
    scriptName: s.name,
    findRegex: s.find,
    replaceString: s.replace,
    trimStrings: [...s.trim],
    placement: s.targets.map((t) => PLACEMENT_BACK[t]),
    disabled: !s.on,
    markdownOnly: s.displayOnly,
    promptOnly: s.promptOnly,
    runOnEdit: s.runOnEdit,
    substituteRegex: MACROS.indexOf(s.findMacros),
    minDepth: s.minDepth,
    maxDepth: s.maxDepth,
  };
}

const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const looksLikeScript = (o: Obj) => typeof o.findRegex === "string" || typeof o.scriptName === "string";

/** Scripts inside a preset's or a card's original file (null when it has none). */
export function embeddedStRegexScripts(original: unknown): RegexScript[] {
  if (!isObj(original)) return [];
  const fromPreset = isObj(original.extensions) ? list(original.extensions.regex_scripts) : [];
  const data = isObj(original.data) ? original.data : undefined;
  const fromCard = data && isObj(data.extensions) ? list(data.extensions.regex_scripts) : [];
  return [...fromPreset, ...fromCard].filter(looksLikeScript).map((s) => fromStRegexScript(s));
}


/** A preset's or a character's scripts: its own list, else the ones in its imported SillyTavern file. */
export function regexScriptsOf(item: { regexScripts?: RegexScript[] | undefined; original?: unknown } | undefined): RegexScript[] {
  if (!item) return [];
  return item.regexScripts ?? embeddedStRegexScripts(item.original);
}
