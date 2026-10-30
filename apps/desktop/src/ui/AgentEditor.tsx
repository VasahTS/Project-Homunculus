// Homunculus 2 — the agent editor (slice 5, D-047; approved draft "Homunculus Agents Draft"). Author: CLAUDE, 2026-10-30.
// Persistence fixes (D-051): serialized saves and recoverable drafts. CODEX, 2026-10-30.
// Same look as the tracker editor (cards that open in place). It saves by itself, like the lorebook editor (D-028).
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AgentDraft } from "../agent-draft.ts";
import type { AgentConfig, AgentConfigInput, AgentOutputKind } from "@homunculus/schemas";
import { AGENT_KINDS, WHEN_LABELS, triggersFor, whenOf, withKind, type AgentWhen } from "../agents.ts";
import { ConfirmButton, Help } from "./Help.tsx";
import { Collapse, Icon, Segmented } from "./kit.tsx";

const GEN_TYPES = [{ value: "normal", label: "New replies" }, { value: "swipe", label: "New versions" }, { value: "continue", label: "Continue" }] as const;

export function AgentEditor({ agent, agents = [], drafts, onSave, onDelete, onClose }: {
  agent: AgentConfig;
  /** All agents, to pick the ones whose results this one reads. */
  agents?: AgentConfig[];
  drafts: Map<string, AgentDraft>;
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
  const [open, setOpen] = useState<Record<string, boolean>>({ text: true });
  useEffect(() => () => { void draft.flush(); }, [draft]);
  const set = (patch: Partial<AgentConfig>) => draft.update({ ...draft.snapshot().value, ...patch } as AgentConfig);
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const when = whenOf(d);
  const out = d.output;
  const conditionsSum = [d.conditions.probability < 100 ? `${d.conditions.probability}% chance` : "always",
    d.conditions.keywords.length ? `${d.conditions.keywords.length} keyword${d.conditions.keywords.length === 1 ? "" : "s"}` : "",
    d.conditions.minMessages ? `after ${d.conditions.minMessages} messages` : ""].filter(Boolean).join(" · ");
  const readsSum = out === "inject" && d.runMode === "text" ? "nothing (sent as written)"
    : [`last ${d.input.messages} messages`, d.input.cards ? "the cast" : "", d.input.persona ? "your persona" : "", d.input.lorebooks ? "active lore" : "",
      d.input.state !== false ? "Scene values" : "", d.input.scenario ? "scenario" : "", d.input.readsAgents.length ? `${d.input.readsAgents.length} agent result${d.input.readsAgents.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  const inp = (patch: Partial<AgentConfig["input"]>) => set({ input: { ...d.input, ...patch } });
  const disp = (patch: NonNullable<AgentConfig["display"]>) => set({ display: { ...d.display, ...patch } });

  return (
    <div className="editor agent-editor" aria-label="Agent editor" data-testid="agent-editor">
      <div className="session-bar">
        <input className="ag-title" aria-label="Agent name" placeholder="Agent name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
        <span className="spacer" />
        <span className={status === "error" ? "error-text" : "hint"} role="status" data-testid="agent-save-state">
          {status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "✓ Saved"}
        </span>
        {onClose && <button className="btn btn-bordered btn-small" onClick={() => { void draft.flush().then((saved) => { if (saved) onClose(); }); }}>Close</button>}
      </div>
      <div className="editor-body ag-body">
        {error && <div className="error-bar inline" role="alert">{error}</div>}
        <input className="ag-help" aria-label="Agent description" placeholder="What it is for, in one line (optional)" value={d.help} onChange={(e) => set({ help: e.target.value })} />

        <div className="ag-field">
          <span className="ag-label">What it does</span>
          <div className="ag-kinds" role="radiogroup" aria-label="What it does">
            {AGENT_KINDS.map((k) => (
              <button key={k.output} type="button" role="radio" aria-checked={out === k.output} className={`ag-kind${out === k.output ? " on" : ""}`}
                onClick={() => { if (out !== k.output) set(withKind(draft.snapshot().value, k.output as AgentOutputKind) as AgentConfig); }}>
                <span className="kind-dot" style={{ background: k.color }} />{k.label}
              </button>
            ))}
          </div>
        </div>

        {out !== "inject" && <div className="ag-field row-line wrap">
          <span className="ag-label">When</span>
          <select aria-label="When it runs" value={when.when} onChange={(e) => set({ triggers: triggersFor(e.target.value as AgentWhen, when.n) })}>
            {(Object.keys(WHEN_LABELS) as AgentWhen[]).map((w) => <option key={w} value={w}>{WHEN_LABELS[w]}</option>)}
          </select>
          {when.when === "everyN" && <NumberBox label="Every how many messages" value={when.n} min={1} max={500} onCommit={(n) => set({ triggers: triggersFor("everyN", n) })} />}
        </div>}
        {out === "inject" && <p className="hint">Its text goes into the prompt before each reply, like a preset block or the Author's Note — but you switch it per story or chat, it can have a chance, trigger words or a random pick, and an AI can write it from the latest messages.</p>}

        {out === "inject" && (
          <div className="ag-field">
            <span className="ag-label">How the text is made <Help text="Sent as written: no AI call, free and instant; {{random::a::b}} picks one option each time. Written by an AI: a separate call writes the text from the recent messages (costs a call)." /></span>
            <Segmented small label="How the text is made" value={d.runMode === "text" ? "text" : "separate"}
              options={[{ value: "text", label: "Sent as written" }, { value: "separate", label: "Written by an AI" }]}
              onChange={(v) => set({ runMode: v, input: { ...d.input, messages: v === "text" ? 0 : Math.max(4, d.input.messages) } })} />
          </div>
        )}
        {out === "note" && (
          <div className="ag-field">
            <span className="ag-label">How it shows</span>
            <Segmented small label="How the note shows" value={d.display?.note ?? "message"}
              options={[{ value: "message", label: "Label under the reply" }, { value: "card", label: "Open card" }, { value: "view", label: "A view" }, { value: "menu", label: "Only in the ✦ panel" }]}
              onChange={(v) => disp({ note: v })} />
            {d.display?.note === "view" && <div className="row-line wrap">
              <span className="hint">Drawn as</span>
              <Segmented small label="View" value={d.display.view ?? "feed"} onChange={(v) => disp({ view: v })}
                options={[{ value: "feed", label: "A feed of posts" }, { value: "phone", label: "Phone messages" }, { value: "sheet", label: "A stat sheet" }, { value: "cards", label: "Cards" }]} />
              <Help text="The agent answers in a fixed JSON shape (the app tells it which) and the app draws it with its own parts, in your theme. The agent never sends HTML or code." />
            </div>}
          </div>
        )}
        {out === "proposal" && <p className="hint">New facts go into this story's own version of its lorebook (the first one it uses; a story without one gets its own). The Library's book is never changed. See them in Library → Lorebooks → the book → “{"<story>"}'s version”.</p>}
        {out === "choices" && (
          <div className="ag-field">
            <span className="ag-label">How it shows</span>
            <Segmented small label="How the choices show" value={d.display?.choices ?? "buttons"}
              options={[{ value: "buttons", label: "Buttons under the reply" }, { value: "list", label: "Numbered list" }, { value: "composer", label: "Above the message box" }, { value: "menu", label: "Only in the ✦ panel" }]}
              onChange={(v) => disp({ choices: v })} />
          </div>
        )}
        {out === "rewrite" && (
          <div className="ag-field">
            <span className="ag-label">How it shows</span>
            <Segmented small label="How the rewrite shows" value={d.display?.rewrite ?? "mark"}
              options={[{ value: "mark", label: "A mark beside the name" }, { value: "silent", label: "Nothing in the chat" }]} onChange={(v) => disp({ rewrite: v })} />
          </div>
        )}
        {out === "check" && (
          <div className="ag-field">
            <span className="ag-label">How it shows</span>
            <Segmented small label="How a failed check shows" value={d.display?.check ?? "mark"}
              options={[{ value: "mark", label: "A mark beside the name" }, { value: "line", label: "A line under the reply" }, { value: "silent", label: "Only in the ✦ panel" }]}
              onChange={(v) => disp({ check: v })} />
          </div>
        )}
        {out === "check" && (
          <div className="ag-field row-line wrap">
            <span className="ag-label">When it fails</span>
            <select aria-label="When the check fails" value={d.check?.onFail ?? "warn"} onChange={(e) => set({ check: { onFail: e.target.value as "warn" | "regenerate", maxRetries: d.check?.maxRetries ?? 1 } })}>
              <option value="warn">Just warn me</option>
              <option value="regenerate">Write the reply again</option>
            </select>
            {d.check?.onFail === "regenerate" && <NumberBox label="Tries" value={d.check.maxRetries} min={1} max={5} onCommit={(n) => set({ check: { onFail: "regenerate", maxRetries: n } })} />}
          </div>
        )}

        <Card id="text" title="Instructions" sub={out === "inject" && d.runMode === "text" ? "the text that goes into the prompt" : "what the AI is told to do"} open={!!open.text} onToggle={toggle}>
          <textarea rows={8} aria-label="Agent instructions" value={d.prompt} onChange={(e) => set({ prompt: e.target.value })}
            placeholder={out === "inject" ? "e.g. Never write {{user}}'s actions." : "e.g. Point out contradictions with earlier messages."} />
          <p className="hint">{"{{char}}"} and {"{{user}}"} become the names. {"{{random::a::b::c}}"} picks one option. The answer format is added by the app.</p>
        </Card>

        {out === "inject" && (
          <Card id="where" title="Where it goes" sub={d.injection?.position === "marker" ? "with the other agents' text" : `in the chat, ${d.injection?.depth ?? 1} back, as ${roleName(d.injection?.role)}`} open={!!open.where} onToggle={toggle}>
            <div className="row-line wrap">
              <select aria-label="Where the text goes" value={d.injection?.position ?? "depth"}
                onChange={(e) => set({ injection: { position: e.target.value as "marker" | "depth", depth: d.injection?.depth ?? 1, role: d.injection?.role ?? "system" } })}>
                <option value="depth">In the chat</option><option value="marker">With the other agents' text</option>
              </select>
              {(d.injection?.position ?? "depth") === "depth" && <>
                <NumberBox label="Messages from the end" value={d.injection?.depth ?? 1} min={0} max={999} onCommit={(n) => set({ injection: { position: "depth", depth: n, role: d.injection?.role ?? "system" } })} />
                <span className="hint">back, as</span>
                <select aria-label="Sent as" value={d.injection?.role ?? "system"} onChange={(e) => set({ injection: { position: "depth", depth: d.injection?.depth ?? 1, role: e.target.value as "system" | "user" | "assistant" } })}>
                  <option value="system">System</option><option value="user">User</option><option value="assistant">AI</option>
                </select>
              </>}
            </div>
          </Card>
        )}

        {!(out === "inject" && d.runMode === "text") && (
          <Card id="reads" title="What it reads" sub={readsSum} open={!!open.reads} onToggle={toggle}>
            <div className="ag-reads">
              <div className="ag-read"><span><b>Recent messages</b><small>The latest messages of this branch, oldest first (0 = none)</small></span>
                <NumberBox label="Messages it reads" value={d.input.messages} min={0} max={100} onCommit={(n) => inp({ messages: n })} /></div>
              <Read on={d.input.cards} onChange={(v) => inp({ cards: v })} title="The cast" text="Cards of the characters in the chat, the story's narrator and the NPCs (description, personality, their sheets)" />
              <Read on={d.input.persona} onChange={(v) => inp({ persona: v })} title="Your persona" text="Who you play, as the AI sees it" />
              <Read on={d.input.lorebooks} onChange={(v) => inp({ lorebooks: v })} title="Lorebook entries active now" text="The entries that went into the latest reply's prompt" />
              <Read on={d.input.state !== false} onChange={(v) => inp({ state: v })} title="Scene values" text="What the trackers hold right now" />
              <Read on={d.input.scenario} onChange={(v) => inp({ scenario: v })} title="The scenario" text="The chat's scenario, else the story's" />
              <div className="ag-read"><span><b>Other agents' results</b><small>They run first and this one reads what they answered (e.g. Continuity → a director)</small></span>
                <select aria-label="Add an agent it reads" value="" onChange={(e) => { if (e.target.value) inp({ readsAgents: [...d.input.readsAgents, e.target.value] }); }}>
                  <option value="">+ Add…</option>
                  {agents.filter((x) => x.id !== d.id && !d.input.readsAgents.includes(x.id) && x.output !== "inject").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select></div>
              {d.input.readsAgents.length > 0 && <div className="row-line wrap">{d.input.readsAgents.map((id) => (
                <span key={id} className="tag">{agents.find((x) => x.id === id)?.name ?? id} <button type="button" className="link quiet" aria-label="Stop reading it" onClick={() => inp({ readsAgents: d.input.readsAgents.filter((x) => x !== id) })}>×</button></span>))}</div>}
            </div>
          </Card>
        )}

        <Card id="fires" title="When it fires" sub={conditionsSum} open={!!open.fires} onToggle={toggle}>
          <div className="row-line wrap"><span>Chance</span>
            <NumberBox label="Chance in percent" value={d.conditions.probability} min={0} max={100} onCommit={(n) => set({ conditions: { ...d.conditions, probability: n } })} /><span>%</span>
            {d.conditions.probability < 100 && <label className="check"><input type="checkbox" checked={d.randomness === "stable"} onChange={(e) => set({ randomness: e.target.checked ? "stable" : "perSwipe" })} />Same roll on every new version</label>}
          </div>
          <label className="ag-stack"><span>Only when one of these words is in the latest messages <Help text="One per line. Empty = always. /regex/ works too." /></span>
            <textarea rows={2} aria-label="Trigger words" value={d.conditions.keywords.join("\n")}
              onChange={(e) => set({ conditions: { ...d.conditions, keywords: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) } })} /></label>
          <div className="row-line wrap"><span>Only after</span>
            <NumberBox label="Only after this many messages" value={d.conditions.minMessages} min={0} max={9999} onCommit={(n) => set({ conditions: { ...d.conditions, minMessages: n } })} /><span>messages</span></div>
          <div className="row-line wrap"><span>On</span>
            {GEN_TYPES.map((g) => {
              const all = d.conditions.generationTypes.length === 0;
              const on = all || d.conditions.generationTypes.includes(g.value);
              return <label key={g.value} className="check"><input type="checkbox" checked={on} onChange={(e) => {
                const current = all ? GEN_TYPES.map((x) => x.value) as string[] : [...d.conditions.generationTypes];
                const next = e.target.checked ? [...current, g.value] : current.filter((x) => x !== g.value);
                set({ conditions: { ...d.conditions, generationTypes: (next.length === GEN_TYPES.length ? [] : next) as AgentConfig["conditions"]["generationTypes"] } });
              }} />{g.label}</label>;
            })}
          </div>
        </Card>

        <Card id="adv" title="Advanced" sub={`order ${d.order}${d.limits.maxTokens ? ` · up to ${d.limits.maxTokens} tokens` : ""}`} open={!!open.adv} onToggle={toggle}>
          <div className="row-line wrap"><span>Order <Help text="Lower runs first. Matters for agents that rewrite: they run one after the other." /></span>
            <NumberBox label="Order" value={d.order} min={-9999} max={9999} onCommit={(n) => set({ order: n })} /></div>
          {!(out === "inject" && d.runMode === "text") && <div className="row-line wrap"><span>Longest answer</span>
            <NumberBox label="Longest answer in tokens" value={d.limits.maxTokens ?? 0} min={0} max={200000} onCommit={(n) => set({ limits: { ...d.limits, maxTokens: n || undefined } })} /><span className="hint">tokens (0 = no limit)</span></div>}
          <p className="hint">It uses the connection for agents chosen in the story's setup.</p>
        </Card>

        <div className="editor-actions">
          <p className="hint">Switch it on per story or chat in their setup, or from the ✦ button in a chat.</p>
          <span className="spacer" />
          <ConfirmButton label="Delete Agent" confirmLabel="Click Again to Delete" onConfirm={() => { void draft.remove(() => onDelete(d.id)).then((deleted) => { if (deleted) drafts.delete(d.id); }); }} />
        </div>
      </div>
    </div>
  );
}

const roleName = (r: string | undefined) => r === "user" ? "User" : r === "assistant" ? "AI" : "System";

function Card({ id, title, sub, open, onToggle, children }: { id: string; title: string; sub: string; open: boolean; onToggle: (id: string) => void; children: ReactNode }) {
  return (
    <section className={`te-card${open ? " open" : ""}`}>
      <button type="button" className="te-card-head" aria-expanded={open} onClick={() => onToggle(id)}>
        <span className="grow"><b>{title}</b><span className="te-sub">{sub}</span></span>
        <span className={`te-chev${open ? " open" : ""}`}><Icon name="chevron" size={14} /></span>
      </button>
      <Collapse open={open}><div className="te-card-body">{children}</div></Collapse>
    </section>
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

function Read({ on, onChange, title, text }: { on: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return (
    <label className="ag-read check-row">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span><b>{title}</b><small>{text}</small></span>
    </label>
  );
}
