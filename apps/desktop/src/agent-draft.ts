// Serialized agent edits retained while navigating within this app session. CODEX, 2026-10-30.
import type { AgentConfig, AgentConfigInput } from "@homunculus/schemas";

type Save = (agent: AgentConfigInput) => Promise<AgentConfig>;
export interface AgentDraftState { value: AgentConfig; status: "saved" | "saving" | "error"; error: string }

/** One queue per agent, owned by the app rather than by an editor's mount. */
export class AgentDraft {
  private state: AgentDraftState;
  private revision = 0;
  private savedRevision = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active: Promise<boolean> | undefined;
  private deleting = false;
  private discarded = false;
  private listeners = new Set<() => void>();

  constructor(value: AgentConfig, public save: Save) {
    this.state = { value, status: "saved", error: "" };
  }

  get dirty() { return this.revision !== this.savedRevision; }
  snapshot = (): AgentDraftState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  update(value: AgentConfig) {
    if (this.deleting || this.discarded) return;
    this.revision++;
    this.publish({ value, status: "saving", error: "" });
    this.clearTimer();
    this.timer = setTimeout(() => { void this.flush(); }, 600);
  }

  /** Drains newer edits after the current write; a failed write stays dirty for retry. */
  flush(): Promise<boolean> {
    this.clearTimer();
    if (this.deleting || this.discarded) return Promise.resolve(false);
    if (this.active) return this.active;
    if (!this.dirty) return Promise.resolve(true);
    this.active = this.drain().finally(() => { this.active = undefined; });
    return this.active;
  }

  /** Finish an in-flight write before deleting, so it cannot recreate the agent later. */
  async remove(remove: () => Promise<void>): Promise<boolean> {
    if (this.deleting || this.discarded) return false;
    this.deleting = true;
    this.clearTimer();
    if (this.active) await this.active;
    try {
      await remove();
      this.discarded = true;
      return true;
    } catch (error) {
      this.deleting = false;
      this.fail(error);
      return false;
    }
  }

  private async drain(): Promise<boolean> {
    while (this.dirty && !this.deleting && !this.discarded) {
      const revision = this.revision;
      const value = this.state.value;
      this.publish({ ...this.state, status: "saving", error: "" });
      try { await this.save(value); }
      catch (error) { this.fail(error); return false; }
      this.savedRevision = revision;
      if (!this.dirty) this.publish({ ...this.state, status: "saved", error: "" });
    }
    return !this.dirty && !this.deleting && !this.discarded;
  }

  private fail(error: unknown) {
    this.publish({ ...this.state, status: "error", error: error instanceof Error ? error.message : String(error) });
  }

  private publish(state: AgentDraftState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  private clearTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
