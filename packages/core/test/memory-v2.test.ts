// Memory v2: layers, closing by tokens, smart recall, catch up (D-083). Author: CLAUDE, 2026-11-04.
import { describe, expect, it } from "vitest";
import type { Message } from "@homunculus/schemas";
import {
  chapterLabel, chaptersOnPath, coveredChapterLabels, DecisionCache, dueSpan, MEMORY_DEFAULTS, nextMerge, parseDecisions, rankByWords, shortlist,
  smartRecall, topCover, type Chapter, type ChatTurn, type DecisionQuestion,
} from "../src/index.ts";
import { connection, world } from "./helpers.ts";

const msg = (i: number, content = `message ${i}`): Message => ({
  id: `m${i}`, sessionId: "s", parentId: i > 1 ? `m${i - 1}` : null, speaker: i % 2 ? { kind: "user" } : { kind: "character", characterId: "c" },
  kind: i % 2 ? "user" : "reply", visibility: { ai: "full", user: true }, content, createdAt: i, meta: {},
});
const ch = (n: number, fromId: string, toId: string, over: Partial<Chapter> = {}): Chapter =>
  ({ id: `c${n}`, fromId, toId, title: `T${n}`, summary: `S${n}`, messageCount: 2, createdAt: n, ...over });
const path = Array.from({ length: 12 }, (_, i) => msg(i + 1));
const four = [ch(1, "m1", "m2"), ch(2, "m3", "m4"), ch(3, "m5", "m6"), ch(4, "m7", "m8")];

