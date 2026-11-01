// Homunculus 2 — the parts of a long card text, for the character editor's outline (D-070). Author: CLAUDE, 2026-11-01.
// Many people write a whole sheet in Description with one wrapper tag per part (`<lyra> … </lyra>`, `<world> … </world>`);
// others use Markdown headings. Nothing here is specific to one card: any top-level tag that is closed counts.

export interface CardSection {
  /** The tag's or the heading's name. */
  name: string;
  /** Where it starts in the text (for jumping there). */
  pos: number;
  /** Characters inside the tag (0 for headings). */
  length: number;
  kind: "tag" | "heading";
}

/** Top-level `<tag> … </tag>` blocks; when there are none, `#`/`##`/`###` headings. Unclosed tags are ignored. */
export function cardSections(text: string): CardSection[] {
  const out: CardSection[] = [];
  const open = /<([A-Za-z][\w.-]*)(\s[^<>]*)?>/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(text))) {
    const name = m[1]!;
    const close = text.indexOf(`</${name}>`, open.lastIndex);
    if (close < 0) continue;
    out.push({ name, pos: m.index, length: close - open.lastIndex, kind: "tag" });
    open.lastIndex = close + name.length + 3; // skip what is inside: only top-level parts
  }
  if (out.length) return out;
  const heading = /^#{1,3}[ \t]+(.+?)[ \t#]*$/gm;
  while ((m = heading.exec(text))) out.push({ name: m[1]!, pos: m.index, length: 0, kind: "heading" });
  return out;
}

/**
 * Greetings to keep when saving a card: empty alternates go; an empty Greeting 1 stays when there are alternates (so the
 * second one does not silently become the main one); all empty = none.
 */
export function cleanGreetings(list: string[]): string[] {
  return list.some((m) => m.trim()) ? list.filter((m, i) => i === 0 || m.trim()) : [];
}
