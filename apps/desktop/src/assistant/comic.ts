// Homunculus 2 — reading a comic (doujinshi, short) for the Assistant (D-115). Author: CLAUDE, 2026-11-10.
//
// Daniel (translated): "turn doujinshi/shorts into cards/stories: read the pictures in order, understand the context,
// ask who {{user}} is, make drafts, build something coherent for the app." Most of his are ≤ 10 pages in English, but
// "our base must be solid so we don't fight the model", so:
// - the vision model reads the pages in batches (10 by default: his comics are read in ONE call that sees the whole
//   story) and answers validated JSON; a broken answer gets one retry with the error, then the reading stops;
// - the cast has stable ids (A, B…) given by the first batch and kept by the next ones (each batch gets the cast and
//   the story so far), so merging or renaming someone is one edit;
// - every batch and the whole reading are cached (picture set + model + prompt): reading again is free;
// - every line keeps its page, so what the Assistant writes can say where it came from.
// The main model then writes "What I understood", asks the questions and proposes ONE card (about("comic")).
import { z } from "zod";
import type { ConnectionConfig, HomunculusCore, SqlStore } from "@homunculus/core";
import { askVision, cached, keep, visionKey, type Picture, type VisionUsage } from "./vision.ts";

export const ReadingOrder = z.enum(["manga", "western"]);
export type ReadingOrder = z.infer<typeof ReadingOrder>;

const LineKind = z.enum(["speech", "thought", "narration", "sound", "sign"]);
export const ComicLine = z.object({
  /** A cast id ("A"), "narration", or "?" when nobody can tell. */
  speaker: z.string().default("?"),
  kind: LineKind.catch("speech").default("speech"),
  text: z.string(),
});
export const ComicPanel = z.object({ action: z.string().default(""), lines: z.array(ComicLine).default([]) });
export const ComicPage = z.object({
  page: z.coerce.number().int(),
  /** Cast ids seen on the page. */
  cast: z.array(z.string()).default([]),
  panels: z.array(ComicPanel).default([]),
  /** Anything the reader wants to flag (an unreadable balloon, a page with no story). */
  note: z.string().default(""),
});
export const ComicCast = z.object({
  id: z.string().min(1),
  /** As the comic names them; "" until someone says it. */
  name: z.string().default(""),
  looks: z.string().default(""),
  notes: z.string().default(""),
});
/** What the vision model answers for one batch. */
export const ComicBatch = z.object({
  cast: z.array(ComicCast).default([]),
  pages: z.array(ComicPage).default([]),
  /** The story so far, these pages included. */
  summary: z.string().default(""),
});
export type ComicBatch = z.infer<typeof ComicBatch>;
export type ComicCast = z.infer<typeof ComicCast>;
export type ComicPage = z.infer<typeof ComicPage>;

export const ComicReading = z.object({
  order: ReadingOrder,
  model: z.string(),
  /** The picture name of each page, in reading order (page 1 = the first). */
  files: z.array(z.string()),
  cast: z.array(ComicCast),
  pages: z.array(ComicPage),
  summary: z.string(),
  calls: z.number().int().default(0),
  at: z.number().int().default(0),
});
export type ComicReading = z.infer<typeof ComicReading>;

/** File names in natural order: "page 2" before "page 10", "002" before "010". */
export const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export const READ_PROMPT = `You read comic pages (manga, doujinshi, webcomics) for another AI that cannot see pictures. It will turn the story into a roleplay character card, so it needs: who is who, what each one looks like, what happens, and every line of text, word for word.

Rules:
- Read the panels of each page in the reading order you are given; read the balloons of a panel in the same order.
- The cast: one entry per recurring person, with a stable id. Keep every id you were given exactly; give new people the next free letter (A, B, C…). The same person always gets the same id, even when drawn from another angle or in other clothes; if you are unsure whether two drawings are one person, say so in "notes". Names only when the comic says them (a balloon, a caption); otherwise "".
- "looks": hair, eyes, build, height, age range, clothes, marks — what the art shows. "notes": personality and role as the pages show them.
- Lines: copy the text exactly (spelling, ellipses, emphasis as written). "speaker" is a cast id, "narration" for captions, or "?" when you can't tell. "kind": speech, thought, narration, sound (sound effects) or sign (text written in the scene).
- "action" for each panel: one or two sentences on what happens and how people look (expressions, poses, where they are).
- "summary": the story so far in a few sentences, these pages included.
- Never invent text you can't read: write "[unreadable]" in its place and say so in the page's "note". Adult content is described plainly and neutrally, like any other content.

Answer with ONLY this JSON (no comments, no Markdown):
{"cast":[{"id":"A","name":"","looks":"","notes":""}],"pages":[{"page":1,"cast":["A"],"panels":[{"action":"","lines":[{"speaker":"A","kind":"speech","text":""}]}],"note":""}],"summary":""}`;

