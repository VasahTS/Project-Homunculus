// Homunculus 2 — the agent runner (BLUEPRINT §4.1–4.2). Author: CLAUDE, 2026-10-27.
//
// One place runs every agent, built in or made by the user:
//  - picks the agents of the resolved setup that match the trigger and their conditions,
//  - orders them (dependencies, then waves: text-changing agents in sequence, readers in parallel),
//  - gives each one its context and connection (with limits and Stop),
//  - validates the answer, applies it (state, notes, revisions) and records what happened.
// One agent failing never stops the others, and never loses the reply.
import { AgentConfig, LoreEntry, Lorebook, type AgentOutputKind, type AgentRun, type Character, type GenerationType, type Message, type Session, type Story, type TrackerSchema } from "@homunculus/schemas";
import type { HomunculusCore } from "../core.ts";
import { errorText } from "../core.ts";
import { isAbort } from "../connections.ts";
import type { AgentDefinition, AgentRunContext, Completion, ConnectionConfig } from "../extensions.ts";
import type { ResolvedSetup } from "../setup.ts";
import { readStatePath, type ResolvedState } from "../state.ts";
import type { SqlStore } from "../storage/store.ts";
import { separateExecutor, shapeFor, type LoreProposal } from "./outputs.ts";
import { applyLorePatch, patchWithEntry } from "../lore-versions.ts";
import { normalizeTrackerAnswer, trackerPeople, type TrackerCastMember } from "../trackers.ts";
import { applyBasicMacros, expandMacros } from "../macros.ts";
import { prepared } from "./styles.ts";
import { applyChapters, type Chapter } from "../memory.ts";
import { effectiveCharacter } from "../variants.ts";

/** An agent ready to run: its config, and its code if it is built in. */
export interface AgentEntry {
  config: AgentConfig;
  definition?: AgentDefinition<any>;
}

export interface RunnerDeps {
  core: HomunculusCore;
  store: SqlStore;
  newId: () => string;
  now: () => number;
  /** 0 ≤ x < 1. Injected so tests are repeatable. */
  random: () => number;
  /** Finds the connection for an agent: its own (from the setup) or the main one. */
  resolveConnection: (connectionId: string | null | undefined, main: ConnectionConfig) => ConnectionConfig;
  /** A story's narrator and the "people in this story" text (NPC sheets, other cards), as the main prompt sees them. D-048. */
  people?: (session: Session) => Promise<{ narrator?: Character | undefined; cast: string }>;
  /** The user's persona text for this session (its chosen variant), if any. D-048. */
  persona?: (session: Session, setup: ResolvedSetup) => Promise<string>;
}

/** What one run used and answered (D-048): kept on the run so you can see why it did what it did. */
type Usage = Partial<Pick<Completion, "model" | "tokensIn" | "tokensOut" | "cost" | "reasoning">> & { prompt?: Array<{ role: string; content: string }>; raw?: string };

/** A run that changes nothing (Compare, D-048). */
export interface DryRun { output?: unknown; error?: string; raw?: string; reasoning?: string; prompt?: Array<{ role: string; content: string }>; model?: string; tokensIn?: number; tokensOut?: number; durationMs: number }

export interface RunRequest {
  session: Session;
  setup: ResolvedSetup;
  /** e.g. "turn.before", "turn.after", "everyN", "manual". */
  trigger: string;
  generationType: GenerationType;
  /** The message the agents work on. */
  messageId: string;
  /** Text the agents read (the reply or the user's message). */
  text: string;
  mainConnection: ConnectionConfig;
  /** Connections by profile id, for agents that use their own (setup.agentConnectionId / agent overrides). */
  connections?: Record<string, ConnectionConfig>;
  names: AgentRunContext["names"];
  /** Seed for "stable" randomness: the same parent gives the same roll on every swipe. */
  seed: string;
  /** Results of agents that ran earlier in this turn (shared across waves). */
  results: Map<string, unknown>;
  signal?: AbortSignal;
  /** A direction for this run only, added to the agent's instructions (D-057; manual runs and Run again). */
  direction?: string;
}

/** The agent with this run's direction added at the end of its instructions (D-057). */
export function withDirection(a: AgentConfig, direction: string | undefined): AgentConfig {
  const d = direction?.trim();
  if (!d || a.runMode === "text") return a;
  return { ...a, prompt: `${a.prompt.trim()}\n\nFor this run only, follow this direction from {{user}}: ${d}` };
}

