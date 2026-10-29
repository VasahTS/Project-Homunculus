// Homunculus 2 — a list you reorder by dragging a handle (or with the keyboard). Author: CLAUDE, 2026-10-28 (D-023).
// Pointer-based (not the browser's drag-and-drop, which looks rough in WebView2): the dragged row follows the
// pointer, the others slide out of its way, and on release it settles into place. Near the top/bottom of a
// scrolling panel the panel scrolls. Keyboard: focus the handle, Arrow Up/Down moves the row one place
// (Home/End: to the top/bottom); a polite live region says where it went.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { EASE_OUT, reducedMotion } from "./motion.ts";
import { Icon } from "./kit.tsx";

export interface SortableProps<T> {
  items: T[];
  id: (item: T) => string;
  /** Short name of an item, for the handle's label and the announcement ("Main Prompt"). */
  name: (item: T) => string;
  onReorder: (from: number, to: number) => void;
  /** Draws one row. Put `handle` where the grip should be. */
  render: (item: T, handle: ReactNode, state: { dragging: boolean; index: number }) => ReactNode;
  className?: string;
  itemClassName?: (item: T) => string;
  itemTestId?: string;
  label: string;
}

interface Drag {
  index: number;
  id: string;
  startY: number;
  startScroll: number;
  /** Top and height of each row at the start (page coordinates, without scrolling). */
  rects: Array<{ top: number; height: number }>;
  gap: number;
  target: number;
  pointerId: number;
}

export const move = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
};

