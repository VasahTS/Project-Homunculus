// Homunculus 2 — the Assistant mode: its sidebar, the conversation, Add context and Customize (D-062).
// Author: CLAUDE, 2026-11-01. Draft: docs/drafts/library-assistant/index.html (round 3); plan: docs/UI-PLAN.md.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AssistantChat, type AssistantAttachment, type AssistantKind, type AssistantMessage, type AssistantReadKind, type AssistantResult, type AssistantSettings, type Avatar } from "@homunculus/schemas";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { deleteChat, listChats, loadChat, loadSettings, runAssistant, saveChat, saveSettings, updateResult, type ChatRow } from "../assistant/engine.ts";
import { applyChange, applyTrash, createItem, undoCreate } from "../assistant/tools.ts";
import { parseFile } from "../assistant/files.ts";
import { DEFAULT_INSTRUCTIONS } from "../assistant/guides.ts";
import { diffWords } from "../diff.ts";
import { readFileBytes } from "../files.ts";
import { bytesToBase64 } from "@homunculus/st-cards";
import { Button, Icon, IconButton, Segmented, Switch } from "./kit.tsx";
import { Modal } from "./Vault.tsx";
import { MessageText } from "./MessageText.tsx";

export type AppMode = "play" | "assistant";

/** A thing of the app the user can add as context (from App's lists). */
export interface LibraryEntry { kind: AssistantReadKind; id: string; name: string; line: string; avatar?: Avatar | undefined }

const KIND_LABEL: Record<AssistantReadKind, string> = { character: "Characters", persona: "Personas", narrator: "Narrators", npc: "NPCs", story: "Stories", kit: "Kits", lorebook: "Lorebooks", tracker: "Trackers", preset: "Presets" };
const KIND_ONE: Record<AssistantReadKind, string> = { character: "Character", persona: "Persona", narrator: "Narrator", npc: "NPC", story: "Story", kit: "Kit", lorebook: "Lorebook", tracker: "Tracker", preset: "Preset" };
const KIND_MARK: Record<AssistantReadKind, string> = { character: "◯", persona: "◐", narrator: "✒", npc: "◔", story: "▣", kit: "❖", lorebook: "▤", tracker: "◉", preset: "≡" };
const KIND_ORDER: AssistantReadKind[] = ["character", "persona", "narrator", "npc", "story", "kit", "lorebook", "tracker", "preset"];

// ------------------------------------------------------------------ state shared by the sidebar and the view

export function useAssistant(svc: AppServices | null) {
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const reload = useCallback(async () => { if (svc) setChats(await listChats(svc.store)); }, [svc]);
  useEffect(() => { void reload(); }, [reload]);
  return { chats, activeId, setActiveId, reload };
}
export type AssistantState = ReturnType<typeof useAssistant>;

export function ModeSwitch({ mode, onMode }: { mode: AppMode; onMode: (m: AppMode) => void }) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Mode" data-testid="mode-switch">
      {(["play", "assistant"] as const).map((m) => (
        <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} onClick={() => onMode(m)}>
          {m === "play" ? "Play" : <><span className="mode-star" aria-hidden>✦</span> Assistant</>}
        </button>
      ))}
    </div>
  );
}

export function AssistantSidebar({ st, onMode, onCustomize, status }: { st: AssistantState; onMode: (m: AppMode) => void; onCustomize: () => void; status: string }) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const shown = q.trim() ? st.chats.filter((c) => `${c.title} ${c.summary}`.toLowerCase().includes(q.trim().toLowerCase())) : st.chats;
  return (
    <nav className="sidebar glass asst-side" aria-label="Assistant" data-region="sidebar" data-testid="assistant-sidebar">
      <div className="sidebar-brand"><span className="brand">Homunculus</span><span className="status-chip">{status}</span></div>
      <ModeSwitch mode="assistant" onMode={onMode} />
      <ul className="side-list">
        <li><button className="side-item" onClick={() => st.setActiveId(null)} data-testid="assistant-new"><span className="side-icon acc"><Icon name="plus" /></span><span className="side-text"><strong>New chat</strong></span></button></li>
        <li>{searching
          ? <label className="search-box side-search"><Icon name="search" size={13} /><input autoFocus aria-label="Search chats" placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => { if (!q) setSearching(false); }} /></label>
          : <button className="side-item" onClick={() => setSearching(true)}><span className="side-icon"><Icon name="search" /></span><span className="side-text"><strong>Search</strong></span></button>}</li>
        <li><button className="side-item" onClick={onCustomize} data-testid="assistant-customize"><span className="side-icon"><Icon name="gear" /></span><span className="side-text"><strong>Customize</strong></span></button></li>
      </ul>
      <div className="side-head"><span>Recents</span></div>
      <ul className="side-list" data-testid="assistant-chats">
        {shown.length === 0 && <li className="hint side-empty">{q ? "No chat matches." : "Your chats will show here."}</li>}
        {shown.map((c) => (
          <li key={c.id}><button className={`side-item${st.activeId === c.id ? " on" : ""}`} onClick={() => st.setActiveId(c.id)}>
            <span className="side-text"><strong>{c.title}</strong><span>{c.summary || new Date(c.updatedAt).toLocaleDateString()}</span></span>
          </button></li>
        ))}
      </ul>
    </nav>
  );
}

