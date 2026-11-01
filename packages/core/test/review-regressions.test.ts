// Regressions from Daniel's review of D-054/D-057/D-059/D-060. Author: CODEX, 2026-11-01.
import { describe, expect, it, vi } from "vitest";
import { RegexScript } from "@homunculus/schemas";
import { connection, isAgentCall, world } from "./helpers.ts";

async function memoryWorld(count = 7) {
  const w = await world(() => "Title: Before the edit\nThe old fact.");
  await w.store.setDefaultSetup({ memory: { on: false, every: 4, keep: 2 } });
  const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
  const path = [firstMessage!];
  for (let i = 1; i < count; i++) path.push(await w.store.addMessage({
    id: `source-${i}`, sessionId: session.id, parentId: path.at(-1)!.id,
    speaker: i % 2 ? { kind: "user" } : { kind: "character", characterId: "lyra" },
    content: `Source fact ${i}.`, createdAt: i + 100, meta: {},
  }));
  return { ...w, session, path, head: path.at(-1)!.id };
}

const chapter = (id: string, fromId: string, toId: string, summary = id) => ({
  id, fromId, toId, title: id, summary, messageCount: 2, createdAt: 10,
});

describe("review: chapter memory", () => {
  it("an edit retires dependent summaries, preserves hand edits and leaves another branch alone", async () => {
    const w = await memoryWorld();
    const other = await w.store.addMessage({ id: "other", sessionId: w.session.id, parentId: w.path[0]!.id,
      speaker: { kind: "user" }, content: "Another branch.", createdAt: 200, meta: {} });
    const chapters = [
      { ...chapter("first", w.path[0]!.id, w.path[3]!.id, "Hand-edited old fact."), edited: true },
      chapter("later", w.path[4]!.id, w.path[5]!.id, "Later outdated fact."),
      chapter("sibling", w.path[0]!.id, other.id, "Independent fact."),
    ];
    await w.chat.turns.saveChapters(w.session.id, chapters);
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2 } });
    await w.chat.editMessage(w.path[1]!.id, "The corrected fact.");
    const prompt = (await w.chat.turns.previewPrompt(w.session.id, w.head, connection)).parts.map(p => p.content).join("\n");
    expect(prompt).toContain("The corrected fact.");
    expect(prompt).not.toContain("Hand-edited old fact.");
    expect(prompt).not.toContain("Later outdated fact.");
    expect(await w.chat.turns.chapters(w.session.id)).toEqual([
      { ...chapters[0], off: true }, { ...chapters[1], off: true }, chapters[2],
    ]);
  });

  it.each([7, 12])("simultaneous requests use disjoint spans (%i source messages)", async (count) => {
    const w = await memoryWorld(count);
    const results = await Promise.all([
      w.chat.turns.summarizeNow(w.session.id, w.head, connection),
      w.chat.turns.summarizeNow(w.session.id, w.head, connection),
    ]);
    const saved = await w.chat.turns.chapters(w.session.id);
    expect(saved).toHaveLength(count === 7 ? 1 : 2);
    expect(results.filter(Boolean)).toHaveLength(saved.length);
    expect(new Set(saved.map(c => `${c.fromId}:${c.toId}`)).size).toBe(saved.length);
    expect(w.ai.prompts).toHaveLength(saved.length);
    expect(w.ai.stats.maxActive).toBe(1);
  });

  it("an edit during a summary prevents that late summary from hiding the correction", async () => {
    const w = await memoryWorld();
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2 } });
    let started!: () => void;
    const ready = new Promise<void>(r => { started = r; });
    let finish!: (v: Awaited<ReturnType<typeof w.core.connections.complete>>) => void;
    vi.spyOn(w.core.connections, "complete").mockImplementationOnce(() => {
      started();
      return new Promise(r => { finish = r; });
    });
    const pending = w.chat.turns.summarizeNow(w.session.id, w.head, connection);
    await ready;
    await w.chat.editMessage(w.path[1]!.id, "Correction during summary.");
    finish({ text: "Title: Late summary\nThe outdated fact.", reasoning: "", model: "fake-1" });
    expect(await pending).toBeUndefined();
    const prompt = (await w.chat.turns.previewPrompt(w.session.id, w.head, connection)).parts.map(p => p.content).join("\n");
    expect(prompt).toContain("Correction during summary.");
    expect(prompt).not.toContain("The outdated fact.");
  });

  it("editing still works when a saved chapter's endpoint has been deleted", async () => {
    const w = await memoryWorld();
    await w.chat.turns.saveChapters(w.session.id, [chapter("removed-end", w.path[0]!.id, w.head)]);
    await w.store.deleteMessages(w.session.id, [w.head]);
    await w.chat.editMessage(w.path[1]!.id, "Still editable.");
    expect((await w.store.getMessage(w.path[1]!.id))!.content).toBe("Still editable.");
  });

  it("a failed request does not block the next queued summary", async () => {
    const w = await memoryWorld();
    vi.spyOn(w.core.connections, "complete").mockRejectedValueOnce(new Error("Temporary provider failure"));
    const results = await Promise.allSettled([
      w.chat.turns.summarizeNow(w.session.id, w.head, connection),
      w.chat.turns.summarizeNow(w.session.id, w.head, connection),
    ]);
    expect(results.map(r => r.status)).toEqual(["rejected", "fulfilled"]);
    expect(await w.chat.turns.chapters(w.session.id)).toHaveLength(1);
  });
});

