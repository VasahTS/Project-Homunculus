// Homunculus 2 — Homunculus files: exporting and importing narrators, NPCs, stories, Kits, agents (trackers too) and
// Directors (D-094). Author: CLAUDE, 2026-11-07. Daniel: "make it possible to export/import narrators, stories, kits
// etc." … "agents too".
//
// One file format for all of them ("homunculus-bundle"): the things you picked (`roots`) plus everything they need to
// work on another install — a story brings its narrator, NPCs, cards, lorebooks, preset, agents and their field sets,
// and the Director it uses; an agent brings the agents it reads and a tracker its field sets. Pictures come along.
//
// Never in the file: connections (and their keys), your personas, chats, folders. Importing never changes anything you
// already have:
//  - something already here with the same id is used as it is (a card a story uses, a built-in agent…);
//  - a picked item that is already here but different comes in as a copy beside it ("(imported)");
//  - ids are kept when they are free, so moving between installs keeps every link; taken ids get new ones and every
//    link inside the file follows them.
// Links to things the file doesn't carry and this install doesn't have (a connection, a persona, an agent that was
// left out) are dropped, so the story falls back to your Default setup for them.
import { z } from "zod";
import {
  AgentConfig, Avatar, Character, Kit, Lorebook, Narrator, Npc, Preset, Story, TrackerSchema,
  type ListOverride, type SetupLayer,
} from "@homunculus/schemas";
import { cleanProfile, directorLinks, directorProfiles, saveDirectorLinks, saveDirectorProfiles, type DirectorProfile } from "./director.ts";
import type { ExportedFile } from "./extensions.ts";
import type { SqlStore } from "./storage/store.ts";

export const BUNDLE_FORMAT = "homunculus-bundle";
export const BUNDLE_VERSION = 1;
/** The file name ends like this, so the files are easy to tell apart from SillyTavern's. */
export const BUNDLE_EXT = ".h2.json";

export type BundleKind = "narrator" | "npc" | "story" | "kit" | "agent" | "director";
export interface BundleRoot { kind: BundleKind; id: string }

export interface HomunculusBundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  exportedAt: string;
  roots: BundleRoot[];
  characters: Character[];
  lorebooks: Lorebook[];
  presets: Preset[];
  narrators: Narrator[];
  npcs: Npc[];
  stories: Story[];
  kits: Kit[];
  agents: AgentConfig[];
  trackerSchemas: TrackerSchema[];
  directors: DirectorProfile[];
  /** Story id → the Director it uses (Library → Directors). */
  directorLinks: Record<string, string>;
  /** Pictures by owner id ("<id>" and "<id>#<variant>", like the store keeps them). */
  avatars: Record<string, Avatar>;
}

const KINDS = ["narrator", "npc", "story", "kit", "agent", "director"] as const;
const BundleFile = z.object({
  format: z.literal(BUNDLE_FORMAT),
  version: z.number().int(),
  exportedAt: z.string().default(""),
  roots: z.array(z.object({ kind: z.enum(KINDS), id: z.string().min(1) })).default([]),
  characters: z.array(Character).default([]),
  lorebooks: z.array(Lorebook).default([]),
  presets: z.array(Preset).default([]),
  narrators: z.array(Narrator).default([]),
  npcs: z.array(Npc).default([]),
  stories: z.array(Story).default([]),
  kits: z.array(Kit).default([]),
  agents: z.array(AgentConfig).default([]),
  trackerSchemas: z.array(TrackerSchema).default([]),
  directors: z.array(z.unknown()).default([]),
  directorLinks: z.record(z.string(), z.string()).default({}),
  avatars: z.record(z.string(), Avatar).default({}),
});

const KIND_WORD: Record<BundleKind, string> = { narrator: "narrator", npc: "NPC", story: "story", kit: "Kit", agent: "agent", director: "Director" };

// ------------------------------------------------------------------------------------------------ export

