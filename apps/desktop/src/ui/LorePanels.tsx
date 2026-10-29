// Homunculus 2 — lorebooks outside their editor (D-028): linked books on a character or persona, the session's books
// (Prompt tab), what went into a reply (Reply tab) and the reading settings (Settings → Lorebooks).
// Author: CLAUDE, 2026-10-29. Mockups: canvas "Homunculus 2 — UI mockups", row "Lorebooks".
import { useEffect, useState } from "react";
import { LoreSettings, type GenerationRecord, type Lorebook, type Session, type SetupLayer } from "@homunculus/schemas";
import type { SessionLorebook } from "@homunculus/core";
import { Help } from "./Help.tsx";
import { Button, Group, Row, Segmented, Switch } from "./kit.tsx";
import { NumberField, placeShort, reasonText } from "./LorebookEditor.tsx";

/** Linked lorebooks as chips (× removes) and a menu to add one. For characters and personas. */
export function LorebookChips({ ids, books, onChange, onOpen, help, bare = false, emptyText = "None.", addLabel = "+ Add a Lorebook" }: {
  ids: string[]; books: Lorebook[]; onChange: (ids: string[]) => void; onOpen?: (id: string) => void; help: string; bare?: boolean;
  emptyText?: string; addLabel?: string;
}) {
  const linked = ids.map((id) => books.find((b) => b.id === id)).filter((b): b is Lorebook => !!b);
  const free = books.filter((b) => !ids.includes(b.id));
  return (
    <div className="lore-link" data-testid="lorebook-links">
      {!bare && <span className="label-row">Lorebooks <Help text={help} /></span>}
      <div className="lore-link-row">
        {linked.map((b) => (
          <span key={b.id} className="lore-key big">
            {onOpen ? <button type="button" className="link quiet" onClick={() => onOpen(b.id)}>{b.name}</button> : b.name}
            {b.source.kind === "card" && <span className="hint">· from the card</span>}
            <button type="button" aria-label={`Remove ${b.name}`} onClick={() => onChange(ids.filter((x) => x !== b.id))}>×</button>
          </span>
        ))}
        {linked.length === 0 && <span className="hint">{emptyText}</span>}
        {free.length > 0 && (
          <select aria-label="Add a lorebook" value="" onChange={(e) => { if (e.target.value) onChange([...ids, e.target.value]); }}>
            <option value="">{addLabel}</option>
            {free.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

const FROM: Record<SessionLorebook["from"], string> = {
  default: "Global (every session)", story: "From the story", session: "Added to this session",
  character: "Comes with the character", persona: "Comes with your persona",
};

/** Session layer list after switching one book on or off (D-028; off = the session's "remove"). */
export function withSessionLorebook(setup: SetupLayer, id: string, on: boolean, own: boolean): SetupLayer {
  const cur = setup.lorebooks ?? { mode: "add" as const, add: [], remove: [] };
  const add = new Set(cur.mode === "keep" ? [] : cur.add);
  const remove = new Set(cur.remove);
  if (on) { remove.delete(id); if (own) add.add(id); } else { add.delete(id); remove.add(id); }
  return { ...setup, lorebooks: { mode: cur.mode === "only" ? "only" : "add", add: [...add], remove: [...remove] } };
}

/** The Prompt tab's "Lorebooks" group. */
export function SessionLorebooks({ session, all, load, onChangeSession, onOpen }: {
  session: Session; all: Lorebook[]; load: () => Promise<SessionLorebook[]>; onChangeSession: (s: Session) => void; onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<SessionLorebook[] | null>(null);
  useEffect(() => { let off = false; void load().then((r) => { if (!off) setRows(r); }); return () => { off = true; }; }, [load, session]);
  const shownIds = new Set((rows ?? []).map((r) => r.id));
  const others = all.filter((b) => !shownIds.has(b.id));
  const flip = (r: SessionLorebook, on: boolean) => {
    setRows((x) => x?.map((y) => (y.id === r.id ? { ...y, on } : y)) ?? null);
    onChangeSession({ ...session, setup: withSessionLorebook(session.setup, r.id, on, r.from === "session") });
  };
  const add = (id: string) => onChangeSession({ ...session, setup: withSessionLorebook(session.setup, id, true, true) });
  const drop = (id: string) => {
    const cur = session.setup.lorebooks;
    if (!cur) return;
    onChangeSession({ ...session, setup: { ...session.setup, lorebooks: { ...cur, add: cur.add.filter((x) => x !== id), remove: cur.remove.filter((x) => x !== id) } } });
  };
  return (
    <Group title="Lorebooks" testId="session-lorebooks"
      help="The lorebooks this session reads: the Default ones, the character's and your persona's, and any you add here. Switching one off only affects this session. Edit them in Library → Lorebooks; how they are read is in Settings → Lorebooks.">
      {rows === null && <Row wide><span className="hint">Loading…</span></Row>}
      {rows?.length === 0 && <Row wide><span className="hint">No lorebooks in this session.</span></Row>}
      {rows?.map((r) => (
        <div key={r.id} className="row lore-sess-row">
          <span className="row-label lore-sess-name">
            <button type="button" className="link quiet" onClick={() => onOpen(r.id)}><strong>{r.name}</strong></button>
            <span className="hint">{FROM[r.from]} · {r.entries} entr{r.entries === 1 ? "y" : "ies"}</span>
          </span>
          <span className="row-value">
            {r.from === "session" && <button type="button" className="link quiet" onClick={() => drop(r.id)}>Remove</button>}
            <Switch label={`${r.name} in this session`} checked={r.on} onChange={(v) => flip(r, v)} />
          </span>
        </div>
      ))}
      {others.length > 0 && (
        <Row wide>
          <select aria-label="Add a lorebook to this session" value="" onChange={(e) => { if (e.target.value) add(e.target.value); }}>
            <option value="">+ Add a Lorebook to This Session</option>
            {others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Row>
      )}
    </Group>
  );
}

/** The Reply tab's "Lorebooks" group: what went in and why, what stayed out and why. */
export function ReplyLorebooks({ lore }: { lore: NonNullable<GenerationRecord["lore"]> }) {
  const used = lore.activated.reduce((n, a) => n + a.tokens, 0);
  return (
    <Group title="Lorebooks" testId="reply-lore" aside={<span className="tabular">{lore.activated.length} entr{lore.activated.length === 1 ? "y" : "ies"} · {used} tok</span>}
      help="Which lorebook entries went into this reply's prompt and why, and the ones that matched but stayed out.">
      {lore.activated.length === 0 && <Row wide><span className="hint">No lorebook entry went in.</span></Row>}
      {lore.activated.map((a) => (
        <div key={`${a.bookId}.${a.entryId}`} className="lore-try-item lore-reply-item">
          <b>{a.title}</b><span className="hint tabular">{a.tokens} tok</span>
          <small>{reasonText(a.reason)} · {a.bookName} · {placeShort({ position: a.position, depth: 4, role: "system", outletName: "" }).replace(/ · 4 back · System$/, "")}</small>
        </div>
      ))}
      {lore.skipped.length > 0 && (
        <details className="lore-reply-out">
          <summary className="hint">Left out · {lore.skipped.length}</summary>
          {lore.skipped.map((s, i) => (
            <div key={i} className="lore-try-item lore-reply-item"><b>{s.title || `Entry ${s.entryId}`}</b><span /><small>{s.reason.charAt(0).toUpperCase() + s.reason.slice(1)}</small></div>
          ))}
        </details>
      )}
      {lore.budget && <Row wide><span className="hint">Budget: {lore.budget.used.toLocaleString("en-US")} of {lore.budget.limit.toLocaleString("en-US")} tokens{lore.budget.overflowed ? " — full, some entries were left out" : ""}</span></Row>}
    </Group>
  );
}

/** Settings → Lorebooks: SillyTavern's World Info settings in plain words, and the books for every session. */
export function LoreSettingsSection({ settings, onSave, books, defaultSetup, onSetDefaultSetup }: {
  settings: LoreSettings; onSave: (s: LoreSettings) => Promise<void>; books: Lorebook[];
  defaultSetup: SetupLayer; onSetDefaultSetup: (patch: Partial<SetupLayer>) => Promise<void>;
}) {
  const [s, setS] = useState(settings);
  useEffect(() => setS(settings), [settings]);
  const put = (patch: Partial<LoreSettings>) => { const next = LoreSettings.parse({ ...s, ...patch }); setS(next); void onSave(next); };
  const num = (key: keyof LoreSettings, label: string, unit: string, help: string, max = 100000) => (
    <Row label={label} help={help}>
      <NumberField label={label} value={s[key] as number} min={0} max={max} onCommit={(v) => put({ [key]: v ?? 0 } as Partial<LoreSettings>)} />
      <span className="hint lore-unit">{unit}</span>
    </Row>
  );
  const sw = (key: keyof LoreSettings, label: string, help: string) => (
    <Row label={label} help={help}><Switch label={label} checked={!!s[key]} onChange={(v) => put({ [key]: v } as Partial<LoreSettings>)} /></Row>
  );
  const everyIds = defaultSetup.lorebooks && defaultSetup.lorebooks.mode !== "keep" ? defaultSetup.lorebooks.add : [];
  return (
    <div className="settings-page lore-settings" data-testid="lore-settings">
      <Group title="Global Lorebooks" help="Read in every session and chat (SillyTavern: “Active World(s) for all chats”). A session can still switch one off in its Prompt tab. You can also switch “Global” on in the lorebook itself (Library → Lorebooks).">
        <Row wide><LorebookChips bare ids={everyIds} books={books} help="Pick the books every session reads."
          onChange={(ids) => void onSetDefaultSetup({ lorebooks: { mode: "add", add: ids, remove: defaultSetup.lorebooks?.remove ?? [] } })} /></Row>
      </Group>
      <Group title="What is read">
        {num("scanDepth", "Read the last", "messages", "Keywords are looked for in this many recent messages. Each entry can choose its own.", 1000)}
        {sw("includeNames", "Include who said it", "Reads “Lyra: …” instead of just the text, so names count as keywords.")}
        {sw("matchWholeWords", "Match whole words", "“elf” doesn't match “shelf”. Each entry can choose otherwise.")}
        {sw("caseSensitive", "Match case", "“Fox” doesn't match “fox”. Each entry can choose otherwise.")}
      </Group>
      <Group title="How much goes in">
        {num("budgetPercent", "Lorebooks may use up to", "% of context", "A share of the preset's context size. When it is full, entries with a lower order stay out (the Reply tab says which).", 100)}
        {num("budgetCap", "But never more than", "tokens", "An extra limit. 0 = none.")}
        {num("minActivations", "Keep looking until at least", "entries", "Reads older messages until this many entries are in. 0 = off.", 1000)}
        {num("minActivationsDepthMax", "…but never deeper than", "messages", "How far back that search may go. 0 = the whole chat.", 1000)}
      </Group>
      <Group title="Entries that bring in entries">
        {sw("recursive", "Entries' text can bring in others", "When an entry goes in, other entries also look for their keywords in its text.")}
        {num("maxRecursionSteps", "Stop after", "rounds", "Rounds of entries bringing in entries. 0 = no limit.", 100)}
      </Group>
      <Group title="Order and groups">
        <Row label="When books compete" help="For the budget: the character's books first, the other books first, or all mixed by each entry's order.">
          <Segmented small label="When books compete" value={s.insertionStrategy} onChange={(v) => put({ insertionStrategy: v })}
            options={[{ value: "characterFirst", label: "Character's first" }, { value: "globalFirst", label: "Others first" }, { value: "evenly", label: "Mixed" }]} />
        </Row>
        {sw("useGroupScoring", "Groups pick by most keywords", "In a group, the entries with the most keyword hits win. Otherwise a weighted roll picks one.")}
      </Group>
      <p className="hint">Same settings and defaults as SillyTavern's World Info, so its lorebooks behave the same here.</p>
      <div><Button small onClick={() => put(LoreSettings.parse({}))}>Restore SillyTavern's Defaults</Button></div>
    </div>
  );
}
