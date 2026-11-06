// Homunculus 2 — the Director (D-092): an out-of-character chat about the story, its notes, and its setup.
// Author: CLAUDE, 2026-11-06. Canvas "Homunculus 2 — Director": A2 (an inspector tab that pops out into its own
// window), D (notes, kept when expired), F (setup) and G (a note's weight). Everything a Director says or does is
// data the user can edit: job, writer line, how notes are proposed, the weights and their instructions, what it sees.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@homunculus/schemas";
import {
  cleanProfile, DEFAULT_DIRECTOR, directorProfiles, directorState, noteLeft, noteStatus, profileFor, saveDirectorProfiles, saveDirectorState,
  CHANGE_KINDS, CHANGE_LABELS, directorLinks, noteUses, parseChanges, saveDirectorLinks, seenAt, type DirectorLinks, type DirectorPoint, parseProposals, splitProposals, type ChangeUndo, type DirectorNote, type DirectorPermission, type DirectorProfile,
  type DirectorState, type DirectorTurn, type DirectorWeight, type NoteStatus, type ProposedChange, type ProposedNote,
} from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { Button, Icon, IconButton, Segmented, Switch } from "./kit.tsx";
import { MessageText } from "./MessageText.tsx";
import { ModelPicker } from "./ModelPicker.tsx";
import { Toolbar } from "./Toolbar.tsx";

type View = "chat" | "notes";
const newId = () => crypto.randomUUID();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "weight";
const LASTS = [1, 2, 3, 5, 10, 20] as const;

export function DirectorPane({ svc, session, headId, branchId, connection, popped = false, onPop, prefill, onChanged }: {
  svc: AppServices; session: Session; headId: string | null; branchId: string | null; connection: ConnectionState;
  /** Text to put in its message box ("Ask the Director" on a message); a new `at` puts it again. */
  prefill?: { text: string; at: number } | undefined;
  /** Shown in its own window (true) or in the inspector. */
  popped?: boolean;
  onPop?: () => void;
  /** A change it made outside its own data (Author's Note, a card, a lorebook…) was applied or undone. */
  onChanged?: (() => void) | undefined;
}) {
  const [profiles, setProfiles] = useState<DirectorProfile[]>([DEFAULT_DIRECTOR]);
  const [links, setLinks] = useState<DirectorLinks>({ defaultId: "", stories: {} });
  // where in the story we are (D-092, branches and swipes): notes and the talk follow the path on screen
  const [path, setPath] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    if (!headId) { setPath([]); return; }
    void svc.store.pathTo(headId).then((ms) => { if (live) setPath(ms.map((m) => m.id)); }).catch(() => undefined);
    return () => { live = false; };
  }, [svc, headId]);
  const at = useMemo<DirectorPoint>(() => new Set(path), [path]);
  /** New notes and turns belong to the message the one on screen answered, so its swipes share them. */
  const anchor = path.length >= 2 ? path[path.length - 2]! : null;
  const [state, setState] = useState<DirectorState>({ profileId: "", notes: [], chat: [] });
  const [view, setView] = useState<View>("chat");
  const [setupOpen, setSetupOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ text: string; at: number } | undefined>();
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [p, s, l] = await Promise.all([directorProfiles(svc.store), directorState(svc.store, session.id), directorLinks(svc.store)]);
    setProfiles(p); setState(s); setLinks(l);
  }, [svc, session.id]);
  useEffect(() => { void load().catch((e) => setError(String(e))); }, [load]);
  useEffect(() => { if (prefill) setView("chat"); }, [prefill]);
  useEffect(() => svc.core.events.on("director.changed", (e) => { if (e.sessionId === session.id) void load(); }, "director-pane"), [svc, session.id, load]);
  const profile = profileFor(profiles, state, links, session.storyId);
  const inherited = profileFor(profiles, { profileId: "" }, links, session.storyId);

  // always write the latest state from disk, so a reply counting notes meanwhile is never lost
  const change = async (fn: (s: DirectorState) => DirectorState) => {
    const latest = await directorState(svc.store, session.id);
    const next = fn(latest);
    setState(next);
    await saveDirectorState(svc.store, session.id, next);
    void svc.core.events.emit("director.changed", { sessionId: session.id });
  };
  const saveProfiles = async (list: DirectorProfile[]) => { setProfiles(list); await saveDirectorProfiles(svc.store, list); };
  const active = state.notes.filter((n) => noteStatus(n, at) === "active");

  return (
    <div className={`director${popped ? " popped" : ""}`} data-testid="director">
      <div className="director-head">
        <select className="pick-select" aria-label="Director" value={profiles.some((p) => p.id === state.profileId) ? state.profileId : ""}
          onChange={(e) => void change((s) => ({ ...s, profileId: e.target.value }))}>
          <option value="">{session.storyId && links.stories[session.storyId] ? "The story's" : "Default"}: {inherited.name}</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Segmented small label="Director view" value={view} onChange={setView} options={[
          { value: "chat", label: "Chat", testId: "director-view-chat" },
          { value: "notes", label: `Notes${active.length ? ` ${active.length}` : ""}`, testId: "director-view-notes" },
        ]} />
        <IconButton label="Director setup" onClick={() => setSetupOpen(true)} data-testid="director-setup-open"><Icon name="gear" size={14} /></IconButton>
        {onPop && <IconButton label={popped ? "Dock in the inspector" : "Pop out"} onClick={onPop} data-testid="director-pop"><Icon name={popped ? "inspector" : "send"} size={14} /></IconButton>}
      </div>
      {error && <p className="hint director-error" role="alert">{error}</p>}
      {view === "chat" && <ChatView svc={svc} session={session} headId={headId} branchId={branchId} connection={connection} profile={profile}
        state={state} change={change} onError={setError} onNotes={() => setView("notes")} prefill={prefill} at={at} anchor={anchor}
        onNoteFrom={(text) => { setNoteDraft({ text, at: Date.now() }); setView("notes"); }} onChanged={onChanged} />}
      {view === "notes" && <NotesView profile={profile} notes={state.notes} change={change} draft={noteDraft} at={at} anchor={anchor} />}
      {setupOpen && <SetupSheet onClose={() => setSetupOpen(false)} title={profile.name}>
        <SetupView svc={svc} connection={connection} profiles={profiles} profile={profile} onSave={saveProfiles}
          onPick={(id) => void change((s) => ({ ...s, profileId: id }))} />
      </SetupSheet>}
    </div>
  );
}

