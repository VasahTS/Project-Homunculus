// Homunculus 2 — what agents did, shown in the chat (slice 5, D-047; approved draft "Homunculus Agents Draft" v2).
// Author: CLAUDE, 2026-10-30.
//  - AgentsMenu: the "✦ N" button in the chat's toolbar (Daniel chose the light option; a full Agents panel is kept as a
//    future Settings option): which agents are on here, how their last run went, switches, Run, and "menu" notes.
//  - AgentMarks: a small pencil (a rewrite) and amber triangle (a failed check) beside the speaker's name; details on click.
//  - NoteChips: notes shown "under the message", closed until clicked.
//  - Choices: buttons under the latest reply; a click sends it, right-click puts it in the message box.
import { useEffect, useState, type ReactNode } from "react";
import type { AgentConfig, AgentNote, AgentRun, MessageRevision } from "@homunculus/schemas";
import type { AppServices } from "../core-instance.ts";
import { useFloatingMenu } from "./FloatingMenu.ts";


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
