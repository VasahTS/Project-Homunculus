// Homunculus 2 — the agent runner (BLUEPRINT §4.1–4.2). Author: CLAUDE, 2026-10-27.
//
// One place runs every agent, built in or made by the user:
//  - picks the agents of the resolved setup that match the trigger and their conditions,
//  - orders them (dependencies, then waves: text-changing agents in sequence, readers in parallel),
//  - gives each one its context and connection (with limits and Stop),
//  - validates the answer, applies it (state, notes, revisions) and records what happened.
// One agent failing never stops the others, and never loses the reply.
import { AgentConfig, type AgentOutputKind, type AgentRun, type Character, type GenerationType, type Message, type Session, type TrackerSchema } from "@homunculus/schemas";
import type { HomunculusCore } from "../core.ts";
import { errorText } from "../core.ts";
import { isAbort } from "../connections.ts";
import type { AgentDefinition, AgentRunContext, Completion, ConnectionConfig } from "../extensions.ts";
import type { ResolvedSetup } from "../setup.ts";
import { readStatePath, type ResolvedState } from "../state.ts";
import type { SqlStore } from "../storage/store.ts";
import { OUTPUT_SHAPES, separateExecutor } from "./outputs.ts";
import { normalizeTrackerAnswer, trackerPeople, type TrackerCastMember } from "../trackers.ts";
import { applyBasicMacros, expandMacros } from "../macros.ts";
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
    const { core, store } = this.deps;
    const a = entry.config;
    const started = this.deps.now();
    const usage: Usage = {};
    await core.events.emit("agent.started", { agentId: a.id, messageId: req.messageId, trigger: req.trigger });
    try {
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
      const shape = entry.definition?.output ?? OUTPUT_SHAPES[a.output];
      const parsed = shape.safeParse(raw);
      if (!parsed.success) throw new Error(`Answer had the wrong shape: ${parsed.error.message}`);
      await this.apply(entry, req, parsed.data);
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
    // the agent's own connection, else the setup's connection for agents, else the story's
    const wanted = override?.connectionId ?? req.setup.agentConnectionId;
    const connection = (wanted ? req.connections?.[wanted] : undefined) ?? this.deps.resolveConnection(wanted, req.mainConnection);
    const ownValues = a.state?.namespace ? state[a.state.namespace] : undefined;
    const cards = a.input.cards ? await this.cardsText(req) : "";
    const persona = a.input.persona && this.deps.persona ? (await this.deps.persona(req.session, req.setup)).trim() : "";
    const story = a.input.scenario && req.session.storyId ? await store.getStory(req.session.storyId) : undefined;
    const scenario = a.input.scenario ? (req.session.scenario.trim() || story?.scenario?.trim() || "") : "";
    const lore = a.input.lorebooks ? await this.loreText(path) : "";
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
      settings: { ...(override?.settings ?? {}) },
      names: req.names,
      signal: req.signal,
      ...(tracker ? { tracker: { schema: tracker.schema, people: trackerPeople(tracker.schema, ownValues, tracker.cast, req.names.user, tracker.withUser) } } : {}),
      ...(cards ? { cards } : {}),
      ...(persona ? { persona } : {}),
      ...(scenario ? { scenario } : {}),
      ...(lore ? { lore } : {}),
      complete: async (messages, options) => {
        const c = await core.connections.complete(connection, messages, { signal: req.signal, maxTokens: options?.maxTokens ?? a.limits.maxTokens });
        usage.prompt = [...(usage.prompt ?? []), ...messages.map((m) => ({ role: m.role, content: m.content }))];
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
    const a = entry.config;
    const started = this.deps.now();
    const usage: Usage = {};
    const forced: RunRequest = connection ? { ...req, setup: { ...req.setup, agentConnectionId: null, agentOverrides: { ...req.setup.agentOverrides, [a.id]: { ...req.setup.agentOverrides[a.id], connectionId: null } } }, mainConnection: connection, connections: {} } : req;
    try {
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
      const shape = entry.definition?.output ?? OUTPUT_SHAPES[a.output];
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
  private async apply(entry: AgentEntry, req: RunRequest, output: unknown): Promise<void> {
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
        await store.addNote({ id: this.deps.newId(), sessionId: req.session.id, messageId: req.messageId, agentId: a.id, content: String(output), createdAt: this.deps.now() });
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
      default:
        return;
    }
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
      status, startedAt, durationMs: Math.max(0, durationMs), ...extra,
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