// ---------------------------------------------------------------- chat

function ChatView({ svc, session, headId, branchId, connection, profile, state, change, onError, onNotes, onNoteFrom, prefill, onChanged, at, anchor }: {
  svc: AppServices; session: Session; headId: string | null; branchId: string | null; connection: ConnectionState; profile: DirectorProfile;
  state: DirectorState; change: (fn: (s: DirectorState) => DirectorState) => Promise<void>; onError: (e: string) => void; onNotes: () => void;
  /** Opens Notes with this text in "Write a note yourself". */
  onNoteFrom: (text: string) => void;
  prefill?: { text: string; at: number } | undefined;
  onChanged?: (() => void) | undefined;
  at: DirectorPoint; anchor: string | null;
}) {
  const [input, setInput] = useState("");
  /** The talk at this point of the story: turns said on other branches stay out of sight (and out of its prompt). */
  const chat = state.chat.filter((t) => seenAt(t, at));
  const [streaming, setStreaming] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [chat.length, streaming]);
  // the box grows with what is typed (up to 40% of the window, then it scrolls), like the story's message box
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.4))}px`;
  }, [input]);
  useEffect(() => { if (prefill) { setInput(prefill.text); requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(prefill.text.length, prefill.text.length); }); } }, [prefill]);
  const active = state.notes.filter((n) => noteStatus(n, at) === "active");
  const ctx = { sessionId: session.id, branchId, headId };

  const ask = async (asked?: string, history?: DirectorTurn[]) => {
    const question = (asked ?? input).trim();
    if (!question || streaming !== null) return;
    if (asked === undefined) setInput("");
    onError("");
    const before = history ?? chat;
    await change((s) => ({ ...s, chat: [...s.chat, { role: "user", text: question, at: Date.now(), anchor }] }));
    const ctl = new AbortController();
    abort.current = ctl;
    setStreaming("");
    try {
      const r = connection.forRequest();
      const text = await svc.chat.turns.askDirector({ sessionId: session.id, parentId: headId, branchId, profile, question, chat: before,
        connection: r.connection, connections: r.connections, signal: ctl.signal, onToken: (t) => setStreaming(t) });
      const at = Date.now();
      const answer: DirectorTurn = { role: "director", text: text || "(no answer)", at, anchor };
      // what Setup allows by itself goes in at once (notes added, changes applied), with Undo on each card
      if (profile.may.notes === "allowed") {
        const notes = parseProposals(answer.text, profile);
        if (notes.length) {
          answer.added = notes.map((n) => n.index);
          await change((s) => ({ ...s, notes: [...s.notes, ...notes.map((n) => ({ id: newId(), text: n.text, weightId: n.weightId, lasts: n.lasts, sent: [], createdAt: at, anchor }))] }));
        }
      }
      const applied: NonNullable<DirectorTurn["applied"]> = {};
      for (const c of parseChanges(answer.text).filter((c) => profile.may[c.kind] === "allowed")) {
        try { applied[c.index] = { undo: await (await svc.chat.turns.directorChange(session.id, branchId, headId, c)).apply(), at }; }
        catch (e) { onError(e instanceof Error ? e.message : String(e)); }
      }
      if (Object.keys(applied).length) { answer.applied = applied; onChanged?.(); }
      await change((s) => ({ ...s, chat: [...s.chat, answer] }));
    } catch (e) {
      if (!ctl.signal.aborted) onError(e instanceof Error ? e.message : String(e));
    } finally { setStreaming(null); abort.current = null; }
  };
  const addNote = (turnAt: number, p: ProposedNote, weightId: string, lasts: number | null) => void change((s) => ({
    ...s,
    notes: [...s.notes, { id: newId(), text: p.text, weightId, lasts, sent: [], createdAt: Date.now(), anchor }],
    chat: s.chat.map((t) => (t.at === turnAt ? { ...t, added: [...(t.added ?? []), p.index] } : t)),
  }));
  const setApplied = (turnAt: number, index: number, v: { undo: ChangeUndo; undone?: boolean; at: number }) => change((s) => ({
    ...s, chat: s.chat.map((t) => (t.at === turnAt ? { ...t, applied: { ...(t.applied ?? {}), [index]: v } } : t)),
  })).then(() => onChanged?.());

  // quality of life: copy, edit a question, retry the last answer, delete, a note from an answer, the context size
  const indexOf = (when: number) => chat.findIndex((t) => t.at === when);
  const copy = (text: string) => { void navigator.clipboard?.writeText(text).catch(() => undefined); };
  const here = at;
  const editQuestion = (at0: number) => {
    const i = indexOf(at0);
    if (i < 0 || streaming !== null) return;
    setInput(chat[i]!.text);
    void change((s) => ({ ...s, chat: s.chat.filter((t) => t.at < at0 || !seenAt(t, here)) }));
    requestAnimationFrame(() => box.current?.focus());
  };
  const retry = (when: number) => {
    const i = indexOf(when);
    const q = chat[i - 1];
    if (i < 1 || q?.role !== "user" || streaming !== null) return;
    const history = chat.slice(0, i - 1);
    void change((s) => ({ ...s, chat: s.chat.filter((t) => t.at < q.at || !seenAt(t, here)) })).then(() => ask(q.text, history));
  };
  const remove = (when: number) => void change((s) => ({ ...s, chat: s.chat.filter((t) => t.at !== when) }));
  const lastDirector = [...chat].reverse().find((t) => t.role === "director")?.at;
  const [tokens, setTokens] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const r = connection.forRequest();
      svc.chat.turns.directorPrompt(session.id, headId, profile, r.connection, { connections: r.connections, branchId })
        .then((p) => { if (live) setTokens(p.tokens + chat.reduce((n, x) => n + Math.ceil(x.text.length / 4), 0)); }).catch(() => { if (live) setTokens(null); });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [svc, session.id, headId, branchId, profile, chat.length]);
  const copyChat = () => copy(chat.map((t) => `${t.role === "user" ? "**You:**" : "**Director:**"} ${t.text}`).join("\n\n"));

  return (
    <div className="director-chat">
      {active.length > 0 && (
        <button type="button" className="director-active" onClick={onNotes} data-testid="director-active">
          {active.map((n) => <span key={n.id} className="director-chip"><WeightMark profile={profile} id={n.weightId} /> {n.text}<small>{noteLeft(n, at)}{lastCheck(n) === "ignored" ? " · ignored last time" : ""}</small></span>)}
        </button>
      )}
      <div className="director-log" ref={list}>
        {!chat.length && streaming === null && (
          <p className="hint director-empty">Talk about the story out of character: where it is going, a character acting off, which prompt causes what. Nothing here goes into the story, except the notes you add.</p>
        )}
        {chat.map((t) => t.role === "user"
          ? (
            <div key={t.at} className={`director-turn q${t.auto ? " auto" : ""}`} data-testid="director-question">
              <div className="director-q" title={new Date(t.at).toLocaleString()}>{t.auto && <span className="director-who">Asked by itself</span>}{t.text}</div>
              <TurnActions busy={streaming !== null} items={[
                { label: "Copy", icon: "copy", run: () => copy(t.text) },
                { label: "Edit and ask again", icon: "pencil", run: () => editQuestion(t.at), testId: "director-edit" },
                { label: "Delete", icon: "trash", run: () => remove(t.at) },
              ]} />
            </div>
          )
          : (
            <div key={t.at} className="director-turn a">
              <DirectorAnswer svc={svc} ctx={ctx} profile={profile} turn={t} onAdd={(p, w, l) => addNote(t.at, p, w, l)}
                onApplied={(i, v) => setApplied(t.at, i, v)} onError={onError} />
              <TurnActions busy={streaming !== null} items={[
                { label: "Copy", icon: "copy", run: () => copy(t.text) },
                ...(t.at === lastDirector && !t.auto ? [{ label: "Ask again", icon: "refresh" as const, run: () => retry(t.at), testId: "director-retry" }] : []),
                { label: "Make a note from this", icon: "plus", run: () => onNoteFrom(selectionIn(t.text)), testId: "director-note-from" },
                { label: "Delete", icon: "trash", run: () => remove(t.at) },
              ]} />
            </div>
          ))}
        {streaming !== null && <DirectorAnswer svc={svc} ctx={ctx} profile={profile} turn={{ role: "director", text: streaming || "…", at: 0 }} streaming />}
      </div>
      {profile.quick.length > 0 && streaming === null && (
        <div className="director-quick" data-testid="director-quick">
          {profile.quick.map((q) => <button key={q} type="button" className="director-chip" onClick={() => void ask(q)}>{q}</button>)}
        </div>
      )}
      <div className="director-box">
        <textarea ref={box} rows={1} aria-label="Ask the Director" placeholder="Ask the Director…" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); }
            else if (e.key === "Escape" && streaming !== null) { e.preventDefault(); abort.current?.abort(); }
            else if (e.key === "ArrowUp" && !input) { const q = [...chat].reverse().find((t) => t.role === "user" && !t.auto); if (q) { e.preventDefault(); editQuestion(q.at); } }
          }} data-testid="director-input" />
        <div className="director-box-row">
          <span className="hint" data-testid="director-meter" title="Enter asks · Shift+Enter makes a new line · ↑ in an empty box edits your last question · Esc stops an answer">{tokens !== null ? `~${tokens.toLocaleString()} tokens per question` : "Out of character"}</span>
          {chat.length > 0 && <IconButton label="Copy the whole talk" onClick={copyChat}><Icon name="copy" size={13} /></IconButton>}
          {streaming !== null
            ? <Button small onClick={() => abort.current?.abort()}>Stop</Button>
            : <Button small variant="prominent" onClick={() => void ask()} disabled={!input.trim()} data-testid="director-ask">Ask</Button>}
          {chat.length > 0 && streaming === null && <Button small title="Clears the talk here; talks on other branches stay" onClick={() => void change((s) => ({ ...s, chat: s.chat.filter((t) => !seenAt(t, here)) }))}>Clear</Button>}
        </div>
      </div>
    </div>
  );
}

/** The text selected inside this answer, else the answer without its proposal tags. */
function selectionIn(text: string): string {
  const sel = window.getSelection()?.toString().trim() ?? "";
  if (sel && text.includes(sel.slice(0, 40))) return sel;
  return text.replace(/<(note|change)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/\s+\n/g, "\n").trim();
}

function TurnActions({ items, busy }: { items: Array<{ label: string; icon: "copy" | "pencil" | "trash" | "refresh" | "plus"; run: () => void; testId?: string }>; busy: boolean }) {
  return (
    <div className="director-actions">
      {items.map((x) => <IconButton key={x.label} label={x.label} onClick={x.run} disabled={busy && x.icon !== "copy"} data-testid={x.testId}><Icon name={x.icon} size={12} /></IconButton>)}
    </div>
  );
}

const lastCheck = (n: DirectorNote) => (n.sent.length ? n.checks?.[n.sent[n.sent.length - 1]!] : undefined);

type Ctx = { sessionId: string; branchId: string | null; headId: string | null };

function DirectorAnswer({ svc, ctx, profile, turn, onAdd, onApplied, onError, streaming = false }: {
  svc: AppServices; ctx: Ctx; profile: DirectorProfile; turn: DirectorTurn; streaming?: boolean;
  onAdd?: (p: ProposedNote, weightId: string, lasts: number | null) => void;
  onApplied?: (index: number, v: { undo: ChangeUndo; undone?: boolean; at: number }) => Promise<void>;
  onError?: (e: string) => void;
}) {
  return (
    <div className="director-a">
      <span className="director-who">{turn.auto ? "Director · by itself" : "Director"}</span>
      {splitProposals(turn.text, profile).map((piece, i) => piece.kind === "text"
        ? <div key={i} className="director-text"><MessageText text={piece.text} /></div>
        : piece.kind === "note"
          ? <Proposal key={i} profile={profile} p={piece.note} added={(turn.added ?? []).includes(piece.note.index)} disabled={streaming || profile.may.notes === "never"}
            onAdd={(w, l) => onAdd?.(piece.note, w, l)} />
          : <ChangeCard key={i} svc={svc} ctx={ctx} c={piece.change} permission={profile.may[piece.change.kind]} disabled={streaming}
            applied={turn.applied?.[piece.change.index]} onApplied={(v) => onApplied?.(piece.change.index, v)} onError={onError} />)}
    </div>
  );
}

function ChangeCard({ svc, ctx, c, permission, applied, disabled, onApplied, onError }: {
  svc: AppServices; ctx: Ctx; c: ProposedChange; permission: DirectorPermission; disabled: boolean;
  applied?: { undo: ChangeUndo; undone?: boolean | undefined; at: number } | undefined;
  onApplied: (v: { undo: ChangeUndo; undone?: boolean; at: number }) => Promise<void> | undefined; onError?: ((e: string) => void) | undefined;
}) {
  const [info, setInfo] = useState<{ title: string; scope: string; before: string; after: string } | { error: string } | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (disabled) return;
    let live = true;
    svc.chat.turns.directorChange(ctx.sessionId, ctx.branchId, ctx.headId, c)
      .then((r) => { if (live) setInfo({ title: r.title, scope: r.scope, before: r.before, after: r.after }); })
      .catch((e) => { if (live) setInfo({ error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [svc, ctx.sessionId, ctx.branchId, ctx.headId, c.kind, c.target, c.entry, c.value, disabled]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { onError?.(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const apply = () => run(async () => { const r = await svc.chat.turns.directorChange(ctx.sessionId, ctx.branchId, ctx.headId, c); await onApplied({ undo: await r.apply(), at: Date.now() }); });
  const undo = () => run(async () => { await svc.chat.turns.undoDirectorChange(applied!.undo); await onApplied({ ...applied!, undone: true }); });
  const ok = info && !("error" in info) ? info : undefined;
  return (
    <div className="director-proposal director-change" data-testid="director-change">
      <span className="director-label">Proposed change · {CHANGE_LABELS[c.kind]}</span>
      {ok && <span><b>{ok.title}</b> <small className="hint">{ok.scope}</small></span>}
      {info && "error" in info && <span className="director-error">{info.error}</span>}
      {ok && (
        <div className="director-diff">
          {ok.before.trim() && <pre className="before" aria-label="Before">{ok.before}</pre>}
          <pre className="after" aria-label="After">{ok.after}</pre>
        </div>
      )}
      {!ok && !info && <pre className="after">{c.value}</pre>}
      <div className="director-proposal-row">
        {permission === "never" ? <span className="hint">Not allowed in this Director's setup.</span>
          : applied && !applied.undone ? <><span className="director-added"><Icon name="check" size={12} /> Applied</span><Button small disabled={busy} onClick={() => void undo()} data-testid="director-undo">Undo</Button></>
            : applied?.undone ? <span className="hint">Undone</span>
              : skipped ? <span className="hint">Skipped</span>
                : <><Button small variant="prominent" disabled={disabled || busy || !ok} onClick={() => void apply()} data-testid="director-apply">Apply</Button>
                  <Button small disabled={disabled || busy} onClick={() => setSkipped(true)}>Skip</Button></>}
      </div>
    </div>
  );
}

function Proposal({ profile, p, added, disabled, onAdd }: { profile: DirectorProfile; p: ProposedNote; added: boolean; disabled: boolean; onAdd: (weightId: string, lasts: number | null) => void }) {
  const [weightId, setWeightId] = useState(p.weightId);
  const [lasts, setLasts] = useState<number | null>(p.lasts);
  return (
    <div className={`director-proposal w-${slug(weightId)}`} data-testid="director-proposal">
      <span className="director-label">Proposed note</span>
      <span>{p.text}</span>
      <div className="director-proposal-row">
        <WeightPicker profile={profile} value={weightId} onChange={(w) => { setWeightId(w); setLasts(profile.weights.find((x) => x.id === w)?.lasts ?? lasts); }} />
        <LastsPicker value={lasts} onChange={setLasts} />
        {added ? <span className="director-added"><Icon name="check" size={12} /> Added</span>
          : <Button small variant="prominent" disabled={disabled} onClick={() => onAdd(weightId, lasts)} data-testid="director-add">Add</Button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- notes

function NotesView({ profile, notes, change, draft, at, anchor }: {
  profile: DirectorProfile; notes: DirectorNote[]; change: (fn: (s: DirectorState) => DirectorState) => Promise<void>; draft?: { text: string; at: number } | undefined;
  at: DirectorPoint; anchor: string | null;
}) {
  const [tab, setTab] = useState<NoteStatus>("active");
  const [text, setText] = useState(draft?.text ?? "");
  useEffect(() => { if (draft) setText(draft.text); }, [draft]);
  const [weightId, setWeightId] = useState(profile.defaultWeightId);
  const [lasts, setLasts] = useState<number | null>(profile.weights.find((w) => w.id === profile.defaultWeightId)?.lasts ?? null);
  const count = (s: NoteStatus) => notes.filter((n) => noteStatus(n, at) === s).length;
  const shown = notes.filter((n) => noteStatus(n, at) === tab).slice().reverse();
  const edit = (id: string, patch: Partial<DirectorNote>) => void change((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  const add = () => {
    if (!text.trim()) return;
    void change((s) => ({ ...s, notes: [...s.notes, { id: newId(), text: text.trim(), weightId, lasts, sent: [], createdAt: Date.now(), anchor }] }));
    setText(""); setTab("active");
  };
  return (
    <div className="director-notes">
      <Segmented small label="Notes" value={tab} onChange={setTab} options={[
        { value: "active", label: `Active ${count("active")}` }, { value: "expired", label: `Expired ${count("expired")}` }, { value: "off", label: `Off ${count("off")}` },
        ...(count("elsewhere") ? [{ value: "elsewhere" as const, label: `Other branches ${count("elsewhere")}` }] : []),
      ]} />
      <p className="hint">A reply, a swipe and a regeneration each use a note once, counted along the branch on screen. Expired notes stay here, so you can see what was sent. A note made on another branch applies only there.</p>
      {!shown.length && <p className="hint director-empty">{tab === "active" ? "No active notes." : tab === "expired" ? "No expired notes yet." : tab === "elsewhere" ? "None." : "No notes switched off."}</p>}
      {shown.map((n) => <NoteCard key={n.id} profile={profile} n={n} at={at} anchor={anchor} onChange={(patch) => edit(n.id, patch)}
        onDelete={() => void change((s) => ({ ...s, notes: s.notes.filter((x) => x.id !== n.id) }))} />)}
      <div className="director-new">
        <span className="director-label">Write a note yourself</span>
        <textarea rows={2} aria-label="New note" value={text} placeholder="What the story should do" onChange={(e) => setText(e.target.value)} data-testid="director-new-note" />
        <div className="director-proposal-row">
          <WeightPicker profile={profile} value={weightId} onChange={(w) => { setWeightId(w); setLasts(profile.weights.find((x) => x.id === w)?.lasts ?? lasts); }} />
          <LastsPicker value={lasts} onChange={setLasts} />
          <Button small variant="prominent" disabled={!text.trim()} onClick={add} data-testid="director-new-add">Add</Button>
        </div>
      </div>
    </div>
  );
}

function NoteCard({ profile, n, at, anchor, onChange, onDelete }: { profile: DirectorProfile; n: DirectorNote; at: DirectorPoint; anchor: string | null; onChange: (p: Partial<DirectorNote>) => void; onDelete: () => void }) {
  const status = noteStatus(n, at);
  const uses = noteUses(n, at).length;
  const [text, setText] = useState(n.text);
  const [own, setOwn] = useState(n.instruction ?? "");
  useEffect(() => setText(n.text), [n.text]);
  useEffect(() => setOwn(n.instruction ?? ""), [n.instruction]);
  const weight = profile.weights.find((w) => w.id === n.weightId);
  const hasOwn = n.instruction !== undefined;
  return (
    <div className={`director-note ${status} w-${slug(n.weightId)}`} data-testid="director-note">
      <textarea rows={2} aria-label="Note" value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text.trim() && text.trim() !== n.text) onChange({ text: text.trim() }); }} />
      <div className="director-proposal-row">
        <WeightPicker profile={profile} value={n.weightId} onChange={(weightId) => onChange({ weightId })} />
        <LastsPicker value={n.lasts} onChange={(lasts) => onChange({ lasts })} />
        <span className="hint">{status === "off" ? "Off" : status === "elsewhere" ? "Made on another branch" : noteLeft(n, at)}{uses ? ` · sent with ${uses} ${uses === 1 ? "reply" : "replies"} here` : ""}{checkSummary(n)}</span>
      </div>
      <label className="director-own">
        <Switch label="Its own instruction" checked={hasOwn} onChange={(on) => onChange({ instruction: on ? (weight?.instruction ?? "") : undefined })} />
        <span>Its own instruction</span>
      </label>
      {hasOwn
        ? <textarea rows={2} aria-label="Its own instruction" value={own} onChange={(e) => setOwn(e.target.value)} onBlur={() => { if (own !== n.instruction) onChange({ instruction: own }); }} />
        : <p className="hint director-instr">{weight ? `${weight.name}: ${weight.instruction}` : "This weight no longer exists; the note goes without an instruction."}</p>}
      <div className="director-proposal-row">
        {status === "active" && <Button small onClick={() => onChange({ off: true })}>Turn off</Button>}
        {status === "off" && <Button small onClick={() => onChange({ off: false })}>Turn on</Button>}
        {status === "expired" && <Button small onClick={() => onChange({ sent: n.sent.filter((r) => !noteUses(n, at).includes(r)), anchor })}>Use again</Button>}
        {status === "elsewhere" && <Button small onClick={() => onChange({ anchor })}>Move to this branch</Button>}
        <Button small onClick={onDelete}>Delete</Button>
      </div>
    </div>
  );
}

function checkSummary(n: DirectorNote): string {
  const v = Object.values(n.checks ?? {});
  if (!v.length) return "";
  const f = v.filter((x) => x === "followed").length;
  return ` · followed ${f}, ignored ${v.length - f}`;
}

function WeightMark({ profile, id }: { profile: DirectorProfile; id: string }) {
  const i = profile.weights.findIndex((w) => w.id === id);
  return <span className={`director-mark w-${slug(id)}`} aria-hidden>{i <= 0 ? "◦" : "◆".repeat(Math.min(3, i))}</span>;
}

function WeightPicker({ profile, value, onChange }: { profile: DirectorProfile; value: string; onChange: (id: string) => void }) {
  return (
    <select className="pick-select" aria-label="Weight" value={value} onChange={(e) => onChange(e.target.value)}>
      {profile.weights.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      {!profile.weights.some((w) => w.id === value) && <option value={value}>{value} (missing)</option>}
    </select>
  );
}

function LastsPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const known = value === null || (LASTS as readonly number[]).includes(value);
  return (
    <select className="pick-select" aria-label="Lasts" value={value === null ? "always" : String(value)} onChange={(e) => onChange(e.target.value === "always" ? null : Number(e.target.value))}>
      {LASTS.map((n) => <option key={n} value={n}>For {n} {n === 1 ? "reply" : "replies"}</option>)}
      {!known && <option value={value!}>For {value} replies</option>}
      <option value="always">Always</option>
    </select>
  );
}

// ---------------------------------------------------------------- setup

function SetupView({ svc, connection, profiles, profile, onSave, onPick }: {
  svc: AppServices; connection: ConnectionState; profiles: DirectorProfile[]; profile: DirectorProfile;
  onSave: (list: DirectorProfile[]) => Promise<void>; onPick: (id: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<DirectorProfile>) => void onSave(profiles.map((p) => (p.id === profile.id ? cleanProfile({ ...p, ...patch }) : p)));
  const sees = (patch: Partial<DirectorProfile["sees"]>) => set({ sees: { ...profile.sees, ...patch } });
  const setWeight = (id: string, patch: Partial<DirectorWeight>) => set({ weights: profile.weights.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  const copy = (name: string, from: DirectorProfile) => {
    const p = cleanProfile({ ...from, id: newId(), name });
    void onSave([...profiles, p]).then(() => onPick(p.id));
  };
  const cfg = (profile.connectionId ? connection.configs[profile.connectionId] : undefined) ?? connection.forRequest().connection;
  const listModels = cfg && svc.core.providers.get(cfg.providerId)?.listModels;
  return (
    <div className="director-setup" data-testid="director-setup">
      <div className="director-setup-col">
      <section className="mem-card">
        <h3>Director</h3>
        <Field label="Name"><Text label="Director name" value={profile.name} onCommit={(name) => set({ name: name || "Director" })} /></Field>
        <div className="mem-actions">
          <Button small onClick={() => copy(`${profile.name} copy`, profile)}>Duplicate</Button>
          <Button small onClick={() => copy("New director", DEFAULT_DIRECTOR)}>New</Button>
          {profiles.length > 1 && <Button small onClick={() => { const rest = profiles.filter((p) => p.id !== profile.id); void onSave(rest).then(() => onPick(rest[0]!.id)); }}>Delete</Button>}
        </div>
      </section>

      <section className="mem-card">
        <h3>Model</h3>
        <Field label="Connection">
          <select className="pick-select" aria-label="Director connection" value={profile.connectionId} onChange={(e) => set({ connectionId: e.target.value, model: "" })}>
            <option value="">The story's connection</option>
            {connection.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Model" help="Blank uses the connection's model.">
          <Text label="Director model" value={profile.model} placeholder={cfg?.model || "Connection's model"} onCommit={(model) => set({ model })} />
        </Field>
        {listModels && <div className="mem-actions"><Button small onClick={() => setPicking((v) => !v)}>Browse models</Button></div>}
        {picking && cfg && listModels && <ModelPicker cacheKey={`${cfg.providerId}|${cfg.baseUrl ?? ""}`} current={profile.model || cfg.model}
          load={(signal) => listModels(cfg, signal)} onPick={(m) => { set({ model: m.id }); setPicking(false); }} onClose={() => setPicking(false)} />}
      </section>

      <section className="mem-card">
        <h3>Its job</h3>
        <Area label="Its job" value={profile.job} reset={DEFAULT_DIRECTOR.job} onCommit={(job) => set({ job })} />
        <h3>The writer line</h3>
        <p className="mem-text hint">What keeps it out of the story. Change it if you want this Director for something else.</p>
        <Area label="The writer line" value={profile.writerLine} reset={DEFAULT_DIRECTOR.writerLine} onCommit={(writerLine) => set({ writerLine })} />
        <h3>How it proposes notes</h3>
        <p className="mem-text hint">{"{{weights}}"} becomes the list of weights below.</p>
        <Area label="How it proposes notes" value={profile.noteFormat} reset={DEFAULT_DIRECTOR.noteFormat} onCommit={(noteFormat) => set({ noteFormat })} />
      </section>

      </div>
      <div className="director-setup-col">
      <section className="mem-card">
        <h3>Note weights</h3>
        <p className="mem-text hint">Each note picks one. The instruction goes above its notes in the story's prompt.</p>
        {profile.weights.map((w) => (
          <div key={w.id} className="director-weight" data-testid="director-weight">
            <div className="director-proposal-row">
              <Text label="Weight name" value={w.name} onCommit={(name) => setWeight(w.id, { name: name || w.id })} />
              <LastsPicker value={w.lasts} onChange={(lasts) => setWeight(w.id, { lasts })} />
              <label className="director-own"><input type="radio" name={`dw-${profile.id}`} checked={profile.defaultWeightId === w.id} onChange={() => set({ defaultWeightId: w.id })} /> Default</label>
              {profile.weights.length > 1 && <IconButton label={`Delete ${w.name}`} onClick={() => set({ weights: profile.weights.filter((x) => x.id !== w.id) })}><Icon name="trash" size={13} /></IconButton>}
            </div>
            <Area label={`${w.name} instruction`} value={w.instruction} onCommit={(instruction) => setWeight(w.id, { instruction })} />
          </div>
        ))}
        <div className="mem-actions">
          <Button small onClick={() => {
            let id = "weight", k = 2;
            while (profile.weights.some((w) => w.id === id)) id = `weight-${k++}`;
            set({ weights: [...profile.weights, { id, name: "New weight", instruction: "", lasts: 3 }] });
          }} data-testid="director-add-weight"><Icon name="plus" size={12} /> Add a weight</Button>
          <Button small onClick={() => set({ weights: DEFAULT_DIRECTOR.weights, defaultWeightId: DEFAULT_DIRECTOR.defaultWeightId })}>Reset weights</Button>
        </div>
        <h3>Above the notes</h3>
        <Area label="Above the notes" value={profile.notesHeader} reset={DEFAULT_DIRECTOR.notesHeader} onCommit={(notesHeader) => set({ notesHeader })} />
        <Field label="Where in the prompt" help="Messages before the end of the chat. 0 = after the last one.">
          <Num label="Notes depth" value={profile.depth} min={0} max={999} onCommit={(depth) => set({ depth })} />
        </Field>
        <Field label="As">
          <Segmented small label="Notes role" value={profile.role} onChange={(role) => set({ role })} options={[{ value: "system", label: "System" }, { value: "user", label: "User" }]} />
        </Field>
      </section>

      <section className="mem-card">
        <h3>What it sees</h3>
        <p className="mem-text hint">The parts of the story's next prompt it reads. More context costs more tokens per question.</p>
        <Field label="Preset blocks">
          <Segmented small label="Preset blocks" value={profile.sees.preset} onChange={(preset) => sees({ preset })}
            options={[{ value: "none", label: "None" }, { value: "active", label: "Active" }, { value: "all", label: "All" }]} />
        </Field>
        <Field label="Lorebook entries">
          <Segmented small label="Lorebook entries" value={profile.sees.lore} onChange={(lore) => sees({ lore })}
            options={[{ value: "none", label: "None" }, { value: "fired", label: "That fired" }, { value: "all", label: "All" }]} />
        </Field>
        {([["characters", "Characters"], ["persona", "Persona"], ["story", "Story · scenario and narrator"], ["trackers", "Trackers"],
          ["memory", "Memory chapters"], ["notes", "Author's Note · Character's Note"], ["agents", "Agents' notes"]] as const).map(([k, label]) => (
          <Field key={k} label={label}><Switch label={label} checked={profile.sees[k]} onChange={(on) => sees({ [k]: on })} /></Field>
        ))}
        <Field label="Chat messages" help="The last N messages of the story. 0 = none.">
          <Num label="Chat messages" value={profile.sees.chat} min={0} max={1000} onCommit={(chat) => sees({ chat })} />
        </Field>
        <Field label="Earlier talks" help="Questions and answers from its chats in this story's other chats. 0 = none.">
          <Num label="Earlier talks" value={profile.sees.past} min={0} max={100} onCommit={(past) => sees({ past })} />
        </Field>
        <p className="mem-text hint">Its own notes and their status always go along.</p>
      </section>

      <section className="mem-card" data-testid="director-may">
        <h3>What it may change</h3>
        <p className="mem-text hint">Ask first shows a card with before and after; Allowed applies it at once. Every change has Undo.</p>
        {CHANGE_KINDS.map((k) => (
          <Field key={k} label={CHANGE_LABELS[k]} help={k === "lore" ? "In a story, only its own version of the book." : k === "characterNote" ? "Changes the character's card." : undefined}>
            <Segmented small label={CHANGE_LABELS[k]} value={profile.may[k]} onChange={(v) => set({ may: { ...profile.may, [k]: v } })}
              options={[{ value: "never", label: "Never" }, { value: "ask", label: "Ask first" }, { value: "allowed", label: "Allowed" }]} />
          </Field>
        ))}
        <h3>How it proposes changes</h3>
        <p className="mem-text hint">{"{{changes}}"} becomes the list of what it may change, with their current values.</p>
        <Area label="How it proposes changes" value={profile.changeFormat} reset={DEFAULT_DIRECTOR.changeFormat} onCommit={(changeFormat) => set({ changeFormat })} />
      </section>

      <section className="mem-card" data-testid="director-extras">
        <h3>Checks and questions</h3>
        <Field label="Check replies against notes" help="After each reply that carried notes, one short extra call marks each note followed or ignored.">
          <Switch label="Check replies against notes" checked={profile.checkReplies} onChange={(checkReplies) => set({ checkReplies })} />
        </Field>
        {profile.checkReplies && <Area label="How it checks" value={profile.checkPrompt} reset={DEFAULT_DIRECTOR.checkPrompt} onCommit={(checkPrompt) => set({ checkPrompt })} />}
        <Field label="Ask by itself every" help="Story replies between automatic questions. 0 = off. The answer lands in its chat.">
          <Num label="Ask by itself every" value={profile.autoEvery} min={0} max={999} onCommit={(autoEvery) => set({ autoEvery })} />
        </Field>
        {profile.autoEvery > 0 && <Area label="The automatic question" value={profile.autoQuestion} reset={DEFAULT_DIRECTOR.autoQuestion} onCommit={(autoQuestion) => set({ autoQuestion })} />}
        <h3>Quick questions</h3>
        <p className="mem-text hint">Buttons above its message box, one per line.</p>
        <Area label="Quick questions" value={profile.quick.join("\n")} reset={DEFAULT_DIRECTOR.quick.join("\n")}
          onCommit={(t) => set({ quick: t.split("\n").map((x) => x.trim()).filter(Boolean) })} />
      </section>
      </div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return <div className="mem-setting"><span className="mem-setting-label"><b>{label}</b>{help && <small>{help}</small>}</span><span className="mem-setting-value">{children}</span></div>;
}

function Text({ label, value, placeholder, onCommit }: { label: string; value: string; placeholder?: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return <input aria-label={label} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
    onBlur={() => { const v = text.trim(); if (v !== value) onCommit(v); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function Num({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return <input className="num" aria-label={label} inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)}
    onBlur={() => { const n = Math.round(Number(text)); const v = Number.isFinite(n) && text.trim() ? Math.min(max, Math.max(min, n)) : value; setText(String(v)); if (v !== value) onCommit(v); }}
    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function Area({ label, value, reset, onCommit }: { label: string; value: string; reset?: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="director-area">
      <textarea rows={Math.min(10, Math.max(2, text.split("\n").length + 1))} aria-label={label} value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== value) onCommit(text); }} />
      {reset !== undefined && text !== reset && <button type="button" className="link quiet" onClick={() => { setText(reset); onCommit(reset); }}>Reset to the starter text</button>}
    </div>
  );
}

// ---------------------------------------------------------------- setup sheet and the popped-out window

/** The Director's setup in its own panel over the app (not squeezed into the chat window). Esc closes it. */
function SetupSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  return createPortal(
    <div className="director-sheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="director-sheet" role="dialog" aria-modal="true" aria-label="Director setup" data-testid="director-sheet">
        <header className="director-sheet-head"><h2>Director setup</h2><span className="hint">{title}</span>
          <IconButton label="Close the setup" onClick={onClose}><Icon name="close" size={14} /></IconButton></header>
        <div className="director-sheet-body">{children}</div>
      </section>
    </div>, document.body);
}

type Box = { x: number; y: number; w: number; h: number };
type Edge = "e" | "s" | "w" | "se" | "sw";
const MIN_W = 360, MIN_H = 320, GAP = 12;
const fit = (b: Box): Box => {
  const w = Math.min(Math.max(MIN_W, b.w), window.innerWidth - GAP * 2);
  const h = Math.min(Math.max(MIN_H, b.h), window.innerHeight - GAP * 2);
  return { w, h, x: Math.min(Math.max(GAP, b.x), window.innerWidth - w - GAP), y: Math.min(Math.max(GAP, b.y), window.innerHeight - h - GAP) };
};

/**
 * The Director in its own window over the chat: drag it by its top, resize it from its edges and corners, maximize it
 * (button or double-click on the top). Size, place and maximized are remembered. Dock puts it back in the inspector.
 */
export function DirectorWindow({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [box, setBox] = useState<Box>(() => {
    try { const s = JSON.parse(localStorage.getItem("director.window") ?? ""); if (typeof s?.x === "number" && typeof s?.w === "number") return fit(s); } catch { /* ignore */ }
    return fit({ x: window.innerWidth - 520 - 400, y: 90, w: 520, h: Math.min(760, window.innerHeight * 0.76) }); // left of the inspector
  });
  const [max, setMax] = useState(() => { try { return localStorage.getItem("director.window.max") === "1"; } catch { return false; } });
  const act = useRef<{ edge: Edge | "move"; sx: number; sy: number; start: Box } | null>(null);
  const latest = useRef(box);
  latest.current = box;
  useEffect(() => { const r = () => setBox((b) => fit(b)); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, []);
  const save = (b: Box, m: boolean) => { try { localStorage.setItem("director.window", JSON.stringify(b)); localStorage.setItem("director.window.max", m ? "1" : "0"); } catch { /* ignore */ } };
  const toggleMax = () => setMax((m) => { save(latest.current, !m); return !m; });
  const begin = (edge: Edge | "move") => (e: ReactPointerEvent<HTMLElement>) => {
    if (edge === "move" && ((e.target as HTMLElement).closest("button, select, input") || max)) return;
    if (max) return;
    e.preventDefault();
    act.current = { edge, sx: e.clientX, sy: e.clientY, start: latest.current };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const during = (e: ReactPointerEvent<HTMLElement>) => {
    const a = act.current;
    if (!a) return;
    const dx = e.clientX - a.sx, dy = e.clientY - a.sy, s = a.start;
    if (a.edge === "move") { setBox(fit({ ...s, x: s.x + dx, y: s.y + dy })); return; }
    let { x, w, h } = s;
    if (a.edge.includes("e")) w = s.w + dx;
    if (a.edge.includes("w")) { w = Math.max(MIN_W, s.w - dx); x = s.x + s.w - w; }
    if (a.edge.includes("s")) h = s.h + dy;
    setBox(fit({ x, y: s.y, w, h }));
  };
  const end = () => { if (!act.current) return; act.current = null; save(latest.current, max); };
  const style = max ? { left: GAP, top: GAP, width: `calc(100vw - ${GAP * 2}px)`, height: `calc(100vh - ${GAP * 2}px)` } : { left: box.x, top: box.y, width: box.w, height: box.h };
  return (
    <div className={`director-window glass${max ? " maximized" : ""}`} style={style} role="dialog" aria-label="Director" data-testid="director-window">
      <div className="director-window-bar" onPointerDown={begin("move")} onPointerMove={during} onPointerUp={end} onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button")) toggleMax(); }}>
        <Icon name="grip" size={13} /><span>Director</span>
        <IconButton label={max ? "Restore the size" : "Maximize"} onClick={toggleMax} data-testid="director-max"><Icon name={max ? "restore" : "maximize"} size={13} /></IconButton>
        <IconButton label="Close the Director" onClick={onClose}><Icon name="close" size={13} /></IconButton>
      </div>
      {children}
      {!max && (["e", "s", "w", "se", "sw"] as const).map((edge) => (
        <span key={edge} className={`director-resize ${edge}`} aria-hidden data-testid={`director-resize-${edge}`}
          onPointerDown={begin(edge)} onPointerMove={during} onPointerUp={end} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Library → Directors

/**
 * Library → Directors (D-092): every Director, which one is the default, and which stories use which. A chat uses its
 * own pick (the Director tab's menu), else its story's, else the default. Each Director's setup is edited here too.
 */
export function DirectorsPage({ svc, connection, lead, stories }: {
  svc: AppServices; connection: ConnectionState; lead?: React.ReactNode; stories: Array<{ id: string; name: string }>;
}) {
  const [profiles, setProfiles] = useState<DirectorProfile[]>([DEFAULT_DIRECTOR]);
  const [links, setLinks] = useState<DirectorLinks>({ defaultId: "", stories: {} });
  const [openId, setOpenId] = useState<string>("");
  const load = useCallback(async () => {
    const [p, l] = await Promise.all([directorProfiles(svc.store), directorLinks(svc.store)]);
    setProfiles(p); setLinks(l);
  }, [svc]);
  useEffect(() => { void load(); }, [load]);
  const defaultId = profiles.some((p) => p.id === links.defaultId) ? links.defaultId : profiles[0]?.id ?? "";
  const open = profiles.find((p) => p.id === openId) ?? profiles.find((p) => p.id === defaultId) ?? profiles[0]!;
  const save = async (list: DirectorProfile[]) => { setProfiles(list); await saveDirectorProfiles(svc.store, list); };
  const saveLinks = async (l: DirectorLinks) => { setLinks(l); await saveDirectorLinks(svc.store, l); };
  const usedBy = (id: string) => stories.filter((s) => (links.stories[s.id] ?? "") === id);
  const add = () => { const p = cleanProfile({ ...DEFAULT_DIRECTOR, id: newId(), name: "New director" }); void save([...profiles, p]).then(() => setOpenId(p.id)); };
  return (
    <section className="directors-page" data-testid="directors-page">
      <Toolbar lead={lead} title="Directors" subtitle="Out-of-character helpers for your stories"
        trailing={<Button small onClick={add} data-testid="directors-new"><Icon name="plus" size={13} /> New Director</Button>} />
      <div className="directors-body">
        <nav className="directors-list" aria-label="Directors">
          {profiles.map((p) => (
            <button key={p.id} type="button" className={`directors-item${p.id === open.id ? " on" : ""}`} onClick={() => setOpenId(p.id)} aria-current={p.id === open.id}>
              <b>{p.name}</b>
              <small>{p.id === defaultId ? "★ Default" : ""}{usedBy(p.id).length ? `${p.id === defaultId ? " · " : ""}${usedBy(p.id).length} ${usedBy(p.id).length === 1 ? "story" : "stories"}` : ""}</small>
            </button>
          ))}
        </nav>
        <div className="directors-detail">
          <section className="mem-card" data-testid="directors-use">
            <h3>Where it is used</h3>
            <Field label="Default Director" help="For chats and stories that pick none.">
              {open.id === defaultId ? <span className="hint">★ This is the default</span>
                : <Button small onClick={() => void saveLinks({ ...links, defaultId: open.id })} data-testid="directors-make-default">Make it the default</Button>}
            </Field>
            <p className="mem-text hint">Stories that use this Director (a chat can still pick another in its Director tab):</p>
            {!stories.length && <p className="mem-text hint">No stories yet.</p>}
            <div className="directors-stories">
              {stories.map((s) => {
                const mine = (links.stories[s.id] ?? "") === open.id;
                const other = links.stories[s.id] && !mine ? profiles.find((p) => p.id === links.stories[s.id])?.name : undefined;
                return (
                  <label key={s.id} className="director-own">
                    <Switch label={`${s.name} uses ${open.name}`} checked={mine} onChange={(on) => {
                      const next = { ...links.stories };
                      if (on) next[s.id] = open.id; else delete next[s.id];
                      void saveLinks({ ...links, stories: next });
                    }} />
                    <span>{s.name}{other ? <small className="hint"> · uses {other}</small> : null}</span>
                  </label>
                );
              })}
            </div>
          </section>
          <SetupView svc={svc} connection={connection} profiles={profiles} profile={open} onSave={save} onPick={setOpenId} />
        </div>
      </div>
    </section>
  );
}
