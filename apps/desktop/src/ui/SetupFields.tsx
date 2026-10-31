// Homunculus 2 — the setup of a story or of one chat of a story (D-031, canvas "Homunculus 2 — Stories").
// Author: CLAUDE, 2026-10-29.
//
// One block, four places: New story, the story's page, New Chat and the Prompt tab of a story chat.
// Override-only (as in Aventuras' story settings): a row shows what it inherits ("Default · …" for a story,
// "from the story" for a chat) until something else is picked; a chat row that differs from its story is marked
// "changed in this chat" with "Use the story's". The layer edited stores only what it changes.
import { useState, type ReactNode } from "react";
import { Button, Icon } from "./kit.tsx";
import { Modal } from "./Vault.tsx";
import type { AgentConfig, ConnectionProfile, Persona, Preset, SetupLayer } from "@homunculus/schemas";
import { kindOf, whenText } from "../agents.ts";
import { layerFieldSet, layerHasTracker, layerWithFieldSet, layerWithStyle, layerWithTracker, type Tracker } from "../trackers.ts";

const INHERIT = "";
const NONE = "__none__";
const SAME = "__same__";

/** What the setup blocks need from the app (the lists to pick from, and the names of what is inherited). */
import type { ResolvedAuthorsNote, ResolvedSetup } from "@homunculus/core";

export interface StorySetupProps {
  presets: Preset[];
  profiles: ConnectionProfile[];
  personas: Persona[];
  trackers: Tracker[];
  /** The Library's agents (slice 5, D-047). */
  agents: AgentConfig[];
  /** What a layer under `story` inherits (undefined = what a story inherits from Settings → Defaults). */
  namesFor: (story?: SetupLayer) => SetupNames;
  /** The Author's Note a layer under `story` inherits (undefined = Settings → Defaults). */
  noteAbove: (story?: SetupLayer) => ResolvedAuthorsNote;
  setupAbove: (story?: SetupLayer) => ResolvedSetup;
  onSavePreset: (preset: Preset) => Promise<void>;
  onOpenPreset: (id: string) => void;
}

export interface SetupNames {
  /** Names of what the layer above gives (Settings → Defaults for a story; the story for a chat). */
  preset: string;
  connection: string;
  agentConnection: string;
  persona: string;
}

