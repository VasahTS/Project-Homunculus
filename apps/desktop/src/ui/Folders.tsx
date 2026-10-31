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

// ---- selection (Ctrl/⌘+click picks several cards; dragging one of them carries them all) — Daniel, 30/10
const selected = new Set<string>();
const elOf = (id: string) => document.querySelector<HTMLElement>(`[data-drag-id="${CSS.escape(id)}"]`);
function paintSelection() {
  document.querySelectorAll<HTMLElement>("[data-drag-id]").forEach((el) => el.classList.toggle("fd-selected", selected.has(el.dataset.dragId ?? "")));
}
// React rewrites a card's class when it re-renders; put the mark back while something is picked
let repaint = 0;
if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
  new MutationObserver(() => {
    if (!selected.size || repaint) return;
    repaint = requestAnimationFrame(() => { repaint = 0; document.querySelectorAll<HTMLElement>("[data-drag-id]").forEach((el) => {
      const want = selected.has(el.dataset.dragId ?? "");
      if (el.classList.contains("fd-selected") !== want) el.classList.toggle("fd-selected", want);
    }); });
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
}
function clearSelection() { if (!selected.size) return; selected.clear(); paintSelection(); }
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") clearSelection(); });
  // a plain click somewhere else ends the selection
  window.addEventListener("pointerdown", (e) => {
    if (e.ctrlKey || e.metaKey || (e.target as HTMLElement | null)?.closest?.("[data-drag-id], [data-drop]")) return;
    clearSelection();
  }, true);
}

/** Swallows the click that follows (so a Ctrl+click or the end of a drag does not open the card). */
function swallowClick() {
  const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
}

/**
 * The card itself follows the pointer on a spring: it trails a little behind and tilts with the speed (the
 * "follow-through"), then settles. With several cards selected they gather into a small stack under the pointer.
 * Pointer events, not HTML drag and drop (the desktop window can swallow it).
 */
