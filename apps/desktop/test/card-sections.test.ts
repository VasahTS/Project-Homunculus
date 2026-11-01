// Unit tests for the character editor's outline (D-070). Author: CLAUDE, 2026-11-01.
import { describe, expect, it } from "vitest";
import { cardSections, cleanGreetings } from "../src/cardSections.ts";

describe("cardSections", () => {
  it("finds top-level wrapper tags, in order, and skips what is inside them", () => {
    const text = "<lyra>\nName: Lyra\n<secret>hidden</secret>\n</lyra>\n\n<world attr=\"x\">Pines.</world>";
    const s = cardSections(text);
    expect(s.map((x) => x.name)).toEqual(["lyra", "world"]);
    expect(s[0]!.pos).toBe(0);
    expect(s[1]!.pos).toBe(text.indexOf("<world"));
    expect(s[1]!.length).toBe("Pines.".length);
  });

  it("ignores tags that are never closed and stray brackets", () => {
    expect(cardSections("<b>bold</b> and <i>open, 3 < 4 > 2")).toEqual([{ name: "b", pos: 0, length: 4, kind: "tag" }]);
  });

  it("falls back to Markdown headings when there are no tags", () => {
    const s = cardSections("# Lyra\ntext\n## Looks ##\nmore\n#### too deep");
    expect(s.map((x) => [x.name, x.kind])).toEqual([["Lyra", "heading"], ["Looks", "heading"]]);
  });

  it("an empty or plain text has no sections", () => {
    expect(cardSections("")).toEqual([]);
    expect(cardSections("Just a description.")).toEqual([]);
  });
});

describe("cleanGreetings", () => {
  it("drops empty alternates but never promotes an alternate over an empty Greeting 1", () => {
    expect(cleanGreetings(["Hi.", "", "Rain.", "  "])).toEqual(["Hi.", "Rain."]);
    expect(cleanGreetings(["", "Rain."])).toEqual(["", "Rain."]);
    expect(cleanGreetings(["", " "])).toEqual([]);
    expect(cleanGreetings([])).toEqual([]);
  });
});
