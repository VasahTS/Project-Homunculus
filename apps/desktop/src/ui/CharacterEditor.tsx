// Homunculus 2 — create / edit a character, its versions (variants) and its history. Author: CLAUDE, 2026-10-23;
// 2026-10-28 (slice 1): versions side by side, a picture per version, history of saves, Move to Trash.
import { LorebookChips } from "./LorePanels.tsx";
import { useEffect, useRef, useState } from "react";
import { characterNoteOf, regexScriptsOf as regexOf } from "@homunculus/core";
import type { RegexScript } from "@homunculus/schemas";
import { RegexList } from "./RegexScripts.tsx";
import { Character, type Avatar, type CharacterNote, type HistoryEntry, type Lorebook } from "@homunculus/schemas";
import { effectiveCharacter, variantAvatarId, type CharacterExporter } from "@homunculus/core";
import { avatarUrl } from "../files.ts";
import { Help } from "./Help.tsx";
import { Button, Segmented } from "./kit.tsx";
import { FieldLabel, HistoryList, pruneVariants, useVersionedDraft, VersionBar, type HistoryField } from "./Versions.tsx";

const blank = (): Character => ({
  id: crypto.randomUUID(), name: "", description: "", personality: "", scenario: "", firstMessages: [""],
  exampleMessages: "", systemPrompt: "", postHistoryInstructions: "", creatorNotes: "", creator: "", characterVersion: "", tags: [], variants: [], lorebookIds: [],
});

type Fields = Pick<Character, "name" | "description" | "personality" | "scenario" | "firstMessages" | "exampleMessages" | "systemPrompt" | "postHistoryInstructions" | "creatorNotes" | "tags" | "characterNote">;