// ------------------------------------------------------------------ the view

const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

const QUICK: Array<{ icon: string; title: string; text: string; prompt: string }> = [
  { icon: "❖", title: "Build a Kit", text: "Pick characters and get a Kit with a scenario and an opening where they fit together.", prompt: "Make a Kit with the characters I added: a scenario and an opening where they fit together." },
  { icon: "◯", title: "Make a character", text: "From a description or a picture: card, first message and examples.", prompt: "Make a character: " },
  { icon: "▤", title: "Write a lorebook", text: "A place, a faction or a whole world, with keywords that trigger well.", prompt: "Write a lorebook about " },
  { icon: "✒", title: "Make a narrator", text: "How your stories are told: voice, rules, pacing.", prompt: "Make a narrator that " },
];

export function AssistantView({ svc, st, connection, library, userName, lead, onOpenItem, onStartKit, onChanged }: {
  svc: AppServices; st: AssistantState; connection: ConnectionState; library: LibraryEntry[]; userName: string; lead: ReactNode;
  onOpenItem: (kind: AssistantKind, id: string) => void; onStartKit: (id: string) => void;
  /** Library items were made or changed (App reloads its lists). */
  onChanged: () => void;
}) {
  const [chat, setChat] = useState<AssistantChat | null>(null);
  const [live, setLive] = useState<AssistantMessage | null>(null);
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<AssistantAttachment[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<AssistantSettings | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = live !== null;

  useEffect(() => { void loadSettings(svc.store).then(setSettings); }, [svc]);
  useEffect(() => {
    if (busy) return;
    setError("");
    if (!st.activeId) { setChat(null); return; }
    void loadChat(svc.store, st.activeId).then((c) => setChat(c ?? null));
  }, [svc, st.activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [chat, live]);

  const profileName = settings?.connectionId ? connection.byId.get(settings.connectionId)?.name : connection.byId.get(connection.defaultId ?? "")?.name;
  const modelName = settings?.model || profileName || "No connection";

  const addFiles = async (files: File[]) => {
    const out: AssistantAttachment[] = [];
    for (const f of files) {
      try {
        const bytes = await readFileBytes(f);
        if (/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) {
          // a PNG can be a character card: then it is read as the card (and kept as a picture too)
          try { const p = parseFile(f.name, bytes); out.push({ type: "file", id: `f${Date.now().toString(36)}${out.length}`, name: f.name, mime: p.mime, text: p.text, summary: p.summary }); } catch { /* a plain picture */ }
          out.push({ type: "image", id: `i${Date.now().toString(36)}${out.length}`, name: f.name, mime: f.type, base64: bytesToBase64(bytes) });
        } else {
          const p = parseFile(f.name, bytes);
          out.push({ type: "file", id: `f${Date.now().toString(36)}${out.length}`, name: f.name, mime: p.mime, text: p.text, summary: p.summary });
        }
      } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    }
    setAtts((a) => [...a, ...out]);
  };

  const send = async (override?: string) => {
    const body = (override ?? text).trim();
    if (busy || (!body && !atts.length)) return;
    const r = connection.forRequest();
    if (!r.connection) { setError("Set up a connection first (Settings → Connections)."); return; }
    const now = Date.now();
    const user: AssistantMessage = { id: crypto.randomUUID(), role: "user", text: body, reasoning: "", attachments: atts, steps: [], rounds: [], results: [], createdAt: now };
    const base = chat ?? AssistantChat.parse({ id: crypto.randomUUID(), createdAt: now, updatedAt: now });
    const withUser = { ...base, messages: [...base.messages, user], updatedAt: now };
    setChat(withUser); setText(""); setAtts([]); setError("");
    await saveChat(svc.store, withUser);
    st.setActiveId(withUser.id);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLive({ id: "live", role: "assistant", text: "", reasoning: "", attachments: [], steps: [], rounds: [], results: [], createdAt: now });
    try {
      const done = await runAssistant({ core: svc.core, store: svc.store, chat: withUser, main: r.connection, connections: r.connections, signal: ctrl.signal, onUpdate: setLive });
      setChat(done);
      if (done.messages.at(-1)?.results.some((x) => x.type === "created")) onChanged();
    } finally {
      setLive(null); abort.current = null;
      void st.reload();
      void loadSettings(svc.store).then(setSettings);
    }
  };

  const decide = async (m: AssistantMessage, i: number, next: AssistantResult) => {
    if (!chat) return;
    const out = await updateResult(svc.store, chat.id, m.id, i, next);
    if (out) setChat(out);
  };
  const act = async (m: AssistantMessage, i: number, what: "apply" | "discard" | "undo" | "restore") => {
    const r = m.results[i]!;
    try {
      if (r.type === "change") {
        if (what === "discard") return void decide(m, i, { ...r, status: "discarded" });
        const res = await applyChange(svc.store, r, () => crypto.randomUUID());
        await decide(m, i, { ...r, status: res === "applied" ? "applied" : "stale" });
        if (res === "applied") onChanged();
      } else if (r.type === "trash") {
        if (what === "discard") return void decide(m, i, { ...r, status: "discarded" });
        await applyTrash(svc.store, r.kind, r.itemId);
        await decide(m, i, { ...r, status: "applied" }); onChanged();
      } else if (r.type === "new") {
        if (what === "discard") return void decide(m, i, { ...r, status: "discarded" });
        const made = await createItem(svc.store, r.kind, r.data as Record<string, unknown>, () => crypto.randomUUID());
        await decide(m, i, { ...r, status: "applied", itemId: made.id }); onChanged();
      } else if (r.type === "created") {
        if (what === "undo") { await undoCreate(svc.store, r.kind, r.itemId); await decide(m, i, { ...r, undone: true }); }
        else if (what === "restore" && r.kind !== "tracker") { await svc.store.restoreFromTrash(r.kind as never, r.itemId); await decide(m, i, { ...r, undone: false }); }
        onChanged();
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const applyAll = async (m: AssistantMessage) => {
    for (let i = 0; i < m.results.length; i++) {
      const r = m.results[i]!;
      if ((r.type === "change" || r.type === "new") && r.status === "waiting") await act((await loadChat(svc.store, chat!.id))!.messages.find((x) => x.id === m.id)!, i, "apply");
    }
  };

  const messages = chat?.messages ?? [];
  const empty = messages.length === 0 && !live;

  return (
    <section className="asst" data-testid="assistant">
      <header className="asst-top">{lead}<span className="asst-title">{chat && messages.length ? chat.title : ""}</span>
        {chat && messages.length > 0 && <IconButton label="Delete this chat" onClick={() => { void deleteChat(svc.store, chat.id).then(() => { st.setActiveId(null); void st.reload(); }); }}><Icon name="trash" size={15} /></IconButton>}
      </header>
      <div className="asst-scroll" ref={scroller}>
        {empty ? (
          <div className="asst-col asst-hello">
            <span className="asst-pill">Knows <b>your library</b> · {library.length} items</span>
            <h1>{greeting()}{userName ? `, ${userName}` : ""}</h1>
            <Composer {...{ text, setText, atts, setAtts, busy, onSend: () => void send(), onStop: () => abort.current?.abort(), onPick: () => setPicking(true), onFiles: () => fileInput.current?.click(), onDropFiles: (f: File[]) => void addFiles(f), modelName, autoFocus: true }} />
            {error && <p className="asst-error" role="alert">{error}</p>}
            <div className="asst-qs-h">Quick start</div>
            <div className="asst-qs">
              {QUICK.map((q) => (
                <button key={q.title} type="button" className="asst-q" onClick={() => { setText(q.prompt); if (q.title === "Build a Kit") setPicking(true); }}>
                  <span className="asst-qi" aria-hidden>{q.icon}</span><b>{q.title}</b><span>{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="asst-col asst-msgs" data-testid="assistant-messages">
            {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} m={m} /> : (
              <Reply key={m.id} m={m} onAct={(i, w) => void act(m, i, w)} onApplyAll={() => void applyAll(m)} onOpen={onOpenItem} onStartKit={onStartKit} />
            )))}
            {live && <Reply m={live} live onAct={() => {}} onApplyAll={() => {}} onOpen={onOpenItem} onStartKit={onStartKit} />}
          </div>
        )}
      </div>
      {!empty && (
        <div className="asst-bottom"><div className="asst-col">
          {error && <p className="asst-error" role="alert">{error}</p>}
          <Composer {...{ text, setText, atts, setAtts, busy, onSend: () => void send(), onStop: () => abort.current?.abort(), onPick: () => setPicking(true), onFiles: () => fileInput.current?.click(), onDropFiles: (f: File[]) => void addFiles(f), modelName }} />
        </div></div>
      )}
      <input ref={fileInput} type="file" multiple hidden accept=".json,.jsonl,.md,.markdown,.txt,.csv,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif" data-testid="assistant-file"
        onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void addFiles(fs); }} />
      {picking && <ContextPicker library={library} picked={atts.filter((a): a is Extract<AssistantAttachment, { type: "item" }> => a.type === "item")}
        onClose={() => setPicking(false)}
        onAdd={(items) => { setAtts((a) => [...a.filter((x) => x.type !== "item"), ...items]); setPicking(false); }} />}
    </section>
  );
}

function Composer({ text, setText, atts, setAtts, busy, onSend, onStop, onPick, onFiles, onDropFiles, modelName, autoFocus = false }: {
  text: string; setText: (t: string) => void; atts: AssistantAttachment[]; setAtts: (f: (a: AssistantAttachment[]) => AssistantAttachment[]) => void;
  busy: boolean; onSend: () => void; onStop: () => void; onPick: () => void; onFiles: () => void; onDropFiles: (f: File[]) => void; modelName: string; autoFocus?: boolean;
}) {
  return (
    <div className="asst-comp" data-testid="assistant-composer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) onDropFiles([...e.dataTransfer.files]); }}>
      {atts.length > 0 && (
        <div className="asst-ctx">
          {atts.map((a) => (
            <span key={a.id} className={`asst-chip${a.type === "image" ? " img" : ""}`}>
              {a.type === "image" ? <img src={`data:${a.mime};base64,${a.base64}`} alt="" /> : <span className="asst-k" aria-hidden>{a.type === "item" ? KIND_MARK[a.kind] : "📄"}</span>}
              <span className="asst-chip-name">{a.name}</span>
              <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAtts((x) => x.filter((y) => y.id !== a.id))}>✕</button>
            </span>
          ))}
        </div>
      )}
      <textarea rows={2} value={text} autoFocus={autoFocus} placeholder="What shall we make? A character, a Kit, a lorebook…" aria-label="Message to the Assistant"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } if (e.key === "@" && !text.trim()) { e.preventDefault(); onPick(); } }}
        onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); onDropFiles(fs); } }} />
      <div className="asst-crow">
        <button type="button" className="asst-tool" onClick={onPick} data-testid="assistant-add-context"><span aria-hidden>＠</span> Add context</button>
        <button type="button" className="asst-tool" onClick={onFiles} title="Attach a file or an image (.json, .jsonl, .md, .txt, PNG cards, pictures)" aria-label="Attach"><Icon name="link" size={14} /></button>
        <span className="grow" />
        <span className="asst-model" title="Change in Customize → Model">{modelName}</span>
        {busy ? <button type="button" className="asst-send stop" aria-label="Stop" onClick={onStop}>■</button>
          : <button type="button" className="asst-send" aria-label="Send" onClick={onSend} disabled={!text.trim() && !atts.length} data-testid="assistant-send">↑</button>}
      </div>
    </div>
  );
}

