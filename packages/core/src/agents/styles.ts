// Homunculus 2 — agent styles: one agent, several versions (Daniel, 30/10; Marinara's Echo Chamber picks a style
// like "4chan" or "Twitter / Reddit"). Author: CLAUDE, 2026-10-30.
//
// An agent may list styles; the story or the chat picks one (SetupLayer.agentOverrides[agentId].styleId), else the
// agent's own default, else the first. The style's text replaces {{style}} in the instructions, or is added at the
// end when the instructions don't mention it.
import type { AgentConfig } from "@homunculus/schemas";
import type { ResolvedSetup } from "../setup.ts";

export type AgentStyle = NonNullable<AgentConfig["styles"]>[number];

export function agentStyle(a: AgentConfig, setup?: Pick<ResolvedSetup, "agentOverrides">): AgentStyle | undefined {
  const styles = a.styles ?? [];
  if (!styles.length) return undefined;
  const id = setup?.agentOverrides[a.id]?.styleId ?? a.styleId;
  return styles.find((s) => s.id === id) ?? styles[0];
}

/** The agent with its picked style written into its instructions. Agents without styles come back unchanged. */
export function withStyle(a: AgentConfig, setup?: Pick<ResolvedSetup, "agentOverrides">): AgentConfig {
  const s = agentStyle(a, setup);
  if (!s) return a;
  const prompt = a.prompt.includes("{{style}}") ? a.prompt.split("{{style}}").join(s.text) : `${a.prompt.trim()}\n\nStyle: ${s.text}`;
  return { ...a, prompt };
}

/**
 * The agent with its variables written into its instructions (D-059): `{{key}}` becomes the story's/chat's value
 * (agentOverrides[id].settings[key]) or the agent's own default.
 */
export function withVariables(a: AgentConfig, setup?: Pick<ResolvedSetup, "agentOverrides">): AgentConfig {
  const vars = a.variables ?? [];
  if (!vars.length) return a;
  const own = setup?.agentOverrides[a.id]?.settings ?? {};
  let prompt = a.prompt;
  for (const v of vars) {
    const value = typeof own[v.key] === "string" ? (own[v.key] as string) : v.value;
    prompt = prompt.split(`{{${v.key}}}`).join(value);
  }
  return { ...a, prompt };
}

/** The agent ready to send: its picked style, then its variables. */
export function prepared(a: AgentConfig, setup?: Pick<ResolvedSetup, "agentOverrides">): AgentConfig {
  return withVariables(withStyle(a, setup), setup);
}
