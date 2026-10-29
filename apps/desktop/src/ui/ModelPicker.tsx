// Homunculus 2 — pick a model from the service's own list: search, "thinking only", sort by price or size.
// Author: CLAUDE, 2026-10-28 (slice 1b, D-020). Lists are kept for this run of the app, per service + address,
// so opening the picker again is instant; "Refresh" asks the service again.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelInfo } from "@homunculus/core";
import { Help } from "./Help.tsx";
import { Button, Switch } from "./kit.tsx";

const cache = new Map<string, ModelInfo[]>();
export const cachedModels = (cacheKey: string) => cache.get(cacheKey);
/** Keeps a list fetched elsewhere (Quick Connection), so the pickers share it. */
export const rememberModels = (cacheKey: string, list: ModelInfo[]) => { cache.set(cacheKey, list); };

type Sort = "name" | "cheap" | "context";
const SHOW_AT_MOST = 300;

const fmtContext = (n?: number) => (n ? (n >= 1000 ? `${Math.round(n / 1000)}k context` : `${n} context`) : "");
const fmtPrice = (n?: number) => (n === undefined ? "?" : n === 0 ? "free" : `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`);
export function modelMeta(m: ModelInfo): string {
  const parts = [fmtContext(m.contextLength)];
  if (m.price) parts.push(`${fmtPrice(m.price.input)} in / ${fmtPrice(m.price.output)} out per M tokens`);
  if (m.reasoning) parts.push(m.efforts ? `thinks (${m.efforts.join(", ")})` : "thinks");
  return parts.filter(Boolean).join(" · ");
}

export function ModelPicker({ cacheKey, current, load, onPick, onClose, onLoaded }: {
  /** Which list this is (service + address). */
  cacheKey: string;
  current: string;
  load: (signal: AbortSignal) => Promise<ModelInfo[]>;
  onPick: (m: ModelInfo) => void;
  onClose: () => void;
  /** Called when a fresh list arrives (so the editor can show the model's details). */
  onLoaded?: (list: ModelInfo[]) => void;
}) {
  const [models, setModels] = useState<ModelInfo[] | null>(() => cache.get(cacheKey) ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [thinkingOnly, setThinkingOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("name");
  const search = useRef<HTMLInputElement>(null);
  const ctrl = useRef<AbortController | null>(null);

  const fetchList = async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true); setError("");
    try {
      const list = await load(c.signal);
      cache.set(cacheKey, list);
      setModels(list);
      onLoaded?.(list);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    }
    if (!c.signal.aborted) setLoading(false);
  };
  useEffect(() => {
    search.current?.focus();
    if (!cache.has(cacheKey)) void fetchList();
    return () => ctrl.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let list = (models ?? []).filter((m) => {
      if (thinkingOnly && !m.reasoning) return false;
      const hay = `${m.id} ${m.name ?? ""} ${m.description ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    if (sort === "cheap") list = [...list].sort((a, b) => ((a.price?.input ?? 1e9) + (a.price?.output ?? 1e9)) - ((b.price?.input ?? 1e9) + (b.price?.output ?? 1e9)));
    if (sort === "context") list = [...list].sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0));
    return list;
  }, [models, q, thinkingOnly, sort]);

  return (
    <div className="model-picker" data-testid="model-picker"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="model-picker-bar">
        <input ref={search} aria-label="Search models" placeholder="Search by name or ID, e.g. glm thinking" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && shown[0]) { e.preventDefault(); onPick(shown[0]); } }} />
        <select aria-label="Sort models" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="name">By name</option>
          <option value="cheap">Cheapest first</option>
          <option value="context">Largest context first</option>
        </select>
        <span className="model-toggle">
          <Switch label="Thinking models only" checked={thinkingOnly} onChange={setThinkingOnly} />
          <span className="label-row">Thinking only <Help text="Only models that think before answering (they show 'Reasoning' above the reply). Not every service says which models think." /></span>
        </span>
      </div>
      <div className="model-picker-status hint">
        {loading ? "Asking the service for its models…"
          : models ? `${shown.length === models.length ? models.length : `${shown.length} of ${models.length}`} models${shown.length > SHOW_AT_MOST ? ` (showing the first ${SHOW_AT_MOST} — search to narrow)` : ""}`
            : ""}
        <span className="spacer" />
        <button type="button" className="link" onClick={() => void fetchList()} disabled={loading}>Refresh</button>
        <button type="button" className="link quiet" onClick={onClose}>Close</button>
      </div>
      {error && <div className="error-bar inline" role="alert">{error}</div>}
      <ul className="model-list" role="listbox" aria-label="Models">
        {shown.slice(0, SHOW_AT_MOST).map((m) => (
          <li key={m.id}>
            <button type="button" role="option" aria-selected={m.id === current} className={`model-item${m.id === current ? " on" : ""}`}
              onClick={() => onPick(m)} title={m.description}>
              <span className="model-name">{m.name ?? m.id}{m.id === current && <span className="badge">in use</span>}</span>
              {m.name && <span className="model-id">{m.id}</span>}
              <span className="model-meta">{modelMeta(m)}</span>
            </button>
          </li>
        ))}
        {models && shown.length === 0 && <li className="side-empty">No model matches. Try fewer words.</li>}
      </ul>
      {!loading && !models && !error && <Button small onClick={() => void fetchList()}>Load the models</Button>}
    </div>
  );
}
