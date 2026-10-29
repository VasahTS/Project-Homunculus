// Homunculus 2 — upgrades data saved by older versions to today's shapes. Author: CLAUDE, 2026-10-27.
// Called by the store before validating, so old databases keep working without a migration (D-008).
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** v0.0.1 sessions had presetId/personaId/lorebookIds/agents/settings at the top level. */
export function upgradeSession(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  const s: Obj = { ...raw };
  if (!isObj(s.setup)) {
    const setup: Obj = {};
    if (typeof s.presetId === "string") setup.presetId = s.presetId;
    if (typeof s.personaId === "string") setup.personaId = s.personaId;
    if (Array.isArray(s.lorebookIds) && s.lorebookIds.length) setup.lorebooks = { mode: "add", add: s.lorebookIds, remove: [] };
    if (Array.isArray(s.agents) && s.agents.length) {
      const ids = s.agents.filter(isObj).filter((a) => a.enabled !== false).map((a) => a.agentId);
      setup.agents = { mode: "add", add: ids, remove: [] };
    }
    s.setup = setup;
  }
  for (const k of ["presetId", "personaId", "lorebookIds", "agents", "settings"]) delete s[k];
  // slice 4 (D-029): "campaigns" became stories
  if ("campaignId" in s) { if (s.storyId === undefined) s.storyId = s.campaignId ?? null; delete s.campaignId; }
  if (Array.isArray(s.cast)) s.cast = s.cast.map(upgradeCastMember);
  return s;
}

/** v0.0.1 cast members had `active: boolean` instead of `presence`. */
export function upgradeCastMember(raw: unknown): unknown {
  if (!isObj(raw) || "presence" in raw) return raw;
  const { active, ...rest } = raw;
  return { ...rest, presence: active === false ? "off" : "in_scene" };
}
