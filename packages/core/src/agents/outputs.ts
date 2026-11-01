// Homunculus 2 — what each agent output kind looks like, and the built-in "separate" executor.
// BLUEPRINT §4.1. Author: CLAUDE, 2026-10-27.
import type { AgentConfig, AgentOutputKind } from "@homunculus/schemas";
import { z } from "zod";
import type { AgentRunContext, ChatTurn } from "../extensions.ts";
import { applyBasicMacros } from "../macros.ts";
import { trackerInstruction, valuesWithNames } from "../trackers.ts";

const JsonObject = z.record(z.string(), z.unknown());

/** The shape a data agent's answer must have, per output kind. */
export const OUTPUT_SHAPES: Record<AgentOutputKind, z.ZodType<unknown>> = {
  inject: z.string(),
  intercept: z.string().min(1),
  rewrite: z.string().min(1),
  state: JsonObject,
  note: z.string(),
  check: z.object({ pass: z.boolean(), reason: z.string().default("") }),
  choices: z.array(z.string().min(1)).min(1),
  proposal: z.object({ target: z.string(), change: z.unknown(), reason: z.string().default("") }),
  speaker: z.string().min(1),
  media: z.unknown(),
};

const STRUCTURED = new Set<AgentOutputKind>(["state", "check", "choices", "proposal"]);

/** A lorebook proposal's answer (D-049): new facts as entries; an entry with an existing title updates it. */
export const LORE_PROPOSAL = z.object({
  entries: z.array(z.object({ title: z.string().min(1), keys: z.array(z.string()).default([]), content: z.string().min(1) })).default([]),
});
export type LoreProposal = z.infer<typeof LORE_PROPOSAL>;

/** The views an agent can draw with (note = "view", D-049), and the JSON each one expects. */
export const VIEW_FORMATS = {
  feed: 'Answer with ONLY JSON: {"posts": [{"name": "who posts", "text": "what they write"}]} — 3 to 6 short posts.',
  phone: 'Answer with ONLY JSON: {"messages": [{"from": "sender", "time": "in-story time", "text": "message"}]}.',
  sheet: 'Answer with ONLY JSON: {"title": "…", "stats": [{"label": "…", "value": "…"}], "notes": "…"}.',
  cards: 'Answer with ONLY JSON: {"cards": [{"title": "…", "text": "…"}]}.',
} as const;

/** The shape an agent's answer must have (a lorebook proposal has its own). */
export function shapeFor(a: AgentConfig): z.ZodType<unknown> {
  return a.output === "proposal" && a.proposal?.target === "lorebook" ? LORE_PROPOSAL : OUTPUT_SHAPES[a.output];
}

/** The format line for this agent (its kind, or its view, or its proposal). */
export function formatFor(a: AgentConfig): string {
  if (a.output === "note" && a.display?.note === "view") return VIEW_FORMATS[a.display.view ?? "feed"];
  if (a.output === "proposal" && a.proposal?.target === "lorebook") return 'Answer with ONLY JSON: {"entries": [{"title": "short name", "keys": ["words that call it up"], "content": "the fact, 1–3 sentences"}]}. Only facts the story established that the lorebook does not have yet; an entry with the title of an existing one replaces it. {"entries": []} when there is nothing new.';
  return formatInstruction(a.output);
}

/** What we tell the model about the answer format. */
export function formatInstruction(kind: AgentOutputKind): string {
  switch (kind) {
    case "state": return "Answer with ONLY a JSON object holding the values that changed. No other text.";
    case "check": return 'Answer with ONLY JSON: {"pass": true or false, "reason": "one short sentence"}.';
    case "choices": return "Answer with ONLY a JSON array of short options, e.g. [\"…\", \"…\"].";
    case "proposal": return 'Answer with ONLY JSON: {"target": "what to change", "change": …, "reason": "why"}.';
    case "speaker": return "Answer with ONLY the name of the character who should speak next.";
    case "rewrite": return "Answer with ONLY the rewritten reply, complete. No comments.";
    case "intercept": return "Answer with ONLY the rewritten message. No comments.";
    default: return "Answer with ONLY the text. No comments, no preamble.";
  }
}

/** Finds the JSON in a model answer (it may be wrapped in ``` fences or have words around it). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1]! : text).trim();
  const tryParse = (s: string) => { try { return { ok: true as const, v: JSON.parse(s) as unknown }; } catch { return { ok: false as const }; } };
  const whole = tryParse(body);
  if (whole.ok) return whole.v;
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const a = body.indexOf(open);
    const b = body.lastIndexOf(close);
    if (a !== -1 && b > a) {
      const part = tryParse(body.slice(a, b + 1));
      if (part.ok) return part.v;
    }
  }
  throw new Error("The answer was not valid JSON");
}

/** Turns a raw model answer into the value for this output kind (not yet validated). */
export function parseAnswer(kind: AgentOutputKind, text: string): unknown {
  if (STRUCTURED.has(kind)) return extractJson(text);
  return text.trim();
}

