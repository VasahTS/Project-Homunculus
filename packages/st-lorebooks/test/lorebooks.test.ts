// SillyTavern lorebooks in and out (slice 3, D-027). Author: CLAUDE, 2026-10-28.
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate } from "@homunculus/core";
import { Lorebook } from "@homunculus/schemas";
import {
  adoptAllEmbeddedLorebooks, adoptEmbeddedLorebook, bookForCardExport, characterWithBook, createSillyTavernLorebooksModule, exportStLorebook,
  importStLorebook, linkImportedLorebook, lorebookFromCardBook, lorebookToCardBook,
} from "../src/index.ts";

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

/** An entry exactly as SillyTavern saves it (newWorldInfoEntryTemplate + uid/displayIndex + an unknown field). */
const stEntry = (uid: number, over: Record<string, unknown> = {}) => ({
  uid, key: ["castle", "keep"], keysecondary: ["night"], comment: "The castle", content: "Haunted at night.", constant: false, vectorized: false,
  selective: true, selectiveLogic: 3, addMemo: true, order: 120, position: 4, disable: false, ignoreBudget: false, excludeRecursion: true,
  preventRecursion: false, matchPersonaDescription: false, matchCharacterDescription: true, matchCharacterPersonality: false,
  matchCharacterDepthPrompt: false, matchScenario: false, matchCreatorNotes: false, delayUntilRecursion: false, probability: 75, useProbability: true,
  depth: 2, outletName: "", group: "places", groupOverride: false, groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: true,
  useGroupScoring: null, automationId: "", role: 1, sticky: 2, cooldown: null, delay: null, triggers: ["normal", "regenerate"], displayIndex: uid,
  characterFilter: { isExclude: false, names: ["Lyra"], tags: [] }, extensions: {}, someOtherTool: { kept: true },
  ...over,
});

describe("SillyTavern World Info files", () => {
  const file = { entries: { "1": stEntry(1, { content: "Second." }), "0": stEntry(0), "10": stEntry(10, { position: 7, outletName: "secrets" }) }, someBookSetting: 3 };

  it("imports every field, in uid order", () => {
    const { lorebook, warnings } = importStLorebook(enc(file), "Realm.json");
    expect(warnings).toEqual([]);
    expect(lorebook.name).toBe("Realm");
    expect(lorebook.source).toEqual({ kind: "stFile", fileName: "Realm.json" });
    const [e0, e1, e10] = Lorebook.parse({ id: "x", ...lorebook }).entries;
    expect([e0!.id, e1!.id, e10!.id]).toEqual(["0", "1", "10"]);
    expect(e0).toMatchObject({
      title: "The castle", keys: ["castle", "keep"], secondaryKeys: ["night"], logic: "andAll", order: 120, position: "atDepth", depth: 2,
      role: "user", probability: 75, group: "places", excludeRecursion: true, matchWholeWords: true, sticky: 2, cooldown: null,
      triggers: ["normal", "swipe"], scan: { characterDescription: true }, characterFilter: { names: ["Lyra"], tags: [], exclude: false },
    });
    expect(e10).toMatchObject({ position: "outlet", outletName: "secrets" });
  });

  it("exports back exactly what SillyTavern saved (unknown fields included) when nothing changed", () => {
    const book = Lorebook.parse({ id: "x", ...importStLorebook(enc(file), "Realm.json").lorebook });
    expect(exportStLorebook(book).json).toEqual(file);
  });

  it("an edit changes only that field; our conditions travel in a field SillyTavern ignores, and come back", () => {
    const book = Lorebook.parse({ id: "x", ...importStLorebook(enc(file), "Realm.json").lorebook });
    book.entries[0] = { ...book.entries[0]!, content: "Changed.", conditions: [{ path: "world.place", op: "equals", value: "Keep" }] };
    const out = exportStLorebook(book).json as { entries: Record<string, Record<string, unknown>> };
    expect(out.entries["0"]).toEqual({ ...stEntry(0), content: "Changed.", homunculus: { conditions: [{ path: "world.place", op: "equals", value: "Keep" }], conditionLogic: "all" } });
    const again = Lorebook.parse({ id: "y", ...importStLorebook(enc(out), "Realm.json").lorebook });
    expect(again.entries[0]!.conditions).toEqual([{ path: "world.place", op: "equals", value: "Keep" }]);
  });

  it("new entries get the next free uid", () => {
    const book = Lorebook.parse({ id: "x", ...importStLorebook(enc(file), "Realm.json").lorebook });
    book.entries.push({ ...book.entries[0]!, id: "my-new-entry", original: undefined });
    expect(Object.keys((exportStLorebook(book).json as { entries: object }).entries)).toEqual(["0", "1", "10", "11"]);
  });

  it("says clearly what it can't read", () => {
    expect(() => importStLorebook(enc({ kind: "memory", entries: [] }), "a.json")).toThrow(/Agnai, RisuAI or NovelAI/);
    expect(() => importStLorebook(enc({ hello: 1 }), "a.json")).toThrow(/no "entries"/);
    expect(() => importStLorebook(new TextEncoder().encode("{"), "a.json")).toThrow(/not valid JSON/);
  });
});

