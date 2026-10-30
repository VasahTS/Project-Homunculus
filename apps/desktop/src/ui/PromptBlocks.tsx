// The same scoped block editor in a chat and on a Story. CODEX, D-042.
import { useState } from "react";
import type { Preset, PresetBlockOverride, SetupLayer } from "@homunculus/schemas";
import { applyPresetOverride, mergePresetOverride, estimateTokens, withPresetBlockOverride, withPresetOrderOverride, withoutPresetOverride, type ResolvedSetup } from "@homunculus/core";
import { Button, Icon, Switch } from "./kit.tsx";
import { SortableList, move } from "./Sortable.tsx";

export function PromptBlocks({ preset, layer, above, level, onChange, onSavePreset, onOpenPreset }: {
  preset: Preset; layer: SetupLayer; above: ResolvedSetup; level: "chat" | "story";
  onChange: (layer: SetupLayer) => void | Promise<void>; onSavePreset: (preset: Preset) => Promise<void>;
  onOpenPreset?: ((id: string) => void) | undefined;
}) {
  const [scope, setScope] = useState<"local" | "preset">("local");
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [keepText, setKeepText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const inherited = applyPresetOverride(preset, above.presetOverrides[preset.id]);
  const effective = applyPresetOverride(preset, mergePresetOverride(above.presetOverrides[preset.id], layer.presetOverrides?.[preset.id]));
  const shown = scope === "preset" ? preset : effective;
  const localName = level === "chat" ? "Only this chat" : "This story and its chats";
  const changed = !!layer.presetOverrides?.[preset.id];
  const run = async (save: () => void | Promise<void>, restored = false) => {
    setBusy(true); setError(""); setStatus("");
    try { await save(); setStatus(restored ? "Inherited blocks restored." : scope === "preset" ? "Saved to the shared preset." : `Applied to ${level === "chat" ? "this chat" : "this story"}.`); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(false); }
  };
  const patch = (id: string, value: PresetBlockOverride) => run(() => scope === "preset"
    ? onSavePreset({ ...preset, blocks: preset.blocks.map((b) => b.id === id ? { ...b, ...value } : b) })
    : onChange(withPresetBlockOverride(layer, inherited, id, value)));
  return (
    <div className="stack scoped-prompt-blocks" data-testid="scoped-prompt-blocks">
      <label className="row-line"><span>Save changes to</span>
        <select aria-label="Prompt edit scope" value={scope} disabled={busy} onChange={(e) => { setScope(e.target.value as "local" | "preset"); setEditing(null); setStatus(""); }}>
          <option value="local">{localName}</option><option value="preset">Shared preset</option>
        </select>
      </label>
      <p className="hint">{scope === "preset" ? "Edits here affect every story and chat using this preset. Local overrides still take priority." : "Only changed fields are kept here. Everything else continues to follow the inherited preset."}</p>
      {changed && <div className="row-line"><span className="hint">changed in this {level}</span>
        <button type="button" className="link" disabled={busy} onClick={() => void run(() => onChange(withoutPresetOverride(layer, preset.id)), true)}>
          {level === "chat" ? "Use inherited blocks" : "Use preset blocks"}
        </button>
      </div>}
      <SortableList items={shown.blocks} id={(b) => b.id} name={(b) => b.name || b.id} label={`Blocks of ${preset.name}`} className="quick-blocks"
        itemClassName={(b) => b.enabled ? "" : "off"}
        onReorder={(from, to) => {
          if (busy) return;
          const blocks = move(shown.blocks, from, to);
          void run(() => scope === "preset" ? onSavePreset({ ...preset, blocks }) : onChange(withPresetOrderOverride(layer, inherited, blocks.map((b) => b.id))));
        }}
        render={(b, handle) => (
          <div className="stack">
            <div className="quick-block">
              {handle}
              <button type="button" className="quick-name" aria-expanded={editing === b.id} onClick={() => {
                setEditing(editing === b.id ? null : b.id); setText(b.content); setKeepText(b.noOverride); setError("");
              }} title="Open this block here">{b.name || b.id}</button>
              {b.marker ? <span className="tag marker">auto</span> : <span className="hint tabular">{b.content.trim() ? `${estimateTokens(b.content)} tok` : "empty"}</span>}
              <Switch label={`${b.name || b.id} on`} checked={b.enabled} disabled={busy} onChange={(enabled) => void patch(b.id, { enabled })} />
            </div>
            {editing === b.id && (b.marker ? <p className="hint">This marker is filled by the app. Its switch and order can still be changed in the selected scope.</p> :
              <div className="stack inline-prompt-editor">
                <label htmlFor={`inline-prompt-${level}-${b.id}`}>Block text</label>
                <textarea id={`inline-prompt-${level}-${b.id}`} aria-label={`Text of ${b.name || b.id}`} rows={6} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
                {(b.id === "main" || b.id === "jailbreak") && <label className="check">
                  <input type="checkbox" checked={keepText} onChange={(e) => setKeepText(e.target.checked)} />Keep this block's text over card instructions
                </label>}
                <div className="row-line">
                  <Button small disabled={busy} onClick={() => void patch(b.id, { content: text, ...((b.id === "main" || b.id === "jailbreak") ? { noOverride: keepText } : {}) }).then((ok) => { if (ok) setEditing(null); })}>Apply block</Button>
                  <Button small variant="plain" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>)}
          </div>
        )} />
      <div className="preset-foot"><span className="hint">Drag <Icon name="grip" size={11} /> to reorder. Open a text block to edit it here.</span>
        {onOpenPreset && <button type="button" className="link" onClick={() => onOpenPreset(preset.id)}>Edit Preset</button>}
      </div>
      {status && <p className="hint" role="status">{status}</p>}{error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
