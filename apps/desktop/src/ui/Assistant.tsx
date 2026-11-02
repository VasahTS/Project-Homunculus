// Homunculus 2 — the Assistant mode: its sidebar, the conversation, Add context and Customize (D-062).
// Author: CLAUDE, 2026-11-01. Draft: docs/drafts/library-assistant/index.html (round 3); plan: docs/UI-PLAN.md.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AssistantChat, type AssistantAttachment, type AssistantKind, type AssistantMessage, type AssistantReadKind, type AssistantResult, type AssistantSettings, type Avatar } from "@homunculus/schemas";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import { compactChat, connectionFor, deleteChat, listChats, loadChat, loadSettings, needsCompaction, resolveFor, runAssistant, saveChat, saveSettings, toolsFor, toTurns, updateResult, webOn, webSources, type ChatRow } from "../assistant/engine.ts";
import { libraryCounts } from "../assistant/tools.ts";
import { AssistantDetails } from "./AssistantDetails.tsx";
import { saveExport } from "../files.ts";
import type { RichTurn } from "@homunculus/core";
import { applyChange, applyTrash, approveNew, createItem, currentOf, getItem, redoMove, splitRef, undoCreate, undoMove } from "../assistant/tools.ts";
import { DRAFT_BLOCK, GUIDES } from "../assistant/guides.ts";
import { parseFile } from "../assistant/files.ts";
import { diffWords } from "../diff.ts";
import { readFileBytes } from "../files.ts";
import { bytesToBase64 } from "@homunculus/st-cards";
import { Button, Icon, IconButton, type ICONS } from "./kit.tsx";
import { CASCADE, slideIn, useEnter } from "./motion.ts";
import { AssistantCustomizePage } from "./AssistantCustomize.tsx";
import { QuickConnectMenu, type QuickConnectTarget } from "./QuickConnect.tsx";
import type { ConnectionConfig, ModelInfo } from "@homunculus/core";
import { Modal } from "./Vault.tsx";
import { MessageText, openLink } from "./MessageText.tsx";

export type AppMode = "play" | "assistant";

/** A thing of the app the user can add as context (from App's lists). */
export interface LibraryEntry { kind: AssistantReadKind; id: string; name: string; line: string; avatar?: Avatar | undefined }

const KIND_LABEL: Record<AssistantReadKind, string> = { character: "Characters", persona: "Personas", narrator: "Narrators", npc: "NPCs", story: "Stories", kit: "Kits", lorebook: "Lorebooks", tracker: "Trackers", preset: "Presets" };
const KIND_ONE: Record<AssistantReadKind, string> = { character: "Character", persona: "Persona", narrator: "Narrator", npc: "NPC", story: "Story", kit: "Kit", lorebook: "Lorebook", tracker: "Tracker", preset: "Preset" };
// unslop (D-074): one line-icon set instead of geometric glyphs
const KIND_ICON: Record<AssistantReadKind, keyof typeof ICONS> = { character: "characters", persona: "persona", narrator: "scroll", npc: "figure", story: "book", kit: "grid", lorebook: "book", tracker: "trackers", preset: "preset" };
const KindMark = ({ kind }: { kind: AssistantReadKind }) => <Icon name={KIND_ICON[kind]} size={14} />;
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
          {m === "play" ? "Play" : <>Assistant</>}
        </button>
      ))}
    </div>
  );
}

export function AssistantSidebar({ st, onMode, status, onSettings }: { st: AssistantState; onMode: (m: AppMode) => void; status: string; onSettings: () => void }) {
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
  // what is inside arrives one after another when the sidebar appears; the brand and the mode switch stay put (D-072)
  const navRef = useRef<HTMLElement>(null);
  useEnter(navRef, "open", ":scope > :not(.slide-pill):not(.sidebar-brand):not(.mode-switch)", { ...CASCADE, y: 8, stagger: 40, max: 12 });
  const shown = q.trim() ? st.chats.filter((c) => `${c.title} ${c.summary}`.toLowerCase().includes(q.trim().toLowerCase()) || hits.has(c.id)) : st.chats;
  return (
    <nav className="sidebar glass asst-side" aria-label="Assistant" data-region="sidebar" data-testid="assistant-sidebar" ref={navRef}>
      <div className="sidebar-brand"><span className="brand">Homunculus</span>{status && <span className="status-chip">{status}</span>}</div>
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
      {/* D-077: Settings at the bottom, as in Play */}
      <div className="side-bottom">
        <ul className="side-list">
          <li><button className="side-item" onClick={onSettings} data-testid="assistant-settings"><span className="side-icon"><Icon name="gear" /></span><span className="side-text"><strong>Settings</strong></span></button></li>
        </ul>
      </div>
    </nav>
  );
}

// ------------------------------------------------------------------ the view


