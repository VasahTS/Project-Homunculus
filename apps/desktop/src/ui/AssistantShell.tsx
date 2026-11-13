// Homunculus 2 — the Assistant's state, mode switch and sidebar: what the app needs at start. CLAUDE, 2026-11-13 (D-122).
// Split out of Assistant.tsx so the conversation view (and the engine, tools and guides behind it) loads the first time
// the Assistant is opened, not with the app.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AssistantReadKind, Avatar } from "@homunculus/schemas";
import type { AppServices } from "../core-instance.ts";
import { createAssistantRuntime } from "../assistant/runtime.ts";
import { deleteChat, listChats, loadChat, saveChat, type ChatRow } from "../assistant/chats.ts";
import { Icon } from "./kit.tsx";
import { CASCADE, useEnter } from "./motion.ts";
import { SidebarChats } from "./SidebarChats.tsx";
import { usePrefs } from "../prefs.ts";

export type AppMode = "play" | "assistant";

/** A thing of the app the user can add as context (from App's lists). */
export interface LibraryEntry { kind: AssistantReadKind; id: string; name: string; line: string; avatar?: Avatar | undefined }


// ------------------------------------------------------------------ state shared by the sidebar and the view

export function useAssistant(svc: AppServices | null) {
  const [runtime] = useState(createAssistantRuntime);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [activeId, setActiveIdRaw] = useState<string | null>(null);
  const [page, setPageRaw] = useState<"chat" | "customize">("chat");
  const [custTab, setCustTab] = useState<"assistants" | "presets" | "limits" | "usage">("assistants");
  const setPage = useCallback((p: "chat" | "customize", tab?: "assistants" | "presets" | "limits" | "usage") => { if (tab) setCustTab(tab); setPageRaw(p); }, []);
  const setActiveId = useCallback((id: string | null) => { if (runtime.selectedId.current !== id) runtime.setError(""); runtime.selectedId.current = id; setActiveIdRaw(id); setPageRaw("chat"); }, [runtime]);
  const reload = useCallback(async () => { if (svc) setChats(await listChats(svc.store)); }, [svc]);
  useEffect(() => { void reload(); }, [reload]);
  return { chats, activeId, setActiveId, reload, page, setPage, custTab, svc, runtime };
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
  // a boolean, so token updates don't redraw the sidebar
  const running = useSyncExternalStore(st.runtime.subscribe, () => !!st.runtime.getSnapshot().live);
  const prefs = usePrefs();
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
      {q.trim() ? <>
        <div className="side-head"><span>Chats</span></div>
        <ul className="side-list" data-testid="assistant-chats">
          {shown.length === 0 && <li className="hint side-empty">No chat matches.</li>}
          {shown.map((c) => (
            <li key={c.id}><button className={`side-item${st.page === "chat" && st.activeId === c.id ? " on" : ""}`} onClick={() => st.setActiveId(c.id)}>
              <span className="side-text"><strong>{c.title}</strong><span>{hits.get(c.id) || c.summary || new Date(c.updatedAt).toLocaleDateString()}</span></span>
            </button></li>
          ))}
        </ul>
      </> : (
        // D-108: the same Pinned → folders → Recent as Play
        <SidebarChats scope="assistant" testId="assistant-chats" limit={prefs.recentChats} activeId={st.page === "chat" ? st.activeId : null}
          chats={st.chats.map((c) => ({ id: c.id, title: c.title, line: c.summary, when: c.updatedAt,
            busy: running && st.runtime.runningId.current === c.id ? <span className="side-writing" data-testid="side-writing"><i aria-hidden />working…</span> : undefined }))}
          onOpen={(id) => st.setActiveId(id)}
          onRename={st.svc ? (id, title) => void (async () => { const full = await loadChat(st.svc!.store, id); if (full) { await saveChat(st.svc!.store, { ...full, title }); await st.reload(); } })() : undefined}
          onTrash={st.svc ? (id) => void deleteChat(st.svc!.store, id).then(() => { if (st.activeId === id) st.setActiveId(null); void st.reload(); }) : undefined}
          trashLabel="Delete Chat" empty="Your chats will show here." />
      )}
      {/* D-077: Settings at the bottom, as in Play */}
      <div className="side-bottom">
        <ul className="side-list">
          <li><button className="side-item" onClick={onSettings} data-testid="assistant-settings"><span className="side-icon"><Icon name="gear" /></span><span className="side-text"><strong>Settings</strong></span></button></li>
        </ul>
      </div>
    </nav>
  );
}