export function SetupFields({ mode, layer, onChange, above, names, presets, profiles, personas, trackers, agents = [], title = "Setup", aside, trackersAside, agentsAside, testId, director = false }: {
  /** story: the story's own layer (above = Defaults). chat: one chat's layer (above = its story). */
  mode: "story" | "chat";
  layer: SetupLayer;
  onChange: (layer: SetupLayer) => void;
  /** The story's layer when mode is "chat" (what the chat inherits). */
  above?: SetupLayer;
  names: SetupNames;
  presets: Preset[];
  profiles: ConnectionProfile[];
  personas: Persona[];
  trackers: Tracker[];
  agents?: AgentConfig[];
  title?: string;
  aside?: ReactNode;
  trackersAside?: ReactNode;
  agentsAside?: ReactNode;
  testId?: string;
  /** Director mode: the user is not in the story, so there is no "You play as". */
  director?: boolean;
}) {
  const chat = mode === "chat";
  const set = (patch: Partial<SetupLayer>, clear: Array<keyof SetupLayer> = []) => {
    const next: SetupLayer = { ...layer, ...patch };
    for (const k of clear) delete next[k];
    onChange(next);
  };
  const inheritLabel = (name: string) => (chat ? name : `Default · ${name}`);
  /** A chat row that differs from its story: the chip and the way back. */
  const changed = (key: keyof SetupLayer, keys: Array<keyof SetupLayer> = [key]) =>
    chat && layer[key] !== undefined ? <ChangedChip onUndo={() => set({}, keys)} /> : null;
  const from = (key: keyof SetupLayer) => (chat && layer[key] === undefined ? "from the story" : "");

  const presetValue = layer.presetId ?? INHERIT;
  const connValue = layer.connectionId ?? INHERIT;
  const agentValue = layer.agentConnectionId === undefined ? INHERIT : layer.agentConnectionId === null ? SAME : layer.agentConnectionId;
  const personaValue = layer.personaId === undefined ? INHERIT : layer.personaId === null ? NONE : layer.personaId;

  return (
    <div className="setup-fields" data-testid={testId}>
      <SetupSection title={title} aside={aside}>
        <SetupRow label="Preset" sub={from("presetId")} changed={changed("presetId")}>
          <select className="pick-select" aria-label="Preset" value={presetValue}
            onChange={(e) => (e.target.value === INHERIT ? set({}, ["presetId"]) : set({ presetId: e.target.value }))}>
            <option value={INHERIT}>{inheritLabel(names.preset)}</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </SetupRow>
        <SetupRow label="Connection" sub={from("connectionId") || (chat ? "" : "writes the story")} changed={changed("connectionId")}>
          <select className="pick-select" aria-label="Connection" value={connValue}
            onChange={(e) => (e.target.value === INHERIT ? set({}, ["connectionId"]) : set({ connectionId: e.target.value }))}>
            <option value={INHERIT}>{inheritLabel(names.connection)}</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </SetupRow>
        <SetupRow label="Agents connection" sub={from("agentConnectionId") || (chat ? "" : "trackers and helpers")} changed={changed("agentConnectionId")}>
          <select className="pick-select" aria-label="Agents connection" value={agentValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === INHERIT) set({}, ["agentConnectionId"]);
              else set({ agentConnectionId: v === SAME ? null : v });
            }}>
            <option value={INHERIT}>{inheritLabel(names.agentConnection)}</option>
            <option value={SAME}>Same as the story</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </SetupRow>
        {!director && <SetupRow label="You play as" sub={from("personaId")} changed={changed("personaId", ["personaId", "personaVariantId"])}>
          <select className="pick-select" aria-label="You play as" value={personaValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === INHERIT) set({}, ["personaId", "personaVariantId"]);
              else set({ personaId: v === NONE ? null : v, personaVariantId: null });
            }}>
            <option value={INHERIT}>{inheritLabel(names.persona)}</option>
            <option value={NONE}>User (no persona)</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </SetupRow>}
        {!chat && <SetupRow label="Memory" sub="old messages become chapter summaries">
          <select className="pick-select" aria-label="Memory" value={layer.memory?.on === undefined ? INHERIT : layer.memory.on ? "on" : "off"}
            onChange={(e) => {
              const { on: _o, ...rest } = layer.memory ?? {};
              const memory = e.target.value === INHERIT ? rest : { ...rest, on: e.target.value === "on" };
              if (Object.keys(memory).length) set({ memory }); else set({}, ["memory"]);
            }}>
            <option value={INHERIT}>Default · Off</option>
            <option value="on">Chapter summaries</option>
            <option value="off">Off</option>
          </select>
        </SetupRow>}
      </SetupSection>

      <SetupSection title="Trackers" aside={trackersAside} testId="setup-trackers">
        {ordered(trackers).map((t) => <TrackerRow key={t.agent.id} t={t} chat={chat} layer={layer} above={above} onChange={onChange} />)}
        {trackers.length === 0 && <div className="setup-empty">No trackers yet. Make one in Library → Trackers.</div>}
      </SetupSection>

      <SetupSection title="Agents" aside={agentsAside} testId="setup-agents">
        <AgentsSummary agents={agents} chat={chat} layer={layer} above={above} onChange={onChange} />
      </SetupSection>
    </div>
  );
}

/**
 * Agents as one row: which are on, and "Choose…" opens a window with all of them (Daniel, 30/10: the full list made
 * the setup busy). The window has a search and the same on/off rows as before.
 */
