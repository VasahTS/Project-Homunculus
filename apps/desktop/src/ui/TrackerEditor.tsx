// Homunculus 2 — create / edit a tracker: name, instructions for the AI, and its field sets.
// Author: CLAUDE, 2026-10-27; field sets, sections, columns, characters (D-017) same day.
// Nothing here is about a specific subject: the user decides what is tracked (BLUEPRINT §4.5).
// 2026-10-28 (D-026): direction "B" from the mockup canvas — groups and fields you drag, a field opens in place,
// and a live preview of the Scene panel with real values on the right.
import { useEffect, useState } from "react";
import { applyBasicMacros, transferFields } from "@homunculus/core";
import type { Avatar, FieldDisplay, FieldType, TrackerField, TrackerSchema } from "@homunculus/schemas";
import { Collapse, FIELD_ICONS, Icon, isIconName } from "./kit.tsx";
import { blankField, blankSet, checkDraft, copySet, isTempKey, type SetDraft, type TrackerDraft, type TrackerSample } from "../trackers.ts";
import { ConfirmButton, Help } from "./Help.tsx";
import { move, SortableList } from "./Sortable.tsx";
import { TrackerPreview } from "./ScenePanel.tsx";
import { SendToMenu, SetFileLinks } from "./FieldSetTools.tsx";

const DISPLAYS: Array<{ value: FieldDisplay; label: string }> = [
  { value: "auto", label: "Auto" }, { value: "header", label: "Top strip" }, { value: "subtitle", label: "Under the name" }, { value: "lead", label: "Lead" },
  { value: "pill", label: "Pill" }, { value: "line", label: "Line" }, { value: "tile", label: "Tile" }, { value: "block", label: "Block" }, { value: "note", label: "Note" },
];

const TYPES: Array<{ value: FieldType; label: string; help: string }> = [
  { value: "text", label: "Text", help: "Free text, e.g. a place, a mood, a goal." },
  { value: "number", label: "Number", help: "Any number, e.g. an amount. You can set a lowest and highest value." },
  { value: "meter", label: "Bar", help: "A whole number shown as a bar, from the lowest to the highest value (0–100 if you leave them empty)." },
  { value: "status", label: "Status", help: "One option from a list you write, e.g. open / closed." },
  { value: "list", label: "List", help: "Several items. Without columns: short items (an item can have a quantity). With columns: rows, like a small table (e.g. quests with title, status and note)." },
];

// 29/10 (Daniel didn't know what "one value" meant and picked it for Mana): say WHO gets a value, with examples
const SCOPES: Array<{ value: TrackerField["scope"]; label: string }> = [
  { value: "global", label: "one for the whole scene" },
  { value: "perCharacter", label: "one for each character" },
  { value: "perPair", label: "one for each pair of characters" },
];
const SCOPE_HELP = "Who has this value. One for the whole scene: a single value for everyone — time, place, weather, the party's gold. "
  + "One for each character: every person gets their own — Mana, Mood, Outfit, Level (pick this for anything a character HAS). "
  + "One for each pair: how one character stands toward another — Trust, Affection.";

/** Remembered per tracker, in this app window's storage: the field set you were editing (29/10, Daniel). */
const lastSetKey = (trackerId: string) => `h2.trackerEditor.set.${trackerId}`;
function lastSet(trackerId: string): string | null {
  try { return localStorage.getItem(lastSetKey(trackerId)); } catch { return null; }
}
function rememberSet(trackerId: string, setId: string) {
  try { localStorage.setItem(lastSetKey(trackerId), setId); } catch { /* storage may be blocked */ }
}

const WHO: Array<{ value: TrackerSchema["characters"]; label: string }> = [
  { value: "cast", label: "the session's characters" },
  { value: "castAndUser", label: "the session's characters and you" },
  { value: "anyone", label: "anyone the story names (the tracker can add characters)" },
];

const numOrUndef = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));

// ---- the editor (D-026, direction "B" picked by Daniel on the canvas: groups and fields you drag + a live preview)

/** "Shows on the person's page as": what each choice does, with a small drawing. Per-character fields get the page's
 * places; one-value fields the panel's. */
