// Homunculus 2 — Library → Cues: the list, the editor and Try It (D-113, claude/CUES-PLAN.md §7). Author: CLAUDE, 2026-11-10.
// A cue reacts to the chat without calling the AI. The editor is one page of sections, like the agent editor:
// About · Where It Runs · Reads · Remembers · Writes. Every section can stay empty, so a simple rule is just a text;
// the examples go from simple (Random Event) to complete (Opens Up Slowly, Boundary). It saves by itself.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Cue, CueSignal as CueSignalSchema, type Character, type CueCondition, type CueGroup, type CueInput, type CueReport, type CueSignal, type CueText, type CueValue, type Message, type Session, type SetupLayer, type Story } from "@homunculus/schemas";
import { estimateTokens, isBundleText, type CueOutput } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import { CUE_EXAMPLES, copyCue, cueFromJanitorText, POSITIONS, PICKS, SIGNAL_KINDS, blankCue, cueFromExample, cueOnText, layerHasCue, layerWithCue, placeText, signalText, testsText } from "../cues.ts";
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
  const [trying, setTrying] = useState<CueInput | null>(null);
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
                    <span className="side-text"><strong>{c.name}</strong><span>{c.help || `${c.groups.reduce((n, g) => n + g.items.length, 0)} texts`} · on in {cueOnText(c, defaultSetup, stories, sessions, charName)}</span></span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="side-empty">No cue matches.</li>}
            </ul>
          </>}
          detail={selected ? (
            <CueEditor key={selected.id} cue={selected} svc={svc} characters={characters} stories={stories} sessions={sessions} defaultSetup={defaultSetup}
              onSetDefaultSetup={onSetDefaultSetup} onSaved={onChanged} onTry={setTrying} onExport={onExport}
              onDelete={async () => { await svc.store.cues.delete(selected.id); await onSetDefaultSetup(layerWithCue(defaultSetup, selected.id, false)); await onChanged(); onSelect(null); }} />
          ) : <EmptyDetail text="Select a cue to edit it." />}
        />
      )}
      {examples && (
        <Modal title="Start From an Example" onClose={() => setExamples(false)} testId="cue-examples">
          <ExampleCards onPick={(id) => { setExamples(false); const c = cueFromExample(id, taken); if (c) void add(c); }} />
        </Modal>
      )}
      {trying && <CueTryIt svc={svc} cue={trying} sessions={sessions} initialSessionId={activeSessionId} onClose={() => setTrying(null)} />}
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

// ------------------------------------------------------------------ the editor

