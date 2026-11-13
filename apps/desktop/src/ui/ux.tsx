// Draft continuity, guarded navigation and modal keyboard behavior. CODEX, 2026-11-03.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { createPortal } from "react-dom";

const drafts = new Map<string, unknown>();
const listeners = new Set<() => void>();
type SendKey = "enter" | "ctrl-enter";
const sendListeners = new Set<() => void>();
const readSendKey = (): SendKey => { try { return localStorage.getItem("homunculus.ui.sendKey") === "ctrl-enter" ? "ctrl-enter" : "enter"; } catch { return "enter"; } };
let sendKey = readSendKey();
/** One keyboard preference for both composers; only the preference is persisted. */
export function useSendKey(): [SendKey, (key: SendKey) => void] {
  const key = useSyncExternalStore(useCallback(fn => { sendListeners.add(fn); return () => { sendListeners.delete(fn); }; }, []), () => sendKey);
  return [key, next => { sendKey = next; try { localStorage.setItem("homunculus.ui.sendKey", next); } catch { /* This window still uses the preference. */ } for (const fn of sendListeners) fn(); }];
}
/** Fills a draft from another screen (Home's Assistant box → the Assistant's message box, D-086). CLAUDE. */
export function setDraftValue<T>(key: string, value: T): void {
  drafts.set(key, value);
  for (const fn of listeners) fn();
}
/** Drafts last for this window's lifetime; no personal content is written to browser storage. */
export function useDraft<T,>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  if (!drafts.has(key)) drafts.set(key, initial);
  const value = useSyncExternalStore(useCallback((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, []), () => drafts.get(key) as T);
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    const before = drafts.get(key) as T;
    drafts.set(key, typeof next === "function" ? (next as (v: T) => T)(before) : next);
    for (const fn of listeners) fn();
  }, [key]);
  return [value, set];
}

export function useModalFocus(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const before = document.activeElement as HTMLElement | null;
    const app = document.getElementById("root"); const wasInert = app?.inert;
    if (app && !app.contains(el)) app.inert = true;
    const stops = () => [...el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter(e => e.getClientRects().length > 0);
    (stops()[0] ?? el).focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close.current(); }
      if (e.key !== "Tab") return;
      const all = stops(), first = all[0], last = all.at(-1);
      if (!first) { e.preventDefault(); el.focus(); return; }
      if (!el.contains(document.activeElement) || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        e.preventDefault(); (e.shiftKey ? last! : first).focus();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); if (app) app.inert = wasInert ?? false; if (before?.isConnected) before.focus(); };
  }, [ref]);
}

type Guard = { dirty: boolean; save: () => Promise<boolean> };
const Navigation = createContext<{ run: (action: () => void) => void; register: (ref: RefObject<Guard>) => () => void }>({ run: f => f(), register: () => () => {} });
export const useGuardedNavigation = () => useContext(Navigation).run;
export function useUnsavedChanges(dirty: boolean, save: () => Promise<boolean>): void {
  const { register } = useContext(Navigation); const ref = useRef({ dirty, save }); ref.current = { dirty, save };
  useEffect(() => register(ref), [register]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (ref.current.dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", before); return () => window.removeEventListener("beforeunload", before);
  }, []);
}
export function NavigationProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Set<RefObject<Guard>>());
  const saving = useRef(false);
  const [pending, setPending] = useState<{ action: () => void; guard: RefObject<Guard> } | null>(null);
  const register = useCallback((ref: RefObject<Guard>) => { guards.current.add(ref); return () => { guards.current.delete(ref); }; }, []);
  const run = useCallback((action: () => void) => { const guard = !saving.current && [...guards.current].find(g => g.current.dirty); if (guard) setPending({ action, guard }); else action(); }, []);
  const save = async () => { if (!pending) return false; saving.current = true; try { return await pending.guard.current.save(); } finally { saving.current = false; } };
  return <Navigation.Provider value={{ run, register }}>{children}{pending && <UnsavedDialog pending={pending} saveGuard={save} close={() => setPending(null)} />}</Navigation.Provider>;
}
function UnsavedDialog({ pending, close, saveGuard }: { pending: { action: () => void; guard: RefObject<Guard> }; close: () => void; saveGuard: () => Promise<boolean> }) {
  const ref = useRef<HTMLDivElement>(null); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useModalFocus(ref, () => { if (!saving) close(); });
  const leave = () => { pending.guard.current.dirty = false; close(); pending.action(); };
  const save = async () => { setSaving(true); try { if (await saveGuard()) leave(); else setError("Could not save. Choose Stay to review the fields."); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); } };
  return createPortal(<div className="sheet-layer"><div className="sheet-scrim" /><div ref={ref} className="unsaved-dialog glass" role="dialog" aria-modal="true" aria-label="Unsaved Changes" tabIndex={-1}>
    <h2>Unsaved Changes</h2><p>Save your changes before leaving?</p>{error && <p role="alert">{error}</p>}
    <div className="unsaved-actions"><button className="btn btn-bordered" disabled={saving} onClick={close}>Stay</button><button className="btn btn-destructive" disabled={saving} onClick={leave}>Discard</button><button className="btn btn-prominent" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button></div>
  </div></div>, document.body);
}

/** Long work at the bottom of the window (D-121: importing cards, making picture previews): what, how far, a bar. CLAUDE. */
export function WorkToast({ work }: { work: { title: string; done: number; total: number; detail?: string | undefined } }) {
  const pct = work.total > 0 ? Math.min(100, Math.round((work.done / work.total) * 100)) : 0;
  return createPortal(
    <div className="work-toast" role="status" aria-live="polite" data-testid="work-progress">
      <div className="work-head"><strong>{work.title}</strong><span className="work-count">{work.done} / {work.total}</span></div>
      <div className="work-bar" role="progressbar" aria-valuemin={0} aria-valuemax={work.total} aria-valuenow={work.done}><span style={{ width: `${pct}%` }} /></div>
      {work.detail && <span className="work-detail">{work.detail}</span>}
    </div>, document.body);
}