export interface AgentOutcome {
  agentId: string;
  kind: AgentOutputKind;
  output: unknown;
  config: AgentConfig;
}

/** Text-changing kinds run one after another; the rest in parallel. */
const SEQUENTIAL: ReadonlySet<AgentOutputKind> = new Set(["intercept", "rewrite", "check"]);

export class AgentRunner {
  // Serialize only lorebook application; model calls and different stories stay parallel. CODEX, D-051.
  private readonly storyWrites = new Map<string, Promise<void>>();
  constructor(private readonly deps: RunnerDeps) {}

  /** Every agent the setup enables, built in or from the database. Unknown ids are reported once and skipped. */
  async enabledAgents(setup: ResolvedSetup): Promise<AgentEntry[]> {
    const out: AgentEntry[] = [];
    for (const id of setup.agents) {
      const builtin = this.deps.core.agents.get(id);
      if (builtin) { out.push({ config: builtin.config, definition: builtin.definition }); continue; }
      const config = await this.deps.store.agentConfigs.get(id);
      if (config) out.push({ config });
      else void this.deps.core.events.emit("core.error", { source: "agents", message: `Agent "${id}" is enabled but not installed` });
    }
    return out;
  }

  /**
   * Which namespace each state agent owns. The first claim wins (by order, then id);
   * a second agent writing the same namespace is refused (BLUEPRINT §4.5).
   */
  owners(entries: AgentEntry[]): Map<string, string> {
    const map = new Map<string, string>();
    const sorted = [...entries].sort((a, b) => a.config.order - b.config.order || a.config.id.localeCompare(b.config.id));
    for (const { config } of sorted) {
      const ns = config.output === "state" ? config.state?.namespace : undefined;
      if (ns && !map.has(ns)) map.set(ns, config.id);
    }
    return map;
  }

  /** Agents whose trigger matches and whose conditions pass. */
  async select(entries: AgentEntry[], req: RunRequest, filter: (a: AgentConfig) => boolean): Promise<AgentEntry[]> {
    const path = await this.deps.store.pathTo(req.messageId).catch(() => [] as Message[]);
    const state = await this.deps.core.state.resolve(req.session.id, req.messageId);
    const picked: AgentEntry[] = [];
    for (const e of entries) {
      if (!filter(e.config)) continue;
      if (this.conditionsPass(e.config, req, path, state)) picked.push(e);
    }
    return picked;
  }

  private conditionsPass(a: AgentConfig, req: RunRequest, path: Message[], state: ResolvedState): boolean {
    const c = a.conditions;
    if (c.generationTypes.length && !c.generationTypes.includes(req.generationType)) return false;
    if (c.roles.length && !c.roles.includes(req.session.userRole)) return false;
    if (path.length < c.minMessages) return false;
    // "at least N tokens" (D-059): the messages it would read, about 3.6 characters a token
    if (a.input.minTokens > 0) {
      const read = path.slice(-Math.max(1, a.input.messages)).reduce((n, m) => n + m.content.length, 0) / 3.6;
      if (read < a.input.minTokens) return false;
    }
    for (const s of c.state) if (JSON.stringify(readStatePath(state, s.path)) !== JSON.stringify(s.equals)) return false;
    if (c.keywords.length) {
      const recent = [...path.slice(-Math.max(1, a.input.messages)).map((m) => m.content), req.text].join("\n").toLowerCase();
      const hit = c.keywords.some((k) => {
        const re = /^\/(.+)\/([a-z]*)$/i.exec(k);
        if (re) { try { return new RegExp(re[1]!, re[2]!.includes("i") ? re[2] : `${re[2]}i`).test(recent); } catch { return false; } }
        return recent.includes(k.toLowerCase());
      });
      if (!hit) return false;
    }
    if (c.probability < 100) {
      const roll = a.randomness === "stable" ? seededUnit(`${req.seed}|${a.id}`) : this.deps.random();
      if (roll * 100 >= c.probability) return false;
    }
    return true;
  }