const SHOW_PERSON: Array<{ value: FieldDisplay; label: string; note: string }> = [
  { value: "auto", label: "Auto", note: "Picks by type: numbers and bars as tiles, the rest as rows." },
  { value: "block", label: "Row", note: "Name on the left, text on the right." },
  { value: "tile", label: "Tile", note: "A small box, three to a line (age, level, health)." },
  { value: "line", label: "Right now", note: "A row in the \"Right now\" group (where, doing)." },
  { value: "pill", label: "Highlight", note: "In \"Right now\". The Scene list shows it under the person's name when no \"Right now\" row is filled (mood)." },
  { value: "subtitle", label: "Under the name", note: "Small text next to the picture (role)." },
  { value: "lead", label: "Lead", note: "Below the name, in book type (description, traits)." },
  { value: "note", label: "Note", note: "In \"Notes\", at the end of the page." },
];
const SHOW_GLOBAL: typeof SHOW_PERSON = [
  { value: "auto", label: "Auto", note: "A row in its group (lists get their own tab)." },
  { value: "header", label: "Top strip", note: "In \"Now\" at the top of the Scene panel (time, place, weather)." },
  { value: "block", label: "Row", note: "Name on the left, text on the right, in its group." },
];
/** The drawings: [accent?, left %, top px, width %, height px]. */
const SKETCH: Record<string, Array<[boolean, number, number, number, number]>> = {
  auto: [[true, 8, 7, 30, 4], [false, 8, 16, 60, 4]],
  block: [[false, 6, 8, 18, 4], [true, 30, 8, 52, 4], [true, 30, 16, 40, 4]],
  tile: [[true, 6, 6, 20, 7], [false, 6, 17, 14, 3], [false, 36, 6, 20, 7], [false, 36, 17, 14, 3], [false, 66, 6, 20, 7], [false, 66, 17, 14, 3]],
  line: [[false, 6, 6, 18, 4], [false, 30, 6, 50, 4], [false, 6, 16, 18, 4], [true, 30, 16, 44, 4]],
  pill: [[false, 6, 6, 18, 4], [true, 30, 4, 32, 8], [false, 6, 18, 18, 4], [false, 30, 18, 40, 4]],
  subtitle: [[false, 6, 4, 14, 16], [false, 26, 6, 30, 5], [true, 26, 15, 40, 3]],
  lead: [[false, 6, 4, 30, 5], [true, 6, 13, 76, 3], [true, 6, 19, 60, 3]],
  note: [[false, 6, 6, 76, 1], [true, 6, 11, 70, 3], [true, 6, 18, 50, 3]],
  header: [[true, 6, 5, 80, 4], [false, 6, 13, 50, 3], [false, 6, 19, 60, 3]],
};
/** Where a field shows outside its group (a chip on its row, so the outline doesn't lie about the page). */
const PIN: Partial<Record<FieldDisplay, string>> = { subtitle: "under the name", lead: "below the name", note: "in Notes", header: "in Now" };

const userMacro = (t: string) => applyBasicMacros(t, { char: "the character", user: "User" });
const groupLabel = (name: string) => name || "Without a group";

/** The fields by group (a group = the fields with the same section), in the order the groups first appear. */
function groupsOf(fields: TrackerField[]): Array<{ name: string; fields: TrackerField[] }> {
  const groups: Array<{ name: string; fields: TrackerField[] }> = [];
  for (const f of fields) {
    const g = groups.find((x) => x.name === f.section);
    if (g) g.fields.push(f); else groups.push({ name: f.section, fields: [f] });
  }
  return groups;
}

