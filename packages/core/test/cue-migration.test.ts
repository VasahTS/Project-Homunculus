// "No AI call" agents become cues, in the library and in Homunculus files (D-113). Author: CLAUDE, 2026-11-10.
import { describe, expect, it } from "vitest";
import { BUNDLE_FORMAT, collectBundle, importBundle, moveTextAgentsToCues, parseBundle } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

const rain = {
  id: "rain", name: "Rain", runMode: "text" as const, output: "inject" as const, triggers: [{ on: "turn" as const, phase: "before" as const }],
  prompt: "It rains on {{char}}. {{tone}}", input: { messages: 0 }, injection: { position: "depth" as const, depth: 1, role: "system" as const },
  variables: [{ key: "tone", label: "", value: "Keep it gloomy." }],
};

describe("moving text agents to cues", () => {
  it("each becomes a cue with the same id and prompt; setups switch the cue where they switched the agent", async () => {
    const w = await world(() => "ok");
    await w.store.saveAgentConfig(rain);
    await w.store.saveAgentConfig({ id: "other", name: "Other", runMode: "separate", output: "note", triggers: [{ on: "turn", phase: "after" }] });
    await w.store.setDefaultSetup({ agents: { mode: "add", add: ["rain", "other"], remove: [] } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const before = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    const promptBefore = (await w.store.getGenerationRecord(before.reply.id))!.prompt.find((p) => p.content.includes("It rains"))!.content;
    // a chat that switched it off
    const off = await w.chat.createSession({ characterIds: ["lyra"] });
    await w.store.saveSession({ ...(await w.store.getSession(off.session.id))!, setup: { agents: { mode: "add", add: [], remove: ["rain"] } } });

    const moved = await moveTextAgentsToCues(w.store);
    expect(moved.map((m) => m.id)).toEqual(["rain"]);
    expect(await w.store.agentConfigs.get("rain")).toBeUndefined();
    expect(await w.store.agentConfigs.get("other")).toBeDefined();
    expect(await w.store.cues.get("rain")).toMatchObject({ name: "Rain", namespace: "cue-rain", source: { kind: "agent", from: "rain" } });
    expect(await w.store.getDefaultSetup()).toMatchObject({ agents: { add: ["other"] }, cues: { mode: "add", add: ["rain"] } });
    expect((await w.store.getSession(off.session.id))!.setup).toMatchObject({ cues: { remove: ["rain"] } });

    const after = await w.chat.send(session.id, before.reply.id, "Hi", connection);
    const record = (await w.store.getGenerationRecord(after.reply.id))!;
    expect(record.prompt.find((p) => p.source === "agent:cue:rain")?.content).toBe(promptBefore);
    expect(promptBefore).toBe("It rains on Lyra. Keep it gloomy.");
    expect(await moveTextAgentsToCues(w.store)).toEqual([]); // nothing left: the next start does nothing
  });

  it("cues travel in Homunculus files with what they need; old files' text agents come in as cues", async () => {
    const a = await world(() => "ok");
    await a.store.saveCue({ id: "mood", name: "Mood", namespace: "cue-mood", characterIds: ["lyra"], groups: [{ key: "g", items: [{ id: "t", text: "Moody." }] }] });
    const file = JSON.stringify(await collectBundle(a.store, [{ kind: "cue", id: "mood" }]));
    const b = await world(() => "ok");
    await b.store.saveCue({ id: "taken", name: "Mine", namespace: "cue-mood" }); // the namespace is taken here
    const r = await importBundle(b.store, parseBundle(file), "mood.h2.json");
    expect(r.roots).toEqual([{ kind: "cue", id: "mood", name: "Mood", what: "cue" }]);
    expect(await b.store.cues.get("mood")).toMatchObject({ namespace: "cue-mood-2", characterIds: ["lyra"], source: { kind: "imported", from: "mood.h2.json" } });

    // a file made before cues: a story that switched a text agent on
    const old = { format: BUNDLE_FORMAT, version: 1, roots: [{ kind: "agent", id: "rain" }], agents: [rain],
      stories: [], kits: [] };
    const parsed = parseBundle(JSON.stringify(old));
    expect(parsed.agents).toEqual([]);
    expect(parsed.cues.map((c) => c.id)).toEqual(["rain"]);
    expect(parsed.roots).toEqual([{ kind: "cue", id: "rain" }]);
    const c = await world(() => "ok");
    await importBundle(c.store, parsed);
    expect((await c.store.cues.get("rain"))?.groups[0]?.items[0]?.text).toBe("It rains on {{char}}. Keep it gloomy.");
  });
});