  /**
   * Runs the given agents for one trigger: sequential kinds first (by order, respecting
   * dependencies), then the others in parallel, level by level of dependencies.
   */
  async run(entries: AgentEntry[], req: RunRequest, owners: Map<string, string>): Promise<AgentOutcome[]> {
    const outcomes: AgentOutcome[] = [];
    const cyclic = findCycles(entries);
    for (const id of cyclic) {
      const e = entries.find((x) => x.config.id === id)!;
      await this.record(e.config, req, "failed", this.deps.now(), 0, { error: "Dependency cycle: this agent reads an agent that reads it back" });
    }
    const usable = entries.filter((e) => !cyclic.has(e.config.id));
    const sequential = topoSort(usable.filter((e) => SEQUENTIAL.has(e.config.output)));
    for (const e of sequential) {
      if (req.signal?.aborted) break;
      const o = await this.runOne(e, req, owners);
      if (o) outcomes.push(o);
    }
    for (const level of levels(usable.filter((e) => !SEQUENTIAL.has(e.config.output)))) {
      if (req.signal?.aborted) break;
      const done = await Promise.all(level.map((e) => this.runOne(e, req, owners)));
      for (const o of done) if (o) outcomes.push(o);
    }
    return outcomes;
  }

  /** Runs one agent and applies its answer. Returns undefined when it failed. */
  async runOne(entry: AgentEntry, req: RunRequest, owners: Map<string, string>, preset?: { answer: unknown }): Promise<AgentOutcome | undefined> {
    entry = { ...entry, config: withDirection(prepared(entry.config, req.setup), req.direction) };
    const { core, store } = this.deps;
    const a = entry.config;
    const started = this.deps.now();
    const usage: Usage = {};
    await core.events.emit("agent.started", { agentId: a.id, messageId: req.messageId, trigger: req.trigger });
    try {
      req.signal?.throwIfAborted(); // Text/code agents must honor Stop too. CODEX, D-051.
      if (a.output === "state") {
        const owner = a.state?.namespace ? owners.get(a.state.namespace) : undefined;
        if (!a.state?.namespace) throw new Error("This tracker has no state namespace set");
        if (owner !== a.id) throw new Error(`The state "${a.state.namespace}" belongs to agent "${owner}"; two trackers cannot write the same values`);
      }
      const tracker = await this.trackerOf(a, req.session, req.setup);
      let raw: unknown;
      if (preset) raw = preset.answer;
      else {
        const ctx = await this.context(entry, req, usage, tracker);
        if (entry.definition) raw = await entry.definition.run(ctx);
        else if (a.runMode === "text") raw = await this.textAnswer(a, req);
        else {
          const executor = a.runMode === "separate" ? separateExecutor : core.agentExecutors.get(a.runMode);
          if (!executor) throw new Error(`No way to run agents in "${a.runMode}" mode is installed`);
          raw = await executor(ctx);
        }
      }
      // trackers: keep only what fits the fields (BLUEPRINT §4.5)
      let warnings: string[] | undefined;
      if (tracker && !entry.definition && raw && typeof raw === "object" && !Array.isArray(raw)) {
        const current = (await core.state.resolve(req.session.id, req.messageId))[a.state!.namespace];
        const people = trackerPeople(tracker.schema, current, tracker.cast, req.names.user, tracker.withUser);
        const n = normalizeTrackerAnswer(tracker.schema, raw as Record<string, unknown>, current, people);
        if (!Object.keys(n.values).length && n.ignored.length) throw new Error(`Nothing in the answer fit the fields: ${n.ignored.join("; ")}`);
        raw = n.values;
        if (n.ignored.length) warnings = n.ignored;
      }
      const shape = entry.definition?.output ?? shapeFor(a);
      const parsed = shape.safeParse(raw);
      if (!parsed.success) throw new Error(`Answer had the wrong shape: ${parsed.error.message}`);
      req.signal?.throwIfAborted(); // Discard an answer that arrived after Stop. CODEX, D-051.
      await this.apply(entry, req, parsed.data, usage);
      req.results.set(a.id, parsed.data);
      await this.record(a, req, "ok", started, this.deps.now() - started, { output: parsed.data as never, ...usage, ...(warnings ? { warnings } : {}) });
      await core.events.emit("agent.output", { agentId: a.id, messageId: req.messageId, kind: a.output, output: parsed.data });
      await core.events.emit("agent.finished", { agentId: a.id, messageId: req.messageId, trigger: req.trigger });
      return { agentId: a.id, kind: a.output, output: parsed.data, config: a };
    } catch (e) {
      const cancelled = isAbort(e, req.signal);
      const reason = cancelled ? "Stopped" : errorText(e);
      await this.record(a, req, cancelled ? "cancelled" : "failed", started, this.deps.now() - started, { error: reason, ...usage });
      await core.events.emit("agent.failed", { agentId: a.id, messageId: req.messageId, trigger: req.trigger, reason });
      return undefined;
    }
  }

