// Homunculus 2 — a story's page: the story is the mold (its own setup), each chat of it is one adventure that
// inherits that setup and may change some of it (D-031). Built from the approved drafts, canvas "Homunculus 2 —
// Stories" (Main.dc.html and NewChat.dc.html). Author: CLAUDE, 2026-10-29 (first version D-029, same day).
// Saves by itself a moment after each change (like the lorebook editor, D-028).
// Round 3 (D-036): the chats are the last thing on the page (Daniel: "the chats at the bottom so they are the last thing you
// scroll to"), as a list you can search (names and messages) and export. The same page edits a Kit (kind="kit"): no chats,
// and "Start a Story" instead of Play.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Avatar, Character, Lorebook, Narrator, NarratorFields, Npc, Session, SetupLayer, Story, UserRole } from "@homunculus/schemas";
import { effectiveCharacter, isTracked, npcTagline, SIMPLE_NARRATOR, variantAvatarId } from "@homunculus/core";
import { avatarUrl } from "../files.ts";
import { Help } from "./Help.tsx";
import { LorebookChips } from "./LorePanels.tsx";
import { Button, Icon, IconButton, Segmented, Switch } from "./kit.tsx";
import { NarratorPromptGroup } from "./NarratorPromptGroup.tsx";
import { AuthorsNoteGroup } from "./AuthorsNote.tsx";
import { SetupFields, SetupSection, type StorySetupProps } from "./SetupFields.tsx";
export type { StorySetupProps };
import { AvatarDot } from "./Sidebar.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { Modal, NarratorForm, NpcEditor, type FieldSetOption } from "./Vault.tsx";
import { ImagePicker } from "./ImagePicker.tsx";
import { ChatList, type ChatSearch } from "./ChatList.tsx";
import type { ChatExportFormat } from "@homunculus/core";

export const ROLE_HELP: Record<UserRole, string> = {
  player: "You play your own character; the narrator voices everyone else.",
  coauthor: "You give directions and the AI writes everyone, your character too.",
  director: "You are not in the story. The AI plays every character equally; you steer, let them act or just watch.",
};

/** One chat of the story, as its card shows it. */
export interface StoryChat {
  session: Session;
  lastLine: string;
  /** Messages on the chat's current branch. */
  messages: number;
  /** When it was last played (the newest message), else when it was made. */
  when: number;
  /** Which opening it started with (0-based), when it matches one. */
  opening: number | null;
  /** How many setup rows this chat changes from its story. */
  changes: number;
  /** How many branches it has (D-032). */
  branches?: number;
}

export interface NewChatChoice { title: string; openingIndex: number; openingText?: string; setup: SetupLayer }

/** How many rows a chat's own layer changes from its story (for the "N changes" chip). */
export function changesIn(layer: SetupLayer): number {
  let n = 0;
  for (const k of ["presetId", "connectionId", "agentConnectionId", "personaId"] as const) if (layer[k] !== undefined) n += 1;
  if (layer.agents && layer.agents.mode !== "keep") n += layer.agents.add.length + layer.agents.remove.length;
  n += Object.values(layer.agentOverrides ?? {}).filter((o) => o.schemaId).length;
  return n;
}

