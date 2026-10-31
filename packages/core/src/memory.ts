// Homunculus 2 — simple memory: chapter summaries (docs/MEMORY-PLAN.md, "Simple" mode; D-054).
// Author: CLAUDE, 2026-10-30. Daniel needed something to keep long chats consistent and cheaper now; the smart
// recall (choosing chapters per turn) stays for slice 8.
//
// - Every `every` messages (outside the last `keep`, which always go word for word), the oldest messages not yet in a
//   chapter are summarized into one chapter by the agents' connection. The previous chapter goes with the request,
//   for continuity.
// - The prompt sends every chapter of the current path ("the story so far") and drops the messages they cover.
// - Chapters are tied to the tree, not to an index: a chapter counts only on paths that hold both of its ends, so a
//   branch opened in the middle of a chapter simply gets those messages back word for word. Nothing in the
//   messages' own data changes.
// - A summary the user edited is never rewritten by the app.
import type { Message } from "@homunculus/schemas";

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
  /** Off = kept but not sent. */
  off?: boolean;
}

export interface MemorySettings {
  on: boolean;
  /** Messages per chapter. */
  every: number;
  /** The newest messages that always go word for word. */
  keep: number;
}

export const MEMORY_DEFAULTS: MemorySettings = { on: false, every: 20, keep: 10 };

/** Messages that count for memory: what the AI would read word for word. */
const readable = (path: Message[]) => path.filter((m) => m.visibility.ai === "full" && m.kind !== "event");

/** The chapters that hold on this path, in story order, with the index range each covers in `readable(path)`. */
export function chaptersOnPath(path: Message[], chapters: Chapter[]): Array<{ chapter: Chapter; from: number; to: number }> {
  const list = readable(path);
  const at = new Map(list.map((m, i) => [m.id, i]));
  const out: Array<{ chapter: Chapter; from: number; to: number }> = [];
  for (const c of chapters) {
    const from = at.get(c.fromId), to = at.get(c.toId);
    if (from === undefined || to === undefined || to < from) continue;
    out.push({ chapter: c, from, to });
  }
  return out.sort((a, b) => a.from - b.from);
}

/**
 * What the prompt gets: the history without the messages chapters cover, and "the story so far" text (empty when
 * there are no chapters on this path). Chapters switched off still hide their messages only if `hideOff` is set.
 */
export function applyChapters(history: Message[], chapters: Chapter[]): { history: Message[]; text: string; covered: number } {
  const on = chaptersOnPath(history, chapters).filter((x) => !x.chapter.off);
  if (!on.length) return { history, text: "", covered: 0 };
  const list = readable(history);
  const hidden = new Set<string>();
  for (const x of on) for (let i = x.from; i <= x.to; i++) hidden.add(list[i]!.id);
  const text = `The story so far (summaries of earlier chapters; the messages after this continue from here):\n\n${on
    .map((x, n) => `Chapter ${n + 1}${x.chapter.title ? `: ${x.chapter.title}` : ""}\n${x.chapter.summary.trim()}`).join("\n\n")}`;
  return { history: history.filter((m) => !hidden.has(m.id)), text, covered: hidden.size };
}

/**
 * The messages the next chapter would cover: the oldest readable messages after the last chapter on this path,
 * leaving the newest `keep` out. Empty when there are fewer than `min`.
 */
export function nextChapterSpan(path: Message[], chapters: Chapter[], s: Pick<MemorySettings, "keep">, min: number): Message[] {
  const list = readable(path);
  const on = chaptersOnPath(path, chapters);
  const start = on.length ? Math.max(...on.map((x) => x.to)) + 1 : 0;
  const end = Math.max(start, list.length - s.keep);
  const span = list.slice(start, end);
  return span.length >= Math.max(1, min) ? span : [];
}

/** The request that writes one chapter. */
export function chapterRequest(span: Message[], previous: Chapter | undefined, nameOf: (m: Message) => string): Array<{ role: "system" | "user"; content: string }> {
  const transcript = span.map((m) => `${nameOf(m)}: ${m.content.trim()}`).join("\n\n");
  return [
    {
      role: "system",
      content: "You summarize part of an ongoing roleplay story into a chapter of its memory. Write in past tense, third person, plain prose. "
        + "Keep what later scenes will need: who did what, decisions and promises, what people learned or now believe, injuries, items gained or lost, "
        + "where everyone ended up, open threads, and how relationships changed. Keep names exact. Leave out style and small talk. No commentary.\n\n"
        + "Answer exactly in this form:\nTitle: <3 to 7 words>\n\n<the summary, 120 to 400 words>",
    },
    {
      role: "user",
      content: `${previous ? `The chapter before (for continuity, do not repeat it):\nTitle: ${previous.title}\n${previous.summary.trim()}\n\n` : ""}Messages to summarize:\n\n${transcript}`,
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
