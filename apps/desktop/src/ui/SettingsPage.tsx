// Homunculus 2 — Settings: saved connections and the Default layer of the setup. Author: CLAUDE, 2026-10-28
// (slice 1b, D-020). Connections = master-detail like the Library; Defaults = Settings-style grouped rows.
// The look comes only from the kit and the theme tokens (D-018).
import { CustomizeSection } from "./CustomizeSection.tsx";
import type { Lorebook, LoreSettings } from "@homunculus/schemas";
import { LoreSettingsSection } from "./LorePanels.tsx";
import { useEffect, useState, type ReactNode } from "react";
import { ConnectionProfile, type Persona, type Preset, type SetupLayer } from "@homunculus/schemas";
import { AUTHORS_NOTE_DEFAULTS, profileToConfig, type Completion, type ConnectionConfig, type ModelInfo, type ProviderDefinition } from "@homunculus/core";
import { keyNameOf, needsKey, newProfile, suggestName, type ConnectionState } from "../connection.ts";
import { cachedModels, ModelPicker, modelMeta } from "./ModelPicker.tsx";
import type { Tracker } from "../trackers.ts";
import { ConfirmButton, Help } from "./Help.tsx";
import { Button, Group, Icon, Row, Segmented, Switch } from "./kit.tsx";
import { AuthorsNoteGroup } from "./AuthorsNote.tsx";
import { ParamRows } from "./ConnectionPanel.tsx";
import { Toolbar } from "./Toolbar.tsx";
import type { Updates } from "../updates.ts";
import { AboutSection } from "./About.tsx";

export type SettingsTab = "connections" | "defaults" | "lorebooks" | "customize" | "about";

export function SettingsPage({ lead, tab, onTab, c, providers, test, listModels, trackers, presets, defaultPresetId, personas, defaultPersonaId, defaultSetup, onSetDefaultSetup, onSetDefaultPersona, notify, lorebooks, loreSettings, onSaveLoreSettings, updates }: {
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
}) {
  return (
    // UX review items 1–2 (D-078): Settings is a place like Library — a big title and the same row of tabs under it
    <section className="library-workspace settings-workspace" data-region="library-workspace">
      <Toolbar lead={lead} title="Settings" subtitle="Connections, defaults for new chats, and how the app looks" />
      <nav className="library-tabs" aria-label="Settings sections" role="tablist">
        {SECTIONS.map((x) => (
          <button key={x.value} type="button" role="tab" aria-selected={tab === x.value} className="library-tab" aria-current={tab === x.value ? "page" : undefined}
            data-testid={`settings-${x.value}`} onClick={() => onTab(x.value)}><span>{x.label}</span></button>
        ))}
      </nav>
      <div className="library-workspace-content settings-content">
      {tab === "about" ? <AboutSection u={updates} />
        : tab === "customize" ? <CustomizeSection notify={notify} />
        : tab === "lorebooks" ? <LoreSettingsSection settings={loreSettings} onSave={onSaveLoreSettings} books={lorebooks} defaultSetup={defaultSetup} onSetDefaultSetup={onSetDefaultSetup} />
        : tab === "connections"
        ? <ConnectionsSection c={c} providers={providers} test={test} listModels={listModels} notify={notify} />
        : <DefaultsSection c={c} trackers={trackers} presets={presets} defaultPresetId={defaultPresetId} personas={personas} defaultPersonaId={defaultPersonaId} defaultSetup={defaultSetup}
            onSetDefaultSetup={onSetDefaultSetup} onSetDefaultPersona={onSetDefaultPersona} />}
      </div>
    </section>
  );
}

const SECTIONS: Array<{ value: SettingsTab; label: string }> = [
  { value: "connections", label: "Connections" }, { value: "defaults", label: "Defaults" }, { value: "lorebooks", label: "Lorebooks" },
  { value: "customize", label: "Customize" }, { value: "about", label: "About" },
];

// ---------------------------------------------------------------- Connections

type ListModels = (config: ConnectionConfig, signal: AbortSignal) => Promise<ModelInfo[]>;

