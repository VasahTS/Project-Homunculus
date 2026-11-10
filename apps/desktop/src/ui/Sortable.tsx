// Homunculus 2 — a list you reorder by dragging a handle (or with the keyboard). Author: CLAUDE, 2026-10-28 (D-023).
// Pointer-based (not the browser's drag-and-drop, which looks rough in WebView2): the dragged row follows the
// pointer, the others slide out of its way, and on release it settles into place. Near the top/bottom of a
// scrolling panel the panel scrolls. Keyboard: focus the handle, Arrow Up/Down moves the row one place
// (Home/End: to the top/bottom); a polite live region says where it went.
// 2026-11-10: `connect` — lists of the same group (the tracker editor's groups of fields) take each other's rows:
// drag a row over another list's area (its `sortZone`, header included, even folded) and a line shows where it lands.
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
  /** Rows can be dragged into other lists of the same `group` (`toIndex` is Infinity for "at its end": a folded list). Each list's drop area is the element given `sortZone(group, list)`. */
  connect?: { group: string; list: string; onTransfer: (from: number, toList: string, toIndex: number) => void; listName?: (list: string) => string };
}

/** Marks the drop area of a connected list (put it on the list's whole box: header, rows, add button). */
export const sortZone = (group: string, list: string) => ({ "data-sort-zone": group, "data-sort-list": list });

interface Zone { list: string; el: HTMLElement; top: number; bottom: number; left: number; right: number; rows: Array<{ top: number; height: number; left: number; width: number }> }

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
  /** Other lists this row can go to (measured at the start, like `rects`). */
  zones: Zone[];
  /** Where it lands in another list, when the pointer is over one. */
  cross: { list: string; index: number } | null;
  line: HTMLElement | null;
  /** A copy of the row that follows the pointer over another list (the row itself is clipped by its own list's box). */
  ghost: HTMLElement | null;
}

export const move = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
};

export function SortableList<T>({ items, id, name, onReorder, render, className = "", itemClassName, itemTestId, label, connect }: SortableProps<T>) {
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
  const lastX = useRef(0);
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
    const over = crossZone(d, clientY, scroll - d.startScroll);
    const mine = rows.current.get(d.id);
    mine?.classList.toggle("leaving", over);
    if (d.ghost) { d.ghost.style.display = over ? "block" : "none"; d.ghost.style.top = `${me.top + clientY - d.startY}px`; }
    if (over) {
      // over another list: the rows here stay put, a line in that list shows where the row will land
      list.forEach((it) => { const el = rows.current.get(id(it)); if (el) el.style.transform = ""; });
      return;
    }
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

  /** The other list under the pointer (and where in it), or null — then the row moves inside its own list. */
  const crossZone = (d: Drag, clientY: number, scrolled: number) => {
    const z = d.zones.find((x) => clientY >= x.top - scrolled && clientY <= x.bottom - scrolled && lastX.current >= x.left && lastX.current <= x.right);
    for (const x of d.zones) x.el.classList.toggle("sort-drop-zone", x === z && x.list !== connect?.list);
    if (!z || z.list === connect?.list) { d.cross = null; if (d.line) d.line.style.display = "none"; return false; }
    let index = z.rows.length ? 0 : Infinity; // folded (rows clipped or not drawn): at its end
    z.rows.forEach((r) => { if (r.top - scrolled + r.height / 2 < clientY) index++; });
    d.cross = { list: z.list, index };
    if (d.line) {
      const at = z.rows.length ? z.rows[index] ?? z.rows[index - 1] : undefined;
      const y = !at ? z.bottom - scrolled - 6 : index < z.rows.length ? at.top - scrolled : at.top + at.height - scrolled;
      Object.assign(d.line.style, { display: "block", top: `${y - 1}px`, left: `${(at ?? z).left}px`, width: `${at ? at.width : z.right - z.left}px` });
    }
    return true;
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
    const zones: Zone[] = !connect ? [] : [...document.querySelectorAll<HTMLElement>(`[data-sort-zone="${CSS.escape(connect.group)}"]`)].map((el) => {
      const r = el.getBoundingClientRect();
      const rowRects = [...el.querySelectorAll<HTMLElement>(`[data-sort-row="${CSS.escape(connect.group)}"]`)].map((x) => {
        const b = x.getBoundingClientRect();
        return { top: b.top, height: b.height, left: b.left, width: b.width };
      });
      // a folded list's rows are still in the page but clipped away: then it takes the row at its end
      const shown = rowRects.every((x) => x.height > 0 && x.top >= r.top - 1 && x.top + x.height <= r.bottom + 1);
      return { list: el.dataset.sortList ?? "", el, top: r.top, bottom: r.bottom, left: r.left, right: r.right, rows: shown ? rowRects : [] };
    });
    let line: HTMLElement | null = null;
    let ghost: HTMLElement | null = null;
    if (zones.length > 1) {
      line = document.createElement("div"); line.className = "sort-drop-line"; line.style.display = "none"; document.body.appendChild(line);
      const row = els[index];
      if (row) {
        ghost = document.createElement("div"); ghost.className = "sort-ghost"; ghost.setAttribute("aria-hidden", "true");
        ghost.appendChild(row.firstElementChild?.cloneNode(true) ?? document.createElement("div"));
        ghost.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));
        const box = row.getBoundingClientRect();
        Object.assign(ghost.style, { display: "none", left: `${box.left}px`, width: `${box.width}px` });
        document.body.appendChild(ghost);
      }
    }
    const d: Drag = { index, id: id(list[index]!), startY: e.clientY, startScroll: scrollBox.current?.scrollTop ?? 0, rects, gap, target: index, pointerId: e.pointerId, zones, cross: null, line, ghost };
    dragRef.current = d;
    lastY.current = e.clientY;
    lastX.current = e.clientX;
    setDrag(d);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    lastY.current = e.clientY;
    lastX.current = e.clientX;
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
    d.line?.remove();
    d.ghost?.remove();
    moved?.classList.remove("leaving");
    for (const z of d.zones) z.el.classList.remove("sort-drop-zone");
    if (d.cross && connect) {
      const item = list[d.index]!;
      const where = Number.isFinite(d.cross.index) ? `, position ${d.cross.index + 1}` : ", at the end";
      setLive(`${name(item)} moved to ${connect.listName?.(d.cross.list) ?? d.cross.list}${where}.`);
      connect.onTransfer(d.index, d.cross.list, d.cross.index);
      return;
    }
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
              aria-describedby={helpId} title={connect ? "Drag to reorder or to move to another group (or focus and use the arrow keys)" : "Drag to reorder (or focus and use the arrow keys)"}
              onPointerDown={(e) => onPointerDown(e, i)} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish}
              onKeyDown={(e) => onKey(e, i)}>
              <Icon name="grip" size={14} stroke={2.6} />
            </button>
          );
          return (
            <li key={key} ref={(el) => { if (el) rows.current.set(key, el); else rows.current.delete(key); }}
              className={`sortable-item${dragging ? " dragging" : ""} ${itemClassName?.(it) ?? ""}`.trim()} data-testid={itemTestId}
              data-sort-row={connect?.group}>
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
