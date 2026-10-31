// Homunculus 2 — trackers as data: storage helpers for the UI. Author: CLAUDE, 2026-10-27; field sets (D-017) same day.
// A tracker is an agent (output "state") + one or more field sets (TrackerSchema with trackerId).
// The agent id is also the state namespace, so renaming a tracker, a set or a field never loses
// saved values (field keys are made once and never change). Nothing here knows what is tracked.
import type { AgentConfig, Session, SetupLayer, TrackerField, TrackerSchema } from "@homunculus/schemas";
import { castOf, fieldKeyFrom, type PortableFieldSet, type SqlStore, type TrackerCastMember } from "@homunculus/core";
import type { AppServices } from "./core-instance.ts";
import starter from "./starter/trackers.json";

export interface Tracker { agent: AgentConfig; sets: TrackerSchema[] }

export interface SetDraft {
  id: string;
  name: string;
  help: string;
  characters: TrackerSchema["characters"];
  presence?: TrackerSchema["presence"];
  /** A field with an empty key is new (its key is made on save). */
  fields: TrackerField[];
}

/** What the tracker editor works on. */
export interface TrackerDraft {
  id: string;
  name: string;
  help: string;
  prompt: string;
  messages: number;
  /** The field set new sessions use. */
  defaultSetId: string;
  sets: SetDraft[];
}

export const DEFAULT_TRACKER_PROMPT =
  "You keep the values below up to date. Read the latest reply and change only what the story actually changed. Do not invent changes.";

/** New fields get a temporary key (so the editor can follow them while they have no name); the real key is made
 * from the name on save (cleanFields). CLAUDE, 2026-10-28 (D-026). */
export const isTempKey = (k: string) => !k || k.startsWith("~");

export function blankField(): TrackerField {
  return { key: `~${crypto.randomUUID().slice(0, 8)}`, label: "", help: "", type: "text", options: [], scope: "global", lockedForAgents: false, toPrompt: true, required: false, section: "", fields: [] };
}

const newSetId = () => `set-${crypto.randomUUID()}`;

export function blankSet(name = "Standard"): SetDraft {
  return { id: newSetId(), name, help: "", characters: "cast", fields: [blankField()] };
}

export function copySet(s: SetDraft, name: string): SetDraft {
  return { ...structuredClone(s), id: newSetId(), name };
}

export function blankTracker(): TrackerDraft {
  const set = blankSet();
  return { id: `tracker-${crypto.randomUUID()}`, name: "", help: "", prompt: DEFAULT_TRACKER_PROMPT, messages: 6, defaultSetId: set.id, sets: [set] };
}

export function draftOf(t: Tracker): TrackerDraft {
  return {
    id: t.agent.id, name: t.agent.name, help: t.agent.help, prompt: t.agent.prompt, messages: t.agent.input.messages,
    defaultSetId: t.agent.state?.schemaId ?? t.sets[0]!.id,
    sets: t.sets.map((s) => ({ id: s.id, name: s.name, help: s.help, characters: s.characters, ...(s.presence ? { presence: s.presence } : {}), fields: structuredClone(s.fields) })),
  };
}

/** Every tracker in the library: state agents with at least one field set. Default set first. */
export async function listTrackers(store: SqlStore): Promise<Tracker[]> {
  const all = await store.trackerSchemas.list();
  const out: Tracker[] = [];
  for (const agent of await store.agentConfigs.list()) {
    if (agent.output !== "state" || !agent.state?.schemaId) continue;
    const def = agent.state.schemaId;
    const sets = all.filter((s) => s.trackerId === agent.id || s.id === def)
      .sort((a, b) => (a.id === def ? -1 : b.id === def ? 1 : a.name.localeCompare(b.name)));
    if (sets.length) out.push({ agent, sets });
  }
  return out.sort((a, b) => a.agent.name.localeCompare(b.agent.name));
}

