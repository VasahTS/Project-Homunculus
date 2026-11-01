// Homunculus 2 — cards with a view sheet beside them (the Marinara-style library Daniel liked; PASSAGEM of v1,
// "Ideias de interface do Marinara", item 3). Author: CLAUDE, 2026-10-29 (slice 4, D-029).
// A grid of cards (picture, name, who made it, a short summary, tags, size); clicking one opens its sheet on the right
// (big picture, scenario, description, opening, actions). Edit leads to the full editor. Used by Library → Characters
// and the Vault (stories, NPCs).
import { useRef, useState, type ReactNode } from "react";
import type { Avatar, Character } from "@homunculus/schemas";
import { effectiveCharacter, estimateTokens } from "@homunculus/core";
import { dragItem } from "./Folders.tsx";
import { avatarUrl } from "../files.ts";
import { Help } from "./Help.tsx";
import { Button, Icon, Segmented } from "./kit.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { CollectionTools } from "./CollectionTools.tsx";
import type { LibraryArea } from "./Sidebar.tsx";

const LIBRARY_TABS: Array<{ area: LibraryArea; label: string }> = [
  { area: "personas", label: "Personas" }, { area: "lorebooks", label: "Lorebooks" },
  { area: "presets", label: "Presets" }, { area: "regex", label: "Regex" }, { area: "trackers", label: "Trackers" }, { area: "agents", label: "Agents" }, { area: "trash", label: "Trash" },
];

/** The kinds of things in the Library, as tabs at the top of its pages. */
export function LibraryTabs({ area, onOpen }: { area: LibraryArea; onOpen: (a: LibraryArea) => void }) {
  return (
    <div className="place-tabs" data-testid="library-list">
      <Segmented tabs small label="Library" value={area} onChange={onOpen} options={LIBRARY_TABS.map((t) => ({ value: t.area, label: t.label }))} />
    </div>
  );
}

export type VaultTab = "stories" | "kits" | "narrators" | "npcs";

/** The kinds of things in the Vault, as tabs. */
export function VaultTabs({ tab, onOpen }: { tab: VaultTab; onOpen: (t: VaultTab) => void }) {
  return (
    <div className="place-tabs" data-testid="vault-tabs">
      <Segmented tabs small label="Vault" value={tab} onChange={onOpen}
        options={[{ value: "stories", label: "Stories" }, { value: "kits", label: "Kits" }, { value: "narrators", label: "Narrators" }, { value: "npcs", label: "NPCs" }]} />
    </div>
  );
}

/** A card's picture: the image, else a soft tile with the first letter. */
export function CardPicture({ name, avatar, className = "" }: { name: string; avatar?: Avatar; className?: string }) {
  return avatar
    ? <img className={`card-pic ${className}`.trim()} src={avatarUrl(avatar)} alt="" />
    : <span className={`card-pic letter ${className}`.trim()} aria-hidden>{(name || "?").slice(0, 1).toUpperCase()}</span>;
}

/** Rough size of a card in the prompt: what a session sends of it. */
export function cardTokens(c: Character): number {
  return estimateTokens([c.description, c.personality, c.scenario, c.systemPrompt, c.postHistoryInstructions, c.exampleMessages, c.firstMessages[0] ?? ""].join("\n"));
}

