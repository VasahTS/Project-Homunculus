// Agent session boundaries, cancellation and read-only comparisons. CODEX, 2026-10-30.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { connection, world } from "./helpers.ts";

describe("agent safety", () => {
  it.each(["manual", "compare"] as const)("%s rejects a message from another chat before calling an AI", async (operation) => {
    const w = await world(() => "Unexpected rewrite");
    await w.store.saveAgentConfig({ id: "rewrite", name: "Rewrite", output: "rewrite", triggers: [{ on: "manual" }] });
    const a = await w.chat.createSession({ characterIds: ["lyra"] });
    const b = await w.chat.createSession({ characterIds: ["lyra"] });
    const foreign = b.firstMessage!;
    const action = operation === "manual"
      ? w.chat.turns.runManual(a.session.id, "rewrite", foreign.id, connection)
      : w.chat.turns.compareAgent(a.session.id, "rewrite", foreign.id, connection, [undefined]);
    await expect(action).rejects.toThrow("does not belong to session");
    expect(w.ai.prompts).toEqual([]);
    expect(await w.store.getMessage(foreign.id)).toEqual(foreign);
    expect(await w.store.listRevisions(foreign.id)).toEqual([]);
    expect(await w.store.listAgentRuns(foreign.id)).toEqual([]);
  });

  it("a text agent stopped before execution does not rewrite a message", async () => {
    const w = await world(() => "unused");
    await w.store.saveAgentConfig({ id: "text", name: "Text", output: "rewrite", runMode: "text", prompt: "Changed", triggers: [{ on: "manual" }] });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const ctl = new AbortController();
    ctl.abort();
    expect(await w.chat.turns.runManual(session.id, "text", firstMessage!.id, connection, ctl.signal)).toBeUndefined();
    expect(await w.store.getMessage(firstMessage!.id)).toEqual(firstMessage);
    expect(await w.store.listRevisions(firstMessage!.id)).toEqual([]);
    expect((await w.store.listAgentRuns(firstMessage!.id))[0]?.status).toBe("cancelled");
    expect(w.ai.prompts).toEqual([]);
  });

  it("a code agent that finishes after Stop cannot apply its answer", async () => {
    const ctl = new AbortController();
    const w = await world(() => "unused", [{ manifest: { id: "late", version: "1" }, register(api) {
      api.registerAgent({ config: { id: "late", name: "Late", output: "rewrite", triggers: [{ on: "manual" }] }, output: z.string(),
        run: async () => { ctl.abort(); return "Arrived after Stop"; } });
    } }]);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    expect(await w.chat.turns.runManual(session.id, "late", firstMessage!.id, connection, ctl.signal)).toBeUndefined();
    expect(await w.store.getMessage(firstMessage!.id)).toEqual(firstMessage);
    expect(await w.store.listRevisions(firstMessage!.id)).toEqual([]);
    expect((await w.store.listAgentRuns(firstMessage!.id))[0]?.status).toBe("cancelled");
  });

  it.each(["rewrite", "state", "proposal"] as const)("comparing a %s agent preserves messages, state, lorebooks and run history", async (output) => {
    const answer = output === "rewrite" ? "Changed" : output === "state" ? '{"mood":"happy"}'
      : '{"entries":[{"title":"New fact","keys":["fact"],"content":"Only a preview"}]}';
    const w = await world(() => answer);
    await w.store.saveLorebook({ id: "book", name: "Original", entries: [{ id: "original", content: "Keep me" }] });
    await w.store.saveStory({ id: "story", name: "Story", createdAt: 1, openings: ["Opening"],
      setup: { lorebooks: { mode: "add", add: ["book"], remove: [] } } });
    await w.store.saveAgentConfig({ id: "agent", name: "Agent", output, triggers: [{ on: "manual" }],
      ...(output === "state" ? { state: { namespace: "test" } } : {}),
      ...(output === "proposal" ? { proposal: { target: "lorebook" } } : {}) });
    const { session, firstMessage } = await w.chat.createSession({ storyId: "story" });
    const id = firstMessage!.id;
    const snapshot = () => Promise.all([w.store.getSession(session.id), w.store.getMessage(id), w.store.getStory("story"), w.store.lorebooks.get("book"),
      w.store.listRevisions(id), w.store.listNotes(id), w.store.listAgentRuns(id), w.core.state.resolve(session.id, id), w.store.getGenerationRecord(id)]);
    const before = await snapshot();
    const events: string[] = [];
    for (const name of ["agent.started", "agent.finished", "agent.output", "message.revised", "state.changed", "story.loreChanged"] as const) {
      w.core.events.on(name, () => { events.push(name); });
    }
    const results = await w.chat.turns.compareAgent(session.id, "agent", id, connection, [undefined, { ...connection, model: "other" }]);
    expect(results).toHaveLength(2);
    for (const result of results) { expect(result.error).toBeUndefined(); expect(result.output).toBeDefined(); }
    expect(await snapshot()).toEqual(before);
    expect(events).toEqual([]);
  });

  it("a cancelled text comparison returns Stopped without writes or an AI call", async () => {
    const w = await world(() => "unused");
    await w.store.saveAgentConfig({ id: "text", name: "Text", output: "rewrite", runMode: "text", prompt: "Changed", triggers: [{ on: "manual" }] });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const ctl = new AbortController();
    ctl.abort();
    const result = await w.chat.turns.compareAgent(session.id, "text", firstMessage!.id, connection, [undefined], undefined, ctl.signal);
    expect(result[0]).toMatchObject({ error: "Stopped" });
    expect(result[0]?.output).toBeUndefined();
    expect(await w.store.getMessage(firstMessage!.id)).toEqual(firstMessage);
    expect(await w.store.listAgentRuns(firstMessage!.id)).toEqual([]);
    expect(w.ai.prompts).toEqual([]);
  });

  it("a manual lorebook proposal changes only its own story, preserving a shared original", async () => {
    const w = await world(() => '{"entries":[{"title":"New fact","keys":["fact"],"content":"Story A only"}]}');
    await w.store.saveLorebook({ id: "shared", name: "Original", entries: [{ id: "original", title: "Origin", content: "Unchanged" }] });
    for (const id of ["a", "b"]) await w.store.saveStory({ id, name: id, createdAt: 1, openings: ["Opening"],
      setup: { lorebooks: { mode: "add", add: ["shared"], remove: [] } } });
    await w.store.saveAgentConfig({ id: "keeper", name: "Keeper", output: "proposal", proposal: { target: "lorebook" }, triggers: [{ on: "manual" }] });
    const a = await w.chat.createSession({ storyId: "a" });
    const b = await w.chat.createSession({ storyId: "b" });
    const original = await w.store.lorebooks.get("shared");
    const other = await w.store.getStory("b");
    const outcome = await w.chat.turns.runManual(a.session.id, "keeper", a.firstMessage!.id, connection);
    expect(outcome?.kind).toBe("proposal");
    expect(Object.values((await w.store.getStory("a"))!.lorePatches.shared!.entries).map((entry) => entry.content)).toEqual(["Story A only"]);
    expect(await w.store.lorebooks.get("shared")).toEqual(original);
    expect(await w.store.getStory("b")).toEqual(other);
    expect(await w.store.getMessage(b.firstMessage!.id)).toEqual(b.firstMessage);
    expect(await w.store.listAgentRuns(b.firstMessage!.id)).toEqual([]);
  });

  it.each([true, false])("concurrent lorebook keepers retain both proposals (existing book: %s)", async (existing) => {
    const w = await world((messages) => JSON.stringify({ entries: [{ title: messages[0]!.content, keys: [], content: "Keep both" }] }));
    if (existing) await w.store.saveLorebook({ id: "shared", name: "Original", entries: [] });
    await w.store.saveStory({ id: "story", name: "Story", createdAt: 1, openings: ["Opening"],
      setup: existing ? { lorebooks: { mode: "add", add: ["shared"], remove: [] } } : {} });
    for (const id of ["North", "South"]) await w.store.saveAgentConfig({ id, name: id, prompt: id, output: "proposal",
      proposal: { target: "lorebook" }, triggers: [{ on: "manual" }] });
    const a = await w.chat.createSession({ storyId: "story" });
    const b = await w.chat.createSession({ storyId: "story" });
    // Model the asynchronous reads of a native database, not just synchronous in-memory SQL.
    const readStory = w.store.getStory.bind(w.store);
    w.store.getStory = async (id) => {
      const value = await readStory(id);
      await new Promise((done) => setTimeout(done, 3));
      return value;
    };
    const outcomes = await Promise.all([
      w.chat.turns.runManual(a.session.id, "North", a.firstMessage!.id, connection),
      w.chat.turns.runManual(b.session.id, "South", b.firstMessage!.id, connection),
    ]);
    expect(outcomes.every((outcome) => outcome?.kind === "proposal")).toBe(true);
    const story = (await w.store.getStory("story"))!;
    const patches = Object.values(story.lorePatches);
    expect(patches).toHaveLength(1);
    expect(Object.values(patches[0]!.entries).map((entry) => entry.title).sort()).toEqual(["North", "South"]);
    expect(story.setup.lorebooks?.add).toHaveLength(1);
  });

});
