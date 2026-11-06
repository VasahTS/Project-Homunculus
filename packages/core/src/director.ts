// Homunculus 2 — the Director (D-092): an out-of-character chat about the story, and the notes it makes.
// Author: CLAUDE, 2026-11-06. Canvas "Homunculus 2 — Director" (drafts A2, F, G).
//
// Nothing here has a fixed name or job: a Director is data (its job, its "writer line", what it sees, its note
// weights and their instructions are all editable), and the starter one is only an editable default. Notes go to the
// story's AI after the chat, grouped by weight; each reply, swipe or regeneration that carries a note counts as one
// use, and a note that runs out stays listed as expired so you can see what was sent.
import type { SqlStore } from "./storage/store.ts";

export interface DirectorWeight {
  id: string;
  name: string;
  /** How the story's AI should treat the notes of this weight (goes above them in the prompt). */
  instruction: string;
  /** How long a new note of this weight lasts by default (null = always). */
  lasts: number | null;
}

export type DirectorLore = "none" | "fired" | "all";
export type DirectorPresetView = "none" | "active" | "all";

export interface DirectorSees {
  preset: DirectorPresetView;
  characters: boolean;
  persona: boolean;
  /** The story page's scenario and narrator. */
  story: boolean;
  lore: DirectorLore;
  trackers: boolean;
  memory: boolean;
  /** Author's Note and Character's Note. */
  notes: boolean;
  /** Notes other agents wrote for the story. */
  agents: boolean;
  /** Messages of the story chat it reads (0 = none). */
  chat: number;
  /** Earlier Director talks in other chats of the same story it remembers (question/answer pairs, 0 = none). */
  past: number;
}

