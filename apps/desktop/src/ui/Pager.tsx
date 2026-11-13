// Homunculus 2 — pages for long collections (D-130). Author: CLAUDE, 2026-11-13.
// Daniel (translated): "pagination doesn't seem to work, it shows all my 666 characters at once" and "in lorebooks it shows
// all of them at the same time, in personas, presets etc". One page at a time, with the page numbers and how many per
// page (Settings → Library, or the menu on the pager itself). The page goes back to 1 when the list changes (a search, a
// folder, the sort).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PER_PAGE, setPrefs, usePrefs } from "../prefs.ts";

/** The visible page numbers: first, last, and the ones around the current page, with gaps. */
function pageNumbers(current: number, count: number): Array<number | "gap"> {
  const want = new Set([0, count - 1, current - 1, current, current + 1]);
  if (current <= 2) [1, 2, 3].forEach((n) => want.add(n));
  if (current >= count - 3) [count - 2, count - 3, count - 4].forEach((n) => want.add(n));
  const list = [...want].filter((n) => n >= 0 && n < count).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  list.forEach((n, i) => { if (i > 0 && n - list[i - 1]! > 1) out.push("gap"); out.push(n); });
  return out;
}

/**
 * The items of the current page and the pager under them. `resetKey`: when it changes the page goes back to 1.
 * `keep`: an item to keep in sight (the selected one): its page is shown when it is not on the current one.
 */
export function usePaged<T>(items: T[], resetKey: string, opts: { label?: string; keep?: (item: T) => boolean; testId?: string } = {}): { items: T[]; pager: ReactNode } {
  const p = usePrefs();
  const size = p.perPage > 0 ? p.perPage : Infinity;
  const count = Number.isFinite(size) ? Math.max(1, Math.ceil(items.length / size)) : 1;
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey, size]);
  // the selected item (opened from elsewhere) is on its own page
  const keepAt = opts.keep ? items.findIndex(opts.keep) : -1;
  useEffect(() => { if (keepAt >= 0 && Number.isFinite(size)) setPage(Math.floor(keepAt / size)); }, [keepAt >= 0 ? Math.floor(keepAt / (Number.isFinite(size) ? size : 1)) : -1]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = Math.min(page, count - 1);
  const shown = useMemo(() => (Number.isFinite(size) ? items.slice(current * size, current * size + size) : items), [items, current, size]);
  if (items.length <= (Number.isFinite(size) ? size : Infinity) && items.length <= PER_PAGE[0]!) return { items, pager: null };
  const go = (n: number) => { setPage(n); requestAnimationFrame(() => document.querySelector(`[data-pager-top="${opts.testId ?? "pager"}"]`)?.scrollIntoView({ block: "nearest" })); };
  const pager = (
    <nav className="pager" aria-label={`Pages of ${opts.label ?? "items"}`} data-testid={opts.testId ?? "pager"}>
      {count > 1 && <>
        <button type="button" className="pager-btn" disabled={current === 0} onClick={() => go(current - 1)} aria-label="Previous page">‹</button>
        {pageNumbers(current, count).map((n, i) => n === "gap"
          ? <span key={`g${i}`} className="pager-gap" aria-hidden>…</span>
          : <button type="button" key={n} className={`pager-btn${n === current ? " on" : ""}`} aria-current={n === current ? "page" : undefined} onClick={() => go(n)}>{n + 1}</button>)}
        <button type="button" className="pager-btn" disabled={current === count - 1} onClick={() => go(current + 1)} aria-label="Next page">›</button>
      </>}
      <span className="pager-count">{Number.isFinite(size) && count > 1 ? `${(current * size + 1).toLocaleString("en-US")}–${Math.min(items.length, (current + 1) * size).toLocaleString("en-US")} of ` : ""}{items.length.toLocaleString("en-US")} {opts.label ?? "items"}</span>
      <select className="pager-size" aria-label="Items per page" value={p.perPage} onChange={(e) => void setPrefs({ perPage: Number(e.target.value) })} data-testid="pager-size">
        {PER_PAGE.map((n) => <option key={n} value={n}>{n === 0 ? "All" : `${n} per page`}</option>)}
      </select>
    </nav>
  );
  return { items: shown, pager };
}

/** An invisible mark at the top of a paged list: changing the page scrolls back to it. */
export function PagerTop({ id = "pager" }: { id?: string }) {
  return <span className="pager-top" data-pager-top={id} aria-hidden />;
}
