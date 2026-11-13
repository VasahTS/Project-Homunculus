import { useUnsavedChanges, useGuardedNavigation } from "./ux.tsx";
// Homunculus 2 — Settings: saved connections and the Default layer of the setup. Author: CLAUDE, 2026-10-28
// (slice 1b, D-020). Connections = master-detail like the Library; Defaults = Settings-style grouped rows.
// The look comes only from the kit and the theme tokens (D-018).
import { CustomizeSection } from "./CustomizeSection.tsx";
import type { Lorebook, LoreSettings } from "@homunculus/schemas";
import { LoreSettingsSection } from "./LorePanels.tsx";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ConnectionProfile, type Persona, type Preset, type SetupLayer } from "@homunculus/schemas";
import { AUTHORS_NOTE_DEFAULTS, profileToConfig, type Completion, type ConnectionConfig, type ModelInfo, type ProviderDefinition } from "@homunculus/core";
import { keyNameOf, needsKey, newProfile, suggestName, type ConnectionState } from "../connection.ts";
import { cachedModels, ModelPicker, modelMeta } from "./ModelPicker.tsx";
import type { Tracker } from "../trackers.ts";
import { ConfirmButton, Help } from "./Help.tsx";
import { Button, Group, Icon, Row, Segmented, SettingsLook, Switch, SaveButton } from "./kit.tsx";
import { ChatSection, DataSection, GeneralSection } from "./SettingsSections.tsx";
import { useSlidingPill } from "./motion.ts";
import { AuthorsNoteGroup } from "./AuthorsNote.tsx";
import { ParamRows } from "./ConnectionPanel.tsx";
import { Toolbar } from "./Toolbar.tsx";
import type { Updates } from "../updates.ts";
import { AboutSection } from "./About.tsx";

/** "customize" is the Appearance tab (its id kept from before Settings v2, D-082). */
export type SettingsTab = "general" | "chat" | "customize" | "connections" | "defaults" | "lorebooks" | "library" | "data" | "about";

export function SettingsPage({ lead, tab, onTab, c, providers, test, listModels, trackers, presets, defaultPresetId, personas, defaultPersonaId, defaultSetup, onSetDefaultSetup, onSetDefaultPersona, notify, lorebooks, loreSettings, onSaveLoreSettings, updates, trashCount = 0, library }: {
  lead: ReactNode;
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  c: ConnectionState;
  providers: ProviderDefinition[];
  /** Sends a tiny request with these settings (the "Test Connection" button). */
  test: (config: ConnectionConfig) => Promise<Completion>;
  /** Asks the service for its models (the "Browse" button next to Model). */
  listModels: ListModels;
  trackers: Tracker[];
  presets: Preset[];
  defaultPresetId: string;
  personas: Persona[];
  defaultPersonaId: string | null;
  defaultSetup: SetupLayer;
  onSetDefaultSetup: (patch: Partial<SetupLayer>) => Promise<void>;
  onSetDefaultPersona: (id: string | null) => Promise<void>;
  notify: (title: string, lines?: string[]) => void;
  lorebooks: Lorebook[];
  loreSettings: LoreSettings;
  onSaveLoreSettings: (s: LoreSettings) => Promise<void>;
  updates: Updates;
  /** Items in the Trash now (Settings → Data). */
  trashCount?: number;
  /** Settings → Library: SillyTavern import and linked folders (D-128, D-129). */
  library?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const searching = q.trim() !== "";
  const lore = <LoreSettingsSection settings={loreSettings} onSave={onSaveLoreSettings} books={lorebooks} defaultSetup={defaultSetup} onSetDefaultSetup={onSetDefaultSetup} />;
  const defaults = <DefaultsSection c={c} trackers={trackers} presets={presets} defaultPresetId={defaultPresetId} personas={personas} defaultPersonaId={defaultPersonaId} defaultSetup={defaultSetup}
    onSetDefaultSetup={onSetDefaultSetup} onSetDefaultPersona={onSetDefaultPersona} />;
  const section = (t: SettingsTab) => t === "general" ? <GeneralSection /> : t === "chat" ? <ChatSection /> : t === "customize" ? <CustomizeSection notify={notify} />
    : t === "data" ? <DataSection notify={notify} trashCount={trashCount} /> : t === "about" ? <AboutSection u={updates} /> : t === "lorebooks" ? lore : t === "library" ? (library ?? null)
    : t === "connections" ? <ConnectionsSection c={c} providers={providers} test={test} listModels={listModels} notify={notify} /> : defaults;
  return (
    <SettingsLook.Provider value={true}>
    <section className="library-workspace settings-workspace settings-look" data-region="library-workspace">
      <Toolbar lead={lead} title="Settings"
        trailing={<label className="search-box toolbar-search settings-search"><Icon name="search" size={13} />
          <input aria-label="Search settings" placeholder="Search settings" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} data-testid="settings-search" /></label>} />
      <SettingsTabs tab={searching ? null : tab} onTab={(t) => { setQ(""); onTab(t); }} />
      <div className="library-workspace-content settings-content">
        {searching ? <SettingsSearch q={q} onOpen={(t) => { setQ(""); onTab(t); }} sections={SEARCHABLE.map((t) => ({ tab: t, node: section(t) }))} /> : section(tab)}
      </div>
    </section>
    </SettingsLook.Provider>
  );
}

