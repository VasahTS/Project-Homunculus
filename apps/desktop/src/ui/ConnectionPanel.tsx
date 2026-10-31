// Homunculus 2 — inspector "Prompt" tab: which connections this session uses, and the sampling of the story's
// connection. Author: CLAUDE, 2026-10-23; inspector 2026-10-27 (D-018); 2026-10-28 (slice 1b, D-020): connection
// profiles (created and edited in Settings → Connections), picked per session. Prompt blocks join in slice 2.
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ConnectionProfile, Preset, ReasoningEffort, Session, SetupLayer } from "@homunculus/schemas";
import { SetupFields, type StorySetupProps } from "./SetupFields.tsx";
import { DEFAULT_PRESET, resolveSetup, type BuiltPrompt, type ProviderDefinition } from "@homunculus/core";
import type { Tracker } from "../trackers.ts";
import { Button, Icon } from "./kit.tsx";
import { PromptBlocks } from "./PromptBlocks.tsx";
import { NarratorPromptGroup } from "./NarratorPromptGroup.tsx";
import { PromptSheet } from "./PromptSheet.tsx";
import { needsKey, type ConnectionState } from "../connection.ts";
import { Group, Row } from "./kit.tsx";
import { Help } from "./Help.tsx";

type ParamKey = "temperature" | "topP" | "maxTokens";
type Params = ConnectionProfile["params"];

export const SAMPLERS: Array<{ key: ParamKey; label: string; help: string; min: number; max: number; step: number; whole?: boolean }> = [
  { key: "temperature", label: "Temperature", help: "How surprising the writing is. Lower = steadier and more predictable, higher = more varied (and more mistakes). Empty = the model's default.", min: 0, max: 2, step: 0.05 },
  { key: "topP", label: "Top P", help: "Only words from the most likely share of choices are used (0.95 = the top 95%). Lower = safer word choices. Empty = the model's default.", min: 0, max: 1, step: 0.01 },
  { key: "maxTokens", label: "Max Length", help: "The longest a reply can be, in tokens (about ¾ of a word each). Thinking models count their reasoning too, so leave room. Empty = the model's default.", min: 64, max: 32000, step: 64, whole: true },
];

export const EFFORTS: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "none", label: "None (don't think)" }, { value: "minimal", label: "Minimal" }, { value: "low", label: "Low" },
  { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "xhigh", label: "Extra high" }, { value: "max", label: "Max" },
];
export const EFFORT_HELP = "For thinking models: how long the model thinks before writing. More thinking is slower and costs more, but plans better. Default = the model decides. Models that don't think ignore it; some accept only some levels (OpenRouter and nano-gpt list them per model).";

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

