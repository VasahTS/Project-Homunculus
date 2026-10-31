// Homunculus 2 — where each piece of a prompt came from, in words. Author: CLAUDE, 2026-10-27 (in ReplyPane);
// moved here and extended for presets 2026-10-28 (slice 2, D-021); 2026-10-28 (D-023): plain names + a category
// (with its color token) so the Preview and the Reply tab can group and color the pieces.
import type { Tracker } from "../trackers.ts";

export type SourceCategory = "preset" | "character" | "persona" | "scene" | "lore" | "history" | "agent" | "other";

export const CATEGORY_LABELS: Record<SourceCategory, string> = {
  preset: "Preset text", character: "Character card", persona: "Your persona", scene: "Current scene",
  lore: "Lorebooks", history: "Chat history", agent: "Agents", other: "Other",
};

/** CSS color of a category (tokens in theme/tokens.css). */
export const categoryColor = (c: SourceCategory) => `var(--cat-${c})`;

const agentName = (id: string, trackers: Tracker[]) => trackers.find((t) => t.agent.id === id)?.agent.name ?? id;

export function sourceInfo(source: string, trackers: Tracker[]): { label: string; category: SourceCategory } {
  if (source === "history") return { label: "Chat history", category: "history" };
  if (source.startsWith("narrator:")) return { label: source === "narrator:inChat" ? "Narrator in chat" : "Narrator instructions", category: "character" };
  if (source === "card") return { label: "Character card", category: "character" };
  if (source.startsWith("card:")) {
    const field = ({ description: "Description", personality: "Personality", scenario: "Scenario", examples: "Example dialogue", systemPrompt: "Card's own main prompt", note: "Character's Note" } as Record<string, string>)[source.slice(5)];
    return { label: `Character: ${field ?? source.slice(5)}`, category: "character" };
  }
  if (source === "session:scenario") return { label: "Session scenario", category: "character" };
  if (source === "postHistory") return { label: "Card's post-history instructions", category: "character" };
  if (source === "agent:memory") return { label: "Memory: the story so far", category: "history" };
  if (source === "persona") return { label: "Persona", category: "persona" };
  if (source === "authorsNote") return { label: "Author's Note", category: "other" };
  if (source === "prefill") return { label: "Reply start (prefill)", category: "preset" };
  if (source.startsWith("lore:")) return { label: "Lorebooks", category: "lore" };
  if (source.startsWith("block:")) return { label: `Preset: ${source.slice(6)}`, category: "preset" };
  const i = source.indexOf(":");
  const kind = i < 0 ? source : source.slice(0, i);
  const id = i < 0 ? "" : source.slice(i + 1);
  const name = id ? agentName(id, trackers) : source;
  if (kind === "state") return { label: `Scene: ${name.replace(/^Scene:\s*/, "")}`, category: "scene" };
  if (kind === "agent") return { label: `Agent: ${name}`, category: "agent" };
  if (kind === "inline") return { label: `Agent instructions: ${name}`, category: "agent" };
  return { label: source, category: "other" };
}

export const sourceLabel = (source: string, trackers: Tracker[]): string => sourceInfo(source, trackers).label;

/** "system" → "System", "assistant" → "AI", "user" → "User": how a piece is sent. */
export const roleLabel = (role: string) => (role === "assistant" ? "AI" : role === "user" ? "User" : "System");
