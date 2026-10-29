// Homunculus 2 — module: SillyTavern lorebooks (World Info) in and out. Author: CLAUDE, 2026-10-28 (slice 3, D-027).
//
// Two SillyTavern shapes are read and written:
// - a World Info file (data/<user>/worlds/<name>.json): { entries: { "<uid>": entry }, originalData? } with
//   SillyTavern's own field names (key, keysecondary, disable, selectiveLogic 0–3, position 0–7, role 0–2…);
// - a card's embedded book (character_book, card spec V2/V3): { name, entries: [ { keys, secondary_keys,
//   insertion_order, enabled, position "before_char"/"after_char", extensions: { position, depth, … } } ] }.
// The mapping follows public/scripts/world-info.js (`newWorldInfoEntryDefinition`, `convertCharacterBook`) and
// src/endpoints/characters.js (`convertWorldInfoToCharacterBook`). Each entry keeps its original object, and the
// book keeps the file without its entries, so exporting gives back every field we don't use.
import type { HomunculusModule, SqlStore } from "@homunculus/core";
import {
  Lorebook, LoreEntry, type Character, type GenerationType, type LoreEntryInput, type LoreLogic, type LorePosition, type LorebookInput,
} from "@homunculus/schemas";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const nullableNum = (v: unknown) => { const n = num(v); return n === undefined ? null : Math.round(n); };
const nullableBool = (v: unknown) => (typeof v === "boolean" ? v : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter((x) => x !== "") : typeof v === "string" && v.trim() ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);

const LOGIC: LoreLogic[] = ["andAny", "notAll", "notAny", "andAll"];
const POSITIONS: LorePosition[] = ["before", "after", "anTop", "anBottom", "atDepth", "emTop", "emBottom", "outlet"];
const ROLES = ["system", "user", "assistant"] as const;
const TRIGGER_IN: Record<string, GenerationType> = { normal: "normal", continue: "continue", impersonate: "impersonate", swipe: "swipe", regenerate: "swipe", quiet: "quiet" };
const TRIGGER_OUT: Partial<Record<GenerationType, string>> = { normal: "normal", continue: "continue", impersonate: "impersonate", swipe: "swipe", quiet: "quiet" };

const triggersIn = (v: unknown): GenerationType[] => [...new Set(strings(v).map((t) => TRIGGER_IN[t]).filter((t): t is GenerationType => !!t))];
const triggersOut = (list: GenerationType[], original: unknown): string[] => {
  // keep SillyTavern's own list when it means the same (e.g. "regenerate" and "swipe" both became "swipe")
  if (Array.isArray(original) && JSON.stringify(triggersIn(original)) === JSON.stringify(list)) return original.map((x) => str(x));
  return list.map((t) => TRIGGER_OUT[t]).filter((t): t is string => !!t);
};
const delayLevel = (v: unknown) => (v === true ? 1 : Math.max(0, Math.round(num(v) ?? 0)));

