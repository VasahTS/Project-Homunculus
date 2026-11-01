// Homunculus 2 — the Assistant's tools (D-062). Author: CLAUDE, 2026-11-01.
//
// Few, general tools (one `create` with a `kind`, not one per kind): their definitions go in every request, so fewer
// tools = fewer tokens. Items are named "kind:id" everywhere. Nothing here deletes: `change` and `propose_trash` make
// proposals the user approves (applyResult); `create` saves right away unless the user turned that off.
//
// Token rules: `find` returns one short line per item (25 per page); `read` returns only what was asked, long texts
// cut with "read more" hints; lorebooks are read as an index first, entries by page or by title.
import { Character, CharacterVariant, LoreEntry, Lorebook, Narrator, Story, type AssistantKind, type AssistantReadKind, type AssistantResult, type Folder, type FolderKind } from "@homunculus/schemas";
import { pruneOverrides, variantAvatarId, type SqlStore, type ToolSpec } from "@homunculus/core";
import { importCardJson } from "@homunculus/st-cards";
import { embeddedBookOf, lorebookFromCardBook, importStLorebook } from "@homunculus/st-lorebooks";
import { blankTracker, deleteTracker, draftOf, listTrackers, saveTracker, checkDraft, type TrackerDraft } from "../trackers.ts";
import { readPart } from "./files.ts";
import { GUIDES } from "./guides.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const one = (s: string, n = 90) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const LONG = 2500;

export const READ_KINDS: AssistantReadKind[] = ["character", "lorebook", "tracker", "kit", "narrator", "npc", "persona", "preset", "story"];
const WRITE_KINDS: AssistantKind[] = ["character", "lorebook", "tracker", "kit", "narrator"];
/** Kinds that can be in folders (D-036); trackers, personas and presets cannot. */
export const FOLDER_KINDS: FolderKind[] = ["character", "lorebook", "kit", "narrator", "npc", "story"];
const inFolders = (k: string): k is FolderKind => (FOLDER_KINDS as string[]).includes(k);

// Cancellation is checked at each write boundary; completed writes remain and are reported.
interface Writes { signal?: AbortSignal; completed?: string[] }
async function write<T>(w: Writes, ref: string, save: () => Promise<T>): Promise<T> {
  w.signal?.throwIfAborted();
  const saved = await save();
  w.completed?.push(ref);
  return saved;
}

// ------------------------------------------------------------------ folders (D-064)

