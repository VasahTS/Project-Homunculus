// Homunculus 2 — agents as data: storage helpers for the UI (slice 5, D-047). Author: CLAUDE, 2026-10-30.
// An agent here is any AgentConfig that is not a tracker (trackers are agents with output "state", see trackers.ts).
// The app knows no agent by name: the starter agents are editable data, one small example per kind, for testing.
import type { AgentConfig, AgentConfigInput, AgentOutputKind, Session, SetupLayer, Story } from "@homunculus/schemas";
import type { SqlStore } from "@homunculus/core";
import { layerHasTracker, layerWithTracker } from "./trackers.ts";

/** What an agent does, in the words the screens use (never "inject" or "intercept"). */
export interface AgentKind {
  output: AgentOutputKind;
  label: string;
  short: string;
  /** A colour token for the small dot beside the kind (always shown with words). */
  color: string;
  /** When a new agent of this kind runs. */
  when: AgentWhen;
}
export const AGENT_KINDS: AgentKind[] = [
  { output: "inject", label: "Adds to the prompt", short: "Adds to prompt", color: "var(--place-character)", when: "before" },
  { output: "rewrite", label: "Rewrites the reply", short: "Rewrites", color: "var(--place-examples)", when: "after" },
  { output: "check", label: "Checks the reply", short: "Checks", color: "var(--warn)", when: "after" },
  { output: "choices", label: "Offers choices", short: "Choices", color: "var(--place-chat)", when: "after" },
  { output: "note", label: "Writes a side note", short: "Notes", color: "var(--place-note)", when: "after" },
  { output: "intercept", label: "Rewrites your message", short: "Your message", color: "var(--place-outlet)", when: "before" },
  { output: "proposal", label: "Updates the story's lorebook", short: "Lorebook", color: "var(--accent)", when: "everyN" },
];
export const kindOf = (a: AgentConfig): AgentKind | undefined => AGENT_KINDS.find((k) => k.output === a.output);
export const isAgent = (a: AgentConfig): boolean => !!kindOf(a);

/** When it runs, in plain words. */
export type AgentWhen = "before" | "after" | "everyN" | "manual";
export const WHEN_LABELS: Record<AgentWhen, string> = {
  before: "Before every reply", after: "After every reply", everyN: "Every N messages", manual: "Only when I ask",
};
export function whenOf(a: AgentConfig): { when: AgentWhen; n: number } {
  const t = a.triggers[0];
  if (t?.on === "everyN") return { when: "everyN", n: t.n };
  if (t?.on === "manual") return { when: "manual", n: 10 };
  if (t?.on === "turn") return { when: t.phase === "before" ? "before" : "after", n: 10 };
  return { when: "after", n: 10 };
}
export function triggersFor(when: AgentWhen, n: number): AgentConfig["triggers"] {
  if (when === "everyN") return [{ on: "everyN", n: Math.max(1, Math.round(n) || 1) }];
  if (when === "manual") return [{ on: "manual" }];
  return [{ on: "turn", phase: when }];
}
export const whenText = (a: AgentConfig): string => {
  const w = whenOf(a);
  return w.when === "everyN" ? `Every ${w.n} messages` : WHEN_LABELS[w.when];
};

export async function listAgents(store: SqlStore): Promise<AgentConfig[]> {
  return (await store.agentConfigs.list()).filter(isAgent).sort((a, b) => a.name.localeCompare(b.name));
}

export function blankAgent(output: AgentOutputKind = "inject"): AgentConfigInput {
  const kind = AGENT_KINDS.find((k) => k.output === output) ?? AGENT_KINDS[0]!;
  return {
    id: `agent-${crypto.randomUUID()}`, name: "", help: "", triggers: triggersFor(kind.when, output === "proposal" ? 4 : 10), output,
    ...(output === "proposal" ? { proposal: { target: "lorebook" as const } } : {}),
    runMode: output === "inject" ? "text" : "separate", prompt: "",
    input: { messages: output === "inject" ? 0 : 4, lorebooks: false, cards: output !== "inject", state: false, readsAgents: [], persona: false, scenario: false },
    ...(output === "inject" ? { injection: { position: "depth" as const, depth: 1, role: "system" as const } } : {}),
    ...(output === "check" ? { check: { onFail: "warn" as const, maxRetries: 1 } } : {}),
    ...(output === "note" ? { display: { note: "message" as const } } : {}),
  };
}

