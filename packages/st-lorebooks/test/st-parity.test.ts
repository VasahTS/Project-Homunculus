// Homunculus 2 — "same as SillyTavern" test for lorebook activation (BLUEPRINT §7.5). Author: CLAUDE, 2026-10-28.
//
// Runs SillyTavern's OWN scan code (public/scripts/world-info.js from the pinned copy in .refs/, fetched by
// `npm run refs`) next to ours, on hundreds of random lorebooks and chats, turn after turn (so sticky,
// cooldown and delay carry over), with the same dice. Both must activate the same entries, put the same text
// in the same places and leave the same timers. SillyTavern's file is cut into its pure parts (buffer, timed
// effects, sorting, decorators, the scan loop, groups); its UI and server bits are replaced by small stubs.
// Without .refs/ (a fresh copy of the project) the test is skipped.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { scanLorebooks, type LoreScope } from "@homunculus/core";
import { LoreEntry, LoreSettings, type Lorebook, type LoreTimers } from "@homunculus/schemas";
import { entryToWorld } from "../src/index.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const WI = join(ROOT, ".refs", "sillytavern", "public", "scripts", "world-info.js");
const hasRefs = existsSync(WI);

function slice(src: string, from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`SillyTavern's world-info.js changed: cannot find "${from}" … "${to}"`);
  return src.slice(a, b);
}

/** A whole function from SillyTavern's utils.js. */
function utilFn(name: string): string {
  const src = readFileSync(join(ROOT, ".refs", "sillytavern", "public", "scripts", "utils.js"), "utf8");
  return slice(src, `export function ${name}(`, "\n}\n").replace(/^export /, "") + "\n}\n";
}