function ConnectionsSection({ c, providers, test, listModels, notify }: {
  c: ConnectionState; providers: ProviderDefinition[]; test: SettingsPageTest; listModels: ListModels; notify: (title: string, lines?: string[]) => void;
}) {
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
              <button className={`master-item${p.id === editing?.id && !draftNew ? " on" : ""}`} onClick={() => { setDraftNew(null); setSelected(p.id); }} aria-label={p.name}>
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
          <Button onClick={() => setDraftNew(newProfile())}><Icon name="plus" size={14} /> New Connection</Button>
        </div>
      </div>
      <div className="detail" data-region="editor">
        {editing
          ? <ConnectionEditor key={editing.id} initial={editing} isNew={!!draftNew} c={c} providers={providers} test={test} listModels={listModels}
              onSaved={(p) => { setDraftNew(null); setSelected(p.id); }}
              onDuplicate={(p) => setDraftNew(ConnectionProfile.parse({ ...p, id: crypto.randomUUID(), name: `${p.name} (copy)` }))}
              onDeleted={(n) => { setSelected(c.defaultId); notify("Connection deleted", n ? [`${n} session(s) that used it now use the default connection.`] : []); }}
              onCancel={() => setDraftNew(null)} />
          : <div className="empty-detail"><p>Pick a connection on the left, or create a new one.</p></div>}
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

  const save = async () => {
    if (!d.name.trim()) { setError("The connection needs a name."); return; }
    const extraBody = parseExtra();
    if (extraBody === null) return;
    setError("");
    try {
      const p = ConnectionProfile.parse({ ...d, name: d.name.trim(), model: d.model.trim(), baseUrl: d.baseUrl.trim(), extraBody });
      await c.save(p);
      if (c.profiles.length === 0) await c.setDefault({ connectionId: p.id });
      setD(p); setDirty(false); setSaved(true);
      onSaved(p);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

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
    <div className="editor" aria-label="Connection editor">
      <div className="session-bar">
        <h2 className="editor-title">{isNew ? "New Connection" : d.name || "Connection"}</h2>
        <span className="spacer" />
        {isNew && <Button small onClick={onCancel}>Cancel</Button>}
      </div>
      <div className="editor-body settings-body">
        <Group title="Connection" help="Where the AI lives: the service, its address, your key and the model.">
          <Row label="Name" help="Any name you like, to recognize it in lists (e.g. 'GLM thinking' or 'Cheap trackers').">
            <input aria-label="Connection name" value={d.name} onChange={(e) => { setNameTouched(true); set({ name: e.target.value }); }} />
          </Row>
          <Row label="AI" help="Which kind of service. 'OpenAI-compatible' covers OpenRouter, nano-gpt, OpenAI and most local servers. 'Offline test AI' needs no key but only repeats scripted lines.">
            <select aria-label="AI provider" value={d.providerId} onChange={(e) => set({ providerId: e.target.value })}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Row>
          {keyed && <>
            <Row label="Address" help="Leave empty for OpenRouter. For another OpenAI-compatible service, paste its API address (it usually ends in /v1), e.g. https://nano-gpt.com/api/v1.">
              <input aria-label="Address" value={d.baseUrl} placeholder="https://openrouter.ai/api/v1"
                onChange={(e) => set({ baseUrl: e.target.value })} onBlur={() => void c.loadKey(d)} />
            </Row>
            <Row label="API Key" help="Your secret key from the service. It is stored in the Windows Credential Manager, never in files. Connections with the same address share the same key.">
              <input aria-label="API key" type="password" value={c.keyOf(d)} placeholder="sk-…"
                onChange={(e) => c.typeKey(d, e.target.value)} onBlur={() => { if (status.kind === "unsaved") void c.saveKey(d); }} />
            </Row>
            <Row wide>
              <span className="hint key-status" data-testid="key-status">
                {status.kind === "saved" && <>✓ Key saved {c.persistentKeys ? "in Windows Credential Manager (never in files)" : "for this preview only"}. </>}
                {status.kind === "unsaved" && <>Key not saved yet — it saves when you click outside the box. </>}
                {status.kind === "empty" && <>No key saved for this address. </>}
                {status.kind === "error" && <>Could not use the secure key storage: {status.message}. </>}
                {status.kind === "saved" && <button className="link" onClick={() => void c.forgetKey(d)}>Forget Key</button>}
              </span>
            </Row>
            <Row label="Model" help="The model's ID exactly as your service lists it, e.g. 'z-ai/glm-5.3:thinking'. 'Browse' asks the service for its list, so you can search and pick instead of typing.">
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
          <Row wide><span className="hint">{providers.find((p) => p.id === d.providerId)?.help}</span></Row>
        </Group>

        <Group title="Sampling and Thinking" help="How the AI picks its words and how long it thinks. Empty = the model's own default. These belong to this connection: every session and agent that uses it gets them.">
          <ParamRows params={d.params} onChange={(params) => set({ params })} allowedEfforts={info?.efforts} />
        </Group>

        <Group title="Limits and Backup" help="Agents and trackers run at the same time. Limits keep a service from refusing calls for being too many too fast.">
          <Row label="Calls at Once" help="At most this many calls to this connection at the same time. Empty = 4.">
            <input aria-label="Calls at once" className="num" inputMode="numeric" placeholder="4" value={d.limits.maxConcurrent ?? ""}
              onChange={(e) => { const n = parseInt(e.target.value, 10); set({ limits: { ...d.limits, maxConcurrent: Number.isFinite(n) ? Math.max(1, Math.min(32, n)) : undefined } }); }} />
          </Row>
          <Row label="Wait Between Calls" help="At least this many seconds between the start of two calls. Empty = no wait.">
            <input aria-label="Wait between calls" className="num" inputMode="decimal" placeholder="0" value={d.limits.minIntervalMs === undefined ? "" : d.limits.minIntervalMs / 1000}
              onChange={(e) => { const n = Number(e.target.value.replace(",", ".")); set({ limits: { ...d.limits, minIntervalMs: e.target.value.trim() && Number.isFinite(n) ? Math.round(Math.max(0, Math.min(600, n)) * 1000) : undefined } }); }} />
          </Row>
          <Row label="Backup Connection" help="If this connection fails before writing anything (service down, wrong key…), this one is tried instead. Once text has started, the error is shown.">
            <select aria-label="Backup connection" value={d.fallbackId ?? ""} onChange={(e) => set({ fallbackId: e.target.value || null })}>
              <option value="">None</option>
              {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Row>
        </Group>

        <details className="advanced">
          <summary>Advanced <Help text="For options the app has no control for yet: extra fields sent in every request, as JSON. Example for OpenRouter: { &quot;provider&quot;: { &quot;order&quot;: [&quot;z-ai&quot;] } }. The app's own fields (model, messages, stream) can't be changed here." /></summary>
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
          <button className="btn btn-prominent" onClick={() => void save()}>{isNew ? "Create Connection" : "Save"}</button>
          {saved && !dirty && <span className="ok-text">✓ Saved</span>}
          <Button onClick={() => void runTest()} disabled={testing}>{testing ? "Testing…" : "Test Connection"}</Button>
          <Help text="Sends a tiny message ('Reply with just the word OK') with these settings, even before saving. It uses a few tokens." />
          {!isNew && <Button variant="plain" onClick={() => onDuplicate(d)}>Duplicate</Button>}
          <span className="spacer" />
          {!isNew && (
            <span className="default-row">
              <Switch label="Default connection" checked={isDefault} disabled={isDefault} onChange={(on) => { if (on) void c.setDefault({ connectionId: d.id }); }} />
              <span className="label-row">Default <Help text="Used by every session that doesn't pick its own. To change the default, switch it on for another connection." /></span>
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
  return (
    <div className="settings-page">
      <p className="pane-note">What every session uses unless it picks something else (in the story's toolbar or in the inspector's Prompt tab).</p>
      <Group title="Connections" help="Which saved connections are used by default. Each session can pick others in the Prompt tab.">
        <Row label="Story" help="Writes the replies.">
          <select aria-label="Default story connection" value={c.defaultId ?? ""} onChange={(e) => void c.setDefault({ connectionId: e.target.value || null })}>
            {options}
          </select>
        </Row>
        <Row label="Agents & Trackers" help="Used by agents and trackers that don't have their own. A cheaper or faster model here saves money; the story keeps its own model.">
          <select aria-label="Default agents connection" value={c.defaultAgentId ?? ""} onChange={(e) => void c.setDefault({ agentConnectionId: e.target.value || null })}>
            <option value="">Same as the story</option>
            {options}
          </select>
        </Row>
      </Group>

      {trackers.length > 0 && (
        <Group title="Connection per Tracker" help="Give one tracker its own connection (for example a smarter model for the plot, a cheap one for the clock). Empty = the agents' connection above.">
          {trackers.map((t) => (
            <Row key={t.agent.id} label={t.agent.name}>
              <select aria-label={`${t.agent.name} connection`} value={overrides[t.agent.id]?.connectionId ?? ""} onChange={(e) => setTrackerConnection(t.agent.id, e.target.value)}>
                <option value="">Agents' connection</option>
                {options}
              </select>
            </Row>
          ))}
        </Group>
      )}

      <AuthorsNoteGroup level="default" layer={defaultSetup} above={AUTHORS_NOTE_DEFAULTS} testId="default-authors-note"
        onChange={(l) => void onSetDefaultSetup({ authorsNote: l.authorsNote })} />

      <Group title="Story" help="How stories behave by default.">
        <Row label="Preset" help="The recipe of the prompt for every session that doesn't pick its own (Prompt tab). Edit presets in Library → Presets.">
          <select aria-label="Default preset" value={defaultPresetId} onChange={(e) => void onSetDefaultSetup({ presetId: e.target.value })}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row label="You Play As" help="The default persona (your name and description in the story). Each session can pick another one in the story's toolbar.">
          <select aria-label="Default persona" value={defaultPersonaId ?? ""} onChange={(e) => void onSetDefaultPersona(e.target.value || null)}>
            <option value="">No persona (“User”)</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row label="Trackers on New Versions" help="When you ask for a new version of a reply (swipe), trackers run again for it. Off = they wait until you continue from that version, which saves tokens.">
          <Switch label="Trackers on new versions" checked={defaultSetup.trackersOnSwipe ?? true} onChange={(on) => void onSetDefaultSetup({ trackersOnSwipe: on })} />
        </Row>
      </Group>
    </div>
  );
}
