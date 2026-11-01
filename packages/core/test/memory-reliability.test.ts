// Simple memory reliability audit (T-001). Author: CODEX, 2026-11-01.
import { describe, expect, it, vi } from "vitest";
import { applyChapters, type Chapter } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

async function fixture(count = 12) {
  const w = await world(m => /summarize part/.test(m[0]?.content ?? "") ? "Title: Remembered\nThe gate was open." : "A reply.");
  await w.store.setDefaultSetup({ memory: { on: false, every: 4, keep: 2 } });
  const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
  const path = [firstMessage!];
  for (let i = 1; i < count; i++) path.push(await w.store.addMessage({
    id: `source-${i}`, sessionId: session.id, parentId: path.at(-1)!.id, speaker: { kind: "user" },
    content: `Unique source ${i}.`, createdAt: i + 100, meta: {},
  }));
  return { ...w, session, path, head: path.at(-1)!.id };
}
type World = Awaited<ReturnType<typeof fixture>>;
const chapter = (w: World): Chapter => ({ id: "hand", fromId: w.path[0]!.id, toId: w.path[3]!.id,
  title: "My title", summary: "My exact hand edit.", edited: true, messageCount: 4, createdAt: 1 });
function delaySummary(w: World) {
  let start!: () => void, finish!: (value: Awaited<ReturnType<typeof w.core.connections.complete>>) => void;
  const started = new Promise<void>(r => { start = r; });
  vi.spyOn(w.core.connections, "complete").mockImplementationOnce(() => { start(); return new Promise(r => { finish = r; }); });
  return { started, finish: () => finish({ text: "Title: Late\nLate summary.", reasoning: "", model: "fake-1" }) };
}
const saved = (w: World) => w.chat.turns.chapters(w.session.id);

describe("T-001 memory boundaries and late answers", () => {
  it("rejects another chat's endpoint before reading or summarizing it", async () => {
    const w = await fixture();
    const other = await w.chat.createSession({ characterIds: ["lyra"] });
    const head = (await w.chat.send(other.session.id, other.firstMessage!.id, "Foreign private fact", connection)).reply.id;
    const before = w.ai.prompts.length;
    await expect(w.chat.turns.summarizeNow(w.session.id, head, connection)).rejects.toThrow(/session|chat/i);
    await expect(w.chat.turns.memoryAt(w.session.id, head)).rejects.toThrow(/session|chat/i);
    expect(w.ai.prompts).toHaveLength(before);
    expect(await saved(w)).toEqual([]);
  });

  it.each(["edit", "remove"] as const)("discards a late answer when the continuity chapter changes: %s", async action => {
    const w = await fixture();
    const hand = chapter(w);
    await w.chat.turns.saveChapters(w.session.id, [hand]);
    const gate = delaySummary(w);
    const pending = w.chat.turns.summarizeNow(w.session.id, w.head, connection);
    await gate.started;
    const latest = action === "edit" ? [{ ...hand, summary: "A newer hand edit." }] : [];
    await w.chat.turns.saveChapters(w.session.id, latest);
    gate.finish();
    expect(await pending).toBeUndefined();
    expect(await saved(w)).toEqual(latest);
  });

  it("does not append an overlapping chapter saved while the model was running", async () => {
    const w = await fixture();
    const gate = delaySummary(w);
    const pending = w.chat.turns.summarizeNow(w.session.id, w.head, connection);
    await gate.started;
    const hand = chapter(w);
    await w.chat.turns.saveChapters(w.session.id, [hand]);
    gate.finish();
    expect(await pending).toBeUndefined();
    expect(await saved(w)).toEqual([hand]);
  });

  it.each(["delete", "hide"] as const)("discards a summary when source messages change readability: %s", async action => {
    const w = await fixture(7);
    const gate = delaySummary(w);
    const pending = w.chat.turns.summarizeNow(w.session.id, w.head, connection);
    await gate.started;
    if (action === "delete") await w.store.deleteMessages(w.session.id, w.path.slice(3).map(m => m.id));
    else await w.store.updateMessage(w.path[1]!.id, { visibility: { ai: "none", user: true } });
    gate.finish();
    expect(await pending).toBeUndefined();
    expect(await saved(w)).toEqual([]);
  });

  it("a stopped provider answer is discarded even if the provider ignores Stop", async () => {
    const w = await fixture();
    const gate = delaySummary(w), abort = new AbortController();
    const pending = w.chat.turns.summarizeNow(w.session.id, w.head, connection, undefined, abort.signal);
    const outcome = expect(pending).rejects.toThrow();
    await gate.started;
    abort.abort(); gate.finish();
    await outcome;
    expect(await saved(w)).toEqual([]);
    expect(await w.chat.turns.summarizeNow(w.session.id, w.head, connection)).toBeDefined();
  });
});

