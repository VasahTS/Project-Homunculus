// Homunculus 2 — the Assistant mode: its sidebar, the conversation, Add context and Customize (D-062).
// Author: CLAUDE, 2026-11-01. Draft: docs/drafts/library-assistant/index.html (round 3); plan: docs/UI-PLAN.md.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AssistantChat, type AssistantAttachment, type AssistantKind, type AssistantMessage, type AssistantReadKind, type AssistantResult, type AssistantSettings, type Avatar } from "@homunculus/schemas";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { compactChat, connectionFor, deleteChat, listChats, loadChat, loadSettings, needsCompaction, resolveFor, runAssistant, saveChat, saveSettings, toolsFor, toTurns, updateResult, type ChatRow } from "../assistant/engine.ts";
import { libraryCounts } from "../assistant/tools.ts";
import { AssistantDetails } from "./AssistantDetails.tsx";
import { saveExport } from "../files.ts";
import type { RichTurn } from "@homunculus/core";
import { applyChange, applyTrash, createItem, undoCreate } from "../assistant/tools.ts";
import { parseFile } from "../assistant/files.ts";
import { diffWords } from "../diff.ts";
import { readFileBytes } from "../files.ts";
import { bytesToBase64 } from "@homunculus/st-cards";
import { Button, Icon, IconButton } from "./kit.tsx";
import { AssistantCustomizePage, ModelRow } from "./AssistantCustomize.tsx";
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
  const [activeId, setActiveIdRaw] = useState<string | null>(null);
  const [page, setPageRaw] = useState<"chat" | "customize">("chat");
  const [custTab, setCustTab] = useState<"assistants" | "presets" | "limits" | "usage">("assistants");
  const setPage = useCallback((p: "chat" | "customize", tab?: "assistants" | "presets" | "limits" | "usage") => { if (tab) setCustTab(tab); setPageRaw(p); }, []);
  const setActiveId = useCallback((id: string | null) => { setActiveIdRaw(id); setPageRaw("chat"); }, []);
  const reload = useCallback(async () => { if (svc) setChats(await listChats(svc.store)); }, [svc]);
  useEffect(() => { void reload(); }, [reload]);
  return { chats, activeId, setActiveId, reload, page, setPage, custTab, svc };
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

