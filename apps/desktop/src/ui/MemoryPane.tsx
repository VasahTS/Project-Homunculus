// Homunculus 2 — the inspector's Memory tab (D-084). Author: CLAUDE, 2026-11-04.
//
// Daniel (11/04, with a screenshot of the v1 Memory panel): "make a separate tab just for memory, like in the v1 app;
// you made it very hard to understand what is what and what things mean; a comprehensible UI, separate from the
// Prompt tab, with everything properly separated, how to use it, examples; think about the UX."
//
// Layout (from v1's Memory panel, simplified): a header that always says what memory is doing right now (on/off,
// chapters, tokens in the prompt, what waits) with "See What the AI Gets"; then three tabs:
//   Chapters — the next chapter (write it now, write it yourself, catch up), the list, and folded settings, each with
//              a live example that uses the numbers you chose;
//   Recall   — Simple or Smart as two choices that say what they cost; the decision model; "Try It" (what smart recall
//              would pick for what you are about to say) and the last reply's receipt;
//   Guide    — how memory works, step by step, with an example, the words it uses, and good-to-knows.
// Engine: packages/core/src/memory.ts + recall.ts (D-054, D-083).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { GenerationRecord, Session, SetupLayer } from "@homunculus/schemas";
import type { Chapter, MemorySettings, RecallResult } from "@homunculus/core";
import { DEFAULT_SUMMARY_PROMPT, isDecisionModel } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { Button, Collapse, Icon, Segmented, Switch } from "./kit.tsx";
import { ModelPicker } from "./ModelPicker.tsx";
import { MemoryReceipt } from "./ReplyPane.tsx";

type Listed = Chapter & { label: string; mergedInto?: string; sent: boolean; from: number; to: number };
type MemoryView = MemorySettings & {
  agentConnectionId: string | null; chatConnectionId: string | null; chatModelOverride: string;
  chapters: Listed[]; waiting: number; waitingTokens: number; dueChapters: number;
  waitingFrom: number; waitingTo: number; writeNowTo: number; promptText: string; promptTokens: number; covered: number;
};
type Layer = NonNullable<SetupLayer["memory"]>;
type View = "chapters" | "recall" | "guide";

