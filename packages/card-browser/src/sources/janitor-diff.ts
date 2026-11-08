// JanitorAI extraction: lore written INTO the card's own fields, and JanitorAI's per-prompt lore cap (D-099, gaps 3–4 of
// docs/JANITOR-EXTRACTION.md). Ports of Glaze (hydall/Glaze f1fe39e, AGPL-3.0): janitor_field_diff.dart (scanInjectedFields,
// withoutInjected) and janitor_lore_budget.dart (cap, saturation, splitTrigger). Pure functions, no I/O. CLAUDE, 2026-11-08.
//
// Field diff: `separate` drops the persona / scenario / example blocks whole, so an entry whose placement writes into one of
// them (or a script that rewrites the first message) is lost or ends up in the card. Every extraction sends "." (the probe:
// almost nothing fires) and then the trigger. Lines in the trigger's fields that are not in the probe's were injected by the
// entries the trigger fired. For a public definition, the probe is also compared with the clean catalog fields, which
// catches the always-on entries. A closed card has no clean baseline; its always-on lore stays in the card (Glaze's choice).
import { type AlphaPayload, extractCard, extractExample, extractFirstMessage, extractScenario, stripWrappers, systemContent, withoutPublicEntries } from "./janitor-prompt.ts";

export type InjectionField = "persona" | "scenario" | "example" | "firstMessage";
export const INJECTION_FIELDS: InjectionField[] = ["persona", "scenario", "example", "firstMessage"];
export type PromptFields = Record<InjectionField, string>;
export interface InjectedBlock { field: InjectionField; text: string }

/** The four fields of one captured prompt, with `restore` (macros back, credit out) applied to each. */
export function fieldsOf(p: AlphaPayload, restore: (s: string) => string = (s) => s): PromptFields {
  return { persona: restore(extractCard(p)), scenario: restore(extractScenario(p)), example: restore(extractExample(p)), firstMessage: restore(extractFirstMessage(p)) };
}
/** The clean fields a public definition publishes (`/hampter/characters/{id}`); every greeting folds into firstMessage. */
export function fieldsOfMeta(meta: Record<string, unknown>): PromptFields {
  const s = (v: unknown) => typeof v === "string" ? v : "";
  const greetings = [s(meta.first_message), ...(Array.isArray(meta.first_messages) ? meta.first_messages.map(s) : [])].filter((g) => g.trim()).join("\n");
  return { persona: s(meta.personality), scenario: s(meta.scenario), example: s(meta.example_dialogs ?? meta.mes_example), firstMessage: greetings };
}