/** The transcript part of an agent prompt. */
export function transcript(ctx: AgentRunContext): string {
  return ctx.messages.map((m) => `${ctx.names.bySpeaker(m)}: ${applyBasicMacros(m.content, ctx.names)}`).join("\n\n");
}

/** Builds the messages for a data agent with its own AI call. */
export function buildAgentMessages(ctx: AgentRunContext): ChatTurn[] {
  const a: AgentConfig = ctx.agent;
  const parts: string[] = [];
  if (ctx.cards) parts.push(`## Characters (from their cards)\n${ctx.cards}`);
  if (ctx.persona) parts.push(`## The user's character (persona)\n${ctx.persona}`);
  if (ctx.scenario) parts.push(`## Scenario\n${ctx.scenario}`);
  if (ctx.lore) parts.push(`## Lorebook entries active now\n${ctx.lore}`);
  if (ctx.chapters) parts.push(`## The story so far (chapter summaries)\n${ctx.chapters}`);
  if (ctx.authorsNote) parts.push(`## Author's Note\n${ctx.authorsNote}`);
  if (ctx.loreIndex !== undefined) parts.push(`## The story's lorebook already has\n${ctx.loreIndex || "(nothing yet)"}`);
  if (ctx.messages.length) parts.push(`## Recent messages\n${transcript(ctx)}`);
  if (a.input.state !== false) {
    const state = Array.isArray(a.input.state)
      ? Object.fromEntries(Object.entries(ctx.state).filter(([ns]) => (a.input.state as string[]).includes(ns)))
      : { ...ctx.state };
    // a tracker reads its own values with character names, not ids
    const own = a.state?.namespace;
    if (ctx.tracker && own) {
      const named = valuesWithNames(ctx.tracker.schema, ctx.state[own], ctx.tracker.people);
      if (Object.keys(named).length) state[own] = named; else delete state[own];
    }
    if (Object.keys(state).length) parts.push(`## Current state\n${JSON.stringify(state, null, 1)}`);
  }
  for (const [id, value] of Object.entries(ctx.results)) {
    parts.push(`## Result of agent "${id}"\n${typeof value === "string" ? value : JSON.stringify(value, null, 1)}`);
  }
  if (Object.keys(ctx.settings).length) parts.push(`## Settings\n${JSON.stringify(ctx.settings, null, 1)}`);
  if (ctx.text) parts.push(ctx.trigger === "turn.before" ? `## The user's message\n${ctx.text}` : `## The reply\n${ctx.text}`);
  if (ctx.previousNotes?.length) parts.push(`## Your previous notes (oldest first)\n${ctx.previousNotes.join("\n\n---\n\n")}`);
  if (ctx.tracker) parts.push(applyBasicMacros(trackerInstruction(ctx.tracker.schema, ctx.tracker.people), ctx.names));
  // "use as written" (D-059): the user's instructions already say how to answer
  if (!a.rawPrompt) parts.push(formatFor(a));
  return [
    { role: "system", content: applyBasicMacros(a.prompt, ctx.names) },
    { role: "user", content: parts.join("\n\n") },
  ];
}

/** The built-in executor for data agents with runMode "separate". */
export async function separateExecutor(ctx: AgentRunContext): Promise<unknown> {
  const answer = await ctx.complete(buildAgentMessages(ctx), { maxTokens: ctx.agent.limits.maxTokens });
  return parseAnswer(ctx.agent.output, answer.text);
}

// ---------------------------------------------------------------- inline agents

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The instruction added to the main prompt for an inline agent. */
export function inlineInstruction(agent: AgentConfig, names: { char: string; user: string }): string {
  const tag = agent.inlineTag ?? agent.id.toUpperCase();
  return `${applyBasicMacros(agent.prompt, names)}\nWrite it at the very end of your reply between [${tag}] and [/${tag}]. ${formatInstruction(agent.output)}`;
}

/** Takes an inline agent's block out of the reply. Returns the clean reply and the block (if any). */
export function extractInline(text: string, agent: AgentConfig): { text: string; block: string | null } {
  const tag = escapeRe(agent.inlineTag ?? agent.id.toUpperCase());
  const re = new RegExp(`\\[${tag}(?:\\|[^\\]]*)?\\]([\\s\\S]*?)(?:\\[\\/${tag}\\]|$)`, "i");
  const m = re.exec(text);
  if (!m) return { text, block: null };
  const clean = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\n{3,}/g, "\n\n").trim();
  return { text: clean, block: m[1]!.trim() };
}