/** Every tab whose rows can be searched; Connections is a list of saved connections, offered as a link instead. */
const SEARCHABLE: SettingsTab[] = ["general", "chat", "customize", "defaults", "lorebooks", "library", "data", "about"];
const CONNECTION_WORDS = /^(conn|api|key|model|provid|address|url|proxy|temper|sampl|think|reason|token|limit|backup conn)/;

/** Search across tabs (D-082): every searchable tab is drawn, then rows that don't match are hidden. */
function SettingsSearch({ q, sections, onOpen }: { q: string; sections: Array<{ tab: SettingsTab; node: ReactNode }>; onOpen: (t: SettingsTab) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [none, setNone] = useState(false);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const connections = words.some((w) => CONNECTION_WORDS.test(w));
  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    let any = false;
    for (const sec of root.querySelectorAll<HTMLElement>("[data-search-tab]")) {
      let secHit = false;
      for (const g of sec.querySelectorAll<HTMLElement>(".group-section")) {
        const intro = g.querySelector(".group-intro, .group-head")?.textContent ?? "";
        const rows = [...g.querySelectorAll<HTMLElement>(".row")];
        let gHit = false;
        if (rows.length) for (const r of rows) {
          const hit = words.every((w) => `${intro} ${r.textContent ?? ""}`.toLowerCase().includes(w));
          r.hidden = !hit; gHit ||= hit;
        } else gHit = words.every((w) => (g.textContent ?? "").toLowerCase().includes(w));
        g.hidden = !gHit; secHit ||= gHit;
      }
      sec.hidden = !secHit; any ||= secHit;
    }
    setNone(!any && !connections);
  });
  return (
    <div className="settings-search-results" ref={box} data-testid="settings-search-results">
      {connections && (
        <div className="settings-page"><section className="group-section annotated"><div className="group-intro"><span className="group-icon" aria-hidden><Icon name="plug" size={17} /></span><h2 className="group-title">Connections</h2></div>
          <div className="group"><div className="row"><span className="row-label"><span className="row-name">Open Connections</span></span><span className="row-value"><Button small variant="bordered" onClick={() => onOpen("connections")}>Open</Button></span></div></div></section></div>
      )}
      {sections.map(({ tab, node }) => (
        <div key={tab} data-search-tab={tab}>
          <h2 className="settings-search-tab">{SECTIONS.find((x) => x.value === tab)?.label}</h2>
          {node}
        </div>
      ))}
      {none && <p className="hint" role="status">No setting matches “{q.trim()}”.</p>}
    </div>
  );
}