/** What a Director may change in the story (D-092): never, after you approve, or by itself (always with Undo). */
export type DirectorPermission = "never" | "ask" | "allowed";
export const CHANGE_KINDS = ["notes", "tracker", "lore", "authorsNote", "characterNote", "chapter"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export type DirectorMay = Record<ChangeKind, DirectorPermission>;

export interface DirectorProfile {
  id: string;
  name: string;
  /** Saved connection id; "" = the story's connection. */
  connectionId: string;
  /** "" = the connection's model (or the story's model when the connection is the story's). */
  model: string;
  job: string;
  /** The rule that keeps it out of the story. Editable, like everything else. */
  writerLine: string;
  /** How it proposes notes. {{weights}} becomes the list of weights. */
  noteFormat: string;
  /** Above the notes in the story's prompt. */
  notesHeader: string;
  weights: DirectorWeight[];
  defaultWeightId: string;
  sees: DirectorSees;
  /** Where the notes go in the story's prompt: messages before the end of the chat (0 = after the last one). */
  depth: number;
  role: "system" | "user";
  may: DirectorMay;
  /** How it proposes changes. {{changes}} becomes the list of what it may change. */
  changeFormat: string;
  /** After each reply that carried notes, one short extra call checks whether the reply followed them. */
  checkReplies: boolean;
  checkPrompt: string;
  /** A question it is asked by itself every N story replies (0 = off); the answer lands in its chat. */
  autoEvery: number;
  autoQuestion: string;
  /** Buttons above its message box. */
  quick: string[];
}

export interface DirectorNote {
  id: string;
  text: string;
  weightId: string;
  /** Replaces the weight's instruction for this note only. */
  instruction?: string | undefined;
  /** Replies it lasts (null = always). */
  lasts: number | null;
  /** The replies (and swipes) it was sent with, oldest first. */
  sent: string[];
  off?: boolean | undefined;
  createdAt: number;
  /** Reply id → whether that reply followed the note (only with "Check replies against notes"). */
  checks?: Record<string, "followed" | "ignored"> | undefined;
}

export interface DirectorTurn {
  role: "user" | "director";
  text: string;
  at: number;
  /** Proposed notes already added from this turn, by their index in the text. */
  added?: number[] | undefined;
  /** Proposed changes applied from this turn, by their index: what Undo puts back. */
  applied?: Record<string, { undo: ChangeUndo; undone?: boolean | undefined; at: number }> | undefined;
  /** Asked by itself (the automatic question), not by you. */
  auto?: boolean | undefined;
}

/** One chat's Director: which profile, its notes and its conversation. */
export interface DirectorState {
  profileId: string;
  notes: DirectorNote[];
  chat: DirectorTurn[];
  /** Story replies since the chat began (for the automatic question). */
  replies?: number | undefined;
}

/** A change the Director proposed (D-092), as it wrote it. */
export interface ProposedChange {
  index: number;
  kind: ChangeKind;
  /** tracker: its name or namespace · lore: book name · characterNote: character name · chapter: its number. */
  target: string;
  /** lore: the entry's title (a new entry when none matches). */
  entry: string;
  /** lore: keys for a new entry, comma-separated. */
  keys: string;
  /** The new text (a JSON object for a tracker). */
  value: string;
}

/** What Undo needs to put a change back. */
export type ChangeUndo =
  | { kind: "tracker"; messageId: string; namespace: string; before: Record<string, unknown> }
  | { kind: "lore"; bookId: string; storyId?: string | undefined; patch?: unknown; entries?: unknown }
  | { kind: "authorsNote"; sessionId: string; before: unknown }
  | { kind: "characterNote"; characterId: string; before: unknown }
  | { kind: "chapter"; sessionId: string; branchId: string | null; chapterId: string; before: { summary: string; edited?: boolean | undefined } };

export type NoteStatus = "active" | "expired" | "off";

export const DIRECTOR_JOB = `You are the Director of this story, not its writer. You talk with {{user}} out of character about how the story is going: pacing, where it is heading, whether characters act like themselves, and which prompt, card or lorebook entry causes what.
Answer plainly and briefly. Quote the story only to point at something.
When {{user}} wants the story to change, propose a note instead of changing it yourself.`;

export const DIRECTOR_WRITER_LINE = "Never continue the story, write narration or speak as a character here. If asked to, say that it belongs in the story chat.";

export const DIRECTOR_NOTE_FORMAT = `To propose a note for the story's AI, put it on its own line:
<note weight="WEIGHT" lasts="NUMBER or always">what the story should do</note>
Weights:
{{weights}}
Write a note as what to do, not what to avoid ("keep the talk on the bargain", not "don't mention the dragon"). One or two sentences each. Propose notes only when {{user}} wants a change, at most two at a time, and pick the lightest weight that will work.`;

export const DIRECTOR_NOTES_HEADER = "Director's notes: steering from the author, outside the story. Follow them without mentioning them or the author.";

export const DIRECTOR_WEIGHTS: DirectorWeight[] = [
  { id: "whisper", name: "Whisper", lasts: 3,
    instruction: "Follow quietly. Do not mention it, do not build the scene around it, and do not bring in anything only because it is named here." },
  { id: "steer", name: "Steer", lasts: null,
    instruction: "Work toward this gradually, through what the characters want and do. No sudden twist." },
  { id: "turn", name: "Turn", lasts: 1,
    instruction: "This must happen in the next reply and shape it. Make it clear and give it weight." },
];

export const DIRECTOR_SEES: DirectorSees = {
  preset: "active", characters: true, persona: true, story: true, lore: "fired", trackers: true, memory: true, notes: true, agents: true, chat: 40, past: 6,
};

export const DIRECTOR_MAY: DirectorMay = { notes: "ask", tracker: "ask", lore: "ask", authorsNote: "ask", characterNote: "ask", chapter: "ask" };

export const DIRECTOR_CHANGE_FORMAT = `When {{user}} wants something in the story fixed, you may propose a change, on its own lines. You may change:
{{changes}}
Propose a change only when asked or when something is clearly wrong, and say in a sentence why.`;

export const DIRECTOR_CHECK_PROMPT = `Here are the Director's notes the story's AI had for its last reply, and that reply. For each note, did the reply follow it? A Whisper is followed when the reply is consistent with it, even if it does not show it.`;

export const DIRECTOR_AUTO_QUESTION = "Is anyone acting out of character, or is the story drifting from where {{user}} wanted it? Answer in two sentences; say \"All good.\" if nothing is off.";

export const DIRECTOR_QUICK = ["Where is the story going?", "Three ideas for the next scene.", "Who has been left out lately?"];

export const DEFAULT_DIRECTOR: DirectorProfile = {
  id: "director", name: "Story Director", connectionId: "", model: "",
  job: DIRECTOR_JOB, writerLine: DIRECTOR_WRITER_LINE, noteFormat: DIRECTOR_NOTE_FORMAT, notesHeader: DIRECTOR_NOTES_HEADER,
  weights: DIRECTOR_WEIGHTS, defaultWeightId: "whisper", sees: DIRECTOR_SEES, depth: 0, role: "system",
  may: DIRECTOR_MAY, changeFormat: DIRECTOR_CHANGE_FORMAT, checkReplies: false, checkPrompt: DIRECTOR_CHECK_PROMPT,
  autoEvery: 0, autoQuestion: DIRECTOR_AUTO_QUESTION, quick: DIRECTOR_QUICK,
};

const PROFILES_KEY = "director.profiles";
const stateKey = (sessionId: string) => `director.state:${sessionId}`;

const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
const lastsOf = (v: unknown, d: number | null): number | null => (v === null ? null : typeof v === "number" && v >= 1 ? Math.min(999, Math.round(v)) : d);

/** Reads a stored profile, filling anything missing from the starter (old or hand-edited data never breaks). */
export function cleanProfile(raw: unknown): DirectorProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_DIRECTOR;
  const weights = Array.isArray(r.weights)
    ? r.weights.flatMap((w): DirectorWeight[] => {
      const x = (w && typeof w === "object" ? w : {}) as Record<string, unknown>;
      const id = str(x.id, "").trim();
      return id ? [{ id, name: str(x.name, id), instruction: str(x.instruction, ""), lasts: lastsOf(x.lasts, null) }] : [];
    })
    : d.weights;
  const s = (r.sees && typeof r.sees === "object" ? r.sees : {}) as Record<string, unknown>;
  const bool = (k: keyof DirectorSees) => (typeof s[k] === "boolean" ? (s[k] as boolean) : (d.sees[k] as boolean));
  const sees: DirectorSees = {
    preset: s.preset === "none" || s.preset === "all" || s.preset === "active" ? s.preset : d.sees.preset,
    characters: bool("characters"), persona: bool("persona"), story: bool("story"),
    lore: s.lore === "none" || s.lore === "all" || s.lore === "fired" ? s.lore : d.sees.lore,
    trackers: bool("trackers"), memory: bool("memory"), notes: bool("notes"), agents: bool("agents"),
    chat: num(s.chat, d.sees.chat, 0, 1000), past: num(s.past, d.sees.past, 0, 100),
  };
  const m = (r.may && typeof r.may === "object" ? r.may : {}) as Record<string, unknown>;
  const may = Object.fromEntries(CHANGE_KINDS.map((k) => [k, m[k] === "never" || m[k] === "ask" || m[k] === "allowed" ? m[k] : d.may[k]])) as DirectorMay;
  const defaultWeightId = str(r.defaultWeightId, d.defaultWeightId);
  return {
    id: str(r.id, d.id) || d.id, name: str(r.name, d.name), connectionId: str(r.connectionId, ""), model: str(r.model, ""),
    job: str(r.job, d.job), writerLine: str(r.writerLine, d.writerLine), noteFormat: str(r.noteFormat, d.noteFormat),
    notesHeader: str(r.notesHeader, d.notesHeader), weights,
    defaultWeightId: weights.some((w) => w.id === defaultWeightId) ? defaultWeightId : weights[0]?.id ?? "",
    sees, depth: num(r.depth, d.depth, 0, 999), role: r.role === "user" ? "user" : "system",
    may, changeFormat: str(r.changeFormat, d.changeFormat), checkReplies: r.checkReplies === true, checkPrompt: str(r.checkPrompt, d.checkPrompt),
    autoEvery: num(r.autoEvery, 0, 0, 999), autoQuestion: str(r.autoQuestion, d.autoQuestion),
    quick: Array.isArray(r.quick) ? r.quick.filter((q): q is string => typeof q === "string" && !!q.trim()) : d.quick,
  };
}

