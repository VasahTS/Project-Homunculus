// Reading JanitorAI's assembled prompt (the /generateAlpha answer) back into a card and its closed lore (D-099).
// Port of Glaze `lib/features/catalog/services/janitor_separate.dart` (hydall/Glaze f1fe39e, AGPL-3.0), itself a port of the
// SillyTavern `janitor-lorebook` plugin's separate.cjs. JanitorAI builds the system message as:
//   [jailbreak]  <Name's Persona>card</…Persona>  <UserPersona>…</UserPersona>  <Scenario>…</Scenario>  <Example…>…</Example…>  lore…
// CLAUDE, 2026-11-08.

export type AlphaPayload = { messages?: unknown };
type Msg = { role?: unknown; content?: unknown };

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
export const tidy = (s: string) => s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** Whether a /generateAlpha answer is an assembled prompt (has a system message). */
export const isAlphaPayload = (o: unknown): o is AlphaPayload =>
  !!o && typeof o === "object" && Array.isArray((o as AlphaPayload).messages) && ((o as { messages: Msg[] }).messages).some((m) => m?.role === "system" && typeof m.content === "string");

export function systemContent(p: AlphaPayload): string {
  if (!Array.isArray(p.messages)) return "";
  for (const m of p.messages as Msg[]) if (m?.role === "system" && typeof m.content === "string") return m.content;
  return "";
}

const LEADING_JAILBREAK = /^\s*(?:\[[^\]]*\]\s*)+/;
const PERSONA = /<[^<>\n]*?Persona>[\s\S]*?<\/[^<>\n]*?Persona>/gi;
const SCENARIO = /<Scenario>[\s\S]*?<\/Scenario>/gi;
const EXAMPLE = /<Example[^<>\n]*>[\s\S]*?<\/Example[^<>\n]*>/gi;

/** The text left after the jailbreak prefix and the persona / scenario / example blocks are cut out. */
export function stripWrappers(text: string): string {
  return text.replace(LEADING_JAILBREAK, "").replace(PERSONA, "\n").replace(SCENARIO, "\n").replace(EXAMPLE, "\n");
}

/** Glaze `loosePattern`: literal, except any whitespace run and quote/dash variants match each other. */
export const loosePattern = (needle: string) => needle
  .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  .replace(/\s+/g, "\\s+")
  .replace(/['‘’ʼ]/g, "['‘’ʼ]")
  .replace(/["“”]/g, '["“”]')
  .replace(/[-–—]/g, "[-–—]");

function subtractKnownCard(text: string, card: string): string {
  if (!card.trim()) return text;
  const known = new Set(card.split("\n").map(norm).filter((n) => n.length >= 12));
  return text.split("\n").filter((l) => { const n = norm(l); return !(n.length >= 12 && known.has(n)); }).join("\n");
}
/** Cuts the verbatim text of public lorebook entries out (both kinds of lore are injected into the same message). */
export function withoutPublicEntries(text: string, publicContents: string[]): string {
  let out = text;
  for (const c of publicContents) {
    const needle = c.trim();
    if (needle.length < 12) continue;
    try { out = out.replace(new RegExp(loosePattern(needle), "gi"), "\n"); } catch { /* an odd entry is skipped */ }
  }
  return out;
}

/** The closed-lore text of one payload. */
export function separate(p: AlphaPayload, knownCard = "", publicContents: string[] = []): string {
  return tidy(withoutPublicEntries(subtractKnownCard(stripWrappers(systemContent(p)), knownCard), publicContents));
}
/** Letters (any script) in a text. */
const letters = (s: string) => s.match(/\p{L}/gu)?.length ?? 0;
/** Fewer letters than this is not lore but what JanitorAI's template leaves around it (Daniel's cards without any closed
 *  lorebook came in with one entry "<.>"). A real entry has words; a scrap has punctuation. */
const MIN_LORE_LETTERS = 4;
/** Blank-line separated blocks, without lines that have no letter or digit and without blocks too short to be an entry. */
export const splitEntries = (text: string) => text.split(/\n\s*\n/)
  .map((b) => b.split("\n").filter((l) => /[\p{L}\p{N}]/u.test(l)).join("\n").trim())
  .filter((b) => letters(b) >= MIN_LORE_LETTERS);
/** Several passes' lore as one text, each block once, in first-seen order. */
export function mergeLore(texts: string[]): string {
  const seen = new Set<string>(); const out: string[] = [];
  for (const t of texts) for (const b of splitEntries(t)) if (!seen.has(norm(b))) { seen.add(norm(b)); out.push(b); }
  return out.join("\n\n");
}

/** The character card: the inner text of `<Name's Persona>` (not `<UserPersona>`). */
export function extractCard(p: AlphaPayload): string {
  for (const m of systemContent(p).matchAll(/<([^<>\n]*?)Persona>([\s\S]*?)<\/[^<>\n]*?Persona>/gi)) {
    if (/^\s*user/i.test(m[1]!)) continue;
    return m[2]!.trim();
  }
  return "";
}
export function extractName(p: AlphaPayload): string {
  const m = /<([^<>\n]*?)Persona>/i.exec(systemContent(p));
  const name = m ? m[1]!.replace(/['’]s\s*$/i, "").trim() : "";
  return name.toLowerCase() === "user" ? "" : name;
}
export const extractScenario = (p: AlphaPayload) => /<Scenario>([\s\S]*?)<\/Scenario>/i.exec(systemContent(p))?.[1]?.trim() ?? "";
export const extractExample = (p: AlphaPayload) => /<Example[^<>\n]*?>([\s\S]*?)<\/Example[^<>\n]*?>/i.exec(systemContent(p))?.[1]?.trim() ?? "";
export function extractFirstMessage(p: AlphaPayload): string {
  if (!Array.isArray(p.messages)) return "";
  for (const m of p.messages as Msg[]) if (m?.role === "assistant" && typeof m.content === "string") return m.content.trim();
  return "";
}

/** JanitorAI expands {{char}} / {{user}} before building the prompt: names back to macros, longest first; 3+ letters only. */
export function restoreMacros(text: string, charNames: string[], userName?: string | null): string {
  if (!text) return text;
  let out = text;
  for (const n of [...new Set(charNames.map((x) => x.trim()).filter((x) => x.length >= 3))].sort((a, b) => b.length - a.length)) out = out.split(n).join("{{char}}");
  const u = userName?.trim() ?? "";
  if (u.length >= 3) out = out.split(u).join("{{user}}");
  return out;
}

// JanitorAI's credit line, "created by {author} 2026© on janitorai.com", alone on its line or inside one.
const CREDIT = String.raw`created[ \t]+by[ \t]+[^\n]{1,120}?[ \t]+on[ \t]+(?:https?://)?(?:www\.)?janitor\.?ai(?:\.com)?\b/?`;
const DECOR = String.raw`[\[\]()*_~|>\-–—.! \t]*`;
const CREDIT_LINE = new RegExp(`^${DECOR}${CREDIT}${DECOR}(?:\\r?\\n|$)`, "gim");
const CREDIT_INLINE = new RegExp(String.raw`[ \t]*[\[(*_~]*[ \t]*${CREDIT}[\])*_~]*[.!]?`, "gi");
export function stripJanitorCredit(text: string): string {
  if (!text || !new RegExp(CREDIT, "i").test(text)) return text;
  return tidy(text.replace(CREDIT_LINE, "").replace(CREDIT_INLINE, ""));
}
