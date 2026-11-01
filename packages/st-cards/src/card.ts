// SillyTavern character cards (V1, V2, V3) <-> Homunculus characters. Author: CLAUDE, 2026-10-23.
// Lossless rule: the original card is kept in `character.original`; on export we start from it
// and only overwrite the fields Homunculus edits, so unknown fields (extensions, embedded
// lorebook, tool-specific data) survive the round trip.
import type { Character, CharacterInput } from "@homunculus/schemas";
import { toStRegexScript } from "@homunculus/core";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(str) : []);

export type CardVersion = "v1" | "v2" | "v3";

export interface ParsedCard {
  version: CardVersion;
  character: Omit<CharacterInput, "id">;
  warnings: string[];
}

export function detectVersion(card: unknown): CardVersion {
  if (!isObj(card)) throw new Error("This file is not a character card (it has no card data).");
  if (card.spec === "chara_card_v3" && isObj(card.data)) return "v3";
  if (card.spec === "chara_card_v2" && isObj(card.data)) return "v2";
  if (typeof card.name === "string" && ("description" in card || "first_mes" in card || "personality" in card)) return "v1";
  throw new Error("This file is not a SillyTavern character card (unknown format).");
}

/** SillyTavern's Character's Note (data.extensions.depth_prompt) → ours (D-063). */
function noteOf(d: Obj): { characterNote?: { text: string; depth: number; role: "system" | "user" | "assistant" } } {
  const ext = isObj(d.extensions) ? d.extensions : {};
  const dp = isObj(ext.depth_prompt) ? ext.depth_prompt : undefined;
  if (!dp || typeof dp.prompt !== "string") return {};
  return { characterNote: { text: dp.prompt, depth: typeof dp.depth === "number" && dp.depth >= 0 ? Math.floor(dp.depth) : 4, role: dp.role === "user" || dp.role === "assistant" ? dp.role : "system" } };
}

/** Writes the note back into depth_prompt, keeping its other fields (lossless: no "role" added when it was not there). */
function withNote(ext: unknown, n: { text: string; depth: number; role: string }): Obj {
  const e = isObj(ext) ? ext : {};
  const prev = isObj(e.depth_prompt) ? e.depth_prompt : {};
  return { ...e, depth_prompt: { ...prev, prompt: n.text, depth: n.depth, ...("role" in prev || n.role !== "system" ? { role: n.role } : {}) } };
}

/** Our own card flags, kept in data.extensions.homunculus so a card exported and imported again keeps them (D-065). */
function flagsOf(d: Obj): { tracked?: boolean } {
  const ext = isObj(d.extensions) ? d.extensions : {};
  const h = isObj(ext.homunculus) ? ext.homunculus : {};
  return h.tracked === false ? { tracked: false } : {};
}

function withFlags(ext: unknown, c: Character): Obj {
  const e = isObj(ext) ? ext : {};
  if (c.tracked === undefined) return e;
  const prev = isObj(e.homunculus) ? e.homunculus : {};
  return { ...e, homunculus: { ...prev, tracked: c.tracked } };
}

export function parseCard(card: unknown): ParsedCard {
  const version = detectVersion(card);
  const c = card as Obj;
  const d = (version === "v1" ? c : c.data) as Obj;
  const name = str(d.name).trim();
  if (!name) throw new Error("The card has no character name.");

  const firstMessages = [str(d.first_mes), ...strArr(d.alternate_greetings)];
  while (firstMessages.length > 0 && firstMessages[firstMessages.length - 1] === "") firstMessages.pop();

  const warnings: string[] = [];
  // an embedded lorebook (character_book) stays in `original`; the app turns it into a lorebook linked to the
  // character (st-lorebooks adoptEmbeddedLorebook) and tells the user
  if (version === "v3" && Array.isArray(d.group_only_greetings) && d.group_only_greetings.length > 0) {
    warnings.push(`"${name}" has group-only greetings. They are kept with the card and will work when group sessions arrive.`);
  }

  return {
    version,
    warnings,
    character: {
      name,
      description: str(d.description),
      personality: str(d.personality),
      scenario: str(d.scenario),
      firstMessages,
      exampleMessages: str(d.mes_example),
      systemPrompt: str(d.system_prompt),
      postHistoryInstructions: str(d.post_history_instructions),
      creatorNotes: str(d.creator_notes),
      ...noteOf(d),
      ...flagsOf(d),
      creator: str(d.creator),
      characterVersion: str(d.character_version),
      tags: strArr(d.tags),
      original: card as CharacterInput["original"],
    },
  };
}

/** The card fields Homunculus owns, in SillyTavern naming. */
function ownedFields(c: Character): Obj {
  return {
    name: c.name,
    description: c.description,
    personality: c.personality,
    scenario: c.scenario,
    first_mes: c.firstMessages[0] ?? "",
    alternate_greetings: c.firstMessages.slice(1),
    mes_example: c.exampleMessages,
    system_prompt: c.systemPrompt,
    post_history_instructions: c.postHistoryInstructions,
    creator_notes: c.creatorNotes,
    creator: c.creator,
    character_version: c.characterVersion,
    tags: c.tags,
  };
}

function originalParts(c: Character): { top: Obj; data: Obj } {
  const o = c.original;
  if (!isObj(o)) return { top: {}, data: {} };
  const v = (() => { try { return detectVersion(o); } catch { return null; } })();
  if (v === "v2" || v === "v3") {
    const { data, ...top } = o;
    return { top: structuredClone(top), data: structuredClone(data as Obj) };
  }
  if (v === "v1") return { top: structuredClone(o), data: structuredClone(o) };
  return { top: {}, data: {} };
}

/** V2 card (also writes the V1 fields at the top level, like SillyTavern does). */
export function toCardV2(c: Character): Obj {
  const { top, data } = originalParts(c);
  const owned = ownedFields(c);
  const outData: Obj = { extensions: {}, ...data, ...owned };
  if (c.regexScripts) outData.extensions = { ...(outData.extensions as Obj), regex_scripts: c.regexScripts.map(toStRegexScript) }; // D-060
  if (c.characterNote) outData.extensions = withNote(outData.extensions, c.characterNote); // D-063
  outData.extensions = withFlags(outData.extensions, c); // D-065
  delete outData.group_only_greetings; delete outData.assets; delete outData.nickname; // V3-only
  const { alternate_greetings: _a, system_prompt: _s, post_history_instructions: _p, creator_notes: _n,
    creator: _c, character_version: _v, tags: _t, ...v1 } = owned;
  return { ...top, ...v1, spec: "chara_card_v2", spec_version: "2.0", data: outData };
}

/** V3 card. */
export function toCardV3(c: Character): Obj {
  const { top, data } = originalParts(c);
  const owned = ownedFields(c);
  const outData: Obj = { extensions: {}, group_only_greetings: [], ...data, ...owned };
  if (c.regexScripts) outData.extensions = { ...(outData.extensions as Obj), regex_scripts: c.regexScripts.map(toStRegexScript) }; // D-060
  if (c.characterNote) outData.extensions = withNote(outData.extensions, c.characterNote); // D-063
  outData.extensions = withFlags(outData.extensions, c); // D-065
  const { alternate_greetings: _a, system_prompt: _s, post_history_instructions: _p, creator_notes: _n,
    creator: _c, character_version: _v, tags: _t, ...v1 } = owned;
  return { ...top, ...v1, spec: "chara_card_v3", spec_version: "3.0", data: outData };
}