describe("layers (Summaryception)", () => {
  // CODEX: A merge cannot stand in for a gap its input skipped.
  it("keeps originals from switched-off or missing chapters in history", () => {
    const gap = [four[0]!, { ...four[1]!, off: true }, ...four.slice(2), ch(5, "m9", "m10")];
    const next = nextMerge(path, gap, { layerSize: 3, layerMerge: 2 });
    expect(next?.group.map(x => x.chapter.id)).toEqual(["c3", "c4"]);
    const oldMerge = ch(9, "m1", "m6", { level: 1, parts: ["c1", "c3"] });
    expect(topCover(path, [...gap, oldMerge]).map(x => x.chapter.id)).toEqual(["c1", "c3", "c4", "c5"]);
    expect(coveredChapterLabels(path, [...gap, oldMerge]).has("m3")).toBe(false);
  });

  it("a merged summary stands in for its chapters; switched off, the chapters come back", () => {
    const arc = ch(9, "m1", "m6", { level: 1, parts: ["c1", "c2", "c3"], title: "Arc" });
    expect(topCover(path, [...four, arc]).map((x) => x.chapter.id)).toEqual(["c9", "c4"]);
    const level0 = chaptersOnPath(path, four);
    expect(chapterLabel(chaptersOnPath(path, [...four, arc]).find((x) => x.chapter.id === "c9")!, level0)).toBe("Chapters 1–3");
    // CODEX: Each message keeps its own chapter number even when the prompt sends a merged recap.
    expect(coveredChapterLabels(path, [...four, arc]).get("m3")).toBe("Chapter 2");
    expect(topCover(path, [...four, { ...arc, off: true }]).map((x) => x.chapter.id)).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("merges the oldest when a level has more than the limit, and climbs levels", () => {
    expect(nextMerge(path, four, { layerSize: 4, layerMerge: 2 })).toBeUndefined();
    const m = nextMerge(path, four, { layerSize: 3, layerMerge: 2 })!;
    expect(m.level).toBe(1);
    expect(m.group.map((x) => x.chapter.id)).toEqual(["c1", "c2"]);
    // after merging c1+c2, only c3 and c4 are free at level 0: nothing more to merge
    expect(nextMerge(path, [...four, ch(9, "m1", "m4", { level: 1 })], { layerSize: 3, layerMerge: 2 })).toBeUndefined();
  });
});

describe("closing by tokens (Chapter Memory)", () => {
  it("waits for the size, then cuts at an AI reply", () => {
    const long = Array.from({ length: 10 }, (_, i) => msg(i + 1, "x".repeat(360))); // ~104 tokens each
    const s = { ...MEMORY_DEFAULTS, closeBy: "tokens" as const, everyTokens: 300, keep: 2 };
    const span = dueSpan(long, [], s);
    expect(span.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]); // m3 reaches 300 but is the user's: the cut waits for m4
    expect(dueSpan(long.slice(0, 4), [], s)).toEqual([]); // only m1–m2 wait outside the newest 2
    expect(dueSpan(long.slice(0, 4), [], s, true).map((m) => m.id)).toEqual(["m1", "m2"]); // Summarize now
  });
});

describe("the free shortlist (Marinara)", () => {
  it("ranks by distinctive shared words and ignores the characters' names", () => {
    const docs = ["Lyra and Dan walked to the mill.", "Lyra found a silver locket by the river.", "Lyra slept.", "Dan cooked stew for Lyra."];
    const scores = rankByWords("Where is the silver locket, Lyra?", docs, ["Lyra", "Dan"]);
    expect(scores.indexOf(Math.max(...scores))).toBe(1);
    expect(shortlist([0, 5, 1, 0, 9, 0], 2)).toEqual([1, 2, 3, 4, 5]); // the best two + the one after each of the best three
  });
});

describe("smart recall (Chapter Memory's two tiers)", () => {
  const chapters = [
    ch(1, "m1", "m2", { title: "The locket", summary: "Lyra found a silver locket by the river and hid it." }),
    ch(2, "m3", "m4", { title: "Stew", summary: "Dan cooked stew." }),
    ch(3, "m5", "m6", { title: "Rain", summary: "It rained all night." }),
  ];
  const history = [msg(1, "By the river Lyra lifts a silver locket engraved with an owl."), ...path.slice(1, 10)];
  const fake = () => {
    const calls: DecisionQuestion[][] = [];
    const decide = async (_state: string, qs: DecisionQuestion[]) => {
      calls.push(qs);
      return new Map(qs.map((q) => [q.id, /locket/.test(q.instructions) && !/Stew|Rain|message \d/.test(q.instructions) ? 0.9 : 0.1]));
    };
    return { calls, decide };
  };
  const input = (decide: (s: string, q: DecisionQuestion[]) => Promise<Map<string, number>>, cache = new DecisionCache()) => ({
    history, chapters, settings: { recallChapters: 4, recallQuotes: 3 }, exchange: "[Dan]: Show me the locket again.",
    nameOf: (m: Message) => (m.speaker.kind === "user" ? "Dan" : "Lyra"), ignoreNames: ["Lyra", "Dan"], decide, deciderName: "jev", cache,
  });

  it("sends the relevant chapter and the last one, quotes the message the summary lacks, and hides what summaries cover", async () => {
    const f = fake();
    const r = (await smartRecall(input(f.decide)))!;
    expect(r.receipt.picked.map((p) => p.title)).toEqual(["The locket", "Rain"]);
    expect(r.text).toContain("The locket");
    expect(r.text).not.toContain("Dan cooked stew");
    expect(r.text).toContain("engraved with an owl");
    expect(r.receipt.quotes).toBe(1);
    expect([...r.hidden].sort()).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
    expect(f.calls[0]!.every((q) => q.id.startsWith("ch_"))).toBe(true);
  });

  it("asks nothing again for the same exchange (a swipe)", async () => {
    const f = fake();
    const cache = new DecisionCache();
    await smartRecall(input(f.decide, cache));
    const before = f.calls.length;
    const again = (await smartRecall(input(f.decide, cache)))!;
    expect(f.calls.length).toBe(before);
    expect(again.receipt.cached).toBe(again.receipt.questions);
  });

  it("falls back to every summary when the decider fails, and says why", async () => {
    const r = (await smartRecall(input(() => Promise.reject(new Error("401 bad key")))))!;
    expect(r.receipt.fallback).toContain("401");
    expect(r.text).toContain("Dan cooked stew");
  });

  it("reads a chat model's JSON answer, loosely", () => {
    expect(parseDecisions('<think>hm</think>```json\n{"ch_a": 0.8, "ch_b": false, "ch_c": "yes"}\n```', ["ch_a", "ch_b", "ch_c"]))
      .toEqual(new Map([["ch_a", 0.8], ["ch_b", 0], ["ch_c", 1]]));
    expect(parseDecisions("ch_a: 0.3, ch_b = 1", ["ch_a", "ch_b"])).toEqual(new Map([["ch_a", 0.3], ["ch_b", 1]]));
  });
});

describe("memory v2 in a chat", () => {
  const summarizer = (m: ChatTurn[]) => /summarize part of an ongoing roleplay/.test(m[0]?.content ?? "")
    ? `Title: Part\n\nSummary of: ${(m[1]?.content ?? "").match(/Messages to summarize:\n\n([\s\S]*)/)?.[1]?.slice(0, 60)}`
    : /Merge consecutive chapter summaries/.test(m[0]?.content ?? "") ? "Title: Merged\n\nThe merged stretch." : "ok";

  // CODEX: The decision model is a separate provider call and must respect the message's visibility.
  it("omits manually hidden messages from the decision model's latest exchange", async () => {
    const w = await world(() => "ok");
    await w.store.setDefaultSetup({ memory: { on: true, auto: false, mode: "smart", keep: 0 } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    await w.chat.turns.addOwnChapter(session.id, firstMessage!.id, "Opening", "They met.");
    const shown = await w.chat.send(session.id, firstMessage!.id, "Visible scene.", connection);
    const hidden = await w.store.addMessage({ id: "hidden", sessionId: session.id, parentId: shown.reply.id, speaker: { kind: "user" },
      content: "Hidden sentinel.", visibility: { ai: "none", user: true }, createdAt: 100 });
    const calls: string[] = [];
    w.core.providers.get("fake")!.decide = async (req) => { calls.push(req.state); return { answers: {} }; };
    await w.chat.generate(session.id, hidden.id, connection);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.join("\n")).not.toContain("Hidden sentinel.");
    expect(calls.join("\n")).toContain("Visible scene.");
  });

  it("layers merge old chapters as the story grows, and the prompt sends the merged summary", async () => {
    const w = await world(summarizer);
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2, layers: true, layerSize: 3, layerMerge: 2 } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    let at = firstMessage!.id;
    for (let i = 1; i <= 9; i++) at = (await w.chat.send(session.id, at, `Turn ${i}.`, connection)).reply.id;
    const all = await w.chat.turns.chapters(session.id);
    expect(all.filter((c) => (c.level ?? 0) === 1)).toHaveLength(1);
    const state = await w.chat.turns.memoryAt(session.id, at);
    expect(state.chapters.find((c) => c.level === 1)).toMatchObject({ label: "Chapters 1–2", sent: true });
    expect(state.chapters.filter((c) => c.mergedInto)).toHaveLength(2);
    await w.chat.send(session.id, at, "Next.", connection);
    const main = w.ai.prompts.filter((p) => /^You are Lyra/.test(p[0]?.content ?? "")).at(-1)!.map((p) => p.content).join("\n");
    expect(main).toContain("Chapters 1–2: Merged");
  });

  it("smart mode asks the decision model before the reply and records the receipt", async () => {
    const w = await world(summarizer);
    const asked: string[][] = [];
    const provider = w.core.providers.get("fake")!;
    provider.decide = async (req) => {
      asked.push(req.questions.map((q) => q.id));
      return { answers: Object.fromEntries(req.questions.map((q) => [q.id, /Turn 1\./.test(q.instructions) ? 0.9 : 0.1])) };
    };
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2, layers: false, mode: "smart", recallQuotes: 1 } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    let at = firstMessage!.id;
    for (let i = 1; i <= 7; i++) at = (await w.chat.send(session.id, at, `Turn ${i}.`, connection)).reply.id;
    expect((await w.chat.turns.chapters(session.id)).length).toBeGreaterThanOrEqual(3);
    const { reply } = await w.chat.send(session.id, at, "Remember turn 1?", connection);
    expect(asked.some((q) => q.every((id) => id.startsWith("ch_")))).toBe(true);
    const rec = await w.store.getGenerationRecord(reply.id);
    expect(rec?.memory).toMatchObject({ mode: "smart", decider: "typesafe/jev-latest" });
    expect(rec?.memory?.fallback).toBeUndefined();
    expect(rec?.promptNotes?.some((n) => /Memory \(smart\)/.test(n))).toBe(true);
  });

  it("smart mode without a decision model falls back to every summary and the reply still comes", async () => {
    const w = await world(summarizer);
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2, mode: "smart" } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    let at = firstMessage!.id;
    for (let i = 1; i <= 4; i++) at = (await w.chat.send(session.id, at, `Turn ${i}.`, connection)).reply.id;
    const { reply } = await w.chat.send(session.id, at, "And now?", connection);
    const rec = await w.store.getGenerationRecord(reply.id);
    expect(rec?.memory?.fallback).toMatch(/cannot ask decision models/);
  });

  it("catch up writes every chapter waiting in an old chat", async () => {
    const w = await world(summarizer);
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    let at = firstMessage!.id;
    for (let i = 1; i <= 10; i++) at = (await w.chat.send(session.id, at, `Turn ${i}.`, connection)).reply.id;
    expect(await w.chat.turns.chapters(session.id)).toHaveLength(0);
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2, layers: false } });
    const progress: number[] = [];
    const made = await w.chat.turns.catchUpMemory(session.id, at, connection, undefined, (done) => progress.push(done));
    expect(made).toBe(4); // 21 messages, the newest 2 kept: 19 wait → 4 chapters of 4
    expect((await w.chat.turns.memoryAt(session.id, at)).dueChapters).toBe(0);
    expect(progress.at(-1)).toBe(4);
  });

  it("Memory tab helpers: automatic off, Write It Myself, message numbers, the preview and Try It (D-084)", async () => {
    const w = await world(summarizer);
    const provider = w.core.providers.get("fake")!;
    provider.decide = async (req) => ({ answers: Object.fromEntries(req.questions.map((q) => [q.id, 0.8])) });
    await w.store.setDefaultSetup({ memory: { on: true, auto: false, every: 4, keep: 2, mode: "smart" } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    let at = firstMessage!.id;
    for (let i = 1; i <= 4; i++) at = (await w.chat.send(session.id, at, `Turn ${i}.`, connection)).reply.id;
    expect(await w.chat.turns.chapters(session.id)).toHaveLength(0); // automatic off
    const before = await w.chat.turns.memoryAt(session.id, at);
    expect(before).toMatchObject({ waiting: 7, waitingFrom: 1, waitingTo: 7, promptTokens: 0 });
    const own = await w.chat.turns.addOwnChapter(session.id, at, " The mill ", "Dan and Lyra met at the mill.");
    expect(own).toMatchObject({ title: "The mill", edited: true, messageCount: 7 });
    const after = await w.chat.turns.memoryAt(session.id, at);
    expect(after.chapters[0]).toMatchObject({ from: 1, to: 7, label: "Chapter 1", sent: true });
    expect(after.waiting).toBe(0);
    expect(after.promptTokens).toBeGreaterThan(0);
    expect((await w.chat.turns.memoryPreview(session.id, at)).text).toContain("Chapter 1: The mill");
    const tried = await w.chat.turns.testRecall(session.id, at, "Remember the mill?", connection);
    expect(tried?.receipt.picked.map((p) => p.title)).toEqual(["The mill"]);
    expect(await w.chat.turns.addOwnChapter(session.id, at, "", "Nothing waits now.")).toBeUndefined();
  });
});

