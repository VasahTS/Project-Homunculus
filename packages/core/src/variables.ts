// Homunculus 2 — macro variables that last (D-146). Author: CLAUDE, 2026-11-17.
//
// SillyTavern keeps {{setvar}} variables in the chat and {{setglobalvar}} variables in the app. Ours:
// - local variables live in the world state under the namespace "vars", so swipes, branches and going back are right
//   for free (D-001). A reply's prompt starts from the variables at the message BEFORE the one it answers and writes the
//   whole change at the message it answers (replacing what an earlier swipe wrote there): a swipe never counts twice.
//   They show to other macros as {{state.vars.<name>}} too.
// - global variables are one list in the app settings, the same in every chat. Like SillyTavern, they are not tied to
//   messages: a swipe that runs {{incglobalvar}} again adds again.
import type { ResolvedState } from "./state.ts";

export const VARS_NAMESPACE = "vars";
export const GLOBAL_VARS_KEY = "macros.globalVars";

/** Values as macros see them: text (objects and arrays as JSON, like SillyTavern). */
function asText(v: unknown): string {
  return typeof v === "string" ? v : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
}

/** The local variables in a resolved state. */
export function varsFromState(state: ResolvedState | Record<string, unknown>): Map<string, string> {
  const bucket = (state as ResolvedState)[VARS_NAMESPACE];
  return new Map(bucket && typeof bucket === "object" ? Object.entries(bucket).map(([k, v]) => [k, asText(v)]) : []);
}

/** Stored global variables (anything malformed is skipped). */
export function varsFromSetting(raw: unknown): Map<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Map();
  return new Map(Object.entries(raw).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, asText(v)]));
}

/** What changed from `before` to `after`: new and changed values, null for removed ones (a state delta's bucket). */
export function varsDelta(before: Map<string, string>, after: Map<string, string>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of after) if (before.get(k) !== v) out[k] = v;
  for (const k of before.keys()) if (!after.has(k)) out[k] = null;
  return out;
}

export function sameVars(a: Map<string, string>, b: Map<string, string>): boolean {
  return a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
}
