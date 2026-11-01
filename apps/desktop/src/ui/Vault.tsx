// Homunculus 2 — the Vault: Stories, Narrators and NPCs (slice 4, D-029). Author: CLAUDE, 2026-10-29.
// Same shape as Library → Characters: cards on the left, the selected one's sheet on the right. Narrators and NPCs
// are small, so their sheet IS their editor (Save); a story opens its own page (StoryPage.tsx).
// A new story starts from "How do you want to play?" (NewStorySheet).
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Avatar, Character, Lorebook, Narrator, NarratorFields, Npc, Session, SetupLayer, Story, TrackerField, TrackerSchema, UserRole } from "@homunculus/schemas";
import { blocksText, narratorBlocks, narratorText, npcSheetFields, npcTagline, type ListItem } from "@homunculus/core";
import { ConfirmButton, Help } from "./Help.tsx";
import { Button, Icon, IconButton, Switch } from "./kit.tsx";
import { CardPicture, GalleryCard, SheetSection, type VaultTab } from "./Gallery.tsx";
import { StoryMark } from "./Sidebar.tsx";
import { ImagePicker } from "./ImagePicker.tsx";
import { SetupFields, SetupSection, type StorySetupProps } from "./SetupFields.tsx";
import { layerHasTracker } from "../trackers.ts";
import { CollectionTools } from "./CollectionTools.tsx";
import { Toolbar } from "./Toolbar.tsx";

/** A field set an NPC sheet can use (a Scene: Characters set, or any set with per-character fields). */
export interface FieldSetOption { id: string; label: string; schema: TrackerSchema }

