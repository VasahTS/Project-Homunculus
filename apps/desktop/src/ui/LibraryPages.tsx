// Homunculus 2 — Library pages: a list on the left, the selected item on the right. Author: CLAUDE, 2026-10-27 (D-018);
// 2026-10-28 (slice 1): Personas and the Trash.
// Characters and Trackers share this master-detail shape; future library kinds (personas, lorebooks,
// presets, agents) reuse it.
import { dragItem } from "./Folders.tsx";
import { useRef, useState, type ReactNode } from "react";
import type { Avatar, Character, Lorebook, Persona, Preset, TrashItem } from "@homunculus/schemas";
import { ConfirmButton, Help } from "./Help.tsx";
import { LorebookChips } from "./LorePanels.tsx";
import { Button, Icon, IconButton } from "./kit.tsx";
import { AvatarDot } from "./Sidebar.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { useEnter } from "./motion.ts";
import type { Tracker } from "../trackers.ts";

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
  // the list arrives one row after another when the page opens (D-072)
  const listEl = useRef<HTMLUListElement>(null);
  useEnter(listEl, "open", undefined, { y: 8, stagger: 28, duration: 520, max: 12 });
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
            {shown.map((c) => (
              <li key={c.id}>
                <button className={`master-item${c.id === selectedId ? " on" : ""}`} onClick={() => onSelect(c.id)} aria-label={c.name}>
                  <AvatarDot name={c.name} avatar={avatars[c.id]} size={36} />
                  <span className="side-text"><strong>{c.name}</strong><span>{c.variants.length ? `${c.variants.length + 1} versions · ` : ""}{c.description.slice(0, 60) || "No description"}</span></span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="side-empty">{characters.length ? "No character matches." : "No characters yet. Create or import one."}</li>}
          </ul>
        </>}
        detail={detail ?? <EmptyDetail text="Pick a character on the left, or create or import one." />}
        collapsed={collapsed} onExpand={() => setCollapsed(false)}
      />
    </div>
  );
}

export function TrackersPage({ lead, tabs, trackers, selectedId, onSelect, onNew, detail }: {
  lead: ReactNode;
  /** The Library tabs (characters, personas…), shown in the toolbar. */
  tabs?: ReactNode;
  trackers: Tracker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  detail: ReactNode;
}) {
  const [q, setQ] = useState("");
  const shown = trackers.filter((t) => t.agent.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="page">
      <Toolbar lead={lead} title="Trackers" center={tabs} subtitle="Values the AI keeps up to date after each reply"
        trailing={<Button onClick={onNew}><Icon name="plus" size={14} /> New Tracker</Button>} />
      <MasterDetail
        list={<>
          <SearchBox value={q} onChange={setQ} label="Search trackers" />
          <ul className="master-list" data-testid="tracker-list">
            {shown.map((t) => (
              <li key={t.agent.id}>
                <button className={`master-item${t.agent.id === selectedId ? " on" : ""}`} onClick={() => onSelect(t.agent.id)}>
                  <span className="side-icon big"><Icon name="trackers" /></span>
                  <span className="side-text"><strong>{t.agent.name}</strong><span>{t.sets.length === 1 ? `${t.sets[0]!.fields.length} fields` : `${t.sets.length} field sets`}</span></span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="side-empty">{trackers.length ? "No tracker matches." : "No trackers yet."}</li>}
          </ul>
        </>}
        detail={detail ?? <EmptyDetail text="Pick a tracker on the left, or create a new one. Switch trackers on per session in the inspector's Scene tab." />}
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
  const [q, setQ] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const shown = personas.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
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
            {shown.map((p) => (
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
        </>}
        detail={detail ?? <EmptyDetail text="Pick a persona on the left, or create or import one. The default persona is used by every session that doesn't pick its own." />}
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
  const [q, setQ] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const shown = presets.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="page">
      <Toolbar lead={lead} title="Presets" center={tabs} subtitle="The recipe of the prompt"
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
            {shown.map((p) => (
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
        </>}
        detail={detail ?? <EmptyDetail text="Pick a preset on the left, or create or import one. Each session picks its preset in the inspector's Prompt tab." />}
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
  const shown = books.filter((b) => (searching ? b.name.toLowerCase().includes(q.trim().toLowerCase()) : !inFolder || inFolder(b.id)));
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
          <Help text="Read in every session and chat, like SillyTavern’s “Active World(s) for all chats”. A session can still switch one off in its Prompt tab." />
        </span>
        <LorebookChips bare ids={globalIds} books={books} onChange={onSetGlobal} onOpen={onSelect} help="" emptyText="None yet. Add one to read it in every chat." addLabel="+ Add a Global Lorebook" />
      </section>
      <MasterDetail
        list={<>
          <SearchBox value={q} onChange={setQ} label="Search lorebooks" />
          {!searching && folders}
          <ul className="master-list" data-testid="lorebook-list">
            {shown.map((b) => (
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
            {shown.length === 0 && <li className="side-empty">{searching ? "No lorebook matches." : books.length ? "Nothing here yet. Drag lorebooks onto a folder, or pick its Folder in the editor." : "No lorebooks yet. Import one from SillyTavern or create one."}</li>}
          </ul>
        </>}
        detail={detail ?? <EmptyDetail text="Pick a lorebook on the left, or create or import one. A lorebook holds pieces of lore that go into the prompt when their keywords show up in the chat." />}
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
  return (
    <div className="page">
      <Toolbar lead={lead} title="Trash" center={tabs} subtitle={items.length ? `${items.length} item(s)` : "Empty"}
        trailing={<>
          <Help text="Things you delete come here first, so nothing is lost by accident. Restore puts them back as they were. Delete Forever can't be undone." />
          {items.length > 0 && <ConfirmButton label="Empty Trash" confirmLabel="Click Again to Empty" onConfirm={onEmpty} />}
        </>} />
      <div className="trash-page">
        <ul className="trash-list" data-testid="trash-list">
          {items.map((it) => (
            <li key={`${it.kind}:${it.id}`} className="trash-item">
              <span className="trash-kind">{KIND_LABEL[it.kind]}</span>
              <span className="side-text"><strong>{it.name}</strong><span>moved to the Trash {new Date(it.trashedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span></span>
              <Button small onClick={() => onRestore(it)}>Restore</Button>
              <ConfirmButton label="Delete Forever" confirmLabel="Click Again to Delete" className="btn btn-plain btn-small danger-text" onConfirm={() => onDeleteForever(it)} />
            </li>
          ))}
          {items.length === 0 && <li className="side-empty">The Trash is empty.</li>}
        </ul>
      </div>
    </div>
  );
}

export function EmptyDetail({ text }: { text: string }) {
  return <div className="empty-detail"><p>{text}</p></div>;
}
