// Recall uses the chosen connection, model and protocol, including legacy settings. CODEX, 2026-11-05.
import { expect, it } from "vitest";
import type { ConnectionConfig } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

async function preparedChat() {
  const w = await world(() => "ok");
  await w.store.setDefaultSetup({ memory: { on: true, auto: false, keep: 0 } });
  const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
  await w.chat.turns.addOwnChapter(session.id, firstMessage!.id, "The mill", "Lyra found a locket.");
  const later = await w.store.addMessage({ id: "later", sessionId: session.id, parentId: firstMessage!.id,
    speaker: { kind: "character", characterId: "lyra" }, kind: "reply", content: "Lyra keeps the locket.", createdAt: 20 });
  await w.chat.turns.addOwnChapter(session.id, later.id, "Later", "They leave the mill.");
  return { ...w, session, at: later.id };
}

it("defaults to the agents' chat model even when unused custom settings contain Jev", async () => {
  const w = await preparedChat();
  const calls: ConnectionConfig[] = [];
  w.core.providers.get("fake")!.stream = async function* (req) {
    calls.push(req.connection);
    const ids = [...req.messages.map((m) => m.content).join("\n").matchAll(/^### (ch_\S+)/gm)].map((m) => m[1]!);
    yield JSON.stringify(Object.fromEntries(ids.map((id) => [id, 0.8])));
  };
  await w.store.saveSession({ ...w.session, setup: { memory: {
    on: true, mode: "smart", recallQuotes: 0, deciderConnectionId: "unused", deciderModel: "typesafe/jev-latest",
  } } });
  const result = await w.chat.turns.testRecall(w.session.id, w.at, "Where is the locket?", connection);
  expect(result?.receipt.decider).toBe(connection.model);
  expect(result?.receipt.fallback).toBeUndefined();
  expect(calls).toHaveLength(1);
});

it("uses an ordinary model on any selected connection and scopes cached answers to that connection", async () => {
  const w = await preparedChat();
  const calls: ConnectionConfig[] = [];
  await w.core.loadModules([{ manifest: { id: "recall-fixture", version: "1" }, register(api) {
    api.registerProvider({ id: "custom-chat", name: "Custom chat", help: "", async *stream(req) {
      calls.push(req.connection);
      const ids = [...req.messages.map((m) => m.content).join("\n").matchAll(/^### (ch_\S+)/gm)].map((m) => m[1]!);
      yield JSON.stringify(Object.fromEntries(ids.map((id) => [id, 0.9])));
    } });
  } }]);
  const first = { providerId: "custom-chat", model: "profile-model", baseUrl: "https://first.example/v1", apiKey: "fixture-first", params: { temperature: 0.2 } };
  const second = { ...first, baseUrl: "https://second.example/v1", apiKey: "fixture-second" };
  const profiles = { first, second };
  await w.store.saveSession({ ...w.session, setup: { memory: {
    on: true, mode: "smart", recallQuotes: 0, decider: "jev", deciderConnectionId: "first", deciderModel: "chosen-chat-model",
  } } });
  const result = await w.chat.turns.testRecall(w.session.id, w.at, "Where is the locket?", connection, profiles);
  expect(result?.receipt.fallback).toBeUndefined();
  expect(result?.receipt.decider).toBe("chosen-chat-model");
  expect(calls).toEqual([{ ...first, model: "chosen-chat-model", params: { temperature: 0.2, maxTokens: 2000 } }]);

  const saved = (await w.store.getSession(w.session.id))!;
  await w.store.saveSession({ ...saved, setup: { memory: { ...saved.setup.memory, deciderConnectionId: "second", deciderModel: "" } } });
  const changed = await w.chat.turns.testRecall(w.session.id, w.at, "Where is the locket?", connection, profiles);
  expect(changed?.receipt.fallback).toBeUndefined();
  expect(changed?.receipt.decider).toBe("profile-model");
  expect(calls.at(-1)).toEqual({ ...second, params: { temperature: 0.2, maxTokens: 2000 } });
  expect(calls).toHaveLength(2);

  await w.store.saveSession({ ...saved, setup: { memory: { ...saved.setup.memory, deciderConnectionId: "first", deciderModel: "profile-model" } } });
  await w.chat.turns.testRecall(w.session.id, w.at, "Where is the locket?", connection, profiles);
  expect(calls).toHaveLength(3);
  const cached = await w.chat.turns.testRecall(w.session.id, w.at, "Where is the locket?", connection, profiles);
  expect(cached?.receipt.cached).toBeGreaterThan(0);
  expect(calls).toHaveLength(3);
});

it("keeps legacy Jev settings on the selected endpoint without borrowing the agents' model", async () => {
  const w = await preparedChat();
  const calls: ConnectionConfig[] = [];
  w.core.providers.get("fake")!.decide = async (req) => {
    calls.push(req.connection);
    return { answers: Object.fromEntries(req.questions.map((q) => [q.id, 0.8])) };
  };
  const custom = { ...connection, model: "profile-chat-model", baseUrl: "https://custom.example/v1", apiKey: "fixture-custom" };
  await w.store.saveSession({ ...w.session, setup: { memory: {
    on: true, mode: "smart", recallQuotes: 0, decider: "jev", deciderConnectionId: "custom", deciderModel: "typesafe/jev-latest",
  } } });
  const result = await w.chat.turns.testRecall(w.session.id, w.at, "Where is the locket?", connection, { custom });
  expect(result?.receipt.fallback).toBeUndefined();
  expect(calls).toEqual([{ ...custom, model: "typesafe/jev-latest" }]);
});

it("uses Jev chat completions when streaming is off and refreshes cached decisions", async () => {
  const w = await preparedChat();
  let nativeCalls = 0;
  const chatCalls: ConnectionConfig[] = [];
  const provider = w.core.providers.get("fake")!;
  provider.decide = async (req) => {
    nativeCalls++;
    return { answers: Object.fromEntries(req.questions.map((q) => [q.id, 0.8])) };
  };
  provider.stream = async function* (req) {
    chatCalls.push(req.connection);
    const ids = [...req.messages.map((m) => m.content).join("\n").matchAll(/^### (ch_\S+)/gm)].map((m) => m[1]!);
    yield JSON.stringify(Object.fromEntries(ids.map((id) => [id, 0.9])));
  };
  await w.store.saveSession({ ...w.session, setup: { memory: {
    on: true, mode: "smart", recallQuotes: 0, decider: "jev", deciderConnectionId: "custom", deciderModel: "typesafe/jev-latest",
  } } });
  const custom = { ...connection, model: "typesafe/jev-latest", baseUrl: "https://custom.example/v1" };
  await w.chat.turns.testRecall(w.session.id, w.at, "Where is the locket?", connection, { custom });
  const result = await w.chat.turns.testRecall(w.session.id, w.at, "Where is the locket?", connection, { custom: { ...custom, streaming: false } });
  expect(result?.receipt.fallback).toBeUndefined();
  expect(nativeCalls).toBe(1);
  expect(chatCalls).toHaveLength(1);
  expect(chatCalls[0]).toMatchObject({ model: custom.model, baseUrl: custom.baseUrl, streaming: false });
});

it("reports a deleted custom connection without sending recall to another account", async () => {
  const w = await preparedChat();
  await w.store.saveSession({ ...w.session, setup: { memory: {
    on: true, mode: "smart", recallQuotes: 0, decider: "jev", deciderConnectionId: "deleted", deciderModel: "chat-model",
  } } });
  const result = await w.chat.turns.testRecall(w.session.id, w.at, "Where is the locket?", connection);
  expect(result?.receipt.fallback).toContain("recall connection is no longer available");
  expect(result?.text).toContain("Lyra found a locket.");
  expect(w.ai.prompts).toHaveLength(0);
});