const ORDER_TEXT: Record<ReadingOrder, string> = {
  manga: "Reading order: MANGA — panels right to left, top to bottom; balloons right to left.",
  western: "Reading order: WESTERN — panels left to right, top to bottom; balloons left to right.",
};

/** The JSON object in a model's answer (fences, words around it). */
export function jsonIn(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("The answer has no JSON object.");
  return JSON.parse(t.slice(a, b + 1));
}

/** Checks one batch's answer: valid shape, and exactly the pages that were sent (by number). */
export function checkBatch(raw: unknown, first: number, count: number): ComicBatch {
  const r = ComicBatch.safeParse(raw);
  if (!r.success) throw new Error(`The JSON doesn't have the asked shape: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(top)"} ${i.message}`).join("; ")}.`);
  const want = Array.from({ length: count }, (_, i) => first + i);
  const pages = want.map((n) => r.data.pages.find((p) => p.page === n));
  const missing = want.filter((_, i) => !pages[i]);
  if (missing.length) throw new Error(`Pages missing from the answer: ${missing.join(", ")}.`);
  return { ...r.data, pages: pages as ComicPage[] };
}

/** The cast after a batch: known ids keep their place and gain what was learned; new ids are added. */
export function mergeCast(before: readonly ComicCast[], after: readonly ComicCast[]): ComicCast[] {
  const out = before.map((c) => ({ ...c }));
  for (const c of after) {
    const old = out.find((x) => x.id === c.id);
    if (!old) { out.push({ ...c }); continue; }
    if (c.name.trim()) old.name = c.name.trim();
    if (c.looks.trim().length >= old.looks.trim().length) old.looks = c.looks.trim();
    if (c.notes.trim() && !old.notes.includes(c.notes.trim())) old.notes = old.notes.trim() ? `${old.notes.trim()} ${c.notes.trim()}` : c.notes.trim();
  }
  return out;
}

const castText = (cast: readonly ComicCast[]) => cast.map((c) => `${c.id}${c.name ? ` — ${c.name}` : ""}: ${c.looks || "(looks not noted)"}${c.notes ? ` | ${c.notes}` : ""}`).join("\n");

/**
 * Reads the pages (already in reading order, skipped ones left out). `onProgress(done, total)` counts pages.
 * Throws when a batch can't be read after one retry (what was read before stays cached).
 */
export async function readComic(o: {
  core: HomunculusCore; store: SqlStore; conn: ConnectionConfig; pages: readonly Picture[]; order: ReadingOrder;
  usage: VisionUsage; batchSize?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void; now?: () => number;
}): Promise<ComicReading> {
  if (!o.pages.length) throw new Error("No pages to read.");
  const size = Math.max(1, Math.min(20, o.batchSize ?? 10));
  const whole = await visionKey(o.pages, o.conn.model, `comic|${size}|${o.order}|${READ_PROMPT}`);
  const hit = await cached<ComicReading>(o.store, whole);
  if (hit) { o.usage.cached++; o.onProgress?.(o.pages.length, o.pages.length); return ComicReading.parse(hit); }
  let cast: ComicCast[] = [];
  const pages: ComicPage[] = [];
  let summary = "";
  let calls = 0;
  let lastError = "";
  o.onProgress?.(0, o.pages.length);
  /** One call for pages [from, to) (0-based), with the page before them as a picture for continuity. */
  const readOnce = async (from: number, to: number): Promise<ComicBatch> => {
    const batch = o.pages.slice(from, to);
    const first = from + 1, last = to;
    const before = from > 0 ? o.pages[from - 1] : undefined;
    const context = [
      ORDER_TEXT[o.order],
      before
        ? `The FIRST picture is page ${from}, already read: it is only there so you see where the story is. Then come pages ${first}–${last} of ${o.pages.length}, in order: read only those.`
        : `These are pages ${first}–${last} of ${o.pages.length}, in order (the first picture is page ${first}).`,
      cast.length ? `The cast so far (keep these ids):\n${castText(cast)}` : "Nobody has been seen yet: you start the cast at A.",
      summary ? `The story so far:\n${summary}` : "",
    ].filter(Boolean).join("\n\n");
    const pictures = before ? [before, ...batch] : batch;
    const key = await visionKey(pictures, o.conn.model, `comic-batch|${READ_PROMPT}\n${context}`);
    const hit = await cached<ComicBatch>(o.store, key);
    if (hit) { o.usage.cached++; return hit; }
    let error = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = attempt === 0 ? context : `${context}\n\nYour previous answer could not be used: ${error} Answer again with only the JSON, every page ${first}–${last} included.`;
      // the answer grows with the pages: asking for more than a model allows is itself an error some services give
      const answer = await askVision({ core: o.core, conn: o.conn, system: READ_PROMPT, text, pictures, usage: o.usage, signal: o.signal, maxTokens: Math.min(16_000, 2000 + 1800 * batch.length) });
      calls++;
      try { const got = checkBatch(jsonIn(answer), first, batch.length); await keep(o.store, key, got); return got; }
      catch (e) { if (o.signal?.aborted) throw e; error = e instanceof Error ? e.message : String(e); }
    }
    throw new Error(error);
  };
  /**
   * Pages [from, to) in order. When the service refuses a call (too big, too many pictures, too many tokens) or the
   * answer can't be used, the pages are split in two and read again — down to one page per call. Daniel, 11/10: a
   * 6-page comic was refused as one call and the model fell back to looking at pages one by one.
   */
  const readRange = async (from: number, to: number): Promise<void> => {
    o.signal?.throwIfAborted();
    let got: ComicBatch | undefined;
    try { got = await readOnce(from, to); }
    catch (e) {
      if (o.signal?.aborted || (e instanceof Error && e.name === "AbortError")) throw e;
      lastError = e instanceof Error ? e.message : String(e);
      if (to - from <= 1) throw new Error(`Couldn't read page ${to}: ${lastError}`);
      const mid = from + Math.ceil((to - from) / 2);
      await readRange(from, mid);
      await readRange(mid, to);
      return;
    }
    cast = mergeCast(cast, got.cast);
    pages.push(...got.pages);
    summary = got.summary.trim() || summary;
    o.onProgress?.(to, o.pages.length);
  };
  // batches also stay under a size most services accept (pictures are sent as base64 text)
  const MAX_CHARS = 14_000_000;
  for (let start = 0; start < o.pages.length;) {
    let end = start, chars = 0;
    while (end < o.pages.length && end - start < size && (end === start || chars + o.pages[end]!.base64.length <= MAX_CHARS)) chars += o.pages[end++]!.base64.length;
    await readRange(start, end);
    start = end;
  }
  const reading: ComicReading = { order: o.order, model: o.conn.model, files: o.pages.map((p) => p.name), cast, pages, summary, calls, at: (o.now ?? Date.now)() };
  await keep(o.store, whole, reading);
  return reading;
}

