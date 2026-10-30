// Reuse schema definitions without touching a chat's saved values. CODEX, D-043.
import { useEffect, useRef, useState } from "react";
import { parseFieldSetFile, serializeFieldSets, transferFields } from "@homunculus/core";
import { portableSetOf, type SetDraft } from "../trackers.ts";
import { saveExport } from "../files.ts";
import { Button } from "./kit.tsx";

export function FieldSetTools({ sets, current, onChange }: { sets: SetDraft[]; current: SetDraft; onChange: (sets: SetDraft[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [destination, setDestination] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ before: SetDraft[]; after: SetDraft[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(sets); latest.current = sets;
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const keys = selected.filter((key) => current.fields.some((f) => f.key === key));
  const run = (action: () => void) => { setError(""); setNotice(""); try { action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  const apply = (next: SetDraft[], message: string) => {
    setUndo({ before: sets, after: next }); onChange(next); setSelected([]); setNotice(message + " Save the tracker to keep these changes.");
  };
  const transfer = (mode: "copy" | "move") => run(() => {
    const next = transferFields(sets, current.id, destination, keys, mode);
    apply(next, `${keys.length} field(s) ${mode === "copy" ? "copied" : "moved"}.`);
  });
  const exportSets = async (kind: "current" | "selected" | "all") => {
    setBusy(true); setError(""); setNotice("");
    try {
      const sources = kind === "all" ? sets : [current];
      const definitions = sources.map((s) => {
        // Normalize before filtering so temporary keys get the same identity as a normal Save.
        const portable = portableSetOf(s);
        if (kind !== "selected") return portable;
        const fields = portable.fields.filter((_, i) => keys.includes(s.fields[i]!.key));
        const out = { ...portable, fields };
        if (out.presence && !fields.some((f) => f.key === out.presence!.field)) delete out.presence;
        return out;
      });
      const bytes = new TextEncoder().encode(serializeFieldSets(definitions));
      const fileName = `${(kind === "all" ? "field-sets" : current.name).replace(/[^a-zA-Z0-9_-]+/g, "-") || "field-set"}.json`;
      const path = await saveExport({ fileName, bytes, mime: "application/json" });
      setNotice(`Exported to ${path}. Definitions only; saved chat values are not included.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const importFile = async (file: File) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const parsed = parseFieldSetFile(await file.text());
      if (!active.current) return;
      if (latest.current !== sets) throw new Error("The draft changed while the file was being read. Import it again to keep your latest edits.");
      const names = new Set(sets.map((s) => s.name));
      const added = parsed.sets.map((s) => {
        let name = s.name;
        for (let n = 2; names.has(name); n++) name = `${s.name} (${n})`;
        names.add(name);
        return { ...s, name, id: `set-${crypto.randomUUID()}` };
      });
      apply([...sets, ...added], `Imported ${added.length} set(s). Existing sets were kept.`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <details className="set-card field-set-tools" data-testid="field-set-tools">
    <summary>Reuse fields and sets</summary>
    <div className="stack">
      <p className="hint">Copy or move definitions to another set in this tracker. Stable keys keep their meaning. Use JSON files to reuse sets in another tracker. Saved chat values stay unchanged.</p>
      <fieldset disabled={busy}>
        <legend>Fields to reuse</legend>
        <div className="row-line wrap"><button type="button" className="link" onClick={() => setSelected(current.fields.map((f) => f.key))}>Select all fields</button>
          <button type="button" className="link" onClick={() => setSelected([])}>Clear selection</button><span className="hint">{keys.length} selected</span></div>
        {current.fields.map((f) => <label className="check" key={f.key}>
          <input type="checkbox" aria-label={`Select field ${f.label || "New field"}`} checked={keys.includes(f.key)} onChange={(e) => setSelected((old) => e.target.checked ? [...old, f.key] : old.filter((key) => key !== f.key))} />
          <span>{f.label || "New field"}</span>
        </label>)}
        <label className="row-line"><span>Destination set</span><select aria-label="Destination set" value={destination} onChange={(e) => setDestination(e.target.value)}>
          <option value="">Choose a set…</option>{sets.filter((s) => s.id !== current.id).map((s) => <option key={s.id} value={s.id}>{s.name || "(no name)"}</option>)}
        </select></label>
        <div className="row-line wrap">
          <Button small disabled={!keys.length || !destination} onClick={() => transfer("copy")}>Copy fields</Button>
          <Button small disabled={!keys.length || !destination} onClick={() => transfer("move")}>Move fields</Button>
        </div>
      </fieldset>
      <div className="row-line wrap">
        <Button small disabled={busy} onClick={() => void exportSets("current")}>Export this set</Button>
        <Button small disabled={busy || !keys.length} onClick={() => void exportSets("selected")}>Export selected fields</Button>
        <Button small disabled={busy} onClick={() => void exportSets("all")}>Export all sets</Button>
        <Button small disabled={busy} onClick={() => input.current?.click()}>Import sets</Button>
      </div>
      <input ref={input} type="file" accept=".json,application/json" aria-label="Import field sets JSON" hidden disabled={busy} onChange={(e) => {
        const file = e.target.files?.[0]; e.target.value = ""; if (file) void importFile(file);
      }} />
      {undo && sets === undo.after && <button type="button" className="link" disabled={busy} onClick={() => { onChange(undo.before); setUndo(null); setNotice("Last reuse action undone. Save to keep this draft."); setError(""); }}>Undo last reuse action</button>}
      {notice && <p className="hint" role="status">{notice}</p>}{error && <p className="error-text" role="alert">{error}</p>}
    </div>
  </details>;
}