const fmt = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function MemoryPane({ svc, session, headId, branchId, connection, storySetup, onChangeSession, refreshKey = 0, lastReplyId, draft = "" }: {
  svc: AppServices; session: Session; headId: string | null; branchId: string | null; connection: ConnectionState; storySetup?: SetupLayer | undefined;
  onChangeSession: (s: Session) => void | Promise<void>;
  /** Changes when a reply finished (a chapter may have closed). */
  refreshKey?: number;
  /** The newest AI reply on screen (its memory receipt shows under Recall). */
  lastReplyId?: string | null | undefined;
  /** What is in the message box now (Try It starts from it). */
  draft?: string;
}) {
  const [state, setState] = useState<MemoryView | null>(null);
  const [view, setView] = useState<View>("chapters");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [peekOpen, setPeekOpen] = useState(false);
  const load = useCallback(() => svc.chat.turns.memoryAt(session.id, headId, branchId).then((s) => { setState(s); setError(""); })
    .catch((e) => setError(String(e instanceof Error ? e.message : e))), [svc, session.id, headId, branchId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load, refreshKey, session.setup.memory, storySetup?.memory]);
  useEffect(() => svc.core.events.on("memory.status", (e) => {
    if (e.sessionId !== session.id || (e.branchId ?? null) !== branchId) return;
    setStatus(e.text);
    if (e.text === null) void load();
  }, "memory-pane"), [svc, session.id, branchId, load]);
  useEffect(() => { setPeekOpen(false); }, [headId, refreshKey]);

  const own: Layer = session.setup.memory ?? {};
  const memorySave = useRef(Promise.resolve());
  const saveMemory = (patch: Partial<Layer>) => {
    // CODEX: Read each patch against the last saved setup, including a pending edit to another memory setting.
    const saved = memorySave.current.catch(() => {}).then(async () => {
      const latest = await svc.store.getSession(session.id);
      if (!latest) throw new Error("This chat is no longer available.");
      const next: Layer = { ...latest.setup.memory, ...patch };
      for (const k of Object.keys(next) as Array<keyof Layer>) if (next[k] === undefined) delete next[k];
      const { memory: _drop, ...rest } = latest.setup;
      await onChangeSession({ ...latest, setup: Object.keys(next).length ? { ...rest, memory: next } : rest });
      await load();
    });
    memorySave.current = saved;
    return saved;
  };
  const setMemory = (patch: Partial<Layer>) => { void saveMemory(patch).catch((e) => setError(String(e instanceof Error ? e.message : e))); };
  const fromStory = (k: keyof Layer) => own[k] === undefined && storySetup?.memory?.[k] !== undefined;
  if (!state) return <div className="mem-pane" data-testid="memory-pane">{error && <p className="error-text" role="alert">{error}</p>}</div>;
  const level0 = state.chapters.filter((c) => !c.level);
  const merged = state.chapters.filter((c) => c.level);
  const sentChapters = state.chapters.filter((c) => c.sent).length;
  const showPeek = peekOpen && state.on && sentChapters > 0;

  return (
    <div className="mem-pane" data-testid="memory-pane">
      <header className={`mem-head${state.on ? " on" : ""}`} data-testid="memory-head">
        <div className="mem-head-top">
          <span className="mem-head-icon" aria-hidden><Icon name="book" size={18} /></span>
          <div className="mem-head-title">
            <b>Memory</b>
            <span>{state.on ? (state.mode === "smart" ? "On · Smart recall" : "On · Simple") : "Off"}{fromStory("on") ? " · from the story" : ""}</span>
          </div>
          <Switch label="Memory" checked={state.on} onChange={(v) => setMemory({ on: v })} />
        </div>
        {state.on && (
          <div className="mem-stats" data-testid="memory-stats">
            <Stat n={level0.length} label={level0.length === 1 ? "chapter" : "chapters"} sub={merged.length ? `${merged.length} merged` : undefined} />
            <Stat n={state.promptTokens} fmtN label="memory tokens" sub={state.covered ? `${state.covered} originals replaced` : undefined} />
            <Stat n={state.waiting} label="waiting" sub={state.waiting ? `#${state.waitingFrom}–#${state.waitingTo}` : "none"} />
          </div>
        )}
        {state.on && (
          <div className="mem-head-foot">
            <span className="hint" data-testid="memory-status">{status ?? (state.auto ? nextChapterHint(state) : "Automatic chapters are off: write them from Chapters.")}</span>
            <button type="button" className="link" onClick={() => setPeekOpen(!showPeek)} disabled={!sentChapters} data-testid="memory-peek">
              <Icon name={showPeek ? "eyeOff" : "eye"} size={13} /> {showPeek ? "Hide" : "See What the AI Gets"}
            </button>
          </div>
        )}
        <Collapse open={showPeek}>
          {showPeek && <div className="mem-peek" data-testid="memory-peek-text">
            <span className="hint">Memory text · ~{fmt(state.promptTokens)} tokens.{state.mode === "smart" ? " All available summaries. Use Recall → Try It to preview selection." : ""}</span>
            <pre>{state.promptText}</pre>
          </div>}
        </Collapse>
      </header>

      {!state.on ? <OffIntro chapters={state.chapters.length} onOn={() => setMemory({ on: true })} onGuide={() => setView("guide")} guide={view === "guide"} /> : null}

      {(state.on || view === "guide") && (
        <div className="mem-tabs">
          <Segmented tabs small label="Memory" value={view} onChange={setView} options={[
            { value: "chapters", label: "Chapters", testId: "memory-tab-chapters" },
            { value: "recall", label: "Recall", testId: "memory-tab-recall" },
            { value: "guide", label: "Guide", testId: "memory-tab-guide" },
          ]} />
        </div>
      )}

      {state.on && view === "chapters" && <ChaptersView svc={svc} session={session} headId={headId} branchId={branchId} connection={connection}
        state={state} setMemory={setMemory} saveMemory={saveMemory} fromStory={fromStory} reload={load} />}
      {state.on && view === "recall" && <RecallView svc={svc} session={session} headId={headId} branchId={branchId} connection={connection} state={state}
        setMemory={setMemory} waitForSettings={() => memorySave.current} lastReplyId={lastReplyId} draft={draft} refreshKey={refreshKey} />}
      {view === "guide" && <GuideView state={state} />}
      {error && <p className="error-text mem-error" role="alert">{error}</p>}
    </div>
  );
}

function Stat({ n, label, sub, fmtN = false }: { n: number; label: string; sub?: string | undefined; fmtN?: boolean }) {
  return <div className="mem-stat"><b className="tabular">{fmtN ? `~${fmt(n)}` : n}</b><span>{label}</span>{sub && <small>{sub}</small>}</div>;
}

function nextChapterHint(s: MemoryView): string {
  if (s.closeBy === "tokens") {
    const left = Math.max(0, s.everyTokens - s.waitingTokens);
    return left ? `Next chapter in ~${fmt(left)} tokens of chat.` : "A chapter will be written after the next reply.";
  }
  const left = Math.max(0, s.every - s.waiting);
  return left ? `Next chapter in ${plural(left, "message")}.` : "A chapter will be written after the next reply.";
}

// ---------------------------------------------------------------- off

