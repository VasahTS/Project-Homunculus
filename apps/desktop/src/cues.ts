// Homunculus 2 — cues for the screens (D-113): storage helpers, the examples, switching cues on per layer, and plain
// words for signals, rules and places. Author: CLAUDE, 2026-11-10.
// The app knows no cue by name: the examples and the two starters are editable data.
import { Cue, type CueCondition, type CueGroup, type CueInput, type CuePosition, type CueSignal, type Session, type SetupLayer, type Story } from "@homunculus/schemas";
import { cueFromLoreEntries, cueNamespace, conditionText, type SqlStore } from "@homunculus/core";
import { importStLorebook } from "@homunculus/st-lorebooks";
import { LoreEntry } from "@homunculus/schemas";

export async function listCues(store: SqlStore): Promise<Cue[]> {
  return (await store.cues.list()).sort((a, b) => a.name.localeCompare(b.name));
}

/** A new cue: one group with one text, in the chat one message back, so a simple rule needs only the text. */
export function blankCue(taken: Iterable<string>, name = "New cue"): CueInput {
  return {
    id: `cue-${crypto.randomUUID()}`, name, namespace: cueNamespace(name, taken),
    groups: [{ key: "texts", name: "Texts", pick: "all", placement: { position: "atDepth", depth: 1, role: "system" }, items: [{ id: crypto.randomUUID(), text: "" }] }],
  };
}

/** A copy of a cue (an example, an import) with fresh ids and its own namespace. */
export function copyCue(c: CueInput, taken: Iterable<string>, name = c.name): CueInput {
  return { ...structuredClone(c), id: `cue-${crypto.randomUUID()}`, name, namespace: cueNamespace(name, taken), source: { kind: "user" } };
}

// ------------------------------------------------------------------ switching on (Default → Story → chat)

/** Is the cue on in this layer (`inherited` = what the layer above says)? Same rules as agents' lists. */
export function layerHasCue(layer: SetupLayer, id: string, inherited = false): boolean {
  const a = layer.cues;
  if (!a || a.mode === "keep") return inherited;
  if (a.mode === "only") return a.add.includes(id);
  if (a.remove.includes(id)) return false;
  return a.add.includes(id) || inherited;
}

/** The layer with the cue on or off. Matching the layer above stores nothing. */
export function layerWithCue(layer: SetupLayer, id: string, on: boolean, inherited = false): SetupLayer {
  const a = layer.cues && layer.cues.mode !== "keep" ? layer.cues : { mode: "add" as const, add: [], remove: [] };
  let add = a.add.filter((x) => x !== id);
  let remove = a.remove.filter((x) => x !== id);
  if (a.mode === "only") { if (on) add = [...add, id]; }
  else if (on !== inherited) { if (on) add = [...add, id]; else remove = [...remove, id]; }
  const setup = { ...layer };
  if (a.mode !== "only" && !add.length && !remove.length) delete setup.cues;
  else setup.cues = { mode: a.mode, add, remove };
  return setup;
}

/** "Default · 2 stories · 3 chats" — where a cue is switched on (characters it is tied to count too). */
export function cueOnText(c: Cue, def: SetupLayer, stories: Story[], sessions: Session[], characterName: (id: string) => string | undefined): string {
  const parts: string[] = [];
  if (layerHasCue(def, c.id)) parts.push("every chat");
  const st = stories.filter((s) => layerHasCue(s.setup, c.id)).length;
  if (st) parts.push(`${st} ${st === 1 ? "story" : "stories"}`);
  const ch = sessions.filter((s) => s.setup.cues?.add.includes(c.id)).length;
  if (ch) parts.push(`${ch} ${ch === 1 ? "chat" : "chats"}`);
  const names = c.characterIds.map(characterName).filter(Boolean);
  if (names.length) parts.push(`with ${names.join(", ")}`);
  return parts.join(" · ") || "off";
}

// ------------------------------------------------------------------ words for the screens

export const SIGNAL_KINDS: Array<{ kind: CueSignal["kind"]; label: string; sub: string }> = [
  { kind: "words", label: "Words", sub: "How often words show up in the last messages" },
  { kind: "messages", label: "Messages", sub: "How many messages there are on this branch" },
  { kind: "chance", label: "Chance", sub: "Yes or no, at random" },
  { kind: "clock", label: "Clock", sub: "Your computer's time of day" },
  { kind: "tracker", label: "Tracker", sub: "A tracker field or another cue's value" },
  { kind: "generation", label: "Generation", sub: "New reply, new version, continue…" },
];