/** "RPG/Iron Party" for each folder id of a kind. */
async function folderPaths(store: SqlStore, kind: FolderKind): Promise<{ all: Folder[]; path: Map<string, string> }> {
  const all = await store.listFolders(kind);
  const byId = new Map(all.map((f) => [f.id, f]));
  const path = new Map<string, string>();
  const of = (id: string, seen = new Set<string>()): string => {
    const known = path.get(id);
    if (known !== undefined) return known;
    const f = byId.get(id);
    if (!f || seen.has(id)) return "";
    seen.add(id);
    const p = f.parentId ? `${of(f.parentId, seen)}/${f.name}` : f.name;
    path.set(id, p.replace(/^\//, ""));
    return path.get(id)!;
  };
  for (const f of all) of(f.id);
  return { all, path };
}

const splitPath = (p: string) => p.split(/[/›>\\]/).map((x) => x.trim()).filter(Boolean);
const samePath = (a: string, b: string) => splitPath(a).join("/").toLowerCase() === splitPath(b).join("/").toLowerCase();

/** The folder at a path, made (with the ones above it) when missing. Returns its id (null = the top) and the ids it made. */
export async function ensureFolder(store: SqlStore, kind: FolderKind, path: string, newId: () => string, w: Writes = {}): Promise<{ id: string | null; made: string[] }> {
  const names = splitPath(path);
  const all = await store.listFolders(kind);
  let parent: string | null = null;
  const made: string[] = [];
  for (const name of names) {
    const found = all.find((f) => f.parentId === parent && f.name.trim().toLowerCase() === name.toLowerCase());
    if (found) { parent = found.id; continue; }
    const id = newId();
    const f = await write(w, `folder:${id}`, () => store.saveFolder({ id, kind, name, parentId: parent, createdAt: Date.now() }));
    all.push(f); made.push(f.id); parent = f.id;
  }
  return { id: parent, made };
}

/** Puts items in a folder and returns the "moved" card (Undo needs where each one was). */
export async function moveItems(store: SqlStore, refs: string[], folder: string, newId: () => string, w: Writes = {}): Promise<{ card: Extract<AssistantResult, { type: "moved" }>; skipped: string[] }> {
  const card: Extract<AssistantResult, { type: "moved" }> = { type: "moved", id: newId(), folder: splitPath(folder).join("/"), items: [], made: [], undone: false };
  const skipped: string[] = [];
  const targets = new Map<FolderKind, string | null>();
  for (const ref of refs) {
    const r = splitRef(ref);
    if (!r || !inFolders(r.kind)) { skipped.push(`${ref} (${r ? `${r.kind}s can't be in folders` : "unknown"})`); continue; }
    const item = await getItem(store, r.kind, r.id);
    if (!item) { skipped.push(`${ref} (not found)`); continue; }
    if (!targets.has(r.kind)) { const t = await ensureFolder(store, r.kind, folder, newId, w); targets.set(r.kind, t.id); card.made.push(...t.made); }
    const from = (await store.folderMap(r.kind))[r.id] ?? null;
    const kind = r.kind;
    await write(w, ref, () => store.setFolder(kind, r.id, targets.get(kind)!));
    card.items.push({ kind: r.kind, itemId: r.id, name: str(item.name), from });
  }
  return { card, skipped };
}

/** Undo of a move: each item back where it was; folders it made go away when nothing else is in them. */
export async function undoMove(store: SqlStore, card: Extract<AssistantResult, { type: "moved" }>): Promise<void> {
  for (const it of card.items) if (inFolders(it.kind)) await store.setFolder(it.kind, it.itemId, it.from);
  for (const id of [...card.made].reverse()) {
    const f = await store.folders.get(id);
    if (!f) continue;
    const used = Object.values(await store.folderMap(f.kind)).includes(id) || (await store.listFolders(f.kind)).some((x) => x.parentId === id);
    if (!used) await store.deleteFolder(id);
  }
}

/** Redo of an undone move (the folders are made again if Undo removed them). */
export async function redoMove(store: SqlStore, card: Extract<AssistantResult, { type: "moved" }>, newId: () => string): Promise<Extract<AssistantResult, { type: "moved" }>> {
  const { card: again } = await moveItems(store, card.items.map((i) => `${i.kind}:${i.itemId}`), card.folder, newId);
  return { ...again, id: card.id, items: again.items.map((i) => ({ ...i, from: card.items.find((x) => x.itemId === i.itemId)?.from ?? i.from })), made: [...new Set([...card.made, ...again.made])] };
}

export interface ToolContext {
  store: SqlStore;
  saveNew: boolean;
  newId: () => string;
  /** Files and images attached anywhere in this chat, by id. */
  files: Map<string, { name: string; text: string; mime: string }>;
  images: Map<string, { name: string; mime: string; base64: string }>;
  /** Cards for this reply. */
  results: AssistantResult[];
  signal?: AbortSignal;
  /** Guides still present in full in the current request. */
  availableGuides?: Set<string>;
  /** Guides already given in this chat. */
  guides: Set<string>;
  remember: (text: string) => Promise<void>;
}

export interface ToolOutcome { result: string; label: string; error?: boolean }

// ------------------------------------------------------------------ definitions

const kindProp = (kinds: readonly string[], d: string) => ({ type: "string", enum: kinds, description: d });
export const TOOL_SPECS: ToolSpec[] = [
  { name: "find", description: "Find items in the user's library. Returns one short line per item (\"kind:id · name [folder] — summary\"), 25 per page. Use a query whenever you know a name or topic.",
    parameters: { type: "object", properties: { kind: kindProp(READ_KINDS, "Only this kind (optional)."), query: { type: "string", description: "Words in the name or summary (optional)." }, folder: { type: "string", description: "Only items in this folder and its subfolders, e.g. \"RPG\" (optional)." }, page: { type: "number", description: "Page, from 1." } } } },
  { name: "folders", description: "The user's folders (each kind has its own tree), with how many items each holds.",
    parameters: { type: "object", properties: { kind: kindProp(FOLDER_KINDS, "Only this kind (optional).") } } },
  { name: "read", description: "Read one item (\"kind:id\" from find). Without `fields`, returns the item with long texts cut; a lorebook returns its entry index. Ask for `fields` to read only those, `offset` to continue a long text. For a lorebook, fields [\"entries\"] pages through entries (10 a page, use `offset` = entry number) and [\"entry:<title or id>\"] reads one. For a character, [\"variant:<label or id>\"] reads one version.",
    parameters: { type: "object", properties: { id: { type: "string" }, fields: { type: "array", items: { type: "string" } }, offset: { type: "number" } }, required: ["id"] } },
  { name: "guide", description: "How to write one kind of item well, and the exact fields `create`/`change` accept. Call once per kind per chat before writing it.",
    parameters: { type: "object", properties: { kind: kindProp(WRITE_KINDS, "") }, required: ["kind"] } },
  { name: "create", description: "Create a new item. `data` uses the fields from `guide`. Saved right away (the user can undo) unless the user asked to approve new items.",
    parameters: { type: "object", properties: { kind: kindProp(WRITE_KINDS, ""), data: { type: "object" }, folder: { type: "string", description: "Put it in this folder, e.g. \"RPG/Iron Party\" (made if missing; optional)." } }, required: ["kind", "data"] } },
  { name: "change", description: "Propose changes to an existing item: only the fields that change, with their new values. The user approves or discards it. `summary`: one line on what and why.",
    parameters: { type: "object", properties: { id: { type: "string" }, changes: { type: "object" }, summary: { type: "string" } }, required: ["id", "changes"] } },
  { name: "propose_trash", description: "Propose moving an item to the Trash (the user decides). You never delete.",
    parameters: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] } },
  { name: "read_file", description: "Read part of a file the user attached (id from the message). JSON: a `path` like \"data.description\" or \"entries.12\"; text/JSONL: `lines` like \"1-40\"; or `offset` for the next chunk.",
    parameters: { type: "object", properties: { file: { type: "string" }, path: { type: "string" }, lines: { type: "string" }, offset: { type: "number" } }, required: ["file"] } },
  { name: "import_file", description: "Turn an attached SillyTavern card or lorebook file into a library item (as the app's own import does). Then use `change` to edit it.",
    parameters: { type: "object", properties: { file: { type: "string" }, as: { type: "string", enum: ["character", "lorebook"] } }, required: ["file", "as"] } },
  { name: "move", description: "Put items in a folder: \"RPG/Iron Party\" = the folder Iron Party inside RPG (missing folders are made); \"\" = out of any folder. Applied at once; the user can undo.",
    parameters: { type: "object", properties: { items: { type: "array", items: { type: "string" }, description: "\"kind:id\" of each item." }, folder: { type: "string" } }, required: ["items", "folder"] } },
  { name: "set_picture", description: "Propose an attached image as a character's picture (or one version's, with `variant`).",
    parameters: { type: "object", properties: { id: { type: "string", description: "character:id" }, image: { type: "string", description: "The image id from the message." }, variant: { type: "string", description: "A version's label or id (optional)." } }, required: ["id", "image"] } },
  { name: "remember", description: "Remember a lasting fact or preference of the user for future chats (they can see and edit it).",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
];

// ------------------------------------------------------------------ the library, read lightly

interface Row { kind: AssistantReadKind; id: string; name: string; line: string; folder?: string }

async function rows(store: SqlStore, kind: AssistantReadKind): Promise<Row[]> {
  const list = await baseRows(store, kind);
  if (!inFolders(kind)) return list;
  const { path } = await folderPaths(store, kind);
  if (!path.size) return list;
  const map = await store.folderMap(kind);
  return list.map((r) => { const f = map[r.id]; const p = f ? path.get(f) : undefined; return p ? { ...r, folder: p } : r; });
}

async function baseRows(store: SqlStore, kind: AssistantReadKind): Promise<Row[]> {
  switch (kind) {
    case "character": return (await store.listCharacters()).map((c) => ({ kind, id: c.id, name: c.name,
      line: `${c.variants.length ? `versions: Main, ${c.variants.map((v) => v.label).join(", ")} · ` : ""}${one(c.description || c.personality || c.tags.join(", "))}` }));
    case "lorebook": return (await store.lorebooks.list()).map((b) => ({ kind, id: b.id, name: b.name, line: `${b.entries.length} entries${b.description ? ` · ${one(b.description, 70)}` : ""}` }));
    case "tracker": return (await listTrackers(store)).map((t) => ({ kind, id: t.agent.id, name: t.agent.name, line: `${t.sets[0]?.fields.length ?? 0} fields${t.agent.help ? ` · ${one(t.agent.help, 70)}` : ""}` }));
    case "kit": return (await store.kits.list()).map((k) => ({ kind, id: k.id, name: k.name, line: one(k.description || k.scenario) }));
    case "story": return (await store.stories.list()).map((k) => ({ kind, id: k.id, name: k.name, line: one(k.description || k.scenario) }));
    case "narrator": return (await store.narrators.list()).map((n) => ({ kind, id: n.id, name: n.name, line: one(n.about || n.instructions) }));
    case "npc": return (await store.npcs.list()).map((n) => ({ kind, id: n.id, name: n.name, line: one(Object.values(n.values).filter((v) => typeof v === "string").join(" · ") || n.notes) }));
    case "persona": return (await store.personas.list()).map((p) => ({ kind, id: p.id, name: p.name, line: one(p.description) }));
    case "preset": return (await store.presets.list()).map((p) => ({ kind, id: p.id, name: p.name, line: `${p.blocks.length} blocks${p.description ? ` · ${one(p.description, 60)}` : ""}` }));
  }
}

/** How many items of each kind (sent in the instructions, so the Assistant knows what exists without reading it). */
export async function libraryCounts(store: SqlStore): Promise<string> {
  const parts: string[] = [];
  for (const k of READ_KINDS) { const n = (await rows(store, k)).length; if (n) parts.push(`${k}s: ${n}`); }
  return parts.join(", ") || "empty";
}

/** "character:abc" → its kind and id. */
export function splitRef(ref: string): { kind: AssistantReadKind; id: string } | null {
  const i = ref.indexOf(":");
  if (i < 0) return null;
  const kind = ref.slice(0, i) as AssistantReadKind;
  return READ_KINDS.includes(kind) ? { kind, id: ref.slice(i + 1) } : null;
}

/** The whole stored item (for reading and for changes). */
export async function getItem(store: SqlStore, kind: AssistantReadKind, id: string): Promise<Obj | undefined> {
  switch (kind) {
    case "character": return (await store.getCharacter(id)) as unknown as Obj | undefined;
    case "lorebook": return (await store.lorebooks.get(id)) as unknown as Obj | undefined;
    case "tracker": { const t = (await listTrackers(store)).find((x) => x.agent.id === id); return t ? trackerView(draftOf(t)) : undefined; }
    case "kit": return (await store.kits.get(id)) as unknown as Obj | undefined;
    case "story": return (await store.stories.get(id)) as unknown as Obj | undefined;
    case "narrator": return (await store.narrators.get(id)) as unknown as Obj | undefined;
    case "npc": return (await store.npcs.get(id)) as unknown as Obj | undefined;
    case "persona": return (await store.personas.get(id)) as unknown as Obj | undefined;
    case "preset": return (await store.presets.get(id)) as unknown as Obj | undefined;
  }
}

/** A tracker as the Assistant sees and writes it: the default field set's fields at the top. */
function trackerView(d: TrackerDraft): Obj {
  const set = d.sets.find((s) => s.id === d.defaultSetId) ?? d.sets[0]!;
  return { id: d.id, name: d.name, help: d.help, prompt: d.prompt, messages: d.messages, characters: set.characters,
    fields: set.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, scope: f.scope, ...(f.options.length ? { options: f.options } : {}),
      ...(f.min !== undefined ? { min: f.min } : {}), ...(f.max !== undefined ? { max: f.max } : {}), ...(f.note ? { note: f.note } : {}), ...(f.section ? { section: f.section } : {}), toPrompt: f.toPrompt, required: f.required })),
    ...(d.sets.length > 1 ? { otherFieldSets: d.sets.filter((s) => s !== set).map((s) => s.name) } : {}) };
}