export function StoryPage({ lead, story, characters, avatars, narrators, npcs, sessionsKey, loadChats, nextTitle, cardGreetings,
  fieldSets, stories, lorebooks, setup, onSave, onNewChat, onOpenSession, onSaveNpc, onSaveNarrator, onOpenNarrator, onOpenLorebook,
  onDuplicate, onTrash, onImage, kind = "story", chatTools, onSaveAsKit, onStartFromKit, folder, pickers }: {
  lead: ReactNode;
  /** A story, or a Kit (what new stories start with: no chats). */
  kind?: "story" | "kit";
  /** Search, rename, export and trash for the chats list (story only). */
  chatTools?: {
    search: ChatSearch; onOpen: (id: string, messageId?: string) => void; onRename: (id: string, title: string) => void;
    onExport: (id: string, f: ChatExportFormat) => void; onTrash: (id: string) => void;
  } | undefined;
  onSaveAsKit?: ((s: Story) => void) | undefined;
  onStartFromKit?: ((k: Story) => void) | undefined;
  /** The "Folder" pick of this story/kit. */
  folder?: ReactNode;
  /** Bigger pickers (round 3): "+ Add a Card" and "+ From the Vault" open these instead of a plain list. */
  pickers?: {
    card: (exclude: string[], onPick: (id: string) => void) => void;
    npc: (exclude: string[], onPick: (id: string) => void) => void;
    narrator: (current: string | null, onPick: (id: string) => void) => void;
  } | undefined;
  story: Story;
  characters: Character[];
  avatars: Record<string, Avatar>;
  narrators: Narrator[];
  npcs: Npc[];
  /** Changes when the story's chats change (to reload their cards). */
  sessionsKey: string;
  loadChats: () => Promise<StoryChat[]>;
  /** The name the next chat gets ("Chat 3"). */
  nextTitle: string;
  /** The narrator card's greetings, when the story has no openings of its own. */
  cardGreetings: string[];
  fieldSets: FieldSetOption[];
  stories: Story[];
  lorebooks: Lorebook[];
  setup: StorySetupProps;
  onSave: (s: Story) => Promise<void>;
  onNewChat: (s: Story, c: NewChatChoice) => void;
  onOpenSession: (id: string) => void;
  onSaveNpc: (n: Npc) => Promise<void>;
  onSaveNarrator: (n: Narrator) => Promise<void>;
  onOpenNarrator: (id: string) => void;
  onOpenLorebook: (id: string) => void;
  onDuplicate: (s: Story) => void;
  onTrash: (s: Story) => void;
  /** Sets the picture of the story, an NPC or a narrator (by its id; null removes it). */
  onImage?: ((id: string, file: File | null) => void) | undefined;
}) {
  const [draft, setDraftState] = useState(story);
  const [state, setState] = useState<"saved" | "saving" | "">("");
  const [chats, setChats] = useState<StoryChat[] | null>(null);
  const [openNpc, setOpenNpc] = useState<string | null>(null);
  const [narratorOpen, setNarratorOpen] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [more, setMore] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [opening, setOpeningTab] = useState(0);
  const pending = useRef<Story | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const isKit = kind === "kit";
  useEffect(() => { if (isKit) { setChats([]); return; } let live = true; void loadChats().then((c) => { if (live) setChats(c); }); return () => { live = false; }; }, [sessionsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const d = pending.current;
    pending.current = null;
    if (d) { setState("saving"); void saveRef.current(d).then(() => setState("saved")); }
  };
  useEffect(() => () => flush(), []); // leaving the page saves what is left
  const setDraft = (next: Story) => {
    setDraftState(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
    setState("");
  };
  const change = (patch: Partial<Story>) => setDraft({ ...draft, ...patch });

  // ---- narrator
  const narratorValue = draft.narrator.kind === "vault" ? `vault:${draft.narrator.id}` : draft.narrator.kind === "card" ? `card:${draft.narrator.characterId}` : "own";
  const vaultNarrator = draft.narrator.kind === "vault" ? narrators.find((n) => n.id === (draft.narrator as { id: string }).id) : undefined;
  const narratorCard = draft.narrator.kind === "card" ? characters.find((c) => c.id === (draft.narrator as { characterId: string }).characterId) : undefined;
  const narratorVariant = draft.narrator.kind === "card" ? draft.narrator.variantId : null;
  const narratorName = (narratorCard ? effectiveCharacter(narratorCard, narratorVariant).name : undefined) ?? vaultNarrator?.name ?? (draft.narrator.kind === "own" ? draft.narrator.narrator.name || "Narrator" : "Narrator (missing)");
  const narratorLine = narratorCard ? "Your card, used as the narrator. The card is not changed."
    : vaultNarrator ? `From the Library${vaultNarrator.builtin ? " (comes with the app)" : ""}.`
      : draft.narrator.kind === "own" ? "Written for this story." : "This narrator is in the Trash or was deleted. Pick another one.";
  const pickNarrator = (v: string) => {
    if (v === "own") {
      const base: NarratorFields = vaultNarrator ?? SIMPLE_NARRATOR;
      change({ narrator: { kind: "own", narrator: { name: base.name === SIMPLE_NARRATOR.name ? "Narrator" : base.name, about: base.about, modes: [...base.modes], blocks: base.blocks.map((b) => ({ ...b })), instructions: base.instructions, style: { ...base.style }, mayAddNpcs: base.mayAddNpcs, turnInstruction: base.turnInstruction } } });
    } else if (v.startsWith("vault:")) change({ narrator: { kind: "vault", id: v.slice(6) } });
    else change({ narrator: { kind: "card", characterId: v.slice(5), variantId: null } });
  };
  const saveOwnToVault = async () => {
    if (draft.narrator.kind !== "own") return;
    const id = crypto.randomUUID();
    await onSaveNarrator({ ...draft.narrator.narrator, id, builtin: false });
    change({ narrator: { kind: "vault", id } });
  };

  // ---- people
  const npcById = Object.fromEntries(npcs.map((n) => [n.id, n]));
  const inStory = draft.npcIds.filter((id) => npcById[id]);
  const addable = npcs.filter((n) => !draft.npcIds.includes(n.id))
    .sort((a, b) => Number(b.storyId === story.id) - Number(a.storyId === story.id) || Number(!a.storyId) - Number(!b.storyId) || a.name.localeCompare(b.name));
  const storyName = (id: string | null) => (id ? stories.find((s) => s.id === id)?.name : undefined);
  const newNpc = async () => {
    const npc: Npc = { id: crypto.randomUUID(), name: "New NPC", storyId: story.id, schemaId: fieldSets[0]?.id ?? "scene-characters", values: {}, notes: "" };
    await onSaveNpc(npc);
    change({ npcIds: [...draft.npcIds, npc.id] });
    setOpenNpc(npc.id);
  };
  const copyNpc = async (n: Npc) => {
    const copy: Npc = { ...structuredClone(n), id: crypto.randomUUID(), storyId: story.id };
    await onSaveNpc(copy);
    change({ npcIds: draft.npcIds.map((x) => (x === n.id ? copy.id : x)) });
    setOpenNpc(copy.id);
  };
  const cards = draft.cast.filter((m) => m.characterId && m.role !== "narrator");
  const charById = Object.fromEntries(characters.map((c) => [c.id, c]));

  // ---- openings (for new chats)
  const openings = draft.openings.length ? draft.openings : [""];
  const tab = Math.min(opening, openings.length - 1);
  const setOpening = (i: number, text: string) => change({ openings: openings.map((o, j) => (j === i ? text : o)) });
  const newChatOpenings = draft.openings.some((o) => o.trim()) ? draft.openings : cardGreetings;
  /** Cards whose greetings can become openings: only the story's own (its narrator card and the cards in its cast). */
  const greetingCards = characters.filter((c) => c.firstMessages.some((m) => m.trim())
    && (c.id === narratorCard?.id || draft.cast.some((m) => m.characterId === c.id)));
  const addGreeting = (v: string) => {
    const [cid, i] = [v.slice(0, v.lastIndexOf(":")), Number(v.slice(v.lastIndexOf(":") + 1))];
    const text = characters.find((c) => c.id === cid)?.firstMessages[i];
    if (!text) return;
    const kept = draft.openings.filter((o) => o.trim());
    change({ openings: [...kept, text] });
    setOpeningTab(kept.length);
  };

  const lore = draft.setup.lorebooks && draft.setup.lorebooks.mode !== "keep" ? draft.setup.lorebooks.add : [];
  const latest = chats?.[0];
  const cover = narratorCard ? (narratorVariant ? avatars[variantAvatarId(narratorCard.id, narratorVariant)] : undefined) ?? avatars[narratorCard.id]
    : vaultNarrator ? avatars[vaultNarrator.id] : undefined;
  const startChat = (c: NewChatChoice) => { flush(); setNewChat(false); onNewChat(draft, c); };

  return (
    <div className="page">
      <Toolbar lead={lead} title={draft.name || (isKit ? "Kit" : "Story")} subtitle={state === "saving" ? "Saving…" : state === "saved" ? "Saved" : isKit ? "Kit" : "Story"}
        trailing={<>
          <Button variant="plain" onClick={() => onDuplicate(draft)} title={isKit ? "A new Kit with the same content" : "A new story with the same setup and start, without the chats"}>Duplicate</Button>
          <span className="play-wrap">
            <Button variant="plain" onClick={() => setMore((v) => !v)} aria-expanded={more}>More…</Button>
            {more && (
              <div className="popover more-pop" role="menu">
                <button type="button" role="menuitem" className="menu-item" onClick={() => { setMore(false); setRenaming(true); }}>Rename</button>
                {!isKit && onSaveAsKit && <button type="button" role="menuitem" className="menu-item" onClick={() => { setMore(false); flush(); onSaveAsKit(draft); }}
                  title="Keep this story's start (narrator, people, scenario, openings, setup) in the Library, to start new stories from it">Save as Kit</button>}
                <button type="button" role="menuitem" className="menu-item danger-text" onClick={() => { setMore(false); flush(); onTrash(draft); }}
                  title={isKit ? "The Kit goes to the Trash (Library → Trash); stories started from it are not touched." : "The story and its chats go to the Trash (Library → Trash); you can restore them."}>Move to Trash</button>
              </div>
            )}
          </span>
          {isKit && <Button variant="prominent" onClick={() => { flush(); onStartFromKit?.(draft); }} data-testid="start-from-kit">Start a Story</Button>}
          {!isKit && latest && <Button onClick={() => setNewChat(true)} data-testid="new-chat">New Chat</Button>}
          {isKit ? null : latest
            ? <Button variant="prominent" onClick={() => { flush(); onOpenSession(latest.session.id); }} data-testid="continue-story">Continue {latest.session.title}</Button>
            : <Button variant="prominent" onClick={() => setNewChat(true)} data-testid="play-story">Start Story</Button>}
        </>} />
      <div className="story-page" data-testid="story-page">
        <div className="story-hero">
          {onImage
            ? <ImagePicker name={draft.name} avatar={avatars[story.id] ?? cover} own={!!avatars[story.id]} shape="square" size={96} testId="story-image"
                onChange={(f) => onImage(story.id, f)} />
            : cover ? <img className="story-cover" src={avatarUrl(cover)} alt="" /> : <span className="story-cover letter" aria-hidden>{(draft.name || "?").slice(0, 1).toUpperCase()}</span>}
          <div className="story-hero-text">
            {renaming
              ? <input className="story-title-input" autoFocus aria-label="Story name" value={draft.name} onChange={(e) => change({ name: e.target.value })}
                  onBlur={() => setRenaming(false)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setRenaming(false); }} />
              : <h1><button type="button" className="story-title" title="Click to rename" onClick={() => setRenaming(true)}>{draft.name || "Untitled story"}</button></h1>}
            {(draft.description || draft.scenario) && <p>{draft.description || draft.scenario}</p>}
            <div className="story-status">
              <span className="pill">{isKit ? "Kit · new stories start from it" : chats === null ? "…" : chats.length === 0 ? "Not started" : `${chats.length} chat${chats.length === 1 ? "" : "s"}`}</span>
              <span>{narratorCard ? `Made from your card “${narratorCard.name}”` : `Told by ${narratorName}`}</span>
            </div>
            {folder && <div className="story-folder">{folder}</div>}
          </div>
        </div>

        <div className="story-cols">
          <div className="story-col">
            <SetupSection title="Cast" aside="who is in this story" testId="story-people">
              <div data-testid="story-narrator">
                <div className="setup-row">
                  {cover ? <img className="cast-pic" src={avatarUrl(cover)} alt="" /> : <span className="cast-pic letter" aria-hidden>{narratorName.slice(0, 1).toUpperCase()}</span>}
                  <span className="setup-k grow"><span>Narrator · {narratorName}</span><small className={draft.narrator.kind === "vault" && !vaultNarrator ? "error-text" : ""}>{narratorLine}</small></span>
                  <Button small onClick={() => setNarratorOpen((v) => !v)} aria-expanded={narratorOpen}>{narratorOpen ? "Done" : "Change…"}</Button>
                </div>
                {narratorOpen && (
                  <div className="setup-row column">
                    <label className="row-line"><span className="field-label label-row">Who tells it <Help text="The narrator is not a character: it describes the scene and voices everyone else. Keep narrators in the Library to reuse them, use one of your cards, or write one just for this story." /></span>
                      <select aria-label="Narrator" value={narratorValue} onChange={(e) => pickNarrator(e.target.value)}>
                        <optgroup label="Library">{narrators.map((n) => <option key={n.id} value={`vault:${n.id}`}>{n.name}</option>)}</optgroup>
                        <optgroup label="A card tells it">{characters.map((c) => <option key={c.id} value={`card:${c.id}`}>{c.name}</option>)}</optgroup>
                        <option value="own">Written for this story…</option>
                      </select>
                    </label>
                    {pickers && <button type="button" className="link align-start" onClick={() => pickers.narrator(vaultNarrator?.id ?? null, (id) => pickNarrator(`vault:${id}`))}>Browse the Library's narrators…</button>}
                    {vaultNarrator && <p className="hint">{vaultNarrator.about.trim() || `${vaultNarrator.instructions.slice(0, 180)}${vaultNarrator.instructions.length > 180 ? "…" : ""}`} <button className="link" onClick={() => onOpenNarrator(vaultNarrator.id)}>Edit in the Library</button></p>}
                    {narratorCard && narratorCard.variants.length > 0 && (
                      <label className="row-line"><span className="field-label label-row">Version <Help text="Which version of the card tells this story. Main = the card as imported." /></span>
                        <VersionSelect c={narratorCard} value={narratorVariant} label="Narrator card version"
                          onChange={(v) => change({ narrator: { kind: "card", characterId: narratorCard.id, variantId: v } })} />
                      </label>
                    )}
                    {narratorCard && <p className="hint">The card {narratorCard.name} is sent as it is (its system prompt, description and lorebooks).</p>}
                    {draft.narrator.kind === "own" && (
                      <>
                        <NarratorForm value={draft.narrator.narrator} starts={narrators} onChange={(n) => change({ narrator: { kind: "own", narrator: n } })} />
                        <Button small onClick={() => void saveOwnToVault()}>Save to the Library</Button>
                      </>
                    )}
                  </div>
                )}

                <div className="setup-row column">
                  <NarratorPromptGroup disclosure level="story" layer={draft.setup} above={setup.setupAbove().narratorPrompt} onChange={(layer) => change({ setup: layer })} />
                </div>
              </div>

              <div className="setup-row">
                <span className="setup-k grow"><span>NPCs</span>{inStory.length === 0 && <small>None yet. The narrator can bring people in as the story goes.</small>}</span>
                <button type="button" className="link" onClick={() => void newNpc()}>+ New NPC</button>
                {pickers ? (
                  <button type="button" className="link" onClick={() => pickers.npc(draft.npcIds, (id) => change({ npcIds: [...draft.npcIds, id] }))}>+ From the Library</button>
                ) : addable.length > 0 && (
                  <select className="link-select" aria-label="Add an NPC from the Library" value="" onChange={(e) => e.target.value && change({ npcIds: [...draft.npcIds, e.target.value] })}>
                    <option value="">+ From the Library</option>
                    {addable.map((n) => <option key={n.id} value={n.id}>{n.name}{n.storyId && n.storyId !== story.id ? ` (${storyName(n.storyId) ?? "other story"})` : n.storyId ? "" : " (loose)"}</option>)}
                  </select>
                )}
              </div>
              {inStory.map((id) => {
                const n = npcById[id]!;
                return (
                  <div key={id} className="setup-row column sub">
                    <div className="people-line">
                      <AvatarDot name={n.name} avatar={avatars[n.id]} size={26} />
                      <span className="setup-k grow"><span>{n.name}</span><small>{[npcTagline(n), n.storyId === story.id ? "" : storyName(n.storyId) ? `from ${storyName(n.storyId)}` : "loose NPC"].filter(Boolean).join(" · ") || "NPC"}</small></span>
                      <Button small variant="plain" onClick={() => setOpenNpc(openNpc === id ? null : id)}>{openNpc === id ? "Done" : "Edit"}</Button>
                      <IconButton label={`Remove ${n.name} from the story`} onClick={() => change({ npcIds: draft.npcIds.filter((x) => x !== id) })}><Icon name="close" size={13} /></IconButton>
                    </div>
                    {openNpc === id && (
                      <NpcEditor npc={n} fieldSets={fieldSets} stories={stories} alsoIn={[]} onSave={onSaveNpc}
                        avatar={avatars[n.id]} onImage={onImage ? (f) => onImage(n.id, f) : undefined}
                        onCopy={n.storyId === story.id ? undefined : () => void copyNpc(n)} onClose={() => setOpenNpc(null)} />
                    )}
                  </div>
                );
              })}

              <div className="setup-row">
                <span className="setup-k grow"><span>Characters</span><small>{cards.length === 0 ? "Full cards from your Library, sent as they are. " : ""}Turn off “Track in Scene” for a card with several characters, a world card, or anyone you don't want in the Scene's cast; it is still sent to the AI.</small></span>
                {pickers ? (
                  <button type="button" className="link" onClick={() => pickers.card([...draft.cast.map((m) => m.characterId ?? ""), narratorCard?.id ?? ""].filter(Boolean),
                    (id) => change({ cast: [...draft.cast, { characterId: id, variantId: null, role: "character", presence: "in_scene", muted: false, joinedAtMessageId: null }] }))}>+ Add a Card</button>
                ) : <select className="link-select" aria-label="Add a card" value="" onChange={(e) => e.target.value && change({ cast: [...draft.cast, { characterId: e.target.value, variantId: null, role: "character", presence: "in_scene", muted: false, joinedAtMessageId: null }] })}>
                  <option value="">+ Add a Card</option>
                  {characters.filter((c) => !draft.cast.some((m) => m.characterId === c.id) && narratorCard?.id !== c.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>}
              </div>
              {cards.map((m) => {
                const c = charById[m.characterId!];
                if (!c) return null;
                const version = m.variantId ? c.variants.find((v) => v.id === m.variantId) : undefined;
                const pic = (m.variantId ? avatars[variantAvatarId(c.id, m.variantId)] : undefined) ?? avatars[c.id];
                return (
                  <div key={c.id} className="setup-row sub" data-testid="story-card-row">
                    <AvatarDot name={c.name} avatar={pic} size={26} />
                    <span className="setup-k grow"><span>{effectiveCharacter(c, m.variantId).name}</span><small>{[version ? `Card · ${version.label} version` : "Card, joins as it is", isTracked(m, c) ? "" : "not tracked in the Scene"].filter(Boolean).join(" · ")}</small></span>
                    <span className="cast-track" title="Off: sent whole to the AI, but the Scene does not list it as one person (its people are added by name). The card's own choice is the default.">Track in Scene
                      <Switch label={`Track ${c.name} in the Scene`} checked={isTracked(m, c)}
                        onChange={(v) => change({ cast: draft.cast.map((x) => { if (x.characterId !== c.id) return x; const { tracked: _t, ...rest } = x; return v === (c.tracked ?? true) ? rest : { ...rest, tracked: v }; }) })} /></span>
                    {c.variants.length > 0 && (
                      <VersionSelect c={c} value={m.variantId} label={`Version of ${c.name}`}
                        onChange={(v) => change({ cast: draft.cast.map((x) => (x.characterId === c.id ? { ...x, variantId: v } : x)) })} />
                    )}
                    <IconButton label={`Remove ${c.name} from the story`} onClick={() => change({ cast: draft.cast.filter((x) => x.characterId !== c.id) })}><Icon name="close" size={13} /></IconButton>
                  </div>
                );
              })}
            </SetupSection>

            <SetupSection title="How it starts" aside="for new chats" testId="story-start">
              <div className="setup-row column">
                <span className="setup-k"><span>Scenario</span><small>Sent with every reply, in every chat.</small></span>
                <textarea className="prose-input" rows={2} aria-label="Scenario" value={draft.scenario}
                  placeholder="e.g. A high-fantasy world. The party meets at a tavern in Greywater, the night the bells stop ringing."
                  onChange={(e) => change({ scenario: e.target.value })} />
              </div>
              <div className="setup-row column">
                <span className="opening-head">
                  <span className="setup-k grow"><span>Openings</span><small>New Chat asks which one to start with. Chats already started keep theirs.</small></span>
                  <span className="opening-tabs" role="tablist" aria-label="Openings">
                    {openings.map((_, i) => (
                      <button key={i} type="button" role="tab" aria-selected={i === tab} className={`opening-tab${i === tab ? " on" : ""}`} onClick={() => setOpeningTab(i)}>{i + 1}</button>
                    ))}
                    <button type="button" className="opening-tab" aria-label="Add an opening" onClick={() => { change({ openings: [...openings, ""] }); setOpeningTab(openings.length); }}>+</button>
                  </span>
                </span>
                {greetingCards.length > 0 && (
                  <select className="link-select wide" aria-label="Add a card's greeting as an opening" value="" onChange={(e) => e.target.value && addGreeting(e.target.value)}>
                    <option value="">+ From a card's greetings</option>
                    {greetingCards.map((c) => (
                      <optgroup key={c.id} label={c.name}>
                        {c.firstMessages.map((m, i) => (m.trim() ? <option key={i} value={`${c.id}:${i}`}>{`${i === 0 ? "First message" : `Greeting ${i}`}: ${m.replace(/\s+/g, " ").slice(0, 70)}`}</option> : null))}
                      </optgroup>
                    ))}
                  </select>
                )}
                <textarea className="prose-input" rows={4} aria-label={`Opening ${tab + 1}`} value={openings[tab] ?? ""} placeholder="The narrator's first message (optional)"
                  onChange={(e) => setOpening(tab, e.target.value)} />
                {openings.length > 1 && <button type="button" className="link align-end" onClick={() => { change({ openings: openings.filter((_, j) => j !== tab) }); setOpeningTab(Math.max(0, tab - 1)); }}>Remove opening {tab + 1}</button>}
              </div>
            </SetupSection>

            {/* the chats: last on the page, in the page's column (Daniel: "in the corner, following the page's layout") */}
            {!isKit && (
              <SetupSection title="Chats" aside="each one is its own adventure from this story" testId="story-chats">
                <ChatList testId="story-chat-list" initial={3} empty="No chats yet. Start one: it takes this story's setup."
                  chats={(chats ?? []).map((c) => ({
                    session: c.session, lastLine: c.lastLine, messages: c.messages, when: c.when,
                    badges: <>
                      {c.changes > 0 && <span className="changed-chip">{c.changes} change{c.changes === 1 ? "" : "s"}</span>}
                      {c.opening !== null && <span className="hint">opening {c.opening + 1}</span>}
                      {(c.branches ?? 1) > 1 && <span className="hint">{c.branches} branches</span>}
                    </>,
                  }))}
                  search={chatTools?.search ?? (async () => ({}))}
                  onOpen={(id, mid) => { flush(); if (chatTools) chatTools.onOpen(id, mid); else onOpenSession(id); }}
                  onRename={(id, t) => chatTools?.onRename(id, t)} onExport={(id, f) => chatTools?.onExport(id, f)} onTrash={(id) => chatTools?.onTrash(id)}
                  onNew={() => setNewChat(true)} />
              </SetupSection>
            )}
          </div>

          <div className="story-col">
            <SetupSection title="How you play">
              <div className="setup-row column">
                <Segmented label="How you play" value={draft.userRole} onChange={(userRole) => change({ userRole })}
                  options={[{ value: "player", label: "Player" }, { value: "coauthor", label: "Co-author" }, { value: "director", label: "Director" }]} />
                <p className="hint">{ROLE_HELP[draft.userRole]}</p>
              </div>
            </SetupSection>

            <SetupFields mode="story" layer={draft.setup} onChange={(s) => change({ setup: s })} names={setup.namesFor(undefined)} director={draft.userRole === "director"}
              presets={setup.presets} profiles={setup.profiles} personas={setup.personas} trackers={setup.trackers} agents={setup.agents}
              aside="every chat of this story starts with this" testId="story-setup" />
            {(() => {
              // D-046: block edits saved on this story before D-045 still change its prompt, so they stay visible and removable
              const changedBlocks = Object.values(draft.setup.presetOverrides ?? {})
                .reduce((n, o) => n + Object.keys(o.blocks ?? {}).length + (o.order ? 1 : 0), 0);
              if (!changedBlocks) return null;
              return <p className="hint row-line wrap" data-testid="story-prompt-changes">
                <span>This story changes {changedBlocks === 1 ? "1 prompt block" : `${changedBlocks} prompt blocks`} of its preset.</span>
                <button type="button" className="link" onClick={() => { const next = { ...draft.setup }; delete next.presetOverrides; change({ setup: next }); }}>Use the preset as it is</button>
              </p>;
            })()}

            <AuthorsNoteGroup level="story" layer={draft.setup} above={setup.noteAbove(undefined)} onChange={(s) => change({ setup: s })} testId="story-authors-note" />

            <SetupSection title="Lore" aside="only facts about the world">
              <div className="setup-row">
                <LorebookChips bare ids={lore} books={lorebooks} onOpen={onOpenLorebook} help=""
                  onChange={(ids) => change({ setup: { ...draft.setup, lorebooks: { mode: "add", add: ids, remove: [] } } })} emptyText="None." addLabel="+ Add a Lorebook" />
              </div>
            </SetupSection>
            <p className="hint">{isKit ? "A story started from this Kit gets a copy of all this; changing the Kit later does not change it."
              : "Changes here reach every chat that did not change the same thing, from its next reply."}</p>
          </div>
        </div>

      </div>

      {newChat && (
        <NewChatSheet story={draft} openings={newChatOpenings} chats={chats ?? []} title={nextTitle} setup={setup}
          onStart={startChat} onClose={() => setNewChat(false)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ New Chat
export function NewChatSheet({ story, openings, chats, title, setup, onStart, onClose }: {
  story: Story; openings: string[]; chats: StoryChat[]; title: string; setup: StorySetupProps;
  onStart: (c: NewChatChoice) => void; onClose: () => void;
}) {
  const [name, setName] = useState(title);
  const usable = openings.map((o, i) => ({ o, i })).filter((x) => x.o.trim());
  const [pick, setPick] = useState<number | "own">(usable[0]?.i ?? "own");
  const [own, setOwn] = useState("");
  const [changing, setChanging] = useState(false);
  const [layer, setLayer] = useState<SetupLayer>({});
  const names = setup.namesFor(story.setup);
  const usedIn = (i: number) => chats.filter((c) => c.opening === i).map((c) => c.session.title);
  const trackerNames = setup.trackers.filter((t) => {
    const a = story.setup.agents;
    return a && a.mode !== "keep" && a.add.includes(t.agent.id) && !a.remove.includes(t.agent.id);
  }).map((t) => t.agent.name);
  const summary = [names.preset, names.connection, trackerNames.length ? trackerNames.join(", ") : "no trackers", story.userRole === "director" ? "Director mode" : `You play as ${names.persona}`].join(" · ");
  const start = () => onStart({
    title: name.trim() || title,
    openingIndex: typeof pick === "number" ? pick : 0,
    ...(pick === "own" ? { openingText: own } : {}),
    setup: layer,
  });
  return (
    <Modal title={`New chat in ${story.name}`} onClose={onClose} testId="new-chat-sheet" className="modal-chat">
      <p className="hint">A new adventure from the same story. Your other chats are not touched.</p>
      <label className="stack"><span className="setup-title">Name</span><input aria-label="Chat name" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <SetupSection title="Start with">
        {usable.map(({ o, i }) => {
          const used = usedIn(i);
          return (
            <label key={i} className={`setup-row choice-row${pick === i ? " on" : ""}`}>
              <input type="radio" name="opening" checked={pick === i} onChange={() => setPick(i)} aria-label={`Opening ${i + 1}`} />
              <span className="setup-k grow"><span>Opening {i + 1}</span><q className="opening-line">{o.replace(/\s+/g, " ").slice(0, 140)}</q></span>
              {used.length > 0 && <span className="tag">used in {used.join(", ")}</span>}
            </label>
          );
        })}
        <label className={`setup-row choice-row${pick === "own" ? " on" : ""}`}>
          <input type="radio" name="opening" checked={pick === "own"} onChange={() => setPick("own")} aria-label="Write my own" />
          <span className="setup-k grow"><span>Write my own</span><small>Type the first message of this chat only.</small></span>
        </label>
        {pick === "own" && (
          <div className="setup-row column"><textarea className="prose-input" rows={3} aria-label="First message" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="The narrator's first message (optional)" /></div>
        )}
      </SetupSection>
      {!changing ? (
        <SetupSection title="Setup">
          <div className="setup-row">
            <span className="setup-k grow"><span>Same as the story</span><small>{summary}</small></span>
            <button type="button" className="link" onClick={() => setChanging(true)}>Change for this chat…</button>
          </div>
        </SetupSection>
      ) : (
        <SetupFields mode="chat" layer={layer} onChange={setLayer} above={story.setup} names={names} director={story.userRole === "director"}
          presets={setup.presets} profiles={setup.profiles} personas={setup.personas} trackers={setup.trackers} agents={setup.agents} testId="new-chat-setup" />
      )}
      <div className="modal-foot">
        <span className="hint grow">{pick === "own" ? "Only your message starts this chat." : "The other openings become swipes of the first message."}</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="prominent" onClick={start} data-testid="start-chat">Start Chat</Button>
      </div>
    </Modal>
  );
}

/** Which version of a card a story uses (slice 1 versions; null = Main). Only shown when the card has versions. */
function VersionSelect({ c, value, label, onChange }: { c: Character; value: string | null; label: string; onChange: (v: string | null) => void }) {
  return (
    <select className="link-select version-select" aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Main</option>
      {c.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
    </select>
  );
}
