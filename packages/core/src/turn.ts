// Homunculus 2 — one turn, from the click to the end (BLUEPRINT §6). Author: CLAUDE, 2026-10-27.
//
//  1. user message (optional)       5. main reply streams ── "parallel" agents run alongside
//  2. resolve the layered setup     6. save reply + reasoning + generation record; take out inline blocks
//  3. "before" agents               7. "after" agents: rewrites/checks in order, then readers in parallel
//  4. build the prompt              8. other triggers (every N messages, state change), events
//
// Only step 5 is fatal: an agent failing never loses the reply.
import { AgentConfig, type AgentConfigInput } from "@homunculus/schemas";
import type { Character, GenerationType, Lorebook, LoreReport, LoreSettings, Message, MessageKind, Preset, PromptPart, RegexScript, Session, Story } from "@homunculus/schemas";
import { AgentRunner, type AgentEntry, type AgentOutcome, type DryRun, type RunRequest } from "./agents/runner.ts";
import { extractInline, inlineInstruction, parseAnswer } from "./agents/outputs.ts";
import { prepared } from "./agents/styles.ts";
import { noteInjections } from "./agents/feedback.ts";
import { isAbort } from "./connections.ts";
import type { HomunculusCore } from "./core.ts";
import type { ConnectionConfig } from "./extensions.ts";
import { scanLorebooks, type LoreScope } from "./lorebook.ts";
import { applyBasicMacros, DEFAULT_USER_NAME, expandMacros, type MacroContext } from "./macros.ts";
import { applyPresetOverride } from "./prompt-control.ts";
import { buildPrompt, DEFAULT_PRESET, presetParams, squashSystem, toTurns, type BuiltPrompt, type PromptInjection } from "./presets.ts";
import { applyRegexScripts, orderRegexScripts, regexKey, regexScriptsOf, type RegexRunContext } from "./regex.ts";

type RegexOwner = { regexScripts?: RegexScript[] | undefined; original?: unknown };

/** Connection choices for one read-only editor test. CODEX, D-053. */
export interface AgentPreviewOptions {
  connections?: Record<string, ConnectionConfig>;
  connectionOverride?: ConnectionConfig;
  signal?: AbortSignal;
}

/** The prompt plus what the lorebooks did for it. */
export type AssembledPrompt = BuiltPrompt & { lore?: LoreReport };

/** Where a lorebook of a session comes from (for the Prompt tab). */
export type LoreSource = "default" | "story" | "session" | "character" | "persona";

/** A lorebook as a session sees it: where it comes from and whether this session switched it off. */
export interface SessionLorebook { id: string; name: string; entries: number; from: LoreSource; on: boolean }

/** The result of "Try it" (a lorebook tested on a session's last messages, nothing saved). */
export interface LoreTryResult {
  report: LoreReport;
  /** The last messages, oldest first; `read` = inside the scan depth. */
  messages: Array<{ who: string; text: string; read: boolean }>;
  settings: LoreSettings;
}
import { resolveSetup, type ResolvedSetup } from "./setup.ts";
import { readStatePath } from "./state.ts";
import { trackerPeople, trackerSummary } from "./trackers.ts";
import type { SqlStore } from "./storage/store.ts";
import { characterNoteOf, effectiveCharacter, effectivePersona } from "./variants.ts";
import { castPart, narratorAsCharacter, SIMPLE_NARRATOR } from "./stories.ts";
import { applyLorePatch } from "./lore-versions.ts";
import { applyChapters, chapterRequest, chaptersOnPath, nextChapterSpan, parseChapter, type Chapter } from "./memory.ts";

export interface TurnOptions {
  newId?: () => string;
  now?: () => number;
  random?: () => number;
  /** Connections by id (setup.connectionId / agent overrides). Unknown ids fall back to the main connection. */
  connectionById?: (id: string) => ConnectionConfig | undefined;
}

export interface TurnRequest {
  sessionId: string;
  /** The message the new one answers (null = first message of the session). */
  parentId: string | null;
  /** When the user writes something. Without it, the AI writes a reply to `parentId`. */
  userText?: string;
  userKind?: MessageKind;
  /** Default: "swipe" if `parentId` already has a reply, else "normal". */
  type?: GenerationType;
  /** The connection to use when the setup picks none (or picks one that isn't in `connections`). */
  connection: ConnectionConfig;
  /** Every connection by profile id: the setup picks the story's and the agents' from here. */
  connections?: Record<string, ConnectionConfig>;
  signal?: AbortSignal;
  onToken?: (piece: string, soFar: string) => void;
  onReasoning?: (soFar: string) => void;
  /** The reply is saved; "after" agents (trackers…) still run. Lets the UI show the reply right away. */
  onReply?: (reply: Message) => void;
}

export interface TurnResult {
  userMessage?: Message;
  reply: Message;
  outcomes: AgentOutcome[];
}

export class TurnPipeline {
  readonly runner: AgentRunner;
  private readonly summaryRuns = new Map<string, Promise<void>>();
  private readonly chapterWrites = new Map<string, Promise<void>>();
  private readonly newId: () => string;
  private readonly now: () => number;

