// Homunculus 2 — tests for the Text layout's document (D-102). Author: CLAUDE, 2026-11-08.
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { buildSearch, expand } from "./ui/LoreReplace.tsx";
import { MARK, allKeys, applyTexts, buildDoc, changedParts, findMatches, lockedRanges, parseDoc, shownKeys, textsOf, type CardText } from "./textDoc.ts";

const card = (over: Partial<CardText> = {}): CardText => ({
  name: "Lyra", description: "A mage from {{user}}'s village.", personality: "", scenario: "A tavern.", firstMessages: ["Hello.", "Hi again."],
  exampleMessages: "", note: "", systemPrompt: "", postHistoryInstructions: "", creatorNotes: "", tags: ["Fantasy", "Mage"], ...over,
});

describe("Text layout document", () => {
  it("shows name, description and greetings always, the rest when filled", () => {
    const keys = shownKeys(card(), new Set(), false);
    expect(keys).toEqual(["name", "description", "scenario", "greeting:0", "greeting:1", "tags"]);
    expect(shownKeys(card(), new Set(), true)).toEqual(allKeys(card()));
    expect(shownKeys(card({ scenario: "" }), new Set(["scenario"]), false)).toContain("scenario");
    expect(shownKeys(card({ firstMessages: [] }), new Set(), false)).toContain("greeting:0");
  });

  it("round-trips every field through the document", () => {
    const c = card({ personality: "Kind.\n\nStubborn.", creatorNotes: "x", tags: ["A", "B"] });
    const doc = buildDoc(c, allKeys(c));
    const back = applyTexts(c, textsOf(doc));
    expect(back).toEqual(c);
    expect(changedParts(back, c)).toEqual([]);
  });

  it("reads edits into the right fields", () => {
    const c = card();
    const keys = shownKeys(c, new Set(), false);
    const doc = buildDoc(c, keys).replace("A tavern.", "A tavern at night.").replace("Hi again.", "Hey.").replace("Fantasy, Mage", "Fantasy,  Dark, Mage, Dark,");
    const next = applyTexts(c, textsOf(doc));
    expect(next.scenario).toBe("A tavern at night.");
    expect(next.firstMessages).toEqual(["Hello.", "Hey."]);
    expect(next.tags).toEqual(["Fantasy", "Dark", "Mage"]);
    expect(changedParts(next, c)).toEqual(["scenario", "firstMessages", "tags"]);
  });

  it("keeps a name on one line and empty fields empty", () => {
    const c = card({ description: "" });
    const doc = buildDoc(c, allKeys(c));
    const fields = parseDoc(doc);
    expect(fields.find((f) => f.key === "description")).toMatchObject({ from: expect.any(Number) });
    expect(textsOf(doc).description).toBe("");
    expect(applyTexts(c, { name: "Lyra\nthe Bold" }).name).toBe("Lyra the Bold");
  });

  it("never lets an edit touch a header", () => {
    const c = card();
    const doc = buildDoc(c, shownKeys(c, new Set(), false));
    const fields = parseDoc(doc);
    const state = EditorState.create({ doc, extensions: [EditorState.changeFilter.of(() => lockedRanges(fields).flat())] });
    // select everything and delete: every field empties, every header stays
    const after = state.update({ changes: { from: 0, to: doc.length } }).state.doc.toString();
    expect(parseDoc(after).map((f) => f.key)).toEqual(fields.map((f) => f.key));
    expect(Object.values(textsOf(after)).every((t) => t === "")).toBe(true);
    // typing at the end of a field and at the start of the next one both work
    const scen = fields.find((f) => f.key === "scenario")!;
    const g0 = fields.find((f) => f.key === "greeting:0")!;
    const typed = state.update({ changes: [{ from: scen.to, insert: "!" }, { from: g0.from, insert: ">" }] }).state.doc.toString();
    expect(textsOf(typed).scenario).toBe("A tavern.!");
    expect(textsOf(typed)["greeting:0"]).toBe(">Hello.");
  });

  it("removes stray header marks from texts", () => {
    const c = card({ description: `odd ${MARK}tags text` });
    expect(textsOf(buildDoc(c, ["name", "description"])).description).toBe("odd tags text");
  });

  it("finds across fields, skips headers, and builds $1 replacements", () => {
    const c = card({ description: "Lyra is Lyra.", scenario: "Lyra's tavern." });
    const doc = buildDoc(c, shownKeys(c, new Set(), false));
    const fields = parseDoc(doc);
    const re = buildSearch({ find: "(Ly)ra", matchCase: true, wholeWord: false, regex: true }) as RegExp;
    const ms = findMatches(doc, fields, re, (g) => expand("$1RA", [...g, 0]));
    expect(ms.map((m) => m.key)).toEqual(["name", "description", "description", "scenario"]);
    expect(ms[0]!.replacement).toBe("LyRA");
    expect(ms.every((m) => doc.slice(m.from, m.to) === "Lyra")).toBe(true);
    expect(findMatches(doc, fields, re, () => "", "scenario")).toHaveLength(1);
    // the word "tags" is a header key too, but only real text is searched
    const tags = buildSearch({ find: "tags", matchCase: false, wholeWord: false, regex: false }) as RegExp;
    expect(findMatches(doc, fields, tags, () => "")).toHaveLength(0);
  });
});
