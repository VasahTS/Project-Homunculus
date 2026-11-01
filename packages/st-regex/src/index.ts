// Homunculus 2 — module: SillyTavern regex scripts (import and export). Author: CLAUDE, 2026-11-01 (D-060).
//
// SillyTavern keeps regex scripts in three places, all read here:
// - global: settings.json → extension_settings.regex (or a file exported from the Regex panel: one script or a list);
// - in a Chat Completion preset: extensions.regex_scripts;
// - in a character card: data.extensions.regex_scripts.
// The field names are translated in packages/schemas/src/regex.ts. Export gives SillyTavern's shape back.
import type { RegexScript } from "@homunculus/schemas";

export { fromStRegexScript as fromStScript, toStRegexScript as toStScript, embeddedStRegexScripts as embeddedStScripts } from "@homunculus/core";
import { embeddedStRegexScripts, fromStRegexScript, toStRegexScript } from "@homunculus/core";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const looksLikeScript = (o: Obj) => typeof o.findRegex === "string" || typeof o.scriptName === "string";
const fromStScript = (s: Obj) => fromStRegexScript(s);
const embeddedStScripts = embeddedStRegexScripts;
const toStScript = toStRegexScript;

/**
 * A picked file: a script exported from SillyTavern's Regex panel, a list of them, SillyTavern's settings.json
 * (its global scripts), a preset or a card JSON (their embedded scripts).
 */
export function importStRegexFile(bytes: Uint8Array, fileName: string): { scripts: RegexScript[]; from: "scripts" | "settings" | "preset" | "card" } {
  let json: unknown;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error(`"${fileName}" is not valid JSON.`); }
  if (Array.isArray(json)) {
    const scripts = list(json).filter(looksLikeScript).map((s) => fromStScript(s));
    if (scripts.length) return { scripts, from: "scripts" };
  } else if (isObj(json)) {
    if (looksLikeScript(json)) return { scripts: [fromStScript(json)], from: "scripts" };
    const ext = isObj(json.extension_settings) ? json.extension_settings : undefined;
    if (ext && Array.isArray(ext.regex)) return { scripts: list(ext.regex).filter(looksLikeScript).map((s) => fromStScript(s)), from: "settings" };
    const embedded = embeddedStScripts(json);
    if (embedded.length) return { scripts: embedded, from: isObj(json.data) ? "card" : "preset" };
  }
  throw new Error(`No SillyTavern regex scripts were found in "${fileName}".`);
}

/** SillyTavern's export file for a list of scripts. */
export function exportStRegex(scripts: readonly RegexScript[]): string {
  return JSON.stringify(scripts.length === 1 ? toStScript(scripts[0]!) : scripts.map(toStScript), null, 4);
}
