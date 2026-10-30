// Homunculus 2 — a story's own version of a lorebook, in the lorebook editor (D-049; draft 3 section 6).
// Author: CLAUDE, 2026-10-30. "Original" edits the Library book; a story's version edits only that story's differences.
import { useState } from "react";
import type { Lorebook, Story } from "@homunculus/schemas";
import { loreChanges, type LoreChange } from "@homunculus/core";
import { Modal } from "./Vault.tsx";

/** Stories that use this book (their setup) or already have their own version of it. */
export const storiesWithBook = (book: Lorebook, stories: Story[]) => stories.filter((s) =>
  s.lorePatches[book.id] || (s.setup.lorebooks?.mode !== "keep" && s.setup.lorebooks?.add.includes(book.id)));

const LABEL: Record<LoreChange, string> = { new: "new", edited: "edited", removed: "off here" };

export function LoreChangeTag({ change, by }: { change: LoreChange | undefined; by?: string | undefined }) {
  if (!change) return null;
  return <span className={`lv-tag ${change}`} title={by ? `by ${by}` : undefined}>{LABEL[change]}</span>;
}

export function LoreVersionBar({ book, stories, storyId, agentName, onPick, onSaveAsNew, onApply, onReset }: {
  book: Lorebook; stories: Story[]; storyId: string | null; agentName: (id: string) => string;
  onPick: (storyId: string | null) => void;
  onSaveAsNew: () => void;
  /** Puts these changes into the original book; the rest stay in the story. */
  onApply: (ids: string[]) => void;
  onReset: () => void;
}) {
  const [applying, setApplying] = useState(false);
  const usable = storiesWithBook(book, stories);
  if (!usable.length && !storyId) return null;
  const story = stories.find((s) => s.id === storyId);
  const patch = story?.lorePatches[book.id];
  const changes = story ? loreChanges(book, patch) : new Map<string, LoreChange>();
  const title = (id: string) => (patch?.entries[id] ?? book.entries.find((e) => e.id === id))?.title || `Entry ${id}`;
  const by = (id: string) => { const b = patch?.meta[id]?.by; return !b ? "" : b === "user" ? "you" : agentName(b); };
  return (
    <div className="lv-bar" data-testid="lore-version-bar">
      <label className="row-line"><span className="hint">Showing</span>
        <select aria-label="Lorebook version" value={storyId ?? ""} onChange={(e) => onPick(e.target.value || null)}>
          <option value="">Original (the Library's book)</option>
          {usable.map((s) => <option key={s.id} value={s.id}>{s.name}'s version{s.lorePatches[book.id] ? ` · ${loreChanges(book, s.lorePatches[book.id]).size} changes` : ""}</option>)}
        </select>
      </label>
      <span className="hint lv-sum">{story
        ? (changes.size ? `${changes.size} change${changes.size === 1 ? "" : "s"} in ${story.name}. Edits here change only this story.` : `Same as the original. Edits here change only ${story.name}.`)
        : usable.length ? "Stories that change this book keep their own version; the original stays as it is." : ""}</span>
      {story && changes.size > 0 && <span className="lv-acts">
        <button type="button" className="btn btn-bordered btn-small" onClick={onSaveAsNew}>Save as a new lorebook</button>
        <button type="button" className="btn btn-bordered btn-small" onClick={() => setApplying(true)}>Apply to the original…</button>
        <button type="button" className="btn btn-plain btn-small" onClick={onReset}>Back to the original</button>
      </span>}
      {applying && story && (
        <ApplySheet items={[...changes].map(([id, c]) => ({ id, change: c, title: title(id), by: by(id) }))} story={story.name}
          onApply={(ids) => { setApplying(false); onApply(ids); }} onClose={() => setApplying(false)} />
      )}
    </div>
  );
}

function ApplySheet({ items, story, onApply, onClose }: {
  items: Array<{ id: string; change: LoreChange; title: string; by: string }>; story: string; onApply: (ids: string[]) => void; onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(items.map((i) => i.id)));
  return (
    <Modal title="Apply to the original" onClose={onClose} testId="lore-apply">
      <p className="hint">The changes you pick go into the Library's book, for every story and chat that uses it. The others stay only in {story}.</p>
      <div className="lv-list">
        {items.map((i) => (
          <label key={i.id} className="check lv-item"><input type="checkbox" checked={picked.has(i.id)}
            onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} />
            <LoreChangeTag change={i.change} /><span className="grow">{i.title}</span>{i.by && <span className="hint">by {i.by}</span>}</label>
        ))}
      </div>
      <div className="modal-foot"><span className="grow" />
        <button type="button" className="btn btn-bordered btn-small" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-prominent btn-small" disabled={!picked.size} onClick={() => onApply([...picked])}>Apply {picked.size}</button>
      </div>
    </Modal>
  );
}
