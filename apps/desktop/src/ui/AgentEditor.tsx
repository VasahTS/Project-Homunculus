// Homunculus 2 — the agent editor (slice 5, D-047; approved draft "Homunculus Agents Draft"). Author: CLAUDE, 2026-10-30.
// Persistence fixes (D-051): serialized saves and recoverable drafts. CODEX, 2026-10-30.
// Same look as the tracker editor (cards that open in place). It saves by itself, like the lorebook editor (D-028).
import { ShowPicker } from "./ShowPicker.tsx";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AgentDraft } from "../agent-draft.ts";
import type { AgentConfig, AgentConfigInput, AgentOutputKind } from "@homunculus/schemas";
import { noteFeedback } from "@homunculus/core";
import { AGENT_KINDS, PHASES, phaseOf, triggersFor, whenOf, withKind, type AgentPhase } from "../agents.ts";
import { ConfirmButton, Help } from "./Help.tsx";
import { Switch } from "./kit.tsx";

const GEN_TYPES = [{ value: "normal", label: "New replies" }, { value: "swipe", label: "New versions" }, { value: "continue", label: "Continue" }] as const;

export function AgentEditor({ agent, agents = [], profiles = [], drafts, onTry, onSave, onDelete, onClose }: {
  agent: AgentConfig;
  /** All agents, to pick the ones whose results this one reads. */
  agents?: AgentConfig[];
  /** Saved connection profiles, to pick the one this agent uses (D-057). */
  profiles?: Array<{ id: string; name: string }>;
  drafts: Map<string, AgentDraft>;
  onTry: (draft: AgentDraft) => void;
  onSave: (a: AgentConfigInput) => Promise<AgentConfig>;
  onDelete: (id: string) => Promise<void>;
  onClose?: () => void;
}) {
  const [draft] = useState(() => {
    const pending = drafts.get(agent.id);
    const draft = pending ?? new AgentDraft(agent, onSave);
    drafts.set(agent.id, draft);
    return draft;
  });
  draft.save = onSave;
  const { value: d, status, error } = useSyncExternalStore(draft.subscribe, draft.snapshot, draft.snapshot);
  useEffect(() => () => { void draft.flush(); }, [draft]);
  const set = (patch: Partial<AgentConfig>) => draft.update({ ...draft.snapshot().value, ...patch } as AgentConfig);
  const when = whenOf(d);
  const runs: "every" | "everyN" | "manual" = when.when === "everyN" ? "everyN" : when.when === "manual" ? "manual" : "every";
  const phase = phaseOf(d);
  const out = d.output;
  const textMode = d.runMode === "text";
  // drafts made before D-059 may miss the new sources until saved
  const input: AgentConfig["input"] = Object.assign({ authorsNote: false, chapters: false, previousNotes: 0, minTokens: 0 }, d.input);
  const inp = (patch: Partial<AgentConfig["input"]>) => set({ input: { ...input, ...patch } });
  const disp = (patch: NonNullable<AgentConfig["display"]>) => set({ display: { ...d.display, ...patch } });
  const fb = noteFeedback(d);
  const setPhase = (p: AgentPhase) => {
    const allowed = PHASES.find((x) => x.id === p)!.kinds;
    const base = allowed.includes(out) ? draft.snapshot().value : (withKind(draft.snapshot().value, allowed[0]!) as AgentConfig);
    draft.update({ ...base, triggers: triggersFor(p, when.n) } as AgentConfig);
  };
  const setKind = (k: AgentOutputKind) => {
    if (k === out) return;
    const next = withKind(draft.snapshot().value, k) as AgentConfig;
    draft.update({ ...next, triggers: runs === "every" ? triggersFor(phase, when.n) : draft.snapshot().value.triggers } as AgentConfig);
  };
  const setRuns = (r: typeof runs) => set({ triggers: triggersFor(r === "every" ? phase : r, when.n) });
  const inlineOk = phase === "after" && (out === "note" || out === "choices" || out === "check");

  return (
    <div className="editor agent-editor ae" aria-label="Agent editor" data-testid="agent-editor">
      <div className="session-bar">
        <input className="ae-icon" aria-label="Agent icon" maxLength={4} placeholder="✦" value={d.icon ?? ""} onChange={(e) => set({ icon: e.target.value || undefined })} />
        <input className="ag-title" aria-label="Agent name" placeholder="Agent name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        <span className="spacer" />
        <span className={status === "error" ? "error-text" : "hint"} role="status" data-testid="agent-save-state">
          {status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "✓ Saved"}
        </span>
        <button type="button" className="btn btn-bordered btn-small" onClick={() => onTry(draft)}>Try It</button>
        {onClose && <button className="btn btn-bordered btn-small" onClick={() => { void draft.flush().then((saved) => { if (saved) onClose(); }); }}>Close</button>}
      </div>
      <div className="editor-body ae-body">
        {error && <div className="error-bar inline" role="alert">{error}</div>}

        <Sec title="Description">
          <div className="ae-two">
            <label className="ae-fld"><span>What it is for</span><input aria-label="Agent description" placeholder="One line, shown in lists and the ✦ panel" value={d.help} onChange={(e) => set({ help: e.target.value })} /></label>
            <label className="ae-fld"><span>Author</span><input aria-label="Agent author" placeholder="Optional" value={d.author ?? ""} onChange={(e) => set({ author: e.target.value || undefined })} /></label>
          </div>
        </Sec>

        <Sec title="Phase">
          <div className="ae-phases" role="radiogroup" aria-label="Phase">
            {PHASES.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={phase === p.id} disabled={runs !== "every" && p.id !== "after"}
                className={`ae-phase${phase === p.id ? " on" : ""}`} onClick={() => setPhase(p.id)}><b>{p.label}</b><span>{p.sub}</span></button>
            ))}
          </div>
          <div className="row-line wrap">
            <span>Runs</span>
            <select aria-label="When it runs" value={runs} onChange={(e) => setRuns(e.target.value as typeof runs)}>
              <option value="every">on every reply</option>
              {out !== "inject" && out !== "intercept" && <option value="everyN">every N messages</option>}
              {out !== "inject" && <option value="manual">only when I ask (✦ panel, ↻)</option>}
            </select>
            {runs === "everyN" && <><NumberBox label="Every how many messages" value={when.n} min={1} max={500} onCommit={(n) => set({ triggers: triggersFor("everyN", n) })} /><span className="hint">messages · after the reply</span></>}
            {runs === "manual" && <span className="hint">on the message you pick, after the reply</span>}
          </div>
        </Sec>

        <Sec title="What it does" help="Available outputs depend on the phase.">
          <div className="ae-tiles" role="radiogroup" aria-label="What it does">
            {AGENT_KINDS.map((k) => {
              const ok = runs !== "every" ? !["inject", "intercept"].includes(k.output) || k.output === out : PHASES.find((p) => p.id === phase)!.kinds.includes(k.output);
              return (
                <button key={k.output} type="button" role="radio" aria-checked={out === k.output} disabled={!ok} className={`ae-tile${out === k.output ? " on" : ""}`}
                  onClick={() => setKind(k.output)}><b><span className="kind-dot" style={{ background: k.color }} />{k.label}</b><span>{KIND_SUB[k.output]}</span></button>
              );
            })}
          </div>
        </Sec>

        <Sec title="How it runs">
          <div className="ae-tiles" role="radiogroup" aria-label="How it runs">
            <button type="button" role="radio" aria-checked={d.runMode === "separate"} className={`ae-tile${d.runMode === "separate" ? " on" : ""}`}
              onClick={() => set({ runMode: "separate", input: { ...input, messages: Math.max(4, input.messages) } })}><b>Its Own AI Call</b><span>Separate request, with an optional model override.</span></button>
            <button type="button" role="radio" aria-checked={d.runMode === "inline"} disabled={!inlineOk} className={`ae-tile${d.runMode === "inline" ? " on" : ""}`}
              onClick={() => set({ runMode: "inline" })}><b>Inside the Main Reply</b><span>Written by the story model in the same reply.</span></button>
            <button type="button" role="radio" aria-checked={textMode} disabled={out !== "inject"} className={`ae-tile${textMode ? " on" : ""}`}
              onClick={() => set({ runMode: "text", input: { ...input, messages: 0 } })}><b>No AI Call</b><span>Inserts text with expanded macros.</span></button>
          </div>
        </Sec>

        {d.runMode === "separate" && (
          <Sec title="Context sources" help="Each source adds to the request size.">
            <div className="ae-toggles">
              <div className="ae-tg on"><b>Chat history</b><p>Recent messages from this branch.</p>
                <div className="ae-extra"><NumberBox label="Messages it reads" value={input.messages} min={0} max={100} onCommit={(n) => inp({ messages: n })} /> messages · runs only from
                  <NumberBox label="Runs only from this many tokens" value={input.minTokens} min={0} max={1_000_000} onCommit={(n) => inp({ minTokens: n })} /> tokens</div></div>
              <Tg on={input.cards} onChange={(v) => inp({ cards: v })} title="The cast" text="Cards in the chat, the story's narrator and the NPC sheets." />
              <Tg on={input.persona} onChange={(v) => inp({ persona: v })} title="Your persona" text="Your identity in the story." />
              <Tg on={input.lorebooks} onChange={(v) => inp({ lorebooks: v })} title="Active lorebook entries" text="Last reply's active lore entries." />
              <Tg on={input.chapters} onChange={(v) => inp({ chapters: v })} title="Chapter summaries" text="Chapter summaries for this branch." />
              <Tg on={input.authorsNote} onChange={(v) => inp({ authorsNote: v })} title="Author's Note" />
              <Tg on={input.state !== false} onChange={(v) => inp({ state: v })} title="Scene values" text="What the trackers hold right now." />
              <Tg on={input.scenario} onChange={(v) => inp({ scenario: v })} title="Scenario" text="The chat's scenario, else the story's." />
              <Tg on={input.previousNotes > 0} onChange={(v) => inp({ previousNotes: v ? 3 : 0 })} title="Its previous notes" text="Notes from earlier runs."
                extra={input.previousNotes > 0 ? <>last <NumberBox label="How many previous notes" value={input.previousNotes} min={1} max={20} onCommit={(n) => inp({ previousNotes: n })} /></> : undefined} />
              <div className={`ae-tg${input.readsAgents.length ? " on" : ""}`}><b>Other agents' results</b><p>Runs the selected agents first.</p>
                <div className="ae-extra">
                  {input.readsAgents.map((id) => <span key={id} className="tag">{agents.find((x) => x.id === id)?.name ?? id} <button type="button" className="link quiet" aria-label="Stop reading it" onClick={() => inp({ readsAgents: input.readsAgents.filter((x) => x !== id) })}>×</button></span>)}
                  <select aria-label="Add an agent it reads" value="" onChange={(e) => { if (e.target.value) inp({ readsAgents: [...input.readsAgents, e.target.value] }); }}>
                    <option value="">+ Add…</option>
                    {agents.filter((x) => x.id !== d.id && !input.readsAgents.includes(x.id) && x.output !== "inject").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div></div>
            </div>
          </Sec>
        )}

        {d.runMode === "separate" && (
          <Sec title="Connection and budget">
            <div className="ae-two">
              <label className="ae-fld"><span>Connection <Help text="Uses the story's agents connection unless overridden." /></span>
                <select aria-label="Connection for this agent" value={d.connectionId ?? ""} onChange={(e) => set({ connectionId: e.target.value || undefined })}>
                  <option value="">The story's agents connection</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  {d.connectionId && !profiles.some((p) => p.id === d.connectionId) && <option value={d.connectionId}>(a deleted connection)</option>}
                </select></label>
              <label className="ae-fld"><span>Model override <small className="hint">(optional)</small></span>
                <input aria-label="Model override" placeholder="the connection's model" value={d.modelOverride ?? ""} onChange={(e) => set({ modelOverride: e.target.value || undefined })} /></label>
            </div>
            <div className="row-line wrap"><span>Longest answer</span>
              <NumberBox label="Longest answer in tokens" value={d.limits.maxTokens ?? 0} min={0} max={200000} onCommit={(n) => set({ limits: { ...d.limits, maxTokens: n || undefined } })} /><span className="hint">tokens (0 = no limit)</span></div>
          </Sec>
        )}

        <Sec title="Result">
          {out === "note" && <>
            <ShowPicker label="How the note shows" value={d.display?.note ?? "message"}
              options={[{ value: "message", label: "Label under the reply", pic: "note-message" }, { value: "card", label: "Open card", pic: "note-card" }, { value: "view", label: "A view", pic: "note-view" }, { value: "menu", label: "Only in the ✦ panel", pic: "panel" }, { value: "hidden", label: "Hidden: only for the AI", pic: "silent" }]}
              onChange={(v) => disp({ note: v })} />
            {d.display?.note === "view" && <div className="ag-field">
              <span className="hint">Drawn as</span>
              <ShowPicker label="View" value={d.display.view ?? "feed"} onChange={(v) => disp({ view: v })}
                options={[{ value: "feed", label: "A feed of posts", pic: "view-feed" }, { value: "phone", label: "Phone messages", pic: "view-phone" }, { value: "sheet", label: "A stat sheet", pic: "view-sheet" }, { value: "cards", label: "Cards", pic: "view-cards" }]} />
            </div>}
            <div className="ae-toggles">
              <Tg on={fb.on} onChange={(v) => set({ feedback: { on: v, notes: fb.notes } })} title="The story's AI reads it" text="Includes recent notes in future replies."
                extra={fb.on ? <>latest <NumberBox label="How many notes the story's AI reads" value={fb.notes} min={1} max={20} onCommit={(n) => set({ feedback: { on: true, notes: n } })} /> · <Where d={d} set={set} /></> : undefined} />
            </div>
          </>}
          {out === "choices" && <ShowPicker label="How the choices show" value={d.display?.choices ?? "buttons"}
            options={[{ value: "buttons", label: "Buttons under the reply", pic: "choices-buttons" }, { value: "list", label: "Numbered list", pic: "choices-list" }, { value: "composer", label: "Above the message box", pic: "choices-composer" }, { value: "menu", label: "Only in the ✦ panel", pic: "panel" }]}
            onChange={(v) => disp({ choices: v })} />}
          {out === "rewrite" && <ShowPicker label="How the rewrite shows" value={d.display?.rewrite ?? "mark"}
            options={[{ value: "mark", label: "A mark beside the name", pic: "mark-rewrite" }, { value: "silent", label: "Nothing in the chat", pic: "silent" }]} onChange={(v) => disp({ rewrite: v })} />}
          {out === "check" && <>
            <ShowPicker label="How a failed check shows" value={d.display?.check ?? "mark"}
              options={[{ value: "mark", label: "A mark beside the name", pic: "mark-check" }, { value: "line", label: "A line under the reply", pic: "check-line" }, { value: "silent", label: "Only in the ✦ panel", pic: "panel" }]}
              onChange={(v) => disp({ check: v })} />
            <div className="row-line wrap"><span>When it fails</span>
              <select aria-label="When the check fails" value={d.check?.onFail ?? "warn"} onChange={(e) => set({ check: { onFail: e.target.value as "warn" | "regenerate", maxRetries: d.check?.maxRetries ?? 1 } })}>
                <option value="warn">Just warn me</option><option value="regenerate">Write the reply again</option>
              </select>
              {d.check?.onFail === "regenerate" && <NumberBox label="Tries" value={d.check.maxRetries} min={1} max={5} onCommit={(n) => set({ check: { onFail: "regenerate", maxRetries: n } })} />}
            </div>
          </>}
          {out === "inject" && <div className="row-line wrap"><span>Goes</span><Where d={d} set={set} /></div>}
          {out === "intercept" && <p className="hint">Replaces your message and keeps the original as a revision.</p>}
          {out === "proposal" && <p className="hint">Adds facts to this story's lorebook copy. Uses the first linked book, or creates one.</p>}
        </Sec>

        {!textMode && (
          <Sec title="Variables" help="Use {{name}} in instructions. Override values per story or chat.">
            <VariablesEditor vars={d.variables ?? []} onChange={(v) => set({ variables: v.length ? v : undefined })} />
          </Sec>
        )}

        <Sec title="Instructions">
          <textarea rows={10} className="ae-prompt" aria-label="Agent instructions" value={d.prompt} onChange={(e) => set({ prompt: e.target.value })}
            placeholder={out === "inject" ? "e.g. Never write {{user}}'s actions." : "e.g. Point out contradictions with earlier messages."} />
          <p className="hint">Macros <Help text="{{char}} and {{user}} expand to names. {{random::a::b}} picks an option. {{name}} uses a variable; {{style}} uses the selected version." />{textMode ? "" : " The app adds the response format."}</p>
          {!textMode && <div className="row-line"><Switch label="Use as written" checked={!!d.rawPrompt} onChange={(v) => set({ rawPrompt: v || undefined })} /><span>Use as written: add no answer format</span><span className="hint">(v1 Use agent prompt as-is)</span></div>}
          <details className="ae-versions" open={!!d.styles?.length}>
            <summary>Versions {d.styles?.length ? `· ${d.styles.length} · default: ${(d.styles.find((x) => x.id === d.styleId) ?? d.styles[0])!.name}` : "· none"}</summary>
            <StylesEditor styles={d.styles ?? []} styleId={d.styleId} onChange={(styles, styleId) => set({ styles: styles.length ? styles : undefined, styleId: styles.length ? styleId : undefined })} />
          </details>
        </Sec>

        <Sec title="Only if" help="Leave as it is to run every time.">
          <div className="ae-toggles">
            <div className="ae-tg"><b>Trigger words</b><p>Runs only if one is in the latest messages. One per line; /regex/ works.</p>
              <textarea rows={2} aria-label="Trigger words" value={d.conditions.keywords.join("\n")}
                onChange={(e) => set({ conditions: { ...d.conditions, keywords: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) } })} /></div>
            <div className="ae-tg"><b>Chance</b><p>Percentage of eligible replies.</p>
              <div className="ae-extra"><NumberBox label="Chance in percent" value={d.conditions.probability} min={0} max={100} onCommit={(n) => set({ conditions: { ...d.conditions, probability: n } })} />%
                {d.conditions.probability < 100 && <label className="check"><input type="checkbox" checked={d.randomness === "stable"} onChange={(e) => set({ randomness: e.target.checked ? "stable" : "perSwipe" })} />Same roll on every new version</label>}</div></div>
            <div className="ae-tg"><b>On</b><p>Reply types.</p>
              <div className="ae-extra">{GEN_TYPES.map((g) => {
                const all = d.conditions.generationTypes.length === 0;
                const on = all || d.conditions.generationTypes.includes(g.value);
                return <label key={g.value} className="check"><input type="checkbox" checked={on} onChange={(e) => {
                  const current = all ? GEN_TYPES.map((x) => x.value) as string[] : [...d.conditions.generationTypes];
                  const next = e.target.checked ? [...current, g.value] : current.filter((x) => x !== g.value);
                  set({ conditions: { ...d.conditions, generationTypes: (next.length === GEN_TYPES.length ? [] : next) as AgentConfig["conditions"]["generationTypes"] } });
                }} />{g.label}</label>;
              })}</div></div>
            <div className="ae-tg"><b>Only after</b><p>Messages in the chat.</p>
              <div className="ae-extra"><NumberBox label="Only after this many messages" value={d.conditions.minMessages} min={0} max={9999} onCommit={(n) => set({ conditions: { ...d.conditions, minMessages: n } })} /> messages</div></div>
          </div>
        </Sec>

        <Sec title="Advanced">
          <div className="row-line wrap"><span>Order <Help text="Lower runs first. Matters for agents that rewrite: they run one after the other." /></span>
            <NumberBox label="Order" value={d.order} min={-9999} max={9999} onCommit={(n) => set({ order: n })} />
            <span className="spacer" />
            <ConfirmButton label="Delete Agent" confirmLabel="Click Again to Delete" onConfirm={() => { void draft.remove(() => onDelete(d.id)).then((deleted) => { if (deleted) drafts.delete(d.id); }); }} />
          </div>
          <p className="hint">Enable in a story's setup or the chat's Agents panel.</p>
        </Sec>
      </div>
    </div>
  );
}

