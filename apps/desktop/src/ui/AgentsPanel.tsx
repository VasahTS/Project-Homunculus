// Homunculus 2 — the chat's agents panel (the ✦ button) and a run's details (D-048, draft 3 sections 1 and 5).
// Author: CLAUDE, 2026-10-30.
// Like the original app's panel: search, trackers and agents together, the switch on the left, the kind and the model as
// labels, a status line that follows the run live (agent.started / finished / failed), ▶ to run and ✎ to edit. A run's
// details show why it answered that: the model's reasoning, what it read, the raw answer, the result, and Compare.
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentConfig, AgentRun, Session, SetupLayer } from "@homunculus/schemas";
import type { DryRun } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { kindOf, whenOf } from "../agents.ts";
import { layerHasTracker, type Tracker } from "../trackers.ts";
import { useFloatingMenu } from "./FloatingMenu.ts";
import { Icon, IconButton, Segmented, Switch } from "./kit.tsx";
import { Modal } from "./Vault.tsx";
import { AgentView, type MessageAgentResults } from "./AgentResults.tsx";

interface Item { id: string; name: string; kind: string; tracker: boolean; manual: boolean; agent?: AgentConfig }
type Live = Record<string, { since: number } | undefined>;

/** Agents that are running right now on this session's messages, from the core's events. */
function useLiveRuns(svc: AppServices, onDone: () => void): Live {
  const [live, setLive] = useState<Live>({});
  const done = useRef(onDone); done.current = onDone;
  useEffect(() => {
    const ev = svc.core.events;
    const offs = [
      ev.on("agent.started", (e) => setLive((l) => ({ ...l, [e.agentId]: { since: Date.now() } })), "agents-panel"),
      ev.on("agent.finished", (e) => { setLive((l) => ({ ...l, [e.agentId]: undefined })); done.current(); }, "agents-panel"),
      ev.on("agent.failed", (e) => { setLive((l) => ({ ...l, [e.agentId]: undefined })); done.current(); }, "agents-panel"),
    ];
    return () => offs.forEach((off) => off());
  }, [svc]);
  return live;
}

function useTick(active: boolean) {
  const [, setT] = useState(0);
  useEffect(() => { if (!active) return; const t = setInterval(() => setT((x) => x + 1), 1000); return () => clearInterval(t); }, [active]);
}

// The panel hangs under the ✦ button, its right edge on the reading column's right edge, so it never covers the
// inspector (Daniel, 30/10).
const overStory = (fallback: number) => {
  const r = document.querySelector<HTMLElement>(".story-pane")?.getBoundingClientRect();
  if (!r) return fallback;
  const w = Math.min(440, window.innerWidth - 16);
  return Math.max(8, Math.min(r.right - w - 8, window.innerWidth - w - 8));
};

