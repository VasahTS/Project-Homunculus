// Homunculus 2 — where the story happens: stories, sessions, cast, messages. Author: CLAUDE.
// BLUEPRINT §2.2 and §2.3.
import { z } from "zod";
import { LoreEntry } from "./lorebooks.ts";
import { Id, Json, UserRole } from "./common.ts";
import { SetupLayer } from "./setup.ts";

/** A cast member: a character (with the variant chosen for this story) or the narrator. */
export const CastMember = z.object({
  characterId: Id.nullable(), // null = built-in narrator with no card
  variantId: Id.nullable().default(null), // null = the character's main version
  role: z.enum(["character", "narrator"]).default("character"),
  /** in_scene: whole sheet goes to the AI · offscreen: one line · off: nothing is sent. */
  presence: z.enum(["in_scene", "offscreen", "off"]).default("in_scene"),
  /** Track in the Scene for this story/chat only; missing = the card's own choice (Character.tracked). D-065. */
  tracked: z.boolean().optional(),
  /** Muted members stay in the cast but never reply on their own. */
  muted: z.boolean().default(false),
  /** A clean sheet written for the narrator (the card itself is never changed). */
  sheet: z.string().optional(),
  joinedAtMessageId: Id.nullable().default(null),
});
export type CastMember = z.infer<typeof CastMember>;
export type CastMemberInput = z.input<typeof CastMember>;

// ---------------------------------------------------------------- Stories (slice 4, D-029) — CLAUDE, 2026-10-29
// A Story is a narrated story kept in the Vault (it replaced the "Campaign" of the first blueprint): a narrator
// (not a character), NPCs from the Vault, optional full cards, how it starts, and the story layer of the setup.
// 1:1 chats are plain sessions (storyId = null).

/** Who tells a story: a narrator kept in the Vault, one of the user's cards, or one written only for this story. */
export const NarratorFields = z.object({
  name: z.string().min(1).default("Narrator"),
  /** One line for you (cards, pickers): what kind of storytelling this is (D-058). Not sent to the AI. */
  about: z.string().default(""),
  /** The story modes it is written for (D-058): empty = any. Only a hint when picking a narrator. */
  modes: z.array(UserRole).default([]),
  /** What the narrator is told: voice, rules, what to do and not do. {{user}} and {{char}} work. */
  instructions: z.string().default(""),
  /** Story style (BLUEPRINT §3 storyStyle): empty = not said. */
  style: z.object({
    pov: z.string().default(""),
    tense: z.string().default(""),
    length: z.string().default(""),
    tone: z.string().default(""),
    /** D-059: more style rows (empty = not said). */
    pacing: z.string().default(""),
    dialogue: z.string().default(""),
    mature: z.string().default(""),
  }).default({ pov: "", tense: "", length: "", tone: "", pacing: "", dialogue: "", mature: "" }),
  /**
   * The instructions as named blocks sent in order (D-059: Role, Story, NPCs, Dialogue…), each can be switched off.
   * Empty = the plain `instructions` text (older narrators). When blocks exist, `instructions` keeps their joined text.
   */
  blocks: z.array(z.object({ id: z.string().min(1), name: z.string().default(""), on: z.boolean().default(true), text: z.string().default("") })).default([]),
  /** The narrator may bring in new people (NPCs) when the story needs them. */
  mayAddNpcs: z.boolean().default(true),
  /** Sent last, every reply (SillyTavern's post-history instructions). Empty = none. */
  turnInstruction: z.string().default(""),
});
export type NarratorFields = z.infer<typeof NarratorFields>;

export const NarratorRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("vault"), id: Id }),
  z.object({ kind: z.literal("card"), characterId: Id, variantId: Id.nullable().default(null) }),
  z.object({ kind: z.literal("own"), narrator: NarratorFields }),
]);
export type NarratorRef = z.infer<typeof NarratorRef>;

/** The narrator that comes with the app (installed once as editable Vault data). */
export const SIMPLE_NARRATOR_ID = "simple-narrator";