describe("T-001 tree paths, settings and turn isolation", () => {
  it("a branch inside a chapter and its regenerated reply recover raw text, the original branch keeps its summary", async () => {
    const w = await fixture();
    const hand = chapter(w);
    await w.chat.turns.saveChapters(w.session.id, [hand]);
    const swipe = await w.chat.generate(w.session.id, w.path[1]!.id, connection);
    const branchPath = await w.store.pathTo(swipe.id);
    expect(applyChapters(branchPath, [hand])).toEqual({ history: branchPath, text: "", covered: 0 });
    expect(applyChapters(w.path, [hand]).covered).toBe(4);
    expect((await w.chat.turns.memoryAt(w.session.id, swipe.id)).chapters).toEqual([]);
    await w.store.deleteMessages(w.session.id, w.path.slice(3).map(m => m.id));
    expect((await w.chat.turns.memoryAt(w.session.id, w.path[2]!.id)).chapters).toEqual([]);
    expect(await saved(w)).toEqual([hand]);
  });

  it("settings changes and off/on preserve hand edits, new chapters respect every/keep", async () => {
    const w = await fixture();
    const hand = chapter(w);
    await w.chat.turns.saveChapters(w.session.id, [hand]);
    const prompt = async () => (await w.chat.turns.previewPrompt(w.session.id, w.head, connection)).parts.map(p => p.content).join("\n");
    expect(await prompt()).toContain("Unique source 1.");
    expect(await prompt()).not.toContain(hand.summary);
    await w.store.setDefaultSetup({ memory: { on: true, every: 6, keep: 3 } });
    expect(await prompt()).toContain(hand.summary);
    expect(await prompt()).not.toContain("Unique source 1.");
    expect(await w.chat.turns.memoryAt(w.session.id, w.head)).toMatchObject({ every: 6, keep: 3, waiting: 5 });
    const next = await w.chat.turns.summarizeNow(w.session.id, w.head, connection);
    expect(next).toMatchObject({ fromId: w.path[4]!.id, toId: w.path[8]!.id, messageCount: 5 });
    expect((await saved(w))[0]).toEqual(hand);
    await w.store.setDefaultSetup({ memory: { on: false, every: 4, keep: 2 } });
    expect(await prompt()).toContain("Unique source 1.");
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2 } });
    expect(await prompt()).toContain(hand.summary);
    expect((await saved(w))[0]).toEqual(hand);
  });

  it("two background turns and Summarize now serialize disjoint spans", async () => {
    const w = await fixture();
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2 } });
    const [a, b] = await Promise.all([
      w.chat.send(w.session.id, w.head, "Branch A", connection),
      w.chat.send(w.session.id, w.head, "Branch B", connection),
      w.chat.turns.summarizeNow(w.session.id, w.head, connection),
    ]);
    const chapters = await saved(w);
    expect(chapters).toHaveLength(3);
    for (const reply of [a.reply, b.reply]) {
      const path = await w.store.pathTo(reply.id);
      const ranges = chapters.map(c => path.filter(m => m.id === c.fromId || m.id === c.toId).map(m => path.indexOf(m)));
      expect(new Set(ranges.flat()).size).toBe(6);
      expect(applyChapters(path, chapters).covered).toBe(12);
    }
    expect(w.ai.prompts.filter(p => /summarize part/.test(p[0]?.content ?? ""))).toHaveLength(3);
  });

  it.each(["provider", "empty", "storage", "stop"] as const)("a %s summary failure leaves the completed reply intact and reports memory error", async failure => {
    const w = await fixture(5), errors: string[] = [];
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2 } });
    w.core.events.on("core.error", e => { if (e.source === "memory") errors.push(e.message); });
    const abort = new AbortController();
    if (failure === "storage") {
      const original = w.store.setAppSetting.bind(w.store);
      vi.spyOn(w.store, "setAppSetting").mockImplementation(async (key, value) => {
        if (key.startsWith("memory.chapters:")) throw new Error("Disk failure");
        return original(key, value);
      });
    } else vi.spyOn(w.core.connections, "complete").mockImplementationOnce(async () => {
      if (failure === "provider") throw new Error("Provider failure");
      if (failure === "stop") { abort.abort(); return { text: "Late answer", reasoning: "", model: "fake-1" }; }
      return { text: "Title: Empty", reasoning: "", model: "fake-1" };
    });
    const result = await w.chat.send(w.session.id, w.head, "A turn that must succeed", connection, { signal: abort.signal });
    expect(result.reply.content).toBe("A reply.");
    expect(await w.store.getMessage(result.reply.id)).toEqual(result.reply);
    expect(await saved(w)).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});
