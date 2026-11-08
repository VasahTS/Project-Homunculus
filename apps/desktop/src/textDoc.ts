// Homunculus 2 — the character as one plain document, for the editor's Text layout (D-102). Author: CLAUDE, 2026-11-08.
// Daniel (10/30, translated): "a mode that shows all fields at once, to edit raw without the JSON or tags; with find,
// replace etc.; a copy to compare with before editing; so I don't have to open Notepad++ every time I edit a card."
//
// The document is every shown field, one after another. Each field starts with a header line — a private-use mark and
// the field's key — that the editor draws as a fixed title and never lets anyone edit. The text under it is the field.
// Nothing here knows about CodeMirror: these are plain functions (tested in textDoc.test.ts).

/** The parts of a card the Text layout shows, as text. Greetings stay a list; the tags are one line. */
export interface CardText {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessages: string[];
  exampleMessages: string;
  note: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  creatorNotes: string;
  tags: string[];
}

export type TextKey = Exclude<keyof CardText, "firstMessages"> | `greeting:${number}`;
/** How a field's text looks: the name big, most fields in the reading font, examples in mono, tags on one line. */
export type FieldLook = "title" | "prose" | "mono" | "line";

/** Starts every header line. A private-use character: it never appears in a card, and typed or pasted ones are removed. */
export const MARK = "";

const SIMPLE: Array<{ key: Exclude<TextKey, `greeting:${number}`>; label: string; look: FieldLook; always?: boolean }> = [
  { key: "name", label: "Name", look: "title", always: true },
  { key: "description", label: "Description", look: "prose", always: true },
  { key: "personality", label: "Personality", look: "prose" },
  { key: "scenario", label: "Scenario", look: "prose" },
  // greetings go here
  { key: "exampleMessages", label: "Example Dialogue", look: "mono" },
  { key: "note", label: "Character's Note", look: "prose" },
  { key: "systemPrompt", label: "System Prompt", look: "prose" },
  { key: "postHistoryInstructions", label: "Post-History Instructions", look: "prose" },
  { key: "creatorNotes", label: "Creator Notes", look: "prose" },
  { key: "tags", label: "Tags", look: "line" },
];

export const isGreeting = (k: string): k is `greeting:${number}` => k.startsWith("greeting:");
export const greetingIndex = (k: string): number => Number(k.slice("greeting:".length));

export function fieldLabel(k: TextKey): string {
  if (isGreeting(k)) { const i = greetingIndex(k); return i === 0 ? "First Message" : `Greeting ${i + 1}`; }
  return SIMPLE.find((f) => f.key === k)?.label ?? k;
}
export const fieldLook = (k: TextKey): FieldLook => (isGreeting(k) ? "prose" : SIMPLE.find((f) => f.key === k)?.look ?? "prose");

/** Every field of the card, in document order. */
export function allKeys(c: CardText): TextKey[] {
  const out: TextKey[] = [];
  for (const f of SIMPLE) {
    out.push(f.key);
    if (f.key === "scenario") c.firstMessages.forEach((_, i) => out.push(`greeting:${i}`));
  }
  if (c.firstMessages.length === 0) out.splice(out.indexOf("scenario") + 1, 0, "greeting:0");
  return out;
}

/** A field's text, as the document shows it. */
export function textOf(c: CardText, k: TextKey): string {
  if (isGreeting(k)) return c.firstMessages[greetingIndex(k)] ?? "";
  if (k === "tags") return c.tags.join(", ");
  return c[k];
}

/** The fields to show: Name, Description and the greetings always; the rest when they have text, when they were already
 *  shown (a field emptied while typing stays put), or when "Show empty fields" is on. */
export function shownKeys(c: CardText, already: ReadonlySet<string>, showEmpty: boolean): TextKey[] {
  return allKeys(c).filter((k) => isGreeting(k) || SIMPLE.find((f) => f.key === k)?.always || showEmpty || already.has(k) || textOf(c, k).trim() !== "");
}

export const clean = (s: string): string => s.split(MARK).join("");

export function buildDoc(c: CardText, keys: TextKey[]): string {
  return keys.map((k) => `${MARK}${k}\n${clean(textOf(c, k))}`).join("\n");
}

/** One field in the document: its header line [headFrom, headTo) and its text [from, to). */
export interface DocField { key: TextKey; headFrom: number; headTo: number; from: number; to: number }

/** The fields of a document, in order. Text before the first header (there should be none) is ignored. */
export function parseDoc(doc: string): DocField[] {
  const out: DocField[] = [];
  let pos = 0;
  for (const line of doc.split("\n")) {
    const end = pos + line.length;
    if (line.startsWith(MARK)) {
      const last = out.at(-1);
      if (last) last.to = Math.max(last.from, pos - 1);
      out.push({ key: line.slice(MARK.length) as TextKey, headFrom: pos, headTo: end, from: Math.min(end + 1, doc.length), to: doc.length });
    }
    pos = end + 1;
  }
  return out;
}

/** The ranges nobody may change: each header with the line breaks around it (typing at either edge is fine). */
export function lockedRanges(fields: DocField[]): Array<[number, number]> {
  return fields.map((f, i) => [i === 0 ? 0 : fields[i - 1]!.to, f.from]);
}

/** The texts of a document by key. */
export function textsOf(doc: string, fields: DocField[] = parseDoc(doc)): Partial<Record<TextKey, string>> {
  const out: Partial<Record<TextKey, string>> = {};
  for (const f of fields) out[f.key] = doc.slice(f.from, f.to);
  return out;
}

const tagList = (s: string): string[] => [...new Set(s.split(/[,\n]/).map((t) => t.trim()).filter(Boolean))];

/** The card with the document's texts put in. Fields the document doesn't show keep their values. */
export function applyTexts(c: CardText, texts: Partial<Record<TextKey, string>>): CardText {
  const next: CardText = { ...c, firstMessages: [...c.firstMessages], tags: [...c.tags] };
  for (const [k, t] of Object.entries(texts) as Array<[TextKey, string]>) {
    if (isGreeting(k)) { const i = greetingIndex(k); if (i >= 0 && i < Math.max(1, next.firstMessages.length)) next.firstMessages[i] = t; }
    else if (k === "tags") next.tags = tagList(t);
    else if (k === "name") next.name = t.replace(/\s*\n\s*/g, " ");
    else if (k in next) (next as unknown as Record<string, string>)[k] = t;
  }
  return next;
}

/** Which parts of the card differ (greetings compared as one list). */
export function changedParts(a: CardText, b: CardText): Array<keyof CardText> {
  return (Object.keys(a) as Array<keyof CardText>).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

/** For Find: every match of a search in the shown fields (or only in `only`), with what Replace would put there. */
export interface TextMatch { key: TextKey; from: number; to: number; replacement: string }

export function findMatches(doc: string, fields: DocField[], re: RegExp, replace: (groups: Array<string | undefined>) => string, only?: TextKey): TextMatch[] {
  const out: TextMatch[] = [];
  for (const f of fields) {
    if (only && f.key !== only) continue;
    const text = doc.slice(f.from, f.to);
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[0] === "") { re.lastIndex++; continue; }
      out.push({ key: f.key, from: f.from + m.index, to: f.from + m.index + m[0].length, replacement: replace([...m]) });
    }
  }
  return out;
}