export const PICKS: Array<{ value: CueGroup["pick"]; label: string; sub: string }> = [
  { value: "all", label: "All That Match", sub: "every text whose tests pass" },
  { value: "first", label: "First That Matches", sub: "the first one in the list" },
  { value: "random", label: "Random", sub: "one, by weight" },
  { value: "rotate", label: "Rotate", sub: "the next one each time" },
];

export const POSITIONS: Array<{ value: CuePosition; label: string }> = [
  { value: "atDepth", label: "In the chat" },
  { value: "after", label: "After the character" },
  { value: "before", label: "Before the character" },
  { value: "agentPrompts", label: "With the agents' prompts" },
  { value: "anTop", label: "Before the Author's Note" },
  { value: "anBottom", label: "After the Author's Note" },
  { value: "emTop", label: "Before the examples" },
  { value: "emBottom", label: "After the examples" },
  { value: "outlet", label: "In an outlet" },
];

export function placeText(p: CueGroup["placement"]): string {
  const name = POSITIONS.find((x) => x.value === p.position)?.label ?? p.position;
  if (p.position === "atDepth") return `${name} · ${p.depth === 0 ? "at the end" : `${p.depth} back`} · as ${p.role === "system" ? "System" : p.role === "user" ? "User" : "AI"}`;
  if (p.position === "outlet") return `${name} · ${p.outletName || "no name yet"}`;
  return name;
}

/** "words: kiss, lips… · last 4" */
export function signalText(s: CueSignal): string {
  switch (s.kind) {
    case "words": {
      const list = s.words.slice(0, 4).join(", ") + (s.words.length > 4 ? `… (${s.words.length})` : "");
      const who = s.from === "user" ? " · yours" : s.from === "ai" ? " · the AI's" : "";
      return s.measure === "streak" ? `messages in a row with ${s.perMessage}+ of: ${list || "no words yet"} · last ${s.last}${who}`
        : `${list || "no words yet"} · last ${s.last}${who}`;
    }
    case "messages": return s.count === "user" ? "your messages" : s.count === "ai" ? "the AI's messages" : "messages on this branch";
    case "chance": return `${s.percent}% chance`;
    case "clock": return s.read === "hour" ? "the hour (0–23)" : "morning / afternoon / evening / night";
    case "tracker": return s.path || "pick a field";
    case "generation": return "normal / swipe / continue / impersonate";
  }
}

export const conditionWords = (c: CueCondition) => conditionText(c);
export const testsText = (list: CueCondition[], logic: "all" | "any") => list.map(conditionText).join(logic === "any" ? " or " : " · ");

// ------------------------------------------------------------------ examples (From an Example…) and starters

const atDepth1 = { position: "atDepth" as const, depth: 1, role: "system" as const };
const is = (path: string, value: string): CueCondition => ({ path, op: "equals", value });