export async function directorProfiles(store: SqlStore): Promise<DirectorProfile[]> {
  const raw = await store.getAppSetting<unknown[]>(PROFILES_KEY);
  const list = Array.isArray(raw) ? raw.map(cleanProfile) : [];
  return list.length ? list : [DEFAULT_DIRECTOR];
}

export async function saveDirectorProfiles(store: SqlStore, profiles: DirectorProfile[]): Promise<void> {
  await store.setAppSetting(PROFILES_KEY, profiles.map(cleanProfile));
}

export async function directorState(store: SqlStore, sessionId: string): Promise<DirectorState> {
  const raw = await store.getAppSetting<Partial<DirectorState>>(stateKey(sessionId));
  return {
    profileId: typeof raw?.profileId === "string" ? raw.profileId : "",
    notes: Array.isArray(raw?.notes) ? raw.notes.filter((n) => n && typeof n.text === "string").map((n) => ({ ...n, sent: Array.isArray(n.sent) ? n.sent : [] })) : [],
    chat: Array.isArray(raw?.chat) ? raw.chat.filter((t) => t && typeof t.text === "string") : [],
    ...(typeof raw?.replies === "number" ? { replies: raw.replies } : {}),
  };
}

export async function saveDirectorState(store: SqlStore, sessionId: string, state: DirectorState): Promise<void> {
  await store.setAppSetting(stateKey(sessionId), state);
}

