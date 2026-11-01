// Homunculus 2 — the Scene panel: the session's trackers, drawn only from their field sets.
// Author: CLAUDE, 2026-10-27 (proof of concept, BLUEPRINT §10); field sets, sections, rows, people (D-017) same day.
// 2026-10-28 (D-025): direction "C — Quiet", picked by Daniel on the mockup canvas ("Homunculus 2 — UI mockups",
// project/SceneQuiet.dc.html). Grouped lists like the system Settings, no tabs, one accent:
//   Now (the fields shown as "Top strip": place, time, weather) → In the scene (one row per person: picture, name,
//   what they are doing; a dot when this message changed something) → each tracker's other values as their own
//   groups (Quests, Factions, Items…) → Not in the scene. A person's row opens their PAGE (it slides in; "‹ Scene"
//   or Esc goes back): name and the line under it, the lead text, then groups — Right now, the numbers, one group per
//   section, lists with columns, Notes. Which group a field lands in comes from its data (display / section), never
//   from a field name in this file. Click any value to change it (Enter saves, Esc cancels).
// 2026-10-29 (Daniel: "como no v1"): the cast works like Homunculus v1's (`classic-scene.js` `renderCast`,
// `characterCard`, `moveCharacter`): a person opens IN PLACE (no page change), "Show All / Fold All", drag a person (⋮⋮ or
// arrow keys on it) to change the order — saved per chat — or into the other group to move them in or out of the scene,
// and an NPC can be removed from the cast.
// Values are as they are AT the message on screen (swipes and branches show their own); a change made here is saved
// as the user's change at that message (it wins over the tracker).
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AgentRun, Avatar, Npc, Session, SetupLayer, StateDelta, TrackerField, TrackerSchema } from "@homunculus/schemas";
import {
  applyBasicMacros, applyInto, briefFields, castOf, ensembleCards, userInStory, DEFAULT_USER_NAME, formatFieldValue, PAIR, trackerPeople, USER_ID, type ListItem, type ResolvedState, type TrackerCastMember,
} from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { fieldSetOf, isOnIn, type Tracker } from "../trackers.ts";
import { Help } from "./Help.tsx";
import { Collapse, Icon, IconButton, Segmented, Switch } from "./kit.tsx";
import { move, SortableList } from "./Sortable.tsx";
import { AvatarDot } from "./Sidebar.tsx";
import { EASE_IN_OUT, EASE_OUT, flash, popIn, reducedMotion } from "./motion.ts";

interface View {
  state: ResolvedState;
  /** The state right before the message on screen (to mark what this message changed). */
  before: ResolvedState | null;
  /** What the trackers alone made of this message (before + their delta): a value is "yours" only where you changed it. */
  agents: ResolvedState | null;
  userDelta: StateDelta;
  runs: AgentRun[];
  cast: TrackerCastMember[];
  /** False in Director mode: the user is not one of the people (D-031). */
  withUser: boolean;
  /** NPCs added to this chat (they can be taken out of it) and the names of the story's NPCs (those stay: Story Page). */
  chatNpcs: Npc[];
  storyNpcNames: string[];
  /** Cards of this chat that hold several characters (D-065): sent to the AI, followed as their people. */
  ensembles: string[];
}

/** One line of the cast list: a group's title (a place to drop people) or a person. */
type CastItem = { kind: "head"; group: "here" | "away"; count: number } | { kind: "person"; p: Person };

type Obj = Record<string, unknown>;

/** Everything a value needs to be shown and changed. */
interface Cell { t: Tracker; f: TrackerField; value: unknown; was: unknown; mine: boolean; commit: (v: unknown) => void }

/** A person (or a pair) of one tracker, with the accessors for their values. */
interface Person { key: string; t: Tracker; schema: TrackerSchema; id: string; name: string; you: boolean; here: boolean; pair: boolean; cells: Cell[] }