/** Builds a module from SillyTavern's own code and imports it. */
async function loadSillyTavernScan(): Promise<{
  run(args: {
    entriesByScope: Record<LoreScope, Array<Record<string, unknown>>>; chat: string[]; maxContext: number; trigger: string;
    settings: LoreSettings; timers: unknown; charName: string; charTags: string[]; global: Record<string, string>; random: () => number;
  }): Promise<{ result: Record<string, unknown>; timers: unknown }>;
}> {
  const src = readFileSync(WI, "utf8");
  const parts = [
    slice(src, "export const world_info_insertion_strategy", "const WI_ENTRY_HEADER_TEMPLATE"),
    slice(src, "class WorldInfoBuffer {", "export function getWorldInfoSettings"),
    slice(src, "export const world_info_position", "/**\n * The cache of all world info data"),
    slice(src, "export function parseRegexFromString", "/**\n * Enables the input helper"),
    slice(src, "export async function getSortedEntries", "/**\n * Parse decorators"),
    slice(src, "function parseDecorators", "/**\n * Performs a scan on the chat"),
    slice(src, "export async function checkWorldInfo", "function convertAgnaiMemoryBook"),
  ].join("\n").replace(/^export /gm, "");
  const header = `
const console = new Proxy({}, { get: (_t, k) => (globalThis.__H2_WI_LOG ? globalThis.console[k].bind(globalThis.console) : () => {}) });
const $ = () => ({});
let world_info_depth, world_info_min_activations, world_info_min_activations_depth_max, world_info_budget, world_info_include_names,
  world_info_recursive, world_info_overflow_alert, world_info_case_sensitive, world_info_match_whole_words, world_info_use_group_scoring,
  world_info_character_strategy, world_info_budget_cap, world_info_max_recursion_steps;
let chat_metadata = {};
let __scopes = { global: [], character: [], chat: [], persona: [] };
let __charName = '', __charTags = [];
const DEFAULT_DEPTH = 4, DEFAULT_WEIGHT = 100, MAX_SCAN_DEPTH = 1000;
const KNOWN_DECORATORS = ['@@activate', '@@dont_activate'];
const sortFn = (a, b) => b.order - a.order;
const defaultGlobalScanData = { trigger: 'normal' };
const eventSource = { emit: async () => {} };
const event_types = {};
const regex_placement = { WORLD_INFO: 5 };
const extension_prompt_roles = { SYSTEM: 0, USER: 1, ASSISTANT: 2 };
const toastr = { warning() {} };
const shouldWIAddPrompt = false;
const NOTE_MODULE_NAME = 'note';
const metadata_keys = {};
const extension_settings = { note: {} };
const this_chid = 0;
function getContext() { return { extensionPrompts: {}, tagMap: { tagged: __charTags }, setExtensionPrompt() {} }; }
async function getExtensionPromptByName() { return ''; }
function getCharaFilename() { return __charName; }
function getTagKeyForEntity() { return __charTags.length ? 'tagged' : null; }
function getRegexedString(s) { return s; }
function substituteParams(s) { return s; }
async function getTokenCountAsync(s) { return Math.ceil(String(s).length / 3.6); }
${utilFn("escapeRegex")}
${utilFn("getStringHash")}
async function getGlobalLore() { return __scopes.global; }
async function getCharacterLore() { return __scopes.character; }
async function getChatLore() { return __scopes.chat; }
async function getPersonaLore() { return __scopes.persona; }
`;
  const footer = `
export async function __run(a) {
  const s = a.settings;
  world_info_depth = s.scanDepth; world_info_min_activations = s.minActivations; world_info_min_activations_depth_max = s.minActivationsDepthMax;
  world_info_budget = s.budgetPercent; world_info_include_names = s.includeNames; world_info_recursive = s.recursive;
  world_info_overflow_alert = false; world_info_case_sensitive = s.caseSensitive; world_info_match_whole_words = s.matchWholeWords;
  world_info_use_group_scoring = s.useGroupScoring; world_info_budget_cap = s.budgetCap; world_info_max_recursion_steps = s.maxRecursionSteps;
  world_info_character_strategy = { evenly: 0, characterFirst: 1, globalFirst: 2 }[s.insertionStrategy];
  __scopes = a.entriesByScope; __charName = a.charName; __charTags = a.charTags;
  chat_metadata = { timedWorldInfo: structuredClone(a.timers ?? {}) };
  const real = Math.random; Math.random = a.random;
  try {
    const result = await checkWorldInfo(a.chat, a.maxContext, false, { ...a.global, trigger: a.trigger });
    return { result, timers: chat_metadata.timedWorldInfo };
  } finally { Math.random = real; }
}`;
  const dir = mkdtempSync(join(tmpdir(), "h2-st-wi-"));
  const file = join(dir, "st-world-info.mjs");
  writeFileSync(file, header + parts + footer);
  const mod = await import(pathToFileURL(file).href) as { __run: (a: unknown) => Promise<{ result: Record<string, unknown>; timers: unknown }> };
  return { run: (args) => mod.__run(args) };
}

// ---------------------------------------------------------------- random worlds

function prng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const WORDS = ["castle", "dragon", "sword", "Lyra", "mill", "forest", "river", "king", "night", "storm", "Silver Fox", "tavern", "elf", "Elf", "moon", "ash"];

