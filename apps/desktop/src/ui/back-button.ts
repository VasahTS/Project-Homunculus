// Homunculus 2 — the mouse's side buttons (M4 back, M5 forward) and Alt+← / Alt+→, everywhere. Author: CLAUDE, 2026-11-08.
// Daniel: "make every window, tab etc. work with M4 and M5". The app (App.tsx) answers them: M4 first closes what is open
// on top (a window, menu or popover — the same as Esc), else goes back to the previous screen; M5 goes forward again.
// A screen with its own idea of "back" (a folder: one folder up) claims the event, and the app leaves it alone.

const claimed = new WeakSet<Event>();

/** This screen handled "back" (or "forward") itself: the app does not also change screens. */
export function claimBack(e: Event): void {
  claimed.add(e);
  e.preventDefault();
}

export const isClaimed = (e: Event): boolean => claimed.has(e);

/** What M4 closes before it changes screens: windows, menus and popovers. The Director's window is a tool that stays. */
export const LAYERS = '[role="dialog"]:not([data-testid="director-window"]), [role="menu"], [role="listbox"], .popover, [data-region="sheet"]';
export const openLayers = (): number => document.querySelectorAll(LAYERS).length;

/** Closes the top layer the way Esc does (every window and menu already answers Esc). */
export function pressEscape(): void {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
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
