// Homunculus 2 — Quick Connection (from Homunculus v1 `classic-quick-connect.js`; canvas "Homunculus 2 — Quick Connection
// & Quick Replies"). Author: CLAUDE, 2026-10-29.
// A link button in the message box opens a menu over it: saved connections on the left (a click uses one in this chat),
// the models of that connection on the right (a click uses one and saves it into the connection). Models can be pinned
// with a star; a typed ID that is not listed can be used too; Manage opens Settings → Connections.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { ConnectionProfile, Session, SetupLayer } from "@homunculus/schemas";
import { profileToConfig, type ConnectionConfig, type ModelInfo } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import { keyNameOf, needsKey, type ConnectionState } from "../connection.ts";
import { Help } from "./Help.tsx";
import { Button, Icon, IconButton } from "./kit.tsx";
import { cachedModels, rememberModels } from "./ModelPicker.tsx";

const HELP = "Switch the AI without leaving the chat. Left: your saved connections; a click uses one in this chat "
  + "(the Prompt tab shows the same choice). Right: the models of that connection; a click uses one and saves it into the "
  + "connection, so every chat that uses it gets it. Star a model to keep it on top. Type an ID that is not listed and press "
  + "Enter to use it. Manage opens Settings → Connections.";

const PINS = "quickConnectPins";
type Pins = Record<string, string[]>;

/** What the menu changes: a Play chat (QuickConnect below) or an Assistant chat (D-077). */
export interface QuickConnectTarget {
  /** The connection in use now. */
  current: ConnectionProfile | undefined;
  /** The model in use now (when it is not simply the connection's own). */
  currentModel?: string | undefined;
  /** A connection was clicked. */
  useProfile: (p: ConnectionProfile) => void;
  /** A model was clicked (of connection `p`). */
  useModel: (p: ConnectionProfile, model: string, info?: ModelInfo) => Promise<void> | void;
  /** One line at the bottom saying what a click does. */
  footnote: string;
}

/** The Quick Connection button of a Play chat: a connection is used in this chat; a model is saved into its connection. */
export function QuickConnect({ svc, c, session, storySetup, listModels, onChangeSession, onManage }: {
  svc: AppServices;
  c: ConnectionState;
  session: Session;
  /** The story's layer, for a chat of a story (what the chat inherits). */
  storySetup?: SetupLayer | undefined;
  listModels: (config: ConnectionConfig, signal: AbortSignal) => Promise<ModelInfo[]>;
  onChangeSession: (s: Session) => void;
  onManage: () => void;
}) {
  const current = c.storyProfileFor(session, storySetup);
  const target: QuickConnectTarget = {
    current,
    footnote: "A connection you pick is used in this chat. A model you pick is saved into its connection.",
    useProfile: (p) => {
      const inherited = storySetup?.connectionId ?? c.defaultId;
      if (session.setup.connectionId !== (p.id === inherited ? undefined : p.id)) {
        const setup = { ...session.setup };
        if (p.id === inherited) delete setup.connectionId; else setup.connectionId = p.id;
        onChangeSession({ ...session, setup });
      }
    },
    useModel: async (p, model) => {
      if (p.id !== current?.id) target.useProfile(p);
      if (p.model !== model) await c.save({ ...p, model });
    },
  };
  return (
    <QuickConnectMenu svc={svc} c={c} listModels={listModels} target={target} onManage={onManage}
      trigger={(open, toggle) => (
        <button type="button" className={`asst-model-btn qc-under${open ? " on" : ""}`} aria-expanded={open} data-testid="quick-connect"
          aria-label={current ? `Quick Connection: ${current.name}${current.model ? ` (${current.model})` : ""}` : "Quick Connection: switch connection and model"}
          title="Switch the connection or the model" onClick={toggle}>
          {current ? (current.providerId === "offline-test" ? current.name : (current.model || current.name).split("/").pop()) : "No connection"}
        </button>
      )} />
  );
}