/** Plain-language problems that stop saving; empty = fine. */
export function checkDraft(d: TrackerDraft): string[] {
  const problems: string[] = [];
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  if (!d.name.trim()) problems.push("The tracker needs a name.");
  if (!d.sets.length) problems.push("The tracker needs at least one field set.");
  const checkFields = (fields: TrackerField[], where: string) => {
    fields.forEach((f, i) => {
      const which = `${where}${f.label.trim() ? `"${f.label.trim()}"` : `field ${i + 1}`}`;
      if (!f.label.trim()) problems.push(cap(`${which} needs a name.`));
      if (f.type === "status" && !f.options.filter((o) => o.trim()).length) problems.push(cap(`${which} is a status: write at least one option.`));
      if (f.min !== undefined && f.max !== undefined && f.min >= f.max) problems.push(cap(`${which}: the lowest value must be below the highest.`));
      if (f.type === "list" && f.fields.length) checkFields(f.fields, `${which} → column `);
    });
  };
  for (const s of d.sets) {
    const where = d.sets.length > 1 ? `Set "${s.name || "?"}": ` : "";
    if (!s.name.trim()) problems.push(`${where}the field set needs a name.`);
    if (!s.fields.length) problems.push(`${where}add at least one field.`);
    checkFields(s.fields, where);
  }
  return problems;
}

function cleanFields(fields: TrackerField[], column = false): TrackerField[] {
  const taken = fields.map((f) => f.key).filter((k) => !isTempKey(k));
  return fields.map((f) => {
    const key = isTempKey(f.key) ? fieldKeyFrom(f.label, taken) : f.key;
    if (isTempKey(f.key)) taken.push(key);
    const clean: TrackerField = {
      ...f, key, label: f.label.trim(), help: f.help.trim(), section: column ? "" : f.section.trim(),
      options: f.type === "status" ? f.options.map((o) => o.trim()).filter(Boolean) : [],
      fields: f.type === "list" || f.type === "group" ? cleanFields(f.fields, true) : [],
    };
    if (column) { clean.scope = "global"; clean.lockedForAgents = false; clean.required = false; }
    if (f.type !== "number" && f.type !== "meter") { delete clean.min; delete clean.max; }
    if (f.type === "meter") { clean.min ??= 0; clean.max ??= 100; }
    if (!clean.display || clean.display === "auto") delete clean.display;
    if (!clean.icon) delete clean.icon;
    if (!clean.color) delete clean.color;
    return clean;
  });
}

/** Normalizes a draft for portability/save, retaining stable keys and remapping a new presence field. CODEX. */
export function portableSetOf(s: SetDraft): PortableFieldSet {
  const fields = cleanFields(s.fields);
  const index = s.presence ? s.fields.findIndex((f) => f.key === s.presence!.field) : -1;
  return { name: s.name.trim(), help: s.help.trim(), version: 1, characters: s.characters, fields,
    ...(s.presence && index >= 0 ? { presence: { ...s.presence, field: fields[index]!.key } } : {}) };
}

/** Saves the tracker (agent + every field set) and removes sets deleted in the editor. Returns the saved draft. */
export async function saveTracker(store: SqlStore, d: TrackerDraft): Promise<TrackerDraft> {
  const before = (await listTrackers(store)).find((t) => t.agent.id === d.id);
  for (const s of d.sets) {
    await store.saveTrackerSchema({ ...portableSetOf(s), id: s.id, trackerId: d.id });
  }
  for (const old of before?.sets ?? []) if (!d.sets.some((s) => s.id === old.id)) await store.trackerSchemas.delete(old.id);
  const previous = before?.agent;
  await store.saveAgentConfig({
    ...(previous ?? {}),
    id: d.id,
    name: d.name.trim(),
    help: d.help.trim(),
    prompt: d.prompt,
    triggers: previous?.triggers ?? [{ on: "turn", phase: "after" }],
    output: "state",
    runMode: previous?.runMode ?? "separate",
    input: { ...(previous?.input ?? { lorebooks: false, cards: true, state: [d.id], readsAgents: [] }), messages: Math.max(0, Math.round(d.messages)) },
    state: { namespace: d.id, schemaId: d.sets.some((s) => s.id === d.defaultSetId) ? d.defaultSetId : d.sets[0]!.id },
    source: previous?.source ?? { kind: "user" },
  });
  const saved = (await listTrackers(store)).find((t) => t.agent.id === d.id)!;
  return draftOf(saved);
}

