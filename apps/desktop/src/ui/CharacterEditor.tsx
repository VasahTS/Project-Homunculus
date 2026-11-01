// Homunculus 2 — create / edit a character, its versions (variants) and its history. Author: CLAUDE, 2026-10-23;
// 2026-10-28 (slice 1): versions side by side, a picture per version, history of saves, Move to Trash.
// 2026-11-01 (D-070): three layouts the user picks (Sheet · Tabs · Writer, remembered), a greetings editor (alternates
// included), the Description's <sections>, token counts, Save and Chat Now always in sight (Ctrl+S).
import { LorebookChips } from "./LorePanels.tsx";
import { useEffect, useId, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { characterNoteOf, estimateTokens, regexScriptsOf as regexOf } from "@homunculus/core";
import type { RegexScript } from "@homunculus/schemas";
import { RegexList } from "./RegexScripts.tsx";
import { Character, type Avatar, type CharacterNote, type HistoryEntry, type Lorebook } from "@homunculus/schemas";
import { effectiveCharacter, variantAvatarId, type CharacterExporter } from "@homunculus/core";
import { avatarUrl } from "../files.ts";
import { cardSections, cleanGreetings } from "../cardSections.ts";
import { Help } from "./Help.tsx";
import { Button, IconButton, Icon, RiseText, Segmented } from "./kit.tsx";
import { enter, useSlidingPill } from "./motion.ts";
import { AutoText, Greetings, tokensText } from "./Greetings.tsx";
import { FieldLabel, HistoryList, pruneVariants, useVersionedDraft, VersionBar, type HistoryField } from "./Versions.tsx";

const blank = (): Character => ({
  id: crypto.randomUUID(), name: "", description: "", personality: "", scenario: "", firstMessages: [""],
  exampleMessages: "", systemPrompt: "", postHistoryInstructions: "", creatorNotes: "", creator: "", characterVersion: "", tags: [], variants: [], lorebookIds: [],
});

type Fields = Pick<Character, "name" | "description" | "personality" | "scenario" | "firstMessages" | "exampleMessages" | "systemPrompt" | "postHistoryInstructions" | "creatorNotes" | "tags" | "characterNote">;
type Draft = ReturnType<typeof useVersionedDraft<Fields, Character>>;
type TextKey = "description" | "personality" | "scenario" | "exampleMessages" | "systemPrompt" | "postHistoryInstructions" | "creatorNotes";

export const CHARACTER_HISTORY_FIELDS: HistoryField[] = [
  { key: "name", label: "name" }, { key: "description", label: "description" }, { key: "personality", label: "personality" },
  { key: "scenario", label: "scenario" }, { key: "firstMessages", label: "greetings" }, { key: "exampleMessages", label: "example dialogue" },
  { key: "systemPrompt", label: "system prompt" }, { key: "postHistoryInstructions", label: "post-history instructions" },
  { key: "creatorNotes", label: "creator notes" }, { key: "tags", label: "tags" }, { key: "variants", label: "versions" },
];

/** The editor's layout (D-070): the user picks it; remembered on this computer. */
export type EditorLayout = "sheet" | "tabs" | "writer";
const LAYOUT_KEY = "h2.characterEditor.layout";
const readLayout = (): EditorLayout => { try { const v = localStorage.getItem(LAYOUT_KEY); return v === "tabs" || v === "writer" ? v : "sheet"; } catch { return "sheet"; } };
type Tab = "character" | "greetings" | "prompt" | "lore" | "about" | "history";

const HELP = {
  name: "What the character is called. {{char}} in prompts becomes this name. A version can use another name.",
  description: "Who the character is: looks, background, important facts. This is the main thing the AI reads. Tip: wrap parts in tags like <name> … </name> (or start them with # headings) and they show up as sections you can jump to.",
  personality: "How they think and behave, in a few lines. Optional — many people put this inside the description.",
  scenario: "Where and how the story starts. Optional.",
  exampleMessages: "Sample messages that show the AI how this character talks. SillyTavern format: blocks starting with <START>.",
  systemPrompt: "If filled, replaces the default instruction at the top of the prompt for this character. Leave empty to use the default.",
  postHistoryInstructions: "Sent after the conversation, right before the AI answers. Good for short reminders (e.g. 'keep replies short').",
  creatorNotes: "Notes from the card's author for the reader. Not sent to the AI.",
  tags: "Labels to organize characters. Press Enter or a comma to add one. Not sent to the AI.",
  regex: "Find and replace that runs by itself in chats with this character, after the global and the preset's scripts. Scripts that came with a card run only after you allow them. Exporting the card puts them back in.",
  history: "Every time you save, the whole character (with all its versions) is kept here. Open one to see what changed, and restore it if you want it back. Pictures are not part of the history.",
  lore: "Lorebooks that come with this character: read in every session with them (a session can switch one off in its Prompt tab). A card's embedded lorebook is linked here, and exporting the card puts it back in.",
  meter: "About how many tokens this character adds to every reply (greetings are sent only when a chat starts). A token is roughly 3–4 letters.",
  layout: "How this editor is arranged: Sheet (everything on one page), Tabs (one part at a time) or Writer (one document with an outline). Same character, same fields; pick what you like. Remembered on this computer.",
};

/** One text field of the card (works on the version being edited). */
function TextField({ v, k, label, help, rows, sub, plain = false, mono = false, prose = false, placeholder, inputRef }: {
  v: Draft; k: TextKey; label: string; help: string; rows: number; sub?: string; plain?: boolean; mono?: boolean; prose?: boolean; placeholder?: string;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const value = v.get(k) as string;
  const cls = `${plain ? "ce-plain" : "ce-ta"}${mono ? " mono" : ""}${prose ? " prose" : ""}`;
  const common = { "aria-label": label, value, placeholder, onChange: (e: { target: { value: string } }) => v.set(k, e.target.value) };
  return (
    <div className="ce-field">
      <div className="ce-lab"><FieldLabel label={label} help={help} changed={v.isChanged(k)} onReset={() => v.reset(k)} />{sub && <span className="ce-sub">{sub}</span>}<span className="ce-tok">{tokensText(value)}</span></div>
      {plain ? <AutoText className={cls} {...common} inputRef={inputRef} /> : <textarea className={cls} rows={rows} {...common} ref={inputRef} />}
    </div>
  );
}

function TagInput({ value, onChange }: { value: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => { const t = text.trim().replace(/,+$/, "").trim(); if (t && !value.includes(t)) onChange([...value, t]); setText(""); };
  return (
    <div className="ce-tags">
      {value.map((t) => <span className="ce-tag" key={t}>{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button></span>)}
      <input aria-label="Tags" placeholder="+ tag" value={text} onChange={(e) => setText(e.target.value)} onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }} />
    </div>
  );
}

export function CharacterEditor({ character, avatars, justSaved = false, exporters, onSave, onTrash, onChangeAvatar, onExport, onStartSession, onClose, loadHistory, lorebooks, onOpenLorebook, regexWaiting, onAllowRegex }: {
  character: Character | null; // null = new character
  /** The character's pictures: its id, and "<id>#<version>" for versions with their own. */
  avatars: Record<string, Avatar>;
  justSaved?: boolean;
  exporters: CharacterExporter[];
  onSave: (c: Character) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  onChangeAvatar: (ownerKey: string, file: File | null) => Promise<void>;
  /** Exports one version (as a normal SillyTavern card). */
  onExport: (c: Character, exporterId: string, avatar?: Avatar) => void;
  onStartSession: (c: Character, variantId: string | null) => void;
  onClose: () => void;
  loadHistory: (id: string) => Promise<HistoryEntry[]>;
  lorebooks: Lorebook[];
  onOpenLorebook: (id: string) => void;
  regexWaiting?: (s: RegexScript) => boolean;
  onAllowRegex?: (s: RegexScript[]) => void;
}) {
  const isNew = character === null;
  const [draft, setDraftState] = useState<Character>(() => character ?? blank());
  const [variantId, setVariantId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(justSaved);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [layout, setLayoutState] = useState<EditorLayout>(readLayout);
  const [tab, setTab] = useState<Tab>("character");
  const [active, setActive] = useState("description");
  const [dropping, setDropping] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const descBox = useRef<HTMLTextAreaElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const tabbar = useRef<HTMLDivElement>(null);
  const tabLine = useRef<HTMLSpanElement>(null);
  const uid = useId();
  const sid = (name: string) => `${uid}-${name}`;
  const exists = !isNew || saved;
  const setDraft = (fn: (d: Character) => Character) => { setDraftState(fn); setSaved(false); setDirty(true); };
  const v = useVersionedDraft<Fields, Character>(draft, setDraft, variantId);
  const setLayout = (l: EditorLayout) => { setLayoutState(l); try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* a convenience only */ } };

  const refreshHistory = () => { if (exists) void loadHistory(draft.id).then(setHistory); };
  useEffect(() => { if (historyOpen) refreshHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [historyOpen]);
  useEffect(() => { if (layout === "tabs" && tab === "history") setHistoryOpen(true); }, [layout, tab]);

  // Motion (D-072, the Coffra reference): opening the editor or switching its layout brings the bar, the head and each
  // block of the page in one after another; switching a tab brings the new tab's blocks in the same way (the old ones
  // leave at once). The tab underline glides to the tab. All of it is skipped under reduced motion (motion.ts).
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const body = el.querySelector(".ce-body");
    const pane = el.querySelector<HTMLElement>(".ce-pane");
    const firsts = [el.querySelector(".ce-bar"), ...(layout === "tabs" ? [el.querySelector(".ce-thead"), el.querySelector(".ce-tabbar")] : [...(body?.children ?? [])])];
    const items = [...firsts, ...(pane ? blocksOf(pane) : [])].filter((x): x is Element => !!x);
    enter(items, { y: 10, stagger: 55, duration: 620, max: 12 });
  }, [layout]);
  const tabMounted = useRef(false);
  useLayoutEffect(() => {
    if (!tabMounted.current) { tabMounted.current = true; return; }
    const pane = root.current?.querySelector<HTMLElement>(".ce-pane");
    if (pane) enter(blocksOf(pane), { y: 10, stagger: 50, duration: 560, max: 10 });
  }, [tab]);
  useSlidingPill(tabbar, tabLine, "button.on", `${layout}:${tab}`);

  const save = async (d: Character = draft) => {
    if (!d.name.trim()) { setError("The character needs a name."); return; }
    setError("");
    try {
      const clean = pruneVariants<Fields, Character>({
        ...d, name: d.name.trim(), firstMessages: cleanGreetings(d.firstMessages),
        variants: d.variants.map((x) => (x.overrides.firstMessages ? { ...x, overrides: { ...x.overrides, firstMessages: cleanGreetings(x.overrides.firstMessages) } } : x)),
      });
      await onSave(clean);
      setDraftState(clean);
      setSaved(true);
      setDirty(false);
      if (historyOpen) refreshHistory();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); void saveRef.current(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trash = async () => {
    try { await onTrash(draft.id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const restore = async (data: unknown) => {
    const old = Character.parse({ ...(data as object), id: draft.id });
    if (variantId && !old.variants.some((x) => x.id === variantId)) setVariantId(null);
    await save(old);
  };

  const addVersion = (label: string) => {
    const id = crypto.randomUUID();
    setDraft((d) => ({ ...d, variants: [...d.variants, { id, label, overrides: {}, hasOwnAvatar: false }] }));
    setVariantId(id);
  };
  const renameVersion = (id: string, label: string) => setDraft((d) => ({ ...d, variants: d.variants.map((x) => (x.id === id ? { ...x, label } : x)) }));
  const deleteVersion = (id: string) => {
    setDraft((d) => ({ ...d, variants: d.variants.filter((x) => x.id !== id) }));
    setVariantId(null);
    if (avatars[variantAvatarId(draft.id, id)]) void onChangeAvatar(variantAvatarId(draft.id, id), null);
  };

  // the picture of the version being edited: its own, or the main one
  const ownKey = variantId ? variantAvatarId(draft.id, variantId) : draft.id;
  const ownAvatar = avatars[ownKey];
  const shownAvatar = ownAvatar ?? avatars[draft.id];
  const versionSaved = !variantId || (character?.variants.some((x) => x.id === variantId) ?? false) || saved;
  const canPicture = exists && versionSaved;
  const shownName = v.get("name") || "?";
  const exportVersion = (exporterId: string) => onExport(effectiveCharacter(pruneVariants<Fields, Character>(draft), variantId), exporterId, shownAvatar);
  const greetings = v.get("firstMessages");
  const note: CharacterNote = v.get("characterNote") ?? characterNoteOf(draft) ?? { text: "", depth: 4, role: "system" };
  const desc = v.get("description");
  const sections = cardSections(desc);
  const scripts = regexOf(draft);

  // ── tokens sent with every reply, by part (greetings only at the start)
  const parts: Array<{ key: string; label: string; text: string }> = [
    { key: "desc", label: "Description", text: desc }, { key: "pers", label: "Personality", text: v.get("personality") },
    { key: "scen", label: "Scenario", text: v.get("scenario") }, { key: "note", label: "Character's Note", text: note.text },
    { key: "ex", label: "Examples", text: v.get("exampleMessages") }, { key: "sys", label: "System prompt", text: v.get("systemPrompt") },
    { key: "post", label: "Post-history", text: v.get("postHistoryInstructions") },
  ].filter((p) => p.text.trim());
  const partTokens = parts.map((p) => ({ ...p, n: estimateTokens(p.text) }));
  const total = partTokens.reduce((s, p) => s + p.n, 0);

  // ── jumping to a part of the Description
  const jumpTo = (pos: number) => {
    const go = () => {
      const el = descBox.current; if (!el) return;
      el.focus({ preventScroll: true }); el.setSelectionRange(pos, pos);
      const ratio = pos / Math.max(1, el.value.length);
      const box = scroller.current;
      if (layout === "writer" && box) {
        box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop + el.scrollHeight * ratio - 90, behavior: "smooth" });
      } else { el.scrollTop = Math.max(0, el.scrollHeight * ratio - 30); el.scrollIntoView({ block: "nearest" }); }
    };
    if (layout === "tabs" && tab !== "character") { setTab("character"); requestAnimationFrame(() => requestAnimationFrame(go)); } else go();
  };
  const scrollToPart = (name: string, focus = false) => {
    const el = document.getElementById(sid(name)); const box = scroller.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - (layout === "sheet" ? 52 : 24), behavior: "smooth" });
    if (focus) el.querySelector<HTMLElement>("textarea, input")?.focus({ preventScroll: true });
  };
  const spy = () => {
    const box = scroller.current; if (!box || layout !== "sheet") return;
    const top = box.getBoundingClientRect().top + 70;
    let cur = "description";
    for (const id of ["description", "greetings", "details", "prompt", "more"]) {
      const el = document.getElementById(sid(id));
      if (el && el.getBoundingClientRect().top <= top) cur = id;
    }
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) cur = "more";
    setActive(cur);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDropping(false);
    const f = e.dataTransfer.files[0];
    if (canPicture && f?.type.startsWith("image/")) void onChangeAvatar(ownKey, f);
  };

  // ── shared pieces (each layout places them differently)
  const title = isNew && !saved ? "New Character" : draft.name || "Character";
  const status = error ? null : saved && !dirty ? <span className="ok-text">✓ Saved</span> : dirty ? <span className="ce-dirty">Unsaved changes</span> : null;

  const portrait = (small = false) => (
    <div className={`ce-portrait${small ? " small" : ""}${dropping ? " dropping" : ""}`} data-testid="character-portrait"
      onDragOver={(e) => { if (canPicture) { e.preventDefault(); setDropping(true); } }} onDragLeave={() => setDropping(false)} onDrop={onDrop}>
      {shownAvatar
        ? <img className="avatar-big" src={avatarUrl(shownAvatar)} alt={`${shownName} portrait`} />
        : <button type="button" className="avatar-big placeholder" disabled={!canPicture} onClick={() => imageInput.current?.click()}
            aria-label={canPicture ? "Add image" : "No image yet"} title={canPicture ? "Click or drop an image here" : undefined}>{shownName.slice(0, 1).toUpperCase()}</button>}
      {!small && (canPicture ? (
        <div className="ce-pic-actions">
          {variantId && <p className="hint">{ownAvatar ? "This version has its own picture." : "This version uses the main picture."}</p>}
          <button type="button" className="btn btn-plain btn-small" onClick={() => imageInput.current?.click()}>
            {variantId ? (ownAvatar ? "Change this version's image" : "Add an image for this version") : avatars[draft.id] ? "Change image" : "Add image"}
          </button>
          {ownAvatar && <button type="button" className="btn btn-plain btn-small" onClick={() => void onChangeAvatar(ownKey, null)}>{variantId ? "Use the main image" : "Remove image"}</button>}
        </div>
      ) : <p className="hint">{exists ? "Save to add an image for this version." : "Create the character first to add an image."}</p>)}
      {small && canPicture && ownAvatar && <button type="button" className="ce-pic-x" aria-label={variantId ? "Use the main image" : "Remove image"} onClick={() => void onChangeAvatar(ownKey, null)}>×</button>}
      {canPicture && <input ref={imageInput} type="file" accept="image/*" hidden data-testid="avatar-input"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onChangeAvatar(ownKey, f); }} />}
    </div>
  );

  const nameField = (cls: string) => (
    <div className="ce-field">
      <div className="ce-lab"><FieldLabel label="Name" help={HELP.name} changed={v.isChanged("name")} onReset={() => v.reset("name")} /></div>
      <input className={`ce-name ${cls}`} aria-label="Name" value={v.get("name")} onChange={(e) => v.set("name", e.target.value)} placeholder="e.g. Lyra" autoComplete="off" />
    </div>
  );

  const versions = <VersionBar what="character" variants={draft.variants} current={variantId} onPick={setVariantId} onAdd={addVersion} onRename={renameVersion} onDelete={deleteVersion} />;

  const cardKind = (
    <div className="card-kind" data-testid="card-kind">
      <span className="label-row">In the Scene <Help text="The default for every story and chat with this card; each can change it in its cast (Story → Characters, or “Who is in this story” in a chat)." /></span>
      <Segmented small label="In the Scene" value={draft.tracked === false ? "no" : "yes"}
        options={[{ value: "yes", label: "Track as a person" }, { value: "no", label: "Don't track" }]}
        onChange={(k) => setDraft((d) => { const { tracked: _t, ...rest } = d; return k === "no" ? { ...rest, tracked: false } : rest; })} />
      <small className="hint card-kind-hint">{draft.tracked === false
        ? "Sent whole to the AI, but the Scene does not list it as one person. If it holds several characters, each one is added by name as they appear."
        : "Use “Don't track” for a card with several characters, a world or scenario card, or anyone you don't want in the Scene's cast. The card is still sent to the AI."}</small>
    </div>
  );

  const lore = <LorebookChips ids={draft.lorebookIds} books={lorebooks} onOpen={onOpenLorebook} onChange={(lorebookIds) => setDraft((d) => ({ ...d, lorebookIds }))} help={HELP.lore} />;

  const tags = (
    <div className="ce-field">
      <div className="ce-lab"><FieldLabel label="Tags" help={HELP.tags} changed={v.isChanged("tags")} onReset={() => v.reset("tags")} /></div>
      <TagInput value={v.get("tags")} onChange={(t) => v.set("tags", t)} />
    </div>
  );

  const meter = (
    <div className="ce-meter" data-testid="token-meter">
      <div className="ce-meter-sum"><span className="label-row">Sent with every reply <Help text={HELP.meter} /></span><b>{total ? `~${total.toLocaleString()} tokens` : "—"}</b></div>
      <div className="ce-meter-bar" aria-hidden>{partTokens.map((p) => <span key={p.key} className={`m-${p.key}`} style={{ width: `${(p.n / Math.max(1, total)) * 100}%` }} />)}</div>
      {partTokens.length > 0 && <div className="ce-meter-legend">{partTokens.map((p) => <span key={p.key}><i className={`m-${p.key}`} />{p.label} {p.n.toLocaleString()}</span>)}</div>}
    </div>
  );

  const exportRow = exists && versionSaved && exporters.length > 0 ? (
    <div className="ce-field">
      <span className="label-row muted">{variantId ? "Export this version" : "Export"} <Help text="Save this character as a SillyTavern card (one version per card: the one you are looking at). Fields Homunculus doesn't use (like an embedded lorebook) are kept, so nothing is lost. The file goes to your Downloads folder." /></span>
      <div className="export-row">{exporters.map((x) => (
        <button key={x.id} type="button" className="btn btn-bordered btn-small" title={x.help} onClick={() => exportVersion(x.id)}>{x.name.replace(/^SillyTavern card \((.+)\)$/, "$1 card")}</button>
      ))}</div>
    </div>
  ) : null;

  const trashButton = !isNew ? <div><Button small variant="destructive" onClick={() => void trash()}>Move to Trash</Button></div> : null;

  const outlineChips = sections.length > 0 && (
    <div className="ce-outline-chips" data-testid="description-sections">
      {sections.map((s) => (
        <button type="button" key={`${s.name}-${s.pos}`} onClick={() => jumpTo(s.pos)} title={`Go to ${s.name}`}>
          {s.kind === "tag" ? `<${s.name}>` : s.name}{s.length > 0 && <i>~{Math.ceil(s.length / 3.6)}</i>}
        </button>
      ))}
    </div>
  );

  const description = (opts: { plain?: boolean; rows?: number; label?: boolean }) => (
    <div className="ce-field ce-desc">
      {opts.label !== false && <div className="ce-lab"><FieldLabel label="Description" help={HELP.description} changed={v.isChanged("description")} onReset={() => v.reset("description")} /><span className="ce-sub">the main thing the AI reads</span><span className="ce-tok">{tokensText(desc)}</span></div>}
      {outlineChips}
      {opts.plain
        ? <AutoText className="ce-plain prose" aria-label="Description" value={desc} inputRef={(el) => { descBox.current = el; }} onChange={(e) => v.set("description", e.target.value)}
            placeholder="Who they are: looks, background, how they talk. Wrap parts in <tags> … </tags> and they appear in the outline." />
        : <textarea className="ce-ta prose" rows={opts.rows ?? 14} aria-label="Description" value={desc} ref={descBox} onChange={(e) => v.set("description", e.target.value)}
            placeholder={"Who they are: looks, background, how they talk.\nTip: wrap parts in tags like <name> … </name> and they become sections you can jump to."} />}
    </div>
  );

  const greetingsEditor = (look: "list" | "strip" | "inline") => (
    <Greetings look={look} value={greetings} onChange={(g) => v.set("firstMessages", g)} name={v.get("name")} avatarSrc={shownAvatar ? avatarUrl(shownAvatar) : undefined}
      changed={v.isChanged("firstMessages")} onReset={() => v.reset("firstMessages")} />
  );

  const noteField = <CharacterNoteField value={note} changed={v.isChanged("characterNote")} onReset={() => v.reset("characterNote")} onChange={(n) => v.set("characterNote", n)} />;
  const regexBlock = (
    <RegexList scripts={scripts} onChange={(next) => setDraft((d) => ({ ...d, regexScripts: next }))} testId="character-regex-list"
      waiting={regexWaiting} onAllow={onAllowRegex} emptyText="No scripts on this character." />
  );
  const regexDetails = (
    <details className="advanced" open={scripts.some((x) => regexWaiting?.(x)) || undefined}>
      <summary>Regex scripts{scripts.length ? ` (${scripts.length})` : ""} <Help text={HELP.regex} /></summary>
      {regexBlock}
    </details>
  );
  const credit = draft.creator ? <p className="hint">Card by {draft.creator}{draft.characterVersion ? ` · version ${draft.characterVersion}` : ""}</p> : null;
  const historyList = historyOpen ? <HistoryList entries={history ?? []} loading={history === null} fields={CHARACTER_HISTORY_FIELDS} onRestore={(d) => void restore(d)} /> : null;
  const historyDetails = exists ? (
    <details className="advanced" onToggle={(e) => setHistoryOpen((e.target as HTMLDetailsElement).open)}>
      <summary>History <Help text={HELP.history} /></summary>
      {historyList}
    </details>
  ) : null;
  const versionBanner = v.variant ? <div className="ce-banner"><b>{v.variant.label}</b> Fields you change here replace Main's; everything else follows Main.</div> : null;

  // ── the three layouts
  let body: ReactNode;
  if (layout === "sheet") {
    const jump: Array<[string, string, ReactNode?]> = [["description", "Description"], ["greetings", "Greetings", <span className="ce-n" key="n">{greetings.length}</span>], ["details", "Details"], ["prompt", "Prompt"], ["more", "More"]];
    body = (
      <div className="ce-body ce-sheet">
        <aside className="ce-side">
          {portrait()}
          {nameField("big")}
          {versions}
          {cardKind}
          {lore}
          {tags}
          {meter}
          {exportRow}
          {trashButton}
        </aside>
        <div className="ce-main" ref={scroller} onScroll={spy}>
          <nav className="ce-jump" aria-label="Parts of the card">
            {jump.map(([id, label, n]) => <button type="button" key={id} className={active === id ? "on" : ""} onClick={() => scrollToPart(id)}>{label}{n}</button>)}
          </nav>
          <div className="ce-sections">
            {versionBanner}
            <section className="ce-sec" id={sid("description")}>{description({})}</section>
            <section className="ce-sec" id={sid("greetings")}>{greetingsEditor("list")}</section>
            <section className="ce-sec" id={sid("details")}>
              <div className="ce-sec-head"><h3>Details</h3><p>Optional. Many people keep all of this inside the Description.</p></div>
              <div className="ce-two">
                <TextField v={v} k="personality" label="Personality" help={HELP.personality} rows={4} sub="optional" placeholder="How they think and behave, in a few lines." />
                <TextField v={v} k="scenario" label="Scenario" help={HELP.scenario} rows={4} sub="optional" placeholder="Where and how the story starts." />
              </div>
              <TextField v={v} k="exampleMessages" label="Example dialogue" help={HELP.exampleMessages} rows={4} mono sub="blocks start with <START>" placeholder={"<START>\n{{user}}: …\n{{char}}: …"} />
            </section>
            <section className="ce-sec" id={sid("prompt")}>
              <div className="ce-sec-head"><h3>Prompt</h3><p>Extra instructions that travel with this character.</p></div>
              {noteField}
              <div className="ce-two">
                <TextField v={v} k="systemPrompt" label="Character system prompt" help={HELP.systemPrompt} rows={3} placeholder="Leave empty to use the preset's." />
                <TextField v={v} k="postHistoryInstructions" label="Post-history instructions" help={HELP.postHistoryInstructions} rows={3} placeholder="Sent right before the AI answers." />
              </div>
            </section>
            <section className="ce-sec" id={sid("more")}>
              <div className="ce-sec-head"><h3>More</h3></div>
              {regexDetails}
              <TextField v={v} k="creatorNotes" label="Creator notes" help={HELP.creatorNotes} rows={3} sub="not sent to the AI" />
              {credit}
              {historyDetails}
            </section>
          </div>
        </div>
      </div>
    );
  } else if (layout === "tabs") {
    const tabs: Array<[Tab, string, number?]> = [["character", "Character"], ["greetings", "Greetings", greetings.length], ["prompt", "Prompt"],
      ["lore", "Lore & Regex", draft.lorebookIds.length + scripts.length || undefined], ["about", "About"], ...(exists ? [["history", "History"] as [Tab, string]] : [])];
    let pane: ReactNode = null;
    if (tab === "character") pane = (
      <div className="ce-tchar">
        {description({ rows: 18 })}
        <div className="ce-tside">
          <TextField v={v} k="personality" label="Personality" help={HELP.personality} rows={4} sub="optional" placeholder="How they think and behave." />
          <TextField v={v} k="scenario" label="Scenario" help={HELP.scenario} rows={4} sub="optional" placeholder="Where the story starts." />
          {cardKind}
          {tags}
          {meter}
        </div>
      </div>
    );
    if (tab === "greetings") pane = greetingsEditor("strip");
    if (tab === "prompt") pane = (
      <div className="ce-stack">
        {noteField}
        <TextField v={v} k="exampleMessages" label="Example dialogue" help={HELP.exampleMessages} rows={6} mono sub="blocks start with <START>" placeholder={"<START>\n{{user}}: …\n{{char}}: …"} />
        <TextField v={v} k="systemPrompt" label="Character system prompt" help={HELP.systemPrompt} rows={3} sub="replaces the preset's when filled" placeholder="Leave empty to use the preset's." />
        <TextField v={v} k="postHistoryInstructions" label="Post-history instructions" help={HELP.postHistoryInstructions} rows={3} placeholder="Sent right before the AI answers." />
      </div>
    );
    if (tab === "lore") pane = (
      <div className="ce-stack">
        {lore}
        <div className="ce-field"><span className="label-row">Regex scripts <Help text={HELP.regex} /></span>{regexBlock}</div>
      </div>
    );
    if (tab === "about") pane = (
      <div className="ce-stack">
        <TextField v={v} k="creatorNotes" label="Creator notes" help={HELP.creatorNotes} rows={5} sub="not sent to the AI" />
        {credit}
        {exportRow}
        {trashButton}
      </div>
    );
    if (tab === "history") pane = <div className="ce-stack">{historyList}</div>;
    body = (
      <div className="ce-body ce-tabsl">
        <div className="ce-thead">
          {portrait(true)}
          <div className="ce-twho">{nameField("big")}{versions}</div>
        </div>
        <div className="ce-tabbar" role="tablist" aria-label="Parts of the card" ref={tabbar}>
          <span className="ce-tabline" ref={tabLine} aria-hidden />
          {tabs.map(([k, label, n]) => (
            <button type="button" role="tab" key={k} aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}{n ? <span className="ce-n">{n}</span> : null}</button>
          ))}
        </div>
        <div className="ce-pane" ref={scroller}>{tab !== "greetings" && versionBanner}{pane}</div>
      </div>
    );
  } else {
    const item = (id: string, label: string, text?: string) => (
      <button type="button" key={id} className={`ce-oi${text !== undefined && !text.trim() ? " empty" : ""}`} onClick={() => scrollToPart(id, true)}>
        <span className="ce-dot" /><span className="ce-oi-t">{label}</span>{text?.trim() ? <span className="ce-tok">~{estimateTokens(text).toLocaleString()}</span> : null}
      </button>
    );
    body = (
      <div className="ce-body ce-writer">
        <nav className="ce-outline" aria-label="Outline">
          <span className="ce-k">Card</span>
          {item("name", v.get("name") || "Name", v.get("name"))}
          {item("description", "Description", desc)}
          {sections.map((s) => (
            <button type="button" key={`${s.name}-${s.pos}`} className="ce-oi sub tag" onClick={() => jumpTo(s.pos)}>
              <span className="ce-oi-t">{s.kind === "tag" ? `<${s.name}>` : s.name}</span>{s.length > 0 && <span className="ce-tok">~{Math.ceil(s.length / 3.6)}</span>}
            </button>
          ))}
          {item("personality", "Personality", v.get("personality"))}
          {item("scenario", "Scenario", v.get("scenario"))}
          {item("greetings", `Greetings · ${greetings.length}`)}
          {greetings.map((g, k) => (
            <button type="button" key={k} className={`ce-oi sub${g.trim() ? "" : " empty"}`} onClick={() => scrollToPart("greetings", false)}>
              <span className="ce-oi-t">{k === 0 ? "1 · Main" : k + 1} — {g.trim() ? g.replace(/[*"]/g, "").trim().slice(0, 32) : "empty"}</span>
            </button>
          ))}
          <span className="ce-k">Prompt</span>
          {item("examples", "Example dialogue", v.get("exampleMessages"))}
          {item("note", "Character's Note", note.text)}
          {item("system", "System prompt", v.get("systemPrompt"))}
          {item("post", "Post-history", v.get("postHistoryInstructions"))}
          <span className="ce-k">About</span>
          {item("notes", "Creator notes", v.get("creatorNotes"))}
        </nav>
        <div className="ce-doc" ref={scroller}>
          <div className="ce-page">
            {versionBanner}
            <div id={sid("name")}>{nameField("huge")}</div>
            <div id={sid("description")}>{description({ plain: true })}</div>
            <div id={sid("personality")}><TextField v={v} k="personality" label="Personality" help={HELP.personality} rows={1} plain prose sub="optional" placeholder="How they think and behave." /></div>
            <div id={sid("scenario")}><TextField v={v} k="scenario" label="Scenario" help={HELP.scenario} rows={1} plain prose sub="optional" placeholder="Where and how the story starts." /></div>
            <hr className="ce-rule" />
            <div id={sid("greetings")}>{greetingsEditor("inline")}</div>
            <hr className="ce-rule" />
            <div id={sid("examples")}><TextField v={v} k="exampleMessages" label="Example dialogue" help={HELP.exampleMessages} rows={1} plain mono sub="blocks start with <START>" placeholder={"<START>\n{{user}}: …\n{{char}}: …"} /></div>
            <div id={sid("note")}>{noteField}</div>
            <div id={sid("system")}><TextField v={v} k="systemPrompt" label="Character system prompt" help={HELP.systemPrompt} rows={1} plain sub="replaces the preset's when filled" placeholder="Leave empty to use the preset's." /></div>
            <div id={sid("post")}><TextField v={v} k="postHistoryInstructions" label="Post-history instructions" help={HELP.postHistoryInstructions} rows={1} plain sub="sent right before the AI answers" placeholder="Optional." /></div>
            <div id={sid("notes")}><TextField v={v} k="creatorNotes" label="Creator notes" help={HELP.creatorNotes} rows={1} plain sub="not sent to the AI" placeholder="Notes for whoever reads the card." />{credit}</div>
          </div>
        </div>
        <aside className="ce-side ce-insp">
          {portrait()}
          {versions}
          {cardKind}
          {lore}
          {tags}
          {meter}
          {regexDetails}
          {historyDetails}
          {exportRow}
          {trashButton}
        </aside>
      </div>
    );
  }

  return (
    <div className={`editor ce ce-l-${layout}`} aria-label="Character editor" ref={root}>
      <div className="session-bar ce-bar">
        <h2 className="editor-title"><RiseText text={title} />{v.variant ? <span className="title-version"> — {v.variant.label}</span> : null}</h2>
        <span className="spacer" />
        {status}
        <span className="ce-layout" title={HELP.layout}>
          <Segmented small label="Layout" value={layout} onChange={setLayout}
            options={[{ value: "sheet", label: "Sheet" }, { value: "tabs", label: "Tabs" }, { value: "writer", label: "Writer" }]} />
        </span>
        {exists && <button type="button" className="btn btn-bordered" title={`Start a chat with ${shownName === "?" ? "them" : shownName}${v.variant ? ` (${v.variant.label})` : ""}`}
          onClick={() => onStartSession(draft, variantId)}>Chat Now</button>}
        <button type="button" className="btn btn-prominent" title="Ctrl+S" onClick={() => void save()}>{isNew && !saved ? "Create Character" : "Save"}</button>
        <IconButton label="Close" onClick={onClose}><Icon name="close" size={14} /></IconButton>
      </div>
      {error && <div className="error-bar inline ce-error" role="alert">{error}</div>}
      {body}
    </div>
  );
}

/** The blocks of a tab that arrive one after another: the fields, not the boxes that only lay them out. */
function blocksOf(pane: HTMLElement): Element[] {
  const out: Element[] = [];
  const walk = (el: Element) => {
    for (const child of el.children) {
      if (child.matches(".ce-tchar, .ce-tside, .ce-stack, .ce-greetings, .ce-gsplit")) walk(child);
      else out.push(child);
    }
  };
  walk(pane);
  return out;
}

/** The Character's Note (SillyTavern's "Character's Note", D-063): sent in every reply, at a depth, with a role. */
function CharacterNoteField({ value, onChange, changed, onReset }: { value: CharacterNote; onChange: (n: CharacterNote) => void; changed: boolean; onReset: () => void }) {
  return (
    <div className="char-note">
      <label className="char-note-text">
        <FieldLabel label="Character's Note" help="Put into the chat in every reply with this character, a few messages from the end — good for things the AI forgets (how they talk, a secret, a rule). SillyTavern's Character's Note; imported and exported with the card." changed={changed} onReset={onReset} />
        <textarea rows={3} aria-label="Character's Note" placeholder="(Text put into the chat at the depth and role on the right)" value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} />
      </label>
      <div className="char-note-side">
        <label><span className="hint">@ Depth</span><input type="number" min={0} max={999} aria-label="Character's Note depth" value={value.depth}
          onChange={(e) => onChange({ ...value, depth: Math.max(0, Math.min(999, Math.round(Number(e.target.value) || 0))) })} /></label>
        <label><span className="hint">Role</span><select aria-label="Character's Note role" value={value.role} onChange={(e) => onChange({ ...value, role: e.target.value as CharacterNote["role"] })}>
          <option value="system">System</option><option value="user">User</option><option value="assistant">AI</option></select></label>
        <span className="hint tabular">~{Math.ceil(value.text.length / 3.6)} tokens</span>
      </div>
    </div>
  );
}