/** Never sent: the original imported file, ids of internal things, pictures. */
const HIDDEN = new Set(["original", "source", "builtin", "lorePatches", "hasOwnAvatar", "createdAt", "setup", "regexScripts"]);
function compact(v: unknown, path: string, offset = 0): unknown {
  if (typeof v === "string") {
    const start = Math.max(0, Math.floor(offset));
    const end = start + LONG;
    return v.length > end ? `${v.slice(start, end)} …(${(v.length - end).toLocaleString("en")} more characters: read with fields ["${path}"] and offset ${end})` : v.slice(start);
  }
  if (Array.isArray(v)) return v.map((x, i) => compact(x, `${path}.${i}`));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).filter(([k, x]) => !HIDDEN.has(k) && x !== "" && !(Array.isArray(x) && x.length === 0)).map(([k, x]) => [k, compact(x, path ? `${path}.${k}` : k)]));
  return v;
}

const entryLine = (e: LoreEntry) => `${e.id} · ${e.title || "(untitled)"} — keys: ${e.keys.join(", ") || "none"}${e.constant ? " · always on" : ""}${e.enabled ? "" : " · off"} · ${e.content.length} chars`;
const entryFull = (e: LoreEntry) => ({ id: e.id, title: e.title, keys: e.keys, ...(e.secondaryKeys.length ? { secondaryKeys: e.secondaryKeys } : {}), content: e.content, constant: e.constant, position: e.position, ...(e.position === "atDepth" ? { depth: e.depth } : {}), order: e.order, enabled: e.enabled });

async function readItem(store: SqlStore, ref: string, fields: string[], offset: number): Promise<string> {
  const r = splitRef(ref);
  if (!r) return `Unknown item “${ref}”. Use the "kind:id" from find.`;
  const item = await getItem(store, r.kind, r.id);
  if (!item) return `No ${r.kind} with id “${r.id}”.`;
  if (r.kind === "lorebook") {
    const book = Lorebook.parse(item);
    const one = fields.find((f) => f.startsWith("entry:"));
    if (one) {
      const key = one.slice(6).trim().toLowerCase();
      const e = book.entries.find((x) => x.id.toLowerCase() === key || x.title.toLowerCase() === key);
      return e ? JSON.stringify(entryFull(e)) : `No entry “${one.slice(6)}”. Read the lorebook without fields for the index.`;
    }
    if (fields.includes("entries")) {
      const page = book.entries.slice(offset, offset + 10).map(entryFull);
      const rest = book.entries.length - offset - page.length;
      return JSON.stringify(page) + (rest > 0 ? `\n(${rest} more entries; read with fields ["entries"] and offset ${offset + page.length})` : "");
    }
    const idx = book.entries.slice(offset, offset + 80).map(entryLine);
    return `${book.name}${book.description ? ` — ${book.description}` : ""}\n${book.entries.length} entries:\n${idx.join("\n")}${book.entries.length > offset + 80 ? `\n(${book.entries.length - offset - 80} more; read with offset ${offset + 80})` : ""}`;
  }
  if (r.kind === "character") {
    const v = fields.find((f) => f.startsWith("variant:"));
    if (v) {
      const x = variantOf(Character.parse(item), v.slice(8));
      return x ? JSON.stringify({ id: x.id, label: x.label, ...(compact(x.overrides, "") as Obj), ...(x.hasOwnAvatar ? { picture: "its own" } : {}) }) : `No version “${v.slice(8)}”. Read the character without fields for its versions.`;
    }
  }
  if (fields.length) {
    const out: Obj = {};
    for (const f of fields) {
      let v: unknown = item;
      for (const k of f.split(".")) v = Array.isArray(v) ? v[Number(k)] : isObj(v) ? v[k] : undefined;
      out[f] = v === undefined ? "(no such field)" : compact(v, f, typeof v === "string" ? offset : 0);
    }
    return JSON.stringify(out);
  }
  const view = compact(item, "") as Obj;
  if (r.kind === "character" && Array.isArray((item as Obj).variants) && ((item as Obj).variants as Obj[]).length)
    view.variants = ((item as Obj).variants as CharacterVariant[]).map((x) => `${x.id} · ${x.label} — changes: ${Object.keys(x.overrides).join(", ") || "nothing yet"} (read with fields ["variant:${x.label}"])`);
  return JSON.stringify(view);
}

