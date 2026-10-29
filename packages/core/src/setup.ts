// Homunculus 2 — resolving the layered Setup (BLUEPRINT §3). Author: CLAUDE, 2026-10-27.
//
// builtin → default → story → session. A field missing from a layer is inherited (a 1:1 chat has no story layer).
// This is the ONLY place that reads layers; everything else uses the ResolvedSetup.
import type { AgentOverride, ListOverride, SetupLayer, SetupLevel, TurnOrder } from "@homunculus/schemas";

/** The Author's Note with every field filled (SillyTavern's defaults: every turn, in the chat 4 back, as System). */
export interface ResolvedAuthorsNote { text: string; interval: number; position: "inChat" | "afterMain" | "beforeMain"; depth: number; role: "system" | "user" | "assistant" }
export const AUTHORS_NOTE_DEFAULTS: ResolvedAuthorsNote = { text: "", interval: 1, position: "inChat", depth: 4, role: "system" };

export interface ResolvedSetup {
  presetId: string | null;
  personaId: string | null;
  personaVariantId: string | null;
  connectionId: string | null;
  /** Connection for agents without their own (null = the main one). */
  agentConnectionId: string | null;
  lorebooks: string[];
  agents: string[];
  agentOverrides: Record<string, AgentOverride>;
  storyStyle: Record<string, string>;
  turnOrder: TurnOrder;
  trackersOnSwipe: boolean;
  limits: { autoPlayMaxTurns?: number; maxSessionCost?: number };
  extra: Record<string, unknown>;
  authorsNote: ResolvedAuthorsNote;
  /** Which layer each value came from, for the UI ("from the story"). Keys: field name, or "agents:<id>". */
  sources: Record<string, SetupLevel>;
}

export const BUILTIN_SETUP: SetupLayer = {
  presetId: null,
  personaId: null,
  personaVariantId: null,
  connectionId: null,
  agentConnectionId: null,
  turnOrder: "natural",
  trackersOnSwipe: true,
};

export interface SetupLayers {
  default?: SetupLayer;
  story?: SetupLayer;
  session?: SetupLayer;
}

function applyList(current: string[], override: ListOverride | undefined): string[] {
  if (!override || override.mode === "keep") return current;
  if (override.mode === "only") return [...new Set(override.add)];
  const removed = new Set(override.remove);
  return [...new Set([...current.filter((id) => !removed.has(id)), ...override.add])];
}

/** Merges the layers. Later layers win; lists follow keep / only / add. */
export function resolveSetup(layers: SetupLayers, builtin: SetupLayer = BUILTIN_SETUP): ResolvedSetup {
  const ordered: Array<[SetupLevel, SetupLayer | undefined]> = [
    ["builtin", builtin], ["default", layers.default], ["story", layers.story], ["session", layers.session],
  ];
  const out: ResolvedSetup = {
    presetId: null, personaId: null, personaVariantId: null, connectionId: null, agentConnectionId: null,
    lorebooks: [], agents: [], agentOverrides: {}, storyStyle: {}, turnOrder: "natural",
    trackersOnSwipe: true, limits: {}, extra: {}, authorsNote: { ...AUTHORS_NOTE_DEFAULTS }, sources: {},
  };
  const scalars = ["presetId", "personaId", "personaVariantId", "connectionId", "agentConnectionId", "turnOrder", "trackersOnSwipe"] as const;

  for (const [level, layer] of ordered) {
    if (!layer) continue;
    for (const key of scalars) {
      if (layer[key] !== undefined) {
        (out as unknown as Record<string, unknown>)[key] = layer[key];
        out.sources[key] = level;
      }
    }
    for (const key of ["lorebooks", "agents"] as const) {
      const o = layer[key];
      if (o && o.mode !== "keep") {
        const before = new Set(out[key]);
        out[key] = applyList(out[key], o);
        out.sources[key] = level;
        for (const id of out[key]) if (!before.has(id)) out.sources[`${key}:${id}`] = level;
      }
    }
    for (const [agentId, ov] of Object.entries(layer.agentOverrides ?? {})) {
      const prev = out.agentOverrides[agentId] ?? {};
      out.agentOverrides[agentId] = {
        ...prev,
        ...ov,
        settings: { ...(prev.settings ?? {}), ...(ov.settings ?? {}) },
      };
      out.sources[`agentOverrides:${agentId}`] = level;
    }
    // the Author's Note: each field on its own ("authorsNote.text" from the story, "authorsNote.depth" from the chat…)
    for (const [k, v] of Object.entries(layer.authorsNote ?? {})) {
      if (v === undefined) continue;
      (out.authorsNote as unknown as Record<string, unknown>)[k] = v;
      out.sources[`authorsNote.${k}`] = level;
    }
    if (layer.storyStyle) {
      out.storyStyle = { ...out.storyStyle, ...layer.storyStyle };
      out.sources.storyStyle = level;
    }
    if (layer.limits) {
      out.limits = { ...out.limits, ...layer.limits };
      out.sources.limits = level;
    }
    if (layer.extra) {
      out.extra = { ...out.extra, ...layer.extra };
      for (const k of Object.keys(layer.extra)) out.sources[`extra:${k}`] = level;
    }
  }
  return out;
}
