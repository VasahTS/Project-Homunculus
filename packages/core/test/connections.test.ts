// Tests of connection profiles (slice 1b): from profile to call, backups, the story's and agents'
// connections picked by the setup, and deleting a profile. Author: CLAUDE, 2026-10-28.
import { describe, expect, it } from "vitest";
import { ConnectionProfile } from "@homunculus/schemas";
import { profileToConfig } from "../src/index.ts";
import { connection, isAgentCall, world } from "./helpers.ts";

const profile = (id: string, extra: Partial<ConnectionProfile> = {}) =>
  ConnectionProfile.parse({ id, name: id, providerId: "fake", model: `${id}-model`, ...extra });

describe("connection profiles", () => {
  it("become call settings with the key, and follow backups without looping", () => {
    const a = profile("a", { baseUrl: " https://x/v1 ", params: { temperature: 0.5, reasoningEffort: "low" }, fallbackId: "b", extraBody: { seed: 1 } });
    const b = profile("b", { fallbackId: "a" });
    const all = new Map([["a", a], ["b", b]]);
    const c = profileToConfig(a, all, (p) => `key-${p.id}`);
    expect(c).toMatchObject({ profileId: "a", model: "a-model", baseUrl: "https://x/v1", apiKey: "key-a", params: { temperature: 0.5, reasoningEffort: "low" }, extraBody: { seed: 1 } });
    expect(c.fallback).toMatchObject({ profileId: "b", apiKey: "key-b" });
    expect(c.fallback?.fallback).toBeUndefined(); // b → a would be a loop
  });

  it("the setup picks the story's connection and the agents' connection by id", async () => {
    const tracker = {
      id: "t", name: "Mood", triggers: [{ on: "turn" as const, phase: "after" as const }], output: "state" as const,
      prompt: "Track the mood.", state: { namespace: "t" },
    };
    const { store, chat, ai } = await world((m) => (isAgentCall(m) ? "{}" : "Story text."));
    await store.saveAgentConfig(tracker);
    const { session } = await chat.createSession({ title: "S", characterIds: ["lyra"] });
    await store.saveSession({ ...session, setup: { connectionId: "story", agentConnectionId: "cheap", agents: { mode: "add", add: ["t"], remove: [] } } });
    const connections = {
      story: { ...connection, model: "big-model", profileId: "story" },
      cheap: { ...connection, model: "cheap-model", profileId: "cheap" },
    };
    const { reply } = await chat.send(session.id, null, "Hi", { ...connection, model: "default-model" }, { connections });
    expect(ai.prompts).toHaveLength(2);
    expect((await store.getGenerationRecord(reply.id))).toMatchObject({ model: "big-model", connectionId: "story" });
    expect((await store.listAgentRuns(reply.id))[0]?.model).toBe("cheap-model");
  });

  it("deleting a profile sends everything that used it back to the default", async () => {
    const { store, chat } = await world(() => "ok");
    await store.saveConnectionProfile(profile("main"));
    await store.saveConnectionProfile(profile("old"));
    await store.saveConnectionProfile(profile("other", { fallbackId: "old" }));
    await store.setDefaultSetup({ connectionId: "main", agentOverrides: { t: { connectionId: "old", schemaId: "s" } } });
    const { session } = await chat.createSession({ title: "S", characterIds: ["lyra"] });
    await store.saveSession({ ...session, setup: { connectionId: "old", agentConnectionId: "old" } });

    await expect(store.deleteConnectionProfile("main")).rejects.toThrow(/default connection/);
    expect(await store.deleteConnectionProfile("old")).toBe(1);
    expect((await store.getSession(session.id))?.setup).toEqual({});
    expect((await store.getDefaultSetup()).agentOverrides).toEqual({ t: { schemaId: "s" } });
    expect((await store.connections.get("other"))?.fallbackId).toBeNull();
    expect((await store.connections.list()).map((p) => p.id)).toEqual(["main", "other"]);
  });
});