/** The examples the "From an Example…" menu copies from. Simple to complete, all editable. */
export const CUE_EXAMPLES: Array<{ id: string; name: string; help: string; make: () => Omit<CueInput, "id" | "namespace"> }> = [
  {
    id: "random-event", name: "Random Event", help: "Now and then, something small happens — never twice in a row.",
    make: () => ({
      name: "Random Event", help: "Now and then, something small happens — never twice in a row.", icon: "🎲",
      groups: [{ key: "event", name: "Events", pick: "random", noRepeat: 3, chance: 15, cooldown: 6,
        wrap: "[In this reply, include this small event naturally: {{text}}]", placement: atDepth1,
        items: [
          { id: "e1", title: "A sound", text: "A sound from somewhere nearby draws attention." },
          { id: "e2", title: "Weather", text: "The weather changes a little." },
          { id: "e3", title: "Someone passes", text: "Someone passes by and notices the characters." },
          { id: "e4", title: "An object", text: "A small object is dropped, found or broken." },
          { id: "e5", title: "A memory", text: "A memory surfaces for {{char}}, briefly." },
        ] }],
    }),
  },
  {
    id: "opens-up", name: "Opens Up Slowly", help: "Starts guarded and warms up as the chat goes on.",
    make: () => ({
      name: "Opens Up Slowly", help: "Starts guarded and warms up as the chat goes on.", icon: "🌱",
      signals: [{ key: "messages", kind: "messages", count: "both" }],
      values: [{ key: "stage", initial: "guarded", otherwise: "reset", showInScene: true, rules: [
        { when: [{ path: "signal.messages", op: "atLeast", value: "60" }], do: "set", value: "close" },
        { when: [{ path: "signal.messages", op: "atLeast", value: "20" }], do: "set", value: "warming" },
      ] }],
      groups: [{ key: "stage", name: "Stage", pick: "first", placement: { position: "after", depth: 4, role: "system" }, items: [
        { id: "guarded", title: "Guarded", text: "{{char}} is still guarded with {{user}}: polite, short answers, keeps personal things private.", when: [is("value.stage", "guarded")] },
        { id: "warming", title: "Warming", text: "{{char}} is warming up to {{user}}: more relaxed, shares small personal details, jokes a little.", when: [is("value.stage", "warming")] },
        { id: "close", title: "Close", text: "{{char}} trusts {{user}} now: open, honest, comfortable with silence and with personal topics.", when: [is("value.stage", "close")] },
      ] }],
    }),
  },
  {
    id: "mood-words", name: "Mood Words", help: "Picks up the mood of the last messages from their words, with no AI call.",
    make: () => ({
      name: "Mood Words", help: "Picks up the mood of the last messages from their words, with no AI call.", icon: "🎭",
      signals: [
        { key: "angry", kind: "words", words: ["angry", "furious", "shout", "shouted", "glare", "glared", "slam", "slammed", "hate"], last: 3, ignoreNegated: true },
        { key: "sad", kind: "words", words: ["sad", "cry", "cried", "tears", "sob", "sobbed", "miss", "lonely", "hurt"], last: 3, ignoreNegated: true },
        { key: "happy", kind: "words", words: ["laugh", "laughed", "smile", "smiled", "grin", "grinned", "happy", "glad", "joy"], last: 3, ignoreNegated: true },
      ],
      values: [{ key: "mood", initial: "calm", otherwise: "reset", showInScene: true, rules: [
        { when: [{ path: "signal.angry", op: "atLeast", value: "2" }], do: "set", value: "tense" },
        { when: [{ path: "signal.sad", op: "atLeast", value: "2" }], do: "set", value: "sad" },
        { when: [{ path: "signal.happy", op: "atLeast", value: "2" }], do: "set", value: "light" },
      ] }],
      groups: [{ key: "mood", name: "Mood", pick: "first", placement: atDepth1, items: [
        { id: "tense", title: "Tense", text: "The mood is tense. Let it show in short sentences and body language.", when: [is("value.mood", "tense")] },
        { id: "sad", title: "Sad", text: "The mood is sad. Slow down; leave room for quiet.", when: [is("value.mood", "sad")] },
        { id: "light", title: "Light", text: "The mood is light. Playfulness is welcome.", when: [is("value.mood", "light")] },
      ] }],
    }),
  },
  {
    id: "time-of-day", name: "Time of Day", help: "Uses your computer's clock: the scene follows the real time of day.",
    make: () => ({
      name: "Time of Day", help: "Uses your computer's clock: the scene follows the real time of day.", icon: "🕰",
      signals: [{ key: "part", kind: "clock", read: "period" }],
      groups: [{ key: "time", name: "Time", pick: "first", placement: { position: "after", depth: 4, role: "system" }, items: [
        { id: "morning", title: "Morning", text: "It is morning where {{user}} is.", when: [is("signal.part", "morning")] },
        { id: "afternoon", title: "Afternoon", text: "It is afternoon where {{user}} is.", when: [is("signal.part", "afternoon")] },
        { id: "evening", title: "Evening", text: "It is evening where {{user}} is.", when: [is("signal.part", "evening")] },
        { id: "night", title: "Night", text: "It is late at night where {{user}} is; {{char}} may be tired.", when: [is("signal.part", "night")] },
      ] }],
    }),
  },
  {
    id: "boundary", name: "Boundary", help: "When you ask to stop, the scene stops — until you say to go on.",
    make: () => ({
      name: "Boundary", help: "When you ask to stop, the scene stops — until you say to go on.", icon: "✋",
      signals: [
        { key: "stop", kind: "words", words: ["please stop", "stop it", "I don't want this", "no more", "/\\bstop\\b/"], last: 1, from: "user", ignoreNegated: true },
        { key: "resume", kind: "words", words: ["go on", "keep going", "it's okay now", "continue"], last: 1, from: "user" },
      ],
      values: [{ key: "paused", initial: "no", otherwise: "keep", showInScene: true, rules: [
        { when: [{ path: "signal.stop", op: "atLeast", value: "1" }], do: "set", value: "yes" },
        { when: [{ path: "signal.resume", op: "atLeast", value: "1" }], do: "set", value: "no" },
      ] }],
      groups: [{ key: "boundary", name: "Boundary", pick: "first", placement: { position: "atDepth", depth: 0, role: "system" }, items: [
        { id: "stop", title: "Stop", text: "{{user}} asked to stop. End what was happening now, respectfully, and check in with {{user}}. Do not continue it.", when: [is("value.paused", "yes")] },
      ] }],
    }),
  },
];

