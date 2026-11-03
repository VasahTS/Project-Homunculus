// Assistant response state belongs to this app window, independent of the mounted view. Author: CODEX, 2026-11-03.
import type { AssistantChat, AssistantMessage } from "@homunculus/schemas";

type Update<T> = T | ((before: T) => T);
interface Snapshot {
  chat: AssistantChat | null;
  live: AssistantMessage | null;
  error: string;
  compacting: boolean;
}

/** Created once by useAssistant; only the current Assistant view subscribes to token updates. */
export function createAssistantRuntime() {
  let snapshot: Snapshot = { chat: null, live: null, error: "", compacting: false };
  const listeners = new Set<() => void>();
  const set = <K extends keyof Snapshot>(key: K, value: Update<Snapshot[K]>) => {
    const next = typeof value === "function" ? (value as (before: Snapshot[K]) => Snapshot[K])(snapshot[key]) : value;
    if (Object.is(next, snapshot[key])) return;
    snapshot = { ...snapshot, [key]: next };
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setChat: (value: Update<AssistantChat | null>) => set("chat", value),
    setLive: (value: Update<AssistantMessage | null>) => set("live", value),
    setError: (value: Update<string>) => set("error", value),
    setCompacting: (value: Update<boolean>) => set("compacting", value),
    abort: { current: null as AbortController | null },
    runningId: { current: null as string | null },
    runningChat: { current: null as AssistantChat | null },
    selectedId: { current: null as string | null },
  };
}