export function PromptPane({ c, providers, session, storySetup, storyName, director = false, setupProps, onChangeSession, onOpenSettings, presets, defaultPresetId, onSavePreset, onOpenPreset, preview, trackers, lore, authorsNote, character, memory }: {
  c: ConnectionState; providers: ProviderDefinition[]; session: Session; onChangeSession: (s: Session) => void | Promise<void>; onOpenSettings: () => void;
  /** A story chat (D-031): the story's layer and name, and the setup block it shares with the story's page. */
  storySetup?: SetupLayer | undefined; storyName?: string | undefined; director?: boolean; setupProps?: StorySetupProps | undefined;
  presets: Preset[]; defaultPresetId: string; onSavePreset: (p: Preset) => Promise<void>; onOpenPreset: (id: string, block?: string) => void;
  /** Builds the next prompt without sending it. */
  preview: () => Promise<PromptPreview>;
  trackers: Tracker[];
  /** The session's lorebooks group (LorePanels.tsx). */
  lore?: ReactNode;
  /** The Memory group (D-054). */
  memory?: ReactNode;
  /** The chat's Author's Note group (AuthorsNote.tsx), at the top. */
  authorsNote?: ReactNode;
  /** The chat's character, editable in place (round 3, PromptCharacter.tsx), at the very top. */
  character?: ReactNode;
}) {
  const [shown, setShown] = useState<PromptPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);
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

  return (
    <div className="pane" aria-label="Connection settings" data-testid="prompt-pane">
      {character}
      {authorsNote}
      {inStory && (
        <>
          <p className="follows-story" data-testid="follows-story">This chat follows <strong>{storyName}</strong>. Rows you change here count for this chat only.</p>
          <SetupFields mode="chat" layer={session.setup} above={storySetup} names={setupProps!.namesFor(storySetup)} director={director}
            presets={setupProps!.presets} profiles={setupProps!.profiles} personas={setupProps!.personas} trackers={setupProps!.trackers} agents={setupProps!.agents}
            onChange={(setup) => onChangeSession({ ...session, setup })} testId="chat-setup" />
        </>
      )}
      {!inStory && <Group title="Connections" help="Which saved connection writes this story, and which one the agents and trackers use. Create and edit connections in Settings → Connections.">
        <Row label="Story" help="Writes the replies. 'Default' follows the default connection in Settings.">
          <select aria-label="Story connection" value={session.setup.connectionId ?? INHERIT}
            onChange={(e) => (e.target.value === INHERIT ? setLayer({}, ["connectionId"]) : setLayer({ connectionId: e.target.value }, []))}>
            <option value={INHERIT}>Default ({defaultName})</option>
            {c.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>
        <Row label="Agents & Trackers" help="Agents and trackers that don't have a connection of their own use this one. A cheaper or faster model here saves money. 'Default' follows Settings → Defaults.">
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
            {story ? <>{providers.find((p) => p.id === story.providerId)?.name ?? story.providerId}{needsKey(story.providerId) ? ` · ${story.model || "no model set"}` : ""}
              {status && status.kind !== "saved" ? " · no key saved" : ""}. </> : "No connection. "}
            <button className="link" onClick={onOpenSettings}>Edit Connections</button>
          </span>
        </Row>
      </Group>}

      <Group title="Preset" help="The recipe of the prompt: which blocks the AI reads, in which order. Choose whether block edits apply only here or to the shared preset. Edit, import and export presets in Library → Presets."
        testId="prompt-preset">
        {!inStory && <Row label="Preset">
          <select aria-label="Session preset" value={session.setup.presetId ?? ""}
            onChange={(e) => (e.target.value ? setLayer({ presetId: e.target.value }, []) : setLayer({}, ["presetId"]))}>
            <option value="">Default ({defaultPresetName})</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Row>}
        {preset && <Row wide><PromptBlocks key={preset.id} preset={preset} layer={session.setup} above={aboveSetup} level="chat"
          onChange={(setup) => onChangeSession({ ...session, setup })} onSavePreset={onSavePreset} onOpenPreset={onOpenPreset} /></Row>}
        <Row wide>
          <span className="preview-cta">
            <Button onClick={() => void runPreview()} disabled={previewing}><Icon name="eye" size={14} />{previewing ? "Building…" : "Preview Prompt"}</Button>
            <Help text="Shows exactly what the next reply would send (with what is in your message box as the last message), without sending anything. Agents that run just before the reply are not included." />
          </span>
        </Row>
        {previewError && <Row wide><span className="error-text">{previewError}</span></Row>}
      </Group>

      {(inStory || session.cast.some((member) => member.role === "narrator" && member.presence !== "off")) && <NarratorPromptGroup level="chat" layer={session.setup} above={aboveSetup.narratorPrompt} onChange={(setup) => onChangeSession({ ...session, setup })} />}

      {lore}

      {memory}

      {shown && (
        <PromptSheet title="Prompt Preview" testId="prompt-preview" trackers={trackers} parts={shown.parts} budget={shown.budget} notes={shown.notes} sent={shown.sent}
          meta={<>Next reply · preset <strong>{shown.presetName}</strong>{shown.model ? <> · {shown.model}</> : null}</>}
          onClose={() => setShown(null)} onRefresh={() => void runPreview()} refreshing={previewing} />
      )}

      {story && (
        <Group title={`Sampling — ${story.name}`} help={`How the AI picks its words. These settings belong to the connection "${story.name}", so they change it for every session that uses it. Leave a value empty to use the model's own default. Changes apply from the next reply.`}>
          <ParamRows params={story.params} onChange={(params) => void c.save({ ...story, params })} />
          {presetOverrides.length > 0 && preset && (
            <Row wide><span className="hint warn-text" data-testid="preset-overrides">The preset “{preset.name}” sets {presetOverrides.map(([k, v]) => `${k} ${v}`).join(", ")}, which win over these for the story.</span></Row>
          )}
        </Group>
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