async function findItems(store: SqlStore, kind: AssistantReadKind | undefined, query: string, page: number, folder = ""): Promise<string> {
  const kinds = kind ? [kind] : READ_KINDS;
  let all: Row[] = [];
  for (const k of kinds) all = all.concat(await rows(store, k));
  if (splitPath(folder).length) {
    const want = splitPath(folder).join("/").toLowerCase();
    all = all.filter((r) => r.folder && (r.folder.toLowerCase() === want || r.folder.toLowerCase().startsWith(`${want}/`) || r.folder.toLowerCase().endsWith(`/${want}`) || r.folder.toLowerCase().includes(`/${want}/`)));
    if (!all.length) return `Nothing in a folder “${folder}”${kind ? ` of ${kind}s` : ""}. See \`folders\`.`;
  }
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    const score = (r: Row) => {
      const name = r.name.toLowerCase(), line = r.line.toLowerCase();
      let s = 0;
      for (const w of words) s += name === w ? 10 : name.startsWith(w) ? 6 : name.includes(w) ? 4 : line.includes(w) ? 1 : 0;
      return s;
    };
    all = all.map((r) => [r, score(r)] as const).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([r]) => r);
  }
  const from = (Math.max(1, Math.round(page)) - 1) * 25;
  const shown = all.slice(from, from + 25);
  if (!shown.length) return words.length ? `Nothing matches “${query}”${kind ? ` in ${kind}s` : ""}.` : "Nothing here.";
  return `${shown.map((r) => `${r.kind}:${r.id} · ${r.name}${r.folder ? ` [${r.folder}]` : ""}${r.line ? ` — ${r.line}` : ""}`).join("\n")}${all.length > from + 25 ? `\n(${all.length - from - 25} more; page ${Math.floor(from / 25) + 2})` : ""}`;
}

// ------------------------------------------------------------------ writing

const pick = (data: Obj, keys: string[]) => Object.fromEntries(Object.entries(data).filter(([k]) => keys.includes(k)));
/** "folder" is accepted with every kind that can be in folders (where to put a new item). */
const unknownKeys = (data: Obj, kind: string) => Object.keys(data).filter((k) => !GUIDES[kind]!.fields.includes(k) && !(k === "folder" && inFolders(kind)));

// ------------------------------------------------------------------ character versions (variants), D-064
/** The fields a version can change (everything a card has but its versions). */
export const VARIANT_FIELDS = GUIDES.character!.fields.filter((f) => f !== "variants");
const charFields = (data: Obj) => pick(data, VARIANT_FIELDS);

function variantOf(c: Character, key: string): CharacterVariant | undefined {
  const k = key.trim().toLowerCase();
  return c.variants.find((v) => v.id.toLowerCase() === k || v.label.trim().toLowerCase() === k);
}

function checkVariant(v: Obj) {
  const bad = Object.keys(v).filter((k) => k !== "label" && k !== "id" && !VARIANT_FIELDS.includes(k));
  if (bad.length) throw new Error(`Unknown field(s) for a character version: ${bad.join(", ")}. A version takes "label" and the character's fields.`);
}

function newVariant(main: Character, v: Obj, newId: () => string): CharacterVariant {
  checkVariant(v);
  const label = str(v.label).trim();
  if (!label) throw new Error("A character version needs a \"label\" (e.g. \"Modern AU\").");
  return CharacterVariant.parse({ id: newId(), label, overrides: pruneOverrides(main, charFields(v) as Partial<Character>) });
}

/**
 * The versions after a change: { add, update, remove } (by label or id), or a plain list (each one updates the
 * version with its label, or is added) — a list never removes a version.
 */
function variantsAfter(main: Character, before: CharacterVariant[], ops: unknown, newId: () => string): CharacterVariant[] {
  let list = [...before];
  const update = (u: Obj) => {
    checkVariant(u);
    const key = str(u.id) || str(u.label);
    const old = key ? list.find((x) => x === variantOf({ ...main, variants: list }, key)) : undefined;
    if (!old) { list.push(newVariant(main, u, newId)); return; }
    const label = str(u.id) && str(u.label).trim() ? str(u.label).trim() : old.label;
    list = list.map((x) => (x === old ? { ...x, label, overrides: pruneOverrides(main, { ...x.overrides, ...charFields(u) } as Partial<Character>) } : x));
  };
  if (Array.isArray(ops)) { for (const u of ops.filter(isObj)) update(u); return list; }
  if (!isObj(ops)) throw new Error("\"variants\" in a change is { \"add\": [...], \"update\": [...], \"remove\": [labels or ids] }.");
  for (const u of Array.isArray(ops.update) ? ops.update.filter(isObj) : []) {
    if (!variantOf({ ...main, variants: list }, str(u.id) || str(u.label))) throw new Error(`No version “${str(u.id) || str(u.label)}” to update. Use "add" for a new one.`);
    update(u);
  }
  const rm = strs(ops.remove);
  list = list.filter((x) => !rm.some((t) => variantOf({ ...main, variants: [x] }, t)));
  for (const a of Array.isArray(ops.add) ? ops.add.filter(isObj) : []) {
    if (variantOf({ ...main, variants: list }, str(a.label))) throw new Error(`There is already a version “${str(a.label)}”. Use "update".`);
    list.push(newVariant(main, a, newId));
  }
  return list;
}

