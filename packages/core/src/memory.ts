// Homunculus 2 — memory: chapter summaries, layers and smart recall (docs/MEMORY-PLAN.md; D-054, D-083).
// Author: CLAUDE, 2026-10-30 (simple chapters); 2026-11-04 (layers, closing by tokens, smart recall).
//
// One engine, three questions (MEMORY-PLAN): when to close a chapter, how to keep it, what to send.
// - Closing: every `every` messages, or (Daniel's friend's Chapter Memory) when the waiting messages pass `everyTokens`,
//   cut at an AI reply. The newest `keep` messages always go word for word.
// - Keeping: one chapter per span, written with the previous chapter alongside. With layers on (Summaryception,
//   Lodactio, AGPL-3.0), when more than `layerSize` items of one level are on the path, the oldest `layerMerge` of them
//   are merged into one summary of the level above, so a very long story keeps a small memory.
// - Sending, "simple": every summary on the path that no higher summary covers, in story order (no extra call).
//   "smart" (the friend's two-tier recall + Marinara's Advanced Memory Recall): see recall.ts.
// - Chapters are tied to the tree, not to an index: a summary counts only on paths that hold both of its ends, so a
//   branch opened in the middle of a chapter simply gets those messages back word for word. Messages never change.
// - A summary the user edited is never rewritten by the app.
import type { Message } from "@homunculus/schemas";
import { estimateTokens } from "./presets.ts";

export interface Chapter {
  id: string;
  /** First and last message the chapter covers (both on the path where it was made). */
  fromId: string;
  toId: string;
  title: string;
  summary: string;
  messageCount: number;
  createdAt: number;
  /** The user changed the summary: the app never rewrites it. */
  edited?: boolean;
  /** Off = kept but not sent (and it hides nothing). */
  off?: boolean;
  /** 0 (or missing) = a chapter of messages; 1+ = a summary of summaries of the level below (layers). */
  level?: number;
  /** For level 1+: the summaries it merged, oldest first. */
  parts?: string[];
}

export type MemoryMode = "simple" | "smart";

export interface MemorySettings {
  on: boolean;
  /** Write chapters by themselves after replies (off = only when asked: Write Chapter Now, Write It Myself, Catch Up). */
  auto: boolean;
  /** Messages per chapter (when closing by messages). */
  every: number;
  /** The newest messages that always go word for word. */
  keep: number;
  /** What closes a chapter: a number of messages, or the waiting messages' size in tokens. */
  closeBy: "messages" | "tokens";
  /** Tokens per chapter (when closing by tokens). */
  everyTokens: number;
  /** Layers: merge old summaries into bigger ones. */
  layers: boolean;
  /** Items of one level allowed on the path before the oldest merge. */
  layerSize: number;
  /** How many merge into one. */
  layerMerge: number;
  mode: MemoryMode;
  /** Smart recall: who answers the yes/no questions. "jev" = a decision model (nano-gpt's /decisions); "agents" = the agents' chat model. */
  decider: "jev" | "agents";
  /** The saved connection whose address and key the decision model uses (empty = the agents' connection). */
  deciderConnectionId: string;
  deciderModel: string;
  /** At most this many chapters chosen per reply (the last chapter always goes, on top). */
  recallChapters: number;
  /** At most this many messages quoted word for word per chosen chapter (0 = summaries only). */
  recallQuotes: number;
}

export const MEMORY_DEFAULTS: MemorySettings = {
  on: false, auto: true, every: 20, keep: 10, closeBy: "messages", everyTokens: 8000,
  layers: true, layerSize: 10, layerMerge: 3,
  mode: "simple", decider: "jev", deciderConnectionId: "", deciderModel: "typesafe/jev-latest", recallChapters: 4, recallQuotes: 3,
};

/** Highest level a merge may create (Summaryception's default of 5 layers). */
export const MAX_LEVEL = 4;

/** Messages that count for memory: what the AI would read word for word. */
export const readable = (path: Message[]) => path.filter((m) => m.visibility.ai === "full" && m.kind !== "event");

export const levelOf = (c: Chapter) => c.level ?? 0;

export type Placed = { chapter: Chapter; from: number; to: number };

/** The summaries that hold on this path (any level), in story order, with the index range each covers in `readable(path)`. */
export function chaptersOnPath(path: Message[], chapters: Chapter[]): Placed[] {
  const list = readable(path);
  const at = new Map(list.map((m, i) => [m.id, i]));
  const out: Placed[] = [];
  for (const c of chapters) {
    const from = at.get(c.fromId), to = at.get(c.toId);
    if (from === undefined || to === undefined || to < from) continue;
    out.push({ chapter: c, from, to });
  }
  return out.sort((a, b) => a.from - b.from || levelOf(b.chapter) - levelOf(a.chapter));
}

