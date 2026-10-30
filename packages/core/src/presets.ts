// Homunculus 2 — building the prompt from a preset (BLUEPRINT §5). Author: CLAUDE, 2026-10-28 (slice 2, D-021).
// Replaces prompt-v0. Follows SillyTavern's Chat Completion assembly where it matters for presets made there
// (public/scripts/openai.js preparePromptsForChatCompletion / populateChatCompletion / populationInjectionPrompts):
// - blocks in order; markers filled by the app; a card's system prompt replaces "main", its post-history
//   instructions replace "jailbreak" (unless the block forbids it; {{original}} = the block's own text);
// - blocks "at depth" go inside the chat, N messages before the end (higher order first, then system/user/assistant);
// - no Chat History block = no conversation is sent (as in SillyTavern);
// - the context budget leaves out the OLDEST messages first, and says so.
// Ours on top: `scene` and `agentPrompts` markers; when a preset has no place for them they are put right
// before the chat history, with a note ("placed automatically"), never dropped in silence.
import { Preset, type Character, type GenerationType, type Message, type PresetBlock, type PromptPart } from "@homunculus/schemas";
import type { ResolvedNarratorPrompt } from "./setup.ts";
import type { ChatTurn } from "./extensions.ts";
import { expandMacros, type MacroContext } from "./macros.ts";

/** A rough token count (about 3.6 characters per token for English prose). Exact counts come from the service. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.6) + 4;

export interface PromptInjection {
  agentId: string;
  text: string;
  position: "marker" | "depth";
  depth: number;
  role: "system" | "user" | "assistant";
}

export interface BuildPromptInput {
  preset: Preset;
  generationType: GenerationType;
  /** The speaking character as this session sees it (its version applied). */
  character: Character | undefined;
  /** Missing/card placement preserves existing presets exactly. CODEX, D-042. */
  narrator?: ResolvedNarratorPrompt;
  persona?: { name: string; description: string; placement: { position: "inPrompt" | "atDepth" | "none"; depth: number; role: "system" | "user" | "assistant" } };
  /** The session's own scenario (wins over the card's, as in SillyTavern). */
  sessionScenario: string;
  history: Message[];
  names: { char: string; user: string };
  /** Current values of trackers (fields marked "send to the AI"), one text per tracker. */
  scene: Array<{ agentId: string; text: string }>;
  /**
   * Stories and NPCs (slice 4, D-029): the user's role and the sheets of the people in the story. Goes right after
   * the card's description/personality (else before the scenario, else before the chat). Empty = nothing.
   */
  cast?: string;
  injections: PromptInjection[];
  /** Instructions for inline agents (the main model writes their blocks): always at the end. */
  inline: Array<{ agentId: string; text: string }>;
  /** Lorebook entries that activated (slice 3, lorebook.ts). Missing parts = none. */
  worldInfo?: LoreForPrompt;
  /**
   * The Author's Note as the setup has it, and whether it goes this turn (`authorsNoteGoes`). Missing = no note
   * feature (lore entries "around the Author's Note" then go to SillyTavern's default place).
   */
  authorsNote?: { text: string; position: "inChat" | "afterMain" | "beforeMain"; depth: number; role: "system" | "user" | "assistant"; interval: number; goes: boolean };
  /** Room kept for the reply, in tokens (counts against the context size). */
  reserve: number;
  /** Extra things macros can read (model, state, seed, registered macros…). */
  macros?: Partial<MacroContext>;
}

/** What the lorebook scan gives the prompt (see `scanLorebooks`). */
export interface LoreForPrompt {
  before: string[];
  after: string[];
  depth?: Array<{ depth: number; role: "system" | "user" | "assistant"; content: string }>;
  examplesTop?: string[];
  examplesBottom?: string[];
  noteTop?: string[];
  noteBottom?: string[];
  outlets?: Record<string, string[]>;
}

/** Where SillyTavern puts the Author's Note by default (and the lore entries around it when there is no note setup). */
export const AUTHORS_NOTE_DEFAULT = { depth: 4, role: "system" as const };

export interface BuiltPrompt {
  parts: PromptPart[];
  budget: { limit?: number; used: number; reserved: number; droppedMessages: number };
  notes: string[];
}