/** Removes a tracker and its field sets, and switches it off in every session. Saved values stay in old messages. */
export async function deleteTracker(store: SqlStore, id: string): Promise<void> {
  const t = (await listTrackers(store)).find((x) => x.agent.id === id);
  for (const s of await store.listSessions()) {
    if (isOnIn(s, id) || s.setup.agentOverrides?.[id] || s.setup.agents?.remove.includes(id)) await store.saveSession(withFieldSet(withTracker(s, id, false), id, null));
  }
  for (const st of await store.listStories()) {
    if (layerHasTracker(st.setup, id) || st.setup.agentOverrides?.[id]) await store.saveStory({ ...st, setup: layerWithFieldSet(layerWithTracker(st.setup, id, false), id, null) });
  }
  for (const set of t?.sets ?? []) await store.trackerSchemas.delete(set.id);
  await store.agentConfigs.delete(id);
}

// ---------------------------------------------------------------- on/off and field set, layer by layer (D-031)
// A story chat inherits its story's trackers; a chat only stores what it changes (the "changed in this chat" rows).
// `above` = the story's layer for a story chat, undefined for a 1:1 chat (and for the story's own layer).

/** Is the tracker on in this layer, given whether it is on in the layer above? */
export function layerHasTracker(layer: SetupLayer, id: string, inherited = false): boolean {
  const a = layer.agents;
  if (!a || a.mode === "keep") return inherited;
  if (a.mode === "only") return a.add.includes(id);
  if (a.remove.includes(id)) return false;
  return a.add.includes(id) || inherited;
}

/** The layer with the tracker on or off. Matching the layer above stores nothing (it follows the layer above again). */
export function layerWithTracker(layer: SetupLayer, id: string, on: boolean, inherited = false): SetupLayer {
  const a = layer.agents && layer.agents.mode !== "keep" ? layer.agents : { mode: "add" as const, add: [], remove: [] };
  let add = a.add.filter((x) => x !== id);
  let remove = a.remove.filter((x) => x !== id);
  if (a.mode === "only") { if (on) add = [...add, id]; }
  else if (on !== inherited) { if (on) add = [...add, id]; else remove = [...remove, id]; }
  const setup = { ...layer };
  if (a.mode !== "only" && !add.length && !remove.length) delete setup.agents;
  else setup.agents = { mode: a.mode, add, remove };
  return setup;
}

/** The field set this layer picked for a tracker (undefined = follows the layer above / the tracker's default). */
export const layerFieldSet = (layer: SetupLayer, trackerId: string): string | undefined => layer.agentOverrides?.[trackerId]?.schemaId;

/** The layer with a field set picked (null = follow the layer above again). */
export function layerWithFieldSet(layer: SetupLayer, trackerId: string, setId: string | null): SetupLayer {
  const overrides = { ...(layer.agentOverrides ?? {}) };
  const { schemaId: _old, ...rest } = overrides[trackerId] ?? {};
  if (setId) overrides[trackerId] = { ...rest, schemaId: setId };
  else if (Object.keys(rest).length) overrides[trackerId] = rest;
  else delete overrides[trackerId];
  const { agentOverrides: _drop, ...setup } = layer;
  return Object.keys(overrides).length ? { ...setup, agentOverrides: overrides } : setup;
}

/** Which style of an agent a layer picks (null = inherit). Same shape as layerWithFieldSet. Daniel, 30/10. */
export function layerWithStyle(layer: SetupLayer, agentId: string, styleId: string | null): SetupLayer {
  const overrides = { ...(layer.agentOverrides ?? {}) };
  const { styleId: _old, ...rest } = overrides[agentId] ?? {};
  if (styleId) overrides[agentId] = { ...rest, styleId };
  else if (Object.keys(rest).length) overrides[agentId] = rest;
  else delete overrides[agentId];
  const { agentOverrides: _drop, ...setup } = layer;
  return Object.keys(overrides).length ? { ...setup, agentOverrides: overrides } : setup;
}

