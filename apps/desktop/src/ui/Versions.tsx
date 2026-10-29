// Homunculus 2 — shared pieces for things with versions and a history (characters, personas…).
// Author: CLAUDE, 2026-10-28 (slice 1, BLUEPRINT §2.5–2.6).
//
// - VersionBar: pick the main version or a variant ("Lyra — Fantasy"), add, rename, delete one.
// - useVersionedDraft: reads/writes a field of the main version or of the picked variant (a variant
//   keeps only what it changes; the rest follows the main version).
// - HistoryList: every saved version of the item, what changed, and "restore".
import { useState, type ReactNode } from "react";
import type { HistoryEntry } from "@homunculus/schemas";
import { pruneOverrides } from "@homunculus/core";
import { ConfirmButton, Help } from "./Help.tsx";
import { Button } from "./kit.tsx";

export interface VariantLike<F> { id: string; label: string; overrides: Partial<F>; hasOwnAvatar: boolean }
interface WithVariants<F> { variants: Array<VariantLike<F>> }

export function VersionBar({ variants, current, onPick, onAdd, onRename, onDelete, what }: {
  variants: Array<{ id: string; label: string }>;
  current: string | null;
  onPick: (id: string | null) => void;
  onAdd: (label: string) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  /** "character" or "persona", for the help texts. */
  what: string;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const cur = variants.find((v) => v.id === current);
  const add = () => {
    const l = label.trim();
    if (!l) return;
    onAdd(l);
    setLabel(""); setAdding(false);
  };
  return (
    <div className="versions" data-testid="versions">
      <div className="versions-row" role="tablist" aria-label="Versions">
        <span className="label-row muted">Version <Help text={`A ${what} can have several versions side by side (for example "Fantasy" and "Modern"). A version keeps only what you change in it; everything else follows the main version. Each session picks which version it uses.`} /></span>
        <button type="button" role="tab" aria-selected={current === null} className={`chip${current === null ? " on" : ""}`} onClick={() => onPick(null)}>Main</button>
        {variants.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={current === v.id} className={`chip${current === v.id ? " on" : ""}`} onClick={() => onPick(v.id)}>{v.label}</button>
        ))}
        {!adding && <button type="button" className="chip add" onClick={() => setAdding(true)}>+ New Version</button>}
      </div>
      {adding && (
        <div className="versions-add">
          <input autoFocus aria-label="New version name" placeholder='Name of the version, e.g. "Modern"' value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") setAdding(false); }} />
          <Button small variant="prominent" onClick={add} disabled={!label.trim()}>Add Version</Button>
          <Button small variant="plain" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      )}
      {cur && (
        <div className="versions-current">
          <label className="inline-label">
            <span className="label-row">Version name <Help text="Shown when a session picks a version." /></span>
            <input aria-label="Version name" value={cur.label} onChange={(e) => onRename(cur.id, e.target.value)} />
          </label>
          <ConfirmButton label="Delete Version" confirmLabel="Click Again to Delete" className="btn btn-plain btn-small danger-text" onConfirm={() => onDelete(cur.id)} />
          <p className="hint">Fields marked <span className="changed-mark">changed in this version</span> differ from Main. The others follow Main.</p>
        </div>
      )}
    </div>
  );
}

