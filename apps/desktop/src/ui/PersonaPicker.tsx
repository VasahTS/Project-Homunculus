// Homunculus 2 — the "Personas" window: who you play in this chat (D-096). Author: CLAUDE, 2026-11-08.
// Daniel's friend: "it's hard to find where to change persona; a button that opens a window with all your personas,
// with a search". Draft A on the canvas "Homunculus 2 — Personas" (Daniel picked it, title "Personas", a Sort, Ctrl+P).
// Opens from the persona button under the message box, from "Who is in this story" and with Ctrl+P.
// Left: search, Sort (shared with Library → Personas), "Follow the default" / "No persona", every persona.
// Right: the one picked, its versions, its whole description, where it goes. Keys: type to search, ↑/↓, Enter, Esc.
// A click only shows a persona (nothing changes until "Play as"); a double click or Enter plays it.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Avatar, Persona } from "@homunculus/schemas";
import { effectivePersona, estimateTokens, variantAvatarId } from "@homunculus/core";
import { avatarUrl } from "../files.ts";
import { SortSelect, useCollectionOrder } from "./CollectionOrder.tsx";
import { Button, Icon, Segmented } from "./kit.tsx";
import { Modal } from "./Vault.tsx";

/** What a chat plays as: whatever it follows (the story's or the default persona), no persona, or one persona and version. */
export type PersonaChoice = { kind: "follow" } | { kind: "none" } | { kind: "persona"; id: string; variantId: string | null };

const FOLLOW = "__follow__";
const NONE = "__none__";

function picture(name: string, avatar: Avatar | undefined, size: number, symbol?: string) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (avatar && !symbol) return <img className="pk-pic" style={style} src={avatarUrl(avatar)} alt="" />;
  return <span className={`pk-pic letter${symbol ? " pp-symbol" : ""}`} style={style} aria-hidden>{symbol ?? (name || "?").slice(0, 1).toUpperCase()}</span>;
}

const placeText = (p: Persona) => p.placement.position === "none" ? "Not sent (the name is still used)"
  : p.placement.position === "atDepth" ? `${p.placement.depth} message${p.placement.depth === 1 ? "" : "s"} back, as ${p.placement.role}` : "In the prompt";