export const ROLE_LABEL: Record<UserRole, string> = { player: "You play a character", coauthor: "Written together", director: "Director mode" };

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ------------------------------------------------------------------------------------------------ the Vault page
export function VaultPage({ lead, tab, selectedId, onSelect, newButton, search, onSearch, cards, sheet, emptyText, folders, title = "Library", activity = {}, wide = false }: {
  title?: string; activity?: Record<string, number>;
  /** A narrow list beside a wide editor (narrators, D-059): everything to edit and compare without scrolling the page. */
  wide?: boolean;
  lead: ReactNode; tab: VaultTab; selectedId: string | null; onSelect: (id: string) => void;
  newButton: ReactNode; search: string; onSearch: (q: string) => void;
  cards: Array<{ id: string; name: string; by?: string | undefined; summary?: string; tags?: string[]; size?: string; picture?: ReactNode; dragId?: string; group?: string }>;
  sheet: ReactNode; emptyText: string;
  /** The folders (round 3): shown when not searching; `cards` are then the open folder's. */
  folders?: ReactNode;
}) {
  const [recent, setRecent] = useState(false);
  const isStories = tab === "stories";
  const visible = cards.filter((c) => !isStories || !recent || (activity[c.id] ?? 0) > 0).sort((a, b) => isStories ? (activity[b.id] ?? 0) - (activity[a.id] ?? 0) : 0);
  return (
    <div className={`page${isStories ? " collection-page" : " resource-page"}`} data-region="collection">
      <Toolbar lead={lead} title={title} subtitle={isStories ? "Your worlds, their cast and every conversation." : undefined}
        trailing={<>
          {!isStories && <label className="search-box toolbar-search"><Icon name="search" size={13} /><input aria-label={`Search ${tab}`} placeholder={`Search ${tab}`} value={search} onChange={(e) => onSearch(e.target.value)} /></label>}
          {newButton}
        </>} />
      {isStories && <CollectionTools label="stories" query={search} onQuery={onSearch} recent={recent} onRecent={setRecent} />}
      <div className={`gallery-layout${wide ? " wide-sheet" : ""}`}>
        <div className="gallery-grid">
          {!search.trim() && folders}
          <div className="gallery-cards" data-testid={`vault-${tab}`}>
            {isStories && <div className="collection-heading"><h2>{search ? "Search results" : "Your stories"}</h2><span>{visible.length} stories</span></div>}
            {visible.map((c, i) => <Fragment key={c.id}>
              {c.group && c.group !== visible[i - 1]?.group && <div className="gallery-group" role="heading" aria-level={3}>{c.group}</div>}
              <GalleryCard {...c} selected={c.id === selectedId} onClick={() => onSelect(c.id)} />
            </Fragment>)}
          </div>
          {visible.length === 0 && <p className="hint gallery-empty">{search ? "Nothing matches, in any folder." : emptyText}</p>}
        </div>
        {(isStories || selectedId) && <aside className="gallery-sheet" data-region="sheet">{isStories && <div className="collection-detail-label">Story details</div>}{sheet}</aside>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ a story's sheet
export function StorySheet({ story, narratorName, npcNames, cardNames = [], avatar, ownImage = false, onImage, onOpen, onNewChat, onContinue, latestTitle, onDuplicate, onSaveAsKit, onTrash, folder, chats }: {
  story: Story; narratorName: string; npcNames: string[]; cardNames?: string[]; avatar?: Avatar | undefined;
  /** The picture shown is the story's own (not its narrator's). */
  ownImage?: boolean;
  /** Sets the story's own picture (null removes it). */
  onImage?: ((file: File | null) => void) | undefined;
  /** Opens the story's page (everything about it, editable). */
  onOpen: () => void;
  /** A new chat with the story's first opening and setup. */
  onNewChat: () => void;
  /** Opens the story's newest chat. */
  onContinue?: (() => void) | undefined;
  latestTitle?: string | undefined;
  onDuplicate: () => void; onSaveAsKit?: (() => void) | undefined; onTrash: () => void;
  folder?: ReactNode;
  /** The story's chats (a ChatList). */
  chats?: ReactNode;
}) {
  // like a character's sheet (Daniel, 10/29: "the Stories tab like the character one for now"): the whole story
  // first, Continue / + New Chat, then its chats
  const people = [...cardNames, ...npcNames];
  const opening = story.openings.find((o) => o.trim());
  return (
    <div className="view-sheet" data-testid="story-sheet">
      {onImage
        ? <div className="vs-pic-pick"><ImagePicker name={story.name} avatar={avatar} own={ownImage} onChange={onImage} shape="square" size={96} testId="story-image" /></div>
        : <StoryMark name={story.name} avatar={avatar} size={96} />}
      <div className="vs-head">
        <div className="vs-title"><h2>{story.name}</h2><span className="hint">Told by {narratorName} · {ROLE_LABEL[story.userRole]}</span></div>
      </div>
      <div className="vs-actions">
        {onContinue && <Button variant="prominent" onClick={onContinue} data-testid="continue-story-chat">Continue “{latestTitle}”</Button>}
        <Button variant={onContinue ? "bordered" : "prominent"} onClick={onNewChat} data-testid="story-new-chat">{onContinue ? "+ New Chat" : "Play"}</Button>
        <Button onClick={onOpen}><Icon name="pencil" size={13} /> Open Story</Button>
        <Button onClick={onDuplicate}>Duplicate</Button>
        {onSaveAsKit && <Button onClick={onSaveAsKit} title="Keep how this story starts in Library › Kits, to start new stories from it">Save as Kit</Button>}
        <ConfirmButton label="Move to Trash" confirmLabel="Click Again" className="btn btn-plain btn-small danger-text" onConfirm={onTrash} />
      </div>
      {folder && <div className="vs-folder">{folder}</div>}
      {story.description.trim() && <SheetSection title="About" prose>{story.description}</SheetSection>}
      {story.scenario.trim() && <SheetSection title="Scenario" prose>{story.scenario}</SheetSection>}
      {people.length > 0 && <SheetSection title="People">{people.join(", ")}</SheetSection>}
      {opening && <SheetSection title={story.openings.filter((o) => o.trim()).length > 1 ? `Opening 1 of ${story.openings.filter((o) => o.trim()).length}` : "Opening"} prose lines={5}>{opening}</SheetSection>}
      {chats && <section className="vs-sec vs-chats"><h3>Chats</h3>{chats}</section>}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ a Kit's sheet
/** A Kit (round 3, D-036): what a story starts with, kept to start new stories from. */
export function KitSheet({ kit, narratorName, npcNames, cardNames, avatar, onImage, onStart, onOpen, onDuplicate, onTrash, folder }: {
  kit: Story; narratorName: string; npcNames: string[]; cardNames: string[]; avatar?: Avatar | undefined;
  onImage?: ((file: File | null) => void) | undefined;
  onStart: () => void; onOpen: () => void; onDuplicate: () => void; onTrash: () => void; folder?: ReactNode;
}) {
  const openings = kit.openings.filter((o) => o.trim()).length;
  return (
    <div className="view-sheet" data-testid="kit-sheet">
      <div className="vs-cover">{onImage ? <ImagePicker name={kit.name} avatar={avatar} own={!!avatar} onChange={onImage} shape="square" size={72} testId="kit-image" /> : <StoryMark name={kit.name} avatar={avatar} size={72} />}</div>
      <div className="vs-head">
        <div className="vs-title"><h2>{kit.name}</h2><span className="hint">Kit · told by {narratorName} · {ROLE_LABEL[kit.userRole]}</span></div>
      </div>
      <div className="vs-actions">
        <Button variant="prominent" onClick={onStart} data-testid="kit-start">Start a Story</Button>
        <Button onClick={onOpen}>Edit Kit</Button>
        <Button onClick={onDuplicate}>Duplicate</Button>
        <span className="spacer" />
        <ConfirmButton label="Move to Trash" confirmLabel="Click Again" className="btn btn-plain btn-small danger-text" onConfirm={onTrash} />
      </div>
      <p className="hint">Start a Story makes a new story with a copy of all this. Changing the Kit later does not change the stories started from it.</p>
      {kit.description.trim() && <SheetSection title="About" prose>{kit.description}</SheetSection>}
      {kit.scenario.trim() && <SheetSection title="Scenario" prose>{kit.scenario}</SheetSection>}
      {(npcNames.length > 0 || cardNames.length > 0) && <SheetSection title="People">{[...cardNames, ...npcNames].join(", ")}</SheetSection>}
      <SheetSection title="Openings">{openings ? `${openings} opening${openings === 1 ? "" : "s"}` : "None: the narrator starts."}</SheetSection>
      {folder}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ narrators
// D-059 (Daniel, 31/10): less busy, nothing below the fold to edit or compare. The narrator is its blocks (Role, Story,
// NPCs, Dialogue… each with a switch), one Style line whose choices open only on "Change…", and what the AI gets beside
// it. A blank narrator offers "Start from" any other narrator.

const MODE_LABEL: Record<UserRole, string> = { player: "You play a character", coauthor: "Written together", director: "Director mode" };
const STYLE_CHOICES: Array<{ key: keyof NarratorFields["style"]; label: string; options: string[] }> = [
  { key: "pov", label: "Point of view", options: ["first person", "second person", "third person", "third person omniscient"] },
  { key: "tense", label: "Tense", options: ["past", "present"] },
  { key: "length", label: "Length", options: ["short, about 150 words", "about 300–500 words", "long, about 700 words"] },
  { key: "tone", label: "Tone", options: ["dark", "adventurous", "light", "literary", "horror", "romantic", "comedic"] },
  { key: "pacing", label: "Pacing", options: ["slow burn", "steady", "fast"] },
  { key: "dialogue", label: "Dialogue", options: ["mostly dialogue", "balanced", "mostly narration"] },
  { key: "mature", label: "Mature scenes", options: ["fade out", "shown when the story leads there"] },
];
const firstLine = (t: string) => t.replace(/<\/?[a-z_]+>/gi, "").trim().split("\n").find((l) => l.trim())?.trim() ?? "";
const newBlockId = () => `block-${Math.random().toString(36).slice(2, 9)}`;

/** The fields of a narrator, for the Library and for a narrator written for one story. `starts` = narrators a blank one can start from. */
export function NarratorForm({ value, onChange, starts = [] }: { value: NarratorFields; onChange: (n: NarratorFields) => void; starts?: Narrator[] }) {
  const set = <K extends keyof NarratorFields>(k: K, v: NarratorFields[K]) => onChange({ ...value, [k]: v });
  const blocks = narratorBlocks(value);
  const setBlocks = (b: NarratorFields["blocks"]) => onChange({ ...value, blocks: b, instructions: blocksText(b) });
  const [open, setOpen] = useState<string | null>(null);
  const [styling, setStyling] = useState(false);
  const style = (k: keyof NarratorFields["style"], v: string) => onChange({ ...value, style: { ...value.style, [k]: v } });
  const move = (i: number, d: -1 | 1) => { const b = [...blocks]; const j = i + d; if (j < 0 || j >= b.length) return; [b[i], b[j]] = [b[j]!, b[i]!]; setBlocks(b); };
  return (
    <div className="narrator-form nf">
      <div className="form-grid nf-top">
        <label><span className="field-label">Name</span><input aria-label="Narrator name" value={value.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label><span className="field-label">What kind of storytelling <small className="hint">(for you, not sent)</small></span>
          <input aria-label="What kind of storytelling" value={value.about} placeholder="e.g. A fair-play mystery with real clues" onChange={(e) => set("about", e.target.value)} /></label>
      </div>
      <div className="row-line wrap nf-modes"><span className="hint">Written for</span>
        {(Object.keys(MODE_LABEL) as UserRole[]).map((m) => (
          <button key={m} type="button" className={`fchip${value.modes.includes(m) ? " on" : ""}`} aria-pressed={value.modes.includes(m)}
            onClick={() => set("modes", value.modes.includes(m) ? value.modes.filter((x) => x !== m) : [...value.modes, m])}>{MODE_LABEL[m]}</button>))}
        {!value.modes.length && <span className="hint">any mode</span>}
      </div>

      <div className="nf-style">
        <span className="hint">Style</span>
        {STYLE_CHOICES.map((c) => value.style[c.key]?.trim()
          ? <span key={c.key} className="nf-pill" title={c.label}>{value.style[c.key]}</span>
          : <span key={c.key} className="nf-pill empty">{c.label}: —</span>)}
        <span className="spacer" />
        <button type="button" className="link" aria-expanded={styling} onClick={() => setStyling((v) => !v)}>{styling ? "Done" : "Change…"}</button>
      </div>
      {styling && (
        <div className="nf-style-rows" role="group" aria-label="Style">
          {STYLE_CHOICES.map((c) => {
            const cur = value.style[c.key] ?? "";
            const custom = cur && !c.options.includes(cur);
            return (
              <div key={c.key} className="nf-srow"><b>{c.label}</b>
                <span className="nf-opts">
                  <button type="button" className={`fchip${!cur ? " on" : ""}`} onClick={() => style(c.key, "")}>Not set</button>
                  {c.options.map((o) => <button key={o} type="button" className={`fchip${cur === o ? " on" : ""}`} onClick={() => style(c.key, o)}>{o}</button>)}
                  <input aria-label={c.label} placeholder="or your words" value={custom ? cur : ""} onChange={(e) => style(c.key, e.target.value)} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="row-line nf-blocks-head"><b>Instructions</b><span className="hint">blocks, sent in this order inside &lt;narrator&gt;</span><span className="spacer" />
        <button type="button" className="link" onClick={() => { const id = newBlockId(); setBlocks([...blocks, { id, name: "New block", on: true, text: "" }]); setOpen(id); }}>+ Add a block</button></div>
      {blocks.length === 0 && (
        <div className="nf-blank">
          <p className="hint">A blank narrator. Write a block, or start from one of these (it copies their blocks and style; change anything after):</p>
          <div className="row-line wrap">{starts.filter((s) => narratorBlocks(s).length).map((s) => (
            <button key={s.id} type="button" className="fchip" title={s.about} onClick={() => onChange({ ...value, blocks: narratorBlocks(s).map((b) => ({ ...b })), instructions: blocksText(narratorBlocks(s)), style: { ...s.style }, modes: [...s.modes], about: value.about || s.about })}>{s.name}</button>))}</div>
        </div>
      )}
      <div className="nf-blocks">
        {blocks.map((b, i) => (
          <div key={b.id} className={`nf-block${open === b.id ? " open" : ""}${b.on ? "" : " off"}`} data-testid="narrator-block">
            <div className="nf-block-head">
              <Switch label={`${b.name || "Block"} on`} checked={b.on} onChange={(v) => setBlocks(blocks.map((x) => (x.id === b.id ? { ...x, on: v } : x)))} />
              <button type="button" className="nf-block-title" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? null : b.id)}>
                <b>{b.name || "Block"}</b><small>{firstLine(b.text) || "empty"}</small></button>
              <span className="nf-block-acts">
                <IconButton label={`Move ${b.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><span className="flip"><Icon name="chevron" size={12} /></span></IconButton>
                <IconButton label={`Move ${b.name} down`} disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><Icon name="chevron" size={12} /></IconButton>
              </span>
            </div>
            {open === b.id && (
              <div className="nf-block-body">
                <div className="row-line"><input aria-label="Block name" value={b.name} onChange={(e) => setBlocks(blocks.map((x) => (x.id === b.id ? { ...x, name: e.target.value } : x)))} />
                  <span className="spacer" /><button type="button" className="link quiet" onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))}>Remove block</button></div>
                <textarea rows={12} aria-label={`${b.name || "Block"} text`} className="mono" value={b.text} onChange={(e) => setBlocks(blocks.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)))} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="row-line">
        <Switch checked={value.mayAddNpcs} onChange={(v) => set("mayAddNpcs", v)} label="May bring in new people" />
        <span className="label-row">May bring in new people <Help text="On: the narrator may invent new named people when the story needs them. Off: only the people of the story." /></span>
      </div>
      <label>
        <span className="field-label label-row">Reminder before each reply <Help text="A short reminder sent right before each reply (like a card's post-history instructions), e.g. 'Keep replies under 300 words.'" /></span>
        <textarea rows={2} aria-label="Turn instruction" value={value.turnInstruction} onChange={(e) => set("turnInstruction", e.target.value)} />
      </label>
    </div>
  );
}

export function NarratorEditor({ narrator, usedBy, avatar, onImage, onSave, onTrash, onDuplicate, folder, starts = [] }: {
  narrator: Narrator; usedBy: string[]; avatar?: Avatar | undefined; onImage?: ((file: File | null) => void) | undefined; folder?: ReactNode;
  onSave: (n: Narrator) => Promise<void>; onTrash: () => Promise<void>; onDuplicate: () => void; starts?: Narrator[];
}) {
  const [draft, setDraft] = useState(narrator);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // "What the AI gets" beside the form on wide windows, as a tab on narrow ones (D-059: no scrolling to compare)
  const [tab, setTab] = useState<"edit" | "sent">("edit");
  useEffect(() => { setDraft(narrator); setSaved(false); setError(""); }, [narrator]);
  const save = async () => {
    if (!draft.name.trim()) { setError("The narrator needs a name."); return; }
    try { await onSave({ ...draft, name: draft.name.trim() }); setSaved(true); setError(""); } catch (e) { setError(errorText(e)); }
  };
  return (
    <div className={`view-sheet narrator-editor tab-${tab}`} data-testid="narrator-sheet">
      <div className="ne-head">
        <ImagePicker name={draft.name} avatar={avatar} onChange={onImage} size={44} testId="narrator-image" />
        <div className="vs-title"><h2>{draft.name || "Narrator"}</h2>
          <span className="hint">{narrator.builtin ? "Comes with Homunculus. " : ""}{usedBy.length ? `Tells ${usedBy.map((n) => `“${n}”`).join(", ")}` : "Not used by a story yet"}</span></div>
        <span className="spacer" />
        {saved && <span className="ok-text">✓ Saved</span>}
        <Button variant="prominent" onClick={() => void save()}>Save</Button>
        <Button onClick={onDuplicate}>Duplicate</Button>
        {!narrator.builtin && <Button variant="destructive" small onClick={() => void onTrash().catch((e) => setError(errorText(e)))}>Move to Trash</Button>}
      </div>
      {error && <div className="error-bar inline" role="alert">{error}</div>}
      <div className="ne-tabs" role="tablist" aria-label="Narrator">
        <button type="button" role="tab" aria-selected={tab === "edit"} className={`fchip${tab === "edit" ? " on" : ""}`} onClick={() => setTab("edit")}>Edit</button>
        <button type="button" role="tab" aria-selected={tab === "sent"} className={`fchip${tab === "sent" ? " on" : ""}`} onClick={() => setTab("sent")}>What the AI gets</button>
      </div>
      <div className="ne-body">
        <div className="ne-form">
          {folder}
          <NarratorForm value={draft} starts={starts.filter((s) => s.id !== draft.id)} onChange={(n) => { setDraft({ ...draft, ...n }); setSaved(false); }} />
        </div>
        <aside className="ne-preview" aria-label="What the AI gets">
          <b>What the AI gets</b>
          <pre className="ne-aigets" data-testid="narrator-preview">{narratorText(draft)}</pre>
          <p className="hint">Sent where a character's description goes. The story's mode adds one line of its own (who writes you).</p>
        </aside>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ NPCs
const fieldText = (f: TrackerField, v: unknown): string => {
  if (v === undefined || v === null) return "";
  if (f.type === "list") return Array.isArray(v) ? (v as ListItem[]).map((i) => i.name).join(", ") : String(v);
  return String(v);
};

function NpcField({ f, value, onChange }: { f: TrackerField; value: unknown; onChange: (v: unknown) => void }) {
  const label = <span className="field-label label-row">{f.label}{f.help && <Help text={f.help} />}</span>;
  if (f.type === "number" || f.type === "meter") {
    return <label>{label}<input type="number" aria-label={f.label} value={value === undefined || value === null ? "" : String(value)}
      min={f.min} max={f.max} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} /></label>;
  }
  if (f.type === "status") {
    return <label>{label}<select aria-label={f.label} value={String(value ?? "")} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">—</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
  }
  if (f.type === "group" || (f.type === "list" && f.fields.length > 0)) return null; // rows and groups are edited in the Scene panel
  if (f.type === "list") {
    return <label>{label}<input aria-label={f.label} placeholder="Comma-separated" defaultValue={fieldText(f, value)}
      onBlur={(e) => { const items = e.target.value.split(",").map((x) => x.trim()).filter(Boolean).map((name) => ({ name })); onChange(items.length ? items : undefined); }} /></label>;
  }
  // long things (appearance, description, traits) get a box; short ones (race, class, age) a line
  const long = ["about", "appearance"].includes(f.section.trim().toLowerCase()) || ["description", "traits", "notes", "skills", "spells", "powers"].includes(f.key);
  return long
    ? <label>{label}<textarea rows={2} aria-label={f.label} value={fieldText(f, value)} onChange={(e) => onChange(e.target.value)} /></label>
    : <label>{label}<input aria-label={f.label} value={fieldText(f, value)} onChange={(e) => onChange(e.target.value)} /></label>;
}

export function NpcEditor({ npc, fieldSets, stories, alsoIn, avatar, onImage, onSave, onTrash, onCopy, onClose, folder }: {
  npc: Npc; fieldSets: FieldSetOption[]; stories: Story[]; alsoIn: string[];
  /** The NPC's picture; onImage sets it (undefined while the NPC isn't saved yet). */
  avatar?: Avatar | undefined; onImage?: ((file: File | null) => void) | undefined;
  onSave: (n: Npc) => Promise<void>; onTrash?: () => Promise<void>; onCopy?: () => void; onClose?: () => void;
  /** The "Folder" pick (round 3), in the Vault. */
  folder?: ReactNode;
}) {
  const [draft, setDraft] = useState(npc);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(npc); setSaved(false); setError(""); }, [npc]);
  const set = fieldSets.find((s) => s.id === draft.schemaId) ?? fieldSets[0];
  const fields = set ? npcSheetFields(set.schema) : [];
  const change = (patch: Partial<Npc>) => { setDraft((d) => ({ ...d, ...patch })); setSaved(false); };
  const save = async () => {
    if (!draft.name.trim()) { setError("The NPC needs a name."); return; }
    const values = Object.fromEntries(Object.entries(draft.values).filter(([, v]) => v !== undefined && v !== ""));
    try { await onSave({ ...draft, name: draft.name.trim(), schemaId: set?.id ?? draft.schemaId, values: values as Npc["values"] }); setSaved(true); setError(""); }
    catch (e) { setError(errorText(e)); }
  };
  let section = "";
  return (
    <div className="view-sheet" data-testid="npc-sheet">
      <div className="vs-head">
        <ImagePicker name={draft.name} avatar={avatar} onChange={onImage} size={56} testId="npc-image" />
        <div className="vs-title"><h2>{draft.name || "New NPC"}</h2><span className="hint">{npcTagline(draft) || "An NPC: a light sheet, voiced by the narrator"}</span></div>
        {onClose && <IconButton label="Close" onClick={onClose}><Icon name="close" size={14} /></IconButton>}
      </div>
      <label><span className="field-label">Name</span><input aria-label="NPC name" value={draft.name} onChange={(e) => change({ name: e.target.value })} placeholder="e.g. Sister Maelle" /></label>
      <div className="form-grid">
        <label>
          <span className="field-label label-row">Sheet <Help text="Which fields this NPC has: a field set of Scene: Characters (Standard, Fantasy, Sci-fi…). Fields under “Now” (mood, where they are) are the trackers' job while playing, so they are not here." /></span>
          <select aria-label="Sheet" value={set?.id ?? ""} onChange={(e) => change({ schemaId: e.target.value })}>
            {fieldSets.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label label-row">Kept in <Help text="A story keeps its own NPCs together; a loose NPC can be added to any story or chat. The same NPC can be used in several places." /></span>
          <select aria-label="Kept in" value={draft.storyId ?? ""} onChange={(e) => change({ storyId: e.target.value || null })}>
            <option value="">Loose (no story)</option>
            {stories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      {folder}
      {alsoIn.length > 0 && <p className="hint">In {alsoIn.join(", ")}. Changes count everywhere it is used.</p>}
      <div className="npc-fields">
        {fields.map((f) => {
          const head = f.section && f.section !== section ? (section = f.section) : null;
          return (
            <div key={f.key} className="npc-field">
              {head && <h3 className="npc-section">{head}</h3>}
              <NpcField f={f} value={draft.values[f.key]} onChange={(v) => change({ values: { ...draft.values, [f.key]: v as Npc["values"][string] } })} />
            </div>
          );
        })}
        {!set && <p className="hint">No field set with per-character fields yet. Scene: Characters comes with Homunculus (Library → Trackers).</p>}
      </div>
      <label><span className="field-label label-row">Notes <Help text="Your own notes. Not sent to the AI." /></span><textarea rows={2} aria-label="Notes" value={draft.notes} onChange={(e) => change({ notes: e.target.value })} /></label>
      {error && <div className="error-bar inline" role="alert">{error}</div>}
      <div className="vs-actions">
        <Button variant="prominent" onClick={() => void save()}>Save</Button>
        {saved && <span className="ok-text">✓ Saved</span>}
        {onCopy && <Button onClick={onCopy} title="A copy that changes on its own (e.g. this story's version of the NPC)">Make a Copy</Button>}
        <span className="spacer" />
        {onTrash && <Button variant="destructive" small onClick={() => void onTrash().catch((e) => setError(errorText(e)))}>Move to Trash</Button>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ cards of the Vault
export const storyCard = (st: Story, narratorName: string, sessions: number, avatar?: Avatar) => ({
  id: st.id, name: st.name, by: `Told by ${narratorName}`, summary: (st.description.trim() || st.scenario.trim()).slice(0, 220) || "No premise yet",
  tags: [ROLE_LABEL[st.userRole]], size: sessions ? `${sessions} session${sessions === 1 ? "" : "s"}` : "new",
  picture: <StoryMark name={st.name} avatar={avatar} size={64} />,
});

/** Which group a narrator is listed under (D-059): the one mode it is written for, else "Any mode". */
export const narratorGroup = (n: Narrator) => (n.modes.length === 1 ? MODE_LABEL[n.modes[0]!] : "Any mode");
export const narratorCard = (n: Narrator, used: number, avatar?: Avatar) => ({
  id: n.id, name: n.name, group: narratorGroup(n), by: n.builtin ? "Comes with Homunculus" : undefined, summary: n.about.trim() || n.instructions.slice(0, 220) || "No instructions",
  tags: [n.style.pov, n.style.tone].filter(Boolean), size: used ? `${used} stor${used === 1 ? "y" : "ies"}` : "",
  picture: avatar ? <CardPicture name={n.name} avatar={avatar} /> : <span className="card-pic letter narrator" aria-hidden><Icon name="scroll" size={26} /></span>,
});

export const npcCard = (n: Npc, storyName: string | undefined, avatar?: Avatar) => ({
  id: n.id, name: n.name, by: npcTagline(n) || undefined, summary: String(n.values["description"] ?? "").slice(0, 220) || undefined,
  tags: [storyName ?? "Loose"], picture: <CardPicture name={n.name} avatar={avatar} />,
});

// ------------------------------------------------------------------------------------------------ "How do you want to play?"
// New story (D-031, canvas "Homunculus 2 — Stories", StoryNew.dc.html): how you play, where it starts from and the
// story's own setup (preset, connections, persona, trackers, agents) in one sheet.
export interface NewStoryChoice { name: string; role: UserRole; fromCardId: string | null; setup: SetupLayer }

const modalStack: object[] = [];

/** A small modal over the app. Esc and the scrim close it. */
export function Modal({ title, onClose, children, testId, className = "modal-small", head }: { title: string; onClose: () => void; children: ReactNode; testId?: string; className?: string; head?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    // only the top modal answers Esc (a modal can open another one, e.g. Setup → Choose agents)
    const me = {};
    modalStack.push(me);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && modalStack[modalStack.length - 1] === me) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); modalStack.splice(modalStack.indexOf(me), 1); };
  }, [onClose]);
  return createPortal(
    <div className="sheet-layer" data-region="sheet">
      <div className="sheet-scrim" onClick={onClose} />
      <div className={`sheet glass ${className}`} ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid={testId}>
        <header className="sheet-head">
          <div className="sheet-title"><h2>{title}</h2></div>
          {head}
          <IconButton label="Close" onClick={onClose}><Icon name="close" size={16} /></IconButton>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

const MODES: Array<{ role: UserRole; title: string; text: string; icon: ReactNode }> = [
  { role: "player", title: "Narrated adventure", text: "A narrator tells the story and voices every other person. You play your own character.",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 4h9l3 3v13H6z" /><path d="M9 10h6M9 13h6M9 16h4" /></svg> },
  { role: "coauthor", title: "Write it together", text: "You give directions and the AI writes everyone, your character too.",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16z" /><path d="M14 6l3 3" /></svg> },
  { role: "director", title: "Director mode", text: "You are not in the story. The AI plays every character equally; you steer, let them act or just watch.",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="5" width="16" height="12" rx="2" /><path d="M9 21h6M12 17v4" /></svg> },
];
const ROLE_CHIP: Record<UserRole, string> = { player: "You: Player", coauthor: "You: Co-author", director: "You: Director" };

export function NewStorySheet({ characters, avatars, lorebooks, setup, initialCardId = null, onCreate, onClose }: {
  characters: Character[]; avatars: Record<string, Avatar>; lorebooks: Lorebook[]; setup: StorySetupProps;
  /** Open with "One of your cards" picked (Turn into a Story). */
  initialCardId?: string | null;
  onCreate: (c: NewStoryChoice) => void; onClose: () => void;
}) {
  const [name, setName] = useState(initialCardId ? characters.find((c) => c.id === initialCardId)?.name ?? "" : "");
  const [role, setRole] = useState<UserRole>("player");
  const [from, setFrom] = useState<"card" | "empty">(initialCardId || characters.length ? (initialCardId ? "card" : "empty") : "empty");
  const [cardId, setCardId] = useState(initialCardId ?? characters[0]?.id ?? "");
  const [layer, setLayer] = useState<SetupLayer>({});
  const card = from === "card" ? characters.find((c) => c.id === cardId) : undefined;
  const greetings = card ? card.firstMessages.filter((m) => m.trim()).length : 0;
  const lore = card ? lorebooks.filter((b) => card.lorebookIds.includes(b.id)).map((b) => b.name) : [];
  const trackersOn = setup.trackers.filter((t) => layerHasTracker(layer, t.agent.id)).length;
  const hasConnection = setup.profiles.length > 0;
  const create = () => onCreate({ name: name.trim() || (card ? "" : "New story"), role, fromCardId: card?.id ?? null, setup: layer });
  return (
    <Modal title="New story" onClose={onClose} testId="new-story" className="modal-wide"
      head={<label className="new-story-name"><span className="setup-title">Name</span>
        <input aria-label="Story name" value={name} placeholder={card ? card.name : "e.g. High Fantasy Party"} onChange={(e) => setName(e.target.value)} autoFocus /></label>}>
      <p className="hint new-story-sub">A story is the mold: every chat you open from it starts with this setup. Everything can be changed later on the story's page.</p>
      <div className="new-story-body">
        <div className="story-col">
          <SetupSection title="How do you want to play?">
            <div className="mode-cards">
              {MODES.map((m) => (
                <button key={m.role} type="button" className={`mode-card${role === m.role ? " on" : ""}`} aria-pressed={role === m.role} onClick={() => setRole(m.role)}>
                  <span className="mode-icon">{m.icon}</span>
                  <strong>{m.title}</strong>
                  <span className="mode-text">{m.text}</span>
                  <span className="mode-chips"><span className="chip">{ROLE_CHIP[m.role]}</span></span>
                </button>
              ))}
            </div>
          </SetupSection>
          <SetupSection title="Start from">
            <label className={`setup-row choice-row${from === "card" ? " on" : ""}${characters.length ? "" : " disabled"}`}>
              <input type="radio" name="start-from" checked={from === "card"} disabled={!characters.length} onChange={() => setFrom("card")} aria-label="One of your cards" />
              <span className="setup-k grow"><span>One of your cards</span><small>For cards that are really a narrator or a whole world. The card is not changed.</small></span>
              {characters.length > 0 && (
                <select className="pick-select" aria-label="Card to turn into a story" value={cardId} onChange={(e) => { setCardId(e.target.value); setFrom("card"); }}>
                  {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </label>
            {card && (
              <dl className="from-card">
                <dt>Narrator</dt><dd>the card {card.name} (its system prompt and description)</dd>
                <dt>Openings</dt><dd>{greetings ? `its ${greetings} greeting${greetings === 1 ? "" : "s"}` : "none (write them on the story's page)"}</dd>
                {card.scenario.trim() && <><dt>Scenario</dt><dd>“{card.scenario.trim().slice(0, 160)}{card.scenario.trim().length > 160 ? "…" : ""}”</dd></>}
                {lore.length > 0 && <><dt>Lore</dt><dd>{lore.join(", ")} (from the card)</dd></>}
              </dl>
            )}
            <label className={`setup-row choice-row${from === "empty" ? " on" : ""}`}>
              <input type="radio" name="start-from" checked={from === "empty"} onChange={() => setFrom("empty")} aria-label="An empty story" />
              <span className="setup-k grow"><span>An empty story</span><small>The Simple Narrator from the Library; you write how it starts.</small></span>
            </label>
            <div className="setup-row choice-row disabled" aria-disabled="true">
              <input type="radio" name="start-from" disabled aria-label="Describe an idea to the Assistant" />
              <span className="setup-k grow"><span>Describe an idea to the Assistant</span><small>It writes the narrator, the NPCs and the opening for you to keep or discard.</small></span>
              <span className="tag">Later</span>
            </div>
          </SetupSection>
        </div>
        <div className="story-col">
          <SetupFields mode="story" layer={layer} onChange={setLayer} names={setup.namesFor(undefined)} director={role === "director"}
            presets={setup.presets} profiles={setup.profiles} personas={setup.personas} trackers={setup.trackers} agents={setup.agents}
            title="This story's setup" aside="every chat of this story starts with this"
            trackersAside="fill the Scene panel after each reply" agentsAside="helpers that run with each reply" testId="new-story-setup" />
          <p className="hint">Rows marked “Default” follow Settings → Defaults until you pick something else.</p>
        </div>
      </div>
      <div className="modal-foot">
        <span className="ready grow">
          <strong>Ready to play</strong>
          <span><span className="ok">✓</span> Narrator</span>
          <span>{greetings ? <><span className="ok">✓</span> Opening · {greetings}</> : <><span className="muted">○</span> Opening (optional)</>}</span>
          <span>{hasConnection ? <><span className="ok">✓</span> Connection</> : <><span className="muted">○</span> Connection (Settings)</>}</span>
          <span>{trackersOn ? <><span className="ok">✓</span> {trackersOn} tracker{trackersOn === 1 ? "" : "s"}</> : <><span className="muted">○</span> Trackers (optional)</>}</span>
          <span className="hint">Create Story opens its page</span>
        </span>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="prominent" onClick={create} data-testid="create-story">Create Story</Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------ Save to the Vault
/** What the Scene knows about someone the tracker brought in (round 3, D-036). */
export interface NpcDraft { name: string; schemaId: string; values: Record<string, unknown> }
export interface SaveNpcChoice { name: string; schemaId: string; values: Record<string, unknown>; storyId: string | null; folderId: string | null; newFolder?: string; keepInChat: boolean }

/**
 * "Save to the Library" for a person of the Scene that is not a Library NPC yet (draft F). Where it goes is a list you can
 * see: this chat's story, your NPC folders, or loose; "+ New folder" makes one on the spot. Daniel (10/29): "save
 * NPCs to the Vault … choosing the folder".
 */
export function SaveNpcSheet({ draft, fieldSets, story, folders, onSave, onClose }: {
  draft: NpcDraft; fieldSets: FieldSetOption[];
  /** The story of this chat, when it has one. */
  story?: { id: string; name: string } | undefined;
  folders: Array<{ id: string; label: string; depth: number }>;
  onSave: (c: SaveNpcChoice) => void; onClose: () => void;
}) {
  const [name, setName] = useState(draft.name);
  const [schemaId, setSchemaId] = useState(fieldSets.some((s) => s.id === draft.schemaId) ? draft.schemaId : fieldSets[0]?.id ?? draft.schemaId);
  const [where, setWhere] = useState<string>(story ? `story:${story.id}` : "loose");
  const [naming, setNaming] = useState<string | null>(null);
  const [keep, setKeep] = useState(true);
  const set = fieldSets.find((s) => s.id === schemaId);
  const filled = set ? npcSheetFields(set.schema).filter((f) => { const v = draft.values[f.key]; return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length); }) : [];
  const save = () => {
    if (!name.trim()) return;
    const keys = new Set(filled.map((f) => f.key));
    onSave({
      name: name.trim(), schemaId, values: Object.fromEntries(Object.entries(draft.values).filter(([k]) => keys.has(k))),
      storyId: where.startsWith("story:") ? where.slice(6) : null,
      folderId: where.startsWith("folder:") ? where.slice(7) : null,
      ...(where === "new" && naming?.trim() ? { newFolder: naming.trim() } : {}),
      keepInChat: keep,
    });
  };
  const option = (value: string, icon: "book" | "folder" | "users", label: string, note: string, depth = 0) => (
    <label key={value} className={`setup-row choice-row save-where${where === value ? " on" : ""}`} style={depth ? { paddingLeft: 12 + depth * 18 } : undefined}>
      <input type="radio" name="npc-where" checked={where === value} onChange={() => setWhere(value)} aria-label={label} />
      <Icon name={icon} size={15} />
      <span className="setup-k grow"><span>{label}</span>{note && <small>{note}</small>}</span>
    </label>
  );
  return (
    <Modal title={`Save ${draft.name} to the Library`} onClose={onClose} testId="save-npc" className="modal-chat">
      <p className="hint">Keeps what the Scene knows about them as an NPC sheet, to use in other stories and chats.</p>
      <label className="stack"><span className="setup-title">Name</span><input aria-label="NPC name" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="stack"><span className="setup-title label-row">Sheet <Help text="Which fields the NPC keeps (a field set of Scene: Characters). Fields under “Now” (mood, where they are) stay with the trackers." /></span>
        <select aria-label="Sheet" value={schemaId} onChange={(e) => setSchemaId(e.target.value)}>{fieldSets.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      </label>
      <p className="hint">{filled.length ? `Comes with: ${filled.map((f) => f.label).join(", ")}.` : "No values to bring for this sheet yet; you can fill it in the Library."}</p>
      <SetupSection title="Keep in">
        {story && option(`story:${story.id}`, "book", story.name, "This chat's story: its own NPCs")}
        {folders.map((f) => option(`folder:${f.id}`, "folder", f.label, "", f.depth))}
        {option("loose", "users", "Loose", "Not in a story or a folder")}
        {naming === null
          ? <div className="setup-row"><button type="button" className="link" onClick={() => { setNaming(""); setWhere("new"); }}>+ New folder</button></div>
          : <div className="setup-row"><Icon name="folder" size={15} /><input autoFocus aria-label="New folder name" placeholder="Folder name" value={naming}
              onChange={(e) => { setNaming(e.target.value); setWhere("new"); }} /></div>}
      </SetupSection>
      <label className="row-line"><Switch checked={keep} onChange={setKeep} label="Keep in this chat" /><span className="label-row">Use the saved NPC in this chat <Help text="On: this chat uses the Library NPC from now on (its sheet is sent with each reply). Off: only a copy goes to the Library." /></span></label>
      <div className="modal-foot">
        <span className="grow" />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="prominent" disabled={!name.trim() || (where === "new" && !naming?.trim())} onClick={save} data-testid="save-npc-confirm">Save to the Library</Button>
      </div>
    </Modal>
  );
}
