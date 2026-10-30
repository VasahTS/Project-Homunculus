// Homunculus 2 — lorebook editor, direction "A" (D-028): entries open in place, "Try It" beside them.
// Author: CLAUDE, 2026-10-29. Plan: docs/UI-PLAN.md "Lorebooks"; mockup: canvas "Homunculus 2 — UI mockups",
// row "Lorebooks", board A. Every field of SillyTavern's World Info entry is here, grouped by the question it
// answers (what it says · when it goes in · where it goes · the rest), plus ours: conditions on the world state.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { LoreEntry, Lorebook, type GenerationType, type HistoryEntry, type LoreCondition, type LorePosition, type Session } from "@homunculus/schemas";
import { estimateTokens, parseKeyRegex, type LoreTryResult } from "@homunculus/core";
import { ConfirmButton, Help } from "./Help.tsx";
import { Button, Collapse, Icon, Segmented, Switch } from "./kit.tsx";
import { HistoryList, type HistoryField } from "./Versions.tsx";
import { ReplaceBar } from "./LoreReplace.tsx";
import { useFloatingMenu } from "./FloatingMenu.ts";
import { move as moveItem, SortableList } from "./Sortable.tsx";
import type { Tracker } from "../trackers.ts";

const HISTORY_FIELDS: HistoryField[] = [{ key: "name", label: "name" }, { key: "description", label: "description" }, { key: "entries", label: "entries" }];

/** The 8 places, with a tiny drawing of the prompt: c = the character, m = a chat message (r = reply side), a = the entry. */
export const PLACES: Array<{ value: LorePosition; label: string; short: string; help: string }> = [
  { value: "before", label: "Before the character", short: "Before the character", help: "Before the character’s description (preset block “World Info (before)”)." },
  { value: "after", label: "After the character", short: "After the character", help: "After the character and your persona (block “World Info (after)”)." },
  { value: "atDepth", label: "In the chat", short: "In the chat", help: "Some messages before the end (0 = after the last one), as System, User or AI." },
  { value: "emTop", label: "Examples, top", short: "Examples (top)", help: "Before the example dialogue. Write it as an example: “{{char}}: …”." },
  { value: "emBottom", label: "Examples, bottom", short: "Examples (bottom)", help: "After the example dialogue." },
  { value: "anTop", label: "Author’s Note, top", short: "Author’s Note (top)", help: "Before the Author’s Note (for now: 4 messages back, as System)." },
  { value: "anBottom", label: "Author’s Note, bottom", short: "Author’s Note (bottom)", help: "After the Author’s Note (same place for now)." },
  { value: "outlet", label: "Outlet (by name)", short: "Outlet", help: "Only where a block or entry asks for it with {{outlet::name}}." },
];
/**
 * The 5 kinds of place (D-028, mockup "Where it goes" B): the menu picks the kind, and "Before | After" beside it
 * picks the side when the kind has two. Each kind has its own drawing and color, also on the closed entry row.
 */
export type PlaceKind = "character" | "chat" | "examples" | "note" | "outlet";
export const PLACE_KINDS: Array<{ kind: PlaceKind; name: string; label: string; help: string; before: LorePosition; after?: LorePosition }> = [
  { kind: "character", name: "Character", label: "Around the character", help: "Before or after the character’s description (preset blocks “World Info (before)” and “(after)”).", before: "before", after: "after" },
  { kind: "chat", name: "In the chat", label: "In the chat", help: "Some messages before the end (0 = after the last one), as System, User or AI.", before: "atDepth" },
  { kind: "examples", name: "Examples", label: "Around the examples", help: "Before or after the example dialogue. Write it as an example: “{{char}}: …”.", before: "emTop", after: "emBottom" },
  { kind: "note", name: "Author’s Note", label: "Around the Author’s Note", help: "Just before or after the Author’s Note (for now: 4 messages back, as System).", before: "anTop", after: "anBottom" },
  { kind: "outlet", name: "Outlet", label: "Outlet (by name)", help: "Only where a block or entry asks for it with {{outlet::name}}.", before: "outlet" },
];
export const kindOf = (p: LorePosition) => PLACE_KINDS.find((k) => k.before === p || k.after === p) ?? PLACE_KINDS[0]!;

const PLACE_DRAWING: Record<PlaceKind, ReactNode> = {
  character: <><rect x="3.5" y="3.5" width="11" height="11" rx="2.2" /><circle cx="9" cy="7.6" r="1.7" /><path d="M6.2 12.4c.6-1.2 1.6-1.8 2.8-1.8s2.2.6 2.8 1.8" /></>,
  chat: <><path d="M3.5 4.5h11v7h-5.5l-3 2.7v-2.7h-2.5z" /><path d="M6.2 8h5.6" /></>,
  examples: <><path d="M4.8 6h3.2v2.8c0 2-1 3.2-3 3.6" /><path d="M10.4 6h3.2v2.8c0 2-1 3.2-3 3.6" /></>,
  note: <><path d="M4 4h10v6l-4 4H4z" /><path d="M10 14v-4h4" /></>,
  outlet: <><path d="M7 3v2.6M11 3v2.6" /><path d="M5.5 5.6h7v2.6a3.5 3.5 0 0 1-7 0z" /><path d="M9 11.7V15" /></>,
};
/** The drawing of a kind of place, in that kind's color (theme tokens --place-*). */
export function PlaceIcon({ kind, size = 16 }: { kind: PlaceKind; size?: number }) {
  return (
    <svg className={`lore-pi lore-pi-${kind}`} width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.45"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PLACE_DRAWING[kind]}</svg>
  );
}

const LOGIC: Array<{ value: LoreEntry["logic"]; label: string }> = [
  { value: "andAny", label: "and any of these" }, { value: "andAll", label: "and all of these" },
  { value: "notAll", label: "but not all of these" }, { value: "notAny", label: "and none of these" },
];
const TRIGGERS: Array<{ value: GenerationType; label: string }> = [
  { value: "normal", label: "Normal" }, { value: "swipe", label: "New version" }, { value: "continue", label: "Continue" },
  { value: "impersonate", label: "Impersonate" }, { value: "quiet", label: "Quiet" },
];
const OPS: Array<{ value: LoreCondition["op"]; label: string }> = [
  { value: "equals", label: "is" }, { value: "notEquals", label: "is not" }, { value: "contains", label: "contains" }, { value: "notContains", label: "doesn't contain" },
  { value: "greater", label: "is more than" }, { value: "less", label: "is less than" }, { value: "exists", label: "has a value" }, { value: "missing", label: "is empty" },
];
type Filter = "all" | "on" | "always" | "conditions";