const KIND_SUB: Record<string, string> = {
  inject: "A rule, a random pick, or guidance it writes", intercept: "Changes your message before the AI reads it",
  rewrite: "Edits the reply; Undo brings the original back", check: "Pass or fail: warn you, or write it again",
  choices: "What you could do next, as buttons", note: "A note, card, view or ✦ panel; the AI can read it",
  proposal: "Adds facts to this story's own lorebook",
};

function Sec({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="ae-sec" aria-label={title}>
      <h3 className="ae-sec-h">{title}{help && <Help text={help} />}</h3>
      {children}
    </section>
  );
}

function Tg({ on, onChange, title, text, extra }: { on: boolean; onChange: (v: boolean) => void; title: string; text?: string; extra?: ReactNode }) {
  return (
    <div className={`ae-tg${on ? " on" : ""}`}>
      <b>{title}</b>
      <Switch label={title} checked={on} onChange={onChange} />
      {text && <p>{text}</p>}
      {extra && <div className="ae-extra">{extra}</div>}
    </div>
  );
}

/** Where an injection (or a note sent back) goes in the prompt. */
function Where({ d, set }: { d: AgentConfig; set: (p: Partial<AgentConfig>) => void }) {
  const i = { position: "depth" as "marker" | "depth", depth: 1, role: "system" as "system" | "user" | "assistant", ...d.injection };
  return (
    <span className="row-line wrap">
      <select aria-label="Where the text goes" value={i.position} onChange={(e) => set({ injection: { ...i, position: e.target.value as "marker" | "depth" } })}>
        <option value="depth">in the chat</option><option value="marker">with the other agents' text</option>
      </select>
      {i.position === "depth" && <>
        <NumberBox label="Messages from the end" value={i.depth} min={0} max={999} onCommit={(n) => set({ injection: { ...i, depth: n } })} />
        <span className="hint">back, as</span>
        <select aria-label="Sent as" value={i.role} onChange={(e) => set({ injection: { ...i, role: e.target.value as "system" | "user" | "assistant" } })}>
          <option value="system">System</option><option value="user">User</option><option value="assistant">AI</option>
        </select>
      </>}
    </span>
  );
}