/** Covered by a switched-on summary of a higher level on the same path. */
const coveredByHigher = (x: Placed, on: Placed[]) =>
  on.some((y) => y !== x && levelOf(y.chapter) > levelOf(x.chapter) && y.from <= x.from && y.to >= x.to);

/** What "simple" sends: switched-on summaries no higher summary covers, in story order. */
export function topCover(path: Message[], chapters: Chapter[]): Placed[] {
  const on = chaptersOnPath(path, chapters).filter((x) => !x.chapter.off);
  return on.filter((x) => !coveredByHigher(x, on));
}

/** Messages covered by a switched-on summary on this path (they leave the prompt). */
export function coveredIds(path: Message[], chapters: Chapter[]): Set<string> {
  const list = readable(path);
  const hidden = new Set<string>();
  for (const x of chaptersOnPath(path, chapters)) if (!x.chapter.off) for (let i = x.from; i <= x.to; i++) hidden.add(list[i]!.id);
  return hidden;
}

/** A label for a summary in the list and the prompt: "Chapter 3", or "Chapters 1–3" for a merged one. */
export function chapterLabel(x: Placed, level0: Placed[]): string {
  const inside = level0.map((y, i) => ({ y, n: i + 1 })).filter(({ y }) => y.from >= x.from && y.to <= x.to);
  if (levelOf(x.chapter) === 0) return `Chapter ${(inside[0]?.n ?? 0) || level0.indexOf(x) + 1}`;
  if (!inside.length) return "Earlier chapters";
  const a = inside[0]!.n, b = inside[inside.length - 1]!.n;
  return a === b ? `Chapter ${a}` : `Chapters ${a}–${b}`;
}

export const STORY_SO_FAR = "The story so far (summaries of earlier chapters; the messages after this continue from here):";

/** The text block for a list of summaries (+ optional word-for-word quotes under some of them). */
export function memoryText(placed: Placed[], all: Placed[], quotes: Map<string, string[]> = new Map(), header = STORY_SO_FAR): string {
  const level0 = all.filter((x) => levelOf(x.chapter) === 0);
  const blocks = placed.map((x) => {
    const q = quotes.get(x.chapter.id);
    return `${chapterLabel(x, level0)}${x.chapter.title ? `: ${x.chapter.title}` : ""}\n${x.chapter.summary.trim()}`
      + (q?.length ? `\nWord for word from this chapter:\n${q.join("\n\n")}` : "");
  });
  return `${header}\n\n${blocks.join("\n\n")}`;
}

/**
 * What the prompt gets ("simple"): the history without the messages summaries cover, and "the story so far" text
 * (empty when there are no summaries on this path).
 */
export function applyChapters(history: Message[], chapters: Chapter[]): { history: Message[]; text: string; covered: number; sent: number } {
  const all = chaptersOnPath(history, chapters);
  const top = topCover(history, chapters);
  if (!top.length) return { history, text: "", covered: 0, sent: 0 };
  const hidden = coveredIds(history, chapters);
  return { history: history.filter((m) => !hidden.has(m.id)), text: memoryText(top, all), covered: hidden.size, sent: top.length };
}

/** Where the next chapter starts: after the last chapter of messages on this path. */
function nextStart(path: Message[], chapters: Chapter[]): number {
  const on = chaptersOnPath(path, chapters).filter((x) => levelOf(x.chapter) === 0);
  return on.length ? Math.max(...on.map((x) => x.to)) + 1 : 0;
}

/** Messages outside the newest `keep` that no chapter covers yet. */
export function waitingSpan(path: Message[], chapters: Chapter[], s: Pick<MemorySettings, "keep">): Message[] {
  const list = readable(path);
  const start = nextStart(path, chapters);
  return list.slice(start, Math.max(start, list.length - s.keep));
}

/**
 * The messages the next chapter would cover: the oldest readable messages after the last chapter on this path,
 * leaving the newest `keep` out. Empty when there are fewer than `min`.
 * Closing by tokens (`tokens` set): empty until the waiting messages reach that size; then the span grows from the
 * oldest message until it reaches it and ends at an AI reply (never in the middle of an exchange).
 */
export function nextChapterSpan(path: Message[], chapters: Chapter[], s: Pick<MemorySettings, "keep">, min: number, tokens?: number, force = false): Message[] {
  const span = waitingSpan(path, chapters, s);
  if (tokens === undefined) return span.length >= Math.max(1, min) ? span : [];
  const size = span.reduce((n, m) => n + estimateTokens(m.content), 0);
  if ((!force && size < tokens) || span.length < Math.max(2, min)) return [];
  let acc = 0, cut = span.length;
  for (let i = 0; i < span.length; i++) {
    acc += estimateTokens(span[i]!.content);
    if (acc >= tokens && span[i]!.speaker.kind !== "user") { cut = i + 1; break; }
  }
  return span.slice(0, cut);
}

