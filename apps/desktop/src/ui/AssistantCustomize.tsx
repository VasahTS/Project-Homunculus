// Homunculus 2 — Assistant → Customize, a full page (D-062, round 2). Author: CLAUDE, 2026-11-01.
// Daniel: "the menu is confusing and misses options; assistants should work almost like characters (see Flint);
// memories, rules… like a preset where I keep how I like things written and lore, so I don't repeat them".
// Four tabs: Assistants (who answers) · Presets (what it always knows) · Limits (how calls are paced) · Usage.
import { useEffect, useMemo, useState } from "react";
import { AssistantPersona, AssistantPreset, ConnectionProfile, type AssistantChat, type AssistantSettings } from "@homunculus/schemas";
import type { ModelInfo } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { builtinAssistant, listChats, loadChat, loadSettings, saveSettings } from "../assistant/engine.ts";
import { CORE_RULES } from "../assistant/guides.ts";
import { Button, Icon, IconButton, Segmented, Switch } from "./kit.tsx";
import { ModelPicker, modelMeta } from "./ModelPicker.tsx";
import { ConfirmButton } from "./Help.tsx";

type Tab = "assistants" | "presets" | "limits" | "usage";
const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));

export function AssistantCustomizePage({ svc, connection, lead, onClose, initialTab = "assistants" }: {
  svc: AppServices; connection: ConnectionState; lead: React.ReactNode; onClose: () => void; initialTab?: Tab;
}) {
  const [s, setS] = useState<AssistantSettings | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => { void loadSettings(svc.store).then(setS); }, [svc]);
  const put = (n: AssistantSettings) => { setS(n); void saveSettings(svc.store, n); };
  if (!s) return null;
  return (
    <section className="asst cust-page" data-testid="assistant-customize-page">
      <header className="asst-top">{lead}<span className="asst-title">Customize</span><Button small variant="plain" onClick={onClose}>Done</Button></header>
      <div className="cust-tabs"><Segmented tabs label="Customize" value={tab} onChange={setTab}
        options={[{ value: "assistants", label: "Assistants", testId: "cust-assistants" }, { value: "presets", label: "Presets", testId: "cust-presets" }, { value: "limits", label: "Limits", testId: "cust-limits" }, { value: "usage", label: "Usage", testId: "cust-usage" }]} /></div>
      <div className="cust-body">
        {tab === "assistants" && <AssistantsTab s={s} put={put} svc={svc} connection={connection} />}
        {tab === "presets" && <PresetsTab s={s} put={put} />}
        {tab === "limits" && <LimitsTab connection={connection} />}
        {tab === "usage" && <UsageTab svc={svc} />}
      </div>
    </section>
  );
}

/** A list on the left, the picked one on the right (like the Library). */
function Split({ list, detail }: { list: React.ReactNode; detail: React.ReactNode }) {
  return <div className="cust-split"><div className="cust-list">{list}</div><div className="cust-detail">{detail}</div></div>;
}

// ------------------------------------------------------------------ Assistants