export const placeShort = (e: Pick<LoreEntry, "position" | "depth" | "role" | "outletName">) => {
  if (e.position === "atDepth") return `In the chat · ${e.depth} back · ${e.role === "assistant" ? "AI" : e.role === "user" ? "User" : "System"}`;
  if (e.position === "outlet") return e.outletName ? `Outlet: ${e.outletName}` : "Outlet (no name)";
  return PLACES.find((p) => p.value === e.position)?.short ?? e.position;
};
const titleOf = (e: LoreEntry) => e.title.trim() || e.keys[0] || "Untitled entry";
const newEntry = (book: Lorebook): LoreEntry => {
  const used = new Set(book.entries.map((e) => e.id));
  let n = book.entries.reduce((m, e) => Math.max(m, Number.isInteger(Number(e.id)) ? Number(e.id) + 1 : m), 0);
  while (used.has(String(n))) n++;
  return LoreEntry.parse({ id: String(n), title: "New entry" });
};

/** Small "badges" for the closed row: only what differs from the defaults. */
function badgesOf(e: LoreEntry): string[] {
  const b: string[] = [];
  if (e.secondaryKeys.length) b.push(`+ ${e.secondaryKeys.slice(0, 2).join(", ")}${e.secondaryKeys.length > 2 ? "…" : ""}`);
  if (e.useProbability && e.probability < 100) b.push(`${e.probability}%`);
  if (e.sticky) b.push(`stays ${e.sticky}`);
  if (e.cooldown) b.push(`cooldown ${e.cooldown}`);
  if (e.delay) b.push(`from message ${e.delay}`);
  if (e.group) b.push(`group: ${e.group}`);
  if (e.delayUntilRecursion) b.push("only via other entries");
  if (e.characterFilter.names.length || e.characterFilter.tags.length) b.push(`${e.characterFilter.exclude ? "not for" : "only"} ${[...e.characterFilter.names, ...e.characterFilter.tags].join(", ")}`);
  if (e.conditions.length) b.push(`⚑ ${e.conditions.length} condition${e.conditions.length === 1 ? "" : "s"}`);
  if (e.ignoreBudget) b.push("ignores budget");
  return b;
}

/** "More" summary when closed. */
function moreSummary(e: LoreEntry): string {
  const s = badgesOf(e).filter((x) => !x.startsWith("+ ") && !x.startsWith("⚑"));
  if (e.scanDepth !== null) s.push(`reads ${e.scanDepth} messages`);
  if (e.matchWholeWords !== null) s.push(e.matchWholeWords ? "whole words" : "parts of words");
  if (e.caseSensitive) s.push("match case");
  if (e.excludeRecursion) s.push("not brought in by others");
  if (e.preventRecursion) s.push("doesn't bring in others");
  if (e.triggers.length) s.push(`only ${e.triggers.join(", ")}`);
  return s.length ? s.join(" · ") : "Chance, groups, timing, recursion, who and when — all at their defaults";
}

export interface LorebookEditorProps {
  book: Lorebook;
  /** The "Folder" pick (round 3). */
  folder?: ReactNode;
  isNew: boolean;
  justSaved?: boolean;
  /** Who uses this book ("Default (every session)", "Lyra", "Session with Lyra"…). */
  usedBy: string[];
  trackers: Tracker[];
  sessions: Session[];
  /** The session Try It reads first (the one open last). */
  preferredSessionId: string | null;
  onSave: (b: Lorebook) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  onDuplicate: (b: Lorebook) => void;
  onExport: (b: Lorebook) => void;
  onClose: () => void;
  loadHistory: (id: string) => Promise<HistoryEntry[]>;
  tryIt: (b: Lorebook, sessionId: string | null, text: string) => Promise<LoreTryResult>;
  /** Original / a story's version (D-049), shown under the title bar. */
  versionBar?: ReactNode;
  /** Badges for entries a story's version changed. */
  entryBadge?: (entryId: string) => ReactNode;
  /** Editing a story's version: the book's name, history and Trash belong to the original. */
  versionMode?: boolean;
}