/** Reading and writing fields of the main version or of a variant, on a draft held by the editor. */
export function useVersionedDraft<F extends object, T extends F & WithVariants<F>>(
  draft: T, setDraft: (fn: (d: T) => T) => void, variantId: string | null,
) {
  const variant = variantId ? draft.variants.find((v) => v.id === variantId) : undefined;
  const get = <K extends keyof F>(key: K): F[K] => {
    const o = variant?.overrides[key];
    return (o !== undefined ? o : draft[key]) as F[K];
  };
  const isChanged = (key: keyof F) => !!variant && variant.overrides[key] !== undefined
    && JSON.stringify(variant.overrides[key]) !== JSON.stringify(draft[key]);
  const set = <K extends keyof F>(key: K, value: F[K]) => setDraft((d) => {
    if (!variant) return { ...d, [key]: value };
    return { ...d, variants: d.variants.map((v) => (v.id === variant.id ? { ...v, overrides: { ...v.overrides, [key]: value } } : v)) };
  });
  const reset = (key: keyof F) => setDraft((d) => ({
    ...d,
    variants: d.variants.map((v) => {
      if (v.id !== variantId) return v;
      const rest = { ...(v.overrides as Record<string, unknown>) };
      delete rest[key as string];
      return { ...v, overrides: rest as unknown as Partial<F> };
    }),
  }));
  return { variant, get, set, isChanged, reset };
}

/** Before saving: drop overrides that are equal to the main version. */
export function pruneVariants<F extends object, T extends F & WithVariants<F>>(d: T): T {
  return { ...d, variants: d.variants.map((v) => ({ ...v, label: v.label.trim() || "Version", overrides: pruneOverrides(d as unknown as F, v.overrides) })) };
}

/** A field label that shows when the field differs in the picked version, with a way back to Main. */
export function FieldLabel({ label, help, changed, onReset }: { label: string; help: string; changed: boolean; onReset: () => void }) {
  return (
    <span className="label-row">
      {label} <Help text={help} />
      {changed && <>
        <span className="changed-mark">changed in this version</span>
        <button type="button" className="link quiet" onClick={(e) => { e.preventDefault(); onReset(); }}>Use Main</button>
      </>}
    </span>
  );
}

export interface HistoryField { key: string; label: string }

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
/** A saved value in words: texts as they are, lists one per line, versions by name, other things short. */
function valueText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v.map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object" && "label" in x) {
        const o = Object.keys((x as { overrides?: object }).overrides ?? {});
        return `${String((x as { label: unknown }).label)}${o.length ? ` (changes: ${o.join(", ")})` : " (no changes yet)"}`;
      }
      return JSON.stringify(x);
    }).join("\n\n");
  }
  if (typeof v === "object") return Object.entries(v as object).map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : String(x)}`).join("\n");
  return String(v);
}

/** Every saved version, newest first; what each save changed; restore an old one. */
export function HistoryList({ entries, fields, onRestore, loading }: {
  entries: HistoryEntry[]; fields: HistoryField[]; onRestore: (data: unknown) => void; loading?: boolean;
}): ReactNode {
  if (loading) return <p className="hint">Loading…</p>;
  if (entries.length === 0) return <p className="hint">No saved versions yet. Every time you save, the version is kept here.</p>;
  return (
    <ol className="history-list" data-testid="history">
      {entries.map((e, i) => {
        const prev = entries[i + 1]?.data as Record<string, unknown> | undefined;
        const cur = e.data as Record<string, unknown>;
        const changed = prev ? fields.filter((f) => JSON.stringify(cur[f.key]) !== JSON.stringify(prev[f.key])) : [];
        return (
          <li key={e.id} className="history-item">
            <details>
              <summary>
                <span className="tabular">{when(e.createdAt)}</span>
                {i === 0 && <span className="badge">current</span>}
                <span className="hint">{prev ? (changed.length ? `changed: ${changed.map((f) => f.label).join(", ")}` : "small change") : "first saved version"}</span>
              </summary>
              <div className="history-body">
                {(prev ? changed : fields.filter((f) => valueText(cur[f.key]).trim())).map((f) => (
                  <div key={f.key} className="history-field">
                    <strong>{f.label}</strong>
                    <pre>{valueText(cur[f.key]) || "(empty)"}</pre>
                  </div>
                ))}
                {i > 0 && <ConfirmButton label="Restore This Version" confirmLabel="Click Again to Restore" className="btn btn-bordered btn-small" onConfirm={() => onRestore(e.data)} />}
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