  /**
   * A tracker's field set (the one the setup picked, else its default) and the session's cast;
   * undefined for agents without a field set.
   */
  async trackerOf(a: AgentConfig, session: Session, setup?: ResolvedSetup): Promise<{ schema: TrackerSchema; cast: TrackerCastMember[]; withUser: boolean } | undefined> {
    if (a.output !== "state" || !a.state?.schemaId) return undefined;
    const id = setup?.agentOverrides[a.id]?.schemaId ?? a.state.schemaId;
    const schema = this.deps.core.trackerSchemas.get(id) ?? (await this.deps.store.trackerSchemas.get(id));
    if (!schema) throw new Error(`The field list "${id}" of this tracker is missing`);
    return { schema, cast: await castOf(this.deps.store, session), withUser: await userInStory(this.deps.store, session) };
  }

  private async context(entry: AgentEntry, req: RunRequest, usage: Usage,
    tracker?: { schema: TrackerSchema; cast: TrackerCastMember[]; withUser: boolean }): Promise<AgentRunContext> {
    const a = entry.config;
    const { core, store } = this.deps;
    const path = await store.pathTo(req.messageId).catch(() => [] as Message[]);
    const visible = path.filter((m) => m.visibility.ai === "full" && m.kind !== "event");
    // "before" agents read up to the user's message; "after" agents get the reply as `text`, not in the transcript
    const transcriptPath = req.trigger === "turn.after" ? visible.slice(0, -1) : visible;
    const state = await core.state.resolve(req.session.id, req.messageId);
    const override = req.setup.agentOverrides[a.id];
    // this story's/chat's pick for the agent, else the agent's own (D-057), else the setup's connection for agents, else the story's
    const wanted = override?.connectionId ?? a.connectionId ?? req.setup.agentConnectionId;
    const base = (wanted ? req.connections?.[wanted] : undefined) ?? this.deps.resolveConnection(wanted, req.mainConnection);
    const connection = a.modelOverride?.trim() ? { ...base, model: a.modelOverride.trim() } : base;
    const ownValues = a.state?.namespace ? state[a.state.namespace] : undefined;
    const cards = a.input.cards ? await this.cardsText(req) : "";
    const persona = a.input.persona && this.deps.persona ? (await this.deps.persona(req.session, req.setup)).trim() : "";
    const story = a.input.scenario && req.session.storyId ? await store.getStory(req.session.storyId) : undefined;
    const scenario = a.input.scenario ? (req.session.scenario.trim() || story?.scenario?.trim() || "") : "";
    const lore = a.input.lorebooks ? await this.loreText(path) : "";
    const loreBook = a.output === "proposal" && a.proposal?.target === "lorebook" ? await this.storyLorebook(req.session, false) : undefined;
    const authorsNote = a.input.authorsNote ? (req.setup.authorsNote.text ?? "").trim() : "";
    const chapters = a.input.chapters ? applyChapters(path, (await store.getAppSetting<Chapter[]>(`memory.chapters:${req.session.id}`)) ?? []).text.trim() : "";
    const previousNotes = a.input.previousNotes > 0 ? await this.previousNotes(a, path) : [];
    const variableKeys = new Set((a.variables ?? []).map((v) => v.key));
    const loreIndex = loreBook ? loreBook.book.entries.map((e) => `- ${e.title || e.keys[0] || e.id}${e.keys.length ? ` (${e.keys.join(", ")})` : ""}`).join("\n") : undefined;
    return {
      agent: a,
      sessionId: req.session.id,
      messageId: req.messageId,
      trigger: req.trigger,
      generationType: req.generationType,
      state,
      messages: a.input.messages > 0 ? transcriptPath.slice(-a.input.messages) : [],
      text: req.text,
      results: Object.fromEntries(a.input.readsAgents.filter((id) => req.results.has(id)).map((id) => [id, req.results.get(id)])),
      // variables are already written into the instructions (D-059); the rest of the story's settings are sent as data
      settings: Object.fromEntries(Object.entries(override?.settings ?? {}).filter(([k]) => !variableKeys.has(k))),
      names: req.names,
      signal: req.signal,
      ...(tracker ? { tracker: { schema: tracker.schema, people: trackerPeople(tracker.schema, ownValues, tracker.cast, req.names.user, tracker.withUser) } } : {}),
      ...(cards ? { cards } : {}),
      ...(persona ? { persona } : {}),
      ...(scenario ? { scenario } : {}),
      ...(lore ? { lore } : {}),
      ...(loreIndex !== undefined ? { loreIndex } : {}),
      ...(authorsNote ? { authorsNote } : {}),
      ...(chapters ? { chapters } : {}),
      ...(previousNotes.length ? { previousNotes } : {}),
      complete: async (messages, options) => {
        usage.prompt = [...(usage.prompt ?? []), ...messages.map((m) => ({ role: m.role, content: m.content }))];
        const c = await core.connections.complete(connection, messages, { signal: req.signal, maxTokens: options?.maxTokens ?? a.limits.maxTokens });
        usage.raw = usage.raw ? `${usage.raw}\n\n${c.text}` : c.text;
        if (c.reasoning) usage.reasoning = usage.reasoning ? `${usage.reasoning}\n\n${c.reasoning}` : c.reasoning;
        usage.model = c.model;
        usage.tokensIn = (usage.tokensIn ?? 0) + (c.tokensIn ?? 0) || undefined;
        usage.tokensOut = (usage.tokensOut ?? 0) + (c.tokensOut ?? 0) || undefined;
        if (c.cost !== undefined) usage.cost = (usage.cost ?? 0) + c.cost;
        return c;
      },
    };
  }

