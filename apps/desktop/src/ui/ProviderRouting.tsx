// Homunculus 2 — Model Providers: which companies run a connection's model on OpenRouter or nano-gpt (D-154).
// Picked providers are tried in order (sent as `provider.order`); "Allow Fallback Providers" lets the service use
// others when they fail. The list comes from the service for the model in use. Author: CLAUDE, 2026-11-27.
import { useEffect, useRef, useState } from "react";
import type { RouteInfo, RouteList } from "@homunculus/core";
import { routingService } from "@homunculus/provider-openai";
import { Button, Row, Switch } from "./kit.tsx";

export interface Routing { providers: string[]; allowFallbacks: boolean }

const money = (n: number | undefined) => n === undefined ? "?" : n === 0 ? "free" : `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;

/** "fp8 · 262k context · $0.45 in / $1.80 out per M · down or full right now" */
export function routeMeta(r: RouteInfo): string {
  const parts: string[] = [];
  if (r.quantization) parts.push(r.quantization);
  if (r.contextLength) parts.push(`${Math.round(r.contextLength / 1000)}k context`);
  if (r.price) parts.push(`${money(r.price.input)} in / ${money(r.price.output)} out per M`);
  if (r.available === false) parts.push("down or full right now");
  return parts.join(" · ");
}

// one list per address + model, kept while the app is open (like Browse's model list)
const cache = new Map<string, RouteList>();

export function ProviderRoutingRows({ baseUrl, model, routing, onChange, load }: {
  baseUrl: string; model: string; routing: Routing; onChange: (r: Routing) => void;
  /** Asks the service; undefined when the connection's provider can't. */
  load: ((signal: AbortSignal) => Promise<RouteList>) | undefined;
}) {
  const service = routingService(baseUrl);
  const key = `${baseUrl.trim() || "openrouter"}|${model.trim()}`;
  const [list, setList] = useState<RouteList | undefined>(() => cache.get(key));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => { setList(cache.get(key)); setError(""); }, [key]);
  useEffect(() => () => ctrl.current?.abort(), []);

  const fetchList = async () => {
    if (!load) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true); setError("");
    try {
      const l = await load(c.signal);
      cache.set(key, l);
      setList(l);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    }
    if (!c.signal.aborted) setLoading(false);
  };
  const choose = () => { setOpen((o) => !o); if (!open && !cache.has(key)) void fetchList(); };

  const picked = routing.providers;
  // only for services that route; still shown when providers were picked, so they can be removed after an address change
  if (!service && picked.length === 0) return null;

  const byId = new Map((list?.routes ?? []).map((r) => [r.id, r]));
  const toggle = (id: string) => onChange({ ...routing, providers: picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id] });
  const move = (i: number, by: -1 | 1) => {
    const next = [...picked];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    onChange({ ...routing, providers: next });
  };
  const canPick = !list || list.selectable;

  return (
    <>
      <Row label="Model Providers" help="Which companies run the model for you. The ones you pick are tried in this order; none picked = the service chooses.">
        <span className="label-row">
          <span className="hint">{picked.length ? `${picked.length} picked` : "Service decides"}</span>
          <Button small onClick={choose} disabled={!model.trim() || !load} aria-expanded={open}>{open ? "Done" : "Choose"}</Button>
        </span>
      </Row>
      {!service && <Row wide><span className="hint warn-text">This address isn't OpenRouter or nano-gpt, so the picked providers may be ignored.</span></Row>}
      {open && (
        <Row wide>
          <div className="model-picker" data-testid="route-picker"
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
            <div className="model-picker-status hint">
              {loading ? "Asking the service who runs this model…" : list ? `${list.routes.length} providers for ${model.trim()}, cheapest first` : ""}
              <span className="spacer" />
              <button type="button" className="link" onClick={() => void fetchList()} disabled={loading}>Refresh</button>
              <button type="button" className="link quiet" onClick={() => setOpen(false)}>Close</button>
            </div>
            {error && <div className="error-bar inline" role="alert">{error}</div>}
            {list?.note && <span className={`hint${list.selectable ? "" : " warn-text"}`} data-testid="route-note">{list.note}</span>}
            {list && list.routes.length > 0 && (
              <ul className="model-list" aria-label="Providers">
                {list.routes.map((r) => {
                  const at = picked.indexOf(r.id);
                  return (
                    <li key={r.id}>
                      <button type="button" aria-pressed={at >= 0} className={`model-item${at >= 0 ? " on" : ""}`}
                        disabled={!canPick && at < 0} onClick={() => toggle(r.id)}>
                        <span className="model-name">{r.name}{at >= 0 && <span className="badge">{at + 1}</span>}</span>
                        {r.name !== r.id && <span className="model-id">{r.id}</span>}
                        <span className="model-meta">{routeMeta(r)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Row>
      )}
      {picked.length > 0 && (
        <>
          <Row wide>
            <ol className="route-order" aria-label="Picked providers" data-testid="route-order">
              {picked.map((id, i) => {
                const r = byId.get(id);
                const missing = list && !r;
                return (
                  <li key={id}>
                    <span className="hint">{i + 1}.</span>
                    <span className="route-name">{r?.name ?? id}</span>
                    <span className={`hint${missing ? " warn-text" : ""}`}>{missing ? "not offered for this model" : r ? routeMeta(r) : id}</span>
                    <span className="spacer" />
                    <button type="button" className="link" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${r?.name ?? id} up`}>↑</button>
                    <button type="button" className="link" disabled={i === picked.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${r?.name ?? id} down`}>↓</button>
                    <button type="button" className="link quiet" onClick={() => toggle(id)} aria-label={`Remove ${r?.name ?? id}`}>×</button>
                  </li>
                );
              })}
            </ol>
          </Row>
          <Row label="Allow Fallback Providers" help="When the picked providers fail or are full, the service may use another one. Off: the call fails instead.">
            <Switch label="Allow fallback providers" checked={routing.allowFallbacks} onChange={(allowFallbacks) => onChange({ ...routing, allowFallbacks })} />
          </Row>
        </>
      )}
    </>
  );
}