/** Changing the kind keeps the name, text and conditions; kind-only options are reset to that kind's defaults. */
export function withKind(a: AgentConfig, output: AgentOutputKind): AgentConfigInput {
  const fresh = blankAgent(output);
  const { injection: _i, check: _c, display: _d, proposal: _p, ...rest } = a;
  return { ...rest, ...fresh, id: a.id, name: a.name, help: a.help, prompt: a.prompt, conditions: a.conditions, order: a.order, limits: a.limits, randomness: a.randomness };
}

export async function saveAgent(store: SqlStore, a: AgentConfigInput): Promise<AgentConfig> {
  return store.saveAgentConfig({ ...a, name: a.name.trim() || "Untitled agent", source: a.source ?? { kind: "user" } });
}

/** Deletes the agent and switches it off wherever a story, chat or the Default turned it on. */
export async function deleteAgent(store: SqlStore, id: string): Promise<void> {
  const clean = (l: SetupLayer): SetupLayer => {
    let out = layerWithTracker(l, id, false);
    if (out.agents?.mode === "add" && out.agents.remove.includes(id)) out = { ...out, agents: { ...out.agents, remove: out.agents.remove.filter((x) => x !== id) } };
    if (out.agentOverrides?.[id]) { const o = { ...out.agentOverrides }; delete o[id]; out = { ...out, agentOverrides: o }; }
    return out;
  };
  const touches = (l: SetupLayer) => !!(l.agents?.add.includes(id) || l.agents?.remove.includes(id) || l.agentOverrides?.[id]);
  for (const s of await store.listSessions()) if (touches(s.setup)) await store.saveSession({ ...s, setup: clean(s.setup) });
  for (const st of await store.listStories()) if (touches(st.setup)) await store.saveStory({ ...st, setup: clean(st.setup) });
  const def = await store.getDefaultSetup();
  if (touches(def)) await store.setDefaultSetup(clean(def));
  await store.agentConfigs.delete(id);
}

/** Where an agent is on: stories that switch it on, and chats that do it themselves. */
export function onInText(id: string, stories: Story[], sessions: Session[]): string {
  const st = stories.filter((s) => layerHasTracker(s.setup, id)).length;
  const ch = sessions.filter((s) => s.setup.agents?.add.includes(id)).length;
  const parts = [st ? `${st} ${st === 1 ? "story" : "stories"}` : "", ch ? `${ch} ${ch === 1 ? "chat" : "chats"}` : ""].filter(Boolean);
  return parts.join(", ") || "—";
}

// ---------------------------------------------------------------- starter agents (one small example per kind)

const STARTER_KEY = "starterAgents";
const before = [{ on: "turn" as const, phase: "before" as const }];
const after = [{ on: "turn" as const, phase: "after" as const }];
const starter = (a: AgentConfigInput): AgentConfigInput => ({ ...a, source: { kind: "builtin", from: "starter" } });

