// Homunculus 2 — create / edit a preset: its blocks (order, on/off, text, place), samplers, formats, history.
// Author: CLAUDE, 2026-10-28 (slice 2, D-021). Markers are filled by the app; text blocks take macros.
import { regexScriptsOf as regexOf } from "@homunculus/core";
import type { RegexScript } from "@homunculus/schemas";
import { RegexList } from "./RegexScripts.tsx";
import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { Preset, PromptMarker, type GenerationType, type HistoryEntry, type PresetBlock } from "@homunculus/schemas";
import { estimateTokens, MARKER_LABELS } from "@homunculus/core";
import { ConfirmButton, Help } from "./Help.tsx";
import { Button, Group, Row, Switch } from "./kit.tsx";
import { HistoryList, type HistoryField } from "./Versions.tsx";
import { move as moveItem, SortableList } from "./Sortable.tsx";
import { Modal } from "./Vault.tsx";

export const MACRO_HELP = "Text can use macros: {{char}}, {{user}}, {{description}}, {{personality}}, {{scenario}}, {{persona}}, {{model}}, {{lastMessage}}, {{random::a::b}}, {{pick::a::b}} (same choice on every swipe), {{roll:1d20}}, {{time}}, {{date}}, {{setvar::name::value}} / {{getvar::name}}, {{newline}}, {{trim}}, {{// a note}}, and {{state.tracker.field}} for a tracker's current value.";

const TRIGGER_OPTIONS: Array<{ value: GenerationType; label: string }> = [
  { value: "normal", label: "Normal" }, { value: "swipe", label: "New version" }, { value: "continue", label: "Continue" },
  { value: "impersonate", label: "Impersonate" }, { value: "quiet", label: "Quiet" },
];

const SAMPLER_FIELDS: Array<{ key: keyof Preset["params"]; label: string; help: string; min: number; max: number; whole?: boolean }> = [
  { key: "temperature", label: "Temperature", help: "How surprising the writing is.", min: 0, max: 2 },
  { key: "topP", label: "Top P", help: "Only the most likely share of words (0.95 = top 95%).", min: 0, max: 1 },
  { key: "maxTokens", label: "Max Length", help: "Longest reply, in tokens. Also the room kept for the reply in the context.", min: 1, max: 200000, whole: true },
  { key: "frequencyPenalty", label: "Frequency Penalty", help: "Above 0 = repeat words less.", min: -2, max: 2 },
  { key: "presencePenalty", label: "Presence Penalty", help: "Above 0 = bring up new things more.", min: -2, max: 2 },
  { key: "topK", label: "Top K", help: "Only the K most likely words. Not every service uses it.", min: 0, max: 1000, whole: true },
  { key: "minP", label: "Min P", help: "Leave out words much less likely than the best one. Not every service uses it.", min: 0, max: 1 },
  { key: "repetitionPenalty", label: "Repetition Penalty", help: "Above 1 = repeat less. Not every service uses it.", min: 0, max: 3 },
];

const HISTORY_FIELDS: HistoryField[] = [
  { key: "name", label: "name" }, { key: "blocks", label: "blocks" }, { key: "contextSize", label: "context size" },
  { key: "params", label: "samplers" }, { key: "formats", label: "formats" }, { key: "prompts", label: "texts" },
];

const markerName = (m: PromptMarker) => ({
  charDescription: "Char Description", charPersonality: "Char Personality", scenario: "Scenario", personaDescription: "Persona Description",
  dialogueExamples: "Chat Examples", chatHistory: "Chat History", worldInfoBefore: "World Info (before)", worldInfoAfter: "World Info (after)",
  scene: "Current Scene", agentPrompts: "Agent Prompts",
})[m];