export function ScenePanel({ svc, session, storySetup, messageId, busy, refreshKey, trackers, connection, avatars, onToggle, onPickSet, onEditTracker, onNewTracker, onChanged, onChangeSession, onSaveToVault }: {
  svc: AppServices;
  session: Session;
  /** The story's layer, for a story chat: trackers it turns on are on here too (D-031). */
  storySetup?: SetupLayer | undefined;
  /** The last message on screen; values are shown as they are right after it. */
  messageId: string | null;
  /** A turn is running (values may still change). */
  busy: boolean;
  refreshKey: number;
  trackers: Tracker[];
  connection: ConnectionState;
  avatars: Record<string, Avatar>;
  onToggle: (trackerId: string, on: boolean) => void;
  onPickSet: (trackerId: string, setId: string | null) => void;
  onEditTracker: (trackerId: string) => void;
  onNewTracker: () => void;
  onChanged: () => void;
  /** Saves the session (taking an NPC out of this chat). */
  onChangeSession?: ((s: Session) => void) | undefined;
  /** "Save to the Vault" for someone the tracker brought in (round 3, D-036). */
  onSaveToVault?: ((d: { name: string; schemaId: string; values: Record<string, unknown> }) => void) | undefined;
}) {
  const [view, setView] = useState<View | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [menu, setMenu] = useState(false);
  /** People shown open (by "<tracker>/<id>"), remembered across chats like v1's cards; the cast order of this chat. */
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([svc.store.getAppSetting<Record<string, boolean>>("sceneOpenCards"), svc.store.getAppSetting<string[]>(`castOrder:${session.id}`)])
      .then(([o, ord]) => { if (!cancelled) { setOpenCards(o ?? {}); setOrder(ord ?? []); } });
    return () => { cancelled = true; };
  }, [svc, session.id]);
  const saveOpen = (next: Record<string, boolean>) => { setOpenCards(next); void svc.store.setAppSetting("sceneOpenCards", next); };
  const saveOrder = (next: string[]) => { setOrder(next); void svc.store.setAppSetting(`castOrder:${session.id}`, next); };
  /** The open tab under "Now": "cast" (the people) or a group ("<tracker>/<title>"). */
  const [tab, setTab] = useState("cast");
  const enabled = trackers.filter((t) => isOnIn(session, t.agent.id, storySetup));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const message = messageId ? await svc.store.getMessage(messageId) : undefined;
      const story = session.storyId ? await svc.store.getStory(session.storyId) : undefined;
      const [state, before, userDelta, runs, cast, withUser, chatNpcs, storyNpcs, agentDelta, ensembles] = await Promise.all([
        svc.core.state.resolve(session.id, messageId),
        message ? svc.core.state.resolve(session.id, message.parentId) : Promise.resolve(null),
        messageId ? svc.store.getUserDelta(messageId).then((d) => d ?? {}) : Promise.resolve({}),
        messageId ? svc.store.listAgentRuns(messageId) : Promise.resolve([]),
        castOf(svc.store, session),
        userInStory(svc.store, session),
        svc.store.npcsForUse(session.npcIds),
        story ? svc.store.npcsForUse(story.npcIds) : Promise.resolve([]),
        messageId ? svc.store.getDelta(messageId) : Promise.resolve(undefined),
        ensembleCards(svc.store, session),
      ]);
      // (a whole field is saved when you change one person's value in it, so "yours" is checked per person)
      const agents = before ? structuredClone(before) : {};
      if (agentDelta) applyInto(agents, agentDelta);
      if (!cancelled) setView({ state, before, agents, userDelta, runs, cast, withUser, chatNpcs, storyNpcNames: storyNpcs.map((n) => n.name), ensembles });
    })();
    return () => { cancelled = true; };
  }, [svc, session, messageId, refreshKey, tick]);

  const edit = async (t: Tracker, key: string, value: unknown) => {
    if (!messageId) return;
    setError("");
    try {
      await svc.chat.editState(messageId, { [t.agent.id]: { [key]: value as never } });
      setTick((x) => x + 1);
      onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const run = async (list: Tracker[]) => {
    if (!messageId) return;
    setError("");
    for (const t of list) {
      setRunning(t.agent.id);
      try {
        await svc.chat.turns.runManual(session.id, t.agent.id, messageId, connection.forRequest().connection, undefined, connection.forRequest().connections);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    }
    setRunning(null);
    setTick((x) => x + 1);
    onChanged();
  };

  const schemaOf = (t: Tracker) => t.sets.find((s) => s.id === fieldSetOf(session, t.agent.id, storySetup)) ?? t.sets.find((s) => s.id === t.agent.state?.schemaId) ?? t.sets[0]!;
  const disabled = !messageId;

  // ---- what to show, from the field sets
  const cell = (t: Tracker, f: TrackerField, get: (o: Obj | undefined) => unknown, set: (v: unknown) => unknown, mine: boolean): Cell => ({
    t, f, value: get(view?.state[t.agent.id]), was: get(view?.before?.[t.agent.id] ?? undefined), mine,
    commit: (v) => void edit(t, f.key, set(v)),
  });
  const header: Cell[] = [];
  const people: Person[] = [];
  const groups: Array<{ t: Tracker; title: string; cells: Cell[]; list?: Cell }> = [];
  const withPeople = new Set<string>();
  if (view) {
    for (const t of enabled) {
      const schema = schemaOf(t);
      const values = view.state[t.agent.id] ?? {};
      const mine = view.userDelta[t.agent.id] ?? {};
      const globals = schema.fields.filter((f) => f.scope === "global");
      for (const f of globals.filter((x) => x.display === "header")) header.push(cell(t, f, (o) => o?.[f.key], (v) => v, f.key in mine));
      // other global values: a list gets its own group (titled by the field); single values group by section
      const bySection = new Map<string, Cell[]>();
      for (const f of globals.filter((x) => x.display !== "header")) {
        const c = cell(t, f, (o) => o?.[f.key], (v) => v, f.key in mine);
        if (f.type === "list") { groups.push({ t, title: userMacro(f.label), cells: [], list: c }); continue; }
        const title = f.section || shortName(t.agent.name);
        bySection.set(title, [...(bySection.get(title) ?? []), c]);
      }
      // single values first, then the lists (the mockup: what/where/when before goals and items)
      const lists = groups.splice(groups.length - globals.filter((x) => x.display !== "header" && x.type === "list").length);
      for (const [title, cells] of bySection) groups.push({ t, title, cells });
      groups.push(...lists);
      // people (one per character) and pairs
      const perChar = schema.fields.filter((f) => f.scope === "perCharacter");
      const perPair = schema.fields.filter((f) => f.scope === "perPair");
      if (perChar.length || perPair.length) withPeople.add(t.agent.id);
      const cast = trackerPeople(schema, values, view.cast, DEFAULT_USER_NAME, view.withUser);
      const byTrackers = (view.agents?.[t.agent.id] ?? {}) as Obj;
      const personCells = (id: string, fields: TrackerField[]) => fields.map((f) => {
        const yours = ((mine[f.key] ?? {}) as Obj)[id];
        const theirs = ((byTrackers[f.key] ?? {}) as Obj)[id];
        return cell(t, f, (o) => ((o?.[f.key] ?? {}) as Obj)[id], (v) => ({ ...((view.state[t.agent.id]?.[f.key] ?? {}) as Obj), [id]: v }),
          yours !== undefined && JSON.stringify(yours) !== JSON.stringify(theirs ?? null));
      });
      if (perChar.length) {
        for (const p of cast) {
          people.push({ key: `${t.agent.id}/${p.id}`, t, schema, id: p.id, name: p.name, you: p.id === USER_ID, pair: false,
            here: presentOf(schema, values, p.id) !== false, cells: personCells(p.id, perChar) });
        }
      }
      if (perPair.length) {
        const has = new Set(perPair.flatMap((f) => Object.keys((values[f.key] ?? {}) as Obj)));
        for (const a of cast) for (const b of cast) {
          const id = `${a.id}${PAIR}${b.id}`;
          if (a === b || !(cast.length <= 4 || has.has(id))) continue;
          people.push({ key: `${t.agent.id}/${id}`, t, schema, id, name: `${a.name} ${PAIR} ${b.name}`, you: false, pair: true, here: true, cells: personCells(id, perPair) });
        }
      }
    }
  }
  // the order you dragged them into (new people keep the tracker's order, after those) — v1 `sortByOrder`
  const rank = new Map(order.map((k, i) => [k, i]));
  const sorted = people.map((p, i) => ({ p, r: rank.get(p.key) ?? order.length + i })).sort((a, b) => a.r - b.r).map((x) => x.p);
  const here = sorted.filter((p) => p.here && !p.pair);
  const away = sorted.filter((p) => !p.here && !p.pair);
  const pairs = people.filter((p) => p.pair);
  const hasPresence = enabled.some((t) => !!schemaOf(t).presence);
  const filled = (g: (typeof groups)[number]) => (g.list ? !isEmpty(g.list.f, g.list.value) : g.cells.some((c) => !isEmpty(c.f, c.value)));
  // "Now" at the top, one group (mockup C): the fields shown as "Top strip"; when no field is (trackers made before
  // D-024, or edited), every single global value (time, place, weather…) — grouped by section, see nowRows.
  const topCells = header.length ? [] : groups.filter((g) => !g.list).flatMap((g) => g.cells);
  const now = header.length ? headerRows(header) : nowRows(topCells);
  const bodyGroups = groups.filter((g) => (header.length ? true : !!g.list) && filled(g));
  // under "Now", tabs like the roster mockup: Cast N · Quests 3 · Items 3 · Factions…
  const groupId = (g: (typeof groups)[number]) => `${g.t.agent.id}/${g.title}`;
  const hasCast = here.length + away.length + pairs.length > 0;
  const tabs = [
    ...(hasCast ? [{ value: "cast", label: `Cast ${here.length + away.length}`, testId: "scene-tab-cast" }] : []),
    ...bodyGroups.map((g) => {
      const n = g.list && Array.isArray(g.list.value) ? g.list.value.length : 0;
      return { value: groupId(g), label: n ? `${g.title} ${n}` : g.title, testId: `scene-tab-${g.t.agent.id}-${g.title.toLowerCase().replace(/\W+/g, "-")}` };
    }),
  ];
  const active = tabs.some((x) => x.value === tab) ? tab : (tabs[0]?.value ?? "cast");

  // ---- the cast list (v1 `renderCast`): with "here / away" the two groups are titles inside ONE sortable list, so
  // dragging someone past a title moves them in or out of the scene
  const castItems: CastItem[] = hasPresence
    ? [{ kind: "head", group: "here", count: here.length }, ...here.map((p) => ({ kind: "person" as const, p })),
       { kind: "head", group: "away", count: away.length }, ...away.map((p) => ({ kind: "person" as const, p }))]
    : [...here, ...away].map((p) => ({ kind: "person" as const, p }));
  const groupTitle = (g: "here" | "away") => (g === "here" ? "In the scene" : "Not in the scene");
  /** Rounded corners where a group starts and ends (titles split the list into groups). */
  const edgeOf = (i: number) => `${castItems[i - 1]?.kind !== "person" ? " first" : ""}${castItems[i + 1]?.kind !== "person" ? " last" : ""}`;
  const castPeople = [...here, ...away, ...pairs];
  const anyOpen = castPeople.some((p) => openCards[p.key]);
  const foldAll = (show: boolean) => saveOpen({ ...openCards, ...Object.fromEntries(castPeople.map((p) => [p.key, show])) });
  const foldAllButton = (
    <button type="button" className="link quiet q-fold-all" data-testid="fold-all" onClick={() => foldAll(!anyOpen)}
      title={anyOpen ? "Fold every person to one line" : "Show the details of every person"}>
      <span className={`q-fold-ico${anyOpen ? " up" : ""}`} aria-hidden><Icon name="chevron" size={11} /></span>{anyOpen ? "Fold All" : "Show All"}
    </button>
  );

  const reorder = (from: number, to: number) => {
    const next = move(castItems, from, to);
    const moved = next[to];
    saveOrder(next.flatMap((it) => (it.kind === "person" ? [it.p.key] : [])));
    if (!moved || moved.kind !== "person" || !hasPresence) return;
    // the group it landed in: the last title above it (above every title = the first group)
    const head = next.slice(0, to).reverse().find((it) => it.kind === "head");
    const toHere = !head || head.group === "here";
    if (toHere !== moved.p.here) setPresent(moved.p, toHere);
  };

  /** In or out of the scene: the tracker's presence field for this person (v1 `moveCharacter` → `item.present`). */
  const setPresent = (p: Person, toHere: boolean) => {
    const pres = p.schema.presence;
    if (!pres || !view) return;
    const f = p.schema.fields.find((x) => x.key === pres.field);
    const awayValue = f?.options.find((o) => o.toLowerCase() !== pres.value.toLowerCase()) ?? "away";
    const all = (view.state[p.t.agent.id]?.[pres.field] ?? {}) as Obj;
    void edit(p.t, pres.field, { ...all, [p.id]: toHere ? pres.value : awayValue });
  };

  /** An NPC can leave the cast: one the tracker brought in, or one added to this chat (the story's own stay: Story Page). */
  const removable = (p: Person) => !!view && !p.you && !p.pair && p.id.startsWith("n:") && !view.storyNpcNames.includes(p.name)
    && (!!messageId || view.chatNpcs.some((n) => `n:${n.name}` === p.id));
  /** Someone the tracker brought in, not a Vault NPC yet: can be saved to the Vault. */
  const savable = (p: Person) => !!view && !!onSaveToVault && !p.you && !p.pair && p.id.startsWith("n:") && !view.storyNpcNames.includes(p.name)
    && !view.chatNpcs.some((n) => `n:${n.name}` === p.id);
  const saveToVault = (p: Person) => onSaveToVault?.({ name: p.name, schemaId: p.schema.id,
    values: Object.fromEntries(p.cells.filter((c) => !isEmpty(c.f, c.value)).map((c) => [c.f.key, c.value])) });
  const removePerson = async (p: Person) => {
    if (!view) return;
    setError("");
    const npc = view.chatNpcs.find((n) => `n:${n.name}` === p.id);
    if (npc && onChangeSession) onChangeSession({ ...session, npcIds: session.npcIds.filter((x) => x !== npc.id) });
    // their values at this message go too (else a tracker that keeps anyone would still list them)
    if (messageId) {
      const delta: StateDelta = {};
      for (const t of enabled) {
        const values = view.state[t.agent.id] ?? {};
        for (const f of schemaOf(t).fields) {
          if (f.scope === "global") continue;
          const obj = values[f.key];
          if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
          const keep = Object.entries(obj as Obj).filter(([k]) => (f.scope === "perPair" ? !k.split(PAIR).includes(p.id) : k !== p.id));
          if (keep.length === Object.keys(obj as Obj).length) continue;
          (delta[t.agent.id] ??= {})[f.key] = Object.fromEntries(keep) as never;
        }
      }
      try {
        if (Object.keys(delta).length) await svc.chat.editState(messageId, delta);
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    }
    saveOrder(order.filter((k) => k !== p.key));
    setTick((x) => x + 1);
    onChanged();
  };

  const switches = (
    <div className="tracker-switch-list" data-testid="tracker-toggles">
      {trackers.map((t) => {
        const on = isOnIn(session, t.agent.id, storySetup);
        const schema = schemaOf(t);
        return (
          <div key={t.agent.id} className="tracker-switch">
            <span className="tracker-switch-name">{t.agent.name}</span>
            {on && t.sets.length > 1 && (
              <select className="set-select" aria-label={`${t.agent.name} field set`} value={schema.id} title="Which field set this session uses. Values of fields with the same name carry over."
                onChange={(e) => onPickSet(t.agent.id, e.target.value === t.agent.state?.schemaId ? null : e.target.value)}>
                {t.sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <IconButton label={`Edit ${t.agent.name}`} className="small" onClick={() => { setMenu(false); onEditTracker(t.agent.id); }}><Icon name="pencil" size={13} /></IconButton>
            <Switch label={t.agent.name} checked={on} onChange={(v) => onToggle(t.agent.id, v)} />
          </div>
        );
      })}
      <button className="link tracker-new" onClick={() => { setMenu(false); onNewTracker(); }}>+ New Tracker</button>
    </div>
  );

  return (
    <div className="pane scene-pane quiet" aria-label="Scene" data-testid="scene">
      <header className="q-top">
        <span className="grow">{busy ? <span className="updating-chip" data-testid="scene-busy"><span className="spinner" aria-hidden />Updating…</span> : "Scene"}</span>
        {enabled.length > 0 && (
          <IconButton label="Update Now" disabled={!messageId || busy || running !== null} onClick={() => void run(enabled)}>
            <span className={running ? "spin-icon" : ""}><Icon name="refresh" size={14} /></span>
          </IconButton>
        )}
        {enabled.length > 0 && (
          <span className="menu-anchor">
            <IconButton label="Trackers" aria-expanded={menu} aria-haspopup="true" onClick={() => setMenu((v) => !v)}><Icon name="gear" size={14} /></IconButton>
            {menu && <Popover onClose={() => setMenu(false)}><div className="popover-title">Trackers in this session</div>{switches}</Popover>}
          </span>
        )}
        <Help text="What the trackers know at the message on screen: swipe or go back and it follows. Click a person to open everything about them right there (Show All opens everyone). Drag a person by ⋮⋮ (or focus ⋮⋮ and use the arrow keys) to change the order, or into the other group to move them in or out of the scene. Click any value to change it; your change wins over the tracker's at that message. Update Now runs the trackers on this message again." />
      </header>

      {error && <div className="error-bar inline" role="alert">{error}</div>}

      {enabled.length === 0 && (
        <section className="q-empty">
          <p className="pane-note">{trackers.length ? "Switch on a tracker to follow this story: who is here, where, when, goals…" : "No trackers yet."}</p>
          {trackers.length ? <div className="q-group">{switches}</div> : <button className="link" onClick={onNewTracker}>Create One</button>}
        </section>
      )}

      {view && enabled.length > 0 && (
        <div className="q-list" key="list">
          {now.length > 0 && (
            <section data-testid="scene-header" aria-label="Now">
              <div className="q-gh">Now</div>
              <div className="q-group">{now.map((r) => <KeyValue key={r.label} label={r.label} cells={r.cells} disabled={disabled} serif />)}</div>
            </section>
          )}

          {tabs.length > 1 && (
            <div className="q-tabs"><Segmented tabs label="Scene sections" options={tabs} value={active} onChange={setTab} /></div>
          )}

          {active === "cast" && hasCast && (
            <section className="q-tab-body q-cast" key="cast" data-testid="scene-cast">
              {!hasPresence && <div className="q-cast-bar"><span className="q-gh">Characters</span>{foldAllButton}</div>}
              <SortableList items={castItems} id={(it) => (it.kind === "head" ? `head:${it.group}` : it.p.key)} label="Cast"
                name={(it) => (it.kind === "head" ? groupTitle(it.group) : it.p.name)} onReorder={reorder} className="q-cast-list"
                itemClassName={(it) => (it.kind === "head" ? "q-cast-head" : "")}
                render={(it, handle, st) => it.kind === "head"
                  ? <div className={`q-gh q-drop${it.count === 0 ? " empty" : ""}`} data-testid={`cast-group-${it.group}`}>
                      <span>{groupTitle(it.group)} · {it.count}</span>
                      {it.count === 0 && <span className="q-drop-hint">drag someone here</span>}
                      {it.group === "here" && <span className="q-gh-end">{foldAllButton}</span>}
                    </div>
                  : <PersonCard p={it.p} avatar={avatars[it.p.id]} handle={handle} edge={edgeOf(st.index)} open={!!openCards[it.p.key]} disabled={disabled}
                      onToggle={() => saveOpen({ ...openCards, [it.p.key]: !openCards[it.p.key] })}
                      onRemove={removable(it.p) ? () => void removePerson(it.p) : undefined}
                      onSave={savable(it.p) ? () => saveToVault(it.p) : undefined} />} />
              {pairs.length > 0 && (
                <>
                  <div className="q-gh">Between characters</div>
                  <div className="q-pairs">{pairs.map((p, i) => <PersonCard key={p.key} p={p} edge={`${i === 0 ? " first" : ""}${i === pairs.length - 1 ? " last" : ""}`} open={!!openCards[p.key]} disabled={disabled}
                    onToggle={() => saveOpen({ ...openCards, [p.key]: !openCards[p.key] })} />)}</div>
                </>
              )}
            </section>
          )}

          {view.ensembles.length > 0 && (active === "cast" || !hasCast) && (
            <p className="q-ensemble-note" data-testid="ensemble-note">
              <Icon name="info" size={13} />
              <span>{view.ensembles.map((n) => `“${n}”`).join(", ")} {view.ensembles.length === 1 ? "has" : "have"} several characters. {view.ensembles.length === 1 ? "Its card is" : "Their cards are"} sent whole; the people show here as the story brings them in.</span>
            </p>
          )}

          {enabled.map((t) => (
            <section key={t.agent.id} data-testid="tracker-card" data-tracker={t.agent.id} aria-label={t.agent.name} className="q-tracker">
              {bodyGroups.filter((g) => g.t === t && groupId(g) === active).map((g) => (
                <div key={g.title} className="q-section q-tab-body">
                  {g.list ? <ListGroup c={g.list} disabled={disabled} /> : (
                    <div className="q-group">{g.cells.filter((c) => !isEmpty(c.f, c.value)).map((c) => <KeyValue key={c.f.key} label={userMacro(c.f.label)} cells={[c]} disabled={disabled} />)}</div>
                  )}
                </div>
              ))}
            </section>
          ))}

          {/* how each tracker ran, all together at the end, quiet */}
          <section className={busy ? "q-runs updating" : "q-runs"} aria-label="Tracker runs">
            {enabled.map((t) => <RunInfo key={t.agent.id} t={t} runs={view.runs} messageId={messageId} busy={busy} running={running} onRun={() => void run([t])} />)}
          </section>
        </div>
      )}
    </div>
  );
}

/** "Scene: World" → "World". */
const shortName = (name: string) => (name.includes(": ") ? name.slice(name.indexOf(": ") + 2) : name);

/** "Now" without "Top strip" fields: the fields of one section become one row named after it when every value is short
 * ("Time: 14:10, afternoon, Day 1"); long values (a place, the weather) keep their own row. */
function nowRows(cells: Cell[]): Array<{ label: string; cells: Cell[] }> {
  const filledCells = cells.filter((c) => !isEmpty(c.f, c.value));
  const rows: Array<{ label: string; cells: Cell[] }> = [];
  const sections = new Map<string, Cell[]>();
  for (const c of filledCells) if (c.f.section) sections.set(c.f.section, [...(sections.get(c.f.section) ?? []), c]);
  const done = new Set<string>();
  for (const c of filledCells) {
    const sec = c.f.section;
    const same = sec ? sections.get(sec)! : [c];
    const short = same.length > 1 && same.every((x) => formatFieldValue(x.f, x.value).length <= 32);
    if (short && sec) {
      if (!done.has(sec)) { done.add(sec); rows.push({ label: sec, cells: same }); }
    } else rows.push({ label: userMacro(c.f.label), cells: [c] });
  }
  return rows;
}

/** Top-strip fields as rows: a field with an icon starts a row; one without joins the row before ("Otherworld, Day 1, 14:30, afternoon"). */
function headerRows(cells: Cell[]): Array<{ label: string; cells: Cell[] }> {
  const rows: Array<{ label: string; cells: Cell[] }> = [];
  for (const c of cells) {
    if (c.f.icon || !rows.length) rows.push({ label: userMacro(c.f.label), cells: [] });
    rows[rows.length - 1]!.cells.push(c);
  }
  // a row of several fields is named after their section ("Time"), one field after itself ("Location")
  return rows.map((r) => (r.cells.length > 1 && r.cells[0]!.f.section ? { ...r, label: r.cells[0]!.f.section } : r))
    .filter((r) => r.cells.some((c) => !isEmpty(c.f, c.value)));
}

/** One "label · value" row of a group. Several cells = one row ("14:30, afternoon"). */
function KeyValue({ label, cells, disabled, serif = false }: { label: string; cells: Cell[]; disabled: boolean; serif?: boolean }) {
  const changed = cells.some((c) => wasChanged(c.was, c.value));
  return (
    <div className={`q-kv${label ? "" : " solo"}`}>
      {label && <span className="q-k">{label}{cells.some((c) => c.f.help) && <Help text={userMacro(cells.find((c) => c.f.help)!.f.help)} />}</span>}
      <span className={`q-v${serif ? " serif" : ""}`}>
        {changed && <span className="q-chg" title="Changed with this message" />}
        {cells.filter((c) => !isEmpty(c.f, c.value) || cells.length === 1).map((c, i) => (
          <Val key={c.f.key} c={c} disabled={disabled} sep={i > 0} />
        ))}
      </span>
    </div>
  );
}

/** A value inside a row; glows once when it changes on screen. */
function Val({ c, disabled, sep = false }: { c: Cell; disabled: boolean; sep?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<string | null>(null);
  const key = JSON.stringify(c.value ?? null);
  useEffect(() => {
    if (prev.current !== null && prev.current !== key) flash(ref.current);
    prev.current = key;
  }, [key]);
  return (
    <span ref={ref} className="q-val" data-testid="field-value" data-field={c.f.key}>
      {sep && <span className="q-sep">, </span>}
      <EditableValue f={c.f} value={c.value} disabled={disabled} label={userMacro(c.f.label)} bare onCommit={c.commit} />
      {c.mine && <span className="edited-mark" title="You changed this value at this message"> ✎</span>}
      {c.f.lockedForAgents && <span className="muted" title="Only you change this value"> <Icon name="lock" size={10} /></span>}
    </span>
  );
}

/** A list field as a group: rows with columns become one row each (title, status on the right, the rest below); plain items one line. */
function ListGroup({ c, disabled }: { c: Cell; disabled: boolean }) {
  if (c.f.fields.length) {
    return (
      <div className="q-group" data-testid="field-value" data-field={c.f.key}>
        {c.mine && <span className="edited-mark q-mine" title="You changed this value at this message">✎</span>}
        <RowsView f={c.f} rows={Array.isArray(c.value) ? (c.value as Obj[]) : []} was={Array.isArray(c.was) ? (c.was as Obj[]) : []} disabled={disabled} onCommit={c.commit} />
      </div>
    );
  }
  return <div className="q-group"><KeyValue label="" cells={[c]} disabled={disabled} /></div>;
}

/** Rows of a list with columns, as rows of the group. */
function RowsView({ f, rows, was, disabled, onCommit }: { f: TrackerField; rows: Obj[]; was: Obj[]; disabled: boolean; onCommit: (v: unknown) => void }) {
  const set = (i: number, key: string, v: unknown) => onCommit(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const [title, ...rest] = f.fields;
  const side = rest.filter((c) => c.type === "status" || c.type === "number" || c.type === "meter");
  const below = rest.filter((c) => !side.includes(c));
  const cellOf = (c: TrackerField, r: Obj, i: number, cls: string) => (
    <EditableValue key={c.key} f={c} value={r[c.key]} disabled={disabled} label={`${f.label} ${i + 1} ${c.label}`} placeholder={c.label} className={cls} bare
      onCommit={(v) => set(i, c.key, v)} />
  );
  return (
    <div className="rows" data-testid="rows">
      {rows.map((r, i) => (
        <div key={i} className="row-line q-row">
          <div className="q-row-top">
            {wasChanged(was[i], r) && <span className="q-chg" title="Changed with this message" />}
            {title && cellOf(title, r, i, "q-row-title")}
            {side.map((c) => cellOf(c, r, i, "q-row-side"))}
            <button className="q-row-remove" disabled={disabled} aria-label={`Remove ${f.label} ${i + 1}`} title="Remove this row" onClick={() => onCommit(rows.filter((_, j) => j !== i))}>
              <Icon name="close" size={11} />
            </button>
          </div>
          {below.map((c) => cellOf(c, r, i, "q-row-below"))}
        </div>
      ))}
      <button className="link q-add" disabled={disabled} onClick={() => onCommit([...rows, {}])}>+ Add {f.label.replace(/s$/, "")}</button>
    </div>
  );
}

/**
 * One person of the cast (v1 `characterCard`): grip, picture, name and what they are doing now; a click opens everything
 * the tracker knows about them right here, under the row (no page change). NPCs can be removed (asks once).
 */
function PersonCard({ p, avatar, handle, edge, open, disabled, onToggle, onRemove, onSave }: {
  p: Person; avatar?: Avatar | undefined; handle?: ReactNode; edge: string; open: boolean; disabled: boolean;
  onToggle: () => void; onRemove?: (() => void) | undefined;
  /** Save to the Vault (someone the tracker brought in). */
  onSave?: (() => void) | undefined;
}) {
  const line = nowLine(p);
  const changed = p.cells.some((c) => wasChanged(c.was, c.value));
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <div className={`q-card${open ? " open" : ""}${p.here ? "" : " away"}${edge}`} data-testid="person-card" data-person={p.id}>
      <div className="q-card-head">
        {handle}
        <button type="button" className="q-person" data-testid="who-block" data-person={p.id} onClick={onToggle} aria-expanded={open}
          aria-label={`${p.name}${p.you ? " (you)" : ""}${changed ? ", changed with this message" : ""}. ${open ? "Fold" : "Show details"}`}>
          {p.pair ? <span className="pair-icon" aria-hidden>⇄</span> : <AvatarDot name={p.name} avatar={avatar} size={32} />}
          <span className="q-person-text">
            <span className="q-person-name">{p.name}{p.you && <span className="q-you"> (you)</span>}</span>
            {line && !open && <span className="q-person-line">{changed && <span className="q-chg" />}{line}</span>}
          </span>
          <span className={`q-chev${open ? " open" : ""}`} aria-hidden><Icon name="chevron" size={14} /></span>
        </button>
        {onRemove && (
          <button type="button" className={`q-card-remove${armed ? " armed" : ""}`} data-testid="remove-person" disabled={disabled && !armed}
            aria-label={armed ? `Confirm: remove ${p.name}` : `Remove ${p.name} from the cast`}
            title={armed ? "Click again to remove (their values at this message go too)" : "Remove from the cast"}
            onClick={() => { if (armed) { setArmed(false); onRemove(); } else setArmed(true); }}>
            {armed ? "Remove" : <Icon name="close" size={12} />}
          </button>
        )}
      </div>
      <Collapse open={open}>
        <PersonDetails p={p} disabled={disabled} />
        {onSave && <div className="q-card-foot"><button type="button" className="link" onClick={onSave} data-testid="save-to-vault"
          title="Keep this person as an NPC in the Library, to use in other stories and chats">Save to the Library…</button></div>}
      </Collapse>
    </div>
  );
}

/** What a person is doing now: the last filled "line" value, else a pill, else the line under the name. */
function nowLine(p: Person): string {
  const filled = (d: string) => p.cells.filter((c) => c.f.display === d && !isEmpty(c.f, c.value));
  // out of the scene: who they are (the line under the name), not what they were last doing (D-065)
  const pick = p.here || p.pair ? filled("line").at(-1) ?? filled("pill")[0] ?? filled("subtitle")[0] : filled("subtitle")[0] ?? filled("line").at(-1) ?? filled("pill")[0];
  if (pick) return cap(formatFieldValue(pick.f, pick.value));
  const any = p.cells.find((c) => c.f.type === "text" && !isEmpty(c.f, c.value) && c.f.key !== p.schema.presence?.field);
  return any ? cap(formatFieldValue(any.f, any.value)) : "";
}

/** Everything the tracker knows about a person, in groups, shown open under their row (was a page of its own, D-025). */
function PersonDetails({ p, disabled, avatar, withTitle = false }: { p: Person; disabled: boolean; avatar?: Avatar | undefined; withTitle?: boolean }) {
  const [shown, setShown] = useState<string[]>([]);
  const [full, setFull] = useState(false);
  // someone out of the scene: one line of who they are and where they went; the whole sheet on request (D-065)
  if (!p.here && !p.pair && !withTitle && !full) return <BriefDetails p={p} disabled={disabled} onFull={() => setFull(true)} />;
  const visible = (c: Cell) => !isEmpty(c.f, c.value) || shown.includes(c.f.key);
  const cells = p.cells.filter(visible);
  const of = (...d: Array<string | undefined>) => cells.filter((c) => d.includes(c.f.display ?? "auto"));
  const subtitle = of("subtitle");
  const lead = of("lead");
  const presence = p.schema.presence ? cells.find((c) => c.f.key === p.schema.presence!.field) : undefined;
  const now = [...(presence ? [presence] : []), ...of("pill", "line").filter((c) => c !== presence)];
  const notes = of("note");
  const used = new Set([...subtitle, ...lead, ...notes]);
  // the groups follow the order of the fields in the tracker (D-025: the order is data; the starter sets begin with
  // Appearance). "Right now" (presence, pills, lines) sits where its first field is; numbers ("tile") of a section go in
  // a strip of three; lists with columns get their own group.
  const sections: Array<{ title: string; now?: boolean; tiles: Cell[]; rows: Cell[]; lists: Cell[] }> = [];
  for (const c of cells) {
    if (used.has(c)) continue;
    const isNow = now.includes(c);
    const title = isNow ? "Right now" : c.f.section || "Details";
    let s = sections.find((x) => x.title === title && !!x.now === isNow);
    if (!s) { s = { title, now: isNow, tiles: [], rows: [], lists: [] }; sections.push(s); }
    if (isNow) s.rows.push(c);
    else if (c.f.type === "list" && c.f.fields.length) s.lists.push(c);
    else if (isTile(c.f)) s.tiles.push(c);
    else s.rows.push(c);
  }
  // empty: "Not known yet" for fields that must be filled; "Not used" for optional ones (e.g. Mana for a non-mage)
  const unknown = p.cells.filter((c) => !visible(c) && c.f.required);
  const unused = p.cells.filter((c) => !visible(c) && !c.f.required);

  return (
    <section className={`q-page${withTitle ? "" : " q-inline"}`} data-testid="person-page" aria-label={p.name}>
      {withTitle && (
        <div className="q-title">
          {p.pair ? <span className="pair-icon big" aria-hidden>⇄</span> : <AvatarDot name={p.name} avatar={avatar} size={46} />}
          <div className="grow"><h2>{p.name}{p.you && <span className="q-you"> (you)</span>}</h2></div>
        </div>
      )}
      {subtitle.map((c) => <div key={c.f.key} className="q-sub" data-testid="field-value" data-field={c.f.key}><EditableValue f={c.f} value={c.value} disabled={disabled} label={userMacro(c.f.label)} bare onCommit={c.commit} /></div>)}
      {lead.map((c) => (
        <div key={c.f.key} className={c.f.type === "list" ? "q-lead-list" : "q-lead"} data-testid="field-value" data-field={c.f.key}>
          {wasChanged(c.was, c.value) && <span className="q-chg" />}
          <EditableValue f={c.f} value={c.value} disabled={disabled} label={userMacro(c.f.label)} bare onCommit={c.commit} />
        </div>
      ))}
      {sections.map((s) => (
        <div key={(s.now ? "now:" : "") + s.title}>
          {(s.tiles.length > 0 || s.rows.length > 0) && <div className="q-gh">{s.title}</div>}
          {s.tiles.length > 0 && (
            <div className="q-group q-tiles">
              {s.tiles.map((c) => (
                <div key={c.f.key} className="q-tile" data-testid="field-value" data-field={c.f.key}>
                  <span className="q-tile-v">{wasChanged(c.was, c.value) && <span className="q-chg" />}<EditableValue f={c.f} value={c.value} disabled={disabled} label={userMacro(c.f.label)} bare onCommit={c.commit} />{c.mine && <span className="edited-mark" title="You changed this value at this message"> ✎</span>}</span>
                  <span className="q-tile-k">{userMacro(c.f.label)}</span>
                </div>
              ))}
            </div>
          )}
          {s.rows.length > 0 && <div className="q-group" style={s.tiles.length ? { marginTop: 8 } : undefined}>{s.rows.map((c) => <KeyValue key={c.f.key} label={userMacro(c.f.label)} cells={[c]} disabled={disabled} />)}</div>}
          {s.lists.map((c) => (
            <div key={c.f.key}>
              <div className="q-gh">{userMacro(c.f.label)}</div>
              <ListGroup c={c} disabled={disabled} />
            </div>
          ))}
        </div>
      ))}
      {notes.length > 0 && (
        <>
          <div className="q-gh">Notes</div>
          <div className="q-group">{notes.map((c) => <div key={c.f.key} className="q-note"><Val c={c} disabled={disabled} /></div>)}</div>
        </>
      )}
      {cells.length === 0 && unknown.length === 0 && unused.length === 0 && <p className="not-known">Nothing known yet.</p>}
      {unknown.length > 0 && (
        <p className="not-known">
          <span>Not known yet: </span>
          {unknown.map((c, i) => <span key={c.f.key}>{i > 0 && ", "}<button className="link quiet" title={`Write ${userMacro(c.f.label)} yourself`} onClick={() => setShown((s) => [...s, c.f.key])}>{userMacro(c.f.label)}</button></span>)}
        </p>
      )}
      {unused.length > 0 && (
        <p className="not-known quiet-used" data-testid="not-used">
          <span>Not used: </span>
          {unused.map((c, i) => <span key={c.f.key}>{i > 0 && ", "}<button className="link quiet" title={`Write ${userMacro(c.f.label)} yourself`} onClick={() => setShown((s) => [...s, c.f.key])}>{userMacro(c.f.label)}</button></span>)}
        </p>
      )}
    </section>
  );
}

/** A person out of the scene: the line under the name, who they are, their mood and where they went (D-065). */
function BriefDetails({ p, disabled, onFull }: { p: Person; disabled: boolean; onFull: () => void }) {
  const keys = new Set(briefFields(p.schema).map((f) => f.key));
  const filled = p.cells.filter((c) => keys.has(c.f.key) && c.f.key !== p.schema.presence?.field && !isEmpty(c.f, c.value));
  const sub = filled.filter((c) => c.f.display === "subtitle");
  const lead = filled.filter((c) => c.f.display === "lead");
  // of the "Now" fields: the pills (mood) and the first line (where they went), not posture or what they were doing
  const firstLine = p.schema.fields.find((f) => keys.has(f.key) && f.display === "line")?.key;
  const rest = filled.filter((c) => !sub.includes(c) && !lead.includes(c) && (c.f.display === "pill" || c.f.key === firstLine));
  return (
    <section className="q-page q-inline q-brief" data-testid="person-brief" aria-label={p.name}>
      {sub.map((c) => <div key={c.f.key} className="q-sub" data-testid="field-value" data-field={c.f.key}><EditableValue f={c.f} value={c.value} disabled={disabled} label={userMacro(c.f.label)} bare onCommit={c.commit} /></div>)}
      {lead.map((c) => <div key={c.f.key} className="q-lead" data-testid="field-value" data-field={c.f.key}><EditableValue f={c.f} value={c.value} disabled={disabled} label={userMacro(c.f.label)} bare onCommit={c.commit} /></div>)}
      {rest.length > 0 && <div className="q-group">{rest.map((c) => <KeyValue key={c.f.key} label={userMacro(c.f.label)} cells={[c]} disabled={disabled} />)}</div>}
      <p className="q-brief-foot">
        <button type="button" className="link" data-testid="full-sheet" onClick={onFull}>Full sheet ›</button>
        <span className="hint">kept as it was when they left</span>
      </p>
    </section>
  );
}

/** Short values sit three to a line: numbers, bars, and fields shown as tiles. */
const isTile = (f: TrackerField) => f.display === "tile" || ((!f.display || f.display === "auto") && (f.type === "number" || f.type === "meter"));

/** "✓ updated · 0.4 s · Run again" for one tracker, quiet, at the end of its groups. */
function RunInfo({ t, runs, messageId, busy, running, onRun }: { t: Tracker; runs: AgentRun[]; messageId: string | null; busy: boolean; running: string | null; onRun: () => void }) {
  const last = runs.filter((r) => r.agentId === t.agent.id).at(-1);
  return (
    <div className="run-log q-run" data-testid="run-log" data-tracker={t.agent.id}>
      <span className="q-run-name">{shortName(t.agent.name)}</span>
      {last ? <RunLine run={last} /> : <span className="muted">Not run at this message.</span>}
      <button className="link" disabled={!messageId || busy || running !== null} onClick={onRun}>
        {running === t.agent.id ? "running…" : last ? "Run again" : "Run now"}
      </button>
    </div>
  );
}

function Popover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { popIn(ref.current); }, []);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(); };
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);
  return <div className="scene-popover glass" ref={ref} role="dialog" aria-label="Trackers in this session">{children}</div>;
}

/** A value shown as text; click turns it into the right control. Enter / leaving saves, Esc cancels. */
function EditableValue({ f, value, disabled, onCommit, label, placeholder, className = "", prefix, bare = false }: {
  f: TrackerField; value: unknown; disabled: boolean; onCommit: (v: unknown) => void; label: string; placeholder?: string | undefined; className?: string;
  /** A small word shown before the value (e.g. a column name next to a number). */
  prefix?: string | undefined;
  /** No box of its own: the value sits in the surrounding shape (pill, tile, line…). */
  bare?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const raw = value === undefined || value === null ? "" : f.type === "list" ? listText(value as ListItem[]) : String(value);
  const shown = formatFieldValue(f, value);
  const empty = shown === "—";
  if (!editing || disabled) {
    return (
      <button type="button" className={`fv fv-${f.type}${empty ? " empty" : ""}${bare ? " bare" : ""} ${className}`.trim()} data-testid="fv" disabled={disabled}
        aria-label={`Change ${label} (${empty ? "empty" : shown})`} onClick={() => setEditing(true)}>
        {prefix && !empty && <span className="fv-prefix">{prefix}</span>}<ReadValue f={f} value={value} empty={empty} placeholder={placeholder} />
      </button>
    );
  }
  return <Editor f={f} raw={raw} label={label} placeholder={placeholder ?? "—"} onDone={(v) => { setEditing(false); if (v !== undefined) onCommit(v); }} />;
}

function ReadValue({ f, value, empty, placeholder }: { f: TrackerField; value: unknown; empty: boolean; placeholder?: string | undefined }) {
  if (empty) return <span className="fv-empty">{placeholder ?? "click to write"}</span>;
  if (f.type === "meter") {
    const lo = f.min ?? 0;
    const hi = f.max ?? 100;
    const n = Number(value);
    const pct = Math.max(0, Math.min(100, ((n - lo) / (hi - lo || 1)) * 100));
    return (
      <span className="meter-read">
        <span className="bar" aria-hidden><span style={{ width: `${pct}%`, background: "var(--tone, var(--accent))" }} /></span>
        <span className="tabular meter-num">{n}<span className="muted">/{hi}</span></span>
      </span>
    );
  }
  if (f.type === "status") return <span className="pill">{String(value)}</span>;
  if (f.type === "number") return <span className="tabular num-read">{String(value)}</span>;
  if (f.type === "list") {
    const items = Array.isArray(value) ? (value as ListItem[]) : [];
    return <span className="chips-read">{items.map((it, i) => <span key={i} className="item-chip">{it.name}{it.qty !== undefined && it.qty !== 1 ? <span className="muted"> ×{it.qty}</span> : null}</span>)}</span>;
  }
  return <span className="text-read">{formatFieldValue(f, value)}</span>;
}

function Editor({ f, raw, label, placeholder, onDone }: { f: TrackerField; raw: string; label: string; placeholder: string; onDone: (v: unknown | undefined) => void }) {
  const [text, setText] = useState(raw);
  const ref = useRef<HTMLElement | null>(null);
  // finishing happens once: a blur that follows Enter or Esc must not save again
  const ended = useRef(false);
  const end = (v: unknown | undefined) => { if (ended.current) return; ended.current = true; onDone(v); };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLTextAreaElement) { el.setSelectionRange(el.value.length, el.value.length); grow(el); }
    else if (el instanceof HTMLInputElement) el.select();
  }, []);
  const finish = (save: boolean) => {
    if (!save || text === raw) { end(undefined); return; }
    if (f.type === "list") { end(parseList(text)); return; }
    if (f.type === "number" || f.type === "meter") {
      const n = Number(text.replace(",", "."));
      if (text.trim() === "" || !Number.isFinite(n)) { end(undefined); return; }
      const lo = f.min ?? (f.type === "meter" ? 0 : -Infinity);
      const hi = f.max ?? (f.type === "meter" ? 100 : Infinity);
      end(f.type === "meter" ? Math.round(Math.min(hi, Math.max(lo, n))) : Math.min(hi, Math.max(lo, n)));
      return;
    }
    end(text.trim());
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
  };
  if (f.type === "status") {
    return (
      <select ref={(el) => { ref.current = el; }} className="fv-edit" aria-label={`${label} value`} value={raw} onChange={(e) => end(e.target.value)} onBlur={() => end(undefined)}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); end(undefined); } }}>
        {!f.options.includes(raw) && <option value={raw}>{raw || placeholder}</option>}
        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (f.type === "number" || f.type === "meter") {
    return <input ref={(el) => { ref.current = el; }} className="fv-edit num" type="number" aria-label={`${label} value`} min={f.min} max={f.max} value={text} placeholder={placeholder}
      onChange={(e) => setText(e.target.value)} onBlur={() => finish(true)} onKeyDown={keys} />;
  }
  if (f.type === "list") {
    return <input ref={(el) => { ref.current = el; }} className="fv-edit" aria-label={`${label} value`} value={text} placeholder="Items separated by commas; ×2 for a quantity"
      onChange={(e) => setText(e.target.value)} onBlur={() => finish(true)} onKeyDown={keys} />;
  }
  return <textarea ref={(el) => { ref.current = el; }} className="fv-edit" aria-label={`${label} value`} rows={1} value={text} placeholder={placeholder}
    onChange={(e) => { setText(e.target.value); grow(e.target); }} onBlur={() => finish(true)} onKeyDown={keys} />;
}

