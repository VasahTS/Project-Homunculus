// Simple memory: chapter summaries (D-054). Author: CLAUDE, 2026-10-30.
import { describe, expect, it } from "vitest";
import type { Message } from "@homunculus/schemas";
import { applyChapters, DEFAULT_PRESET, MEMORY_DEFAULTS, nextChapterSpan, parseChapter, resolveSetup, type Chapter } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

const msg = (i: number): Message => ({
  id: `m${i}`, sessionId: "s", parentId: i > 1 ? `m${i - 1}` : null, speaker: i % 2 ? { kind: "user" } : { kind: "character", characterId: "c" },
  kind: i % 2 ? "user" : "reply", visibility: { ai: "full", user: true }, content: `message ${i}`, createdAt: i, meta: {},
});
const path = Array.from({ length: 12 }, (_, i) => msg(i + 1));
const ch = (fromId: string, toId: string, over: Partial<Chapter> = {}): Chapter => ({ id: `c-${fromId}`, fromId, toId, title: "T", summary: "S", messageCount: 0, createdAt: 0, ...over });

describe("memory (chapters)", () => {
  it("is off by default and each value inherits on its own", () => {
    expect(resolveSetup({}).memory).toEqual(MEMORY_DEFAULTS);
    expect(MEMORY_DEFAULTS).toMatchObject({ on: false, every: 20, keep: 10, mode: "simple", layers: true });
    expect(resolveSetup({ story: { memory: { on: true, mode: "smart" } }, session: { memory: { keep: 4 } } }).memory)
      .toEqual({ ...MEMORY_DEFAULTS, on: true, keep: 4, mode: "smart" });
  });

  it("chapters stand in for the messages they cover; a chapter off the path or switched off does nothing", () => {
    const r = applyChapters(path, [ch("m1", "m4", { title: "The mill" }), ch("x1", "x2"), ch("m5", "m6", { off: true })]);
    expect(r.history.map((m) => m.id)).toEqual(["m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"]);
    expect(r.covered).toBe(4);
    expect(r.text).toContain("Chapter 1: The mill\nS");
    expect(applyChapters(path.slice(0, 3), [ch("m1", "m4")]).history).toHaveLength(3); // a branch before the chapter's end
  });

  it("the next chapter starts after the last one and leaves the newest messages out", () => {
    expect(nextChapterSpan(path, [], { keep: 4 }, 8).map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]);
    expect(nextChapterSpan(path, [ch("m1", "m4")], { keep: 4 }, 8)).toEqual([]);
    expect(nextChapterSpan(path, [ch("m1", "m4")], { keep: 4 }, 2).map((m) => m.id)).toEqual(["m5", "m6", "m7", "m8"]);
  });

  it("reads a title and a summary", () => {
    expect(parseChapter("Title: The Silver Fox\n\nThey met at dawn.")).toEqual({ title: "The Silver Fox", summary: "They met at dawn." });
    expect(parseChapter("**Title:** Ash\nBody")).toEqual({ title: "Ash", summary: "Body" });
    // CODEX: A missing title must not consume the first line of the summary.
    expect(parseChapter("Title:\n\nThey met at dawn.")).toEqual({ title: "", summary: "They met at dawn." });
    expect(parseChapter("**Title: Ash**\nBody")).toEqual({ title: "Ash", summary: "Body" });
    expect(parseChapter("<think>Unfinished reasoning")).toEqual({ title: "", summary: "" });
    expect(parseChapter("Just text")).toEqual({ title: "", summary: "Just text" });
  });

  it("reports the writer's token limit and saves only a complete summary", async () => {
    // CODEX: Reproduce a thinking model that runs out of tokens before answering.
    const w = await world(() => "ok");
    await w.store.setDefaultSetup({ memory: { on: true, auto: false, keep: 0 } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    const { reply } = await w.chat.send(session.id, firstMessage!.id, "Open the door.", connection);
    const writes: Array<{ model: string; prompt: string | undefined }> = [];
    w.core.providers.get("fake")!.stream = async function* ({ connection: writer, messages }) {
      writes.push({ model: writer.model, prompt: messages[0]?.content });
      yield { reasoning: "Considering the clues…" };
      if (writer.params?.maxTokens === 4096) yield "Title: The clues\nThe door was open.";
      yield { finish: writer.params?.maxTokens === 4096 ? "stop" : "length" };
    };
    const profiles = { writer: { ...connection, model: "profile-model" } };
    await w.store.saveSession({ ...session, setup: { memory: {
      summaryConnectionId: "writer", summaryModel: "chapter-model", summaryPrompt: "Write an inventory of clues.", summaryMaxTokens: 1200,
    } } });
    await expect(w.chat.turns.summarizeNow(session.id, reply.id, connection, profiles)).rejects.toThrow(/1,200.*Max output tokens/i);
    expect(await w.chat.turns.chapters(session.id)).toEqual([]);
    await w.store.saveSession({ ...session, setup: { memory: {
      summaryConnectionId: "writer", summaryModel: "chapter-model", summaryPrompt: "Write an inventory of clues.",
    } } });
    await expect(w.chat.turns.summarizeNow(session.id, reply.id, connection, profiles))
      .resolves.toMatchObject({ title: "The clues", summary: "The door was open." });
    expect(writes).toEqual(Array(2).fill({ model: "chapter-model", prompt: "Write an inventory of clues." }));
  });

  it("a turn closes a chapter when enough messages wait, and the next prompt uses it instead of them", async () => {
    const w = await world((m) => /summarize part of an ongoing roleplay/.test(m[0]?.content ?? "") ? "Title: Meeting Lyra\n\nDan met Lyra at the mill." : "ok");
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2 } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    let at = firstMessage!.id;
    for (const t of ["One.", "Two.", "Three."]) at = (await w.chat.send(session.id, at, t, connection)).reply.id;
    const chapters = await w.chat.turns.chapters(session.id);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({ title: "Meeting Lyra", messageCount: 4, fromId: firstMessage!.id });
    await w.chat.send(session.id, at, "Four.", connection);
    const main = w.ai.prompts.filter((p) => !/summarize part/.test(p[0]?.content ?? "")).at(-1)!;
    const all = main.map((p) => p.content).join("\n");
    expect(all).toContain("Chapter 1: Meeting Lyra");
    expect(all).not.toContain("One.");
    expect(all).toContain("Four.");

    // CODEX: The chapter is system text at the start of the active Chat History block.
    const preview = await w.chat.turns.previewPrompt(session.id, at, connection, { userText: "A new turn." });
    const memoryIndex = preview.parts.findIndex((p) => p.source === "agent:memory");
    const historyIndex = preview.parts.findIndex((p) => p.source === "history" && p.role !== "system");
    expect(memoryIndex).toBeGreaterThan(-1);
    expect(historyIndex).toBeGreaterThan(memoryIndex);
    expect(preview.parts[memoryIndex]).toMatchObject({ role: "system" });

    await w.store.presets.save({ ...DEFAULT_PRESET, blocks: DEFAULT_PRESET.blocks.filter((p) => p.marker !== "chatHistory") });
    const noHistory = await w.chat.turns.previewPrompt(session.id, at, connection, { userText: "A new turn." });
    expect(noHistory.parts.some((p) => p.source === "agent:memory")).toBe(false);
    expect(noHistory.memory).toBeUndefined();
    expect(noHistory.notes).toContain("Memory was skipped because the preset's Chat History block is inactive for this reply.");
  });
});