/** A story's changes to one lorebook (D-049): entries it added or changed (whole entries), entries it turned off, and
 * who made each change (you, or an agent at a message). */
export const LorePatch = z.object({
  entries: z.record(z.string(), LoreEntry).default({}),
  removed: z.array(Id).default([]),
  meta: z.record(z.string(), z.object({ by: z.string(), messageId: Id.optional(), at: z.number().int() })).default({}),
});
export type LorePatch = z.infer<typeof LorePatch>;

/**
 * One way a story can start (D-138): the narrator's first message and the scenario sent with every reply in chats that
 * start with it. Older stories kept openings as plain texts: a text is read as `{ text }`, and a missing scenario means
 * the story's old single `scenario` (see `storyOpenings`).
 */
export const Opening = z.preprocess(
  (v) => (typeof v === "string" ? { text: v } : v),
  z.object({
    text: z.string().default(""),
    /** Missing only in openings saved before D-138: they use the story's old `scenario`. */
    scenario: z.string().optional(),
  }),
);
export type Opening = z.infer<typeof Opening>;
export type OpeningInput = string | { text?: string; scenario?: string };

export const Story = z.object({
  id: Id,
  name: z.string().min(1).default("Untitled story"),
  /** One or two lines shown on the story's card (optional; the scenario is shown when empty). */
  description: z.string().default(""),
  narrator: NarratorRef.default({ kind: "vault", id: SIMPLE_NARRATOR_ID }),
  /** NPCs of this story (Vault items; the same NPC can be in several stories and chats). */
  npcIds: z.array(Id).default([]),
  /** Full character cards in the story (role "character"); the narrator voices them like the NPCs. */
  cast: z.array(CastMember).default([]),
  /**
   * The story's single premise from before D-138. Each opening has its own scenario now; this stays for openings saved
   * before that (and for a story with no openings at all, which starts with the card narrator's greetings).
   * The Story page no longer edits it.
   */
  scenario: z.string().default(""),
  /** Opening messages, each with its scenario (D-138): a new session starts with one, the others are its swipes.
   *  No opening with text = the card narrator's greetings. */
  openings: z.array(Opening).default([]),
  /** How the user takes part: plays a character, co-writes, or directs from outside the story. */
  userRole: UserRole.default("player"),
  /** The story layer of the setup (default → story → session). */
  setup: SetupLayer.default({}),
  /** The story's own version of the lorebooks it changes (D-049): only the differences, keyed by book id. The book in
   * the Library is never touched; other stories keep reading it as it is. */
  lorePatches: z.record(z.string(), LorePatch).default({}),
  createdAt: z.number().int(),
});
export type Story = z.infer<typeof Story>;
export type StoryInput = z.input<typeof Story>;

/** A story's openings with every scenario filled in (D-138): an opening saved before D-138 gets the story's old one. */
export function storyOpenings(story: Pick<Story, "openings" | "scenario">): Array<{ text: string; scenario: string }> {
  return story.openings.map((o) => ({ text: o.text, scenario: o.scenario ?? story.scenario }));
}

/** The scenario a story shows on its cards and sheets (D-138): the first opening's, else the old single one. */
export function storyScenario(story: Pick<Story, "openings" | "scenario">): string {
  const first = story.openings[0];
  return first ? (first.scenario ?? story.scenario) : story.scenario;
}

/** What a session's first message keeps about the opening it came from (D-138), in `Message.meta.opening`. */
export const OpeningMeta = z.object({
  /** Which of the story's openings (or the card narrator's greetings) it is; null = written for this chat only. */
  index: z.number().int().nullable(),
  /** This chat's copy of the opening's scenario: sent with every reply on the branches that start here. */
  scenario: z.string(),
});
export type OpeningMeta = z.infer<typeof OpeningMeta>;

/** The opening a first message came from, when it has one (chats made after D-138). */
export function openingMetaOf(first: { meta: Record<string, unknown> } | undefined): OpeningMeta | undefined {
  const r = OpeningMeta.safeParse(first?.meta?.opening);
  return r.success ? r.data : undefined;
}