/** Settings' tab row, with the underline gliding to the open section (D-080). */
function SettingsTabs({ tab, onTab }: { tab: SettingsTab | null; onTab: (t: SettingsTab) => void }) {
  const nav = useRef<HTMLElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  useSlidingPill(nav, line, '[aria-current="page"]', tab);
  return (
    <nav ref={nav} className="library-tabs gliding" aria-label="Settings sections" role="tablist"
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const index = Math.max(0, SECTIONS.findIndex((x) => x.value === tab));
        const next = SECTIONS[(index + (e.key === "ArrowRight" ? 1 : -1) + SECTIONS.length) % SECTIONS.length]!;
        onTab(next.value);
        requestAnimationFrame(() => nav.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
      }}>
      <span className="slide-pill tab-line" ref={line} aria-hidden />
      {SECTIONS.map((x) => (
        <button key={x.value} type="button" role="tab" aria-selected={tab === x.value} className="library-tab" aria-current={tab === x.value ? "page" : undefined}
          data-testid={`settings-${x.value}`} tabIndex={tab === x.value || (tab === null && x.value === "general") ? 0 : -1} onClick={() => onTab(x.value)}><span>{x.label}</span></button>
      ))}
    </nav>
  );
}

const SECTIONS: Array<{ value: SettingsTab; label: string }> = [
  { value: "general", label: "General" }, { value: "chat", label: "Chat" }, { value: "customize", label: "Appearance" },
  { value: "connections", label: "Connections" }, { value: "defaults", label: "Defaults" }, { value: "lorebooks", label: "Lorebooks" }, { value: "library", label: "Library" },
  { value: "data", label: "Data" }, { value: "about", label: "About" },
];

// ---------------------------------------------------------------- Connections

type ListModels = (config: ConnectionConfig, signal: AbortSignal) => Promise<ModelInfo[]>;