/** What a story or Kit points to, in its setup (preset, lorebooks, agents and the field sets they use). */
function setupLinks(layer: SetupLayer) {
  const ids = (o?: ListOverride) => (o && o.mode !== "keep" ? o.add : []);
  return {
    presetIds: layer.presetId ? [layer.presetId] : [],
    lorebookIds: ids(layer.lorebooks),
    agentIds: [...ids(layer.agents), ...Object.keys(layer.agentOverrides ?? {})],
    schemaIds: Object.values(layer.agentOverrides ?? {}).flatMap((o) => (o.schemaId ? [o.schemaId] : [])),
  };
}

/** Everything the picked items need, read from storage. Throws when a picked item doesn't exist. */
export async function collectBundle(store: SqlStore, roots: BundleRoot[]): Promise<HomunculusBundle> {
  const b: HomunculusBundle = {
    format: BUNDLE_FORMAT, version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), roots: [],
    characters: [], lorebooks: [], presets: [], narrators: [], npcs: [], stories: [], kits: [], agents: [], trackerSchemas: [],
    directors: [], directorLinks: {}, avatars: {},
  };
  const seen = new Set<string>();
  const once = (kind: string, id: string) => { const k = `${kind}:${id}`; if (seen.has(k)) return false; seen.add(k); return true; };
  const pictures = async (id: string) => Object.assign(b.avatars, await store.getAvatarsFor(id));
  const allSchemas = await store.trackerSchemas.list();
  const directors = await directorProfiles(store);
  const links = await directorLinks(store);

  const lorebook = async (id: string) => {
    if (!once("lorebook", id)) return;
    const x = await store.lorebooks.get(id);
    if (x) b.lorebooks.push(x);
  };
  const character = async (id: string) => {
    if (!once("character", id)) return;
    const c = await store.getCharacter(id);
    if (!c) return;
    b.characters.push(c);
    await pictures(c.id);
    for (const l of c.lorebookIds) await lorebook(l);
  };
  const schema = async (id: string) => {
    if (!once("schema", id)) return;
    const s = allSchemas.find((x) => x.id === id) ?? await store.trackerSchemas.get(id);
    if (s) b.trackerSchemas.push(s);
  };
  const agent = async (id: string) => {
    if (!once("agent", id)) return;
    const a = await store.agentConfigs.get(id);
    if (!a) return;
    b.agents.push(a);
    if (a.state?.schemaId) await schema(a.state.schemaId);
    for (const s of allSchemas) if (s.trackerId === a.id) await schema(s.id);
    for (const r of a.input.readsAgents) await agent(r);
  };
  const narrator = async (id: string) => {
    if (!once("narrator", id)) return;
    const n = await store.narrators.get(id);
    if (!n) return;
    b.narrators.push(n);
    await pictures(n.id);
  };
  const npc = async (id: string) => {
    if (!once("npc", id)) return;
    const n = await store.npcs.get(id);
    if (!n) return;
    b.npcs.push(n);
    await pictures(n.id);
    await schema(n.schemaId);
  };
  const director = (id: string) => {
    if (!once("director", id)) return;
    const d = directors.find((x) => x.id === id);
    if (d) b.directors.push(d);
  };
  const storyLike = async (st: Story, into: Story[]) => {
    into.push(st);
    await pictures(st.id);
    if (st.narrator.kind === "vault") await narrator(st.narrator.id);
    if (st.narrator.kind === "card") await character(st.narrator.characterId);
    for (const id of st.npcIds) await npc(id);
    for (const m of st.cast) if (m.characterId) await character(m.characterId);
    const l = setupLinks(st.setup);
    for (const id of l.presetIds) {
      if (!once("preset", id)) continue;
      const p = await store.presets.get(id);
      if (p) b.presets.push(p);
    }
    for (const id of [...l.lorebookIds, ...Object.keys(st.lorePatches)]) await lorebook(id);
    for (const id of l.agentIds) await agent(id);
    for (const id of l.schemaIds) await schema(id);
  };

  for (const r of roots) {
    if (!once(`root-${r.kind}`, r.id)) continue;
    const missing = () => new Error(`This ${KIND_WORD[r.kind]} was not found. It may have been deleted.`);
    if (r.kind === "narrator") { if (!await store.narrators.get(r.id)) throw missing(); await narrator(r.id); }
    else if (r.kind === "npc") { if (!await store.npcs.get(r.id)) throw missing(); await npc(r.id); }
    else if (r.kind === "agent") { if (!await store.agentConfigs.get(r.id)) throw missing(); await agent(r.id); }
    else if (r.kind === "director") { if (!directors.some((d) => d.id === r.id)) throw missing(); director(r.id); }
    else if (r.kind === "story") {
      const st = await store.getStory(r.id);
      if (!st) throw missing();
      if (!once("story", st.id)) continue;
      await storyLike(st, b.stories);
      // its own NPCs that live in its folder come too, even when it doesn't use them right now
      for (const n of await store.npcs.list()) if (n.storyId === st.id) await npc(n.id);
      const d = links.stories[st.id];
      if (d && directors.some((x) => x.id === d)) { director(d); b.directorLinks[st.id] = d; }
    } else {
      const k = await store.kits.get(r.id);
      if (!k) throw missing();
      if (!once("kit", k.id)) continue;
      await storyLike(k, b.kits);
      for (const n of await store.npcs.list()) if (n.storyId === k.id) await npc(n.id);
    }
    b.roots.push(r);
  }
  return b;
}