/** The menu itself: connections on the left, the viewed connection's models on the right (search, pins, typed IDs). */
export function QuickConnectMenu({ svc, c, listModels, target, onManage, trigger, className = "" }: {
  svc: AppServices;
  c: ConnectionState;
  listModels: (config: ConnectionConfig, signal: AbortSignal) => Promise<ModelInfo[]>;
  target: QuickConnectTarget;
  onManage: () => void;
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = target.current;
  const [viewId, setViewId] = useState<string | null>(null);
  const viewing = c.byId.get(viewId ?? "") ?? current;
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [note, setNote] = useState("");
  const [pins, setPins] = useState<Pins>({});
  const search = useRef<HTMLInputElement>(null);
  const loadSeq = useRef(0);

  useEffect(() => { void svc.store.getAppSetting<Pins>(PINS).then((p) => setPins(p ?? {})); }, [svc]);

  const load = async (p: ConnectionProfile | undefined, fresh = false) => {
    const seq = ++loadSeq.current;
    if (!p) { setModels([]); setNote(""); return; }
    const key = keyNameOf(p);
    const known = fresh ? undefined : cachedModels(key);
    if (known) { setModels(known); setNote(""); return; }
    setModels(null);
    setNote(fresh ? "Reloading the model list…" : "Loading models…");
    try {
      const ctrl = new AbortController();
      const list = await listModels(profileToConfig(p, c.byId, (x) => c.keyOf(x) || undefined), ctrl.signal);
      if (seq !== loadSeq.current) return;
      rememberModels(key, list);
      setModels(list);
      setNote("");
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setModels([]);
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  const openMenu = () => {
    setOpen(true);
    setQuery("");
    setViewId(current?.id ?? null);
    void load(current);
    setTimeout(() => search.current?.focus(), 0);
  };
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  const useProfile = (p: ConnectionProfile) => {
    target.useProfile(p);
    setViewId(p.id);
    setQuery("");
    void load(p);
  };

  const useModel = async (id: string) => {
    const p = viewing;
    const model = id.trim();
    if (!p || !model) return;
    await target.useModel(p, model, (models ?? []).find((m) => m.id === model));
    close();
  };

  const togglePin = (id: string) => {
    if (!viewing) return;
    const list = new Set(pins[viewing.id] ?? []);
    if (list.has(id)) list.delete(id); else list.add(id);
    const next = { ...pins, [viewing.id]: [...list] };
    setPins(next);
    void svc.store.setAppSetting(PINS, next);
  };

  const profiles = useMemo(() => [...c.profiles].sort((a, b) => a.name.localeCompare(b.name)), [c.profiles]);
  const q = query.trim().toLowerCase();
  const matches = (m: ModelInfo) => !q || m.id.toLowerCase().includes(q) || (m.name ?? "").toLowerCase().includes(q);
  const all = models ?? [];
  const byId = new Map(all.map((m) => [m.id, m]));
  const pinnedIds = viewing ? pins[viewing.id] ?? [] : [];
  const pinned = pinnedIds.map((id) => byId.get(id) ?? { id }).filter(matches);
  const rest = all.filter((m) => !pinnedIds.includes(m.id)).filter(matches).slice(0, 300);
  const typed = query.trim();
  const offerTyped = typed && !byId.has(typed);
  const onSearchKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "Enter" || !typed) return;
    e.preventDefault();
    const only = [...pinned, ...rest];
    void useModel(only.length === 1 ? only[0]!.id : typed);
  };

  const row = (m: ModelInfo, isPinned: boolean) => {
    const here = viewing?.id === current?.id ? (target.currentModel ?? viewing?.model) === m.id : viewing?.model === m.id;
    return (
      <div key={m.id} className={`qc-model${here ? " on" : ""}`} data-testid="qc-model">
        <button type="button" className="qc-model-pick" title={m.id} onClick={() => void useModel(m.id)}>
          <span className="qc-name">{m.name || m.id}</span>
          {here && <Icon name="check" size={14} label="In use" />}
        </button>
        <IconButton className={`qc-pin${isPinned ? " on" : ""}`} label={isPinned ? `Unpin ${m.name || m.id}` : `Pin ${m.name || m.id} to the top`} onClick={() => togglePin(m.id)}>
          <Icon name="star" size={14} />
        </IconButton>
      </div>
    );
  };

  return (
    <span className={`qc-wrap ${className}`.trim()}>
      {trigger(open, () => (open ? close() : openMenu()))}
      {open && (
        <>
          <div className="pop-scrim" onClick={close} />
          <section className="qc-pop" aria-label="Quick Connection" data-testid="quick-connect-menu">
            <header className="qc-head">
              <Icon name="link" size={15} /> <strong>Quick Connection</strong>
              <span className="grow" />
              <Help text={HELP} />
              <IconButton label="Close" onClick={close}><Icon name="close" size={14} /></IconButton>
            </header>
            <div className="qc-cols">
              <div className="qc-col" aria-label="Connections">
                <span className="qc-title">Connections</span>
                <div className="qc-scroll">
                  {profiles.map((p) => (
                    <button key={p.id} type="button" className={`qc-prof${p.id === viewing?.id ? " view" : ""}`} onClick={() => useProfile(p)} data-testid="qc-profile">
                      <span className="qc-t"><span className="qc-name">{p.name}</span>
                        <span className="qc-sub">{needsKey(p.providerId) ? [hostOf(p.baseUrl), p.model].filter(Boolean).join(" · ") : "no key needed"}</span></span>
                      {p.id === current?.id && <Icon name="check" size={14} label="In use in this chat" />}
                    </button>
                  ))}
                  {!profiles.length && <p className="hint">No saved connections yet. Make one in Settings → Connections.</p>}
                </div>
              </div>
              <div className="qc-col" aria-label="Models">
                <span className="qc-title">Models{viewing ? ` · ${viewing.name}` : ""}</span>
                <div className="qc-search">
                  <input ref={search} type="search" aria-label="Search or type a model ID" placeholder="Search or type a model ID…"
                    value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} />
                  <IconButton label="Reload the model list" onClick={() => void load(viewing, true)}><Icon name="refresh" size={15} /></IconButton>
                </div>
                <div className="qc-scroll" data-testid="qc-models">
                  {note && <p className="hint qc-note">{note}</p>}
                  {pinned.length > 0 && <span className="qc-sec"><Icon name="star" size={12} /> Pinned</span>}
                  {pinned.map((m) => row(m, true))}
                  {pinned.length > 0 && rest.length > 0 && <span className="qc-sec">All models</span>}
                  {rest.map((m) => row(m, false))}
                  {offerTyped && (
                    <button type="button" className="qc-model-pick qc-typed" onClick={() => void useModel(typed)} data-testid="qc-use-typed">
                      Use “{typed}”
                    </button>
                  )}
                  {models && !pinned.length && !rest.length && !offerTyped && !note && <p className="hint">No models match.</p>}
                </div>
              </div>
            </div>
            <footer className="qc-foot">
              <span className="hint grow">{target.footnote}</span>
              <Button small onClick={() => { close(); onManage(); }}><Icon name="plug" size={14} /> Manage</Button>
            </footer>
          </section>
        </>
      )}
    </span>
  );
}

function hostOf(url: string): string {
  if (!url.trim()) return "OpenRouter";
  try { return new URL(url.trim()).host.replace(/^api\./, ""); } catch { return url.trim(); }
}
