// Homunculus 2 — Assistant → Customize → Web Search (D-148). Author: CLAUDE, 2026-11-17.
// Daniel: "in SillyTavern I used it without much trouble; check Flint; add Exa (free and with a key); OpenRouter and
// NanoGPT use the account's balance". Layout after Flint's Web Search settings (routes/settings/web-search.tsx):
// one card for the switch and the picked provider's setup, one for the order (tried top to bottom, ↑ ↓, on/off, ×).
// Colors come from the theme's tokens, so it follows every theme.
import { useEffect, useMemo, useState } from "react";
import { WebProviderId, type AssistantSettings } from "@homunculus/schemas";
import type { ConnectionState } from "../connection.ts";
import { EXA_KEY_NAME, isNanoGpt, webRows } from "../assistant/engine.ts";
import { WEB_PROVIDER_LABEL } from "../assistant/web.ts";
import { secrets } from "../secrets.ts";
import { Button, Icon, IconButton, Switch } from "./kit.tsx";

const ALL: WebProviderId[] = ["duckduckgo", "exa", "exa-key", "nanogpt", "openrouter"];
const ABOUT: Record<WebProviderId, string> = {
  duckduckgo: "Free, no key. Searches one at a time; after many searches in a short time it can ask for a pause.",
  exa: "Free, no key: Exa's public endpoint, with a small daily limit. Also reads pages that block Homunculus.",
  "exa-key": "Your Exa key (Exa gives free monthly credit). Higher limits and better pages; about US$ 0.007 a search.",
  nanogpt: "Searches with Linkup through a NanoGPT connection, paid from that account's balance (US$ 0.006 a search).",
  openrouter: "OpenRouter's own search, paid from the account's balance. Used when it is first in the order and the Assistant runs on an OpenRouter connection: the model searches by itself.",
};
const initial = (id: string) => (WEB_PROVIDER_LABEL[id] ?? id)[0]!.toUpperCase();