/** The preset the app ships with (also installed in the library as editable data). Same prompt as before slice 2. */
export const DEFAULT_PRESET: Preset = Preset.parse({
  id: "homunculus-default",
  name: "Homunculus Default",
  description: "The prompt Homunculus uses when you don't pick a preset: the card, your persona, the scene, then the chat.",
  contextSize: 32768,
  squashSystem: true,
  formats: {
    description: "Description:\n{{description}}",
    personality: "Personality:\n{{personality}}",
    scenario: "Scenario:\n{{scenario}}",
    persona: "About {{user}}:\n{{persona}}",
    examples: "Example dialogue:\n{{mesExamples}}",
    worldInfo: "{{worldInfo}}",
  },
  blocks: [
    { id: "main", name: "Main Prompt", content: "You are {{char}}. Stay in character and continue the roleplay with {{user}}." },
    { id: "worldInfoBefore", name: "World Info (before)", marker: "worldInfoBefore" },
    { id: "charDescription", name: "Char Description", marker: "charDescription" },
    { id: "charPersonality", name: "Char Personality", marker: "charPersonality" },
    { id: "scenario", name: "Scenario", marker: "scenario" },
    { id: "dialogueExamples", name: "Chat Examples", marker: "dialogueExamples" },
    { id: "personaDescription", name: "Persona Description", marker: "personaDescription" },
    { id: "worldInfoAfter", name: "World Info (after)", marker: "worldInfoAfter" },
    { id: "scene", name: "Current Scene", marker: "scene" },
    { id: "agentPrompts", name: "Agent Prompts", marker: "agentPrompts" },
    { id: "chatHistory", name: "Chat History", marker: "chatHistory" },
    { id: "jailbreak", name: "Post-History Instructions", content: "" },
  ],
});

/** What each marker is, in words (for the editor and the "see the prompt" views). */
export const MARKER_LABELS: Record<NonNullable<PresetBlock["marker"]>, string> = {
  charDescription: "the character's description",
  charPersonality: "the character's personality",
  scenario: "the scenario (the session's, else the card's)",
  personaDescription: "your persona's description",
  dialogueExamples: "the card's example dialogue",
  chatHistory: "the conversation",
  worldInfoBefore: "lorebook entries placed \"before\" (before the character)",
  worldInfoAfter: "lorebook entries placed \"after\" (after the character)",
  scene: "trackers' current values (Current scene)",
  agentPrompts: "what agents add to the prompt",
};