/**
 * The scenario sent with a reply (D-138): the one kept by the first message of the branch on screen (so a swipe of the
 * first message changes it, and every branch below it keeps it), else the session's own (older chats, 1:1 chats).
 */
export function scenarioAt(session: Pick<Session, "scenario">, first: { meta: Record<string, unknown> } | undefined): string {
  return openingMetaOf(first)?.scenario ?? session.scenario;
}

/**
 * A Kit (round 3, D-036; the v1 "Kit" is back, Daniel 29/10): everything a story starts with — narrator, NPCs, cards,
 * scenario, openings, how you play and the setup — kept to start new stories from. Same shape as a Story without chats;
 * starting a story from a Kit COPIES it (BLUEPRINT §2.6), so changing the Kit later never changes those stories.
 */
export const Kit = Story;
export type Kit = Story;
export type KitInput = StoryInput;

export const Session = z.object({
  id: Id,
  title: z.string().default("Untitled session"),
  /** The story this session belongs to; null = a 1:1 chat (no story layer). */
  storyId: Id.nullable().default(null),
  userRole: UserRole.default("player"),
  /** Director mode can name a main character. */
  mainCharacterId: Id.nullable().default(null),
  scenario: z.string().default(""),
  cast: z.array(CastMember).default([]),
  /** NPCs from the Vault in this session (a chat's own; a story session adds them to the story's). */
  npcIds: z.array(Id).default([]),
  /** The session layer of the setup (BLUEPRINT §3). */
  setup: SetupLayer.default({}),
  createdAt: z.number().int(),
});
export type Session = z.infer<typeof Session>;
export type SessionInput = z.input<typeof Session>;

// ---------------------------------------------------------------- Messages (a tree)

export const Speaker = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user") }),
  z.object({ kind: z.literal("character"), characterId: Id }),
  z.object({ kind: z.literal("narrator") }),
  z.object({ kind: z.literal("system") }),
]);
export type Speaker = z.infer<typeof Speaker>;

/**
 * What the message IS (BLUEPRINT §2.3), separate from who wrote it:
 * user (in-character), direction (coauthor/director orders), reply (AI story text),
 * ooc (out of character note), event (system marker: "three days later", "chapter 2").
 */
export const MessageKind = z.enum(["user", "direction", "reply", "ooc", "event"]);
export type MessageKind = z.infer<typeof MessageKind>;

export const MessageVisibility = z.object({
  /** full: sent as is · summary: only through a summary/chapter · none: never sent. */
  ai: z.enum(["full", "summary", "none"]).default("full"),
  user: z.boolean().default(true),
});
export type MessageVisibility = z.infer<typeof MessageVisibility>;

export const Message = z.object({
  id: Id,
  sessionId: Id,
  /** null = first message of the session. Messages form a tree: branches and swipes are siblings. */
  parentId: Id.nullable(),
  speaker: Speaker,
  kind: MessageKind.default("reply"),
  visibility: MessageVisibility.default({ ai: "full", user: true }),
  content: z.string(),
  /** A thinking model's reasoning, kept apart: shown on demand, never sent back in the prompt. */
  reasoning: z.string().optional(),
  createdAt: z.number().int(),
  meta: z.record(z.string(), Json).default({}),
});
export type Message = z.infer<typeof Message>;
export type MessageInput = z.input<typeof Message>;

export const Branch = z.object({
  id: Id,
  sessionId: Id,
  name: z.string().default("main"),
  /** v1 only (first D-032 version): the first message only this branch had. Read once to find the branch's end. */
  headMessageId: Id.nullable(),
  /** The newest message of this branch (D-032 v2: a branch is a name and its end). null = empty chat or a v1 row. */
  endMessageId: Id.nullable().default(null),
});
export type Branch = z.infer<typeof Branch>;
export type BranchInput = z.input<typeof Branch>;