export function PersonaPicker({ personas, avatars, defaultPersonaId, follows, current, chatTitle, lorebookNames, onPlay, onMakeDefault, onEdit, onNew, onOpenLibrary, onClose }: {
  personas: Persona[];
  avatars: Record<string, Avatar>;
  defaultPersonaId: string | null;
  /** What "follow" means in this chat: the story's persona or the default one (null: none). */
  follows: { from: "story" | "default"; personaId: string | null };
  current: PersonaChoice;
  chatTitle: string;
  lorebookNames: Record<string, string>;
  onPlay: (choice: PersonaChoice) => void;
  onMakeDefault: (id: string) => void;
  onEdit: (id: string) => void;
  onNew: () => void;
  onOpenLibrary: () => void;
  onClose: () => void;
}) {
  const ordered = useCollectionOrder("personas", personas);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const currentKey = current.kind === "follow" ? FOLLOW : current.kind === "none" ? NONE : current.id;
  // the version shown for each persona: the one this chat plays, else Main, until another is clicked
  const [versions, setVersions] = useState<Record<string, string | null>>(() => current.kind === "persona" ? { [current.id]: current.variantId } : {});
  const keys = useMemo(() => {
    const found = ordered.items.filter((p) => !term || [p.name, p.description, ...p.variants.flatMap((v) => [v.label, v.overrides.name ?? "", v.overrides.description ?? ""])]
      .join("\n").toLowerCase().includes(term)).map((p) => p.id);
    return term ? found : [FOLLOW, NONE, ...found];
  }, [ordered.items, term]);
  const [picked, setPicked] = useState<string>(currentKey);
  const shownKey = keys.includes(picked) ? picked : keys[0];
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(shownKey ?? "")}"]`)?.scrollIntoView({ block: "nearest" }); }, [shownKey]);

  const byId = (id: string) => personas.find((p) => p.id === id);
  const followed = follows.personaId ? byId(follows.personaId) : undefined;
  const followName = followed?.name ?? "no persona";
  const choiceOf = (key: string): PersonaChoice => key === FOLLOW ? { kind: "follow" } : key === NONE ? { kind: "none" } : { kind: "persona", id: key, variantId: versions[key] ?? null };
  const play = (key: string | undefined) => { if (!key) return; onPlay(choiceOf(key)); onClose(); };
  const move = (by: number) => {
    const i = Math.max(0, keys.indexOf(shownKey ?? ""));
    const next = keys[Math.min(keys.length - 1, Math.max(0, i + by))];
    if (next) setPicked(next);
  };
  const onKeys = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); play(shownKey); }
    else if (e.key === "Escape" && q) { e.preventDefault(); e.stopPropagation(); setQ(""); }
  };

  const avatarOf = (p: Persona, variantId: string | null) => (variantId ? avatars[variantAvatarId(p.id, variantId)] : undefined) ?? avatars[p.id];
  /** Is this the one the chat plays now (the persona and its version)? */
  const isNow = (key: string) => key === currentKey;

  const row = (key: string) => {
    let body;
    if (key === FOLLOW) body = <>{picture("", undefined, 34, "↺")}<span className="pk-text"><strong>Follow the {follows.from}</strong><small>Now: {followName}{follows.from === "default" ? " · changes when the default changes" : " · set on the story"}</small></span></>;
    else if (key === NONE) body = <>{picture("", undefined, 34, "∅")}<span className="pk-text"><strong>No persona</strong><small>You are “User”; nothing about you is sent</small></span></>;
    else {
      const p = byId(key)!;
      const line = [p.variants.length ? `${p.variants.length + 1} versions` : "", p.description.replace(/\s+/g, " ").trim() || "No description"].filter(Boolean).join(" · ");
      body = <>{picture(p.name, avatars[p.id], 34)}<span className="pk-text"><strong>{p.name}{p.id === defaultPersonaId && <span className="badge">default</span>}</strong><small>{line}</small></span></>;
    }
    return (
      <button key={key} type="button" data-key={key} data-testid={key === FOLLOW || key === NONE ? "persona-option" : "persona-row"} aria-current={key === shownKey ? true : undefined}
        className={`pk-row pp-row${key === shownKey ? " on" : ""}`} onClick={() => setPicked(key)} onDoubleClick={() => play(key)}>
        {body}{isNow(key) && <span className="badge pp-now">now</span>}
      </button>
    );
  };

  // the preview and the main button
  let preview, action = "", persona: Persona | undefined;
  if (shownKey === FOLLOW) {
    action = `Follow the ${follows.from === "story" ? "Story" : "Default"}`;
    preview = <><h3 className="pp-title">Follow the {follows.from}</h3><p className="hint pp-text">{follows.from === "story"
      ? `This chat plays as the story's persona — now ${followName}. Change it on the story's page; pick a persona here to keep one in this chat only.`
      : `This chat plays as your default persona — now ${followName}. If you change the default later, this chat changes too. Pick a persona to keep it in this chat no matter what.`}</p></>;
  } else if (shownKey === NONE) {
    action = "Play with No Persona";
    preview = <><h3 className="pp-title">No persona</h3><p className="hint pp-text">You are called “User” and nothing about you goes to the AI.</p></>;
  } else if (shownKey) {
    persona = byId(shownKey)!;
    const vid = versions[persona.id] ?? null;
    const eff = effectivePersona(persona, vid);
    const label = vid ? persona.variants.find((v) => v.id === vid)?.label : undefined;
    action = `Play as ${eff.name}${label ? ` · ${label}` : ""}`;
    const status = [persona.id === defaultPersonaId ? "Your default persona" : "", isNow(persona.id) && (current.kind === "persona" ? current.variantId ?? null : null) === vid ? "playing in this chat now" : ""].filter(Boolean).join(" · ");
    const books = persona.lorebookIds.map((id) => lorebookNames[id]).filter(Boolean);
    preview = <>
      <div className="pk-head">{picture(eff.name, avatarOf(persona, vid), 84)}<div className="pp-name"><h3>{eff.name}</h3>{status && <p className="hint">{status}</p>}</div></div>
      {persona.variants.length > 0 && (
        <div className="pp-versions"><span className="pp-label">Version</span>
          <Segmented small label={`${persona.name} version`} value={vid ?? ""} onChange={(v) => setVersions((all) => ({ ...all, [persona!.id]: v || null }))}
            options={[{ value: "", label: "Main" }, ...persona.variants.map((v) => ({ value: v.id, label: v.label }))]} />
        </div>
      )}
      <div className="pk-detail" data-testid="persona-description">{eff.description.trim() || <span className="hint">No description. Your name is used for {"{{user}}"} and nothing else is sent.</span>}</div>
      <p className="hint pp-meta">Counts from the next reply · ~{eff.description.trim() ? estimateTokens(eff.description) : 0} tokens · Goes in: {placeText(persona)}{books.length ? ` · Lorebook${books.length === 1 ? "" : "s"}: ${books.join(", ")}` : ""}</p>
    </>;
  }

  return (
    <Modal title="Personas" onClose={onClose} testId="persona-picker" className="modal-picker modal-personas"
      head={<span className="hint pp-where">in {chatTitle}</span>}>
      <div className="pk-layout" onKeyDown={onKeys}>
        <div className="pk-left">
          <div className="pk-top">
            <label className="search-box pk-search">
              <Icon name="search" size={14} />
              <input autoFocus aria-label="Search personas" placeholder="Search personas" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <SortSelect kind="personas" label="Sort personas" />
          </div>
          <div className="pk-scroll" ref={list} data-testid="persona-list">
            {!term && <div className="pk-label">This chat</div>}
            {!term && [FOLLOW, NONE].map(row)}
            <div className="pk-label">{term ? `${keys.length} match${keys.length === 1 ? "" : "es"}` : `All personas · ${personas.length}`}</div>
            {keys.filter((k) => k !== FOLLOW && k !== NONE).map(row)}
            {term && keys.length === 0 && (
              <div className="hint pk-empty">No persona matches “{q.trim()}”.</div>
            )}
            {!term && personas.length === 0 && <div className="hint pk-empty">No personas yet. Without one, you are called “User”.</div>}
          </div>
        </div>
        <div className="pk-preview" data-testid="persona-preview">{preview ?? <p className="hint">Pick one to see it here.</p>}</div>
      </div>
      <div className="modal-foot">
        <Button variant="plain" onClick={() => { onClose(); onNew(); }}><Icon name="plus" size={14} /> New Persona</Button>
        <button type="button" className="link quiet" onClick={() => { onClose(); onOpenLibrary(); }}>Open Personas in the Library</button>
        <span className="hint pp-keys">↑ ↓ move · Enter play as · Esc close</span>
        <span className="grow" />
        {persona && <button type="button" className="link quiet" onClick={() => { onClose(); onEdit(persona!.id); }}>Edit</button>}
        {persona && persona.id !== defaultPersonaId && <Button onClick={() => onMakeDefault(persona!.id)} data-testid="persona-make-default">Make Default</Button>}
        <Button variant="prominent" disabled={!shownKey} onClick={() => play(shownKey)} data-testid="persona-play">{action || "Play as"}</Button>
      </div>
    </Modal>
  );
}