function UserBubble({ m }: { m: AssistantMessage }) {
  return (
    <div className="asst-me">
      {m.attachments.length > 0 && <div className="asst-ctx end">{m.attachments.map((a) => (
        a.type === "image" ? <img key={a.id} className="asst-thumb" src={`data:${a.mime};base64,${a.base64}`} alt={a.name} />
          : <span key={a.id} className="asst-chip"><span className="asst-k" aria-hidden>{a.type === "item" ? KIND_MARK[a.kind] : "📄"}</span><span className="asst-chip-name">{a.name}</span></span>
      ))}</div>}
      {m.text && <div className="asst-b">{m.text}</div>}
    </div>
  );
}

function Reply({ m, live = false, onAct, onApplyAll, onOpen, onStartKit }: {
  m: AssistantMessage; live?: boolean; onAct: (i: number, what: "apply" | "discard" | "undo" | "restore") => void; onApplyAll: () => void;
  onOpen: (kind: AssistantKind, id: string) => void; onStartKit: (id: string) => void;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [thinkOpen, setThinkOpen] = useState(false);
  const waiting = m.results.filter((r) => (r.type === "change" || r.type === "new") && r.status === "waiting").length;
  const last = m.steps.at(-1);
  const stepLine = live && last ? `${last.label}${last.label === "…" ? "" : "…"}` : m.steps.length === 1 ? m.steps[0]!.label : `${m.steps.length} steps`;
  return (
    <div className="asst-ai" data-testid="assistant-reply">
      <span className={`asst-orb${live ? " live" : ""}`} aria-hidden>✦</span>
      <div className="asst-body">
        {m.reasoning && <button type="button" className="asst-quiet" onClick={() => setThinkOpen(!thinkOpen)} aria-expanded={thinkOpen}>{live && !m.text && !m.steps.length ? "Thinking…" : "Thought"} ›</button>}
        {thinkOpen && <div className="asst-qlist">{m.reasoning}</div>}
        {m.steps.length > 0 && <button type="button" className="asst-quiet" onClick={() => setStepsOpen(!stepsOpen)} aria-expanded={stepsOpen} data-testid="assistant-steps">{stepLine} ›</button>}
        {stepsOpen && <div className="asst-qlist">{m.steps.map((s, i) => <div key={i} className={s.error ? "bad" : ""}>{s.label}</div>)}</div>}
        {m.text ? <div className="asst-text"><MessageText text={m.text} /></div> : live && !m.steps.length && !m.reasoning ? <div className="asst-typing" aria-label="Thinking"><i /><i /><i /></div> : null}
        {m.results.map((r, i) => <ResultCard key={i} r={r} onAct={(w) => onAct(i, w)} onOpen={onOpen} onStartKit={onStartKit} />)}
        {waiting > 1 && !live && <div className="asst-decide"><Button small variant="prominent" onClick={onApplyAll} data-testid="assistant-apply-all">Apply all {waiting}</Button></div>}
        {m.error && <p className="asst-error" role="alert">{m.error === "Stopped" || /abort/i.test(m.error) ? "Stopped." : m.error}</p>}
        {!live && m.used && (m.used.tokensIn || m.used.model) && <div className="asst-used">{m.used.model}{m.used.tokensIn ? ` · ${((m.used.tokensIn + (m.used.tokensOut ?? 0)) / 1000).toFixed(1)}k tokens` : ""}{m.used.cost ? ` · $${m.used.cost.toFixed(3)}` : ""}</div>}
      </div>
    </div>
  );
}

function ResultCard({ r, onAct, onOpen, onStartKit }: { r: AssistantResult; onAct: (w: "apply" | "discard" | "undo" | "restore") => void; onOpen: (kind: AssistantKind, id: string) => void; onStartKit: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (r.type === "memory") return <div className="asst-memory">✓ Remembered: {r.text}</div>;
  const kindMark = KIND_MARK[r.kind];
  if (r.type === "created") return (
    <div className="asst-res" data-testid="assistant-result">
      <div className="asst-res-line"><span className="asst-res-ic">{kindMark}</span>
        <span className="asst-res-t"><b>{r.name}</b><small className={r.undone ? "" : "ok"}>{KIND_ONE[r.kind]} · {r.undone ? (r.kind === "tracker" ? "removed" : "moved to the Trash") : "created"}{r.detail && !r.undone ? ` · ${r.detail}` : ""}</small></span>
        {!r.undone && r.kind === "kit" && <button className="asst-lnk" onClick={() => onStartKit(r.itemId)}>Start a story</button>}
        {!r.undone && <button className="asst-lnk" onClick={() => onOpen(r.kind, r.itemId)}>Open</button>}
        {!r.undone ? <button className="asst-lnk" onClick={() => onAct("undo")}>Undo</button> : r.kind !== "tracker" && <button className="asst-lnk" onClick={() => onAct("restore")}>Restore</button>}
      </div>
    </div>
  );
  if (r.type === "trash") return (
    <div className="asst-res" data-testid="assistant-result">
      <div className="asst-res-line"><span className="asst-res-ic">{kindMark}</span>
        <span className="asst-res-t"><b>Move “{r.name}” to the Trash?</b><small className={r.status === "waiting" ? "wait" : ""}>{r.status === "waiting" ? r.reason || "Proposed" : r.status === "applied" ? "Moved to the Trash" : "Kept"}</small></span>
        {r.status === "waiting" && <><button className="asst-lnk" onClick={() => onAct("apply")}>Move</button><button className="asst-lnk" onClick={() => onAct("discard")}>Keep</button></>}
      </div>
    </div>
  );
  if (r.type === "new") return (
    <div className="asst-res" data-testid="assistant-result">
      <div className="asst-res-line"><span className="asst-res-ic">{kindMark}</span>
        <span className="asst-res-t"><b>{r.name}</b><small className={r.status === "waiting" ? "wait" : r.status === "applied" ? "ok" : ""}>New {KIND_ONE[r.kind].toLowerCase()} · {r.status === "waiting" ? "waiting for you" : r.status === "applied" ? "saved" : "discarded"}</small></span>
        <button className="asst-lnk" onClick={() => setOpen(!open)}>{open ? "Hide" : "See it"}</button>
        {r.status === "waiting" && <><button className="asst-lnk strong" onClick={() => onAct("apply")}>Save</button><button className="asst-lnk" onClick={() => onAct("discard")}>Discard</button></>}
        {r.status === "applied" && r.itemId && <button className="asst-lnk" onClick={() => onOpen(r.kind, r.itemId!)}>Open</button>}
      </div>
      {open && <pre className="asst-res-more asst-pre">{JSON.stringify(r.data, null, 2)}</pre>}
    </div>
  );
  // change
  const label = { waiting: "Change waiting for you", applied: "Applied · undo from its History", discarded: "Discarded", stale: "It changed since — ask again" }[r.status];
  const fields = Object.keys(r.after).filter((k) => k !== "picture");
  return (
    <div className={`asst-res${open ? " open" : ""}`} data-testid="assistant-result">
      <div className="asst-res-line"><span className="asst-res-ic">✎</span>
        <span className="asst-res-t"><b>{r.name}{fields.length ? ` · ${fields.join(", ")}` : " · picture"}</b><small className={r.status === "waiting" ? "wait" : r.status === "applied" ? "ok" : ""}>{r.summary && r.status === "waiting" ? r.summary : label}</small></span>
        <button className="asst-lnk" onClick={() => setOpen(!open)} data-testid="assistant-see-change">{open ? "Hide" : "See change"}</button>
        {r.status === "waiting" && <><button className="asst-lnk strong" onClick={() => onAct("apply")} data-testid="assistant-apply">Apply</button><button className="asst-lnk" onClick={() => onAct("discard")}>Discard</button></>}
        {r.status === "applied" && <button className="asst-lnk" onClick={() => onOpen(r.kind, r.itemId)}>Open</button>}
      </div>
      {open && <div className="asst-res-more">{Object.keys(r.after).map((k) => <ChangeField key={k} name={k} before={r.before[k]} after={r.after[k]} />)}</div>}
    </div>
  );
}

const asText = (v: unknown) => (typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v, null, 1));
function ChangeField({ name, before, after }: { name: string; before: unknown; after: unknown }) {
  if (name === "picture") {
    const p = typeof after === "string" ? (JSON.parse(after) as { mime: string; base64: string }) : null;
    return <div className="asst-fld"><span className="asst-fld-n">Picture</span>{p && <img className="asst-thumb" src={`data:${p.mime};base64,${p.base64}`} alt="" />}</div>;
  }
  const parts = diffWords(asText(before), asText(after));
  return (
    <div className="asst-fld"><span className="asst-fld-n">{name}</span>
      <div className="asst-diff">{parts.map((p, i) => p.kind === "same" ? <span key={i}>{p.text}</span> : <span key={i}>{p.before && <del>{p.before}</del>}{p.before && p.after ? " " : ""}{p.after && <ins>{p.after}</ins>}</span>)}</div>
    </div>
  );
}

// ------------------------------------------------------------------ Add context

function ContextPicker({ library, picked, onAdd, onClose }: {
  library: LibraryEntry[]; picked: Array<Extract<AssistantAttachment, { type: "item" }>>;
  onAdd: (items: Array<Extract<AssistantAttachment, { type: "item" }>>) => void; onClose: () => void;
}) {
  const [kind, setKind] = useState<AssistantReadKind>("character");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Map<string, LibraryEntry>>(() => new Map(picked.map((p) => [`${p.kind}:${p.id}`, { kind: p.kind, id: p.id, name: p.name, line: "" }])));
  const counts = useMemo(() => { const c: Partial<Record<AssistantReadKind, number>> = {}; for (const e of library) c[e.kind] = (c[e.kind] ?? 0) + 1; return c; }, [library]);
  const words = q.trim().toLowerCase();
  const shown = library.filter((e) => (words ? `${e.name} ${e.line}`.toLowerCase().includes(words) : e.kind === kind)).slice(0, 300);
  const toggle = (e: LibraryEntry) => setSel((s) => { const n = new Map(s); const k = `${e.kind}:${e.id}`; if (n.has(k)) n.delete(k); else n.set(k, e); return n; });
  return (
    <Modal title="Add context" onClose={onClose} className="modal-wide asst-picker" testId="assistant-picker"
      head={<label className="search-box asst-picker-search"><Icon name="search" size={13} /><input autoFocus aria-label="Search everything" placeholder="Search everything" value={q} onChange={(e) => setQ(e.target.value)} /></label>}>
      <div className="asst-picker-body">
        {!words && <div className="asst-kinds" role="tablist">{KIND_ORDER.filter((k) => counts[k]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}><span>{KIND_LABEL[k]}</span><small>{counts[k]}</small></button>
        ))}</div>}
        <div className="asst-grid">
          {shown.length === 0 && <p className="hint">{words ? "Nothing matches." : "Nothing here yet."}</p>}
          {shown.map((e) => {
            const on = sel.has(`${e.kind}:${e.id}`);
            return (
              <button key={`${e.kind}:${e.id}`} type="button" className={`asst-card${on ? " sel" : ""}`} aria-pressed={on} onClick={() => toggle(e)}>
                {e.avatar ? <img src={`data:${e.avatar.mime};base64,${e.avatar.base64}`} alt="" /> : <span className="asst-card-ph" aria-hidden>{KIND_MARK[e.kind]}</span>}
                <span className="asst-card-t"><b>{e.name}</b><small>{words ? `${KIND_ONE[e.kind]} · ` : ""}{e.line}</small></span>
                <span className="asst-ck" aria-hidden>{on ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="modal-foot">
        <span className="grow asst-picked">{sel.size ? [...sel.values()].map((e) => <span key={`${e.kind}:${e.id}`} className="asst-chip"><span className="asst-k">{KIND_MARK[e.kind]}</span><span className="asst-chip-name">{e.name}</span></span>) : <span className="hint">Pick characters, lorebooks, narrators… The Assistant reads only what it needs from them.</span>}</span>
        <Button variant="plain" onClick={onClose}>Cancel</Button>
        <Button variant="prominent" disabled={!sel.size} data-testid="assistant-picker-add"
          onClick={() => onAdd([...sel.values()].map((e) => ({ type: "item", kind: e.kind, id: e.id, name: e.name })))}>Add {sel.size || ""}</Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Customize

export function AssistantCustomize({ svc, connection, onClose }: { svc: AppServices; connection: ConnectionState; onClose: () => void }) {
  const [s, setS] = useState<AssistantSettings | null>(null);
  const [tab, setTab] = useState<"rules" | "memory" | "instructions" | "model">("rules");
  const [newRule, setNewRule] = useState("");
  const [newMem, setNewMem] = useState("");
  useEffect(() => { void loadSettings(svc.store).then(setS); }, [svc]);
  const put = (patch: Partial<AssistantSettings>) => { if (!s) return; const n = { ...s, ...patch }; setS(n); void saveSettings(svc.store, n); };
  if (!s) return null;
  return (
    <Modal title="Customize the Assistant" onClose={onClose} className="modal-wide asst-cust" testId="assistant-customize-sheet">
      <Segmented tabs label="Customize" value={tab} onChange={setTab}
        options={[{ value: "rules", label: "Rules" }, { value: "memory", label: "Memory" }, { value: "instructions", label: "Instructions" }, { value: "model", label: "Model" }]} />
      {tab === "rules" && <div className="asst-pane">
        <p className="hint">Always followed, in every chat. Switch one off to pause it.</p>
        {s.rules.map((r) => (
          <div key={r.id} className="asst-lrow">
            <input value={r.text} aria-label="Rule" onChange={(e) => put({ rules: s.rules.map((x) => (x.id === r.id ? { ...x, text: e.target.value } : x)) })} />
            <Switch label="Rule on" checked={r.on} onChange={(on) => put({ rules: s.rules.map((x) => (x.id === r.id ? { ...x, on } : x)) })} />
            <IconButton label="Delete rule" onClick={() => put({ rules: s.rules.filter((x) => x.id !== r.id) })}><Icon name="trash" size={14} /></IconButton>
          </div>
        ))}
        <form className="asst-lrow add" onSubmit={(e) => { e.preventDefault(); if (newRule.trim()) { put({ rules: [...s.rules, { id: crypto.randomUUID(), text: newRule.trim(), on: true }] }); setNewRule(""); } }}>
          <input value={newRule} placeholder="Add a rule — e.g. “Cards in English, descriptions in prose”" aria-label="New rule" onChange={(e) => setNewRule(e.target.value)} data-testid="assistant-new-rule" />
          <Button small type="submit" disabled={!newRule.trim()}>Add</Button>
        </form>
      </div>}
      {tab === "memory" && <div className="asst-pane">
        <div className="asst-lrow plain"><span className="grow hint">What it remembers about you and your worlds, across chats. It adds things when you say “remember…”.</span><span className="hint">Memory</span><Switch label="Memory on" checked={s.memoryOn} onChange={(memoryOn) => put({ memoryOn })} /></div>
        {s.memory.length === 0 && <p className="hint">Nothing yet.</p>}
        {s.memory.map((m) => (
          <div key={m.id} className="asst-lrow">
            <span className="grow"><input value={m.text} aria-label="Memory" onChange={(e) => put({ memory: s.memory.map((x) => (x.id === m.id ? { ...x, text: e.target.value } : x)) })} />
              <small className="hint">{m.from ? `from “${m.from}” · ` : ""}{new Date(m.at).toLocaleDateString()}</small></span>
            <IconButton label="Forget" onClick={() => put({ memory: s.memory.filter((x) => x.id !== m.id) })}><Icon name="trash" size={14} /></IconButton>
          </div>
        ))}
        <form className="asst-lrow add" onSubmit={(e) => { e.preventDefault(); if (newMem.trim()) { put({ memory: [...s.memory, { id: crypto.randomUUID(), text: newMem.trim(), from: "", at: Date.now() }] }); setNewMem(""); } }}>
          <input value={newMem} placeholder="Add something it should know" aria-label="New memory" onChange={(e) => setNewMem(e.target.value)} />
          <Button small type="submit" disabled={!newMem.trim()}>Add</Button>
        </form>
      </div>}
      {tab === "instructions" && <div className="asst-pane">
        <p className="hint">Its main instructions. The app adds the tools, the guides, your rules and memory around this text.</p>
        <textarea className="asst-instr" rows={16} value={s.instructions || DEFAULT_INSTRUCTIONS} onChange={(e) => put({ instructions: e.target.value === DEFAULT_INSTRUCTIONS ? "" : e.target.value })} aria-label="Instructions" />
        <div className="asst-lrow plain"><Button small onClick={() => put({ instructions: "" })} disabled={!s.instructions}>Reset to default</Button><span className="grow" /><span className="hint">~{Math.round((s.instructions || DEFAULT_INSTRUCTIONS).length / 3.6)} tokens</span></div>
      </div>}
      {tab === "model" && <div className="asst-pane asst-model-pane">
        <label><span className="asst-lbl">Connection</span>
          <select value={s.connectionId ?? ""} onChange={(e) => put({ connectionId: e.target.value || null })}>
            <option value="">The one your stories use</option>
            {connection.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="hint">A strong model is worth it here. It needs a model that can use tools; for pictures, one that sees images.</span></label>
        <label><span className="asst-lbl">Model</span><input value={s.model} placeholder="The connection's model" onChange={(e) => put({ model: e.target.value.trim() })} /></label>
        <div className="asst-two">
          <label><span className="asst-lbl">Thinking</span>
            <select value={s.effort} onChange={(e) => put({ effort: e.target.value as AssistantSettings["effort"] })}><option value="">Model's default</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label><span className="asst-lbl">Temperature</span><input type="number" min={0} max={2} step={0.1} value={s.temperature} onChange={(e) => put({ temperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })} /></label>
        </div>
        <div className="asst-two">
          <label><span className="asst-lbl">Steps per message</span><input type="number" min={1} max={100} value={s.maxSteps} onChange={(e) => put({ maxSteps: Math.min(100, Math.max(1, Math.round(Number(e.target.value) || 1))) })} /></label>
          <label><span className="asst-lbl">New items</span>
            <select value={s.saveNew ? "now" : "ask"} onChange={(e) => put({ saveNew: e.target.value === "now" })}><option value="now">Save right away (Undo on the card)</option><option value="ask">Ask me first</option></select></label>
        </div>
      </div>}
    </Modal>
  );
}