describe("lorebooks embedded in cards (character_book)", () => {
  const cardBook = {
    name: "Mira's world", extensions: { anything: 1 },
    entries: [
      { id: 0, keys: ["lighthouse"], secondary_keys: [], comment: "Lighthouse", content: "The lighthouse is alive.", constant: false, selective: true,
        insertion_order: 100, enabled: true, position: "after_char", use_regex: true, extensions: { position: 1, depth: 4, role: 0, sticky: 3, group: "", probability: 100, useProbability: true } },
      { keys: ["sea"], content: "Salt.", enabled: false, insertion_order: 5, position: "before_char", extensions: {} },
    ],
  };

  it("reads it like SillyTavern's convertCharacterBook", () => {
    const b = Lorebook.parse({ id: "x", ...lorebookFromCardBook(cardBook, "fallback") });
    expect(b.name).toBe("Mira's world");
    expect(b.entries[0]).toMatchObject({ id: "0", title: "Lighthouse", position: "after", sticky: 3, enabled: true });
    expect(b.entries[1]).toMatchObject({ id: "1", position: "before", enabled: false, order: 5 });
  });

  it("writes it back with SillyTavern's fields, keeping the unknown ones", () => {
    const b = Lorebook.parse({ id: "x", ...lorebookFromCardBook(cardBook, "fallback") });
    // nothing edited: the same book comes back
    expect(lorebookToCardBook(b)).toEqual(cardBook);
    // an edited entry is written with all of SillyTavern's fields; the others stay as they were
    b.entries[1] = { ...b.entries[1]!, content: "Salt and wind.", enabled: true };
    const back = lorebookToCardBook(b) as { name: string; extensions: unknown; entries: Array<Record<string, unknown>> };
    expect(back.name).toBe("Mira's world");
    expect(back.extensions).toEqual({ anything: 1 });
    expect(back.entries[0]).toEqual(cardBook.entries[0]);
    expect(back.entries[1]).toMatchObject({ id: 1, keys: ["sea"], content: "Salt and wind.", enabled: true, position: "before_char", insertion_order: 5, extensions: { position: 0, depth: 4 } });
  });

  it("a whole card JSON imports as its book", () => {
    const { lorebook } = importStLorebook(enc({ spec: "chara_card_v2", data: { name: "Mira", character_book: cardBook } }), "Mira.json");
    expect(lorebook.entries).toHaveLength(2);
    expect(lorebook.source).toEqual({ kind: "card", fileName: "Mira.json" });
  });
});

