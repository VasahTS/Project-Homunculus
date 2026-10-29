// Homunculus 2 — the big "Add…" window (round 3, D-036, draft B on the canvas "Homunculus 2 — Organização").
// Author: CLAUDE, 2026-10-29. Replaces the plain lists of "+ Add a Card", "+ From the Vault" (NPCs) and the narrator pick.
// Daniel: the popup must not be see-through, must have a search, and folders must look like folders.
// Left: search, the folders of the open kind (as folders, with what is inside), "Recently used", the list. Right: the
// one under the cursor, bigger, with the button that adds it. Keys: type to search, ↑/↓ to move, Enter to add, Esc to
// close. A search looks in every folder.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Avatar, Folder } from "@homunculus/schemas";
import { avatarUrl } from "../files.ts";
import { childrenOf, Faces, folderAndBelow, FolderMark, folderLabel, folderPath } from "./Folders.tsx";
import { Button, Icon, Segmented } from "./kit.tsx";
import { Modal } from "./Vault.tsx";

export interface PickItem {
  id: string;
  name: string;
  avatar?: Avatar | undefined;
  /** One line under the name. */
  line?: string | undefined;
  tags?: string[] | undefined;
  /** More to read in the preview. */
  detail?: ReactNode;
  /** Belongs to a folder that is not a user folder (e.g. "story:<id>": a story's own NPCs). */
  group?: string | null | undefined;
}

export interface PickKind {
  key: string;
  /** The tab ("Cards", "NPCs", "Narrators"). */
  label: string;
  items: PickItem[];
  folders: Folder[];
  map: Record<string, string>;
  /** Folders that are not user folders: items with that `group`. */
  virtual?: Array<{ id: string; name: string; note: string }> | undefined;
  /** Shown first when nothing is searched (ids). */
  recent?: string[] | undefined;
  /** Already there: shown, but cannot be added again. */
  exclude?: string[] | undefined;
  excludeNote?: string | undefined;
  /** The button ("Add to the story"). */
  action: string;
  onPick: (id: string) => void;
}

const pic = (it: PickItem, size: number, cls = "") => it.avatar
  ? <img className={`pk-pic ${cls}`} style={{ width: size, height: size }} src={avatarUrl(it.avatar)} alt="" />
  : <span className={`pk-pic letter ${cls}`} style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>{(it.name || "?").slice(0, 1).toUpperCase()}</span>;

