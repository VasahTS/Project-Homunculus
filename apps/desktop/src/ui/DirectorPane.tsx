// Homunculus 2 — the Director (D-092): an out-of-character chat about the story, its notes, and its setup.
// Author: CLAUDE, 2026-11-06. Canvas "Homunculus 2 — Director": A2 (an inspector tab that pops out into its own
// window), D (notes, kept when expired), F (setup) and G (a note's weight). Everything a Director says or does is
// data the user can edit: job, writer line, how notes are proposed, the weights and their instructions, what it sees.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Session } from "@homunculus/schemas";
import {
  cleanProfile, DEFAULT_DIRECTOR, directorProfiles, directorState, noteLeft, noteStatus, profileFor, saveDirectorProfiles, saveDirectorState,
  splitProposals, type DirectorNote, type DirectorProfile, type DirectorState, type DirectorWeight, type NoteStatus, type ProposedNote,
} from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { Button, Icon, IconButton, Segmented, Switch } from "./kit.tsx";
import { MessageText } from "./MessageText.tsx";
import { ModelPicker } from "./ModelPicker.tsx";

type View = "chat" | "notes" | "setup";
const newId = () => crypto.randomUUID();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "weight";
const LASTS = [1, 2, 3, 5, 10, 20] as const;

export function DirectorPane({ svc, session, headId, branchId, connection, popped = false, onPop }: {
  svc: AppServices; session: Session; headId: string | null; branchId: string | null; connection: ConnectionState;
  /** Shown in its own window (true) or in the inspector. */
  popped?: boolean;
  onPop?: () => void;
}) {
  const [profiles, setProfiles] = useState<DirectorProfile[]>([DEFAULT_DIRECTOR]);
  const [state, setState] = useState<DirectorState>({ profileId: "", notes: [], chat: [] });
  const [view, setView] = useState<View>("chat");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [p, s] = await Promise.all([directorProfiles(svc.store), directorState(svc.store, session.id)]);
    setProfiles(p); setState(s);
  }, [svc, session.id]);
  useEffect(() => { void load().catch((e) => setError(String(e))); }, [load]);
  useEffect(() => svc.core.events.on("director.changed", (e) => { if (e.sessionId === session.id) void load(); }, "director-pane"), [svc, session.id, load]);
  const profile = profileFor(profiles, state);

  // always write the latest state from disk, so a reply counting notes meanwhile is never lost
  const change = async (fn: (s: DirectorState) => DirectorState) => {
    const latest = await directorState(svc.store, session.id);
    const next = fn(latest);
    setState(next);
    await saveDirectorState(svc.store, session.id, next);
    void svc.core.events.emit("director.changed", { sessionId: session.id });
  };
  const saveProfiles = async (list: DirectorProfile[]) => { setProfiles(list); await saveDirectorProfiles(svc.store, list); };
  const active = state.notes.filter((n) => noteStatus(n) === "active");

  return (
    <div className={`director${popped ? " popped" : ""}`} data-testid="director">
      <div className="director-head">
        <select className="pick-select" aria-label="Director" value={profile.id} onChange={(e) => void change((s) => ({ ...s, profileId: e.target.value }))}>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Segmented small label="Director view" value={view} onChange={setView} options={[
          { value: "chat", label: "Chat", testId: "director-view-chat" },
          { value: "notes", label: `Notes${active.length ? ` ${active.length}` : ""}`, testId: "director-view-notes" },
          { value: "setup", label: "Setup", testId: "director-view-setup" },
        ]} />
        {onPop && <IconButton label={popped ? "Dock in the inspector" : "Pop out"} onClick={onPop} data-testid="director-pop"><Icon name={popped ? "inspector" : "send"} size={14} /></IconButton>}
      </div>
      {error && <p className="hint director-error" role="alert">{error}</p>}
      {view === "chat" && <ChatView svc={svc} session={session} headId={headId} branchId={branchId} connection={connection} profile={profile}
        state={state} change={change} onError={setError} onNotes={() => setView("notes")} />}
      {view === "notes" && <NotesView profile={profile} notes={state.notes} change={change} />}
      {view === "setup" && <SetupView svc={svc} connection={connection} profiles={profiles} profile={profile} onSave={saveProfiles}
        onPick={(id) => void change((s) => ({ ...s, profileId: id }))} />}
    </div>
  );
}

