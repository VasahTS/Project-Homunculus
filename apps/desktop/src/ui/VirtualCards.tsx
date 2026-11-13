// Homunculus 2 — a grid of cards that only builds the rows on screen. CLAUDE, 2026-11-13 (D-121).
// With 1000 characters every card (picture, name, tags) was on the page at once: opening Characters took 30 s on Linux and
// scrolling ate memory until WebKitGTK killed the app. Now a long list keeps a few screens of cards and two spacers that
// hold the scroll height; short lists (most libraries) are drawn whole, exactly as before.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/** Lists up to this long are drawn whole. */
export const VIRTUAL_FROM = 80;
/** Rows kept above and below the screen, so a quick scroll doesn't show empty space. */
const OVERSCAN = 3;

interface Geometry { cols: number; card: number; pitch: number }

/**
 * The cards of a grid (`.gallery-grid`), as its own grid with the same columns. `layoutKey` changes when the cards change
 * size (Small / Medium / Large), so they are measured again; a change of width is noticed by itself.
 */
export function VirtualCards<T>({ items, render, boxRef, testId, layoutKey = "" }: {
  items: T[];
  render: (item: T) => ReactNode;
  /** The element the cards are in (for the page's arrival animation). */
  boxRef?: RefObject<HTMLDivElement | null>;
  testId?: string;
  layoutKey?: string;
}) {
  const own = useRef<HTMLDivElement>(null);
  const box = boxRef ?? own;
  const virtual = items.length > VIRTUAL_FROM;
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [rows, setRows] = useState<{ first: number; last: number }>({ first: 0, last: 0 });

  // measure: columns from the grid itself, the card height from the cards drawn (rows are then fixed to it)
  const measure = useCallback(() => {
    const el = box.current;
    if (!el || !virtual) return;
    const cs = getComputedStyle(el);
    const cols = Math.max(1, cs.gridTemplateColumns.split(" ").filter((t) => t && t !== "none").length);
    const gap = parseFloat(cs.rowGap) || 0;
    let card = 0;
    for (const child of el.children) if (child instanceof HTMLElement && !child.dataset.spacer) card = Math.max(card, child.offsetHeight);
    if (!card) return;
    setGeo((g) => (g && g.cols === cols && Math.abs(g.card - card) < 0.5 ? g : { cols, card, pitch: card + gap }));
  }, [box, virtual]);

  // which rows are on screen (the window's height is enough: the list's scroll box is inside it)
  const place = useCallback(() => {
    const el = box.current;
    if (!el || !geo) return;
    const r = el.getBoundingClientRect();
    const total = Math.ceil(items.length / geo.cols);
    const first = Math.max(0, Math.floor(Math.max(0, -r.top) / geo.pitch) - OVERSCAN);
    const last = Math.min(total, Math.ceil(Math.max(0, window.innerHeight - r.top) / geo.pitch) + OVERSCAN);
    setRows((o) => (o.first === first && o.last === last ? o : { first, last: Math.max(first, last) }));
  }, [box, geo, items.length]);

  // a new card size or width: measure again with rows free
  useLayoutEffect(() => { setGeo(null); }, [layoutKey, virtual]);
  useLayoutEffect(() => { if (!geo) measure(); else place(); }, [geo, measure, place]);

  useEffect(() => {
    if (!virtual) return;
    let frame = 0;
    const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; place(); }); };
    let width = box.current?.clientWidth ?? 0;
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
      const w = box.current?.clientWidth ?? 0;
      if (Math.abs(w - width) > 1) { width = w; setGeo(null); } else later();
    }) : null;
    if (box.current) ro?.observe(box.current);
    // scrolls anywhere (the grid scrolls by itself on wide windows, the page on narrow ones)
    window.addEventListener("scroll", later, { capture: true, passive: true });
    window.addEventListener("resize", later);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener("scroll", later, { capture: true });
      window.removeEventListener("resize", later);
    };
  }, [virtual, place, box]);

  if (!virtual) return <div className="gallery-cards" data-testid={testId} ref={box}>{items.map(render)}</div>;
  // measuring: the first cards with free rows
  if (!geo) return <div className="gallery-cards virtual" data-testid={testId} ref={box}>{items.slice(0, 24).map(render)}</div>;
  const total = Math.ceil(items.length / geo.cols);
  const first = Math.min(rows.first, total);
  const last = Math.min(Math.max(rows.last, first), total);
  return (
    <div className="gallery-cards virtual" data-testid={testId} ref={box} data-rows={`${first}-${last}/${total}`}
      style={{ gridAutoRows: `${geo.card}px`, paddingTop: first * geo.pitch, paddingBottom: (total - last) * geo.pitch }}>
      {items.slice(first * geo.cols, last * geo.cols).map(render)}
    </div>
  );
}