const QUICK: Array<{ title: string; text: string; prompt: string }> = [
  { title: "Build a Kit", text: "Pick characters and get a Kit with a scenario and an opening where they fit together.", prompt: "Make a Kit with the characters I added: a scenario and an opening where they fit together." },
  { title: "Make a character", text: "From a description or a picture: card, first message and examples.", prompt: "Make a character: " },
  { title: "Write a lorebook", text: "A place, a faction or a whole world, with keywords that trigger well.", prompt: "Write a lorebook about " },
  { title: "Make a narrator", text: "How your stories are told: voice, rules, pacing.", prompt: "Make a narrator that " },
];

export function AssistantView({ svc, st, connection, library, userName, lead, onOpenItem, onStartKit, onChanged, listModels, onManageConnections }: {
  svc: AppServices; st: AssistantState; connection: ConnectionState; library: LibraryEntry[]; userName: string; lead: ReactNode;
  /** For the model switch under the message box (Quick Connection, D-077). */
  listModels: (config: ConnectionConfig, signal: AbortSignal) => Promise<ModelInfo[]>; onManageConnections: () => void;
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
  const runningId = useRef<string | null>(null);
  const selectedId = useRef(st.activeId);
  selectedId.current = st.activeId;
  const busy = live !== null;

  useEffect(() => { void loadSettings(svc.store).then(setSettings); }, [svc]);
  useEffect(() => {
    setError("");
    if (st.activeId === runningId.current && runningId.current) return;
    let current = true;
    // keep the chat on screen while it reloads (no empty flash after a reply); another chat clears it first
    setChat((c) => (c && c.id === st.activeId ? c : null));
    if (st.activeId) void loadChat(svc.store, st.activeId).then((c) => { if (current) setChat(c ?? null); });
    return () => { current = false; };
  }, [svc, st.activeId, busy]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [chat, live]);

  // who answers, what it knows, which model: the chat's own picks (before the first message, kept here)
  const [draft, setDraft] = useState<Picks>({ assistantId: "", presetId: "" });
  const picks: Picks = chat ? { assistantId: chat.assistantId, presetId: chat.presetId, connectionId: chat.connectionId, model: chat.model, contextLength: chat.contextLength, draftFirst: chat.draftFirst, webSearch: chat.webSearch } : draft;
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
  const pickedModel = settings && resolved ? (effective?.model || (() => { const id = picks.connectionId ?? resolved.assistant.connectionId ?? connection.defaultId; return (id ? connection.byId.get(id)?.name : undefined) ?? "No connection"; })()) : "";
  const picksBar = settings && resolved ? (
    <PicksBar settings={settings} picks={picks} setPicks={setPicks} svc={svc} connection={connection}
      model={pickedModel} used={lastUsed} chat={chat} onCustomize={() => st.setPage("customize")} />
  ) : null;
  const modelProfile = connection.byId.get(picks.connectionId ?? resolved?.assistant.connectionId ?? connection.defaultId ?? "");
  const qcTarget: QuickConnectTarget = {
    current: modelProfile,
    currentModel: effective?.model,
    footnote: "Used in this Assistant chat only; your saved connections don't change.",
    useProfile: (p) => setPicks({ connectionId: p.id, model: undefined, contextLength: undefined }),
    useModel: (p, model, info) => setPicks({ connectionId: p.id, model, contextLength: info?.contextLength }),
  };
  const summary = settings && resolved ? (
    <PicksSummary settings={settings} picks={picks}
      modelSwitch={<QuickConnectMenu svc={svc} c={connection} listModels={listModels} target={qcTarget} onManage={onManageConnections}
        trigger={(open, toggle) => (
          <button type="button" className={`asst-model-btn${open ? " on" : ""}`} data-testid="assistant-model" aria-expanded={open} title="Switch the model for this chat" onClick={toggle}>
            {shortModel(pickedModel)}
          </button>
        )} />} />
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
    runningId.current = withUser.id;
    selectedId.current = withUser.id;
    st.setActiveId(withUser.id);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLive({ id: "live", role: "assistant", text: "", reasoning: "", attachments: [], steps: [], rounds: [], results: [], createdAt: Date.now() });
    try {
      await saveChat(svc.store, withUser);
      let ready = withUser;
      // the context is getting full: sum up the older messages first (Details → Context)
      if (needsCompaction(ready)) {
        setCompacting(true);
        ready = await compactChat({ core: svc.core, store: svc.store, chat: ready, main: r.connection, connections: r.connections, signal: ctrl.signal }).catch(() => ready);
        setCompacting(false);
      }
      const done = await runAssistant({ core: svc.core, store: svc.store, chat: ready, main: r.connection, connections: r.connections, signal: ctrl.signal, onUpdate: setLive });
      if (selectedId.current === done.id) setChat(done);
      if (done.messages.at(-1)?.results.some((x) => x.type === "created")) onChanged();
    } finally {
      setLive(null); abort.current = null; runningId.current = null; setCompacting(false);
      void st.reload();
      void loadSettings(svc.store).then(setSettings);
    }
  };

  const send = async (override?: string) => {
    const body = (override ?? text).trim();
    if (busy || (chat?.id ?? null) !== st.activeId || (!body && !atts.length)) return;
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
  /** "Save to library" under a draft block: new item, or the listed changes to the item its "id" names (the user asked). */
  const saveDraft = async (m: AssistantMessage, kind: AssistantKind, data: Record<string, unknown>) => {
    if (!chat) return;
    const newId = () => crypto.randomUUID();
    let result: AssistantResult;
    const ref = typeof data.id === "string" ? splitRef(data.id) : null;
    if (ref) {
      const { id: _id, ...changes } = data;
      const item = await getItem(svc.store, ref.kind, ref.id);
      if (!item) throw new Error(`“${data.id}” is not in your library any more.`);
      const change = { type: "change" as const, id: newId(), kind, itemId: ref.id, name: String(item.name ?? kind), summary: "Saved from a draft", before: currentOf(item, kind, changes), after: changes, status: "waiting" as const };
      const res = await applyChange(svc.store, change, newId);
      result = { ...change, status: res === "applied" ? "applied" : "stale" };
    } else {
      const made = await createItem(svc.store, kind, data, newId);
      result = { type: "created", kind, itemId: made.id, name: made.name, detail: `${made.detail} · from a draft`, undone: false };
    }
    const fresh = (await loadChat(svc.store, chat.id)) ?? chat;
    const next = { ...fresh, messages: fresh.messages.map((x) => (x.id === m.id ? { ...x, results: [...x.results, result] } : x)), updatedAt: Date.now() };
    setChat(next); await saveChat(svc.store, next); onChanged();
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
        const made = await approveNew(svc.store, r, () => crypto.randomUUID());
        await decide(m, i, { ...r, status: "applied", itemId: made.id }); onChanged();
      } else if (r.type === "moved") {
        if (what === "undo") { await undoMove(svc.store, r); await decide(m, i, { ...r, undone: true }); }
        else await decide(m, i, { ...(await redoMove(svc.store, r, () => crypto.randomUUID())), undone: false });
        onChanged();
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
            <button type="button" className="asst-pop-item" onClick={() => { close(); setRenaming(true); }}><span className="asst-pop-emoji"><Icon name="pencil" size={14} /></span><span><b>Rename</b></span></button>
            <button type="button" className="asst-pop-item" onClick={() => { close(); void saveExport({ fileName: `${chat.title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) || "assistant-chat"}.md`, mime: "text/markdown", bytes: new TextEncoder().encode(chatMarkdown(chat)) }); }}><span className="asst-pop-emoji"><Icon name="download" size={14} /></span><span><b>Export as Markdown</b></span></button>
            <button type="button" className="asst-pop-item danger" onClick={() => { close(); void deleteChat(svc.store, chat.id).then(() => { st.setActiveId(null); void st.reload(); }); }}><span className="asst-pop-emoji"><Icon name="trash" size={14} /></span><span><b>Delete chat</b></span></button>
          </>}
        </Pop>}
        <button type="button" className={`asst-details-btn${details ? " on" : ""}`} onClick={() => setDetails(!details)} aria-pressed={details} data-testid="assistant-details-toggle"><Icon name="inspector" size={14} /> Details</button>
      </header>
      <div className="asst-scroll" ref={scroller}>
        {empty ? (
          <div className="asst-col asst-hello">
            {/* D-077, like Flint: the start screen is a title and suggestions; the message box sits at the bottom, where it stays in a chat */}
            <h1>Assistant</h1>
            <p className="asst-knows">Makes and fixes characters, lorebooks, Kits and narrators. Reads your library when it needs to · {library.length} items</p>
            <div className="asst-qs">
              {QUICK.map((q) => (
                <button key={q.title} type="button" className="asst-q" onClick={() => { setText(q.prompt); if (q.title === "Build a Kit") setPicking(true); }}>
                  <b>{q.title}</b><span>{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="asst-col asst-msgs" data-testid="assistant-messages">
            {chat?.compact && <div className="asst-compacted">Older messages are sent as a summary · <button className="link" onClick={() => setDetails(true)}>Details</button></div>}
            {messages.map((m, i) => (m.role === "user" ? <UserBubble key={m.id} m={m} busy={busy} onEdit={(t) => editAndResend(m, t)} onView={() => setViewing(m.id)} /> : (
              <Reply key={m.id} m={m} onSaveDraft={(kind, data) => saveDraft(m, kind, data)} onAct={(ri, w) => void act(m, ri, w)} onApplyAll={() => void applyAll(m)} onOpen={onOpenItem} onStartKit={onStartKit}
                emoji={settings?.assistants.find((a) => a.name === m.used?.assistant)?.emoji}
                onRegenerate={i === messages.length - 1 && !busy ? regenerate : undefined} />
            )))}
            {live && runningId.current === st.activeId && <Reply m={live} live onAct={() => {}} onApplyAll={() => {}} onOpen={onOpenItem} onStartKit={onStartKit} emoji={resolved?.assistant.emoji} liveName={resolved?.assistant.name} compacting={compacting} />}
          </div>
        )}
      </div>
      <div className="asst-bottom"><div className="asst-col">
        {error && <p className="asst-error" role="alert">{error}</p>}
        <Composer {...{ text, setText, atts, setAtts, busy, onSend: () => void send(), onStop: () => abort.current?.abort(), onPick: () => setPicking(true), onFiles: () => fileInput.current?.click(), onDropFiles: (f: File[]) => void addFiles(f), picksBar, autoFocus: empty }} />
        {summary}
      </div></div>
      <input ref={fileInput} type="file" multiple hidden accept=".json,.jsonl,.md,.markdown,.txt,.csv,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif" data-testid="assistant-file"
        onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void addFiles(fs); }} />
      {picking && <ContextPicker library={library} picked={atts.filter((a): a is Extract<AssistantAttachment, { type: "item" }> => a.type === "item")}
        onClose={() => setPicking(false)}
        onAdd={(items) => { setAtts((a) => [...a.filter((x) => x.type !== "item"), ...items]); setPicking(false); }} />}
      {viewing && chat && settings && <RequestView chat={chat} messageId={viewing} settings={settings} svc={svc} onClose={() => setViewing(null)} />}
    </section>
    {details && settings && <AssistantDetails chat={chat} live={runningId.current === st.activeId ? live : null} settings={settings} modelName={modelLabel} modelFrom={modelFrom}
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
              {a.type === "image" ? <img src={`data:${a.mime};base64,${a.base64}`} alt="" /> : <span className="asst-k" aria-hidden>{a.type === "item" ? <KindMark kind={a.kind} /> : <Icon name="file" size={14} />}</span>}
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
        <Pop title="Add" testId="assistant-plus" className="up-left" icon label={<Icon name="plus" size={16} />}>
          {(close) => <>
            <button type="button" className="asst-pop-item" data-testid="assistant-add-context" onClick={() => { close(); onPick(); }}>
              <span className="asst-pop-emoji"><Icon name="book" size={14} /></span><span><b>Add context…</b><small>Characters, lorebooks, narrators from your library (or type @)</small></span>
            </button>
            <button type="button" className="asst-pop-item" onClick={() => { close(); onFiles(); }} aria-label="Attach">
              <span className="asst-pop-emoji"><Icon name="paperclip" size={14} /></span><span><b>Attach a file…</b><small>.json, .jsonl, .md, .txt, PNG cards, pictures</small></span>
            </button>
          </>}
        </Pop>
        {picksBar}
        {busy ? <button type="button" className="asst-send stop" aria-label="Stop" onClick={onStop}>■</button>
          : <button type="button" className="asst-send" aria-label="Send" onClick={onSend} disabled={!text.trim() && !atts.length} data-testid="assistant-send"><Icon name="send-up" size={16} /></button>}
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
          : <span key={a.id} className="asst-chip"><span className="asst-k" aria-hidden>{a.type === "item" ? <KindMark kind={a.kind} /> : <Icon name="file" size={14} />}</span><span className="asst-chip-name">{a.name}</span></span>
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

function Reply({ m, live = false, onAct, onApplyAll, onOpen, onStartKit, onRegenerate, emoji, liveName, compacting = false, onSaveDraft }: {
  onSaveDraft?: ((kind: AssistantKind, data: Record<string, unknown>) => Promise<void>) | undefined;
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
        {m.text ? <ReplyText text={m.text} live={live} results={m.results} onSaveDraft={onSaveDraft} /> : live && !m.steps.length && !m.reasoning ? <div className="asst-typing" aria-label="Thinking"><i /><i /><i /></div> : null}
        {!live && <WebSourcesRow steps={m.steps} />}
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
  if (r.type === "moved") return (
    <div className={`asst-res${open ? " open" : ""}`} data-testid="assistant-result">
      <div className="asst-res-line"><span className="asst-res-ic"><Icon name="folder" size={14} /></span>
        <span className="asst-res-t"><b>{r.folder ? r.folder.split("/").join(" › ") : "Out of folders"}</b>
          <small className={r.undone ? "" : "ok"}>{r.undone ? "Put back where they were" : `${r.items.length} moved here${r.made.length ? ` · ${r.made.length} new folder${r.made.length > 1 ? "s" : ""}` : ""}`}</small></span>
        <button className="asst-lnk" onClick={() => setOpen(!open)}>{open ? "Hide" : "See items"}</button>
        <button className="asst-lnk" onClick={() => onAct(r.undone ? "restore" : "undo")}>{r.undone ? "Redo" : "Undo"}</button>
      </div>
      {open && <div className="asst-res-more asst-moved">{r.items.map((i) => (
        <button key={`${i.kind}:${i.itemId}`} type="button" className="asst-chip" onClick={() => onOpen(i.kind as AssistantKind, i.itemId)}><span className="asst-k" aria-hidden><KindMark kind={i.kind} /></span><span className="asst-chip-name">{i.name}</span></button>
      ))}</div>}
    </div>
  );
  const kindMark = <KindMark kind={r.kind} />;
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
      <div className="asst-res-line"><span className="asst-res-ic"><Icon name="pencil" size={14} /></span>
        <span className="asst-res-t"><b>{r.name}{fields.length ? ` · ${fields.map((k) => (k === "variants" ? "versions" : k)).join(", ")}` : " · picture"}</b><small className={r.status === "waiting" ? "wait" : r.status === "applied" ? "ok" : ""}>{r.summary && r.status === "waiting" ? r.summary : label}</small></span>
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
  if ((name === "variants" || name === "entries") && after && typeof after === "object") return <OpsField name={name} before={before} after={after} />;
  const parts = diffWords(asText(before), asText(after));
  return (
    <div className="asst-fld"><span className="asst-fld-n">{name}</span>
      <div className="asst-diff">{parts.map((p, i) => p.kind === "same" ? <span key={i}>{p.text}</span> : <span key={i}>{p.before && <del>{p.before}</del>}{p.before && p.after ? " " : ""}{p.after && <ins>{p.after}</ins>}</span>)}</div>
    </div>
  );
}

/** A change to a list inside an item (a character's versions, a lorebook's entries): what is added, changed, removed. */
function OpsField({ name, before, after }: { name: string; before: unknown; after: unknown }) {
  type O = Record<string, unknown>;
  const isO = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
  const what = name === "variants" ? "version" : "entry";
  const titleOf = (x: O) => String(x.label ?? x.title ?? x.id ?? "");
  const was = (Array.isArray(before) ? before.filter(isO) : []);
  const find = (x: O) => was.find((b) => (x.id && b.id === x.id) || (titleOf(x) && titleOf(b).toLowerCase() === titleOf(x).toLowerCase()));
  const ops: O = Array.isArray(after) ? { update: after.filter(isO) } : isO(after) ? after : {};
  const rows: Array<{ sign: string; title: string; fields: Array<[string, unknown, unknown]> }> = [];
  for (const a of Array.isArray(ops.add) ? ops.add.filter(isO) : []) rows.push({ sign: "+", title: titleOf(a), fields: Object.entries(a).filter(([k]) => k !== "label" && k !== "title" && k !== "id").map(([k, v]) => [k, undefined, v]) });
  for (const u of Array.isArray(ops.update) ? ops.update.filter(isO) : []) {
    const b = find(u);
    rows.push({ sign: b ? "~" : "+", title: titleOf(u) || titleOf(b ?? {}), fields: Object.entries(u).filter(([k]) => k !== "label" && k !== "title" && k !== "id").map(([k, v]) => [k, b?.[k], v]) });
  }
  for (const r of Array.isArray(ops.remove) ? ops.remove : []) rows.push({ sign: "−", title: titleOf(find({ id: r, label: r, title: r }) ?? { label: r }), fields: [] });
  return (
    <div className="asst-fld"><span className="asst-fld-n">{name === "variants" ? "Versions" : "Entries"}</span>
      <div className="asst-ops">{rows.map((r, i) => (
        <div key={i} className="asst-op"><b><span className={`asst-op-s${r.sign === "−" ? " rm" : ""}`}>{r.sign}</span> {r.title || `(new ${what})`}<small>{r.sign === "+" ? ` new ${what}` : r.sign === "−" ? ` removed` : ""}</small></b>
          {r.fields.map(([k, b, a]) => <ChangeField key={k} name={k} before={b} after={a} />)}
        </div>
      ))}</div>
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
                {e.avatar ? <img src={`data:${e.avatar.mime};base64,${e.avatar.base64}`} alt="" /> : <span className="asst-card-ph" aria-hidden><KindMark kind={e.kind} /></span>}
                <span className="asst-card-t"><b>{e.name}</b><small>{words ? `${KIND_ONE[e.kind]} · ` : ""}{e.line}</small></span>
                <span className="asst-ck" aria-hidden>{on ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="modal-foot">
        <span className="grow asst-picked">{sel.size ? [...sel.values()].map((e) => <span key={`${e.kind}:${e.id}`} className="asst-chip"><span className="asst-k"><KindMark kind={e.kind} /></span><span className="asst-chip-name">{e.name}</span></span>) : <span className="hint">Pick characters, lorebooks, narrators… The Assistant reads only what it needs from them.</span>}</span>
        <Button variant="plain" onClick={onClose}>Cancel</Button>
        <Button variant="prominent" disabled={!sel.size} data-testid="assistant-picker-add"
          onClick={() => onAdd([...sel.values()].map((e) => ({ type: "item", kind: e.kind, id: e.id, name: e.name })))}>Add {sel.size || ""}</Button>
      </div>
    </Modal>
  );
}


// ------------------------------------------------------------------ picks under the message box

interface Picks { assistantId: string; presetId: string; connectionId?: string | null | undefined; model?: string | undefined; contextLength?: number | undefined; draftFirst?: boolean | undefined; webSearch?: boolean | undefined }
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
const shortModel = (m: string) => m.split("/").pop() ?? m;

/** A small menu that opens above its button and closes on a click outside or Esc. */
function Pop({ label, title, children, testId, className = "", icon = false }: { label: ReactNode; title: string; children: (close: () => void) => ReactNode; testId?: string; className?: string; icon?: boolean }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ down: boolean; max: number }>({ down: false, max: 480 });
  const box = useRef<HTMLSpanElement>(null);
  const toggle = () => {
    if (!open && box.current) {
      // open toward the side with more room, never taller than that room (D-077: the assistant list was cut off)
      const r = box.current.getBoundingClientRect();
      const above = r.top - 16, below = window.innerHeight - r.bottom - 16;
      const down = below > above;
      setPlace({ down, max: Math.max(160, Math.min(560, down ? below : above)) });
    }
    setOpen(!open);
  };
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className={`asst-pop-wrap ${className}${open && place.down ? " open-down" : ""}`.trim()} ref={box}>
      <button type="button" className={`asst-pick${icon ? " icon" : ""}${open ? " on" : ""}`} title={title} aria-label={icon ? title : undefined} aria-expanded={open} onClick={toggle} data-testid={testId}>{label}</button>
      {open && <div className="asst-pop" role="dialog" aria-label={title} style={{ maxHeight: place.max }}>{children(() => setOpen(false))}</div>}
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
  const webOn = picks.webSearch ?? !settings.toolsOff.includes("web");
  return (
    <span className="asst-picks">
      {/* unslop + Flint (D-076): one Options button instead of a row of pickers; what is chosen shows under the box */}
      <Pop title="Options" testId="assistant-options" className="up-left" icon
        label={<Icon name="sliders" size={16} />}>
        {(close) => <OptionsPanel {...{ settings, picks, setPicks, svc, connection, assistant, preset, webOn, model, close, onCustomize }} />}
      </Pop>
      <span className="grow" />
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

/** Options (D-076, Flint-style): a short list; Assistant, Preset and Model open their choices in place, ‹ goes back. */
function OptionsPanel({ settings, picks, setPicks, svc, connection, assistant, preset, webOn, model, close, onCustomize }: {
  settings: AssistantSettings; picks: Picks; setPicks: (p: Partial<Picks>) => void; svc: AppServices; connection: ConnectionState;
  assistant: ReturnType<typeof resolveFor>["assistant"]; preset: ReturnType<typeof resolveFor>["preset"]; webOn: boolean; model: string; close: () => void; onCustomize: () => void;
}) {
  const [sub, setSub] = useState<null | "assistant" | "preset">(null);
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (body.current) slideIn([body.current], sub ? 1 : -1, 12); }, [sub]);
  const back = (title: string) => (
    <button type="button" className="asst-opt-back" onClick={() => setSub(null)}><Icon name="back" size={14} /> {title}</button>
  );
  const Row = ({ id, label, value }: { id: "assistant" | "preset"; label: string; value: string }) => (
    <button type="button" className="asst-opt-row" data-testid={`pick-${id}`} onClick={() => setSub(id)}>
      <b>{label}</b><span className="asst-opt-val">{value}</span><Icon name="chevron" size={14} />
    </button>
  );
  return (
    <div className="asst-opts" ref={body}>
      {sub === null && <>
        <Row id="assistant" label="Assistant" value={assistant.name} />
        <Row id="preset" label="Preset" value={preset?.name ?? "No preset"} />
        <div className="asst-opt-sep" />
        <label className="asst-opt-row">
          <b>Draft first</b><span className="asst-opt-val" />
          <button type="button" role="switch" aria-checked={!!picks.draftFirst} aria-pressed={!!picks.draftFirst} aria-label="Draft first" data-testid="pick-draft"
            title="Drafts show here; nothing is saved until you press Save under one"
            className={`switch${picks.draftFirst ? " on" : ""}`} onClick={() => setPicks({ draftFirst: !picks.draftFirst })}><span /></button>
        </label>
        {/* D-067, as in Flint: on or off per chat; a chat nobody switched follows Details → Tools */}
        <label className="asst-opt-row">
          <b>Search the web</b><span className="asst-opt-val" />
          <button type="button" role="switch" aria-checked={webOn} aria-pressed={webOn} aria-label="Search the web for this chat" data-testid="pick-web"
            title={`Web search (DuckDuckGo) is ${webOn ? "on" : "off"} for this chat — click to turn it ${webOn ? "off" : "on"}`}
            className={`switch${webOn ? " on" : ""}`} onClick={() => setPicks({ webSearch: !webOn })}><span /></button>
        </label>
        <button type="button" className="asst-pop-foot" onClick={() => { close(); onCustomize(); }}>Edit assistants and presets…</button>
      </>}
      {sub === "assistant" && <>
        {back("Who answers")}
        <div role="radiogroup" aria-label="Assistant" className="asst-opt-list">
          {settings.assistants.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={a.id === assistant.id} className={`asst-pop-item${a.id === assistant.id ? " on" : ""}`} onClick={() => { setPicks({ assistantId: a.id }); setSub(null); }}>
              <span className="asst-pop-emoji">{a.emoji}</span><span><b>{a.name}</b><small>{a.description}</small></span>
            </button>
          ))}
        </div>
      </>}
      {sub === "preset" && <>
        {back("What it always knows")}
        <div role="radiogroup" aria-label="Preset" className="asst-opt-list">
          {settings.presets.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={p.id === preset?.id} className={`asst-pop-item${p.id === preset?.id ? " on" : ""}`} onClick={() => { setPicks({ presetId: p.id }); setSub(null); }}>
              <span className="asst-pop-emoji"><Icon name="preset" size={14} /></span><span><b>{p.name}</b><small>{p.description || `${p.rules.length} rules · ${p.notes.length} notes · ${p.memory.length} memories`}</small></span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={!preset} className={`asst-pop-item${!preset ? " on" : ""}`} onClick={() => { setPicks({ presetId: "none" }); setSub(null); }}><span className="asst-pop-emoji"><Icon name="none" size={14} /></span><span><b>No preset</b><small>Only the assistant's own instructions.</small></span></button>
        </div>
      </>}
    </div>
  );
}

/** The quiet line under the message box: who answers, the preset, the model, and what is on (D-076). */
function PicksSummary({ settings, picks, modelSwitch }: { settings: AssistantSettings; picks: Picks; modelSwitch: ReactNode }) {
  const { assistant, preset } = resolveFor(picks, settings);
  const webOn = picks.webSearch ?? !settings.toolsOff.includes("web");
  return (
    <div className="asst-under" data-testid="assistant-summary">
      <span>{assistant.name}</span>
      {preset && <span>{preset.name}</span>}
      {picks.draftFirst && <span>Drafts</span>}
      {webOn && <span>Web</span>}
      {modelSwitch}
    </div>
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
      for (const r of m.results) if (r.type === "moved") out.push(`> Moved to ${r.folder || "no folder"}: ${r.items.map((i) => i.name).join(", ")}${r.undone ? " — undone" : ""}`);
      else if (r.type !== "memory") out.push(`> ${r.type === "created" ? "Created" : r.type === "change" ? "Change" : r.type === "trash" ? "Trash proposal" : "New"}: ${r.kind} “${r.name}”${"status" in r ? ` — ${r.status}` : ""}`);
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
  const tools = toolsFor(settings, chat.draftFirst, webOn(chat, settings));
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

// ------------------------------------------------------------------ drafts in replies ("Draft first")

const KIND_NAME: Record<AssistantKind, string> = { character: "Character", lorebook: "Lorebook", tracker: "Tracker", kit: "Kit", narrator: "Narrator" };

/** A reply's text with its draft blocks drawn as draft cards (Save to library, Copy, Show JSON). */
/** Flint's sources row (D-067): site letters + "N read · M found"; open = the list of pages. */
const TONES = ["#1f2937", "#24292f", "#334155", "#3f3f46", "#1e3a5f", "#3b2f4a"];
const siteOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const toneOf = (host: string) => { let h = 0; for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) | 0; return TONES[Math.abs(h) % TONES.length]; };
function WebSourcesRow({ steps }: { steps: AssistantMessage["steps"] }) {
  const [open, setOpen] = useState(false);
  const { sources, read, found } = useMemo(() => webSources(steps), [steps]);
  if (!sources.length) return null;
  const sites: string[] = [];
  for (const s of sources) { const h = siteOf(s.url); if (!sites.includes(h)) sites.push(h); if (sites.length === 4) break; }
  const label = read === 0 ? `${found} source${found === 1 ? "" : "s"}` : found === 0 ? `${read} read` : `${read} read · ${found} found`;
  return (
    <div className="asst-sources">
      <button type="button" className="asst-sources-pill" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="assistant-sources">
        <span className="asst-site-tiles" aria-hidden>{sites.map((h) => <span key={h} className="asst-site" style={{ background: toneOf(h) }}>{(h[0] ?? "?").toUpperCase()}</span>)}</span>
        <span>{label}</span><span className={`caret${open ? " open" : ""}`} aria-hidden>›</span>
      </button>
      {open && <ul className="asst-sources-list">{sources.map((s) => (
        <li key={s.url}>
          <a href={s.url} title={s.url} onClick={(e) => { e.preventDefault(); void openLink(s.url); }}>{s.title || siteOf(s.url)}</a>
          <span className="asst-src-host">{siteOf(s.url)}</span>
        </li>
      ))}</ul>}
    </div>
  );
}

function ReplyText({ text, live, results, onSaveDraft }: { text: string; live: boolean; results: AssistantResult[]; onSaveDraft?: ((kind: AssistantKind, data: Record<string, unknown>) => Promise<void>) | undefined }) {
  const parts: Array<{ md: string } | { kind: AssistantKind; json: string; closed: boolean }> = [];
  let at = 0;
  for (const m of text.matchAll(DRAFT_BLOCK)) {
    if (m.index! > at) parts.push({ md: text.slice(at, m.index) });
    parts.push({ kind: m[1] as AssistantKind, json: m[2]!, closed: true });
    at = m.index! + m[0].length;
  }
  const rest = text.slice(at);
  // a draft block still being written: show it as a draft that is not ready yet
  const open = /```homunculus-(character|lorebook|tracker|kit|narrator)[^\n]*\n([\s\S]*)$/.exec(rest);
  if (open) { if (open.index) parts.push({ md: rest.slice(0, open.index) }); parts.push({ kind: open[1] as AssistantKind, json: open[2]!, closed: false }); }
  else if (rest) parts.push({ md: rest });
  return <div className="asst-text">{parts.map((p, i) => ("md" in p ? (p.md.trim() ? <MessageText key={i} text={p.md} /> : null)
    : <DraftCard key={i} kind={p.kind} json={p.json} ready={p.closed && !(live && i === parts.length - 1 && !p.closed)} results={results} onSave={onSaveDraft} />))}</div>;
}

function DraftCard({ kind, json, ready, results, onSave }: { kind: AssistantKind; json: string; ready: boolean; results: AssistantResult[]; onSave?: ((kind: AssistantKind, data: Record<string, unknown>) => Promise<void>) | undefined }) {
  const [showJson, setShowJson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  let data: Record<string, unknown> | null = null;
  try { const v = JSON.parse(json) as unknown; if (v && typeof v === "object" && !Array.isArray(v)) data = v as Record<string, unknown>; } catch { /* still being written, or broken */ }
  const name = typeof data?.name === "string" ? data.name : typeof data?.id === "string" ? String(data.id) : "Draft";
  const revising = typeof data?.id === "string";
  const saved = results.some((r) => (r.type === "created" && r.kind === kind && r.name === name && r.detail.includes("from a draft")) || (r.type === "change" && r.summary === "Saved from a draft" && r.kind === kind && r.status === "applied" && revising));
  const fields = data ? Object.entries(data).filter(([k]) => k !== "id" && k !== "name" && GUIDES[kind]?.fields.includes(k)) : [];
  return (
    <div className={`asst-draft${ready ? "" : " writing"}`} data-testid="assistant-draft">
      <div className="asst-draft-h"><span className="asst-res-ic"><KindMark kind={kind} /></span>
        <span className="asst-res-t"><b>{name}</b><small>{ready ? `${KIND_NAME[kind]} draft${revising ? " · changes to an item in your library" : ""}` : "Writing the draft…"}</small></span>
        {ready && <button type="button" className="asst-lnk" onClick={() => void navigator.clipboard?.writeText(json.trim())}>Copy</button>}
        {ready && <button type="button" className="asst-lnk" onClick={() => setShowJson(!showJson)}>{showJson ? "Preview" : "JSON"}</button>}
        {ready && data && onSave && <button type="button" className="asst-lnk strong" disabled={busy} data-testid="assistant-save-draft"
          onClick={() => { setBusy(true); setErr(""); void onSave(kind, data!).catch((e) => setErr(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false)); }}>
          {busy ? "Saving…" : saved ? (revising ? "Apply again" : "Save again") : revising ? "Apply to library" : "Save to library"}</button>}
      </div>
      {showJson || !data ? <pre className="asst-draft-json">{json}</pre> : (
        <div className="asst-draft-body">{fields.map(([k, v]) => <DraftField key={k} name={k} value={v} />)}</div>
      )}
      {ready && !data && <p className="asst-error">This draft is not valid JSON — ask for it again.</p>}
      {err && <p className="asst-error" role="alert">{err}</p>}
      {saved && <p className="asst-draft-saved">✓ {revising ? "Applied" : "Saved"} — see the card below.</p>}
    </div>
  );
}

function DraftField({ name, value }: { name: string; value: unknown }) {
  const label = name.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  if (Array.isArray(value)) {
    const items = value.map((v) => (typeof v === "string" ? v : v && typeof v === "object" ? String((v as Record<string, unknown>).title ?? (v as Record<string, unknown>).label ?? (v as Record<string, unknown>).name ?? JSON.stringify(v)) : String(v)));
    return <div className="asst-draft-f"><span>{label} <small>({items.length})</small></span>{typeof value[0] === "string" && name !== "tags" && name !== "keys"
      ? items.map((t, i) => <div key={i} className="asst-draft-v"><MessageText text={t} /></div>)
      : <div className="asst-draft-chips">{items.map((t, i) => <span key={i}>{t}</span>)}</div>}</div>;
  }
  if (value && typeof value === "object") return <div className="asst-draft-f"><span>{label}</span><div className="asst-draft-chips">{Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== "" && v != null).map(([k, v]) => <span key={k}>{k}: {String(v)}</span>)}</div></div>;
  return <div className="asst-draft-f"><span>{label}</span><div className="asst-draft-v"><MessageText text={String(value ?? "")} /></div></div>;
}
