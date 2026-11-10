// Homunculus 2 — the cues' values in the Scene tab (D-113, decision 2): values marked "Show in Scene", as they are after
// the message on screen, editable like a tracker field (your edit wins at that message). Author: CLAUDE, 2026-11-10.
import { useEffect, useState } from "react";
import type { ResolvedSetup } from "@homunculus/core";
import type { Cue, Session } from "@homunculus/schemas";
import type { AppServices } from "../core-instance.ts";
import { layerHasCue, layerWithCue } from "../cues.ts";

interface Row { cue: Cue; key: string; label: string; value: unknown; mine: boolean }

export function SceneCues({ svc, session, cues, messageId, refreshKey, onChanged }: {
  svc: AppServices; session: Session; cues: Cue[]; messageId: string | null; refreshKey: number; onChanged: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      const setup = await svc.chat.turns.setupFor(session);
      const cast = new Set(session.cast.flatMap((c) => (c.characterId && c.presence !== "off" ? [c.characterId] : [])));
      const off = new Set(session.setup.cues?.remove ?? []);
      const on = cues.filter((c) => !off.has(c.id) && (setup.cues.includes(c.id) || c.characterIds.some((id) => cast.has(id)) || layerHasCue(session.setup, c.id)));
      const shown = on.flatMap((c) => c.values.filter((v) => v.showInScene).map((v) => ({ cue: c, v })));
      if (!shown.length || !messageId) { if (live) setRows([]); return; }
      const [state, mine] = await Promise.all([svc.core.state.resolve(session.id, messageId), svc.store.getUserDelta(messageId)]);
      if (live) setRows(shown.map(({ cue, v }) => ({ cue, key: v.key, label: v.label || v.key, value: state[cue.namespace]?.[v.key] ?? v.initial, mine: v.key in (mine?.[cue.namespace] ?? {}) })));
    })();
    return () => { live = false; };
  }, [svc, session, cues, messageId, refreshKey]);
  if (!rows.length) return null;
  const commit = async (r: Row, text: string) => {
    if (!messageId) return;
    setError("");
    const value = text.trim() !== "" && Number.isFinite(Number(text)) && typeof r.value === "number" ? Number(text) : text;
    try { await svc.chat.editState(messageId, { [r.cue.namespace]: { [r.key]: value as never } }); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const byCue = [...new Set(rows.map((r) => r.cue))];
  return (
    <section className="q-list scene-cues" aria-label="Cues" data-testid="scene-cues">
      {error && <div className="error-bar inline" role="alert">{error}</div>}
      {byCue.map((cue) => (
        <div key={cue.id}>
          <div className="q-gh">{cue.icon ? `${cue.icon} ` : ""}{cue.name}</div>
          <div className="q-group">
            {rows.filter((r) => r.cue === cue).map((r) => (
              <div key={r.key} className="q-kv">
                <span className="q-k">{r.label}</span>
                <span className="q-v"><CueValueBox value={r.value} label={`${cue.name}: ${r.label}`} disabled={!messageId} onCommit={(t) => void commit(r, t)} />
                  {r.mine && <span className="edited-mark" title="You changed this value at this message"> ✎</span>}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function CueValueBox({ value, label, disabled, onCommit }: { value: unknown; label: string; disabled: boolean; onCommit: (text: string) => void }) {
  const shown = value === undefined || value === null ? "" : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return <input className="scene-cue-input" aria-label={label} value={text} disabled={disabled} data-testid="scene-cue-value"
    onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== shown) onCommit(text); }}
    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setText(shown); }} />;
}

/**
 * The Prompt tab's Cues card (D-113): every cue with a box for this chat. What the chat inherits (on in every chat, on in
 * its story, tied to a character here) shows ticked; a change here only touches this chat ("changed in this chat").
 */
export function SessionCues({ session, cues, above, onChangeSession, onOpenLibrary }: {
  session: Session; cues: Cue[]; above: ResolvedSetup; onChangeSession: (s: Session) => void; onOpenLibrary: () => void;
}) {
  if (!cues.length) return <p className="hint prompt-card-empty">No cues yet. <button type="button" className="link" onClick={onOpenLibrary}>Library → Cues</button>: rules that react to the chat with no AI call.</p>;
  const cast = new Set(session.cast.flatMap((c) => (c.characterId && c.presence !== "off" ? [c.characterId] : [])));
  const inherited = (c: Cue) => above.cues.includes(c.id) || c.characterIds.some((id) => cast.has(id));
  const sorted = [...cues].sort((a, b) => Number(layerHasCue(session.setup, b.id, inherited(b))) - Number(layerHasCue(session.setup, a.id, inherited(a))) || a.name.localeCompare(b.name));
  return (
    <div className="setup-group" data-testid="session-cues">
      {sorted.map((c) => {
        const inh = inherited(c);
        const on = layerHasCue(session.setup, c.id, inh);
        const changed = on !== inh;
        const from = c.characterIds.some((id) => cast.has(id)) ? "with its character" : above.cues.includes(c.id) ? "from the story or every chat" : "";
        return (
          <div key={c.id} className={`setup-row tracker${changed ? " changed" : ""}`}>
            <input type="checkbox" className="setup-check" aria-label={c.name} checked={on} onChange={(e) => onChangeSession({ ...session, setup: layerWithCue(session.setup, c.id, e.target.checked, inh) })} />
            <span className="setup-k grow"><span>{c.icon ? `${c.icon} ` : ""}{c.name}</span>
              <small>{changed ? (on ? "on in this chat" : `off in this chat · ${from || "on above"}`) : on ? from : c.help || "no AI call"}</small>
              {changed && <span className="changed-wrap"><span className="changed-chip">changed in this chat</span><button type="button" className="link" onClick={() => onChangeSession({ ...session, setup: layerWithCue(session.setup, c.id, inh, inh) })}>Undo</button></span>}</span>
          </div>
        );
      })}
    </div>
  );
}
