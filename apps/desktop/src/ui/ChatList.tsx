// Homunculus 2 — a list of chats you can search and export (round 3, D-036). Author: CLAUDE, 2026-10-29.
// Used at the bottom of a Story's page ("the last thing you scroll to", Daniel) and in a character's sheet.
// Search looks in the chats' names and in every message; a match shows the line with the words marked, and clicking it
// opens the chat at that message. Each chat has ⋯: Open · Rename · Export as (Homunculus, SillyTavern JSONL, Markdown,
// text) · Move to Trash.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { CHAT_EXPORT_FORMATS, type ChatExportFormat } from "@homunculus/core";
import type { Session } from "@homunculus/schemas";
import { Icon } from "./kit.tsx";

export interface ChatRow { session: Session; lastLine: string; messages: number; when: number; badges?: ReactNode }
export type ChatSearch = (q: string) => Promise<Record<string, { count: number; hits: Array<{ id: string; content: string }> }>>;

const when = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "today";
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** The text around the first match, with the words marked. */
function Snippet({ text, q }: { text: string; q: string }) {
  const flat = text.replace(/\s+/g, " ");
  const i = flat.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{flat.slice(0, 120)}</>;
  const start = Math.max(0, i - 40);
  return <>{start > 0 ? "…" : ""}{flat.slice(start, i)}<mark>{flat.slice(i, i + q.length)}</mark>{flat.slice(i + q.length, i + q.length + 80)}{i + q.length + 80 < flat.length ? "…" : ""}</>;
}

export function ChatList({ chats, search, onOpen, onRename, onExport, onTrash, onNew, initial = 3, empty = "No chats yet.", testId = "chat-list", latestTag = true }: {
  chats: ChatRow[];
  search: ChatSearch;
  onOpen: (sessionId: string, messageId?: string) => void;
  onRename: (sessionId: string, title: string) => void;
  onExport: (sessionId: string, format: ChatExportFormat) => void;
  onTrash: (sessionId: string) => void;
  onNew?: (() => void) | undefined;
  /** Rows shown before "Show all". */
  initial?: number;
  empty?: string;
  testId?: string;
  latestTag?: boolean;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Awaited<ReturnType<ChatSearch>> | null>(null);
  const [all, setAll] = useState(false);
  const [menu, setMenu] = useState<{ id: string; exp: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setFound(null); return; }
    const n = ++seq.current;
    const t = setTimeout(() => { void search(term).then((r) => { if (n === seq.current) setFound(r); }); }, 180);
    return () => clearTimeout(t);
  }, [q, search]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".cl-menu, .cl-more")) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);

  const term = q.trim().toLowerCase();
  const matches = found === null ? null : chats.filter((c) => c.session.title.toLowerCase().includes(term) || found[c.session.id]);
  const rows = matches ?? (all ? chats : chats.slice(0, initial));

  return (
    <div className="chat-list" data-testid={testId}>
      {chats.length > 0 && (
        <label className="search-box cl-search">
          <Icon name="search" size={13} />
          <input aria-label="Search chats" placeholder="Search chats: names and messages" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
        </label>
      )}
      <div className="cl-rows">
        {rows.map((c, i) => {
          const hit = found?.[c.session.id];
          const open = menu?.id === c.session.id;
          return (
            <div key={c.session.id} className="cl-row" data-testid="chat-row">
              {renaming?.id === c.session.id ? (
                <input className="cl-rename" autoFocus aria-label="Chat name" value={renaming.title} onChange={(e) => setRenaming({ id: c.session.id, title: e.target.value })}
                  onBlur={() => { const t = renaming.title.trim(); if (t && t !== c.session.title) onRename(c.session.id, t); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
              ) : (
                <button type="button" className="cl-main" onClick={() => onOpen(c.session.id, hit?.hits[0]?.id)}>
                  <span className="cl-name"><strong>{c.session.title}</strong>{latestTag && !matches && i === 0 && <span className="tag latest-tag">latest</span>}{c.badges}</span>
                  <span className="cl-line prose-line">{hit ? <Snippet text={hit.hits[0]!.content} q={q.trim()} /> : c.lastLine || "—"}</span>
                  <span className="cl-meta">{hit ? `${hit.count} match${hit.count === 1 ? "" : "es"}` : `${c.messages} message${c.messages === 1 ? "" : "s"}`} · {when(c.when)}</span>
                </button>
              )}
              <button type="button" className="cl-more icon-btn" aria-label={`More for ${c.session.title}`} aria-expanded={open}
                onClick={() => setMenu(open ? null : { id: c.session.id, exp: false })}><Icon name="dots" size={15} /></button>
              {open && (
                <div className="cl-menu" role="menu">
                  {!menu.exp ? (
                    <Fragment>
                      <button type="button" role="menuitem" onClick={() => { setMenu(null); onOpen(c.session.id); }}>Open</button>
                      <button type="button" role="menuitem" onClick={() => { setMenu(null); setRenaming({ id: c.session.id, title: c.session.title }); }}>Rename</button>
                      <button type="button" role="menuitem" onClick={() => setMenu({ id: c.session.id, exp: true })}>Export as ›</button>
                      <button type="button" role="menuitem" className="danger-text" onClick={() => { setMenu(null); onTrash(c.session.id); }}>Move to Trash</button>
                    </Fragment>
                  ) : (
                    <Fragment>
                      <span className="cl-menu-title">Export “{c.session.title}” as</span>
                      {CHAT_EXPORT_FORMATS.map((f) => (
                        <button key={f.format} type="button" role="menuitem" className="cl-exp" onClick={() => { setMenu(null); onExport(c.session.id, f.format); }}>
                          <strong>{f.label}</strong><small>{f.help}</small>
                        </button>
                      ))}
                    </Fragment>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {chats.length === 0 && <p className="hint cl-empty">{empty}</p>}
        {matches && matches.length === 0 && <p className="hint cl-empty">No chat has “{q.trim()}”.</p>}
      </div>
      <div className="cl-foot">
        {matches ? <span className="hint">{matches.length} of {chats.length} chats match “{q.trim()}” · click one to open it at that message</span>
          : chats.length > initial ? <button type="button" className="link" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${chats.length} chats`}</button> : <span />}
        {onNew && <button type="button" className="link" onClick={onNew}>+ New Chat</button>}
      </div>
    </div>
  );
}