/** Variables (D-059): `{{key}}` fields with a default text; a story or chat can change the value. */
function VariablesEditor({ vars, onChange }: { vars: NonNullable<AgentConfig["variables"]>; onChange: (v: NonNullable<AgentConfig["variables"]>) => void }) {
  const patch = (i: number, p: Partial<(typeof vars)[number]>) => onChange(vars.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "v$1") || "value";
  return (
    <div className="ae-vars">
      {vars.length === 0 && <p className="hint">Add variables for instructions that vary by story.</p>}
      {vars.map((v, i) => (
        <div key={i} className="ae-var">
          <span className="ae-var-name">
            <input aria-label="Variable name" value={v.label} placeholder="Banned words" onChange={(e) => patch(i, { label: e.target.value, key: v.key === keyOf(v.label) || !v.key ? keyOf(e.target.value) : v.key })} />
            <code>{`{{${v.key}}}`}</code>
          </span>
          <textarea rows={2} aria-label={`${v.label || v.key} value`} value={v.value} onChange={(e) => patch(i, { value: e.target.value })} />
          <button type="button" className="link quiet" onClick={() => onChange(vars.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="link" onClick={() => { let k = "value"; let n = 1; while (vars.some((x) => x.key === k)) k = `value_${++n}`; onChange([...vars, { key: k, label: "", value: "" }]); }}>+ Add a Variable</button>
    </div>
  );
}

const roleName = (r: string | undefined) => r === "user" ? "User" : r === "assistant" ? "AI" : "System";

/**
 * Versions of the same agent (Daniel, 30/10): each style has a name and a text that goes where the instructions say
 * {{style}} (or at their end). The story or the chat picks one; the starred one is the default.
 */
function StylesEditor({ styles, styleId, onChange }: { styles: NonNullable<AgentConfig["styles"]>; styleId: string | undefined; onChange: (s: NonNullable<AgentConfig["styles"]>, id: string | undefined) => void }) {
  const def = (styles.find((x) => x.id === styleId) ?? styles[0])?.id;
  const patch = (i: number, p: Partial<(typeof styles)[number]>) => onChange(styles.map((x, j) => (j === i ? { ...x, ...p } : x)), def);
  const add = () => {
    const id = `style-${Date.now().toString(36)}`;
    onChange([...styles, { id, name: `Style ${styles.length + 1}`, text: "" }], def ?? id);
  };
  return (
    <div className="ag-styles">
      <p className="hint">Uses the starred version by default. Version text fills {"{{style}}"}, or goes at the end.</p>
      {styles.map((x, i) => (
        <div key={x.id} className="ag-style">
          <div className="row-line">
            <button type="button" className={`ag-star${x.id === def ? " on" : ""}`} aria-pressed={x.id === def} title="Default style" aria-label={`Make ${x.name} the default`}
              onClick={() => onChange(styles, x.id)}>{x.id === def ? "★" : "☆"}</button>
            <input className="grow" aria-label="Style name" value={x.name} onChange={(e) => patch(i, { name: e.target.value })} />
            <button type="button" className="link quiet" onClick={() => { const rest = styles.filter((_, j) => j !== i); onChange(rest, x.id === def ? rest[0]?.id : def); }}>Remove</button>
          </div>
          <textarea rows={2} aria-label={`${x.name} text`} placeholder="What this version changes (replaces {{style}} in the instructions)" value={x.text} onChange={(e) => patch(i, { text: e.target.value })} />
        </div>
      ))}
      <button type="button" className="link" onClick={add}>+ Add a Style</button>
    </div>
  );
}

/** A whole number saved on leaving the box or Enter (clearing it to type never saves 0). */
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
