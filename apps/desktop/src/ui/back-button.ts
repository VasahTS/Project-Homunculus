// Homunculus 2 — the mouse's side buttons (M4 back, M5 forward) and Alt+← / Alt+→, everywhere. Author: CLAUDE, 2026-11-08.
// Daniel: "make every window, tab etc. work with M4 and M5", then: "in the Card Browser M4 should only close the preview;
// switching Sheet / Tabs / Writer it goes to the previous page instead of back to where you were — check the whole app".
//
// One list of moves for the whole app, like a browser's history but finer: a move is a change of screen (App.tsx) OR a
// change made inside a screen that feels like going somewhere — a tab, a layout, a preview opened (useBackState).
// M4 first closes what is open on top (a window, menu or popover — the same as Esc); else it undoes the last move.
// M5 redoes it. A move whose screen is gone, or whose state was changed another way since, is skipped.

import { useEffect, useRef, useState } from "react";

interface Move {
  undo: () => void;
  redo: () => void;
  /** Still meaningful? (its screen is still open and nothing else changed it) — checked before undo/redo. */
  canUndo?: () => boolean;
  canRedo?: () => boolean;
}

const back: Move[] = [];
const forward: Move[] = [];
let replaying = false;
// click tests and debugging in the browser preview read the lists here
if (import.meta.env?.DEV) (globalThis as { __moves?: unknown }).__moves = { back, forward };

/** A move just made by the person. Not while a move is being undone or redone. */
export function recordMove(m: Move): void {
  if (replaying) return;
  back.push(m);
  if (back.length > 120) back.shift();
  forward.length = 0;
}

export const isReplaying = (): boolean => replaying;

let quietPage: string | null = null;
/** A page (by its screen kind) is about to open its first item by itself: that change is not a move. */
export function quietNextScreen(kind: string): void { quietPage = kind; }
/** Read by App.tsx when the screen changes: true when the change stays on that page (from its empty state to an item). */
export function takeQuietScreen(fromKind: string | undefined, toKind: string): boolean {
  if (quietPage === null || quietPage !== toKind || fromKind !== toKind) return false;
  quietPage = null;
  return true;
}

/** Undo (-1) or redo (+1) the nearest move that still makes sense. False when there is none. */
export function goMove(dir: -1 | 1): boolean {
  const from = dir < 0 ? back : forward;
  const to = dir < 0 ? forward : back;
  while (from.length) {
    const m = from.pop()!;
    const ok = dir < 0 ? m.canUndo?.() ?? true : m.canRedo?.() ?? true;
    if (!ok) continue; // its screen is gone or it was changed another way: drop it
    replaying = true;
    try { if (dir < 0) m.undo(); else m.redo(); } finally { replaying = false; }
    to.push(m);
    return true;
  }
  return false;
}

/**
 * useState for a state that feels like a place: a tab, a layout, a preview that is open. Changes made with the returned
 * setter are moves M4 undoes and M5 redoes; `setQuiet` changes it without a move (the app's own changes, a reset).
 */
/** Is this component still on screen? For moves made by hand with recordMove. */
export function useLive(): { current: boolean } {
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  return live;
}

export function useBackState<T>(initial: T | (() => T), onChange?: (v: T) => void): [T, (v: T) => void, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const live = useRef(true);
  const current = useRef(value);
  current.current = value;
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const setQuiet = (v: T) => { current.current = v; setValue(v); change.current?.(v); };
  const set = (v: T) => {
    const was = current.current;
    if (Object.is(was, v)) return;
    setQuiet(v);
    recordMove({
      undo: () => setQuiet(was), redo: () => setQuiet(v),
      canUndo: () => live.current && Object.is(current.current, v),
      canRedo: () => live.current && Object.is(current.current, was),
    });
  };
  return [value, set, setQuiet];
}

const claimed = new WeakSet<Event>();

/** This screen handled "back" (or "forward") itself: the app does nothing more with it. */
export function claimBack(e: Event): void {
  claimed.add(e);
  e.preventDefault();
}

export const isClaimed = (e: Event): boolean => claimed.has(e);

/** What M4 closes before anything else: windows, menus and popovers. The Director's window is a tool and stays. */
// (not the side panels marked data-region="sheet" on Characters / Card Browser / the Vault: those are always there)
export const LAYERS = '[role="dialog"]:not([data-testid="director-window"]), [role="menu"], [role="listbox"], .popover, .pop-scrim, .sheet-layer';
export const openLayers = (): number => document.querySelectorAll(LAYERS).length;

/** Closes the top layer the way Esc does (every window and menu already answers Esc). */
export function pressEscape(): void {
  // sent from inside the top layer, so the screen it belongs to hears it too (some menus close from their page's keys)
  const layers = document.querySelectorAll<HTMLElement>(LAYERS);
  const top = layers[layers.length - 1];
  const focused = document.activeElement as HTMLElement | null;
  const target = focused && top?.contains(focused) ? focused : top ?? focused ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
}

/** M4 / Alt+← = -1, M5 / Alt+→ = +1; null for anything else. */
export function backForwardOf(e: MouseEvent | KeyboardEvent): -1 | 1 | null {
  if (e instanceof MouseEvent) return e.button === 3 ? -1 : e.button === 4 ? 1 : null;
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, select, [contenteditable]")) return null; // Alt+arrows move by word there
  return e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : null;
}
