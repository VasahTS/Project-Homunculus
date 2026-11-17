// Homunculus 2 — macros: {{char}}, {{user}}, {{random::a::b}}… Author: CLAUDE, 2026-10-23; engine 2026-10-28 (slice 2, D-021);
// SillyTavern's macro set ported 2026-11-17 (D-146).
//
// Same syntax as SillyTavern (public/scripts/macros/definitions/: env, core, chat, time, state and variable macros —
// the "new engine" at the commit pinned in docs/reference/pins.json). Plus ours: {{state.<tracker>.<field>}} reads the
// world state. Messages are stored raw; macros are applied when showing them and when building the prompt, so
// changing the persona name later updates old messages too.
//
// The engine reads text left to right and finds each {{…}} with its nested braces, so:
// - inner macros run first ({{getvar::{{user}}}} works), and macros run in the order they are written;
// - {{if}} / {{else}} / {{/if}} only run the branch they choose (a {{setvar}} in the other branch does nothing);
// - variable shorthands ({{.hp}}, {{.hp++}}, {{$gold += 5}}, {{.name ?? stranger}}…) work like SillyTavern's.
// Variables: `vars` (local: one chat, kept in the world state by the turn, D-146) and `globals` (every chat). Values are
// text; objects and arrays are JSON text, like SillyTavern.
// Unknown macros stay as written. Not supported (left as written): {{input}}, {{idleDuration}}, {{timeDiff}},
// scoped {{trim}}…{{/trim}} and {{//}}…{{///}}, filters ("|"), instruct-mode macros.

export interface MacroNames {
  char: string;
  user: string;
}

/** Only {{char}} / {{user}} (and legacy <BOT>/<USER>): for showing messages on screen. */
export function applyBasicMacros(text: string, names: MacroNames): string {
  return text
    .replace(/\{\{\s*char\s*\}\}/gi, names.char)
    .replace(/\{\{\s*user\s*\}\}/gi, names.user)
    .replace(/<BOT>/g, names.char)
    .replace(/<USER>/g, names.user);
}

/** Until a persona is chosen, the user is called "User" (SillyTavern's default). */
export const DEFAULT_USER_NAME = "User";

/** Card fields that only macros read ({{charPrompt}}, {{charVersion}}, {{greeting}}…). */
export interface MacroCard {
  systemPrompt?: string;
  postHistoryInstructions?: string;
  creatorNotes?: string;
  version?: string;
  /** First message, then the alternate greetings. */
  firstMessages?: string[];
  /** The Character's Note ({{charDepthPrompt}}). */
  depthPrompt?: string;
}

/** What macros can read while a prompt is built. Missing values become "". */
export interface MacroContext extends MacroNames {
  description?: string;
  personality?: string;
  scenario?: string;
  persona?: string;
  mesExamples?: string;
  /** The model's name. */
  model?: string;
  lastMessage?: string;
  lastUserMessage?: string;
  lastCharMessage?: string;
  /** {{lastMessageId}}: 0-based index of the last message sent. */
  lastMessageId?: number;
  /** {{original}}: the preset's text that a card's own prompt replaced. */
  original?: string;
  /** World state for {{state.tracker.field}}. */
  state?: Record<string, Record<string, unknown>>;
  /** Local variables ({{setvar}}, {{.name}}). The turn loads them from the chat and saves them after (D-146). */
  vars?: Map<string, string>;
  /** Global variables ({{setglobalvar}}, {{$name}}): the same in every chat. */
  globals?: Map<string, string>;
  /** The speaking character's other card fields. */
  card?: MacroCard;
  /** Everyone the AI plays in this chat ({{group}}); missing = only {{char}}. */
  group?: string[];
  /** {{maxPrompt}} / {{maxContext}}: the preset's context size; {{maxResponse}}: room kept for the reply. */
  maxContext?: number;
  maxResponse?: number;
  /** {{lastGenerationType}}: normal, swipe, continue, impersonate… */
  generationType?: string;
  /** Seed so {{pick}} gives the same choice on every swipe of the same message. */
  seed?: string;
  random?: () => number;
  now?: Date;
  /** Macros added by modules (registerMacro). */
  custom?: (name: string, args: string[]) => string | undefined;
}

