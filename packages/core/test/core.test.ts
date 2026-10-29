// Tests for modules and extension points. Author: CLAUDE, 2026-10-23; agents v2 2026-10-27.
// Agent behaviour (running, waves, outputs) is tested through real turns in turn.test.ts.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HomunculusCore, type HomunculusModule } from "../src/index.ts";

const links: Record<string, string | null> = { m1: null, m2: "m1" };
const newCore = () => new HomunculusCore({ tree: { parentOf: async (id) => links[id] } });

const worldStateModule: HomunculusModule = {
  manifest: { id: "agent-world-state", version: "0.0.1" },
  register(api) {
    api.registerAgent({
      config: {
        id: "world-state", name: "World State", help: "Keeps track of where the scene happens and what time it is.",
        triggers: [{ on: "turn", phase: "after" }], output: "state", state: { namespace: "scene" },
      },
      output: z.object({ location: z.string(), time: z.string() }),
      run: async () => ({ location: "Old mill", time: "21:00" }),
    });
    api.registerPanel({ id: "scene-panel", title: "Scene", stateNamespace: "scene" });
    api.registerTrackerSchema({ id: "scene-basic", name: "Scene", fields: [{ key: "location", label: "Place", type: "text" }] });
  },
};

describe("modules", () => {
  it("loads modules after their dependencies", async () => {
    const order: string[] = [];
    const mk = (id: string, dependsOn: string[] = []): HomunculusModule => ({
      manifest: { id, version: "1", dependsOn },
      register: () => { order.push(id); },
    });
    const core = newCore();
    await core.loadModules([mk("panel", ["agent"]), mk("agent", ["base"]), mk("base")]);
    expect(order).toEqual(["base", "agent", "panel"]);
  });

  it("refuses missing dependencies, cycles and duplicates", async () => {
    const mk = (id: string, dependsOn: string[] = []): HomunculusModule => ({
      manifest: { id, version: "1", dependsOn }, register: () => {},
    });
    await expect(newCore().loadModules([mk("a", ["ghost"])])).rejects.toThrow(/not installed/);
    await expect(newCore().loadModules([mk("a", ["b"]), mk("b", ["a"])])).rejects.toThrow(/cycle/);
    await expect(newCore().loadModules([mk("a"), mk("a")])).rejects.toThrow(/twice/);
  });

  it("two modules cannot register the same agent id", async () => {
    const twin: HomunculusModule = { ...worldStateModule, manifest: { id: "twin", version: "1" } };
    await expect(newCore().loadModules([worldStateModule, twin])).rejects.toThrow(/already registered/);
  });

  it("a built-in agent is stored with a validated config, marked as code and built in", async () => {
    const core = newCore();
    await core.loadModules([worldStateModule]);
    const a = core.agents.get("world-state")!;
    expect(a.config).toMatchObject({ runMode: "code", output: "state", source: { kind: "builtin", from: "agent-world-state" } });
    expect(a.config.conditions.probability).toBe(100);
    expect(core.trackerSchemas.get("scene-basic")?.fields[0]?.scope).toBe("global");
    expect(core.panels.get("scene-panel")?.stateNamespace).toBe("scene");
  });

  it("refuses an agent whose config is invalid, with a clear message", async () => {
    const bad: HomunculusModule = {
      manifest: { id: "bad", version: "1" },
      register(api) {
        api.registerAgent({ config: { id: "x", name: "X", triggers: [], output: "note" }, output: z.string(), run: async () => "" });
      },
    };
    await expect(newCore().loadModules([bad])).rejects.toThrow(/triggers/);
  });

  it("a crashing event listener is reported, not fatal", async () => {
    const core = newCore();
    const errors: string[] = [];
    core.events.on("core.error", (e) => { errors.push(e.message); });
    core.events.on("module.loaded", () => { throw new Error("listener broke"); }, "some-module");
    await core.loadModules([worldStateModule]);
    expect(errors).toEqual(["listener broke"]);
    expect(core.loadedModules().map((m) => m.id)).toEqual(["agent-world-state"]);
  });
});