/** Is this tracker on in the session (its own layer over its story's)? */
export const isOnIn = (s: Session, id: string, above?: SetupLayer): boolean =>
  layerHasTracker(s.setup, id, above ? layerHasTracker(above, id) : false);

/** The session with the tracker switched on or off (only what differs from its story is stored). */
export const withTracker = (s: Session, id: string, on: boolean, above?: SetupLayer): Session =>
  ({ ...s, setup: layerWithTracker(s.setup, id, on, above ? layerHasTracker(above, id) : false) });

/** The field set the session uses for a tracker (its own, else its story's; undefined = the tracker's default). */
export const fieldSetOf = (s: Session, trackerId: string, above?: SetupLayer): string | undefined =>
  layerFieldSet(s.setup, trackerId) ?? (above ? layerFieldSet(above, trackerId) : undefined);

/** The session with a field set picked (null, or the same as its story's = follow the story again). */
export function withFieldSet(s: Session, trackerId: string, setId: string | null, above?: SetupLayer): Session {
  const fromAbove = above ? layerFieldSet(above, trackerId) : undefined;
  return { ...s, setup: layerWithFieldSet(s.setup, trackerId, setId && setId !== fromAbove ? setId : null) };
}

// ---------------------------------------------------------------- starter data

const STARTER_KEY = "starterTrackers";

/**
 * Installs the starter trackers (from Homunculus v1, as editable data) once. A tracker the user
 * deleted is not brought back; one that already exists is not overwritten.
 */
export async function installStarterTrackers(store: SqlStore): Promise<void> {
  const installed = new Set((await store.getAppSetting<string[]>(STARTER_KEY)) ?? []);
  let changed = false;
  for (const t of starter.trackers) {
    if (installed.has(t.agent.id)) continue;
    if (!(await store.agentConfigs.get(t.agent.id))) {
      for (const s of t.sets) await store.saveTrackerSchema(s as Parameters<SqlStore["saveTrackerSchema"]>[0]);
      await store.saveAgentConfig(t.agent as Parameters<SqlStore["saveAgentConfig"]>[0]);
    }
    installed.add(t.agent.id);
    changed = true;
  }
  if (changed) await store.setAppSetting(STARTER_KEY, [...installed]);
  await addStarterLook(store);
  await addStarterOrder(store);
  await addStarterNotes(store);
}

const LOOK_KEY = "starterTrackersLook";
/** The starter data that carries the hints is version 2 (trackers.json "version"). The flag stores the version applied:
 * if the code runs with older starter data (files arriving out of order), nothing is marked done and it runs again
 * with the new data. On Daniel's PC version 1 ran when the field schema didn't know the hints yet, so it runs again. */
const LOOK_VERSION = 2;

/**
 * 2026-10-28 (D-024): the starter trackers got presentation hints (how the Scene panel shows each field). Trackers
 * installed before that get the hints once, ONLY on fields that have none, matched by set id and field key, so
 * nothing the user changed is overwritten (a user who set "Show as" keeps it; a deleted field stays deleted).
 */
async function addStarterLook(store: SqlStore): Promise<void> {
  if (((await store.getAppSetting<number>(LOOK_KEY)) ?? 0) >= LOOK_VERSION || starter.version < LOOK_VERSION) return;
  for (const t of starter.trackers) {
    for (const s of t.sets) {
      const saved = await store.trackerSchemas.get(s.id);
      if (!saved) continue;
      let touched = false;
      const fields = saved.fields.map((f) => {
        const from = (s.fields as Array<Partial<TrackerField>>).find((x) => x.key === f.key);
        if (!from || f.display !== undefined || from.display === undefined) return f;
        touched = true;
        return { ...f, display: from.display, ...(from.icon && !f.icon ? { icon: from.icon } : {}), ...(from.color && !f.color ? { color: from.color } : {}) };
      });
      if (!touched) continue;
      await store.saveTrackerSchema({ ...saved, fields });
      // the saved copy must keep the hints: if this code runs before the code that knows them (files arriving out of
      // order — what happened on Daniel's PC at 03:55 on 28/10), it is not marked done and runs again next time
      const back = await store.trackerSchemas.get(s.id);
      if (!back?.fields.some((f) => f.display !== undefined)) return;
    }
  }
  await store.setAppSetting(LOOK_KEY, LOOK_VERSION);
}

