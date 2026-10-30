// Homunculus 2 — one turn, from the click to the end (BLUEPRINT §6). Author: CLAUDE, 2026-10-27.
//
//  1. user message (optional)       5. main reply streams ── "parallel" agents run alongside
//  2. resolve the layered setup     6. save reply + reasoning + generation record; take out inline blocks
//  3. "before" agents               7. "after" agents: rewrites/checks in order, then readers in parallel
//  4. build the prompt              8. other triggers (every N messages, state change), events
//
// Only step 5 is fatal: an agent failing never loses the reply.
import type { Character, GenerationType, Lorebook, LoreReport, LoreSettings, Message, MessageKind, Preset, PromptPart, Session, Story } from "@homunculus/schemas";
import { AgentRunner, type AgentEntry, type AgentOutcome, type RunRequest } from "./agents/runner.ts";
import { extractInline, inlineInstruction, parseAnswer } from "./agents/outputs.ts";
import { isAbort } from "./connections.ts";
import type { HomunculusCore } from "./core.ts";
import type { ConnectionConfig } from "./extensions.ts";
import { scanLorebooks, type LoreScope } from "./lorebook.ts";
import { applyBasicMacros, DEFAULT_USER_NAME, expandMacros, type MacroContext } from "./macros.ts";
import { applyPresetOverride } from "./prompt-control.ts";
import { buildPrompt, DEFAULT_PRESET, presetParams, squashSystem, toTurns, type BuiltPrompt, type PromptInjection } from "./presets.ts";

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
import { effectiveCharacter, effectivePersona } from "./variants.ts";
import { castPart, narratorAsCharacter, SIMPLE_NARRATOR } from "./stories.ts";

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
  private readonly newId: () => string;
  private readonly now: () => number;

  constructor(private readonly core: HomunculusCore, private readonly store: SqlStore, private readonly options: TurnOptions = {}) {
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => Date.now());
    this.runner = new AgentRunner({
      core, store, newId: this.newId, now: this.now,
      random: options.random ?? Math.random,
      resolveConnection: (id, main) => (id ? options.connectionById?.(id) : undefined) ?? main,
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
      userMessage = await this.addMessage(session.id, parentId, { kind: "user" }, req.userText, { kind });
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
        else Object.assign(usage, chunk.usage);
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
    let reply = await this.addMessage(session.id, parentId, chosen.speaker, clean, { reasoning: reasoning || undefined });
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
    await this.core.events.emit("turn.finished", { sessionId: session.id, messageId: reply.id });
    reply = (await this.store.getMessage(reply.id)) ?? reply;
    return { userMessage, reply, outcomes };
  }

  /** Runs one agent by hand on a message (the "run now" button). */
  async runManual(sessionId: string, agentId: string, messageId: string, connection: ConnectionConfig, signal?: AbortSignal,
    connections?: Record<string, ConnectionConfig>): Promise<AgentOutcome | undefined> {
    const session = await this.store.getSession(sessionId);
    if (!session) throw new Error(`Session "${sessionId}" not found`);
    const setup = await this.setupFor(session);
    const entries = await this.runner.enabledAgents({ ...setup, agents: [...new Set([...setup.agents, agentId])] });
    const entry = entries.find((e) => e.config.id === agentId);
    if (!entry) throw new Error(`Agent "${agentId}" is not installed`);
    const m = await this.store.getMessage(messageId);
    if (!m) throw new Error(`Message "${messageId}" not found`);
    const speaking = await this.pickSpeaker(session);
    const persona = setup.personaId ? await this.store.personas.get(setup.personaId) : undefined;
    const user = (persona ? effectivePersona(persona, setup.personaVariantId).name : undefined) ?? DEFAULT_USER_NAME;
    const names = { char: speaking.character?.name ?? "Narrator", user, bySpeaker: (x: Message) => this.nameOf(x, user) };
    const main = (setup.connectionId ? connections?.[setup.connectionId] : undefined) ?? connection;
    return this.runner.runOne(entry, {
      session, setup, trigger: "manual", generationType: "normal", messageId, text: m.content, mainConnection: main, connections,
      names, seed: m.parentId ?? sessionId, results: new Map(), signal,
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
    const built = await this.assemble({ session, setup, entries, preset, parentId, history, character: speaking.character, persona: effPersona,
      names, injections: [], inlineAgents, type: "normal", main, seed: parentId ?? session.id });
    const before = entries.filter((e) => isTurn(e.config, "before") && e.config.runMode !== "inline");
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
    const built = buildPrompt({
      preset: a.preset, generationType: a.type, character: a.character,
      ...(a.session.storyId || a.session.cast.some((member) => member.role === "narrator" && member.presence !== "off") ? { narrator: a.setup.narratorPrompt } : {}), ...(cast ? { cast } : {}),
      persona: a.persona ? { name: a.persona.name, description: a.persona.description, placement: a.persona.placement } : undefined,
      sessionScenario: a.session.scenario, history: a.history, names: { char: a.names.char, user: a.names.user }, scene,
      injections: a.injections,
      inline: a.inlineAgents.map((e) => ({ agentId: e.config.id, text: inlineInstruction(e.config, a.names) })),
      reserve: a.main.params?.maxTokens ?? 1024,
      ...(lore ? { worldInfo: lore.prompt } : {}),
      authorsNote: { ...a.setup.authorsNote, goes: authorsNoteGoes(a.setup.authorsNote.interval, a.history) },
      macros: { model: a.main.model, state: sceneState as Record<string, Record<string, unknown>>, seed: a.seed, custom, vars },
    });
    return lore ? { ...built, lore: lore.report } : built;
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
      const found = new Map((await this.store.lorebooksForUse(picks.map((p) => p.id))).map((b) => [b.id, b]));
      books = picks.flatMap((p) => { const book = found.get(p.id); return book ? [{ book, scope: p.scope }] : []; });
    }
    if (!books.length) return undefined;
    const settings = await this.store.getLoreSettings();
    const said = (m: Message) => applyBasicMacros(m.content, { char: a.names.char, user: a.names.user });
    const chat = a.history
      .filter((m) => m.visibility.ai === "full" && m.kind !== "event")
      .map((m) => (settings.includeNames ? `${a.names.bySpeaker(m)}: ${said(m)}` : said(m)))
      .reverse();
    const original = (a.character?.original ?? {}) as { data?: { extensions?: { depth_prompt?: { prompt?: unknown } } } };
    const depthPrompt = original.data?.extensions?.depth_prompt?.prompt;
    const r = scanLorebooks({
      books, chat, chatLength: a.history.length, trigger: a.type,
      global: {
        personaDescription: a.persona?.description ?? "", characterDescription: a.character?.description ?? "",
        characterPersonality: a.character?.personality ?? "", characterDepthPrompt: typeof depthPrompt === "string" ? depthPrompt : "",
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
    this.narratorName = "Narrator";
    const story = session.storyId ? await this.store.getStory(session.storyId) : undefined;
    if (story) {
      const character = await this.storyNarrator(story);
      this.narratorName = character.name;
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