function AgentsSummary({ agents, chat, layer, above, onChange }: { agents: AgentConfig[]; chat: boolean; layer: SetupLayer; above?: SetupLayer; onChange: (l: SetupLayer) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  if (agents.length === 0) return <div className="setup-empty">No agents yet. Make one in Library → Agents.</div>;
  const inherited = (id: string) => (chat && above ? layerHasTracker(above, id) : false);
  const isOn = (a: AgentConfig) => layerHasTracker(layer, a.id, inherited(a.id));
  const on = agents.filter(isOn);
  const changedHere = chat ? agents.filter((a) => isOn(a) !== inherited(a.id)).length : 0;
  const needle = q.trim().toLowerCase();
  const shown = agents.filter((a) => !needle || `${a.name} ${a.help}`.toLowerCase().includes(needle));
  // on first, then the rest, each alphabetical
  const sorted = [...shown].sort((a, b) => Number(isOn(b)) - Number(isOn(a)) || a.name.localeCompare(b.name));
  return (
    <>
      <div className={`setup-row${changedHere ? " changed" : ""}`} data-testid="setup-agents-summary">
        <span className="setup-k grow">
          <span>{on.length === 0 ? "None on" : `${on.length} on`}</span>
          <small>{on.length ? on.map((a) => a.name).join(" · ") : `${agents.length} in your Library`}{changedHere ? ` · ${changedHere} changed in this chat` : ""}</small>
        </span>
        <span className="setup-v"><Button small onClick={() => setOpen(true)}>Choose agents…</Button></span>
      </div>
      {open && (
        <Modal title={chat ? "Agents in this chat" : "Agents in this story"} onClose={() => { setOpen(false); setQ(""); }} testId="setup-agents-sheet" className="modal-small agents-pick">
          <label className="search-box agents-pick-search"><Icon name="search" size={13} /><input autoFocus aria-label="Search agents" placeholder="Search agents" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="setup-group agents-pick-list">
            {sorted.map((a) => <AgentRow key={a.id} a={a} chat={chat} layer={layer} above={above} onChange={onChange} />)}
            {sorted.length === 0 && <div className="setup-empty">Nothing matches.</div>}
          </div>
          <span className="row-line">
            <span className="hint grow">{chat ? "Changes here only affect this chat." : "Every new chat of this story starts with these."}</span>
            {on.length > 0 && <Button small variant="plain" onClick={() => onChange(agents.reduce((l, a) => layerWithTracker(l, a.id, false, inherited(a.id)), layer))}>Turn all off</Button>}
          </span>
        </Modal>
      )}
    </>
  );
}

/** An agent on or off for this story (or this chat), like a tracker row (D-047). */
function AgentRow({ a, chat, layer, above, onChange }: { a: AgentConfig; chat: boolean; layer: SetupLayer; above?: SetupLayer; onChange: (l: SetupLayer) => void }) {
  const inheritedOn = chat && above ? layerHasTracker(above, a.id) : false;
  const on = layerHasTracker(layer, a.id, inheritedOn);
  const isChanged = chat && on !== inheritedOn;
  const what = `${kindOf(a)?.label ?? ""} · ${whenText(a).toLowerCase()}`;
  const byId = (id: string | undefined) => a.styles?.find((x) => x.id === id);
  const inheritedStyle = ((chat ? byId(above?.agentOverrides?.[a.id]?.styleId) : undefined) ?? byId(a.styleId) ?? a.styles?.[0])?.name ?? "";
  const sub = !chat ? what : isChanged ? (on ? "on in this chat · off in the story" : "off in this chat · on in the story") : on ? `from the story · ${what}` : what;
  return (
    <div className={`setup-row tracker${isChanged ? " changed" : ""}`} data-testid={`setup-agent-${a.id}`}>
      <input type="checkbox" className="setup-check" aria-label={a.name} checked={on}
        onChange={(e) => onChange(layerWithTracker(layer, a.id, e.target.checked, inheritedOn))} />
      <span className="setup-k grow"><span>{a.name}</span><small>{sub}</small>{isChanged && <ChangedChip onUndo={() => onChange(layerWithTracker(layer, a.id, inheritedOn, inheritedOn))} />}</span>
      {a.styles?.length ? (
        <select className="pick-select setup-style" aria-label={`${a.name} style`} disabled={!on} value={layer.agentOverrides?.[a.id]?.styleId ?? ""}
          title="Which version of this agent" onChange={(e) => onChange(layerWithStyle(layer, a.id, e.target.value || null))}>
          <option value="">{chat ? "Story's style" : "Default style"} · {inheritedStyle}</option>
          {a.styles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      ) : null}
    </div>
  );
}

/** The trackers of the app first, in the order the Scene panel shows them (World, Characters, Plot), then the rest. */
const FIRST = ["scene-world", "scene-characters", "scene-plot"];
const ordered = (ts: Tracker[]) => [...ts].sort((a, b) => {
  const ra = FIRST.indexOf(a.agent.id), rb = FIRST.indexOf(b.agent.id);
  return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || a.agent.name.localeCompare(b.agent.name);
});

function TrackerRow({ t, chat, layer, above, onChange }: {
  t: Tracker; chat: boolean; layer: SetupLayer; above?: SetupLayer; onChange: (l: SetupLayer) => void;
}) {
  const id = t.agent.id;
  const inheritedOn = chat && above ? layerHasTracker(above, id) : false;
  const on = layerHasTracker(layer, id, inheritedOn);
  const defaultSet = t.agent.state?.schemaId ?? t.sets[0]?.id;
  const aboveSet = (chat && above ? layerFieldSet(above, id) : undefined) ?? defaultSet;
  const ownSet = layerFieldSet(layer, id);
  const setId = ownSet ?? aboveSet;
  const setName = (sid: string | undefined) => t.sets.find((s) => s.id === sid)?.name ?? t.sets[0]?.name ?? "";
  const isChanged = chat && (on !== inheritedOn || (ownSet !== undefined && ownSet !== aboveSet));
  const pickSet = (sid: string) => onChange(layerWithFieldSet(layer, id, sid === aboveSet ? null : sid));
  const reset = () => onChange(layerWithFieldSet(layerWithTracker(layer, id, inheritedOn, inheritedOn), id, null));
  let sub = t.agent.help;
  if (chat) {
    if (on !== inheritedOn) sub = on ? "on in this chat · off in the story" : "off in this chat · on in the story";
    else if (ownSet !== undefined && ownSet !== aboveSet) sub = `${setName(ownSet)} in this chat · ${setName(aboveSet)} in the story`;
    else sub = on ? `from the story · ${setName(setId)}` : "off in the story";
  }
  return (
    <div className={`setup-row tracker${isChanged ? " changed" : ""}`} data-testid={`setup-tracker-${id}`}>
      <input type="checkbox" className="setup-check" aria-label={t.agent.name} checked={on}
        onChange={(e) => onChange(layerWithTracker(layer, id, e.target.checked, inheritedOn))} />
      <span className="setup-k grow"><span>{t.agent.name}</span>{sub && <small>{sub}</small>}{isChanged && <ChangedChip onUndo={reset} />}</span>
      {t.sets.length > 1 && (
        <select className="pick-select" aria-label={`${t.agent.name} fields`} value={setId} disabled={!on}
          title="Which field set this uses. Values of fields with the same name carry over."
          onChange={(e) => pickSet(e.target.value)}>
          {t.sets.map((s) => <option key={s.id} value={s.id}>Fields: {s.name}</option>)}
        </select>
      )}
    </div>
  );
}

function ChangedChip({ onUndo }: { onUndo: () => void }) {
  return (
    <span className="changed-wrap">
      <span className="changed-chip">changed in this chat</span>
      <button type="button" className="link" onClick={onUndo}>Use the story's</button>
    </span>
  );
}

export function SetupSection({ title, aside, children, testId }: { title: string; aside?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="setup-sec" data-testid={testId}>
      <h3 className="setup-title">{title}{aside && <span>{aside}</span>}</h3>
      <div className="setup-group">{children}</div>
    </section>
  );
}

function SetupRow({ label, sub, changed, children }: { label: string; sub?: string; changed?: ReactNode; children: ReactNode }) {
  return (
    <div className={`setup-row${changed ? " changed" : ""}`}>
      <span className="setup-k"><span>{label}</span>{sub && <small>{sub}</small>}{changed}</span>
      <span className="setup-v">{children}</span>
    </div>
  );
}