/** SillyTavern's falsy values for {{if}} and the shorthands: "", "false", "off", "0". */
export function isFalsyMacroValue(value: string | undefined): boolean {
  return value === undefined || ["", "false", "off", "0"].includes(value.trim().toLowerCase());
}

/** Small stable hash (for {{pick}}). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** "a::b::c" or "a,b,c" (SillyTavern accepts both; "\," keeps a comma). */
function choices(rest: string): string[] {
  if (rest.includes("::")) return rest.split("::");
  return rest.split(/(?<!\\),/).map((x) => x.replace(/\\,/g, ",").trim());
}

/** "2d6+1" → a roll; "20" = 1d20. Anything else (e.g. "4d6kh3", "1d20+1d6") → "" rather than a wrong number. */
function roll(formula: string, rnd: () => number): string {
  const m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(formula);
  if (!m) {
    if (!/^\s*\d+\s*$/.test(formula)) return "";
    const n = parseInt(formula, 10); // {{roll:20}} = 1d20
    return n > 0 ? String(1 + Math.floor(rnd() * n)) : "";
  }
  const count = Math.min(100, parseInt(m[1] || "1", 10));
  const sides = parseInt(m[2]!, 10);
  if (sides < 1) return "";
  let total = parseInt((m[3] ?? "0").replace(/\s/g, ""), 10);
  for (let i = 0; i < count; i++) total += 1 + Math.floor(rnd() * sides);
  return String(total);
}

const pad = (n: number) => String(n).padStart(2, "0");
const isNumber = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

// ---------------------------------------------------------------- variables (SillyTavern's variables.js)

/** {{getvarkey::name::key}}: a key of an object or an index of an array kept as JSON. */
function getKey(store: Map<string, string>, name: string, key: string): string {
  const raw = store.get(name);
  if (raw === undefined) return "";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return raw;
    const v = (parsed as Record<string, unknown>)[isNumber(key) ? Number(key) : key];
    if (v === undefined || v === null) return "";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  } catch {
    return raw;
  }
}

/** {{setvarkey::name::key::value}}: creates an object (text key) or an array (number key) when missing. */
function setKey(store: Map<string, string>, name: string, key: string, value: string): void {
  if (!name) return;
  let parsed: unknown;
  try { parsed = JSON.parse(store.get(name) ?? "null"); } catch { return; }
  if (parsed === null || typeof parsed !== "object") parsed = isNumber(key) ? [] : {};
  (parsed as Record<string | number, unknown>)[isNumber(key) ? Number(key) : key] = value;
  store.set(name, JSON.stringify(parsed));
}

/** {{addvar}}: appends to a JSON array, adds numbers, otherwise appends text. Returns the new value. */
function addTo(store: Map<string, string>, name: string, value: string): string {
  if (!name) return "";
  const cur = store.get(name) ?? "";
  try {
    const parsed: unknown = JSON.parse(cur);
    if (Array.isArray(parsed)) {
      parsed.push(value);
      const out = JSON.stringify(parsed);
      store.set(name, out);
      return out;
    }
  } catch { /* not an array */ }
  const out = isNumber(value) && (cur.trim() === "" || isNumber(cur)) ? String(Number(cur || 0) + Number(value)) : cur + value;
  store.set(name, out);
  return out;
}

// ---------------------------------------------------------------- time

const FORMAT_TOKENS = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|d|HH|H|hh|h|mm|m|ss|s|A|a/g;

