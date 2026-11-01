// Homunculus 2 — stories (slice 4, D-029): what a narrator, the NPCs and the user's role add to a reply's prompt.
// Author: CLAUDE, 2026-10-29. Pure functions; the turn (turn.ts) loads the data and calls these.
//
// - The narrator is sent like a character card would be (so every preset works unchanged): its instructions and
//   style become the "card" description, its turn instruction the post-history instructions. A card used as the
//   narrator is sent as it is.
// - NPCs (Vault sheets) and the story's other cards are sent as one "people in this story" part right after the card.
// - The role note says how the user takes part (player / co-author / director).
import { Character, SIMPLE_NARRATOR_ID, type Narrator, type NarratorFields, type Npc, type Story, type TrackerField, type TrackerSchema, type UserRole } from "@homunculus/schemas";
import { formatFieldValue } from "./trackers.ts";

/** The narrator that comes with the app (installed once; editable data, D-029). */
export const SIMPLE_NARRATOR: Narrator = {
  id: SIMPLE_NARRATOR_ID,
  name: "Simple Narrator",
  builtin: true,
  about: "A short, plain narrator to start from.",
  modes: [],
  instructions:
    "You are the narrator of this story. Describe the scene and voice every other character in it. Keep the story moving, " +
    "show what happens through action and dialogue, and end each reply at a moment where {{user}} can respond.",
  style: { pov: "", tense: "", length: "", tone: "", pacing: "", dialogue: "", mature: "" },
  blocks: [],
  mayAddNpcs: true,
  turnInstruction: "",
};

/** The narrator's blocks (D-059): its own, else its plain instructions as one block. */
export function narratorBlocks(n: Pick<NarratorFields, "blocks" | "instructions">): NarratorFields["blocks"] {
  if (n.blocks?.length) return n.blocks;
  return n.instructions.trim() ? [{ id: "instructions", name: "Instructions", on: true, text: n.instructions }] : [];
}

/** The joined text of the blocks that are on (kept in `instructions` so older readers still see it). */
export const blocksText = (blocks: NarratorFields["blocks"]) => blocks.filter((b) => b.on && b.text.trim()).map((b) => b.text.trim()).join("\n\n");

/** The narrator's style rows in plain words (D-059). */
export const NARRATOR_STYLE_ROWS = [["pov", "point of view"], ["tense", "tense"], ["length", "length"], ["tone", "tone"], ["pacing", "pacing"], ["dialogue", "dialogue"], ["mature", "mature scenes"]] as const;

/**
 * The narrator's text, sent where a card's description goes. Everything is wrapped in <narrator>…</narrator> (Daniel,
 * 31/10: "so the narrator's things aren't thrown around loose"): its blocks, its style, and whether it may add people.
 */
export function narratorText(n: NarratorFields): string {
  const style = NARRATOR_STYLE_ROWS.map(([k, label]) => (n.style[k] ?? "").trim() && `${label}: ${n.style[k]!.trim()}`).filter(Boolean);
  const body = [
    blocksText(narratorBlocks(n)),
    style.length ? `Style — ${style.join("; ")}.` : "",
    n.mayAddNpcs
      ? "You may bring in new people when the story needs them."
      : "Do not bring in new named people: use only the people you were given.",
  ].filter((x) => x.trim()).join("\n\n");
  return `<narrator>\n${body}\n</narrator>`;
}

/** A narrator as the prompt builder sees a card (name, description, post-history instructions). */
export function narratorAsCharacter(n: NarratorFields, id: string): Character {
  return Character.parse({ id: `narrator:${id}`, name: n.name || "Narrator", description: narratorText(n), postHistoryInstructions: n.turnInstruction });
}

/** What the narrator of a story is, before it is loaded: for words in the UI. */
export function narratorLabel(story: Story, names: { narrators: Record<string, string>; characters: Record<string, string> }): string {
  const r = story.narrator;
  if (r.kind === "vault") return names.narrators[r.id] ?? "Narrator (missing)";
  if (r.kind === "card") return names.characters[r.characterId] ?? "Card (missing)";
  return r.narrator.name || "Narrator";
}

