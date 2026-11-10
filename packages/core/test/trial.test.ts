// Try It (D-111): the next reply with some items replaced, and nothing saved.
import { describe, expect, it } from "vitest";
import { overlayStore } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

describe("Try It: a reply with replaced items, nothing saved", () => {
  it("the replaced card goes into the prompt; the stored card, messages and records stay as they were", async () => {
    const w = await world(() => "A trial reply.");
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const lyra = (await w.store.getCharacter("lyra"))!;
    const before = (await w.store.messagesOf(session.id)).length;
    const r = await w.chat.turns.trialReply(session.id, firstMessage!.id, connection,
      { overrides: { characters: [{ ...lyra, description: "SHE SPEAKS ONLY IN RHYMES." }] } });
    expect(r.text).toBe("A trial reply.");
    expect(w.ai.prompts.at(-1)!.map((t) => t.content).join("\n")).toContain("SHE SPEAKS ONLY IN RHYMES.");
    expect((await w.store.getCharacter("lyra"))!.description).toBe(lyra.description);
    expect((await w.store.messagesOf(session.id)).length).toBe(before);
    // as things are: the stored card
    await w.chat.turns.trialReply(session.id, firstMessage!.id, connection);
    expect(w.ai.prompts.at(-1)!.map((t) => t.content).join("\n")).not.toContain("RHYMES");
  });
  it("the overlay answers reads only for what it replaces", async () => {
    const w = await world(() => "ok");
    const o = overlayStore(w.store, { lorebooks: [{ id: "b", name: "New", entries: [] } as never] });
    expect((await o.lorebooks.get("b"))?.name).toBe("New");
    expect(await w.store.lorebooks.get("b")).toBeUndefined();
    expect((await o.getCharacter("lyra"))?.name).toBe("Lyra");
  });
});