function ConnectionsSection({ c, providers, test, listModels, notify }: {
  c: ConnectionState; providers: ProviderDefinition[]; test: SettingsPageTest; listModels: ListModels; notify: (title: string, lines?: string[]) => void;
}) {
  const navigate = useGuardedNavigation();
  const [selected, setSelected] = useState<string | null>(c.defaultId ?? c.profiles[0]?.id ?? null);
  const [draftNew, setDraftNew] = useState<ConnectionProfile | null>(null);
  const editing = draftNew ?? (selected ? c.byId.get(selected) : undefined);
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="master-detail">
      <div className="master" data-region="library">
        <ul className="master-list" data-testid="connection-list">
          {c.profiles.map((p) => (
            <li key={p.id}>
              <button className={`master-item${p.id === editing?.id && !draftNew ? " on" : ""}`} onClick={() => navigate(() => { setDraftNew(null); setSelected(p.id); })} aria-label={p.name}>
                <span className="side-icon big"><Icon name="plug" /></span>
                <span className="side-text">
                  <strong>{p.name}{p.id === c.defaultId && <span className="badge">default</span>}</strong>
                  <span>{needsKey(p.providerId) ? (p.model || "no model set") : providerName(p.providerId)}{p.params.reasoningEffort ? ` · thinking ${p.params.reasoningEffort}` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="master-foot">
          <Button onClick={() => navigate(() => setDraftNew(newProfile()))}><Icon name="plus" size={14} /> New Connection</Button>
        </div>
      </div>
      <div className="detail" data-region="editor">
        {editing
          ? <ConnectionEditor key={editing.id} initial={editing} isNew={!!draftNew} c={c} providers={providers} test={test} listModels={listModels}
              onSaved={(p) => { setDraftNew(null); setSelected(p.id); }}
              onDuplicate={(p) => setDraftNew(ConnectionProfile.parse({ ...p, id: crypto.randomUUID(), name: `${p.name} (copy)` }))}
              onDeleted={(n) => { setSelected(c.defaultId); notify("Connection deleted", n ? [`${n} session(s) that used it now use the default connection.`] : []); }}
              onCancel={() => setDraftNew(null)} />
          : <div className="empty-detail"><p>Select or create a connection.</p></div>}
      </div>
    </div>
  );
}

type SettingsPageTest = (config: ConnectionConfig) => Promise<Completion>;

function ConnectionEditor({ initial, isNew, c, providers, test, listModels, onSaved, onDuplicate, onDeleted, onCancel }: {
  initial: ConnectionProfile; isNew: boolean; c: ConnectionState; providers: ProviderDefinition[]; test: SettingsPageTest; listModels: ListModels;
  onSaved: (p: ConnectionProfile) => void; onDuplicate: (p: ConnectionProfile) => void; onDeleted: (sessions: number) => void; onCancel: () => void;
}) {
  const [d, setD] = useState<ConnectionProfile>(initial);
  const [dirty, setDirty] = useState(isNew);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [extra, setExtra] = useState(() => (Object.keys(initial.extraBody).length ? JSON.stringify(initial.extraBody, null, 2) : ""));
  const [extraError, setExtraError] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [nameTouched, setNameTouched] = useState(!isNew);
  const [picking, setPicking] = useState(false);
  const modelsKey = keyNameOf(d);
  const [known, setKnown] = useState<ModelInfo[] | undefined>(() => cachedModels(modelsKey));
  useEffect(() => setKnown(cachedModels(modelsKey)), [modelsKey]);
  const info = known?.find((m) => m.id === d.model.trim());
  // when the saved profile changes elsewhere (e.g. samplers in the Prompt tab), follow it unless editing
  useEffect(() => { if (!dirty) setD(initial); }, [initial, dirty]);
  const set = (patch: Partial<ConnectionProfile>) => {
    setD((x) => {
      const next = { ...x, ...patch };
      if (!nameTouched && ("model" in patch || "baseUrl" in patch || "providerId" in patch)) next.name = suggestName(next.providerId, next.baseUrl, next.model);
      return next;
    });
    setDirty(true); setSaved(false); setResult(null);
  };
  const keyed = needsKey(d.providerId);
  const status = c.keyStatus(d);
  const isDefault = c.defaultId === d.id;

  const parseExtra = (): Record<string, unknown> | null => {
    if (!extra.trim()) { setExtraError(""); return {}; }
    try {
      const v = JSON.parse(extra) as unknown;
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("It must be an object: { \"field\": value }.");
      setExtraError("");
      return v as Record<string, unknown>;
    } catch (e) { setExtraError(`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`); return null; }
  };

  const navigate = useGuardedNavigation();
  const save = async () => {
    if (!d.name.trim()) { setError("The connection needs a name."); return false; }
    const extraBody = parseExtra();
    if (extraBody === null) return false;
    setError("");
    try {
      const p = ConnectionProfile.parse({ ...d, name: d.name.trim(), model: d.model.trim(), baseUrl: d.baseUrl.trim(), extraBody });
      await c.save(p);
      if (c.profiles.length === 0) await c.setDefault({ connectionId: p.id });
      setD(p); setDirty(false); setSaved(true);
      onSaved(p);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
  };

  useUnsavedChanges(dirty, () => save());
  const runTest = async () => {
    const extraBody = parseExtra();
    if (extraBody === null) return;
    const probe = ConnectionProfile.parse({ ...d, extraBody, fallbackId: null });
    setTesting(true); setResult(null);
    const started = Date.now();
    try {
      const r = await test(profileToConfig(probe, c.byId, (p) => c.keyOf(p) || undefined));
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const said = r.text.trim().slice(0, 80);
      setResult({ ok: true, text: `Works. It answered ${said ? `“${said}”` : "(only thinking, no text — raise Max Length if this model thinks a lot)"} in ${secs} s${r.model ? ` (${r.model})` : ""}.` });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
    setTesting(false);
  };

  const others = c.profiles.filter((p) => p.id !== d.id);
  return (
    <div className="editor conn-editor" aria-label="Connection editor">
      <div className="session-bar">
        <h2 className="editor-title">{isNew ? "New Connection" : d.name || "Connection"}</h2>
        <span className="spacer" />
        {isNew && <Button small onClick={() => navigate(onCancel)}>Cancel</Button>}
      </div>
      <div className="editor-body settings-body">
        <Group title="Connection">
          <Row label="Name">
            <input aria-label="Connection name" value={d.name} onChange={(e) => { setNameTouched(true); set({ name: e.target.value }); }} />
          </Row>
          <Row label="AI" help="OpenAI-compatible supports OpenRouter, nano-gpt and local servers. Offline test AI uses scripted replies.">
            <select aria-label="AI provider" value={d.providerId} onChange={(e) => set({ providerId: e.target.value })}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Row>
          {keyed && <>
            <Row label="Address" help="Blank uses OpenRouter. For other services, enter the API address.">
              <input aria-label="Address" value={d.baseUrl} placeholder="https://openrouter.ai/api/v1"
                onChange={(e) => set({ baseUrl: e.target.value })} onBlur={() => void c.loadKey(d)} />
            </Row>
            <Row label="API Key" help="Connections with the same address share a key. Keys stay in your system credential store.">
              <input aria-label="API key" type="password" value={c.keyOf(d)} placeholder="sk-…"
                onChange={(e) => c.typeKey(d, e.target.value)} onBlur={() => { if (status.kind === "unsaved") void c.saveKey(d); }} />
            </Row>
            <Row wide>
              <span className="hint key-status" data-testid="key-status">
                {status.kind === "saved" && <>✓ Key saved {c.persistentKeys ? "in the system credential store" : "for this preview only"}. </>}
                {status.kind === "unsaved" && <>Key not saved yet. Leave the field to save. </>}
                {status.kind === "empty" && <>No key saved for this address. </>}
                {status.kind === "error" && <>Could not use the secure key storage: {status.message}. </>}
                {status.kind === "saved" && <button className="link" onClick={() => void c.forgetKey(d)}>Forget Key</button>}
              </span>
            </Row>
            <Row label="Model" help="Enter the provider's model ID or select Browse.">
              <span className="model-field">
                <input aria-label="Model" value={d.model} placeholder="e.g. deepseek/deepseek-chat" onChange={(e) => set({ model: e.target.value })} />
                <Button small onClick={() => setPicking((v) => !v)} aria-expanded={picking}>Browse</Button>
              </span>
            </Row>
            {picking && (
              <Row wide>
                <ModelPicker cacheKey={modelsKey} current={d.model.trim()} onLoaded={setKnown}
                  load={(signal) => listModels(profileToConfig(ConnectionProfile.parse({ ...d, fallbackId: null }), c.byId, (p) => c.keyOf(p) || undefined), signal)}
                  onPick={(m) => { set({ model: m.id }); setPicking(false); }} onClose={() => setPicking(false)} />
              </Row>
            )}
            {info && !picking && <Row wide><span className="hint" data-testid="model-info">{info.name ? `${info.name}: ` : ""}{modelMeta(info) || "no details from the service"}</span></Row>}
          </>}
          {keyed && <Row label="Streaming" help="Off requests the full response at once.">
            <Switch label="Streaming" checked={d.streaming} onChange={(streaming) => set({ streaming })} />
          </Row>}
          {keyed && <Row label="This Model Can See Pictures" help={d.vision !== "auto" ? "The Assistant sends pictures to it as they are (Yes) or has them described (No)." : info?.vision === true ? "Auto: the service says it can." : info?.vision === false ? "Auto: the service says it can't." : "Auto: as the service's model list says (Browse once to check)."}>
            {/* D-115: a model that can't see pictures gets them described by the vision model (Assistant → Customize → Pictures) */}
            <Segmented small label="Can see pictures" value={d.vision} onChange={(vision) => set({ vision })}
              options={[{ value: "auto", label: "Auto" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
          </Row>}
          <Row wide><span className="hint">{providers.find((p) => p.id === d.providerId)?.help}</span></Row>
        </Group>

        <Group title="Sampling and Thinking" help="Applies wherever this connection is used. Blank uses the model's default.">
          <ParamRows params={d.params} onChange={(params) => set({ params })} allowedEfforts={info?.efforts} />
        </Group>

        <Group title="Limits and Backup">
          <Row label="Calls at Once" help="Default · 4 simultaneous calls.">
            <input aria-label="Calls at once" className="num" inputMode="numeric" placeholder="4" value={d.limits.maxConcurrent ?? ""}
              onChange={(e) => { const n = parseInt(e.target.value, 10); set({ limits: { ...d.limits, maxConcurrent: Number.isFinite(n) ? Math.max(1, Math.min(32, n)) : undefined } }); }} />
          </Row>
          <Row label="Wait Between Calls" help="Seconds between call starts. Blank allows no delay.">
            <input aria-label="Wait between calls" className="num" inputMode="decimal" placeholder="0" value={d.limits.minIntervalMs === undefined ? "" : d.limits.minIntervalMs / 1000}
              onChange={(e) => { const n = Number(e.target.value.replace(",", ".")); set({ limits: { ...d.limits, minIntervalMs: e.target.value.trim() && Number.isFinite(n) ? Math.round(Math.max(0, Math.min(600, n)) * 1000) : undefined } }); }} />
          </Row>
          <Row label="Backup Connection" help="Used if this connection fails before producing text.">
            <select aria-label="Backup connection" value={d.fallbackId ?? ""} onChange={(e) => set({ fallbackId: e.target.value || null })}>
              <option value="">None</option>
              {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Row>
        </Group>

        <details className="advanced">
          <summary>Advanced <Help text="Adds JSON fields to every request. The app controls model, messages and stream." /></summary>
          <label>
            <span className="label-row">Extra request fields (JSON)</span>
            <textarea aria-label="Extra request fields" rows={4} value={extra} placeholder='{ "provider": { "order": ["z-ai"] } }'
              onChange={(e) => { setExtra(e.target.value); setDirty(true); setSaved(false); }} onBlur={() => void parseExtra()} />
          </label>
          {extraError && <div className="error-bar inline" role="alert">{extraError}</div>}
          <label>
            <span className="label-row">Notes <Help text="Only for you: prices, which model is good for what…" /></span>
            <textarea aria-label="Notes" rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </details>

        {result && <div className={`test-result ${result.ok ? "ok" : "bad"}`} role="status" data-testid="test-result">{result.ok ? "✓ " : "✗ "}{result.text}</div>}
        {error && <div className="error-bar inline" role="alert">{error}</div>}
        <div className="editor-actions">
          <SaveButton label={isNew ? "Create Connection" : "Save"} onSave={save} />
          {saved && !dirty && <span className="ok-text">✓ Saved</span>}
          <Button onClick={() => void runTest()} disabled={testing}>{testing ? "Testing…" : "Test Connection"}</Button>
          <Help text="Sends a tiny message ('Reply with just the word OK') with these settings, even before saving. It uses a few tokens." />
          {!isNew && <Button variant="plain" onClick={() => onDuplicate(d)}>Duplicate</Button>}
          <span className="spacer" />
          {!isNew && (
            <span className="default-row">
              <Switch label="Default connection" checked={isDefault} disabled={isDefault} onChange={(on) => { if (on) void c.setDefault({ connectionId: d.id }); }} />
              <span className="label-row">Default <Help text="Used when a chat has no connection selected. Select another connection to change the default." /></span>
            </span>
          )}
          {!isNew && !isDefault && <ConfirmButton label="Delete Connection" confirmLabel="Click Again to Delete"
            onConfirm={() => void c.remove(d.id).then(onDeleted, (e) => setError(e instanceof Error ? e.message : String(e)))} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Defaults (the Default layer of the setup, BLUEPRINT §3)

function DefaultsSection({ c, trackers, presets, defaultPresetId, personas, defaultPersonaId, defaultSetup, onSetDefaultSetup, onSetDefaultPersona }: {
  c: ConnectionState; trackers: Tracker[]; presets: Preset[]; defaultPresetId: string; personas: Persona[]; defaultPersonaId: string | null; defaultSetup: SetupLayer;
  onSetDefaultSetup: (patch: Partial<SetupLayer>) => Promise<void>; onSetDefaultPersona: (id: string | null) => Promise<void>;
}) {
  const options = c.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>);
  const overrides = defaultSetup.agentOverrides ?? {};
  const setTrackerConnection = (id: string, connectionId: string) => {
    const prev = overrides[id] ?? {};
    const next = { ...prev };
    if (connectionId) next.connectionId = connectionId; else delete next.connectionId;
    void onSetDefaultSetup({ agentOverrides: { ...overrides, [id]: next } });
  };
  // UX review item 7 (D-079): what most people change first (preset, persona) on top; connections next, with the
  // per-tracker choice folded under them; the default Author's Note last
  return (
    <div className="settings-page">
      <Group title="New chats and stories">
        <Row label="Preset" help="Edit in Library → Presets. Override in the chat's Prompt tab.">
          <select aria-label="Default preset" value={defaultPresetId} onChange={(e) => void onSetDefaultSetup({ presetId: e.target.value })}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row label="You Play As" help="Your default persona. Change it in each chat's toolbar.">
          <select aria-label="Default persona" value={defaultPersonaId ?? ""} onChange={(e) => void onSetDefaultPersona(e.target.value || null)}>
            <option value="">No persona (“User”)</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row label="Trackers on New Versions" help="Runs trackers on each new reply version. Off updates only when you continue from that version.">
          <Switch label="Trackers on new versions" checked={defaultSetup.trackersOnSwipe ?? true} onChange={(on) => void onSetDefaultSetup({ trackersOnSwipe: on })} />
        </Row>
      </Group>
      <Group title="Connections" help="Override in the chat's Prompt tab.">
        <Row label="Story" help="Writes the replies.">
          <select aria-label="Default story connection" value={c.defaultId ?? ""} onChange={(e) => void c.setDefault({ connectionId: e.target.value || null })}>
            {options}
          </select>
        </Row>
        <Row label="Agents & Trackers" help="Fallback for agents and trackers without their own connection.">
          <select aria-label="Default agents connection" value={c.defaultAgentId ?? ""} onChange={(e) => void c.setDefault({ agentConnectionId: e.target.value || null })}>
            <option value="">Same as the story</option>
            {options}
          </select>
        </Row>
      </Group>

      {trackers.length > 0 && (
        <details className="cz-adv defaults-more" data-testid="defaults-per-tracker">
          <summary>A Connection for One Tracker</summary>
          <p className="hint">Blank uses the agents' connection.</p>
          <Group>
          {trackers.map((t) => (
            <Row key={t.agent.id} label={t.agent.name}>
              <select aria-label={`${t.agent.name} connection`} value={overrides[t.agent.id]?.connectionId ?? ""} onChange={(e) => setTrackerConnection(t.agent.id, e.target.value)}>
                <option value="">Agents' connection</option>
                {options}
              </select>
            </Row>
          ))}
          </Group>
        </details>
      )}

      <AuthorsNoteGroup level="default" layer={defaultSetup} above={AUTHORS_NOTE_DEFAULTS} testId="default-authors-note"
        onChange={(l) => void onSetDefaultSetup({ authorsNote: l.authorsNote })} />
    </div>
  );
}
