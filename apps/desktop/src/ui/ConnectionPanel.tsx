// Homunculus 2 — inspector "Prompt" tab: which connections this session uses, and the sampling of the story's
// connection. Author: CLAUDE, 2026-10-23; inspector 2026-10-27 (D-018); 2026-10-28 (slice 1b, D-020): connection
// profiles (created and edited in Settings → Connections), picked per session. Prompt blocks join in slice 2.
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ConnectionProfile, Preset, ReasoningEffort, Session, SetupLayer } from "@homunculus/schemas";
import { SetupFields, type StorySetupProps } from "./SetupFields.tsx";
import { DEFAULT_PRESET, resolveSetup, type BuiltPrompt, type ProviderDefinition } from "@homunculus/core";
import type { Tracker } from "../trackers.ts";
import { Button, Collapse, Icon, type ICONS } from "./kit.tsx";
import { PromptBlocks } from "./PromptBlocks.tsx";
import { NarratorPromptGroup } from "./NarratorPromptGroup.tsx";
import { PromptSheet } from "./PromptSheet.tsx";
import { needsKey, type ConnectionState } from "../connection.ts";
import { Group, Row } from "./kit.tsx";
import { Help } from "./Help.tsx";

type ParamKey = "temperature" | "topP" | "maxTokens";
type Params = ConnectionProfile["params"];

export const SAMPLERS: Array<{ key: ParamKey; label: string; help: string; min: number; max: number; step: number; whole?: boolean }> = [
  { key: "temperature", label: "Temperature", help: "Lower values are steadier. Higher values add variety.", min: 0, max: 2, step: 0.05 },
  { key: "topP", label: "Top P", help: "Limits choices to tokens whose probabilities add up to this value.", min: 0, max: 1, step: 0.01 },
  { key: "maxTokens", label: "Max Length", help: "Reply token limit. Reasoning models may count thinking tokens too.", min: 64, max: 32000, step: 64, whole: true },
];

export const EFFORTS: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "none", label: "None (don't think)" }, { value: "minimal", label: "Minimal" }, { value: "low", label: "Low" },
  { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "xhigh", label: "Extra high" }, { value: "max", label: "Max" },
];
export const EFFORT_HELP = "More reasoning can increase latency and cost. Available levels depend on the model.";

/** The samplers and reasoning effort of a connection profile, as rows. Changing one calls onChange with new params. */
export function ParamRows({ params, onChange, allowedEfforts }: { params: Params; onChange: (p: Params) => void; allowedEfforts?: string[] }) {
  const setParam = (key: ParamKey, value: number | undefined) => {
    const next = { ...params };
    if (value === undefined || Number.isNaN(value)) delete next[key]; else next[key] = value;
    onChange(next);
  };
  return (
    <>
      {SAMPLERS.map((s) => <SamplerRow key={s.key} s={s} value={params[s.key]} onSet={(v) => setParam(s.key, v)} />)}
      <Row label="Reasoning Effort" help={EFFORT_HELP}>
        <select aria-label="Reasoning effort" value={params.reasoningEffort ?? ""}
          onChange={(e) => { const next = { ...params }; if (e.target.value) next.reasoningEffort = e.target.value as ReasoningEffort; else delete next.reasoningEffort; onChange(next); }}>
          <option value="">Default</option>
          {EFFORTS.map((x) => {
            const not = !!allowedEfforts && !allowedEfforts.includes(x.value);
            return <option key={x.value} value={x.value} disabled={not && params.reasoningEffort !== x.value}>{x.label}{not ? " — not for this model" : ""}</option>;
          })}
        </select>
      </Row>
    </>
  );
}

const INHERIT = "";
const SAME_AS_STORY = "__story__";

export type PromptPreview = BuiltPrompt & { presetName: string; model: string; sent: number };

/** A card of the Prompt tab (D-105): icon, title and what is set now when closed; its controls when open. */
export interface PromptCardSpec { id: string; icon: keyof typeof ICONS; title: string; summary: string; body: ReactNode }