/** Shortest block worth reporting (after folding): shorter is punctuation, a stray heading or a drifted line. */
const MIN_CHARS = 24;
/** Case-, whitespace- and quote/dash-insensitive form of a line; the server rewrites those freely between prompts. */
const fold = (s: string) => s.replace(/['‘’ʼ]/g, "'").replace(/["“”]/g, '"').replace(/[-–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

/** Lines of `after` missing from `before`, regrouped into contiguous blocks (a line-set subtraction, not a positional diff:
 *  an injection splits the baseline around it). */
function residue(after: string, before: string): string[] {
  if (!after.trim()) return [];
  const known = new Set(before.split("\n").map(fold).filter(Boolean));
  const blocks: string[] = []; let current: string[] = [];
  const flush = () => { const t = current.join("\n").trim(); current = []; if (fold(t).length >= MIN_CHARS) blocks.push(t); };
  for (const line of after.split("\n")) { const f = fold(line); if (f && known.has(f)) flush(); else current.push(line); }
  flush();
  return blocks;
}

/** The lore injected into the captured fields. `probe` = the "." capture; `clean` = a public definition's fields (none for
 *  a closed card); `existing` = what `separate` already isolated (not reported twice). */
export function scanInjectedFields(o: { capture: PromptFields; extra?: PromptFields[]; probe?: PromptFields | null; clean?: PromptFields | null; publicContents?: string[]; existing?: string }): InjectedBlock[] {
  if (!o.probe && !o.clean) return [];
  const blocks: InjectedBlock[] = []; const seen = new Set<string>();
  const isolated = fold(o.existing ?? "");
  const collect = (field: InjectionField, after: string, before: string) => {
    for (const b of residue(after, before)) {
      const t = withoutPublicEntries(b, o.publicContents ?? []).trim();
      const f = fold(t);
      if (f.length < MIN_CHARS || isolated.includes(f) || seen.has(f)) continue;
      seen.add(f); blocks.push({ field, text: t });
    }
  };
  for (const field of INJECTION_FIELDS) {
    const after = o.capture[field];
    // pass one: what the trigger (and each split pass) fired, whatever field it landed in
    if (o.probe) for (const pass of [o.capture, ...(o.extra ?? [])]) if (pass[field].trim()) collect(field, pass[field], o.probe[field]);
    if (!after.trim()) continue;
    // pass two: always-on entries, against the catalog's clean copy; an empty clean field means "withheld", not "empty"
    const baseline = o.clean?.[field] ?? "";
    if (baseline.trim()) collect(field, o.probe?.[field] ?? after, baseline);
  }
  return blocks;
}
/** `text` without the lines the scan recovered from `field` (they go to the lorebook, not the card too). */
export function withoutInjected(text: string, field: InjectionField, blocks: InjectedBlock[]): string {
  const injected = new Set(blocks.filter((b) => b.field === field).flatMap((b) => b.text.split("\n")).map(fold).filter(Boolean));
  if (!injected.size || !text) return text;
  return text.split("\n").filter((l) => !injected.has(fold(l))).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ------------------------------------------------------------------ the lore cap
/** Most lore JanitorAI injects into one assembled prompt, in tokens (cl100k, counted by its web client). Past it, fired
 *  entries are silently left out. */
export const LORE_TOKEN_CAP = 120_000;
/** A capped prompt stops below the cap by up to one entry; a false positive costs one more pass, a miss loses entries. */
export const LORE_SATURATION_MARGIN = 8_000;
/** Without JanitorAI's tokenizer: a deliberately high estimate (Glaze's fallback), so it errs towards splitting. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 3);

const WRAPPERS = [/<[^<>\n]*?Persona>[\s\S]*?<\/[^<>\n]*?Persona>/gi, /<Scenario>[\s\S]*?<\/Scenario>/gi, /<Example[^<>\n]*>[\s\S]*?<\/Example[^<>\n]*>/gi];
const wrapperText = (p: AlphaPayload) => WRAPPERS.flatMap((re) => [...systemContent(p).matchAll(re)].map((x) => x[0])).join("\n");
/** Lore tokens in a capture: what sits outside the card's blocks, plus how much the blocks grew since the probe. */
export function loreTokens(p: AlphaPayload, probe?: AlphaPayload | null, count = estimateTokens): number {
  let n = count(stripWrappers(systemContent(p)));
  if (probe) { const grown = count(wrapperText(p)) - count(wrapperText(probe)); if (grown > 0) n += grown; }
  return n;
}
export const isSaturated = (p: AlphaPayload, probe?: AlphaPayload | null, count = estimateTokens) => loreTokens(p, probe, count) >= LORE_TOKEN_CAP - LORE_SATURATION_MARGIN;

/** Two halves of about equal length, cut at the coarsest boundary that has more than one piece (paragraphs, lines,
 *  sentences, words), so keywords stay whole. `[text]` when nothing is left to cut. */
export function splitTrigger(text: string): string[] {
  const trimmed = text.trim();
  for (const [boundary, joiner] of [[/\n\s*\n/, "\n\n"], [/\n/, "\n"], [/(?<=[.!?…])\s+/, " "], [/\s+/, " "]] as const) {
    const units = trimmed.split(boundary).map((u) => u.trim()).filter(Boolean);
    if (units.length < 2) continue;
    const total = units.reduce((n, u) => n + u.length, 0);
    let cut = 1, left = units[0]!.length;
    while (cut < units.length - 1 && (left + units[cut]!.length) * 2 <= total + units[cut]!.length) { left += units[cut]!.length; cut++; }
    return [units.slice(0, cut).join(joiner), units.slice(cut).join(joiner)];
  }
  return [trimmed];
}