/**
 * The span the next chapter covers with these settings (closing by messages or by tokens). `manual` (Summarize now):
 * at least 2 messages, without waiting for a full chapter.
 */
export function dueSpan(path: Message[], chapters: Chapter[], s: MemorySettings, manual = false): Message[] {
  const min = manual ? 2 : s.every;
  return s.closeBy === "tokens"
    ? nextChapterSpan(path, chapters, s, 2, s.everyTokens, manual)
    : nextChapterSpan(path, chapters, s, min).slice(0, Math.max(min, s.every));
}

/** Rough size in tokens of the messages waiting for a chapter. */
export const waitingTokens = (path: Message[], chapters: Chapter[], s: Pick<MemorySettings, "keep">) =>
  waitingSpan(path, chapters, s).reduce((n, m) => n + estimateTokens(m.content), 0);

/**
 * Layers (Summaryception): the oldest `layerMerge` summaries of the lowest level that has more than `layerSize`
 * on this path and are not merged yet. Undefined when nothing needs merging.
 */
export function nextMerge(path: Message[], chapters: Chapter[], s: Pick<MemorySettings, "layerSize" | "layerMerge">): { level: number; group: Placed[] } | undefined {
  const all = chaptersOnPath(path, chapters).filter((x) => !x.chapter.off);
  const merge = Math.max(2, s.layerMerge);
  const size = Math.max(merge, s.layerSize);
  for (let level = 0; level < MAX_LEVEL; level++) {
    const free = all.filter((x) => levelOf(x.chapter) === level && !coveredByHigher(x, all));
    if (free.length > size) return { level: level + 1, group: free.slice(0, merge) };
  }
  return undefined;
}

type Turn = { role: "system" | "user"; content: string };

const SUMMARY_RULES = "Keep what later scenes will need: who did what, decisions and promises (with their exact terms), what people learned or now believe, "
  + "injuries, items gained or lost, where everyone ended up, open threads and plans, and how relationships changed. Prefer concrete specifics "
  + "(\"promised to fix the radio by Friday\", not \"made a promise\"). Keep names exact. Leave out style and small talk. Do not invent anything. No commentary.";

/** The request that writes one chapter. */
export function chapterRequest(span: Message[], previous: Chapter | undefined, nameOf: (m: Message) => string): Turn[] {
  const transcript = span.map((m) => `${nameOf(m)}: ${m.content.trim()}`).join("\n\n");
  return [
    {
      role: "system",
      content: "You summarize part of an ongoing roleplay story into a chapter of its memory. Write in past tense, third person, plain prose. "
        + SUMMARY_RULES + "\n\n"
        + "Answer exactly in this form:\nTitle: <3 to 7 words>\n\n<the summary, 120 to 400 words>",
    },
    {
      role: "user",
      content: `${previous ? `The chapter before (for continuity, do not repeat it):\nTitle: ${previous.title}\n${previous.summary.trim()}\n\n` : ""}Messages to summarize:\n\n${transcript}`,
    },
  ];
}

/** The request that merges summaries into one of the level above (layers). `before` = the summary just before, for continuity. */
export function mergeRequest(group: Chapter[], before: Chapter | undefined): Turn[] {
  const parts = group.map((c, i) => `Part ${i + 1}${c.title ? `: ${c.title}` : ""}\n${c.summary.trim()}`).join("\n\n");
  return [
    {
      role: "system",
      content: "You keep the long-term memory of an ongoing roleplay story. Merge consecutive chapter summaries into one shorter summary of the whole stretch. "
        + "Write in past tense, third person, plain prose, in story order. " + SUMMARY_RULES
        + " Drop what a later part makes obsolete. Do not repeat what the summary before already says.\n\n"
        + "Answer exactly in this form:\nTitle: <3 to 7 words>\n\n<the merged summary, 150 to 450 words>",
    },
    {
      role: "user",
      content: `${before ? `The summary before (for continuity, do not repeat it):\n${before.summary.trim()}\n\n` : ""}Summaries to merge, oldest first:\n\n${parts}`,
    },
  ];
}

/** Reads the model's answer: a "Title:" line, then the summary. */
export function parseChapter(answer: string): { title: string; summary: string } {
  const text = answer.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const m = /^\s*(?:\*\*)?title(?:\*\*)?\s*:\s*(.+)$/im.exec(text);
  if (!m) return { title: "", summary: text };
  const title = m[1]!.replace(/[*#"]/g, "").trim();
  const summary = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  return { title, summary };
}