interface DepthItem { depth: number; order: number; role: PromptPart["role"]; content: string; source: string }
const ROLE_ORDER = { system: 0, user: 1, assistant: 2 } as const;

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const { preset, names } = input;
  const narratorCard = input.character;
  const movedNarrator = input.narrator && input.narrator.position !== "card";
  const c = movedNarrator && narratorCard ? { ...narratorCard, description: "", personality: "", scenario: "", exampleMessages: "", systemPrompt: "", postHistoryInstructions: "" } : narratorCard;
  const notes: string[] = [];
  const persona = input.persona;
  const scenarioText = input.sessionScenario.trim() || c?.scenario || "";
  const ctx: MacroContext = {
    ...input.macros, ...names,
    description: narratorCard?.description ?? "", personality: narratorCard?.personality ?? "", scenario: input.sessionScenario.trim() || narratorCard?.scenario || "",
    persona: persona?.description ?? "", mesExamples: narratorCard?.exampleMessages ?? "",
    lastMessage: input.history.at(-1)?.content ?? "",
    lastUserMessage: [...input.history].reverse().find((m) => m.speaker.kind === "user")?.content ?? "",
    lastCharMessage: [...input.history].reverse().find((m) => m.speaker.kind !== "user")?.content ?? "",
    vars: input.macros?.vars ?? new Map(),
    custom: (name, args) => {
      if (name === "outlet") return (input.worldInfo?.outlets?.[(args[0] ?? "").trim()] ?? []).join("\n");
      return input.macros?.custom?.(name, args);
    },
  };
  const m = (t: string, extra: Partial<MacroContext> = {}) => expandMacros(t, { ...ctx, ...extra });
  const fmt = (format: string, key: string, value: string) => m(format.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), "\u0003"), {}).replace(/\u0003/g, m(value));

  const active = preset.blocks.filter((b) => b.enabled && (b.triggers.length === 0 || b.triggers.includes(input.generationType)));
  const has = (marker: string) => active.some((b) => b.marker === marker && b.position === "list");
  const hasId = (id: string) => active.some((b) => b.id === id && !b.marker);

  // the pieces in list order; the chat history is a placeholder filled at the end (it gets what space is left)
  type Seg = { kind: "part"; part: PromptPart } | { kind: "history" };
  const segs: Seg[] = [];
  const depthItems: DepthItem[] = [];
  const add = (part: PromptPart) => { if (part.content.trim()) segs.push({ kind: "part", part }); };

  const sceneParts = (): PromptPart[] => input.scene.filter((s) => s.text.trim()).map((s) => ({
    role: "system", content: `Current scene (for continuity; do not repeat it back):\n${m(s.text)}`, source: `state:${s.agentId}`,
  }));
  const agentParts = (): PromptPart[] => input.injections.filter((i) => i.position === "marker" && i.text.trim())
    .map((i) => ({ role: i.role, content: m(i.text), source: `agent:${i.agentId}` }));

  let mainSeg: Seg | undefined;
  for (const b of active) {
    const isDepth = b.position === "depth" && !b.marker;
    if (!b.marker) {
      let content = b.content;
      let source = `block:${b.name || b.id}`;
      if (b.id === "main" && c?.systemPrompt.trim() && !b.noOverride) { content = c.systemPrompt; source = "card:systemPrompt"; }
      if (b.id === "jailbreak" && c?.postHistoryInstructions.trim() && !b.noOverride) { content = c.postHistoryInstructions; source = "postHistory"; }
      const text = m(content, { original: m(b.content) });
      if (isDepth) { if (text.trim()) depthItems.push({ depth: b.depth, order: b.order, role: b.role, content: text, source }); }
      else {
        const before = segs.length;
        add({ role: b.role, content: text, source });
        if (b.id === "main" && segs.length > before) mainSeg = segs[segs.length - 1];
      }
      continue;
    }
    switch (b.marker) {
      case "charDescription": if (c?.description.trim()) add({ role: b.role, content: fmt(preset.formats.description, "description", c.description), source: "card:description" }); break;
      case "charPersonality": if (c?.personality.trim()) add({ role: b.role, content: fmt(preset.formats.personality, "personality", c.personality), source: "card:personality" }); break;
      case "scenario": if (scenarioText.trim()) add({ role: b.role, content: fmt(preset.formats.scenario, "scenario", scenarioText), source: input.sessionScenario.trim() ? "session:scenario" : "card:scenario" }); break;
      case "dialogueExamples": {
        const top = input.worldInfo?.examplesTop ?? [], bottom = input.worldInfo?.examplesBottom ?? [];
        const own = c?.exampleMessages.trim() ?? "";
        if (!own && !top.length && !bottom.length) break;
        const joined = [...top, own, ...bottom].filter((x) => x.trim()).join("\n");
        const ex = joined.replace(/<START>/gi, preset.prompts.newExampleChat || "<START>");
        add({ role: b.role, content: fmt(preset.formats.examples, "mesExamples", ex), source: own ? "card:examples" : "lore:examples" });
        break;
      }
      case "personaDescription": if (persona?.description.trim() && persona.placement.position === "inPrompt") {
        add({ role: b.role, content: fmt(preset.formats.persona, "persona", persona.description), source: "persona" });
      } break;
      case "worldInfoBefore": case "worldInfoAfter": {
        const list = (b.marker === "worldInfoBefore" ? input.worldInfo?.before : input.worldInfo?.after) ?? [];
        if (list.length) add({ role: b.role, content: fmtWorldInfo(preset.formats.worldInfo, list.join("\n")), source: `lore:${b.marker === "worldInfoBefore" ? "before" : "after"}` });
        break;
      }
      case "scene": for (const p of sceneParts()) add(p); break;
      case "agentPrompts": for (const p of agentParts()) add(p); break;
      case "chatHistory": segs.push({ kind: "history" }); break;
    }
  }

  // Narrator placement is independent of the card marker layout; its name/macros stay available. CODEX, D-042.
  const narrator = input.narrator;
  if (narrator && narratorCard && (movedNarrator || narrator.alsoInChat)) {
    const content = m([
      narratorCard.systemPrompt,
      narratorCard.description,
      narratorCard.personality.trim() ? `Personality:
${narratorCard.personality}` : "",
      narratorCard.scenario.trim() && narratorCard.scenario.trim() !== input.sessionScenario.trim() ? `Scenario:
${narratorCard.scenario}` : "",
      narratorCard.exampleMessages.trim() ? `Example dialogue:
${narratorCard.exampleMessages}` : "",
      narratorCard.postHistoryInstructions,
    ].filter((text) => text.trim()).join("\n\n"));
    if (content.trim()) {
      const text = `Narrator instructions (${m(narratorCard.name)}):
${content}`;
      if (narrator.position === "system") {
        const mainAt = mainSeg ? segs.indexOf(mainSeg) : -1;
        segs.splice(mainAt + 1, 0, { kind: "part", part: { role: "system", content: text, source: "narrator:system" } });
      }
      if (narrator.position === "inChat" || narrator.alsoInChat) {
        if (has("chatHistory")) depthItems.push({ depth: narrator.depth, order: narrator.order, role: narrator.role, content: text, source: "narrator:inChat" });
        else {
          add({ role: "system", content: text, source: "narrator:fallback" });
          notes.push("Narrator instructions were sent as a system block because this preset has no Chat History block for their requested depth.");
        }
      }
    }
  }

  // the people of a story: after the card, else before the scenario, else before the chat (no note: it has no block)
  if (input.cast?.trim()) {
    const castSeg: Seg = { kind: "part", part: { role: "system", content: m(input.cast), source: "cast" } };
    const lastCard = segs.reduce((at, x, i) => (x.kind === "part" && (x.part.source === "card:description" || x.part.source === "card:personality") ? i : at), -1);
    const scenarioAt = segs.findIndex((x) => x.kind === "part" && (x.part.source === "session:scenario" || x.part.source === "card:scenario"));
    const chatAt = segs.findIndex((x) => x.kind === "history");
    const at = lastCard >= 0 ? lastCard + 1 : scenarioAt >= 0 ? scenarioAt : chatAt >= 0 ? chatAt : segs.length;
    segs.splice(at, 0, castSeg);
  }

  // the Author's Note (SillyTavern authors-note.js), with the lorebook entries placed around it
  const noteTop = (input.worldInfo?.noteTop ?? []).filter((x) => x.trim());
  const noteBottom = (input.worldInfo?.noteBottom ?? []).filter((x) => x.trim());
  const an = input.authorsNote;
  if (!an) {
    if (noteTop.length || noteBottom.length) depthItems.push({ ...AUTHORS_NOTE_DEFAULT, order: 100, content: [...noteTop, ...noteBottom].join("\n"), source: "lore:note" });
  } else if (an.goes) {
    const own = an.text.trim() ? m(an.text) : "";
    const content = [...noteTop, own, ...noteBottom].filter((x) => x.trim()).join("\n");
    if (content.trim()) {
      const source = own ? "authorsNote" : "lore:note";
      if (an.position === "inChat") depthItems.push({ depth: an.depth, order: 100, role: an.role, content, source });
      else {
        const mainAt = mainSeg ? segs.indexOf(mainSeg) : -1;
        const at = an.position === "afterMain" ? mainAt + 1 : Math.max(0, mainAt);
        segs.splice(at, 0, { kind: "part", part: { role: an.role, content, source } });
        if (!mainSeg) notes.push(`The Author's Note was placed at the start, because the preset has no "Main Prompt" block.`);
      }
    }
  } else if (an.text.trim() || noteTop.length || noteBottom.length) {
    const left = noteTop.length + noteBottom.length;
    notes.push(`The Author's Note was not sent this turn: it goes every ${an.interval === 0 ? "— never (set to 0)" : `${an.interval} of your messages`}.${left ? ` ${left} lorebook entr${left === 1 ? "y" : "ies"} placed around it stayed out too.` : ""}`);
  }

  // the card's Character's Note (SillyTavern's depth_prompt): always, at its own depth and role
  const dp = ((c?.original ?? {}) as { data?: { extensions?: { depth_prompt?: { prompt?: unknown; depth?: unknown; role?: unknown } } } }).data?.extensions?.depth_prompt;
  if (typeof dp?.prompt === "string" && dp.prompt.trim()) {
    const depth = typeof dp.depth === "number" && dp.depth >= 0 ? Math.floor(dp.depth) : 4;
    const role = dp.role === "user" || dp.role === "assistant" ? dp.role : "system";
    depthItems.push({ depth, order: 100, role, content: m(dp.prompt), source: "card:note" });
  }

  // ours, when the preset has no place for them: right before the chat history, with a note
  const historyAt = segs.findIndex((s) => s.kind === "history");
  const autoPlace = (parts: PromptPart[], what: string) => {
    if (!parts.length) return;
    const at = historyAt < 0 ? segs.length : segs.findIndex((s) => s.kind === "history");
    segs.splice(at, 0, ...parts.map((part) => ({ kind: "part" as const, part })));
    notes.push(`${what} was placed automatically before the chat history, because the preset has no block for it. Add a "${what}" block to choose its place.`);
  };
  if (!has("scene")) autoPlace(sceneParts(), "Current Scene");
  if (!has("agentPrompts")) autoPlace(agentParts(), "Agent Prompts");
  if (c?.postHistoryInstructions.trim() && !hasId("jailbreak")) {
    segs.push({ kind: "part", part: { role: "system", content: m(c.postHistoryInstructions), source: "postHistory" } });
    notes.push("The card's post-history instructions were added at the end, because the preset has no \"Post-History Instructions\" block.");
  }
  if (c?.systemPrompt.trim() && !hasId("main")) notes.push("The card has its own system prompt, but the preset has no \"Main Prompt\" block, so it was not used.");
  if (historyAt < 0 && input.history.length) notes.push("This preset has no Chat History block, so the conversation was not sent.");

  // depth items: the persona "near the end", agents "at depth", preset blocks "at depth"
  if (persona?.description.trim() && persona.placement.position === "atDepth") {
    depthItems.push({ depth: persona.placement.depth, order: 100, role: persona.placement.role, content: fmt(preset.formats.persona, "persona", persona.description), source: "persona" });
  }
  // lorebook entries inside the chat (the ones around the Author's Note go with it, above)
  for (const d of input.worldInfo?.depth ?? []) if (d.content.trim()) depthItems.push({ depth: d.depth, order: 100, role: d.role, content: d.content, source: "lore:depth" });
  const loreLeftOut = (marker: "worldInfoBefore" | "worldInfoAfter", list: string[] | undefined) => {
    if (list?.length && !has(marker)) notes.push(`${list.length} lorebook entr${list.length === 1 ? "y" : "ies"} placed "${marker === "worldInfoBefore" ? "before" : "after"}" were not sent, because the preset has no "World Info (${marker === "worldInfoBefore" ? "before" : "after"})" block.`);
  };
  loreLeftOut("worldInfoBefore", input.worldInfo?.before);
  loreLeftOut("worldInfoAfter", input.worldInfo?.after);
  for (const i of input.injections.filter((x) => x.position === "depth" && x.text.trim())) {
    depthItems.push({ depth: i.depth, order: 100, role: i.role, content: m(i.text), source: `agent:${i.agentId}` });
  }

  // the conversation, as chat messages
  const chat: PromptPart[] = [];
  for (const msg of input.history) {
    if (msg.visibility.ai !== "full" || msg.kind === "event") continue;
    if (msg.meta.incomplete === true && msg.content.trim() === "") continue;
    const content = msg.kind === "direction" ? `[Direction] ${m(msg.content)}` : msg.kind === "ooc" ? `(OOC: ${m(msg.content)})` : m(msg.content);
    chat.push({ role: msg.speaker.kind === "user" ? "user" : "assistant", content, source: "history" });
  }
  const newChat = preset.prompts.newChat.trim() ? m(preset.prompts.newChat) : "";
  const inline: PromptPart[] = input.inline.map((i) => ({ role: "system", content: i.text, source: `inline:${i.agentId}` }));
  const prefill: PromptPart[] = preset.prompts.prefill.trim() ? [{ role: "assistant", content: m(preset.prompts.prefill), source: "prefill" }] : [];

  // budget: everything but the history is fixed; the history gets the rest, newest messages first
  const fixed = segs.reduce((n, s) => n + (s.kind === "part" ? estimateTokens(s.part.content) : 0), 0)
    + depthItems.reduce((n, d) => n + estimateTokens(d.content), 0)
    + [...inline, ...prefill].reduce((n, p) => n + estimateTokens(p.content), 0)
    + (newChat ? estimateTokens(newChat) : 0);
  let kept = historyAt < 0 ? [] : chat;
  let dropped = 0;
  if (preset.contextSize && historyAt >= 0) {
    const room = preset.contextSize - input.reserve - fixed;
    let used = 0;
    let from = chat.length;
    while (from > 0 && used + estimateTokens(chat[from - 1]!.content) <= room) { used += estimateTokens(chat[from - 1]!.content); from--; }
    if (from === chat.length && chat.length) { from = chat.length - 1; notes.push("Even the last message does not fit in the context size; it was sent anyway. Raise the preset's context size or shorten the blocks."); }
    kept = chat.slice(from);
    dropped = from;
    if (dropped) notes.push(`${dropped} older message(s) were left out to fit the context size (${preset.contextSize.toLocaleString("en-US")} tokens).`);
  }

  // place the depth items inside the kept chat (SillyTavern: higher order first, then system, user, assistant)
  const withDepth: PromptPart[] = [];
  const at = (d: DepthItem) => Math.max(0, kept.length - d.depth);
  const sorted = [...depthItems].sort((a, b) => at(a) - at(b) || b.order - a.order || ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
  let di = 0;
  for (let i = 0; i <= kept.length; i++) {
    while (di < sorted.length && at(sorted[di]!) === i) { const d = sorted[di++]!; withDepth.push({ role: d.role, content: d.content, source: d.source }); }
    if (i < kept.length) withDepth.push(kept[i]!);
  }
  const historyParts = historyAt < 0 ? [] : [...(newChat ? [{ role: "system" as const, content: newChat, source: "history" }] : []), ...withDepth];
  if (historyAt < 0 && depthItems.length) notes.push("Blocks set to a depth inside the chat were not sent, because the preset has no Chat History block.");

  const parts: PromptPart[] = [];
  for (const s of segs) {
    if (s.kind === "part") parts.push(s.part);
    else parts.push(...historyParts);
  }
  parts.push(...inline, ...prefill);
  const used = parts.reduce((n, p) => n + estimateTokens(p.content), 0);
  return { parts, budget: { limit: preset.contextSize, used, reserved: input.reserve, droppedMessages: dropped }, notes };
}

/** SillyTavern's wi_format uses "{0}"; ours uses {{worldInfo}}. Both work. */
function fmtWorldInfo(format: string, text: string): string {
  return format.includes("{0}") ? format.replace("{0}", text) : format.replace(/\{\{\s*worldInfo\s*\}\}/gi, text);
}

/** For sending: system messages that follow each other become one (preset option "squash"). */
export function squashSystem(parts: PromptPart[]): PromptPart[] {
  const out: PromptPart[] = [];
  for (const p of parts) {
    const last = out.at(-1);
    if (last && last.role === "system" && p.role === "system" && last.source !== "history" && p.source !== "history") {
      out[out.length - 1] = { ...last, content: `${last.content}\n\n${p.content}`, source: last.source };
    } else out.push({ ...p });
  }
  return out;
}

export const toTurns = (parts: PromptPart[]): ChatTurn[] => parts.map(({ role, content }) => ({ role, content }));

/** The preset's samplers that are set (they win over the connection's). */
export function presetParams(p: Preset): Record<string, number> {
  return Object.fromEntries(Object.entries(p.params).filter(([, v]) => v !== undefined)) as Record<string, number>;
}
