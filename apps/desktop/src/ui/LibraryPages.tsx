// Homunculus 2 — Library pages: a list on the left, the selected item on the right. Author: CLAUDE, 2026-10-27 (D-018);
// 2026-10-28 (slice 1): Personas and the Trash.
// Characters and Trackers share this master-detail shape; future library kinds (personas, lorebooks,
// presets, agents) reuse it.
import { usePaged } from "./Pager.tsx";
import { quietNextScreen } from "./back-button.ts";
import { dragItem } from "./Folders.tsx";
import { ImportButton } from "./BundleButtons.tsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Avatar, Character, Lorebook, Persona, Preset, TrashItem } from "@homunculus/schemas";
import { ConfirmButton, Help } from "./Help.tsx";
import { LorebookChips } from "./LorePanels.tsx";
import { Button, Icon, IconButton } from "./kit.tsx";
import { AvatarDot } from "./Sidebar.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { CASCADE, useEnter } from "./motion.ts";
import type { Tracker } from "../trackers.ts";
import { useCollectionOrder } from "./CollectionOrder.tsx";

export function MasterDetail({ list, detail, collapsed = false, onExpand }: {
  list: ReactNode; detail: ReactNode;
  /** The list folded into a thin strip (D-071: by hand only, never automatically); `onExpand` brings it back. */
  collapsed?: boolean; onExpand?: () => void;
}) {
  return (
    <div className="master-detail">
      {collapsed
        ? <div className="master-rail" data-region="library"><IconButton label="Show the list" onClick={onExpand}><Icon name="sidebar" size={15} /></IconButton></div>
        : <div className="master" data-region="library">{list}</div>}
      <div className="detail" data-region="editor">{detail}</div>
    </div>
  );
}

/**
 * UX review item 3 (D-078): a page with items never opens on an empty "pick something" pane. With nothing selected it
 * opens the item used last on that page (remembered per viewer), else the first one.
 */