export function TrackerEditor({ initial, isNew, onSave, onDelete, onClose, loadSample, avatars = {} }: {
  initial: TrackerDraft;
  isNew: boolean;
  /** Returns the draft as saved (new fields get their permanent keys). */
  onSave: (d: TrackerDraft) => Promise<TrackerDraft>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  /** Real values for the preview: the tracker at the end of the latest session that uses it. */
  loadSample?: (trackerId: string) => Promise<TrackerSample | null>;
  avatars?: Record<string, Avatar>;
}) {
  const [draft, setDraft] = useState<TrackerDraft>(initial);
  const [setId, setSetIdRaw] = useState(() => {
    const was = isNew ? null : lastSet(initial.id);
    return was && initial.sets.some((x) => x.id === was) ? was : initial.defaultSetId;
  });
  const setSetId = (id: string) => { setSetIdRaw(id); rememberSet(draft.id, id); };
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [exists, setExists] = useState(!isNew);
  const [settingsOpen, setSettingsOpen] = useState(isNew);
  /** The field whose settings are open (one at a time). New trackers open their first field. */
  /** Fields whose settings are open (several at once, 29/10); the last one opened is highlighted in the preview. */
  const [openKeys, setOpenKeys] = useState<string[]>(isNew && initial.sets[0]?.fields[0] ? [initial.sets[0].fields[0].key] : []);
  const openKey = openKeys.at(-1) ?? null;
  const toggleOpen = (key: string) => setOpenKeys((x) => (x.includes(key) ? x.filter((k) => k !== key) : [...x, key]));
  const [folded, setFolded] = useState<string[]>([]);
  const [sample, setSample] = useState<TrackerSample | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    if (isNew || !loadSample) { setSample(null); return; }
    void loadSample(initial.id).then((s) => { if (!off) setSample(s); }, () => { if (!off) setSample(null); });
    return () => { off = true; };
    // once per tracker (loadSample is a new function on every render of the app)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, isNew]);

  const set = (patch: Partial<TrackerDraft>) => { setDraft((d) => ({ ...d, ...patch })); setSaved(false); };
  const current = draft.sets.find((s) => s.id === setId) ?? draft.sets[0]!;
  const setCurrent = (patch: Partial<SetDraft>) => set({ sets: draft.sets.map((s) => (s.id === current.id ? { ...s, ...patch } : s)) });

  const groups = groupsOf(current.fields);
  const ordered = groups.flatMap((g) => g.fields);
  const writeGroups = (gs: Array<{ name: string; fields: TrackerField[] }>) => setCurrent({ fields: gs.flatMap((g) => g.fields) });
  const number = (key: string) => ordered.findIndex((f) => f.key === key) + 1;
  const setField = (key: string, patch: Partial<TrackerField>) => setCurrent({ fields: ordered.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  const removeField = (key: string) => { setCurrent({ fields: ordered.filter((f) => f.key !== key) }); setOpenKeys((x) => x.filter((k) => k !== key)); };
  const addField = (group: string) => {
    const g = groups.find((x) => x.name === group);
    const f = { ...blankField(), section: group, scope: g?.fields.at(-1)?.scope ?? "global" };
    writeGroups(g ? groups.map((x) => (x === g ? { ...x, fields: [...x.fields, f] } : x)) : [...groups, { name: group, fields: [f] }]);
    setFolded((x) => x.filter((n) => n !== group));
    setOpenKeys((x) => [...x, f.key]);
  };
  const addGroup = () => {
    let name = "New group";
    for (let i = 2; groups.some((g) => g.name === name); i++) name = `New group ${i}`;
    addField(name);
  };
  const renameGroup = (from: string, to: string) => {
    const name = to.trim();
    if (name === from) return;
    setCurrent({ fields: ordered.map((f) => (f.section === from ? { ...f, section: name } : f)) });
    setFolded((x) => x.map((n) => (n === from ? name : n)));
  };
  /** Move up/down: inside the group, and from its edge into the group next to it. */
  const step = (key: string, dir: -1 | 1) => {
    const gi = groups.findIndex((g) => g.fields.some((f) => f.key === key));
    const g = groups[gi]!;
    const i = g.fields.findIndex((f) => f.key === key);
    const j = i + dir;
    if (j >= 0 && j < g.fields.length) { writeGroups(groups.map((x) => (x === g ? { ...x, fields: move(x.fields, i, j) } : x))); return; }
    const other = groups[gi + dir];
    if (!other) return;
    const f = { ...g.fields[i]!, section: other.name };
    writeGroups(groups.map((x) => (x === g ? { ...x, fields: x.fields.filter((y) => y.key !== key) }
      : x === other ? { ...x, fields: dir < 0 ? [...x.fields, f] : [f, ...x.fields] } : x)).filter((x) => x.fields.length));
  };

  const addSet = (copy: boolean) => {
    const s = copy ? copySet(current, `${current.name} (copy)`) : blankSet("New set");
    set({ sets: [...draft.sets, s] });
    setSetId(s.id);
  };
  const removeSet = () => {
    const rest = draft.sets.filter((s) => s.id !== current.id);
    set({ sets: rest, defaultSetId: draft.defaultSetId === current.id ? rest[0]!.id : draft.defaultSetId });
    setSetId(rest[0]!.id);
  };

  // Reuse (D-046): one quiet line under the set bar says what happened, with Undo while nothing else changed the sets.
  const [reuse, setReuse] = useState<{ text: string; kind: "ok" | "error"; undo?: { before: SetDraft[]; after: SetDraft[] } } | null>(null);
  const say = (text: string, kind: "ok" | "error" = "ok") => setReuse({ text, kind });
  const applySets = (sets: SetDraft[], text: string) => { setReuse({ text, kind: "ok", undo: { before: draft.sets, after: sets } }); set({ sets }); };
  const targetsFor = (keys: string[]) => draft.sets.filter((s) => s.id !== current.id)
    .map((s) => ({ id: s.id, name: s.name || "(no name)", has: keys.every((k) => s.fields.some((f) => f.key === k)) }));
  /** Copies or moves fields to another set (or a new one). Fields the destination already has stay where they are. */
  const sendFields = (keys: string[], what: string, to: string | "new", mode: "copy" | "move") => {
    try {
      let sets = draft.sets;
      let dest = sets.find((s) => s.id === to);
      if (!dest) {
        let name = "New set";
        for (let i = 2; sets.some((s) => s.name === name); i++) name = `New set ${i}`;
        dest = { ...blankSet(name), fields: [] };
        sets = [...sets, dest];
      }
      const target = dest;
      const missing = keys.filter((k) => !target.fields.some((f) => f.key === k));
      if (!missing.length) { say(`“${target.name}” already has ${what}.`, "error"); return; }
      const next = transferFields(sets, current.id, target.id, missing, mode);
      const skipped = keys.length - missing.length;
      if (mode === "move") setOpenKeys((x) => x.filter((k) => !missing.includes(k)));
      applySets(next, `${what} ${mode === "copy" ? "copied" : "moved"} to “${target.name}”${skipped ? ` (${skipped} it already had stayed here)` : ""}.`);
    } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); }
  };

  const save = async () => {
    const p = checkDraft(draft);
    setProblems(p);
    if (p.length) return;
    try {
      const before = ordered.map((f) => f.key);
      const next = await onSave(draft);
      // the field that was open stays open (new fields got their real key on save)
      const nextSet = next.sets.find((s) => s.id === current.id);
      if (nextSet) setOpenKeys((keys) => keys.map((k) => nextSet.fields[before.indexOf(k)]?.key).filter((k): k is string => !!k));
      setDraft(next);
      setSaved(true);
      setExists(true);
    } catch (e) { setProblems([e instanceof Error ? e.message : String(e)]); }
  };

  const statusFields = current.fields.filter((f) => f.scope === "perCharacter" && f.type === "status" && !isTempKey(f.key));
  const presenceField = current.presence ? statusFields.find((f) => f.key === current.presence!.field) : undefined;
  const previewSchema = { id: current.id, name: current.name, help: current.help, trackerId: draft.id, characters: current.characters,
    ...(current.presence ? { presence: current.presence } : {}), fields: ordered } as TrackerSchema;

  return (
    <div className="editor tracker-editor" aria-label="Tracker editor">
      <div className="session-bar">
        <h2 className="editor-title">{isNew && !exists ? "New Tracker" : draft.name || "Tracker"}</h2>
        <span className="spacer" />
        {saved && <span className="ok-text">✓ Saved</span>}
        <button className="btn btn-bordered btn-small" onClick={onClose}>Close</button>
        <button className="btn btn-prominent btn-small" onClick={() => void save()}>Save</button>
      </div>
      <div className="te-cols">
        <div className="editor-body te-main">
          {problems.length > 0 && (
            <div className="error-bar inline" role="alert">{problems.map((p, i) => <div key={i}>{p}</div>)}</div>
          )}
          <section className={`te-card${settingsOpen ? " open" : ""}`}>
            <button type="button" className="te-card-head" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
              <Icon name="gear" size={15} />
              <span className="grow"><b>Tracker settings</b><span className="te-sub">Name, what it does, instructions for the AI</span></span>
              <span className={`te-chev${settingsOpen ? " open" : ""}`}><Icon name="chevron" size={14} /></span>
            </button>
            <Collapse open={settingsOpen}>
              <div className="te-card-body">
                <p className="hint">
                  A tracker is a list of values the AI keeps up to date after each reply. You choose the fields; they appear in the
                  Scene panel of the sessions where the tracker is on, and you can change any value there.
                </p>
                <label>
                  <span className="label-row">Name <Help text="What this tracker is called in the Scene panel and in the prompt." /></span>
                  <input value={draft.name} onChange={(e) => set({ name: e.target.value })} aria-label="Tracker name" />
                </label>
                <label>
                  <span className="label-row">Description <Help text="A note for you: what this tracker is for. Shown by its '?' in the Scene panel." /></span>
                  <input value={draft.help} onChange={(e) => set({ help: e.target.value })} aria-label="Tracker description" />
                </label>
                <label>
                  <span className="label-row">Instructions for the AI <Help text="What the AI is told before it updates the values. The list of fields and the answer format are added automatically from the field set. {{char}} and {{user}} work here." /></span>
                  <textarea rows={5} value={draft.prompt} onChange={(e) => set({ prompt: e.target.value })} aria-label="Instructions for the AI" />
                </label>
                <label className="narrow">
                  <span className="label-row">Messages it reads <Help text="How many of the latest messages the AI sees when it updates the values (besides the new reply). More = better context, but more tokens." /></span>
                  <input type="number" min={0} max={50} value={draft.messages} onChange={(e) => set({ messages: Number(e.target.value) || 0 })} aria-label="Messages it reads" />
                </label>
              </div>
            </Collapse>
          </section>

          <div className="set-bar">
            <span className="label-row set-title">Field set <Help text="A tracker can have several field sets (e.g. one for fantasy, one for sci-fi). Each session picks one in the Scene panel; new sessions use the default. Values of fields with the same name carry over when a session switches sets." /></span>
            <select aria-label="Field set" value={current.id} onChange={(e) => { setSetId(e.target.value); setOpenKeys([]); }}>
              {draft.sets.map((s) => <option key={s.id} value={s.id}>{s.name || "(no name)"}{s.id === draft.defaultSetId ? " — default" : ""}</option>)}
            </select>
            <button className="btn btn-bordered btn-small" onClick={() => addSet(true)}>Copy Set</button>
            <button className="btn btn-bordered btn-small" onClick={() => addSet(false)}>New Set</button>
            {draft.sets.length > 1 && current.id !== draft.defaultSetId && (
              <button className="link" onClick={() => set({ defaultSetId: current.id })}>Make Default</button>
            )}
            {draft.sets.length > 1 && <ConfirmButton label="Delete Set" confirmLabel="Click Again to Delete the Set" onConfirm={removeSet} />}
            <span className="spacer" />
            <SetFileLinks sets={draft.sets} current={current} say={say} onImport={applySets} />
          </div>
          {reuse && (
            <p className={`set-notice ${reuse.kind === "error" ? "error-text" : "hint"}`} role={reuse.kind === "error" ? "alert" : "status"} data-testid="set-notice">
              <span>{reuse.text}{reuse.kind === "ok" && reuse.undo ? " Save to keep it." : ""}</span>
              {reuse.undo && draft.sets === reuse.undo.after &&
                <button type="button" className="link" onClick={() => { const before = reuse.undo!.before; set({ sets: before }); setReuse({ text: "Undone.", kind: "ok" });
                  if (!before.some((s) => s.id === setId)) setSetId(before[0]!.id); }}>Undo</button>}
              <button type="button" className="link quiet" aria-label="Dismiss" onClick={() => setReuse(null)}><Icon name="close" size={12} /></button>
            </p>
          )}
          <div className="set-card">
            <div className="field-row">
              <input aria-label="Field set name" placeholder="Set name" value={current.name} onChange={(e) => setCurrent({ name: e.target.value })} />
              <input className="grow" aria-label="Field set description" placeholder="What this set is for (optional)" value={current.help} onChange={(e) => setCurrent({ help: e.target.value })} />
            </div>
            <div className="field-row">
              <span className="label-row muted">Per-character values for <Help text="Who gets values in 'one per character' fields: only the characters of the session, also you, or anyone the story names (the tracker adds NPCs as they appear and never removes them)." /></span>
              <select aria-label="Per-character values for" value={current.characters} onChange={(e) => setCurrent({ characters: e.target.value as SetDraft["characters"] })}>
                {WHO.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
            {statusFields.length > 0 && (
              <div className="field-row">
                <span className="label-row muted">Who is in the scene <Help text="Optional. Pick the per-character status field that says if a character is in the scene, and its 'in the scene' option. Characters with another value are sent to the AI by name only (plus the other fields of that section), and the panel lists them last." /></span>
                <select aria-label="Presence field" value={presenceField?.key ?? ""}
                  onChange={(e) => { const fld = statusFields.find((f) => f.key === e.target.value); setCurrent({ presence: fld ? { field: fld.key, value: fld.options[0] ?? "" } : undefined }); }}>
                  <option value="">— not used —</option>
                  {statusFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                {presenceField && (
                  <select aria-label="In the scene value" value={current.presence!.value} onChange={(e) => setCurrent({ presence: { field: presenceField.key, value: e.target.value } })}>
                    {presenceField.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>

          <div className="fields-head">
            <h3 className="label-row grow">Groups and fields <Help text="Each field is one value the AI keeps up to date. Fields sit in groups; the order here is the order on the person's page and in the Scene panel. Drag a group or a field by its ⋮⋮ (or focus the ⋮⋮ and use the arrow keys). Click a field to open its settings; several can be open at once." /></h3>
            <button type="button" className="link quiet" data-testid="fields-open-all"
              onClick={() => { if (openKeys.length) setOpenKeys([]); else { setFolded([]); setOpenKeys(ordered.map((f) => f.key)); } }}>
              {openKeys.length ? "Fold All" : "Open All"}
            </button>
          </div>
          <SortableList items={groups} id={(g) => `g:${g.name}`} name={(g) => groupLabel(g.name)} label="Groups"
            className="te-groups" itemTestId="field-group"
            onReorder={(from, to) => writeGroups(move(groups, from, to))}
            render={(g, handle) => {
              const isFolded = folded.includes(g.name);
              return (
                <div className="te-group">
                  <div className="te-group-head">
                    {handle}
                    <button type="button" className={`te-fold${isFolded ? " closed" : ""}`} aria-expanded={!isFolded} aria-label={`${isFolded ? "Show" : "Hide"} the fields of ${groupLabel(g.name)}`}
                      onClick={() => setFolded((x) => (isFolded ? x.filter((n) => n !== g.name) : [...x, g.name]))}><Icon name="chevron" size={14} /></button>
                    <GroupName name={g.name} onRename={(to) => renameGroup(g.name, to)} />
                    <SendToMenu what={`“${groupLabel(g.name)}”`} targets={targetsFor(g.fields.map((f) => f.key))} canMove={g.fields.length < ordered.length}
                      onSend={(to, mode) => sendFields(g.fields.map((f) => f.key), `“${groupLabel(g.name)}”`, to, mode)} />
                    <span className="te-count">{g.fields.length === 1 ? "1 field" : `${g.fields.length} fields`}</span>
                  </div>
                  <Collapse open={!isFolded}>
                    <SortableList items={g.fields} id={(f) => f.key} name={(f) => f.label || "New field"} label={`Fields of ${groupLabel(g.name)}`}
                      className="te-fields" itemTestId="field"
                      onReorder={(from, to) => writeGroups(groups.map((x) => (x === g ? { ...x, fields: move(x.fields, from, to) } : x)))}
                      render={(f, fieldHandle) => {
                        const n = `Field ${number(f.key)}`;
                        const open = openKeys.includes(f.key);
                        const shows = (f.scope === "global" ? SHOW_GLOBAL : SHOW_PERSON);
                        const pin = PIN[f.display ?? "auto"];
                        const meta = f.type === "list" && f.fields.length ? `List · ${f.fields.length} columns`
                          : !f.display || f.display === "auto" || pin ? TYPES.find((t) => t.value === f.type)?.label : shows.find((x) => x.value === f.display)?.label;
                        return (
                          <div className={`te-field${open ? " open" : ""}`}>
                            <div className="te-field-row">
                              {fieldHandle}
                              <button type="button" className="te-field-main" aria-expanded={open} onClick={() => toggleOpen(f.key)}>
                                <span className="te-field-icon">{isIconName(f.icon) ? <Icon name={f.icon} size={15} /> : <Icon name="dots" size={15} />}</span>
                                <span className="te-field-label" data-testid="field-label">{userMacro(f.label) || <i className="muted">New field</i>}</span>
                                {pin && <span className="te-pin">{pin}</span>}
                                <span className="te-meta">{meta}</span>
                                <span className={`te-chev${open ? " open" : ""}`}><Icon name="chevron" size={13} /></span>
                              </button>
                              <SendToMenu what={`“${userMacro(f.label) || "New field"}”`} targets={targetsFor([f.key])} canMove={ordered.length > 1}
                                onSend={(to, mode) => sendFields([f.key], `“${userMacro(f.label) || "New field"}”`, to, mode)} />
                            </div>
                            <Collapse open={open}>
                              <FieldSettings f={f} n={n} groups={groups.map((x) => x.name)} shows={shows}
                                onChange={(patch) => setField(f.key, patch)} onStep={(d) => step(f.key, d)} onRemove={() => removeField(f.key)} />
                            </Collapse>
                          </div>
                        );
                      }} />
                    <button type="button" className="te-add" aria-label={`Add Field to ${groupLabel(g.name)}`} onClick={() => addField(g.name)}>
                      <Icon name="plus" size={13} />Add field
                    </button>
                  </Collapse>
                </div>
              );
            }} />
          <button type="button" className="te-add-group" onClick={addGroup}><Icon name="plus" size={13} />Add group</button>
          {exists && (
            <div className="editor-actions">
              <p className="hint">To use it, open a session and switch it on in the Scene panel.</p>
              <span className="spacer" />
              <ConfirmButton label="Delete Tracker" confirmLabel="Click Again to Delete" onConfirm={() => void onDelete(draft.id)} />
            </div>
          )}
        </div>

        <aside className="te-preview" aria-label="Preview">
          <div className="te-preview-head">
            <span className="grow">{sample ? <>Preview · <b>{sample.sessionName}</b></> : "Preview"}</span>
            <Help text="What the Scene panel will show with these fields, using the latest values of a session where this tracker is on. It follows your changes before you save. The field open on the left is highlighted." />
          </div>
          {sample === undefined && <p className="pane-note">Loading…</p>}
          {sample === null && <p className="pane-note">Switch this tracker on in a session and send a message: the preview then shows its real values here.</p>}
          {sample && <TrackerPreview schema={previewSchema} values={sample.values} cast={sample.cast} avatars={avatars} focusKey={openKey} />}
        </aside>
      </div>
    </div>
  );
}

/** A group's name, edited in place (Enter or leaving the box keeps it; Esc puts it back). */
function GroupName({ name, onRename }: { name: string; onRename: (to: string) => void }) {
  const [v, setV] = useState(name);
  useEffect(() => setV(name), [name]);
  return (
    <input className="te-group-name" value={v} placeholder="Without a group" aria-label={`Group ${groupLabel(name)} name`} title="Rename the group"
      onChange={(e) => setV(e.target.value)} onBlur={() => onRename(v)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(name); (e.target as HTMLInputElement).blur(); } }} />
  );
}

/** One field's settings, opened under its row. */
function FieldSettings({ f, n, groups, shows, onChange, onStep, onRemove }: {
  f: TrackerField; n: string; groups: string[]; shows: typeof SHOW_PERSON;
  onChange: (patch: Partial<TrackerField>) => void; onStep: (dir: -1 | 1) => void; onRemove: () => void;
}) {
  const display = f.display ?? "auto";
  const autoLooks = f.scope === "global" ? "block" : f.type === "number" || f.type === "meter" ? "tile" : "block";
  return (
    <div className="te-settings">
      <div className="field-row">
        <input placeholder="Field name" value={f.label} aria-label={`${n} name`} onChange={(e) => onChange({ label: e.target.value })} />
        <select value={f.type} aria-label={`${n} type`} onChange={(e) => onChange({ type: e.target.value as FieldType })}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <Help text={TYPES.find((t) => t.value === f.type)?.help ?? ""} />
        <select value={f.scope} aria-label={`${n} scope`} title="Who has this value" onChange={(e) => onChange({ scope: e.target.value as TrackerField["scope"], display: undefined })}>
          {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <Help text={SCOPE_HELP} />
        <select value={f.section} aria-label={`${n} group`} title="The group this field is in" onChange={(e) => onChange({ section: e.target.value })}>
          {groups.map((g) => <option key={g} value={g}>{groupLabel(g)}</option>)}
        </select>
      </div>
      {(f.type === "number" || f.type === "meter") && (
        <div className="field-row">
          <span className="label-row muted">Lowest <Help text="The AI's values are kept at or above this. Empty = no limit (a bar uses 0)." /></span>
          <input className="num" type="number" value={f.min ?? ""} aria-label={`${n} lowest`} placeholder={f.type === "meter" ? "0" : ""}
            onChange={(e) => onChange({ min: numOrUndef(e.target.value) })} />
          <span className="label-row muted">Highest <Help text="The AI's values are kept at or below this. Empty = no limit (a bar uses 100)." /></span>
          <input className="num" type="number" value={f.max ?? ""} aria-label={`${n} highest`} placeholder={f.type === "meter" ? "100" : ""}
            onChange={(e) => onChange({ max: numOrUndef(e.target.value) })} />
        </div>
      )}
      {f.type === "status" && (
        <div className="field-row">
          <span className="label-row muted">Options <Help text="The values this status can have, separated by commas. The AI must pick one of them." /></span>
          <input className="grow" value={f.options.join(",")} aria-label={`${n} options`} onChange={(e) => onChange({ options: e.target.value.split(",") })} />
        </div>
      )}
      <div className="te-label">{f.scope === "global" ? "Shows in the Scene panel as" : "Shows on the person's page as"}</div>
      <div className="te-shows" role="radiogroup" aria-label={`${n} show as`}>
        {shows.map((s) => {
          const on = display === s.value;
          return (
            <button key={s.value} type="button" role="radio" aria-checked={on} className={`te-show${on ? " on" : ""}`} title={s.note} onClick={() => onChange({ display: s.value === "auto" ? undefined : s.value })}>
              <span className="te-sketch" aria-hidden>
                {(SKETCH[s.value === "auto" ? autoLooks : s.value] ?? SKETCH.auto!).map(([a, x, y, w, h], i) => (
                  <i key={i} className={a ? "a" : ""} style={{ left: `${x}%`, top: y, width: `${w}%`, height: h }} />
                ))}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>
      <p className="te-show-note">{shows.find((s) => s.value === display)?.note}</p>
      <div className="field-row">
        <span className="label-row muted">Icon</span>
        <select value={f.icon ?? ""} aria-label={`${n} icon`} onChange={(e) => onChange({ icon: e.target.value || undefined })}>
          <option value="">None</option>
          {FIELD_ICONS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        {isIconName(f.icon) && <Icon name={f.icon} size={14} />}
      </div>
      <div className="te-label">What the AI should write here — and when to leave it empty <Help text="Sent to the AI with this field, word for word. Say what goes here, a unit, what a high value means — and when NOT to fill it (e.g. 'Only for characters who use magic; leave it empty for everyone else'). Also shown by the field's '?' in the panel." /></div>
      <textarea rows={2} className="te-hint" placeholder={f.scope === "global" ? "e.g. In-world time, like 'dusk, day 3'." : "e.g. Only for characters who use magic. Leave it empty for anyone who doesn't."} value={f.help} aria-label={`${n} hint`} onChange={(e) => onChange({ help: e.target.value })} />
      <div className="te-label">What it means in the story <Help text="Sent to the story's AI under the values, once (not per character), so a number like 'Stamina: 1' means something. Say what high and low values mean and what changes them, e.g. 'Spent by running and fighting; at 0 they collapse; rest brings it back.' Empty = nothing is sent." /></div>
      <textarea rows={2} className="te-hint" placeholder="e.g. 0–10. Fighting and running spend it; at 0 they collapse. A night's rest brings it back to 10."
        value={f.note ?? ""} aria-label={`${n} story note`} onChange={(e) => onChange({ note: e.target.value || undefined })} />
      {f.type === "list" && (
        <div className="columns-box">
          <span className="label-row muted">Columns <Help text="Leave empty for a list of short items. Add columns to make each item a row (e.g. Title, Status, Note)." /></span>
          <FieldList fields={f.fields} onChange={(cols) => onChange({ fields: cols })} prefix={`${n} column`} column />
          <button className="link" onClick={() => onChange({ fields: [...f.fields, blankField()] })}>Add Column</button>
        </div>
      )}
      <div className="field-row">
        <label className="check">
          <input type="checkbox" checked={f.required} onChange={(e) => onChange({ required: e.target.checked })} />
          Always filled <Help text="On: the AI must fill it as soon as it applies (e.g. when a character appears) and never leaves it empty. Off: optional — the AI leaves it out when it doesn't apply (a character who doesn't use magic has no Mana), and the panel lists it under 'Not used'. Say when it doesn't apply in the field's note." />
        </label>
        <label className="check">
          <input type="checkbox" checked={f.lockedForAgents} onChange={(e) => onChange({ lockedForAgents: e.target.checked })} />
          Only I change it <Help text="The AI can read this value but never changes it. Only you edit it in the Scene panel." />
        </label>
        <label className="check">
          <input type="checkbox" checked={f.toPrompt} onChange={(e) => onChange({ toPrompt: e.target.checked })} />
          Send to the AI <Help text="The current value goes into the prompt of the story's replies (in a short 'Current scene' part), so the AI writes with it in mind." />
        </label>
        <span className="spacer" />
        <button className="link" onClick={() => onStep(-1)} aria-label={`Move ${n} up`}>↑ Move up</button>
        <button className="link" onClick={() => onStep(1)} aria-label={`Move ${n} down`}>↓ Move down</button>
        <button className="link danger-link" onClick={onRemove}>Remove Field</button>
      </div>
    </div>
  );
}

/** The fields of a set, or the columns of a list field (`column`: no scope, section, lock, required, prompt). */
function FieldList({ fields, onChange, prefix, column = false }: {
  fields: TrackerField[]; onChange: (f: TrackerField[]) => void; prefix: string; column?: boolean;
}) {
  const setField = (i: number, patch: Partial<TrackerField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...fields];
    const [f] = next.splice(i, 1);
    next.splice(i + dir, 0, f!);
    onChange(next);
  };
  return (
    <ol className={column ? "field-list columns" : "field-list"} data-testid={column ? "column-list" : "field-list"}>
      {fields.map((f, i) => {
        const n = `${prefix} ${i + 1}`;
        return (
          <li key={i} className="field-card" data-testid={column ? "column" : "field"}>
            <div className="field-row">
              <input placeholder={column ? "Column name" : "Field name"} value={f.label} aria-label={`${n} name`} onChange={(e) => setField(i, { label: e.target.value })} />
              <select value={f.type} aria-label={`${n} type`} onChange={(e) => setField(i, { type: e.target.value as FieldType })}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <Help text={TYPES.find((t) => t.value === f.type)?.help ?? ""} />
              {!column && (
                <select value={f.scope} aria-label={`${n} scope`} onChange={(e) => setField(i, { scope: e.target.value as TrackerField["scope"] })}>
                  {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              )}
              {!column && (
                <input className="section-input" placeholder="Section (optional)" value={f.section} aria-label={`${n} section`}
                  title="Heading this field is shown under in the panel (e.g. Appearance)" onChange={(e) => setField(i, { section: e.target.value })} />
              )}
            </div>
            {(f.type === "number" || f.type === "meter") && (
              <div className="field-row">
                <span className="label-row muted">Lowest <Help text="The AI's values are kept at or above this. Empty = no limit (a bar uses 0)." /></span>
                <input className="num" type="number" value={f.min ?? ""} aria-label={`${n} lowest`} placeholder={f.type === "meter" ? "0" : ""}
                  onChange={(e) => setField(i, { min: numOrUndef(e.target.value) })} />
                <span className="label-row muted">Highest <Help text="The AI's values are kept at or below this. Empty = no limit (a bar uses 100)." /></span>
                <input className="num" type="number" value={f.max ?? ""} aria-label={`${n} highest`} placeholder={f.type === "meter" ? "100" : ""}
                  onChange={(e) => setField(i, { max: numOrUndef(e.target.value) })} />
              </div>
            )}
            {f.type === "status" && (
              <div className="field-row">
                <span className="label-row muted">Options <Help text="The values this status can have, separated by commas. The AI must pick one of them." /></span>
                <input className="grow" value={f.options.join(",")} aria-label={`${n} options`}
                  onChange={(e) => setField(i, { options: e.target.value.split(",") })} />
              </div>
            )}
            {!column && (
              <div className="field-row">
                <span className="label-row muted">Show as <Help text="How the Scene panel shows this value (the AI doesn't see this). Auto = by type. Top strip = the line at the top of the panel (date, place, weather; one value per tracker, not per character). Under the name = the small line under a character's name. Lead = plain text or chips at the top of the card. Pill = a rounded line with an icon (mood). Line = a compact icon + text row (where, doing). Tile = a small box, three per line (age, level). Block = a coloured label over the text (face, outfit). Note = italic, at the end." /></span>
                <select value={f.display ?? "auto"} aria-label={`${n} show as`} onChange={(e) => setField(i, { display: e.target.value === "auto" ? undefined : e.target.value as FieldDisplay })}>
                  {DISPLAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <span className="label-row muted">Icon</span>
                <select value={f.icon ?? ""} aria-label={`${n} icon`} onChange={(e) => setField(i, { icon: e.target.value || undefined })}>
                  <option value="">None</option>
                  {FIELD_ICONS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                {isIconName(f.icon) && <Icon name={f.icon} size={14} />}
                <span className="label-row muted">Color <Help text="Colour of the label in the panel. Empty = a colour made from the field's name." /></span>
                <input type="color" aria-label={`${n} color`} value={f.color && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : "#9aa3ad"} onChange={(e) => setField(i, { color: e.target.value })} />
                {f.color && <button className="link quiet" onClick={() => setField(i, { color: undefined })}>Clear</button>}
              </div>
            )}
            <div className="field-row">
              <input className="grow" placeholder="Hint for the AI (optional)" value={f.help} aria-label={`${n} hint`} onChange={(e) => setField(i, { help: e.target.value })} />
              <Help text="Extra explanation the AI gets about this field, e.g. what a high value means or a unit to use. Also shown by the field's '?' in the panel." />
            </div>
            {f.type === "list" && !column && (
              <div className="columns-box">
                <span className="label-row muted">Columns <Help text="Leave empty for a list of short items. Add columns to make each item a row (e.g. Title, Status, Note)." /></span>
                <FieldList fields={f.fields} onChange={(cols) => setField(i, { fields: cols })} prefix={`${n} column`} column />
                <button className="link" onClick={() => setField(i, { fields: [...f.fields, blankField()] })}>Add Column</button>
              </div>
            )}
            <div className="field-row">
              {!column && (
                <>
                  <label className="check">
                    <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                    Always filled <Help text="On: the AI must fill it as soon as it applies (e.g. when a character appears) and never leaves it empty. Off: optional — the AI leaves it out when it doesn't apply (a character who doesn't use magic has no Mana), and the panel lists it under 'Not used'. Say when it doesn't apply in the field's note." />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={f.lockedForAgents} onChange={(e) => setField(i, { lockedForAgents: e.target.checked })} />
                    Only I change it <Help text="The AI can read this value but never changes it. Only you edit it in the Scene panel." />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={f.toPrompt} onChange={(e) => setField(i, { toPrompt: e.target.checked })} />
                    Send to the AI <Help text="The current value goes into the prompt of the story's replies (in a short 'Current scene' part), so the AI writes with it in mind." />
                  </label>
                </>
              )}
              <span className="spacer" />
              <button className="link" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${n} up`}>↑</button>
              <button className="link" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${n} down`}>↓</button>
              <button className="link" onClick={() => onChange(fields.filter((_, j) => j !== i))}>{column ? "Remove Column" : "Remove Field"}</button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
