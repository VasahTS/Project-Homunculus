// Homunculus 2 — how long the app took to start, step by step (D-130). Author: CLAUDE, 2026-11-13.
// Daniel: "it takes 5–10 seconds to open the app". The steps are timed on every start and shown in Settings → About
// (and in the console), so a slow start can be told apart: the database, the setup, reading the library, the first screen.
const t0 = typeof performance !== "undefined" ? performance.timeOrigin : Date.now();
const marks: Array<{ step: string; at: number }> = [];
let listeners: Array<() => void> = [];

/** The step that just finished (time since the window started loading). */
export function bootMark(step: string): void {
  if (marks.some((m) => m.step === step)) return; // once per step (the start can run twice in development)
  marks.push({ step, at: typeof performance !== "undefined" ? performance.now() : Date.now() - t0 });
  if (step === "shown") { shown = true; console.info(`[Homunculus] started in ${bootSummary()} | ${bootParts()}`); }
  listeners.forEach((f) => f());
}

/** "3.2 s · loading 0.9 · database 0.3 · setup 0.2 · library 1.6 · screen 0.2" */
export function bootSummary(): string {
  if (!marks.length) return "";
  const s = (ms: number) => (ms / 1000).toFixed(1);
  const parts: string[] = [];
  let before = 0;
  for (const m of marks) { parts.push(`${m.step} ${s(m.at - before)}`); before = m.at; }
  return `${s(marks[marks.length - 1]!.at)} s · ${parts.join(" · ")}`;
}

export function onBootTiming(f: () => void): () => void {
  listeners.push(f);
  return () => { listeners = listeners.filter((x) => x !== f); };
}

const parts: Array<{ label: string; ms: number }> = [];
let shown = false;

/** Times one read of the start (until the first screen shows); the slowest ones are listed under Last start. */
export async function bootPart<T>(label: string, work: Promise<T>): Promise<T> {
  if (shown) return work;
  const a = typeof performance !== "undefined" ? performance.now() : Date.now();
  try { return await work; } finally {
    if (!shown) { parts.push({ label, ms: (typeof performance !== "undefined" ? performance.now() : Date.now()) - a }); listeners.forEach((f) => f()); }
  }
}

/** "lorebooks 3.1 · characters 1.2 · chats 0.4 …" — the reads of the start, slowest first (they run side by side). */
export function bootParts(): string {
  return [...parts].sort((a, b) => b.ms - a.ms).filter((p) => p.ms >= 50).slice(0, 8).map((p) => `${p.label} ${(p.ms / 1000).toFixed(1)}`).join(" · ");
}
