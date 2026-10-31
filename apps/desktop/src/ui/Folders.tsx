// Homunculus 2 — folders you can see (round 3, D-036). Author: CLAUDE, 2026-10-29.
// Daniel: "I like seeing the folders, not just something to click"; "folders inside folders should be possible too, since
// you can search in All and it will show every file"; "better to make everything able to use folders".
// Look (10/29, 18h40, after trying it): "discreet and elegant, not tiny and useless… it shouldn't be this compact"
// — a folder is a calm tile: a tinted folder mark, the name, what it holds, and the faces of the first few inside.
// Dragging (same evening: "make it possible to hold and drag the characters"): hold a card and drag it onto a folder (or a
// step of the path "All › Fantasy"). It is done with pointer events, not the browser's HTML drag and drop, which the
// desktop window (WebView2) can swallow. The sheet of an item has a "Folder" pick that does the same with the keyboard.
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Avatar, Folder } from "@homunculus/schemas";
import { avatarUrl } from "../files.ts";
import { Icon } from "./kit.tsx";

/** What a folder view needs to know about the items it sorts. */
export interface FolderItem { id: string; name: string; avatar?: Avatar | undefined }

// ------------------------------------------------------------------------------------------------ dragging
/** Where things can be dropped: `data-drop="<key>"` on an element → what to do with the dragged id. */
const dropTargets = new Map<string, (itemId: string) => void>();

