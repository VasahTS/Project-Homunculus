// Homunculus 2 — where the story happens: stories, sessions, cast, messages. Author: CLAUDE.
// BLUEPRINT §2.2 and §2.3.
import { z } from "zod";
import { Id, Json, UserRole } from "./common.ts";
import { SetupLayer } from "./setup.ts";

/** A cast member: a character (with the variant chosen for this story) or the narrator. */
export const CastMember = z.object({
  characterId: Id.nullable(), // null = built-in narrator with no card
  variantId: Id.nullable().default(null), // null = the character's main version
  role: z.enum(["character", "narrator"]).default("character"),
  /** in_scene: whole sheet goes to the AI · offscreen: one line · off: nothing is sent. */
  presence: z.enum(["in_scene", "offscreen", "off"]).default("in_scene"),
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
  /** What the narrator is told: voice, rules, what to do and not do. {{user}} and {{char}} work. */
  instructions: z.string().default(""),
  /** Story style (BLUEPRINT §3 storyStyle): empty = not said. */
  style: z.object({
    pov: z.string().default(""),
    tense: z.string().default(""),
    length: z.string().default(""),
    tone: z.string().default(""),
  }).default({ pov: "", tense: "", length: "", tone: "" }),
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
  /** The premise, sent with every reply (SillyTavern's scenario). Copied into each new session. */
  scenario: z.string().default(""),
  /** Opening messages: a new session starts with one, the others are its swipes. Empty = the card narrator's greetings. */
  openings: z.array(z.string()).default([]),
  /** How the user takes part: plays a character, co-writes, or directs from outside the story. */
  userRole: UserRole.default("player"),
  /** The story layer of the setup (default → story → session). */
  setup: SetupLayer.default({}),
  createdAt: z.number().int(),
});
export type Story = z.infer<typeof Story>;
export type StoryInput = z.input<typeof Story>;

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
