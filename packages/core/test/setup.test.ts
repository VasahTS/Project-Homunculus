// Tests for the layered Setup (BLUEPRINT §3) and old-data upgrades. Author: CLAUDE, 2026-10-27.
import { Session, upgradeSession } from "@homunculus/schemas";
import { describe, expect, it } from "vitest";
import { resolveSetup } from "../src/index.ts";

describe("layered setup", () => {
  it("a missing value is inherited; the most specific layer wins; null means 'none' on purpose", () => {
    const r = resolveSetup({
      default: { presetId: "roleplay", personaId: "daniel" },
      story: { presetId: "game-master" },
      session: { personaId: null },
    });
    expect(r.presetId).toBe("game-master");
    expect(r.personaId).toBeNull();
    expect(r.sources).toMatchObject({ presetId: "story", personaId: "session", turnOrder: "builtin" });
  });

  it("lists follow keep / only / add, and remember where each item came from", () => {
    const r = resolveSetup({
      default: { agents: { mode: "add", add: ["prose-polisher", "dont-write-for-user"], remove: [] } },
      story: { agents: { mode: "add", add: ["rpg-world", "rpg-money"], remove: ["prose-polisher"] } },
      session: { agents: { mode: "keep", add: [], remove: [] } },
    });
    expect(r.agents).toEqual(["dont-write-for-user", "rpg-world", "rpg-money"]);
    expect(r.sources["agents:rpg-world"]).toBe("story");
    expect(r.sources["agents:dont-write-for-user"]).toBe("default");

    const only = resolveSetup({ default: { agents: { mode: "add", add: ["a", "b"], remove: [] } }, session: { agents: { mode: "only", add: ["emotions"], remove: [] } } });
    expect(only.agents).toEqual(["emotions"]);
  });

  it("the Daniel examples: an RPG story and a drama session use the same mechanism", () => {
    const rpgStory = { agents: { mode: "add" as const, add: ["world", "money", "quests", "factions"], remove: [] }, presetId: "game-master" };
    const inStory = resolveSetup({ story: rpgStory, session: { agents: { mode: "add", add: [], remove: ["factions"] } } });
    expect(inStory.agents).toEqual(["world", "money", "quests"]);
    const drama = resolveSetup({ session: { agents: { mode: "only", add: ["emotions", "relationships"], remove: [] } } });
    expect(drama.agents).toEqual(["emotions", "relationships"]);
  });

  it("agent overrides, story style, limits and module fields merge key by key", () => {
    const r = resolveSetup({
      default: { agentOverrides: { world: { connectionId: "cheap", settings: { strict: true } } }, storyStyle: { pov: "third", tense: "past" }, extra: { a: 1 } },
      story: { agentOverrides: { world: { schemaId: "rpg", settings: { detail: "high" } } }, storyStyle: { tense: "present" }, limits: { autoPlayMaxTurns: 5 } },
    });
    expect(r.agentOverrides.world).toEqual({ connectionId: "cheap", schemaId: "rpg", settings: { strict: true, detail: "high" } });
    expect(r.storyStyle).toEqual({ pov: "third", tense: "present" });
    expect(r.limits).toEqual({ autoPlayMaxTurns: 5 });
    expect(r.extra).toEqual({ a: 1 });
  });
});

describe("old data keeps working", () => {
  it("a session saved by v0.0.1 is upgraded on read", () => {
    const old = {
      id: "s1", title: "Mill", userRole: "player", presetId: "p1", personaId: null, scenario: "",
      cast: [{ characterId: "lyra", role: "character", active: true, joinedAtMessageId: null }, { characterId: "kael", role: "character", active: false, joinedAtMessageId: null }],
      agents: [{ agentId: "clock", enabled: true, overrides: {} }, { agentId: "off", enabled: false, overrides: {} }],
      lorebookIds: ["lb1"], settings: {}, createdAt: 1,
    };
    const s = Session.parse(upgradeSession(old));
    expect(s.setup).toEqual({ presetId: "p1", lorebooks: { mode: "add", add: ["lb1"], remove: [] }, agents: { mode: "add", add: ["clock"], remove: [] } });
    expect(s.cast.map((c) => c.presence)).toEqual(["in_scene", "off"]);
    expect(s.storyId).toBeNull();
    expect("presetId" in s).toBe(false);
  });

  it("a session saved with a campaign id (before slice 4) gets it as its story", () => {
    expect(Session.parse(upgradeSession({ id: "s1", campaignId: "c1", createdAt: 1 })).storyId).toBe("c1");
    expect(Session.parse(upgradeSession({ id: "s2", campaignId: null, createdAt: 1 })).storyId).toBeNull();
  });
});
