// Homunculus 2 — what agents did, shown in the chat (slice 5, D-047; drafts "Homunculus Agents Draft" v2–v3, D-048).
// Author: CLAUDE, 2026-10-30. The ✦ panel is in AgentsPanel.tsx. Each agent picks how its result shows (display):
//  - AgentMarks: a small pencil (a rewrite) and amber triangle (a failed check) beside the speaker's name. The pencil
//    opens the comparison (DiffSheet): word by word, side by side, keep the original of any change, or undo all.
//  - CheckLines: a failed check as a line under the reply (display.check = "line").
//  - NoteChips: notes under the message, as a closed label or an open card.
//  - Choices: buttons under the latest reply or a numbered list; ComposerChoices: above the message box.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AgentConfig, AgentNote, AgentRun, MessageRevision } from "@homunculus/schemas";
import type { AppServices } from "../core-instance.ts";
import { diffWords, mergeParts } from "../diff.ts";
import { useFloatingMenu } from "./FloatingMenu.ts";
import { Segmented } from "./kit.tsx";
import { Modal } from "./Vault.tsx";

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

const displayOf = (agents: AgentConfig[], id: string) => agents.find((a) => a.id === id)?.display;
/** The newest agent rewrite still on the message (an Undo or an edit adds a user revision after it). */
export function lastRewrite(results: MessageAgentResults | undefined): MessageRevision | undefined {
  const last = [...(results?.revisions ?? [])].sort((a, b) => a.createdAt - b.createdAt).at(-1);
  return last?.author.kind === "agent" ? last : undefined;
}
const failedChecks = (results: MessageAgentResults | undefined, agents: AgentConfig[]) => (results?.runs ?? []).filter((r) => r.status === "ok"
  && agents.find((a) => a.id === r.agentId)?.output === "check" && (r.output as { pass?: boolean } | undefined)?.pass === false);

