// A small fixed-position menu (moved out of LorebookEditor so the tracker editor's "Send to" menu shares it, D-046).
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * A small menu that floats above everything (fixed), so the entry's edges never cut it; it opens upward when there
 * is no room below, follows its button when the panel scrolls, and closes on Esc, a click outside, Tab away or a
 * window resize. Arrow keys move between `item` elements.
 */
export function useFloatingMenu(height: number, width: number, item: string) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const btn = () => box.current?.querySelector<HTMLElement>("[aria-haspopup]");
  const place = () => {
    const r = btn()?.getBoundingClientRect();
    if (!r) return;
    const top = r.bottom + 6 + height > window.innerHeight - 8 ? Math.max(8, r.top - 6 - height) : r.bottom + 6;
    setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  };
  useLayoutEffect(() => { if (open) place(); else setPos(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent) => {
      if (box.current?.contains(ev.target as Node)) return;
      // a number being typed in the menu is saved when it loses focus: let that happen before the menu goes away
      if (box.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      setOpen(false);
    };
    const away = () => setOpen(false);
    // Esc also works when focus dropped out of the menu (e.g. after Enter in its number box)
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape" && !box.current?.contains(document.activeElement)) { ev.preventDefault(); setOpen(false); btn()?.focus(); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", away);
    requestAnimationFrame(() => (box.current?.querySelector<HTMLElement>("[aria-selected=true], [aria-checked=true]")
      ?? box.current?.querySelector<HTMLElement>(item))?.focus({ preventScroll: true }));
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); document.removeEventListener("scroll", place, true); window.removeEventListener("resize", away); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const onKeyDown = (ev: ReactKeyboardEvent) => {
    if (ev.key === "Escape" && open) { ev.preventDefault(); ev.stopPropagation(); btn()?.focus(); setOpen(false); return; }
    const t = ev.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "SELECT") return;
    if (!open || (ev.key !== "ArrowDown" && ev.key !== "ArrowUp" && ev.key !== "ArrowLeft" && ev.key !== "ArrowRight")) return;
    ev.preventDefault();
    const items = [...(box.current?.querySelectorAll<HTMLElement>(item) ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const step = ev.key === "ArrowDown" || ev.key === "ArrowRight" ? 1 : -1;
    items[(i + step + items.length) % items.length]?.focus({ preventScroll: true });
  };
  // focus moved to something else (Tab): close. Focus simply dropped (Enter in a number box) keeps it open; clicks
  // outside are handled by the mousedown listener above
  const onBlur = (ev: ReactFocusEvent) => { const to = ev.relatedTarget as Node | null; if (open && to && !box.current?.contains(to)) setOpen(false); };
  return { open, setOpen, pos, box, onKeyDown, onBlur };
}