export const CHARACTER_HISTORY_FIELDS: HistoryField[] = [
  { key: "name", label: "name" }, { key: "description", label: "description" }, { key: "personality", label: "personality" },
  { key: "scenario", label: "scenario" }, { key: "firstMessages", label: "first message" }, { key: "exampleMessages", label: "example dialogue" },
  { key: "systemPrompt", label: "system prompt" }, { key: "postHistoryInstructions", label: "post-history instructions" },
  { key: "creatorNotes", label: "creator notes" }, { key: "tags", label: "tags" }, { key: "variants", label: "versions" },
];

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
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const exists = !isNew || saved;
  const setDraft = (fn: (d: Character) => Character) => { setDraftState(fn); setSaved(false); };
  const v = useVersionedDraft<Fields, Character>(draft, setDraft, variantId);

  const refreshHistory = () => { if (exists) void loadHistory(draft.id).then(setHistory); };
  useEffect(() => { if (historyOpen) refreshHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [historyOpen]);

  const save = async (d: Character = draft) => {
    if (!d.name.trim()) { setError("The character needs a name."); return; }
    setError("");
    try {
      const clean = pruneVariants<Fields, Character>({ ...d, name: d.name.trim(), firstMessages: d.firstMessages.filter((m) => m.trim()) });
      await onSave(clean);
      setDraftState(clean);
      setSaved(true);
      if (historyOpen) refreshHistory();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

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
  const shownName = v.get("name") || "?";
  const exportVersion = (exporterId: string) => onExport(effectiveCharacter(pruneVariants<Fields, Character>(draft), variantId), exporterId, shownAvatar);

  const text = (key: keyof Fields & string, label: string, help: string, rows: number) => (
    <label>
      <FieldLabel label={label} help={help} changed={v.isChanged(key)} onReset={() => v.reset(key)} />
      <textarea rows={rows} aria-label={label} value={v.get(key) as string} onChange={(e) => v.set(key, e.target.value as never)} />
    </label>
  );

  return (
    <div className="editor" aria-label="Character editor">
      <div className="session-bar">
        <h2 className="editor-title">{isNew && !saved ? "New Character" : draft.name || "Character"}{v.variant ? <span className="title-version"> — {v.variant.label}</span> : null}</h2>
        <span className="spacer" />
        <button className="btn btn-bordered btn-small" onClick={onClose}>Close</button>
      </div>
      <div className="editor-body">
        <VersionBar what="character" variants={draft.variants} current={variantId} onPick={setVariantId}
          onAdd={addVersion} onRename={renameVersion} onDelete={deleteVersion} />

        <div className="avatar-row">
          {shownAvatar
            ? <img className="avatar-big" src={avatarUrl(shownAvatar)} alt={`${shownName} portrait`} />
            : <div className="avatar-big placeholder" aria-hidden>{shownName.slice(0, 1).toUpperCase()}</div>}
          <div className="avatar-actions">
            {exists && versionSaved ? (
              <>
                {variantId && <p className="hint">{ownAvatar ? "This version has its own picture." : "This version uses the main picture."}</p>}
                <button className="ghost small" onClick={() => imageInput.current?.click()}>
                  {variantId ? (ownAvatar ? "Change this version's image" : "Add an image for this version") : avatars[draft.id] ? "Change image" : "Add image"}
                </button>
                {ownAvatar && <button className="link" onClick={() => void onChangeAvatar(ownKey, null)}>{variantId ? "Use the main image" : "Remove image"}</button>}
                <input ref={imageInput} type="file" accept="image/*" hidden data-testid="avatar-input"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onChangeAvatar(ownKey, f); }} />
                <div className="export-row">
                  <span className="label-row muted">{variantId ? "Export this version" : "Export"} <Help text="Save this character as a SillyTavern card (one version per card: the one you are looking at). Fields Homunculus doesn't use (like an embedded lorebook) are kept, so nothing is lost. The file goes to your Downloads folder." /></span>
                  {exporters.map((x) => (
                    <button key={x.id} className="btn btn-bordered btn-small" title={x.help} onClick={() => exportVersion(x.id)}>{x.name.replace(/^SillyTavern card \((.+)\)$/, "$1 card")}</button>
                  ))}
                </div>
              </>
            ) : <p className="hint">{exists ? "Save to add an image for this version." : "Create the character first to add an image or export it."}</p>}
          </div>
        </div>
        <label>
          <FieldLabel label="Name" help="What the character is called. {{char}} in prompts becomes this name. A version can use another name." changed={v.isChanged("name")} onReset={() => v.reset("name")} />
          <input aria-label="Name" value={v.get("name")} onChange={(e) => v.set("name", e.target.value)} placeholder="e.g. Lyra" />
        </label>
        <div className="card-kind" data-testid="card-kind">
          <span className="label-row">This card is <Help text="For a card with two or more people (or a whole cast). It is sent to the AI as usual; the Scene follows each of its people on their own instead of the card. Holds for every version and every chat that uses this card." /></span>
          <Segmented small label="This card is" value={draft.ensemble ? "several" : "one"}
            options={[{ value: "one", label: "One character" }, { value: "several", label: "Several characters" }]}
            onChange={(k) => setDraft((d) => ({ ...d, ensemble: k === "several" }))} />
        </div>
        {text("description", "Description", "Who the character is: looks, background, important facts. This is the main thing the AI reads.", 6)}
        {text("personality", "Personality", "How they think and behave, in a few lines. Optional — many people put this inside the description.", 3)}
        {text("scenario", "Scenario", "Where and how the story starts. Optional.", 3)}
        <label>
          <FieldLabel label="First message" help="The character's opening message when a new session starts. Optional." changed={v.isChanged("firstMessages")} onReset={() => v.reset("firstMessages")} />
          <textarea rows={4} aria-label="First message" value={v.get("firstMessages")[0] ?? ""}
            onChange={(e) => v.set("firstMessages", [e.target.value, ...v.get("firstMessages").slice(1)])} />
        </label>
        <CharacterNoteField value={v.get("characterNote") ?? characterNoteOf(draft) ?? { text: "", depth: 4, role: "system" }}
          changed={v.isChanged("characterNote")} onReset={() => v.reset("characterNote")} onChange={(n) => v.set("characterNote", n)} />
        <LorebookChips ids={draft.lorebookIds} books={lorebooks} onOpen={onOpenLorebook} onChange={(lorebookIds) => setDraft((d) => ({ ...d, lorebookIds }))}
          help="Lorebooks that come with this character: read in every session with them (a session can switch one off in its Prompt tab). A card's embedded lorebook is linked here, and exporting the card puts it back in." />
        <details className="advanced" open={regexOf(draft).some((x) => regexWaiting?.(x)) || undefined}>
          <summary>Regex scripts{regexOf(draft).length ? ` (${regexOf(draft).length})` : ""} <Help text="Find and replace that runs by itself in chats with this character, after the global and the preset's scripts. Scripts that came with a card run only after you allow them. Exporting the card puts them back in." /></summary>
          <RegexList scripts={regexOf(draft)} onChange={(next) => setDraft((d) => ({ ...d, regexScripts: next }))} testId="character-regex-list"
            waiting={regexWaiting} onAllow={onAllowRegex} emptyText="No scripts on this character." />
        </details>
        <details className="advanced">
          <summary>Advanced card fields</summary>
          {text("exampleMessages", "Example dialogue", "Sample messages that show the AI how this character talks. SillyTavern format: blocks starting with <START>.", 4)}
          {text("systemPrompt", "Character system prompt", "If filled, replaces the default instruction at the top of the prompt for this character. Leave empty to use the default.", 3)}
          {text("postHistoryInstructions", "Post-history instructions", "Sent after the conversation, right before the AI answers. Good for short reminders (e.g. 'keep replies short').", 3)}
          {text("creatorNotes", "Creator notes", "Notes from the card's author for the reader. Not sent to the AI.", 3)}
          <label>
            <FieldLabel label="Tags" help="Comma-separated labels to organize characters. Not sent to the AI." changed={v.isChanged("tags")} onReset={() => v.reset("tags")} />
            <input aria-label="Tags" value={v.get("tags").join(", ")} onChange={(e) => v.set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} />
          </label>
          {draft.creator && <p className="hint">Card by {draft.creator}{draft.characterVersion ? ` · version ${draft.characterVersion}` : ""}</p>}
        </details>
        {v.get("firstMessages").length > 1 && (
          <p className="hint">This character also has {v.get("firstMessages").length - 1} alternative first message(s) (editing them comes later).</p>
        )}
        {exists && (
          <details className="advanced" onToggle={(e) => setHistoryOpen((e.target as HTMLDetailsElement).open)}>
            <summary>History <Help text="Every time you save, the whole character (with all its versions) is kept here. Open one to see what changed, and restore it if you want it back. Pictures are not part of the history." /></summary>
            {historyOpen && <HistoryList entries={history ?? []} loading={history === null} fields={CHARACTER_HISTORY_FIELDS} onRestore={(d) => void restore(d)} />}
          </details>
        )}
        {error && <div className="error-bar inline" role="alert">{error}</div>}
        <div className="editor-actions">
          <button className="btn btn-prominent" onClick={() => void save()}>{isNew && !saved ? "Create Character" : "Save"}</button>
          {saved && <span className="ok-text">✓ Saved</span>}
          {exists && <button className="btn btn-bordered" onClick={() => onStartSession(draft, variantId)}>Start Session with {shownName === "?" ? "Them" : shownName}{v.variant ? ` (${v.variant.label})` : ""}</button>}
          <span className="spacer" />
          {!isNew && <Button variant="destructive" onClick={() => void trash()}>Move to Trash</Button>}
        </div>
      </div>
    </div>
  );
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
