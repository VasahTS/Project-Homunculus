// Homunculus 2 — what Ctrl+K lists for a search (D-069). Author: CLAUDE, 2026-11-01. The window is ui/CommandPalette.tsx.

export interface PaletteItem {
  id: string;
  name: string;
  /** The group it is listed under ("Go to", "Characters", "Lorebooks"…). */
  group: string;
  /** One short line on the right (where it lives, how many entries…). */
  hint?: string | undefined;
  /** Extra words the search also looks at (e.g. "library" for the Library sections). */
  keywords?: string | undefined;
  onOpen: () => void;
}

/** How many results each group shows while searching (the rest: type more). */
const PER_GROUP = 6;
/** Groups shown when nothing is typed. */
const EMPTY_GROUPS = ["Go to", "Recent chats"];

/** The items to list for a search: in group order, the names that start with the words first. Exported for tests. */
export function paletteResults(items: PaletteItem[], groupOrder: string[], query: string): PaletteItem[] {
  const term = query.trim().toLowerCase();
  const rank = (g: string) => { const i = groupOrder.indexOf(g); return i < 0 ? groupOrder.length : i; };
  if (!term) return items.filter((it) => EMPTY_GROUPS.includes(it.group)).sort((a, b) => rank(a.group) - rank(b.group));
  const words = term.split(/\s+/);
  const scored = items.flatMap((it) => {
    const name = it.name.toLowerCase();
    const hay = `${name} ${it.group.toLowerCase()} ${(it.keywords ?? "").toLowerCase()}`;
    if (it.group === "Recent chats" || !words.every((w) => hay.includes(w))) return [];
    const score = name === term ? 0 : name.startsWith(term) ? 1 : words.every((w) => name.includes(w)) ? 2 : 3;
    return [{ it, score }];
  });
  scored.sort((a, b) => rank(a.it.group) - rank(b.it.group) || a.score - b.score || a.it.name.localeCompare(b.it.name));
  const seen: Record<string, number> = {};
  return scored.filter(({ it }) => (seen[it.group] = (seen[it.group] ?? 0) + 1) <= PER_GROUP).map(({ it }) => it);
}