function startDrag(e: ReactPointerEvent, id: string) {
  if (e.button !== 0 || e.pointerType === "touch") return;
  const source = e.currentTarget as HTMLElement;
  if (e.ctrlKey || e.metaKey) {
    // like a file explorer: the card already open counts as picked when you Ctrl+click another one
    if (!selected.size) {
      const open = source.parentElement?.querySelector<HTMLElement>("[data-drag-id].on");
      if (open?.dataset.dragId && open !== source) selected.add(open.dataset.dragId);
    }
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    paintSelection();
    // the click comes when the button is released (a real hand holds it ~100 ms): swallow it then, not right away
    const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener("click", stop, { capture: true, once: true });
    window.addEventListener("pointerup", () => setTimeout(() => { window.removeEventListener("click", stop, { capture: true }); paintSelection(); }, 0), { once: true });
    return;
  }
  const sx = e.clientX;
  const sy = e.clientY;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const ids = selected.has(id) && selected.size > 1 ? [id, ...[...selected].filter((x) => x !== id)] : [id];
  type Carried = { id: string; el: HTMLElement; clone: HTMLElement; w: number; h: number; x: number; y: number; vx: number; rot: number };
  let carried: Carried[] | null = null;
  let badge: HTMLElement | null = null;
  let over: HTMLElement | null = null;
  let px = sx, py = sy, raf = 0;
  const many = ids.length > 1;
  const setOver = (el: HTMLElement | null) => {
    if (el === over) return;
    over?.classList.remove("drop-over");
    over = el;
    over?.classList.add("drop-over");
  };
  const lift = () => {
    carried = ids.map((x) => elOf(x) ?? (x === id ? source : null)).filter((el): el is HTMLElement => !!el).map((el) => {
      const r = el.getBoundingClientRect();
      const clone = el.cloneNode(true) as HTMLElement;
      clone.removeAttribute("data-drag-id");
      clone.classList.remove("fd-selected", "on");
      clone.classList.add("fd-float");
      Object.assign(clone.style, { width: `${r.width}px`, height: `${r.height}px`, transform: `translate(${r.left}px, ${r.top}px)` });
      // beside the card, so the page's own styles still dress it (fixed: out of the layout)
      (el.parentElement ?? document.body).append(clone);
      el.classList.add("fd-carried");
      return { id: el.dataset.dragId ?? id, el, clone, w: r.width, h: r.height, x: r.left, y: r.top, vx: 0, rot: 0 };
    });
    if (many) {
      badge = document.createElement("span");
      badge.className = "fd-carry-count";
      badge.textContent = String(carried.length);
      document.body.append(badge);
    }
    document.body.classList.add("h2-dragging");
    if (!reduce) raf = requestAnimationFrame(tick);
  };
  // where each card wants to be: the grabbed one under the pointer (where it was held), the others stacked behind it
  const grabX = (() => { const r = source.getBoundingClientRect(); return sx - r.left; })();
  const grabY = (() => { const r = source.getBoundingClientRect(); return sy - r.top; })();
  const scale = many ? 0.45 : 0.85;
  const goal = (c: Carried, k: number) => many
    ? { x: px - (c.w * scale) / 2 + k * 6 - c.w * (1 - scale) / 2, y: py - (c.h * scale) / 2 + k * 6 - c.h * (1 - scale) / 2 }
    : { x: px - grabX * scale - c.w * (1 - scale) / 2, y: py - grabY * scale - c.h * (1 - scale) / 2 };
  const place = (c: Carried, k: number) => {
    const fan = many ? (k === 0 ? 0 : (k % 2 ? 1 : -1) * (3 + k)) : 0;
    c.clone.style.transform = `translate(${c.x}px, ${c.y}px) scale(${scale}) rotate(${c.rot + fan}deg)`;
    c.clone.style.zIndex = String(1000 + carried!.length - k);
  };
  function tick() {
    if (!carried) return;
    carried.forEach((c, k) => {
      const g = goal(c, k);
      // a spring: the first card follows closely, the ones behind a little later (they trail like a tail)
      const pull = Math.max(0.12, 0.3 - k * 0.04);
      const nx = c.x + (g.x - c.x) * pull;
      c.vx = nx - c.x;
      c.x = nx;
      c.y += (g.y - c.y) * pull;
      c.rot += (Math.max(-14, Math.min(14, c.vx * 0.9)) - c.rot) * 0.2; // tilt with the speed, back to straight when it stops
      place(c, k);
    });
    if (badge) badge.style.transform = `translate(${px + 10}px, ${py - 30}px)`;
    raf = requestAnimationFrame(tick);
  }
  const move = (ev: PointerEvent) => {
    px = ev.clientX; py = ev.clientY;
    if (!carried) {
      if (Math.hypot(px - sx, py - sy) < 6) return;
      lift();
    }
    if (reduce && carried) { carried.forEach((c, k) => { const g = goal(c, k); c.x = g.x; c.y = g.y; place(c, k); }); if (badge) badge.style.transform = `translate(${px + 10}px, ${py - 30}px)`; }
    const el = document.elementFromPoint(px, py);
    setOver((el?.closest("[data-drop]") as HTMLElement | null) ?? null);
  };
  const end = (drop: boolean) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("keydown", key);
    if (!carried) return;
    cancelAnimationFrame(raf);
    const list = carried;
    carried = null;
    document.body.classList.remove("h2-dragging");
    const target = over;
    setOver(null);
    swallowClick();
    badge?.remove();
    const into = drop && target;
    const finish = () => { for (const c of list) { c.clone.remove(); c.el.classList.remove("fd-carried"); } target?.classList.remove("drop-took"); };
    if (reduce) finish();
    else {
      // into the folder (shrinking away), or each card back to its place
      const t = target?.getBoundingClientRect();
      list.forEach((c, k) => {
        c.clone.classList.add("fd-settle");
        if (into && t) {
          c.clone.style.opacity = "0";
          c.clone.style.transform = `translate(${t.left + t.width / 2 - c.w / 2}px, ${t.top + t.height / 2 - c.h / 2}px) scale(0.1)`;
          c.clone.style.transitionDelay = `${k * 30}ms`;
        } else {
          const r = c.el.getBoundingClientRect();
          c.clone.style.transform = `translate(${r.left}px, ${r.top}px) scale(1)`;
        }
      });
      if (into) target.classList.add("drop-took");
      setTimeout(finish, 300 + list.length * 30);
    }
    if (into) {
      const fn = dropTargets.get(target.dataset.drop ?? "");
      for (const c of list) fn?.(c.id);
      clearSelection();
    }
  };
  const up = () => end(true);
  const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") end(false); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("keydown", key);
}

/** Lets a card be held and dragged onto a folder (Ctrl/⌘+click selects several). */
export const dragItem = (id: string, _label?: string, _avatar?: Avatar) => ({
  "data-drag-id": id,
  onPointerDown: (e: ReactPointerEvent) => startDrag(e, id),
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
