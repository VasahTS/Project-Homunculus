// Homunculus 2 — macros: {{char}}, {{user}}, {{random::a::b}}… Author: CLAUDE, 2026-10-23; engine 2026-10-28 (slice 2, D-021).
//
// Same syntax as SillyTavern (public/scripts/macros/: env, core, chat, time and variable macros), for the
// macros presets and cards use most. Plus ours: {{state.<tracker>.<field>}} reads the world state.
// Messages are stored raw; macros are applied when showing them and when building the prompt, so
// changing the persona name later updates old messages too.
// Not supported yet (left as written): {{if}}…{{/if}} blocks, {{outlet}}, instruct-mode macros.

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
  /** {{original}}: the preset's text that a card's own prompt replaced. */
  original?: string;
  /** World state for {{state.tracker.field}}. */
  state?: Record<string, Record<string, unknown>>;
  /** Variables for {{setvar}} / {{getvar}} (live for one prompt). */
  vars?: Map<string, string>;
  /** Seed so {{pick}} gives the same choice on every swipe of the same message. */
  seed?: string;
  random?: () => number;
  now?: Date;
  /** Macros added by modules (registerMacro). */
  custom?: (name: string, args: string[]) => string | undefined;
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

/** "2d6+1" → a roll. */
function roll(formula: string, rnd: () => number): string {
  const m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(formula);
  if (!m) {
    const n = parseInt(formula, 10); // {{roll:20}} = 1d20
    return Number.isFinite(n) && n > 0 ? String(1 + Math.floor(rnd() * n)) : "";
  }
  const count = Math.min(100, parseInt(m[1] || "1", 10));
  const sides = parseInt(m[2]!, 10);
  let total = parseInt((m[3] ?? "0").replace(/\s/g, ""), 10);
  for (let i = 0; i < count; i++) total += 1 + Math.floor(rnd() * sides);
  return String(total);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Expands macros in `text`. Inner macros run first ({{getvar::{{user}}}} works). Unknown macros are
 * left as written, so nothing silently disappears.
 */
export function expandMacros(text: string, ctx: MacroContext): string {
  if (!text.includes("{{") && !text.includes("<BOT>") && !text.includes("<USER>")) return text;
  const rnd = ctx.random ?? Math.random;
  const vars = ctx.vars ?? new Map<string, string>();
  const now = ctx.now ?? new Date();
  let pickCount = 0;
  let trim = false;

  const one = (raw: string): string | undefined => {
    const body = raw.trim();
    if (body.startsWith("//")) return ""; // comment
    const sep = body.search(/::|:/);
    const name = (sep < 0 ? body : body.slice(0, sep)).trim().toLowerCase();
    const rest = sep < 0 ? "" : body.slice(sep).replace(/^::?/, "");
    switch (name) {
      case "char": return ctx.char;
      case "user": return ctx.user;
      case "description": case "chardescription": return ctx.description ?? "";
      case "personality": case "charpersonality": return ctx.personality ?? "";
      case "scenario": return ctx.scenario ?? "";
      case "persona": return ctx.persona ?? "";
      case "mesexamples": case "mesexamplesraw": return ctx.mesExamples ?? "";
      case "model": return ctx.model ?? "";
      case "original": return ctx.original ?? "";
      case "lastmessage": return ctx.lastMessage ?? "";
      case "lastusermessage": return ctx.lastUserMessage ?? "";
      case "lastcharmessage": return ctx.lastCharMessage ?? "";
      case "newline": return "\n";
      case "trim": trim = true; return "\u0000TRIM\u0000";
      case "noop": return "";
      case "random": { const c = choices(rest); return c.length ? c[Math.floor(rnd() * c.length)]! : ""; }
      case "pick": {
        const c = choices(rest);
        pickCount++;
        return c.length ? c[hash(`${ctx.seed ?? ""}|${pickCount}|${rest}`) % c.length]! : "";
      }
      case "roll": return roll(rest, rnd);
      case "time": return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      case "date": return now.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      case "weekday": return now.toLocaleDateString(undefined, { weekday: "long" });
      case "isotime": return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      case "isodate": return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      case "setvar": { const [k, ...v] = rest.split("::"); if (k) vars.set(k.trim(), v.join("::")); return ""; }
      case "getvar": return vars.get(rest.trim()) ?? "";
      case "addvar": {
        const [k, v = ""] = rest.split("::");
        if (!k) return "";
        const cur = vars.get(k.trim()) ?? "";
        const a = Number(cur), b = Number(v);
        vars.set(k.trim(), cur !== "" && Number.isFinite(a) && Number.isFinite(b) ? String(a + b) : cur + v);
        return "";
      }
      case "incvar": case "decvar": {
        const k = rest.trim();
        const n = (Number(vars.get(k) ?? 0) || 0) + (name === "incvar" ? 1 : -1);
        vars.set(k, String(n));
        return String(n);
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

  let out = text.replace(/<BOT>/g, ctx.char).replace(/<USER>/g, ctx.user);
  // innermost first, a few rounds (macros that produce macros stop here, on purpose)
  for (let round = 0; round < 8; round++) {
    let changed = false;
    out = out.replace(/\{\{([^{}]*)\}\}/g, (whole, inner: string) => {
      const v = one(inner);
      if (v === undefined) return `\u0001${inner}\u0002`; // unknown: protect it, put it back at the end
      changed = true;
      return v;
    });
    if (!changed) break;
  }
  out = out.replace(/\u0001/g, "{{").replace(/\u0002/g, "}}");
  if (trim) out = out.replace(/\s*\u0000TRIM\u0000\s*/g, "").trim();
  return out;
}
