// Homunculus 2 — the sidebar's chats: Pinned → your folders → Recent, in one-line rows (D-108). Used by Play and by the
// Assistant. Daniel (translated): "10 recent, but make them smaller so the UI isn't busy". From Flint's sidebar
// (ChatsNav.tsx): pinned on top, a folder per group with its count, "Show N more", drag a chat onto a folder, and a folded
// folder still shows the open chat and any chat that is writing. A folder is only a sidebar grouping: the chat still
// lives on its character's sheet or its story's page. CLAUDE, 2026-11-10.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  addFolder, ago, changeOrganization, deleteFolder, folderOf, foldFolder, groupChats, moveChat, pinChat, renameFolder, useChatOrganization,
  type ChatFolder, type ChatScope,
} from "../chatOrganization.ts";
import { Icon, IconButton } from "./kit.tsx";

export interface SideChat {
  id: string;
  title: string;
  /** Where it is from, in grey: the story or the character. */
  from?: string;
  /** The newest line, for the tooltip. */
  line?: string;
  when: number;
  branches?: number;
  /** Shown in place of the time while the chat is writing (it may carry its own Stop). */
  busy?: ReactNode;
}

const FOLDER_ROWS = 8;

export function SidebarChats({ scope, chats, activeId, limit, onOpen, onRename, onTrash, trashLabel = "Move to Trash", source, testId, empty, recentHelp }: {
  /** The tooltip of the Recent heading. */
  recentHelp?: string;
  scope: ChatScope;
  /** Newest first. */
  chats: SideChat[];
  activeId: string | null;
  /** How many rows Recent shows before "Show N more"; 0 = all. */
  limit: number;
  onOpen: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onTrash?: (id: string) => void;
  trashLabel?: string;
  /** "Open Lyra's Sheet" / "Open the Story Page", when the chat has one. */
  source?: (id: string) => { label: string; run: () => void } | null;
  /** The Recent list's test id (click tests). */
  testId: string;
  empty: ReactNode;
}) {
  const org = useChatOrganization(scope);
  const change = (f: Parameters<typeof changeOrganization>[1]) => changeOrganization(scope, f);
  const groups = groupChats(org, chats);
  const [menu, setMenu] = useState<{ chatId?: string; folderId?: string; sub?: boolean } | null>(null);
  const [renaming, setRenaming] = useState<{ chatId?: string; folderId?: string; text: string } | null>(null);
  const [newFolder, setNewFolder] = useState<{ text: string; chatId?: string } | null>(null);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [dropOn, setDropOn] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".sc-menu, .sc-more")) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(null); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc, true); };
  }, [menu]);

  const makeFolder = (name: string, chatId?: string) => {
    const id = crypto.randomUUID();
    change((o) => { const x = addFolder(o, id, name); return chatId ? moveChat(x, chatId, id) : x; });
  };

  // ---- drag a chat onto a folder (or onto Recent to take it out). Pointer events, not the browser's drag and drop:
  // the desktop window (WebView2) swallows that (Daniel: "dragging does nothing"), as Folders.tsx found for cards.
  const drag = useRef<{ id: string; title: string; x: number; y: number; ghost: HTMLElement | null; target: string | null } | null>(null);
  const targetAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-chat-drop]")?.dataset.chatDrop ?? null;
  const dragProps = (chatId: string, title: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0 || e.pointerType === "touch" || (e.target as HTMLElement).closest(".sc-more, input")) return;
      drag.current = { id: chatId, title, x: e.clientX, y: e.clientY, ghost: null, target: null };
      const move = (ev: PointerEvent) => {
        const d = drag.current;
        if (!d) return;
        if (!d.ghost) {
          if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return;
          d.ghost = document.createElement("div");
          d.ghost.className = "sc-ghost";
          d.ghost.textContent = d.title;
          document.body.appendChild(d.ghost);
          document.body.classList.add("sc-dragging");
        }
        d.ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 8}px)`;
        const t = targetAt(ev.clientX, ev.clientY);
        if (t !== d.target) { d.target = t; setDropOn(t); }
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        const d = drag.current;
        drag.current = null;
        if (!d?.ghost) return;
        d.ghost.remove();
        document.body.classList.remove("sc-dragging");
        setDropOn(null);
        // the click that ends a drag does not open the chat
        const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
        if (!d.target) return;
        const folderId = d.target === "recent" ? null : d.target.slice("folder:".length);
        change((o) => moveChat(pinChat(o, d.id, false), d.id, folderId));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
  });
  const dropProps = (target: string, _folderId: string | null) => ({ "data-chat-drop": target });

  const row = (c: SideChat) => {
    const open = menu?.chatId === c.id;
    const pinned = org.pinned.includes(c.id);
    const folder = folderOf(org, c.id);
    if (renaming?.chatId === c.id) {
      return (
        <li key={c.id} className="sc-li">
          <input className="sc-input" autoFocus aria-label="Chat name" value={renaming.text} onChange={(e) => setRenaming({ chatId: c.id, text: e.target.value })}
            onBlur={() => { const t = renaming.text.trim(); if (t && t !== c.title) onRename?.(c.id, t); setRenaming(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }} />
        </li>
      );
    }
    const src = source?.(c.id) ?? null;
    return (
      <li key={c.id} className={`sc-li${open ? " menu-open" : ""}`} {...dragProps(c.id, c.title)}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ chatId: c.id }); }}>
        <button className={`side-item side-chat sc-row${c.id === activeId ? " on" : ""}`} onClick={() => onOpen(c.id)} title={c.line ? `${c.title}\n${c.line}` : c.title}
          aria-current={c.id === activeId ? "page" : undefined}>
          {pinned && <span className="sc-pin" aria-label="Pinned"><Icon name="pin" size={10} /></span>}
          <span className="sc-t">{c.title}</span>
          {(c.branches ?? 1) > 1 && <span className="side-fork" title={`${c.branches} branches`}><Icon name="branch" size={10} />{c.branches}</span>}
          {c.busy ? <span className="sc-busy">{c.busy}</span> : <>
            {c.from && <span className="sc-from">{c.from}</span>}
            <span className="sc-when">{ago(c.when)}</span>
          </>}
        </button>
        <IconButton label={`More for ${c.title}`} className="sc-more" aria-expanded={open} aria-haspopup="menu"
          onClick={() => setMenu(open ? null : { chatId: c.id })}><span className="sc-dots" aria-hidden="true"><i /><i /><i /></span></IconButton>
        {open && (
          <div className="sc-menu" role="menu" aria-label={menu?.sub ? "Move to Folder" : c.title}>
            {!menu?.sub ? <>
              <button type="button" role="menuitem" onClick={() => { setMenu(null); change((o) => pinChat(o, c.id, !pinned)); }}>{pinned ? "Unpin" : "Pin"}</button>
              <button type="button" role="menuitem" aria-haspopup="menu" onClick={() => setMenu({ chatId: c.id, sub: true })}>Move to Folder <Icon name="chevron" size={11} /></button>
              {folder && <button type="button" role="menuitem" onClick={() => { setMenu(null); change((o) => moveChat(o, c.id, null)); }}>Remove from “{folder.name}”</button>}
              {onRename && <button type="button" role="menuitem" onClick={() => { setMenu(null); setRenaming({ chatId: c.id, text: c.title }); }}>Rename</button>}
              {src && <button type="button" role="menuitem" onClick={() => { setMenu(null); src.run(); }}>{src.label}</button>}
              {onTrash && <><hr /><button type="button" role="menuitem" className="danger-text" onClick={() => { setMenu(null); onTrash(c.id); }}>{trashLabel}</button></>}
            </> : <>
              <button type="button" className="sc-menu-back" onClick={() => setMenu({ chatId: c.id })}><Icon name="chevron" size={11} /> Move to Folder</button>
              {org.folders.map((f) => (
                <button key={f.id} type="button" role="menuitem" disabled={folder?.id === f.id}
                  onClick={() => { setMenu(null); change((o) => moveChat(pinChat(o, c.id, false), c.id, f.id)); }}>{f.name}{folder?.id === f.id && <small>here now</small>}</button>
              ))}
              {org.folders.length > 0 && <hr />}
              <button type="button" role="menuitem" onClick={() => { setMenu(null); setNewFolder({ text: "", chatId: c.id }); }}>New Folder…</button>
            </>}
          </div>
        )}
      </li>
    );
  };

  /** Up to `n` rows, then "Show N more" / "Show less". */
  const more = (key: string, list: SideChat[], n: number) => {
    const all = showAll[key] || n <= 0 || list.length <= n;
    return { shown: all ? list : list.slice(0, n), toggle: list.length > n && n > 0
      ? <li><button type="button" className="sc-showmore" onClick={() => setShowAll((s) => ({ ...s, [key]: !s[key] }))}>{showAll[key] ? "Show less" : `Show ${list.length - n} more`}</button></li>
      : null };
  };

  const folderBlock = ({ folder, chats: inside }: { folder: ChatFolder; chats: SideChat[] }) => {
    const folded = org.folded.includes(folder.id);
    const open = menu?.folderId === folder.id;
    // folded: the open chat and any chat that is writing stay in view (Flint)
    const visible = folded ? inside.filter((c) => c.id === activeId || c.busy) : inside;
    const { shown, toggle } = more(`folder:${folder.id}`, visible, FOLDER_ROWS);
    const target = `folder:${folder.id}`;
    return (
      <li key={folder.id} className={`sc-folder${dropOn === target ? " drop" : ""}`} {...dropProps(target, folder.id)} data-testid="chat-folder">
        {renaming?.folderId === folder.id ? (
          <input className="sc-input" autoFocus aria-label="Folder name" value={renaming.text} onChange={(e) => setRenaming({ folderId: folder.id, text: e.target.value })}
            onBlur={() => { change((o) => renameFolder(o, folder.id, renaming.text)); setRenaming(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }} />
        ) : (
          <div className={`sc-folder-head${open ? " menu-open" : ""}`} onContextMenu={(e) => { e.preventDefault(); setMenu({ folderId: folder.id }); }}>
            <button type="button" className="sc-folder-row" aria-expanded={!folded} onClick={() => change((o) => foldFolder(o, folder.id, !folded))}>
              <span className={`sc-chev${folded ? "" : " open"}`} aria-hidden="true"><Icon name="chevron" size={10} /></span>
              <span className="sc-fn">{folder.name}</span>
              <span className="sc-count">{inside.length}</span>
            </button>
            <IconButton label={`More for the folder ${folder.name}`} className="sc-more" aria-expanded={open} aria-haspopup="menu"
              onClick={() => setMenu(open ? null : { folderId: folder.id })}><span className="sc-dots" aria-hidden="true"><i /><i /><i /></span></IconButton>
            {open && (
              <div className="sc-menu" role="menu" aria-label={folder.name}>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setRenaming({ folderId: folder.id, text: folder.name }); }}>Rename</button>
                <button type="button" role="menuitem" className="danger-text" onClick={() => { setMenu(null); change((o) => deleteFolder(o, folder.id)); }}>
                  Delete Folder<small>Its chats go back to Recent</small></button>
              </div>
            )}
          </div>
        )}
        {(shown.length > 0 || !folded) && (
          <ul className="side-list sc-inside">
            {shown.map(row)}
            {!folded && inside.length === 0 && <li className="sc-drop-hint">Drag chats here</li>}
            {toggle}
          </ul>
        )}
      </li>
    );
  };

  const recent = more("recent", groups.rest, limit);
  const hasFolders = org.folders.length > 0 || newFolder !== null;
  const plus = <IconButton label="New folder" onClick={() => setNewFolder({ text: "" })} data-testid="chat-new-folder"><Icon name="folder" size={13} /></IconButton>;

  return (
    <div className="sc" ref={rootRef} data-scope={scope}>
      {groups.pinned.length > 0 && <>
        <div className="side-head sc-head"><span>Pinned</span></div>
        <ul className="side-list sc-list" data-testid={`${testId}-pinned`}>{groups.pinned.map(row)}</ul>
      </>}
      {hasFolders && <>
        <div className="side-head sc-head"><span>Folders</span>{plus}</div>
        <ul className="side-list sc-list sc-folders" data-testid={`${testId}-folders`}>
          {newFolder && (
            <li className="sc-li">
              <input className="sc-input" autoFocus aria-label="New folder name" placeholder="Folder name" value={newFolder.text}
                onChange={(e) => setNewFolder({ ...newFolder, text: e.target.value })}
                onBlur={() => { if (newFolder.text.trim()) makeFolder(newFolder.text, newFolder.chatId); setNewFolder(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { e.stopPropagation(); setNewFolder(null); } }} />
            </li>
          )}
          {groups.folders.map(folderBlock)}
        </ul>
      </>}
      <div className={`side-head sc-head${dropOn === "recent" ? " drop" : ""}`} {...dropProps("recent", null)}>
        <span title={recentHelp}>Recent</span>{!hasFolders && plus}
      </div>
      <ul className={`side-list sc-list${dropOn === "recent" ? " drop" : ""}`} data-testid={testId} {...dropProps("recent", null)}>
        {recent.shown.map(row)}
        {recent.toggle}
        {chats.length === 0 && <li className="side-empty">{empty}</li>}
      </ul>
    </div>
  );
}
