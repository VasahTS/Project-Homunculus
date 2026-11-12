// Homunculus 2 — Library → Cues: the list, the editor and Try It (D-113, claude/CUES-PLAN.md §7; round 2 D-119). Author: CLAUDE, 2026-11-10.
// A cue reacts to the chat without calling the AI. The editor is one page of sections, like the agent editor:
// About · Where It Runs · Reads · Remembers · Writes. Every section can stay empty, so a simple rule is just a text;
// the examples go from simple (Random Event) to complete (Opens Up Slowly, Boundary). It saves by itself.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Cue, CueSignal as CueSignalSchema, type Character, type CueCondition, type CueGroup, type CueInput, type CueReport, type CueSignal, type CueText, type CueValue, type Message, type Session, type SetupLayer, type Story } from "@homunculus/schemas";
import { estimateTokens, isBundleText, type CueOutput } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import { CUE_EXAMPLES, copyCue, cueCost, cueFromJanitorText, cueSizeText, isAlways, keyWords, oneOfShort, partSentence, POSITIONS, PICKS, SIGNAL_KINDS, blankCue, cueFromExample, cueOnText, layerHasCue, layerWithCue, signalText, stageView, testsText, valueStages } from "../cues.ts";
import { splitRegexKey } from "@homunculus/st-lorebooks";
import { ConfirmButton, Help } from "./Help.tsx";
import { AutoText, Button, Icon, IconButton, Segmented, Switch } from "./kit.tsx";
import { EmptyDetail, MasterDetail, SearchBox } from "./LibraryPages.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { ImportButton } from "./BundleButtons.tsx";
import { Modal } from "./Vault.tsx";

type Notice = (kind: "ok" | "warn" | "error", title: string, lines?: string[]) => void;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const uid = () => crypto.randomUUID().slice(0, 8);