  constructor(private readonly core: HomunculusCore, private readonly store: SqlStore, private readonly options: TurnOptions = {}) {
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => Date.now());
    this.runner = new AgentRunner({
      core, store, newId: this.newId, now: this.now,
      random: options.random ?? Math.random,
      resolveConnection: (id, main) => (id ? options.connectionById?.(id) : undefined) ?? main,
      // what agents read about the story's people and the user (D-048)
      people: async (session) => {
        const story = session.storyId ? await this.store.getStory(session.storyId) : undefined;
        return { narrator: story ? await this.storyNarrator(story) : undefined, cast: await this.castFor(session) };
      },
      persona: async (_session, setup) => {
        const p = setup.personaId ? await this.store.personas.get(setup.personaId) : undefined;
        if (!p) return "";
        const e = effectivePersona(p, setup.personaVariantId);
        return e.description.trim() ? `${e.name}: ${applyBasicMacros(e.description, { char: e.name, user: e.name })}` : e.name;
      },
    });
  }

  /** The setup that applies to a session right now (default → story → session; a 1:1 chat has no story layer). */
  async setupFor(session: Session): Promise<ResolvedSetup> {
    const story = session.storyId ? await this.store.getStory(session.storyId) : undefined;
    return resolveSetup({ default: await this.store.getDefaultSetup(), story: story?.setup, session: session.setup });
  }

  async run(req: TurnRequest): Promise<TurnResult> {
    const session = await this.store.getSession(req.sessionId);
    if (!session) throw new Error(`Session "${req.sessionId}" not found`);
    const setup = await this.setupFor(session);
    const preset = await this.presetFor(setup.presetId, setup);
    const main = withPresetParams((setup.connectionId ? req.connections?.[setup.connectionId] : undefined) ?? req.connection, preset);
    if (!this.core.providers.get(main.providerId)) throw new Error(`No AI provider "${main.providerId}" is installed`);

    // 2. agents, names
    const entries = await this.runner.enabledAgents(setup);
    const owners = this.runner.owners(entries);
    const results = new Map<string, unknown>();
    const outcomes: AgentOutcome[] = [];
    const speaking = await this.pickSpeaker(session);
    const persona = setup.personaId ? await this.store.personas.get(setup.personaId) : undefined;
    const effPersona = persona ? effectivePersona(persona, setup.personaVariantId) : undefined;
    const names = {
      char: speaking.character?.name ?? "Narrator",
      user: effPersona?.name ?? DEFAULT_USER_NAME,
      bySpeaker: (m: Message) => this.nameOf(m, effPersona?.name ?? DEFAULT_USER_NAME),
    };
    this.charNames = new Map((await Promise.all(session.cast.map(async (c) => c.characterId ? this.store.getCharacter(c.characterId) : undefined)))
      .filter((c): c is NonNullable<typeof c> => !!c).map((c) => [c.id, effectiveCharacter(c, session.cast.find((x) => x.characterId === c.id)?.variantId).name]));

    // 1. the user's message; catch up trackers skipped on swipes
    let parentId = req.parentId;
    let userMessage: Message | undefined;
    if (parentId && !setup.trackersOnSwipe) await this.catchUpTrackers(session, setup, entries, owners, parentId, main, names, req.signal);
    if (req.userText !== undefined) {
      const role = (session.storyId ? (await this.store.getStory(session.storyId))?.userRole : undefined) ?? session.userRole;
      const kind = req.userKind ?? (role === "player" ? "user" : "direction");
      const scripts = await this.regexFor(preset, speaking.character, setup);
      const userText = applyRegexScripts(scripts, req.userText, { target: "user", mode: "saved" }, this.regexCtx(names));
      userMessage = await this.addMessage(session.id, parentId, { kind: "user" }, userText, { kind, ...(userText !== req.userText ? { meta: { beforeRegex: req.userText } } : {}) });
      parentId = userMessage.id;
    }
    const siblings = parentId ? await this.store.childrenOf(session.id, parentId) : await this.store.childrenOf(session.id, null);
    const type: GenerationType = req.type ?? (siblings.some((m) => m.speaker.kind !== "user") ? "swipe" : "normal");
    const seed = parentId ?? session.id;
    const base = { session, setup, generationType: type, mainConnection: main, connections: req.connections, names, seed, results, signal: req.signal };

    // 3. before
    const injections: PromptInjection[] = [];
    let speakerOverride: string | undefined;
    if (parentId) {
      const before: RunRequest = { ...base, trigger: "turn.before", messageId: parentId, text: userMessage?.content ?? "" };
      const picked = await this.runner.select(entries, before, (a) => isTurn(a, "before") && a.runMode !== "inline"
        && (a.output !== "intercept" || !!userMessage));
      for (const o of await this.runner.run(picked, before, owners)) {
        outcomes.push(o);
        if (o.kind === "inject") injections.push(injectionOf(o));
        if (o.kind === "speaker") speakerOverride = String(o.output);
      }
      if (userMessage) userMessage = (await this.store.getMessage(userMessage.id)) ?? userMessage;
      // note agents' latest notes on this branch go back to the story's AI (D-057)
      injections.push(...await noteInjections(this.store, entries.map((e) => e.config), await this.store.pathTo(parentId)).catch(() => []));
    }
    const chosen = speakerOverride ? (await this.speakerByName(session, speakerOverride)) ?? speaking : speaking;
    if (chosen !== speaking) names.char = chosen.character?.name ?? "Narrator";

    // 4. prompt
    const history = parentId ? await this.store.pathTo(parentId) : [];
    const inlineAgents = (await this.runner.select(entries, { ...base, trigger: "turn.after", messageId: parentId ?? "", text: "" },
      (a) => isTurn(a, "after") && a.runMode === "inline")).filter((e) => !(type === "swipe" && !setup.trackersOnSwipe && e.config.output === "state"));
    const built = await this.assemble({ session, setup, entries, preset, parentId, history, character: chosen.character, persona: effPersona,
      names, injections, inlineAgents, type, main, seed });
    const prompt = built.parts;

    // 5. main reply, with "parallel" agents alongside
    await this.core.events.emit("generation.started", { sessionId: session.id, parentId });
    const started = this.now();
    const parallel = parentId
      ? (async () => {
        const preq: RunRequest = { ...base, trigger: "turn.parallel", messageId: parentId, text: userMessage?.content ?? "" };
        const picked = await this.runner.select(entries, preq, (a) => isTurn(a, "parallel") && a.runMode !== "inline");
        return this.runner.run(picked, preq, owners);
      })()
      : Promise.resolve([] as AgentOutcome[]);
    let text = "";
    let reasoning = "";
    const usage: { tokensIn?: number; tokensOut?: number; cost?: number } = {};
    try {
      for await (const chunk of this.core.connections.stream(main, toTurns(preset.squashSystem ? squashSystem(prompt) : prompt), req.signal)) {
        if (typeof chunk === "string") { text += chunk; req.onToken?.(chunk, text); }
        else if ("reasoning" in chunk) { reasoning += chunk.reasoning; req.onReasoning?.(reasoning); }
        else if ("usage" in chunk) Object.assign(usage, chunk.usage);
      }
    } catch (error) {
      const reason = isAbort(error, req.signal) ? "Stopped" : error instanceof Error ? error.message : String(error);
      if (text.trim()) {
        // Keep what arrived, marked as incomplete, so nothing the user saw is lost.
        await this.addMessage(session.id, parentId, chosen.speaker, text, {
          meta: { incomplete: true, error: reason }, reasoning: reasoning || undefined,
        });
      }
      await parallel.catch(() => []);
      await this.core.events.emit("generation.failed", { sessionId: session.id, parentId, reason });
      throw error;
    }
    outcomes.push(...(await parallel));

    // 6. save the reply; take out inline blocks
    let clean = text;
    const inlineAnswers: Array<{ entry: AgentEntry; block: string }> = [];
    for (const e of inlineAgents) {
      const r = extractInline(clean, e.config);
      clean = r.text;
      if (r.block !== null) inlineAnswers.push({ entry: e, block: r.block });
    }
    // regex scripts that change the saved reply (D-060; SillyTavern: AI_OUTPUT / REASONING when a reply arrives)
    const scripts = await this.regexFor(preset, speaking.character, setup);
    const beforeRegex = clean;
    clean = applyRegexScripts(scripts, clean, { target: "ai", mode: "saved" }, this.regexCtx(names, chosen.speaker.kind === "character" ? names.char : undefined));
    if (reasoning) reasoning = applyRegexScripts(scripts, reasoning, { target: "reasoning", mode: "saved" }, this.regexCtx(names));
    let reply = await this.addMessage(session.id, parentId, chosen.speaker, clean, { reasoning: reasoning || undefined, ...(clean !== beforeRegex ? { meta: { beforeRegex } } : {}) });
    await this.store.saveGenerationRecord({
      messageId: reply.id, sessionId: session.id, generationType: type, providerId: main.providerId, model: main.model,
      ...(main.profileId ? { connectionId: main.profileId } : {}),
      presetId: preset.id, budget: built.budget, ...(built.notes.length ? { promptNotes: built.notes } : {}),
      ...(built.lore ? { lore: built.lore } : {}),
      params: { ...(main.params ?? {}) }, prompt, ...usage, durationMs: Math.max(0, this.now() - started), createdAt: this.now(),
      agents: { before: outcomes.map((o) => o.agentId) },
      who: {
        personaId: persona?.id ?? null,
        personaVariantId: persona && persona.variants.some((v) => v.id === setup.personaVariantId) ? setup.personaVariantId : null,
        cast: session.cast.map((c) => ({ characterId: c.characterId, variantId: c.variantId })),
      },
    });
    await this.core.events.emit("generation.finished", { sessionId: session.id, messageId: reply.id });
    req.onReply?.(reply);

    // 7. after
    const after: RunRequest = { ...base, trigger: "turn.after", messageId: reply.id, text: reply.content };
    for (const { entry, block } of inlineAnswers) {
      let answer: unknown;
      try { answer = parseAnswer(entry.config.output, block); } catch (e) { answer = { invalid: String(e) }; }
      const o = await this.runner.runOne(entry, after, owners, { answer });
      if (o) outcomes.push(o);
    }
    const afterAgents = await this.runner.select(entries, after, (a) => isTurn(a, "after") && a.runMode !== "inline"
      && !(type === "swipe" && !setup.trackersOnSwipe && a.output === "state"));
    const afterOutcomes = await this.runner.run(afterAgents, after, owners);
    outcomes.push(...afterOutcomes);
    reply = await this.regenerateOnFailedCheck(reply, afterOutcomes, after, prompt, main, req) ?? reply;

    // 8. other triggers
    if (!req.signal?.aborted) outcomes.push(...(await this.otherTriggers(entries, owners, { ...base, trigger: "", messageId: reply.id, text: reply.content }, parentId)));
    // 9. memory (D-054): close a chapter when enough old messages piled up. A failure never fails the turn.
    if (setup.memory.on && !req.signal?.aborted) {
      await this.summarize(session, setup, reply.id, main, req.connections, { min: setup.memory.every, signal: req.signal }).catch((e) =>
        void this.core.events.emit("core.error", { source: "memory", message: e instanceof Error ? e.message : String(e) }));
    }
    await this.core.events.emit("turn.finished", { sessionId: session.id, messageId: reply.id });
    reply = (await this.store.getMessage(reply.id)) ?? reply;
    return { userMessage, reply, outcomes };
  }

  // ---------------------------------------------------------------- memory (D-054)

  /** A session's chapters (all branches). */
  async chapters(sessionId: string): Promise<Chapter[]> {
    return (await this.store.getAppSetting<Chapter[]>(`memory.chapters:${sessionId}`)) ?? [];
  }

  async saveChapters(sessionId: string, chapters: Chapter[] | ((latest: Chapter[]) => Chapter[])): Promise<void> {
    // Read-modify-write edits share the summary commit queue, so they cannot overwrite another edit or new chapter.
    await this.serializeMemory(this.chapterWrites, sessionId, async () => {
      const next = typeof chapters === "function" ? chapters(await this.chapters(sessionId)) : chapters;
      await this.store.setAppSetting(`memory.chapters:${sessionId}`, next);
    });
  }

  /** Retain affected summaries, including hand edits, but send the corrected raw messages instead. CODEX. */
  async invalidateMemoryAfter(message: Message): Promise<void> {
    await this.serializeMemory(this.chapterWrites, message.sessionId, async () => {
      const chapters = await this.chapters(message.sessionId);
      let changed = false;
      const next: Chapter[] = [];
      for (const c of chapters) {
        // Later chapters may have read an earlier chapter for continuity. Other branches remain independent.
        const end = !c.off ? await this.store.getMessage(c.toId) : undefined;
        const affected = end && (await this.store.pathTo(end.id)).some(m => m.id === message.id);
        if (affected) changed = true;
        next.push(affected ? { ...c, off: true } : c);
      }
      if (changed) await this.store.setAppSetting(`memory.chapters:${message.sessionId}`, next);
    });
  }

  /** Per-session queues: model calls serialize, while short chapter writes never wait for a model. CODEX. */
  private serializeMemory<T>(queue: Map<string, Promise<void>>, sessionId: string, run: () => Promise<T>): Promise<T> {
    const result = (queue.get(sessionId) ?? Promise.resolve()).then(run);
    const tail = result.then(() => {}, () => {});
    queue.set(sessionId, tail);
    void tail.then(() => { if (queue.get(sessionId) === tail) queue.delete(sessionId); });
    return result;
  }

  /** What memory looks like at a message: the chapters on its path and how many messages wait for the next one. */
  async memoryAt(sessionId: string, messageId: string | null): Promise<{ chapters: Chapter[]; waiting: number; every: number; keep: number; on: boolean }> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);
    const setup = await this.setupFor(session);
    const path = messageId ? await this.store.pathTo(messageId) : [];
    if (path.some(m => m.sessionId !== sessionId)) throw new Error("Memory message belongs to another session");
    const all = await this.chapters(sessionId);
    return {
      chapters: chaptersOnPath(path, all).map((x) => x.chapter),
      waiting: nextChapterSpan(path, all, setup.memory, 1).length,
      ...setup.memory,
    };
  }

  /**
   * Writes the next chapter at this message's path when at least `min` old messages wait (Summarize now: min 2).
   * Uses the agents' connection. Returns the new chapter, or undefined when there was not enough to summarize.
   */
  async summarize(session: Session, setup: ResolvedSetup, messageId: string, main: ConnectionConfig,
    connections: Record<string, ConnectionConfig> | undefined, opts: { min: number; signal?: AbortSignal | undefined }): Promise<Chapter | undefined> {
    return this.serializeMemory(this.summaryRuns, session.id, () => this.summarizeChapter(session, setup, messageId, main, connections, opts));
  }

  private async summarizeChapter(session: Session, setup: ResolvedSetup, messageId: string, main: ConnectionConfig,
    connections: Record<string, ConnectionConfig> | undefined, opts: { min: number; signal?: AbortSignal | undefined }): Promise<Chapter | undefined> {
    opts.signal?.throwIfAborted();
    const path = await this.store.pathTo(messageId);
    if (path.some(m => m.sessionId !== session.id)) throw new Error("Memory message belongs to another session");
    const all = await this.chapters(session.id);
    const span = nextChapterSpan(path, all, setup.memory, opts.min).slice(0, Math.max(opts.min, setup.memory.every));
    if (!span.length) return undefined;
    await this.loadCharNames(session);
    const persona = setup.personaId ? await this.store.personas.get(setup.personaId) : undefined;
    const user = persona ? effectivePersona(persona, setup.personaVariantId).name : DEFAULT_USER_NAME;
    const on = chaptersOnPath(path, all).filter(x => !x.chapter.off);
    const previous = on[on.length - 1]?.chapter;
    const id = setup.agentConnectionId;
    const conn = (id ? connections?.[id] ?? this.options.connectionById?.(id) : undefined) ?? main;
    const answer = await this.core.connections.complete(conn, chapterRequest(span, previous, (m) => this.nameOf(m, user)), { signal: opts.signal, maxTokens: 1200 });
    const parsed = parseChapter(answer.text);
    if (!parsed.summary.trim()) throw new Error("The summary came back empty");
    const chapter: Chapter = {
      id: this.newId(), fromId: span[0]!.id, toId: span[span.length - 1]!.id, title: parsed.title, summary: parsed.summary,
      messageCount: span.length, createdAt: this.now(),
    };
    return this.serializeMemory(this.chapterWrites, session.id, async () => {
      opts.signal?.throwIfAborted();
      // A deleted branch endpoint has no remaining destination for this answer. CODEX, T-001.
      if (!await this.store.getMessage(messageId)) return undefined;
      const freshPath = await this.store.pathTo(messageId);
      const latest = await this.chapters(session.id);
      const freshSpan = nextChapterSpan(freshPath, latest, setup.memory, opts.min).slice(0, Math.max(opts.min, setup.memory.every));
      // Revalidate the exact readable range and continuity input after edits, deletes and other chapter writes.
      if (freshSpan.length !== span.length || span.some((m, i) => {
        const fresh = freshSpan[i]!;
        return fresh.id !== m.id || fresh.content !== m.content || JSON.stringify(fresh.speaker) !== JSON.stringify(m.speaker);
      })) return undefined;
      const freshPrevious = chaptersOnPath(freshPath, latest).filter(x => !x.chapter.off).at(-1)?.chapter;
      if (freshPrevious?.id !== previous?.id || freshPrevious?.title !== previous?.title || freshPrevious?.summary !== previous?.summary) return undefined;
      await this.store.setAppSetting(`memory.chapters:${session.id}`, [...latest, chapter]);
      return chapter;
    });
  }

  /** Summarize now (the Memory group's button): a chapter from whatever waits, if at least 2 messages. */
  async summarizeNow(sessionId: string, messageId: string, connection: ConnectionConfig, connections?: Record<string, ConnectionConfig>, signal?: AbortSignal): Promise<Chapter | undefined> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);
    const setup = await this.setupFor(session);
    const main = (setup.connectionId ? connections?.[setup.connectionId] : undefined) ?? connection;
    return this.summarize(session, setup, messageId, main, connections, { min: 2, signal });
  }

  /**
   * Compare (D-048): runs one agent on a message with each of these connections, the same input for all, and changes
   * nothing. The first entry can be the agent's own connection (pass undefined).
   */
  async compareAgent(sessionId: string, agentId: string, messageId: string, connection: ConnectionConfig,
    candidates: Array<ConnectionConfig | undefined>, connections?: Record<string, ConnectionConfig>, signal?: AbortSignal): Promise<DryRun[]> {
    const builtin = this.core.agents.get(agentId);
    const config = builtin?.config ?? await this.store.agentConfigs.get(agentId);
    if (!config) throw new Error('Agent "' + agentId + '" is not installed');
    const req = await this.agentPreviewRequest(sessionId, config, messageId, connection, connections, signal);
    return Promise.all(candidates.map((candidate) => this.runner.dryRun(builtin ?? { config }, req, candidate)));
  }

  /** Try the current editor draft without saving it, applying outputs, or running dependencies. CODEX, D-053. */
  async previewAgent(sessionId: string, input: AgentConfigInput, messageId: string, connection: ConnectionConfig,
    options: AgentPreviewOptions = {}): Promise<DryRun> {
    const config = AgentConfig.parse(input);
    if (config.runMode !== "text" && config.runMode !== "separate") {
      throw new Error("This mode cannot be previewed on its own. Use a text or separate-call agent.");
    }
    if (config.tools.length) throw new Error("Standalone tests with tools are not supported yet.");
    const req = await this.agentPreviewRequest(sessionId, config, messageId, connection, options.connections, options.signal);
    if (config.runMode !== "text") {
      const missing = config.input.readsAgents.filter((id) => !req.results.has(id));
      if (missing.length) throw new Error("No saved result for these dependencies on this message: " + missing.join(", ") + ". Choose another message or run them in the chat first.");
      if (config.output === "proposal" && config.proposal?.target === "lorebook" && !req.session.storyId) {
        throw new Error("A lorebook keeper needs a chat inside a story for this test.");
      }
    }
    return this.runner.dryRun({ config }, req, options.connectionOverride);
  }

  /** Shared read-only context for Compare and the editor preview. CODEX, D-053. */
  private async agentPreviewRequest(sessionId: string, config: AgentConfig, messageId: string, connection: ConnectionConfig,
    connections?: Record<string, ConnectionConfig>, signal?: AbortSignal): Promise<RunRequest> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new Error('Session "' + sessionId + '" not found');
    const message = await this.store.getMessage(messageId);
    if (!message) throw new Error('Message "' + messageId + '" not found');
    if (message.sessionId !== sessionId) throw new Error('Message "' + messageId + '" does not belong to session "' + sessionId + '"');
    const setup = await this.setupFor(session);
    const speaking = await this.speakerFor(session);
    const persona = setup.personaId ? await this.store.personas.get(setup.personaId) : undefined;
    const user = (persona ? effectivePersona(persona, setup.personaVariantId).name : undefined) ?? DEFAULT_USER_NAME;
    // Freeze names for this context; another concurrent chat must not change its speaker labels.
    const narrator = speaking.speaker.kind === "narrator" ? speaking.character?.name ?? "Narrator" : "Narrator";
    const path = await this.store.pathTo(messageId);
    const ids = new Set([...session.cast.flatMap((member) => member.characterId ? [member.characterId] : []),
      ...path.flatMap((m) => m.speaker.kind === "character" ? [m.speaker.characterId] : [])]);
    const cards = new Map<string, Character>();
    for (const id of ids) {
      const raw = await this.store.getCharacter(id);
      const member = session.cast.find((entry) => entry.characterId === id);
      if (raw) cards.set(id, effectiveCharacter(raw, member?.variantId));
    }
    const namesById = new Map([...cards].map(([id, card]) => [id, card.name]));
    const character = message.speaker.kind === "character" ? cards.get(message.speaker.characterId) ?? speaking.character : speaking.character;
    const names = { char: character?.name ?? "Narrator", user, bySpeaker: (m: Message) =>
      m.speaker.kind === "user" ? user : m.speaker.kind === "character" ? namesById.get(m.speaker.characterId) ?? "Character"
        : m.speaker.kind === "narrator" ? narrator : "System" };
    const main = (setup.connectionId ? connections?.[setup.connectionId] : undefined) ?? connection;
    const trigger = config.output === "inject" || config.output === "intercept"
      || config.triggers.some((t) => t.on === "turn" && t.phase === "before") ? "turn.before" : "turn.after";
    const runs = (await this.store.listAgentRuns(messageId)).filter((run) => run.status === "ok").sort((a, b) => a.startedAt - b.startedAt);
    const results = new Map(runs.map((run) => [run.agentId, run.output as unknown]));
    return { session, setup, trigger, generationType: "normal", messageId, text: message.content, mainConnection: main,
      connections, names, seed: message.parentId ?? sessionId, results, signal };
  }

  /** Runs one agent by hand on a message (the "run now" button). */
  async runManual(sessionId: string, agentId: string, messageId: string, connection: ConnectionConfig, signal?: AbortSignal,
    connections?: Record<string, ConnectionConfig>, options: { direction?: string } = {}): Promise<AgentOutcome | undefined> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);
    const setup = await this.setupFor(session);
    const entries = await this.runner.enabledAgents({ ...setup, agents: [...new Set([...setup.agents, agentId])] });
    const entry = entries.find((e) => e.config.id === agentId);
    if (!entry) throw new Error(`Agent "${agentId}" is not installed`);
    const m = await this.store.getMessage(messageId);
    if (!m) throw new Error(`Message "${messageId}" not found`);
    // Manual calls and comparisons must never cross chat boundaries. CODEX, D-051.
    if (m.sessionId !== sessionId) throw new Error(`Message "${messageId}" does not belong to session "${sessionId}"`);
    const speaking = await this.pickSpeaker(session);
    const persona = setup.personaId ? await this.store.personas.get(setup.personaId) : undefined;
    const user = (persona ? effectivePersona(persona, setup.personaVariantId).name : undefined) ?? DEFAULT_USER_NAME;
    const names = { char: speaking.character?.name ?? "Narrator", user, bySpeaker: (x: Message) => this.nameOf(x, user) };
    const main = (setup.connectionId ? connections?.[setup.connectionId] : undefined) ?? connection;
    return this.runner.runOne(entry, {
      session, setup, trigger: "manual", generationType: "normal", messageId, text: m.content, mainConnection: main, connections,
      names, seed: m.parentId ?? sessionId, results: new Map(), signal, ...(options.direction?.trim() ? { direction: options.direction } : {}),
    }, this.runner.owners(entries));
  }

  /**
   * Builds the prompt the next reply would get, without sending anything (the "Preview Prompt" button).
   * `userText` = what is in the message box (shown as the last message). Agents that run before the reply
   * are not run, so what they would add is missing (the notes say so).
   */
  async previewPrompt(sessionId: string, parentId: string | null, connection: ConnectionConfig, options: { connections?: Record<string, ConnectionConfig>; userText?: string } = {}): Promise<AssembledPrompt & { presetId: string; presetName: string; model: string; sent: number }> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);
    const setup = await this.setupFor(session);
    const preset = await this.presetFor(setup.presetId, setup);
    const main = withPresetParams((setup.connectionId ? options.connections?.[setup.connectionId] : undefined) ?? connection, preset);
    const entries = await this.runner.enabledAgents(setup);
    const speaking = await this.pickSpeaker(session);
    const persona = setup.personaId ? await this.store.personas.get(setup.personaId) : undefined;
    const effPersona = persona ? effectivePersona(persona, setup.personaVariantId) : undefined;
    const user = effPersona?.name ?? DEFAULT_USER_NAME;
    const names = { char: speaking.character?.name ?? "Narrator", user, bySpeaker: (m: Message) => this.nameOf(m, user) };
    let history = parentId ? await this.store.pathTo(parentId) : [];
    if (options.userText?.trim()) {
      history = [...history, { id: "preview", sessionId, parentId, speaker: { kind: "user" }, kind: "user", visibility: { ai: "full", user: true }, content: options.userText, createdAt: this.now(), meta: {} }];
    }
    const base: RunRequest = { session, setup, generationType: "normal", mainConnection: main, connections: options.connections, names, seed: parentId ?? session.id,
      results: new Map(), trigger: "turn.after", messageId: parentId ?? "", text: "" };
    const inlineAgents = await this.runner.select(entries, base, (a) => isTurn(a, "after") && a.runMode === "inline");
    // agents that only add their own text cost nothing: the preview shows them (D-047); the others would need an AI call
    const textAgents = await this.runner.select(entries, { ...base, trigger: "turn.before" }, (a) => isTurn(a, "before") && a.runMode === "text" && a.output === "inject");
    const injections: PromptInjection[] = [];
    for (const e of textAgents) injections.push(injectionOf({ agentId: e.config.id, kind: "inject", config: e.config, output: await this.runner.textAnswer(prepared(e.config, setup), { ...base, text: options.userText ?? "" }) }));
    // notes already written cost nothing either (D-057)
    if (parentId) injections.push(...await noteInjections(this.store, entries.map((e) => e.config), await this.store.pathTo(parentId)).catch(() => []));
    const built = await this.assemble({ session, setup, entries, preset, parentId, history, character: speaking.character, persona: effPersona,
      names, injections, inlineAgents, type: "normal", main, seed: parentId ?? session.id });
    const before = entries.filter((e) => isTurn(e.config, "before") && e.config.runMode !== "inline" && !(e.config.runMode === "text" && e.config.output === "inject"));
    if (before.length) built.notes.push(`Not in this preview: what ${before.map((e) => e.config.name).join(", ")} would add (they run just before the reply).`);
    const sent = (preset.squashSystem ? squashSystem(built.parts) : built.parts).length;
    return { ...built, presetId: preset.id, presetName: preset.name, model: main.model, sent };
  }

  /** The lorebooks a session gets, where each comes from, and which ones this session switched off (Prompt tab). */
  async lorebooksOf(sessionId: string): Promise<SessionLorebook[]> {
    const session = await this.store.getSession(sessionId);
    if (!session) return [];
    const story = session.storyId ? await this.store.getStory(session.storyId) : undefined;
    const own = session.setup.lorebooks;
    const above = resolveSetup({ default: await this.store.getDefaultSetup(), story: story?.setup });
    const setup = await this.setupFor(session);
    const persona = setup.personaId ? await this.store.personas.get(setup.personaId) : undefined;
    const speaking = await this.pickSpeaker(session);
    const rows: Array<{ id: string; from: LoreSource }> = [];
    const push = (id: string, from: LoreSource) => { if (!rows.some((r) => r.id === id)) rows.push({ id, from }); };
    for (const id of above.lorebooks) push(id, above.sources[`lorebooks:${id}`] === "story" ? "story" : "default");
    for (const id of speaking.character?.lorebookIds ?? []) push(id, "character");
    for (const id of persona ? effectivePersona(persona, setup.personaVariantId).lorebookIds : []) push(id, "persona");
    for (const id of [...(own?.add ?? []), ...(own?.remove ?? [])]) push(id, "session");
    const off = new Set(own?.remove ?? []);
    const books = new Map((await this.store.lorebooksForUse(rows.map((r) => r.id))).map((b) => [b.id, b]));
    return rows.flatMap((r) => {
      const b = books.get(r.id);
      return b ? [{ id: b.id, name: b.name, entries: b.entries.length, from: r.from, on: !off.has(b.id) }] : [];
    });
  }

  /**
   * "Try it": runs one lorebook (saved or not) on a session's newest messages, as the next reply would see it
   * (the session's character, persona, world state, timers and the app's reading settings). Saves nothing.
   * `text` = extra lines typed by the user, read as the newest message.
   */
  async tryLorebook(book: Lorebook, sessionId: string | null, options: { text?: string } = {}): Promise<LoreTryResult> {
    const settings = await this.store.getLoreSettings();
    const session = sessionId ? await this.store.getSession(sessionId) : undefined;
    const now = this.now();
    const extra = (sid: string, parentId: string | null): Message[] => options.text?.trim()
      ? [{ id: "try", sessionId: sid, parentId, speaker: { kind: "user" }, kind: "user", visibility: { ai: "full", user: true }, content: options.text, createdAt: now, meta: {} }]
      : [];
    if (!session) {
      const history = extra("try", null);
      const r = scanLorebooks({ books: [{ book, scope: "global" }], chat: history.map((m) => (settings.includeNames ? `User: ${m.content}` : m.content)), chatLength: history.length, trigger: "normal", settings });
      return { report: r.report, messages: history.map((m) => ({ who: "User", text: m.content, read: true })), settings };
    }
    const setup = await this.setupFor(session);
    const preset = await this.presetFor(setup.presetId, setup);
    const speaking = await this.pickSpeaker(session);
    const persona = setup.personaId ? await this.store.personas.get(setup.personaId) : undefined;
    const effPersona = persona ? effectivePersona(persona, setup.personaVariantId) : undefined;
    await this.loadCharNames(session);
    const user = effPersona?.name ?? DEFAULT_USER_NAME;
    const names = { char: speaking.character?.name ?? "Narrator", user, bySpeaker: (m: Message) => this.nameOf(m, user) };
    const latest = await this.store.latestMessage(session.id);
    const history = [...(latest ? await this.store.pathTo(latest.id) : []), ...extra(session.id, latest?.id ?? null)];
    const state = await this.core.state.resolve(session.id, latest?.id ?? null);
    const lore = await this.scanLore({
      session, setup, preset, history, type: "normal", character: speaking.character, persona: effPersona, names, state,
      macroCtx: { char: names.char, user, description: speaking.character?.description ?? "", personality: speaking.character?.personality ?? "",
        scenario: session.scenario.trim() || speaking.character?.scenario || "", persona: effPersona?.description ?? "",
        state: state as Record<string, Record<string, unknown>>, vars: new Map() },
      only: [{ book, scope: "global" }],
    });
    const shown = history.filter((m) => m.visibility.ai === "full" && m.kind !== "event");
    const deepest = Math.max(settings.scanDepth, ...book.entries.map((e) => e.scanDepth ?? 0));
    const messages = shown.slice(-(Math.max(deepest, settings.scanDepth) + 1)).map((m, i, all) => ({
      who: names.bySpeaker(m), text: applyBasicMacros(m.content, { char: names.char, user }), read: all.length - i <= settings.scanDepth,
    }));
    return { report: lore?.report ?? { activated: [], skipped: [], timers: { sticky: {}, cooldown: {} }, books: [] }, messages, settings };
  }

  // ------------------------------------------------------------ helpers

  /**
   * Regex scripts that apply (D-060): global, then the preset's, then the speaking character's. Scripts that came
   * with a preset or a card run only once the user allowed them (`approveRegex`); a story or chat can switch any off.
   */
  async regexFor(preset: Preset, character: RegexOwner | undefined, setup?: ResolvedSetup): Promise<RegexScript[]> {
    const approved = await this.store.getApprovedRegex();
    const allowed = (xs: RegexScript[]) => xs.filter((x) => approved.has(regexKey(x)));
    const off = new Set(setup?.regexOff ?? []);
    return orderRegexScripts({ global: await this.store.getGlobalRegex(), preset: allowed(regexScriptsOf(preset)), character: allowed(regexScriptsOf(character)) })
      .filter((x) => !off.has(x.id));
  }

  /** Every allowed script for a chat, where it comes from and whether it runs here (the Prompt tab, D-060). */
  async regexRows(sessionId: string): Promise<Array<{ script: RegexScript; from: "global" | "preset" | "character"; on: boolean; offAbove: boolean }>> {
    const session = await this.store.getSession(sessionId);
    if (!session) return [];
    const setup = await this.setupFor(session);
    const story = session.storyId ? await this.store.getStory(session.storyId) : undefined;
    const above = new Set(resolveSetup({ default: await this.store.getDefaultSetup(), story: story?.setup }).regexOff);
    const preset = await this.presetFor(setup.presetId, setup);
    const speaking = await this.pickSpeaker(session);
    const approved = await this.store.getApprovedRegex();
    const off = new Set(setup.regexOff);
    const rows = (xs: RegexScript[], from: "global" | "preset" | "character") => xs.filter((x) => x.on).map((script) => ({ script, from, on: !off.has(script.id), offAbove: above.has(script.id) }));
    const ok = (xs: RegexScript[]) => xs.filter((x) => approved.has(regexKey(x)));
    return [...rows(await this.store.getGlobalRegex(), "global"), ...rows(ok(regexScriptsOf(preset)), "preset"), ...rows(ok(regexScriptsOf(speaking.character)), "character")];
  }

  /** Scripts that came with this chat's preset or speaking character and wait for the user's OK (on ones only). */
  async regexWaiting(sessionId: string): Promise<Array<{ owner: "preset" | "character"; ownerId: string; ownerName: string; scripts: RegexScript[] }>> {
    const session = await this.store.getSession(sessionId);
    if (!session) return [];
    const setup = await this.setupFor(session);
    const preset = await this.presetFor(setup.presetId, setup);
    const speaking = await this.pickSpeaker(session);
    const approved = await this.store.getApprovedRegex();
    const out: Array<{ owner: "preset" | "character"; ownerId: string; ownerName: string; scripts: RegexScript[] }> = [];
    const waiting = (xs: RegexScript[]) => xs.filter((x) => x.on && x.find && !approved.has(regexKey(x)));
    const p = waiting(regexScriptsOf(preset));
    if (p.length) out.push({ owner: "preset", ownerId: preset.id, ownerName: preset.name, scripts: p });
    const c = speaking.character ? waiting(regexScriptsOf(speaking.character)) : [];
    if (c.length && speaking.character) out.push({ owner: "character", ownerId: speaking.character.id, ownerName: speaking.character.name, scripts: c });
    return out;
  }

  /** The scripts and macros a session's screen uses to draw messages and save edits (display / edit, D-060). */
  async regexForSession(sessionId: string): Promise<{ scripts: RegexScript[]; ctx: RegexRunContext }> {
    const session = await this.store.getSession(sessionId);
    if (!session) return { scripts: [], ctx: { macros: (t) => t } };
    const setup = await this.setupFor(session);
    const preset = await this.presetFor(setup.presetId, setup);
    const speaking = await this.pickSpeaker(session);
    const persona = setup.personaId ? await this.store.personas.get(setup.personaId) : undefined;
    const user = persona ? effectivePersona(persona, setup.personaVariantId).name : DEFAULT_USER_NAME;
    return { scripts: await this.regexFor(preset, speaking.character, setup), ctx: this.regexCtx({ char: speaking.character?.name ?? "Narrator", user }) };
  }

  private regexCtx(names: { char: string; user: string }, char?: string): RegexRunContext {
    const base: MacroContext = { char: names.char, user: names.user, vars: new Map() };
    return { macros: (t, override) => expandMacros(t, override ? { ...base, char: override } : base), ...(char ? { char } : {}) };
  }

  private async loadCharNames(session: Session) {
    this.charNames = new Map((await Promise.all(session.cast.map(async (c) => c.characterId ? this.store.getCharacter(c.characterId) : undefined)))
      .filter((c): c is NonNullable<typeof c> => !!c).map((c) => [c.id, effectiveCharacter(c, session.cast.find((x) => x.characterId === c.id)?.variantId).name]));
  }

  /** The preset a setup picks, else the library's "Homunculus Default", else the built-in one. */
  private async presetFor(id: string | null, setup: ResolvedSetup): Promise<Preset> {
    const picked = id ? await this.store.presets.get(id) : undefined;
    const base = picked ?? (await this.store.presets.get(DEFAULT_PRESET.id)) ?? DEFAULT_PRESET;
    return applyPresetOverride(base, setup.presetOverrides[base.id]);
  }

  /** Step 4 of the turn: the scene, the macros' context, and the preset → the prompt. */
  private async assemble(a: {
    session: Session; setup: ResolvedSetup; entries: AgentEntry[]; preset: Preset; parentId: string | null; history: Message[];
    character: ReturnType<typeof effectiveCharacter> | undefined; persona: ReturnType<typeof effectivePersona> | undefined;
    names: RunRequest["names"]; injections: PromptInjection[]; inlineAgents: AgentEntry[]; type: GenerationType; main: ConnectionConfig; seed: string;
  }): Promise<AssembledPrompt> {
    const sceneState = await this.core.state.resolve(a.session.id, a.parentId);
    const scene: Array<{ agentId: string; text: string }> = [];
    for (const e of a.entries) {
      const t = await this.runner.trackerOf(e.config, a.session, a.setup).catch(() => undefined);
      const own = t ? sceneState[e.config.state!.namespace] : undefined;
      if (t) scene.push({ agentId: e.config.id, text: trackerSummary(t.schema, own, trackerPeople(t.schema, own, t.cast, a.names.user, t.withUser)) });
    }
    const custom = (name: string, args: string[]) => {
      const def = this.core.macros.get(name);
      return def ? def.resolve({ sessionId: a.session.id, state: sceneState }, args) : undefined;
    };
    const vars = new Map<string, string>();
    const lore = await this.scanLore({ ...a, state: sceneState, macroCtx: {
      char: a.names.char, user: a.names.user, description: a.character?.description ?? "", personality: a.character?.personality ?? "",
      scenario: a.session.scenario.trim() || a.character?.scenario || "", persona: a.persona?.description ?? "", mesExamples: a.character?.exampleMessages ?? "",
      model: a.main.model, state: sceneState as Record<string, Record<string, unknown>>, seed: a.seed, vars, custom,
      ...(this.options.random ? { random: this.options.random } : {}),
    } });
    const cast = await this.castFor(a.session);
    // memory (D-054): chapters stand in for the messages they cover, just before what is left of the chat
    const memory = a.setup.memory.on ? applyChapters(a.history, await this.chapters(a.session.id)) : { history: a.history, text: "", covered: 0 };
    const injections = memory.text ? [...a.injections, { agentId: "memory", text: memory.text, position: "depth" as const, depth: 100_000, role: "system" as const }] : a.injections;
    const built = buildPrompt({
      preset: a.preset, generationType: a.type, character: a.character,
      ...(a.session.storyId || a.session.cast.some((member) => member.role === "narrator" && member.presence !== "off") ? { narrator: a.setup.narratorPrompt } : {}), ...(cast ? { cast } : {}),
      persona: a.persona ? { name: a.persona.name, description: a.persona.description, placement: a.persona.placement } : undefined,
      sessionScenario: a.session.scenario, history: memory.history, names: { char: a.names.char, user: a.names.user }, scene,
      injections,
      inline: a.inlineAgents.map((e) => ({ agentId: e.config.id, text: inlineInstruction(prepared(e.config, a.setup), a.names) })),
      reserve: a.main.params?.maxTokens ?? 1024,
      ...(lore ? { worldInfo: lore.prompt } : {}),
      authorsNote: { ...a.setup.authorsNote, goes: authorsNoteGoes(a.setup.authorsNote.interval, a.history) },
      macros: { model: a.main.model, state: sceneState as Record<string, Record<string, unknown>>, seed: a.seed, custom, vars },
      regex: await this.regexFor(a.preset, a.character, a.setup),
    });
    const withNotes = memory.covered ? { ...built, notes: [...built.notes, `Memory: ${memory.covered} older message(s) sent as chapter summaries.`] } : built;
    return lore ? { ...withNotes, lore: lore.report } : withNotes;
  }

  /**
   * Step 4a: the lorebook scan (BLUEPRINT §6). Books: the setup's (the session's own count as SillyTavern's
   * "chat lore", the rest as "global"), the speaking character's and the persona's. Timers come from the
   * newest reply on this path, so a swipe never sees the timers of the reply it replaces.
   */
  private async scanLore(a: {
    session: Session; setup: ResolvedSetup; preset: Preset; history: Message[]; type: GenerationType;
    character: ReturnType<typeof effectiveCharacter> | undefined; persona: ReturnType<typeof effectivePersona> | undefined;
    names: RunRequest["names"]; state: Record<string, unknown>; macroCtx: MacroContext;
    /** Scan only these books (the "Try it" of the lorebook editor). */
    only?: Array<{ book: Lorebook; scope: LoreScope }>;
  }) {
    // a session can switch off any book it would get (its own list's "remove"), also the character's and persona's
    const off = new Set(a.session.setup.lorebooks?.remove ?? []);
    const picks: Array<{ id: string; scope: LoreScope }> = [
      ...a.setup.lorebooks.map((id) => ({ id, scope: (a.setup.sources[`lorebooks:${id}`] === "session" ? "chat" : "global") as LoreScope })),
      ...(a.persona?.lorebookIds ?? []).map((id) => ({ id, scope: "persona" as const })),
      ...(a.character?.lorebookIds ?? []).map((id) => ({ id, scope: "character" as const })),
    ].filter((p) => !off.has(p.id));
    let books = a.only ?? [];
    if (!a.only) {
      if (!picks.length) return undefined;
      // a story reads its own version of each book (D-049)
      const story = a.session.storyId ? await this.store.getStory(a.session.storyId) : undefined;
      const found = new Map((await this.store.lorebooksForUse(picks.map((p) => p.id))).map((b) => [b.id, applyLorePatch(b, story?.lorePatches[b.id])]));
      books = picks.flatMap((p) => { const book = found.get(p.id); return book ? [{ book, scope: p.scope }] : []; });
    }
    if (!books.length) return undefined;
    const settings = await this.store.getLoreSettings();
    const said = (m: Message) => applyBasicMacros(m.content, { char: a.names.char, user: a.names.user });
    const chat = a.history
      .filter((m) => m.visibility.ai === "full" && m.kind !== "event")
      .map((m) => (settings.includeNames ? `${a.names.bySpeaker(m)}: ${said(m)}` : said(m)))
      .reverse();
    const depthPrompt = characterNoteOf(a.character)?.text ?? "";
    const r = scanLorebooks({
      books, chat, chatLength: a.history.length, trigger: a.type,
      global: {
        personaDescription: a.persona?.description ?? "", characterDescription: a.character?.description ?? "",
        characterPersonality: a.character?.personality ?? "", characterDepthPrompt: depthPrompt,
        scenario: a.macroCtx.scenario ?? "", creatorNotes: a.character?.creatorNotes ?? "",
      },
      ...(a.character ? { character: { name: a.character.name, tags: a.character.tags } } : {}),
      settings, ...(a.preset.contextSize ? { maxContext: a.preset.contextSize } : {}),
      timers: await this.store.loreTimersAlong(a.history), state: a.state,
      expand: (t) => expandMacros(t, a.macroCtx),
      ...(this.options.random ? { random: this.options.random } : {}),
    });
    const { report, ...prompt } = r;
    return { report, prompt };
  }

  private charNames = new Map<string, string>();

  private nameOf(m: Message, userName: string): string {
    if (m.speaker.kind === "user") return userName;
    if (m.speaker.kind === "character") return this.charNames.get(m.speaker.characterId) ?? "Character";
    return m.speaker.kind === "narrator" ? this.narratorName : "System";
  }

  /** The name narrator messages go by in the prompt: the story's narrator, else "Narrator". Set by pickSpeaker. */
  private narratorName = "Narrator";

  /**
   * Who replies. A story session: always its narrator (a card, a Vault narrator or its own). A chat: the narrator if
   * there is one, else the first in-scene, unmuted character (natural order for now).
   */
  private async pickSpeaker(session: Session): Promise<{ character: Character | undefined; speaker: Message["speaker"] }> {
    const result = await this.speakerFor(session);
    this.narratorName = result.speaker.kind === "narrator" ? result.character?.name ?? "Narrator" : "Narrator";
    return result;
  }

  /** Pure speaker resolution also used by previews, without changing a running turn's labels. CODEX. */
  private async speakerFor(session: Session): Promise<{ character: Character | undefined; speaker: Message["speaker"] }> {
    const story = session.storyId ? await this.store.getStory(session.storyId) : undefined;
    if (story) {
      const character = await this.storyNarrator(story);
      return { character, speaker: { kind: "narrator" } };
    }
    const narrator = session.cast.find((c) => c.role === "narrator" && c.presence !== "off");
    const member = narrator ?? session.cast.find((c) => c.role === "character" && c.presence === "in_scene" && !c.muted)
      ?? session.cast.find((c) => c.role === "character" && c.presence !== "off");
    const raw = member?.characterId ? await this.store.getCharacter(member.characterId) : undefined;
    const character = raw ? effectiveCharacter(raw, member?.variantId) : undefined;
    const speaker: Message["speaker"] = member?.role === "narrator" || !character
      ? { kind: "narrator" }
      : { kind: "character", characterId: character.id };
    return { character, speaker };
  }

  /** A story's narrator as the prompt sees a card (D-029). A missing Vault narrator falls back to the Simple Narrator. */
  private async storyNarrator(story: Story): Promise<Character> {
    const r = story.narrator;
    if (r.kind === "card") {
      const raw = await this.store.getCharacter(r.characterId);
      if (raw) return effectiveCharacter(raw, r.variantId);
    }
    if (r.kind === "own") return narratorAsCharacter(r.narrator, story.id);
    const n = r.kind === "vault" ? await this.store.narrators.get(r.id) : undefined;
    return narratorAsCharacter(n ?? SIMPLE_NARRATOR, n?.id ?? SIMPLE_NARRATOR.id);
  }

  /**
   * The "people in this story" part (D-029): the user's role, the NPC sheets (the story's and the session's own) and,
   * in a story, its other cards. Empty for a plain 1:1 chat where you play yourself.
   */
  private async castFor(session: Session): Promise<string> {
    const story = session.storyId ? await this.store.getStory(session.storyId) : undefined;
    const npcs = await this.store.npcsForUse([...(story?.npcIds ?? []), ...session.npcIds]);
    const withSchemas = await Promise.all(npcs.map(async (npc) => ({ npc, schema: await this.store.trackerSchemas.get(npc.schemaId) })));
    const narratorCard = story?.narrator.kind === "card" ? story.narrator.characterId : undefined;
    const cards: Character[] = [];
    for (const m of story?.cast ?? []) {
      if (!m.characterId || m.characterId === narratorCard || m.presence === "off") continue;
      const raw = await this.store.getCharacter(m.characterId);
      if (raw) cards.push(effectiveCharacter(raw, m.variantId));
    }
    return castPart({ inStory: !!story, role: story?.userRole ?? session.userRole, npcs: withSchemas, cards });
  }

  private async speakerByName(session: Session, name: string) {
    for (const c of session.cast) {
      if (!c.characterId || c.presence === "off") continue;
      const raw = await this.store.getCharacter(c.characterId);
      if (!raw) continue;
      const character = effectiveCharacter(raw, c.variantId);
      if (character.name.toLowerCase() === name.trim().toLowerCase()) {
        return { character, speaker: { kind: "character", characterId: character.id } as Message["speaker"] };
      }
    }
    return undefined;
  }

  /** With "trackers only when the story continues", run the skipped trackers on the reply being continued. */
  private async catchUpTrackers(session: Session, setup: ResolvedSetup, entries: AgentEntry[], owners: Map<string, string>,
    replyId: string, main: ConnectionConfig, names: RunRequest["names"], signal?: AbortSignal) {
    const reply = await this.store.getMessage(replyId);
    if (!reply || reply.speaker.kind === "user") return;
    // only replies written as swipes skipped their trackers
    if ((await this.store.getGenerationRecord(replyId))?.generationType !== "swipe") return;
    const ran = new Set((await this.store.listAgentRuns(replyId)).map((r) => r.agentId));
    const req: RunRequest = {
      session, setup, trigger: "turn.after", generationType: "normal", messageId: replyId, text: reply.content,
      mainConnection: main, names, seed: reply.parentId ?? session.id, results: new Map(), signal,
    };
    const missing = await this.runner.select(entries, req, (a) => isTurn(a, "after") && a.output === "state" && a.runMode === "separate" && !ran.has(a.id));
    if (missing.length) await this.runner.run(missing, req, owners);
  }

  /** A failed check with "regenerate" writes the reply again (kept as a revision), up to its retry limit. */
  private async regenerateOnFailedCheck(reply: Message, outcomes: AgentOutcome[], after: RunRequest,
    prompt: PromptPart[], main: ConnectionConfig, req: TurnRequest): Promise<Message | undefined> {
    const failed = outcomes.find((o) => o.kind === "check" && (o.output as { pass: boolean }).pass === false
      && o.config.check?.onFail === "regenerate" && (o.config.check?.maxRetries ?? 0) > 0);
    if (!failed || req.signal?.aborted) return undefined;
    const reason = (failed.output as { reason: string }).reason;
    let current = reply;
    for (let attempt = 0; attempt < (failed.config.check?.maxRetries ?? 0); attempt++) {
      const turns = [...toTurns(prompt), { role: "system" as const, content: `Your previous reply was rejected: ${reason}. Write it again.` }];
      let text = "";
      try {
        for await (const chunk of this.core.connections.stream(main, turns, req.signal)) if (typeof chunk === "string") text += chunk;
      } catch { return current; }
      if (!text.trim()) return current;
      await this.store.addRevision({ id: this.newId(), messageId: current.id, author: { kind: "agent", agentId: failed.agentId }, before: current.content, after: text, createdAt: this.now() });
      await this.store.updateMessageContent(current.id, text);
      current = { ...current, content: text };
      await this.core.events.emit("message.revised", { sessionId: current.sessionId, messageId: current.id });
      const again = await this.runner.runOne({ config: failed.config }, { ...after, text, trigger: "turn.after" }, new Map());
      if (!again || (again.output as { pass: boolean }).pass) break;
    }
    return current;
  }

  /** "Every N messages" and "when a state value changes" (BLUEPRINT §4.1). */
  private async otherTriggers(entries: AgentEntry[], owners: Map<string, string>, req: RunRequest, parentId: string | null): Promise<AgentOutcome[]> {
    const count = (await this.store.pathTo(req.messageId)).length;
    const beforeState = await this.core.state.resolve(req.session.id, parentId);
    const afterState = await this.core.state.resolve(req.session.id, req.messageId);
    const changed = (path: string) => JSON.stringify(readStatePath(beforeState, path)) !== JSON.stringify(readStatePath(afterState, path));
    const out: AgentOutcome[] = [];
    const everyN = await this.runner.select(entries, { ...req, trigger: "everyN" },
      (a) => a.triggers.some((t) => t.on === "everyN" && count % t.n === 0));
    out.push(...(await this.runner.run(everyN, { ...req, trigger: "everyN" }, owners)));
    const onChange = await this.runner.select(entries, { ...req, trigger: "stateChange" },
      (a) => a.triggers.some((t) => t.on === "stateChange" && changed(t.path)));
    out.push(...(await this.runner.run(onChange, { ...req, trigger: "stateChange" }, owners)));
    return out;
  }

  private async addMessage(sessionId: string, parentId: string | null, speaker: Message["speaker"], content: string,
    extra: { kind?: MessageKind; meta?: Message["meta"]; reasoning?: string | undefined } = {}): Promise<Message> {
    const m = await this.store.addMessage({
      id: this.newId(), sessionId, parentId, speaker, content, createdAt: this.now(),
      kind: extra.kind, meta: extra.meta ?? {}, ...(extra.reasoning ? { reasoning: extra.reasoning } : {}),
    });
    await this.core.events.emit("message.created", { sessionId, messageId: m.id });
    return m;
  }
}

function isTurn(a: { triggers: Array<{ on: string; phase?: string }> }, phase: "before" | "parallel" | "after"): boolean {
  return a.triggers.some((t) => t.on === "turn" && t.phase === phase);
}

function injectionOf(o: AgentOutcome): PromptInjection {
  const i = o.config.injection;
  return { agentId: o.agentId, text: String(o.output), position: i?.position ?? "marker", depth: i?.depth ?? 4, role: i?.role ?? "system" };
}

/** The preset's samplers win over the connection's (only for the story's own connection). */
function withPresetParams(c: ConnectionConfig, preset: Preset): ConnectionConfig {
  const p = presetParams(preset);
  return Object.keys(p).length ? { ...c, params: { ...c.params, ...p } } : c;
}

/**
 * Whether the Author's Note goes this turn (SillyTavern `setFloatingPrompt`): every turn when the interval is 1, never
 * at 0, else when the number of your messages so far is a multiple of it.
 */
export function authorsNoteGoes(interval: number, history: Message[]): boolean {
  if (interval === 1) return true;
  if (interval <= 0) return false;
  const yours = history.filter((m) => m.speaker.kind === "user" && m.kind !== "event").length;
  return yours > 0 && yours % interval === 0;
}