function OffIntro({ chapters, onOn, onGuide, guide }: { chapters: number; onOn: () => void; onGuide: () => void; guide: boolean }) {
  if (guide) return null;
  return (
    <section className="mem-card mem-intro" data-testid="memory-intro">
      <h3>Remember older events</h3>
      <p>Memory summarizes older messages into <b>chapters</b> for the AI. Recent messages stay verbatim, and you can edit any chapter.</p>
      {chapters > 0 && <p className="hint">This chat already has {plural(chapters, "summary", "summaries")}, kept while memory is off.</p>}
      <div className="mem-actions">
        <Button variant="prominent" onClick={onOn} data-testid="memory-turn-on">Turn On Memory</Button>
        <button type="button" className="link" onClick={onGuide}>How it works</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- chapters

function ChaptersView({ svc, session, headId, branchId, connection, state, setMemory, saveMemory, fromStory, reload }: {
  svc: AppServices; session: Session; headId: string | null; branchId: string | null; connection: ConnectionState;
  state: MemoryView; setMemory: (p: Partial<Layer>) => void; saveMemory: (p: Partial<Layer>) => Promise<void>;
  fromStory: (k: keyof Layer) => boolean; reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"" | "now" | "catch-up">("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [writing, setWriting] = useState(false);
  const [own, setOwn] = useState({ title: "", summary: "" });
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);

  const change = async (update: (latest: Chapter[]) => Chapter[]) => {
    try { await svc.chat.turns.saveChapters(session.id, update, branchId); setError(""); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const now = async () => {
    if (!headId) return;
    setBusy("now"); setError(""); setProgress("");
    try {
      const r = connection.forRequest();
      const c = await svc.chat.turns.summarizeNow(session.id, headId, r.connection, r.connections, undefined, branchId);
      if (!c) setError("Not enough older messages yet: the newest ones always go word for word.");
      else setProgress(`Chapter written: ${c.title || "untitled"}.`);
      await reload();
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
        (done, left) => setProgress(left ? `Writing… ${done} done, ${left} to go` : `${done} done`), ctl.signal, branchId);
      setProgress(made ? `Done: ${plural(made, "chapter")} written.` : "Nothing to catch up.");
    } catch (e) {
      setProgress(ctl.signal.aborted ? "Stopped. What was written is kept." : "");
      if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); stop.current = null; await reload(); }
  };
  const saveOwn = async () => {
    if (!headId) return;
    try {
      const c = await svc.chat.turns.addOwnChapter(session.id, headId, own.title, own.summary, branchId);
      if (!c) { setError("Nothing waits for a chapter on this branch."); return; }
      setOwn({ title: "", summary: "" }); setWriting(false); setProgress(`Your chapter was saved${c.title ? `: ${c.title}` : ""}.`);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="mem-view" data-testid="memory-chapters">
      <section className="mem-card" data-testid="memory-next">
        <h3>Next chapter</h3>
        <p className="mem-lead">
          {state.waiting
            ? <>Waiting · <b>#{state.waitingFrom}–#{state.waitingTo}</b> ({plural(state.waiting, "message")}{state.closeBy === "tokens" ? `, ~${fmt(state.waitingTokens)} tokens` : ""}).</>
            : "Every older message is already in a chapter."}
        </p>
        {state.writeNowTo > 0 && state.writeNowTo < state.waitingTo && <p className="hint">
          Next chapter covers <b>#{state.waitingFrom}–#{state.writeNowTo}</b>. Later messages stay in Chat History.
        </p>}
        <div className="mem-actions">
          <Button small variant="prominent" onClick={() => void now()} disabled={!!busy || state.waiting < 2 || !headId} data-testid="memory-write-now"
            title="The AI writes one chapter using the configured chapter size.">
            <Icon name="sparkle" size={13} />{busy === "now" ? "Writing…" : "Write Chapter Now"}
          </Button>
          <Button small onClick={() => setWriting((v) => !v)} disabled={!!busy || !state.waiting} aria-expanded={writing} data-testid="memory-write-own">
            <Icon name="pencil" size={13} />Write It Myself
          </Button>
          {busy === "catch-up"
            ? <Button small onClick={() => stop.current?.abort()} data-testid="memory-stop">Stop</Button>
            : state.dueChapters > 1 && <Button small onClick={() => void catchUp()} disabled={!!busy || !headId} data-testid="memory-catch-up"
                title="For an old or imported chat: writes every chapter that waits, one after another.">Catch Up ({state.dueChapters})</Button>}
        </div>
        <Collapse open={writing}>
          <div className="mem-own">
            <input aria-label="Your chapter's title" placeholder="Title (a few words)" value={own.title} onChange={(e) => setOwn({ ...own, title: e.target.value })} />
            <textarea rows={6} aria-label="Your chapter's summary" placeholder={`What happened in messages #${state.waitingFrom}–#${state.waitingTo}: who did what, promises, what changed…`}
              value={own.summary} onChange={(e) => setOwn({ ...own, summary: e.target.value })} />
            <div className="mem-actions">
              <Button small variant="prominent" onClick={() => void saveOwn()} disabled={!own.summary.trim()}>Save Chapter</Button>
              <Button small variant="plain" onClick={() => setWriting(false)}>Cancel</Button>
              <span className="hint">It covers #{state.waitingFrom}–#{state.waitingTo}. The app never rewrites it.</span>
            </div>
          </div>
        </Collapse>
        {progress && <p className="hint" data-testid="memory-progress">{progress}</p>}
        {error && <p className="error-text" role="alert">{error}</p>}
      </section>

      <section className="mem-list">
        <h3 className="mem-list-title">Chapters on this branch</h3>
        {state.chapters.length === 0 ? (
          <div className="mem-empty"><Icon name="book" size={22} /><span>No chapters yet. {!state.auto ? "Make one above." : state.closeBy === "tokens"
            ? `The first one is written by itself once older messages pass ~${fmt(state.everyTokens)} tokens, or make one above.`
            : `The first one is written by itself once the chat has ${state.every + state.keep} messages, or make one above.`}</span></div>
        ) : state.chapters.map((c) => <ChapterCard key={c.id} c={c} into={state.chapters.find((x) => x.id === c.mergedInto)?.label}
          onSave={(p) => void change((all) => all.map((x) => x.id === c.id ? { ...x, ...p } : x))} onRemove={() => void change((all) => all.filter((x) => x.id !== c.id))} />)}
      </section>

      <Fold title="Automatic chapters" testId="memory-fold-auto" value={state.auto ? (state.closeBy === "tokens" ? `On · every ~${fmt(state.everyTokens)} tokens` : `On · every ${state.every} messages`) : "Off"}>
        <SettingRow label="Write chapters by themselves" help="Writes after a reply when a chapter is due." story={fromStory("auto")}>
          <Switch label="Write chapters by themselves" checked={state.auto} onChange={(v) => setMemory({ auto: v })} />
        </SettingRow>
        <SettingRow label="A chapter closes after" help="Chapters end at an AI reply." story={fromStory("closeBy")}>
          <Segmented small label="A chapter closes after" value={state.closeBy} onChange={(closeBy) => setMemory({ closeBy })}
            options={[{ value: "messages", label: "Messages" }, { value: "tokens", label: "Tokens" }]} />
        </SettingRow>
        {state.closeBy === "messages"
          ? <SettingRow label="Messages per chapter"><NumberField label="Messages per chapter" value={state.every} min={4} max={500} onCommit={(n) => setMemory({ every: n })} /></SettingRow>
          : <SettingRow label="Tokens per chapter"><NumberField label="Tokens per chapter" value={state.everyTokens} min={500} max={200000} onCommit={(n) => setMemory({ everyTokens: n })} /></SettingRow>}
        <SettingRow label="Always word for word" help="Keep this many recent messages verbatim.">
          <NumberField label="Newest messages kept word for word" value={state.keep} min={0} max={500} onCommit={(n) => setMemory({ keep: n })} />
        </SettingRow>
        <Example>{state.closeBy === "messages"
          ? <>At <b>{state.every + state.keep} messages</b>, #1–#{state.every} become Chapter 1. The newest {state.keep} stay verbatim.</>
          : <>Older messages become a chapter at <b>~{fmt(state.everyTokens)} tokens</b>, ending at an AI reply. The newest {state.keep} stay verbatim.</>}
        </Example>
      </Fold>

      <Fold title="Merging old chapters" testId="memory-fold-layers" value={state.layers ? `On · after ${state.layerSize}, ${state.layerMerge} at a time` : "Off"}>
        <SettingRow label="Merge old chapters" help="Keeps the memory small in very long stories." story={fromStory("layers")}>
          <Switch label="Merge old chapters" checked={state.layers} onChange={(v) => setMemory({ layers: v })} />
        </SettingRow>
        {state.layers && <>
          <SettingRow label="Merge after" help="Merge the oldest summaries above this count.">
            <NumberField label="Summaries before merging" value={state.layerSize} min={3} max={100} onCommit={(n) => setMemory({ layerSize: n })} />
          </SettingRow>
          <SettingRow label="Merge at a time" help="Summaries combined into one.">
            <NumberField label="Summaries merged into one" value={state.layerMerge} min={2} max={10} onCommit={(n) => setMemory({ layerMerge: n })} />
          </SettingRow>
        </>}
        <Example>{state.layers
          ? <>At <b>Chapter {state.layerSize + 1}</b>, Chapters 1–{state.layerMerge} merge into a shorter summary. The originals remain listed and available to Smart recall.</>
          : <>Keeps chapters separate. Recall settings decide which summaries are sent.</>}
        </Example>
      </Fold>

      <Fold title="Where chapters go in the prompt" testId="memory-fold-placement" value="Start of Chat History">
        <p className="mem-text">Chapter summaries replace covered messages in a system message at the start of <b>Chat History</b>. Originals stay visible in chat. Smart recall can add quotes.</p>
        <p className="mem-text hint">Requires <b>Chat History</b> in the preset. Inspect <b>Memory: the story so far</b> in Prompt Preview or the reply’s full prompt.</p>
      </Fold>
      <WriterSettings key={session.id} svc={svc} connection={connection} state={state} onSave={saveMemory} />
    </div>
  );
}

function ChapterCard({ c, into, onSave, onRemove }: { c: Listed; into: string | undefined; onSave: (p: Partial<Chapter>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const text = useDraft(c.summary);
  const title = useDraft(c.title);
  const level = c.level ?? 0;
  const where = c.off ? "Not sent" : into ? `Sent inside ${into}` : "Sent";
  return (
    <div className={`memory-chapter${c.off ? " off" : ""}${level ? " merged" : ""}${c.mergedInto ? " inside" : ""}`} data-testid="memory-chapter" data-level={level}>
      <div className="memory-chapter-head">
        <button type="button" className="memory-chapter-title" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <b>{c.label}{c.title ? ` · ${c.title}` : ""}</b>
          <small>#{c.from}–#{c.to} · {plural(c.messageCount, "message")}{level ? " · merged summary" : ""}{c.edited ? " · written or edited by you" : ""} · {where}</small>
        </button>
        <Switch label={`Send ${c.label}`} checked={!c.off} onChange={(v) => onSave({ off: !v })} />
      </div>
      <Collapse open={open}>
        <div className="memory-chapter-body">
          <input aria-label={`${c.label} title`} value={title.value} onChange={(e) => title.change(e.target.value)} onBlur={() => { if (title.dirty()) onSave({ title: title.value, edited: true }); }} />
          <textarea rows={7} aria-label={`${c.label} summary`} value={text.value} onChange={(e) => text.change(e.target.value)}
            onBlur={() => { if (text.dirty()) onSave({ summary: text.value, edited: true }); }} />
          <span className="row-line"><span className="hint">Edits save when you click away; the app never rewrites a chapter you edited.</span>
            <span className="spacer" /><button type="button" className="link quiet danger-hover"
              title={level ? "The chapters it merged go back to the AI." : "Its messages go back to the AI word for word (or into the next chapter)."} onClick={onRemove}>Remove</button></span>
        </div>
      </Collapse>
    </div>
  );
}

type WriterDraft = Pick<Layer, "summaryConnectionId" | "summaryModel" | "summaryPrompt" | "summaryMaxTokens">;

/** CODEX: Save the writer settings together so the model always belongs to the chosen connection. */
function WriterSettings({ svc, connection, state, onSave }: {
  svc: AppServices; connection: ConnectionState; state: MemoryView; onSave: (patch: WriterDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<WriterDraft>({});
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const writer = { ...state, ...draft };
  const id = writer.summaryConnectionId;
  const choice = id === null ? "chat" : id ? `profile:${id}` : "agents";
  const chat = (state.chatConnectionId ? connection.configs[state.chatConnectionId] : undefined) ?? connection.forRequest().connection;
  const agents = state.agentConnectionId ? connection.configs[state.agentConnectionId] : undefined;
  const cfg = id ? connection.configs[id] : id === "" && agents ? agents : chat;
  const baseModel = cfg === chat ? state.chatModelOverride || chat.model : cfg?.model;
  const model = writer.summaryModel.trim() || baseModel;
  const listModels = cfg && svc.core.providers.get(cfg.providerId)?.listModels;
  const dirty = Object.keys(draft).some((k) => draft[k as keyof WriterDraft] !== state[k as keyof WriterDraft]);
  const save = async () => {
    setSaving(true); setError("");
    try { await onSave(draft); setDraft({}); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <Fold title="How the AI writes chapters" testId="memory-fold-writer" value={state.summaryModel || (state.summaryConnectionId === id ? baseModel : undefined) || "Summary writer"}>
      <form className="mem-writer" onSubmit={(e) => { e.preventDefault(); if (dirty && !saving && writer.summaryPrompt.trim()) void save(); }}>
        <p className="mem-text">Uses a separate request for this chat.</p>
        <label className="mem-writer-field">
          <b>Summary connection</b>
          <select value={choice} disabled={saving} onChange={(e) => {
            const next = e.target.value;
            setPicking(false);
            setDraft({ ...draft, summaryConnectionId: next === "agents" ? "" : next === "chat" ? null : next.slice("profile:".length), summaryModel: "" });
          }}>
            <option value="agents">Agents’ connection (falls back to chat)</option>
            <option value="chat">Chat connection</option>
            {connection.profiles.map((p) => <option key={p.id} value={`profile:${p.id}`}>{p.name}</option>)}
            {id && !cfg && <option value={choice}>Missing connection</option>}
          </select>
        </label>
        <div className="mem-writer-field">
          <label htmlFor="memory-summary-model"><b>Summary model</b></label>
          <div className="mem-writer-model">
            <input id="memory-summary-model" value={writer.summaryModel} placeholder={baseModel ?? "Connection’s model"} disabled={saving}
              onChange={(e) => setDraft({ ...draft, summaryModel: e.target.value })} />
            {listModels && <Button small disabled={saving} onClick={() => setPicking((v) => !v)}>Browse…</Button>}
          </div>
          <span className="hint">Leave blank to use the connection’s model. The same model writes chapters and merges older summaries.</span>
        </div>
        {picking && cfg && listModels && (
          <ModelPicker cacheKey={`${cfg.providerId}|${cfg.baseUrl ?? ""}`} current={model ?? ""}
            load={(signal) => listModels(cfg, signal)}
            onPick={(m) => { setDraft({ ...draft, summaryModel: m.id }); setPicking(false); }} onClose={() => setPicking(false)} />
        )}
        {model && isDecisionModel(model) && <p className="warn-text">This model answers recall decisions. Choose a chat model to write summaries.</p>}
        <label className="mem-writer-field">
          <b>Max output tokens</b>
          <input type="number" min={1} max={32768} required disabled={saving} value={Number.isNaN(writer.summaryMaxTokens) ? "" : writer.summaryMaxTokens}
            onChange={(e) => setDraft({ ...draft, summaryMaxTokens: e.target.valueAsNumber })} />
          <span className="hint">On some models, reasoning uses part of this budget.</span>
        </label>
        <label className="mem-writer-field">
          <b>Summary prompt</b>
          <textarea rows={8} required disabled={saving} value={writer.summaryPrompt} onChange={(e) => setDraft({ ...draft, summaryPrompt: e.target.value })} />
          <span className="hint">Instructions for writing a new chapter. Use a first line of <code>Title: …</code> for an optional title. Merges have their own built-in instructions.</span>
        </label>
        <div className="mem-actions">
          <Button small variant="prominent" type="submit" disabled={!dirty || saving || !writer.summaryPrompt.trim()}>{saving ? "Saving…" : "Save Writer Settings"}</Button>
          <Button small variant="plain" disabled={saving || writer.summaryPrompt === DEFAULT_SUMMARY_PROMPT}
            onClick={() => setDraft({ ...draft, summaryPrompt: DEFAULT_SUMMARY_PROMPT })}>Reset Prompt</Button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
      </form>
    </Fold>
  );
}

// ---------------------------------------------------------------- recall

function RecallView({ svc, session, headId, branchId, connection, state, setMemory, waitForSettings, lastReplyId, draft, refreshKey }: {
  svc: AppServices; session: Session; headId: string | null; branchId: string | null; connection: ConnectionState; state: MemoryView;
  setMemory: (p: Partial<Layer>) => void; waitForSettings: () => Promise<void>; lastReplyId?: string | null | undefined; draft: string; refreshKey: number;
}) {
  const [rec, setRec] = useState<GenerationRecord["memory"] | null>(null);
  const [ask, setAsk] = useState(draft);
  const [testing, setTesting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<RecallResult | null | "none">(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let off = false;
    if (lastReplyId) void svc.store.getGenerationRecord(lastReplyId).then((r) => { if (!off) setRec(r?.memory ?? null); });
    else setRec(null);
    return () => { off = true; };
  }, [svc, lastReplyId, refreshKey]);
  const test = async () => {
    if (!headId) return;
    setTesting(true); setError(""); setResult(null);
    try {
      // A click may follow the model field's blur before native storage finishes. CODEX.
      await waitForSettings();
      const r = connection.forRequest();
      setResult((await svc.chat.turns.testRecall(session.id, headId, ask, r.connection, r.connections, undefined, branchId)) ?? "none");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setTesting(false); }
  };
  const smart = state.mode === "smart";
  const profiles = connection.profiles;
  const chat = (state.chatConnectionId ? connection.configs[state.chatConnectionId] : undefined) ?? connection.forRequest().connection;
  const agents = (state.agentConnectionId ? connection.configs[state.agentConnectionId] : undefined)
    ?? { ...chat, model: state.chatModelOverride || chat.model };
  const cfg = state.deciderConnectionId ? connection.configs[state.deciderConnectionId] : agents;
  const model = state.deciderModel.trim() || cfg?.model || "";
  const listModels = cfg && svc.core.providers.get(cfg.providerId)?.listModels;
  return (
    <div className="mem-view" data-testid="memory-recall">
      <section className="mem-card">
        <h3>What the AI reads</h3>
        <div className="mem-choices" role="radiogroup" aria-label="What the AI reads">
          <Choice on={!smart} onPick={() => setMemory({ mode: "simple" })} title="Simple" testId="memory-mode-simple"
            text="Sends every chapter." cost="Uses the existing chapter summaries." />
          <Choice on={smart} onPick={() => setMemory({ mode: "smart" })} title="Smart" testId="memory-mode-smart"
            text="Selects relevant chapters and quotes for each reply."
            cost="Adds recall requests. Swipes reuse the recall result." />
        </div>
      </section>

      {smart && <>
        <section className="mem-card" data-testid="memory-decider">
          <h3>The decision model</h3>
          <p className="mem-text">Selects chapters with at least 50% confidence. The newest chapter and merged summaries are always included.</p>
          <SettingRow label="Decide with">
            <Segmented small label="Decide with" value={state.decider} onChange={(decider) => { setPicking(false); setMemory({ decider }); }}
              options={[{ value: "agents", label: "Agents' model" }, { value: "jev", label: "Custom model" }]} />
          </SettingRow>
          {state.decider === "jev" ? <>
            <SettingRow label="Connection">
              <select className="pick-select" aria-label="Decision model connection" value={state.deciderConnectionId} onChange={(e) => {
                setPicking(false);
                setMemory({ deciderConnectionId: e.target.value, deciderModel: "" });
              }}>
                <option value="">The agents' connection</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                {state.deciderConnectionId && !cfg && <option value={state.deciderConnectionId}>Missing connection</option>}
              </select>
            </SettingRow>
            <SettingRow label="Model" help="Blank uses the connection's model.">
              <TextField label="Decision model" value={state.deciderModel} placeholder={cfg?.model || "Connection's model"} onCommit={(v) => setMemory({ deciderModel: v })} />
            </SettingRow>
            {listModels && <div className="mem-actions"><Button small onClick={() => setPicking((v) => !v)}>Browse models</Button></div>}
            {picking && cfg && listModels && (
              <ModelPicker cacheKey={`${cfg.providerId}|${cfg.baseUrl ?? ""}`} current={model}
                load={(signal) => listModels(cfg, signal)}
                onPick={(m) => { setMemory({ deciderModel: m.id }); setPicking(false); }} onClose={() => setPicking(false)} />
            )}
          </> : <p className="mem-text hint">Uses the agents' chat model for recall decisions.</p>}
          <SettingRow label="Chapters to recall" help="At most, per reply, besides the newest chapter.">
            <NumberField label="Chapters to recall" value={state.recallChapters} min={0} max={30} onCommit={(n) => setMemory({ recallChapters: n })} />
          </SettingRow>
          <SettingRow label="Quotes per chapter" help="Verbatim messages added per chapter. 0 sends summaries only.">
            <NumberField label="Quotes per chapter" value={state.recallQuotes} min={0} max={12} onCommit={(n) => setMemory({ recallQuotes: n })} />
          </SettingRow>
        </section>

        <section className="mem-card" data-testid="memory-try">
          <h3>Try it</h3>
          <p className="mem-text">Preview recall for your next message. Model charges may apply.</p>
          <textarea rows={2} aria-label="What you might say next" placeholder="e.g. “Do you still have the silver locket?”" value={ask} onChange={(e) => setAsk(e.target.value)} />
          <div className="mem-actions">
            <Button small variant="prominent" onClick={() => void test()} disabled={testing || !headId || !state.chapters.length} data-testid="memory-test">{testing ? "Asking…" : "Test Recall"}</Button>
            {!state.chapters.length && <span className="hint">There are no chapters to pick from yet.</span>}
          </div>
          {result === "none" && <p className="hint">No chapters on this branch.</p>}
          {result && result !== "none" && <TryResult r={result} />}
          {error && <p className="error-text" role="alert">{error}</p>}
        </section>
      </>}

      <section className="mem-list">
        <h3 className="mem-list-title">The last reply</h3>
        {rec ? <MemoryReceipt m={rec} /> : <p className="hint mem-pad">{lastReplyId ? "No memory went with the last reply (no chapters yet, or memory was off)." : "No reply yet."}</p>}
      </section>
    </div>
  );
}

function TryResult({ r }: { r: RecallResult }) {
  const x = r.receipt;
  const [open, setOpen] = useState(false);
  return (
    <div className="mem-try-result" data-testid="memory-try-result">
      {x.fallback
        ? <p className="warn-text">The decision model failed, so every summary would go: {x.fallback}</p>
        : <>
          <p className="hint">{x.decider} · {(x.ms / 1000).toFixed(1)} s · {plural(x.questions, "question")}{x.cached ? ` (${x.cached} reused)` : ""}</p>
          <ul className="memory-picked">
            {x.picked.map((c, i) => <li key={i}><span>{c.title}</span><span className="hint tabular">{c.p === undefined ? "newest, always" : `${Math.round(c.p * 100)}% sure`}</span></li>)}
          </ul>
          <p className="hint">{plural(x.quotes, "message")} quoted word for word{x.layers ? ` · ${plural(x.layers, "merged summary", "merged summaries")}` : ""} · {x.chapters - x.picked.length} chapter(s) left out.</p>
        </>}
      <button type="button" className="link" onClick={() => setOpen((v) => !v)}>{open ? "Hide the Text" : "Show the Text for the AI"}</button>
      <Collapse open={open}><pre className="mem-pre">{r.text}</pre></Collapse>
    </div>
  );
}

function Choice({ on, onPick, title, text, cost, testId }: { on: boolean; onPick: () => void; title: string; text: string; cost: string; testId: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`mem-choice${on ? " on" : ""}`} onClick={onPick} data-testid={testId}>
      <span className="mem-choice-dot" aria-hidden />
      <span className="mem-choice-body"><b>{title}</b><span>{text}</span><small>{cost}</small></span>
    </button>
  );
}

// ---------------------------------------------------------------- guide

function GuideView({ state }: { state: MemoryView }) {
  return (
    <div className="mem-view mem-guide" data-testid="memory-guide">
      <section className="mem-card">
        <h3>An example</h3>
        <div className="mem-example-story">
          <p><span className="hint">Original messages</span><br />At the mill, Lyra puts a silver locket in her pack. Dan promises, “Not even the captain will hear of it.”</p>
          <p><span className="hint">Chapter summary</span><br />Lyra keeps the locket in her pack. Dan promised to tell no one, “not even the captain”.</p>
          <p>The AI reads the summary in place of those messages. The newest {plural(state.keep, "message")} stay verbatim.</p>
        </div>
      </section>
      <section className="mem-card">
        <h3>Editing and branches</h3>
        <ul className="mem-tips">
          <li>Edited chapters stay as you saved them. Switch a chapter off to send its original messages again.</li>
          <li>New branches copy chapters ending before or at the fork. Messages in a chapter crossing the fork stay available as originals.</li>
          <li>Editing an old message switches off summaries that used it.</li>
          <li>Use Catch Up to summarize an older chat. You can stop and resume.</li>
        </ul>
      </section>
      <section className="mem-card">
        <h3>Requests and recall</h3>
        <p className="mem-text">Writing or merging summaries uses model requests. Simple sends the available summaries. Smart selects chapters and quotes, with additional recall requests. Swipes reuse the recall result.</p>
        <p className="mem-text hint">The Reply tab shows which memory was used.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- bits

function Fold({ title, value, children, testId }: { title: string; value: string; children: ReactNode; testId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`mem-fold${open ? " open" : ""}`} data-testid={testId}>
      <button type="button" className="mem-fold-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <b>{title}</b><span className="mem-fold-value">{value}</span><span className="mem-fold-chev" aria-hidden><Icon name="chevron" size={14} /></span>
      </button>
      <Collapse open={open}><div className="mem-fold-body">{children}</div></Collapse>
    </section>
  );
}

function SettingRow({ label, help, children, story = false }: { label: string; help?: string; children: ReactNode; story?: boolean }) {
  return (
    <div className="mem-setting">
      <span className="mem-setting-label"><b>{label}</b>{help && <small>{help}</small>}{story && <small className="mem-from">from the story's setup</small>}</span>
      <span className="mem-setting-value">{children}</span>
    </div>
  );
}

function Example({ children }: { children: ReactNode }) {
  return <p className="mem-example"><span className="mem-example-tag">Example</span>{children}</p>;
}

/** Refresh untouched fields only, retaining newer drafts even when they restore the original text. CODEX, T-001. */
function useDraft(saved: string) {
  const [value, setValue] = useState(saved);
  const draft = useRef({ value: saved, dirty: false });
  useEffect(() => {
    if (!draft.current.dirty || draft.current.value === saved) {
      draft.current = { value: saved, dirty: false };
      setValue(saved);
    }
  }, [saved]);
  return { value, dirty: () => draft.current.dirty, change: (next: string) => { draft.current = { value: next, dirty: true }; setValue(next); } };
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