const CARDS_KEY = "h2.promptCards.open";
const readCards = (): string[] => { try { const v = JSON.parse(localStorage.getItem(CARDS_KEY) ?? "null") as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : ["preset"]; } catch { return ["preset"]; } };

function PromptCard({ card, open, onToggle }: { card: PromptCardSpec; open: boolean; onToggle: () => void }) {
  return (
    <section className={`prompt-card${open ? " open" : ""}`} data-testid={`prompt-card-${card.id}`}>
      <button type="button" className="prompt-card-head" aria-expanded={open} onClick={onToggle} data-testid="prompt-card-toggle">
        <span className="prompt-card-icon" aria-hidden><Icon name={card.icon} size={16} /></span>
        <span className="prompt-card-text"><b>{card.title}</b><small>{card.summary}</small></span>
        <span className="prompt-card-chev" aria-hidden><Icon name="chevron" size={12} /></span>
      </button>
      <Collapse open={open}><div className="prompt-card-body">{card.body}</div></Collapse>
    </section>
  );
}

export function PromptPane({ c, providers, session, storySetup, storyName, director = false, setupProps, onChangeSession, onOpenSettings, presets, defaultPresetId, onSavePreset, onOpenPreset, preview, trackers, authorsNote, authorsNoteSummary = "", cards = [] }: {
  c: ConnectionState; providers: ProviderDefinition[]; session: Session; onChangeSession: (s: Session) => void | Promise<void>; onOpenSettings: () => void;
  /** A story chat (D-031): the story's layer and name, and the setup block it shares with the story's page. */
  storySetup?: SetupLayer | undefined; storyName?: string | undefined; director?: boolean; setupProps?: StorySetupProps | undefined;
  presets: Preset[]; defaultPresetId: string; onSavePreset: (p: Preset) => Promise<void>; onOpenPreset: (id: string, block?: string) => void;
  /** Builds the next prompt without sending it. */
  preview: () => Promise<PromptPreview>;
  trackers: Tracker[];
  /** The chat's Author's Note group (AuthorsNote.tsx): the first card (Daniel, D-105). */
  authorsNote?: ReactNode;
  authorsNoteSummary?: string;
  /** Lorebooks, Regex, Quick Replies… after the preset. */
  cards?: PromptCardSpec[];
}) {
  const [shown, setShown] = useState<PromptPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [open, setOpenState] = useState<string[]>(readCards);
  const toggle = (id: string) => setOpenState((cur) => {
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try { localStorage.setItem(CARDS_KEY, JSON.stringify(next)); } catch { /* per-viewer only */ }
    return next;
  });
  const inStory = !!(storySetup && setupProps);
  const aboveSetup = setupProps?.setupAbove(storySetup) ?? resolveSetup({ story: storySetup });
  const selectedPresetId = session.setup.presetId !== undefined ? session.setup.presetId : aboveSetup.presetId ?? defaultPresetId;
  const preset = presets.find((p) => p.id === selectedPresetId) ?? presets.find((p) => p.id === DEFAULT_PRESET.id) ?? DEFAULT_PRESET;
  const defaultPresetName = presets.find((p) => p.id === defaultPresetId)?.name ?? "Homunculus Default";
  const runPreview = async () => {
    setPreviewing(true); setPreviewError("");
    try { setShown(await preview()); } catch (e) { setPreviewError(e instanceof Error ? e.message : String(e)); }
    setPreviewing(false);
  };
  const presetOverrides = preset ? Object.entries(preset.params).filter(([, v]) => v !== undefined) : [];
  const story = c.storyProfileFor(session, storySetup);
  const defaultName = c.byId.get(c.defaultId ?? "")?.name ?? "none";
  const agentsDefault = c.defaultAgentId ? c.byId.get(c.defaultAgentId)?.name ?? "same as the story" : "same as the story";
  const setLayer = (patch: Partial<Session["setup"]>, clear: Array<keyof Session["setup"]>) => {
    const setup = { ...session.setup, ...patch };
    for (const k of clear) delete setup[k];
    onChangeSession({ ...session, setup });
  };
  const agentValue = session.setup.agentConnectionId === undefined ? INHERIT : session.setup.agentConnectionId === null ? SAME_AS_STORY : session.setup.agentConnectionId;
  const status = story && needsKey(story.providerId) ? c.keyStatus(story) : null;
  const model = story ? (session.setup.modelOverride ?? storySetup?.modelOverride) || story.model : "";
  const blocksOn = preset.blocks.filter((b) => b.enabled).length;
  const narratorOn = inStory || session.cast.some((member) => member.role === "narrator" && member.presence !== "off");

  const modelCard: PromptCardSpec = {
    id: "model", icon: "plug", title: inStory ? "Story Setup & Model" : "Model",
    summary: story ? `${story.name}${model ? ` · ${model}` : ""}${status && status.kind !== "saved" ? " · no key saved" : ""}` : "No connection",
    body: <>
      {inStory && (
        <>
          <p className="follows-story" data-testid="follows-story">Inherits <strong>{storyName}</strong>. Overrides apply to this chat.</p>
          <SetupFields mode="chat" layer={session.setup} above={storySetup} names={setupProps!.namesFor(storySetup)} director={director}
            presets={setupProps!.presets} profiles={setupProps!.profiles} personas={setupProps!.personas} trackers={setupProps!.trackers} agents={setupProps!.agents} cues={setupProps!.cues}
            onChange={(setup) => onChangeSession({ ...session, setup })} testId="chat-setup" />
        </>
      )}
      {!inStory && <Group title="Connections" help="Manage connections in Settings → Connections.">
        <Row label="Story" help="Writes replies. Default follows Settings → Defaults.">
          <select aria-label="Story connection" value={session.setup.connectionId ?? INHERIT}
            onChange={(e) => (e.target.value === INHERIT ? setLayer({ modelOverride: "" }, ["connectionId"]) : setLayer({ connectionId: e.target.value, modelOverride: "" }, []))}>
            <option value={INHERIT}>Default ({defaultName})</option>
            {c.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row label="Agents & Trackers" help="Fallback for agents and trackers without their own connection. Default follows Settings → Defaults.">
          <select aria-label="Agents connection" value={agentValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === INHERIT) setLayer({}, ["agentConnectionId"]);
              else setLayer({ agentConnectionId: v === SAME_AS_STORY ? null : v }, []);
            }}>
            <option value={INHERIT}>Default ({agentsDefault})</option>
            <option value={SAME_AS_STORY}>Same as the story</option>
            {c.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row wide>
          <span className="hint" data-testid="story-connection">
            {story ? <>{providers.find((p) => p.id === story.providerId)?.name ?? story.providerId}{needsKey(story.providerId) ? ` · ${model || "no model set"}` : ""}
              {status && status.kind !== "saved" ? " · no key saved" : ""}. </> : "No connection. "}
            <button className="link" onClick={onOpenSettings}>Edit Connections</button>
          </span>
        </Row>
      </Group>}
      {story && (
        <Group title={`Sampling — ${story.name}`} help={`Changes apply wherever "${story.name}" is used, starting with the next reply. Blank uses the model's default.`}>
          <ParamRows params={story.params} onChange={(params) => void c.save({ ...story, params })} />
          {presetOverrides.length > 0 && (
            <Row wide><span className="hint warn-text" data-testid="preset-overrides">The preset “{preset.name}” sets {presetOverrides.map(([k, v]) => `${k} ${v}`).join(", ")}, which win over these for the story.</span></Row>
          )}
        </Group>
      )}
    </>,
  };

  const presetCard: PromptCardSpec = {
    id: "preset", icon: "preset", title: "Preset", summary: `${preset.name} · ${blocksOn} of ${preset.blocks.length} blocks on`,
    body: <Group testId="prompt-preset">
      {!inStory && <Row label="Preset">
        <select aria-label="Session preset" value={session.setup.presetId ?? ""}
          onChange={(e) => (e.target.value ? setLayer({ presetId: e.target.value }, []) : setLayer({}, ["presetId"]))}>
          <option value="">Default ({defaultPresetName})</option>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Row>}
      <Row wide><PromptBlocks key={preset.id} preset={preset} layer={session.setup} above={aboveSetup} level="chat"
        onChange={(setup) => onChangeSession({ ...session, setup })} onSavePreset={onSavePreset} onOpenPreset={onOpenPreset} /></Row>
    </Group>,
  };

  const narratorCard: PromptCardSpec | null = narratorOn ? {
    id: "narrator", icon: "scroll", title: "Narrator in the Prompt", summary: "How the narrator is sent",
    body: <NarratorPromptGroup level="chat" layer={session.setup} above={aboveSetup.narratorPrompt} onChange={(setup) => onChangeSession({ ...session, setup })} />,
  } : null;

  const all = [modelCard, presetCard, ...(narratorCard ? [narratorCard] : []), ...cards];

  return (
    <div className="pane prompt-pane" aria-label="Connection settings" data-testid="prompt-pane">
      <div className="prompt-top">
        <Button variant="prominent" className="preview-cta" onClick={() => void runPreview()} disabled={previewing}><Icon name="eye" size={14} />{previewing ? "Building…" : "Preview Prompt"}</Button>
        <span className="prompt-top-meta" title="Largest prompt + reply this preset allows">{preset.contextSize ? `Context · ${Math.round(preset.contextSize / 1024)}k` : "No context limit"}</span>
        <Help text="Shows exactly what the next reply would send (with what is in your message box as the last message), without sending anything. Agents that run just before the reply are not included." />
      </div>
      {previewError && <p className="error-text">{previewError}</p>}

      {authorsNote && <div className="prompt-card prompt-card-note" data-testid="prompt-card-authors-note" title={authorsNoteSummary}>{authorsNote}</div>}
      {all.map((card) => <PromptCard key={card.id} card={card} open={open.includes(card.id)} onToggle={() => toggle(card.id)} />)}

      {shown && (
        <PromptSheet title="Prompt Preview" testId="prompt-preview" trackers={trackers} parts={shown.parts} budget={shown.budget} notes={shown.notes} sent={shown.sent}
          meta={<>Next reply · preset <strong>{shown.presetName}</strong>{shown.model ? <> · {shown.model}</> : null}</>}
          onClose={() => setShown(null)} onRefresh={() => void runPreview()} refreshing={previewing} />
      )}
    </div>
  );
}

/** One sampler: a slider and a number box. Empty box = the model's default. The box applies on Enter or when you leave it. */
export function SamplerRow({ s, value, onSet }: { s: (typeof SAMPLERS)[number]; value: number | undefined; onSet: (v: number | undefined) => void }) {
  const shown = value === undefined ? "" : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const t = text.trim();
    if (t === "") { onSet(undefined); return; }
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n)) { setText(shown); return; }
    const clamped = Math.min(s.max, Math.max(s.min, s.whole ? Math.round(n) : n));
    onSet(clamped);
    setText(String(clamped));
  };
  return (
    <Row label={s.label} help={s.help}>
      <span className="sampler">
        <input type="range" aria-label={s.label} min={s.min} max={s.max} step={s.step}
          value={value ?? (s.key === "maxTokens" ? 2048 : 1)} className={value === undefined ? "unset" : ""}
          onChange={(e) => onSet(Number(e.target.value))} />
        <input aria-label={`${s.label} value`} className="num" inputMode="decimal" placeholder="Default" value={text}
          onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setText(shown); }} />
      </span>
    </Row>
  );
}
