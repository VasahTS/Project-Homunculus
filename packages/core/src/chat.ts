// Homunculus 2 — chat service: what the UI calls. Author: CLAUDE, 2026-10-23; v2 2026-10-27.
// Sessions, sending, swipes and edits. The turn itself lives in turn.ts (TurnPipeline).
import type { CastMemberInput, Message, Session, SetupLayer, StateDelta, UserRole } from "@homunculus/schemas";
import type { HomunculusCore } from "./core.ts";
import type { ConnectionConfig } from "./extensions.ts";
import type { SqlStore } from "./storage/store.ts";
import { applyRegexScripts } from "./regex.ts";
import { TurnPipeline, type TurnOptions, type TurnResult } from "./turn.ts";
import { effectiveCharacter } from "./variants.ts";

export type ChatServiceOptions = TurnOptions;

/** "Chat N" for a story's next chat: one more than the highest number used so far (Trash included). D-031. */
export function nextChatTitle(chats: Array<{ title: string }>): string {
  let n = chats.length;
  for (const c of chats) {
    const m = /(?:^Chat|, session) (\d+)$/.exec(c.title.trim());
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `Chat ${n + 1}`;
}

export interface NewSessionInput {
  title?: string;
  /** Shortcut for a simple cast: these characters, main versions, in scene. */
  characterIds?: string[];
  /** Full cast (variants, narrator, presence). Wins over characterIds. */
  cast?: CastMemberInput[];
  /** Start inside a story (D-029): its cast, scenario, role and openings are the defaults; its narrator replies. */
  storyId?: string;
  /** Which of the story's openings comes first (the others are its swipes). Default 0. */
  openingIndex?: number;
  /** A first message written for this chat only (wins over the story's openings; no swipes). Story chats only. */
  openingText?: string;
  /** The chat's own setup layer: what it changes from its story (D-031). */
  setup?: SetupLayer;
  /** NPCs from the Vault in this session (a chat's own; a story session adds them to the story's). */
  npcIds?: string[];
  userRole?: UserRole;
  scenario?: string;
}

export interface GenerateOptions {
  onToken?: (piece: string, soFar: string) => void;
  onReasoning?: (soFar: string) => void;
  /** The reply is saved; trackers and other "after" agents still run. */
  onReply?: (reply: Message) => void;
  signal?: AbortSignal;
  /** Every connection by profile id; the session's setup picks the story's and the agents' from here. */
  connections?: Record<string, ConnectionConfig>;
}

export class ChatService {
  readonly turns: TurnPipeline;
  private readonly newId: () => string;
  private readonly now: () => number;

  constructor(private readonly core: HomunculusCore, private readonly store: SqlStore, options: ChatServiceOptions = {}) {
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => Date.now());
    this.turns = new TurnPipeline(core, store, { ...options, newId: this.newId, now: this.now });
  }

  /**
   * Creates a session. In a story, the first message is the chosen opening (the other openings become its swipes),
   * written by the narrator. Otherwise it is the lead character's greeting.
   */
  async createSession(input: NewSessionInput): Promise<{ session: Session; firstMessage?: Message }> {
    const story = input.storyId ? await this.store.getStory(input.storyId) : undefined;
    if (input.storyId && !story) throw new Error(`Story "${input.storyId}" not found`);
    const cast = input.cast
      ?? (input.characterIds ? input.characterIds.map((characterId) => ({ characterId })) : story?.cast ?? []);
    const session = await this.store.saveSession({
      id: this.newId(),
      title: input.title?.trim() || (story ? nextChatTitle(await this.store.sessionsOfStory(story.id, true)) : "New session"),
      storyId: story?.id ?? null,
      userRole: input.userRole ?? story?.userRole ?? "player",
      scenario: input.scenario ?? story?.scenario ?? "",
      cast,
      npcIds: input.npcIds ?? [],
      setup: input.setup ?? {},
      createdAt: this.now(),
    });

    let openings: string[];
    let speaker: Message["speaker"];
    if (story) {
      const fromCard = story.narrator.kind === "card" ? await this.store.getCharacter(story.narrator.characterId) : undefined;
      const all = story.openings.length ? story.openings
        : fromCard ? effectiveCharacter(fromCard, story.narrator.kind === "card" ? story.narrator.variantId : null).firstMessages : [];
      const first = Math.min(Math.max(0, input.openingIndex ?? 0), Math.max(0, all.length - 1));
      openings = input.openingText?.trim() ? [input.openingText] : all.length ? [all[first]!, ...all.filter((_, i) => i !== first)] : [];
      speaker = { kind: "narrator" };
    } else {
      const narrator = session.cast.find((c) => c.role === "narrator");
      const leadMember = narrator ?? session.cast.find((c) => c.role === "character" && c.characterId);
      const leadRaw = leadMember?.characterId ? await this.store.getCharacter(leadMember.characterId) : undefined;
      const lead = leadRaw ? effectiveCharacter(leadRaw, leadMember?.variantId) : undefined;
      openings = lead?.firstMessages.slice(0, 1) ?? [];
      speaker = narrator || !lead ? { kind: "narrator" } : { kind: "character", characterId: lead.id };
    }
    openings = openings.filter((t) => t.trim());
    if (!openings.length) return { session };
    let firstMessage: Message | undefined;
    // regex scripts on first messages (D-060; SillyTavern: AI_OUTPUT when a chat starts)
    const { scripts, ctx } = await this.turns.regexForSession(session.id);
    for (const raw of openings) {
      const text = applyRegexScripts(scripts, raw, { target: "ai", mode: "saved" }, ctx);
      const m = await this.store.addMessage({ id: this.newId(), sessionId: session.id, parentId: null, speaker, content: text, createdAt: this.now(), meta: text !== raw ? { beforeRegex: raw } : {} });
      await this.core.events.emit("message.created", { sessionId: session.id, messageId: m.id });
      firstMessage ??= m;
    }
    return { session, firstMessage };
  }

  /** The user writes a message (as a child of `parentId`) and the AI answers it. */
  async send(sessionId: string, parentId: string | null, text: string, connection: ConnectionConfig, options: GenerateOptions = {}): Promise<TurnResult & { userMessage: Message }> {
    const r = await this.turns.run({ sessionId, parentId, userText: text, connection, ...options });
    return { ...r, userMessage: r.userMessage! };
  }

  /**
   * The AI writes a reply as a child of `parentId`. Calling it again on the same parent
   * creates a sibling: that is a swipe.
   */
  async generate(sessionId: string, parentId: string | null, connection: ConnectionConfig, options: GenerateOptions = {}): Promise<Message> {
    return (await this.turns.run({ sessionId, parentId, connection, ...options })).reply;
  }

  /**
   * "Make a Separate Chat" (D-032): a new chat with this chat's setup and the messages of one path (first message →
   * `endId`, no other versions), each with its world state, so the new chat goes on exactly from there.
   */
  async copyPathToNewChat(sessionId: string, endId: string, title: string): Promise<Session> {
    const from = await this.store.getSession(sessionId);
    if (!from) throw new Error(`Session "${sessionId}" not found`);
    const copy = await this.store.saveSession({ ...structuredClone(from), id: this.newId(), title, createdAt: this.now() });
    let parentId: string | null = null;
    for (const m of await this.store.pathTo(endId)) {
      const n = await this.store.addMessage({ ...structuredClone(m), id: this.newId(), sessionId: copy.id, parentId });
      const delta = await this.store.getDelta(m.id);
      if (delta) await this.store.setDelta(n.id, delta);
      const mine = await this.store.getUserDelta(m.id);
      if (mine) await this.store.setUserDelta(n.id, mine);
      const record = await this.store.getGenerationRecord(m.id);
      if (record) await this.store.saveGenerationRecord({ ...record, messageId: n.id, sessionId: copy.id });
      parentId = n.id;
    }
    return copy;
  }

  /** The user edits a message. The old text is kept as a revision; later records are marked out of date. */
  async editMessage(messageId: string, typed: string): Promise<void> {
    const m = await this.store.getMessage(messageId);
    if (!m) throw new Error(`Message "${messageId}" not found`);
    // regex scripts marked "run on edit" (D-060)
    const { scripts, ctx } = await this.turns.regexForSession(m.sessionId);
    const content = applyRegexScripts(scripts, typed, { target: m.speaker.kind === "user" ? "user" : "ai", mode: "saved", edit: true }, ctx);
    if (m.content === content) return;
    await this.store.addRevision({ id: this.newId(), messageId, author: { kind: "user" }, before: m.content, after: content, createdAt: this.now() });
    await this.store.updateMessageContent(messageId, content);
    await this.store.markStaleAfter(messageId);
    await this.core.events.emit("message.revised", { sessionId: m.sessionId, messageId });
  }

  /** Puts back the text a message had before regex scripts changed it when it was saved (D-060). */
  async undoRegex(messageId: string): Promise<void> {
    const m = await this.store.getMessage(messageId);
    const before = m?.meta.beforeRegex;
    if (!m || typeof before !== "string") return;
    await this.store.addRevision({ id: this.newId(), messageId, author: { kind: "user" }, before: m.content, after: before, createdAt: this.now() });
    await this.store.updateMessageContent(messageId, before);
    const { beforeRegex: _drop, ...meta } = m.meta;
    await this.store.updateMessage(messageId, { meta });
    await this.store.markStaleAfter(messageId);
    await this.core.events.emit("message.revised", { sessionId: m.sessionId, messageId });
  }

  /** The user changes world-state values at a message (Scene panel). Wins over trackers at that message. */
  async editState(messageId: string, delta: StateDelta): Promise<void> {
    const m = await this.store.getMessage(messageId);
    if (!m) throw new Error(`Message "${messageId}" not found`);
    await this.core.state.applyUserDelta(messageId, delta);
    await this.store.markStaleAfter(messageId);
    await this.core.events.emit("state.changed", { sessionId: m.sessionId, messageId, namespaces: Object.keys(delta) });
  }
}
