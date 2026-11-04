// Homunculus 2 — icon sets a look can use in place of the default line icons. CLAUDE, 2026-11-04 (D-086).
//
// Same format as ICONS in ui/kit.tsx (24×24, one path, stroke only, currentColor), so a set only lists the names it
// redraws; any other name keeps the default drawing. Drafts: canvas "Homunculus 2 — Home", board "Icons".
import { useSyncExternalStore } from "react";

export type IconSetId = "lines" | "alchemical";
export const ICON_SET_NAMES: Record<IconSetId, string> = { lines: "Lines", alchemical: "Alchemical" };

/** Objects from a cabinet of curiosities, thin round strokes. */
const ALCHEMICAL: Record<string, string> = {
  // round-bottom flask with liquid and a bubble
  home: "M10 2.5h4M10.6 2.5v5.9A6.8 6.8 0 1 0 13.4 8.4V2.5M5.6 14.8h12.8M11 17.6h.01M13.6 18.8h.01",
  // open book with a ribbon
  book: "M12 6.6C9.8 5 6.8 4.4 3 4.8v13.6c3.8-.4 6.8.2 9 1.8 2.2-1.6 5.2-2.2 9-1.8V4.8c-3.8-.4-6.8.2-9 1.8zM12 6.6v13.6M16.2 5.2v5.3l1.4-1.1 1.4 1.1V5",
  // cameo: a bust inside an oval frame
  characters: "M12 2.5c4 0 6.8 4.2 6.8 9.5S16 21.5 12 21.5 5.2 17.3 5.2 12 8 2.5 12 2.5zM12 12.4a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM7.8 18.4c.9-2.3 2.3-3.5 4.2-3.5s3.3 1.2 4.2 3.5",
  // a watchful eye with rays (Card Browser)
  globe: "M2.5 13.5S6 8 12 8s9.5 5.5 9.5 5.5S18 19 12 19s-9.5-5.5-9.5-5.5zM12 16.2a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4zM12 2.5v2.6M5.6 4.4l1.5 2M18.4 4.4l-1.5 2M2.6 7.4l2 1.2M21.4 7.4l-2 1.2",
  // apothecary cabinet (Library)
  grid: "M4 3h16v18H4zM4 12h16M12 3v18M7 7.5h2M15 7.5h2M7 16.5h2M15 16.5h2",
  // reliquary chest (Vault)
  lock: "M3.5 11h17v9.5h-17zM3.5 11C3.5 7 7.3 4 12 4s8.5 3 8.5 7M12 14.2v3M12 14.2h.01M8 4.8V11M16 4.8V11",
  // ouroboros around a spark (Assistant)
  sparkle: "M17.8 6.6A8 8 0 1 0 20 12.6M20 12.6l2-1.8-2.9-.6zM17.8 6.6l.7-2.1M12 8.2l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z",
  // astrolabe (Settings)
  gear: "M12 21.5a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 5.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zM12 16.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 13.5h5M15 13.5h5M12 8v1.2M12 17.8V19M6.6 8.1l.9.9M17.4 8.1l-.9.9M6.6 18.9l.9-.9M17.4 18.9l-.9-.9",
  // lens with a glint
  search: "M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15.6 15.6L21 21M7 9.2A3.8 3.8 0 0 1 9.6 6.7",
  // cross with serifs
  plus: "M12 4v16M4 12h16M10.4 4h3.2M10.4 20h3.2M4 10.4v3.2M20 10.4v3.2",
  // pointer with a bar
  play: "M6.5 4.2v15.6L19.8 12zM9.2 9v6",
  // rolled scroll
  scroll: "M7 3.5h11.5a2 2 0 0 1 0 4H17v11a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-1.5H13v1.5a2 2 0 0 0 2 2M7 3.5a2 2 0 0 0-2 2v11.5M8.5 9h5M8.5 12.5h5",
  // mortar and pestle (Presets)
  preset: "M3.5 11h17a8.5 8.5 0 0 1-17 0zM9 19.2l-.5 1.8h7l-.5-1.8M12.5 11l6-7.2M17.2 3.2l2.6 2.2",
  // balance scale (Trackers)
  trackers: "M12 3.5V20M8 20.5h8M5 7h14M10.5 3.5h3M5 7l-2.5 6h5zM19 7l-2.5 6h5zM2.5 13a2.5 2.5 0 0 0 5 0M16.5 13a2.5 2.5 0 0 0 5 0",
  // a small homunculus inside a circle (Agents)
  chip: "M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19zM12 9a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8zM12 9v5.5M9 11l3-1.2 3 1.2M10 18.2l2-3.7 2 3.7",
  // theatre mask (Personas)
  persona: "M5 3.5h14v7.5a7 7 0 0 1-14 0zM8.2 8.6c.6-.6 1.6-.6 2.2 0M13.6 8.6c.6-.6 1.6-.6 2.2 0M9.3 14c1.6 1.2 3.8 1.2 5.4 0",
  // funeral urn (Trash)
  trash: "M9 5.5h6M12 3v2.5M8.5 5.5h7l-1 3c2.3.8 3.5 2.8 3.5 5 0 3.5-2.7 6-6 6s-6-2.5-6-6c0-2.2 1.2-4.2 3.5-5zM9 19.5l-.8 1.5h7.6l-.8-1.5M6.4 10.6c-1.5.3-2.4 1.4-2.4 2.8M17.6 10.6c1.5.3 2.4 1.4 2.4 2.8M9.5 13.5h5",
  // arrow into a cauldron
  import: "M12 2.5v8.5M8.6 7.6l3.4 3.4 3.4-3.4M3 13h18M4.5 13c0 4.5 3.3 7.5 7.5 7.5s7.5-3 7.5-7.5M7 21.5l1-1.6M17 21.5l-1-1.6",
};

const SETS: Record<IconSetId, Record<string, string>> = { lines: {}, alchemical: ALCHEMICAL };
export const isIconSet = (v: unknown): v is IconSetId => typeof v === "string" && Object.hasOwn(SETS, v);

let current: IconSetId = "lines";
const listeners = new Set<() => void>();
/** Called by theme/appearance.ts whenever the look (or its Icons tweak) changes. */
export function setIconSet(id: IconSetId): void {
  if (id === current) return;
  current = id;
  listeners.forEach((f) => f());
}
/** The drawings of the set in use (empty for the default lines). */
export function useIconOverrides(): Record<string, string> {
  const id = useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => current, () => current);
  return SETS[id];
}
