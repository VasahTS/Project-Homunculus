// Homunculus 2 — the chat's character, editable in place in the Prompt tab (round 3, D-036, draft G). Author: CLAUDE,
// 2026-10-29. Daniel: "in the prompts part it should be easy to edit the character like in ST … I don't want extra
// unnecessary clicks like having to go all the way back through the menu"; and "make the whole card collapsible so it
// doesn't get in the way when I'm not editing".
// The whole group folds to one line (remembered). Open: each field is a line you click to edit (several at once);
// changes save a moment after you stop typing, to the version of the card THIS chat uses (Main or a version).
import { useEffect, useRef, useState } from "react";
import type { Avatar, Character } from "@homunculus/schemas";
import { effectiveCharacter, pruneOverrides, variantAvatarId } from "@homunculus/core";
import { AvatarDot } from "./Sidebar.tsx";
import { Collapse, Icon } from "./kit.tsx";

type Field = "description" | "personality" | "scenario" | "exampleMessages" | "systemPrompt" | "postHistoryInstructions";
// `to`: the preset block each field fills (D-065, Daniel: "show where this content is sent")
const FIELDS: Array<{ key: Field; label: string; help: string; to: string }> = [
  { key: "description", label: "Description", help: "Who they are: looks, background, how they act. Sent with every reply.", to: "Char Description" },
  { key: "personality", label: "Personality", help: "A short summary of their personality.", to: "Char Personality" },
  { key: "scenario", label: "Scenario", help: "The situation of the chat, from the card.", to: "Scenario" },
  { key: "exampleMessages", label: "Examples of dialogue", help: "How they talk (<START> separates examples).", to: "Chat Examples" },
  { key: "systemPrompt", label: "Card system prompt", help: "The card's own system prompt; replaces the preset's main prompt when the preset allows it.", to: "Main Prompt" },
  { key: "postHistoryInstructions", label: "Post-history instructions", help: "Sent after the chat history, right before the reply (jailbreak / reminder).", to: "Post-History Instructions" },
];

const OPEN_KEY = "h2.promptCharacterOpen";
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== "0"; } catch { return true; } };

/** One card of the chat (a group chat may have several: a pick at the top). */
export interface ChatCard { character: Character; variantId: string | null }

export function PromptCharacter({ cards, avatars, onSave, onOpenEditor }: {
  cards: ChatCard[];
  avatars: Record<string, Avatar>;
  onSave: (c: Character) => Promise<void>;
  /** The full editor (Characters → Edit), for everything else (greetings, versions, lorebooks, picture). */
  onOpenEditor: (characterId: string) => void;
}) {
  const [open, setOpenState] = useState(readOpen);
  const [which, setWhich] = useState(cards[0]?.character.id ?? "");
  const [editing, setEditing] = useState<Field[]>([]);
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const card = cards.find((c) => c.character.id === which) ?? cards[0];
  const [draft, setDraft] = useState<Record<Field, string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<Record<Field, string>>>({});
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const cardRef = useRef(card);
  cardRef.current = card;

  const shown = card ? effectiveCharacter(card.character, card.variantId) : undefined;
  // the values on screen follow the card unless you are typing
  useEffect(() => {
    if (!shown || Object.keys(pending.current).length) return;
    setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, shown[f.key]])) as Record<Field, string>);
  }, [shown?.id, card?.variantId, card?.character]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    const cur = cardRef.current;
    pending.current = {};
    if (!cur || !Object.keys(patch).length) return;
    const c = cur.character;
    let next: Character;
    if (!cur.variantId) next = { ...c, ...patch };
    else next = { ...c, variants: c.variants.map((v) => (v.id === cur.variantId ? { ...v, overrides: pruneOverrides(c, { ...v.overrides, ...patch }) } : v)) };
    setState("saving");
    void saveRef.current(next).then(() => setState("saved"));
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { flush(); setEditing([]); }, [which]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!card || !shown || !draft) return null;
  const setOpen = (v: boolean) => { setOpenState(v); try { localStorage.setItem(OPEN_KEY, v ? "1" : "0"); } catch { /* per-viewer only */ } };
  const version = card.variantId ? card.character.variants.find((v) => v.id === card.variantId)?.label : undefined;
  const pic = (card.variantId ? avatars[variantAvatarId(card.character.id, card.variantId)] : undefined) ?? avatars[card.character.id];
  const change = (k: Field, v: string) => {
    setDraft({ ...draft, [k]: v });
    pending.current = { ...pending.current, [k]: v };
    setState("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };
  const toggle = (k: Field) => setEditing((e) => (e.includes(k) ? e.filter((x) => x !== k) : [...e, k]));
  const tokens = Math.round(FIELDS.reduce((n, f) => n + draft[f.key].length, 0) / 4);

  return (
    <section className={`group-section pc${open ? " open" : ""}`} data-testid="prompt-character">
      <div className="pc-head">
        <button type="button" className="pc-toggle" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="prompt-character-toggle">
          <span className="chev" aria-hidden><Icon name="chevron" size={12} /></span>
          <AvatarDot name={shown.name} avatar={pic} size={24} />
          <span className="pc-title"><strong>{shown.name}</strong><small>{card.character.ensemble ? "Several characters · " : ""}{version ? `${version} version` : "Main version"} · ~{tokens} tokens{state === "saving" ? " · saving…" : state === "saved" ? " · saved" : ""}</small></span>
        </button>
        {cards.length > 1 && (
          <select className="link-select" aria-label="Which character" value={card.character.id} onChange={(e) => setWhich(e.target.value)}>
            {cards.map((c) => <option key={c.character.id} value={c.character.id}>{effectiveCharacter(c.character, c.variantId).name}</option>)}
          </select>
        )}
        <button type="button" className="link quiet" onClick={() => { flush(); onOpenEditor(card.character.id); }}>Full editor</button>
      </div>
      <Collapse open={open}>
        <div className="group pc-fields">
          {card.character.ensemble && <p className="hint pc-note" data-testid="prompt-ensemble-note">A card with several characters: sent whole, like any card. The Scene does not follow it as one person; its people appear there on their own.</p>}
          <p className="hint pc-note">Edits go to {version ? `the “${version}” version` : "the main version"} of the card: every chat with that version sees them.</p>
          {FIELDS.map((f) => {
            const on = editing.includes(f.key);
            const v = draft[f.key];
            return (
              <div key={f.key} className={`pc-field${on ? " on" : ""}`} data-testid="prompt-character-field">
                <button type="button" className="pc-field-head" onClick={() => toggle(f.key)} aria-expanded={on} title={f.help}>
                  <span className="pc-label">{f.label}<span className="pc-to" title={`Sent in the preset's “${f.to}” block`}> → {f.to}</span></span>
                  {!on && <span className={`pc-line${v.trim() ? "" : " empty"}`}>{v.trim() ? v.replace(/\s+/g, " ") : "Empty"}</span>}
                  <span className="pc-edit" aria-hidden>{on ? "Done" : <Icon name="pencil" size={12} />}</span>
                </button>
                {on && (
                  <textarea className="prose-input pc-text" autoFocus aria-label={f.label} value={v} rows={Math.min(14, Math.max(3, Math.ceil(v.length / 60)))}
                    onChange={(e) => change(f.key, e.target.value)} onBlur={flush} />
                )}
              </div>
            );
          })}
        </div>
      </Collapse>
    </section>
  );
}