export const STARTER_AGENTS: AgentConfigInput[] = [
  starter({
    id: "starter-dont-write-for-user", name: "Don't Write for User", help: "Keeps the AI from acting or speaking for you.",
    triggers: before, output: "inject", runMode: "text", input: { messages: 0, lorebooks: false, cards: false, state: false, readsAgents: [] },
    injection: { position: "depth", depth: 1, role: "system" },
    prompt: "Never write {{user}}'s actions, words, thoughts or feelings. Only {{char}} and the other characters act and speak. When it is {{user}}'s turn to act, stop and leave room for them.",
  }),
  starter({
    id: "starter-grounded-complication", name: "Grounded Complication", help: "Sometimes adds one small, realistic problem to the scene (40% of replies).",
    triggers: before, output: "inject", runMode: "text", input: { messages: 0, lorebooks: false, cards: false, state: false, readsAgents: [] },
    injection: { position: "depth", depth: 1, role: "system" },
    conditions: { keywords: [], probability: 40, generationTypes: [], roles: [], minMessages: 0, state: [] },
    prompt: "In this reply, add one realistic complication: {{random::something breaks or goes missing::someone arrives at the wrong moment::the weather turns::a small misunderstanding::a cost or a delay appears}}. Keep it grounded and do not derail the plot.",
  }),
  starter({
    id: "starter-prose-polisher", name: "Prose Polisher", help: "Rewrites each reply to remove repeated phrases and stock wording. An example; it will be redone later.",
    triggers: after, output: "rewrite", runMode: "separate", input: { messages: 0, lorebooks: false, cards: false, state: false, readsAgents: [] },
    prompt: "You are a careful line editor. Rewrite the reply so it keeps every event, every line of dialogue and the same length, but removes repeated phrases, stock similes and closing lines that explain the scene. Keep {{char}}'s voice.",
  }),
  starter({
    id: "starter-user-agency-check", name: "User Agency Check", help: "Warns when a reply decides something for you.",
    triggers: after, output: "check", runMode: "separate", input: { messages: 2, lorebooks: false, cards: false, state: false, readsAgents: [] },
    check: { onFail: "warn", maxRetries: 1 },
    prompt: "Check whether the reply writes {{user}}'s actions, words or decisions. It passes when only {{char}} and the other characters act. When it fails, say in one short sentence what it decided for {{user}}.",
  }),
  starter({
    id: "starter-cyoa-choices", name: "CYOA Choices", help: "Offers a few options for what you could do next, as buttons.",
    triggers: after, output: "choices", runMode: "separate", input: { messages: 4, lorebooks: false, cards: true, state: false, readsAgents: [] },
    prompt: "Offer 3 or 4 options for what {{user}} could do next. Each under 12 words, in the second person, clearly different from each other, and possible in the scene.",
  }),
  starter({
    id: "starter-continuity", name: "Continuity", help: "Points out contradictions with earlier messages, as a small note under the reply.",
    triggers: after, output: "note", runMode: "separate", input: { messages: 12, lorebooks: false, cards: true, state: true, readsAgents: [] },
    display: { note: "message" },
    prompt: "You check continuity. Compare the reply with the earlier messages and the cards. List contradictions (names, places, times, objects, what someone knows) in one or two short sentences each. If there are none, answer exactly: Nothing to note.",
  }),
  starter({
    id: "starter-actor-interview", name: "Actor Interview", help: "Only when you ask: the character steps outside the story and talks about the latest scene.",
    triggers: [{ on: "manual" }], output: "note", runMode: "separate", input: { messages: 6, lorebooks: false, cards: true, state: false, readsAgents: [] },
    display: { note: "menu" },
    prompt: "Step outside the story. As the actor who plays {{char}}, talk briefly about the latest scene: what {{char}} felt, what they hid, and what they want next. Three to five sentences, first person.",
  }),
  starter({
    id: "starter-lorebook-keeper", name: "Lorebook Keeper", help: "Every 4 messages, writes new facts the story established into the story's own version of its lorebook. The Library's book is never changed.",
    triggers: [{ on: "everyN", n: 4 }], output: "proposal", runMode: "separate", proposal: { target: "lorebook" },
    input: { messages: 8, lorebooks: true, cards: true, state: false, readsAgents: [], persona: false, scenario: false },
    prompt: "You keep the story's lorebook. From the latest messages, note lasting facts the story established (places, factions, abilities, people's histories, rules of the world) that the lorebook does not have yet. Skip passing details and anything only implied. Write each as a short entry with keywords that would bring it up.",
  }),
  starter({
    id: "starter-class-chat", name: "Class Group Chat", help: "A view example: what classmates post in their group chat about the latest scene.",
    triggers: [{ on: "turn", phase: "after" }], output: "note", runMode: "separate", display: { note: "view", view: "feed" },
    input: { messages: 4, lorebooks: false, cards: true, state: false, readsAgents: [], persona: false, scenario: false },
    prompt: "Write what people who saw or heard about the latest scene would post in a group chat: short, casual, in their own voices, reacting to what just happened.",
  }),
  starter({
    id: "starter-expand-my-action", name: "Expand My Action", help: "Turns a short message of yours into a fuller action before the AI reads it. Off by default; try it.",
    triggers: before, output: "intercept", runMode: "separate", input: { messages: 2, lorebooks: false, cards: false, state: false, readsAgents: [] },
    prompt: "Rewrite {{user}}'s message as a short, vivid paragraph in the same person and tense. Keep exactly what they do and say; add no new decisions or dialogue.",
  }),
];

/** Installs the starter agents once. One the user deleted is not brought back; one that exists is not overwritten. */
export async function installStarterAgents(store: SqlStore): Promise<void> {
  const installed = new Set((await store.getAppSetting<string[]>(STARTER_KEY)) ?? []);
  let changed = false;
  for (const a of STARTER_AGENTS) {
    if (installed.has(a.id)) continue;
    if (!(await store.agentConfigs.get(a.id))) await store.saveAgentConfig(a);
    installed.add(a.id);
    changed = true;
  }
  if (changed) await store.setAppSetting(STARTER_KEY, [...installed]);
}