export function CuesPage({ svc, lead, cues, stories, sessions, characters, defaultSetup, selectedId, onSelect, onSetDefaultSetup, onChanged, onExport, onImportBundles, onConvertScript, onNotice, activeSessionId }: {
  svc: AppServices; lead?: ReactNode;
  cues: Cue[]; stories: Story[]; sessions: Session[]; characters: Character[];
  defaultSetup: SetupLayer;
  selectedId: string | null; onSelect: (id: string | null) => void;
  onSetDefaultSetup: (patch: Partial<SetupLayer>) => Promise<void> | void;
  /** The list changed (saved, deleted, imported): read it again. */
  onChanged: () => Promise<void>;
  onExport: (id: string, name: string) => void;
  /** Homunculus files (.h2.json) go through the app's import, like the other pages. */
  onImportBundles: (files: File[]) => Promise<void>;
  /** A JanitorAI advanced script (code): the Assistant converts it (D-113 §6.2). */
  onConvertScript?: (code: string, fileName: string) => void;
  onNotice: Notice;
  activeSessionId: string | null;
}) {
  const [q, setQ] = useState("");
  const [examples, setExamples] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = cues.filter((c) => !needle || `${c.name} ${c.help}`.toLowerCase().includes(needle));
  const selected = cues.find((c) => c.id === selectedId) ?? null;
  const charName = (id: string) => characters.find((c) => c.id === id)?.name;
  const taken = cues.map((c) => c.namespace);

  // with nothing selected, open the first one (UX review item 3, D-078)
  useEffect(() => { if (!selectedId && cues[0]) onSelect(cues[0].id); }, [selectedId, cues, onSelect]);

  const add = async (input: CueInput) => {
    const saved = await svc.store.saveCue(input);
    await onChanged();
    onSelect(saved.id);
  };
  const importFiles = async (files: File[]) => {
    const bundles: File[] = [];
    const lines: string[] = [];
    let last: string | null = null;
    for (const f of files) {
      const text = await f.text();
      if (isBundleText(text)) { bundles.push(f); continue; }
      try {
        // a JanitorAI lorebook script (writing rules) becomes one cue; a script with code goes to the Assistant
        const looksJson = /^\s*[[{]/.test(text);
        if (!looksJson) {
          if (onConvertScript) { onConvertScript(text, f.name); lines.push(`${f.name}: a script with code — the Assistant is converting it.`); }
          else lines.push(`${f.name}: a script with code; open the Assistant to convert it.`);
          continue;
        }
        // a cue saved as plain JSON (a cue file): a copy with its own id and namespace
        const plain = (() => { try { const j = JSON.parse(text) as Record<string, unknown>; return j && !Array.isArray(j) && typeof j.name === "string" && (Array.isArray(j.groups) || Array.isArray(j.signals)) ? j : null; } catch { return null; } })();
        if (plain) {
          const parsed = Cue.safeParse({ ...plain, id: "x", namespace: "x" });
          if (!parsed.success) throw new Error(`This cue file can't be read (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}).`);
          const copy = copyCue(parsed.data, taken, parsed.data.name);
          const saved = await svc.store.saveCue({ ...copy, source: { kind: "imported", from: f.name } });
          last = saved.id;
          lines.push(`${f.name}: “${saved.name}” (off until you switch it on).`);
          continue;
        }
        const { cue, notes } = cueFromJanitorText(text, f.name, taken, true);
        const saved = await svc.store.saveCue(cue);
        last = saved.id;
        lines.push(`${f.name}: “${saved.name}”, ${saved.groups[0]?.items.length ?? 0} texts (off until you switch it on).`, ...notes);
      } catch (e) {
        if (/code, not a lorebook/.test(errorText(e)) && onConvertScript) { onConvertScript(text, f.name); lines.push(`${f.name}: a script with code — the Assistant is converting it.`); }
        else lines.push(`${f.name}: ${errorText(e)}`);
      }
    }
    if (bundles.length) await onImportBundles(bundles);
    if (lines.length) { await onChanged(); onNotice("ok", "Imported", lines); }
    if (last) onSelect(last);
  };

  return (
    <div className="page" data-testid="cues-page">
      <Toolbar lead={lead} title="Cues" subtitle="Rules that react to the chat, with no AI call"
        trailing={<>
          <ImportButton what="cues" onFiles={(f) => void importFiles(f)} />
          <Button onClick={() => setExamples(true)} data-testid="cues-examples">From an Example…</Button>
          <Button onClick={() => void add(blankCue(taken))} data-testid="cues-new"><Icon name="plus" size={14} /> New Cue</Button>
        </>} />
      {cues.length === 0 ? (
        <div className="detail cue-empty" data-testid="cues-empty">
          <h2>Cues react to the chat without calling the AI.</h2>
          <p className="hint">Count words, remember values between turns, pick a text — instantly and free. No code needed. Start from an example:</p>
          <ExampleCards onPick={(id) => { const c = cueFromExample(id, taken); if (c) void add(c); }} />
          <p className="hint">Or <button type="button" className="link" onClick={() => void add(blankCue(taken))}>make an empty one</button>. JanitorAI scripts and lorebook scripts come in with Import.</p>
        </div>
      ) : (
        <MasterDetail
          list={<>
            <SearchBox value={q} onChange={setQ} label="Search cues" />
            <ul className="master-list" data-testid="cue-list">
              {shown.map((c) => (
                <li key={c.id}>
                  <button className={`master-item${c.id === selectedId ? " on" : ""}`} onClick={() => onSelect(c.id)} data-testid="cue-row">
                    <span className="ag-ico" aria-hidden>{c.icon || "⟡"}</span>
                    <span className="side-text"><strong>{c.name}</strong><span>{cueSizeText(c)} · <span className={`cx-st${cueOnText(c, defaultSetup, stories, sessions, charName) === "Off" ? "" : " live"}`}>{cueOnText(c, defaultSetup, stories, sessions, charName)}</span></span></span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="side-empty">No cue matches.</li>}
            </ul>
          </>}
          detail={selected ? (
            <CueEditor key={selected.id} cue={selected} svc={svc} characters={characters} stories={stories} sessions={sessions} defaultSetup={defaultSetup}
              activeSessionId={activeSessionId} onSetDefaultSetup={onSetDefaultSetup} onSaved={onChanged} onExport={onExport}
              onDuplicate={(c) => void add(copyCue(c, taken, `${c.name} (copy)`))}
              onDelete={async () => { await svc.store.cues.delete(selected.id); await onSetDefaultSetup(layerWithCue(defaultSetup, selected.id, false)); await onChanged(); onSelect(null); }} />
          ) : <EmptyDetail text="Select a cue to edit it." />}
        />
      )}
      {examples && (
        <Modal title="Start From an Example" onClose={() => setExamples(false)} testId="cue-examples">
          <ExampleCards onPick={(id) => { setExamples(false); const c = cueFromExample(id, taken); if (c) void add(c); }} />
        </Modal>
      )}
    </div>
  );
}

function ExampleCards({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="ae-tiles cue-examples">
      {CUE_EXAMPLES.map((x) => (
        <button key={x.id} type="button" className="ae-tile" onClick={() => onPick(x.id)} data-testid={`cue-example-${x.id}`}>
          <b>{x.make().icon} {x.name}</b><span>{x.help}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ the editor (round 2, D-119)
// Daniel: "the Cues tab is a mess … it must at least be readable and easy to edit first". Draft 1 approved (claude.ai
// artifact SNhzdAd3oQ1xgdZFKfMXzJ): a header with the On pill, "How it works" (reads → remembers → writes), the parts
// first with texts as rows (a stage table when a part only tests one value), values as ladders with rules as
// sentences, reads as rows with word chips, and Try It inside the editor.

type TryResult = { texts: CueOutput[]; report: CueReport; before: Record<string, unknown> | undefined };
type Paths = Array<{ value: string; label: string }>;

function CueEditor({ cue, svc, characters, stories, sessions, defaultSetup, activeSessionId, onSetDefaultSetup, onSaved, onExport, onDuplicate, onDelete }: {
  cue: Cue; svc: AppServices; characters: Character[]; stories: Story[]; sessions: Session[]; defaultSetup: SetupLayer; activeSessionId: string | null;
  onSetDefaultSetup: (patch: Partial<SetupLayer>) => Promise<void> | void;
  onSaved: () => Promise<void>; onExport: (id: string, name: string) => void; onDuplicate: (c: Cue) => void; onDelete: () => Promise<void>;
}) {
  const [d, setD] = useState<Cue>(cue);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const [trying, setTrying] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);
  const pending = useRef<Cue | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return true;
    pending.current = null;
    const parsed = Cue.safeParse(next);
    if (!parsed.success) { setStatus("error"); setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)[0] ?? "Not valid"); return false; }
    try { await svc.store.saveCue(parsed.data); await onSaved(); setStatus("saved"); setError(""); return true; }
    catch (e) { setStatus("error"); setError(errorText(e)); return false; }
  }, [svc, onSaved]);
  useEffect(() => () => { void flush(); }, [flush]);
  const set = (patch: Partial<Cue>) => {
    setD((old) => {
      const next = { ...old, ...patch } as Cue;
      pending.current = next;
      return next;
    });
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 600);
  };
  const keysTaken = (exceptKey?: string) => new Set([...d.signals.map((s) => s.key), ...d.values.map((v) => v.key)].filter((k) => k !== exceptKey));
  const paths = useMemo<Paths>(() => [
    ...d.signals.map((s) => ({ value: `signal.${s.key}`, label: `${s.key} (reads)` })),
    ...d.values.map((v) => ({ value: `value.${v.key}`, label: `${v.key} (remembers)` })),
  ], [d.signals, d.values]);
  const jump = (id: string) => document.getElementById(`${d.id}-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const addSignal = () => set({ signals: [...d.signals, CueSignalSchema.parse({ key: freeKey("words", keysTaken()), kind: "words" })] });
  const addValue = () => set({ values: [...d.values, { key: freeKey("value", keysTaken()), label: "", initial: "", rules: [], otherwise: "keep", showInScene: false, stages: [] }] });
  const addPart = () => set({ groups: [...d.groups, { key: freeKey("texts", new Set(d.groups.map((g) => g.key))), name: `Part ${d.groups.length + 1}`, pick: "all", noRepeat: 0, chance: 100, cooldown: 0, wrap: "", separator: "\n", placement: { position: "atDepth", depth: 1, role: "system", outletName: "" }, items: [emptyText()] }] });

  return (
    <div className="editor cx" aria-label="Cue editor" data-testid="cue-editor">
      <div className="session-bar cx-bar">
        <input className="cx-icon" aria-label="Cue icon" maxLength={4} placeholder="⟡" value={d.icon ?? ""} onChange={(e) => set({ icon: e.target.value || undefined })} />
        <input className="cx-name" aria-label="Cue name" placeholder="Cue name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        <span className={status === "error" ? "error-text" : "hint"} role="status" data-testid="cue-save-state">{status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "✓ Saved"}</span>
        <OnPill d={d} set={set} characters={characters} stories={stories} sessions={sessions} defaultSetup={defaultSetup} onSetDefaultSetup={onSetDefaultSetup} />
        <Button small variant={trying ? "prominent" : "bordered"} data-testid="cue-try" aria-pressed={trying} onClick={() => { setTrying(!trying); setResult(null); }}>Try It</Button>
        <MoreMenu d={d} set={set} onExport={() => { void flush().then((ok) => { if (ok) onExport(d.id, d.name || "cue"); }); }}
          onDuplicate={() => { void flush().then((ok) => { if (ok) onDuplicate(d); }); }} onDelete={onDelete} />
      </div>
      <div className="editor-body cx-body">
        {error && <div className="error-bar inline" role="alert">{error}</div>}
        <AutoText className="cx-help" rows={1} aria-label="Cue description" placeholder="What it does, in one line" value={d.help} onChange={(e) => set({ help: e.target.value.replace(/\n/g, " ") })} />
        {trying && <TryBand svc={svc} cue={d} sessions={sessions} initialSessionId={activeSessionId} onResult={setResult} onClose={() => { setTrying(false); setResult(null); }} />}
        <HowItWorks d={d} result={trying ? result : null} onJump={jump} />

        <section className="cx-sec" id={`${d.id}-writes`} aria-label="Writes">
          {d.groups.map((g, i) => (
            <PartCard key={g.key + i} g={g} n={i + 1} many={d.groups.length > 1} values={d.values} signals={d.signals} paths={paths} result={trying ? result : null}
              onChange={(next) => set({ groups: d.groups.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => set({ groups: d.groups.filter((_, j) => j !== i) })} />
          ))}
          {!d.groups.length && <p className="hint">This cue writes nothing yet. Add a part with a text.</p>}
        </section>

        {d.values.length > 0 && (
          <section className="cx-sec" id={`${d.id}-remembers`} aria-label="Remembers">
            <div className="cx-sec-h"><span className="cx-k mem">Remembers</span><span className="hint">values kept between replies, pinned to each message (a swipe never counts twice)</span><span className="grow" />
              <Button small variant="plain" data-testid="cue-add-value" onClick={addValue}>+ Add a Value</Button></div>
            {d.values.map((v, i) => (
              <ValueCard key={i} v={v} paths={paths} taken={keysTaken(v.key)} now={trying ? result?.report.values.find((x) => x.key === v.key)?.after : undefined}
                onChange={(next) => set({ values: d.values.map((x, j) => (j === i ? next : x)) })}
                onRemove={() => set({ values: d.values.filter((_, j) => j !== i) })} />
            ))}
          </section>
        )}

        {d.signals.length > 0 && (
          <section className="cx-sec" id={`${d.id}-reads`} aria-label="Reads">
            <div className="cx-sec-h"><span className="cx-k read">Reads</span><span className="hint">worked out on every reply, never stored</span><span className="grow" />
              <Button small variant="plain" data-testid="cue-add-signal" onClick={addSignal}>+ Add a Reading</Button></div>
            <div className="cx-box">
              {d.signals.map((s, i) => (
                <SignalRow key={i} s={s} all={d.signals} taken={keysTaken(s.key)} live={trying ? result?.report.signals.find((x) => x.key === s.key) : undefined}
                  onChange={(next) => set({ signals: d.signals.map((x, j) => (j === i ? next : x)) })}
                  onRemove={() => set({ signals: d.signals.filter((_, j) => j !== i) })} />
              ))}
            </div>
          </section>
        )}

        <div className="cx-add">
          <span>Add:</span>
          {!d.signals.length && <Button small data-testid="cue-add-signal" onClick={addSignal}>Read the Chat</Button>}
          {!d.values.length && <Button small data-testid="cue-add-value" onClick={addValue}>Remember a Value</Button>}
          <Button small data-testid="cue-add-group" onClick={addPart}>Another Part</Button>
          <Help text="Reads: words, message counts, chance, the clock or a tracker field, worked out on every reply. Values: something the cue remembers between replies (a stage, a counter, “is it paused?”). Parts: groups of texts, each picking its own way and going to its own place in the prompt." />
        </div>
      </div>
    </div>
  );
}

const GEN = [{ value: "normal", label: "New Replies" }, { value: "swipe", label: "New Versions" }, { value: "continue", label: "Continue" }, { value: "impersonate", label: "Impersonate" }] as const;
const emptyText = (): CueText => ({ id: uid(), title: "", text: "", weight: 100, when: [], logic: "all", chance: 100, minMessages: 0, oneOf: "", enabled: true });

/** A small menu under a button: closes on a click outside or Escape. */
function usePop() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); box.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return { open, setOpen, box };
}

/** "Off ▾" / "On in every chat ▾": where the cue runs, and the rarely changed run settings. */
function OnPill({ d, set, characters, stories, sessions, defaultSetup, onSetDefaultSetup }: {
  d: Cue; set: (p: Partial<Cue>) => void; characters: Character[]; stories: Story[]; sessions: Session[]; defaultSetup: SetupLayer;
  onSetDefaultSetup: (patch: Partial<SetupLayer>) => Promise<void> | void;
}) {
  const { open, setOpen, box } = usePop();
  const charName = (id: string) => characters.find((c) => c.id === id)?.name;
  const on = cueOnText(d, defaultSetup, stories, sessions, charName);
  const everyChat = layerHasCue(defaultSetup, d.id);
  const st = stories.filter((s) => layerHasCue(s.setup, d.id)).length;
  const ch = sessions.filter((s) => s.setup.cues?.add.includes(d.id)).length;
  return (
    <span className="cx-pop-wrap" ref={box}>
      <button type="button" className={`cx-on${on === "Off" ? "" : " live"}`} aria-haspopup="dialog" aria-expanded={open} data-testid="cue-on" onClick={() => setOpen(!open)}>
        <span className="cx-dot" />{on === "Off" ? "Off" : `On · ${on}`}<span aria-hidden className="cx-caret">▾</span>
      </button>
      {open && (
        <div className="cx-pop" role="dialog" aria-label="Where it runs" data-testid="cue-where">
          <div className="cx-pop-ln"><b>On in every chat</b><Switch label="On in every chat" checked={everyChat} onChange={(v) => void onSetDefaultSetup({ cues: layerWithCue(defaultSetup, d.id, v).cues })} /></div>
          <div className="cx-pop-ln wrap" data-testid="cue-characters">
            <span>With these characters</span>
            {d.characterIds.map((id) => (
              <span key={id} className="tag">{charName(id) ?? "(a deleted character)"} <button type="button" className="link quiet" aria-label="Untie this character" onClick={() => set({ characterIds: d.characterIds.filter((x) => x !== id) })}>×</button></span>
            ))}
            <select className="pick-select" aria-label="Tie to a character" value="" onChange={(e) => { if (e.target.value) set({ characterIds: [...d.characterIds, e.target.value] }); }}>
              <option value="">+ Character…</option>
              {characters.filter((c) => !d.characterIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <small className="hint">Or switch it on for one story or chat: its Setup → Cues.{st || ch ? ` On in ${st} ${st === 1 ? "story" : "stories"}, ${ch} ${ch === 1 ? "chat" : "chats"} now.` : ""}</small>
          <hr />
          <div className="cx-pop-ln wrap"><span>Runs on</span>
            {GEN.map((g) => {
              const isOn = !d.when.generationTypes.length || d.when.generationTypes.includes(g.value);
              return <button key={g.value} type="button" className={`fchip${isOn ? " on" : ""}`} aria-pressed={isOn}
                onClick={() => {
                  const all = GEN.map((x) => x.value);
                  const cur = d.when.generationTypes.length ? d.when.generationTypes : all;
                  const next = isOn ? cur.filter((x) => x !== g.value) : [...cur, g.value];
                  set({ when: { ...d.when, generationTypes: next.length === all.length ? [] : next } });
                }}>{g.label}</button>;
            })}
          </div>
          <div className="cx-pop-ln"><span>Starts after this many messages</span><NumberBox label="Starts after this many messages" value={d.when.minMessages} min={0} max={10000} onCommit={(n) => set({ when: { ...d.when, minMessages: n } })} /></div>
          <div className="cx-pop-ln"><span>On a swipe <Help text="Same Roll: a swipe gets the same texts, only the AI's writing changes. Counters never add twice either way." /></span>
            <Segmented small label="Chance on a swipe" value={d.randomness} onChange={(v) => set({ randomness: v })}
              options={[{ value: "stable", label: "Same Roll" }, { value: "perSwipe", label: "Roll Again" }]} /></div>
        </div>
      )}
    </span>
  );
}

/** ⋯: Export, Author, where values live, Delete. */
function MoreMenu({ d, set, onExport, onDuplicate, onDelete }: { d: Cue; set: (p: Partial<Cue>) => void; onExport: () => void; onDuplicate: () => void; onDelete: () => Promise<void> }) {
  const { open, setOpen, box } = usePop();
  return (
    <span className="cx-pop-wrap" ref={box}>
      <IconButton label="More" aria-haspopup="dialog" aria-expanded={open} data-testid="cue-more" onClick={() => setOpen(!open)}><Icon name="dots" size={15} /></IconButton>
      {open && (
        <div className="cx-pop" role="dialog" aria-label="More">
          <div className="row-line wrap">
            <Button small data-testid="cue-duplicate" title="A copy of this cue, off, to change without touching this one" onClick={() => { setOpen(false); onDuplicate(); }}>Duplicate</Button>
            <Button small data-testid="cue-export" title="Save this cue to a file, to keep or share" onClick={() => { setOpen(false); onExport(); }}>Export…</Button>
          </div>
          <label className="ae-fld"><span>Author</span><input aria-label="Cue author" placeholder="Optional" value={d.author ?? ""} onChange={(e) => set({ author: e.target.value || undefined })} /></label>
          <small className="hint">Values live in the scene as <code>{d.namespace}</code>; macros read them as <code>{`{{state.${d.namespace}.name}}`}</code>.</small>
          <hr />
          <ConfirmButton label="Delete Cue" confirmLabel="Delete it" onConfirm={() => void onDelete()} />
        </div>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ How it works

function HowItWorks({ d, result, onJump }: { d: Cue; result: TryResult | null; onJump: (id: string) => void }) {
  const r = result?.report;
  const cost = cueCost(d);
  const only = !d.signals.length && !d.values.length;
  const show = (x: unknown) => (x === undefined || x === null || x === "" ? "—" : typeof x === "object" ? JSON.stringify(x) : String(x));
  const writes = (
    <div className="cx-col write">
      <h4>Writes {!only && <button type="button" className="link quiet" onClick={() => onJump("writes")}>{d.groups.length} {d.groups.length === 1 ? "part" : "parts"} ▸</button>}</h4>
      {r ? (
        <div data-testid="cue-try-writes">
          {r.skipped ? <p className="hint" data-testid="cue-try-skipped">It would not run here: {r.skipped}.</p>
            : r.groups.map((g) => (
              <div key={g.key} className="cx-it"><b>{g.name || g.key} · {g.picked.length}</b><span>{g.picked.length ? g.picked.map((x) => x.title).join(", ") : "nothing this reply"} · {g.reason}</span></div>
            ))}
        </div>
      ) : d.groups.map((g) => {
        const sv = stageView(g, d.values, d.signals);
        return <div key={g.key} className="cx-it">{only ? null : <b>{g.name || g.key}</b>}
          <span>{partSentence(g, sv?.key).map((p) => p.text).join("")} {g.items.length} {g.items.length === 1 ? "text" : "texts"}{g.pick === "all" && g.items.some(isAlways) && g.items.some((t) => !isAlways(t)) ? ` (${g.items.filter(isAlways).length} always)` : ""}.</span></div>;
      })}
    </div>
  );
  return (
    <div className={`cx-flow${only ? " one" : ""}${r ? " live" : ""}`} aria-label="How it works" data-testid="cue-flow">
      {!only && <>
        <div className="cx-col read"><h4>Reads <button type="button" className="link quiet" onClick={() => onJump("reads")}>{d.signals.length} ▸</button></h4>
          {d.signals.map((s) => {
            const live = r?.signals.find((x) => x.key === s.key);
            return <div key={s.key} className="cx-it"><b>{s.key}{live ? <> = <span className="cx-live">{show(live.value)}</span></> : null}</b><span>{live ? (live.detail || "nothing matched") : readingText(s, d.signals)}</span></div>;
          })}
          {!d.signals.length && <span className="hint">Nothing.</span>}
        </div>
        <div className="cx-arrow" aria-hidden>→</div>
        <div className="cx-col mem"><h4>Remembers <button type="button" className="link quiet" onClick={() => onJump("remembers")}>{d.values.length} ▸</button></h4>
          {d.values.map((v) => {
            const live = r?.values.find((x) => x.key === v.key);
            const stages = valueStages(v);
            return <div key={v.key} className="cx-it"><b>{v.key}</b>
              {live ? <span>{show(live.before)} → <b className="cx-mem-now">{show(live.after)}</b> · {live.why}</span> : !stages.length ? <span>starts as {show(v.initial)} · {v.rules.length} {v.rules.length === 1 ? "rule" : "rules"}</span> : null}
              {stages.length > 0 && <Ladder stages={stages} start={String(v.initial)} now={live ? String(live.after) : undefined} />}
              {v.showInScene && !live && <span>Shown in the Scene panel</span>}
            </div>;
          })}
          {!d.values.length && <span className="hint">Nothing.</span>}
        </div>
        <div className="cx-arrow" aria-hidden>→</div>
      </>}
      {writes}
      <div className="cx-flow-foot">
        {r ? <span>This reply: <b>{r.tokens.toLocaleString()}</b> tokens from this cue</span> : <>
          {cost.always > 0 && <span>Each reply: <b>~{cost.always.toLocaleString()}</b> tokens always</span>}
          {cost.extra.map((x) => <span key={x.part}>{cost.always || cost.extra[0] !== x ? "+ " : "Each reply: "}{x.one ? `one from ${x.part}` : `${x.part} whose tests pass`} (<b>{x.min === x.max ? `~${x.min}` : `${x.min}–${x.max}`}</b>{x.one ? "" : " each"})</span>)}
          {!cost.always && !cost.extra.length && <span>Nothing to add yet.</span>}
        </>}
      </div>
    </div>
  );
}

function Ladder({ stages, start, now }: { stages: string[]; start: string; now?: string }) {
  return <span className="cx-ladder">{stages.map((s, i) => <span key={s} className="cx-ladder-i">{i > 0 && <i aria-hidden>→</i>}<span className={`cx-stage${s === start ? " start" : ""}${now === s ? " now" : ""}`}>{s}</span></span>)}</span>;
}

/** An earlier reading with the very same words (Yhul's "streak" counts intimacy's words). */
const sameWordsAs = (s: CueSignal, all: CueSignal[]) => (s.kind !== "words" || !s.words.length ? undefined
  : all.slice(0, all.indexOf(s)).find((x) => x.kind === "words" && JSON.stringify(x.words) === JSON.stringify(s.words)));

/** "84 words · last 4 messages", "messages in a row with 2+ of intimacy's words · last 6" */
function readingText(s: CueSignal, all: CueSignal[]): string {
  if (s.kind !== "words") return signalText(s);
  const same = sameWordsAs(s, all);
  const count = same ? `${same.key}'s words` : `${s.words.length} ${s.words.length === 1 ? "word" : "words"}`;
  const who = s.from === "user" ? ", yours" : s.from === "ai" ? ", the AI's" : "";
  return s.measure === "streak" ? `messages in a row with ${s.perMessage}+ of ${count} · last ${s.last}${who}` : `${count} · ${s.last === 1 ? "last message" : `last ${s.last} messages`}${who}`;
}

// ------------------------------------------------------------------ Try It, inside the editor

function TryBand({ svc, cue, sessions, initialSessionId, onResult, onClose }: {
  svc: AppServices; cue: Cue; sessions: Session[]; initialSessionId: string | null; onResult: (r: TryResult | null) => void; onClose: () => void;
}) {
  const [sessionId, setSessionId] = useState(initialSessionId && sessions.some((s) => s.id === initialSessionId) ? initialSessionId : sessions[0]?.id ?? "");
  const [path, setPath] = useState<Message[]>([]);
  const [messageId, setMessageId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!sessionId) return;
    void (async () => {
      const last = await svc.store.latestMessage(sessionId);
      const p = last ? await svc.store.pathTo(last.id) : [];
      setPath(p);
      setMessageId(p.at(-1)?.id ?? "");
    })();
  }, [svc, sessionId]);
  useEffect(() => {
    if (!sessionId || !messageId) { onResult(null); return; }
    let live = true;
    const t = setTimeout(() => {
      setError("");
      svc.chat.turns.tryCue(sessionId, messageId, cue).then((r) => { if (live) onResult(r); }).catch((e: unknown) => { if (live) { onResult(null); setError(errorText(e)); } });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [svc, sessionId, messageId, cue, onResult]);
  return (
    <div className="cx-try" role="region" aria-label="Try It" data-testid="cue-try-it">
      <b>Try It</b>
      {sessions.length ? <>
        <span>on</span>
        <select className="pick-select" aria-label="Chat" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <span>the reply after</span>
        <select className="pick-select cx-try-msg" aria-label="Message" value={messageId} onChange={(e) => setMessageId(e.target.value)}>
          {path.map((m, i) => <option key={m.id} value={m.id}>#{i + 1} · {m.content.slice(0, 60)}</option>)}
        </select>
      </> : <span className="hint">Make a chat first: Try It reads its messages.</span>}
      <span className="grow" />
      <span className="hint">Nothing is saved · edits update it</span>
      <Button small onClick={onClose}>Close</Button>
      {error && <div className="error-bar inline" role="alert">{error}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ a part (a group of texts)

const SHOW = 10;

function PartCard({ g, n, many, values, signals, paths, result, onChange, onRemove }: {
  g: CueGroup; n: number; many: boolean; values: CueValue[]; signals: CueSignal[]; paths: Paths; result: TryResult | null;
  onChange: (g: CueGroup) => void; onRemove: () => void;
}) {
  const [settings, setSettings] = useState(false);
  // a part with one text shows it open: a one-text cue is just its text (draft board 5)
  const [open, setOpen] = useState<string | null>(g.items.length === 1 ? g.items[0]!.id : null);
  const [all, setAll] = useState(false);
  const [onlyHits, setOnlyHits] = useState(false);
  const up = (patch: Partial<CueGroup>) => onChange({ ...g, ...patch });
  const upItem = (id: string, patch: Partial<CueText>) => up({ items: g.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const sv = stageView(g, values, signals);
  const short = oneOfShort(g.items.map((t) => t.oneOf));
  const report = result?.report.groups.find((x) => x.key === g.key);
  const hits = new Set(report?.picked.map((x) => x.id) ?? []);
  const p = g.placement;
  const always = g.pick === "all" ? g.items.filter(isAlways) : [];
  const split = always.length > 0 && always.length < g.items.length;
  const visible = (list: CueText[]) => (onlyHits ? list.filter((t) => hits.has(t.id)) : list);
  const addText = (base?: Partial<CueText>) => { const t = { ...emptyText(), ...base }; up({ items: [...g.items, t] }); setOpen(t.id); setAll(true); };
  const rowProps = (t: CueText) => ({
    t, short, pick: g.pick, open: open === t.id, hit: result ? hits.has(t.id) : undefined, paths,
    onOpen: () => setOpen(open === t.id ? null : t.id),
    onChange: (patch: Partial<CueText>) => upItem(t.id, patch),
    onRemove: () => { up({ items: g.items.filter((x) => x.id !== t.id) }); setOpen(null); },
    onDuplicate: () => { const c = { ...structuredClone(t), id: uid(), title: t.title ? `${t.title} (copy)` : "" }; const i = g.items.findIndex((x) => x.id === t.id); up({ items: [...g.items.slice(0, i + 1), c, ...g.items.slice(i + 1)] }); setOpen(c.id); },
    shares: t.oneOf ? g.items.filter((x) => x.id !== t.id && x.oneOf === t.oneOf).map((x) => titleOf(x)) : [],
    oneOfNames: [...new Set(g.items.map((x) => x.oneOf).filter(Boolean))],
  });
  const tokensOf = (list: CueText[]) => list.reduce((s, t) => s + (t.text.trim() ? estimateTokens(t.text) : 0), 0);
  const rows = (list: CueText[]) => {
    const shown = visible(list);
    const cut = !all && !onlyHits && shown.length > SHOW + 2 ? shown.slice(0, SHOW) : shown;
    return { cut, more: shown.length - cut.length };
  };
  const plain = rows(split ? g.items.filter((t) => !isAlways(t)) : g.items);

  return (
    <div className="cx-part" data-testid="cue-group">
      <div className="cx-sec-h">
        <span className="cx-k write">Writes</span>
        <input className="cx-part-name" aria-label="Part name" value={g.name} placeholder={`Part ${n}`} onChange={(e) => up({ name: e.target.value })} />
        {many && <span className="hint">part {n}</span>}
      </div>
      <div className="cx-box">
        <div className="cx-part-top">
          <span className="cx-sentence">{partSentence(g, sv?.key).map((x, i) => (x.strong ? <b key={i}>{x.text}</b> : <span key={i}>{x.text}</span>))}</span>
          <span className="grow" />
          {report ? <span className="cx-tok">{report.picked.length} go in</span> : <span className="cx-tok">{g.items.length} {g.items.length === 1 ? "text" : "texts"}</span>}
          {result && <button type="button" className="link quiet" aria-pressed={onlyHits} onClick={() => setOnlyHits(!onlyHits)}>{onlyHits ? "Show all" : "Only what goes in"}</button>}
          <Button small aria-expanded={settings} data-testid="cue-part-settings" onClick={() => setSettings(!settings)}>Settings</Button>
        </div>
        {settings && (
          <div className="cx-settings" data-testid="cue-place">
            <label className="cx-fld"><span>Picks</span>
              <select className="pick-select" aria-label="How it picks" value={g.pick} onChange={(e) => up({ pick: e.target.value as CueGroup["pick"] })}>
                {PICKS.map((x) => <option key={x.value} value={x.value}>{x.label} — {x.sub}</option>)}
              </select></label>
            {(g.pick === "random" || g.pick === "rotate") && <label className="cx-fld"><span>Don't repeat the last</span><NumberBox label="Don't repeat the last N" value={g.noRepeat} min={0} max={100} onCommit={(noRepeat) => up({ noRepeat })} /></label>}
            <label className="cx-fld"><span>Chance %</span><NumberBox label="Part chance" value={g.chance} min={0} max={100} onCommit={(chance) => up({ chance })} /></label>
            <label className="cx-fld"><span>Then wait (messages)</span><NumberBox label="Cooldown in messages" value={g.cooldown} min={0} max={1000} onCommit={(cooldown) => up({ cooldown })} /></label>
            <div className="cx-fld wide"><span>Where it goes</span>
              <div className="row-line wrap">
                <select className="pick-select" aria-label="Where it goes" value={p.position} onChange={(e) => up({ placement: { ...p, position: e.target.value as typeof p.position } })}>
                  {POSITIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
                {p.position === "atDepth" && <><NumberBox label="Messages back" value={p.depth} min={0} max={1000} onCommit={(depth) => up({ placement: { ...p, depth } })} /><span className="hint">back, as</span></>}
                {(p.position === "atDepth" || p.position === "agentPrompts") && (
                  <select className="pick-select" aria-label="As" value={p.role} onChange={(e) => up({ placement: { ...p, role: e.target.value as typeof p.role } })}>
                    <option value="system">System</option><option value="user">User</option><option value="assistant">AI</option>
                  </select>)}
                {p.position === "outlet" && <input aria-label="Outlet name" placeholder="outlet name" value={p.outletName} onChange={(e) => up({ placement: { ...p, outletName: e.target.value } })} />}
              </div></div>
            <label className="cx-fld wide"><span>Wrap <Help text="Text around what was picked; {{text}} is where it goes. Empty: just the text." /></span>
              <input aria-label="Wrap" placeholder="Empty: just the text. Example: [Direction: {{text}}]" value={g.wrap} onChange={(e) => up({ wrap: e.target.value })} /></label>
            <div className="row-line end"><ConfirmButton label="Delete This Part" confirmLabel="Delete it and its texts" onConfirm={onRemove} /></div>
          </div>
        )}

        {sv ? (
          <StageTable g={g} sv={sv} hits={result ? hits : null} onlyHits={onlyHits} all={all} open={open} rowProps={rowProps} onShowAll={() => setAll(true)}
            onToggle={(id, stage) => {
              const has = sv.of.get(id)!;
              const next = has.has(stage) ? [...has].filter((x) => x !== stage) : [...has, stage];
              if (!next.length) return;
              upItem(id, { when: sv.stages.filter((s) => next.includes(s)).map((s) => ({ path: sv.path, op: "equals" as const, value: s })), logic: "any" });
            }} />
        ) : <>
          {split && !onlyHits && <div className="cx-sub-h">Always <em>· in every reply · ~{tokensOf(always).toLocaleString()} tokens</em></div>}
          {split && <ul className="cx-texts">{visible(always).map((t) => <TextRow key={t.id} {...rowProps(t)} />)}</ul>}
          {split && !onlyHits && <div className="cx-sub-h">When their words or tests match <em>· {g.items.length - always.length}{g.items.some((t) => t.oneOf) ? " · only one per “one of” name" : ""}</em></div>}
          <ul className="cx-texts">{plain.cut.map((t) => <TextRow key={t.id} {...rowProps(t)} />)}</ul>
          {plain.more > 0 && <div className="cx-more-row"><span className="hint">{plain.more} more</span><button type="button" className="link" onClick={() => setAll(true)}>Show all</button></div>}
        </>}
        <div className="cx-part-foot">
          {all && g.items.length > SHOW + 2 && <button type="button" className="link quiet" onClick={() => setAll(false)}>Show fewer</button>}
          <span className="grow" />
          <button type="button" className="link" data-testid="cue-add-text" onClick={() => addText(sv ? { when: [{ path: sv.path, op: "equals", value: (sv.reading ? sv.stages[0] : sv.stages[1] ?? sv.stages[0])! }] } : undefined)}>+ Add a Text</button>
        </div>
      </div>
    </div>
  );
}

const titleOf = (t: CueText) => t.title || t.text.trim().split(/\s+/).slice(0, 8).join(" ") || "Empty text";

type RowProps = {
  t: CueText; short: (n: string) => string; pick: CueGroup["pick"]; open: boolean; hit: boolean | undefined; paths: Paths;
  onOpen: () => void; onChange: (patch: Partial<CueText>) => void; onRemove: () => void; onDuplicate: () => void;
  shares: string[]; oneOfNames: string[];
};

/** The tags under a text's title: its words, chance, from message, one of. */
function TextTags({ t, short, pick, skipWhen = false }: { t: CueText; short: (n: string) => string; pick: CueGroup["pick"]; skipWhen?: boolean }) {
  const kw = t.words?.keys.length ? keyWords(t.words.keys) : null;
  const tags: ReactNode[] = [];
  if (kw) tags.push(<span key="w" className="cx-tag words">{kw.words.slice(0, 4).map((w, i) => (i === 0 ? <b key={i}>{w}</b> : <span key={i}> · {w}</span>))}{kw.words.length > 4 && <i> +{kw.words.length - 4}</i>}{kw.patterns > 0 && <i>{kw.patterns === 1 && t.words!.keys.length === 1 ? " · one pattern" : ""}</i>}</span>);
  if (kw && t.words!.last !== 4) tags.push(<span key="l" className="cx-tag">last {t.words!.last}</span>);
  if (!skipWhen && t.when.length) tags.push(<span key="c" className="cx-tag">when {testsText(t.when, t.logic)}</span>);
  if (t.chance < 100) tags.push(<span key="p" className="cx-tag">{t.chance}%</span>);
  if (t.minMessages) tags.push(<span key="m" className="cx-tag">from message {t.minMessages}</span>);
  if (pick === "random" && t.weight !== 100) tags.push(<span key="g" className="cx-tag">weight {t.weight}</span>);
  if (t.oneOf) tags.push(<span key="o" className="cx-tag one">one of: {short(t.oneOf)}</span>);
  if (!t.enabled) tags.push(<span key="x" className="cx-tag off">off</span>);
  return tags.length ? <span className="cx-tags">{tags}</span> : null;
}

function TextRow(props: RowProps) {
  const { t, open, hit, onOpen } = props;
  return (
    <li className={`cx-tx${open ? " open" : ""}${hit ? " hit" : ""}${t.enabled ? "" : " off"}`} data-testid="cue-text">
      <button type="button" className="cx-tx-head" aria-expanded={open} onClick={onOpen}>
        <span className="cx-mark" aria-label={hit ? "Goes in" : undefined} />
        <span className="cx-tx-t">{titleOf(props.t)}</span>
        <span className="cx-tok">{t.text.trim() ? estimateTokens(t.text) : ""}</span>
        <TextTags t={t} short={props.short} pick={props.pick} />
      </button>
      {open && <TextEditor {...props} />}
    </li>
  );
}

function StageTable({ g, sv, hits, onlyHits, all, open, rowProps, onToggle, onShowAll }: {
  g: CueGroup; sv: NonNullable<ReturnType<typeof stageView>>; hits: Set<string> | null; onlyHits: boolean; all: boolean; open: string | null;
  rowProps: (t: CueText) => RowProps; onToggle: (id: string, stage: string) => void; onShowAll: () => void;
}) {
  // a value's starting stage (no scene yet) is left out while no text uses it
  const used = sv.stages.filter((s) => sv.reading || s !== sv.stages[0] || g.items.some((t) => sv.of.get(t.id)?.has(s)));
  const list = onlyHits && hits ? g.items.filter((t) => hits.has(t.id)) : g.items;
  const shown = !all && !onlyHits && list.length > SHOW + 2 ? list.slice(0, SHOW) : list;
  return <>
    <div className="cx-table-wrap">
      <table className="cx-table" data-testid="cue-stage-table">
        <thead>
          <tr><th aria-hidden /><th colSpan={used.length} className="cx-th-group"><span>{sv.reading ? `reading: ${sv.key}` : sv.key}
            <Help text={sv.reading
              ? `Each column is an answer the “${sv.key}” reading can give. A dot means the text can go in when that is the answer. Click a dot to switch it.`
              : `Each column is a stage the cue's “${sv.key}” value can be in (Remembers, below, says when it moves). A dot means the text can go in at that stage. Click a dot to switch it.`} /></span></th><th aria-hidden /></tr>
          <tr><th scope="col">Text</th>{used.map((s) => <th key={s} scope="col">{s}</th>)}<th scope="col" className="tk">tokens</th></tr>
        </thead>
        <tbody>
          {shown.map((t) => {
            const rp = rowProps(t);
            return [
              <tr key={t.id} className={`${hits?.has(t.id) ? "hit" : ""}${t.enabled ? "" : " off"}`} data-testid="cue-text">
                <td><button type="button" className="cx-tx-link" aria-expanded={open === t.id} onClick={rp.onOpen}>{titleOf(t)}</button>
                  <TextTags t={t} short={rp.short} pick={rp.pick} skipWhen /></td>
                {used.map((s) => {
                  const on = sv.of.get(t.id)!.has(s);
                  const last = on && sv.of.get(t.id)!.size === 1;
                  return <td key={s}><button type="button" className={`cx-dotc${on ? " on" : ""}`} aria-pressed={on} disabled={last}
                    aria-label={`${titleOf(t)} at ${s}`} title={last ? "A text needs at least one stage; delete it instead" : on ? `Not at ${s}` : `Also at ${s}`} onClick={() => onToggle(t.id, s)} /></td>;
                })}
                <td className="tk cx-tok">{t.text.trim() ? estimateTokens(t.text) : ""}</td>
              </tr>,
              open === t.id ? <tr key={`${t.id}-ed`} className="cx-table-ed"><td colSpan={used.length + 2}><TextEditor {...rp} /></td></tr> : null,
            ];
          })}
        </tbody>
      </table>
    </div>
    <div className="cx-more-row">
      <span className="hint">per stage: {used.map((s) => `${s} ${g.items.filter((t) => sv.of.get(t.id)?.has(s)).length}`).join(" · ")}</span>
      {list.length > shown.length && <><span className="hint">· {list.length - shown.length} more</span><button type="button" className="link" onClick={onShowAll}>Show all</button></>}
    </div>
  </>;
}

// ------------------------------------------------------------------ a text, opened

function TextEditor({ t, pick, paths, onChange, onRemove, onDuplicate, onOpen, shares, oneOfNames }: RowProps) {
  const w = t.words ?? { keys: [], also: [], not: [], last: 4, from: "both" as const, wholeWords: true, caseSensitive: false };
  const upW = (patch: Partial<typeof w>) => onChange({ words: { ...w, ...patch } });
  const [extra, setExtra] = useState<{ words: boolean; also: boolean; not: boolean; tests: boolean }>({ words: w.keys.length > 0, also: w.also.length > 0, not: w.not.length > 0, tests: t.when.length > 0 });
  const always = !w.keys.length && !t.when.length && !extra.tests && !extra.words;
  const wordsOn = extra.words || w.keys.length > 0;
  const listId = `oneof-${t.id}`;
  return (
    <div className="cx-open">
      <div className="cx-open-top">
        <input className="cx-open-title" aria-label="Text title" placeholder="Title (optional)" value={t.title} onChange={(e) => onChange({ title: e.target.value })} />
        <Switch label="Text on" checked={t.enabled} onChange={(enabled) => onChange({ enabled })} /><span className="hint">{t.enabled ? "On" : "Off"}</span>
        <Button small variant="plain" onClick={onDuplicate}>Duplicate</Button>
        <ConfirmButton label="Delete" confirmLabel="Delete this text" onConfirm={onRemove} />
        <Button small onClick={onOpen}>Close</Button>
      </div>
      <AutoText className="cx-prose" aria-label="Text" placeholder="What goes into the prompt. Macros work: {{char}}, {{user}}, {{value.name}}…" value={t.text} onChange={(e) => onChange({ text: e.target.value })} />
      <span className="cx-tok">{t.text.trim() ? `${estimateTokens(t.text)} tokens` : "empty"}</span>

      <div className="cx-when">
        <span className="cx-when-l">Goes in when</span>
        {always ? <div className="row-line wrap"><span>every time this part runs</span>
          <button type="button" className="link" onClick={() => setExtra({ ...extra, words: true })} data-testid="cue-add-words">+ only when a word shows up…</button>
          <button type="button" className="link" onClick={() => setExtra({ ...extra, tests: true })}>+ only when a test passes…</button>
        </div> : <>
          {wordsOn && <>
            <div className="row-line wrap"><span>any of these words shows up in the last</span>
              <NumberBox label="Messages the words are looked for in" value={w.last} min={1} max={100} onCommit={(last) => upW({ last })} /><span>messages</span></div>
            <ChipInput value={w.keys} label="Needs one of these words" placeholder="Type a word and press Enter, or paste a list" onChange={(keys) => upW({ keys })} wholeWords={w.wholeWords} onSplit={(wholeWords) => upW({ wholeWords })} />
          </>}
          {wordsOn && extra.also && <><span className="hint">and also one of these</span><ChipInput value={w.also} label="And one of these" placeholder="Words…" onChange={(also) => upW({ also })} /></>}
          {wordsOn && extra.not && <><span className="hint">but none of these</span><ChipInput value={w.not} label="But none of these" placeholder="Words…" onChange={(not) => upW({ not })} /></>}
          {(extra.tests || t.when.length > 0) && <Conditions list={t.when} logic={t.logic} paths={paths} onChange={(when, logic) => onChange({ when, logic })} />}
          <div className="row-line wrap cx-links">
            {!wordsOn && <button type="button" className="link" onClick={() => setExtra({ ...extra, words: true })}>+ words…</button>}
            {wordsOn && !extra.also && <button type="button" className="link" onClick={() => setExtra({ ...extra, also: true })}>+ and also one of…</button>}
            {wordsOn && !extra.not && <button type="button" className="link" onClick={() => setExtra({ ...extra, not: true })}>+ but none of…</button>}
            {!extra.tests && !t.when.length && <button type="button" className="link" onClick={() => setExtra({ ...extra, tests: true })}>+ a test (a value, a tracker…)</button>}
            {wordsOn && <label className="cue-check"><input type="checkbox" checked={w.wholeWords} onChange={(e) => upW({ wholeWords: e.target.checked })} /> Whole words</label>}
          </div>
        </>}
      </div>

      <div className="cx-line">
        <span className="cx-g">Chance <NumberBox label="Text chance" value={t.chance} min={0} max={100} onCommit={(chance) => onChange({ chance })} />%</span>
        <span className="cx-g">From message <NumberBox label="Only after this many messages" value={t.minMessages} min={0} max={10000} onCommit={(minMessages) => onChange({ minMessages })} /></span>
        {pick === "random" && <span className="cx-g">Weight <NumberBox label="Weight" value={t.weight} min={0} max={10000} onCommit={(weight) => onChange({ weight })} /></span>}
        <span className="cx-g">One of <input className="cue-val" list={listId} aria-label="Only one of the texts with this name" placeholder="a name" value={t.oneOf} onChange={(e) => onChange({ oneOf: e.target.value })} />
          <datalist id={listId}>{oneOfNames.map((n) => <option key={n} value={n} />)}</datalist>
          <Help text="Texts with the same name here: only one of them goes in (by weight), like a lorebook inclusion group." /></span>
        {shares.length > 0 && <span className="hint">with {shares.slice(0, 2).join(", ")}{shares.length > 2 ? ` and ${shares.length - 2} more` : ""}: only one goes in</span>}
      </div>
    </div>
  );
}

/** Words as chips: Enter or comma adds, a pasted list adds them all, × removes. A /pattern/ of plain words can be split. */
function ChipInput({ value, label, placeholder, onChange, wholeWords, onSplit, collapseAt = 40 }: {
  value: string[]; label: string; placeholder?: string; onChange: (v: string[]) => void;
  /** Splitting a pattern: the whole-word setting the split words need (only asked for when it differs). */
  wholeWords?: boolean; onSplit?: (wholeWords: boolean) => void; collapseAt?: number;
}) {
  const [draft, setDraft] = useState("");
  const [all, setAll] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const add = (text: string) => {
    const items = listOf(text);
    if (!items.length) return;
    onChange([...value, ...items.filter((w) => !value.includes(w))]);
    setDraft("");
  };
  const shown = all || value.length <= collapseAt ? value : value.slice(0, collapseAt);
  return (
    <div className="cx-chips" onClick={(e) => { if (e.target === e.currentTarget) input.current?.focus(); }}>
      {shown.map((w, i) => {
        const split = w.startsWith("/") ? splitRegexKey(w) : null;
        return (
          <span key={w + i} className={`cx-chip${w.startsWith("/") ? " re" : ""}`}>{w}
            {split && <button type="button" className="cx-chip-split" title="Turn this pattern into separate words you can edit"
              onClick={() => { const next = [...value]; next.splice(i, 1, ...split.words.filter((x) => !value.includes(x))); onChange(next); if (onSplit && wholeWords !== split.whole) onSplit(split.whole); }}>Split into words</button>}
            <button type="button" aria-label={`Remove ${w}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
          </span>
        );
      })}
      {shown.length < value.length && <button type="button" className="cx-chip more" onClick={() => setAll(true)}>+{value.length - shown.length} more</button>}
      <input ref={input} aria-label={label} placeholder={value.length ? "" : placeholder} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || (e.key === "," && !draft.trim().startsWith("/"))) { e.preventDefault(); add(draft); }
          else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onPaste={(e) => { const text = e.clipboardData.getData("text"); if (/[\n,]/.test(text)) { e.preventDefault(); add(draft + text); } }}
        onBlur={() => add(draft)} />
    </div>
  );
}

// ------------------------------------------------------------------ remembers: a value as a ladder, rules as sentences

function ValueCard({ v, paths, taken, now, onChange, onRemove }: { v: CueValue; paths: Paths; taken: Set<string>; now: unknown; onChange: (v: CueValue) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const up = (patch: Partial<CueValue>) => onChange({ ...v, ...patch });
  const stages = valueStages(v);
  const move = (i: number, by: number) => { const s = [...stages]; const [x] = s.splice(i, 1); s.splice(i + by, 0, x!); up({ stages: s }); };
  const moveRule = (i: number, by: number) => { const r = [...v.rules]; const [x] = r.splice(i, 1); r.splice(i + by, 0, x!); up({ rules: r }); setEditing(null); };
  return (
    <div className="cx-value" data-testid="cue-value">
      <div className="row-line wrap cx-value-h">
        <KeyBox value={v.key} taken={taken} label="Value name" onCommit={(key) => up({ key })} />
        <span className="hint">starts as</span>
        <input className="cue-val" aria-label="Starting value" value={String(v.initial)} onChange={(e) => up({ initial: scalar(e.target.value) })} />
        <span className="grow" />
        <label className="cue-check"><Switch label="Show in Scene" checked={v.showInScene} onChange={(showInScene) => up({ showInScene })} /> Show in Scene</label>
        <IconButton label="Remove this value" onClick={onRemove}><Icon name="close" size={13} /></IconButton>
      </div>
      {stages.length > 1 && (
        <div className="cx-ladder edit" aria-label="Stages, in order">
          {stages.map((s, i) => (
            <span key={s} className="cx-ladder-i">{i > 0 && <i aria-hidden>→</i>}
              <span className={`cx-stage${s === String(v.initial) ? " start" : ""}${now !== undefined && String(now) === s ? " now" : ""}`}>
                {i > 0 && <button type="button" aria-label={`Move ${s} left`} onClick={() => move(i, -1)}>‹</button>}{s}
                {i < stages.length - 1 && <button type="button" aria-label={`Move ${s} right`} onClick={() => move(i, 1)}>›</button>}</span></span>
          ))}
          <Help text="The order the stages show in, here and in a part's table. It doesn't change what the rules do." />
        </div>
      )}
      <ol className="cx-rules">
        {v.rules.map((r, i) => (
          editing === i ? (
            <li key={i} className="editing" data-testid="cue-rule">
              <span className="cx-n">{i + 1}</span>
              <div className="cx-rule-ed">
                <div className="row-line wrap">
                  <select className="pick-select" aria-label="What the rule does" value={r.do} onChange={(e) => up({ rules: v.rules.map((x, j) => (j === i ? { ...x, do: e.target.value as typeof r.do } : x)) })}>
                    <option value="set">set it to</option><option value="add">add</option><option value="reset">start over</option>
                  </select>
                  {r.do !== "reset" && <input className="cue-val" aria-label="Rule value" value={String(r.value)} onChange={(e) => up({ rules: v.rules.map((x, j) => (j === i ? { ...x, value: scalar(e.target.value) } : x)) })} />}
                  <span className="hint">when</span>
                </div>
                <Conditions list={r.when} logic={r.logic} paths={paths} label="When" onChange={(when, logic) => up({ rules: v.rules.map((x, j) => (j === i ? { ...x, when, logic } : x)) })} />
                <div className="row-line wrap">
                  {i > 0 && <Button small variant="plain" onClick={() => moveRule(i, -1)}>Move Up</Button>}
                  {i < v.rules.length - 1 && <Button small variant="plain" onClick={() => moveRule(i, 1)}>Move Down</Button>}
                  <span className="grow" />
                  <Button small variant="plain" onClick={() => { up({ rules: v.rules.filter((_, j) => j !== i) }); setEditing(null); }}>Delete Rule</Button>
                  <Button small onClick={() => setEditing(null)}>Done</Button>
                </div>
              </div>
            </li>
          ) : (
            <li key={i} data-testid="cue-rule">
              <span className="cx-n">{i + 1}</span>
              <button type="button" className="cx-rule" onClick={() => setEditing(i)} aria-label={`Edit rule ${i + 1}`}>
                <span className="cx-rule-set">{r.do === "set" ? <>→ <span className="cx-pill mem">{String(r.value) || "(empty)"}</span></> : r.do === "add" ? <>+ <span className="cx-pill mem">{String(r.value)}</span></> : <>→ start over</>}</span>
                <span className="cx-rule-when">{r.when.length ? <>when {r.when.map((c, j) => <span key={j}>{j > 0 && (r.logic === "any" ? " or " : " and ")}<CondWords c={c} /></span>)}</> : "always"}</span>
              </button>
            </li>
          )
        ))}
        <li className="else">
          <span className="cx-n" />
          <span className="cx-rule-set">→ {v.otherwise === "reset" ? <span className="cx-pill">{String(v.initial) || "(empty)"}</span> : "stays as it was"}</span>
          <span className="cx-rule-when">{v.rules.length ? "otherwise" : "on every reply"} · <button type="button" className="link quiet" onClick={() => up({ otherwise: v.otherwise === "reset" ? "keep" : "reset" })}>{v.otherwise === "reset" ? "keep it instead" : "start over instead"}</button></span>
        </li>
      </ol>
      <div className="row-line wrap"><button type="button" className="link" data-testid="cue-add-rule" onClick={() => { up({ rules: [...v.rules, { when: [], logic: "all", do: "set", value: "" }] }); setEditing(v.rules.length); }}>+ Add a Rule</button>
        <span className="hint">· the first rule that matches wins</span></div>
    </div>
  );
}

function CondWords({ c }: { c: CueCondition }) {
  const m = /^(signal|value)\.(.+)$/.exec(c.path);
  const name = m ? m[2]! : c.path;
  const op = OPS.find((o) => o.value === c.op)?.label ?? c.op;
  return <><span className={`cx-pill ${m?.[1] === "signal" ? "read" : m?.[1] === "value" ? "mem" : ""}`}>{name}</span> {op}{c.op !== "exists" && c.op !== "missing" ? ` ${c.value}` : ""}</>;
}

// ------------------------------------------------------------------ reads

function SignalRow({ s, all, taken, live, onChange, onRemove }: {
  s: CueSignal; all: CueSignal[]; taken: Set<string>; live?: { value: unknown; detail?: string }; onChange: (s: CueSignal) => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const up = (patch: Record<string, unknown>) => onChange({ ...s, ...patch } as CueSignal);
  const kind = SIGNAL_KINDS.find((k) => k.kind === s.kind)!;
  const preview = s.kind === "words" && !sameWordsAs(s, all) ? keyWords(s.words).words : [];
  return (
    <div className={`cx-rd${open ? " open" : ""}`} data-testid="cue-signal">
      <div className="cx-rd-h">
        <KeyBox value={s.key} taken={taken} label="Signal name" onCommit={(key) => up({ key })} />
        <span className="cx-rd-what"><b>{kind.label}</b> · {readingText(s, all)}{live ? <> · <span className="cx-live">= {String(live.value)}</span>{live.detail ? ` (${live.detail})` : ""}</> : null}</span>
        <Button small variant="plain" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Done" : "Edit"}</Button>
        <IconButton label="Remove this reading" onClick={onRemove}><Icon name="close" size={13} /></IconButton>
      </div>
      {!open && preview.length > 0 && (
        <span className="cx-words">{preview.slice(0, 14).map((w, i) => <span key={i} className="cx-word">{w}</span>)}{preview.length > 14 && <span className="cx-word more">+{preview.length - 14}</span>}</span>
      )}
      {open && <div className="cx-rd-body">
        {s.kind === "words" && <>
          <ChipInput value={s.words} label="Words or phrases" placeholder="Type a word and press Enter, or paste a list (/patterns/ work)" onChange={(words) => up({ words })} wholeWords={s.wholeWords} onSplit={(wholeWords) => up({ wholeWords })} />
          <div className="row-line wrap">
            <select className="pick-select" aria-label="What it counts" value={s.measure} onChange={(e) => up({ measure: e.target.value })}>
              <option value="matches">Counts how many times they show up</option>
              <option value="streak">Counts messages in a row that have them</option>
            </select>
            {s.measure === "streak" && <><span>with at least</span><NumberBox label="Matches a message needs" value={s.perMessage} min={1} max={100} onCommit={(perMessage) => up({ perMessage })} /></>}
            <span>in the last</span><NumberBox label="Messages read" value={s.last} min={1} max={100} onCommit={(last) => up({ last })} /><span>messages, from</span>
            <select className="pick-select" aria-label="Whose messages" value={s.from} onChange={(e) => up({ from: e.target.value })}>
              <option value="both">both</option><option value="user">you</option><option value="ai">the AI</option>
            </select>
          </div>
          <div className="row-line wrap">
            <label className="cue-check"><input type="checkbox" checked={s.wholeWords} onChange={(e) => up({ wholeWords: e.target.checked })} /> Whole words</label>
            <label className="cue-check"><input type="checkbox" checked={s.ignoreNegated} onChange={(e) => up({ ignoreNegated: e.target.checked })} /> Skip after “not / never / no”</label>
            <label className="cue-check"><input type="checkbox" checked={s.caseSensitive} onChange={(e) => up({ caseSensitive: e.target.checked })} /> Match case</label>
            <Help text="Counting words is fast but can be fooled (a fight can look like a kiss). Try It shows which words matched. A tracker field can replace a word reading without changing the rest." />
          </div>
        </>}
        {s.kind === "messages" && (
          <div className="row-line wrap"><span>Count</span>
            <select className="pick-select" aria-label="Which messages" value={s.count} onChange={(e) => up({ count: e.target.value })}>
              <option value="both">all messages on this branch</option><option value="user">your messages</option><option value="ai">the AI's messages</option>
            </select></div>
        )}
        {s.kind === "chance" && <div className="row-line wrap"><span>Yes, with a chance of</span><NumberBox label="Chance in percent" value={s.percent} min={0} max={100} onCommit={(percent) => up({ percent })} /><span>%</span></div>}
        {s.kind === "clock" && (
          <div className="row-line wrap"><span>Read</span>
            <select className="pick-select" aria-label="What the clock gives" value={s.read} onChange={(e) => up({ read: e.target.value })}>
              <option value="period">the part of the day (morning, afternoon, evening, night)</option><option value="hour">the hour (0–23)</option>
            </select></div>
        )}
        {s.kind === "tracker" && <div className="row-line wrap"><span>Field</span><input aria-label="Tracker field" placeholder="world.location, or another cue: cue-name.value" value={s.path} onChange={(e) => up({ path: e.target.value })} /></div>}
        <div className="row-line wrap"><span className="hint">Kind</span>
          <select className="pick-select" aria-label="Kind of reading" value={s.kind} onChange={(e) => onChange(CueSignalSchema.parse({ key: s.key, kind: e.target.value, ...(e.target.value === "tracker" ? { path: "world.location" } : {}) }))}>
            {SIGNAL_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label} — {k.sub}</option>)}
          </select></div>
      </div>}
    </div>
  );
}

// ------------------------------------------------------------------ small parts

function freeKey(base: string, taken: Set<string>): string {
  const b = base.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "") || "value";
  let k = b;
  for (let i = 2; taken.has(k); i++) k = `${b}${i}`;
  return k;
}

const keyOk = (k: string) => /^[a-z][a-z0-9_]*$/.test(k);

function KeyBox({ value, taken, label, onCommit }: { value: string; taken: Set<string>; label: string; onCommit: (k: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const bad = !keyOk(text) || taken.has(text);
  return <input className={`cue-key cx-key${bad ? " bad" : ""}`} aria-label={label} value={text} title={bad ? "Lower-case letters, digits and _, starting with a letter; not used twice" : "Its name, used in rules and macros"}
    onChange={(e) => setText(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
    onBlur={() => { if (!bad && text !== value) onCommit(text); else setText(value); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

/** A list typed one item per line (commas also split, except inside /regex/). */
const listOf = (text: string) => text.split(/\n/).flatMap((line) => (/^\s*\//.test(line) ? [line.trim()] : line.split(","))).map((x) => x.trim()).filter(Boolean);

function Conditions({ list, logic, paths, onChange, label = "Tests" }: {
  list: CueCondition[]; logic: "all" | "any"; paths: Paths; label?: string;
  onChange: (list: CueCondition[], logic: "all" | "any") => void;
}) {
  const known = new Set(paths.map((p) => p.value));
  return (
    <div className="cue-conds cx-conds" aria-label={label}>
      {list.map((c, i) => {
        const custom = !known.has(c.path);
        const up = (patch: Partial<CueCondition>) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)), logic);
        return (
          <div key={i} className="row-line wrap cue-cond" data-testid="cue-condition">
            {i > 0 && <button type="button" className="fchip" onClick={() => onChange(list, logic === "all" ? "any" : "all")} title="Switch between: all tests must pass / any one is enough">{logic === "all" ? "and" : "or"}</button>}
            <select className="pick-select" aria-label="What it tests" value={custom ? "__other" : c.path} onChange={(e) => up({ path: e.target.value === "__other" ? "" : e.target.value })}>
              {paths.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              <option value="__other">a tracker field…</option>
            </select>
            {custom && <input aria-label="Tracker field" placeholder="world.location" value={c.path} onChange={(e) => up({ path: e.target.value })} />}
            <select className="pick-select" aria-label="How it compares" value={c.op} onChange={(e) => up({ op: e.target.value as CueCondition["op"] })}>
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {c.op !== "exists" && c.op !== "missing" && <input className="cue-val" aria-label="Value" value={c.value} onChange={(e) => up({ value: e.target.value })} />}
            <IconButton label="Remove this test" onClick={() => onChange(list.filter((_, j) => j !== i), logic)}><Icon name="close" size={12} /></IconButton>
          </div>
        );
      })}
      <button type="button" className="link cx-add-test" onClick={() => onChange([...list, { path: paths[0]?.value ?? "", op: "equals", value: "" }], logic)}>+ {list.length ? (logic === "any" ? "or…" : "and…") : "Add a test"}</button>
    </div>
  );
}

const OPS: Array<{ value: CueCondition["op"]; label: string }> = [
  { value: "equals", label: "is" }, { value: "notEquals", label: "is not" }, { value: "atLeast", label: "≥" }, { value: "atMost", label: "≤" },
  { value: "greater", label: ">" }, { value: "less", label: "<" }, { value: "contains", label: "has" }, { value: "notContains", label: "lacks" },
  { value: "exists", label: "is set" }, { value: "missing", label: "is empty" },
];

const scalar = (text: string): string | number => (text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text);

function NumberBox({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text.trim());
    if (text.trim() !== "" && Number.isSafeInteger(n) && n >= min && n <= max) { if (n !== value) onCommit(n); }
    else setText(String(value));
  };
  return <input type="number" className="num cx-num" aria-label={label} min={min} max={max} value={text} onChange={(e) => setText(e.target.value)}
    onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setText(String(value)); }} />;
}

export function JanitorImportChoice({ files, onPick, onClose }: { files: string[]; onPick: (as: "lorebook" | "cue", splitRegex: boolean) => void; onClose: () => void }) {
  const [split, setSplit] = useState(true);
  return (
    <Modal title="A JanitorAI Lorebook Script" onClose={onClose} testId="janitor-import-choice">
      <p className="hint">{files.join(", ")}: import it as…</p>
      <div className="ae-tiles">
        <button type="button" className="ae-tile" data-testid="janitor-as-lorebook" onClick={() => onPick("lorebook", split)}><b>Lorebook</b><span>Facts about the world, brought up by keywords.</span></button>
        <button type="button" className="ae-tile" data-testid="janitor-as-cue" onClick={() => onPick("cue", split)}><b>Cue</b><span>Writing rules: one cue whose texts have the same triggers. Off until you switch it on.</span></button>
      </div>
      <label className="cue-check"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> Split regex keywords into separate words (/kiss|hug/i → kiss, hug) so you can edit them</label>
    </Modal>
  );
}