export function SortableList<T>({ items, id, name, onReorder, render, className = "", itemClassName, itemTestId, label }: SortableProps<T>) {
  // shows the new order right away, even while the parent is still saving it
  const [list, setList] = useState(items);
  // new items from the parent are taken DURING render, never in an effect: an effect would first commit the old items,
  // so a text box inside an item would get its old value back for a moment — the caret jumps to the end, the typed
  // letter is lost and Ctrl+Z breaks (Daniel, 29/10)
  const [seen, setSeen] = useState(items);
  if (items !== seen) { setSeen(items); setList(items); }
  const rows = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [live, setLive] = useState("");
  /** After a drop: where the moved row was on screen, so it can glide from there to its new place. */
  const settle = useRef<{ id: string; top: number } | null>(null);
  const focusAfter = useRef<string | null>(null);
  const scrollBox = useRef<HTMLElement | null>(null);
  const autoScroll = useRef<{ raf: number; speed: number } | null>(null);
  const lastY = useRef(0);
  const helpId = useId();

  useLayoutEffect(() => {
    const s = settle.current;
    if (s) {
      settle.current = null;
      const el = rows.current.get(s.id);
      if (el && !reducedMotion()) {
        const now = el.getBoundingClientRect().top;
        el.animate([{ transform: `translateY(${s.top - now}px)` }, { transform: "none" }], { duration: 260, easing: EASE_OUT });
      }
    }
    if (focusAfter.current) {
      rows.current.get(focusAfter.current)?.querySelector<HTMLElement>("[data-grip]")?.focus();
      focusAfter.current = null;
    }
  }, [list]);

  const commit = (from: number, to: number, settleFrom?: number) => {
    if (from === to) return;
    const item = list[from]!;
    if (settleFrom !== undefined) settle.current = { id: id(item), top: settleFrom };
    setList((l) => move(l, from, to));
    onReorder(from, to);
    setLive(`${name(item)} moved to position ${to + 1} of ${list.length}.`);
  };

  const scrollParent = (el: HTMLElement | null): HTMLElement | null => {
    for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
    }
    return null;
  };

  const update = (clientY: number) => {
    const d = dragRef.current;
    if (!d) return;
    const scroll = scrollBox.current?.scrollTop ?? 0;
    const dy = clientY - d.startY + (scroll - d.startScroll);
    const me = d.rects[d.index]!;
    const center = me.top + dy + me.height / 2;
    let target = 0;
    d.rects.forEach((r, i) => { if (i !== d.index && r.top + r.height / 2 < center) target++; });
    d.target = target;
    const shift = me.height + d.gap;
    list.forEach((it, i) => {
      const el = rows.current.get(id(it));
      if (!el) return;
      if (i === d.index) { el.style.transform = `translateY(${dy}px)`; return; }
      let t = 0;
      if (d.index < target && i > d.index && i <= target) t = -shift;
      if (target < d.index && i >= target && i < d.index) t = shift;
      el.style.transform = t ? `translateY(${t}px)` : "";
    });
  };

  const stopAuto = () => { if (autoScroll.current) cancelAnimationFrame(autoScroll.current.raf); autoScroll.current = null; };
  const runAuto = () => {
    const box = scrollBox.current;
    const a = autoScroll.current;
    if (!box || !a) return;
    box.scrollTop += a.speed;
    update(lastY.current);
    a.raf = requestAnimationFrame(runAuto);
  };

  const onPointerDown = (e: PointerEvent, index: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const els = list.map((it) => rows.current.get(id(it)));
    const rects = els.map((el) => { const r = el?.getBoundingClientRect(); return { top: r?.top ?? 0, height: r?.height ?? 0 }; });
    const gap = rects.length > 1 ? Math.max(0, rects[1]!.top - (rects[0]!.top + rects[0]!.height)) : 0;
    scrollBox.current = scrollParent(els[index] ?? null);
    const d: Drag = { index, id: id(list[index]!), startY: e.clientY, startScroll: scrollBox.current?.scrollTop ?? 0, rects, gap, target: index, pointerId: e.pointerId };
    dragRef.current = d;
    lastY.current = e.clientY;
    setDrag(d);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    lastY.current = e.clientY;
    update(e.clientY);
    const box = scrollBox.current;
    if (box) {
      const r = box.getBoundingClientRect();
      const edge = 36;
      const speed = e.clientY < r.top + edge ? -Math.ceil((r.top + edge - e.clientY) / 4) : e.clientY > r.bottom - edge ? Math.ceil((e.clientY - (r.bottom - edge)) / 4) : 0;
      if (speed && !autoScroll.current) { autoScroll.current = { raf: 0, speed }; autoScroll.current.raf = requestAnimationFrame(runAuto); }
      else if (speed && autoScroll.current) autoScroll.current.speed = speed;
      else stopAuto();
    }
  };

  const finish = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    stopAuto();
    const moved = rows.current.get(d.id);
    const top = moved?.getBoundingClientRect().top;
    for (const el of rows.current.values()) { el.style.transition = "none"; el.style.transform = ""; }
    requestAnimationFrame(() => { for (const el of rows.current.values()) el.style.transition = ""; });
    dragRef.current = null;
    setDrag(null);
    commit(d.index, d.target, top);
  };

  const onKey = (e: KeyboardEvent, index: number) => {
    const to = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    if (to < 0 || to >= list.length || to === index) return;
    const item = list[index]!;
    const before = rows.current.get(id(item))?.getBoundingClientRect().top;
    focusAfter.current = id(item);
    commit(index, to, before);
  };

  return (
    <>
      <ul className={`sortable${drag ? " is-dragging" : ""} ${className}`.trim()} aria-label={label}>
        {list.map((it, i) => {
          const key = id(it);
          const dragging = drag?.id === key;
          const handle = (
            <button type="button" className="grip" data-grip aria-label={`Reorder ${name(it)}`} aria-roledescription="drag handle"
              aria-describedby={helpId} title="Drag to reorder (or focus and use the arrow keys)"
              onPointerDown={(e) => onPointerDown(e, i)} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish}
              onKeyDown={(e) => onKey(e, i)}>
              <Icon name="grip" size={14} stroke={2.6} />
            </button>
          );
          return (
            <li key={key} ref={(el) => { if (el) rows.current.set(key, el); else rows.current.delete(key); }}
              className={`sortable-item${dragging ? " dragging" : ""} ${itemClassName?.(it) ?? ""}`.trim()} data-testid={itemTestId}>
              {render(it, handle, { dragging, index: i })}
            </li>
          );
        })}
      </ul>
      <span id={helpId} className="sr-only">Press the arrow keys to move this item up or down; Home and End move it to the top or bottom.</span>
      <span className="sr-only" role="status" aria-live="polite">{live}</span>
    </>
  );
}
