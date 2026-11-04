// Settings → Chat (D-082): a reply cut off by the length limit is continued in the same message, at most N times.
// CLAUDE, 2026-11-03.
import { expect, it } from "vitest";
import { CONTINUE_NUDGE } from "../src/turn.ts";
import { connection, world } from "./helpers.ts";

it("continues a cut-off reply in the same message and adds the usage", async () => {
  const w = await world((messages, call) => call === 1
    ? ["She opened the ", { finish: "length" }, { usage: { tokensIn: 100, tokensOut: 4 } }]
    : (messages.at(-1)?.content === CONTINUE_NUDGE && messages.at(-2)?.content === "She opened the "
      ? ["door slowly.", { finish: "stop" }, { usage: { tokensIn: 110, tokensOut: 3 } }] : "wrong"));
  const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
  const { reply } = await w.chat.send(session.id, firstMessage!.id, "Go on", connection, { continueOnLength: 2 });
  expect(reply.content).toBe("She opened the door slowly.");
  expect(await w.store.getGenerationRecord(reply.id)).toMatchObject({ tokensIn: 100, tokensOut: 7 });
});

it("stops after the limit, and does nothing when the setting is off", async () => {
  let calls = 0;
  const w = await world(() => { calls++; return ["more ", { finish: "length" }]; });
  const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
  const off = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
  expect(off.reply.content).toBe("more ");
  const before = calls;
  const on = await w.chat.send(session.id, off.reply.id, "Again", connection, { continueOnLength: 2 });
  expect(on.reply.content).toBe("more more more ");
  expect(calls - before).toBe(3);
});