describe("decision models picked as a chat model (D-085)", () => {
  it("recognizes them", async () => {
    const { isDecisionModel } = await import("../src/index.ts");
    for (const m of ["typesafe/jev-latest", "typesafe/jev-1.13", "jev-latest", "liquid/d1", "perplexity/pplx-decider-v1.2", "cloudflare/clef-flash", "clef"]) expect(isDecisionModel(m)).toBe(true);
    for (const m of ["z-ai/glm-5.3:thinking", "openai/gpt-5", "jevon/chat", "anthropic/claude"]) expect(isDecisionModel(m)).toBe(false);
  });

  it("a Jev agents' connection with 'Agents' model' still asks through /decisions", async () => {
    const summarizer = (m: ChatTurn[]) => /summarize part/.test(m[0]?.content ?? "") ? "Title: T\n\nS." : "ok";
    const w = await world(summarizer);
    let decided = 0;
    w.core.providers.get("fake")!.decide = async (req) => { decided++; return { answers: Object.fromEntries(req.questions.map((q) => [q.id, 0.7])) }; };
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2 } });
    const { session, firstMessage } = await w.chat.createSession({ characterIds: ["lyra"] });
    let at = firstMessage!.id;
    for (let i = 1; i <= 6; i++) at = (await w.chat.send(session.id, at, `Turn ${i}.`, connection)).reply.id;
    await w.store.setDefaultSetup({ memory: { on: true, every: 4, keep: 2, mode: "smart", decider: "agents" } });
    const r = await w.chat.turns.testRecall(session.id, at, "Turn 1?", { ...connection, model: "typesafe/jev-latest" });
    expect(r?.receipt.fallback).toBeUndefined();
    expect(decided).toBeGreaterThan(0);
  });
});
