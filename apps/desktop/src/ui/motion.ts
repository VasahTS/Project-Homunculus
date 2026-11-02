// Homunculus 2 — motion helpers. Author: CLAUDE, 2026-10-28 (D-023).
// The vocabulary comes from the Coffra reference Daniel picked: things settle in with one soft curve
// (fade + a few pixels of travel, staggered), things that pop (menus, sheets) use a small spring, a pill slides
// under the selected tab, and a value that just changed glows once. Everything is skipped when the system
// asks for reduced motion, and nothing here carries meaning on its own (the UI is the same without it).
import { useLayoutEffect, useRef, type RefObject } from "react";
import { motionFactor, motionOff } from "../theme/appearance.ts";

export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
/** For things moving from one place to another on screen (a reordered row gliding to its new place). D-026. */
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

/** No motion: Settings → Customize → Motion is off, or the system asks for less and Customize follows it (D-075). */
export const reducedMotion = (): boolean => motionOff();
/** Customize → Motion → Speed (Calm 1.35 · Normal 1 · Quick 0.65) applied to a time in ms. */
export const ms = (t: number): number => Math.round(t * motionFactor());

export interface EnterOptions { x?: number; y?: number; scale?: number; stagger?: number; delay?: number; duration?: number; easing?: string; max?: number }

/** Fades and slides elements in, one after the other. Only the first `max` get a delay, so long lists don't drag. */
export function enter(elements: Iterable<Element>, { x = 0, y = 10, scale = 1, stagger = 28, delay = 0, duration = 520, easing = EASE_OUT, max = 14 }: EnterOptions = {}): void {
  if (reducedMotion()) return;
  let i = 0;
  for (const el of elements) {
    if (!(el instanceof HTMLElement) || typeof el.animate !== "function") continue;
    el.animate(
      [{ opacity: 0, transform: `translate(${x}px, ${y}px) scale(${scale})` }, { opacity: 1, transform: "none" }],
      { duration: ms(duration), delay: ms(delay + Math.min(i, max) * stagger), easing, fill: "backwards" },
    );
    i++;
  }
}

/**
 * The page cascade (D-072, the Coffra reference): blocks arrive one after another, unhurried. Daniel found the first
 * try (55 ms apart, 620 ms each) too fast. Use it for whole views: an editor opening, a tab, a chat, a list.
 */
export const CASCADE: EnterOptions = { y: 14, stagger: 85, duration: 900, max: 10 };

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
  el.animate([{ backgroundColor: "var(--flash)" }, { backgroundColor: "transparent" }], { duration: ms(1400), easing: EASE_OUT });
}

/**
 * Content that replaced its neighbour slides in from the side it came from (`dir` 1 = from the right, -1 = from the
 * left) while it fades in: a greeting after ‹ or ›. D-072.
 */
export function slideIn(elements: Iterable<Element>, dir: 1 | -1, distance = 16): void {
  if (reducedMotion()) return;
  for (const el of elements) {
    if (!(el instanceof HTMLElement) || typeof el.animate !== "function") continue;
    el.animate([{ opacity: 0, transform: `translateX(${dir * distance}px)` }, { opacity: 1, transform: "none" }], { duration: ms(420), easing: EASE_OUT });
  }
}

/**
 * Switching pages (D-076, the Coffra reference and Daniel's notes "staggered fade-up"): the old page goes at once; the new
 * one's blocks fade and rise, one after another (no blur: Daniel, 11/02), top to bottom. The page title rises by itself (RiseText).
 * Blocks are found without knowing the page: anything taller than most of the page is opened up, so a list or a form
 * arrives as its parts, not as one slab. Only what is on screen moves.
 */
export function pageIn(root: HTMLElement | null): void {
  if (!root || reducedMotion() || typeof root.animate !== "function") return;
  const rootH = root.getBoundingClientRect().height || window.innerHeight;
  const blocks: HTMLElement[] = [];
  const visit = (el: Element, depth: number) => {
    for (const child of el.children) {
      if (!(child instanceof HTMLElement) || blocks.length >= 12) continue;
      if (child.matches(".toolbar, .slide-pill, script, style, [hidden]")) continue;
      const r = child.getBoundingClientRect();
      if (r.height === 0 || r.top > window.innerHeight) continue;
      if (depth < 4 && r.height > rootH * 0.55 && child.children.length > 1) visit(child, depth + 1);
      else blocks.push(child);
    }
  };
  visit(root, 0);
  blocks.forEach((el, i) => {
    el.animate(
      [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: ms(720), delay: ms(60 + i * 70), easing: EASE_OUT, fill: "backwards" },
    );
  });
}

/**
 * The new look opens as a circle from the click (D-072's "circular theme switch", D-076). Uses View Transitions where
 * the window has them (WebView2 on Windows); elsewhere the look just changes.
 */
export function revealLook(change: () => void, from?: { x: number; y: number }): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (reducedMotion() || !doc.startViewTransition) { change(); return; }
  const x = from?.x ?? window.innerWidth / 2, y = from?.y ?? window.innerHeight / 2;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = doc.startViewTransition(change);
  void t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: ms(640), easing: EASE_OUT, pseudoElement: "::view-transition-new(root)" },
    );
  }).catch(() => undefined);
}

/** Pop-in for menus and bubbles: a little drop and a spring. */
export function popIn(el: Element | null, from: { x?: number; y?: number } = { y: -6 }): void {
  if (!el || reducedMotion() || !(el instanceof HTMLElement) || typeof el.animate !== "function") return;
  el.animate(
    [{ opacity: 0, transform: `translate(${from.x ?? 0}px, ${from.y ?? 0}px) scale(0.97)` }, { opacity: 1, transform: "none" }],
    { duration: ms(320), easing: EASE_SPRING },
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
