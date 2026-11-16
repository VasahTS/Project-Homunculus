// Continue (D-136): the AI goes on with a reply that is there; the words are added to the same message. CLAUDE, 2026-11-16.
import { describe, expect, it } from "vitest";
import { joinContinuation } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

describe("Continue", () => {
  it("adds the new words to the same reply, keeps a revision and adds no message", async () => {
    const w = await world(() => "and then she smiled.");
    const { session } = await w.chat.createSession({ characterIds: ["lyra"] });
    const first = await w.chat.send(session.id, null, "hello", connection);
    const before = (await w.store.messageLinks(session.id)).length;
    let seen = "";
    const done = await w.chat.turns.continueReply(first.reply.id, connection, { onToken: (_p, all) => { seen = all; } });
    expect(done.id).toBe(first.reply.id);
    expect(done.content).toBe("and then she smiled. and then she smiled.");
    expect(seen).toBe(done.content);
    expect((await w.store.messageLinks(session.id)).length).toBe(before);
    expect(await w.store.listRevisions(first.reply.id)).toHaveLength(1);
  });

  it("refuses a message of yours", async () => {
    const w = await world(() => "ok");
    const { session } = await w.chat.createSession({ characterIds: ["lyra"] });
    const first = await w.chat.send(session.id, null, "hello", connection);
    await expect(w.chat.turns.continueReply(first.userMessage!.id, connection)).rejects.toThrow(/Only a reply/);
  });

  it("joins words with a space only where needed", () => {
    expect(joinContinuation("She waits", "for him.")).toBe("She waits for him.");
    expect(joinContinuation("She waits ", "for him.")).toBe("She waits for him.");
    expect(joinContinuation("She waits", ", silent.")).toBe("She waits, silent.");
    expect(joinContinuation("She waits", "\nThen she goes.")).toBe("She waits\nThen she goes.");
    expect(joinContinuation("", "Hi")).toBe("Hi");
  });
});