export function PresetEditor({ preset, isNew, justSaved = false, isDefault, openBlock = null, onSave, onTrash, onDuplicate, onExport, onSetDefault, onClose, loadHistory, regexWaiting, onAllowRegex }: {
  preset: Preset;
  isNew: boolean;
  justSaved?: boolean;
  isDefault: boolean;
  /** A block to show opened (e.g. clicked in the Prompt tab). */
  openBlock?: string | null;
  onSave: (p: Preset) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  onDuplicate: (p: Preset) => void;
  onExport: (p: Preset) => void;
  onSetDefault: (id: string) => Promise<void>;
  onClose: () => void;
  loadHistory: (id: string) => Promise<HistoryEntry[]>;
  /** Regex scripts that wait for the user's OK, and allowing them (D-060). */
  regexWaiting?: (s: RegexScript) => boolean;
  onAllowRegex?: (s: RegexScript[]) => void;
}) {
  const [d, setD] = useState<Preset>(preset);
  const [saved, setSaved] = useState(justSaved);
  const [error, setError] = useState("");
  /** Blocks shown open (several at once, 10/29: "make the preset expandable"). */
  const [openIds, setOpenIds] = useState<string[]>(openBlock ? [openBlock] : []);
  const isOpen = (id: string) => openIds.includes(id);
  const toggle = (id: string) => setOpenIds((x) => (x.includes(id) ? x.filter((k) => k !== id) : [...x, id]));
  const setOpen = (id: string | null) => { if (id) setOpenIds((x) => (x.includes(id) ? x : [...x, id])); };
  /** The block whose text is edited in the big window. */
  const [bigText, setBigText] = useState<string | null>(null);
  useEffect(() => { if (openBlock) { setOpen(openBlock); requestAnimationFrame(() => document.querySelector(`[data-block="${CSS.escape(openBlock)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })); } }, [openBlock]);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const exists = !isNew || saved;
  const set = (patch: Partial<Preset>) => { setD((x) => ({ ...x, ...patch })); setSaved(false); };
  const setBlock = (id: string, patch: Partial<PresetBlock>) => set({ blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const reorder = (from: number, to: number) => setD((x) => { setSaved(false); return { ...x, blocks: moveItem(x.blocks, from, to) }; });
  const refreshHistory = () => { if (exists) void loadHistory(d.id).then(setHistory); };
  useEffect(() => { if (historyOpen) refreshHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [historyOpen]);

  const save = async (p: Preset = d) => {
    if (!p.name.trim()) { setError("The preset needs a name."); return; }
    setError("");
    try {
      const clean = Preset.parse({ ...p, name: p.name.trim() });
      await onSave(clean);
      setD(clean); setSaved(true);
      if (historyOpen) refreshHistory();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const run = async (f: () => Promise<void>) => { try { setError(""); await f(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };

  const addText = () => {
    const id = `block-${crypto.randomUUID().slice(0, 8)}`;
    set({ blocks: [...d.blocks, { id, name: "New block", enabled: true, role: "system", content: "", position: "list", depth: 4, order: 100, triggers: [], noOverride: false }] });
    setOpen(id);
  };
  const missingMarkers = PromptMarker.options.filter((m) => !d.blocks.some((b) => b.marker === m));
  const addMarker = (m: PromptMarker) => {
    const id = d.blocks.some((b) => b.id === m) ? `${m}-${crypto.randomUUID().slice(0, 4)}` : m;
    set({ blocks: [...d.blocks, { id, name: markerName(m), enabled: true, marker: m, role: "system", content: "", position: "list", depth: 4, order: 100, triggers: [], noOverride: false }] });
  };
  const setParam = (key: keyof Preset["params"], raw: string, f: (typeof SAMPLER_FIELDS)[number]) => {
    const params = { ...d.params };
    const n = Number(raw.replace(",", "."));
    if (!raw.trim() || !Number.isFinite(n)) delete params[key];
    else params[key] = Math.min(f.max, Math.max(f.min, f.whole ? Math.round(n) : n));
    set({ params });
  };

  const total = d.blocks.filter((b) => b.enabled && !b.marker).reduce((n, b) => n + estimateTokens(b.content), 0);

  return (
    <div className="editor" aria-label="Preset editor">
      {bigText && (() => {
        const b = d.blocks.find((x) => x.id === bigText);
        if (!b) return null;
        return (
          <Modal title={b.name || b.id} onClose={() => setBigText(null)} className="modal-wide modal-text" testId="block-big"
            head={<span className="hint tabular">~{estimateTokens(b.content)} tokens</span>}>
            <textarea className="big-text" aria-label="Block text (big)" autoFocus value={b.content} onChange={(e) => setBlock(b.id, { content: e.target.value })} />
            <p className="hint">Changes go into the block as you type. Save the preset when you are done. {MACRO_HELP}</p>
          </Modal>
        );
      })()}
      <div className="session-bar">
        <h2 className="editor-title">{isNew && !saved ? "New Preset" : d.name || "Preset"}</h2>
        <span className="spacer" />
        <button className="btn btn-bordered btn-small" onClick={onClose}>Close</button>
      </div>
      <div className="editor-body settings-body">
        <Group title="Preset" help="A preset is the recipe of the prompt: which blocks go to the AI, in which order, and the samplers it wants. Each session picks one (Prompt tab); the default is in Settings → Defaults.">
          <Row label="Name"><input aria-label="Preset name" value={d.name} onChange={(e) => set({ name: e.target.value })} /></Row>
          <Row label="Context Size" help="The most the prompt and the reply may take together, in tokens. When the chat gets longer, the oldest messages are left out (the Reply tab says how many). Empty = no limit. Use the model's context length or less.">
            <input aria-label="Context size" className="num wide-num" inputMode="numeric" placeholder="No limit" value={d.contextSize ?? ""}
              onChange={(e) => { const n = parseInt(e.target.value, 10); set({ contextSize: Number.isFinite(n) && n > 0 ? n : undefined }); }} />
          </Row>
          <Row label="Join System Messages" help="Sends system blocks that follow each other as ONE message. Some models follow a single system message better. (SillyTavern: 'Squash system messages'.)">
            <Switch label="Join system messages" checked={d.squashSystem} onChange={(v) => set({ squashSystem: v })} />
          </Row>
          {exists && (
            <Row label="Default Preset" help="Used by every session that doesn't pick its own.">
              <Switch label="Default preset" checked={isDefault} disabled={isDefault} onChange={(on) => { if (on) void run(() => onSetDefault(d.id)); }} />
            </Row>
          )}
        </Group>

        <Group title="Blocks" help={`Top to bottom = the order the AI reads them. Switch a block off to leave it out. Blocks marked "filled by the app" get their text from the card, your persona, the chat, the trackers… ${MACRO_HELP}`}
          aside={<><span className="hint">about {total.toLocaleString("en-US")} tokens of own text</span>
            <button type="button" className="link quiet" data-testid="blocks-open-all" onClick={() => setOpenIds(openIds.length ? [] : d.blocks.map((b) => b.id))}>
              {openIds.length ? "Fold All" : "Open All"}
            </button></>} testId="preset-blocks">
          <SortableList items={d.blocks} id={(b) => b.id} name={(b) => b.name || b.id} onReorder={reorder} label="Blocks of this preset"
            itemTestId="preset-block" render={(b, handle) => (
            <div className={`block-row${b.enabled ? "" : " off"}${isOpen(b.id) ? " open" : ""}`} data-block={b.id}>
              <div className="block-head">
                {handle}
                <Switch label={`${b.name || b.id} on`} checked={b.enabled} onChange={(v) => setBlock(b.id, { enabled: v })} />
                <button type="button" className="block-name" aria-expanded={isOpen(b.id)} onClick={() => toggle(b.id)}>{b.name || b.id}</button>
                <span className="block-tags">
                  {b.marker ? <span className="tag marker">filled by the app</span> : <span className="tag">{b.role}</span>}
                  {b.position === "depth" && <span className="tag">in the chat, {b.depth} from the end</span>}
                  {b.triggers.length > 0 && <span className="tag">only {b.triggers.join(", ")}</span>}
                  {!b.marker && <span className="hint tabular">{b.content.trim() ? `~${estimateTokens(b.content)}` : "empty"}</span>}
                </span>
              </div>
              {isOpen(b.id) && (
                <div className="block-body">
                  <label className="inline-label"><span>Name</span><input aria-label="Block name" value={b.name} onChange={(e) => setBlock(b.id, { name: e.target.value })} /></label>
                  {b.marker
                    ? <p className="hint">Filled by the app with {MARKER_LABELS[b.marker]}. Nothing is sent when that is empty.</p>
                    : <div className="inline-label grow">
                      <span className="label-row">Text <Help text={MACRO_HELP} />
                        <button type="button" className="link quiet block-big" onClick={() => setBigText(b.id)} title="Edit this text in a big window">Bigger ⤢</button></span>
                      <GrowingTextarea aria-label="Block text" value={b.content} onChange={(e) => setBlock(b.id, { content: e.target.value })} />
                    </div>}
                  <div className="block-options">
                    {!b.marker && (
                      <label className="inline-label"><span>Sent as</span>
                        <select aria-label="Block role" value={b.role} onChange={(e) => setBlock(b.id, { role: e.target.value as PresetBlock["role"] })}>
                          <option value="system">System</option><option value="user">User</option><option value="assistant">Assistant</option>
                        </select>
                      </label>
                    )}
                    {!b.marker && (
                      <label className="inline-label"><span className="label-row">Place <Help text="'In the list' = where it is in this list. 'Inside the chat' = between the messages, N messages before the end (0 = after the last one): good for reminders the AI must not forget." /></span>
                        <select aria-label="Block place" value={b.position} onChange={(e) => setBlock(b.id, { position: e.target.value as PresetBlock["position"] })}>
                          <option value="list">In the list</option><option value="depth">Inside the chat</option>
                        </select>
                      </label>
                    )}
                    {b.position === "depth" && !b.marker && <>
                      <label className="inline-label"><span>Messages from the end</span>
                        <input aria-label="Block depth" className="num" inputMode="numeric" value={b.depth} onChange={(e) => setBlock(b.id, { depth: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                      </label>
                      <label className="inline-label"><span className="label-row">Order <Help text="For blocks at the same place: higher comes first." /></span>
                        <input aria-label="Block order" className="num" inputMode="numeric" value={b.order} onChange={(e) => setBlock(b.id, { order: parseInt(e.target.value, 10) || 0 })} />
                      </label>
                    </>}
                  </div>
                  <div className="block-options">
                    <span className="label-row muted">Only when <Help text="Use this block only for these kinds of reply. None ticked = always." /></span>
                    {TRIGGER_OPTIONS.map((t) => (
                      <label key={t.value} className="check">
                        <input type="checkbox" checked={b.triggers.includes(t.value)}
                          onChange={(e) => setBlock(b.id, { triggers: e.target.checked ? [...b.triggers, t.value] : b.triggers.filter((x) => x !== t.value) })} /> {t.label}
                      </label>
                    ))}
                  </div>
                  {(b.id === "main" || b.id === "jailbreak") && (
                    <div className="block-options">
                      <Switch label="A card can replace this block" checked={!b.noOverride} onChange={(v) => setBlock(b.id, { noOverride: !v })} />
                      <span className="label-row">A card can replace this block <Help text={b.id === "main" ? "A card's own 'system prompt' replaces this block (use {{original}} in the card to keep this text too)." : "A card's own 'post-history instructions' replace this block."} /></span>
                    </div>
                  )}
                  <ConfirmButton label="Delete Block" confirmLabel="Click Again to Delete" className="btn btn-plain btn-small danger-text"
                    onConfirm={() => { set({ blocks: d.blocks.filter((x) => x.id !== b.id) }); setOpenIds((x) => x.filter((k) => k !== b.id)); }} />
                </div>
              )}
            </div>
          )} />
          <div className="block-add">
            <Button small onClick={addText}>+ New Block</Button>
            {missingMarkers.length > 0 && (
              <select aria-label="Add a block filled by the app" value="" onChange={(e) => { if (e.target.value) addMarker(e.target.value as PromptMarker); }}>
                <option value="">+ Add a block filled by the app…</option>
                {missingMarkers.map((m) => <option key={m} value={m}>{markerName(m)} — {MARKER_LABELS[m]}</option>)}
              </select>
            )}
          </div>
        </Group>

        <Group title="Samplers" help="Optional. A value set here wins over the connection's for the story (agents keep their connection's). Empty = the connection's value.">
          {SAMPLER_FIELDS.map((f) => (
            <Row key={f.key} label={f.label} help={f.help}>
              <input aria-label={`Preset ${f.label}`} className="num wide-num" inputMode="decimal" placeholder="Connection's" value={d.params[f.key] ?? ""}
                onChange={(e) => setParam(f.key, e.target.value, f)} />
            </Row>
          ))}
        </Group>

        <Group title={`Regex scripts${regexOf(d).length ? ` (${regexOf(d).length})` : ""}`} testId="preset-regex"
          help="Find and replace that runs by itself while this preset is used, after the global scripts (Library → Regex). Scripts that came in a file run only after you allow them.">
          <RegexList scripts={regexOf(d)} onChange={(next) => set({ regexScripts: next })} testId="preset-regex-list"
            waiting={regexWaiting} onAllow={onAllowRegex} emptyText="No scripts in this preset." />
        </Group>

        <details className="advanced">
          <summary>Formats and Texts <Help text="How the app wraps what it fills in, and short texts SillyTavern adds in some places. {{description}}, {{personality}}, {{scenario}}, {{persona}}, {{mesExamples}} and {{worldInfo}} (or {0}) are the values." /></summary>
          {(["description", "personality", "scenario", "persona", "examples", "worldInfo"] as const).map((k) => (
            <label key={k}><span>{({ description: "Description", personality: "Personality", scenario: "Scenario", persona: "Persona", examples: "Example dialogue", worldInfo: "Lorebook entries" })[k]} format</span>
              <input aria-label={`${k} format`} value={d.formats[k]} onChange={(e) => set({ formats: { ...d.formats, [k]: e.target.value } })} />
            </label>
          ))}
          <label><span className="label-row">Before the chat <Help text="Sent right before the conversation, e.g. '[Start a new Chat]'. Empty = nothing." /></span>
            <input aria-label="Before the chat" value={d.prompts.newChat} onChange={(e) => set({ prompts: { ...d.prompts, newChat: e.target.value } })} />
          </label>
          <label><span className="label-row">Example chat marker <Help text="Replaces <START> in the card's example dialogue, e.g. '[Example Chat]'. Empty = <START> stays." /></span>
            <input aria-label="Example chat marker" value={d.prompts.newExampleChat} onChange={(e) => set({ prompts: { ...d.prompts, newExampleChat: e.target.value } })} />
          </label>
          <label><span className="label-row">Reply starts with <Help text="The AI's reply will begin with this text (prefill). Some models don't allow it. Empty = nothing." /></span>
            <input aria-label="Reply starts with" value={d.prompts.prefill} onChange={(e) => set({ prompts: { ...d.prompts, prefill: e.target.value } })} />
          </label>
          <p className="hint">The "continue" and "impersonate" texts from SillyTavern are kept and will be used when those buttons arrive.</p>
        </details>

        {exists && (
          <details className="advanced" onToggle={(e) => setHistoryOpen((e.target as HTMLDetailsElement).open)}>
            <summary>History <Help text="Every save of this preset is kept. Open one to see what changed, and restore it." /></summary>
            {historyOpen && <HistoryList entries={history ?? []} loading={history === null} fields={HISTORY_FIELDS} onRestore={(x) => void save(Preset.parse({ ...(x as object), id: d.id }))} />}
          </details>
        )}

        {error && <div className="error-bar inline" role="alert">{error}</div>}
        <div className="editor-actions">
          <button className="btn btn-prominent" onClick={() => void save()}>{isNew && !saved ? "Create Preset" : "Save"}</button>
          {saved && <span className="ok-text">✓ Saved</span>}
          {exists && <Button onClick={() => onExport(d)}>Export for SillyTavern</Button>}
          {exists && <Button variant="plain" onClick={() => onDuplicate(d)}>Duplicate</Button>}
          <span className="spacer" />
          {exists && !isDefault && <Button variant="destructive" onClick={() => void run(() => onTrash(d.id))}>Move to Trash</Button>}
        </div>
      </div>
    </div>
  );
}

/** A text box that grows with its text (from 6 lines up to most of the window), so long blocks are easy to read. */
function GrowingTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.6))}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={6} {...props} className={`grow-text ${props.className ?? ""}`.trim()} />;
}