/** {{datetimeformat::…}}: the common moment.js tokens (YYYY MM DD HH mm ss, names, [literal text]). */
function formatDate(d: Date, format: string): string {
  const h12 = d.getHours() % 12 || 12;
  const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
  return format.replace(FORMAT_TOKENS, (tok, literal: string | undefined) => {
    if (literal !== undefined) return literal;
    switch (tok) {
      case "YYYY": return String(d.getFullYear());
      case "YY": return String(d.getFullYear()).slice(-2);
      case "MMMM": return d.toLocaleDateString(undefined, { month: "long" });
      case "MMM": return d.toLocaleDateString(undefined, { month: "short" });
      case "MM": return pad(d.getMonth() + 1);
      case "M": return String(d.getMonth() + 1);
      case "Do": return ord(d.getDate());
      case "DD": return pad(d.getDate());
      case "D": return String(d.getDate());
      case "dddd": return d.toLocaleDateString(undefined, { weekday: "long" });
      case "ddd": return d.toLocaleDateString(undefined, { weekday: "short" });
      case "d": return String(d.getDay());
      case "HH": return pad(d.getHours());
      case "H": return String(d.getHours());
      case "hh": return pad(h12);
      case "h": return String(h12);
      case "mm": return pad(d.getMinutes());
      case "m": return String(d.getMinutes());
      case "ss": return pad(d.getSeconds());
      case "s": return String(d.getSeconds());
      case "A": return d.getHours() < 12 ? "AM" : "PM";
      case "a": return d.getHours() < 12 ? "am" : "pm";
    }
    return tok;
  });
}

/** {{time::UTC+3}}: the clock at that offset (hours). */
function atOffset(now: Date, spec: string): Date | undefined {
  const m = /^\s*UTC\s*([+-]\s*\d+(?:\.\d+)?)\s*$/i.exec(spec);
  if (!m) return undefined;
  const hours = Number(m[1]!.replace(/\s/g, ""));
  return new Date(now.getTime() + (hours * 60 + now.getTimezoneOffset()) * 60_000);
}

// ---------------------------------------------------------------- reading {{…}}

interface Span { start: number; end: number; inner: string }

/** The next {{…}} from `from`, with nested macros inside it ("{{getvar::{{user}}}}" is one span). */
function nextMacro(text: string, from: number): Span | undefined {
  let i = text.indexOf("{{", from);
  if (i < 0) return undefined;
  while (text[i + 2] === "{") i++; // "{{{char}}}" → "{" + {{char}} + "}"
  let depth = 0;
  for (let j = i; j < text.length;) {
    if (text.startsWith("{{", j)) { depth++; j += 2; }
    else if (text.startsWith("}}", j)) {
      depth--; j += 2;
      if (depth === 0) return { start: i, end: j, inner: text.slice(i + 2, j - 2) };
    } else j++;
  }
  return undefined; // never closed: the rest is plain text
}

/** Splits on "::" outside nested macros. */
function splitArgs(text: string): string[] {
  const out: string[] = [];
  let depth = 0, last = 0;
  for (let j = 0; j < text.length;) {
    if (text.startsWith("{{", j)) { depth++; j += 2; }
    else if (text.startsWith("}}", j)) { depth = Math.max(0, depth - 1); j += 2; }
    else if (depth === 0 && text.startsWith("::", j)) { out.push(text.slice(last, j)); j += 2; last = j; }
    else j++;
  }
  out.push(text.slice(last));
  return out;
}

/** "name::args", "name:args" or "name args" (SillyTavern's new engine accepts a space too). */
function head(inner: string): { name: string; rest: string } {
  const body = inner.trim();
  if (body.startsWith("//")) return { name: "//", rest: body.slice(2) };
  const m = /^[^\s:]+/.exec(body);
  const name = m ? m[0] : "";
  let rest = body.slice(name.length);
  if (rest.startsWith("::")) rest = rest.slice(2);
  else if (rest.startsWith(":")) rest = rest.slice(1);
  else rest = rest.replace(/^\s+/, "");
  return { name: name.toLowerCase(), rest };
}

const isScopedIf = (inner: string) => { const h = head(inner); return h.name === "if" && splitArgs(h.rest).length === 1; };
const isCloseIf = (inner: string) => /^\s*\/if\s*$/i.test(inner);
const isElse = (inner: string) => /^\s*else\s*$/i.test(inner);

/** The {{/if}} that closes a scoped {{if}} whose tag ends at `from` (nested scoped ifs counted). */
function findCloseIf(text: string, from: number): Span | undefined {
  let depth = 1;
  for (let s = nextMacro(text, from); s; s = nextMacro(text, s.end)) {
    if (isScopedIf(s.inner)) depth++;
    else if (isCloseIf(s.inner) && --depth === 0) return s;
  }
  return undefined;
}

