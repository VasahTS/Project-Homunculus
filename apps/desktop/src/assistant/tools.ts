// Homunculus 2 — the Assistant's tools (D-062). Author: CLAUDE, 2026-11-01.
//
// Few, general tools (one `create` with a `kind`, not one per kind): their definitions go in every request, so fewer
// tools = fewer tokens. Items are named "kind:id" everywhere. Nothing here deletes: `change` and `propose_trash` make
// proposals the user approves (applyResult); `create` saves right away unless the user turned that off.
//
// Token rules: `find` returns one short line per item (25 per page); `read` returns only what was asked, long texts
// cut with "read more" hints; lorebooks are read as an index first, entries by page or by title.
import { Character, LoreEntry, Lorebook, Narrator, Story, type AssistantKind, type AssistantReadKind, type AssistantResult } from "@homunculus/schemas";
import type { SqlStore, ToolSpec } from "@homunculus/core";
import { importCardJson } from "@homunculus/st-cards";
import { adoptEmbeddedLorebook, importStLorebook } from "@homunculus/st-lorebooks";
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

export interface ToolContext {
  store: SqlStore;
  saveNew: boolean;
  newId: () => string;
  /** Files and images attached anywhere in this chat, by id. */
  files: Map<string, { name: string; text: string; mime: string }>;
  images: Map<string, { name: string; mime: string; base64: string }>;
  /** Cards for this reply. */
  results: AssistantResult[];
  /** Guides already given in this chat. */
  guides: Set<string>;
  remember: (text: string) => Promise<void>;
}

export interface ToolOutcome { result: string; label: string; error?: boolean }

// ------------------------------------------------------------------ definitions

const kindProp = (kinds: readonly string[], d: string) => ({ type: "string", enum: kinds, description: d });
export const TOOL_SPECS: ToolSpec[] = [
  { name: "find", description: "Find items in the user's library. Returns one short line per item (\"kind:id · name — summary\"), 25 per page. Use a query whenever you know a name or topic.",
    parameters: { type: "object", properties: { kind: kindProp(READ_KINDS, "Only this kind (optional)."), query: { type: "string", description: "Words in the name or summary (optional)." }, page: { type: "number", description: "Page, from 1." } } } },
  { name: "read", description: "Read one item (\"kind:id\" from find). Without `fields`, returns the item with long texts cut; a lorebook returns its entry index. Ask for `fields` to read only those, `offset` to continue a long text. For a lorebook, fields [\"entries\"] pages through entries (10 a page, use `offset` = entry number) and [\"entry:<title or id>\"] reads one.",
    parameters: { type: "object", properties: { id: { type: "string" }, fields: { type: "array", items: { type: "string" } }, offset: { type: "number" } }, required: ["id"] } },
  { name: "guide", description: "How to write one kind of item well, and the exact fields `create`/`change` accept. Call once per kind per chat before writing it.",
    parameters: { type: "object", properties: { kind: kindProp(WRITE_KINDS, "") }, required: ["kind"] } },
  { name: "create", description: "Create a new item. `data` uses the fields from `guide`. Saved right away (the user can undo) unless the user asked to approve new items.",
    parameters: { type: "object", properties: { kind: kindProp(WRITE_KINDS, ""), data: { type: "object" } }, required: ["kind", "data"] } },
  { name: "change", description: "Propose changes to an existing item: only the fields that change, with their new values. The user approves or discards it. `summary`: one line on what and why.",
    parameters: { type: "object", properties: { id: { type: "string" }, changes: { type: "object" }, summary: { type: "string" } }, required: ["id", "changes"] } },
  { name: "propose_trash", description: "Propose moving an item to the Trash (the user decides). You never delete.",
    parameters: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] } },
  { name: "read_file", description: "Read part of a file the user attached (id from the message). JSON: a `path` like \"data.description\" or \"entries.12\"; text/JSONL: `lines` like \"1-40\"; or `offset` for the next chunk.",
    parameters: { type: "object", properties: { file: { type: "string" }, path: { type: "string" }, lines: { type: "string" }, offset: { type: "number" } }, required: ["file"] } },
  { name: "import_file", description: "Turn an attached SillyTavern card or lorebook file into a library item (as the app's own import does). Then use `change` to edit it.",
    parameters: { type: "object", properties: { file: { type: "string" }, as: { type: "string", enum: ["character", "lorebook"] } }, required: ["file", "as"] } },
  { name: "set_picture", description: "Propose an attached image as a character's picture.",
    parameters: { type: "object", properties: { id: { type: "string", description: "character:id" }, image: { type: "string", description: "The image id from the message." } }, required: ["id", "image"] } },
  { name: "remember", description: "Remember a lasting fact or preference of the user for future chats (they can see and edit it).",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
];