/** The file to save: "<name>.h2.json". */
export function bundleFile(bundle: HomunculusBundle, name: string): ExportedFile {
  const safe = name.normalize("NFC").replace(/[^\p{L}\p{N}_ -]+/gu, "-").trim().replace(/\s+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "") || "homunculus";
  return { fileName: `${safe}${BUNDLE_EXT}`, mime: "application/json", bytes: new TextEncoder().encode(JSON.stringify(bundle, null, 2)) };
}

/** The picked items' names, for the file name and messages. */
export function bundleTitle(bundle: HomunculusBundle): string {
  const names = bundle.roots.map((r) => rootName(bundle, r)).filter(Boolean);
  return names.length === 1 ? names[0]! : names.length ? `${names[0]} and ${names.length - 1} more` : "Homunculus";
}

function rootName(bundle: HomunculusBundle, r: BundleRoot): string {
  const list: Array<{ id: string; name: string }> = r.kind === "narrator" ? bundle.narrators : r.kind === "npc" ? bundle.npcs : r.kind === "story" ? bundle.stories
    : r.kind === "kit" ? bundle.kits : r.kind === "agent" ? bundle.agents : bundle.directors;
  return list.find((x) => x.id === r.id)?.name ?? "";
}

// ------------------------------------------------------------------------------------------------ reading a file

/** True when the text looks like a Homunculus file (so an Import button can tell it from SillyTavern's files). */
export function isBundleText(text: string): boolean {
  return /^\s*\{[\s\S]{0,200}"format"\s*:\s*"homunculus-bundle"/.test(text);
}

/** Reads and checks a Homunculus file. Throws a plain-language error when it can't be used. */
export function parseBundle(text: string): HomunculusBundle {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("This file is not valid JSON."); }
  const r = raw as { format?: unknown; version?: unknown } | null;
  if (r?.format === "homunculus-chat") throw new Error("This is a Homunculus chat, not a Library file.");
  if (!r || r.format !== BUNDLE_FORMAT) throw new Error("This is not a Homunculus file (narrators, NPCs, stories, Kits, agents, trackers or Directors).");
  if (typeof r.version === "number" && r.version > BUNDLE_VERSION) throw new Error("This file was made by a newer Homunculus. Update the app to import it.");
  const parsed = BundleFile.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Part of this file can't be read${issue ? ` (${issue.path.join(".")}: ${issue.message})` : ""}.`);
  }
  return { ...parsed.data, format: BUNDLE_FORMAT, directors: parsed.data.directors.map(cleanProfile) };
}

// ------------------------------------------------------------------------------------------------ import

export interface BundleImportResult {
  /** The picked items as they are now in this install (new ids when they came in as copies). */
  roots: Array<BundleRoot & { name: string; /** "narrator", "tracker", "agent"… */ what: string }>;
  /** How many of each were added, e.g. { character: 2, lorebook: 1 }. */
  added: Record<string, number>;
  /** Of `added`, the ones that came along with the picked items (cards, lorebooks…). */
  withThem: Record<string, number>;
  /** How many were already here and used as they are. */
  reused: Record<string, number>;
  /** Plain-language notes: what was left out and why. */
  notes: string[];
}

