// A quick model choice stays in its chat, including real turn routing. CODEX, 2026-11-03.
import { describe, expect, it } from "vitest";
import { resolveSetup } from "../src/setup.ts";
import { connection, world } from "./helpers.ts";
describe("chat model selection", () => {
  it("inherits models and supports resetting to the shared profile model", () => {
    expect(resolveSetup({ story: { modelOverride: "story" }, session: { modelOverride: "chat" } }).modelOverride).toBe("chat");
    expect(resolveSetup({ story: { modelOverride: "story" }, session: { modelOverride: "" } }).modelOverride).toBe("");
  });
  it("routes one chat to its model without changing a second chat or the profile", async () => {
    const { store, chat } = await world(() => "ok");
    await store.saveConnectionProfile({ id: "shared", name: "Shared", providerId: "fake", model: "shared-model" });
    const a = (await chat.createSession({ title: "A", characterIds: ["lyra"] })).session;
    const b = (await chat.createSession({ title: "B", characterIds: ["lyra"] })).session;
    await store.saveSession({ ...a, setup: { connectionId: "shared", modelOverride: "only-A" } });
    await store.saveSession({ ...b, setup: { connectionId: "shared" } });
    const connections = { shared: { ...connection, profileId: "shared", model: "shared-model" } };
    const ra = await chat.send(a.id, null, "Hello", connection, { connections });
    const rb = await chat.send(b.id, null, "Hello", connection, { connections });
    expect((await store.getGenerationRecord(ra.reply.id))?.model).toBe("only-A");
    expect((await store.getGenerationRecord(rb.reply.id))?.model).toBe("shared-model");
    expect((await store.connections.get("shared"))?.model).toBe("shared-model");
  });
  it("clears a chat's model override when its connection is deleted", async () => {
    const { store, chat } = await world(() => "ok");
    await store.saveConnectionProfile({ id: "old", name: "Old", providerId: "fake", model: "old-model" });
    const { session } = await chat.createSession({ title: "A", characterIds: ["lyra"] });
    await store.saveSession({ ...session, setup: { connectionId: "old", modelOverride: "old-provider-model" } });
    await store.deleteConnectionProfile("old");
    expect((await store.getSession(session.id))?.setup).not.toHaveProperty("modelOverride");
  });
});

// CLAUDE, 2026-11-03: a model belongs to the connection it was picked for.
describe("chat model follows its connection", () => {
  it("a later layer that picks another connection does not inherit an earlier layer's model", () => {
    const r = resolveSetup({ story: { connectionId: "openrouter", modelOverride: "vendor/model-a" }, session: { connectionId: "local" } });
    expect(r.connectionId).toBe("local");
    expect(r.modelOverride).toBe("");
  });
  it("a layer can still pick only a model for the connection it inherits", () => {
    const r = resolveSetup({ story: { connectionId: "openrouter" }, session: { modelOverride: "vendor/model-b" } });
    expect(r.connectionId).toBe("openrouter");
    expect(r.modelOverride).toBe("vendor/model-b");
    expect(resolveSetup({ story: { connectionId: "openrouter", modelOverride: "vendor/model-a" } }).modelOverride).toBe("vendor/model-a");
  });
});
