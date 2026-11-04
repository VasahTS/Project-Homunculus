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
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { Button, Collapse, Icon, Segmented, Switch } from "./kit.tsx";
import { MemoryReceipt } from "./ReplyPane.tsx";

type Listed = Chapter & { label: string; mergedInto?: string; sent: boolean; from: number; to: number };
type MemoryView = MemorySettings & {
  chapters: Listed[]; waiting: number; waitingTokens: number; dueChapters: number;
  waitingFrom: number; waitingTo: number; promptTokens: number; covered: number;
};
type Layer = NonNullable<SetupLayer["memory"]>;
type View = "chapters" | "recall" | "guide";

const fmt = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function MemoryPane({ svc, session, headId, connection, storySetup, onChangeSession, refreshKey = 0, lastReplyId, draft = "" }: {
  svc: AppServices; session: Session; headId: string | null; connection: ConnectionState; storySetup?: SetupLayer | undefined;
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
  const [peek, setPeek] = useState<{ text: string; tokens: number } | null>(null);
  const load = useCallback(() => svc.chat.turns.memoryAt(session.id, headId).then((s) => { setState(s); setError(""); })
    .catch((e) => setError(String(e instanceof Error ? e.message : e))), [svc, session.id, headId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load, refreshKey, session.setup.memory, storySetup?.memory]);
  useEffect(() => svc.core.events.on("memory.status", (e) => {
    if (e.sessionId !== session.id) return;
    setStatus(e.text);
    if (e.text === null) void load();
  }, "memory-pane"), [svc, session.id, load]);
  useEffect(() => { setPeek(null); }, [session.id, headId, refreshKey]);

  const own: Layer = session.setup.memory ?? {};
  const setMemory = (patch: Partial<Layer>) => {
    const next: Record<string, unknown> = { ...own, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const { memory: _drop, ...rest } = session.setup;
    void onChangeSession({ ...session, setup: Object.keys(next).length ? { ...rest, memory: next as Layer } : rest });
  };
  const fromStory = (k: keyof Layer) => own[k] === undefined && storySetup?.memory?.[k] !== undefined;
  const togglePeek = async () => {
    if (peek) { setPeek(null); return; }
    try { const p = await svc.chat.turns.memoryPreview(session.id, headId); setPeek(p); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  if (!state) return <div className="mem-pane" data-testid="memory-pane">{error && <p className="error-text" role="alert">{error}</p>}</div>;
  const level0 = state.chapters.filter((c) => !c.level);
  const merged = state.chapters.filter((c) => c.level);
  const sentChapters = state.chapters.filter((c) => c.sent).length;

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
            <Stat n={state.promptTokens} fmtN label="tokens sent" sub={state.covered ? `for ${plural(state.covered, "message")}` : undefined} />
            <Stat n={state.waiting} label="waiting" sub={state.waiting ? `#${state.waitingFrom}–#${state.waitingTo}` : "none"} />
          </div>
        )}
        {state.on && (
          <div className="mem-head-foot">
            <span className="hint" data-testid="memory-status">{status ?? (state.auto ? nextChapterHint(state) : "Automatic chapters are off: write them from Chapters.")}</span>
            <button type="button" className="link" onClick={() => void togglePeek()} disabled={!sentChapters} data-testid="memory-peek">
              <Icon name={peek ? "eyeOff" : "eye"} size={13} /> {peek ? "Hide" : "See What the AI Gets"}
            </button>
          </div>
        )}
        <Collapse open={!!peek}>
          {peek && <div className="mem-peek" data-testid="memory-peek-text">
            <span className="hint">Sent right before the chat history, ~{fmt(peek.tokens)} tokens.{state.mode === "smart" ? " With Smart recall each reply sends only the chapters it picks (Recall → Try It)." : ""}</span>
            <pre>{peek.text}</pre>
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

      {state.on && view === "chapters" && <ChaptersView svc={svc} session={session} headId={headId} connection={connection} storySetup={storySetup}
        state={state} setMemory={setMemory} fromStory={fromStory} reload={load} />}
      {state.on && view === "recall" && <RecallView svc={svc} session={session} headId={headId} connection={connection} state={state}
        setMemory={setMemory} lastReplyId={lastReplyId} draft={draft} refreshKey={refreshKey} />}
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
      <h3>Long chats forget their beginning</h3>
      <p>The AI can only read so much at once. Memory turns older messages into short <b>chapters</b>, and the AI reads the chapters instead. Old events, promises and names stay known, and each reply sends fewer tokens.</p>
      <ol className="mem-steps">
        <li><b>You chat as usual.</b> The newest messages always go word for word.</li>
        <li><b>Older messages become a chapter</b>, a summary of a few paragraphs, written by the agents' connection.</li>
        <li><b>The AI reads the chapters</b> in place of those messages. You can read, edit or switch off every chapter.</li>
      </ol>
      {chapters > 0 && <p className="hint">This chat already has {plural(chapters, "summary", "summaries")}, kept while memory is off.</p>}
      <div className="mem-actions">
        <Button variant="prominent" onClick={onOn} data-testid="memory-turn-on">Turn On Memory</Button>
        <button type="button" className="link" onClick={onGuide}>How it works</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- chapters

function ChaptersView({ svc, session, headId, connection, storySetup, state, setMemory, fromStory, reload }: {
  svc: AppServices; session: Session; headId: string | null; connection: ConnectionState; storySetup?: SetupLayer | undefined;
  state: MemoryView; setMemory: (p: Partial<Layer>) => void; fromStory: (k: keyof Layer) => boolean; reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"" | "now" | "catch-up">("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [writing, setWriting] = useState(false);
  const [own, setOwn] = useState({ title: "", summary: "" });
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);

  const change = async (update: (latest: Chapter[]) => Chapter[]) => {
    try { await svc.chat.turns.saveChapters(session.id, update); setError(""); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const now = async () => {
    if (!headId) return;
    setBusy("now"); setError(""); setProgress("");
    try {
      const r = connection.forRequest();
      const c = await svc.chat.turns.summarizeNow(session.id, headId, r.connection, r.connections);
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
        (done, left) => setProgress(left ? `Writing… ${done} done, ${left} to go` : `${done} done`), ctl.signal);
      setProgress(made ? `Done: ${plural(made, "chapter")} written.` : "Nothing to catch up.");
    } catch (e) {
      setProgress(ctl.signal.aborted ? "Stopped. What was written is kept." : "");
      if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); stop.current = null; await reload(); }
  };
  const saveOwn = async () => {
    if (!headId) return;
    try {
      const c = await svc.chat.turns.addOwnChapter(session.id, headId, own.title, own.summary);
      if (!c) { setError("Nothing waits for a chapter on this branch."); return; }
      setOwn({ title: "", summary: "" }); setWriting(false); setProgress(`Your chapter was saved${c.title ? `: ${c.title}` : ""}.`);
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const agentsName = (() => {
    const id = session.setup.agentConnectionId ?? storySetup?.agentConnectionId ?? connection.defaultAgentId;
    const p = id ? connection.byId.get(id) : undefined;
    return p?.name;
  })();

  return (
    <div className="mem-view" data-testid="memory-chapters">
      <section className="mem-card" data-testid="memory-next">
        <h3>Next chapter</h3>
        <p className="mem-lead">
          {state.waiting
            ? <>Messages <b>#{state.waitingFrom}–#{state.waitingTo}</b> are not in a chapter yet ({plural(state.waiting, "message")}{state.closeBy === "tokens" ? `, ~${fmt(state.waitingTokens)} tokens` : ""}).</>
            : "Every older message is already in a chapter."}
          {" "}The newest {plural(state.keep, "message")} always {state.keep === 1 ? "stays" : "stay"} word for word.
        </p>
        <div className="mem-actions">
          <Button small variant="prominent" onClick={() => void now()} disabled={!!busy || state.waiting < 2 || !headId} data-testid="memory-write-now"
            title="The AI summarizes what waits into one chapter.">
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
        <SettingRow label="Write chapters by themselves" help="After a reply, when enough older messages wait." story={fromStory("auto")}>
          <Switch label="Write chapters by themselves" checked={state.auto} onChange={(v) => setMemory({ auto: v })} />
        </SettingRow>
        <SettingRow label="A chapter closes after" help="A number of messages, or a size in tokens (it always ends at an AI reply)." story={fromStory("closeBy")}>
          <Segmented small label="A chapter closes after" value={state.closeBy} onChange={(closeBy) => setMemory({ closeBy })}
            options={[{ value: "messages", label: "Messages" }, { value: "tokens", label: "Tokens" }]} />
        </SettingRow>
        {state.closeBy === "messages"
          ? <SettingRow label="Messages per chapter"><NumberField label="Messages per chapter" value={state.every} min={4} max={500} onCommit={(n) => setMemory({ every: n })} /></SettingRow>
          : <SettingRow label="Tokens per chapter" help="About ¾ of a word each."><NumberField label="Tokens per chapter" value={state.everyTokens} min={500} max={200000} onCommit={(n) => setMemory({ everyTokens: n })} /></SettingRow>}
        <SettingRow label="Always word for word" help="The newest messages are never summarized: the AI reads them as written.">
          <NumberField label="Newest messages kept word for word" value={state.keep} min={0} max={500} onCommit={(n) => setMemory({ keep: n })} />
        </SettingRow>
        <Example>{state.closeBy === "messages"
          ? <>When the chat reaches <b>{state.every + state.keep} messages</b>, messages #1–#{state.every} become <b>Chapter 1</b> and the newest {state.keep} stay word for word. At {state.every * 2 + state.keep}, #{state.every + 1}–#{state.every * 2} become Chapter 2.</>
          : <>When the messages outside the newest {state.keep} pass <b>~{fmt(state.everyTokens)} tokens</b> (about {fmt(Math.round(state.everyTokens * 0.75))} words), they become a chapter, cut right after an AI reply. Long replies make fewer, fuller chapters.</>}
        </Example>
      </Fold>

      <Fold title="Merging old chapters" testId="memory-fold-layers" value={state.layers ? `On · after ${state.layerSize}, ${state.layerMerge} at a time` : "Off"}>
        <SettingRow label="Merge old chapters" help="Keeps the memory small in very long stories." story={fromStory("layers")}>
          <Switch label="Merge old chapters" checked={state.layers} onChange={(v) => setMemory({ layers: v })} />
        </SettingRow>
        {state.layers && <>
          <SettingRow label="Merge after" help="How many summaries may pile up before the oldest merge.">
            <NumberField label="Summaries before merging" value={state.layerSize} min={3} max={100} onCommit={(n) => setMemory({ layerSize: n })} />
          </SettingRow>
          <SettingRow label="Merge at a time" help="How many summaries become one.">
            <NumberField label="Summaries merged into one" value={state.layerMerge} min={2} max={10} onCommit={(n) => setMemory({ layerMerge: n })} />
          </SettingRow>
        </>}
        <Example>{state.layers
          ? <>When <b>Chapter {state.layerSize + 1}</b> is written, Chapters 1–{state.layerMerge} merge into one shorter summary, “Chapters 1–{state.layerMerge}”. The chapters stay in the list (indented under it), and Smart recall can still bring one back in full. Merged summaries merge again the same way when they pile up.</>
          : <>Off: every chapter stays separate and goes to the AI. Fine for stories under a few hundred messages.</>}
        </Example>
      </Fold>

      <Fold title="Who writes the chapters" testId="memory-fold-writer" value={agentsName ?? "Story's connection"}>
        <p className="mem-text">The <b>agents' connection</b>{agentsName ? <> — now <b>{agentsName}</b></> : null}, one short call per chapter (merges too). A cheaper model works well here. Change it in this chat's <b>Prompt</b> tab (Connections) or in <b>Settings → Defaults</b>.</p>
        <p className="mem-text">It is told to keep what later scenes need: who did what, promises with their exact terms, what people learned, injuries, items, where everyone ended up, open threads, and how relationships changed. It never invents anything.</p>
      </Fold>
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

// ---------------------------------------------------------------- recall

function RecallView({ svc, session, headId, connection, state, setMemory, lastReplyId, draft, refreshKey }: {
  svc: AppServices; session: Session; headId: string | null; connection: ConnectionState; state: MemoryView;
  setMemory: (p: Partial<Layer>) => void; lastReplyId?: string | null | undefined; draft: string; refreshKey: number;
}) {
  const [rec, setRec] = useState<GenerationRecord["memory"] | null>(null);
  const [ask, setAsk] = useState(draft);
  const [testing, setTesting] = useState(false);
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
      const r = connection.forRequest();
      setResult((await svc.chat.turns.testRecall(session.id, headId, ask, r.connection, r.connections)) ?? "none");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setTesting(false); }
  };
  const smart = state.mode === "smart";
  const profiles = connection.profiles;
  return (
    <div className="mem-view" data-testid="memory-recall">
      <section className="mem-card">
        <h3>What the AI reads</h3>
        <div className="mem-choices" role="radiogroup" aria-label="What the AI reads">
          <Choice on={!smart} onPick={() => setMemory({ mode: "simple" })} title="Simple" testId="memory-mode-simple"
            text="Every chapter, with every reply." cost="No extra cost. Best for most stories." />
          <Choice on={smart} onPick={() => setMemory({ mode: "smart" })} title="Smart" testId="memory-mode-smart"
            text="Before each reply, a decision model picks the chapters that matter right now and quotes their key messages word for word."
            cost="One cheap extra call per reply (a swipe reuses it). For long stories." />
        </div>
      </section>

      {smart && <>
        <section className="mem-card" data-testid="memory-decider">
          <h3>The decision model</h3>
          <p className="mem-text">It answers short yes/no questions — “does this chapter matter for what was just said?” — with how sure it is. Chapters it is at least 50% sure about go in (the newest chapter and merged summaries always do).</p>
          <SettingRow label="Decide with">
            <Segmented small label="Decide with" value={state.decider} onChange={(decider) => setMemory({ decider })}
              options={[{ value: "jev", label: "Jev" }, { value: "agents", label: "Agents' model" }]} />
          </SettingRow>
          {state.decider === "jev" ? <>
            <p className="mem-text hint"><b>Jev</b> is a model made only for decisions, on nano-gpt. It is fast and only reads (you pay input tokens, a fraction of a cent per reply). It needs a nano-gpt connection; the subscription address may not reach it — if Try It says so, pick a pay-as-you-go nano-gpt connection below.</p>
            <SettingRow label="Through" help="The saved connection whose address and key reach Jev.">
              <select className="pick-select" aria-label="Decision model connection" value={state.deciderConnectionId} onChange={(e) => setMemory({ deciderConnectionId: e.target.value || undefined })}>
                <option value="">The agents' connection</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </SettingRow>
            <SettingRow label="Model"><TextField label="Decision model" value={state.deciderModel} placeholder="typesafe/jev-latest" onCommit={(v) => setMemory({ deciderModel: v || undefined })} /></SettingRow>
          </> : <p className="mem-text hint">The agents' chat model answers the same questions in one request. Works with any service, but is slower and costs more than Jev.</p>}
          <SettingRow label="Chapters to recall" help="At most, per reply, besides the newest chapter.">
            <NumberField label="Chapters to recall" value={state.recallChapters} min={0} max={30} onCommit={(n) => setMemory({ recallChapters: n })} />
          </SettingRow>
          <SettingRow label="Quotes per chapter" help="Messages quoted word for word when they hold what the summary lacks: an exact promise, a name, a number. 0 = summaries only.">
            <NumberField label="Quotes per chapter" value={state.recallQuotes} min={0} max={12} onCommit={(n) => setMemory({ recallQuotes: n })} />
          </SettingRow>
        </section>

        <section className="mem-card" data-testid="memory-try">
          <h3>Try it</h3>
          <p className="mem-text">See what Smart recall would pick if you said this next. Nothing is sent to the story.</p>
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

      {!smart && <p className="mem-text hint mem-pad">Every chapter goes with every reply. Use <b>See What the AI Gets</b> at the top to read exactly what is sent.</p>}

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
        <h3>How memory works</h3>
        <ol className="mem-steps">
          <li><b>You chat.</b> Every message is kept; nothing is ever deleted or changed.</li>
          <li><b>Older messages become a chapter.</b> Every {state.every} messages (or by size), the agents' connection writes a summary: a title and a few paragraphs.</li>
          <li><b>The AI reads chapters instead of those messages</b>, right before the chat history. The newest {plural(state.keep, "message")} always {state.keep === 1 ? "stays" : "stay"} word for word.</li>
          <li><b>Very old chapters merge</b> into shorter summaries, so a story of thousands of messages still fits.</li>
          <li><b>Smart recall</b> (optional) picks, for each reply, only the chapters that matter, and quotes exact lines when the summary is not enough.</li>
        </ol>
      </section>
      <section className="mem-card">
        <h3>An example</h3>
        <div className="mem-example-story">
          <p><span className="hint">Messages #1–#20, word for word (about 6,000 tokens):</span><br />Lyra and Dan reach the old mill. She finds a silver locket with an owl on it and makes Dan promise not to tell anyone…</p>
          <p><span className="hint">Chapter 1 · The Owl Locket (about 250 tokens):</span><br />At the old mill, Lyra found a silver locket engraved with an owl and hid it in her pack. Dan promised to tell no one, “not even the captain”…</p>
          <p><span className="hint">Fifty messages later, you write:</span><br />“Do you still have the locket?”</p>
          <p><span className="hint">Simple</span> sends every chapter, so the AI knows. <span className="hint">Smart</span> asks the decision model, which picks Chapter 1 and quotes Dan's exact promise.</p>
        </div>
      </section>
      <section className="mem-card">
        <h3>Words used here</h3>
        <dl className="mem-terms">
          <dt>Chapter</dt><dd>A summary of a stretch of messages. It replaces them in the prompt; on screen the messages stay.</dd>
          <dt>Word for word</dt><dd>Messages the AI reads exactly as written: the newest ones, and quotes Smart recall picks.</dd>
          <dt>Waiting</dt><dd>Older messages not in a chapter yet. They still go word for word until a chapter takes them.</dd>
          <dt>Merged summary</dt><dd>A shorter summary of several chapters (“Chapters 1–3”). The chapters stay in the list.</dd>
          <dt>Simple / Smart</dt><dd>Send every chapter, or let a decision model pick the ones that matter for each reply.</dd>
          <dt>Jev</dt><dd>A small model on nano-gpt made only for yes/no decisions. Fast, cheap, reads only.</dd>
        </dl>
      </section>
      <section className="mem-card">
        <h3>Good to know</h3>
        <ul className="mem-tips">
          <li><b>Edit any chapter</b> to fix it; the app never rewrites one you edited. Switch one off to send its messages again.</li>
          <li><b>Branches keep their own chapters.</b> A branch that starts in the middle of a chapter gets those messages back word for word.</li>
          <li><b>Editing an old message</b> switches off the chapters that read it, so the AI sees the corrected text.</li>
          <li><b>Old or imported chats:</b> use Catch Up in Chapters to write all the chapters at once (you can stop and resume).</li>
          <li><b>Cost:</b> one short call per chapter; Smart adds one cheap call per reply, and a swipe reuses it.</li>
          <li>The <b>Reply</b> tab of each reply says what memory sent with it.</li>
        </ul>
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