export function Picker({ title, kinds, initial, onClose }: { title: string; kinds: PickKind[]; initial?: string; onClose: () => void }) {
  const [kindKey, setKindKey] = useState(initial ?? kinds[0]!.key);
  const kind = kinds.find((k) => k.key === kindKey) ?? kinds[0]!;
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  // "Folders" (open one at a time) or "All" (everything in one list, with where it is) — Daniel: "have an option to
  // show everything, so it's easier if you don't want to look folder by folder"; remembered per viewer
  const [view, setViewState] = useState<"folders" | "all">(() => { try { return localStorage.getItem("h2.picker.view") === "all" ? "all" : "folders"; } catch { return "folders"; } });
  const setView = (v: "folders" | "all") => { setViewState(v); setFolder(null); try { localStorage.setItem("h2.picker.view", v); } catch { /* per viewer only */ } };
  const list = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const excluded = new Set(kind.exclude ?? []);
  const term = q.trim().toLowerCase();
  const all = view === "all" || term !== "";
  const virtualOpen = folder?.startsWith("v:") ? kind.virtual?.find((v) => v.id === folder.slice(2)) : undefined;

  useEffect(() => { setFolder(null); setCursor(0); }, [kindKey]);
  useEffect(() => { setCursor(0); }, [q, folder]);
  // opening a folder keeps the keys working (↑ ↓ Enter): the focus goes back to the search
  useEffect(() => { searchBox.current?.focus(); }, [folder, kindKey]);

  // what is listed: a search looks everywhere; else the open folder (user folder, a virtual one, or the top)
  const shown = useMemo(() => {
    if (term) return kind.items.filter((it) => `${it.name} ${it.line ?? ""} ${(it.tags ?? []).join(" ")}`.toLowerCase().includes(term));
    if (view === "all") return [...kind.items].sort((a, b) => a.name.localeCompare(b.name));
    if (virtualOpen) return kind.items.filter((it) => it.group === virtualOpen.id && !kind.map[it.id]);
    const virtualIds = new Set((kind.virtual ?? []).map((v) => v.id));
    return kind.items.filter((it) => (kind.map[it.id] ?? null) === folder && (folder !== null || !it.group || !virtualIds.has(it.group)));
  }, [kind, term, folder, virtualOpen, view]);
  const recent = !term && folder === null && view === "folders" ? (kind.recent ?? []).map((id) => kind.items.find((it) => it.id === id)).filter((x): x is PickItem => !!x && !excluded.has(x.id)).slice(0, 6) : [];
  const flat = [...recent, ...shown.filter((it) => !recent.includes(it))];
  const current = flat[Math.min(cursor, flat.length - 1)];
  const kids = all || virtualOpen ? [] : childrenOf(kind.folders, folder);
  const virtuals = all || folder !== null ? [] : (kind.virtual ?? []).filter((v) => kind.items.some((it) => it.group === v.id && !kind.map[it.id]));

  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); }, [cursor]);

  const pick = (it: PickItem | undefined) => {
    if (!it || excluded.has(it.id)) return;
    kind.onPick(it.id);
    onClose();
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(current); }
  };
  const row = (it: PickItem, i: number) => {
    const off = excluded.has(it.id);
    const where = all ? (kind.map[it.id] ? folderLabel(kind.folders, kind.map[it.id]) : kind.virtual?.find((v) => v.id === it.group)?.name) : undefined;
    return (
      <button key={`${i}:${it.id}`} type="button" data-index={i} className={`pk-row${i === cursor ? " on" : ""}${off ? " off" : ""}`} data-testid="pick-row"
        onMouseEnter={() => setCursor(i)} onClick={() => pick(it)} onDoubleClick={() => pick(it)} aria-disabled={off}>
        {pic(it, 34)}
        <span className="pk-text"><strong>{it.name}</strong><small>{off ? kind.excludeNote ?? "Already in" : [where, it.line].filter(Boolean).join(" · ") || " "}</small></span>
      </button>
    );
  };

  const count = (f: Folder) => {
    const inside = folderAndBelow(kind.folders, f.id);
    return kind.items.filter((it) => kind.map[it.id] && inside.has(kind.map[it.id]!));
  };

  return (
    <Modal title={title} onClose={onClose} testId="picker" className="modal-picker"
      head={kinds.length > 1 ? <Segmented small label="What to add" value={kind.key} onChange={setKindKey} options={kinds.map((k) => ({ value: k.key, label: k.label }))} /> : undefined}>
      <div className="pk-layout" onKeyDown={keys}>
        <div className="pk-left">
          <div className="pk-top">
            <label className="search-box pk-search">
              <Icon name="search" size={14} />
              <input ref={searchBox} autoFocus aria-label={`Search ${kind.label}`} placeholder={`Search ${kind.label.toLowerCase()} in every folder`} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <Segmented small label="Show" value={view} onChange={setView} options={[{ value: "folders", label: "Folders", testId: "pick-view-folders" }, { value: "all", label: "All", testId: "pick-view-all" }]} />
          </div>
          {!all && (folder !== null) && (
            <div className="fd-crumb">
              <button type="button" className="fd-step" onClick={() => setFolder(null)}>All</button>
              {virtualOpen
                ? <span className="fd-step-wrap"><span className="fd-sep">›</span><span className="fd-step on">{virtualOpen.name}</span></span>
                : folderPath(kind.folders, folder).map((f) => (
                  <span key={f.id} className="fd-step-wrap"><span className="fd-sep">›</span>
                    <button type="button" className={`fd-step${f.id === folder ? " on" : ""}`} onClick={() => setFolder(f.id)}>{f.name}</button></span>
                ))}
            </div>
          )}
          <div className="pk-scroll" ref={list}>
            {(kids.length > 0 || virtuals.length > 0) && (
              <div className="pk-folders">
                {kids.map((f) => {
                  const inside = count(f);
                  const sub = childrenOf(kind.folders, f.id).length;
                  return (
                    <button key={f.id} type="button" className="pk-folder" onClick={() => setFolder(f.id)} data-testid="pick-folder">
                      <FolderMark size={16} />
                      <span className="fd-text"><span className="fd-title">{f.name}</span>
                        <span className="fd-count">{inside.length} {inside.length === 1 ? kind.label.replace(/s$/, "").toLowerCase() : kind.label.toLowerCase()}{sub ? ` · ${sub} folder${sub === 1 ? "" : "s"}` : ""}</span></span>
                      <Faces items={inside} />
                    </button>
                  );
                })}
                {virtuals.map((v) => {
                  const inside = kind.items.filter((it) => it.group === v.id && !kind.map[it.id]);
                  return (
                    <button key={v.id} type="button" className="pk-folder virtual" onClick={() => setFolder(`v:${v.id}`)} data-testid="pick-folder">
                      <span className="fd-mark book" aria-hidden><Icon name="book" size={15} /></span>
                      <span className="fd-text"><span className="fd-title">{v.name}</span><span className="fd-count">{v.note} · {inside.length}</span></span>
                      <Faces items={inside} />
                    </button>
                  );
                })}
              </div>
            )}
            {recent.length > 0 && <div className="pk-label">Recently used</div>}
            {recent.map((it, i) => row(it, i))}
            {recent.length > 0 && shown.some((it) => !recent.includes(it)) && <div className="pk-label">{view === "all" ? `All ${kind.label.toLowerCase()}` : folder === null ? "Not in a folder" : "In this folder"}</div>}
            {flat.slice(recent.length).map((it, i) => row(it, i + recent.length))}
            {flat.length === 0 && <p className="hint pk-empty">{term ? `Nothing matches “${q.trim()}”.` : kids.length || virtuals.length ? "Open a folder." : "Nothing here yet."}</p>}
          </div>
        </div>
        <div className="pk-preview" data-testid="pick-preview">
          {current ? (
            <>
              <div className="pk-head">{pic(current, 84)}<div><h3>{current.name}</h3>{current.line && <p className="hint">{current.line}</p>}
                {current.tags && current.tags.length > 0 && <div className="pk-tags">{current.tags.slice(0, 6).map((t) => <span key={t} className="tag">{t}</span>)}</div>}</div></div>
              <div className="pk-detail">{current.detail}</div>
            </>
          ) : <p className="hint">Pick one to see it here.</p>}
        </div>
      </div>
      <div className="modal-foot">
        <span className="hint grow">↑ ↓ to move · Enter to add · Esc to close</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="prominent" disabled={!current || excluded.has(current.id)} onClick={() => pick(current)} data-testid="pick-add">
          {current ? `${kind.action}: ${current.name}` : kind.action}</Button>
      </div>
    </Modal>
  );
}