  /** This agent's own latest notes on this branch (one per message, up to this one), oldest first (D-059). */
  private async previousNotes(a: AgentConfig, path: Message[]): Promise<string[]> {
    const out: string[] = [];
    for (const m of [...path].reverse()) {
      if (out.length >= a.input.previousNotes) break;
      const text = (await this.deps.store.listNotes(m.id, a.id)).at(-1)?.content.trim();
      if (text) out.push(text);
    }
    return out.reverse();
  }

  /** The character cards of the session's cast, short, for agents with input.cards (who the characters are). */
  private async cardsText(req: RunRequest): Promise<string> {
    const parts: string[] = [];
    for (const m of req.session.cast) {
      if (!m.characterId || m.presence === "off") continue;
      const raw = await this.deps.store.getCharacter(m.characterId);
      if (!raw) continue;
      const c = effectiveCharacter(raw, m.variantId);
      const names = { char: c.name, user: req.names.user };
      const cut = (t: string) => (t.length > 1500 ? `${t.slice(0, 1500)}…` : t);
      const lines = [`### ${c.name}`];
      if (c.description.trim()) lines.push(cut(applyBasicMacros(c.description, names)));
      if (c.personality.trim()) lines.push(`Personality: ${cut(applyBasicMacros(c.personality, names))}`);
      parts.push(lines.join("\n"));
    }
    // a story's narrator and its NPC sheets, as the main prompt has them (D-048: agents in a story saw neither)
    if (this.deps.people) {
      const p = await this.deps.people(req.session);
      if (p.narrator && !req.session.cast.some((m) => m.characterId === p.narrator!.id)) {
        const n = p.narrator;
        const text = [n.systemPrompt, n.description, n.personality ? `Personality: ${n.personality}` : ""].filter((t) => t.trim()).join("\n");
        if (text.trim()) parts.unshift(`### Narrator: ${n.name}\n${applyBasicMacros(text.length > 1500 ? `${text.slice(0, 1500)}…` : text, { char: n.name, user: req.names.user })}`);
      }
      if (p.cast.trim()) parts.push(p.cast.trim());
    }
    return parts.join("\n\n");
  }