/** One entry of a SillyTavern World Info file → ours. */
export function entryFromWorld(e: Obj, fallbackId: string): LoreEntry {
  const cf = isObj(e.characterFilter) ? e.characterFilter : {};
  return LoreEntry.parse({
    id: str(e.uid, fallbackId) || fallbackId,
    title: str(e.comment),
    keys: strings(e.key),
    secondaryKeys: strings(e.keysecondary),
    logic: LOGIC[num(e.selectiveLogic) ?? 0] ?? "andAny",
    content: str(e.content),
    enabled: !bool(e.disable, false),
    constant: bool(e.constant, false),
    vectorized: bool(e.vectorized, false),
    selective: bool(e.selective, true),
    order: Math.round(num(e.order) ?? 100),
    position: POSITIONS[num(e.position) ?? 0] ?? "before",
    depth: Math.min(1000, Math.max(0, Math.round(num(e.depth) ?? 4))),
    role: ROLES[num(e.role) ?? 0] ?? "system",
    outletName: str(e.outletName),
    probability: Math.min(100, Math.max(0, num(e.probability) ?? 100)),
    useProbability: bool(e.useProbability, true),
    group: str(e.group),
    groupOverride: bool(e.groupOverride, false),
    groupWeight: Math.max(0, num(e.groupWeight) ?? 100),
    useGroupScoring: nullableBool(e.useGroupScoring),
    scanDepth: nullableNum(e.scanDepth),
    caseSensitive: nullableBool(e.caseSensitive),
    matchWholeWords: nullableBool(e.matchWholeWords),
    sticky: nullableNum(e.sticky),
    cooldown: nullableNum(e.cooldown),
    delay: nullableNum(e.delay),
    excludeRecursion: bool(e.excludeRecursion, false),
    preventRecursion: bool(e.preventRecursion, false),
    delayUntilRecursion: delayLevel(e.delayUntilRecursion),
    ignoreBudget: bool(e.ignoreBudget, false),
    scan: {
      personaDescription: bool(e.matchPersonaDescription, false),
      characterDescription: bool(e.matchCharacterDescription, false),
      characterPersonality: bool(e.matchCharacterPersonality, false),
      characterDepthPrompt: bool(e.matchCharacterDepthPrompt, false),
      scenario: bool(e.matchScenario, false),
      creatorNotes: bool(e.matchCreatorNotes, false),
    },
    characterFilter: { names: strings(cf.names), tags: strings(cf.tags), exclude: bool(cf.isExclude, false) },
    triggers: triggersIn(e.triggers),
    automationId: str(e.automationId),
    ...(num(e.displayIndex) !== undefined ? { displayIndex: Math.round(num(e.displayIndex)!) } : {}),
    original: e,
  } satisfies LoreEntryInput);
}

/** Ours → one entry of a SillyTavern World Info file (unknown fields of the original survive). */
export function entryToWorld(e: LoreEntry, uid: number): Obj {
  const o = isObj(e.original) ? { ...e.original } : {};
  const cf = isObj(o.characterFilter) ? o.characterFilter : {};
  const out: Obj = {
    ...o,
    uid,
    key: e.keys,
    keysecondary: e.secondaryKeys,
    comment: e.title,
    content: e.content,
    constant: e.constant,
    vectorized: e.vectorized,
    selective: e.selective,
    selectiveLogic: LOGIC.indexOf(e.logic),
    addMemo: typeof o.addMemo === "boolean" ? o.addMemo : !!e.title,
    order: e.order,
    position: POSITIONS.indexOf(e.position),
    disable: !e.enabled,
    ignoreBudget: e.ignoreBudget,
    excludeRecursion: e.excludeRecursion,
    preventRecursion: e.preventRecursion,
    matchPersonaDescription: e.scan.personaDescription,
    matchCharacterDescription: e.scan.characterDescription,
    matchCharacterPersonality: e.scan.characterPersonality,
    matchCharacterDepthPrompt: e.scan.characterDepthPrompt,
    matchScenario: e.scan.scenario,
    matchCreatorNotes: e.scan.creatorNotes,
    // SillyTavern writes false for "off" and true for level 1 in older files; keep the original's way when it means the same
    delayUntilRecursion: e.delayUntilRecursion === 0 ? (o.delayUntilRecursion === 0 ? 0 : false)
      : e.delayUntilRecursion === 1 && o.delayUntilRecursion === true ? true : e.delayUntilRecursion,
    probability: e.probability,
    useProbability: e.useProbability,
    depth: e.depth,
    outletName: e.outletName,
    group: e.group,
    groupOverride: e.groupOverride,
    groupWeight: e.groupWeight,
    scanDepth: e.scanDepth,
    caseSensitive: e.caseSensitive,
    matchWholeWords: e.matchWholeWords,
    useGroupScoring: e.useGroupScoring,
    automationId: e.automationId,
    role: ROLES.indexOf(e.role),
    sticky: e.sticky,
    cooldown: e.cooldown,
    delay: e.delay,
    triggers: triggersOut(e.triggers, o.triggers),
    displayIndex: e.displayIndex ?? uid,
  };
  if (e.characterFilter.names.length || e.characterFilter.tags.length || e.characterFilter.exclude || isObj(o.characterFilter)) {
    out.characterFilter = { ...cf, isExclude: e.characterFilter.exclude, names: e.characterFilter.names, tags: e.characterFilter.tags };
  }
  // ours, kept where SillyTavern ignores unknown fields
  if (e.conditions.length) out.homunculus = { ...(isObj(o.homunculus) ? o.homunculus : {}), conditions: e.conditions, conditionLogic: e.conditionLogic };
  else if (isObj(o.homunculus)) { const { conditions: _c, conditionLogic: _l, ...rest } = o.homunculus; out.homunculus = rest; if (!Object.keys(rest).length) delete out.homunculus; }
  return out;
}