const secs = (ms: number | undefined) => (ms === undefined ? "" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`);
const shortModel = (m: string | undefined) => (m ? m.replace(/^.*\//, "").replace(/:thinking$/, "") : "");

export function AgentsPanel({ svc, agents, trackers, session, storySetup, latest, latestBefore, latestId, busy, connection, onToggle, onRun, onOpen, onEditTracker, onChanged, onPick, onStyle }: {
  svc: AppServices; agents: AgentConfig[]; trackers: Tracker[]; session: Session; storySetup?: SetupLayer | undefined;
  /** What agents did on the latest reply (and its id). */
  latest: MessageAgentResults | undefined; latestId: string | null;
  /** What "before the reply" agents did (they record on the message the reply answers). */
  latestBefore?: MessageAgentResults | undefined;
  busy: boolean; connection: ConnectionState;
  /** Switches an agent or a tracker on/off for this chat. */
  onToggle: (id: string, on: boolean, tracker: boolean) => void;
  /** Runs an agent (or tracker) by hand on the latest message, with an optional direction for that run (D-057). */
  onRun: (id: string, direction?: string) => Promise<void>;
  onOpen: (id: string | null) => void;
  onEditTracker: (id: string) => void;
  /** Something finished: reload what is shown in the chat. */
  onChanged: () => void;
  /** Sends a choice (choices agents that show "only in the panel"); undefined while a reply is being written. */
  onPick?: ((text: string) => void) | undefined;
  /** Picks an agent's style for this chat (null = the story's / the agent's default). */
  onStyle?: (agentId: string, styleId: string | null) => void;
}) {
  const live = useLiveRuns(svc, onChanged);
  const anyLive = Object.values(live).some(Boolean);
  useTick(anyLive);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [showOff, setShowOff] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<Item | null>(null);
  // a direction for the next run of the open agent (D-057; Daniel: "write 'options that lead to X' before running CYOA")
  const [direction, setDirection] = useState("");
  const items: Item[] = useMemo(() => [
    ...trackers.map((t) => ({ id: t.agent.id, name: t.agent.name, kind: "tracker", tracker: true, manual: false })),
    ...agents.map((a) => ({ id: a.id, name: a.name, kind: kindOf(a)?.short.toLowerCase() ?? a.output, tracker: false, manual: whenOf(a).when === "manual", agent: a })),
  ], [agents, trackers]);
  const isOn = (id: string) => layerHasTracker(session.setup, id, storySetup ? layerHasTracker(storySetup, id) : false);
  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => !needle || i.name.toLowerCase().includes(needle));
  const on = shown.filter((i) => isOn(i.id));
  const off = shown.filter((i) => !isOn(i.id));
  const onCount = items.filter((i) => isOn(i.id)).length;
  const runOf = (id: string): AgentRun | undefined => latest?.runs.find((r) => r.agentId === id) ?? latestBefore?.runs.find((r) => r.agentId === id);
  const anyFailed = items.some((i) => isOn(i.id) && runOf(i.id)?.status === "failed");
  const m = useFloatingMenu(Math.min(560, window.innerHeight - 80), 440, ".agp-search input");
  const run = async (id: string, dir = "") => {
    setError("");
    try { await onRun(id, dir); if (dir) setDirection(""); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const status = (i: Item) => {
    const l = live[i.id];
    if (l) return <span className="agp-status run"><i />Running… {Math.max(0, Math.round((Date.now() - l.since) / 1000))} s</span>;
    if (!isOn(i.id)) return <span className="agp-status"><i />Off in this chat</span>;
    const r = runOf(i.id);
    if (!r) return <span className="agp-status"><i />{busy && !i.manual && (i.tracker || whenOf(i.agent!).when === "after") ? "Waiting for the reply" : i.manual ? "Runs when you ask" : "Not run on the last reply"}</span>;
    if (r.status === "failed") return <span className="agp-status bad" title={r.error}><i />Failed: {r.error}</span>;
    if (r.status === "cancelled") return <span className="agp-status"><i />Stopped</span>;
    const what = Array.isArray(r.output) ? ` · ${r.output.length} options` : "";
    const before = !latest?.runs.some((x) => x.agentId === i.id);
    return <span className="agp-status ok"><i />{before ? "Ran before the last reply" : "Ran on the last reply"}{r.durationMs ? ` · ${secs(r.durationMs)}` : ""}{what}</span>;
  };
  // styles (versions of one agent): this chat's pick, else the story's, else the agent's default
  const chatStyle = (a: AgentConfig) => session.setup.agentOverrides?.[a.id]?.styleId;
  const styleById = (a: AgentConfig, id: string | undefined) => a.styles?.find((x) => x.id === id);
  const inheritedStyle = (a: AgentConfig) => (styleById(a, storySetup?.agentOverrides?.[a.id]?.styleId) ?? styleById(a, a.styleId) ?? a.styles?.[0])?.name ?? "";
  const styleName = (a: AgentConfig) => (a.styles?.length ? styleById(a, chatStyle(a))?.name ?? inheritedStyle(a) : "");
  const note = (i: Item) => [...(latest?.notes ?? [])].filter((n) => n.agentId === i.id).sort((a, b) => b.createdAt - a.createdAt)[0];

  const row = (i: Item) => {
    const here = isOn(i.id);
    const r = runOf(i.id);
    const isOpen = open === i.id;
    const n = isOpen ? note(i) : undefined;
    return (
      <div key={i.id} className={`agp-row${isOpen ? " open" : ""}${here ? "" : " off"}`} data-testid="agents-menu-item">
        <Switch label={`${i.name} in this chat`} checked={here} onChange={(v) => i.tracker ? onToggle(i.id, v, true) : onToggle(i.id, v, false)} />
        <button type="button" className="agp-main" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : i.id); setDirection(""); }}>
          <span className="agp-name"><b>{i.name}</b><span className="agp-chip">{i.kind}</span>{r?.model && <span className="agp-chip">{shortModel(r.model)}</span>}
            {i.agent?.runMode === "text" && <span className="agp-chip">no AI call</span>}
            {i.agent && styleName(i.agent) && <span className="agp-chip">{styleName(i.agent)}</span>}</span>
          {status(i)}
        </button>
        <span className="agp-acts">
          {here && <IconButton label={`Run ${i.name}`} className="agp-ib" disabled={busy || !!live[i.id] || !latestId} onClick={() => void run(i.id, isOpen ? direction : "")}><Icon name="play" size={13} /></IconButton>}
          <IconButton label={`Edit ${i.name}`} className="agp-ib" onClick={() => { m.setOpen(false); i.tracker ? onEditTracker(i.id) : onOpen(i.id); }}><Icon name="pencil" size={13} /></IconButton>
        </span>
        {isOpen && (
          <div className="agp-detail">
            {i.agent?.styles?.length && onStyle ? (
              <label className="row-line agp-style-row"><span className="hint">Style</span>
                <select className="agp-style" aria-label={`${i.name} style`} value={chatStyle(i.agent) ?? ""}
                  onChange={(e) => onStyle(i.id, e.target.value || null)}>
                  <option value="">{storySetup ? `From the story · ${inheritedStyle(i.agent)}` : `Default · ${inheritedStyle(i.agent)}`}</option>
                  {i.agent.styles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            ) : null}
            {n && (i.agent?.display?.note === "view" ? <AgentView name={i.name} kind={i.agent.display.view ?? "feed"} text={n.content} /> : <div className="agm-note">{n.content}</div>)}
            {r?.status === "ok" && i.agent?.output === "choices" && Array.isArray(r.output) && (
              <div className="choices-set" role="group" aria-label={i.name}>{(r.output as string[]).map((c, k) => (
                <button key={k} type="button" className="choice" disabled={!onPick} onClick={() => { m.setOpen(false); onPick?.(c); }}>{c}</button>))}</div>
            )}
            {r?.status === "failed" && <p className="error-text">{r.error}</p>}
            {here && !i.tracker && i.agent?.runMode !== "text" && (
              <label className="agp-direction"><span className="sr-only">Direction for the next run of {i.name}</span>
                <input placeholder="Direction for the next run (optional) · Enter runs" value={direction} disabled={busy || !!live[i.id] || !latestId}
                  onChange={(e) => setDirection(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void run(i.id, direction); } }} />
              </label>
            )}
            {r?.direction && <p className="hint">Last run's direction: “{r.direction}”</p>}
            {!r && <p className="hint">Nothing on the latest reply yet.</p>}
            <span className="agp-links">
              {r && <button type="button" className="link" onClick={() => setDetails(i)}>Details · why it did this</button>}
              {n && <button type="button" className="link quiet" onClick={() => void navigator.clipboard?.writeText(n.content).catch(() => {})}>Copy</button>}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <span className="agm" ref={m.box} onKeyDown={m.onKeyDown} onBlur={(e) => { if (!details) m.onBlur(e); }}>
      <button type="button" className={`agm-btn${onCount ? " has" : ""}${anyLive ? " live" : ""}`} aria-haspopup="dialog" aria-expanded={m.open} data-testid="agents-menu-button"
        aria-label={`Agents: ${onCount} on in this chat`} title="Agents and trackers in this chat" onClick={() => m.setOpen((v) => !v)}>
        <Icon name="sparkle" size={14} />{onCount > 0 && <span className="agm-count">{onCount}</span>}{anyFailed && <span className="agm-alert" aria-label="an agent failed" />}
      </button>
      {m.open && m.pos && (
        <div className="agp" role="dialog" aria-label="Agents in this chat" style={{ top: m.pos.top, left: overStory(m.pos.left) }} data-testid="agents-menu">
          <div className="agp-head">
            <span className="agp-title"><b>Agents in this chat</b><small>{storySetup ? "Your story's agents + this chat's changes · changes only affect this chat" : "Changes only affect this chat"}</small></span>
            <IconButton label="Close" onClick={() => m.setOpen(false)}><Icon name="close" size={14} /></IconButton>
          </div>
          <label className="agp-search search-box"><Icon name="search" size={13} /><input aria-label="Search agents" placeholder="Search agents and trackers" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="agp-list">
            {on.filter((i) => i.tracker).length > 0 && <div className="agp-sec">Trackers</div>}
            {on.filter((i) => i.tracker).map(row)}
            {on.filter((i) => !i.tracker).length > 0 && <div className="agp-sec">Agents</div>}
            {on.filter((i) => !i.tracker).map(row)}
            {on.length === 0 && <p className="hint agp-empty">{needle ? "Nothing on matches." : "Nothing on in this chat yet."}</p>}
            {off.length > 0 && <>
              <button type="button" className="agp-sec agp-toggle" aria-expanded={showOff || !!needle} onClick={() => setShowOff((v) => !v)}>
                <Icon name="chevron" size={12} />Off in this chat ({off.length})</button>
              {(showOff || needle) && off.map(row)}
            </>}
          </div>
          <div className="agp-foot"><button type="button" className="link quiet" onClick={() => { m.setOpen(false); onOpen(null); }}>Manage agents</button></div>
          {error && <p className="error-text agp-error" role="alert">{error}</p>}
        </div>
      )}
      {details && latestId && (
        <RunSheet svc={svc} item={details} run={runOf(details.id)} session={session} messageId={latestId} connection={connection} onClose={() => setDetails(null)} />
      )}
    </span>
  );
}

// ---------------------------------------------------------------- a run's details

type Tab = "reasoning" | "read" | "raw" | "result" | "compare";

export function RunSheet({ svc, item, run, session, messageId, connection, onClose }: {
  svc: AppServices; item: { id: string; name: string }; run: AgentRun | undefined; session: Session; messageId: string;
  connection: ConnectionState; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(run?.reasoning ? "reasoning" : "result");
  const meta = run ? [shortModel(run.model), secs(run.durationMs), run.tokensIn || run.tokensOut ? `${run.tokensIn ?? "?"} in / ${run.tokensOut ?? "?"} out` : ""].filter(Boolean).join(" · ") : "";
  return (
    <Modal title={`${item.name} · why it did this`} onClose={onClose} className="modal-small modal-run" testId="run-sheet"
      head={<span className="hint">{meta}</span>}>
      <Segmented small tabs label="Run details" value={tab} onChange={setTab} options={[
        { value: "reasoning", label: "Reasoning" }, { value: "read", label: "What it read" }, { value: "raw", label: "Raw answer" },
        { value: "result", label: "Result" }, { value: "compare", label: "Compare" }]} />
      {!run && tab !== "compare" && <p className="hint">It has not run on this reply.</p>}
      {run && tab === "reasoning" && (run.reasoning
        ? <pre className="run-mono" data-testid="run-reasoning">{run.reasoning}</pre>
        : <p className="hint">The model sent no reasoning for this run. Models that think (with “thinking” on in the connection) send it.</p>)}
      {run && tab === "read" && (run.prompt?.length
        ? <div className="run-prompt">{run.prompt.map((p, i) => <div key={i}><span className="run-role">{p.role}</span><pre className="run-mono">{p.content}</pre></div>)}</div>
        : <p className="hint">{run.error ? "It failed before calling the AI." : "No AI call: this agent adds its own text."}</p>)}
      {run && tab === "raw" && <pre className="run-mono">{run.raw ?? (run.error ? `Failed: ${run.error}` : "—")}</pre>}
      {run && tab === "result" && <pre className="run-mono">{run.status === "failed" ? `Failed: ${run.error}` : typeof run.output === "string" ? run.output : JSON.stringify(run.output, null, 2)}{run.warnings?.length ? `\n\nLeft out: ${run.warnings.join("; ")}` : ""}</pre>}
      {tab === "compare" && <Compare svc={svc} agentId={item.id} session={session} messageId={messageId} connection={connection} />}
    </Modal>
  );
}

function Compare({ svc, agentId, session, messageId, connection }: { svc: AppServices; agentId: string; session: Session; messageId: string; connection: ConnectionState }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [results, setResults] = useState<Array<{ label: string; r: DryRun }> | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setResults(null);
    try {
      const req = connection.forRequest();
      const cands = [undefined, ...picked.map((id) => req.connections[id])];
      const out = await svc.chat.turns.compareAgent(session.id, agentId, messageId, req.connection, cands, req.connections);
      setResults(out.map((r, i) => ({ label: i === 0 ? "Its own connection" : connection.byId.get(picked[i - 1]!)?.name ?? "?", r })));
    } catch (e) { setResults([{ label: "Error", r: { error: e instanceof Error ? e.message : String(e), durationMs: 0 } }]); }
    finally { setBusy(false); }
  };
  return (
    <div className="run-compare" data-testid="run-compare">
      <p className="hint">Runs this agent again on the same reply, with the same input, on the models you pick. Nothing is saved or changed.</p>
      <div className="row-line wrap">
        {connection.profiles.map((p) => (
          <label key={p.id} className="check"><input type="checkbox" checked={picked.includes(p.id)}
            onChange={(e) => setPicked((x) => e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id))} />{p.name}</label>
        ))}
        <button type="button" className="btn btn-bordered btn-small" disabled={busy} onClick={() => void go()}>{busy ? "Running…" : "Compare"}</button>
      </div>
      {results && <div className="run-cmp-grid">{results.map(({ label, r }, i) => (
        <div key={i} className="run-cmp-col">
          <b>{label}</b><span className="hint">{[shortModel(r.model), secs(r.durationMs)].filter(Boolean).join(" · ")}</span>
          <pre className="run-mono">{r.error ? `Failed: ${r.error}` : typeof r.output === "string" ? r.output : JSON.stringify(r.output, null, 2)}</pre>
          {r.reasoning && <details><summary>Reasoning</summary><pre className="run-mono">{r.reasoning}</pre></details>}
        </div>))}</div>}
    </div>
  );
}
