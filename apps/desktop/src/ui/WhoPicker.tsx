// Homunculus 2 — "who is in this story": the version of each character, and who you play (persona + version).
// Author: CLAUDE, 2026-10-28 (slice 1, BLUEPRINT §2.2 and §2.5). Lives in the story's toolbar.
// Changes are saved on the session and count from the next reply (each reply's receipt says what it used).
// Slice 4 (2026-10-29, D-029): NPCs from the Vault can join a chat; a story session says who tells it.
import { useEffect, useRef, useState } from "react";
import type { Avatar, Character, Npc, Persona, Session } from "@homunculus/schemas";
import { effectiveCharacter, effectivePersona, isTracked, npcTagline, variantAvatarId } from "@homunculus/core";
import { Help } from "./Help.tsx";
import { AvatarDot } from "./Sidebar.tsx";
import { Switch } from "./kit.tsx";

const INHERIT = "__default__";
const NONE = "__none__";

export function WhoPicker({ session, characters, personas, defaultPersonaId, avatars, onChange, story, npcs = [] }: {
  session: Session;
  characters: Record<string, Character>;
  personas: Persona[];
  defaultPersonaId: string | null;
  avatars: Record<string, Avatar>;
  onChange: (s: Session) => void;
  story?: { name: string; narrator: string } | undefined;
  npcs?: Npc[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const members = session.cast.filter((m) => m.characterId && characters[m.characterId]);
  const ownPersona = session.setup.personaId !== undefined;
  const personaId = ownPersona ? session.setup.personaId ?? null : defaultPersonaId;
  const personaRaw = personaId ? personas.find((p) => p.id === personaId) : undefined;
  const personaVariantId = ownPersona ? session.setup.personaVariantId ?? null : null;
  const persona = personaRaw ? effectivePersona(personaRaw, personaVariantId) : undefined;
  const defaultName = personas.find((p) => p.id === defaultPersonaId)?.name;

  const lead = members[0];
  const leadChar = lead ? characters[lead.characterId!] : undefined;
  const leadVersion = leadChar && lead?.variantId ? leadChar.variants.find((v) => v.id === lead.variantId)?.label : undefined;
  const inChat = session.npcIds.map((id) => npcs.find((n) => n.id === id)).filter((n): n is Npc => !!n);
  const summary = [
    story ? `told by ${story.narrator}` : leadChar ? `with ${effectiveCharacter(leadChar, lead!.variantId).name}${leadVersion ? ` · ${leadVersion}` : ""}` : "no character",
    !story && inChat.length ? `+${inChat.length} NPC${inChat.length === 1 ? "" : "s"}` : null,
    persona ? `as ${persona.name}` : null,
  ].filter(Boolean).join(" · ");
  const setNpcs = (npcIds: string[]) => onChange({ ...session, npcIds });

  const setVariant = (characterId: string, variantId: string | null) =>
    onChange({ ...session, cast: session.cast.map((m) => (m.characterId === characterId ? { ...m, variantId } : m)) });
  /** Track in the Scene, for this chat (the card's own choice is the default, and is not stored again). D-065. */
  const setTracked = (c: Character, v: boolean) =>
    onChange({ ...session, cast: session.cast.map((m) => { if (m.characterId !== c.id) return m; const { tracked: _t, ...rest } = m; return v === (c.tracked ?? true) ? rest : { ...rest, tracked: v }; }) });
  const setPersona = (value: string) => {
    const setup = { ...session.setup };
    if (value === INHERIT) { delete setup.personaId; delete setup.personaVariantId; }
    else { setup.personaId = value === NONE ? null : value; setup.personaVariantId = null; }
    onChange({ ...session, setup });
  };
  const setPersonaVariant = (variantId: string | null) => onChange({ ...session, setup: { ...session.setup, personaId, personaVariantId: variantId } });

  return (
    <span className="who-picker" ref={ref}>
      <button type="button" className="who-btn" aria-expanded={open} aria-label="Who is in this story" onClick={() => setOpen((v) => !v)} data-testid="who-button">
        {summary} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="who-pop popover" role="dialog" aria-label="Who is in this story" data-testid="who-pop">
          <div className="label-row"><strong>Who is in this story</strong> <Help text="Pick the version of each character and who you play. Changes count from the next reply; older replies keep what they used (see a reply's Details)." /></div>
          {members.map((m) => {
            const c = characters[m.characterId!]!;
            const own = m.variantId ? avatars[variantAvatarId(c.id, m.variantId)] : undefined;
            return (
              <div key={c.id} className="who-row">
                <AvatarDot name={c.name} avatar={own ?? avatars[c.id]} size={26} />
                <span className="who-name">{c.name}</span>
                {c.variants.length ? (
                  <select aria-label={`${c.name} version`} value={m.variantId ?? ""} onChange={(e) => setVariant(c.id, e.target.value || null)}>
                    <option value="">Main</option>
                    {c.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                ) : <span className="hint">one version (add more in Characters)</span>}
                <span className="cast-track" title="Off: sent whole to the AI, but the Scene does not list it as one person. For a card with several characters (each is added by name), a world card, or anyone you don't want in the cast.">Scene
                  <Switch label={`Track ${c.name} in the Scene`} checked={isTracked(m, c)} onChange={(v) => setTracked(c, v)} /></span>
              </div>
            );
          })}
          <div className="who-row">
            <AvatarDot name={persona?.name ?? "You"} avatar={personaRaw ? (personaVariantId ? avatars[variantAvatarId(personaRaw.id, personaVariantId)] : undefined) ?? avatars[personaRaw.id] : undefined} size={26} />
            <span className="who-name label-row">You play as <Help text="Your persona: your name ({{user}}) and description in the story. 'Default' follows the default persona chosen in Personas." /></span>
            <select aria-label="Persona" value={ownPersona ? session.setup.personaId ?? NONE : INHERIT} onChange={(e) => setPersona(e.target.value)}>
              <option value={INHERIT}>Default ({defaultName ?? "none"})</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value={NONE}>No persona (“User”)</option>
            </select>
          </div>
          {!story && (
            <div className="who-npcs" data-testid="chat-npcs">
              <div className="label-row"><strong>NPCs in this chat</strong> <Help text="People from the Vault that join this chat. The character voices them when the story needs them; trackers know them by name. Edit them in Vault → NPCs." /></div>
              {inChat.map((n) => (
                <div key={n.id} className="who-row">
                  <AvatarDot name={n.name} size={22} />
                  <span className="who-name">{n.name}{npcTagline(n) && <span className="hint"> · {npcTagline(n)}</span>}</span>
                  <button className="link" onClick={() => setNpcs(session.npcIds.filter((x) => x !== n.id))}>Remove</button>
                </div>
              ))}
              {npcs.some((n) => !session.npcIds.includes(n.id)) ? (
                <select aria-label="Add an NPC to this chat" value="" onChange={(e) => e.target.value && setNpcs([...session.npcIds, e.target.value])}>
                  <option value="">+ Add an NPC</option>
                  {npcs.filter((n) => !session.npcIds.includes(n.id)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              ) : inChat.length === 0 && <p className="hint">No NPCs in the Vault yet.</p>}
            </div>
          )}
          {personaRaw && personaRaw.variants.length > 0 && (
            <div className="who-row">
              <span className="who-name indent">{personaRaw.name} version</span>
              <select aria-label="Persona version" value={personaVariantId ?? ""} onChange={(e) => setPersonaVariant(e.target.value || null)}>
                <option value="">Main</option>
                {personaRaw.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
          )}
          <p className="hint">Changes count from the next reply.</p>
        </div>
      )}
    </span>
  );
}