/** One entry of a card's embedded book (character_book) → ours. SillyTavern `convertCharacterBook`. */
export function entryFromCardBook(e: Obj, index: number): LoreEntry {
  const x = isObj(e.extensions) ? e.extensions : {};
  const id = e.id === undefined || e.id === null ? String(index) : str(e.id, String(index));
  const position = num(x.position) !== undefined ? (POSITIONS[num(x.position)!] ?? "before") : e.position === "before_char" ? "before" : "after";
  return LoreEntry.parse({
    id,
    title: str(e.comment),
    keys: strings(e.keys),
    secondaryKeys: strings(e.secondary_keys),
    logic: LOGIC[num(x.selectiveLogic) ?? 0] ?? "andAny",
    content: str(e.content),
    enabled: e.enabled !== false,
    constant: bool(e.constant, false),
    vectorized: bool(x.vectorized, false),
    selective: bool(e.selective, false),
    order: Math.round(num(e.insertion_order) ?? 100),
    position,
    depth: Math.min(1000, Math.max(0, Math.round(num(x.depth) ?? 4))),
    role: ROLES[num(x.role) ?? 0] ?? "system",
    outletName: str(x.outlet_name),
    probability: Math.min(100, Math.max(0, num(x.probability) ?? 100)),
    useProbability: bool(x.useProbability, true),
    group: str(x.group),
    groupOverride: bool(x.group_override, false),
    groupWeight: Math.max(0, num(x.group_weight) ?? 100),
    useGroupScoring: nullableBool(x.use_group_scoring),
    scanDepth: nullableNum(x.scan_depth),
    caseSensitive: nullableBool(x.case_sensitive),
    matchWholeWords: nullableBool(x.match_whole_words),
    sticky: nullableNum(x.sticky),
    cooldown: nullableNum(x.cooldown),
    delay: nullableNum(x.delay),
    excludeRecursion: bool(x.exclude_recursion, false),
    preventRecursion: bool(x.prevent_recursion, false),
    delayUntilRecursion: delayLevel(x.delay_until_recursion),
    ignoreBudget: bool(x.ignore_budget, false),
    scan: {
      personaDescription: bool(x.match_persona_description, false),
      characterDescription: bool(x.match_character_description, false),
      characterPersonality: bool(x.match_character_personality, false),
      characterDepthPrompt: bool(x.match_character_depth_prompt, false),
      scenario: bool(x.match_scenario, false),
      creatorNotes: bool(x.match_creator_notes, false),
    },
    triggers: triggersIn(x.triggers),
    automationId: str(x.automation_id),
    ...(num(x.display_index) !== undefined ? { displayIndex: Math.round(num(x.display_index)!) } : { displayIndex: index }),
    original: e,
  } satisfies LoreEntryInput);
}

/** Ours → one entry of a card's embedded book. SillyTavern `convertWorldInfoToCharacterBook`. */
export function entryToCardBook(e: LoreEntry, index: number): Obj {
  const o = isObj(e.original) ? e.original : {};
  const ox = isObj(o.extensions) ? o.extensions : {};
  const numericId = Number(e.id);
  return {
    ...o,
    id: Number.isInteger(numericId) ? numericId : index,
    keys: e.keys,
    secondary_keys: e.secondaryKeys,
    comment: e.title,
    content: e.content,
    constant: e.constant,
    selective: e.selective,
    insertion_order: e.order,
    enabled: e.enabled,
    position: e.position === "before" ? "before_char" : "after_char",
    use_regex: true,
    extensions: {
      ...ox,
      position: POSITIONS.indexOf(e.position),
      exclude_recursion: e.excludeRecursion,
      display_index: e.displayIndex ?? index,
      probability: e.probability,
      useProbability: e.useProbability,
      depth: e.depth,
      selectiveLogic: LOGIC.indexOf(e.logic),
      outlet_name: e.outletName,
      group: e.group,
      group_override: e.groupOverride,
      group_weight: e.groupWeight,
      prevent_recursion: e.preventRecursion,
      delay_until_recursion: e.delayUntilRecursion === 0 ? false : e.delayUntilRecursion,
      scan_depth: e.scanDepth,
      match_whole_words: e.matchWholeWords,
      use_group_scoring: e.useGroupScoring ?? false,
      case_sensitive: e.caseSensitive,
      automation_id: e.automationId,
      role: ROLES.indexOf(e.role),
      vectorized: e.vectorized,
      sticky: e.sticky,
      cooldown: e.cooldown,
      delay: e.delay,
      match_persona_description: e.scan.personaDescription,
      match_character_description: e.scan.characterDescription,
      match_character_personality: e.scan.characterPersonality,
      match_character_depth_prompt: e.scan.characterDepthPrompt,
      match_scenario: e.scan.scenario,
      match_creator_notes: e.scan.creatorNotes,
      triggers: triggersOut(e.triggers, ox.triggers),
      ignore_budget: e.ignoreBudget,
      ...(e.conditions.length ? { homunculus_conditions: { conditions: e.conditions, logic: e.conditionLogic } } : {}),
    },
  };
}

