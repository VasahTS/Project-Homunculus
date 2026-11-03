// Shared, remembered collection display order. Author: CODEX, 2026-11-03.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@homunculus/schemas";
import type { SqlStore } from "@homunculus/core";
import { defaultSort, itemId, itemSortInfo, prefKey, SORT_LABELS, sortOptions, sortRows, type SortMode } from "../collection-sort.ts";

interface Context { store: SqlStore; prefs: Record<string, { sort?: SortMode; sortSeed?: number }>; onSort: (key: string, sort: SortMode, seed: number) => void; sources: Record<string, unknown[]>; sessions: Session[]; lastTimes: Record<string, number> }
export const CollectionOrderContext = createContext<Context | null>(null);
function setting(ctx: Context | null, kind: string) {
  const prefs = ctx?.prefs[prefKey(kind)], options = sortOptions(kind);
  return { mode: prefs?.sort && options.includes(prefs.sort) ? prefs.sort : defaultSort(kind), seed: Number.isFinite(prefs?.sortSeed) ? prefs!.sortSeed! : 0, options };
}
function change(ctx: Context | null, kind: string, mode: SortMode) { ctx?.onSort(prefKey(kind), mode, mode === "random" ? Math.floor(Math.random() * 0x100000000) : setting(ctx, kind).seed); }

export function SortSelect({ kind }: { kind: string }) {
  const ctx = useContext(CollectionOrderContext);
  const { mode, options } = setting(ctx, kind);
  if (!ctx) return null;
  return <label className="collection-order"><span>Sort</span><select aria-label={`Sort ${kind}`} value={mode}
    title="Newest uses the creation date when available. Date added uses addition order. Token counts are estimates."
    onChange={(event) => change(ctx, kind, event.target.value as SortMode)}>{options.map((value) => <option key={value} value={value}>{value === "original" && kind === "regex" ? "Execution order" : SORT_LABELS[value]}</option>)}</select></label>;
}

export function useCollectionOrder<T>(kind: string, items: T[]) {
  const ctx = useContext(CollectionOrderContext);
  const { mode, seed } = setting(ctx, kind);
  const source = ctx?.sources[kind] ?? items;
  const ids = source.map(itemId).join("|");
  const [loaded, setLoaded] = useState<{ kind: string; values: Record<string, { added: number; created: number }> }>({ kind: "", values: {} });
  useEffect(() => {
    let live = true;
    if (ctx) void ctx.store.collectionSortMetadata(kind).then((values) => { if (live) setLoaded({ kind, values }); }).catch(() => { if (live) setLoaded({ kind, values: {} }); });
    return () => { live = false; };
  }, [ctx?.store, kind, ids]);
  const values = loaded.kind === kind ? loaded.values : {};
  const sorted = useMemo(() => {
    if (!ctx) return items;
    const byId = new Map(source.map((item) => [itemId(item), item]));
    const usage = new Map<string, { chats: number; recent: number }>();
    if (kind === "characters" || kind === "stories") for (const session of ctx.sessions) {
      const keys = kind === "stories" ? [session.storyId] : [...new Set(session.cast.map((c) => c.characterId))];
      for (const id of keys) if (id) { const prev = usage.get(id) ?? { chats: 0, recent: 0 }; usage.set(id, { chats: prev.chats + 1, recent: Math.max(prev.recent, ctx.lastTimes[session.id] ?? session.createdAt) }); }
    }
    return sortRows(items, mode, (item) => { const id = itemId(item); return itemSortInfo(kind, byId.get(id) ?? item, values[id], usage.get(id), mode === "mostTokens" || mode === "leastTokens"); }, seed);
  }, [items, source, kind, mode, seed, values, ctx?.sessions, ctx?.lastTimes]);
  return { items: sorted, mode, setMode: (value: SortMode) => change(ctx, kind, value) };
}