type Table = "character" | "lorebook" | "preset" | "narrator" | "npc" | "story" | "kit" | "agent" | "schema" | "director";

const newId = (old: string, table: Table) => {
  const u = crypto.randomUUID();
  if (table === "agent") return `agent-${u}`;
  if (table === "schema") return `set-${u}`;
  return /^[a-z]+-[0-9a-f-]{36}$/i.test(old) ? `${old.slice(0, old.indexOf("-"))}-${u}` : u;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Adds a Homunculus file's contents to this install (see the top of this file for the rules). `fileName` is recorded as
 * where the imported agents came from.
 */
export async function importBundle(store: SqlStore, bundle: HomunculusBundle, fileName = ""): Promise<BundleImportResult> {
  const result: BundleImportResult = { roots: [], added: {}, withThem: {}, reused: {}, notes: [] };
  const count = (into: Record<string, number>, k: string) => { into[k] = (into[k] ?? 0) + 1; };
  const rootKey = new Set(bundle.roots.map((r) => `${r.kind}:${r.id}`));

  // What this install has: alive (not in the Trash) and anything with that id (the Trash too).
  const [characters, lorebooks, presets, narrators, npcs, stories, kits, agents, schemas, connections, personas] = await Promise.all([
    store.listCharacters(), store.lorebooks.list(), store.presets.list(), store.narrators.list(), store.npcs.list(), store.stories.list(),
    store.kits.list(), store.agentConfigs.list(), store.trackerSchemas.list(), store.connections.list(), store.personas.list(),
  ]);
  const directors = await directorProfiles(store);
  const alive: Record<Table, Map<string, unknown>> = {
    character: new Map(characters.map((x) => [x.id, x])), lorebook: new Map(lorebooks.map((x) => [x.id, x])), preset: new Map(presets.map((x) => [x.id, x])),
    narrator: new Map(narrators.map((x) => [x.id, x])), npc: new Map(npcs.map((x) => [x.id, x])), story: new Map(stories.map((x) => [x.id, x])),
    kit: new Map(kits.map((x) => [x.id, x])), agent: new Map(agents.map((x) => [x.id, x])), schema: new Map(schemas.map((x) => [x.id, x])),
    director: new Map(directors.map((x) => [x.id, x])),
  };
  const anyWithId = async (t: Table, id: string): Promise<boolean> => {
    if (alive[t].has(id)) return true;
    if (t === "character") return !!await store.getCharacter(id);
    const table = { lorebook: store.lorebooks, preset: store.presets, narrator: store.narrators, npc: store.npcs, story: store.stories, kit: store.kits, agent: store.agentConfigs, schema: store.trackerSchemas }[t as Exclude<Table, "character" | "director">];
    return table ? !!await table.get(id) : false;
  };

  // 1. Decide every item's id here: the same one, a new one, or "already here, use it".
  const map: Record<Table, Map<string, string>> = { character: new Map(), lorebook: new Map(), preset: new Map(), narrator: new Map(), npc: new Map(), story: new Map(), kit: new Map(), agent: new Map(), schema: new Map(), director: new Map() };
  const keep: Record<Table, Set<string>> = { character: new Set(), lorebook: new Set(), preset: new Set(), narrator: new Set(), npc: new Set(), story: new Set(), kit: new Set(), agent: new Set(), schema: new Set(), director: new Set() };
  /** `root`: a picked item (or part of one): reused only when it is the same as the one here, else a copy. `fresh`: always
   * its own copy (a field set of a tracker that comes in as a copy). `reuse`: the one here is used whatever it holds. */
  const plan = async <T extends { id: string }>(t: Table, items: T[], how: (x: T) => "root" | "dependency" | "reuse" | "fresh") => {
    for (const x of items) {
      const here = alive[t].get(x.id);
      const h = how(x);
      if (here && h !== "fresh" && (h !== "root" || same(here, x))) { map[t].set(x.id, x.id); keep[t].add(x.id); continue; }
      map[t].set(x.id, here || await anyWithId(t, x.id) ? newId(x.id, t) : x.id);
    }
  };
  const isRoot = (kind: BundleKind, id: string) => rootKey.has(`${kind}:${id}`);
  await plan("character", bundle.characters, () => "dependency");
  await plan("lorebook", bundle.lorebooks, () => "dependency");
  await plan("preset", bundle.presets, () => "dependency");
  await plan("narrator", bundle.narrators, (x) => (isRoot("narrator", x.id) ? "root" : x.builtin ? "reuse" : "dependency"));
  await plan("npc", bundle.npcs, (x) => (isRoot("npc", x.id) || (!!x.storyId && (isRoot("story", x.storyId) || isRoot("kit", x.storyId))) ? "root" : "dependency"));
  await plan("story", bundle.stories, () => "root");
  await plan("kit", bundle.kits, () => "root");
  // agents that run a module's code are never copied: the one here is used (and must exist). Starter agents are data.
  await plan("agent", bundle.agents, (x) => (x.runMode === "code" ? "reuse" : isRoot("agent", x.id) ? "root" : "dependency"));
  // a tracker's field sets follow it: its own copy when it comes in as a copy
  await plan("schema", bundle.trackerSchemas, (x) => (x.trackerId && map.agent.has(x.trackerId) && map.agent.get(x.trackerId) !== x.trackerId ? "fresh" : "dependency"));
  await plan("director", bundle.directors, (x) => (isRoot("director", x.id) || Object.values(bundle.directorLinks).includes(x.id) ? "root" : "dependency"));
  // a built-in or code agent that this install doesn't have can't run here
  const unusable = bundle.agents.filter((a) => a.runMode === "code" && !alive.agent.has(a.id));
  for (const a of unusable) { map.agent.delete(a.id); result.notes.push(`Left out the agent “${a.name}”: it comes with another version of Homunculus.`); }

  const to = (t: Table, id: string) => map[t].get(id) ?? (alive[t].has(id) ? id : undefined);
  const list = (t: Table, ids: string[]) => ids.flatMap((id) => { const x = to(t, id); return x ? [x] : []; });
  const connectionHere = new Set(connections.map((c) => c.id));
  const personaHere = new Set(personas.map((p) => p.id));
  let droppedConnections = false;
  const connection = <T extends string | null | undefined>(id: T): T | undefined => {
    if (!id || connectionHere.has(id)) return id;
    droppedConnections = true;
    return undefined;
  };

  // 2. Write everything with its links pointing at the ids decided above.
  const write = async <T extends { id: string; name: string }>(t: Table, items: T[], label: string, save: (x: T) => Promise<unknown>, fix: (x: T) => T) => {
    for (const x of items) {
      const id = map[t].get(x.id);
      if (!id) continue;
      if (keep[t].has(x.id)) { count(result.reused, label); continue; }
      const copy = id !== x.id && alive[t].has(x.id);
      const out = fix({ ...structuredClone(x), id, ...(copy ? { name: `${x.name} (imported)` } : {}) });
      await save(out);
      for (const [owner, picture] of Object.entries(bundle.avatars)) {
        if (owner === x.id || owner.startsWith(`${x.id}#`)) await store.setAvatar(`${id}${owner.slice(x.id.length)}`, picture);
      }
      count(result.added, label);
      if (!rootKey.has(`${t}:${x.id}`)) count(result.withThem, label);
    }
  };

  const fixSetup = (layer: SetupLayer): SetupLayer => {
    const s: SetupLayer = structuredClone(layer);
    const listOf = (o: ListOverride | undefined, t: Table): ListOverride | undefined => o && { ...o, add: list(t, o.add), remove: list(t, o.remove) };
    if (s.presetId) { const p = to("preset", s.presetId); if (p) s.presetId = p; else delete s.presetId; }
    if (s.presetOverrides) s.presetOverrides = Object.fromEntries(Object.entries(s.presetOverrides).flatMap(([k, v]) => { const p = to("preset", k); return p ? [[p, v]] : []; }));
    if (s.personaId && !personaHere.has(s.personaId)) { delete s.personaId; delete s.personaVariantId; }
    if (s.connectionId !== undefined) { const c = connection(s.connectionId); if (c === undefined) delete s.connectionId; else s.connectionId = c; }
    if (s.agentConnectionId !== undefined) { const c = connection(s.agentConnectionId); if (c === undefined) delete s.agentConnectionId; else s.agentConnectionId = c; }
    if (s.memory) {
      if (s.memory.summaryConnectionId !== undefined) { const c = connection(s.memory.summaryConnectionId); if (c === undefined) delete s.memory.summaryConnectionId; else s.memory.summaryConnectionId = c; }
      if (s.memory.deciderConnectionId !== undefined && !connection(s.memory.deciderConnectionId)) delete s.memory.deciderConnectionId;
    }
    const lb = listOf(s.lorebooks, "lorebook"); if (lb) s.lorebooks = lb;
    const ag = listOf(s.agents, "agent"); if (ag) s.agents = ag;
    if (s.agentOverrides) {
      s.agentOverrides = Object.fromEntries(Object.entries(s.agentOverrides).flatMap(([k, v]) => {
        const a = to("agent", k);
        if (!a) return [];
        const o = { ...v };
        if (o.schemaId) { const x = to("schema", o.schemaId); if (x) o.schemaId = x; else delete o.schemaId; }
        if (o.connectionId !== undefined) { const c = connection(o.connectionId); if (c === undefined) delete o.connectionId; else o.connectionId = c; }
        return [[a, o]];
      }));
    }
    return s;
  };
  const fixStory = <T extends Story>(st: T): T => {
    const r = st.narrator;
    const narrator: Story["narrator"] = r.kind === "vault" ? (to("narrator", r.id) ? { kind: "vault", id: to("narrator", r.id)! } : { kind: "vault", id: "simple-narrator" })
      : r.kind === "card" ? (to("character", r.characterId) ? { ...r, characterId: to("character", r.characterId)! } : { kind: "vault", id: "simple-narrator" })
        : r;
    return {
      ...st, narrator, npcIds: list("npc", st.npcIds),
      cast: st.cast.flatMap((m) => (m.characterId === null ? [m] : to("character", m.characterId) ? [{ ...m, characterId: to("character", m.characterId)! }] : [])),
      setup: fixSetup(st.setup),
      lorePatches: Object.fromEntries(Object.entries(st.lorePatches).flatMap(([k, v]) => { const x = to("lorebook", k); return x ? [[x, v]] : []; })),
    };
  };
  // A tracker's namespace is its id: a copy gets its own, and agents in the file that read it follow.
  const namespaces = new Map<string, string>();
  for (const a of bundle.agents) {
    const id = map.agent.get(a.id);
    if (id && id !== a.id && a.state?.namespace === a.id) namespaces.set(a.id, id);
  }
  const ns = (n: string) => namespaces.get(n) ?? n;
  const nsPath = (p: string) => { const i = p.indexOf("."); return i < 0 ? ns(p) : `${ns(p.slice(0, i))}${p.slice(i)}`; };

  await write("lorebook", bundle.lorebooks, "lorebook", (x) => store.saveLorebook(x), (x) => ({
    ...x, source: x.source.characterId ? { ...x.source, characterId: to("character", x.source.characterId) ?? x.source.characterId } : x.source,
  }));
  await write("character", bundle.characters, "character", (x) => store.saveCharacter(x), (x) => ({ ...x, lorebookIds: list("lorebook", x.lorebookIds) }));
  await write("preset", bundle.presets, "preset", (x) => store.savePreset(x), (x) => x);
  await write("schema", bundle.trackerSchemas, "field set", (x) => store.saveTrackerSchema(x), (x) => {
    const { trackerId, ...rest } = x;
    const t = trackerId ? to("agent", trackerId) : undefined;
    return t ? { ...rest, trackerId: t } : rest;
  });
  await write("agent", bundle.agents, "agent", (x) => store.saveAgentConfig(x), (x) => ({
    ...x,
    input: { ...x.input, readsAgents: list("agent", x.input.readsAgents), state: Array.isArray(x.input.state) ? x.input.state.map(ns) : x.input.state },
    conditions: { ...x.conditions, state: x.conditions.state.map((c) => ({ ...c, path: nsPath(c.path) })) },
    ...(x.state ? { state: { namespace: ns(x.state.namespace), ...(x.state.schemaId && to("schema", x.state.schemaId) ? { schemaId: to("schema", x.state.schemaId)! } : {}) } } : {}),
    ...(x.connectionId !== undefined ? { connectionId: connection(x.connectionId) ?? null } : {}),
    source: { kind: "imported" as const, ...(fileName ? { from: fileName } : x.source.from ? { from: x.source.from } : {}) },
  }));
  await write("narrator", bundle.narrators, "narrator", (x) => store.saveNarrator(x), (x) => ({ ...x, builtin: x.builtin && x.id === "simple-narrator" && !alive.narrator.has(x.id) }));
  // stories and Kits before their NPCs, so an NPC's folder (storyId) can point at the new id
  await write("story", bundle.stories, "story", (x) => store.saveStory(x), (x) => fixStory(x));
  await write("kit", bundle.kits, "Kit", (x) => store.kits.save(x), (x) => fixStory(x));
  await write("npc", bundle.npcs, "NPC", (x) => store.saveNpc(x), (x) => ({
    ...x, schemaId: to("schema", x.schemaId) ?? x.schemaId,
    storyId: x.storyId ? (to("story", x.storyId) ?? to("kit", x.storyId) ?? null) : null,
  }));

  // Directors live in one list in the settings
  const newDirectors: DirectorProfile[] = [];
  for (const d of bundle.directors) {
    const id = map.director.get(d.id);
    if (!id) continue;
    if (keep.director.has(d.id)) { count(result.reused, "Director"); continue; }
    newDirectors.push({ ...d, id, name: id !== d.id ? `${d.name} (imported)` : d.name, connectionId: d.connectionId && !connectionHere.has(d.connectionId) ? (droppedConnections = true, "") : d.connectionId });
    count(result.added, "Director");
    if (!rootKey.has(`director:${d.id}`)) count(result.withThem, "Director");
  }
  if (newDirectors.length) await saveDirectorProfiles(store, [...directors, ...newDirectors]);
  // a story that came in uses the Director it used before (a story that was already here keeps its own choice)
  const linked = Object.entries(bundle.directorLinks).flatMap(([s, d]) => {
    const st = map.story.get(s); const dd = to("director", d);
    return st && dd && !keep.story.has(s) ? [[st, dd] as const] : [];
  });
  if (linked.length) {
    const links = await directorLinks(store);
    for (const [s, d] of linked) links.stories[s] = d;
    await saveDirectorLinks(store, links);
  }

  for (const r of bundle.roots) {
    const t: Table = r.kind;
    const id = to(t, r.id);
    if (!id) continue;
    const tracker = r.kind === "agent" && bundle.agents.find((a) => a.id === r.id)?.output === "state";
    result.roots.push({ kind: r.kind, id, name: rootName(bundle, r) + (id !== r.id && alive[t].has(r.id) ? " (imported)" : ""), what: tracker ? "tracker" : KIND_WORD[r.kind] });
  }
  if (droppedConnections) result.notes.push("Connections are never in the file: the imported items use your own (Settings → Connections, or the story's setup).");
  return result;
}

/** "2 cards, 1 lorebook and 1 preset" — for messages. */
export function countsText(counts: Record<string, number>): string {
  const plural: Record<string, string> = { story: "stories", "field set": "field sets", NPC: "NPCs", Kit: "Kits" };
  const parts = Object.entries(counts).map(([k, n]) => `${n} ${n === 1 ? k : plural[k] ?? `${k}s`}`);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** What came along with the picked items, counted ("2 characters and 1 lorebook"), for the export message. */
export function bundleExtras(bundle: HomunculusBundle): Record<string, number> {
  const roots = new Set(bundle.roots.map((r) => r.id));
  const n = (xs: Array<{ id: string }>) => xs.filter((x) => !roots.has(x.id)).length;
  const out: Record<string, number> = {
    character: n(bundle.characters), lorebook: n(bundle.lorebooks), preset: n(bundle.presets), narrator: n(bundle.narrators), NPC: n(bundle.npcs),
    agent: n(bundle.agents), "field set": n(bundle.trackerSchemas), Director: n(bundle.directors),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v > 0));
}
