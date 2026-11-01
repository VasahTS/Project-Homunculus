// Homunculus 2 — Ctrl+K: open anything from anywhere (D-069). Author: CLAUDE, 2026-11-01.
// Daniel approved draft G on the canvas "Library – barra no topo" ("B, but with Ctrl K too, I liked the idea").
// One box, results grouped by kind (Go to, Characters, Stories, Chats, Kits, Lorebooks…). Empty: the last chats, then
// the places and the Library sections. Keys: type to search, ↑/↓ to move, Enter to open, Esc to close.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./kit.tsx";
import { paletteResults, type PaletteItem } from "../palette.ts";

export type { PaletteItem };

export function CommandPalette({ items, groupOrder, onClose }: { items: PaletteItem[]; groupOrder: string[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => paletteResults(items, groupOrder, q), [items, groupOrder, q]);

  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => { setCursor(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); }, [cursor]);

  const open = (it: PaletteItem | undefined) => { if (!it) return; onClose(); it.onOpen(); };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => (shown.length ? (c + 1) % shown.length : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => (shown.length ? (c - 1 + shown.length) % shown.length : 0)); }
    else if (e.key === "Enter") { e.preventDefault(); open(shown[cursor]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
  };

  // the results, split into their groups (the order of `shown` is already by group)
  const groups: Array<{ name: string; rows: Array<{ it: PaletteItem; index: number }> }> = [];
  shown.forEach((it, index) => {
    const last = groups[groups.length - 1];
    if (last && last.name === it.group) last.rows.push({ it, index });
    else groups.push({ name: it.group, rows: [{ it, index }] });
  });
  const active = shown[cursor];

  return createPortal(
    <div className="sheet-layer palette-layer" data-region="palette">
      <div className="sheet-scrim" onClick={onClose} />
      <div className="palette glass" role="dialog" aria-modal="true" aria-label="Open anything" data-testid="palette">
        <label className="palette-search">
          <Icon name="search" size={16} />
          <input ref={box} role="combobox" aria-label="Open anything" aria-expanded="true" aria-controls="palette-results"
            aria-activedescendant={active ? `palette-${active.id}` : undefined} placeholder="Search characters, stories, lorebooks, agents…"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={keys} />
          <kbd>Esc</kbd>
        </label>
        <div className="palette-results" id="palette-results" role="listbox" aria-label="Results" ref={list}>
          {groups.map((g) => (
            <div className="palette-group" key={g.name} role="group" aria-label={g.name}>
              <div className="palette-group-name" aria-hidden="true">{g.name}</div>
              {g.rows.map(({ it, index }) => (
                <div key={it.id} id={`palette-${it.id}`} role="option" aria-selected={index === cursor} data-index={index}
                  className={`palette-row${index === cursor ? " on" : ""}`} onMouseMove={() => { if (index !== cursor) setCursor(index); }}
                  onClick={() => open(it)}>
                  <span className="palette-name">{it.name}</span>
                  {it.hint && <span className="palette-hint">{it.hint}</span>}
                </div>
              ))}
            </div>
          ))}
          {shown.length === 0 && <p className="palette-empty">Nothing matches “{q.trim()}”.</p>}
        </div>
        <footer className="palette-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></footer>
      </div>
    </div>,
    document.body,
  );
}