/** The profile a chat uses: its own pick, else the first one. */
export function profileFor(profiles: DirectorProfile[], state: Pick<DirectorState, "profileId">): DirectorProfile {
  return profiles.find((p) => p.id === state.profileId) ?? profiles[0] ?? DEFAULT_DIRECTOR;
}

export function noteStatus(n: DirectorNote): NoteStatus {
  if (n.off) return "off";
  return n.lasts !== null && n.sent.length >= n.lasts ? "expired" : "active";
}

/** "2 of 3 left", "Always", "Expired after 3". */
export function noteLeft(n: DirectorNote): string {
  if (n.lasts === null) return "Always";
  const left = Math.max(0, n.lasts - n.sent.length);
  return left ? `${left} of ${n.lasts} left` : `Used ${n.lasts} of ${n.lasts}`;
}

/** The text that goes to the story's AI, or "" when no note is active. Grouped by weight, in the profile's order. */
export function directorNotesText(profile: DirectorProfile, notes: DirectorNote[]): string {
  const active = notes.filter((n) => noteStatus(n) === "active" && n.text.trim());
  if (!active.length) return "";
  const known = new Set(profile.weights.map((w) => w.id));
  const groups: string[] = [];
  for (const w of profile.weights) {
    const mine = active.filter((n) => n.weightId === w.id);
    const shared = mine.filter((n) => !n.instruction?.trim());
    if (shared.length) groups.push([`${w.name}: ${w.instruction}`.trim(), ...shared.map((n) => `- ${n.text.trim()}`)].join("\n"));
    for (const n of mine.filter((x) => x.instruction?.trim())) groups.push(`${w.name}: ${n.instruction!.trim()}\n- ${n.text.trim()}`);
  }
  const orphan = active.filter((n) => !known.has(n.weightId));
  if (orphan.length) groups.push(orphan.map((n) => (n.instruction?.trim() ? `${n.instruction.trim()}\n- ${n.text.trim()}` : `- ${n.text.trim()}`)).join("\n"));
  return [profile.notesHeader.trim(), ...groups].filter(Boolean).join("\n\n");
}

/** Every reply that went out with the notes counts once for each active note (swipes and regenerations too). */
export function countNotes(notes: DirectorNote[], replyId: string): DirectorNote[] {
  return notes.map((n) => (noteStatus(n) === "active" && !n.sent.includes(replyId) ? { ...n, sent: [...n.sent, replyId] } : n));
}

export interface ProposedNote { index: number; text: string; weightId: string; lasts: number | null }

const NOTE_RE = /<note\b([^>]*)>([\s\S]*?)<\/note>/gi;
const attr = (attrs: string, name: string) => new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(attrs)?.[1]?.trim();

/** The notes the Director proposed in a reply. Unknown weights fall back to the profile's default weight. */
export function parseProposals(text: string, profile: DirectorProfile): ProposedNote[] {
  const out: ProposedNote[] = [];
  let i = 0;
  for (const m of text.matchAll(NOTE_RE)) {
    const body = (m[2] ?? "").trim();
    if (!body) continue;
    const wanted = attr(m[1] ?? "", "weight")?.toLowerCase() ?? "";
    const w = profile.weights.find((x) => x.id.toLowerCase() === wanted || x.name.toLowerCase() === wanted)
      ?? profile.weights.find((x) => x.id === profile.defaultWeightId);
    const l = attr(m[1] ?? "", "lasts")?.toLowerCase();
    const lasts = l === "always" || l === "forever" ? null : l && /^\d+$/.test(l) && Number(l) >= 1 ? Math.min(999, Number(l)) : w?.lasts ?? null;
    out.push({ index: i++, text: body, weightId: w?.id ?? "", lasts });
  }
  return out;
}

const CHANGE_RE = /<change\b([^>]*)>([\s\S]*?)<\/change>/gi;
const KIND_ALIASES: Record<string, ChangeKind> = {
  tracker: "tracker", trackers: "tracker", lore: "lore", lorebook: "lore", authorsnote: "authorsNote", "authors-note": "authorsNote", note: "authorsNote",
  characternote: "characterNote", "character-note": "characterNote", chapter: "chapter", memory: "chapter", notes: "notes",
};

