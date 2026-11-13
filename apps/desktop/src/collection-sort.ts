// Display sorting only: never mutate collection/execution order. Author: CODEX, 2026-11-03.
import { estimateTokens } from "@homunculus/core";

/** Token estimates per item object (D-124): sorting by tokens no longer re-counts every card on each render. */
const tokenCache = new WeakMap<object, number>();
function cachedTokens(item: unknown, texts: string[]): number {
  const key = item && typeof item === "object" ? item : null;
  const hit = key ? tokenCache.get(key) : undefined;
  if (hit !== undefined) return hit;
  const n = estimateTokens(texts.join("\n"));
  if (key) tokenCache.set(key, n);
  return n;
}

export const SORT_LABELS = { az: "A-Z", za: "Z-A", newest: "Newest", oldest: "Oldest", added: "Date added", favorites: "Favorites", recent: "Recent", mostChats: "Most chats", leastChats: "Least chats", mostTokens: "Most tokens", leastTokens: "Least tokens", random: "Random", original: "Default order" };
export type SortMode = keyof typeof SORT_LABELS;
export interface SortInfo { id: string; name: string; created?: number; added?: number; favorite?: boolean; recent?: number; chats?: number; tokens?: number }
export const object = (x: unknown): Record<string, unknown> => x && typeof x === "object" ? x as Record<string, unknown> : {};
export const sortItem = (x: unknown) => { const r = object(x); return r.agent ? object(r.agent) : r; };
export const itemId = (x: unknown) => { const r = sortItem(x); const id = String(r.id ?? ""); return typeof r.trashedAt === "number" ? `${r.kind}:${id}` : id; };
export const prefKey = (kind: string) => ["stories", "kits", "narrators", "npcs"].includes(kind) ? `vault-${kind}` : kind;
export const defaultSort = (kind: string): SortMode => ["characters", "stories", "personas"].includes(kind) ? "recent" : ["agents", "regex", "narrators"].includes(kind) ? "original" : kind === "trash" ? "newest" : "az";
export function sortOptions(kind: string): SortMode[] {
  if (kind === "regex") return ["original", "az", "za", "random"];
  const modes: SortMode[] = ["az", "za", "newest", "oldest", "added"];
  if (kind === "characters") modes.push("favorites");
  if (["characters", "stories", "personas"].includes(kind)) modes.push("recent", "mostChats", "leastChats");
  if (kind !== "trash") modes.push("mostTokens", "leastTokens");
  modes.push("random");
  return ["agents", "narrators"].includes(kind) ? ["original", ...modes] : modes;
}
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const numeric = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
function rank(id: string, seed: number) {
  let h = seed | 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
export function sortRows<T>(items: T[], mode: SortMode, describe: (item: T) => SortInfo, seed = 0): T[] {
  if (mode === "original") return [...items];
  const field = ({ newest: "created", oldest: "created", added: "added", favorites: "favorite", recent: "recent", mostChats: "chats", leastChats: "chats", mostTokens: "tokens", leastTokens: "tokens" } as Partial<Record<SortMode, keyof SortInfo>>)[mode];
  const direction = ["oldest", "leastChats", "leastTokens"].includes(mode) ? 1 : -1;
  return items.map((item) => { const info = describe(item); return { item, info, random: rank(info.id, seed) }; }).sort((a, b) => {
    const byName = collator.compare(a.info.name, b.info.name);
    const value = (info: SortInfo) => field === "favorite" ? Number(info.favorite === true) : numeric(field ? info[field] : 0);
    return (mode === "random" ? a.random - b.random : mode === "az" ? byName : mode === "za" ? -byName : direction * (value(a.info) - value(b.info))) || byName || a.info.id.localeCompare(b.info.id);
  }).map((row) => row.item);
}
function timestamp(value: unknown): number {
  if (typeof value === "number") return value > 0 && value < 1e12 ? value * 1000 : numeric(value);
  if (typeof value !== "string") return 0;
  const legacy = value.replace(/(\d{4}-\d{2}-\d{2}) @(\d{2})h(\d{2})m(\d{2})s(\d{3})ms/, "$1T$2:$3:$4.$5");
  const parsed = Date.parse(legacy); return Number.isFinite(parsed) ? parsed : 0;
}
export function itemSortInfo(kind: string, item: unknown, meta: { added?: number; created?: number } = {}, usage: { chats?: number; recent?: number } = {}, withTokens = true): SortInfo {
  const r = sortItem(item), original = object(r.original), data = object(original.data);
  const fields = ["description", "personality", "scenario", "exampleMessages", "systemPrompt", "postHistoryInstructions", "prompt", "turnInstruction", "notes"];
  const texts = withTokens ? fields.map((key) => typeof r[key] === "string" ? r[key] as string : "") : [];
  const blocks = withTokens && Array.isArray(r.blocks) ? r.blocks.map(object).filter((b) => b.enabled !== false && b.on !== false) : [];
  texts.push(...blocks.map((b) => String(b.content ?? b.text ?? "")));
  if (withTokens && !blocks.length && typeof r.instructions === "string") texts.push(r.instructions);
  for (const key of ["firstMessages", "openings", "entries"]) if (withTokens && Array.isArray(r[key])) texts.push(...(r[key] as unknown[]).map((x) => typeof x === "string" ? x : String(object(x).content ?? "")));
  if (withTokens && kind === "npcs") texts.push(...Object.values(object(r.values)).map((v) => typeof v === "string" ? v : JSON.stringify(v) ?? ""));
  if (withTokens && kind === "narrators") texts.push(...Object.values(object(r.style)).filter((v): v is string => typeof v === "string"));
  const narrator = object(r.narrator);
  const nested = withTokens && ["stories", "kits"].includes(kind) && narrator.kind === "own" ? itemSortInfo("narrators", narrator.narrator).tokens ?? 0 : 0;
  const favorite = [original.fav, object(original.extensions).fav, object(data.extensions).fav].some((v) => v === true || v === "true" || v === 1);
  return { id: itemId(item), name: String(r.name ?? ""), added: kind === "trash" ? numeric(r.trashedAt) : meta.added,
    created: kind === "trash" ? numeric(r.trashedAt) : numeric(r.createdAt) || timestamp(original.create_date ?? original.created_at) || (["agents", "trackers"].includes(kind) ? meta.added : meta.created),
    favorite, tokens: (texts.some((s) => s.length) ? cachedTokens(item, texts) : 0) + nested, ...usage };
}
export function preserveDisplayEdits<T extends { id: string }>(all: T[], shown: T[], next: T[]): T[] {
  const visible = new Set(shown.map((x) => x.id)), replacements = new Map(next.map((x) => [x.id, x])), existing = new Set(all.map((x) => x.id));
  return [...all.filter((x) => !visible.has(x.id) || replacements.has(x.id)).map((x) => replacements.get(x.id) ?? x), ...next.filter((x) => !existing.has(x.id))];
}