function RunLine({ run }: { run: AgentRun }) {
  const secs = (run.durationMs / 1000).toFixed(1);
  const tokens = run.tokensIn || run.tokensOut ? ` · ${run.tokensIn ?? "?"}→${run.tokensOut ?? "?"} tokens` : "";
  return (
    <details className={`run ${run.status}`} data-testid="run">
      <summary>
        <span data-testid="run-status">{run.status === "ok" ? "✓ updated" : run.status === "failed" ? "✗ failed" : run.status}</span>
        <span className="muted"> · {secs}s{run.model ? ` · ${run.model}` : ""}{tokens}</span>
        {run.stale && <span className="warn"> · out of date</span>}
      </summary>
      {run.error && <div className="run-error">{run.error}</div>}
      {run.warnings?.length ? <div className="run-warn">Left out: {run.warnings.join("; ")}</div> : null}
      {run.output !== undefined && <pre className="run-output">{JSON.stringify(run.output, null, 1)}</pre>}
      {run.stale && <div className="muted">An earlier message or value was changed after this ran.</div>}
    </details>
  );
}

const isEmpty = (f: TrackerField, v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) || formatFieldValue(f, v) === "—";

/** Changed with this message: there WAS a value and it is different (a first fill is not "updated"). */
const wasChanged = (was: unknown, now: unknown) =>
  was !== undefined && was !== null && was !== "" && !(Array.isArray(was) && was.length === 0) && JSON.stringify(was) !== JSON.stringify(now ?? null);

