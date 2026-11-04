// Homunculus 2 — the Prompt tab's Memory group (D-054, D-083). Author: CLAUDE, 2026-10-30; 2026-11-04 (memory v2).
//
// Older messages are summarized into chapters, and the AI reads the chapters instead of them, so long chats stay
// consistent and cost less per reply. Memory v2 adds: closing a chapter by tokens, layers (old chapters merge into
// bigger summaries, Summaryception), Catch up for old chats, and Smart recall (a decision model such as Jev picks
// the chapters and quotes that bear on each reply; Daniel's friend's Chapter Memory + Marinara's recall).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SetupLayer } from "@homunculus/schemas";
import type { Chapter, MemorySettings } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { Button, Group, Row, Segmented, Switch } from "./kit.tsx";

type Listed = Chapter & { label: string; mergedInto?: string; sent: boolean };
type MemoryView = MemorySettings & { chapters: Listed[]; waiting: number; waitingTokens: number; dueChapters: number };
type Layer = NonNullable<SetupLayer["memory"]>;

export function MemoryGroup({ svc, session, headId, connection, storySetup, onChangeSession, refreshKey = 0 }: {
  svc: AppServices; session: Session; headId: string | null; connection: ConnectionState; storySetup?: SetupLayer | undefined;
  onChangeSession: (s: Session) => void | Promise<void>;
  /** Changes when a reply finished (a chapter may have closed). */
  refreshKey?: number;
}) {
  const [state, setState] = useState<MemoryView | null>(null);
  const [busy, setBusy] = useState<"" | "now" | "catch-up">("");
  const [progress, setProgress] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState("");
  const stop = useRef<AbortController | null>(null);
  const load = useCallback(() => svc.chat.turns.memoryAt(session.id, headId).then(setState).catch((e) => setError(String(e instanceof Error ? e.message : e))),
    [svc, session.id, headId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load, refreshKey, session.setup.memory, storySetup?.memory]);
  // what memory is doing right now ("Writing chapter 4…"); a finished step reloads the list
  useEffect(() => svc.core.events.on("memory.status", (e) => {
    if (e.sessionId !== session.id) return;
    setStatus(e.text);
    if (e.text === null) void load();
  }, "memory-group"), [svc, session.id, load]);
  useEffect(() => () => stop.current?.abort(), []);

  const own: Layer = session.setup.memory ?? {};
  const setMemory = (patch: Partial<Layer>) => {
    const next: Record<string, unknown> = { ...own, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const { memory: _drop, ...rest } = session.setup;
    void onChangeSession({ ...session, setup: Object.keys(next).length ? { ...rest, memory: next as Layer } : rest });
  };
  const changeChapters = async (update: (latest: Chapter[]) => Chapter[]) => {
    try {
      await svc.chat.turns.saveChapters(session.id, update);
      setError("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const saveChapter = (id: string, patch: Partial<Chapter>) => changeChapters(all => all.map(c => c.id === id ? { ...c, ...patch } : c));
  const remove = (id: string) => changeChapters(all => all.filter(c => c.id !== id));
  const now = async () => {
    if (!headId) return;
    setBusy("now"); setError("");
    try {
      const r = connection.forRequest();
      const c = await svc.chat.turns.summarizeNow(session.id, headId, r.connection, r.connections);
      if (!c) setError("Not enough older messages yet: the newest ones always go word for word.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };
  const catchUp = async () => {
    if (!headId) return;
    const ctl = new AbortController();
    stop.current = ctl;
    setBusy("catch-up"); setError(""); setProgress("");
    try {
      const r = connection.forRequest();
      const made = await svc.chat.turns.catchUpMemory(session.id, headId, r.connection, r.connections,
        (done, left) => setProgress(left ? `${done} written · ${left} to go` : `${done} written`), ctl.signal);
      setProgress(made ? `Done: ${made} chapter${made === 1 ? "" : "s"} written.` : "Nothing to catch up.");
    } catch (e) {
      setProgress("");
      if (ctl.signal.aborted) setProgress("Stopped. What was written is kept.");
      else setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); stop.current = null; await load(); }
  };

  const on = state?.on ?? false;
  const fromStory = (k: keyof Layer) => own[k] === undefined && storySetup?.memory?.[k] !== undefined ? " · from the story" : "";
  const level0 = state?.chapters.filter((c) => !c.level) ?? [];
  const merged = state?.chapters.filter((c) => c.level) ?? [];
  const profiles = connection.profiles;
  const title = level0.length ? `Memory · ${level0.length} chapter${level0.length === 1 ? "" : "s"}${state?.mode === "smart" ? " · smart" : ""}` : "Memory";
  return (
    <Group title={title} testId="memory-group"
      help="Older messages are summarized into chapters, and the AI reads the chapters instead of them. Long chats stay consistent and each reply sends fewer tokens. Uses the agents' connection (one short call per chapter). Branches keep their own chapters.">
      <Row label="Chapter summaries" help={`On: old messages become chapters, and the AI reads the chapters instead.${fromStory("on")}`}>
        <Switch label="Chapter summaries" checked={on} onChange={(v) => setMemory({ on: v })} />
      </Row>
      {on && state && <>
        <Row label="Close a chapter" help={`By number of messages, or when the waiting messages reach a size in tokens (it always ends at an AI reply).${fromStory("closeBy")}`}>
          <Segmented small label="Close a chapter by" value={state.closeBy} onChange={(closeBy) => setMemory({ closeBy })}
            options={[{ value: "messages", label: "Messages" }, { value: "tokens", label: "Tokens" }]} />
        </Row>
        {state.closeBy === "messages"
          ? <Row label="Messages per chapter"><NumberField label="Messages per chapter" value={state.every} min={4} max={500} onCommit={(n) => setMemory({ every: n })} /></Row>
          : <Row label="Tokens per chapter" help="About 4 characters per token."><NumberField label="Tokens per chapter" value={state.everyTokens} min={500} max={200000} onCommit={(n) => setMemory({ everyTokens: n })} /></Row>}
        <Row label="Always word for word" help="The newest messages are never summarized."><NumberField label="Newest messages kept word for word" value={state.keep} min={0} max={500} onCommit={(n) => setMemory({ keep: n })} /></Row>
        <Row label="Merge old chapters" help={`Layers: when there are more than ${state.layerSize} summaries, the oldest ${state.layerMerge} become one shorter summary (and those can merge again). Very long stories keep a small memory. The chapters stay; you can switch a merged summary off to send them again.${fromStory("layers")}`}>
          <Switch label="Merge old chapters" checked={state.layers} onChange={(v) => setMemory({ layers: v })} />
        </Row>
        {state.layers && <>
          <Row label="Merge after" help="How many summaries of one level may pile up before the oldest merge.">
            <NumberField label="Summaries before merging" value={state.layerSize} min={3} max={100} onCommit={(n) => setMemory({ layerSize: n })} />
          </Row>
          <Row label="Merge at a time" help="How many summaries become one.">
            <NumberField label="Summaries merged into one" value={state.layerMerge} min={2} max={10} onCommit={(n) => setMemory({ layerMerge: n })} />
          </Row>
        </>}
        <Row label="What the AI reads" help={`Simple: every summary, every reply (no extra call). Smart: before each reply a decision model picks the chapters that bear on it and quotes their key messages word for word; the last chapter and merged summaries always go. One cheap extra call per reply; a swipe reuses it.${fromStory("mode")}`}>
          <Segmented small label="What the AI reads" value={state.mode} onChange={(mode) => setMemory({ mode })}
            options={[{ value: "simple", label: "Simple" }, { value: "smart", label: "Smart" }]} />
        </Row>
        {state.mode === "smart" && <>
          <Row label="Decide with" help="Jev is a decision model on nano-gpt: it answers yes/no with a probability, fast, and only reads (input tokens only). The agents' model works with any service but is slower and costs more.">
            <Segmented small label="Decide with" value={state.decider} onChange={(decider) => setMemory({ decider })}
              options={[{ value: "jev", label: "Jev" }, { value: "agents", label: "Agents' model" }]} />
          </Row>
          {state.decider === "jev" && <>
            <Row label="Through" help="The saved connection whose address and key reach the decision model (a nano-gpt connection, e.g. https://nano-gpt.com/api/v1).">
              <select className="pick-select" aria-label="Decision model connection" value={state.deciderConnectionId} onChange={(e) => setMemory({ deciderConnectionId: e.target.value || undefined })}>
                <option value="">The agents' connection</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Row>
            <Row label="Decision model"><TextField label="Decision model" value={state.deciderModel} placeholder="typesafe/jev-latest" onCommit={(v) => setMemory({ deciderModel: v || undefined })} /></Row>
          </>}
          <Row label="Chapters to recall" help="At most, per reply (besides the last chapter, which always goes)."><NumberField label="Chapters to recall" value={state.recallChapters} min={0} max={30} onCommit={(n) => setMemory({ recallChapters: n })} /></Row>
          <Row label="Quotes per chapter" help="Messages quoted word for word when they hold something the summary lacks (an exact promise, a name, a number). 0 = summaries only."><NumberField label="Quotes per chapter" value={state.recallQuotes} min={0} max={12} onCommit={(n) => setMemory({ recallQuotes: n })} /></Row>
        </>}
        <Row wide>
          <span className="memory-status">
            <span className="hint" data-testid="memory-status">
              {status ?? <>{level0.length ? `${level0.length} chapter${level0.length === 1 ? "" : "s"} on this branch` : "No chapters yet"}{merged.length ? ` · ${merged.length} merged` : ""} · {state.waiting} message{state.waiting === 1 ? "" : "s"} waiting{state.closeBy === "tokens" ? ` (~${state.waitingTokens.toLocaleString()} tokens)` : ""}</>}
            </span>
            <span className="row-line">
              {busy === "catch-up"
                ? <Button small onClick={() => stop.current?.abort()} data-testid="memory-stop">Stop</Button>
                : state.dueChapters > 1 && <Button small onClick={() => void catchUp()} disabled={!!busy || !headId} data-testid="memory-catch-up"
                    title="Writes every chapter that waits, one after another (for an old or imported chat).">Catch Up ({state.dueChapters})</Button>}
              <Button small onClick={() => void now()} disabled={!!busy || state.waiting < 2 || !headId}>{busy === "now" ? "Summarizing…" : "Summarize now"}</Button>
            </span>
          </span>
        </Row>
        {progress && <Row wide><span className="hint" data-testid="memory-progress">{progress}</span></Row>}
        {state.chapters.map((c) => <ChapterRow key={c.id} c={c} into={state.chapters.find((x) => x.id === c.mergedInto)?.label}
          onSave={(p) => void saveChapter(c.id, p)} onRemove={() => void remove(c.id)} />)}
      </>}
      {!on && state && state.chapters.length > 0 && <Row wide><span className="hint">{state.chapters.length} summar{state.chapters.length === 1 ? "y" : "ies"} kept, not sent while this is off.</span></Row>}
      {error && <Row wide><span className="error-text" role="alert">{error}</span></Row>}
    </Group>
  );
}

function ChapterRow({ c, into, onSave, onRemove }: { c: Listed; into: string | undefined; onSave: (p: Partial<Chapter>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const text = useChapterDraft(c.summary);
  const title = useChapterDraft(c.title);
  const level = c.level ?? 0;
  return (
    <Row wide>
      <div className={`memory-chapter${c.off ? " off" : ""}${level ? " merged" : ""}${c.mergedInto ? " inside" : ""}`} data-testid="memory-chapter" data-level={level}>
        <div className="memory-chapter-head">
          <button type="button" className="memory-chapter-title" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <b>{c.label}{c.title ? ` · ${c.title}` : ""}</b>
            <small>{level ? `merged summary · ${c.messageCount} messages` : `${c.messageCount} messages`}
              {c.edited ? " · edited by you" : ""}{c.off ? " · not sent" : into ? ` · inside ${into}` : ""}</small>
          </button>
          <Switch label={`Send ${c.label}`} checked={!c.off} onChange={(v) => onSave({ off: !v })} />
        </div>
        {open && <div className="memory-chapter-body">
          <input aria-label={`${c.label} title`} value={title.value} onChange={(e) => title.change(e.target.value)} onBlur={() => { if (title.dirty()) onSave({ title: title.value, edited: true }); }} />
          <textarea rows={6} aria-label={`${c.label} summary`} value={text.value} onChange={(e) => text.change(e.target.value)}
            onBlur={() => { if (text.dirty()) onSave({ summary: text.value, edited: true }); }} />
          <span className="row-line"><span className="hint">{into ? `Sent inside ${into} (a shorter summary). Smart recall can still bring this one back. ` : ""}Edits save when you click away. The app never rewrites a summary you edited.</span>
            <span className="spacer" /><button type="button" className="link quiet danger-hover" title={level ? "The chapters it merged are sent again." : "Its messages go back to the AI word for word (or into the next chapter)."} onClick={onRemove}>Remove</button></span>
        </div>}
      </div>
    </Row>
  );
}

/** Refresh untouched fields only, retaining newer drafts even when they restore the original text. CODEX, T-001. */
function useChapterDraft(saved: string) {
  const [value, setValue] = useState(saved);
  const draft = useRef({ value: saved, dirty: false });
  useEffect(() => {
    if (!draft.current.dirty || draft.current.value === saved) {
      draft.current = { value: saved, dirty: false };
      setValue(saved);
    }
  }, [saved]);
  return { value, dirty: () => draft.current.dirty, change: (next: string) => {
    draft.current = { value: next, dirty: true };
    setValue(next);
  } };
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

function TextField({ label, value, placeholder, onCommit }: { label: string; value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return <input aria-label={label} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
    onBlur={() => { const v = text.trim(); if (v !== value) onCommit(v); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}
