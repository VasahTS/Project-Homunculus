// The same scoped block editor in a chat and on a Story. CODEX, D-042.
import { useEffect, useRef, useState } from "react";
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
  const root = useRef<HTMLDivElement>(null);
  // Queue writes and merge against the newest layer, including saves awaiting a parent refresh.
  const latest = useRef({ layer, preset, above, onChange, onSavePreset });
  const seen = useRef({ layer, preset });
  if (seen.current.layer !== layer) { latest.current.layer = layer; seen.current.layer = layer; }
  if (seen.current.preset !== preset) { latest.current.preset = preset; seen.current.preset = preset; }
  Object.assign(latest.current, { above, onChange, onSavePreset });
  const tail = useRef(Promise.resolve());
  const writes = useRef(0);
  const pending = useRef<(() => Promise<boolean>) | null>(null);
  const flushing = useRef<Promise<boolean> | null>(null);
  const effective = applyPresetOverride(preset, mergePresetOverride(above.presetOverrides[preset.id], layer.presetOverrides?.[preset.id]));
  const shown = scope === "preset" ? preset : effective;
  const localName = level === "chat" ? "Only this chat" : "This story and its chats";
  const changed = !!layer.presetOverrides?.[preset.id];
  const run = async (save: () => void | Promise<void>, restored = false) => {
    writes.current++; setBusy(true); setError(""); setStatus("");
    const task = tail.current.then(save);
    tail.current = task.then(() => {}, () => {});
    try { await task; setStatus(restored ? "Inherited blocks restored." : scope === "preset" ? "Saved to the shared preset." : `Applied to ${level === "chat" ? "this chat" : "this story"}.`); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
    finally { writes.current--; setBusy(writes.current > 0); }
  };
  const saveLayer = async (edit: (layer: SetupLayer, inherited: Preset) => SetupLayer) => {
    const ctx = latest.current, before = ctx.layer;
    const next = edit(before, applyPresetOverride(ctx.preset, ctx.above.presetOverrides[ctx.preset.id]));
    ctx.layer = next;
    try { await ctx.onChange(next); } catch (e) { if (ctx.layer === next) ctx.layer = before; throw e; }
  };
  const savePreset = async (edit: (preset: Preset) => Preset) => {
    const ctx = latest.current, before = ctx.preset, next = edit(before);
    ctx.preset = next;
    try { await ctx.onSavePreset(next); } catch (e) { if (ctx.preset === next) ctx.preset = before; throw e; }
  };
  const patch = (id: string, value: PresetBlockOverride, target = scope) => run(() => target === "preset"
    ? savePreset((p) => ({ ...p, blocks: p.blocks.map((b) => b.id === id ? { ...b, ...value } : b) }))
    : saveLayer((l, p) => withPresetBlockOverride(l, p, id, value)));
  const flush = () => {
    const save = pending.current;
    if (!save) return flushing.current ?? Promise.resolve(true);
    pending.current = null;
    const task = save().then((ok) => { if (!ok && !pending.current) pending.current = save; return ok; }).finally(() => { if (flushing.current === task) flushing.current = null; });
    flushing.current = task;
    return task;
  };
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => () => { void flushRef.current(); }, []);
  const editText = (id: string, content: string, noOverride: boolean) => {
    setText(content); setKeepText(noOverride);
    pending.current = () => patch(id, { content, ...((id === "main" || id === "jailbreak") ? { noOverride } : {}) });
    setStatus("Unsaved changes — saved when you leave or close this block.");
  };
  return (
    <div ref={root} className="stack scoped-prompt-blocks" data-testid="scoped-prompt-blocks">
      <label className="row-line"><span>Save changes to</span>
        <select aria-label="Prompt edit scope" value={scope} disabled={busy} onChange={(e) => { const target = e.target.value as "local" | "preset"; void flush().then((ok) => { if (ok) { setScope(target); setEditing(null); setStatus(""); } }); }}>
          <option value="local">{localName}</option><option value="preset">Shared preset</option>
        </select>
      </label>
      <p className="hint">{scope === "preset" ? "Edits here affect every story and chat using this preset. Local overrides still take priority." : "Only changed fields are kept here. Everything else continues to follow the inherited preset."}</p>
      {changed && <div className="row-line"><span className="hint">changed in this {level}</span>
        <button type="button" className="link" disabled={busy} onClick={() => { pending.current = null; setEditing(null); void run(() => saveLayer((l) => withoutPresetOverride(l, preset.id)), true); }}>
          {level === "chat" ? "Use inherited blocks" : "Use preset blocks"}
        </button>
      </div>}
      <SortableList items={shown.blocks} id={(b) => b.id} name={(b) => b.name || b.id} label={`Blocks of ${preset.name}`} className="quick-blocks"
        itemClassName={(b) => b.enabled ? "" : "off"}
        onReorder={(from, to) => {
          if (busy) return;
          const blocks = move(shown.blocks, from, to);
          void flush().then((ok) => { if (ok) void run(() => scope === "preset"
            ? savePreset((p) => applyPresetOverride(p, { order: blocks.map((b) => b.id) }))
            : saveLayer((l, p) => withPresetOrderOverride(l, p, blocks.map((b) => b.id)))); });
        }}
        render={(b, handle) => (
          <div className="stack">
            <div className="quick-block">
              {handle}
              <button type="button" className="quick-name" aria-expanded={editing === b.id} onClick={() => {
                void flush().then((ok) => { if (ok) { setEditing(editing === b.id ? null : b.id); setText(b.content); setKeepText(b.noOverride); setError(""); } });
              }} title="Open this block here">{b.name || b.id}</button>
              {b.marker ? <span className="tag marker">auto</span> : <span className="hint tabular">{b.content.trim() ? `${estimateTokens(b.content)} tok` : "empty"}</span>}
              <Switch label={`${b.name || b.id} on`} checked={b.enabled} disabled={busy} onChange={(enabled) => void flush().then((ok) => { if (ok) void patch(b.id, { enabled }); })} />
            </div>
            {editing === b.id && (b.marker ? <p className="hint">This marker is filled by the app. Its switch and order can still be changed in the selected scope.</p> :
              <div className="stack inline-prompt-editor" onBlur={(e) => { if (!root.current?.contains(e.relatedTarget)) void flush(); }}>
                <label htmlFor={`inline-prompt-${level}-${b.id}`}>Block text</label>
                <textarea id={`inline-prompt-${level}-${b.id}`} aria-label={`Text of ${b.name || b.id}`} rows={6} value={text} disabled={busy} onChange={(e) => editText(b.id, e.target.value, keepText)} />
                {(b.id === "main" || b.id === "jailbreak") && <label className="check">
                  <input type="checkbox" checked={keepText} disabled={busy} onChange={(e) => editText(b.id, text, e.target.checked)} />Keep this block's text over card instructions
                </label>}
                <div className="row-line">
                  <Button small disabled={busy} onClick={() => void flush().then((ok) => { if (ok) setEditing(null); })}>Apply block</Button>
                  <Button small variant="plain" disabled={busy} onClick={() => { pending.current = null; setEditing(null); setStatus(""); }}>Cancel</Button>
                </div>
              </div>)}
          </div>
        )} />
      <div className="preset-foot"><span className="hint">Drag <Icon name="grip" size={11} /> to reorder. Open a text block to edit it here.</span>
        {onOpenPreset && <button type="button" className="link" onClick={() => void flush().then((ok) => { if (ok) onOpenPreset(preset.id); })}>Edit Preset</button>}
      </div>
      {status && <p className="hint" role="status">{status}</p>}{error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