/** Our conditions, when the file came from Homunculus. */
function withConditions(entry: LoreEntry, raw: Obj): LoreEntry {
  const h = isObj(raw.homunculus) ? raw.homunculus : isObj(raw.extensions) && isObj((raw.extensions as Obj).homunculus_conditions) ? (raw.extensions as Obj).homunculus_conditions as Obj : undefined;
  if (!h || !Array.isArray(h.conditions)) return entry;
  const parsed = LoreEntry.safeParse({ ...entry, conditions: h.conditions, conditionLogic: h.conditionLogic ?? h.logic ?? "all" });
  return parsed.success ? parsed.data : entry;
}

const byUid = (a: [string, unknown], b: [string, unknown]) => {
  const x = Number(a[0]), y = Number(b[0]);
  return Number.isFinite(x) && Number.isFinite(y) ? x - y : a[0].localeCompare(b[0]);
};

/** A card's character_book → a lorebook (not saved). */
export function lorebookFromCardBook(book: Obj, fallbackName: string, characterId?: string): Omit<LorebookInput, "id"> {
  const entries = (Array.isArray(book.entries) ? book.entries : []).filter(isObj).map((e, i) => withConditions(entryFromCardBook(e, i), e));
  const { entries: _e, ...rest } = book;
  const named = str(book.name).trim();
  return {
    name: named || fallbackName,
    description: str(book.description),
    entries,
    source: { kind: "card", ...(characterId ? { characterId } : {}), ...(named ? {} : { inventedName: fallbackName }) },
    original: rest as LorebookInput["original"],
  };
}

const withoutOriginal = ({ original: _o, ...rest }: LoreEntry) => JSON.stringify(rest);

/**
 * A lorebook → a card's character_book (for exporting the card). Entries that were not changed go out exactly
 * as they came in, so a card exported without edits carries the same book it had.
 */
export function lorebookToCardBook(book: Lorebook): Obj {
  const o = isObj(book.original) ? book.original : undefined;
  const entries = book.entries.map((e, i) => {
    if (isObj(e.original) && withoutOriginal(withConditions(entryFromCardBook(e.original, i), e.original)) === withoutOriginal(e)) return e.original;
    return entryToCardBook(e, i);
  });
  const keepNameOut = book.source.inventedName !== undefined && book.source.inventedName === book.name;
  return {
    ...(o ?? {}),
    ...(keepNameOut ? {} : { name: book.name }),
    ...(book.description || typeof o?.description === "string" ? { description: book.description } : {}),
    entries,
    ...(o ? {} : { extensions: {} }),
  };
}

export interface ImportedLorebook { lorebook: Omit<LorebookInput, "id">; warnings: string[] }