function randomBook(r: () => number, bookId: string, size: number): Lorebook {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const maybe = (p: number) => r() < p;
  const entries = Array.from({ length: size }, (_, i) => {
    const keys = Array.from({ length: maybe(0.1) ? 0 : 1 + Math.floor(r() * 2) }, () => (maybe(0.08) ? `/${pick(WORDS).toLowerCase()}s?/i` : pick(WORDS)));
    const contentWords = Array.from({ length: 1 + Math.floor(r() * 4) }, () => pick(WORDS)).join(" ");
    return LoreEntry.parse({
      id: String(i),
      title: `e${i}`,
      keys,
      secondaryKeys: maybe(0.3) ? Array.from({ length: 1 + Math.floor(r() * 2) }, () => pick(WORDS)) : [],
      logic: pick(["andAny", "notAll", "notAny", "andAll"] as const),
      content: (maybe(0.05) ? "@@activate\n" : maybe(0.04) ? "@@dont_activate\n" : "") + `[${bookId}:${i}] ${contentWords}`,
      enabled: !maybe(0.07),
      constant: maybe(0.1),
      selective: !maybe(0.1),
      order: pick([10, 50, 100, 100, 100, 200]),
      position: pick(["before", "after", "atDepth", "atDepth", "emTop", "emBottom", "anTop", "anBottom", "outlet"] as const),
      depth: pick([0, 1, 2, 4]),
      role: pick(["system", "user", "assistant"] as const),
      outletName: maybe(0.8) ? pick(["a", "b"]) : "",
      probability: maybe(0.25) ? pick([0, 30, 50, 90]) : 100,
      useProbability: !maybe(0.1),
      group: maybe(0.3) ? pick(["g1", "g2", "g1,g2", "g3"]) : "",
      groupOverride: maybe(0.15),
      groupWeight: pick([50, 100, 100, 300]),
      useGroupScoring: maybe(0.2) ? pick([true, false]) : null,
      scanDepth: maybe(0.15) ? pick([0, 1, 3, 6]) : null,
      caseSensitive: maybe(0.15) ? pick([true, false]) : null,
      matchWholeWords: maybe(0.2) ? pick([true, false]) : null,
      sticky: maybe(0.15) ? pick([1, 2, 3]) : null,
      cooldown: maybe(0.15) ? pick([1, 2, 4]) : null,
      delay: maybe(0.1) ? pick([2, 5]) : null,
      excludeRecursion: maybe(0.15),
      preventRecursion: maybe(0.15),
      delayUntilRecursion: maybe(0.1) ? pick([1, 2]) : 0,
      ignoreBudget: maybe(0.1),
      scan: { characterDescription: maybe(0.1), personaDescription: maybe(0.1), scenario: maybe(0.05) },
      characterFilter: maybe(0.08) ? { names: [pick(["Lyra", "Mira"])], exclude: maybe(0.5) } : maybe(0.05) ? { tags: ["fantasy"], exclude: maybe(0.5) } : {},
      triggers: maybe(0.08) ? [pick(["normal", "swipe", "continue"] as const)] : [],
    });
  });
  return { id: bookId, name: bookId, description: "", entries, source: { kind: "user" } };
}

const toSt = (book: Lorebook) => book.entries.map((e, i) => ({ ...entryToWorld(e, Number(e.id) || i), world: book.id }));
const stripHash = (t: unknown) => JSON.parse(JSON.stringify(t, (k, v) => (k === "hash" ? undefined : v)));