// ---------------------------------------------------------------- chat

function ChatView({ svc, session, headId, branchId, connection, profile, state, change, onError, onNotes }: {
  svc: AppServices; session: Session; headId: string | null; branchId: string | null; connection: ConnectionState; profile: DirectorProfile;
  state: DirectorState; change: (fn: (s: DirectorState) => DirectorState) => Promise<void>; onError: (e: string) => void; onNotes: () => void;
}) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [state.chat.length, streaming]);
  const active = state.notes.filter((n) => noteStatus(n) === "active");

  const ask = async () => {
    const question = input.trim();
    if (!question || streaming !== null) return;
    setInput(""); onError("");
    const before = state.chat;
    await change((s) => ({ ...s, chat: [...s.chat, { role: "user", text: question, at: Date.now() }] }));
    const ctl = new AbortController();
    abort.current = ctl;
    setStreaming("");
    try {
      const r = connection.forRequest();
      const text = await svc.chat.turns.askDirector({ sessionId: session.id, parentId: headId, branchId, profile, question, chat: before,
        connection: r.connection, connections: r.connections, signal: ctl.signal, onToken: (t) => setStreaming(t) });
      await change((s) => ({ ...s, chat: [...s.chat, { role: "director", text: text || "(no answer)", at: Date.now() }] }));
    } catch (e) {
      if (!ctl.signal.aborted) onError(e instanceof Error ? e.message : String(e));
    } finally { setStreaming(null); abort.current = null; }
  };
  const addNote = (turnAt: number, p: ProposedNote, weightId: string, lasts: number | null) => void change((s) => ({
    ...s,
    notes: [...s.notes, { id: newId(), text: p.text, weightId, lasts, sent: [], createdAt: Date.now() }],
    chat: s.chat.map((t) => (t.at === turnAt ? { ...t, added: [...(t.added ?? []), p.index] } : t)),
  }));

  return (
    <div className="director-chat">
      {active.length > 0 && (
        <button type="button" className="director-active" onClick={onNotes} data-testid="director-active">
          {active.map((n) => <span key={n.id} className="director-chip"><WeightMark profile={profile} id={n.weightId} /> {n.text}<small>{noteLeft(n)}</small></span>)}
        </button>
      )}
      <div className="director-log" ref={list}>
        {!state.chat.length && streaming === null && (
          <p className="hint director-empty">Talk about the story out of character: where it is going, a character acting off, which prompt causes what. Nothing here goes into the story, except the notes you add.</p>
        )}
        {state.chat.map((t) => t.role === "user"
          ? <div key={t.at} className="director-q">{t.text}</div>
          : <DirectorAnswer key={t.at} profile={profile} text={t.text} added={t.added ?? []} onAdd={(p, w, l) => addNote(t.at, p, w, l)} />)}
        {streaming !== null && <DirectorAnswer profile={profile} text={streaming || "…"} added={[]} streaming />}
      </div>
      <div className="director-box">
        <textarea rows={2} aria-label="Ask the Director" placeholder="Ask the Director…" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }} data-testid="director-input" />
        <div className="director-box-row">
          <span className="hint">Out of character. Only notes you add reach the story.</span>
          {streaming !== null
            ? <Button small onClick={() => abort.current?.abort()}>Stop</Button>
            : <Button small variant="prominent" onClick={() => void ask()} disabled={!input.trim()} data-testid="director-ask">Ask</Button>}
          {state.chat.length > 0 && streaming === null && <Button small onClick={() => void change((s) => ({ ...s, chat: [] }))}>Clear</Button>}
        </div>
      </div>
    </div>
  );
}