// ------------------------------------------------------------------ the library, read lightly

interface Row { kind: AssistantReadKind; id: string; name: string; line: string }

async function rows(store: SqlStore, kind: AssistantReadKind): Promise<Row[]> {
  switch (kind) {
    case "character": return (await store.listCharacters()).map((c) => ({ kind, id: c.id, name: c.name, line: one(c.description || c.personality || c.tags.join(", ")) }));
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
function compact(v: unknown, path: string): unknown {
  if (typeof v === "string") return v.length > LONG ? `${v.slice(0, LONG)} …(${(v.length - LONG).toLocaleString("en")} more characters: read with fields ["${path}"] and offset ${LONG})` : v;
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
  if (fields.length) {
    const out: Obj = {};
    for (const f of fields) {
      let v: unknown = item;
      for (const k of f.split(".")) v = Array.isArray(v) ? v[Number(k)] : isObj(v) ? v[k] : undefined;
      if (typeof v === "string" && offset) v = v.slice(offset, offset + LONG * 2);
      out[f] = v === undefined ? "(no such field)" : compact(v, f);
    }
    return JSON.stringify(out);
  }
  const view = compact(item, "") as Obj;
  if (r.kind === "character" && Array.isArray((item as Obj).variants)) view.variants = ((item as Obj).variants as Obj[]).map((x) => str(x.label));
  return JSON.stringify(view);
}

async function findItems(store: SqlStore, kind: AssistantReadKind | undefined, query: string, page: number): Promise<string> {
  const kinds = kind ? [kind] : READ_KINDS;
  let all: Row[] = [];
  for (const k of kinds) all = all.concat(await rows(store, k));
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
  return `${shown.map((r) => `${r.kind}:${r.id} · ${r.name}${r.line ? ` — ${r.line}` : ""}`).join("\n")}${all.length > from + 25 ? `\n(${all.length - from - 25} more; page ${Math.floor(from / 25) + 2})` : ""}`;
}

// ------------------------------------------------------------------ writing

const pick = (data: Obj, keys: string[]) => Object.fromEntries(Object.entries(data).filter(([k]) => keys.includes(k)));
const unknownKeys = (data: Obj, kind: string) => Object.keys(data).filter((k) => !GUIDES[kind]!.fields.includes(k));

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

function kitOf(data: Obj, id: string, base?: Obj): Story {
  const prev = (base ?? {}) as Obj;
  const lore = strs(data.lorebookIds).map((x) => splitRef(x)?.id ?? x);
  const narratorId = str(data.narratorId);
  return Story.parse({
    ...prev, id, createdAt: typeof prev.createdAt === "number" ? prev.createdAt : Date.now(),
    ...pick(data, ["name", "description", "scenario", "openings", "userRole"]),
    ...(data.cast !== undefined ? { cast: strs(data.cast).map((c) => ({ characterId: splitRef(c)?.id ?? c })) } : {}),
    ...(data.npcIds !== undefined ? { npcIds: strs(data.npcIds).map((x) => splitRef(x)?.id ?? x) } : {}),
    ...(narratorId ? { narrator: { kind: "vault", id: splitRef(narratorId)?.id ?? narratorId } } : {}),
    ...(data.lorebookIds !== undefined ? { setup: { ...(isObj(prev.setup) ? prev.setup : {}), lorebooks: { mode: "add", add: lore, remove: [] } } } : {}),
  });
}

/** Saves a new item. Returns its id and a one-line detail. Throws a readable error when the data is wrong. */
export async function createItem(store: SqlStore, kind: AssistantKind, data: Obj, newId: () => string): Promise<{ id: string; name: string; detail: string }> {
  const bad = unknownKeys(data, kind);
  if (bad.length) throw new Error(`Unknown field(s) for a ${kind}: ${bad.join(", ")}. Call guide("${kind}").`);
  const name = str(data.name).trim();
  if (!name) throw new Error(`A ${kind} needs a name.`);
  switch (kind) {
    case "character": {
      const c = await store.saveCharacter(Character.parse({ ...pick(data, GUIDES.character!.fields), id: newId() }));
      return { id: c.id, name: c.name, detail: `${c.firstMessages.length} first message(s)` };
    }
    case "lorebook": {
      const entries = (Array.isArray(data.entries) ? data.entries.filter(isObj) : []).map((e) => loreEntryOf(e, newId));
      const b = await store.saveLorebook(Lorebook.parse({ id: newId(), name, description: str(data.description), entries }));
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
      const saved = await saveTracker(store, d);
      return { id: saved.id, name: saved.name, detail: `${saved.sets[0]!.fields.length} fields` };
    }
    case "kit": {
      const k = await store.kits.save(kitOf(data, newId()));
      return { id: k.id, name: k.name, detail: `${k.cast.length} in the cast · ${k.openings.length} opening(s)` };
    }
    case "narrator": {
      const n = await store.saveNarrator(narratorOf(data, newId()));
      return { id: n.id, name: n.name, detail: n.about || "narrator" };
    }
  }
}

/** The fields a change touches, as they are now (for the card and to notice later edits). */
function currentOf(item: Obj, kind: AssistantKind, changes: Obj): Obj {
  const out: Obj = {};
  for (const k of Object.keys(changes)) {
    if (kind === "lorebook" && k === "entries") {
      const ops = isObj(changes.entries) ? changes.entries : {};
      const entries = (Array.isArray(item.entries) ? item.entries : []) as LoreEntry[];
      const touched = [...(Array.isArray(ops.update) ? ops.update.filter(isObj) : []).map((u) => str(u.id) || str(u.title)), ...strs(ops.remove)];
      out.entries = entries.filter((e) => touched.some((t) => t === e.id || t.toLowerCase() === e.title.toLowerCase())).map(entryFull);
    } else out[k] = item[k] ?? "";
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
      if (typeof ch.picture === "string") {
        const { mime, base64 } = JSON.parse(ch.picture) as { mime: string; base64: string };
        await store.setAvatar(r.itemId, { mime, base64 });
      }
      const { picture: _p, ...rest } = ch;
      if (Object.keys(rest).length) await store.saveCharacter(Character.parse({ ...item, ...pick(rest, GUIDES.character!.fields) }));
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
    case "kit": await store.kits.save(kitOf(ch, r.itemId, item)); break;
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

// ------------------------------------------------------------------ running a tool

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolOutcome> {
  let a: Obj;
  try { a = rawArgs.trim() ? (JSON.parse(rawArgs) as Obj) : {}; } catch { return { result: "Your arguments were not valid JSON. Try again.", label: `${name} (bad arguments)`, error: true }; }
  if (!isObj(a)) return { result: "Arguments must be an object.", label: name, error: true };
  try {
    switch (name) {
      case "find": {
        const kind = READ_KINDS.includes(str(a.kind) as AssistantReadKind) ? (str(a.kind) as AssistantReadKind) : undefined;
        const q = str(a.query);
        return { result: await findItems(ctx.store, kind, q, typeof a.page === "number" ? a.page : 1), label: `Looked for ${q ? `“${q}”` : "items"}${kind ? ` in ${kind}s` : ""}` };
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
        if (ctx.guides.has(g.kind)) return { result: `You already have the ${g.kind} guide earlier in this chat.`, label: `Guide: ${g.kind}` };
        ctx.guides.add(g.kind);
        return { result: g.text, label: `Read the ${g.kind} guide` };
      }
      case "create": {
        const kind = str(a.kind) as AssistantKind;
        if (!WRITE_KINDS.includes(kind)) return { result: `Can't create a “${kind}”.`, label: "create", error: true };
        const data = isObj(a.data) ? a.data : {};
        if (!ctx.saveNew) {
          const bad = unknownKeys(data, kind);
          if (bad.length) throw new Error(`Unknown field(s) for a ${kind}: ${bad.join(", ")}. Call guide("${kind}").`);
          ctx.results.push({ type: "new", id: ctx.newId(), kind, name: str(data.name) || kind, data, status: "waiting" });
          return { result: "Prepared; the user will approve it before it is saved.", label: `Prepared a new ${kind}: ${str(data.name)}` };
        }
        const made = await createItem(ctx.store, kind, data, ctx.newId);
        ctx.results.push({ type: "created", kind, itemId: made.id, name: made.name, detail: made.detail, undone: false });
        return { result: `Created ${kind}:${made.id} (${made.detail}).`, label: `Created ${kind} “${made.name}”` };
      }
      case "change": {
        const r = splitRef(str(a.id));
        if (!r || !WRITE_KINDS.includes(r.kind as AssistantKind)) return { result: `Can't change “${str(a.id)}”.`, label: "change", error: true };
        const kind = r.kind as AssistantKind;
        const changes = isObj(a.changes) ? a.changes : {};
        const bad = unknownKeys(changes, kind).filter((k) => !(kind === "character" && k === "picture"));
        if (bad.length) throw new Error(`Unknown field(s) for a ${kind}: ${bad.join(", ")}. Call guide("${kind}").`);
        if (!Object.keys(changes).length) throw new Error("No changes given.");
        const item = await getItem(ctx.store, kind, r.id);
        if (!item) throw new Error(`No ${kind} with id “${r.id}”.`);
        const nm = str(item.name);
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
        const bytes = new TextEncoder().encode(f.text);
        if (str(a.as) === "character") {
          const imp = importCardJson(bytes);
          const c = await ctx.store.saveCharacter({ ...imp.character, id: ctx.newId() });
          const book = await adoptEmbeddedLorebook(ctx.store, c, ctx.newId).catch(() => undefined);
          ctx.results.push({ type: "created", kind: "character", itemId: c.id, name: c.name, detail: `imported from ${f.name}${book ? ` · lorebook “${book.name}”` : ""}`, undone: false });
          return { result: `Imported as character:${c.id}${book ? ` with its lorebook lorebook:${book.id}` : ""}.${imp.warnings.length ? ` Notes: ${imp.warnings.join(" ")}` : ""}`, label: `Imported “${c.name}”` };
        }
        const imp = importStLorebook(bytes, f.name);
        const b = await ctx.store.saveLorebook({ ...imp.lorebook, id: ctx.newId() });
        ctx.results.push({ type: "created", kind: "lorebook", itemId: b.id, name: b.name, detail: `${b.entries.length} entries · imported from ${f.name}`, undone: false });
        return { result: `Imported as lorebook:${b.id} (${b.entries.length} entries).`, label: `Imported “${b.name}”` };
      }
      case "set_picture": {
        const r = splitRef(str(a.id));
        const img = ctx.images.get(str(a.image));
        if (!r || r.kind !== "character") return { result: "Use a character:id.", label: "set_picture", error: true };
        if (!img) return { result: `No attached image “${str(a.image)}”.`, label: "set_picture", error: true };
        const c = await ctx.store.getCharacter(r.id);
        if (!c) throw new Error(`No character with id “${r.id}”.`);
        ctx.results.push({ type: "change", id: ctx.newId(), kind: "character", itemId: c.id, name: c.name, summary: `Use “${img.name}” as the picture`, before: { picture: "" }, after: { picture: JSON.stringify({ mime: img.mime, base64: img.base64 }) }, status: "waiting" });
        return { result: "Proposed; the user decides.", label: `Proposed a picture for “${c.name}”` };
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
    return { result: `Error: ${e instanceof Error ? e.message : String(e)}`, label: `${name} failed`, error: true };
  }
}

