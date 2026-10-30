// Narrator placement uses the normal setup inheritance, never stored chat messages. CODEX, D-042.
import type { NarratorPrompt, SetupLayer } from "@homunculus/schemas";
import type { ResolvedNarratorPrompt } from "@homunculus/core";
import { Group, Icon, Row } from "./kit.tsx";
import { useEffect, useState } from "react";

export function NarratorPromptGroup({ layer, above, onChange, level, disclosure = false }: {
  layer: SetupLayer; above: ResolvedNarratorPrompt; level: "chat" | "story";
  onChange: (layer: SetupLayer) => void | Promise<void>;
  /** Story setup keeps advanced placement beside its narrator, closed until requested. CODEX, D-045. */
  disclosure?: boolean;
}) {
  const [error, setError] = useState("");
  const save = async (out: SetupLayer) => {
    setError("");
    try { await onChange(out); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const own = layer.narratorPrompt ?? {};
  const value = { ...above, ...own };
  const set = (patch: NarratorPrompt) => {
    const next = { ...own };
    for (const [key, v] of Object.entries(patch) as Array<[keyof NarratorPrompt, never]>) {
      if (v === above[key]) delete next[key]; else next[key] = v;
    }
    const out = { ...layer };
    if (Object.keys(next).length) out.narratorPrompt = next; else delete out.narratorPrompt;
    void save(out);
  };
  const controls = <>
    <Row label="Where it goes"><select aria-label="Narrator placement" value={value.position} onChange={(e) => set({ position: e.target.value as ResolvedNarratorPrompt["position"] })}>
      <option value="card">In the character card's place</option><option value="system">System prompt, after Main</option><option value="inChat">Inside the chat prompt</option>
    </select></Row>
    {value.position !== "inChat" && <Row label="Also in chat"><label className="check"><input type="checkbox" aria-label="Also send narrator in chat" checked={value.alsoInChat} onChange={(e) => set({ alsoInChat: e.target.checked })} />Repeat in the chat prompt</label></Row>}
    {(value.position === "inChat" || value.alsoInChat) && <>
      <Row label="Messages from the end"><NumberInput label="Narrator depth" min={0} max={999} value={value.depth} onCommit={(n) => set({ depth: n })} /></Row>
      <Row label="Sent as"><select aria-label="Narrator role" value={value.role} onChange={(e) => set({ role: e.target.value as ResolvedNarratorPrompt["role"] })}><option value="system">System</option><option value="user">User</option><option value="assistant">AI</option></select></Row>
      <Row label="Order at the same depth"><NumberInput label="Narrator injection order" value={value.order} onCommit={(n) => set({ order: n })} /></Row>
    </>}
    {Object.keys(own).length > 0 && <Row wide><span className="row-line wrap"><span className="hint">changed in this {level}</span><button className="link" type="button" onClick={() => { const out = { ...layer }; delete out.narratorPrompt; void save(out); }}>Use inherited placement</button></span></Row>}
    {error && <Row wide><p role="alert" className="error-text">{error}</p></Row>}
  </>;
  if (disclosure) {
    const label = value.position === "card" ? "Card" : value.position === "system" ? "System" : `In chat · ${value.depth} back`;
    return <details className="narrator-placement" data-testid="narrator-prompt">
      <summary title="Choose where the AI reads the narrator's instructions">
        <Icon name="chevron" size={12} /><span>Prompt placement</span>
        <span className="placement-value">{label}{value.position !== "inChat" && value.alsoInChat ? " + in chat" : ""}</span>
      </summary>
      <div className="group">{controls}</div>
    </details>;
  }
  return <Group title="Narrator in the prompt" testId="narrator-prompt" help="Choose where the AI reads the narrator's instructions. Card placement preserves the existing preset behavior. These settings do not add messages to your saved conversation.">{controls}</Group>;
}

/** A whole number saved when you leave the box or press Enter, so clearing it to type never saves 0 (D-046). */
function NumberInput({ label, value, min, max, onCommit }: { label: string; value: number; min?: number; max?: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text.trim());
    const ok = text.trim() !== "" && Number.isSafeInteger(n) && (min === undefined || n >= min) && (max === undefined || n <= max);
    if (ok && n !== value) onCommit(n); else if (!ok) setText(String(value));
  };
  return <input type="number" aria-label={label} min={min} max={max} value={text} onChange={(e) => setText(e.target.value)}
    onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setText(String(value)); }} />;
}
