// Homunculus 2 — "same as SillyTavern" test for regex scripts (D-060). Author: CLAUDE, 2026-11-01.
//
// Runs SillyTavern's OWN regex engine (public/scripts/extensions/regex/engine.js + regexFromString from
// utils.js, from the pinned copy in .refs/, fetched by `npm run refs`) next to ours, on thousands of random
// scripts and texts: global + preset + character lists, every placement, display / prompt / saved, edits and
// depths. Both must give the same text. SillyTavern's imports (settings, characters, presets, macros) are
// replaced by small stubs; the macro stub is the same function on both sides.
// Without .refs/ (a fresh copy of the project) the test is skipped.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { applyRegexScripts, orderRegexScripts, type RegexMode, type RegexRun } from "@homunculus/core";
import { fromStScript } from "../src/index.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const ST = join(ROOT, ".refs", "sillytavern", "public", "scripts");
const ENGINE = join(ST, "extensions", "regex", "engine.js");
const hasRefs = existsSync(ENGINE);

function utilFn(name: string): string {
  const src = readFileSync(join(ST, "utils.js"), "utf8");
  const a = src.indexOf(`export function ${name}(`);
  const b = src.indexOf("\n}\n", a);
  if (a < 0 || b < 0) throw new Error(`SillyTavern's utils.js changed: no ${name}`);
  return src.slice(a, b).replace(/^export /, "") + "\n}\n";
}

const CHAR = "Lyra";
const USER = "Ann";
/** The same tiny substituteParams on both sides. */
const macros = (t: string, char?: string) => t.replace(/\{\{char\}\}/gi, char ?? CHAR).replace(/\{\{user\}\}/gi, USER);

type StRun = (lists: { global: object[]; preset: object[]; scoped: object[] }, text: string, placement: number, opts: object) => string;

async function loadSillyTavern(): Promise<StRun> {
  let src = readFileSync(ENGINE, "utf8").replace(/^import [\s\S]*?;\s*$/gm, "");
  const stubs = `
const MACROS = globalThis.__stMacros;
const substituteParams = (t, o) => MACROS(t, o?.name2Override);
const substituteParamsExtended = (t, _a, tr) => tr ? t.replace(/\\{\\{[\\s\\S]*?\\}\\}/g, (m) => { const v = MACROS(m); return v === m ? m : tr(v); }) : MACROS(t);
const saveSettingsDebounced = () => {};
const writeExtensionField = async () => {};
const lodash = { set() {} };
const this_chid = 0;
const characters = [{ avatar: "lyra.png", data: { extensions: { regex_scripts: [] } } }];
const extension_settings = { disabledExtensions: [], regex: [], character_allowed_regex: ["lyra.png"], preset_allowed_regex: { openai: ["P"] } };
let PRESET = [];
const getPresetManager = () => ({ apiId: "openai", getSelectedPresetName: () => "P", readPresetExtensionField: () => PRESET });
${utilFn("regexFromString")}
`;
  src = stubs + src + `
export function run(lists, text, placement, opts) {
  extension_settings.regex = lists.global; PRESET = lists.preset; characters[0].data.extensions.regex_scripts = lists.scoped;
  RegexProvider.instance.clear();
  return getRegexedString(text, placement, opts);
}`;
  (globalThis as Record<string, unknown>).__stMacros = macros;
  const dir = mkdtempSync(join(tmpdir(), "st-regex-"));
  const file = join(dir, "engine.mjs");
  writeFileSync(file, src);
  return ((await import(pathToFileURL(file).href)) as { run: StRun }).run;
}

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

const PATTERNS = [
  "/\\*([^*]+)\\*/g", "/(Lyra|Ann) (said|smiled)/gi", "/\\[(?<tag>[A-Z]+)\\]/g", "/{{char}}/g", "/\\b(\\w+)\\b \\1/g",
  "smile", "/^(.+)$/m", "/<think>[\\s\\S]*?<\\/think>/g", "/\\n{2,}/g", "/\"([^\"]*)\"/g", "/(a)(b)?/g", "/[/", "/x/zz", "",
  "/(?<who>{{user}}):/g", "/./gs", "/(\\d+) gold/g",
];
const REPLACES = ["", "<b>$1</b>", "{{match}}!", "[$<tag>]", "$2-$1", "{{char}} → {{user}}", "$0$0", "_", "$<who> says", "$3", "{{MATCH}}"];
const TRIMS = [[], ["*"], ["{{char}}"], [" ", "a"]];
const TEXTS = [
  "Lyra said *hello* to Ann.", "\"Run!\" Ann smiled. [ALERT] 12 gold", "<think>plan</think>The door opens.\n\n\nLyra waits.",
  "word word again again", "ab a ab", "", "Ann: hi\nLyra: hey", "smile smile SMILE", "plain text",
];

function randomScript(r: () => number, i: number): Record<string, unknown> {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const placement = [0, 1, 2, 3, 5, 6].filter(() => r() < 0.45);
  const depth = () => (r() < 0.6 ? null : Math.floor(r() * 5) - 1);
  return {
    id: `s${i}`, scriptName: `S${i}`, findRegex: pick(PATTERNS), replaceString: pick(REPLACES), trimStrings: pick(TRIMS),
    placement, disabled: r() < 0.15, markdownOnly: r() < 0.35, promptOnly: r() < 0.35, runOnEdit: r() < 0.7,
    substituteRegex: Math.floor(r() * 3), minDepth: depth(), maxDepth: depth(),
  };
}

describe.skipIf(!hasRefs)("regex scripts = SillyTavern's engine", () => {
  it("gives the same text on random scripts and texts", async () => {
    const st = await loadSillyTavern();
    const r = rng(20261101);
    const PLACE: Record<number, RegexRun["target"]> = { 1: "user", 2: "ai", 3: "command", 5: "lore", 6: "reasoning" };
    let checked = 0;
    let skipped = 0;
    for (let round = 0; round < 3000; round++) {
      const make = (n: number) => Array.from({ length: n }, (_, i) => randomScript(r, round * 10 + i));
      const lists = { global: make(Math.floor(r() * 3)), preset: make(Math.floor(r() * 3)), scoped: make(Math.floor(r() * 3)) };
      const text = TEXTS[Math.floor(r() * TEXTS.length)]!;
      const placement = [1, 2, 3, 5, 6][Math.floor(r() * 5)]!;
      const mode: RegexMode = (["saved", "display", "prompt"] as const)[Math.floor(r() * 3)]!;
      const edit = mode === "saved" && r() < 0.3;
      const depth = r() < 0.3 ? undefined : Math.floor(r() * 5);
      const char = r() < 0.5 ? undefined : "Mira";
      let expected: string;
      // SillyTavern throws when "$N" points past the groups and a trim string is set (the offset is a number);
      // ours keeps going. Those cases are skipped.
      try { expected = st(lists, text, placement, { isMarkdown: mode === "display", isPrompt: mode === "prompt", isEdit: edit, depth, characterOverride: char }); } catch { skipped++; continue; }
      const ours = applyRegexScripts(
        orderRegexScripts({ global: lists.global.map((s) => fromStScript(s)), preset: lists.preset.map((s) => fromStScript(s)), character: lists.scoped.map((s) => fromStScript(s)) }),
        text, { target: PLACE[placement]!, mode, edit, depth }, { macros, char },
      );
      expect(ours, JSON.stringify({ lists, text, placement, mode, edit, depth, char })).toBe(expected);
      checked++;
    }
    expect(checked + skipped).toBe(3000);
    expect(skipped).toBeLessThan(300);
  });
});
