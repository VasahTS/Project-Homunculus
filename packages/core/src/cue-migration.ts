// Homunculus 2 — "No AI call" agents become cues (D-113: agents think, cues react). Author: CLAUDE, 2026-11-10.
//
// Runs when the app opens (cheap: it only looks at agents with runMode "text"). Each such agent becomes a cue with the
// same id, the same text, place, tests and chance (`cueFromTextAgent`, tested to give the same prompt), and every setup
// that switched the agent on or off now switches the cue the same way. The agent is then removed; the cue keeps it in
// `original`. Bundles from older versions go through `textAgentsToCues` when they are imported.
import type { AgentConfig, ListOverride, SetupLayer } from "@homunculus/schemas";
import { prepared } from "./agents/styles.ts";
import { cueFromTextAgent, cueNamespace } from "./cues.ts";
import type { SqlStore } from "./storage/store.ts";

export interface MovedAgent { id: string; name: string; notes: string[] }

/** Is this an agent that only adds its own text (the mode that moved to cues)? */
export const isTextAgent = (a: AgentConfig) => a.runMode === "text";

/** A setup layer with these agent ids moved from its agents list to its cues list (null = nothing to move). */
export function moveIdsToCues(layer: SetupLayer, ids: ReadonlySet<string>): SetupLayer | null {
  const a = layer.agents;
  const overrides = Object.keys(layer.agentOverrides ?? {}).filter((k) => ids.has(k));
  if ((!a || a.mode === "keep" || (!a.add.some((x) => ids.has(x)) && !a.remove.some((x) => ids.has(x)))) && !overrides.length) return null;
  const next: SetupLayer = { ...layer };
  if (a && a.mode !== "keep") {
    const add = a.add.filter((x) => ids.has(x)), remove = a.remove.filter((x) => ids.has(x));
    next.agents = { ...a, add: a.add.filter((x) => !ids.has(x)), remove: a.remove.filter((x) => !ids.has(x)) };
    if (add.length || remove.length) {
      // no cues existed before, so "only these agents" becomes "these cues too" (nothing above to leave out)
      const c: ListOverride = layer.cues && layer.cues.mode !== "keep" ? layer.cues : { mode: "add", add: [], remove: [] };
      next.cues = { mode: c.mode === "only" ? "only" : "add", add: [...new Set([...c.add, ...add])], remove: [...new Set([...c.remove, ...remove])] };
    }
  }
  if (overrides.length) next.agentOverrides = Object.fromEntries(Object.entries(layer.agentOverrides!).filter(([k]) => !ids.has(k)));
  return next;
}

/** Moves every "No AI call" agent to a cue. Returns what moved (empty when there was nothing to do). */
export async function moveTextAgentsToCues(store: SqlStore): Promise<MovedAgent[]> {
  const agents = (await store.agentConfigs.list()).filter(isTextAgent);
  if (!agents.length) return [];
  const taken = new Set((await store.cues.list()).map((c) => c.namespace));
  const moved: MovedAgent[] = [];
  for (const a of agents) {
    if (await store.cues.get(a.id)) { await store.agentConfigs.delete(a.id); continue; } // moved before, the agent came back
    const namespace = cueNamespace(a.name, taken);
    taken.add(namespace);
    const { cue, notes } = cueFromTextAgent(a, { id: a.id, namespace, text: prepared(a).prompt });
    await store.saveCue({ ...cue, source: a.source.kind === "builtin" ? { kind: "example", from: a.source.from ?? "starter" } : cue.source });
    moved.push({ id: a.id, name: a.name, notes });
  }
  const ids = new Set(moved.map((m) => m.id));
  await store.rewriteSetupLayers((layer) => moveIdsToCues(layer, ids));
  for (const id of ids) await store.agentConfigs.delete(id);
  return moved;
}
