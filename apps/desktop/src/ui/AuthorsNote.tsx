// Homunculus 2 — the Author's Note group (canvas "Homunculus 2 — Author's Note", version A, Daniel 29/10: "pode ser a A,
// mas faça ser possível colapsar"). Author: CLAUDE, 2026-10-29.
// One group for every layer: Settings → Defaults ("for new chats"), a story's page, a chat's Prompt tab. Each line is
// inherited on its own from the layer above (core/setup.ts `resolveSetup`); the group folds to a one-line summary.
import { useEffect, useRef, useState } from "react";
import type { AuthorsNote, SetupLayer } from "@homunculus/schemas";
import type { ResolvedAuthorsNote } from "@homunculus/core";
import { Collapse, Icon } from "./kit.tsx";
import { Help } from "./Help.tsx";
import { approxTokens } from "./ReplyPane.tsx";

export type NoteLevel = "default" | "story" | "chat";

const WHERE: Record<ResolvedAuthorsNote["position"], string> = {
  inChat: "In the chat", afterMain: "After the main prompt", beforeMain: "Before the main prompt",
};
const AS: Record<ResolvedAuthorsNote["role"], string> = { system: "System", user: "User", assistant: "AI" };

/** "every turn · in the chat, 4 back · System" */
export function noteSummary(n: ResolvedAuthorsNote): string {
  const when = n.interval === 0 ? "never sent" : n.interval === 1 ? "every turn" : `every ${n.interval} of your messages`;
  const where = n.position === "inChat" ? `in the chat, ${n.depth} back` : n.position === "afterMain" ? "after the main prompt" : "before the main prompt";
  return `${when} · ${where} · ${AS[n.role]}`;
}

const HELP = "A note the AI reads with the story, like SillyTavern's Author's Note: a standing direction (tone, pacing, a secret it must keep). "
  + "It goes into the prompt every N of your messages, N messages before the end of the chat (or with the main prompt). "
  + "{{char}} and {{user}} work. Lorebook entries placed \"around the Author's Note\" go with it.";

const readOpen = (key: string) => { try { return localStorage.getItem(key) !== "0"; } catch { return true; } };
const writeOpen = (key: string, open: boolean) => { try { localStorage.setItem(key, open ? "1" : "0"); } catch { /* storage may be blocked */ } };

