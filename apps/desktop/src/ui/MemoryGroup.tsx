// Homunculus 2 — the Prompt tab's Memory group: simple chapter summaries (D-054). Author: CLAUDE, 2026-10-30.
//
// One switch, two numbers, and the chapters of the branch on screen. Old messages are summarized into chapters and
// the AI reads the chapters instead of them, so long chats stay consistent and cost less per reply.
// Smart recall (picking chapters per turn) is slice 8 (docs/MEMORY-PLAN.md).
import { useCallback, useEffect, useState } from "react";
import type { Session, SetupLayer } from "@homunculus/schemas";
import type { Chapter } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { Button, Group, Row, Switch } from "./kit.tsx";

export function MemoryGroup({ svc, session, headId, connection, storySetup, onChangeSession, refreshKey = 0 }: {
  svc: AppServices; session: Session; headId: string | null; connection: ConnectionState; storySetup?: SetupLayer | undefined;
  onChangeSession: (s: Session) => void | Promise<void>;
  /** Changes when a reply finished (a chapter may have closed). */
  refreshKey?: number;
}) {
  const [state, setState] = useState<{ chapters: Chapter[]; waiting: number; every: number; keep: number; on: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => svc.chat.turns.memoryAt(session.id, headId).then(setState).catch((e) => setError(String(e instanceof Error ? e.message : e))),
    [svc, session.id, headId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load, refreshKey, session.setup.memory, storySetup?.memory]);

  const own = session.setup.memory ?? {};
  const setMemory = (patch: Partial<NonNullable<SetupLayer["memory"]>>) => {
    const next = { ...own, ...patch };
    for (const k of Object.keys(next) as Array<keyof typeof next>) if (next[k] === undefined) delete next[k];
    const { memory: _drop, ...rest } = session.setup;
    void onChangeSession({ ...session, setup: Object.keys(next).length ? { ...rest, memory: next } : rest });
  };
  const saveChapter = async (id: string, patch: Partial<Chapter>) => {
    const all = await svc.chat.turns.chapters(session.id);
    await svc.chat.turns.saveChapters(session.id, all.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await load();
  };
  const remove = async (id: string) => {
    const all = await svc.chat.turns.chapters(session.id);
    await svc.chat.turns.saveChapters(session.id, all.filter((c) => c.id !== id));
    await load();
  };
  const now = async () => {
    if (!headId) return;
    setBusy(true); setError("");
    try {
      const r = connection.forRequest();
      const c = await svc.chat.turns.summarizeNow(session.id, headId, r.connection, r.connections);
      if (!c) setError("Not enough older messages yet: the newest ones always go word for word.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const on = state?.on ?? false;
  const from = own.on === undefined ? (storySetup?.memory?.on !== undefined ? " · from the story" : "") : "";
  return (
    <Group title={state?.chapters.length ? `Memory · ${state.chapters.length} chapter${state.chapters.length === 1 ? "" : "s"}` : "Memory"} testId="memory-group"
      help="Older messages are summarized into chapters, and the AI reads the chapters instead of them. Long chats stay consistent and each reply sends fewer tokens. Uses the agents' connection (one short call per chapter). Branches keep their own chapters.">
      <Row label="Chapter summaries" help={`On: every ${state?.every ?? 20} messages, the oldest ones become a chapter.${from}`}>
        <Switch label="Chapter summaries" checked={on} onChange={(v) => setMemory({ on: v })} />
      </Row>
      {on && state && <>
        <Row label="Messages per chapter"><NumberField label="Messages per chapter" value={state.every} min={4} max={500} onCommit={(n) => setMemory({ every: n })} /></Row>
        <Row label="Always word for word" help="The newest messages are never summarized."><NumberField label="Newest messages kept word for word" value={state.keep} min={0} max={500} onCommit={(n) => setMemory({ keep: n })} /></Row>
        <Row wide>
          <span className="memory-status">
            <span className="hint" data-testid="memory-status">{state.chapters.length ? `${state.chapters.length} chapter${state.chapters.length === 1 ? "" : "s"} on this branch` : "No chapters yet"} · {state.waiting} message{state.waiting === 1 ? "" : "s"} waiting</span>
            <Button small onClick={() => void now()} disabled={busy || state.waiting < 2 || !headId}>{busy ? "Summarizing…" : "Summarize now"}</Button>
          </span>
        </Row>
        {state.chapters.map((c, i) => <ChapterRow key={c.id} n={i + 1} c={c} onSave={(p) => void saveChapter(c.id, p)} onRemove={() => void remove(c.id)} />)}
      </>}
      {!on && state && state.chapters.length > 0 && <Row wide><span className="hint">{state.chapters.length} chapter(s) kept, not sent while this is off.</span></Row>}
      {error && <Row wide><span className="error-text" role="alert">{error}</span></Row>}
    </Group>
  );
}

function ChapterRow({ n, c, onSave, onRemove }: { n: number; c: Chapter; onSave: (p: Partial<Chapter>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(c.summary);
  const [title, setTitle] = useState(c.title);
  useEffect(() => { setText(c.summary); setTitle(c.title); }, [c.summary, c.title]);
  return (
    <Row wide>
      <div className={`memory-chapter${c.off ? " off" : ""}`} data-testid="memory-chapter">
        <div className="memory-chapter-head">
          <button type="button" className="memory-chapter-title" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <b>Chapter {n}{c.title ? ` · ${c.title}` : ""}</b>
            <small>{c.messageCount} messages{c.edited ? " · edited by you" : ""}{c.off ? " · not sent" : ""}</small>
          </button>
          <Switch label={`Send chapter ${n}`} checked={!c.off} onChange={(v) => onSave({ off: !v })} />
        </div>
        {open && <div className="memory-chapter-body">
          <input aria-label={`Chapter ${n} title`} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title !== c.title) onSave({ title, edited: true }); }} />
          <textarea rows={6} aria-label={`Chapter ${n} summary`} value={text} onChange={(e) => setText(e.target.value)}
            onBlur={() => { if (text !== c.summary) onSave({ summary: text, edited: true }); }} />
          <span className="row-line"><span className="hint">Edits save when you click away. The app never rewrites a chapter you edited.</span>
            <span className="spacer" /><button type="button" className="link quiet danger-hover" title="Its messages go back to the AI word for word (or into the next chapter)." onClick={onRemove}>Remove chapter</button></span>
        </div>}
      </div>
    </Row>
  );
}

function NumberField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n) || text.trim() === "") { setText(String(value)); return; }
    const v = Math.min(max, Math.max(min, n));
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  return <input className="num" aria-label={label} inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}
