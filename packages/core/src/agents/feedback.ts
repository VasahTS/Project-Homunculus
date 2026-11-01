// Homunculus 2 — notes back to the story's AI (D-057). Author: CLAUDE, 2026-10-31.
//
// Daniel (31/10): "the notes are not being sent back to the AI". In v1 a companion could "feed recent notes into future
// generations". Here a note agent's latest notes on this branch go into the next reply's prompt, where the agent's
// `injection` says (default: in the chat, 1 message back, as System — right after the reply they talk about).
// Notes shown in the chat (a label or a card) go back by default; views (feeds, phones…) and panel-only notes don't.
import type { AgentConfig, Message } from "@homunculus/schemas";
import type { PromptInjection } from "../presets.ts";
import type { SqlStore } from "../storage/store.ts";

/** Whether the story's AI sees this agent's notes, and how many of the latest. */
export function noteFeedback(a: AgentConfig): { on: boolean; notes: number } {
  if (a.output !== "note") return { on: false, notes: 1 };
  if (a.feedback) return { on: a.feedback.on, notes: a.feedback.notes };
  const how = a.display?.note ?? "message";
  return { on: how === "message" || how === "card" || how === "hidden", notes: 1 };
}

/**
 * The injections that carry note agents' latest notes into the next prompt. `history` is the branch up to the message
 * the reply answers (oldest first). Only notes on messages of this branch count, so other branches never leak in.
 */
export async function noteInjections(store: SqlStore, agents: AgentConfig[], history: Message[]): Promise<PromptInjection[]> {
  const out: PromptInjection[] = [];
  // Before/parallel agents attach notes to the user message they run on. CODEX.
  const replies = [...history].reverse();
  for (const a of agents) {
    const f = noteFeedback(a);
    if (!f.on) continue;
    const found: string[] = [];
    for (const m of replies) {
      if (found.length >= f.notes) break;
      const notes = await store.listNotes(m.id, a.id);
      const latest = notes.at(-1)?.content.trim();
      if (latest) found.push(latest);
    }
    if (!found.length) continue;
    const text = `[${a.name} — ${found.length === 1 ? "note on the latest reply" : `latest ${found.length} notes, oldest first`}]\n${found.reverse().join("\n\n")}`;
    const i = a.injection;
    out.push({ agentId: a.id, text, position: i?.position ?? "depth", depth: i?.depth ?? 1, role: i?.role ?? "system" });
  }
  return out;
}