export function LorebookEditor(p: LorebookEditorProps) {
  const [d, setD] = useState<Lorebook>(p.book);
  const [status, setStatus] = useState<"idle" | "waiting" | "saving" | "saved">(p.justSaved ? "saved" : "idle");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [tryOn, setTryOn] = useState(() => { try { return localStorage.getItem("homunculus.ui.loreTry") !== "0"; } catch { return true; } });
  const [savedOnce, setSavedOnce] = useState(!p.isNew);
  const exists = savedOnce;
  const usedBy = p.usedBy;

  // ---- saving by itself (Daniel, 10/29: "ALWAYS save changes in lorebooks"): every change is saved a moment after
  // it is made, and right away when the editor closes (Close, another book, another area). No Save button, no warning.
  const latest = useRef(d);
  latest.current = d;
  const props = useRef(p);
  props.current = p;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const gone = useRef(false); // moved to the Trash: nothing more to save
  const alive = useRef(true);
  const saveNow = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const b = latest.current;
    if (gone.current) return queue.current;
    if (!b.name.trim()) { if (alive.current) { setError("Give the lorebook a name: it is saved as soon as it has one."); setStatus("idle"); } return queue.current; }
    // the order on screen is SillyTavern's displayIndex
    const clean = Lorebook.parse({ ...b, name: b.name.trim(), entries: b.entries.map((e, i) => ({ ...e, displayIndex: i })) });
    if (alive.current) { setError(""); setStatus("saving"); }
    queue.current = queue.current.then(() => props.current.onSave(clean)).then(() => {
      if (!alive.current) return;
      setSavedOnce(true);
      setStatus(timer.current ? "waiting" : "saved");
      if (historyOpenRef.current) void props.current.loadHistory(clean.id).then(setHistory);
    }, (e: unknown) => { if (alive.current) { setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`); setStatus("idle"); } });
    return queue.current;
  };
  const changed = () => {
    setStatus("waiting");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void saveNow(); }, 600);
  };
  // closing the editor saves what is still waiting
  useEffect(() => {
    alive.current = true; // (again: React's strict mode mounts twice while developing)
    return () => { alive.current = false; if (timer.current) void saveNow(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const historyOpenRef = useRef(historyOpen);
  historyOpenRef.current = historyOpen;

  const set = (patch: Partial<Lorebook>) => { setD((x) => ({ ...x, ...patch })); changed(); };
  const setEntry = (id: string, patch: Partial<LoreEntry>) => { setD((x) => ({ ...x, entries: x.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })); changed(); };
  const toggleTry = () => setTryOn((v) => { try { localStorage.setItem("homunculus.ui.loreTry", v ? "0" : "1"); } catch { /* fine */ } return !v; });
  useEffect(() => { if (historyOpen && exists) void p.loadHistory(d.id).then(setHistory); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [historyOpen]);

  // Find and Replace (Ctrl+H, also Ctrl+F), as in Notepad++
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceTick, setReplaceTick] = useState(0);

  // Ctrl+S / ⌘S: save now (it saves by itself anyway); never the browser's "save page". Ctrl+H / Ctrl+F: Find and Replace.
  const onKeys = (ev: ReactKeyboardEvent) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === "s") { ev.preventDefault(); void saveNow(); }
    if (k === "h" || k === "f") { ev.preventDefault(); setReplaceOpen(true); setReplaceTick((n) => n + 1); }
  };

  const addEntry = () => {
    const e = newEntry(d);
    set({ entries: [e, ...d.entries] });
    setOpen(e.id); setQ(""); setFilter("all");
  };
  const removeEntry = (id: string) => { set({ entries: d.entries.filter((e) => e.id !== id) }); if (open === id) setOpen(null); };
  const duplicateEntry = (e: LoreEntry) => {
    const copy = { ...newEntry(d), ...e, id: newEntry(d).id, title: `${titleOf(e)} (copy)`, original: undefined };
    const i = d.entries.findIndex((x) => x.id === e.id);
    set({ entries: [...d.entries.slice(0, i + 1), copy, ...d.entries.slice(i + 1)] });
    setOpen(copy.id);
  };
  const openEntry = (id: string) => {
    setOpen(id); setQ(""); setFilter("all");
    requestAnimationFrame(() => document.querySelector(`[data-entry="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const needle = q.trim().toLowerCase();
  const shown = d.entries.filter((e) => {
    if (filter === "on" && !e.enabled) return false;
    if (filter === "always" && !e.constant) return false;
    if (filter === "conditions" && !e.conditions.length) return false;
    if (!needle) return true;
    return [e.title, e.content, ...e.keys, ...e.secondaryKeys].some((x) => x.toLowerCase().includes(needle));
  });
  const counts = { all: d.entries.length, on: d.entries.filter((e) => e.enabled).length, always: d.entries.filter((e) => e.constant).length, conditions: d.entries.filter((e) => e.conditions.length).length };
  const reorderable = shown.length === d.entries.length;

  // Try It (re-run when the book changes, a little after typing stops)
  const tryState = useTry(p, d, tryOn);
  const hits = new Set(tryState.result?.report.activated.map((a) => a.entryId) ?? []);

  const fields = useMemo(() => conditionFields(p.trackers), [p.trackers]);

  return (
    <div className="editor lore-editor" aria-label="Lorebook editor" onKeyDown={onKeys}>
      <div className="session-bar lore-bar">
        <div className="lore-head">
          <input className="lore-name" aria-label="Lorebook name" value={d.name} placeholder="Name of the lorebook…" readOnly={p.versionMode} onChange={(e) => set({ name: e.target.value })} />
          <div className="lore-used" data-testid="lore-used">
            {usedBy.length ? <>Used by {usedBy.slice(0, 3).map((u) => <span key={u} className="tag">{u}</span>)}{usedBy.length > 3 && <span className="tag" title={usedBy.slice(3).join(", ")}>+{usedBy.length - 3} more</span>}</> : <><span className="hint">Not used yet.</span><Help text="Add it to Global Lorebooks (top of this page) to read it in every chat, link it to a character or persona (in their editor), or add it to one session (inspector → Prompt tab)." /></>}
          </div>
          {p.folder && <div className="lore-folder">{p.folder}</div>}
        </div>
        <span className="spacer" />
        <span className="hint lore-dirty" role="status" aria-live="polite">{status === "saving" || status === "waiting" ? "Saving…" : status === "saved" ? "Saved" : ""}</span>
        {exists && !p.versionMode && <Button variant="plain" small onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>History</Button>}
        {exists && <Button variant="plain" small onClick={() => p.onExport(d)}>Export for SillyTavern</Button>}
        {exists && <Button small onClick={() => { void saveNow().then(() => p.onDuplicate(latest.current)); }}>Duplicate</Button>}
        {exists && !p.versionMode && <ConfirmButton label="Move to Trash" confirmLabel="Click Again to Move" className="btn btn-plain btn-small danger-text"
          onConfirm={() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } void queue.current.then(() => { gone.current = true; return p.onTrash(d.id); }).catch((e) => setError(String(e instanceof Error ? e.message : e))); }} />}
        <Button small onClick={p.onClose}>Close</Button>
      </div>
      {p.versionBar}
      {error && <p className="error-text lore-error" role="alert">{error}</p>}
      <Collapse open={historyOpen}>
        <div className="lore-history">
          <HistoryList entries={history ?? []} loading={history === null} fields={HISTORY_FIELDS}
            onRestore={(data) => { const b = Lorebook.parse(data); setD(b); changed(); }} />
        </div>
      </Collapse>

      <div className="lore-tools">
        <label className="search-box lore-search">
          <Icon name="search" size={13} />
          <input type="search" spellCheck={false} autoComplete="off" aria-label="Find in entries" placeholder="Find in titles, keywords and text…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Segmented small label="Show" value={filter} onChange={setFilter} options={[
          { value: "all", label: `All ${counts.all}` }, { value: "on", label: `On ${counts.on}` },
          { value: "always", label: `Always on ${counts.always}` }, { value: "conditions", label: `With conditions ${counts.conditions}` },
        ]} />
        <span className="spacer" />
        <Button small onClick={addEntry}><Icon name="plus" size={13} /> New Entry</Button>
        <Button small aria-pressed={replaceOpen} title="Find and Replace (Ctrl+H)" onClick={() => { setReplaceOpen((v) => !v); setReplaceTick((n) => n + 1); }}>Replace</Button>
        <button type="button" className={`btn btn-bordered btn-small${tryOn ? " lore-try-on" : ""}`} aria-pressed={tryOn} onClick={toggleTry} data-testid="lore-try-toggle">
          <Icon name="sparkle" size={13} /> Try It
        </button>
      </div>
      {replaceOpen && (
        <ReplaceBar entries={d.entries} openId={open} focusTick={replaceTick}
          onOpenEntry={(id) => { if (!shown.some((x) => x.id === id)) { setQ(""); setFilter("all"); } setOpen(id); }}
          onApply={(entries) => set({ entries })}
          onClose={() => setReplaceOpen(false)} />
      )}

      <div className={`lore-cols${tryOn ? " with-try" : ""}`}>
        <div className="lore-list" data-testid="lore-entries">
          {shown.length === 0 && (
            <div className="lore-empty">
              {d.entries.length === 0
                ? <><p>No entries yet.</p><p className="hint">An entry is a piece of lore that goes into the prompt when one of its keywords shows up in the chat.</p><Button variant="prominent" small onClick={addEntry}>New Entry</Button></>
                : <p className="hint">No entry matches.</p>}
            </div>
          )}
          <SortableList items={shown} id={(e) => e.id} name={titleOf} label="Entries of this lorebook" itemTestId="lore-entry"
            onReorder={(from, to) => { if (reorderable) { setD((x) => ({ ...x, entries: moveItem(x.entries, from, to) })); changed(); } }}
            render={(e, handle) => (
              <div className={`lore-entry${open === e.id ? " open" : ""}${e.enabled ? "" : " off"}${tryOn && hits.has(e.id) ? " hit" : ""}`} data-entry={e.id}>
                <div className="lore-entry-head">
                  {reorderable ? handle : <span className="lore-grip-space" />}
                  <Switch label={`${titleOf(e)} on`} checked={e.enabled} onChange={(v) => setEntry(e.id, { enabled: v })} />
                  <button type="button" className="lore-entry-open" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}
                    aria-label={`${titleOf(e)}: ${e.constant ? "always on" : e.keys.join(", ") || "no keywords"} · ${placeShort(e)}`}>
                    <span className="lore-title">{titleOf(e)}</span>{p.entryBadge?.(e.id)}
                    <span className="lore-keys">
                      {!e.constant && e.keys.length === 0 && <span className="lore-key warn">No keywords</span>}
                    </span>
                    {badgesOf(e).slice(0, 3).map((b) => <span key={b} className="lore-badge">{b}</span>)}
                  </button>
                  {/* switch "Always on" right on the row (Daniel, 29/10); off it stays faint until the row is hovered */}
                  <button type="button" className={`lore-always-btn${e.constant ? " on" : ""}`} aria-pressed={e.constant}
                    aria-label={`Always on: ${titleOf(e)}`} title={e.constant ? "Always on: goes in without a keyword. Click to turn off." : "Click to make it always on (no keyword needed)."}
                    onClick={() => setEntry(e.id, { constant: !e.constant })}><span className="lore-always-dot" aria-hidden="true" />Always on</button>
                  <QuickPlace e={e} onPatch={(patch) => {
                    setEntry(e.id, patch);
                    // an outlet needs a name: open the entry so it can be typed
                    if (patch.position === "outlet" && !e.outletName.trim()) setOpen(e.id);
                  }} />
                  {/* same as clicking the row (the row button above is the one for the keyboard and screen readers) */}
                  <span className="lore-entry-tail" aria-hidden="true" onClick={() => setOpen(open === e.id ? null : e.id)}>
                    <span className="lore-tok tabular">{estimateTokens(e.content) - 4} tok</span>
                    <span className={`te-chev${open === e.id ? " open" : ""}`}><Icon name="chevron" size={13} /></span>
                  </span>
                </div>
                <Collapse open={open === e.id}>
                  <EntryBody e={e} set={(patch) => setEntry(e.id, patch)} fields={fields}
                    moreOpen={!!moreOpen[e.id]} onMore={() => setMoreOpen((m) => ({ ...m, [e.id]: !m[e.id] }))}
                    onDuplicate={() => duplicateEntry(e)} onDelete={() => removeEntry(e.id)} />
                </Collapse>
              </div>
            )} />
        </div>

        {tryOn && <TryPane state={tryState} sessions={p.sessions} onOpen={openEntry} entries={d.entries} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one entry, open

function EntryBody({ e, set, fields, moreOpen, onMore, onDuplicate, onDelete }: {
  e: LoreEntry; set: (patch: Partial<LoreEntry>) => void; fields: ConditionField[];
  moreOpen: boolean; onMore: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  return (
    <div className="lore-body">
      <section className="lore-sec">
        <div className="lore-lbl"><b>Title</b><Help text="Only for you, in this list (SillyTavern: “memo” / comment). The AI never sees it." /></div>
        <input aria-label="Entry title" value={e.title} placeholder={e.keys[0] ?? "Title"} onChange={(x) => set({ title: x.target.value })} />
      </section>
      <section className="lore-sec">
        <div className="lore-lbl"><b>Text</b><Help text="What goes into the prompt. Macros like {{char}} and {{user}} work here; {{outlet::name}} pulls in an outlet." /><span className="spacer" /><span className="hint tabular">{estimateTokens(e.content) - 4} tokens</span></div>
        <textarea className="lore-prose" aria-label="Entry text" rows={Math.min(14, Math.max(4, Math.ceil(e.content.length / 70) + 1))} value={e.content} onChange={(x) => set({ content: x.target.value })} />
      </section>

      <section className="lore-sec">
        <div className="lore-lbl"><b>Keywords</b><Help text="The entry goes in when one of these shows up in the last messages (how many: Settings → Lorebooks, or “Messages to read” below). A keyword written as /pattern/flags is a regular expression." /></div>
        <KeyInput label="Keywords" keys={e.keys} onChange={(keys) => set({ keys })} placeholder="Type a keyword or /regex/, then Enter…" />
        <div className="lore-logic">
          <span>Also needs</span>
          <select aria-label="How the extra keywords count" value={e.logic} onChange={(x) => set({ logic: x.target.value as LoreEntry["logic"] })}>
            {LOGIC.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <Help text="Optional extra keywords checked after a main keyword matched. “and any of these”: at least one must be there too. “and all of these”: every one. “but not all of these”: at least one missing. “and none of these”: none of them may be there." />
        </div>
        <KeyInput label="Extra keywords" keys={e.secondaryKeys} onChange={(secondaryKeys) => set({ secondaryKeys })} placeholder="Optional…" />
        <label className="lore-inline"><Switch label="Always on" checked={e.constant} onChange={(constant) => set({ constant })} /> Always on (no keyword needed)</label>
      </section>

      <section className="lore-sec lore-where-row">
        <span className="lore-wl">Where it goes</span>
        <PlacePicker value={e.position} onChange={(position) => set({ position })} />
        {kindOf(e.position).after && (
          <Segmented small label="Before or after" value={kindOf(e.position).after === e.position ? "after" : "before"}
            onChange={(side) => { const k = kindOf(e.position); set({ position: side === "after" ? k.after! : k.before }); }}
            options={[{ value: "before", label: "Before" }, { value: "after", label: "After" }]} />
        )}
        {e.position === "atDepth" && <>
          <label className="lore-mini"><span>Messages back</span><NumberField label="Depth" value={e.depth} min={0} max={1000} onCommit={(v) => set({ depth: v ?? 4 })} /></label>
          <label className="lore-mini"><span>As</span><select aria-label="Role" value={e.role} onChange={(x) => set({ role: x.target.value as LoreEntry["role"] })}><option value="system">System</option><option value="user">User</option><option value="assistant">AI</option></select></label>
        </>}
        {e.position === "outlet" && <label className="lore-mini"><span>Name</span><input aria-label="Outlet name" value={e.outletName} placeholder="e.g. secrets…" onChange={(x) => set({ outletName: x.target.value })} /></label>}
        <label className="lore-mini"><span>Order</span><NumberField label="Order" value={e.order} min={-100000} max={100000} onCommit={(v) => set({ order: v ?? 100 })} /></label>
        <Help text="Order: higher numbers go later in the prompt (closer to the chat) and are kept first when the lorebook budget is full." />
      </section>

      <section className="lore-sec">
        <button type="button" className="lore-fold" aria-expanded={moreOpen} onClick={onMore}>
          <span className={`te-chev${moreOpen ? " open" : ""}`}><Icon name="chevron" size={13} /></span>
          <b>More</b><span className="lore-fold-sum">{moreSummary(e)}</span>
        </button>
        <Collapse open={moreOpen}><MoreFields e={e} set={set} /></Collapse>
      </section>

      <section className="lore-sec">
        <div className="lore-lbl"><b>Only when the world state…</b><Help text="Homunculus only (SillyTavern ignores it). The entry also needs your trackers' values to match: e.g. Scene: World → Location contains “mill”. Checked for every way an entry goes in (keywords, always on, stays)." /></div>
        <Conditions e={e} set={set} fields={fields} />
      </section>

      <div className="lore-foot">
        <Button small onClick={onDuplicate}>Duplicate Entry</Button>
        <ConfirmButton label="Delete Entry" confirmLabel="Click Again to Delete" className="btn btn-plain btn-small danger-text" onConfirm={onDelete} />
      </div>
    </div>
  );
}

function MoreFields({ e, set }: { e: LoreEntry; set: (patch: Partial<LoreEntry>) => void }) {
  const tri = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");
  const fromTri = (s: string) => (s === "" ? null : s === "yes");
  const row = (label: string, help: string, control: ReactNode) => (
    <div className="row"><span className="row-label label-row">{label}<Help text={help} /></span><span className="row-value">{control}</span></div>
  );
  return (
    <div className="lore-more">
      <div className="group-head">Chance and groups</div>
      <div className="group">
        {row("Chance it goes in", "When it matches, it only goes in this often. 100% = always. Off = no roll.", <>
          <NumberField label="Chance" value={e.probability} min={0} max={100} onCommit={(v) => set({ probability: v ?? 100 })} /><span className="hint">%</span>
          <Switch label="Use chance" checked={e.useProbability} onChange={(useProbability) => set({ useProbability })} />
        </>)}
        {row("Group", "Entries with the same group name: only one of them goes in at a time (several names: separate with commas).", <input aria-label="Group" value={e.group} placeholder="none" onChange={(x) => set({ group: x.target.value })} />)}
        {row("Wins its group", "This entry is picked over the others of its group (by order) instead of a weighted roll.", <Switch label="Wins its group" checked={e.groupOverride} onChange={(groupOverride) => set({ groupOverride })} />)}
        {row("Group weight", "How likely this entry wins the group's roll compared to the others (100 = normal).", <NumberField label="Group weight" value={e.groupWeight} min={0} max={100000} onCommit={(v) => set({ groupWeight: v ?? 100 })} />)}
        {row("Pick by most keywords", "Book setting (Settings → Lorebooks) unless you choose here: in a group, the entries with the most keyword hits win.", <select aria-label="Group scoring" value={tri(e.useGroupScoring)} onChange={(x) => set({ useGroupScoring: fromTri(x.target.value) })}><option value="">As in Settings</option><option value="yes">Yes</option><option value="no">No</option></select>)}
      </div>
      <div className="group-head">Timing</div>
      <div className="group">
        {row("Stays for", "After it goes in, it stays for this many messages even without its keywords. Empty = off.", <><NumberField label="Sticky" nullable value={e.sticky} min={0} max={10000} placeholder="Off" onCommit={(v) => set({ sticky: v || null })} /><span className="hint">messages</span></>)}
        {row("Can't come back for", "After it goes in (or after it stops staying), it can't go in again for this many messages.", <><NumberField label="Cooldown" nullable value={e.cooldown} min={0} max={10000} placeholder="Off" onCommit={(v) => set({ cooldown: v || null })} /><span className="hint">messages</span></>)}
        {row("Not before message", "Can't go in until the chat has this many messages.", <NumberField label="Delay" nullable value={e.delay} min={0} max={100000} placeholder="Off" onCommit={(v) => set({ delay: v || null })} />)}
      </div>
      <div className="group-head">Entries that bring in entries</div>
      <div className="group">
        {row("Other entries can't bring it in", "Its keywords are not looked for in the text of other entries that went in.", <Switch label="Exclude recursion" checked={e.excludeRecursion} onChange={(excludeRecursion) => set({ excludeRecursion })} />)}
        {row("Its text doesn't bring in others", "Other entries don't look for their keywords in this entry's text.", <Switch label="Prevent recursion" checked={e.preventRecursion} onChange={(preventRecursion) => set({ preventRecursion })} />)}
        {row("Only via other entries", "Goes in only when another entry's text names it (from this round on). 0 = off.", <NumberField label="Delay until recursion" value={e.delayUntilRecursion} min={0} max={100} onCommit={(v) => set({ delayUntilRecursion: v ?? 0 })} />)}
        {row("Ignore the budget", "Goes in even when the lorebook budget is full.", <Switch label="Ignore budget" checked={e.ignoreBudget} onChange={(ignoreBudget) => set({ ignoreBudget })} />)}
      </div>
      <div className="group-head">How keywords are found</div>
      <div className="group">
        {row("Messages to read", "How many recent messages this entry looks at. Empty = the setting in Settings → Lorebooks.", <NumberField label="Scan depth" nullable value={e.scanDepth} min={0} max={1000} placeholder="Settings" onCommit={(v) => set({ scanDepth: v })} />)}
        {row("Match whole words", "“elf” doesn't match “shelf”.", <select aria-label="Whole words" value={tri(e.matchWholeWords)} onChange={(x) => set({ matchWholeWords: fromTri(x.target.value) })}><option value="">As in Settings</option><option value="yes">Yes</option><option value="no">No</option></select>)}
        {row("Match case", "“Fox” doesn't match “fox”.", <select aria-label="Match case" value={tri(e.caseSensitive)} onChange={(x) => set({ caseSensitive: fromTri(x.target.value) })}><option value="">As in Settings</option><option value="yes">Yes</option><option value="no">No</option></select>)}
        <div className="row row-wide"><span className="row-value lore-also">
          <span className="hint">Also look in:</span>
          {([["personaDescription", "your persona"], ["characterDescription", "the description"], ["characterPersonality", "the personality"], ["characterDepthPrompt", "the character note"], ["scenario", "the scenario"], ["creatorNotes", "creator notes"]] as const).map(([k, label]) => (
            <button key={k} type="button" className={`chip${e.scan[k] ? " on" : ""}`} aria-pressed={e.scan[k]} onClick={() => set({ scan: { ...e.scan, [k]: !e.scan[k] } })}>{label}</button>
          ))}
        </span></div>
      </div>
      <div className="group-head">Who and when</div>
      <div className="group">
        {row("Characters", "Names of characters (and card tags) this entry is for. Empty = everyone.", <input aria-label="Only for characters" placeholder="Everyone" value={[...e.characterFilter.names, ...e.characterFilter.tags.map((t) => `#${t}`)].join(", ")}
          onChange={(x) => { const parts = x.target.value.split(",").map((s) => s.trim()).filter(Boolean); set({ characterFilter: { ...e.characterFilter, names: parts.filter((s) => !s.startsWith("#")), tags: parts.filter((s) => s.startsWith("#")).map((s) => s.slice(1)) } }); }} />)}
        {row("Everyone except them", "Turns the list above around: the entry is for everyone EXCEPT those characters.", <Switch label="Exclude these characters" checked={e.characterFilter.exclude} onChange={(exclude) => set({ characterFilter: { ...e.characterFilter, exclude } })} />)}
        <div className="row row-wide"><span className="row-value lore-also">
          <span className="hint">Only for:</span>
          {TRIGGERS.map((t) => (
            <button key={t.value} type="button" className={`chip${e.triggers.includes(t.value) ? " on" : ""}`} aria-pressed={e.triggers.includes(t.value)}
              onClick={() => set({ triggers: e.triggers.includes(t.value) ? e.triggers.filter((x) => x !== t.value) : [...e.triggers, t.value] })}>{t.label}</button>
          ))}
          {e.triggers.length === 0 && <span className="hint">(every kind of reply)</span>}
        </span></div>
      </div>
      {(e.vectorized || e.automationId) && <p className="hint">SillyTavern only: {e.vectorized ? "vector search is on (Homunculus uses keywords). " : ""}{e.automationId ? `automation id “${e.automationId}”.` : ""}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- where it goes: a pop-up button (Daniel, 29/10: the 8 cards were too big)


/** "Where it goes" inside an open entry: the kind (menu) — "Before | After" sits beside it (D-028, mockup B). */
function PlacePicker({ value, onChange }: { value: LorePosition; onChange: (v: LorePosition) => void }) {
  const m = useFloatingMenu(PLACE_KINDS.length * 56 + 12, 340, "[role=option]");
  const cur = kindOf(value);
  // picking another kind keeps the side (after stays after) when that kind has two
  const pick = (k: (typeof PLACE_KINDS)[number]) => onChange(k.after && cur.after === value ? k.after : k.before);
  return (
    <span className="lore-pop" ref={m.box} onKeyDown={m.onKeyDown} onBlur={m.onBlur}>
      <button type="button" className="lore-pop-btn" aria-haspopup="listbox" aria-expanded={m.open} aria-label={`Where it goes: ${cur.name}`} onClick={() => m.setOpen((v) => !v)}>
        <PlaceIcon kind={cur.kind} />{cur.name}<Icon name="chevron" size={11} />
      </button>
      {m.open && m.pos && (
        <span className="lore-menu" role="listbox" aria-label="Where it goes" style={{ top: m.pos.top, left: m.pos.left }}>
          {PLACE_KINDS.map((k) => (
            <button key={k.kind} type="button" role="option" aria-selected={k.kind === cur.kind} className={`lore-opt${k.kind === cur.kind ? " on" : ""}`}
              onClick={() => { pick(k); m.setOpen(false); }}>
              <PlaceIcon kind={k.kind} size={20} />
              <span className="lore-opt-text"><b>{k.label}</b><small>{k.help}</small></span>
              {k.kind === cur.kind && <span className="lore-check" aria-hidden>✓</span>}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * "Where it goes" on a CLOSED entry row (Daniel, 29/10: change it without opening the entry): the place is a button;
 * its menu has one line per kind, and kinds with two sides offer "Before" and "After" right there — one click.
 */
function QuickPlace({ e, onPatch }: { e: LoreEntry; onPatch: (patch: Partial<LoreEntry>) => void }) {
  const m = useFloatingMenu(PLACE_KINDS.length * 40 + 12, 330, "[role=menuitemradio], .lore-qchat input, .lore-qchat select");
  const cur = kindOf(e.position);
  const choose = (v: LorePosition) => { onPatch({ position: v }); m.setOpen(false); };
  const item = (v: LorePosition, label: string, aria: string, cls: string) => (
    <button key={v} type="button" role="menuitemradio" aria-checked={e.position === v} aria-label={aria}
      className={`${cls}${e.position === v ? " on" : ""}`} onClick={() => choose(v)}>{label}</button>
  );
  return (
    <span className="lore-pop lore-qp" ref={m.box} onKeyDown={m.onKeyDown} onBlur={m.onBlur}>
      <button type="button" className="lore-where lore-where-btn" aria-haspopup="menu" aria-expanded={m.open}
        aria-label={`Where ${titleOf(e)} goes: ${placeShort(e)}. Change`} title="Change where it goes" onClick={() => m.setOpen((v) => !v)}>
        <PlaceIcon kind={cur.kind} size={15} /><span className="lore-where-text">{placeShort(e)}</span>
      </button>
      {m.open && m.pos && (
        <span className="lore-menu lore-qmenu" role="menu" aria-label={`Where ${titleOf(e)} goes`} style={{ top: m.pos.top, left: m.pos.left }}>
          {PLACE_KINDS.map((k) => k.kind === "chat" ? (
            // In the chat: how many messages back and as whom, right here (changing them also picks "In the chat")
            <span key={k.kind} className={`lore-qrow lore-qchat${e.position === "atDepth" ? " cur" : ""}`} role="group" aria-label={k.name}>
              <button type="button" role="menuitemradio" aria-checked={e.position === "atDepth"} className={`lore-qpick${e.position === "atDepth" ? " on" : ""}`}
                onClick={() => choose("atDepth")}>
                <PlaceIcon kind={k.kind} size={18} /><span className="lore-qname">{k.name}</span>
              </button>
              <NumberField label="Messages back" className="num lore-qnum" value={e.depth} min={0} max={1000}
                onCommit={(v) => onPatch({ position: "atDepth", depth: v ?? 4 })} />
              <span className="hint">back</span>
              <select aria-label="As" value={e.role} onChange={(x) => onPatch({ position: "atDepth", role: x.target.value as LoreEntry["role"] })}>
                <option value="system">System</option><option value="user">User</option><option value="assistant">AI</option>
              </select>
            </span>
          ) : k.after ? (
            <span key={k.kind} className={`lore-qrow${k.kind === cur.kind ? " cur" : ""}`} role="group" aria-label={k.name}>
              <PlaceIcon kind={k.kind} size={18} /><span className="lore-qname">{k.name}</span>
              {item(k.before, "Before", `${k.name}, before`, "lore-qside")}
              {item(k.after, "After", `${k.name}, after`, "lore-qside")}
            </span>
          ) : (
            <button key={k.kind} type="button" role="menuitemradio" aria-checked={e.position === k.before}
              className={`lore-qrow lore-qone${e.position === k.before ? " on" : ""}`} onClick={() => choose(k.before)}>
              <PlaceIcon kind={k.kind} size={18} /><span className="lore-qname">{k.name}</span>
              {e.position === k.before && <span className="lore-check" aria-hidden>✓</span>}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- keywords

function KeyInput({ keys, onChange, label, placeholder }: { keys: string[]; onChange: (k: string[]) => void; label: string; placeholder: string }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.startsWith("/") ? [raw.trim()] : raw.split(",").map((s) => s.trim());
    const next = [...keys, ...parts.filter((s) => s && !keys.includes(s))];
    if (next.length !== keys.length) onChange(next);
    setText("");
  };
  return (
    <div className="lore-chips" role="group" aria-label={label}>
      {keys.map((k) => {
        const bad = k.startsWith("/") && k.length > 1 && !parseKeyRegex(k);
        return (
          <span key={k} className={`lore-key big${k.startsWith("/") ? " re" : ""}${bad ? " bad" : ""}`} title={bad ? "This /regex/ is not valid: it will be matched as plain text." : undefined}>
            {k}<button type="button" aria-label={`Remove ${k}`} onClick={() => onChange(keys.filter((x) => x !== k))}>×</button>
          </span>
        );
      })}
      <input aria-label={`New ${label.toLowerCase()}`} value={text} placeholder={keys.length ? "" : placeholder} spellCheck={false} autoComplete="off"
        onChange={(x) => setText(x.target.value)}
        onKeyDown={(x) => {
          if (x.key === "Enter" || (x.key === "," && !text.startsWith("/"))) { x.preventDefault(); add(text); }
          if (x.key === "Backspace" && !text && keys.length) onChange(keys.slice(0, -1));
        }}
        onBlur={() => { if (text.trim()) add(text); }} />
    </div>
  );
}

// ---------------------------------------------------------------- conditions (ours)

interface ConditionField { path: string; label: string }

/** Tracker fields a condition can read: "<namespace>.<field>" (single values; per-character ones by path). */
function conditionFields(trackers: Tracker[]): ConditionField[] {
  const out: ConditionField[] = [];
  for (const t of trackers) {
    const ns = t.agent.state?.namespace;
    if (!ns) continue;
    const seen = new Set<string>();
    for (const s of t.sets) for (const f of s.fields) {
      if (seen.has(f.key) || f.scope !== "global") continue;
      seen.add(f.key);
      out.push({ path: `${ns}.${f.key}`, label: `${t.agent.name} → ${f.label}` });
    }
  }
  return out;
}

function Conditions({ e, set, fields }: { e: LoreEntry; set: (patch: Partial<LoreEntry>) => void; fields: ConditionField[] }) {
  const setOne = (i: number, patch: Partial<LoreCondition>) => set({ conditions: e.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <div className="lore-conds">
      {e.conditions.map((c, i) => {
        const known = fields.some((f) => f.path === c.path);
        return (
          <div key={i} className="lore-cond">
            <select aria-label="Tracker value" value={known ? c.path : "__custom"} onChange={(x) => setOne(i, { path: x.target.value === "__custom" ? c.path : x.target.value })}>
              {fields.map((f) => <option key={f.path} value={f.path}>{f.label}</option>)}
              <option value="__custom">{known ? "Other (type a path)…" : `Path: ${c.path}`}</option>
            </select>
            {!known && <input aria-label="Path" value={c.path} onChange={(x) => setOne(i, { path: x.target.value })} placeholder="e.g. world.location…" spellCheck={false} />}
            <select aria-label="Test" value={c.op} onChange={(x) => setOne(i, { op: x.target.value as LoreCondition["op"] })}>
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {c.op !== "exists" && c.op !== "missing" && <input aria-label="Value" value={c.value} onChange={(x) => setOne(i, { value: x.target.value })} />}
            <button type="button" className="icon-btn" aria-label="Remove condition" onClick={() => set({ conditions: e.conditions.filter((_, j) => j !== i) })}><Icon name="close" size={13} /></button>
          </div>
        );
      })}
      <div className="lore-cond-foot">
        <button type="button" className="link" onClick={() => set({ conditions: [...e.conditions, { path: fields[0]?.path ?? "world.location", op: "contains", value: "" }] })}>+ Add a Condition</button>
        {e.conditions.length > 1 && (
          <select aria-label="All or any" value={e.conditionLogic} onChange={(x) => set({ conditionLogic: x.target.value as LoreEntry["conditionLogic"] })}>
            <option value="all">All must match</option><option value="any">Any may match</option>
          </select>
        )}
        {e.conditions.length === 0 && <span className="hint">No conditions: only keywords decide.</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Try It

interface TryState {
  sessionId: string | null; setSessionId: (id: string | null) => void;
  text: string; setText: (t: string) => void;
  result: LoreTryResult | null; busy: boolean; error: string;
}

function useTry(p: LorebookEditorProps, book: Lorebook, on: boolean): TryState {
  const [sessionId, setSessionId] = useState<string | null>(p.preferredSessionId ?? p.sessions[0]?.id ?? null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<LoreTryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useRef(0);
  useEffect(() => {
    if (!on) return;
    const n = ++run.current;
    const t = setTimeout(() => {
      setBusy(true);
      p.tryIt(book, sessionId, text)
        .then((r) => { if (run.current === n) { setResult(r); setError(""); } })
        .catch((e) => { if (run.current === n) setError(e instanceof Error ? e.message : String(e)); })
        .finally(() => { if (run.current === n) setBusy(false); });
    }, 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, book, sessionId, text]);
  return { sessionId, setSessionId, text, setText, result, busy, error };
}

/** Splits a message into plain and marked parts: the keywords of the entries that went in. */
function marked(text: string, keys: string[]): Array<{ t: string; mark: boolean }> {
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const k of keys) {
    const re = parseKeyRegex(k);
    if (re) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      for (const m of text.matchAll(g)) if (m[0]) ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
      continue;
    }
    const n = k.toLowerCase().trim();
    if (!n) continue;
    for (let i = lower.indexOf(n); i >= 0; i = lower.indexOf(n, i + n.length)) ranges.push([i, i + n.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out: Array<{ t: string; mark: boolean }> = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (e <= at) continue;
    const start = Math.max(s, at);
    if (start > at) out.push({ t: text.slice(at, start), mark: false });
    out.push({ t: text.slice(start, e), mark: true });
    at = e;
  }
  if (at < text.length) out.push({ t: text.slice(at), mark: false });
  return out;
}

function TryPane({ state, sessions, onOpen, entries }: { state: TryState; sessions: Session[]; onOpen: (id: string) => void; entries: LoreEntry[] }) {
  const r = state.result;
  const activated = r?.report.activated ?? [];
  const keys = entries.filter((e) => activated.some((a) => a.entryId === e.id)).flatMap((e) => [...e.keys, ...e.secondaryKeys]);
  const titles = new Map(entries.map((e) => [e.id, titleOf(e)]));
  const budget = r?.report.budget;
  return (
    <aside className="lore-try" aria-label="Try it" data-testid="lore-try">
      <div className="lore-try-head">
        <b>Try It</b>
        <Help text="Runs this lorebook (also unsaved changes) on the newest messages of a session, as the next reply would: same reading settings, character, persona, world state and timers. Nothing is sent or saved." />
        <span className="spacer" />
        {state.busy && <span className="hint">checking…</span>}
      </div>
      <select className="lore-try-session" aria-label="Messages to try on" value={state.sessionId ?? ""} onChange={(x) => state.setSessionId(x.target.value || null)}>
        {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        <option value="">Only what I type below</option>
      </select>
      <div className="lore-try-chat">
        {(r?.messages ?? []).map((m, i) => (
          <div key={i} className={`lore-try-msg${m.read ? "" : " out"}`}>
            <span className="who">{m.who}</span>
            {marked(m.text.length > 600 ? `…${m.text.slice(-600)}` : m.text, m.read ? keys : []).map((s, j) => (s.mark ? <mark key={j}>{s.t}</mark> : <span key={j}>{s.t}</span>))}
          </div>
        ))}
        {r && r.messages.length === 0 && <p className="hint lore-try-none">No messages yet. Type something below.</p>}
      </div>
      <textarea className="lore-try-input" aria-label="Test text" rows={2} placeholder="Type a line to test, as if you sent it…" value={state.text} onChange={(x) => state.setText(x.target.value)} />
      {r && <p className="hint lore-try-depth">Reads the last {r.settings.scanDepth} message{r.settings.scanDepth === 1 ? "" : "s"} (dimmed ones are not read). Change it in Settings → Lorebooks.</p>}
      {state.error && <p className="error-text">{state.error}</p>}
      <div className="lore-try-results">
        <div className="group-head">Would go in · {activated.length}</div>
        <div className="group" data-testid="lore-try-in">
          {activated.length === 0 && <div className="row row-wide"><span className="hint">Nothing from this lorebook.</span></div>}
          {activated.map((a) => (
            <button key={a.entryId} type="button" className="lore-try-item" onClick={() => onOpen(a.entryId)}>
              <b>{titles.get(a.entryId) ?? a.title}</b><span className="hint tabular">{a.tokens} tok</span>
              <small>{reasonText(a.reason, titles)}</small>
            </button>
          ))}
        </div>
        {(r?.report.skipped.length ?? 0) > 0 && <>
          <div className="group-head">Left out · {r!.report.skipped.length}</div>
          <div className="group" data-testid="lore-try-out">
            {r!.report.skipped.map((s, i) => (
              <button key={`${s.entryId}-${i}`} type="button" className="lore-try-item" onClick={() => onOpen(s.entryId)}>
                <b>{titles.get(s.entryId) ?? s.title}</b><span />
                <small>{cap(s.reason)}</small>
              </button>
            ))}
          </div>
        </>}
        {budget && <div className="lore-budget"><span className="hint">Lorebook budget: {budget.used.toLocaleString("en-US")} of {budget.limit.toLocaleString("en-US")} tokens{budget.overflowed ? " — full" : ""}</span>
          <span className="lore-meter"><i style={{ width: `${Math.min(100, (budget.used / Math.max(1, budget.limit)) * 100)}%` }} /></span></div>}
      </div>
    </aside>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "keyword: castle" → "Keyword “castle”", etc. */
export function reasonText(reason: string, _titles?: Map<string, string>): string {
  const r = reason.replace(/^recursion, /, "");
  const via = reason.startsWith("recursion, ") ? " (found in another entry’s text)" : "";
  if (r === "always on") return "Always on";
  if (r === "sticky") return "Still on: it stays for a few messages";
  if (r === "@@activate") return "Forced on by @@activate";
  const m = /^keyword: (.+?)(?: \+ secondary \((\w+)\))?$/.exec(r);
  if (m) return `Keyword “${m[1]}”${m[2] ? ` and its extra keywords` : ""}${via}`;
  return cap(r) + via;
}

/**
 * A whole-number box you can type in freely (clear it, type "-"…): the value is checked and saved when you leave
 * the box or press Enter; Esc puts the old value back. `nullable` = empty means "not set".
 */
export function NumberField({ value, onCommit, min, max, label, placeholder, nullable = false, className = "num" }: {
  value: number | null; onCommit: (v: number | null) => void; min: number; max: number; label: string; placeholder?: string; nullable?: boolean; className?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(value === null ? "" : String(value)); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const n = parseInt(text.trim(), 10);
    if (!text.trim() || !Number.isFinite(n)) {
      if (nullable) { onCommit(null); setText(""); } else setText(value === null ? "" : String(value));
      return;
    }
    const v = Math.min(max, Math.max(min, n));
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <input className={className} inputMode="numeric" spellCheck={false} autoComplete="off" aria-label={label} placeholder={placeholder} value={text}
      onFocus={() => setEditing(true)} onChange={(x) => { setEditing(true); setText(x.target.value.replace(/[^\d-]/g, "")); }}
      onBlur={commit}
      onKeyDown={(x) => {
        if (x.key === "Enter") { x.preventDefault(); (x.target as HTMLInputElement).blur(); }
        if (x.key === "Escape") { setText(value === null ? "" : String(value)); setEditing(false); (x.target as HTMLInputElement).blur(); }
      }} />
  );
}