describe.skipIf(!hasRefs)("lorebook activation is the same as SillyTavern's", () => {
  it("random lorebooks, chats and settings, several turns each", async () => {
    const st = await loadSillyTavernScan();
    let compared = 0, activations = 0;
    for (let world = 0; world < 400; world++) {
      const r = prng(1000 + world);
      const settings = LoreSettings.parse({
        scanDepth: [1, 2, 3, 5][Math.floor(r() * 4)], budgetPercent: [1, 3, 10, 25, 100][Math.floor(r() * 5)], budgetCap: r() < 0.2 ? 40 : 0,
        minActivations: r() < 0.2 ? 3 : 0, minActivationsDepthMax: r() < 0.5 ? 0 : 4, recursive: r() < 0.7, maxRecursionSteps: r() < 0.2 ? 2 : 0,
        includeNames: r() < 0.7, caseSensitive: r() < 0.2, matchWholeWords: r() < 0.6, useGroupScoring: r() < 0.2,
        insertionStrategy: (["evenly", "characterFirst", "globalFirst"] as const)[Math.floor(r() * 3)],
      });
      const books: Array<{ book: Lorebook; scope: LoreScope }> = [
        { book: randomBook(r, "Global", 4 + Math.floor(r() * 10)), scope: "global" },
        { book: randomBook(r, "Char", 2 + Math.floor(r() * 8)), scope: "character" },
        ...(r() < 0.4 ? [{ book: randomBook(r, "Chat", 3), scope: "chat" as const }] : []),
        ...(r() < 0.3 ? [{ book: randomBook(r, "Persona", 3), scope: "persona" as const }] : []),
      ];
      const byScope: Record<LoreScope, Array<Record<string, unknown>>> = { global: [], character: [], chat: [], persona: [] };
      for (const b of books) byScope[b.scope].push(...toSt(b.book));
      const charName = r() < 0.5 ? "Lyra" : "Mira";
      const charTags = r() < 0.5 ? ["fantasy"] : [];
      const global = { characterDescription: "A ranger from the forest.", personaDescription: "A tall elf.", scenario: "The castle at night." };
      const chat: string[] = [];
      let ourTimers: LoreTimers | undefined;
      let stTimers: unknown = {};
      for (let turn = 0; turn < 8; turn++) {
        const line = `${turn % 2 ? "Lyra" : "Dan"}: ${Array.from({ length: 2 + Math.floor(r() * 6) }, () => WORDS[Math.floor(r() * WORDS.length)]!).join(" ")}`;
        chat.unshift(line); // newest first
        const trigger = (["normal", "normal", "swipe", "continue"] as const)[Math.floor(r() * 4)]!;
        const maxContext = 2000 + Math.floor(r() * 4000);
        const seed = Math.floor(r() * 1e9);
        const ours = scanLorebooks({
          books, chat: [...chat], chatLength: chat.length, trigger, character: { name: charName, tags: charTags }, settings, maxContext,
          timers: ourTimers, global, random: prng(seed), countTokens: (t) => Math.ceil(t.length / 3.6),
        });
        (globalThis as any).__H2_WI_LOG = process.env.H2_DEBUG === `world ${world}, turn ${turn}`;
        const theirs = await st.run({ entriesByScope: structuredClone(byScope), chat: [...chat], maxContext, trigger, settings, timers: stTimers, charName, charTags, global, random: prng(seed) });
        const res = theirs.result as {
          worldInfoBefore: string; worldInfoAfter: string; WIDepthEntries: Array<{ depth: number; entries: string[]; role: number }>;
          EMEntries: Array<{ position: number; content: string }>; ANBeforeEntries: string[]; ANAfterEntries: string[]; outletEntries: Record<string, string[]>;
          allActivatedEntries: Set<{ world: string; uid: number }>;
        };
        const ctx = `world ${world}, turn ${turn}`;
        if (process.env.H2_DEBUG === ctx) console.log(JSON.stringify({ ours: ours.report.activated.map((a) => [a.entryId, a.position]), st: [...res.allActivatedEntries].map((e) => [e.uid, (e as any).order, (e as any).position]), em: res.EMEntries }, null, 1));
        expect(ours.report.activated.map((a) => `${a.bookId}.${a.entryId}`).sort(), ctx)
          .toEqual([...res.allActivatedEntries].map((e) => `${e.world}.${e.uid}`).sort());
        expect(ours.before.join("\n"), ctx).toBe(res.worldInfoBefore);
        expect(ours.after.join("\n"), ctx).toBe(res.worldInfoAfter);
        expect(ours.depth, ctx).toEqual(res.WIDepthEntries.map((d) => ({ depth: d.depth, role: (["system", "user", "assistant"] as const)[d.role], content: d.entries.join("\n") })));
        expect(ours.noteTop, ctx).toEqual(res.ANBeforeEntries);
        expect(ours.noteBottom, ctx).toEqual(res.ANAfterEntries);
        expect(ours.outlets, ctx).toEqual(res.outletEntries);
        // example blocks: SillyTavern's Generate() unshifts the "before" ones and pushes the "after" ones
        const top: string[] = [], bottom: string[] = [];
        for (const ex of res.EMEntries) (ex.position === 0 ? top.unshift(ex.content) : bottom.push(ex.content));
        const block = (c: string) => (c.startsWith("<START>") ? c : `<START>\n${c.trim()}`);
        expect(ours.examplesTop, ctx).toEqual(top.map(block));
        expect(ours.examplesBottom, ctx).toEqual(bottom.map(block));
        expect(ours.report.timers, ctx).toEqual(stripHash(theirs.timers));
        ourTimers = ours.report.timers;
        stTimers = theirs.timers;
        compared++;
        activations += ours.report.activated.length;
      }
    }
    expect(compared).toBe(3200);
    expect(activations).toBeGreaterThan(6000); // the random worlds really exercise the scan
  }, 120_000);
});