export function AgentMarks({ results, agents, current, canWriteAgain, onSaveText, onWriteAgain }: {
  results: MessageAgentResults | undefined; agents: AgentConfig[];
  /** The message's text now (the rewrite's result, unless something changed it since). */
  current: string;
  canWriteAgain: boolean;
  /** Saves the message's text (kept as a user revision): Undo all, or the mix chosen in the comparison. */
  onSaveText: (text: string) => void; onWriteAgain: () => void;
}) {
  const name = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const rewrite = lastRewrite(results);
  const rewriter = rewrite ? (rewrite.author as { agentId: string }).agentId : "";
  const showRewrite = rewrite && (displayOf(agents, rewriter)?.rewrite ?? "mark") === "mark";
  const failed = failedChecks(results, agents).filter((r) => (displayOf(agents, r.agentId)?.check ?? "mark") === "mark");
  const [ignored, setIgnored] = useState(false);
  const [comparing, setComparing] = useState(false);
  if (!showRewrite && (!failed.length || ignored)) return null;
  return (
    <span className="ag-marks">
      {showRewrite && <>
        <button type="button" className="mk" aria-label={`Rewritten by ${name(rewriter)}: see the changes`} title={`Rewritten by ${name(rewriter)} · see the changes`}
          data-testid="mark-rewrite" onClick={() => setComparing(true)}>{pen}polished</button>
        {comparing && <DiffSheet who={name(rewriter)} before={rewrite!.before} after={current}
          onSave={(t) => { setComparing(false); onSaveText(t); }} onClose={() => setComparing(false)} />}
      </>}
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

/** Failed checks shown as a line under the reply (display.check = "line"). */
export function CheckLines({ results, agents, canWriteAgain, onWriteAgain }: {
  results: MessageAgentResults | undefined; agents: AgentConfig[]; canWriteAgain: boolean; onWriteAgain: () => void;
}) {
  const [ignored, setIgnored] = useState<string[]>([]);
  const lines = failedChecks(results, agents).filter((r) => displayOf(agents, r.agentId)?.check === "line" && !ignored.includes(r.id));
  if (!lines.length) return null;
  return <>{lines.map((r) => (
    <div key={r.id} className="check-line" role="note" data-testid="check-line">
      <span>{warn}<b>{agents.find((a) => a.id === r.agentId)?.name}</b> · {(r.output as { reason?: string }).reason || "the reply did not pass."}</span>
      {canWriteAgain && <button type="button" className="link" onClick={onWriteAgain}>Write again</button>}
      <button type="button" className="link quiet" onClick={() => setIgnored((x) => [...x, r.id])}>Ignore</button>
    </div>
  ))}</>;
}

// ---------------------------------------------------------------- the rewrite comparison

type DiffView = "changes" | "side" | "before" | "after";

/** Word-by-word comparison of a rewrite (Daniel, 10/30: "see clearly what changed and compare the two texts"). */
export function DiffSheet({ who, before, after, onSave, onClose }: {
  who: string; before: string; after: string; onSave: (text: string) => void; onClose: () => void;
}) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  const changes = parts.filter((p) => p.kind === "change").length;
  const [view, setView] = useState<DiffView>("changes");
  const [kept, setKept] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setKept((k) => { const n = new Set(k); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const result = mergeParts(parts, kept);
  const side = (which: "before" | "after") => parts.map((p, i) => p.kind === "same" ? <span key={i}>{p.text}</span>
    : which === "before" ? (p.before ? <del key={i} className="df-del">{p.before}</del> : null)
    : (p.after ? <ins key={i} className="df-ins">{p.after}</ins> : null));
  return (
    <Modal title={`Changes by ${who}`} onClose={onClose} className="modal-wide modal-diff" testId="diff-sheet"
      head={<span className="hint">{changes === 1 ? "1 change" : `${changes} changes`}{kept.size ? ` · ${kept.size} put back` : ""}</span>}>
      <Segmented small tabs label="Compare" value={view} onChange={setView} options={[
        { value: "changes", label: "Changes" }, { value: "side", label: "Side by side" }, { value: "before", label: "Original" }, { value: "after", label: "Rewritten" }]} />
      <div className="df-body">
        {view === "changes" && <div className="df-text">{parts.map((p, i) => p.kind === "same" ? <span key={i}>{p.text}</span> : (
          <span key={i} className={`df-chg${kept.has(p.id) ? " kept" : ""}`} role="button" tabIndex={0}
            aria-label={kept.has(p.id) ? "Use the rewritten words" : "Put the original words back"}
            title={kept.has(p.id) ? "Click to use the rewritten words" : "Click to put the original words back"}
            onClick={() => toggle(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(p.id); } }}>
            {kept.has(p.id) ? <span className="df-back">{p.before}</span> : <>{p.before && <del className="df-del">{p.before}</del>}{p.after && <ins className="df-ins">{p.after}</ins>}</>}
          </span>))}</div>}
        {view === "side" && <div className="df-side"><div><h5>Original</h5><div className="df-text">{side("before")}</div></div><div><h5>Rewritten</h5><div className="df-text">{side("after")}</div></div></div>}
        {view === "before" && <div className="df-text">{before}</div>}
        {view === "after" && <div className="df-text">{after}</div>}
      </div>
      <div className="modal-foot">
        <span className="hint grow">{view === "changes" ? "Click a change to put the original words back just there (click again to undo)." : "The rewritten text is the one in the chat; the original is kept."}</span>
        <button type="button" className="btn btn-bordered btn-small" onClick={() => onSave(before)}>Undo all</button>
        {kept.size > 0
          ? <button type="button" className="btn btn-prominent btn-small" onClick={() => onSave(result)}>Save {kept.size} put back</button>
          : <button type="button" className="btn btn-prominent btn-small" onClick={onClose}>Done</button>}
      </div>
    </Modal>
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
  const notes = agents.filter((a) => a.output === "note").map((a) => ({ a, how: a.display?.note ?? "message", note: latestNote(results, a.id) }))
    .filter((x) => x.note && x.note.content.trim() && x.how !== "menu");
  const chips = notes.filter((x) => x.how === "message");
  const cards = notes.filter((x) => x.how === "card");
  if (!notes.length) return null;
  const current = chips.find((x) => x.a.id === open);
  return (
    <div className="note-chips-wrap" data-testid="agent-notes">
      {cards.map(({ a, note }) => <div key={a.id} className="note-card" role="note"><b>{a.name}</b>{note!.content}</div>)}
      {chips.length > 0 && <div className="note-chips">
        {chips.map(({ a }) => (
          <button key={a.id} type="button" className="note-chip" aria-pressed={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
            <span className="note-dot" />{a.name}
          </button>
        ))}
      </div>}
      {current && <div className="margin-note" role="note"><b>{current.a.name}</b> · {current.note!.content}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- choices under the latest reply

/** The choices of the latest reply that want to show in this place. */
export function choiceSets(results: MessageAgentResults | undefined, agents: AgentConfig[], where: "buttons" | "list" | "composer" | "menu") {
  return (results?.runs ?? []).filter((r) => {
    const a = agents.find((x) => x.id === r.agentId);
    return r.status === "ok" && a?.output === "choices" && Array.isArray(r.output) && (a.display?.choices ?? "buttons") === where;
  }).map((r) => ({ run: r, name: agents.find((x) => x.id === r.agentId)?.name ?? "Choices", options: r.output as string[] }));
}

export function Choices({ results, agents, onPick, onEdit }: {
  results: MessageAgentResults | undefined; agents: AgentConfig[]; onPick: (text: string) => void; onEdit: (text: string) => void;
}) {
  const buttons = choiceSets(results, agents, "buttons");
  const lists = choiceSets(results, agents, "list");
  if (!buttons.length && !lists.length) return null;
  return (
    <div className="choices" data-testid="choices">
      {lists.map(({ run, name, options }) => (
        <ol key={run.id} className="choice-list" aria-label={name}>
          {options.map((c, i) => <li key={i}><button type="button" className="choice-line" title="Click: send it · Right-click: put it in the message box"
            onClick={() => onPick(c)} onContextMenu={(e) => { e.preventDefault(); onEdit(c); }}>{c}</button></li>)}
        </ol>
      ))}
      {buttons.map(({ run, name, options }) => <ChoiceButtons key={run.id} name={name} options={options} onPick={onPick} onEdit={onEdit} />)}
    </div>
  );
}

export function ChoiceButtons({ name, options, onPick, onEdit }: { name: string; options: string[]; onPick: (t: string) => void; onEdit: (t: string) => void }) {
  return (
    <div className="choices-set" role="group" aria-label={name}>
      {options.map((c, i) => (
        <button key={i} type="button" className="choice" title="Click: send it · Right-click: put it in the message box to edit"
          onClick={() => onPick(c)} onContextMenu={(e) => { e.preventDefault(); onEdit(c); }}>{c}</button>
      ))}
    </div>
  );
}

/** Choices that sit above the message box (display.choices = "composer"). */
export function ComposerChoices({ results, agents, onPick, onEdit }: {
  results: MessageAgentResults | undefined; agents: AgentConfig[]; onPick: (text: string) => void; onEdit: (text: string) => void;
}) {
  const sets = choiceSets(results, agents, "composer");
  if (!sets.length) return null;
  return <div className="composer-choices" data-testid="composer-choices">{sets.map(({ run, name, options }) => <ChoiceButtons key={run.id} name={name} options={options} onPick={onPick} onEdit={onEdit} />)}</div>;
}