/** Then / else of an {{if}} body: the {{else}} that is not inside a nested {{if}}. */
function splitElse(body: string): { then: string; other?: string } {
  let depth = 0;
  for (let s = nextMacro(body, 0); s; s = nextMacro(body, s.end)) {
    if (isScopedIf(s.inner)) depth++;
    else if (isCloseIf(s.inner)) depth--;
    else if (depth === 0 && isElse(s.inner)) return { then: body.slice(0, s.start), other: body.slice(s.end) };
  }
  return { then: body };
}

/** Macros an {{if}} condition may name without braces ({{if description}}). */
const CONDITION_MACROS = new Set([
  "char", "user", "description", "chardescription", "personality", "charpersonality", "scenario", "charscenario", "persona",
  "mesexamples", "mesexamplesraw", "model", "original", "lastmessage", "lastusermessage", "lastcharmessage", "lastmessageid",
  "charprompt", "charinstruction", "charjailbreak", "chardepthprompt", "charcreatornotes", "creatornotes", "charversion",
  "version", "char_version", "charfirstmessage", "greeting", "group", "charifnotgroup", "groupnotmuted", "notchar",
  "lastgenerationtype", "ismobile",
]);

const SHORTHAND = /^\s*([.$])([a-zA-Z](?:[\w-]*\w)?)\s*(\+\+|--|\?\?=|\?\?|\|\|=|\|\||-=|\+=|==|!=|>=|<=|>|<|=)?\s*([\s\S]*?)\s*$/;

/**
 * Expands macros in `text`. Inner macros run first ({{getvar::{{user}}}} works). Unknown macros are
 * left as written, so nothing silently disappears.
 */