function CueEditor({ cue, svc, characters, stories, sessions, defaultSetup, onSetDefaultSetup, onSaved, onTry, onExport, onDelete }: {
  cue: Cue; svc: AppServices; characters: Character[]; stories: Story[]; sessions: Session[]; defaultSetup: SetupLayer;
  onSetDefaultSetup: (patch: Partial<SetupLayer>) => Promise<void> | void;
  onSaved: () => Promise<void>; onTry: (c: CueInput) => void; onExport: (id: string, name: string) => void; onDelete: () => Promise<void>;
}) {
  const [d, setD] = useState<Cue>(cue);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState("");
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
  const everyChat = layerHasCue(defaultSetup, d.id);
  const keysTaken = (exceptKey?: string) => new Set([...d.signals.map((s) => s.key), ...d.values.map((v) => v.key)].filter((k) => k !== exceptKey));
  const paths = useMemo(() => [
    ...d.signals.map((s) => ({ value: `signal.${s.key}`, label: `${s.key} (reads)` })),
    ...d.values.map((v) => ({ value: `value.${v.key}`, label: `${v.key} (remembers)` })),
  ], [d.signals, d.values]);
  const usedIn = [
    stories.filter((s) => layerHasCue(s.setup, d.id)).length && `${stories.filter((s) => layerHasCue(s.setup, d.id)).length} stories`,
    sessions.filter((s) => s.setup.cues?.add.includes(d.id)).length && `${sessions.filter((s) => s.setup.cues?.add.includes(d.id)).length} chats`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="editor agent-editor ae cue-editor" aria-label="Cue editor" data-testid="cue-editor">
      <div className="session-bar">
        <input className="ae-icon" aria-label="Cue icon" maxLength={4} placeholder="⟡" value={d.icon ?? ""} onChange={(e) => set({ icon: e.target.value || undefined })} />
        <input className="ag-title" aria-label="Cue name" placeholder="Cue name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        <span className="spacer" />
        <span className={status === "error" ? "error-text" : "hint"} role="status" data-testid="cue-save-state">{status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "✓ Saved"}</span>
        <button type="button" className="btn btn-bordered btn-small" data-testid="cue-try" onClick={() => onTry(d)}>Try It</button>
        <button type="button" className="btn btn-bordered btn-small" data-testid="cue-export" title="Save this cue to a file, to keep or share"
          onClick={() => { void flush().then((ok) => { if (ok) onExport(d.id, d.name || "cue"); }); }}>Export</button>
      </div>
      <div className="editor-body ae-body">
        {error && <div className="error-bar inline" role="alert">{error}</div>}

        <Sec title="About">
          <div className="ae-two">
            <label className="ae-fld"><span>What it does</span><input aria-label="Cue description" placeholder="One line, shown in lists" value={d.help} onChange={(e) => set({ help: e.target.value })} /></label>
            <label className="ae-fld"><span>Author</span><input aria-label="Cue author" placeholder="Optional" value={d.author ?? ""} onChange={(e) => set({ author: e.target.value || undefined })} /></label>
          </div>
        </Sec>

        <Sec title="Where It Runs" help="A cue is off until you switch it on: in every chat, in a story's or a chat's Setup, or wherever a character is.">
          <div className="row-line wrap">
            <Switch label="On in every chat" checked={everyChat} onChange={(on) => void onSetDefaultSetup({ cues: layerWithCue(defaultSetup, d.id, on).cues })} />
            <span>On in every chat</span>
            <span className="hint">{usedIn ? `· also switched on in ${usedIn}` : "· or switch it on in a story's or a chat's Setup"}</span>
          </div>
          <div className="row-line wrap" data-testid="cue-characters">
            <span>With these characters</span>
            {d.characterIds.map((id) => (
              <span key={id} className="tag">{characters.find((c) => c.id === id)?.name ?? "(a deleted character)"} <button type="button" className="link quiet" aria-label="Untie this character" onClick={() => set({ characterIds: d.characterIds.filter((x) => x !== id) })}>×</button></span>
            ))}
            <select className="pick-select" aria-label="Tie to a character" value="" onChange={(e) => { if (e.target.value) set({ characterIds: [...d.characterIds, e.target.value] }); }}>
              <option value="">+ Character…</option>
              {characters.filter((c) => !d.characterIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Help text="The cue switches on by itself in chats where one of these characters is. A chat can still switch it off in its Setup." />
          </div>
          <div className="row-line wrap">
            <span>Runs on</span>
            {GEN.map((g) => {
              const on = !d.when.generationTypes.length || d.when.generationTypes.includes(g.value);
              return <button key={g.value} type="button" className={`fchip${on ? " on" : ""}`} aria-pressed={on}
                onClick={() => {
                  const all = GEN.map((x) => x.value);
                  const cur = d.when.generationTypes.length ? d.when.generationTypes : all;
                  const next = on ? cur.filter((x) => x !== g.value) : [...cur, g.value];
                  set({ when: { ...d.when, generationTypes: next.length === all.length ? [] : next } });
                }}>{g.label}</button>;
            })}
            <span>· from message</span>
            <NumberBox label="Starts after this many messages" value={d.when.minMessages} min={0} max={10000} onCommit={(n) => set({ when: { ...d.when, minMessages: n } })} />
          </div>
          <div className="row-line wrap">
            <span>On a new version (swipe)</span>
            <Segmented small label="Chance on a swipe" value={d.randomness} onChange={(v) => set({ randomness: v })}
              options={[{ value: "stable", label: "Same Roll" }, { value: "perSwipe", label: "Roll Again" }]} />
            <Help text="Same Roll: a swipe gets the same texts, only the AI's writing changes. Counters never add twice either way." />
          </div>
        </Sec>

        <Sec title="Reads" help="Worked out on every reply, never stored. Use their names in tests and texts: {{signal.name}}.">
          {d.signals.map((s, i) => (
            <SignalCard key={i} s={s} taken={keysTaken(s.key)}
              onChange={(next) => set({ signals: d.signals.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => set({ signals: d.signals.filter((_, j) => j !== i) })} />
          ))}
          {!d.signals.length && <p className="hint">Nothing yet. A cue can work without reading anything (texts with a chance, for example).</p>}
          <div className="row-line wrap">
            <select className="pick-select" aria-label="Add a signal" value="" data-testid="cue-add-signal" onChange={(e) => {
              const kind = e.target.value as CueSignal["kind"];
              if (!kind) return;
              const key = freeKey(kind === "words" ? "words" : kind, keysTaken());
              set({ signals: [...d.signals, CueSignalSchema.parse({ key, kind })] });
            }}>
              <option value="">+ Add a Signal…</option>
              {SIGNAL_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label} — {k.sub}</option>)}
            </select>
          </div>
        </Sec>

        <Sec title="Remembers" help="Values kept between turns, pinned to each message: a swipe never counts twice, a branch has its own. Use them as {{value.name}}.">
          {d.values.map((v, i) => (
            <ValueCard key={i} v={v} paths={paths} taken={keysTaken(v.key)}
              onChange={(next) => set({ values: d.values.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => set({ values: d.values.filter((_, j) => j !== i) })} />
          ))}
          {!d.values.length && <p className="hint">Nothing yet. Values let a cue follow a scene: a stage, a counter, “is it paused?”.</p>}
          <div className="row-line"><Button small data-testid="cue-add-value" onClick={() => set({ values: [...d.values, { key: freeKey("value", keysTaken()), label: "", initial: "", rules: [], otherwise: "keep", showInScene: false }] })}>+ Add a Value</Button></div>
        </Sec>

        <Sec title="Writes" help="Groups of texts. Each group picks its text(s) and says where they go in the prompt.">
          {d.groups.map((g, i) => (
            <GroupCard key={g.key + i} g={g} paths={paths}
              onChange={(next) => set({ groups: d.groups.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => set({ groups: d.groups.filter((_, j) => j !== i) })} />
          ))}
          <div className="row-line"><Button small data-testid="cue-add-group" onClick={() => set({ groups: [...d.groups, { key: freeKey("texts", new Set(d.groups.map((g) => g.key))), name: "Texts", pick: "all", noRepeat: 0, chance: 100, cooldown: 0, wrap: "", separator: "\n", placement: { position: "atDepth", depth: 1, role: "system", outletName: "" }, items: [{ ...emptyText() }] }] })}>+ Add a Group</Button></div>
        </Sec>

        <div className="row-line end">
          <span className="hint grow">Values live in the scene as <code>{d.namespace}</code>: macros read them as <code>{`{{state.${d.namespace}.name}}`}</code>.</span>
          <ConfirmButton label="Delete Cue" confirmLabel="Delete it" onConfirm={() => void onDelete()} />
        </div>
      </div>
    </div>
  );
}

const GEN = [{ value: "normal", label: "New Replies" }, { value: "swipe", label: "New Versions" }, { value: "continue", label: "Continue" }, { value: "impersonate", label: "Impersonate" }] as const;
const emptyText = (): CueText => ({ id: uid(), title: "", text: "", weight: 100, when: [], logic: "all", chance: 100, minMessages: 0, oneOf: "", enabled: true });

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
  return <input className={`cue-key${bad ? " bad" : ""}`} aria-label={label} value={text} title={bad ? "Lower-case letters, digits and _, starting with a letter; not used twice" : undefined}
    onChange={(e) => setText(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
    onBlur={() => { if (!bad && text !== value) onCommit(text); else setText(value); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

/** A list typed one item per line (commas also split, except inside /regex/). */
const listOf = (text: string) => text.split(/\n/).flatMap((line) => (/^\s*\//.test(line) ? [line.trim()] : line.split(","))).map((x) => x.trim()).filter(Boolean);

function ListBox({ value, label, placeholder, onCommit }: { value: string[]; label: string; placeholder?: string; onCommit: (v: string[]) => void }) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => setText(value.join("\n")), [value]);
  return <AutoText aria-label={label} placeholder={placeholder} value={text} maxShare={0.3} onChange={(e) => setText(e.target.value)}
    onBlur={() => { const next = listOf(text); if (JSON.stringify(next) !== JSON.stringify(value)) onCommit(next); }} />;
}

function SignalCard({ s, taken, onChange, onRemove }: { s: CueSignal; taken: Set<string>; onChange: (s: CueSignal) => void; onRemove: () => void }) {
  const kind = SIGNAL_KINDS.find((k) => k.kind === s.kind)!;
  const up = (patch: Record<string, unknown>) => onChange({ ...s, ...patch } as CueSignal);
  return (
    <div className="cue-card" data-testid="cue-signal">
      <div className="row-line wrap">
        <KeyBox value={s.key} taken={taken} label="Signal name" onCommit={(key) => up({ key })} />
        <span className="hint">=</span>
        <b className="cue-kind">{kind.label}</b>
        <span className="hint grow">{signalText(s)}</span>
        <IconButton label="Remove this signal" onClick={onRemove}><Icon name="close" size={13} /></IconButton>
      </div>
      {s.kind === "words" && <>
        <ListBox value={s.words} label="Words or phrases" placeholder="One per line: kiss, hand on her waist, /regex/i…" onCommit={(words) => up({ words })} />
        <div className="row-line wrap">
          <select className="pick-select" aria-label="What it counts" value={s.measure} onChange={(e) => up({ measure: e.target.value })}>
            <option value="matches">How many times they show up</option>
            <option value="streak">Messages in a row that have them</option>
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
          <Help text="Counting words is fast but can be fooled (a fight can look like a kiss). Try It shows which words matched. A tracker field can replace a word signal without changing the rest." />
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
    </div>
  );
}

function Conditions({ list, logic, paths, onChange, label = "Tests" }: {
  list: CueCondition[]; logic: "all" | "any"; paths: Array<{ value: string; label: string }>; label?: string;
  onChange: (list: CueCondition[], logic: "all" | "any") => void;
}) {
  const known = new Set(paths.map((p) => p.value));
  return (
    <div className="cue-conds" aria-label={label}>
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
      <button type="button" className="link" onClick={() => onChange([...list, { path: paths[0]?.value ?? "", op: "equals", value: "" }], logic)}>+ {list.length ? "Another test" : "Add a test"}</button>
    </div>
  );
}

const OPS: Array<{ value: CueCondition["op"]; label: string }> = [
  { value: "equals", label: "is" }, { value: "notEquals", label: "is not" }, { value: "atLeast", label: "≥" }, { value: "atMost", label: "≤" },
  { value: "greater", label: ">" }, { value: "less", label: "<" }, { value: "contains", label: "has" }, { value: "notContains", label: "lacks" },
  { value: "exists", label: "is set" }, { value: "missing", label: "is empty" },
];

const scalar = (text: string): string | number => (text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text);

function ValueCard({ v, paths, taken, onChange, onRemove }: { v: CueValue; paths: Array<{ value: string; label: string }>; taken: Set<string>; onChange: (v: CueValue) => void; onRemove: () => void }) {
  const up = (patch: Partial<CueValue>) => onChange({ ...v, ...patch });
  return (
    <div className="cue-card" data-testid="cue-value">
      <div className="row-line wrap">
        <KeyBox value={v.key} taken={taken} label="Value name" onCommit={(key) => up({ key })} />
        <span>starts as</span>
        <input className="cue-val" aria-label="Starting value" value={String(v.initial)} onChange={(e) => up({ initial: scalar(e.target.value) })} />
        <span className="grow" />
        <label className="cue-check"><Switch label="Show in Scene" checked={v.showInScene} onChange={(showInScene) => up({ showInScene })} /> Show in Scene</label>
        <IconButton label="Remove this value" onClick={onRemove}><Icon name="close" size={13} /></IconButton>
      </div>
      {v.rules.map((r, i) => (
        <div key={i} className="cue-rule" data-testid="cue-rule">
          <span className="cue-rule-n">{i === 0 ? "When" : "Else when"}</span>
          <Conditions list={r.when} logic={r.logic} paths={paths} label="When" onChange={(when, logic) => up({ rules: v.rules.map((x, j) => (j === i ? { ...x, when, logic } : x)) })} />
          <div className="row-line wrap">
            <span>→</span>
            <select className="pick-select" aria-label="What the rule does" value={r.do} onChange={(e) => up({ rules: v.rules.map((x, j) => (j === i ? { ...x, do: e.target.value as typeof r.do } : x)) })}>
              <option value="set">set it to</option><option value="add">add</option><option value="reset">reset it</option>
            </select>
            {r.do !== "reset" && <input className="cue-val" aria-label="Rule value" value={String(r.value)} onChange={(e) => up({ rules: v.rules.map((x, j) => (j === i ? { ...x, value: scalar(e.target.value) } : x)) })} />}
            <span className="grow" />
            <IconButton label="Remove this rule" onClick={() => up({ rules: v.rules.filter((_, j) => j !== i) })}><Icon name="close" size={12} /></IconButton>
          </div>
        </div>
      ))}
      <div className="row-line wrap">
        <button type="button" className="link" data-testid="cue-add-rule" onClick={() => up({ rules: [...v.rules, { when: [], logic: "all", do: "set", value: "" }] })}>+ Add a rule</button>
        <span className="grow" />
        <span>When no rule matches:</span>
        <Segmented small label="When no rule matches" value={v.otherwise} onChange={(otherwise) => up({ otherwise })}
          options={[{ value: "keep", label: "Keep It" }, { value: "reset", label: "Start Over" }]} />
      </div>
    </div>
  );
}

function GroupCard({ g, paths, onChange, onRemove }: { g: CueGroup; paths: Array<{ value: string; label: string }>; onChange: (g: CueGroup) => void; onRemove: () => void }) {
  const [open, setOpen] = useState<string | null>(g.items.length === 1 && !g.items[0]!.text ? g.items[0]!.id : null);
  const up = (patch: Partial<CueGroup>) => onChange({ ...g, ...patch });
  const p = g.placement;
  const tokens = g.items.reduce((n, t) => n + (t.text.trim() ? estimateTokens(t.text) : 0), 0);
  return (
    <div className="cue-card cue-group" data-testid="cue-group">
      <div className="row-line wrap">
        <input className="te-group-name" aria-label="Group name" value={g.name} placeholder="Texts" onChange={(e) => up({ name: e.target.value })} />
        <select className="pick-select" aria-label="How it picks" value={g.pick} onChange={(e) => up({ pick: e.target.value as CueGroup["pick"] })}>
          {PICKS.map((x) => <option key={x.value} value={x.value}>{x.label} — {x.sub}</option>)}
        </select>
        <IconButton label="Remove this group" onClick={onRemove}><Icon name="close" size={13} /></IconButton>
      </div>
      <div className="row-line wrap">
        {(g.pick === "random" || g.pick === "rotate") && <><span>Don't repeat the last</span><NumberBox label="Don't repeat the last N" value={g.noRepeat} min={0} max={100} onCommit={(noRepeat) => up({ noRepeat })} /></>}
        <span>Chance</span><NumberBox label="Group chance" value={g.chance} min={0} max={100} onCommit={(chance) => up({ chance })} /><span>%</span>
        <span>· then wait</span><NumberBox label="Cooldown in messages" value={g.cooldown} min={0} max={1000} onCommit={(cooldown) => up({ cooldown })} /><span>messages</span>
      </div>
      <label className="ae-fld"><span>Wrap <Help text="Around what was picked; {{text}} is where it goes. Empty = just the text." /></span>
        <input aria-label="Wrap" placeholder="[Direction: {{text}}]" value={g.wrap} onChange={(e) => up({ wrap: e.target.value })} /></label>
      <div className="row-line wrap" data-testid="cue-place">
        <span>Where it goes</span>
        <select className="pick-select" aria-label="Where it goes" value={p.position} onChange={(e) => up({ placement: { ...p, position: e.target.value as typeof p.position } })}>
          {POSITIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
        {(p.position === "atDepth" || p.position === "agentPrompts") && <>
          {p.position === "atDepth" && <><NumberBox label="Messages back" value={p.depth} min={0} max={1000} onCommit={(depth) => up({ placement: { ...p, depth } })} /><span>back, as</span></>}
          <select className="pick-select" aria-label="As" value={p.role} onChange={(e) => up({ placement: { ...p, role: e.target.value as typeof p.role } })}>
            <option value="system">System</option><option value="user">User</option><option value="assistant">AI</option>
          </select>
        </>}
        {p.position === "outlet" && <input aria-label="Outlet name" placeholder="outlet name" value={p.outletName} onChange={(e) => up({ placement: { ...p, outletName: e.target.value } })} />}
        <span className="hint grow">{placeText(p)} · {g.items.length} texts · ~{tokens} tokens in all</span>
      </div>
      <ul className="cue-texts">
        {g.items.map((t, i) => {
          const isOpen = open === t.id;
          const upT = (patch: Partial<CueText>) => up({ items: g.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          const chips = [
            t.when.length ? `when ${testsText(t.when, t.logic)}` : "",
            t.words?.keys.length ? `words: ${t.words.keys.slice(0, 3).join(", ")}${t.words.keys.length > 3 ? "…" : ""}` : "",
            t.chance < 100 ? `${t.chance}%` : "", t.minMessages ? `after ${t.minMessages} messages` : "", t.oneOf ? `one of “${t.oneOf}”` : "",
            g.pick === "random" && t.weight !== 100 ? `weight ${t.weight}` : "",
          ].filter(Boolean);
          return (
            <li key={t.id} className={`cue-text${isOpen ? " open" : ""}${t.enabled ? "" : " off"}`} data-testid="cue-text">
              <button type="button" className="cue-text-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.id)}>
                <b>{t.title || t.text.trim().split(/\s+/).slice(0, 8).join(" ") || "Empty text"}</b>
                {chips.map((c) => <span key={c} className="agp-chip">{c}</span>)}
                <span className="hint">{t.text.trim() ? `${estimateTokens(t.text)} tokens` : ""}</span>
              </button>
              {isOpen && (
                <div className="cue-text-body">
                  <div className="row-line wrap">
                    <input aria-label="Text title" placeholder="Title (optional)" value={t.title} onChange={(e) => upT({ title: e.target.value })} />
                    <label className="cue-check"><Switch label="Text on" checked={t.enabled} onChange={(enabled) => upT({ enabled })} /> On</label>
                    <IconButton label="Remove this text" onClick={() => up({ items: g.items.filter((_, j) => j !== i) })}><Icon name="close" size={13} /></IconButton>
                  </div>
                  <AutoText aria-label="Text" placeholder="What goes into the prompt. Macros work: {{char}}, {{user}}, {{value.name}}…" value={t.text} onChange={(e) => upT({ text: e.target.value })} />
                  <Conditions list={t.when} logic={t.logic} paths={paths} onChange={(when, logic) => upT({ when, logic })} />
                  <div className="cue-words">
                    <span className="hint">Its own trigger (optional): words in the last messages</span>
                    <ListBox value={t.words?.keys ?? []} label="Needs one of these words" placeholder="Needs one of these words (one per line)" onCommit={(keys) => upT({ words: { ...wordsOf(t), keys } })} />
                    {(t.words?.keys.length ?? 0) > 0 && <>
                      <ListBox value={t.words?.also ?? []} label="And one of these" placeholder="…and one of these (optional)" onCommit={(also) => upT({ words: { ...wordsOf(t), also } })} />
                      <ListBox value={t.words?.not ?? []} label="But none of these" placeholder="…but none of these (optional)" onCommit={(not) => upT({ words: { ...wordsOf(t), not } })} />
                      <div className="row-line wrap"><span>in the last</span><NumberBox label="Messages the words are looked for in" value={t.words?.last ?? 4} min={1} max={100} onCommit={(last) => upT({ words: { ...wordsOf(t), last } })} /><span>messages</span>
                        <label className="cue-check"><input type="checkbox" checked={t.words?.wholeWords ?? true} onChange={(e) => upT({ words: { ...wordsOf(t), wholeWords: e.target.checked } })} /> Whole words</label></div>
                    </>}
                  </div>
                  <div className="row-line wrap">
                    <span>Chance</span><NumberBox label="Text chance" value={t.chance} min={0} max={100} onCommit={(chance) => upT({ chance })} /><span>%</span>
                    <span>· from message</span><NumberBox label="Only after this many messages" value={t.minMessages} min={0} max={10000} onCommit={(minMessages) => upT({ minMessages })} />
                    {g.pick === "random" && <><span>· weight</span><NumberBox label="Weight" value={t.weight} min={0} max={10000} onCommit={(weight) => upT({ weight })} /></>}
                    <span>· one of</span><input className="cue-val" aria-label="Only one of the texts with this name" placeholder="name" value={t.oneOf} onChange={(e) => upT({ oneOf: e.target.value })} />
                    <Help text="Texts with the same name here: only one of them goes in (by weight), like a lorebook inclusion group." />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="row-line"><button type="button" className="link" data-testid="cue-add-text" onClick={() => { const t = emptyText(); up({ items: [...g.items, t] }); setOpen(t.id); }}>+ Add a text</button></div>
    </div>
  );
}

const wordsOf = (t: CueText) => t.words ?? { keys: [], also: [], not: [], last: 4, from: "both" as const, wholeWords: true, caseSensitive: false };

function Sec({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="ae-sec" aria-label={title}>
      <h3 className="ae-sec-h">{title}{help && <Help text={help} />}</h3>
      {children}
    </section>
  );
}

function NumberBox({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text.trim());
    if (text.trim() !== "" && Number.isSafeInteger(n) && n >= min && n <= max) { if (n !== value) onCommit(n); }
    else setText(String(value));
  };
  return <input type="number" className="num" aria-label={label} min={min} max={max} value={text} onChange={(e) => setText(e.target.value)}
    onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setText(String(value)); }} />;
}

// ------------------------------------------------------------------ Try It

/** What the cue would read, remember and write on a chat's message, with nothing saved (D-113 §7.2, like D-053). */
export function CueTryIt({ svc, cue, sessions, initialSessionId, onClose }: { svc: AppServices; cue: CueInput; sessions: Session[]; initialSessionId: string | null; onClose: () => void }) {
  const [sessionId, setSessionId] = useState(initialSessionId && sessions.some((s) => s.id === initialSessionId) ? initialSessionId : sessions[0]?.id ?? "");
  const [path, setPath] = useState<Message[]>([]);
  const [messageId, setMessageId] = useState("");
  const [result, setResult] = useState<{ texts: CueOutput[]; report: CueReport; before: Record<string, unknown> | undefined } | null>(null);
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
    if (!sessionId || !messageId) { setResult(null); return; }
    let live = true;
    setError("");
    svc.chat.turns.tryCue(sessionId, messageId, cue).then((r) => { if (live) setResult(r); }).catch((e: unknown) => { if (live) { setResult(null); setError(errorText(e)); } });
    return () => { live = false; };
  }, [svc, sessionId, messageId, cue]);
  const r = result?.report;
  const show = (x: unknown) => (x === undefined || x === null || x === "" ? "—" : typeof x === "object" ? JSON.stringify(x) : String(x));
  return (
    <Modal title={`Try It · ${cue.name}`} onClose={onClose} testId="cue-try-it" className="modal-wide">
      <div className="cue-try">
        <div className="row-line wrap">
          <span>On</span>
          <select className="pick-select" aria-label="Chat" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <span>the reply after message</span>
          <select className="pick-select" aria-label="Message" value={messageId} onChange={(e) => setMessageId(e.target.value)}>
            {path.map((m, i) => <option key={m.id} value={m.id}>#{i + 1} · {m.content.slice(0, 50)}</option>)}
          </select>
          <span className="hint">Nothing is saved.</span>
        </div>
        {!sessions.length && <p className="hint">Make a chat first: Try It reads its messages.</p>}
        {error && <div className="error-bar inline" role="alert">{error}</div>}
        {r && (r.skipped ? <p className="hint" data-testid="cue-try-skipped">It would not run here: {r.skipped}.</p> : <>
          <h4>Reads</h4>
          {r.signals.length ? <ul className="cue-try-list">{r.signals.map((s) => <li key={s.key}><b>{s.key}</b> = {show(s.value)}{s.detail ? <span className="hint"> · {s.detail}</span> : null}</li>)}</ul> : <p className="hint">Nothing.</p>}
          <h4>Remembers</h4>
          {r.values.length ? <ul className="cue-try-list">{r.values.map((v) => <li key={v.key}><b>{v.key}</b>: {show(v.before)} → <b>{show(v.after)}</b> <span className="hint">· {v.why}</span></li>)}</ul> : <p className="hint">Nothing.</p>}
          <h4>Writes</h4>
          <ul className="cue-try-list" data-testid="cue-try-writes">
            {r.groups.map((g) => (
              <li key={g.key}><b>{g.name || g.key}</b>: {g.picked.length ? g.picked.map((x) => x.title).join(", ") : "nothing this turn"} <span className="hint">· {g.reason}{g.tokens ? ` · ${g.tokens} tokens` : ""}</span>
                {result!.texts.filter((t) => t.groupKey === g.key).map((t, i) => <pre key={i} className="cue-try-text">{t.text}<span className="hint"> — {placeText(t.placement)}</span></pre>)}
              </li>
            ))}
          </ul>
          <p className="hint">Total: {r.tokens} tokens this turn.</p>
        </>)}
      </div>
    </Modal>
  );
}

/** "Import as: Lorebook · Cue" — a JanitorAI lorebook script can be facts about the world or writing rules (D-113 §6.1). */
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