function useAutoOpen(kind: string, ids: string[], selectedId: string | null, onSelect: (id: string) => void, open: boolean): void {
  const key = `h2.lastOpen.${kind}`;
  useEffect(() => {
    if (selectedId && selectedId !== "new") { try { localStorage.setItem(key, selectedId); } catch { /* a convenience only */ } return; }
    if (open) return; // keep an unsaved new item or draft open after remembering any saved selection
    if (selectedId === "new" || !ids.length) return;
    let last: string | null = null;
    try { last = localStorage.getItem(key); } catch { /* private window */ }
    quietNextScreen(kind); // the page opening its item by itself is not a step M4 goes back through (D-097)
    onSelect(last && ids.includes(last) ? last : ids[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ids.length, open]);
}

const LIST_KEY = "h2.characters.listCollapsed";
const readCollapsed = () => { try { return localStorage.getItem(LIST_KEY) === "1"; } catch { return false; } };

export function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="search-box">
      <Icon name="search" size={13} />
      <input aria-label={label} placeholder="Search" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function CharactersPage({ lead, tabs, characters, avatars, selectedId, importHelp, onSelect, onNew, onImport, detail }: {
  lead: ReactNode;
  /** The Library tabs (characters, personas…), shown in the toolbar. */
  tabs?: ReactNode;
  characters: Character[];
  avatars: Record<string, Avatar>;
  selectedId: string | "new" | null;
  importHelp: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: (files: File[]) => void;
  detail: ReactNode;
}) {
  const [q, setQ] = useState("");
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const setCollapsed = (v: boolean) => { setCollapsedState(v); try { localStorage.setItem(LIST_KEY, v ? "1" : "0"); } catch { /* a convenience only */ } };
  const fileInput = useRef<HTMLInputElement>(null);
  const shown = characters.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  // pages (D-130)
  const paged = usePaged(shown, `${q}|${shown.length}|${shown[0] ? JSON.stringify(Object.values(shown[0]).slice(0, 1)) : ""}`, { label: "characters", keep: (c) => c.id === selectedId, testId: "library-character-pager" });
  // the list arrives one row after another when the page opens (D-072)
  const listEl = useRef<HTMLUListElement>(null);
  useEnter(listEl, "open", undefined, { ...CASCADE, y: 10, stagger: 45, max: 12 });
  return (
    <div className="page">
      <Toolbar lead={lead} title="Characters" center={tabs} subtitle={`${characters.length} in the library`}
        trailing={<>
          <Button onClick={() => fileInput.current?.click()}><Icon name="import" size={14} /> Import</Button>
          <Help text={`Import characters from SillyTavern (or sites that use the same cards). ${importHelp} You can pick several files at once.`} />
          <Button onClick={onNew}><Icon name="plus" size={14} /> New Character</Button>
          <input ref={fileInput} type="file" accept=".png,.json" multiple hidden data-testid="import-input"
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onImport(files); }} />
        </>} />
      <MasterDetail
        list={<>
          <div className="master-head"><SearchBox value={q} onChange={setQ} label="Search characters" />
            <IconButton label="Hide the list" onClick={() => setCollapsed(true)}><Icon name="sidebar" size={15} /></IconButton></div>
          <ul className="master-list" data-testid="character-list" ref={listEl}>
            {paged.items.map((c) => (
              <li key={c.id}>
                <button className={`master-item${c.id === selectedId ? " on" : ""}`} onClick={() => onSelect(c.id)} aria-label={c.name}>
                  <AvatarDot name={c.name} avatar={avatars[c.id]} size={36} />
                  <span className="side-text"><strong>{c.name}</strong><span>{c.variants.length ? `${c.variants.length + 1} versions · ` : ""}{c.description.slice(0, 60) || "No description"}</span></span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="side-empty">{characters.length ? "No character matches." : "No characters yet. Create or import one."}</li>}
          </ul>
          {paged.pager}
        </>}
        detail={detail ?? <EmptyDetail text="Select a character to edit it." />}
        collapsed={collapsed} onExpand={() => setCollapsed(false)}
      />
    </div>
  );
}

export function TrackersPage({ lead, tabs, trackers, selectedId, onSelect, onNew, onImport, detail }: {
  lead: ReactNode;
  /** The Library tabs (characters, personas…), shown in the toolbar. */
  tabs?: ReactNode;
  trackers: Tracker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** Adds trackers from Homunculus files (D-094). */
  onImport?: (files: File[]) => void;
  detail: ReactNode;
}) {
  useAutoOpen("trackers", trackers.map((t) => t.agent.id), selectedId, onSelect, !!detail);
  const [q, setQ] = useState("");
  const ordered = useCollectionOrder("trackers", trackers);
  const shown = ordered.items.filter((t) => t.agent.name.toLowerCase().includes(q.trim().toLowerCase()));
  // pages (D-130)
  const paged = usePaged(shown, `${q}|${shown.length}|${shown[0] ? JSON.stringify(Object.values(shown[0]).slice(0, 1)) : ""}`, { label: "trackers", keep: (t) => t.agent.id === selectedId, testId: "tracker-pager" });
  return (
    <div className="page">
      <Toolbar lead={lead} title="Trackers" center={tabs} subtitle="Values the AI keeps up to date after each reply"
        trailing={<>{onImport && <ImportButton what="trackers" onFiles={onImport} />}<Button onClick={onNew}><Icon name="plus" size={14} /> New Tracker</Button></>} />
      <MasterDetail
        list={<>
          <SearchBox value={q} onChange={setQ} label="Search trackers" />
          <ul className="master-list" data-testid="tracker-list">
            {paged.items.map((t) => (
              <li key={t.agent.id}>
                <button className={`master-item${t.agent.id === selectedId ? " on" : ""}`} onClick={() => onSelect(t.agent.id)}>
                  <span className="side-icon big"><Icon name="trackers" /></span>
                  <span className="side-text"><strong>{t.agent.name}</strong><span>{t.sets.length === 1 ? `${t.sets[0]!.fields.length} fields` : `${t.sets.length} field sets`}</span></span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="side-empty">{trackers.length ? "No tracker matches." : "No trackers yet."}</li>}
          </ul>
          {paged.pager}
        </>}
        detail={detail ?? <EmptyDetail text="Select a tracker to edit it. Enable trackers in the chat's Scene tab." />}
      />
    </div>
  );
}

export function PersonasPage({ lead, tabs, personas, avatars, defaultId, selectedId, importHelp, onSelect, onNew, onImport, detail }: {
  lead: ReactNode;
  /** The Library tabs (characters, personas…), shown in the toolbar. */
  tabs?: ReactNode;
  personas: Persona[];
  avatars: Record<string, Avatar>;
  defaultId: string | null;
  selectedId: string | "new" | null;
  importHelp: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: (files: File[]) => void;
  detail: ReactNode;
}) {
  useAutoOpen("personas", personas.map((x) => x.id), selectedId, onSelect, !!detail);
  const [q, setQ] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const ordered = useCollectionOrder("personas", personas);
  const shown = ordered.items.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  // pages (D-130)
  const paged = usePaged(shown, `${q}|${shown.length}|${shown[0] ? JSON.stringify(Object.values(shown[0]).slice(0, 1)) : ""}`, { label: "personas", keep: (p) => p.id === selectedId, testId: "persona-pager" });
  return (
    <div className="page">
      <Toolbar lead={lead} title="Personas" center={tabs} subtitle="Who you are in the story"
        trailing={<>
          <Button onClick={() => fileInput.current?.click()}><Icon name="import" size={14} /> Import</Button>
          <Help text={`Import your personas from SillyTavern. ${importHelp} You can pick several files at once.`} />
          <Button onClick={onNew}><Icon name="plus" size={14} /> New Persona</Button>
          <input ref={fileInput} type="file" accept=".json,.png,.jpg,.jpeg,.webp" multiple hidden data-testid="persona-import-input"
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onImport(files); }} />
        </>} />
      <MasterDetail
        list={<>
          <SearchBox value={q} onChange={setQ} label="Search personas" />
          <ul className="master-list" data-testid="persona-list">
            {paged.items.map((p) => (
              <li key={p.id}>
                <button className={`master-item${p.id === selectedId ? " on" : ""}`} onClick={() => onSelect(p.id)} aria-label={p.name}>
                  <AvatarDot name={p.name} avatar={avatars[p.id]} size={36} />
                  <span className="side-text">
                    <strong>{p.name}{p.id === defaultId && <span className="badge">default</span>}</strong>
                    <span>{p.variants.length ? `${p.variants.length + 1} versions · ` : ""}{p.description.slice(0, 60) || "No description"}</span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="side-empty">{personas.length ? "No persona matches." : "No personas yet. Without one, you are called “User”."}</li>}
          </ul>
          {paged.pager}
        </>}
        detail={detail ?? <EmptyDetail text="Select a persona to edit it." />}
      />
    </div>
  );
}

export function PresetsPage({ lead, tabs, presets, defaultId, selectedId, importHelp, onSelect, onNew, onImport, detail }: {
  lead: ReactNode;
  /** The Library tabs (characters, personas…), shown in the toolbar. */
  tabs?: ReactNode;
  presets: Preset[];
  defaultId: string;
  selectedId: string | null;
  importHelp: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: (files: File[]) => void;
  detail: ReactNode;
}) {
  useAutoOpen("presets", presets.map((x) => x.id), selectedId, onSelect, !!detail);
  const [q, setQ] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const ordered = useCollectionOrder("presets", presets);
  const shown = ordered.items.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  // pages (D-130)
  const paged = usePaged(shown, `${q}|${shown.length}|${shown[0] ? JSON.stringify(Object.values(shown[0]).slice(0, 1)) : ""}`, { label: "presets", keep: (p) => p.id === selectedId, testId: "preset-pager" });
  return (
    <div className="page">
      <Toolbar lead={lead} title="Presets" center={tabs} subtitle="Prompt blocks and sampling"
        trailing={<>
          <Button onClick={() => fileInput.current?.click()}><Icon name="import" size={14} /> Import</Button>
          <Help text={`Import presets from SillyTavern. ${importHelp} You can pick several files at once.`} />
          <Button onClick={onNew}><Icon name="plus" size={14} /> New Preset</Button>
          <input ref={fileInput} type="file" accept=".json" multiple hidden data-testid="preset-import-input"
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onImport(files); }} />
        </>} />
      <MasterDetail
        list={<>
          <SearchBox value={q} onChange={setQ} label="Search presets" />
          <ul className="master-list" data-testid="preset-list">
            {paged.items.map((p) => (
              <li key={p.id}>
                <button className={`master-item${p.id === selectedId ? " on" : ""}`} onClick={() => onSelect(p.id)} aria-label={p.name}>
                  <span className="side-icon big"><Icon name="preset" /></span>
                  <span className="side-text">
                    <strong>{p.name}{p.id === defaultId && <span className="badge">default</span>}</strong>
                    <span>{p.blocks.filter((b) => b.enabled).length} of {p.blocks.length} blocks on{p.contextSize ? ` · ${Math.round(p.contextSize / 1024)}k context` : ""}</span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="side-empty">{presets.length ? "No preset matches." : "No presets yet."}</li>}
          </ul>
          {paged.pager}
        </>}
        detail={detail ?? <EmptyDetail text="Select a preset to edit it." />}
      />
    </div>
  );
}

export function LorebooksPage({ lead, tabs, books, usedBy, selectedId, importHelp, onSelect, onNew, onImport, detail, globalIds, onSetGlobal, folders, inFolder, folderOf }: {
  lead: ReactNode;
  /** The Library tabs (characters, personas…), shown in the toolbar. */
  tabs?: ReactNode;
  /** The global books (read in every session and chat) and how to change that list. */
  globalIds: string[];
  onSetGlobal: (ids: string[]) => void;
  books: Lorebook[];
  /** Short "who uses it" per book id. */
  usedBy: Record<string, string>;
  selectedId: string | null;
  importHelp: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: (files: File[]) => void;
  detail: ReactNode;
  /** Folders (round 3): shown when not searching; a search looks in all of them. */
  folders?: ReactNode;
  inFolder?: (id: string) => boolean;
  folderOf?: (id: string) => string;
}) {
  const [q, setQ] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const searching = q.trim() !== "";
  const ordered = useCollectionOrder("lorebooks", books);
  const shown = ordered.items.filter((b) => (searching ? b.name.toLowerCase().includes(q.trim().toLowerCase()) : !inFolder || inFolder(b.id)));
  // pages (D-130)
  const paged = usePaged(shown, `${q}|${shown.length}|${shown[0] ? JSON.stringify(Object.values(shown[0]).slice(0, 1)) : ""}`, { label: "lorebooks", keep: (b) => b.id === selectedId, testId: "lorebook-pager" });
  const from = (b: Lorebook) => (b.source.kind === "card" ? "from a card" : b.source.kind === "stFile" ? "from SillyTavern" : "");
  return (
    <div className={`page lore-page${detail ? " has-detail" : ""}`}>
      <Toolbar lead={lead} title="Lorebooks" center={tabs} subtitle="Lore that goes into the prompt when its keywords come up"
        trailing={<>
          <Button onClick={() => fileInput.current?.click()}><Icon name="import" size={14} /> Import</Button>
          <Help text={`Import lorebooks from SillyTavern. ${importHelp} You can pick several files at once. Characters and personas that name a book get it linked.`} />
          <Button onClick={onNew}><Icon name="plus" size={14} /> New Lorebook</Button>
          <input ref={fileInput} type="file" accept=".json" multiple hidden data-testid="lorebook-import-input"
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onImport(files); }} />
        </>} />
      {/* SillyTavern's "Active World(s) for all chats", as a strip above the list and the editor (always in sight) */}
      <section className="lore-globals" aria-label="Global lorebooks" data-testid="lore-globals">
        <span className="lore-globals-title">
          <strong>Global Lorebooks</strong>
          <Help text="Applies to all chats. Override in a chat's Prompt tab." />
        </span>
        <LorebookChips bare ids={globalIds} books={books} onChange={onSetGlobal} onOpen={onSelect} help="" emptyText="None selected." addLabel="+ Add a Global Lorebook" />
      </section>
      <MasterDetail
        list={<>
          <SearchBox value={q} onChange={setQ} label="Search lorebooks" />
          {!searching && folders}
          <ul className="master-list" data-testid="lorebook-list">
            {paged.items.map((b) => (
              <li key={b.id}>
                <button className={`master-item${b.id === selectedId ? " on" : ""}`} onClick={() => onSelect(b.id)} aria-label={b.name} {...dragItem(b.id, b.name)}>
                  <span className="side-icon big"><Icon name="book" /></span>
                  <span className="side-text">
                    <strong>{b.name}</strong>
                    <span>{[searching ? folderOf?.(b.id) : "", `${b.entries.length} entr${b.entries.length === 1 ? "y" : "ies"}`, usedBy[b.id] || "not used", from(b)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="side-empty">{searching ? "No lorebook matches." : books.length ? "Nothing here yet. Drag lorebooks onto a folder, or pick its Folder in the editor." : "Create or import your first lorebook."}</li>}
          </ul>
          {paged.pager}
        </>}
        detail={detail ?? <EmptyDetail text="Select a lorebook to edit it." />}
      />
    </div>
  );
}

const KIND_LABEL: Record<TrashItem["kind"], string> = { session: "Session", character: "Character", persona: "Persona", preset: "Preset", lorebook: "Lorebook", story: "Story", narrator: "Narrator", npc: "NPC", kit: "Kit" };

export function TrashPage({ lead, tabs, items, onRestore, onDeleteForever, onEmpty }: {
  lead: ReactNode;
  /** The Library tabs (characters, personas…), shown in the toolbar. */
  tabs?: ReactNode;
  items: TrashItem[];
  onRestore: (item: TrashItem) => void;
  onDeleteForever: (item: TrashItem) => void;
  onEmpty: () => void;
}) {
  const ordered = useCollectionOrder("trash", items);
  const paged = usePaged(ordered.items, `${ordered.items.length}|${ordered.mode ?? ""}`, { label: "items", testId: "trash-pager" }); // pages (D-130)
  return (
    <div className="page">
      <Toolbar lead={lead} title="Trash" center={tabs} subtitle={items.length ? `${items.length} item(s)` : "Empty"}
        trailing={<>
          <Help text="Restore items from Trash. Delete Forever is permanent." />
          {items.length > 0 && <ConfirmButton label="Empty Trash" confirmLabel="Click Again to Empty" onConfirm={onEmpty} />}
        </>} />
      <div className="trash-page">
        <ul className="trash-list" data-testid="trash-list">
          {paged.items.map((it) => (
            <li key={`${it.kind}:${it.id}`} className="trash-item">
              <span className="trash-kind">{KIND_LABEL[it.kind]}</span>
              <span className="side-text"><strong>{it.name}</strong><span>moved to the Trash {new Date(it.trashedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span></span>
              <Button small onClick={() => onRestore(it)}>Restore</Button>
              <ConfirmButton label="Delete Forever" confirmLabel="Click Again to Delete" className="btn btn-plain btn-small danger-text" onConfirm={() => onDeleteForever(it)} />
            </li>
          ))}
          {items.length === 0 && <li className="side-empty">The Trash is empty.</li>}
        </ul>
        {paged.pager}
      </div>
    </div>
  );
}

export function EmptyDetail({ text }: { text: string }) {
  return <div className="empty-detail"><p>{text}</p></div>;
}
