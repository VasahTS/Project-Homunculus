// Homunculus 2 — agent groups (D-134). Author: CLAUDE, 2026-11-16.
// Daniel: "picking each agent one by one when making a Kit is unfair". A group is a named list of agents the user saves
// once and switches on (or off) in one click in a setup's "Choose Agents…" window. The Assistant can use groups too, by
// name, when it makes a Kit or changes a story's agents. A group holds ids only: switching it on copies its agents into
// the layer (the layer never points at the group), so changing a group later never changes stories already set up.
import { useSyncExternalStore } from "react";

export interface AgentGroup { id: string; name: string; agentIds: string[] }

const KEY = "agentGroups";
interface Store { getAppSetting<T>(key: string): Promise<T | undefined>; setAppSetting(key: string, value: unknown): Promise<void> }

/** Keeps only well-formed groups, with a name, no repeated ids, and in name order. */
export function cleanGroups(raw: unknown): AgentGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentGroup[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const { id, name, agentIds } = g as Partial<AgentGroup>;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name.trim()) continue;
    if (out.some((x) => x.id === id)) continue;
    const ids = Array.isArray(agentIds) ? [...new Set(agentIds.filter((x): x is string => typeof x === "string" && !!x))] : [];
    out.push({ id, name: name.trim(), agentIds: ids });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The saved groups, read from storage (the Assistant's tools read them this way). */
export async function loadAgentGroups(store: Store): Promise<AgentGroup[]> {
  return cleanGroups(await store.getAppSetting<unknown>(KEY).catch(() => undefined));
}

export async function saveAgentGroups(store: Store, groups: AgentGroup[]): Promise<void> {
  await store.setAppSetting(KEY, cleanGroups(groups));
}

/** A group by id or by name (any case), for the Assistant ("use my RPG group"). */
export function findGroup(groups: AgentGroup[], key: string): AgentGroup | undefined {
  const k = key.trim().replace(/^group:/i, "").toLowerCase();
  return groups.find((g) => g.id.toLowerCase() === k) ?? groups.find((g) => g.name.toLowerCase() === k);
}

// ---------------------------------------------------------------- shared state for the screens

let store: Store | null = null;
let groups: AgentGroup[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** Called once the app has its storage (App, at start). */
export async function initAgentGroups(s: Store): Promise<void> {
  if (store === s) return;
  store = s;
  groups = await loadAgentGroups(s);
  emit();
}

/** Changes the groups; the screens update at once, storage follows. */
export function changeAgentGroups(change: (g: AgentGroup[]) => AgentGroup[]): void {
  groups = cleanGroups(change(groups));
  emit();
  if (store) void saveAgentGroups(store, groups).catch(() => {});
}

export function useAgentGroups(): AgentGroup[] {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => groups, () => groups);
}