function DirectorAnswer({ profile, text, added, onAdd, streaming = false }: {
  profile: DirectorProfile; text: string; added: number[]; streaming?: boolean; onAdd?: (p: ProposedNote, weightId: string, lasts: number | null) => void;
}) {
  return (
    <div className="director-a">
      <span className="director-who">Director</span>
      {splitProposals(text, profile).map((piece, i) => piece.kind === "text"
        ? <div key={i} className="director-text"><MessageText text={piece.text} /></div>
        : <Proposal key={i} profile={profile} p={piece.note} added={added.includes(piece.note.index)} disabled={streaming}
          onAdd={(w, l) => onAdd?.(piece.note, w, l)} />)}
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

function NotesView({ profile, notes, change }: { profile: DirectorProfile; notes: DirectorNote[]; change: (fn: (s: DirectorState) => DirectorState) => Promise<void> }) {
  const [tab, setTab] = useState<NoteStatus>("active");
  const [text, setText] = useState("");
  const [weightId, setWeightId] = useState(profile.defaultWeightId);
  const [lasts, setLasts] = useState<number | null>(profile.weights.find((w) => w.id === profile.defaultWeightId)?.lasts ?? null);
  const count = (s: NoteStatus) => notes.filter((n) => noteStatus(n) === s).length;
  const shown = notes.filter((n) => noteStatus(n) === tab).slice().reverse();
  const edit = (id: string, patch: Partial<DirectorNote>) => void change((s) => ({ ...s, notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  const add = () => {
    if (!text.trim()) return;
    void change((s) => ({ ...s, notes: [...s.notes, { id: newId(), text: text.trim(), weightId, lasts, sent: [], createdAt: Date.now() }] }));
    setText(""); setTab("active");
  };
  return (
    <div className="director-notes">
      <Segmented small label="Notes" value={tab} onChange={setTab} options={[
        { value: "active", label: `Active ${count("active")}` }, { value: "expired", label: `Expired ${count("expired")}` }, { value: "off", label: `Off ${count("off")}` },
      ]} />
      <p className="hint">A reply, a swipe and a regeneration each use a note once. Expired notes stay here, so you can see what was sent.</p>
      {!shown.length && <p className="hint director-empty">{tab === "active" ? "No active notes." : tab === "expired" ? "No expired notes yet." : "No notes switched off."}</p>}
      {shown.map((n) => <NoteCard key={n.id} profile={profile} n={n} onChange={(patch) => edit(n.id, patch)}
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

function NoteCard({ profile, n, onChange, onDelete }: { profile: DirectorProfile; n: DirectorNote; onChange: (p: Partial<DirectorNote>) => void; onDelete: () => void }) {
  const status = noteStatus(n);
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
        <span className="hint">{status === "off" ? "Off" : noteLeft(n)}{n.sent.length ? ` · sent with ${n.sent.length} ${n.sent.length === 1 ? "reply" : "replies"}` : ""}</span>
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
        {status === "expired" && <Button small onClick={() => onChange({ sent: [] })}>Use again</Button>}
        <Button small onClick={onDelete}>Delete</Button>
      </div>
    </div>
  );
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
        <p className="mem-text hint">Its own notes and their status always go along.</p>
      </section>
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

// ---------------------------------------------------------------- the popped-out window

/** The Director in its own window over the chat: drag it by its top; Dock puts it back in the inspector. */
export function DirectorWindow({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try { const s = JSON.parse(localStorage.getItem("director.window") ?? ""); if (typeof s?.x === "number") return s; } catch { /* ignore */ }
    return { x: Math.max(16, window.innerWidth - 560 - 400), y: 90 }; // left of the inspector, over the chat
  });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, select, input")) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const x = Math.min(window.innerWidth - 120, Math.max(0, e.clientX - drag.current.dx));
    const y = Math.min(window.innerHeight - 60, Math.max(0, e.clientY - drag.current.dy));
    setPos({ x, y });
  };
  const up = () => { if (!drag.current) return; drag.current = null; try { localStorage.setItem("director.window", JSON.stringify(pos)); } catch { /* ignore */ } };
  return (
    <div className="director-window glass" style={{ left: pos.x, top: pos.y }} role="dialog" aria-label="Director" data-testid="director-window">
      <div className="director-window-bar" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        <Icon name="grip" size={13} /><span>Director</span>
        <IconButton label="Close the Director" onClick={onClose}><Icon name="close" size={13} /></IconButton>
      </div>
      {children}
    </div>
  );
}
