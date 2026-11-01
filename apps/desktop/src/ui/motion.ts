// Homunculus 2 — motion helpers. Author: CLAUDE, 2026-10-28 (D-023).
// The vocabulary comes from the Coffra reference Daniel picked: things settle in with one soft curve
// (fade + a few pixels of travel, staggered), things that pop (menus, sheets) use a small spring, a pill slides
// under the selected tab, and a value that just changed glows once. Everything is skipped when the system
// asks for reduced motion, and nothing here carries meaning on its own (the UI is the same without it).
import { useLayoutEffect, useRef, type RefObject } from "react";

export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
/** For things moving from one place to another on screen (a reordered row gliding to its new place). D-026. */
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

export const reducedMotion = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface EnterOptions { x?: number; y?: number; scale?: number; stagger?: number; delay?: number; duration?: number; easing?: string; max?: number }

/** Fades and slides elements in, one after the other. Only the first `max` get a delay, so long lists don't drag. */
export function enter(elements: Iterable<Element>, { x = 0, y = 10, scale = 1, stagger = 28, delay = 0, duration = 520, easing = EASE_OUT, max = 14 }: EnterOptions = {}): void {
  if (reducedMotion()) return;
  let i = 0;
  for (const el of elements) {
    if (!(el instanceof HTMLElement) || typeof el.animate !== "function") continue;
    el.animate(
      [{ opacity: 0, transform: `translate(${x}px, ${y}px) scale(${scale})` }, { opacity: 1, transform: "none" }],
      { duration, delay: delay + Math.min(i, max) * stagger, easing, fill: "backwards" },
    );
    i++;
  }
}

/** Runs `enter` on the children of `ref` (or on `selector` inside it) whenever `key` changes. */
export function useEnter(ref: RefObject<HTMLElement | null>, key: unknown, selector?: string, options?: EnterOptions): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    enter(selector ? root.querySelectorAll(selector) : root.children, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** A short glow on an element whose value just changed. */
export function flash(el: Element | null): void {
  if (!el || reducedMotion() || !(el instanceof HTMLElement) || typeof el.animate !== "function") return;
  el.animate([{ backgroundColor: "var(--flash)" }, { backgroundColor: "transparent" }], { duration: 1400, easing: EASE_OUT });
}

/**
 * Content that replaced its neighbour slides in from the side it came from (`dir` 1 = from the right, -1 = from the
 * left) while it fades in: a greeting after ‹ or ›. D-072.
 */
export function slideIn(elements: Iterable<Element>, dir: 1 | -1, distance = 16): void {
  if (reducedMotion()) return;
  for (const el of elements) {
    if (!(el instanceof HTMLElement) || typeof el.animate !== "function") continue;
    el.animate([{ opacity: 0, transform: `translateX(${dir * distance}px)` }, { opacity: 1, transform: "none" }], { duration: 420, easing: EASE_OUT });
  }
}

/** Pop-in for menus and bubbles: a little drop and a spring. */
export function popIn(el: Element | null, from: { x?: number; y?: number } = { y: -6 }): void {
  if (!el || reducedMotion() || !(el instanceof HTMLElement) || typeof el.animate !== "function") return;
  el.animate(
    [{ opacity: 0, transform: `translate(${from.x ?? 0}px, ${from.y ?? 0}px) scale(0.97)` }, { opacity: 1, transform: "none" }],
    { duration: 320, easing: EASE_SPRING },
  );
}

/**
 * A pill that slides under the selected item of a list or tab bar. Put `<span className="slide-pill" ref={pill} />`
 * inside the (position: relative) container and pass the container; `selector` finds the selected item.
 * It follows resizes; the very first placement doesn't animate.
 */
export function useSlidingPill(container: RefObject<HTMLElement | null>, pill: RefObject<HTMLElement | null>, selector: string, key: unknown): void {
  const placed = useRef(false);
  useLayoutEffect(() => {
    const box = container.current;
    const p = pill.current;
    if (!box || !p) return;
    const place = (animate: boolean) => {
      const on = box.querySelector<HTMLElement>(selector);
      if (!on) { p.style.opacity = "0"; placed.current = false; return; }
      const r = on.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const left = r.left - b.left + box.scrollLeft;
      const top = r.top - b.top + box.scrollTop;
      p.style.transition = animate && placed.current && !reducedMotion() ? "" : "none";
      p.style.width = `${r.width}px`;
      p.style.height = `${r.height}px`;
      p.style.transform = `translate(${left}px, ${top}px)`;
      p.style.opacity = "1";
      if (p.style.transition === "none") { void p.offsetWidth; p.style.transition = ""; }
      placed.current = true;
    };
    place(true);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => place(false)) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
  });
  // `key` is only here so callers can say what the selection depends on; the effect runs every render (cheap).
  void key;
}
