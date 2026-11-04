// Homunculus 2 — "Smooth text" (Settings → Chat, D-082): a streaming reply is revealed word by word at an even pace instead
// of in bursts. It speeds up when it falls far behind, so it never lags much behind what has arrived. CLAUDE, 2026-11-03.
import { useEffect, useRef, useState } from "react";

/** How many characters `count` more words take, from `from` in `text` (spaces before a word go with it). */
export function wordsAhead(text: string, from: number, count: number): number {
  const re = /\s*\S+/y;
  re.lastIndex = from;
  let end = from;
  for (let i = 0; i < count; i++) {
    const m = re.exec(text);
    if (!m) return text.length - from;
    end = re.lastIndex;
  }
  return end - from;
}

/** Words that arrived but are not shown yet, roughly. */
const backlogWords = (text: string, from: number) => (text.slice(from).match(/\S+/g)?.length ?? 0);

export function useSmoothText(target: string, on: boolean, wordsPerSecond: number): string {
  const [shown, setShown] = useState(on ? "" : target);
  const state = useRef({ shown: on ? "" : target, target });
  state.current.target = target;
  useEffect(() => {
    if (!on) { state.current.shown = state.current.target; setShown(state.current.target); return; }
    let raf = 0;
    let last = performance.now();
    let credit = 0;
    const tick = (now: number) => {
      const s = state.current;
      if (!s.target.startsWith(s.shown)) { s.shown = s.target.slice(0, Math.min(s.shown.length, s.target.length)); }
      if (s.shown.length < s.target.length) {
        const behind = backlogWords(s.target, s.shown.length);
        credit += ((now - last) / 1000) * wordsPerSecond * (1 + behind / 30);
        const n = Math.floor(credit);
        if (n > 0) {
          credit -= n;
          s.shown = s.target.slice(0, s.shown.length + wordsAhead(s.target, s.shown.length, n));
          setShown(s.shown);
        }
      } else credit = 0;
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, wordsPerSecond]);
  return on ? shown : target;
}