function AssistantsTab({ s, put, svc, connection }: { s: AssistantSettings; put: (n: AssistantSettings) => void; svc: AppServices; connection: ConnectionState }) {
  const [sel, setSel] = useState(s.defaultAssistantId || s.assistants[0]?.id || "");
  const a = s.assistants.find((x) => x.id === sel) ?? s.assistants[0];
  const set = (patch: Partial<AssistantPersona>) => a && put({ ...s, assistants: s.assistants.map((x) => (x.id === a.id ? { ...x, ...patch } : x)) });
  const add = (base?: AssistantPersona) => {
    const n = AssistantPersona.parse({ ...(base ?? {}), id: crypto.randomUUID(), name: base ? `${base.name} (copy)` : "New assistant", emoji: base?.emoji ?? "✧", builtin: false });
    put({ ...s, assistants: [...s.assistants, n] }); setSel(n.id);
  };
  return (
    <Split
      list={<>
        {s.assistants.map((x) => (
          <button key={x.id} type="button" className={`cust-item${x.id === a?.id ? " on" : ""}`} onClick={() => setSel(x.id)} data-testid="cust-assistant">
            <span className="cust-emoji">{x.emoji || "✦"}</span>
            <span className="cust-item-t"><b>{x.name}{x.id === s.defaultAssistantId && <span className="cust-badge">Default</span>}</b><small>{x.description || "No description"}</small></span>
          </button>
        ))}
        <Button small variant="plain" onClick={() => add()} data-testid="cust-new-assistant"><Icon name="plus" size={12} /> New assistant</Button>
      </>}
      detail={a && <div className="cust-form">
        <div className="cust-head">
          <input className="cust-emoji-in" value={a.emoji} maxLength={4} aria-label="Emoji" onChange={(e) => set({ emoji: e.target.value })} />
          <input className="cust-name" value={a.name} aria-label="Name" onChange={(e) => set({ name: e.target.value || "Assistant" })} />
          {a.id !== s.defaultAssistantId ? <Button small onClick={() => put({ ...s, defaultAssistantId: a.id })}>Use for new chats</Button> : <span className="cust-badge big">Used for new chats</span>}
        </div>
        <label className="cust-field"><span>What it is for</span><input value={a.description} placeholder="One line, shown when you pick it" onChange={(e) => set({ description: e.target.value })} /></label>
        <label className="cust-field"><span>Instructions</span>
          <textarea rows={8} value={a.instructions} placeholder="Its personality and focus: what it cares about, how it talks, what it avoids." onChange={(e) => set({ instructions: e.target.value })} aria-label="Assistant instructions" />
          <small className="hint">The app's own rules (how to use the tools, never delete…) always go before these — ~{Math.round(CORE_RULES.length / 3.6)} tokens. Yours: ~{Math.round(a.instructions.length / 3.6)}.</small></label>
        <h4 className="cust-sub">Model</h4>
        <ModelRow svc={svc} connection={connection} connectionId={a.connectionId} model={a.model}
          onChange={(connectionId, model) => set({ connectionId, model })} />
        <div className="cust-grid">
          <label className="cust-field"><span>Thinking</span><select value={a.effort} onChange={(e) => set({ effort: e.target.value as AssistantPersona["effort"] })}><option value="">Model's default</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label className="cust-field"><span>Temperature</span><input type="number" min={0} max={2} step={0.1} value={a.temperature} onChange={(e) => set({ temperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })} /></label>
          <label className="cust-field"><span>Steps per message</span><input type="number" min={1} max={100} value={a.maxSteps} onChange={(e) => set({ maxSteps: Math.min(100, Math.max(1, Math.round(Number(e.target.value) || 1))) })} /><small className="hint">Tool calls before it stops and asks.</small></label>
          <label className="cust-field"><span>New items</span><select value={a.saveNew ? "now" : "ask"} onChange={(e) => set({ saveNew: e.target.value === "now" })}><option value="now">Save right away (Undo)</option><option value="ask">Ask me first</option></select><small className="hint">Changes to your items always wait for your OK.</small></label>
        </div>
        <div className="cust-actions">
          <Button small onClick={() => add(a)}>Duplicate</Button>
          <span className="grow" />
          {a.builtin
            ? <Button small variant="plain" onClick={() => { const b = builtinAssistant(a.id); if (b) set({ ...b, connectionId: a.connectionId, model: a.model }); }}>Reset to the app's version</Button>
            : <ConfirmButton label="Delete" confirmLabel="Delete this assistant" onConfirm={() => { put({ ...s, assistants: s.assistants.filter((x) => x.id !== a.id), defaultAssistantId: s.defaultAssistantId === a.id ? "homunculus" : s.defaultAssistantId }); setSel(s.defaultAssistantId); }} />}
        </div>
      </div>}
    />
  );
}

