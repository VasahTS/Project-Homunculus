// Homunculus 2 — create / edit a persona (who YOU are in the story), its versions and history.
// Author: CLAUDE, 2026-10-28 (slice 1, BLUEPRINT §2.1 and §2.5).
import { LorebookChips } from "./LorePanels.tsx";
import { useEffect, useRef, useState } from "react";
import { Persona, type Avatar, type HistoryEntry, type Lorebook } from "@homunculus/schemas";
import { variantAvatarId } from "@homunculus/core";
import { avatarUrl } from "../files.ts";
import { Help } from "./Help.tsx";
import { Button, Switch } from "./kit.tsx";
import { FieldLabel, HistoryList, pruneVariants, useVersionedDraft, VersionBar, type HistoryField } from "./Versions.tsx";

type Fields = Pick<Persona, "name" | "description">;

export const blankPersona = (): Persona => ({
  id: crypto.randomUUID(), name: "", description: "", placement: { position: "inPrompt", depth: 2, role: "system" }, variants: [], lorebookIds: [],
});

const HISTORY_FIELDS: HistoryField[] = [
  { key: "name", label: "name" }, { key: "description", label: "description" }, { key: "placement", label: "place in the prompt" }, { key: "variants", label: "versions" },
];

export function PersonaEditor({ persona, avatars, isDefault, justSaved = false, onSave, onTrash, onChangeAvatar, onSetDefault, onClose, loadHistory, lorebooks, onOpenLorebook }: {
  persona: Persona | null; // null = new persona
  avatars: Record<string, Avatar>;
  isDefault: boolean;
  justSaved?: boolean;
  onSave: (p: Persona) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  onChangeAvatar: (ownerKey: string, file: File | null) => Promise<void>;
  onSetDefault: (id: string | null) => Promise<void>;
  onClose: () => void;
  loadHistory: (id: string) => Promise<HistoryEntry[]>;
  lorebooks: Lorebook[];
  onOpenLorebook: (id: string) => void;
}) {
  const isNew = persona === null;
  const [draft, setDraftState] = useState<Persona>(() => persona ?? blankPersona());
  const [variantId, setVariantId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(justSaved);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const exists = !isNew || saved;
  const setDraft = (fn: (d: Persona) => Persona) => { setDraftState(fn); setSaved(false); };
  const v = useVersionedDraft<Fields, Persona>(draft, setDraft, variantId);

  const refreshHistory = () => { if (exists) void loadHistory(draft.id).then(setHistory); };
  useEffect(() => { if (historyOpen) refreshHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [historyOpen]);

  const save = async (d: Persona = draft) => {
    if (!d.name.trim()) { setError("The persona needs a name."); return; }
    setError("");
    try {
      const clean = pruneVariants<Fields, Persona>({ ...d, name: d.name.trim() });
      await onSave(clean);
      setDraftState(clean);
      setSaved(true);
      if (historyOpen) refreshHistory();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const run = async (f: () => Promise<void>) => { try { setError(""); await f(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };

  const restore = async (data: unknown) => {
    const old = Persona.parse({ ...(data as object), id: draft.id });
    if (variantId && !old.variants.some((x) => x.id === variantId)) setVariantId(null);
    await save(old);
  };

  const addVersion = (label: string) => {
    const id = crypto.randomUUID();
    setDraft((d) => ({ ...d, variants: [...d.variants, { id, label, overrides: {}, hasOwnAvatar: false }] }));
    setVariantId(id);
  };

  const ownKey = variantId ? variantAvatarId(draft.id, variantId) : draft.id;
  const ownAvatar = avatars[ownKey];
  const shownAvatar = ownAvatar ?? avatars[draft.id];
  const versionSaved = !variantId || (persona?.variants.some((x) => x.id === variantId) ?? false) || saved;
  const shownName = v.get("name") || "?";
  const place = draft.placement;
  const setPlace = (patch: Partial<Persona["placement"]>) => setDraft((d) => ({ ...d, placement: { ...d.placement, ...patch } }));

  return (
    <div className="editor" aria-label="Persona editor">
      <div className="session-bar">
        <h2 className="editor-title">{isNew && !saved ? "New Persona" : draft.name || "Persona"}{v.variant ? <span className="title-version"> — {v.variant.label}</span> : null}</h2>
        <span className="spacer" />
        <button className="btn btn-bordered btn-small" onClick={onClose}>Close</button>
      </div>
      <div className="editor-body">
        <VersionBar what="persona" variants={draft.variants} current={variantId} onPick={setVariantId} onAdd={addVersion}
          onRename={(id, label) => setDraft((d) => ({ ...d, variants: d.variants.map((x) => (x.id === id ? { ...x, label } : x)) }))}
          onDelete={(id) => {
            setDraft((d) => ({ ...d, variants: d.variants.filter((x) => x.id !== id) }));
            setVariantId(null);
            if (avatars[variantAvatarId(draft.id, id)]) void onChangeAvatar(variantAvatarId(draft.id, id), null);
          }} />

        <div className="avatar-row">
          {shownAvatar
            ? <img className="avatar-big" src={avatarUrl(shownAvatar)} alt={`${shownName} portrait`} />
            : <div className="avatar-big placeholder" aria-hidden>{shownName.slice(0, 1).toUpperCase()}</div>}
          <div className="avatar-actions">
            {exists && versionSaved ? (
              <>
                <button className="ghost small" onClick={() => imageInput.current?.click()}>
                  {variantId ? (ownAvatar ? "Change this version's image" : "Add an image for this version") : avatars[draft.id] ? "Change image" : "Add image"}
                </button>
                {ownAvatar && <button className="link" onClick={() => void onChangeAvatar(ownKey, null)}>{variantId ? "Use the main image" : "Remove image"}</button>}
                <input ref={imageInput} type="file" accept="image/*" hidden data-testid="persona-avatar-input"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onChangeAvatar(ownKey, f); }} />
                <div className="default-row">
                  <Switch label="Default persona" checked={isDefault} onChange={(on) => void run(() => onSetDefault(on ? draft.id : null))} />
                  <span className="label-row">Default persona <Help text="Used by every session that doesn't pick a persona of its own. Each session can pick another one in the story's toolbar." /></span>
                </div>
              </>
            ) : <p className="hint">{exists ? "Save to add an image for this version." : "Create the persona first to add an image."}</p>}
          </div>
        </div>

        <label>
          <FieldLabel label="Name" help="Your name in the story. {{user}} in cards and prompts becomes this name." changed={v.isChanged("name")} onReset={() => v.reset("name")} />
          <input aria-label="Name" value={v.get("name")} onChange={(e) => v.set("name", e.target.value)} placeholder="e.g. Daniel" />
        </label>
        <label>
          <FieldLabel label="Description" help="Who you are in the story: looks, background, what others know about you. The AI reads this." changed={v.isChanged("description")} onReset={() => v.reset("description")} />
          <textarea rows={6} aria-label="Description" value={v.get("description")} onChange={(e) => v.set("description", e.target.value)} />
        </label>

        <div className="placement">
          <label className="inline-label">
            <span className="label-row">Place in the prompt <Help text="Where the description goes. 'With the character' puts it in the first block, next to the card. 'Near the end' puts it a few messages before the end of the chat, so the AI weighs it more. 'Not sent' keeps it only for you. Same for all versions." /></span>
            <select aria-label="Place in the prompt" value={place.position} onChange={(e) => setPlace({ position: e.target.value as Persona["placement"]["position"] })}>
              <option value="inPrompt">With the character</option>
              <option value="atDepth">Near the end of the chat</option>
              <option value="none">Not sent</option>
            </select>
          </label>
          {place.position === "atDepth" && <>
            <label className="inline-label">
              <span className="label-row">Messages from the end <Help text="0 = after the last message; 2 = before the last two messages." /></span>
              <input type="number" min={0} max={50} aria-label="Messages from the end" value={place.depth}
                onChange={(e) => setPlace({ depth: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} />
            </label>
            <label className="inline-label">
              <span className="label-row">Sent as <Help text="Which kind of message carries it. 'System' works for most models." /></span>
              <select aria-label="Sent as" value={place.role} onChange={(e) => setPlace({ role: e.target.value as Persona["placement"]["role"] })}>
                <option value="system">System</option>
                <option value="user">User</option>
                <option value="assistant">Assistant</option>
              </select>
            </label>
          </>}
        </div>

        <LorebookChips ids={draft.lorebookIds} books={lorebooks} onOpen={onOpenLorebook} onChange={(lorebookIds) => setDraft((d) => ({ ...d, lorebookIds }))}
          help="Lorebooks that come with this persona: read in every session where you play as it (SillyTavern: the persona's lorebook)." />

        {exists && (
          <details className="advanced" onToggle={(e) => setHistoryOpen((e.target as HTMLDetailsElement).open)}>
            <summary>History <Help text="Every time you save, the whole persona (with all its versions) is kept here. Open one to see what changed, and restore it if you want it back." /></summary>
            {historyOpen && <HistoryList entries={history ?? []} loading={history === null} fields={HISTORY_FIELDS} onRestore={(d) => void restore(d)} />}
          </details>
        )}
        {error && <div className="error-bar inline" role="alert">{error}</div>}
        <div className="editor-actions">
          <button className="btn btn-prominent" onClick={() => void save()}>{isNew && !saved ? "Create Persona" : "Save"}</button>
          {saved && <span className="ok-text">✓ Saved</span>}
          <span className="spacer" />
          {!isNew && <Button variant="destructive" onClick={() => void run(() => onTrash(draft.id))}>Move to Trash</Button>}
        </div>
      </div>
    </div>
  );
}