export function WebSearchTab({ s, put, connection }: { s: AssistantSettings; put: (n: AssistantSettings) => void; connection: ConnectionState }) {
  const web = s.web;
  const setWeb = (patch: Partial<AssistantSettings["web"]>) => put({ ...s, web: { ...web, ...patch } });
  const on = !s.toolsOff.includes("web");
  const [picked, setPicked] = useState<WebProviderId>(web.order[0]?.id ?? "duckduckgo");
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => { void secrets.get(EXA_KEY_NAME).then((k) => setHasKey(!!k?.trim())).catch(() => setHasKey(false)); }, []);
  // OpenRouter's row is ready when the default assistant runs on OpenRouter
  const assistant = s.assistants.find((a) => a.id === s.defaultAssistantId) ?? s.assistants[0];
  const assistantConn = connection.configs[assistant?.connectionId ?? ""] ?? connection.forRequest().connection;
  const rows = useMemo(() => webRows(web, connection.configs, hasKey, assistantConn), [web, connection.configs, hasKey, assistantConn]);
  const inOrder = (id: WebProviderId) => web.order.some((r) => r.id === id);
  // Exa (API Key) and OpenRouter go to the top: a key is added to be used, and OpenRouter works only when it is first
  const add = (id: WebProviderId, top = id === "exa-key" || id === "openrouter") => { if (!inOrder(id)) setWeb({ order: top ? [{ id, on: true }, ...web.order] : [...web.order, { id, on: true }] }); };
  const move = (from: number, to: number) => { const next = [...web.order]; const [x] = next.splice(from, 1); next.splice(to, 0, x!); setWeb({ order: next }); };
  const firstReady = rows.find((r) => r.on && r.ready);
  return (
    <div className="cust-wide web-set" data-testid="web-search-settings">
      <section className="web-card">
        <div className="web-line">
          <span className="web-line-t"><b>Search the Web in New Chats</b><small>Lets the Assistant search and read web pages. Each chat can turn it off or on in Options.</small></span>
          <Switch label="Search the web in new chats" checked={on} onChange={(v) => put({ ...s, toolsOff: v ? s.toolsOff.filter((x) => x !== "web") : [...s.toolsOff, "web"] })} />
        </div>
        <div className="web-line">
          <span className="web-line-t"><b>Provider Settings</b><small>Pick a provider to set it up.</small></span>
          <select aria-label="Provider to set up" value={picked} onChange={(e) => setPicked(e.target.value as WebProviderId)} data-testid="web-provider-pick">
            {ALL.map((id) => <option key={id} value={id}>{WEB_PROVIDER_LABEL[id]}</option>)}
          </select>
        </div>
        <ProviderSetup id={picked} s={s} setWeb={setWeb} connection={connection} hasKey={hasKey} setHasKey={setHasKey}
          inOrder={inOrder(picked)} onAdd={() => add(picked)} />
      </section>

      <section className="web-card" aria-label="Search order">
        <div className="web-line">
          <span className="web-line-t"><b>Search Order</b>
            <small>{firstReady ? "Tried top to bottom: a provider that fails or hits its limit passes the search to the next." : "No provider can search, so the Assistant won't search the web. Turn one on or add one."}</small></span>
          <select aria-label="Add a provider" value="" onChange={(e) => e.target.value && add(e.target.value as WebProviderId)} data-testid="web-add-provider"
            disabled={ALL.every(inOrder)}>
            <option value="">+ Add Provider</option>
            {ALL.filter((id) => !inOrder(id)).map((id) => <option key={id} value={id}>{WEB_PROVIDER_LABEL[id]}</option>)}
          </select>
        </div>
        <ol className="web-order">
          {rows.map((r, i) => (
            <li key={r.id} className={`web-row${r.on ? "" : " off"}`} data-testid="web-order-row">
              <span className="web-n">{i + 1}</span>
              <span className="web-tile" aria-hidden>{initial(r.id)}</span>
              <button type="button" className="web-row-t" onClick={() => setPicked(r.id)} title="Set it up">
                <b>{r.label}</b>{r.on && (r.note || (r.id === "openrouter" && r.ready && firstReady?.id !== "openrouter")) &&
                  <small>{r.note || "Used only when it is first · move it up"}</small>}
              </button>
              <IconButton label={`Move ${r.label} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className="web-arrow up"><Icon name="chevron" size={14} /></IconButton>
              <IconButton label={`Move ${r.label} down`} disabled={i === rows.length - 1} onClick={() => move(i, i + 1)} className="web-arrow down"><Icon name="chevron" size={14} /></IconButton>
              <Switch label={r.label} checked={r.on} onChange={(v) => setWeb({ order: web.order.map((x, j) => (j === i ? { ...x, on: v } : x)) })} />
              <IconButton label={`Remove ${r.label}`} onClick={() => setWeb({ order: web.order.filter((_, j) => j !== i) })}><Icon name="close" size={14} /></IconButton>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** The picked provider's setup row (Flint: the key, the instance, or "needs no setup"). */
function ProviderSetup({ id, s, setWeb, connection, hasKey, setHasKey, inOrder, onAdd }: {
  id: WebProviderId; s: AssistantSettings; setWeb: (p: Partial<AssistantSettings["web"]>) => void; connection: ConnectionState;
  hasKey: boolean; setHasKey: (v: boolean) => void; inOrder: boolean; onAdd: () => void;
}) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState("");
  const nanos = connection.profiles.filter((p) => isNanoGpt(connection.configs[p.id] ?? p));
  const saveKey = async (value: string) => {
    try {
      if (value.trim()) { await secrets.set(EXA_KEY_NAME, value.trim()); setHasKey(true); setKey(""); setStatus(secrets.persistent ? "Saved in the keychain." : "Kept until the app closes (preview)."); if (!inOrder) onAdd(); }
      else { await secrets.delete(EXA_KEY_NAME); setHasKey(false); setStatus("Key removed."); }
    } catch (e) { setStatus(`Couldn't save the key: ${e instanceof Error ? e.message : String(e)}`); }
  };
  return (
    <div className="web-setup" data-testid="web-provider-setup">
      <p className="hint">{ABOUT[id]}</p>
      {id === "exa-key" && <div className="web-line">
        <span className="web-line-t"><b>Exa API Key</b><small>{hasKey ? "A key is saved. Type a new one to replace it." : "From dashboard.exa.ai → API Keys."}</small></span>
        <span className="cust-inline web-key">
          <input type={show ? "text" : "password"} value={key} placeholder={hasKey ? "••••••••" : "Paste your Exa key"} aria-label="Exa API key"
            onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && key.trim()) void saveKey(key); }} autoComplete="off" spellCheck={false} />
          <IconButton label={show ? "Hide key" : "Show key"} onClick={() => setShow(!show)}><Icon name={show ? "eyeOff" : "eye"} size={14} /></IconButton>
          <Button small disabled={!key.trim()} onClick={() => void saveKey(key)}>Save</Button>
          {hasKey && <Button small variant="plain" onClick={() => void saveKey("")}>Remove</Button>}
        </span>
      </div>}
      {id === "nanogpt" && <div className="web-line">
        <span className="web-line-t"><b>Connection</b><small>{nanos.length ? "Its key and balance pay for the searches." : "Add a NanoGPT connection in Settings → Connections first."}</small></span>
        <select aria-label="NanoGPT connection" value={s.web.nanogptConnectionId ?? ""} onChange={(e) => setWeb({ nanogptConnectionId: e.target.value || null })} disabled={!nanos.length}>
          <option value="">{nanos[0] ? `First NanoGPT connection (${nanos[0].name})` : "No NanoGPT connection"}</option>
          {nanos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>}
      {id === "openrouter" && <div className="web-line">
        <span className="web-line-t"><b>Engine</b><small>Auto uses the model's own search when it has one, otherwise Exa.</small></span>
        <select aria-label="OpenRouter search engine" value={s.web.openrouterEngine} onChange={(e) => setWeb({ openrouterEngine: e.target.value as AssistantSettings["web"]["openrouterEngine"] })}>
          <option value="auto">Auto</option><option value="exa">Exa</option><option value="native">The Model's Own Search</option>
        </select>
      </div>}
      {(status || !inOrder) && <div className="web-setup-foot">
        {status && <span className="hint" role="status">{status}</span>}
        <span className="grow" />
        {!inOrder && <Button small onClick={onAdd} data-testid="web-add-picked">Add to Search Order</Button>}
      </div>}
    </div>
  );
}