/** A cue made from an example, ready to save. */
export function cueFromExample(id: string, taken: Iterable<string>): CueInput | undefined {
  const ex = CUE_EXAMPLES.find((x) => x.id === id);
  if (!ex) return undefined;
  const body = ex.make();
  return { ...body, id: `cue-${crypto.randomUUID()}`, namespace: cueNamespace(ex.name, taken), source: { kind: "example", from: ex.id } };
}

/**
 * The two starters that used to be "No AI call" agents (D-047), as cues, for new installs. An install that had them as
 * agents gets them moved instead (moveTextAgentsToCues), and one that deleted them doesn't get them back.
 */
export const STARTER_CUES: CueInput[] = [
  {
    id: "starter-dont-write-for-user", name: "Don't Write for User", help: "Keeps the AI from acting or speaking for you.", namespace: "cue-dont-write-for-user",
    groups: [{ key: "text", name: "Don't Write for User", pick: "all", placement: atDepth1, items: [{ id: "text", title: "Don't Write for User",
      text: "Never write {{user}}'s actions, words, thoughts or feelings. Only {{char}} and the other characters act and speak. When it is {{user}}'s turn to act, stop and leave room for them." }] }],
    source: { kind: "example", from: "starter" },
  },
  {
    id: "starter-grounded-complication", name: "Grounded Complication", help: "Adds a small, plausible complication.", namespace: "cue-grounded-complication",
    groups: [{ key: "text", name: "Grounded Complication", pick: "all", chance: 40, placement: atDepth1, items: [{ id: "text", title: "Grounded Complication",
      text: "In this reply, add one realistic complication: {{random::something breaks or goes missing::someone arrives at the wrong moment::the weather turns::a small misunderstanding::a cost or a delay appears}}. Keep it grounded and do not derail the plot." }] }],
    source: { kind: "example", from: "starter" },
  },
];

/** Installs the starter cues once (never again after the user deletes one). Agents installed before them don't count twice. */
export async function installStarterCues(store: SqlStore): Promise<void> {
  const KEY = "starterCues";
  const installed = new Set((await store.getAppSetting<string[]>(KEY)) ?? []);
  const asAgents = new Set((await store.getAppSetting<string[]>("starterAgents")) ?? []);
  let changed = false;
  for (const c of STARTER_CUES) {
    if (installed.has(c.id)) continue;
    // an install that had it as an agent: moved already (or deleted on purpose)
    if (!asAgents.has(c.id) && !(await store.cues.get(c.id))) await store.saveCue(Cue.parse(c));
    installed.add(c.id);
    changed = true;
  }
  if (changed) await store.setAppSetting(KEY, [...installed]);
}

// ------------------------------------------------------------------ JanitorAI lorebook scripts (D-113 §6.1)

/** Is this file a JanitorAI lorebook script (a bare list of entries, or its record with the entries as JSON text)? */
export function isJanitorLorebook(text: string): boolean {
  const t = text.replace(/^\uFEFF/, "").trimStart();
  if (t.startsWith("[")) return true;
  if (!t.startsWith("{")) return false;
  try { const j = JSON.parse(t) as { script?: unknown }; return typeof j.script === "string" && j.script.trimStart().startsWith("["); } catch { return false; }
}

/** A lorebook script's entries as one cue of writing rules (a group "all that match"). */
export function cueFromJanitorText(text: string, fileName: string, taken: Iterable<string>, splitRegex = false): { cue: CueInput; notes: string[] } {
  const book = importStLorebook(new TextEncoder().encode(text), fileName, { splitRegex });
  const name = book.lorebook.name || fileName.replace(/\.[^.]+$/, "");
  const { cue, notes } = cueFromLoreEntries(name, (book.lorebook.entries ?? []).map((e) => LoreEntry.parse(e)), { id: `cue-${crypto.randomUUID()}`, namespace: cueNamespace(name, taken) });
  return { cue: { ...cue, source: { kind: "imported", from: fileName } }, notes: [...book.warnings.filter((w) => !w.includes("personality or scenario")), ...notes] };
}