const who = (cast: readonly ComicCast[], id: string) => {
  if (id === "narration") return "Narration";
  const c = cast.find((x) => x.id === id);
  return c ? (c.name ? `${c.id} ${c.name}` : c.id) : id || "?";
};

/** The reading as text for the main model (pages `from`–`to`, 1-based). */
export function readingText(r: ComicReading, from = 1, to = r.pages.length): string {
  const lines = [`Cast (ids stay the same everywhere):`, castText(r.cast) || "(nobody)", "", `Story so far: ${r.summary || "(none)"}`, ""];
  for (const p of r.pages.filter((x) => x.page >= from && x.page <= to)) {
    lines.push(`## Page ${p.page} (${r.files[p.page - 1] ?? "?"})${p.cast.length ? ` — ${p.cast.map((id) => who(r.cast, id)).join(", ")}` : ""}${p.note ? ` — note: ${p.note}` : ""}`);
    p.panels.forEach((panel, i) => {
      lines.push(`[${i + 1}] ${panel.action}`.trimEnd());
      for (const l of panel.lines) lines.push(`  ${who(r.cast, l.speaker)}${l.kind === "speech" ? "" : ` (${l.kind})`}: "${l.text}"`);
    });
  }
  return lines.join("\n");
}

/** Every line one person says, with its page (for example messages and the way they speak). */
export const linesOf = (r: ComicReading, id: string) =>
  r.pages.flatMap((p) => p.panels.flatMap((panel) => panel.lines.filter((l) => l.speaker === id && (l.kind === "speech" || l.kind === "thought")).map((l) => ({ page: p.page, kind: l.kind, text: l.text }))));