export function AssistantSidebar({ st, onMode, status }: { st: AssistantState; onMode: (m: AppMode) => void; status: string }) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  // search reads the chats' messages too (Flint: "search past transcripts"); a line around the first match is shown
  const [hits, setHits] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const w = q.trim().toLowerCase();
    if (!w || !st.svc) { setHits(new Map()); return; }
    let live = true;
    const t = setTimeout(() => void (async () => {
      const out = new Map<string, string>();
      for (const c of st.chats) {
        const full = await loadChat(st.svc!.store, c.id);
        for (const m of full?.messages ?? []) {
          const i = m.text.toLowerCase().indexOf(w);
          if (i >= 0) { out.set(c.id, `…${m.text.slice(Math.max(0, i - 30), i + 60).replace(/\s+/g, " ")}…`); break; }
        }
      }
      if (live) setHits(out);
    })(), 200);
    return () => { live = false; clearTimeout(t); };
  }, [q, st.chats, st.svc]);
  const shown = q.trim() ? st.chats.filter((c) => `${c.title} ${c.summary}`.toLowerCase().includes(q.trim().toLowerCase()) || hits.has(c.id)) : st.chats;
  return (
    <nav className="sidebar glass asst-side" aria-label="Assistant" data-region="sidebar" data-testid="assistant-sidebar">
      <div className="sidebar-brand"><span className="brand">Homunculus</span><span className="status-chip">{status}</span></div>
      <ModeSwitch mode="assistant" onMode={onMode} />
      <ul className="side-list">
        <li><button className={`side-item${st.page === "chat" && !st.activeId ? " on" : ""}`} onClick={() => st.setActiveId(null)} data-testid="assistant-new"><span className="side-icon acc"><Icon name="plus" /></span><span className="side-text"><strong>New chat</strong></span></button></li>
        <li>{searching
          ? <label className="search-box side-search"><Icon name="search" size={13} /><input autoFocus aria-label="Search chats" placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => { if (!q) setSearching(false); }} /></label>
          : <button className="side-item" onClick={() => setSearching(true)}><span className="side-icon"><Icon name="search" /></span><span className="side-text"><strong>Search</strong></span></button>}</li>
        <li><button className={`side-item${st.page === "customize" ? " on" : ""}`} onClick={() => st.setPage("customize")} data-testid="assistant-customize"><span className="side-icon"><Icon name="gear" /></span><span className="side-text"><strong>Customize</strong></span></button></li>
      </ul>
      <div className="side-head"><span>Recents</span></div>
      <ul className="side-list" data-testid="assistant-chats">
        {shown.length === 0 && <li className="hint side-empty">{q ? "No chat matches." : "Your chats will show here."}</li>}
        {shown.map((c) => (
          <li key={c.id}><button className={`side-item${st.page === "chat" && st.activeId === c.id ? " on" : ""}`} onClick={() => st.setActiveId(c.id)}>
            <span className="side-text"><strong>{c.title}</strong><span>{(q.trim() && hits.get(c.id)) || c.summary || new Date(c.updatedAt).toLocaleDateString()}</span></span>
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
  const [compacting, setCompacting] = useState(false);
  const [details, setDetailsRaw] = useState<boolean>(() => { try { return localStorage.getItem("homunculus.assistant.details") !== "off"; } catch { return true; } });
  const setDetails = (on: boolean) => { setDetailsRaw(on); try { localStorage.setItem("homunculus.assistant.details", on ? "on" : "off"); } catch { /* private window */ } };
  const [viewing, setViewing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
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

  // who answers, what it knows, which model: the chat's own picks (before the first message, kept here)
  const [draft, setDraft] = useState<Picks>({ assistantId: "", presetId: "" });
  const picks: Picks = chat ? { assistantId: chat.assistantId, presetId: chat.presetId, connectionId: chat.connectionId, model: chat.model, contextLength: chat.contextLength } : draft;
  const setPicks = (p: Partial<Picks>) => {
    if (chat) { const next = { ...chat, ...p }; setChat(next); void saveChat(svc.store, next); }
    else setDraft((d) => ({ ...d, ...p }));
  };
  const resolved = settings ? resolveFor(picks, settings) : null;
  const r0 = connection.forRequest();
  const effective = resolved && r0.connection ? connectionFor(picks, resolved.assistant, r0.connection, r0.connections) : null;
  const lastUsed = [...(chat?.messages ?? [])].reverse().find((m) => m.role === "assistant" && m.used)?.used;
  const profileOf = (id: string | null | undefined) => (id ? connection.byId.get(id) : undefined);
  const modelLabel = effective?.model || profileOf(picks.connectionId ?? resolved?.assistant.connectionId ?? connection.defaultId)?.name || "No connection";
  const modelFrom = `${profileOf(picks.connectionId ?? resolved?.assistant.connectionId ?? connection.defaultId)?.name ?? "No connection"} · ${picks.connectionId !== undefined || picks.model ? "this chat" : resolved?.assistant.model || resolved?.assistant.connectionId ? `${resolved?.assistant.name}'s model` : "the stories' connection"}`;
  const picksBar = settings && resolved ? (
    <PicksBar settings={settings} picks={picks} setPicks={setPicks} svc={svc} connection={connection}
      model={effective?.model || (() => { const id = picks.connectionId ?? resolved.assistant.connectionId ?? connection.defaultId; return (id ? connection.byId.get(id)?.name : undefined) ?? "No connection"; })()}
      used={lastUsed} chat={chat} onCustomize={() => st.setPage("customize")} />
  ) : null;

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

  /** Runs a reply for a chat whose last message is the user's (send, edit and resend, regenerate). */
  const runFrom = async (withUser: AssistantChat) => {
    const r = connection.forRequest();
    if (!r.connection) { setError("Set up a connection first (Settings → Connections)."); return; }
    setChat(withUser); setError("");
    await saveChat(svc.store, withUser);
    st.setActiveId(withUser.id);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLive({ id: "live", role: "assistant", text: "", reasoning: "", attachments: [], steps: [], rounds: [], results: [], createdAt: Date.now() });
    try {
      let ready = withUser;
      // the context is getting full: sum up the older messages first (Details → Context)
      if (needsCompaction(ready)) {
        setCompacting(true);
        ready = await compactChat({ core: svc.core, store: svc.store, chat: ready, main: r.connection, connections: r.connections, signal: ctrl.signal }).catch(() => ready);
        setCompacting(false);
      }
      const done = await runAssistant({ core: svc.core, store: svc.store, chat: ready, main: r.connection, connections: r.connections, signal: ctrl.signal, onUpdate: setLive });
      setChat(done);
      if (done.messages.at(-1)?.results.some((x) => x.type === "created")) onChanged();
    } finally {
      setLive(null); abort.current = null; setCompacting(false);
      void st.reload();
      void loadSettings(svc.store).then(setSettings);
    }
  };

  const send = async (override?: string) => {
    const body = (override ?? text).trim();
    if (busy || (!body && !atts.length)) return;
    if (!connection.forRequest().connection) { setError("Set up a connection first (Settings → Connections)."); return; }
    const now = Date.now();
    const user: AssistantMessage = { id: crypto.randomUUID(), role: "user", text: body, reasoning: "", attachments: atts, steps: [], rounds: [], results: [], createdAt: now };
    const base = chat ?? AssistantChat.parse({ id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...draft });
    setText(""); setAtts([]);
    await runFrom({ ...base, messages: [...base.messages, user], updatedAt: now });
  };
  /** Writes the last reply again (results it made stay; undo them on their cards if needed). */
  const regenerate = () => {
    if (!chat || busy) return;
    const i = chat.messages.map((m) => m.role).lastIndexOf("user");
    if (i >= 0) void runFrom({ ...chat, messages: chat.messages.slice(0, i + 1), updatedAt: Date.now() });
  };
  /** Changes one of the user's messages and answers again from there (later messages go). */
  const editAndResend = (m: AssistantMessage, newText: string) => {
    if (!chat || busy) return;
    const i = chat.messages.findIndex((x) => x.id === m.id);
    if (i < 0) return;
    void runFrom({ ...chat, messages: [...chat.messages.slice(0, i), { ...m, text: newText.trim() }], ...(chat.compact && chat.messages.findIndex((x) => x.id === chat.compact!.uptoId) >= i ? { compact: undefined } : {}), updatedAt: Date.now() });
  };
  const compactNow = async () => {
    const r = connection.forRequest();
    if (!chat || !r.connection || busy) return;
    setCompacting(true);
    try { setChat(await compactChat({ core: svc.core, store: svc.store, chat, main: r.connection, connections: r.connections })); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setCompacting(false); }
  };
  const updateChat = (c: AssistantChat) => { setChat(c); void saveChat(svc.store, c).then(() => st.reload()); };

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
  if (st.page === "customize") return <AssistantCustomizePage key={st.custTab} initialTab={st.custTab} svc={svc} connection={connection} lead={lead} onClose={() => { st.setPage("chat"); void loadSettings(svc.store).then(setSettings); }} />;

  return (
    <div className={`asst-wrap${details ? " with-details" : ""}`}>
    <section className="asst" data-testid="assistant">
      <header className="asst-top">{lead}
        {renaming && chat
          ? <input className="asst-rename" autoFocus defaultValue={chat.title} aria-label="Chat name"
              onBlur={(e) => { setRenaming(false); if (e.target.value.trim()) updateChat({ ...chat, title: e.target.value.trim() }); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(false); }} />
          : <span className="asst-title" onDoubleClick={() => chat && setRenaming(true)}>{chat && messages.length ? chat.title : ""}</span>}
        {chat && messages.length > 0 && <Pop title="Chat" testId="assistant-chat-menu" className="down" label={<Icon name="dots" size={15} />}>
          {(close) => <>
            <button type="button" className="asst-pop-item" onClick={() => { close(); setRenaming(true); }}><span className="asst-pop-emoji">✎</span><span><b>Rename</b></span></button>
            <button type="button" className="asst-pop-item" onClick={() => { close(); void saveExport({ fileName: `${chat.title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) || "assistant-chat"}.md`, mime: "text/markdown", bytes: new TextEncoder().encode(chatMarkdown(chat)) }); }}><span className="asst-pop-emoji">⇩</span><span><b>Export as Markdown</b></span></button>
            <button type="button" className="asst-pop-item danger" onClick={() => { close(); void deleteChat(svc.store, chat.id).then(() => { st.setActiveId(null); void st.reload(); }); }}><span className="asst-pop-emoji">🗑</span><span><b>Delete chat</b></span></button>
          </>}
        </Pop>}
        <button type="button" className={`asst-details-btn${details ? " on" : ""}`} onClick={() => setDetails(!details)} aria-pressed={details} data-testid="assistant-details-toggle"><Icon name="inspector" size={14} /> Details</button>
      </header>
      <div className="asst-scroll" ref={scroller}>
        {empty ? (
          <div className="asst-col asst-hello">
            <span className="asst-pill">Knows <b>your library</b> · {library.length} items</span>
            <h1>{greeting()}{userName ? `, ${userName}` : ""}</h1>
            <Composer {...{ text, setText, atts, setAtts, busy, onSend: () => void send(), onStop: () => abort.current?.abort(), onPick: () => setPicking(true), onFiles: () => fileInput.current?.click(), onDropFiles: (f: File[]) => void addFiles(f), picksBar, autoFocus: true }} />
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
            {chat?.compact && <div className="asst-compacted">Older messages are sent as a summary · <button className="link" onClick={() => setDetails(true)}>Details</button></div>}
            {messages.map((m, i) => (m.role === "user" ? <UserBubble key={m.id} m={m} busy={busy} onEdit={(t) => editAndResend(m, t)} onView={() => setViewing(m.id)} /> : (
              <Reply key={m.id} m={m} onAct={(ri, w) => void act(m, ri, w)} onApplyAll={() => void applyAll(m)} onOpen={onOpenItem} onStartKit={onStartKit}
                emoji={settings?.assistants.find((a) => a.name === m.used?.assistant)?.emoji}
                onRegenerate={i === messages.length - 1 && !busy ? regenerate : undefined} />
            )))}
            {live && <Reply m={live} live onAct={() => {}} onApplyAll={() => {}} onOpen={onOpenItem} onStartKit={onStartKit} emoji={resolved?.assistant.emoji} liveName={resolved?.assistant.name} compacting={compacting} />}
          </div>
        )}
      </div>
      {!empty && (
        <div className="asst-bottom"><div className="asst-col">
          {error && <p className="asst-error" role="alert">{error}</p>}
          <Composer {...{ text, setText, atts, setAtts, busy, onSend: () => void send(), onStop: () => abort.current?.abort(), onPick: () => setPicking(true), onFiles: () => fileInput.current?.click(), onDropFiles: (f: File[]) => void addFiles(f), picksBar }} />
        </div></div>
      )}
      <input ref={fileInput} type="file" multiple hidden accept=".json,.jsonl,.md,.markdown,.txt,.csv,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif" data-testid="assistant-file"
        onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void addFiles(fs); }} />
      {picking && <ContextPicker library={library} picked={atts.filter((a): a is Extract<AssistantAttachment, { type: "item" }> => a.type === "item")}
        onClose={() => setPicking(false)}
        onAdd={(items) => { setAtts((a) => [...a.filter((x) => x.type !== "item"), ...items]); setPicking(false); }} />}
      {viewing && chat && settings && <RequestView chat={chat} messageId={viewing} settings={settings} svc={svc} onClose={() => setViewing(null)} />}
    </section>
    {details && settings && <AssistantDetails chat={chat} live={live} settings={settings} modelName={modelLabel} modelFrom={modelFrom}
      onSettings={(n) => { setSettings(n); void saveSettings(svc.store, n); }} onChat={updateChat} onCompact={() => void compactNow()} compacting={compacting}
      onCustomize={(tab) => st.setPage("customize", tab)} onClose={() => setDetails(false)} />}
    </div>
  );
}

function Composer({ text, setText, atts, setAtts, busy, onSend, onStop, onPick, onFiles, onDropFiles, picksBar, autoFocus = false }: {
  text: string; setText: (t: string) => void; atts: AssistantAttachment[]; setAtts: (f: (a: AssistantAttachment[]) => AssistantAttachment[]) => void;
  busy: boolean; onSend: () => void; onStop: () => void; onPick: () => void; onFiles: () => void; onDropFiles: (f: File[]) => void; picksBar: ReactNode; autoFocus?: boolean;
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
        {picksBar}
        {busy ? <button type="button" className="asst-send stop" aria-label="Stop" onClick={onStop}>■</button>
          : <button type="button" className="asst-send" aria-label="Send" onClick={onSend} disabled={!text.trim() && !atts.length} data-testid="assistant-send">↑</button>}
      </div>
    </div>
  );
}

function UserBubble({ m, busy, onEdit, onView }: { m: AssistantMessage; busy: boolean; onEdit: (t: string) => void; onView: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text);
  return (
    <div className="asst-me">
      {m.attachments.length > 0 && <div className="asst-ctx end">{m.attachments.map((a) => (
        a.type === "image" ? <img key={a.id} className="asst-thumb" src={`data:${a.mime};base64,${a.base64}`} alt={a.name} />
          : <span key={a.id} className="asst-chip"><span className="asst-k" aria-hidden>{a.type === "item" ? KIND_MARK[a.kind] : "📄"}</span><span className="asst-chip-name">{a.name}</span></span>
      ))}</div>}
      {editing ? (
        <div className="asst-edit">
          <textarea value={draft} rows={3} autoFocus aria-label="Edit message" onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setEditing(false); onEdit(draft); } if (e.key === "Escape") setEditing(false); }} />
          <div className="asst-edit-row"><span className="hint">Later messages are replaced by a new answer.</span><span className="grow" />
            <Button small variant="plain" onClick={() => setEditing(false)}>Cancel</Button><Button small variant="prominent" disabled={!draft.trim()} onClick={() => { setEditing(false); onEdit(draft); }}>Send</Button></div>
        </div>
      ) : m.text && <div className="asst-b">{m.text}</div>}
      {!editing && <div className="asst-acts">
        <button type="button" title="Copy" aria-label="Copy" onClick={() => void navigator.clipboard?.writeText(m.text)}><Icon name="link" size={12} /> Copy</button>
        {!busy && <button type="button" onClick={() => { setDraft(m.text); setEditing(true); }} data-testid="assistant-edit"><Icon name="pencil" size={12} /> Edit</button>}
        <button type="button" onClick={onView} title="What the model received for this message"><Icon name="eye" size={12} /> Request</button>
        <span className="asst-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>}
    </div>
  );
}

