// Field diff and lore cap helpers (D-100), ported from Glaze janitor_field_diff.dart / janitor_lore_budget.dart. CLAUDE, 2026-11-08.
import { expect, it } from "vitest";
import { fieldsOfMeta, isSaturated, loreTokens, scanInjectedFields, splitTrigger, withoutInjected, type PromptFields } from "../src/sources/janitor-diff.ts";

const f = (o: Partial<PromptFields>): PromptFields => ({ persona: "", scenario: "", example: "", firstMessage: "", ...o });
const LINE = "The keeper's daughter hides a map under the third stair.";

it("reports lines the trigger added to a field, once, and not what separate already isolated or public entries", () => {
  const probe = f({ persona: "Mira keeps the lighthouse.\nShe is stern.", scenario: "A storm." });
  const capture = f({ persona: `Mira keeps the lighthouse.\n${LINE}\nShe is stern.`, scenario: "A storm.\nPublic fact copied from an open book, long enough." });
  const blocks = scanInjectedFields({ capture, extra: [capture], probe, publicContents: ["Public fact copied from an open book, long enough."] });
  expect(blocks).toEqual([{ field: "persona", text: LINE }]);
  expect(scanInjectedFields({ capture, probe, existing: LINE, publicContents: ["Public fact copied from an open book, long enough."] })).toEqual([]);
  expect(scanInjectedFields({ capture })).toEqual([]); // no baseline at all: nothing can be told apart
  expect(withoutInjected(capture.persona, "persona", blocks)).toBe("Mira keeps the lighthouse.\nShe is stern.");
});

it("ignores quote/dash/space/case drift and short leftovers", () => {
  const probe = f({ scenario: "It's a “dark” night — cold." });
  const capture = f({ scenario: "it’s a \"dark\"   night - cold.\nok." });
  expect(scanInjectedFields({ capture, probe })).toEqual([]);
});

it("compares the probe with a public definition's clean fields; an empty clean field is not a baseline", () => {
  const clean = fieldsOfMeta({ personality: "Mira keeps the lighthouse.", scenario: "", first_message: "Hi.", first_messages: ["Hi.", "Hello again."] });
  expect(clean.firstMessage).toBe("Hi.\nHi.\nHello again.");
  const probe = f({ persona: `Mira keeps the lighthouse.\n${LINE}`, scenario: "Whole scenario the catalog withholds from guests." });
  expect(scanInjectedFields({ capture: probe, probe, clean })).toEqual([{ field: "persona", text: LINE }]);
});

it("splits a trigger at the coarsest boundary into two near-equal halves", () => {
  expect(splitTrigger("aaaa\n\nbbbb\n\ncccc\n\ndddd")).toEqual(["aaaa\n\nbbbb", "cccc\n\ndddd"]);
  expect(splitTrigger("one line\nsecond line")).toEqual(["one line", "second line"]);
  expect(splitTrigger("First. Second! Third?")).toEqual(["First. Second!", "Third?"]);
  expect(splitTrigger("word")).toEqual(["word"]);
});

it("counts lore outside the card's blocks plus the growth of the blocks since the probe", () => {
  const sys = (inner: string, out: string) => ({ messages: [{ role: "system", content: `<Mira's Persona>${inner}</Mira's Persona>\n${out}` }] });
  expect(loreTokens(sys("abc", "x".repeat(300)))).toBe(101); // the line break left by the cut block counts too
  expect(loreTokens(sys("abc" + "y".repeat(300), ""), sys("abc", "")) - loreTokens(sys("abc", ""))).toBe(100);
  expect(isSaturated(sys("", "x".repeat(400_000)))).toBe(true);
  expect(isSaturated(sys("", "x".repeat(300_000)))).toBe(false);
});