/** Reads a SillyTavern World Info file, a bare card book, or a whole card (its embedded book). */
export function importStLorebook(bytes: Uint8Array, fileName: string): ImportedLorebook {
  let json: unknown;
  try { json = JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, "")); } catch { throw new Error(`"${fileName}" is not valid JSON.`); }
  const baseName = fileName.replace(/\.[^.]+$/, "").trim() || "Lorebook";
  if (!isObj(json)) throw new Error(`"${fileName}" is not a lorebook.`);
  const warnings: string[] = [];
  // a whole character card: take its embedded book
  if ((json.spec === "chara_card_v2" || json.spec === "chara_card_v3") && isObj(json.data)) {
    const cb = (json.data as Obj).character_book;
    if (!isObj(cb)) throw new Error(`"${fileName}" is a character card without an embedded lorebook. Import it as a character instead.`);
    return { lorebook: { ...lorebookFromCardBook(cb, `${str((json.data as Obj).name, baseName)}'s lorebook`), source: { kind: "card", fileName } }, warnings };
  }
  if (json.kind === "memory" || json.type === "risu" || "lorebookVersion" in json) {
    throw new Error(`"${fileName}" is an Agnai, RisuAI or NovelAI lorebook. Only SillyTavern lorebooks can be imported for now (SillyTavern can convert these: import it there, then export).`);
  }
  if (Array.isArray(json.entries)) {
    return { lorebook: { ...lorebookFromCardBook(json, baseName), source: { kind: "stFile", fileName } }, warnings };
  }
  if (!isObj(json.entries)) throw new Error(`"${fileName}" is not a SillyTavern lorebook (it has no "entries").`);
  const entries: LoreEntry[] = [];
  const seen = new Set<string>();
  for (const [key, raw] of Object.entries(json.entries).sort(byUid)) {
    if (!isObj(raw)) { warnings.push(`Entry "${key}" could not be read and was skipped.`); continue; }
    let e = withConditions(entryFromWorld(raw, key), raw);
    if (seen.has(e.id)) e = { ...e, id: `${e.id}-${entries.length}` };
    seen.add(e.id);
    entries.push(e);
  }
  const { entries: _e, ...rest } = json;
  if (entries.some((e) => e.vectorized)) warnings.push("Some entries are set to \"vectorized\" (SillyTavern's vector search). Homunculus doesn't have vector search; they only activate by keywords.");
  if (entries.some((e) => /(^|\n)@@(?!activate|dont_activate)/.test(e.content))) warnings.push("Some entries start with @@ decorators other than @@activate / @@dont_activate; those lines are left in the text, as SillyTavern does.");
  return {
    lorebook: { name: baseName, description: "", entries, source: { kind: "stFile", fileName }, original: rest as LorebookInput["original"] },
    warnings,
  };
}

/** A lorebook → a SillyTavern World Info file. */
export function exportStLorebook(book: Lorebook): { fileName: string; json: Obj } {
  const o = isObj(book.original) ? book.original : {};
  const entries: Obj = {};
  const used = new Set<number>();
  // keep SillyTavern's uids when they are numbers; give the others the next free number
  const wanted = book.entries.map((e) => (Number.isInteger(Number(e.id)) && Number(e.id) >= 0 ? Number(e.id) : null));
  let next = Math.max(-1, ...wanted.filter((x): x is number => x !== null)) + 1;
  book.entries.forEach((e, i) => {
    let uid = wanted[i];
    if (uid === null || uid === undefined || used.has(uid)) uid = next++;
    used.add(uid);
    entries[String(uid)] = entryToWorld(e, uid);
  });
  const json: Obj = { ...o, entries };
  // a card book keeps its card-side data in originalData (SillyTavern does the same)
  return { fileName: `${book.name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "lorebook"}.json`, json };
}

// ---------------------------------------------------------------- linking with characters and personas

/** The book embedded in a character's original card, if any. */
export function embeddedBookOf(c: Character): Obj | undefined {
  const o = c.original as { data?: { character_book?: unknown } } | undefined;
  const b = o?.data?.character_book;
  return isObj(b) && Array.isArray(b.entries) && b.entries.length > 0 ? b : undefined;
}

/**
 * Gives a character the lorebook embedded in its card: saved as a lorebook and linked to the character.
 * Does nothing when the character already has its card's book. Returns the new book, if one was made.
 */
export async function adoptEmbeddedLorebook(store: SqlStore, character: Character, newId: () => string = () => crypto.randomUUID()): Promise<Lorebook | undefined> {
  const cb = embeddedBookOf(character);
  if (!cb) return undefined;
  const all = await store.lorebooks.list();
  if (all.some((b) => b.source.kind === "card" && b.source.characterId === character.id)) return undefined;
  const book = await store.saveLorebook({ id: newId(), ...lorebookFromCardBook(cb, `${character.name}'s lorebook`, character.id) });
  await store.saveCharacter({ ...character, lorebookIds: [...new Set([...character.lorebookIds, book.id])] });
  return book;
}