  /** The lorebook entries that went into the latest reply's prompt on this branch (D-048). */
  private async loreText(path: Message[]): Promise<string> {
    for (const m of [...path].reverse()) {
      if (m.speaker.kind === "user") continue;
      const rec = await this.deps.store.getGenerationRecord(m.id);
      if (!rec) continue;
      return rec.prompt.filter((p) => p.source?.startsWith("lore:") && p.source !== "lore:note").map((p) => p.content.trim()).filter(Boolean).join("\n\n");
    }
    return "";
  }

  /**
   * Runs an agent without changing anything (Compare, D-048): same input, optionally another connection; no state,
   * notes, revisions, records or events. Returns what it answered and why.
   */
  async dryRun(entry: AgentEntry, req: RunRequest, connection?: ConnectionConfig): Promise<DryRun> {
    entry = { ...entry, config: withDirection(prepared(entry.config, req.setup), req.direction) };
    const a = entry.config;
    const started = this.deps.now();
    const usage: Usage = {};
    const forced: RunRequest = connection ? { ...req, setup: { ...req.setup, agentConnectionId: null, agentOverrides: { ...req.setup.agentOverrides, [a.id]: { ...req.setup.agentOverrides[a.id], connectionId: null } } }, mainConnection: connection, connections: {} } : req;
    if (connection) entry = { ...entry, config: { ...entry.config, connectionId: null, modelOverride: "" } };
    try {
      req.signal?.throwIfAborted();
      let raw: unknown;
      if (a.runMode === "text") raw = await this.textAnswer(a, forced);
      else {
        const tracker = await this.trackerOf(a, req.session, req.setup);
        const ctx = await this.context(entry, { ...forced, results: new Map(req.results) }, usage, tracker);
        if (entry.definition) raw = await entry.definition.run(ctx);
        else {
          const executor = a.runMode === "separate" ? separateExecutor : this.deps.core.agentExecutors.get(a.runMode);
          if (!executor) throw new Error(`No way to run agents in "${a.runMode}" mode is installed`);
          raw = await executor(ctx);
        }
      }
      req.signal?.throwIfAborted();
      const shape = entry.definition?.output ?? shapeFor(a);
      const parsed = shape.safeParse(raw);
      const out: DryRun = { ...usage, durationMs: this.deps.now() - started };
      if (parsed.success) out.output = parsed.data; else out.error = `Answer had the wrong shape: ${parsed.error.message}`;
      return out;
    } catch (e) {
      return { ...usage, error: isAbort(e, req.signal) ? "Stopped" : errorText(e), durationMs: this.deps.now() - started };
    }
  }

  /** A "text" agent's answer (D-047): its own text, macros expanded, no AI call and nothing recorded. A "stable" agent
   * rolls the same {{random}} on every swipe. Also used by Preview Prompt, which must not change anything. */
  async textAnswer(a: AgentConfig, req: Pick<RunRequest, "session" | "messageId" | "seed" | "names" | "text">): Promise<string> {
    const random = a.randomness === "stable" ? seededSequence(`${req.seed}|${a.id}|text`) : this.deps.random;
    const state = req.messageId ? await this.deps.core.state.resolve(req.session.id, req.messageId) : {};
    return expandMacros(a.prompt, { ...req.names, state: state as Record<string, Record<string, unknown>>, lastMessage: req.text, random }).trim();
  }