const presentOf = (schema: TrackerSchema, values: Obj, id: string): boolean | undefined => {
  if (!schema.presence) return undefined;
  const v = ((values[schema.presence.field] ?? {}) as Obj)[id];
  return v === undefined ? undefined : String(v).toLowerCase() === schema.presence.value.toLowerCase();
};

/** A steady colour from a field's key, for labels without their own colour (as in v1). */
function hue(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const grow = (el: HTMLTextAreaElement) => { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; };

/** Field labels and hints may say {{user}} / {{char}}; show names instead. */
const userMacro = (t: string) => applyBasicMacros(t, { char: "the character", user: DEFAULT_USER_NAME });

const listText = (items: ListItem[]) => (Array.isArray(items) ? items : []).map((i) => (i.qty !== undefined && i.qty !== 1 ? `${i.name} ×${i.qty}` : i.name)).join(", ");

function parseList(text: string): ListItem[] {
  return text.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(.*?)\s*[×x]\s*(\d+(?:\.\d+)?)$/.exec(s);
    return m && m[1] ? { name: m[1], qty: Number(m[2]) } : { name: s };
  });
}

// ---------------------------------------------------------------- the tracker editor's preview (D-026)

/**
 * What the Scene panel will show with the field set being edited, from a real sample (the tracker's values at the end of a
 * session), drawn by the same code as the panel and read-only. With people: one person's page (pick who); without: the
 * tracker's values as the panel lists them. When the order or the "Shows as" of the fields changes, the rows glide to
 * their new place (FLIP), and the field open in the editor is highlighted.
 */
