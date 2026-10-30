// Homunculus 2 — what agents did, shown in the chat (slice 5, D-047; approved draft "Homunculus Agents Draft" v2).
// Author: CLAUDE, 2026-10-30.
//  - AgentsMenu: the "✦ N" button in the chat's toolbar (Daniel chose the light option; a full Agents panel is kept as a
//    future Settings option): which agents are on here, how their last run went, switches, Run, and "menu" notes.
//  - AgentMarks: a small pencil (a rewrite) and amber triangle (a failed check) beside the speaker's name; details on click.
//  - NoteChips: notes shown "under the message", closed until clicked.
//  - Choices: buttons under the latest reply; a click sends it, right-click puts it in the message box.
import { useEffect, useState, type ReactNode } from "react";
import type { AgentConfig, AgentNote, AgentRun, MessageRevision, SetupLayer, Session } from "@homunculus/schemas";
import type { AppServices } from "../core-instance.ts";
import { kindOf, whenOf } from "../agents.ts";
import { layerHasTracker } from "../trackers.ts";
import { useFloatingMenu } from "./FloatingMenu.ts";
import { Icon, Switch } from "./kit.tsx";

export interface MessageAgentResults {
  /** The latest run of each agent on this message. */
  runs: AgentRun[];
  notes: AgentNote[];
  revisions: MessageRevision[];
}