export function expandMacros(text: string, ctx: MacroContext): string {
  if (!text.includes("{{") && !text.includes("<BOT>") && !text.includes("<USER>")) return text;
  const rnd = ctx.random ?? Math.random;
  const vars = ctx.vars ?? new Map<string, string>();
  const globals = ctx.globals ?? new Map<string, string>();
  const now = ctx.now ?? new Date();
  let pickCount = 0;
  let trim = false;

  const group = () => (ctx.group?.length ? ctx.group : [ctx.char]);

  /** One macro, its arguments already expanded. undefined = not a macro we know. */
  const one = (raw: string): string | undefined => {
    const body = raw.trim();
    const { name, rest } = head(raw);
    const args = () => rest.split("::");
    switch (name) {
      case "//": return ""; // comment
      case "char": return ctx.char;
      case "user": return ctx.user;
      case "description": case "chardescription": return ctx.description ?? "";
      case "personality": case "charpersonality": return ctx.personality ?? "";
      case "scenario": case "charscenario": return ctx.scenario ?? "";
      case "persona": return ctx.persona ?? "";
      case "mesexamples": case "mesexamplesraw": return ctx.mesExamples ?? "";
      case "charprompt": return ctx.card?.systemPrompt ?? "";
      case "charinstruction": case "charjailbreak": return ctx.card?.postHistoryInstructions ?? "";
      case "chardepthprompt": return ctx.card?.depthPrompt ?? "";
      case "charcreatornotes": case "creatornotes": return ctx.card?.creatorNotes ?? "";
      case "charversion": case "version": case "char_version": return ctx.card?.version ?? "";
      case "charfirstmessage": case "greeting": {
        const i = rest.trim() === "" ? 0 : Number(rest);
        return Number.isInteger(i) && i >= 0 ? ctx.card?.firstMessages?.[i] ?? "" : "";
      }
      case "group": case "charifnotgroup": case "groupnotmuted": return group().join(", ");
      case "notchar": return [...group(), ctx.user].filter((n) => n !== ctx.char).join(", ");
      case "model": return ctx.model ?? "";
      case "original": return ctx.original ?? "";
      case "lastmessage": return ctx.lastMessage ?? "";
      case "lastusermessage": return ctx.lastUserMessage ?? "";
      case "lastcharmessage": return ctx.lastCharMessage ?? "";
      case "lastmessageid": return ctx.lastMessageId === undefined || ctx.lastMessageId < 0 ? "" : String(ctx.lastMessageId);
      case "lastgenerationtype": return ctx.generationType ?? "";
      case "maxprompt": case "maxprompttokens": case "maxcontext": case "maxcontexttokens": return ctx.maxContext === undefined ? "" : String(ctx.maxContext);
      case "maxresponse": case "maxresponsetokens": return ctx.maxResponse === undefined ? "" : String(ctx.maxResponse);
      case "ismobile": return "false";
      case "hasextension": return "false";
      case "banned": return ""; // Text Completion only in SillyTavern; nothing to ban here
      case "newline": { const n = rest.trim() === "" ? 1 : Number(rest); return "\n".repeat(Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 1); }
      case "space": { const n = rest.trim() === "" ? 1 : Number(rest); return " ".repeat(Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 1); }
      case "trim": trim = true; return "\u0000TRIM\u0000";
      case "noop": return "";
      case "else": return ""; // outside an {{if}}
      case "reverse": return [...rest].reverse().join("");
      case "random": { const c = choices(rest); return c.length ? c[Math.floor(rnd() * c.length)]! : ""; }
      case "pick": {
        const c = choices(rest);
        pickCount++;
        return c.length ? c[hash(`${ctx.seed ?? ""}|${pickCount}|${rest}`) % c.length]! : "";
      }
      case "roll": return roll(rest, rnd);
      case "time": {
        const at = rest.trim() ? atOffset(now, rest) ?? now : now;
        return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
      }
      case "date": return now.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      case "weekday": return now.toLocaleDateString(undefined, { weekday: "long" });
      case "isotime": return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      case "isodate": return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      case "datetimeformat": return formatDate(now, rest);
      // variables: local (this chat) and global (every chat)
      case "setvar": case "setglobalvar": {
        const [k, ...v] = args();
        if (k?.trim()) (name === "setvar" ? vars : globals).set(k.trim(), v.join("::"));
        return "";
      }
      case "getvar": case "getglobalvar": return (name === "getvar" ? vars : globals).get(rest.trim()) ?? "";
      case "addvar": case "addglobalvar": {
        const [k = "", ...v] = args();
        addTo(name === "addvar" ? vars : globals, k.trim(), v.join("::"));
        return "";
      }
      case "incvar": case "decvar": return addTo(vars, rest.trim(), name === "incvar" ? "1" : "-1");
      case "incglobalvar": case "decglobalvar": return addTo(globals, rest.trim(), name === "incglobalvar" ? "1" : "-1");
      case "hasvar": case "varexists": return String(vars.has(rest.trim()));
      case "hasglobalvar": case "globalvarexists": return String(globals.has(rest.trim()));
      case "deletevar": case "flushvar": vars.delete(rest.trim()); return "";
      case "deleteglobalvar": case "flushglobalvar": globals.delete(rest.trim()); return "";
      case "setvarkey": case "setvarindex": case "setglobalvarkey": case "setglobalvarindex": {
        const [k = "", key = "", ...v] = args();
        setKey(name.startsWith("setvar") ? vars : globals, k.trim(), key.trim(), v.join("::"));
        return "";
      }
      case "getvarkey": case "getvarindex": case "getglobalvarkey": case "getglobalvarindex": {
        const [k = "", key = ""] = args();
        return getKey(name.startsWith("getvar") ? vars : globals, k.trim(), key.trim());
      }
    }
    // {{state.tracker.field}} or {{state::tracker.field}}
    const statePath = /^state[.:]+(.+)$/i.exec(body)?.[1];
    if (statePath) {
      const [ns, ...keys] = statePath.trim().split(".");
      let v: unknown = ns ? ctx.state?.[ns] : undefined;
      for (const k of keys) v = v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined;
      if (v === undefined || v === null) return "";
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    }
    return ctx.custom?.(name, rest ? rest.split("::") : []);
  };

  /** {{.name …}} / {{$name …}} (SillyTavern's MacroCstWalker). The value is read only when it is needed. */
  const shorthand = (m: RegExpExecArray, depth: number): string => {
    const store = m[1] === "." ? vars : globals;
    const key = m[2]!;
    const op = m[3];
    let cached: string | undefined;
    const value = () => (cached ??= run(m[4] ?? "", depth));
    const cur = store.get(key);
    const num = (s: string | undefined) => (s !== undefined && isNumber(s) ? Number(s) : NaN);
    switch (op) {
      case undefined: return cur ?? "";
      case "++": return addTo(store, key, "1");
      case "--": return addTo(store, key, "-1");
      case "=": store.set(key, value()); return "";
      case "+=": addTo(store, key, value()); return "";
      case "-=": { const n = Number(value()); if (isNumber(value())) addTo(store, key, String(-n)); return ""; }
      case "||": return isFalsyMacroValue(cur) ? value() : cur!;
      case "??": return cur === undefined ? value() : cur;
      case "||=": if (isFalsyMacroValue(cur)) { store.set(key, value()); return value(); } return cur!;
      case "??=": if (cur === undefined) { store.set(key, value()); return value(); } return cur;
      case "==": return String((cur ?? "") === value());
      case "!=": return String((cur ?? "") !== value());
      case ">": case ">=": case "<": case "<=": {
        const a = num(cur), b = num(value());
        if (Number.isNaN(a) || Number.isNaN(b)) return "false";
        return String(op === ">" ? a > b : op === ">=" ? a >= b : op === "<" ? a < b : a <= b);
      }
    }
    return "";
  };

  /**
   * {{if cond}}: "!" inverts; a bare macro name or .var / $var is read first. Ours on top of SillyTavern's: a comparison
   * written straight in the condition ({{if .hp < 5}}) is worked out (SillyTavern would read it as text, always true).
   */
  const condition = (raw: string, depth: number): boolean => {
    const inverted = /^\s*!/.test(raw);
    const stripped = raw.replace(/^\s*!\s*/, "");
    const compare = SHORTHAND.exec(stripped);
    if (compare && ["==", "!=", ">", ">=", "<", "<="].includes(compare[3] ?? "")) return isFalsyMacroValue(shorthand(compare, depth)) === inverted;
    let c = run(stripped, depth).trim();
    const short = /^([.$])([a-zA-Z](?:[\w-]*\w)?)$/.exec(c);
    if (short) c = (short[1] === "." ? vars : globals).get(short[2]!) ?? "";
    else if (CONDITION_MACROS.has(c.toLowerCase())) c = one(c) ?? c;
    return isFalsyMacroValue(c) === inverted;
  };

  /** Left to right; a known macro whose result holds macros is read again (a card's {{char}} inside {{description}}). */
  const run = (src: string, depth: number): string => {
    if (!src.includes("{{")) return src;
    let out = "";
    let pos = 0;
    for (let s = nextMacro(src, pos); s; s = nextMacro(src, pos)) {
      out += src.slice(pos, s.start);
      pos = s.end;
      const h = head(s.inner);
      if (h.name === "if") {
        const parts = splitArgs(h.rest);
        if (parts.length > 1) { // inline: {{if cond::content}}
          if (condition(parts[0]!, depth)) out += run(parts.slice(1).join("::"), depth);
          continue;
        }
        const close = findCloseIf(src, s.end);
        if (!close) { out += src.slice(s.start, s.end); continue; } // no {{/if}}: left as written
        const { then, other } = splitElse(src.slice(s.end, close.start));
        const chosen = condition(h.rest, depth) ? then : other;
        if (chosen !== undefined) out += run(chosen, depth).trim();
        pos = close.end;
        continue;
      }
      const short = SHORTHAND.exec(s.inner);
      if (short && (short[3] !== undefined || short[4] === "")) { out += shorthand(short, depth); continue; }
      const inner = s.inner.includes("{{") ? run(s.inner, depth) : s.inner;
      const v = one(inner);
      if (v === undefined) out += `{{${inner}}}`; // unknown: as written
      else out += v.includes("{{") && depth < 8 ? run(v, depth + 1) : v;
    }
    return out + src.slice(pos);
  };

  let out = run(text.replace(/<BOT>/g, ctx.char).replace(/<USER>/g, ctx.user), 0);
  if (trim) out = out.replace(/\s*\u0000TRIM\u0000\s*/g, "").trim();
  return out;
}