/** Connection + model, with the service's model list (prices, context size). Shared with the composer's model menu. */
export function ModelRow({ svc, connection, connectionId, model, onChange, onInfo }: {
  svc: AppServices; connection: ConnectionState; connectionId: string | null; model: string;
  onChange: (connectionId: string | null, model: string) => void; onInfo?: (m: ModelInfo) => void;
}) {
  const [picking, setPicking] = useState(false);
  const profile = connectionId ? connection.byId.get(connectionId) : connection.byId.get(connection.defaultId ?? "");
  const cfg = profile ? connection.configs[profile.id] : undefined;
  return (
    <div className="cust-model">
      <div className="cust-grid">
        <label className="cust-field"><span>Connection</span>
          <select value={connectionId ?? ""} onChange={(e) => onChange(e.target.value || null, "")} aria-label="Connection">
            <option value="">The one your stories use{connection.defaultId ? ` (${connection.byId.get(connection.defaultId)?.name ?? ""})` : ""}</option>
            {connection.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
        <label className="cust-field"><span>Model</span>
          <span className="cust-inline"><input value={model} placeholder={profile?.model || "The connection's model"} onChange={(e) => onChange(connectionId, e.target.value.trim())} aria-label="Model" />
            {cfg && <Button small onClick={() => setPicking(!picking)}>Browse…</Button>}</span></label>
      </div>
      {picking && cfg && (
        <ModelPicker cacheKey={`${cfg.providerId}|${cfg.baseUrl ?? ""}`} current={model || cfg.model}
          load={async (signal) => (await svc.core.providers.get(cfg.providerId)?.listModels?.(cfg, signal)) ?? []}
          onPick={(m) => { onChange(connectionId, m.id); onInfo?.(m); setPicking(false); }} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Presets

function PresetsTab({ s, put }: { s: AssistantSettings; put: (n: AssistantSettings) => void }) {
  const [sel, setSel] = useState(s.defaultPresetId || s.presets[0]?.id || "");
  const p = s.presets.find((x) => x.id === sel) ?? s.presets[0];
  const set = (patch: Partial<AssistantPreset>) => p && put({ ...s, presets: s.presets.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) });
  const [rule, setRule] = useState("");
  const [mem, setMem] = useState("");
  const add = (base?: AssistantPreset) => {
    const n = AssistantPreset.parse({ ...(base ? structuredClone(base) : {}), id: crypto.randomUUID(), name: base ? `${base.name} (copy)` : "New preset" });
    put({ ...s, presets: [...s.presets, n] }); setSel(n.id);
  };
  const size = (x: AssistantPreset) => Math.round((x.style.length + x.rules.filter((r) => r.on).reduce((n, r) => n + r.text.length, 0) + x.notes.filter((n) => n.on).reduce((n, t) => n + t.text.length + t.title.length, 0) + (x.memoryOn ? x.memory.reduce((n, m) => n + m.text.length, 0) : 0)) / 3.6);
  return (
    <Split
      list={<>
        <p className="hint cust-list-hint">What the assistant always knows. Each chat uses one (pick it under the message box).</p>
        {s.presets.map((x) => (
          <button key={x.id} type="button" className={`cust-item${x.id === p?.id ? " on" : ""}`} onClick={() => setSel(x.id)} data-testid="cust-preset">
            <span className="cust-emoji">📘</span>
            <span className="cust-item-t"><b>{x.name}{x.id === s.defaultPresetId && <span className="cust-badge">Default</span>}</b><small>{x.rules.length} rules · {x.notes.length} notes · {x.memory.length} memories · ~{size(x)} tokens</small></span>
          </button>
        ))}
        <Button small variant="plain" onClick={() => add()} data-testid="cust-new-preset"><Icon name="plus" size={12} /> New preset</Button>
      </>}
      detail={p && <div className="cust-form">
        <div className="cust-head">
          <input className="cust-name" value={p.name} aria-label="Preset name" onChange={(e) => set({ name: e.target.value || "Preset" })} />
          {p.id !== s.defaultPresetId ? <Button small onClick={() => put({ ...s, defaultPresetId: p.id })}>Use for new chats</Button> : <span className="cust-badge big">Used for new chats</span>}
        </div>
        <label className="cust-field"><span>About</span><input value={p.description} placeholder="e.g. “My dark fantasy setting”" onChange={(e) => set({ description: e.target.value })} /></label>
        <label className="cust-field"><span>How I like things written</span>
          <textarea rows={4} value={p.style} placeholder="Tone, length, format, point of view… e.g. “Cards in English, descriptions in prose around 800 tokens, first messages in third person, past tense.”" onChange={(e) => set({ style: e.target.value })} aria-label="How I like things written" /></label>

        <h4 className="cust-sub">Rules <small className="hint">always followed</small></h4>
        {p.rules.map((r) => (
          <div key={r.id} className="cust-row">
            <input value={r.text} aria-label="Rule" onChange={(e) => set({ rules: p.rules.map((x) => (x.id === r.id ? { ...x, text: e.target.value } : x)) })}
              onBlur={(e) => { if (!e.target.value.trim()) set({ rules: p.rules.filter((x) => x.id !== r.id) }); }} />
            <Switch label="Rule on" checked={r.on} onChange={(on) => set({ rules: p.rules.map((x) => (x.id === r.id ? { ...x, on } : x)) })} />
            <IconButton label="Delete rule" onClick={() => set({ rules: p.rules.filter((x) => x.id !== r.id) })}><Icon name="trash" size={14} /></IconButton>
          </div>
        ))}
        <form className="cust-row add" onSubmit={(e) => { e.preventDefault(); if (rule.trim()) { set({ rules: [...p.rules, { id: crypto.randomUUID(), text: rule.trim(), on: true }] }); setRule(""); } }}>
          <input value={rule} placeholder="Add a rule — e.g. “Lorebook keywords lowercase”" aria-label="New rule" onChange={(e) => setRule(e.target.value)} data-testid="assistant-new-rule" />
          <Button small type="submit" disabled={!rule.trim()}>Add</Button>
        </form>

        <h4 className="cust-sub">Notes and lore <small className="hint">your world, your characters' facts, a style sample…</small></h4>
        {p.notes.map((n) => (
          <div key={n.id} className="cust-note">
            <div className="cust-row">
              <input value={n.title} placeholder="Title" aria-label="Note title" onChange={(e) => set({ notes: p.notes.map((x) => (x.id === n.id ? { ...x, title: e.target.value } : x)) })} />
              <Switch label="Note on" checked={n.on} onChange={(on) => set({ notes: p.notes.map((x) => (x.id === n.id ? { ...x, on } : x)) })} />
              <IconButton label="Delete note" onClick={() => set({ notes: p.notes.filter((x) => x.id !== n.id) })}><Icon name="trash" size={14} /></IconButton>
            </div>
            <textarea rows={4} value={n.text} aria-label="Note" onChange={(e) => set({ notes: p.notes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)) })} />
            <small className="hint">~{Math.round(n.text.length / 3.6)} tokens</small>
          </div>
        ))}
        <Button small variant="plain" onClick={() => set({ notes: [...p.notes, { id: crypto.randomUUID(), title: "", text: "", on: true }] })}><Icon name="plus" size={12} /> Add a note</Button>

        <h4 className="cust-sub">Memory</h4>
        <div className="cust-row plain"><span className="grow hint">Things it learned about you. Sent while this preset is used.</span><span className="hint">On</span><Switch label="Memory on" checked={p.memoryOn} onChange={(memoryOn) => set({ memoryOn })} /></div>
        <div className="cust-row plain"><span className="grow hint">Let the assistant add to it (when you say “remember…”).</span><Switch label="Assistant can add" checked={p.autoMemory} onChange={(autoMemory) => set({ autoMemory })} /></div>
        {p.memory.map((m) => (
          <div key={m.id} className="cust-row">
            <span className="grow"><input value={m.text} aria-label="Memory" onChange={(e) => set({ memory: p.memory.map((x) => (x.id === m.id ? { ...x, text: e.target.value } : x)) })} />
              <small className="hint">{m.from ? `from “${m.from}” · ` : ""}{new Date(m.at).toLocaleDateString()}</small></span>
            <IconButton label="Forget" onClick={() => set({ memory: p.memory.filter((x) => x.id !== m.id) })}><Icon name="trash" size={14} /></IconButton>
          </div>
        ))}
        <form className="cust-row add" onSubmit={(e) => { e.preventDefault(); if (mem.trim()) { set({ memory: [...p.memory, { id: crypto.randomUUID(), text: mem.trim(), from: "", at: Date.now() }] }); setMem(""); } }}>
          <input value={mem} placeholder="Add something it should know about you" aria-label="New memory" onChange={(e) => setMem(e.target.value)} />
          <Button small type="submit" disabled={!mem.trim()}>Add</Button>
        </form>

        <div className="cust-actions">
          <span className="hint">~{size(p)} tokens in every request</span><span className="grow" />
          <Button small onClick={() => add(p)}>Duplicate</Button>
          {s.presets.length > 1 && <ConfirmButton label="Delete" confirmLabel="Delete this preset" onConfirm={() => { const rest = s.presets.filter((x) => x.id !== p.id); put({ ...s, presets: rest, defaultPresetId: s.defaultPresetId === p.id ? rest[0]!.id : s.defaultPresetId }); setSel(rest[0]!.id); }} />}
        </div>
      </div>}
    />
  );
}

// ------------------------------------------------------------------ Limits

function LimitsTab({ connection }: { connection: ConnectionState }) {
  const save = (p: ConnectionProfile, limits: ConnectionProfile["limits"]) => void connection.save(ConnectionProfile.parse({ ...p, limits }));
  const num = (v: string, lo: number, hi: number) => { const n = Number(v.replace(",", ".")); return v.trim() && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined; };
  return (
    <div className="cust-wide">
      <p className="hint">How calls to each service are paced — for the Assistant, your stories and the agents alike. Some services refuse many calls at once or too fast: lower “At once”, add a wait, let it try again.</p>
      {connection.profiles.length === 0 && <p className="hint">No connections yet (Settings → Connections).</p>}
      {connection.profiles.length > 0 && <div className="cust-table" role="table" aria-label="Limits per connection">
        <div className="cust-tr th" role="row"><span>Connection</span><span>At once</span><span>Wait between calls (s)</span><span>Try again when busy</span><span>Give up after (s)</span></div>
        {connection.profiles.map((p) => (
          <div key={p.id} className="cust-tr" role="row" data-testid="cust-limit-row">
            <span><b>{p.name}</b><small className="hint">{p.model || "no model"}</small></span>
            <input type="number" min={1} max={32} aria-label={`${p.name}: calls at once`} placeholder="4" value={p.limits.maxConcurrent ?? ""} onChange={(e) => save(p, { ...p.limits, maxConcurrent: num(e.target.value, 1, 32) })} />
            <input type="number" min={0} max={600} step={0.5} aria-label={`${p.name}: wait between calls`} placeholder="0" value={p.limits.minIntervalMs === undefined ? "" : p.limits.minIntervalMs / 1000} onChange={(e) => { const n = num(e.target.value, 0, 600); save(p, { ...p.limits, minIntervalMs: n === undefined ? undefined : Math.round(n * 1000) }); }} />
            <select aria-label={`${p.name}: tries again`} value={p.limits.retries ?? 0} onChange={(e) => save(p, { ...p.limits, retries: Number(e.target.value) || undefined })}>
              <option value={0}>No</option>{[1, 2, 3, 5, 8].map((n) => <option key={n} value={n}>{n} time{n > 1 ? "s" : ""}</option>)}
            </select>
            <input type="number" min={5} max={3600} aria-label={`${p.name}: timeout`} placeholder="never" value={p.limits.timeoutSec ?? ""} onChange={(e) => { const n = num(e.target.value, 5, 3600); save(p, { ...p.limits, timeoutSec: n === undefined ? undefined : Math.round(n) }); }} />
          </div>
        ))}
      </div>}
      <p className="hint">“Try again” waits 2, 4, 8… seconds and only retries when the service said it was busy or rate-limited (429, 5xx) and nothing was written yet. A backup connection is set in Settings → Connections.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Usage

function UsageTab({ svc }: { svc: AppServices }) {
  const [rows, setRows] = useState<Array<{ chat: AssistantChat; tokens: number; cost: number; replies: number }> | null>(null);
  useEffect(() => {
    void (async () => {
      const out = [];
      for (const r of await listChats(svc.store)) {
        const c = await loadChat(svc.store, r.id);
        if (!c) continue;
        const replies = c.messages.filter((m) => m.role === "assistant");
        out.push({ chat: c, replies: replies.length, tokens: replies.reduce((n, m) => n + (m.used?.tokensIn ?? 0) + (m.used?.tokensOut ?? 0), 0), cost: replies.reduce((n, m) => n + (m.used?.cost ?? 0), 0) });
      }
      setRows(out);
    })();
  }, [svc]);
  const total = useMemo(() => (rows ?? []).reduce((a, r) => ({ tokens: a.tokens + r.tokens, cost: a.cost + r.cost }), { tokens: 0, cost: 0 }), [rows]);
  if (!rows) return <p className="hint">Loading…</p>;
  return (
    <div className="cust-wide">
      <div className="cust-stats">
        <div><small>Chats</small><b>{rows.length}</b></div>
        <div><small>Tokens</small><b>{tokens(total.tokens)}</b></div>
        <div><small>Cost (as the services reported)</small><b>${total.cost.toFixed(3)}</b></div>
      </div>
      <div className="cust-table" role="table" aria-label="Usage per chat">
        <div className="cust-tr th u" role="row"><span>Chat</span><span>Replies</span><span>Tokens</span><span>Cost</span></div>
        {rows.map((r) => <div key={r.chat.id} className="cust-tr u" role="row"><span>{r.chat.title}</span><span>{r.replies}</span><span>{tokens(r.tokens)}</span><span>{r.cost ? `$${r.cost.toFixed(3)}` : "—"}</span></div>)}
      </div>
      <p className="hint">Some services don't report cost; then only tokens are counted.</p>
    </div>
  );
}

export { modelMeta };
