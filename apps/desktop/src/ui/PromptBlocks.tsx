// The quick block editor of the Prompt tab. CODEX, D-042; CLAUDE, D-046: the shared preset is the default target
// ("quick edits to the prompt's preset"), "only this chat" is the secondary choice, text saves itself as you type.
import { useEffect, useRef, useState } from "react";
import type { Preset, PresetBlockOverride, SetupLayer } from "@homunculus/schemas";
import { applyPresetOverride, mergePresetOverride, estimateTokens, withPresetBlockOverride, withPresetOrderOverride, withoutPresetOverride, type ResolvedSetup } from "@homunculus/core";
import { Icon, Switch } from "./kit.tsx";
import { SortableList, move } from "./Sortable.tsx";

/** How long typing pauses before the text is saved. */
const AUTOSAVE_MS = 700;

export function PromptBlocks({ preset, layer, above, level, onChange, onSavePreset, onOpenPreset }: {
  preset: Preset; layer: SetupLayer; above: ResolvedSetup; level: "chat" | "story";
  onChange: (layer: SetupLayer) => void | Promise<void>; onSavePreset: (preset: Preset) => Promise<void>;
  onOpenPreset?: ((id: string) => void) | undefined;
}) {
  const [scope, setScope] = useState<"local" | "preset">("preset");
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [keepText, setKeepText] = useState(false);
  /** The block as it was when opened, for "Undo changes". */
  const [opened, setOpened] = useState<{ content: string; noOverride: boolean } | null>(null);
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fromAbove = above.presetOverrides[preset.id];
  const own = layer.presetOverrides?.[preset.id];
  const effective = applyPresetOverride(preset, mergePresetOverride(fromAbove, own));
  const shown = scope === "preset" ? preset : effective;
  const changed = !!own;
  const here = level === "chat" ? "this chat" : "this story";
  /** Which blocks a local layer changes, so shared edits that will not show here are never a mystery. */
  const localTag = (id: string): string | null => own?.blocks?.[id] ? `changed in ${here}` : fromAbove?.blocks?.[id] ? "changed in the story" : null;

  const run = async (save: () => void | Promise<void>, done: string) => {
    writes.current++; setBusy(true); setError("");
    const task = tail.current.then(save);
    tail.current = task.then(() => {}, () => {});
    try { await task; setStatus(done); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setStatus(""); return false; }
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
  const doneText = (target: "local" | "preset") => target === "preset" ? `Saved to “${preset.name}”.` : `Saved for ${here} only.`;
  const patch = (id: string, value: PresetBlockOverride, target = scope) => run(() => target === "preset"
    ? savePreset((p) => ({ ...p, blocks: p.blocks.map((b) => b.id === id ? { ...b, ...value } : b) }))
    : saveLayer((l, p) => withPresetBlockOverride(l, p, id, value)), doneText(target));
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const save = pending.current;
    if (!save) return flushing.current ?? Promise.resolve(true);
    pending.current = null;
    const task = save().then((ok) => { if (!ok && !pending.current) pending.current = save; return ok; }).finally(() => { if (flushing.current === task) flushing.current = null; });
    flushing.current = task;
    return task;
  };
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => () => { void flushRef.current(); }, []);
  /** Saves after a short pause; leaving the block, the tab or the scope saves at once. */
  const editText = (id: string, content: string, noOverride: boolean) => {
    setText(content); setKeepText(noOverride); setStatus("Saving…");
    const target = scope;
    pending.current = () => patch(id, { content, ...((id === "main" || id === "jailbreak") ? { noOverride } : {}) }, target);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void flushRef.current(); }, AUTOSAVE_MS);
  };
  const switchScope = (target: "local" | "preset") => void flush().then((ok) => { if (ok) { setScope(target); setEditing(null); setStatus(""); } });
  const undoChanges = (id: string) => {
    if (!opened) return;
    editText(id, opened.content, opened.noOverride);
    void flush().then((ok) => { if (ok) setStatus("Changes undone."); });
  };

  return (
    <div ref={root} className="stack scoped-prompt-blocks" data-testid="scoped-prompt-blocks">
      <div className="prompt-scope hint" data-testid="prompt-scope" data-scope={scope}>
        {scope === "preset"
          ? <><span>Edits change <b>{preset.name}</b> wherever it is used.</span>
              <button type="button" className="link quiet" disabled={busy} onClick={() => switchScope("local")}>Only {here}…</button></>
          : <><span>Edits apply to <b>{here} only</b>.</span>
              <button type="button" className="link quiet" disabled={busy} onClick={() => switchScope("preset")}>Edit the shared preset</button></>}
      </div>
      {changed && <div className="row-line"><span className="hint">Some blocks are changed in {here}.</span>
        <button type="button" className="link" disabled={busy} onClick={() => { pending.current = null; setEditing(null); void run(() => saveLayer((l) => withoutPresetOverride(l, preset.id)), "Inherited blocks restored."); }}>
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
            : saveLayer((l, p) => withPresetOrderOverride(l, p, blocks.map((b) => b.id))), doneText(scope)); });
        }}
        render={(b, handle) => {
          const tag = scope === "preset" ? localTag(b.id) : null;
          return (
          <div className="stack">
            <div className="quick-block">
              {handle}
              <button type="button" className="quick-name" aria-expanded={editing === b.id} onClick={() => {
                void flush().then((ok) => { if (ok) {
                  const opening = editing !== b.id;
                  setEditing(opening ? b.id : null); setText(b.content); setKeepText(b.noOverride); setError("");
                  setOpened(opening ? { content: b.content, noOverride: b.noOverride } : null);
                } });
              }} title="Open this block here">{b.name || b.id}</button>
              {tag && <span className="tag" title={`A local change wins over the shared preset in ${here}. Choose “Only ${here}…” to see or undo it.`}>{tag}</span>}
              {b.marker ? <span className="tag marker">auto</span> : <span className="hint tabular">{b.content.trim() ? `${estimateTokens(b.content)} tok` : "empty"}</span>}
              <Switch label={`${b.name || b.id} on`} checked={b.enabled} disabled={busy} onChange={(enabled) => void flush().then((ok) => { if (ok) void patch(b.id, { enabled }); })} />
            </div>
            {editing === b.id && (b.marker ? <p className="hint">This marker is filled by the app. Its switch and order can still be changed.</p> :
              <div className="stack inline-prompt-editor" onBlur={(e) => { if (!root.current?.contains(e.relatedTarget)) void flush(); }}>
                <textarea aria-label={`Text of ${b.name || b.id}`} rows={6} value={text} onChange={(e) => editText(b.id, e.target.value, keepText)} />
                {(b.id === "main" || b.id === "jailbreak") && <label className="check">
                  <input type="checkbox" checked={keepText} onChange={(e) => editText(b.id, text, e.target.checked)} />Keep this block's text over card instructions
                </label>}
                <div className="row-line inline-prompt-foot">
                  <span className="hint" role="status">{status || "Saves as you type."}</span>
                  {opened && (text !== opened.content || keepText !== opened.noOverride) &&
                    <button type="button" className="link quiet" disabled={busy} onClick={() => undoChanges(b.id)}>Undo changes</button>}
                </div>
              </div>)}
          </div>
          );
        }} />
      <div className="preset-foot"><span className="hint">{preset.contextSize ? `Context ${preset.contextSize.toLocaleString("en-US")} tokens · ` : ""}drag <Icon name="grip" size={11} /> to reorder</span>
        {onOpenPreset && <button type="button" className="link" onClick={() => void flush().then((ok) => { if (ok) onOpenPreset(preset.id); })}>Edit Preset</button>}
      </div>
      {!editing && status && status !== "Saving…" && <p className="hint" role="status">{status}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