describe("linking books to characters and personas", () => {
  async function store() {
    const SQL = await initSqlJs();
    const driver = new SqlJsDriver(new SQL.Database());
    await migrate(driver, coreMigrations);
    return new SqlStore(driver);
  }
  const card = (book: unknown, world?: string) => ({ spec: "chara_card_v2", spec_version: "2.0", data: { name: "Mira", ...(book ? { character_book: book } : {}), extensions: world ? { world } : {} } });

  it("a card book without a name gets one, and exporting leaves it out again", async () => {
    const b = Lorebook.parse({ id: "x", ...lorebookFromCardBook({ entries: [{ keys: ["a"], content: "A", extensions: {} }] }, "Mira's lorebook") });
    expect(b.name).toBe("Mira's lorebook");
    expect(lorebookToCardBook(b)).toEqual({ entries: [{ keys: ["a"], content: "A", extensions: {} }] });
    expect(lorebookToCardBook({ ...b, name: "Coast" })).toMatchObject({ name: "Coast" });
  });

  it("characters imported before lorebooks get their card's book, once", async () => {
    const s = await store();
    await s.saveCharacter({ id: "mira", name: "Mira", original: card({ name: "Mira's world", entries: [{ keys: ["sea"], content: "Salt.", extensions: {} }] }) });
    await s.saveCharacter({ id: "plain", name: "Plain" });
    expect(await adoptAllEmbeddedLorebooks(s)).toBe(1);
    expect(await adoptAllEmbeddedLorebooks(s)).toBe(0);
    const mira = (await s.getCharacter("mira"))!;
    const [book] = await s.lorebooksForUse(mira.lorebookIds);
    expect(book).toMatchObject({ name: "Mira's world", source: { kind: "card", characterId: "mira" } });
    expect(await adoptEmbeddedLorebook(s, mira)).toBeUndefined();
  });

  it("exporting a card writes its (edited) book back into it", async () => {
    const s = await store();
    await s.saveCharacter({ id: "mira", name: "Mira", original: card({ name: "Mira's world", entries: [{ keys: ["sea"], content: "Salt.", extensions: {} }] }) });
    const book = (await adoptEmbeddedLorebook(s, (await s.getCharacter("mira"))!))!;
    await s.saveLorebook({ ...book, entries: [{ ...book.entries[0]!, content: "Salt and wind." }] });
    const mira = (await s.getCharacter("mira"))!;
    const out = characterWithBook(mira, await bookForCardExport(s, mira));
    const cb = (out.original as { data: { character_book: { entries: Array<{ content: string }> } } }).data.character_book;
    expect(cb.entries[0]!.content).toBe("Salt and wind.");
  });

  it("an imported SillyTavern book links to the characters and personas that name it", async () => {
    const s = await store();
    await s.saveCharacter({ id: "mira", name: "Mira", original: card(undefined, "Realm") });
    await s.savePersona({ id: "dan", name: "Dan", original: { lorebook: "Realm" } });
    const book = await s.saveLorebook({ id: "realm", ...importStLorebook(enc({ entries: {} }), "Realm.json").lorebook });
    expect(await linkImportedLorebook(s, book)).toEqual(["Mira", "Dan"]);
    expect((await s.getCharacter("mira"))!.lorebookIds).toEqual(["realm"]);
    expect((await s.personas.get("dan"))!.lorebookIds).toEqual(["realm"]);
  });

  it("the module registers an importer and an exporter", async () => {
    const s = await store();
    const core = new HomunculusCore({ tree: s, stateRepository: s });
    await core.loadModules([createSillyTavernLorebooksModule()]);
    const imported = await core.lorebookImporters.get("st-lorebook")!.import(enc({ entries: { "0": stEntry(0) } }), "Realm.json");
    const file = await core.lorebookExporters.get("st-lorebook")!.export(Lorebook.parse({ id: "r", ...imported.lorebook }));
    expect(file.fileName).toBe("Realm.json");
    expect(JSON.parse(new TextDecoder().decode(file.bytes))).toEqual({ entries: { "0": stEntry(0) } });
  });
});