export const shortTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k tok` : `${n} tok`);

/** One card of a grid. */
export function GalleryCard({ name, avatar, by, summary, tags = [], size, selected, onClick, picture, dragId }: {
  name: string; avatar?: Avatar | undefined; by?: string | undefined; summary?: string | undefined; tags?: string[]; size?: string | undefined; selected: boolean; onClick: () => void;
  /** A picture of its own (e.g. a story's people), instead of the avatar. */
  picture?: ReactNode;
  /** Can be dragged onto a folder (round 3). */
  dragId?: string | undefined;
}) {
  return (
    <button type="button" className={`gallery-card${selected ? " on" : ""}`} onClick={onClick} aria-pressed={selected} aria-label={name} {...(dragId ? dragItem(dragId, name, avatar) : {})}>
      {picture ?? <CardPicture name={name} avatar={avatar} />}
      <span className="gallery-body">
        <strong className="gallery-name">{name}</strong>
        {by && <span className="gallery-by">{by}</span>}
        {summary && <span className="gallery-summary">{summary}</span>}
        {(tags.length > 0 || size) && (
          <span className="gallery-meta">
            {tags.slice(0, 3).map((t) => <span key={t} className="gallery-tag">{t}</span>)}
            {tags.length > 3 && <span className="gallery-more">+{tags.length - 3}</span>}
            <span className="gallery-size">{size}</span>
          </span>
        )}
      </span>
    </button>
  );
}

/** A labelled box of text in a view sheet (Scenario, Description…); long text is cut to a few lines. */
export function SheetSection({ title, children, lines = 4, prose = false }: { title: string; children: ReactNode; lines?: number; prose?: boolean }) {
  return (
    <section className="vs-sec">
      <h3>{title}</h3>
      <div className={`vs-text${prose ? " prose" : ""}`} style={{ WebkitLineClamp: lines }}>{children}</div>
    </section>
  );
}

/** Library → Characters: the cards, and the selected one's sheet (or the editor, when editing). */
export function CharacterGallery({ lead, tabs, title = "Library", characters, avatars, selectedId, importHelp, onSelect, onNew, onImport, sheet, folders, inFolder, folderOf, chatsOf, activity = {} }: {
  lead: ReactNode;
  tabs?: ReactNode;
  title?: string;
  characters: Character[];
  /** The folders above the cards (round 3): shown when not searching. */
  folders?: ReactNode;
  /** Is this character in the folder open now? (Without a search only those are shown.) */
  inFolder?: (c: Character) => boolean;
  /** "Fantasy › Elves" for a search result. */
  folderOf?: (c: Character) => string;
  /** "2 chats · today" under a card. */
  chatsOf?: (c: Character) => string;
  activity?: Record<string, number>;
  avatars: Record<string, Avatar>;
  selectedId: string | null;
  importHelp: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: (files: File[]) => void;
  sheet: ReactNode;
}) {
  const [q, setQ] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState(false);
  const searching = q.trim() !== "";
  // a search looks in every folder (Daniel: "you can search in All and it will show everything")
  const filtered = searching
    ? characters.filter((c) => [c.name, c.creator, ...c.tags].some((x) => x.toLowerCase().includes(q.trim().toLowerCase())))
    : inFolder ? characters.filter(inFolder) : characters;
  const shown = filtered.filter((c) => !recent || (activity[c.id] ?? 0) > 0).sort((a, b) => (activity[b.id] ?? 0) - (activity[a.id] ?? 0));
  return (
    <div className="page collection-page" data-region="collection">
      <Toolbar lead={lead} title={title} subtitle="The people you write with. Their cards and conversations." center={tabs}
        trailing={<>
          <Button onClick={() => fileInput.current?.click()}><Icon name="import" size={14} /> Import</Button>
          <Help text={`Import characters from SillyTavern (or sites that use the same cards). ${importHelp} You can pick several files at once.`} />
          <Button variant="prominent" onClick={onNew}><Icon name="plus" size={14} /> New Character</Button>
          <input ref={fileInput} type="file" accept=".png,.json" multiple hidden data-testid="import-input"
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onImport(files); }} />
        </>} />
      <CollectionTools label="characters" query={q} onQuery={setQ} recent={recent} onRecent={setRecent} />
      <div className="gallery-layout">
        <div className="gallery-grid">
          {!searching && folders}
          <div className="collection-heading"><h2>{searching ? "Search results" : "Your characters"}</h2><span>{shown.length} characters</span></div>
          <div className="gallery-cards" data-testid="character-list">
          {shown.map((c) => (
            <GalleryCard key={c.id} name={c.name} avatar={avatars[c.id]} selected={c.id === selectedId} onClick={() => onSelect(c.id)} dragId={c.id}
              by={searching && folderOf?.(c) ? `in ${folderOf(c)}` : chatsOf ? chatsOf(c) : c.variants.length ? `${c.variants.length + 1} versions: Main, ${c.variants.map((v) => v.label).join(", ")}` : c.creator ? `by ${c.creator}` : undefined}
              summary={(c.scenario.trim() || c.description.trim()).slice(0, 220) || "No description"} tags={c.tracked === false ? ["Not tracked", ...c.tags] : c.tags} size={shortTokens(cardTokens(c))} />
          ))}
          </div>
          {characters.length === 0 && <button type="button" className="gallery-card add" onClick={() => fileInput.current?.click()}>
            <Icon name="import" size={26} />
            <span>Import cards from SillyTavern</span>
            <span className="hint">PNG or JSON, several at once</span>
          </button>}
          {characters.length > 0 && shown.length === 0 && <p className="hint gallery-empty">{searching ? "No character matches." : "Nothing here yet. Drag cards here, or pick a Folder on a card's sheet."}</p>}
        </div>
        <aside className="gallery-sheet" data-region="sheet">
          <div className="collection-detail-label">Character details</div>
          {sheet ?? <div className="empty-detail"><p>Pick a character to see it here.</p><p className="hint">Chat Now starts a 1:1 chat. Edit opens the full editor.</p></div>}
        </aside>
      </div>
    </div>
  );
}

/**
 * The view sheet of a character: the whole character first, then its chats (round 3, D-036: "mostrar o personagem
 * completo antes de abrir o chat"). Versions are tabs (what you see is that version); Continue opens the newest chat,
 * New Chat starts one with the version shown.
 */
export function CharacterSheet({ c, avatar, avatars = {}, lorebookNames, storyNames, onChat, onEdit, onTurnIntoStory, onExport, onContinue, latestTitle, chats, folder }: {
  c: Character; avatar?: Avatar | undefined; avatars?: Record<string, Avatar>; lorebookNames: string[]; storyNames: string[];
  /** A new chat with this version (null = Main). */
  onChat: (variantId: string | null) => void; onEdit: () => void; onTurnIntoStory: () => void; onExport?: (() => void) | undefined;
  /** Opens the newest chat with this character. */
  onContinue?: (() => void) | undefined;
  latestTitle?: string | undefined;
  /** The character's chats (a ChatList). */
  chats?: ReactNode;
  /** The "Folder" pick. */
  folder?: ReactNode;
}) {
  const [vid, setVid] = useState<string | null>(null);
  const shown = effectiveCharacter(c, vid);
  const pic = (vid ? avatars[`${c.id}#${vid}`] : undefined) ?? avatar;
  const facts = [c.tracked === false && "not tracked in the Scene", c.creator && `by ${c.creator}`, shown.firstMessages.length > 1 && `${shown.firstMessages.length} greetings`,
    lorebookNames.length && `lorebook ${lorebookNames.join(", ")}`].filter(Boolean);
  return (
    <div className="view-sheet" data-testid="character-sheet">
      <CardPicture name={shown.name} avatar={pic} className="vs-pic" />
      <div className="vs-head">
        <div className="vs-title"><h2>{shown.name}</h2>{facts.length > 0 && <span className="hint">{facts.join(", ")}</span>}</div>
        <span className="gallery-tag big">~{shortTokens(cardTokens(shown))}</span>
      </div>
      {c.variants.length > 0 && (
        <Segmented small label="Version" value={vid ?? ""} onChange={(v) => setVid(v || null)}
          options={[{ value: "", label: "Main" }, ...c.variants.map((v) => ({ value: v.id, label: v.label }))]} />
      )}
      <div className="vs-actions">
        {onContinue && <Button variant="prominent" onClick={onContinue} data-testid="continue-chat">Continue “{latestTitle}”</Button>}
        <Button variant={onContinue ? "bordered" : "prominent"} onClick={() => onChat(vid)} data-testid="new-chat-with">{onContinue ? "+ New Chat" : "Chat Now"}</Button>
        <Button onClick={onEdit}><Icon name="pencil" size={13} /> Edit</Button>
        <Button onClick={onTurnIntoStory} title="For cards that are really a narrator or a whole world: makes a story told by this card. The card is not changed.">Turn into a Story</Button>
        {onExport && <Button onClick={onExport}>Export</Button>}
      </div>
      {folder && <div className="vs-folder">{folder}</div>}
      {storyNames.length > 0 && <p className="hint">Tells the story {storyNames.map((n) => `“${n}”`).join(", ")}.</p>}
      {shown.tags.length > 0 && <div className="vs-tags">{shown.tags.map((t) => <span key={t} className="gallery-tag">{t}</span>)}</div>}
      {shown.description.trim() && <SheetSection title="Description" lines={8}>{shown.description}</SheetSection>}
      {shown.personality.trim() && <SheetSection title="Personality">{shown.personality}</SheetSection>}
      {shown.scenario.trim() && <SheetSection title="Scenario" prose>{shown.scenario}</SheetSection>}
      {shown.firstMessages[0]?.trim() && <SheetSection title={shown.firstMessages.length > 1 ? `Opening message 1 of ${shown.firstMessages.length}` : "Opening message"} prose lines={5}>{shown.firstMessages[0]}</SheetSection>}
      {chats && <section className="vs-sec vs-chats"><h3>Chats</h3>{chats}</section>}
    </div>
  );
}