  /** Puts a valid answer where it belongs. inject / check / choices / proposal / speaker are returned to the caller. */
  private async apply(entry: AgentEntry, req: RunRequest, output: unknown, usage?: Usage): Promise<void> {
    const { core, store } = this.deps;
    const a = entry.config;
    switch (a.output) {
      case "state": {
        const ns = a.state!.namespace;
        const delta = entry.definition?.toState ? entry.definition.toState(output) : { [ns]: output as Record<string, unknown> };
        for (const key of Object.keys(delta)) {
          if (key !== ns && key !== `agent:${a.id}`) throw new Error(`This tracker may only write "${ns}" (it tried "${key}")`);
        }
        const locked = await this.lockedKeys(a);
        const clean = Object.fromEntries(Object.entries(delta).map(([k, v]) =>
          [k, Object.fromEntries(Object.entries(v).filter(([field]) => !(k === ns && locked.has(field))))]));
        await core.state.applyDelta(req.messageId, clean as never);
        await core.events.emit("state.changed", { sessionId: req.session.id, messageId: req.messageId, namespaces: Object.keys(clean) });
        return;
      }
      case "note":
        // the model that wrote it shows beside the note in the chat (D-057)
        await store.addNote({ id: this.deps.newId(), sessionId: req.session.id, messageId: req.messageId, agentId: a.id, content: String(output), createdAt: this.deps.now(),
          ...(usage?.model ? { data: { model: usage.model } } : {}) });
        return;
      case "rewrite":
      case "intercept": {
        const m = await store.getMessage(req.messageId);
        if (!m) throw new Error("The message to rewrite no longer exists");
        const after = String(output);
        if (after === m.content) return;
        await store.addRevision({ id: this.deps.newId(), messageId: m.id, author: { kind: "agent", agentId: a.id }, before: m.content, after, createdAt: this.deps.now() });
        await store.updateMessageContent(m.id, after);
        req.text = after;
        await core.events.emit("message.revised", { sessionId: req.session.id, messageId: m.id });
        return;
      }
      case "proposal": {
        if (a.proposal?.target !== "lorebook") return;
        const changed = await this.writeStoryLore(req, async () => {
          const found = await this.storyLorebook(req.session, true);
          if (!found) throw new Error("Lorebook proposals need a story: this chat is not part of one");
          let patch = found.story.lorePatches[found.book.id];
          let book = found.book;
          for (const p of (output as LoreProposal).entries) {
            const same = book.entries.find((e) => (e.title || "").trim().toLowerCase() === p.title.trim().toLowerCase());
            const next = same ? { ...same, keys: p.keys.length ? p.keys : same.keys, content: p.content }
              : LoreEntry.parse({ id: `kp-${this.deps.newId()}`, title: p.title, keys: p.keys, content: p.content });
            patch = patchWithEntry(patch, next, a.id, this.deps.now(), req.messageId);
            book = { ...book, entries: same ? book.entries.map((e) => (e.id === same.id ? next : e)) : [...book.entries, next] };
          }
          const latest = (await store.getStory(found.story.id)) ?? found.story;
          await store.saveStory({ ...latest, lorePatches: { ...latest.lorePatches, [found.book.id]: patch! } });
          return { storyId: found.story.id, lorebookId: found.book.id };
        });
        await core.events.emit("story.loreChanged", { ...changed, agentId: a.id, messageId: req.messageId });
        return;
      }
      default:
        return;
    }
  }

  /** Merge a keeper's result with the latest story version, including other keepers' writes. */
  private async writeStoryLore<T>(req: RunRequest, write: () => Promise<T>): Promise<T> {
    const id = req.session.storyId;
    if (!id) throw new Error("Lorebook proposals need a story: this chat is not part of one");
    const previous = this.storyWrites.get(id);
    let release!: () => void;
    const current = new Promise<void>((done) => { release = done; });
    this.storyWrites.set(id, current);
    await previous;
    try {
      req.signal?.throwIfAborted();
      return await write();
    } finally {
      release();
      if (this.storyWrites.get(id) === current) this.storyWrites.delete(id);
    }
  }

  /**
   * The lorebook a story's agents add to (D-049): the first one the story uses, as the story sees it. With `create`,
   * a story without one gets an empty "<story> lore" book of its own (only that story uses it).
   */
  private async storyLorebook(session: Session, create: boolean): Promise<{ story: Story; book: Lorebook } | undefined> {
    const story = session.storyId ? await this.deps.store.getStory(session.storyId) : undefined;
    if (!story) return undefined;
    const ids = story.setup.lorebooks && story.setup.lorebooks.mode !== "keep" ? story.setup.lorebooks.add : [];
    const [first] = await this.deps.store.lorebooksForUse(ids);
    if (first) return { story, book: applyLorePatch(first, story.lorePatches[first.id]) };
    if (!create) return { story, book: Lorebook.parse({ id: "none", name: "none" }) };
    const book = await this.deps.store.saveLorebook({ id: `lore-${this.deps.newId()}`, name: `${story.name} lore`, entries: [] });
    const fresh = { ...story, setup: { ...story.setup, lorebooks: { mode: "add" as const, add: [...ids, book.id], remove: story.setup.lorebooks?.remove ?? [] } } };
    await this.deps.store.saveStory(fresh);
    return { story: fresh, book };
  }

