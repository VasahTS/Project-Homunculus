// Homunculus 2 — calling providers safely: limits, fallback, Stop. Author: CLAUDE, 2026-10-27.
// BLUEPRINT §7.3. Agents run in parallel; without limits a cheap tracker model would hit rate limits.
import type { ConnectionProfile } from "@homunculus/schemas";
import type { ChatTurn, Completion, ConnectionConfig, ExtensionPoint, ProviderDefinition, RichTurn, StreamChunk, ToolSpec } from "./extensions.ts";

/** One gate per connection (provider + address + model). */
class Gate {
  private active = 0;
  private lastStart = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly maxConcurrent: number, private readonly minIntervalMs: number) {}

  async acquire(signal?: AbortSignal): Promise<() => void> {
    while (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(abortError());
        signal?.addEventListener("abort", onAbort, { once: true });
        this.queue.push(() => { signal?.removeEventListener("abort", onAbort); resolve(); });
      });
    }
    this.active++;
    const wait = this.lastStart + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait, signal).catch((e) => { this.release(); throw e; });
    this.lastStart = Date.now();
    let released = false;
    return () => { if (!released) { released = true; this.release(); } };
  }

  private release() {
    this.active--;
    this.queue.shift()?.();
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

export function abortError(): Error {
  const e = new Error("Stopped");
  e.name = "AbortError";
  return e;
}

export function isAbort(e: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (e instanceof Error && e.name === "AbortError");
}

export class ConnectionService {
  private gates = new Map<string, Gate>();
  constructor(private readonly providers: ExtensionPoint<ProviderDefinition>) {}

  private gateFor(c: ConnectionConfig): Gate {
    const key = `${c.providerId}|${c.baseUrl ?? ""}|${c.model}`;
    let gate = this.gates.get(key);
    if (!gate) {
      gate = new Gate(Math.max(1, c.limits?.maxConcurrent ?? 4), Math.max(0, c.limits?.minIntervalMs ?? 0));
      this.gates.set(key, gate);
    }
    return gate;
  }

  private provider(c: ConnectionConfig): ProviderDefinition {
    const p = this.providers.get(c.providerId);
    if (!p) throw new Error(`No AI provider "${c.providerId}" is installed`);
    return p;
  }

  /**
   * Streams a reply. If the connection fails before any text arrived and it has a
   * fallback, the fallback is tried (and so on). Once text arrived, errors are thrown.
   */
  async *stream(connection: ConnectionConfig, messages: ChatTurn[], signal?: AbortSignal, extra: { tools?: ToolSpec[]; rich?: RichTurn[] } = {}): AsyncGenerator<StreamChunk & {}, void> {
    let current: ConnectionConfig | undefined = connection;
    let lastError: unknown;
    while (current) {
      const provider = this.provider(current);
      const release = await this.gateFor(current).acquire(signal);
      let sentText = false;
      try {
        for await (const chunk of provider.stream({ connection: current, messages, signal, ...extra })) {
          if ((typeof chunk === "string" && chunk) || (typeof chunk === "object" && "toolCalls" in chunk)) sentText = true;
          yield chunk;
        }
        return;
      } catch (e) {
        if (sentText || isAbort(e, signal)) throw e;
        lastError = e;
        current = current.fallback;
      } finally {
        release();
      }
    }
    throw lastError;
  }

  /** A whole (non-streamed) call, used by agents. */
  async complete(connection: ConnectionConfig, messages: ChatTurn[], options: { signal?: AbortSignal; maxTokens?: number } = {}): Promise<Completion> {
    const conn: ConnectionConfig = options.maxTokens
      ? { ...connection, params: { ...connection.params, maxTokens: options.maxTokens } }
      : connection;
    const out: Completion = { text: "", reasoning: "", model: conn.model };
    for await (const chunk of this.stream(conn, messages, options.signal)) {
      if (typeof chunk === "string") out.text += chunk;
      else if ("reasoning" in chunk) out.reasoning += chunk.reasoning;
      else if ("usage" in chunk) Object.assign(out, chunk.usage);
    }
    return out;
  }
}

/**
 * Turns a saved connection profile into what a call needs. The key comes from the caller (it
 * lives in the OS keychain, D-011). Backup connections are followed up to 3 deep, never in a loop.
 */
export function profileToConfig(
  profile: ConnectionProfile,
  all: ReadonlyMap<string, ConnectionProfile>,
  keyFor: (p: ConnectionProfile) => string | undefined,
  seen: Set<string> = new Set(),
): ConnectionConfig {
  seen.add(profile.id);
  const params: NonNullable<ConnectionConfig["params"]> = {};
  if (profile.params.temperature !== undefined) params.temperature = profile.params.temperature;
  if (profile.params.topP !== undefined) params.topP = profile.params.topP;
  if (profile.params.maxTokens !== undefined) params.maxTokens = profile.params.maxTokens;
  if (profile.params.reasoningEffort !== undefined) params.reasoningEffort = profile.params.reasoningEffort;
  const config: ConnectionConfig = {
    profileId: profile.id,
    providerId: profile.providerId,
    model: profile.model,
    baseUrl: profile.baseUrl.trim() || undefined,
    apiKey: keyFor(profile),
    params,
    limits: { ...profile.limits },
    extraBody: Object.keys(profile.extraBody).length ? { ...profile.extraBody } : undefined,
  };
  const next = profile.fallbackId ? all.get(profile.fallbackId) : undefined;
  if (next && !seen.has(next.id) && seen.size < 4) config.fallback = profileToConfig(next, all, keyFor, seen);
  return config;
}