/** The changes the Director proposed in a reply (unknown kinds are left as text). */
export function parseChanges(text: string): ProposedChange[] {
  const out: ProposedChange[] = [];
  let i = 0;
  for (const m of text.matchAll(CHANGE_RE)) {
    const a = m[1] ?? "";
    const kind = KIND_ALIASES[(attr(a, "kind") ?? "").toLowerCase().replace(/[\s_']/g, "")];
    if (!kind || kind === "notes") continue;
    out.push({ index: i++, kind, target: attr(a, "target") ?? attr(a, "tracker") ?? attr(a, "book") ?? attr(a, "character") ?? attr(a, "number") ?? "",
      entry: attr(a, "entry") ?? "", keys: attr(a, "keys") ?? "", value: (m[2] ?? "").trim() });
  }
  return out;
}

export type DirectorPiece = { kind: "text"; text: string } | { kind: "note"; note: ProposedNote } | { kind: "change"; change: ProposedChange };

/** The reply split into plain text, proposed notes and proposed changes, in order (the chat shows them as cards). */
export function splitProposals(text: string, profile: DirectorProfile): DirectorPiece[] {
  const notes = parseProposals(text, profile);
  const changes = parseChanges(text);
  const tags = [...[...text.matchAll(NOTE_RE)].map((m) => ({ m, t: "note" as const })), ...[...text.matchAll(CHANGE_RE)].map((m) => ({ m, t: "change" as const }))]
    .sort((a, b) => (a.m.index ?? 0) - (b.m.index ?? 0));
  const out: DirectorPiece[] = [];
  let last = 0, ni = 0, ci = 0;
  for (const { m, t } of tags) {
    if ((m.index ?? 0) < last) continue;
    const before = text.slice(last, m.index).trim();
    if (before) out.push({ kind: "text", text: before });
    last = (m.index ?? 0) + m[0].length;
    if (t === "note" && (m[2] ?? "").trim()) out.push({ kind: "note", note: notes[ni++]! });
    if (t === "change") {
      const c = changes.find((x) => x.index === ci);
      const kind = KIND_ALIASES[(attr(m[1] ?? "", "kind") ?? "").toLowerCase().replace(/[\s_']/g, "")];
      if (kind && kind !== "notes") { if (c) out.push({ kind: "change", change: c }); ci++; }
      else out.push({ kind: "text", text: m[0] });
    }
  }
  const rest = text.slice(last).trim();
  if (rest) out.push({ kind: "text", text: rest });
  return out;
}

/** The text before a proposal tag, for the chat history sent back to the Director (tags stay: it knows what it asked). */
export const CHANGE_LABELS: Record<ChangeKind, string> = {
  notes: "Director's notes", tracker: "Tracker values", lore: "Lorebook entries", authorsNote: "Author's Note", characterNote: "Character's Note", chapter: "Memory chapters",
};

/** Which part of the story's prompt a part's `source` belongs to, for "What it sees". */
export function seesPart(source: string, sees: DirectorSees): boolean {
  if (source === "history") return sees.chat > 0;
  if (source === "persona") return sees.persona;
  if (source === "session:scenario" || source === "narrator:system" || source === "narrator:inChat" || source === "narrator:fallback") return sees.story;
  if (source.startsWith("card:") && source !== "card:systemPrompt" && source !== "card:note") return sees.characters;
  if (source === "cast") return sees.characters;
  if (source === "authorsNote" || source === "card:note") return sees.notes;
  if (source === "lore:note" || source.startsWith("lore:")) return sees.lore !== "none";
  if (source.startsWith("state:")) return sees.trackers;
  if (source === "agent:memory") return sees.memory;
  if (source === "agent:director") return false; // its own notes are listed separately, with their status
  if (source.startsWith("agent:")) return sees.agents;
  if (source.startsWith("block:") || source === "card:systemPrompt" || source === "postHistory" || source === "prefill" || source.startsWith("inline:")) return sees.preset !== "none";
  return true;
}

/** The notes' list for the Director itself: what is on, what ran out, what was switched off. */
export function notesForDirector(profile: DirectorProfile, notes: DirectorNote[]): string {
  if (!notes.length) return "No notes yet.";
  const name = (id: string) => profile.weights.find((w) => w.id === id)?.name ?? id;
  return notes.map((n) => `- [${noteStatus(n)} · ${name(n.weightId)} · ${noteLeft(n)}] ${n.text}`).join("\n");
}

export function weightsList(profile: DirectorProfile): string {
  return profile.weights.map((w) => `- ${w.id} (${w.name}): ${w.instruction}${w.lasts === null ? " Default: always." : ` Default: ${w.lasts} replies.`}`).join("\n");
}