  /** Fields of the agent's tracker schema that only the user may change. */
  private async lockedKeys(a: AgentConfig): Promise<Set<string>> {
    const id = a.state?.schemaId;
    if (!id) return new Set();
    const schema = this.deps.core.trackerSchemas.get(id) ?? (await this.deps.store.trackerSchemas.get(id));
    return new Set((schema?.fields ?? []).filter((f) => f.lockedForAgents).map((f) => f.key));
  }

  private async record(a: AgentConfig, req: RunRequest, status: AgentRun["status"], startedAt: number, durationMs: number, extra: Partial<AgentRun>) {
    await this.deps.store.saveAgentRun({
      id: this.deps.newId(), sessionId: req.session.id, messageId: req.messageId, agentId: a.id, trigger: req.trigger,
      status, startedAt, durationMs: Math.max(0, durationMs), ...(req.direction?.trim() ? { direction: req.direction.trim() } : {}), ...extra,
    });
  }
}

/** The characters of a session that trackers can track (in the cast and not switched off), with their shown names. */
/** Is the user one of the people of this session? Not in Director mode (D-031): they steer from outside the story. */
export async function userInStory(store: SqlStore, session: Session): Promise<boolean> {
  const story = session.storyId ? await store.getStory(session.storyId) : undefined;
  return (story?.userRole ?? session.userRole) !== "director";
}

export async function castOf(store: SqlStore, session: Session): Promise<TrackerCastMember[]> {
  const out: TrackerCastMember[] = [];
  for (const m of session.cast) {
    if (!m.characterId || m.presence === "off") continue;
    const c = await store.getCharacter(m.characterId);
    if (c && !out.some((x) => x.id === c.id)) out.push({ id: c.id, name: effectiveCharacter(c, m.variantId).name });
  }
  // NPCs of the story and of the session (D-029), keyed by name like people a tracker adds from the story ("n:<Name>"),
  // so an NPC the tracker already met keeps its values
  const story = session.storyId ? await store.getStory(session.storyId) : undefined;
  for (const npc of await store.npcsForUse([...(story?.npcIds ?? []), ...session.npcIds])) {
    const id = `n:${npc.name}`;
    if (!out.some((x) => x.id === id || x.name === npc.name)) out.push({ id, name: npc.name });
  }
  return out;
}

// ---------------------------------------------------------------- ordering helpers

/** Ids of agents caught in a dependency cycle (only counting agents in this list). */
export function findCycles(entries: AgentEntry[]): Set<string> {
  const ids = new Set(entries.map((e) => e.config.id));
  const deps = new Map(entries.map((e) => [e.config.id, e.config.input.readsAgents.filter((d) => ids.has(d))]));
  const bad = new Set<string>();
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, stack: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { for (const s of stack.slice(stack.indexOf(id))) bad.add(s); return; }
    state.set(id, 1);
    for (const d of deps.get(id) ?? []) visit(d, [...stack, d]);
    state.set(id, 2);
  };
  for (const id of ids) visit(id, [id]);
  return bad;
}

/** Dependencies first, then by `order`, then by id. */
export function topoSort(entries: AgentEntry[]): AgentEntry[] {
  return levels(entries).flatMap((l) => l);
}

/** Groups agents so each group only depends on earlier groups. */
export function levels(entries: AgentEntry[]): AgentEntry[][] {
  const ids = new Set(entries.map((e) => e.config.id));
  const remaining = [...entries].sort((a, b) => a.config.order - b.config.order || a.config.id.localeCompare(b.config.id));
  const placed = new Set<string>();
  const out: AgentEntry[][] = [];
  while (remaining.length) {
    const level = remaining.filter((e) => e.config.input.readsAgents.every((d) => !ids.has(d) || placed.has(d)));
    if (!level.length) { out.push(remaining.splice(0)); break; } // cycles are filtered before; safety net
    for (const e of level) { placed.add(e.config.id); remaining.splice(remaining.indexOf(e), 1); }
    out.push(level);
  }
  return out;
}

/** A repeatable number in [0, 1) from a text (FNV-1a). */
export function seededUnit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

/** A repeatable sequence of numbers in [0, 1) from a text (each call gives the next one). D-047. */
export function seededSequence(text: string): () => number {
  let i = 0;
  return () => seededUnit(`${text}#${i++}`);
}