/** The versions a change touches, as they are now (for the card and the stale check). */
function touchedVariants(c: Character, ops: unknown): Obj[] {
  const keys = Array.isArray(ops) ? ops.filter(isObj).map((u) => str(u.id) || str(u.label))
    : isObj(ops) ? [...(Array.isArray(ops.update) ? ops.update.filter(isObj) : []).map((u) => str(u.id) || str(u.label)), ...strs(ops.remove)] : [];
  return c.variants.filter((v) => keys.some((k) => k && variantOf({ ...c, variants: [v] }, k))).map((v) => ({ id: v.id, label: v.label, ...v.overrides }));
}

function trackerFieldsOf(list: unknown): TrackerDraft["sets"][number]["fields"] {
  return (Array.isArray(list) ? list.filter(isObj) : []).map((f, i) => ({
    key: str(f.key) || `~${i}-${crypto.randomUUID().slice(0, 6)}`, label: str(f.label), help: "", note: str(f.note) || undefined,
    type: (["text", "number", "meter", "status", "list"].includes(str(f.type)) ? str(f.type) : "text") as never,
    options: strs(f.options), ...(typeof f.min === "number" ? { min: f.min } : {}), ...(typeof f.max === "number" ? { max: f.max } : {}),
    scope: (["global", "perCharacter", "perPair"].includes(str(f.scope)) ? str(f.scope) : "global") as never,
    lockedForAgents: false, toPrompt: f.toPrompt !== false, required: f.required === true, section: str(f.section), fields: [],
  }));
}

function loreEntryOf(e: Obj, newId: () => string): LoreEntry {
  return LoreEntry.parse({ ...pick(e, GUIDES.lorebook!.fields), id: str(e.id) || newId() });
}

function narratorOf(data: Obj, id: string): Narrator {
  const blocks = Array.isArray(data.blocks) ? data.blocks.filter(isObj).map((b, i) => ({ id: str(b.id) || `b${i + 1}`, name: str(b.name), on: b.on !== false, text: str(b.text) })) : undefined;
  const instructions = blocks ? blocks.filter((b) => b.on && b.text.trim()).map((b) => b.text.trim()).join("\n\n") : str(data.instructions);
  return Narrator.parse({ ...pick(data, ["name", "about", "modes", "style"]), id, instructions, ...(blocks ? { blocks } : {}) });
}

/** Cast as the Assistant writes it — "character:id", or { "id", "version" } for one of its versions — as cast members. */
async function castOf(store: SqlStore, list: unknown): Promise<Array<{ characterId: string; variantId: string | null }>> {
  const out: Array<{ characterId: string; variantId: string | null }> = [];
  for (const x of Array.isArray(list) ? list : []) {
    const ref = typeof x === "string" ? x : isObj(x) ? str(x.id) || str(x.characterId) : "";
    const version = isObj(x) ? str(x.version) || str(x.variant) : "";
    const id = splitRef(ref)?.id ?? ref;
    if (!id) continue;
    let variantId: string | null = null;
    if (version && !/^main$/i.test(version.trim())) {
      const c = await store.getCharacter(id);
      const v = c ? variantOf(c, version) : undefined;
      if (!v) throw new Error(`${c ? c.name : `character:${id}`} has no version “${version}”.${c ? ` Its versions: Main${c.variants.map((y) => `, ${y.label}`).join("")}.` : ""}`);
      variantId = v.id;
    }
    out.push({ characterId: id, variantId });
  }
  return out;
}

function kitOf(data: Obj, id: string, base?: Obj): Story {
  const prev = (base ?? {}) as Obj;
  const lore = strs(data.lorebookIds).map((x) => splitRef(x)?.id ?? x);
  const narratorId = str(data.narratorId);
  return Story.parse({
    ...prev, id, createdAt: typeof prev.createdAt === "number" ? prev.createdAt : Date.now(),
    ...pick(data, ["name", "description", "scenario", "openings", "userRole"]),
    ...(data.cast !== undefined ? { cast: data.cast } : {}),
    ...(data.npcIds !== undefined ? { npcIds: strs(data.npcIds).map((x) => splitRef(x)?.id ?? x) } : {}),
    ...(narratorId ? { narrator: { kind: "vault", id: splitRef(narratorId)?.id ?? narratorId } } : {}),
    ...(data.lorebookIds !== undefined ? { setup: { ...(isObj(prev.setup) ? prev.setup : {}), lorebooks: { mode: "add", add: lore, remove: [] } } } : {}),
  });
}

/** Saves a new item. Returns its id and a one-line detail. Throws a readable error when the data is wrong. */
export async function createItem(store: SqlStore, kind: AssistantKind, data: Obj, newId: () => string, w: Writes = {}): Promise<{ id: string; name: string; detail: string }> {
  const bad = unknownKeys(data, kind);
  if (bad.length) throw new Error(`Unknown field(s) for a ${kind}: ${bad.join(", ")}. Call guide("${kind}").`);
  const name = str(data.name).trim();
  if (!name) throw new Error(`A ${kind} needs a name.`);
  const made = await createOnly(store, kind, data, name, newId, w);
  const folder = str(data.folder);
  if (splitPath(folder).length && inFolders(kind)) {
    const f = await ensureFolder(store, kind, folder, newId, w);
    await write(w, `${kind}:${made.id}`, () => store.setFolder(kind, made.id, f.id));
    made.detail += ` · in ${splitPath(folder).join("/")}`;
  }
  return made;
}