function Reply({ m, live = false, onAct, onApplyAll, onOpen, onStartKit, onRegenerate, emoji, liveName, compacting = false }: {
  m: AssistantMessage; live?: boolean; onAct: (i: number, what: "apply" | "discard" | "undo" | "restore") => void; onApplyAll: () => void;
  onOpen: (kind: AssistantKind, id: string) => void; onStartKit: (id: string) => void; onRegenerate?: (() => void) | undefined;
  emoji?: string | undefined; liveName?: string | undefined; compacting?: boolean;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [thinkOpen, setThinkOpen] = useState(false);
  const waiting = m.results.filter((r) => (r.type === "change" || r.type === "new") && r.status === "waiting").length;
  const last = m.steps.at(-1);
  const stepLine = live && last ? `${last.label}${last.label === "…" ? "" : "…"}` : m.steps.length === 1 ? m.steps[0]!.label : `${m.steps.length} steps`;
  return (
    <div className="asst-ai" data-testid="assistant-reply">
      <span className={`asst-orb${live ? " live" : ""}`} aria-hidden>{emoji && emoji !== "✦" ? emoji : "✦"}</span>
      <div className="asst-body">
        <div className="asst-meta"><b>{m.used?.assistant ?? liveName ?? "Assistant"}</b>{m.used?.model && <span>{m.used.model}</span>}<span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>{compacting && <span className="asst-busy">compacting older messages…</span>}</div>
        {m.reasoning && <button type="button" className="asst-quiet" onClick={() => setThinkOpen(!thinkOpen)} aria-expanded={thinkOpen}>{live && !m.text && !m.steps.length ? "Thinking…" : m.used?.thinkMs ? `Thought for ${Math.max(1, Math.round(m.used.thinkMs / 1000))} s` : "Thought"} ›</button>}
        {thinkOpen && <div className="asst-qlist">{m.reasoning}</div>}
        {m.steps.length > 0 && <button type="button" className="asst-quiet" onClick={() => setStepsOpen(!stepsOpen)} aria-expanded={stepsOpen} data-testid="assistant-steps">{stepLine} ›</button>}
        {stepsOpen && <div className="asst-qlist">{m.steps.map((s, i) => <div key={i} className={s.error ? "bad" : ""}>{s.label}</div>)}</div>}
        {m.text ? <div className="asst-text"><MessageText text={m.text} /></div> : live && !m.steps.length && !m.reasoning ? <div className="asst-typing" aria-label="Thinking"><i /><i /><i /></div> : null}
        {m.results.map((r, i) => <ResultCard key={i} r={r} onAct={(w) => onAct(i, w)} onOpen={onOpen} onStartKit={onStartKit} />)}
        {waiting > 1 && !live && <div className="asst-decide"><Button small variant="prominent" onClick={onApplyAll} data-testid="assistant-apply-all">Apply all {waiting}</Button></div>}
        {m.error && <p className="asst-error" role="alert">{m.error === "Stopped" || /abort/i.test(m.error) ? "Stopped." : m.error}</p>}
        {!live && <div className="asst-acts left">
          {m.used && <span className="asst-usage" data-testid="assistant-usage">{usageLine(m)}</span>}
          {m.text && <button type="button" onClick={() => void navigator.clipboard?.writeText(m.text)}><Icon name="link" size={12} /> Copy</button>}
          {onRegenerate && <button type="button" onClick={onRegenerate} data-testid="assistant-regenerate"><Icon name="refresh" size={12} /> Again</button>}
        </div>}
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


// ------------------------------------------------------------------ picks under the message box

interface Picks { assistantId: string; presetId: string; connectionId?: string | null | undefined; model?: string | undefined; contextLength?: number | undefined }
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
const shortModel = (m: string) => m.split("/").pop() ?? m;

/** A small menu that opens above its button and closes on a click outside or Esc. */
function Pop({ label, title, children, testId, className = "" }: { label: ReactNode; title: string; children: (close: () => void) => ReactNode; testId?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className={`asst-pop-wrap ${className}`.trim()} ref={box}>
      <button type="button" className={`asst-pick${open ? " on" : ""}`} title={title} aria-expanded={open} onClick={() => setOpen(!open)} data-testid={testId}>{label}</button>
      {open && <div className="asst-pop" role="dialog" aria-label={title}>{children(() => setOpen(false))}</div>}
    </span>
  );
}

function PicksBar({ settings, picks, setPicks, svc, connection, model, used, chat, onCustomize }: {
  settings: AssistantSettings; picks: Picks; setPicks: (p: Partial<Picks>) => void; svc: AppServices; connection: ConnectionState; model: string;
  used: AssistantMessage["used"] | undefined; chat: AssistantChat | null; onCustomize: () => void;
}) {
  const { assistant, preset } = resolveFor(picks, settings);
  const replies = chat?.messages.filter((m) => m.role === "assistant") ?? [];
  const spent = replies.reduce((a, m) => ({ tokens: a.tokens + (m.used?.tokensIn ?? 0) + (m.used?.tokensOut ?? 0), cost: a.cost + (m.used?.cost ?? 0) }), { tokens: 0, cost: 0 });
  const estimated = !used?.lastPrompt && !!used?.parts;
  const full = used?.lastPrompt ?? (used?.parts ? Object.values(used.parts).reduce((a, b) => a + b, 0) : 0);
  const ctx = picks.contextLength;
  const pct = ctx && full ? Math.min(100, Math.round((full / ctx) * 100)) : null;
  const PART: Record<string, string> = { app: "App rules", assistant: "Assistant", preset: "Preset", tools: "Tools", chat: "This chat (messages, results)" };
  return (
    <span className="asst-picks">
      <Pop title="Assistant" testId="pick-assistant" label={<><span aria-hidden>{assistant.emoji}</span> {assistant.name} <span className="caret">▾</span></>}>
        {(close) => <>
          <div className="asst-pop-h">Who answers</div>
          {settings.assistants.map((a) => (
            <button key={a.id} type="button" className={`asst-pop-item${a.id === assistant.id ? " on" : ""}`} onClick={() => { setPicks({ assistantId: a.id }); close(); }}>
              <span className="asst-pop-emoji">{a.emoji}</span><span><b>{a.name}</b><small>{a.description}</small></span>
            </button>
          ))}
          <button type="button" className="asst-pop-foot" onClick={() => { close(); onCustomize(); }}>Edit assistants…</button>
        </>}
      </Pop>
      <Pop title="Preset" testId="pick-preset" label={<><span aria-hidden>📘</span> {preset?.name ?? "No preset"} <span className="caret">▾</span></>}>
        {(close) => <>
          <div className="asst-pop-h">What it always knows</div>
          {settings.presets.map((p) => (
            <button key={p.id} type="button" className={`asst-pop-item${p.id === preset?.id ? " on" : ""}`} onClick={() => { setPicks({ presetId: p.id }); close(); }}>
              <span className="asst-pop-emoji">📘</span><span><b>{p.name}</b><small>{p.description || `${p.rules.length} rules · ${p.notes.length} notes · ${p.memory.length} memories`}</small></span>
            </button>
          ))}
          <button type="button" className={`asst-pop-item${!preset ? " on" : ""}`} onClick={() => { setPicks({ presetId: "none" }); close(); }}><span className="asst-pop-emoji">∅</span><span><b>No preset</b><small>Only the assistant's own instructions.</small></span></button>
          <button type="button" className="asst-pop-foot" onClick={() => { close(); onCustomize(); }}>Edit presets…</button>
        </>}
      </Pop>
      <Pop title="Model" testId="pick-model" className="wide" label={<>{shortModel(model)} <span className="caret">▾</span></>}>
        {() => <>
          <div className="asst-pop-h">Model for this chat</div>
          <ModelRow svc={svc} connection={connection} connectionId={picks.connectionId ?? null} model={picks.model ?? ""}
            onChange={(connectionId, m) => setPicks({ connectionId, model: m })} onInfo={(m) => setPicks({ contextLength: m.contextLength })} />
          {(picks.connectionId !== undefined || picks.model) && <button type="button" className="asst-pop-foot" onClick={() => setPicks({ connectionId: undefined, model: undefined, contextLength: undefined })}>Use {assistant.name}'s model</button>}
        </>}
      </Pop>
      <Pop title="Context and spending" testId="pick-context" label={<span className="asst-meter">{pct !== null && <span className="asst-ring" style={{ ["--p" as string]: `${pct}%` }} aria-hidden />}{full ? `${estimated ? "~" : ""}${fmtK(full)}` : "—"}{ctx ? ` / ${fmtK(ctx)}` : ""}</span>}>
        {() => <div className="asst-ctxpop">
          <div className="asst-pop-h">What it is using</div>
          <div className="asst-kv"><span>Assistant</span><b>{assistant.emoji} {assistant.name}</b><span>Preset</span><b>{preset?.name ?? "none"}</b><span>Model</span><b>{model}</b></div>
          <div className="asst-pop-h">Last request{full ? ` · ${estimated ? "about " : ""}${fmtK(full)} tokens` : ""}{ctx ? ` · ${pct ?? 0}% of ${fmtK(ctx)}` : ""}</div>
          {used?.parts ? <div className="asst-bars">{Object.entries(used.parts).filter(([, n]) => n > 0).map(([k, n]) => (
            <div key={k} className="asst-bar"><span>{PART[k] ?? k}</span><i style={{ width: `${Math.max(2, Math.round((n / Math.max(1, Object.values(used.parts!).reduce((a, b) => a + b, 0))) * 100))}%` }} /><b>{fmtK(n)}</b></div>
          ))}</div> : <p className="hint">Send a message to see it.</p>}
          {!ctx && <p className="hint">Pick the model with “Browse…” in the model menu to see how full the context is.</p>}
          <div className="asst-pop-h">This chat</div>
          <div className="asst-kv"><span>Replies</span><b>{replies.length}</b><span>Tokens</span><b>{spent.tokens ? fmtK(spent.tokens) : "not reported"}</b><span>Cost</span><b>{spent.cost ? `$${spent.cost.toFixed(3)}` : "not reported"}</b></div>
          <button type="button" className="asst-pop-foot" onClick={onCustomize}>Limits and usage…</button>
        </div>}
      </Pop>
    </span>
  );
}

/** "28 tok/s · 1.2k in · 158 out · $0.002", or what was not reported. */
function usageLine(m: AssistantMessage): string {
  const u = m.used;
  if (!u) return "";
  const parts: string[] = [];
  if (u.tokensOut && u.writeMs) parts.push(`${Math.round(u.tokensOut / (u.writeMs / 1000))} tok/s`);
  parts.push(u.tokensIn || u.tokensOut ? `${fmtK(u.tokensIn ?? 0)} in · ${fmtK(u.tokensOut ?? 0)} out` : "tokens not reported");
  if (u.cost) parts.push(`$${u.cost.toFixed(4)}`);
  if (u.calls && u.calls > 1) parts.push(`${u.calls} calls`);
  return parts.join(" · ");
}

/** The chat as Markdown (Export). */
function chatMarkdown(c: AssistantChat): string {
  const out = [`# ${c.title}`, ""];
  for (const m of c.messages) {
    if (m.role === "user") {
      out.push(`## You — ${new Date(m.createdAt).toLocaleString()}`, "");
      if (m.attachments.length) out.push(`*Attached: ${m.attachments.map((a) => a.name).join(", ")}*`, "");
      out.push(m.text, "");
    } else {
      out.push(`## ${m.used?.assistant ?? "Assistant"}${m.used?.model ? ` (${m.used.model})` : ""}`, "");
      if (m.steps.length) out.push(m.steps.map((s) => `- ${s.label}`).join("\n"), "");
      if (m.text) out.push(m.text, "");
      for (const r of m.results) if (r.type !== "memory") out.push(`> ${r.type === "created" ? "Created" : r.type === "change" ? "Change" : r.type === "trash" ? "Trash proposal" : "New"}: ${r.kind} “${r.name}”${"status" in r ? ` — ${r.status}` : ""}`);
      out.push("");
    }
  }
  return out.join("\n");
}

/** What the model received for one message (rebuilt from the saved chat, pictures left out). Flint: "what the model received". */
function RequestView({ chat, messageId, settings, svc, onClose }: { chat: AssistantChat; messageId: string; settings: AssistantSettings; svc: AppServices; onClose: () => void }) {
  const [counts, setCounts] = useState("…");
  useEffect(() => { void libraryCounts(svc.store).then(setCounts); }, [svc]);
  const i = chat.messages.findIndex((m) => m.id === messageId);
  const turns = toTurns({ ...chat, messages: chat.messages.slice(0, i + 1) }, settings, counts);
  const tools = toolsFor(settings);
  const show = (c: RichTurn["content"]) => (typeof c === "string" ? c : c.map((p) => (p.type === "text" ? p.text : `[image ${p.mime}, ${Math.round(p.base64.length * 0.75 / 1024)} KB]`)).join("\n"));
  return (
    <Modal title="What the model received" onClose={onClose} className="modal-wide asst-request" testId="assistant-request">
      <p className="hint">The request for this message, rebuilt from the chat: {turns.length} messages and {tools.length} tools (~{Math.round(JSON.stringify(turns).length / 3.6).toLocaleString()} tokens before the tools).</p>
      {turns.map((t, k) => (
        <details key={k} className="asst-req-turn" open={k === 0 || k === turns.length - 1}>
          <summary><b>{t.role}</b>{t.toolCalls?.length ? ` · calls ${t.toolCalls.map((c) => c.name).join(", ")}` : ""} <span className="hint">~{Math.round(show(t.content).length / 3.6)} tokens</span></summary>
          <pre>{show(t.content)}{t.toolCalls?.length ? `\n\n${t.toolCalls.map((c) => `→ ${c.name}(${c.arguments})`).join("\n")}` : ""}</pre>
        </details>
      ))}
      <details className="asst-req-turn"><summary><b>tools</b> <span className="hint">{tools.map((t) => t.name).join(", ")}</span></summary><pre>{JSON.stringify(tools, null, 2)}</pre></details>
    </Modal>
  );
}