/** Loads what agents did on these messages; again whenever `key` changes (a turn ended, an agent ran by hand…). */
export function useAgentResults(svc: AppServices, messageIds: string[], key: unknown): Map<string, MessageAgentResults> {
  const [map, setMap] = useState<Map<string, MessageAgentResults>>(new Map());
  const ids = messageIds.join("|");
  useEffect(() => {
    let off = false;
    void (async () => {
      const out = new Map<string, MessageAgentResults>();
      for (const id of messageIds) {
        const [runs, notes, revisions] = await Promise.all([svc.store.listAgentRuns(id), svc.store.listNotes(id), svc.store.listRevisions(id)]);
        const latest = new Map<string, AgentRun>();
        for (const r of [...runs].sort((a, b) => a.startedAt - b.startedAt)) latest.set(r.agentId, r);
        out.set(id, { runs: [...latest.values()], notes, revisions });
      }
      if (!off) setMap(out);
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svc, ids, key]);
  return map;
}

const latestNote = (r: MessageAgentResults | undefined, agentId: string) =>
  [...(r?.notes ?? [])].filter((n) => n.agentId === agentId).sort((a, b) => b.createdAt - a.createdAt)[0];

const pen = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
const warn = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>;

// ---------------------------------------------------------------- marks beside the speaker's name

export function AgentMarks({ results, agents, canWriteAgain, onUndo, onWriteAgain }: {
  results: MessageAgentResults | undefined; agents: AgentConfig[]; canWriteAgain: boolean;
  onUndo: (rev: MessageRevision) => void; onWriteAgain: () => void;
}) {
  const name = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  // the newest agent rewrite still on the message (an Undo adds a user revision after it)
  const revs = [...(results?.revisions ?? [])].sort((a, b) => a.createdAt - b.createdAt);
  const lastRev = revs.at(-1);
  const rewrite = lastRev?.author.kind === "agent" ? lastRev : undefined;
  const failed = (results?.runs ?? []).filter((r) => r.status === "ok" && agents.find((a) => a.id === r.agentId)?.output === "check"
    && (r.output as { pass?: boolean } | undefined)?.pass === false);
  const [ignored, setIgnored] = useState(false);
  if (!rewrite && (!failed.length || ignored)) return null;
  return (
    <span className="ag-marks">
      {rewrite && (
        <MarkPop label={`Rewritten by ${name((rewrite.author as { agentId: string }).agentId)}`} className="mk" icon={pen} text="polished" testId="mark-rewrite">
          {(close) => <>
            <span><b>{name((rewrite.author as { agentId: string }).agentId)}</b> rewrote this reply.</span>
            <details className="mk-original"><summary>See the original</summary><div className="mk-original-text">{rewrite.before}</div></details>
            <span className="mk-acts"><button type="button" className="link" onClick={() => { close(); onUndo(rewrite); }}>Undo</button></span>
          </>}
        </MarkPop>
      )}
      {failed.length > 0 && !ignored && (
        <MarkPop label={`${failed.length} check${failed.length === 1 ? "" : "s"} failed`} className="mk warn" icon={warn} text={String(failed.length)} testId="mark-check">
          {(close) => <>
            {failed.map((r) => <span key={r.id}><b>{name(r.agentId)}</b> · {(r.output as { reason?: string }).reason || "the reply did not pass."}</span>)}
            <span className="mk-acts">
              {canWriteAgain && <button type="button" className="link" onClick={() => { close(); onWriteAgain(); }}>Write again</button>}
              <button type="button" className="link quiet" onClick={() => { close(); setIgnored(true); }}>Ignore</button>
            </span>
          </>}
        </MarkPop>
      )}
    </span>
  );
}

function MarkPop({ label, className, icon, text, testId, children }: {
  label: string; className: string; icon: ReactNode; text: string; testId: string; children: (close: () => void) => ReactNode;
}) {
  const m = useFloatingMenu(180, 320, "button, summary");
  return (
    <span className="ag-mark" ref={m.box} onKeyDown={m.onKeyDown} onBlur={m.onBlur}>
      <button type="button" className={className} aria-haspopup="dialog" aria-expanded={m.open} aria-label={label} title={label} data-testid={testId}
        onClick={() => m.setOpen((v) => !v)}>{icon}{text}</button>
      {m.open && m.pos && (
        <span className="mk-pop" role="dialog" aria-label={label} style={{ top: m.pos.top, left: m.pos.left }}>{children(() => m.setOpen(false))}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- notes under the message

export function NoteChips({ results, agents }: { results: MessageAgentResults | undefined; agents: AgentConfig[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = agents.filter((a) => a.output === "note" && (a.display?.note ?? "message") === "message")
    .map((a) => ({ a, note: latestNote(results, a.id) })).filter((x) => x.note && x.note.content.trim());
  if (!shown.length) return null;
  const current = shown.find((x) => x.a.id === open);
  return (
    <div className="note-chips-wrap" data-testid="agent-notes">
      <div className="note-chips">
        {shown.map(({ a }) => (
          <button key={a.id} type="button" className="note-chip" aria-pressed={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
            <span className="note-dot" />{a.name}
          </button>
        ))}
      </div>
      {current && <div className="margin-note" role="note"><b>{current.a.name}</b> · {current.note!.content}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- choices under the latest reply

export function Choices({ results, agents, onPick, onEdit }: {
  results: MessageAgentResults | undefined; agents: AgentConfig[]; onPick: (text: string) => void; onEdit: (text: string) => void;
}) {
  const sets = (results?.runs ?? []).filter((r) => r.status === "ok" && agents.find((a) => a.id === r.agentId)?.output === "choices" && Array.isArray(r.output));
  if (!sets.length) return null;
  return (
    <div className="choices" data-testid="choices">
      {sets.map((r) => (
        <div key={r.id} className="choices-set" role="group" aria-label={agents.find((a) => a.id === r.agentId)?.name ?? "Choices"}>
          {(r.output as string[]).map((c, i) => (
            <button key={i} type="button" className="choice" title="Click: send it · Right-click: put it in the message box to edit"
              onClick={() => onPick(c)} onContextMenu={(e) => { e.preventDefault(); onEdit(c); }}>{c}</button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the ✦ button in the chat's toolbar

export function AgentsMenu({ agents, session, storySetup, latest, busy, onToggle, onRun, onOpen }: {
  agents: AgentConfig[]; session: Session; storySetup?: SetupLayer | undefined;
  /** What agents did on the latest reply. */
  latest: MessageAgentResults | undefined;
  busy: boolean;
  onToggle: (id: string, on: boolean) => void;
  /** Runs an agent by hand on the latest message. */
  onRun: (id: string) => Promise<void>;
  /** Opens the agent in Library → Agents (null = the list). */
  onOpen: (id: string | null) => void;
}) {
  const isOn = (id: string) => layerHasTracker(session.setup, id, storySetup ? layerHasTracker(storySetup, id) : false);
  const on = agents.filter((a) => isOn(a.id));
  const off = agents.filter((a) => !isOn(a.id));
  const runOf = (id: string) => latest?.runs.find((r) => r.agentId === id);
  const anyFailed = on.some((a) => runOf(a.id)?.status === "failed");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState("");
  const m = useFloatingMenu(Math.min(440, 120 + (on.length + (more ? off.length : 0)) * 40), 320, "button");
  const run = async (id: string) => {
    setRunning(id); setError("");
    try { await onRun(id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setRunning(null); }
  };
  const status = (a: AgentConfig) => {
    if (running === a.id) return <span className="st run">running</span>;
    const r = runOf(a.id);
    if (!r) return <span className="st">{busy && whenOf(a).when === "after" ? "waiting" : "—"}</span>;
    if (r.status === "failed") return <span className="st bad" title={r.error}>failed</span>;
    return <span className="st ok">ran</span>;
  };
  const row = (a: AgentConfig, isOnHere: boolean) => {
    const manual = whenOf(a).when === "manual";
    const inMenu = a.output === "note" && a.display?.note === "menu";
    const open = expanded === a.id;
    const note = inMenu ? latestNote(latest, a.id) : undefined;
    return (
      <div key={a.id} className={`agm-item${open ? " open" : ""}`} data-testid="agents-menu-item">
        <div className="agm-row">
          <button type="button" className="agm-name" aria-expanded={open} onClick={() => setExpanded(open ? null : a.id)}>
            <b>{a.name}</b><small>{kindOf(a)?.short}{inMenu ? " · shows here" : ""}</small>
          </button>
          {isOnHere && (manual ? <button type="button" className="btn btn-bordered btn-small" disabled={busy || running !== null} onClick={() => void run(a.id)}>Run</button> : status(a))}
          <Switch label={`${a.name} in this chat`} checked={isOnHere} onChange={(v) => onToggle(a.id, v)} />
        </div>
        {open && (
          <div className="agm-more">
            {note && <div className="agm-note">{note.content}</div>}
            {inMenu && !note && <p className="hint">No note on the latest reply yet.</p>}
            {runOf(a.id)?.status === "failed" && <p className="error-text">{runOf(a.id)!.error}</p>}
            <div className="agm-acts">
              {isOnHere && !manual && <button type="button" className="link quiet" disabled={busy || running !== null} onClick={() => void run(a.id)}>Run again</button>}
              <button type="button" className="link quiet" onClick={() => { m.setOpen(false); onOpen(a.id); }}>Edit in Library</button>
            </div>
          </div>
        )}
      </div>
    );
  };
  return (
    <span className="agm" ref={m.box} onKeyDown={m.onKeyDown} onBlur={m.onBlur}>
      <button type="button" className={`agm-btn${on.length ? " has" : ""}`} aria-haspopup="dialog" aria-expanded={m.open} data-testid="agents-menu-button"
        aria-label={`Agents: ${on.length} on in this chat`} title="Agents in this chat" onClick={() => m.setOpen((v) => !v)}>
        <Icon name="sparkle" size={14} />{on.length > 0 && <span className="agm-count">{on.length}</span>}{anyFailed && <span className="agm-alert" aria-label="an agent failed" />}
      </button>
      {m.open && m.pos && (
        <div className="agm-pop" role="dialog" aria-label="Agents in this chat" style={{ top: m.pos.top, left: m.pos.left }} data-testid="agents-menu">
          <div className="agm-head"><span>Agents in this chat</span><button type="button" className="link quiet" onClick={() => { m.setOpen(false); onOpen(null); }}>Manage</button></div>
          {on.length === 0 && <p className="hint agm-empty">None on yet.</p>}
          {on.map((a) => row(a, true))}
          {off.length > 0 && (more
            ? <><div className="agm-sep">Off in this chat</div>{off.map((a) => row(a, false))}</>
            : <button type="button" className="link quiet agm-add" onClick={() => setMore(true)}>+ Turn on another agent…</button>)}
          {agents.length === 0 && <p className="hint agm-empty">No agents yet. <button type="button" className="link" onClick={() => { m.setOpen(false); onOpen(null); }}>Make one</button></p>}
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      )}
    </span>
  );
}