export function AuthorsNoteGroup({ level, layer, above, onChange, inStory = true, testId = "authors-note" }: {
  level: NoteLevel;
  /** A chat of a story (its lines come from the story); false = a 1:1 chat (they come from Settings → Defaults). */
  inStory?: boolean;
  /** The layer being edited (Defaults, the story's, or the chat's). */
  layer: SetupLayer;
  /** What this layer inherits (the story's or the Defaults' note; for Defaults, the built-in values). */
  above: ResolvedAuthorsNote;
  onChange: (layer: SetupLayer) => void;
  testId?: string;
}) {
  const own: AuthorsNote = layer.authorsNote ?? {};
  const value: ResolvedAuthorsNote = { ...above, ...Object.fromEntries(Object.entries(own).filter(([, v]) => v !== undefined)) };
  const storeKey = `h2:authors-note-open:${level}`;
  const [open, setOpen] = useState(() => readOpen(storeKey));
  const toggle = () => { setOpen((o) => { writeOpen(storeKey, !o); return !o; }); };

  /** Sets one line; a line equal to the layer above is not kept (it is inherited again). */
  const set = (patch: Partial<ResolvedAuthorsNote>) => {
    const next: AuthorsNote = { ...own };
    for (const [k, v] of Object.entries(patch) as Array<[keyof ResolvedAuthorsNote, never]>) {
      if (v === above[k]) delete next[k]; else next[k] = v;
    }
    const out: SetupLayer = { ...layer };
    if (Object.keys(next).length) out.authorsNote = next; else delete out.authorsNote;
    onChange(out);
  };
  const reset = () => { const out: SetupLayer = { ...layer }; delete out.authorsNote; onChange(out); };

  // the text is typed into a draft and saved shortly after (and when the box loses focus)
  const [draft, setDraft] = useState(value.text);
  const typing = useRef(false);
  useEffect(() => { if (!typing.current) setDraft(value.text); }, [value.text]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = (text: string) => { typing.current = false; if (timer.current) clearTimeout(timer.current); if (text !== value.text) set({ text }); };
  const onType = (text: string) => {
    typing.current = true;
    setDraft(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(text), 600);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // a 1:1 chat has no story above it: its note is simply its own (no "changed" chip, like its other Prompt rows)
  const changed = level !== "default" && !(level === "chat" && !inStory) && Object.keys(own).length > 0;
  const aboveName = level === "chat" ? "the story's" : "the default";
  const changedLabel = level === "chat" ? "changed in this chat" : "changed for this story";
  const inherited = (k: keyof ResolvedAuthorsNote) => level !== "default" && own[k] === undefined;
  const firstLine = draft.trim().split("\n")[0] ?? "";
  const title = level === "default" ? "Author's Note for New Chats" : "Author's Note";

  return (
    <section className={`group-section an-group${level === "story" ? " on-page" : ""}`} data-testid={testId}>
      <div className="group-head an-head">
        <button type="button" className="an-toggle" aria-expanded={open} onClick={toggle} data-testid="authors-note-toggle">
          <Icon name="chevron" size={12} /> {title}
        </button>
        <Help text={HELP} />
        <span className="grow" />
        {changed && (
          <span className="changed-wrap">
            <span className="changed-chip">{changedLabel}</span>
            <button type="button" className="link" onClick={reset}>Use {aboveName}</button>
          </span>
        )}
      </div>
      {!open && (
        <button type="button" className="an-summary" onClick={toggle} data-testid="authors-note-summary">
          <span className={`an-first${firstLine ? "" : " empty"}`}>{firstLine || "No note"}</span>
          {firstLine && <span className="an-how">{noteSummary(value)}</span>}
        </button>
      )}
      <Collapse open={open}>
        <div className="group">
          <div className="an-text">
            <textarea aria-label="Author's Note" value={draft} rows={Math.min(8, Math.max(3, draft.split("\n").length + 1))}
              placeholder={level === "default" ? "Empty: no note unless a story or a chat writes one." : "A standing direction for the AI: tone, pacing, a secret it keeps… (empty = no note)"}
              onChange={(e) => onType(e.target.value)} onBlur={(e) => commit(e.target.value)} />
            <span className="an-meta">
              <span>{draft.trim() ? `${approxTokens(draft)} tokens` : "Empty"}{inherited("text") && draft.trim() ? ` · from ${level === "chat" && inStory ? "the story" : "Settings → Defaults"}` : ""}</span>
              {level === "story" && <span>Every chat of this story uses it, unless a chat changes it.</span>}
            </span>
          </div>
          <div className="row">
            <span className="row-label">Sent</span>
            <span className="row-value an-line">every
              <input type="number" min={0} max={999} aria-label="Sent every how many of your messages" value={value.interval}
                onChange={(e) => { const n = Math.max(0, Math.min(999, Math.floor(Number(e.target.value) || 0))); set({ interval: n }); }} />
              of yours{value.interval === 0 ? " · never" : value.interval === 1 ? " · every turn" : ""}
            </span>
          </div>
          <div className="row">
            <span className="row-label">Where</span>
            <span className="row-value an-line">
              <select aria-label="Where the note goes" value={value.position} onChange={(e) => set({ position: e.target.value as ResolvedAuthorsNote["position"] })}>
                {Object.entries(WHERE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {value.position === "inChat" && <>
                <input type="number" min={0} max={999} aria-label="Messages before the end" value={value.depth}
                  onChange={(e) => set({ depth: Math.max(0, Math.min(999, Math.floor(Number(e.target.value) || 0))) })} />
                back
              </>}
            </span>
          </div>
          <div className="row">
            <span className="row-label">As</span>
            <span className="row-value an-line">
              <select aria-label="Sent as" value={value.role} onChange={(e) => set({ role: e.target.value as ResolvedAuthorsNote["role"] })}>
                {Object.entries(AS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </span>
          </div>
        </div>
      </Collapse>
    </section>
  );
}

/** Where the note goes in the chat on screen: before the message at this index (visible.length = after the last). */
export function noteMarkAt(n: ResolvedAuthorsNote, visibleCount: number): number | null {
  if (!n.text.trim() || n.interval === 0 || n.position !== "inChat") return null;
  return Math.max(0, visibleCount - n.depth);
}
