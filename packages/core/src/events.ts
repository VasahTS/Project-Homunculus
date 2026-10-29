// Homunculus 2 — event bus. Author: CLAUDE, 2026-10-23.
// The core announces what happens; modules listen. A failing listener never
// breaks the others: its error is reported through `onError`.

export type Listener<P> = (payload: P) => void | Promise<void>;

export interface ListenerError {
  event: string;
  owner: string;
  error: unknown;
}

export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Array<{ owner: string; fn: Listener<never> }>>();

  constructor(private readonly onError: (e: ListenerError) => void = () => {}) {}

  /** Subscribe. Returns a function that unsubscribes. */
  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>, owner = "core"): () => void {
    const list = this.listeners.get(event) ?? [];
    const entry = { owner, fn: fn as Listener<never> };
    list.push(entry);
    this.listeners.set(event, list);
    return () => {
      const current = this.listeners.get(event);
      if (current) this.listeners.set(event, current.filter((l) => l !== entry));
    };
  }

  /** Announce an event. All listeners run in parallel; errors are isolated. */
  async emit<K extends keyof Events>(event: K, payload: Events[K]): Promise<void> {
    const list = [...(this.listeners.get(event) ?? [])];
    await Promise.all(
      list.map(async ({ owner, fn }) => {
        try {
          await (fn as Listener<Events[K]>)(payload);
        } catch (error) {
          this.onError({ event: String(event), owner, error });
        }
      }),
    );
  }

  listenerCount(event: keyof Events): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}