describe("review: originals of regex edits", () => {
  it.each([false, true])("restores the latest typed edit (previous original: %s)", async (previous) => {
    const w = await world(() => "old secret");
    const scripts = [RegexScript.parse({ id: "redact", find: "/secret/g", replace: "[removed]", targets: ["ai"] })];
    if (previous) await w.store.setGlobalRegex(scripts);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    if (!previous) await w.store.setGlobalRegex(scripts);
    await w.store.updateMessage(reply.id, { meta: { ...reply.meta, unrelated: true } });
    await w.chat.editMessage(reply.id, "NEW secret and MY EDIT");
    expect(await w.store.getMessage(reply.id)).toMatchObject({
      content: "NEW [removed] and MY EDIT", meta: { beforeRegex: "NEW secret and MY EDIT", unrelated: true },
    });
    await w.chat.undoRegex(reply.id);
    const restored = (await w.store.getMessage(reply.id))!;
    expect(restored.content).toBe("NEW secret and MY EDIT");
    expect(restored.meta).toEqual({ unrelated: true });
  });

  it("replaces obsolete originals even when the transformed content stays the same", async () => {
    const w = await world(() => "old secret");
    await w.store.setGlobalRegex([RegexScript.parse({ id: "r", find: "/secret|private/g", replace: "[removed]", targets: ["ai"] })]);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Hi", connection);
    await w.chat.editMessage(reply.id, "old private");
    expect((await w.store.getMessage(reply.id))!.meta.beforeRegex).toBe("old private");
    await w.chat.editMessage(reply.id, "An ordinary edit.");
    expect((await w.store.getMessage(reply.id))!.meta).not.toHaveProperty("beforeRegex");
    await w.chat.undoRegex(reply.id);
    expect((await w.store.getMessage(reply.id))!.content).toBe("An ordinary edit.");
  });
});

describe("review: agent feedback and test models", () => {
  it.each(["before", "parallel"] as const)("%s notes feed back on their own branch", async (phase) => {
    let n = 0;
    const w = await world(m => isAgentCall(m) ? `Unique feedback ${++n}.` : "ok");
    await w.store.saveAgentConfig({ id: "n", name: "Notes", output: "note", triggers: [{ on: "turn", phase }],
      display: { note: "hidden" }, feedback: { on: true, notes: 1 } });
    await w.store.setDefaultSetup({ agents: { mode: "add", add: ["n"], remove: [] } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const first = await w.chat.send(session.id, firstMessage!.id, "First", connection);
    expect(await w.store.listNotes(first.userMessage.id, "n")).toHaveLength(1);
    await w.chat.send(session.id, first.reply.id, "Next", connection);
    const prompt = w.ai.prompts.filter(p => !isAgentCall(p)).at(-1)!.map(p => p.content).join("\n");
    expect(prompt).toContain(phase === "before" ? "Unique feedback 2." : "Unique feedback 1.");
    await w.chat.send(session.id, firstMessage!.id, "Separate branch", connection);
    const sibling = w.ai.prompts.filter(p => !isAgentCall(p)).at(-1)!.map(p => p.content).join("\n");
    expect(sibling).not.toContain("Unique feedback 1.");
    expect(sibling).not.toContain("Unique feedback 2.");
  });

  it("explicit Compare/Try it models win without changing the agent's normal override", async () => {
    const w = await world(() => "A note.");
    const agent = { id: "n", name: "Notes", output: "note" as const, triggers: [{ on: "manual" as const }], modelOverride: "own-model" };
    await w.store.saveAgentConfig(agent);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const candidates = [{ providerId: "fake", model: "test-a" }, { providerId: "fake", model: "test-b" }];
    const compared = await w.chat.turns.compareAgent(session.id, agent.id, firstMessage!.id, connection, [undefined, ...candidates]);
    expect(compared.map(r => r.model)).toEqual(["own-model", "test-a", "test-b"]);
    const preview = await w.chat.turns.previewAgent(session.id, agent, firstMessage!.id, connection, { connectionOverride: candidates[0]! });
    expect(preview.model).toBe("test-a");
    expect(await w.store.listNotes(firstMessage!.id)).toEqual([]);
    expect(await w.store.listAgentRuns(firstMessage!.id)).toEqual([]);
    await w.chat.turns.runManual(session.id, agent.id, firstMessage!.id, connection);
    expect((await w.store.listAgentRuns(firstMessage!.id))[0]!.model).toBe("own-model");
    expect((await w.store.agentConfigs.get(agent.id))!.modelOverride).toBe("own-model");
  });
});