/** Once for the whole library: every character imported before lorebooks existed gets its card's book. */
export async function adoptAllEmbeddedLorebooks(store: SqlStore): Promise<number> {
  let n = 0;
  for (const c of await store.listCharacters()) if (await adoptEmbeddedLorebook(store, c)) n++;
  return n;
}

/**
 * After importing a SillyTavern book: link it to the characters whose card names it as their world
 * (data.extensions.world) and the personas whose SillyTavern data names it (their "lorebook").
 */
export async function linkImportedLorebook(store: SqlStore, book: Lorebook): Promise<string[]> {
  const names = new Set([book.name, (book.source.fileName ?? "").replace(/\.json$/i, "")].filter(Boolean));
  const linked: string[] = [];
  for (const c of await store.listCharacters()) {
    const world = (c.original as { data?: { extensions?: { world?: unknown } } } | undefined)?.data?.extensions?.world;
    if (typeof world === "string" && names.has(world) && !c.lorebookIds.includes(book.id)) {
      await store.saveCharacter({ ...c, lorebookIds: [...c.lorebookIds, book.id] });
      linked.push(c.name);
    }
  }
  for (const p of await store.personas.list()) {
    const lb = (p.original as { lorebook?: unknown } | undefined)?.lorebook;
    if (typeof lb === "string" && names.has(lb) && !p.lorebookIds.includes(book.id)) {
      await store.savePersona({ ...p, lorebookIds: [...p.lorebookIds, book.id] });
      linked.push(p.name);
    }
  }
  return linked;
}

/** After importing a card: link the lorebooks already in the library that its card names as its world. */
export async function linkCharacterToNamedBooks(store: SqlStore, c: Character): Promise<Lorebook[]> {
  const world = (c.original as { data?: { extensions?: { world?: unknown } } } | undefined)?.data?.extensions?.world;
  if (typeof world !== "string" || !world.trim()) return [];
  const named = (await store.lorebooks.list()).filter((b) => b.name === world || (b.source.fileName ?? "").replace(/\.json$/i, "") === world);
  const add = named.filter((b) => !c.lorebookIds.includes(b.id));
  if (add.length) await store.saveCharacter({ ...c, lorebookIds: [...c.lorebookIds, ...add.map((b) => b.id)] });
  return add;
}

/** For exporting a card: the character with its linked book written into the card (SillyTavern embeds the linked world). */
export function characterWithBook(c: Character, book: Lorebook | undefined): Character {
  if (!book) return c;
  const o = isObj(c.original) ? c.original : { spec: "chara_card_v2", spec_version: "2.0", data: {} };
  const data = isObj(o.data) ? o.data : {};
  return { ...c, original: { ...o, data: { ...data, character_book: lorebookToCardBook(book) } } };
}

/** The book a character's card export should carry: its card's own book, else the first linked one. */
export async function bookForCardExport(store: SqlStore, c: Character): Promise<Lorebook | undefined> {
  const books = await store.lorebooksForUse(c.lorebookIds);
  return books.find((b) => b.source.kind === "card" && b.source.characterId === c.id) ?? books[0];
}

export function createSillyTavernLorebooksModule(): HomunculusModule {
  return {
    manifest: { id: "st-lorebooks", version: "0.0.1" },
    register(api) {
      api.registerLorebookImporter({
        id: "st-lorebook",
        name: "SillyTavern lorebook",
        help: "SillyTavern World Info files (the JSON files in SillyTavern's data/default-user/worlds folder, or from the lorebook's Export button). A character card's JSON also works: its embedded lorebook is imported.",
        extensions: [".json"],
        async import(bytes, fileName) { return importStLorebook(bytes, fileName); },
      });
      api.registerLorebookExporter({
        id: "st-lorebook",
        name: "SillyTavern lorebook (JSON)",
        help: "A World Info file SillyTavern can import. Homunculus's own conditions are kept in it (SillyTavern ignores them).",
        async export(book) {
          const { fileName, json } = exportStLorebook(Lorebook.parse(book));
          return { fileName, mime: "application/json", bytes: new TextEncoder().encode(JSON.stringify(json, null, 4)), warnings: [] };
        },
      });
    },
  };
}