const ORDER_KEY = "starterTrackersOrder";
/** Same guard as the hints: needs starter data version 2 (Appearance first). */
const ORDER_VERSION = 2;

/**
 * 2026-10-28 (D-025, Daniel: "Appearance always at the top for now"): the order of the fields decides the order of the
 * groups on a person's page, and the starter sets now start with Appearance. Trackers installed before get the starter
 * order once: starter fields are sorted as in the starter set; a field the user added stays right after the field
 * it followed. Runs once, so a later reorder by the user is never undone.
 */
async function addStarterOrder(store: SqlStore): Promise<void> {
  if (((await store.getAppSetting<number>(ORDER_KEY)) ?? 0) >= ORDER_VERSION || starter.version < ORDER_VERSION) return;
  for (const t of starter.trackers) {
    for (const s of t.sets) {
      const saved = await store.trackerSchemas.get(s.id);
      if (!saved) continue;
      const rank = new Map((s.fields as Array<{ key: string }>).map((f, i) => [f.key, i]));
      let last = -1;
      // a user field gets the rank of the field before it (+ a little, keeping their order)
      const ranked = saved.fields.map((f, i) => {
        const r = rank.get(f.key);
        if (r !== undefined) last = r;
        return { f, r: r ?? last + 0.001 * (i + 1) };
      });
      const fields = [...ranked].sort((a, b) => a.r - b.r).map((x) => x.f);
      if (fields.some((f, i) => f !== saved.fields[i])) await store.saveTrackerSchema({ ...saved, fields });
    }
  }
  await store.setAppSetting(ORDER_KEY, ORDER_VERSION);
}

// ---------------------------------------------------------------- a real example for the editor's preview (D-026)

export interface TrackerSample { sessionId: string; sessionName: string; values: Record<string, unknown>; cast: TrackerCastMember[] }

/**
 * The tracker's values at the newest message of the most recent session that has some, so the editor can
 * show what the panel will look like with real data. Null when it never ran.
 */
export async function sampleFor(svc: AppServices, trackerId: string): Promise<TrackerSample | null> {
  for (const s of await svc.store.listSessions()) {
    // the newest message of the session: follow the newest reply at every step
    let head: string | null = null;
    for (let parent: string | null = null, guard = 0; guard < 5000; guard++) {
      const kids = await svc.store.childrenOf(s.id, parent);
      if (!kids.length) break;
      parent = kids.reduce((a, b) => (b.createdAt >= a.createdAt ? b : a)).id;
      head = parent;
    }
    if (!head) continue;
    const values = (await svc.core.state.resolve(s.id, head))[trackerId];
    if (values && typeof values === "object" && Object.keys(values).length) {
      return { sessionId: s.id, sessionName: s.title, values: values as Record<string, unknown>, cast: await castOf(svc.store, s) };
    }
  }
  return null;
}

const NOTES_KEY = "starterTrackersNotes";
/** Starter data version 3 carries the field notes. */
const NOTES_VERSION = 3;

/**
 * 2026-10-30 (D-055): starter fields got "What it means in the story" notes (Health, Mana, Quests…). Installed
 * trackers get them once, only on fields without a note, matched by set id and field key.
 */
async function addStarterNotes(store: SqlStore): Promise<void> {
  if (((await store.getAppSetting<number>(NOTES_KEY)) ?? 0) >= NOTES_VERSION || starter.version < NOTES_VERSION) return;
  for (const t of starter.trackers) {
    for (const s of t.sets) {
      const saved = await store.trackerSchemas.get(s.id);
      if (!saved) continue;
      let touched = false;
      const fields = saved.fields.map((f) => {
        const from = (s.fields as Array<Partial<TrackerField>>).find((x) => x.key === f.key);
        if (!from?.note || f.note) return f;
        touched = true;
        return { ...f, note: from.note };
      });
      if (touched) await store.saveTrackerSchema({ ...saved, fields });
    }
  }
  await store.setAppSetting(NOTES_KEY, NOTES_VERSION);
}
