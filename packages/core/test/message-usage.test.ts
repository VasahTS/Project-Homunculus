// Reasoning usage survives the real turn/storage pipeline. Author: CODEX, 2026-11-03.
import { expect, it } from "vitest";
import { connection, world } from "./helpers.ts";

it("persists reasoning usage on the matching reply and version", async () => {
  const w = await world((_m, call) => ["A reply.", { usage: { tokensIn: 100, tokensOut: call === 1 ? 745 : 90, tokensReasoning: call === 1 ? 170 : 20 } }]);
  const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
  const { userMessage, reply } = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
  const other = await w.chat.generate(session.id, userMessage.id, connection);
  expect(await w.store.getGenerationRecord(reply.id)).toMatchObject({ tokensOut: 745, tokensReasoning: 170 });
  expect(await w.store.getGenerationRecord(other.id)).toMatchObject({ tokensOut: 90, tokensReasoning: 20 });
});

it("preserves legacy records without inventing a reasoning count", async () => {
  const w = await world(() => ["A reply.", { usage: { tokensOut: 10 } }]);
  const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
  const { reply } = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
  expect(await w.store.getGenerationRecord(reply.id)).not.toHaveProperty("tokensReasoning");
});