export function TrackerPreview({ schema, values, cast, avatars, focusKey }: {
  schema: TrackerSchema; values: Obj; cast: TrackerCastMember[]; avatars: Record<string, Avatar>; focusKey: string | null;
}) {
  const fake = { agent: { id: schema.trackerId ?? "preview", name: "" }, sets: [schema] } as unknown as Tracker;
  const cell = (f: TrackerField, value: unknown): Cell => ({ t: fake, f, value, was: undefined, mine: false, commit: () => {} });
  const perChar = schema.fields.filter((f) => f.scope === "perCharacter");
  const people: Person[] = perChar.length
    ? trackerPeople(schema, values, cast, DEFAULT_USER_NAME).map((p) => ({
      key: p.id, t: fake, schema, id: p.id, name: p.name, you: p.id === USER_ID, pair: false, here: presentOf(schema, values, p.id) !== false,
      cells: perChar.map((f) => cell(f, ((values[f.key] ?? {}) as Obj)[p.id])),
    }))
    : [];
  const filledCount = (p: Person) => p.cells.filter((c) => !isEmpty(c.f, c.value)).length;
  const best = [...people].sort((a, b) => Number(a.you) - Number(b.you) || filledCount(b) - filledCount(a))[0];
  const [who, setWho] = useState<string | null>(null);
  const person = people.find((p) => p.id === who) ?? best;

  const globals = schema.fields.filter((f) => f.scope === "global").map((f) => cell(f, values[f.key]));
  const header = globals.filter((c) => c.f.display === "header");
  const now = header.length ? headerRows(header) : [];
  const groups: Array<{ title: string; cells: Cell[]; list?: Cell }> = [];
  for (const c of globals.filter((x) => x.f.display !== "header" && !isEmpty(x.f, x.value))) {
    if (c.f.type === "list") { groups.push({ title: userMacro(c.f.label), cells: [], list: c }); continue; }
    const title = c.f.section || "Details";
    const g = groups.find((x) => x.title === title && !x.list);
    if (g) g.cells.push(c); else groups.push({ title, cells: [c] });
  }

  // FLIP: rows glide from where they were when the order or the "Shows as" of the fields changes
  const box = useRef<HTMLDivElement>(null);
  const prev = useRef(new Map<string, { top: number; shape: string }>());
  const sig = schema.fields.map((f) => `${f.key}:${f.display ?? ""}:${f.section}`).join("|");
  const rowOf = (el: Element) => (el.closest(".q-kv, .q-tile, .q-group, .q-lead, .q-lead-list, .q-sub, .q-note") ?? el) as HTMLElement;
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const top0 = root.getBoundingClientRect().top - root.scrollTop;
    const next = new Map<string, { top: number; shape: string }>();
    const els = new Map<string, HTMLElement>();
    root.querySelectorAll<HTMLElement>("[data-field]").forEach((el) => {
      const key = el.dataset.field!;
      if (next.has(key)) return;
      const row = rowOf(el);
      els.set(key, row);
      next.set(key, { top: row.getBoundingClientRect().top - top0, shape: row.className });
    });
    if (prev.current.size && !reducedMotion()) {
      for (const [key, row] of els) {
        const was = prev.current.get(key);
        const is = next.get(key)!;
        if (!was) { row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT }); continue; }
        if (was.shape !== is.shape) { flash(row); continue; } // shown another way: glow where it landed
        const dy = was.top - is.top;
        if (Math.abs(dy) > 1) row.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 280, easing: EASE_IN_OUT });
      }
    }
    prev.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, person?.id]);

  // the field open in the editor, highlighted where it shows
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    root.querySelectorAll(".pv-hl").forEach((el) => el.classList.remove("pv-hl"));
    if (!focusKey) return;
    const hits = [...root.querySelectorAll(`[data-field="${CSS.escape(focusKey)}"]`)].map(rowOf);
    hits.forEach((el) => el.classList.add("pv-hl"));
    hits[0]?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [focusKey, sig, person?.id]);

  return (
    <div className="pv-box quiet" ref={box}>
      {people.length > 1 && (
        <label className="pv-who">
          <span>Showing</span>
          <select aria-label="Preview person" value={person?.id ?? ""} onChange={(e) => setWho(e.target.value)}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.you ? " (you)" : ""}</option>)}
          </select>
        </label>
      )}
      {person && <PersonDetails key="preview" p={person} avatar={avatars[person.id]} disabled withTitle />}
      {!person && (
        <div className="q-list">
          {now.length > 0 && (
            <section aria-label="Now">
              <div className="q-gh">Now</div>
              <div className="q-group">{now.map((r) => <KeyValue key={r.label} label={r.label} cells={r.cells} disabled serif />)}</div>
            </section>
          )}
          {groups.map((g) => (
            <section key={g.title}>
              <div className="q-gh">{g.title}</div>
              {g.list ? <ListGroup c={g.list} disabled /> : <div className="q-group">{g.cells.map((c) => <KeyValue key={c.f.key} label={userMacro(c.f.label)} cells={[c]} disabled />)}</div>}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