function startDrag(e: ReactPointerEvent, id: string, label: string, avatar?: Avatar) {
  if (e.button !== 0 || e.pointerType === "touch") return;
  const sx = e.clientX;
  const sy = e.clientY;
  let ghost: HTMLDivElement | null = null;
  let over: HTMLElement | null = null;
  const setOver = (el: HTMLElement | null) => {
    if (el === over) return;
    over?.classList.remove("drop-over");
    over = el;
    over?.classList.add("drop-over");
  };
  const move = (ev: PointerEvent) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      ghost = document.createElement("div");
      ghost.className = "fd-ghost";
      if (avatar) { const img = document.createElement("img"); img.src = avatarUrl(avatar) ?? ""; img.alt = ""; ghost.append(img); }
      else { const l = document.createElement("span"); l.className = "fd-ghost-letter"; l.textContent = (label || "?").slice(0, 1).toUpperCase(); ghost.append(l); }
      const t = document.createElement("span"); t.textContent = label; ghost.append(t);
      document.body.append(ghost);
      document.body.classList.add("h2-dragging");
    }
    ghost.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 12}px)`;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    setOver((el?.closest("[data-drop]") as HTMLElement | null) ?? null);
  };
  const end = (drop: boolean) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("keydown", key);
    if (!ghost) return;
    ghost.remove();
    document.body.classList.remove("h2-dragging");
    const target = over;
    setOver(null);
    // the click that ends a drag must not open the card
    const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
    if (drop && target) dropTargets.get(target.dataset.drop ?? "")?.(id);
  };
  const up = () => end(true);
  const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") end(false); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("keydown", key);
}

/** Lets a card be held and dragged onto a folder. */
export const dragItem = (id: string, label: string, avatar?: Avatar) => ({
  onPointerDown: (e: ReactPointerEvent) => startDrag(e, id, label, avatar),
  onDragStart: (e: { preventDefault: () => void }) => e.preventDefault(), // no browser drag of the picture
});

/** Registers drop places for this component: `drop(key, fn)` returns the attribute to put on the element. */
function useDrops() {
  const uid = useId();
  useEffect(() => () => { for (const k of [...dropTargets.keys()]) if (k.startsWith(uid)) dropTargets.delete(k); }, [uid]);
  return (key: string, fn: (itemId: string) => void) => {
    const k = `${uid}:${key}`;
    dropTargets.set(k, fn);
    return { "data-drop": k };
  };
}

export const childrenOf = (folders: Folder[], parentId: string | null) =>
  folders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));

/** The folders from the top down to this one. */
export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const out: Folder[] = [];
  for (let f = folders.find((x) => x.id === id); f; f = folders.find((x) => x.id === f!.parentId)) out.unshift(f);
  return out;
}

/** This folder and every folder inside it. */
export function folderAndBelow(folders: Folder[], id: string): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const f of folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; }
  }
  return out;
}

/** "Fantasy › Elves" (empty at the top). */
export const folderLabel = (folders: Folder[], id: string | null | undefined) => folderPath(folders, id ?? null).map((f) => f.name).join(" › ");

/** The items directly in a folder (null = not in any folder). */
export const itemsIn = <T extends { id: string }>(items: T[], map: Record<string, string>, folderId: string | null) =>
  items.filter((it) => (map[it.id] ?? null) === folderId);

export function FolderView({ label, folders, map, items, current, currentName, onOpen, onCreate, onRename, onDelete, onMove, extra }: {
  /** What the items are, for counts and hints ("characters", "NPCs"). */
  label: string;
  folders: Folder[];
  map: Record<string, string>;
  items: FolderItem[];
  current: string | null;
  /** The name of an open folder that is not one of `folders` (a story's own NPCs). */
  currentName?: string | undefined;
  onOpen: (id: string | null) => void;
  onCreate: (name: string, parentId: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** An item (or a folder, "folder:<id>") was dropped on a folder (null = the top). */
  onMove: (itemId: string, folderId: string | null) => void;
  /** More folder-like tiles at the top level (e.g. the stories' own NPC folders). */
  extra?: ReactNode;
}) {
  const [naming, setNaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const path = folderPath(folders, current);
  const kids = childrenOf(folders, current);
  const drops = useDrops();
  const drop = (target: string | null) => drops(target ?? "top", (id) => { if (id !== `folder:${target}`) onMove(id, target); });
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".fd-menu, .fd-more")) setMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  // Back: one folder up. Also the mouse's back button (the side button, like in a browser) and Alt+← (Daniel, 30/10).
  const inside = current !== null || !!currentName;
  const up = () => onOpen(currentName ? current : (path.length > 1 ? path[path.length - 2]!.id : null));
  const upRef = useRef(up); upRef.current = up;
  useEffect(() => {
    if (!inside) return;
    const mouse = (e: MouseEvent) => { if (e.button === 3) { e.preventDefault(); upRef.current(); } };
    const block = (e: MouseEvent) => { if (e.button === 3) e.preventDefault(); };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.altKey && e.key === "ArrowLeft" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) { e.preventDefault(); upRef.current(); }
    };
    window.addEventListener("mouseup", mouse);
    window.addEventListener("mousedown", block);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mouseup", mouse); window.removeEventListener("mousedown", block); window.removeEventListener("keydown", key); };
  }, [inside]);
  const commitNew = () => { const n = naming?.trim(); setNaming(null); if (n) onCreate(n, current); };
  return (
    <div className="folders" data-testid="folders">
      <div className="fd-crumb">
        {inside && <button type="button" className="fd-back" onClick={up} title="Back (mouse back button or Alt+←)" aria-label="Back to the folder above" data-testid="folder-back">‹ Back</button>}
        <button type="button" className={`fd-step${current === null ? " on" : ""}`} onClick={() => onOpen(null)} {...drop(null)}>All</button>
        {path.map((f) => (
          <span key={f.id} className="fd-step-wrap"><span className="fd-sep" aria-hidden>›</span>
            <button type="button" className={`fd-step${f.id === current ? " on" : ""}`} onClick={() => onOpen(f.id)} {...drop(f.id)}>{f.name}</button>
          </span>
        ))}
        {currentName && <span className="fd-step-wrap"><span className="fd-sep" aria-hidden>›</span><span className="fd-step on">{currentName}</span></span>}
        <span className="spacer" />
        {currentName ? null : naming === null
          ? <button type="button" className="link quiet" onClick={() => setNaming("")} data-testid="new-folder">+ New folder{current ? " here" : ""}</button>
          : <input className="fd-name" autoFocus aria-label="New folder name" placeholder="Folder name" value={naming}
              onChange={(e) => setNaming(e.target.value)} onBlur={commitNew}
              onKeyDown={(e) => { if (e.key === "Enter") commitNew(); if (e.key === "Escape") setNaming(null); }} />}
      </div>
      {(kids.length > 0 || (extra && current === null)) && (
        <div className="fd-tiles">
          {kids.map((f) => {
            const inside = folderAndBelow(folders, f.id);
            const all = items.filter((it) => map[it.id] && inside.has(map[it.id]!));
            const sub = childrenOf(folders, f.id).length;
            return (
              <div key={f.id} className={`fd-tile${menu === f.id ? " menu-open" : ""}`} {...drop(f.id)}>
                {renaming?.id === f.id ? (
                  <input className="fd-name fd-rename" autoFocus aria-label="Folder name" value={renaming.name} onChange={(e) => setRenaming({ id: f.id, name: e.target.value })}
                    onBlur={() => { if (renaming.name.trim()) onRename(f.id, renaming.name.trim()); setRenaming(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
                ) : (
                  <button type="button" className="fd-open" onClick={() => onOpen(f.id)} aria-label={`Open the folder ${f.name}`} data-testid="folder-tile"
                    {...dragItem(`folder:${f.id}`, f.name)}>
                    <FolderMark />
                    <span className="fd-text">
                      <span className="fd-title">{f.name}</span>
                      <span className="fd-count">{all.length ? `${all.length} ${all.length === 1 ? label.replace(/s$/, "") : label}` : "Empty"}{sub ? ` · ${sub} folder${sub === 1 ? "" : "s"}` : ""}</span>
                    </span>
                    <Faces items={all} />
                  </button>
                )}
                <button type="button" className="fd-more" aria-label={`More for the folder ${f.name}`} onClick={() => setMenu(menu === f.id ? null : f.id)}><Icon name="dots" size={14} /></button>
                {menu === f.id && (
                  <div className="fd-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); setRenaming({ id: f.id, name: f.name }); }}>Rename</button>
                    <button type="button" role="menuitem" className="danger-text" onClick={() => { setMenu(null); onDelete(f.id); }}
                      title="What is inside moves up one level; nothing is deleted">Delete folder</button>
                  </div>
                )}
              </div>
            );
          })}
          {current === null && extra}
        </div>
      )}
    </div>
  );
}

/** A folder that is not a user folder: e.g. the NPCs that belong to a story ("📖 the story's name"). */
export function VirtualTile({ name, note, items, label, onOpen }: { name: string; note: string; items: FolderItem[]; label: string; onOpen: () => void }) {
  return (
    <div className="fd-tile fd-virtual">
      <button type="button" className="fd-open" onClick={onOpen} aria-label={`Open ${note.toLowerCase()} ${name}`} data-testid="folder-tile">
        <span className="fd-mark book" aria-hidden><Icon name="book" size={16} /></span>
        <span className="fd-text">
          <span className="fd-title">{name}</span>
          <span className="fd-count">{note}'s own · {items.length} {items.length === 1 ? label.replace(/s$/, "") : label}</span>
        </span>
        <Faces items={items} />
      </button>
    </div>
  );
}

/** A folder's mark: a small folder, softly tinted. */
export const FolderMark = ({ size = 18 }: { size?: number }) => <span className="fd-mark" aria-hidden><Icon name="folder" size={size} /></span>;

/** The faces of the first few things in a folder (none when empty). */
export function Faces({ items, max = 3 }: { items: FolderItem[]; max?: number }) {
  if (!items.length) return null;
  return (
    <span className="fd-faces" aria-hidden>
      {items.slice(0, max).map((it) => it.avatar
        ? <img key={it.id} src={avatarUrl(it.avatar)} alt="" draggable={false} />
        : <span key={it.id} className="letter">{(it.name || "?").slice(0, 1).toUpperCase()}</span>)}
      {items.length > max && <span className="more">+{items.length - max}</span>}
    </span>
  );
}

/** A "Folder" pick for an item's sheet: every folder as a tree, plus "No folder". */
export function FolderSelect({ folders, value, onChange, label = "Folder" }: {
  folders: Folder[]; value: string | null; onChange: (id: string | null) => void; label?: string;
}) {
  const rows: Array<{ f: Folder; depth: number }> = [];
  const walk = (parent: string | null, depth: number) => { for (const f of childrenOf(folders, parent)) { rows.push({ f, depth }); walk(f.id, depth + 1); } };
  walk(null, 0);
  return (
    <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="folder-select">
      <option value="">No folder</option>
      {rows.map(({ f, depth }) => <option key={f.id} value={f.id}>{"  ".repeat(depth)}{f.name}</option>)}
    </select>
  );
}