/** How the user takes part, said to the AI. Player in a 1:1 chat says nothing (as before stories existed). */
export function roleNote(role: UserRole, inStory: boolean): string {
  if (role === "coauthor") return "{{user}} is a co-author. Their messages are directions for the story, not their character's words. Write every character, {{user}}'s character included, following those directions.";
  if (role === "director") return "{{user}} is not in the story. Their messages are directions from outside it. Write every character equally: there is no protagonist.";
  return inStory ? "{{user}} plays their own character. Never write {{user}}'s words, actions or thoughts." : "";
}

/** The fields of a field set that an NPC sheet keeps: per-character fields, minus the ones that change while playing. */
export function npcSheetFields(schema: TrackerSchema): TrackerField[] {
  const presence = schema.presence?.field;
  return schema.fields.filter((f) => f.scope === "perCharacter" && f.key !== presence && f.section.trim().toLowerCase() !== "now");
}

/** "Half-elf, Healer, level 5" — from the usual race/class/level fields, when the set has them. */
export function npcTagline(npc: Npc): string {
  const v = (k: string) => { const x = npc.values[k]; return x === undefined || x === null ? "" : String(x).trim(); };
  const level = v("level");
  return [v("race"), v("class"), level ? `level ${level}` : ""].filter(Boolean).join(", ");
}

/** One NPC as text for the prompt: name, tagline, then its filled fields by section. */
export function npcSheetText(npc: Npc, schema: TrackerSchema | undefined): string {
  const head = `### ${npc.name}`;
  if (!schema) {
    const plain = Object.entries(npc.values).filter(([, x]) => x !== undefined && x !== null && String(x).trim()).map(([k, x]) => `${k}: ${String(x)}`);
    return [head, ...plain].join("\n");
  }
  const lines: string[] = [];
  let section = "";
  for (const f of npcSheetFields(schema)) {
    const raw = npc.values[f.key];
    if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) continue;
    const text = formatFieldValue(f, raw);
    if (!text || text === "—") continue;
    if (f.section && f.section !== section) { section = f.section; lines.push(`${section}:`); }
    lines.push(`- ${f.label}: ${text}`);
  }
  return [head, ...lines].join("\n");
}

/** A full card in a story, sent as a sheet (its description and personality; the card itself never changes). */
export function cardSheetText(c: Character): string {
  return [`### ${c.name}`, c.description.trim(), c.personality.trim() ? `Personality: ${c.personality.trim()}` : ""].filter(Boolean).join("\n");
}

/**
 * The "people in this story" part: the role note, then the NPC and card sheets. Empty when there is nothing to say.
 * `inStory`: a story (the narrator voices them) vs a 1:1 chat (the character voices them when needed).
 */
export function castPart(a: { inStory: boolean; role: UserRole; npcs: Array<{ npc: Npc; schema: TrackerSchema | undefined }>; cards: Character[] }): string {
  const out: string[] = [];
  const note = roleNote(a.role, a.inStory);
  if (note) out.push(note);
  const sheets = [...a.npcs.map((x) => npcSheetText(x.npc, x.schema)), ...a.cards.map(cardSheetText)];
  if (sheets.length) {
    out.push(a.inStory
      ? "[People in this story. You voice them; they are not you.]"
      : "[Other people in the scene. {{char}} voices them when the story needs them.]");
    out.push(sheets.join("\n\n"));
  }
  return out.join("\n\n");
}

/**
 * A story made from a card that is really a narrator or a world ("Turn into a Story"): the card tells it (its
 * system prompt and description go as they are), its scenario is the premise and its greetings the openings.
 * Its lorebooks keep coming with it, because the card is the narrator. The card is not changed.
 */
export function storyFromCard(c: Character, id: string, now: number): Story {
  return {
    id, name: c.name, description: "", narrator: { kind: "card", characterId: c.id, variantId: null }, npcIds: [], cast: [],
    scenario: c.scenario, openings: [...c.firstMessages], userRole: "player", setup: {}, lorePatches: {}, createdAt: now,
  };
}