async function createOnly(store: SqlStore, kind: AssistantKind, data: Obj, name: string, newId: () => string, w: Writes): Promise<{ id: string; name: string; detail: string }> {
  switch (kind) {
    case "character": {
      const main = Character.parse({ ...charFields(data), id: newId() });
      const list = Array.isArray(data.variants) ? data.variants.filter(isObj) : [];
      const variants: CharacterVariant[] = [];
      for (const v of list) { if (variantOf({ ...main, variants }, str(v.label))) throw new Error(`Two versions are called “${str(v.label)}”.`); variants.push(newVariant(main, v, newId)); }
      const c = await write(w, `character:${main.id}`, () => store.saveCharacter({ ...main, variants }));
      return { id: c.id, name: c.name, detail: `${c.firstMessages.length} first message(s)${variants.length ? ` · ${variants.length + 1} versions` : ""}` };
    }
    case "lorebook": {
      const entries = (Array.isArray(data.entries) ? data.entries.filter(isObj) : []).map((e) => loreEntryOf(e, newId));
      const book = Lorebook.parse({ id: newId(), name, description: str(data.description), entries });
      const b = await write(w, `lorebook:${book.id}`, () => store.saveLorebook(book));
      return { id: b.id, name: b.name, detail: `${b.entries.length} entries` };
    }
    case "tracker": {
      const d = blankTracker();
      d.name = name; d.help = str(data.help); if (str(data.prompt)) d.prompt = str(data.prompt);
      if (typeof data.messages === "number") d.messages = data.messages;
      d.sets[0]!.fields = trackerFieldsOf(data.fields);
      if (["cast", "castAndUser", "anyone"].includes(str(data.characters))) d.sets[0]!.characters = str(data.characters) as never;
      const problems = checkDraft(d);
      if (problems.length) throw new Error(problems.join(" "));
      const guarded = new Proxy(store, { get(target, key) {
        if (key === "saveTrackerSchema") return (value: Parameters<SqlStore["saveTrackerSchema"]>[0]) => write(w, `trackerSchema:${value.id}`, () => target.saveTrackerSchema(value));
        if (key === "saveAgentConfig") return (value: Parameters<SqlStore["saveAgentConfig"]>[0]) => write(w, `tracker:${value.id}`, () => target.saveAgentConfig(value));
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      const saved = await saveTracker(guarded, d);
      return { id: saved.id, name: saved.name, detail: `${saved.sets[0]!.fields.length} fields` };
    }
    case "kit": {
      const kit = kitOf({ ...data, ...(data.cast !== undefined ? { cast: await castOf(store, data.cast) } : {}) }, newId());
      const k = await write(w, `kit:${kit.id}`, () => store.kits.save(kit));
      return { id: k.id, name: k.name, detail: `${k.cast.length} in the cast · ${k.openings.length} opening(s)` };
    }
    case "narrator": {
      const narrator = narratorOf(data, newId());
      const n = await write(w, `narrator:${narrator.id}`, () => store.saveNarrator(narrator));
      return { id: n.id, name: n.name, detail: n.about || "narrator" };
    }
  }
}

/** The fields a change touches, as they are now (for the card and to notice later edits). */
export function currentOf(item: Obj, kind: AssistantKind, changes: Obj): Obj {
  const out: Obj = {};
  for (const k of Object.keys(changes)) {
    if (kind === "lorebook" && k === "entries") {
      const ops = isObj(changes.entries) ? changes.entries : {};
      const entries = (Array.isArray(item.entries) ? item.entries : []) as LoreEntry[];
      const touched = [...(Array.isArray(ops.update) ? ops.update.filter(isObj) : []).map((u) => str(u.id) || str(u.title)), ...strs(ops.remove)];
      out.entries = entries.filter((e) => touched.some((t) => t === e.id || t.toLowerCase() === e.title.toLowerCase())).map(entryFull);
    } else if (kind === "character" && k === "variants") out.variants = touchedVariants(Character.parse(item), changes.variants);
    else if (kind === "kit" && k === "narratorId") out[k] = item.narrator ?? "";
    else if (kind === "kit" && k === "lorebookIds") out[k] = isObj(item.setup) ? item.setup.lorebooks ?? "" : "";
    else out[k] = item[k] ?? "";
  }
  return out;
}

/** Applies an approved change. Returns false when the item changed since (the card turns "stale"). */
export async function applyChange(store: SqlStore, r: Extract<AssistantResult, { type: "change" }>, newId: () => string): Promise<"applied" | "stale" | "missing"> {
  const item = await getItem(store, r.kind, r.itemId);
  if (!item) return "missing";
  if (JSON.stringify(currentOf(item, r.kind, r.after)) !== JSON.stringify(r.before)) return "stale";
  const ch = r.after;
  switch (r.kind) {
    case "character": {
      const c = Character.parse(item);
      let variants = c.variants;
      if (typeof ch.picture === "string") {
        const { mime, base64, variantId } = JSON.parse(ch.picture) as { mime: string; base64: string; variantId?: string };
        if (variantId) {
          if (!variants.some((v) => v.id === variantId)) return "missing";
          await store.setAvatar(variantAvatarId(r.itemId, variantId), { mime, base64 });
          variants = variants.map((v) => (v.id === variantId ? { ...v, hasOwnAvatar: true } : v));
        } else await store.setAvatar(r.itemId, { mime, base64 });
      }
      const { picture: _p, variants: ops, ...rest } = ch;
      const main = Character.parse({ ...c, ...charFields(rest) });
      if (ops !== undefined) variants = variantsAfter(main, variants, ops, newId);
      // versions keep only what still differs from the (maybe changed) main version
      variants = variants.map((v) => ({ ...v, overrides: pruneOverrides(main, v.overrides) }));
      if (Object.keys(rest).length || ops !== undefined || variants !== c.variants) await store.saveCharacter({ ...main, variants });
      break;
    }
    case "lorebook": {
      const book = Lorebook.parse(item);
      let entries = book.entries;
      if (isObj(ch.entries)) {
        const ops = ch.entries;
        const match = (e: LoreEntry, t: string) => t === e.id || t.toLowerCase() === e.title.toLowerCase();
        for (const u of Array.isArray(ops.update) ? ops.update.filter(isObj) : []) {
          const t = str(u.id) || str(u.title);
          entries = entries.map((e) => (match(e, t) ? LoreEntry.parse({ ...e, ...pick(u, GUIDES.lorebook!.fields), id: e.id }) : e));
        }
        const rm = strs(ops.remove);
        entries = entries.filter((e) => !rm.some((t) => match(e, t)));
        for (const a of Array.isArray(ops.add) ? ops.add.filter(isObj) : []) entries = [...entries, loreEntryOf(a, newId)];
      }
      await store.saveLorebook(Lorebook.parse({ ...book, ...pick(ch, ["name", "description"]), entries }));
      break;
    }
    case "tracker": {
      const t = (await listTrackers(store)).find((x) => x.agent.id === r.itemId);
      if (!t) return "missing";
      const d = draftOf(t);
      const set = d.sets.find((s) => s.id === d.defaultSetId) ?? d.sets[0]!;
      if (typeof ch.name === "string") d.name = ch.name;
      if (typeof ch.help === "string") d.help = ch.help;
      if (typeof ch.prompt === "string") d.prompt = ch.prompt;
      if (typeof ch.messages === "number") d.messages = ch.messages;
      if (ch.fields !== undefined) set.fields = trackerFieldsOf(ch.fields);
      if (typeof ch.characters === "string") set.characters = ch.characters as never;
      const problems = checkDraft(d);
      if (problems.length) throw new Error(problems.join(" "));
      await saveTracker(store, d);
      break;
    }
    case "kit": await store.kits.save(kitOf({ ...ch, ...(ch.cast !== undefined ? { cast: await castOf(store, ch.cast) } : {}) }, r.itemId, item)); break;
    case "narrator": {
      const n = Narrator.parse(item);
      const merged = narratorOf({ ...n, ...ch, style: { ...n.style, ...(isObj(ch.style) ? ch.style : {}) } } as Obj, n.id);
      await store.saveNarrator({ ...merged, builtin: n.builtin });
      break;
    }
  }
  return "applied";
}

const TRASH_KIND: Partial<Record<AssistantKind, "character" | "lorebook" | "kit" | "narrator">> = { character: "character", lorebook: "lorebook", kit: "kit", narrator: "narrator" };

export async function applyTrash(store: SqlStore, kind: AssistantKind, id: string): Promise<void> {
  const t = TRASH_KIND[kind];
  if (t) await store.moveToTrash(t, id);
  else if (kind === "tracker") await deleteTracker(store, id);
}

/** Undo of a created item: to the Trash (trackers have no Trash: removed). */
export const undoCreate = applyTrash;

/** Saves an import only after approval, preserving the original format and embedded lore. */
async function importItem(store: SqlStore, kind: "character" | "lorebook", file: { text: string; name: string }, newId: () => string, w: Writes = {}) {
  const bytes = new TextEncoder().encode(file.text);
  if (kind === "lorebook") {
    const imp = importStLorebook(bytes, file.name);
    const b = Lorebook.parse({ ...imp.lorebook, id: newId() });
    await write(w, `lorebook:${b.id}`, () => store.saveLorebook(b));
    return { id: b.id, name: b.name, detail: `${b.entries.length} entries · imported from ${file.name}` };
  }
  const imp = importCardJson(bytes);
  const c = Character.parse({ ...imp.character, id: newId() });
  await write(w, `character:${c.id}`, () => store.saveCharacter(c));
  const embedded = embeddedBookOf(c);
  let book: Lorebook | undefined;
  if (embedded) {
    book = Lorebook.parse({ id: newId(), ...lorebookFromCardBook(embedded, `${c.name}'s lorebook`, c.id) });
    const b = book;
    await write(w, `lorebook:${b.id}`, () => store.saveLorebook(b));
    await write(w, `character:${c.id} lore link`, () => store.saveCharacter({ ...c, lorebookIds: [...new Set([...c.lorebookIds, b.id])] }));
  }
  return { id: c.id, name: c.name, detail: `imported from ${file.name}${book ? ` · lorebook “${book.name}”` : ""}${imp.warnings.length ? ` · ${imp.warnings.join(" ")}` : ""}` };
}

/** New-item cards already hold arbitrary data; imports retain the attached source until the user's OK. */
export async function approveNew(store: SqlStore, r: Extract<AssistantResult, { type: "new" }>, newId: () => string) {
  const data = isObj(r.data) ? r.data : {};
  if ((r.kind === "character" || r.kind === "lorebook") && isObj(data.importFile))
    return importItem(store, r.kind, { name: str(data.importFile.name), text: str(data.importFile.text) }, newId);
  return createItem(store, r.kind, data, newId);
}

// ------------------------------------------------------------------ running a tool

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolOutcome> {
  let a: Obj;
  try { a = rawArgs.trim() ? (JSON.parse(rawArgs) as Obj) : {}; } catch { return { result: "Your arguments were not valid JSON. Try again.", label: `${name} (bad arguments)`, error: true }; }
  if (!isObj(a)) return { result: "Arguments must be an object.", label: name, error: true };
  const w: Writes = { signal: ctx.signal, completed: [] };
  try {
    ctx.signal?.throwIfAborted();
    switch (name) {
      case "find": {
        const kind = READ_KINDS.includes(str(a.kind) as AssistantReadKind) ? (str(a.kind) as AssistantReadKind) : undefined;
        const q = str(a.query);
        const folder = str(a.folder);
        return { result: await findItems(ctx.store, kind, q, typeof a.page === "number" ? a.page : 1, folder), label: `Looked for ${q ? `“${q}”` : "items"}${kind ? ` in ${kind}s` : ""}${folder ? ` in “${folder}”` : ""}` };
      }
      case "folders": {
        const kinds = inFolders(str(a.kind)) ? [str(a.kind) as FolderKind] : FOLDER_KINDS;
        const out: string[] = [];
        for (const k of kinds) {
          const { all, path } = await folderPaths(ctx.store, k);
          if (!all.length) continue;
          const map = Object.values(await ctx.store.folderMap(k));
          const lines = all.map((f) => `${path.get(f.id)} (${map.filter((x) => x === f.id).length})`).sort((x, y) => x.localeCompare(y));
          out.push(`${k}s:\n${lines.map((l) => `  ${l}`).join("\n")}`);
        }
        return { result: out.join("\n") || "No folders yet. `move` or `create` with a folder makes them.", label: "Looked at the folders" };
      }
      case "move": {
        const refs = strs(a.items);
        if (!refs.length) return { result: "Give the items as \"kind:id\".", label: "move", error: true };
        const { card, skipped } = await moveItems(ctx.store, refs, str(a.folder), ctx.newId, w);
        if (card.items.length) ctx.results.push(card);
        const where = card.folder || "the top (no folder)";
        return { result: `${card.items.length ? `Moved ${card.items.length} item(s) to ${where}.` : "Nothing moved."}${skipped.length ? ` Skipped: ${skipped.join("; ")}.` : ""}`, label: `Moved ${card.items.length} item(s) to “${where}”`, ...(card.items.length ? {} : { error: true }) };
      }
      case "read": {
        const ref = str(a.id);
        const res = await readItem(ctx.store, ref, strs(a.fields), typeof a.offset === "number" ? a.offset : 0);
        const r = splitRef(ref);
        const nm = r ? (await rows(ctx.store, r.kind)).find((x) => x.id === r.id)?.name : undefined;
        return { result: res, label: `Read ${nm ?? ref}${strs(a.fields).length ? ` (${strs(a.fields).join(", ")})` : ""}` };
      }
      case "guide": {
        const g = GUIDES[str(a.kind)];
        if (!g) return { result: `No guide for “${str(a.kind)}”.`, label: "guide", error: true };
        if (ctx.availableGuides?.has(g.kind)) return { result: `You already have the ${g.kind} guide earlier in this chat.`, label: `Guide: ${g.kind}` };
        ctx.guides.add(g.kind);
        (ctx.availableGuides ??= new Set()).add(g.kind);
        return { result: g.text, label: `Read the ${g.kind} guide` };
      }
      case "create": {
        const kind = str(a.kind) as AssistantKind;
        if (!WRITE_KINDS.includes(kind)) return { result: `Can't create a “${kind}”.`, label: "create", error: true };
        const data: Obj = { ...(isObj(a.data) ? a.data : {}), ...(str(a.folder) ? { folder: str(a.folder) } : {}) };
        if (!ctx.saveNew) {
          const bad = unknownKeys(data, kind);
          if (bad.length) throw new Error(`Unknown field(s) for a ${kind}: ${bad.join(", ")}. Call guide("${kind}").`);
          ctx.results.push({ type: "new", id: ctx.newId(), kind, name: str(data.name) || kind, data, status: "waiting" });
          return { result: "Prepared; the user will approve it before it is saved.", label: `Prepared a new ${kind}: ${str(data.name)}` };
        }
        const made = await createItem(ctx.store, kind, data, ctx.newId, w);
        ctx.results.push({ type: "created", kind, itemId: made.id, name: made.name, detail: made.detail, undone: false });
        return { result: `Created ${kind}:${made.id} (${made.detail}).`, label: `Created ${kind} “${made.name}”` };
      }
      case "change": {
        const r = splitRef(str(a.id));
        if (!r || !WRITE_KINDS.includes(r.kind as AssistantKind)) return { result: `Can't change “${str(a.id)}”.`, label: "change", error: true };
        const kind = r.kind as AssistantKind;
        const changes = isObj(a.changes) ? a.changes : {};
        if ("folder" in changes) throw new Error("Use `move` to put an item in a folder.");
        const bad = unknownKeys(changes, kind).filter((k) => !(kind === "character" && k === "picture"));
        if (bad.length) throw new Error(`Unknown field(s) for a ${kind}: ${bad.join(", ")}. Call guide("${kind}").`);
        if (!Object.keys(changes).length) throw new Error("No changes given.");
        const item = await getItem(ctx.store, kind, r.id);
        if (!item) throw new Error(`No ${kind} with id “${r.id}”.`);
        const nm = str(item.name);
        // check versions and cast now, so a mistake comes back to the model instead of failing when the user applies it
        if (kind === "character" && changes.variants !== undefined) { const c = Character.parse(item); variantsAfter(Character.parse({ ...c, ...charFields(changes) }), c.variants, changes.variants, ctx.newId); }
        if (kind === "kit" && changes.cast !== undefined) await castOf(ctx.store, changes.cast);
        ctx.results.push({ type: "change", id: ctx.newId(), kind, itemId: r.id, name: nm, summary: str(a.summary), before: currentOf(item, kind, changes), after: changes, status: "waiting" });
        return { result: "Proposed. It waits for the user's OK — don't assume it was applied.", label: `Proposed changes to “${nm}”` };
      }
      case "propose_trash": {
        const r = splitRef(str(a.id));
        if (!r || !WRITE_KINDS.includes(r.kind as AssistantKind)) return { result: `Can't move “${str(a.id)}”.`, label: "propose_trash", error: true };
        const item = await getItem(ctx.store, r.kind, r.id);
        if (!item) throw new Error(`No ${r.kind} with id “${r.id}”.`);
        ctx.results.push({ type: "trash", id: ctx.newId(), kind: r.kind as AssistantKind, itemId: r.id, name: str(item.name), reason: str(a.reason), status: "waiting" });
        return { result: "Proposed; the user decides.", label: `Proposed moving “${str(item.name)}” to the Trash` };
      }
      case "read_file": {
        const f = ctx.files.get(str(a.file));
        if (!f) return { result: `No attached file “${str(a.file)}”.`, label: "read_file", error: true };
        return { result: readPart(f.text, f.mime, { path: str(a.path) || undefined, lines: str(a.lines) || undefined, offset: typeof a.offset === "number" ? a.offset : undefined }), label: `Read ${f.name}${str(a.path) ? ` (${str(a.path)})` : str(a.lines) ? ` (lines ${str(a.lines)})` : ""}` };
      }
      case "import_file": {
        const f = ctx.files.get(str(a.file));
        if (!f) return { result: `No attached file “${str(a.file)}”.`, label: "import_file", error: true };
        const kind = str(a.as) === "character" ? "character" : "lorebook";
        if (!ctx.saveNew) {
          const bytes = new TextEncoder().encode(f.text);
          const name = kind === "character" ? importCardJson(bytes).character.name : importStLorebook(bytes, f.name).lorebook.name;
          ctx.results.push({ type: "new", id: ctx.newId(), kind, name, data: { name, importFile: { name: f.name, text: f.text } }, status: "waiting" });
          return { result: "Prepared; the user will approve it before it is saved.", label: `Prepared a new ${kind}: ${name}` };
        }
        const made = await importItem(ctx.store, kind, f, ctx.newId, w);
        ctx.results.push({ type: "created", kind, itemId: made.id, name: made.name, detail: made.detail, undone: false });
        return { result: `Imported as ${kind}:${made.id} (${made.detail}).`, label: `Imported “${made.name}”` };
      }
      case "set_picture": {
        const r = splitRef(str(a.id));
        const img = ctx.images.get(str(a.image));
        if (!r || r.kind !== "character") return { result: "Use a character:id.", label: "set_picture", error: true };
        if (!img) return { result: `No attached image “${str(a.image)}”.`, label: "set_picture", error: true };
        const c = await ctx.store.getCharacter(r.id);
        if (!c) throw new Error(`No character with id “${r.id}”.`);
        const v = str(a.variant) ? variantOf(c, str(a.variant)) : undefined;
        if (str(a.variant) && !v) throw new Error(`No version “${str(a.variant)}” of ${c.name}. Its versions: ${c.variants.map((x) => x.label).join(", ") || "none"}.`);
        ctx.results.push({ type: "change", id: ctx.newId(), kind: "character", itemId: c.id, name: c.name, summary: `Use “${img.name}” as the picture${v ? ` of ${v.label}` : ""}`, before: { picture: "" }, after: { picture: JSON.stringify({ mime: img.mime, base64: img.base64, ...(v ? { variantId: v.id } : {}) }) }, status: "waiting" });
        return { result: "Proposed; the user decides.", label: `Proposed a picture for “${c.name}${v ? ` · ${v.label}` : ""}”` };
      }
      case "remember": {
        const text = str(a.text).trim();
        if (!text) return { result: "Nothing to remember.", label: "remember", error: true };
        await ctx.remember(text);
        ctx.results.push({ type: "memory", text });
        return { result: "Remembered.", label: "Remembered something" };
      }
    }
    return { result: `There is no tool “${name}”.`, label: name, error: true };
  } catch (e) {
    return { result: `Error: ${e instanceof Error ? e.message : String(e)}${w.completed?.length ? ` Completed writes: ${w.completed.join(", ")}.` : ""}`, label: `${name} failed`, error: true };
  }
}

