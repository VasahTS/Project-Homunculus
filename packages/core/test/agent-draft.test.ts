// Fault and concurrency regressions for the agent editor's persistence queue. CODEX, 2026-10-30.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentConfig } from "@homunculus/schemas";
import { AgentDraft } from "../../../apps/desktop/src/agent-draft.ts";

const agent = (name = "Original") => AgentConfig.parse({ id: "a", name, output: "note", triggers: [{ on: "manual" }] });
const gate = () => { let release!: () => void; const promise = new Promise<void>((done) => { release = done; }); return { promise, release }; };
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("agent draft persistence", () => {
  it("debounces edits and saves only the latest value", async () => {
    const save = vi.fn(async (value) => AgentConfig.parse(value));
    const draft = new AgentDraft(agent(), save);
    draft.update(agent("First"));
    await vi.advanceTimersByTimeAsync(599);
    draft.update(agent("Latest"));
    await vi.advanceTimersByTimeAsync(599);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save.mock.calls.map(([value]) => value.name)).toEqual(["Latest"]);
    expect(draft.snapshot().status).toBe("saved");
  });

  it("serializes slow writes and never marks a newer draft as saved early", async () => {
    const first = gate();
    const second = gate();
    const names: string[] = [];
    const draft = new AgentDraft(agent(), async (value) => {
      names.push(value.name!);
      await (names.length === 1 ? first.promise : second.promise);
      return AgentConfig.parse(value);
    });
    draft.update(agent("Older"));
    const saving = draft.flush();
    draft.update(agent("Latest"));
    expect(draft.flush()).toBe(saving);
    expect(names).toEqual(["Older"]);
    first.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(names).toEqual(["Older", "Latest"]);
    expect(draft.snapshot()).toMatchObject({ value: { name: "Latest" }, status: "saving" });
    second.release();
    expect(await saving).toBe(true);
    expect(draft.snapshot().status).toBe("saved");
    expect(draft.dirty).toBe(false);
  });

  it("keeps a rejected save dirty and retries the same draft", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Disk unavailable")).mockImplementation(async (value) => AgentConfig.parse(value));
    const draft = new AgentDraft(agent(), save);
    draft.update(agent("Keep this"));
    expect(await draft.flush()).toBe(false);
    expect(draft.snapshot()).toMatchObject({ value: { name: "Keep this" }, status: "error", error: "Disk unavailable" });
    expect(draft.dirty).toBe(true);
    expect(await draft.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(draft.snapshot()).toMatchObject({ value: { name: "Keep this" }, status: "saved", error: "" });
  });

  it("deletes only after an in-flight save finishes and drops queued writes", async () => {
    const pending = gate();
    const events: string[] = [];
    const draft = new AgentDraft(agent(), async (value) => {
      await pending.promise;
      events.push("saved");
      return AgentConfig.parse(value);
    });
    draft.update(agent("In flight"));
    const saving = draft.flush();
    draft.update(agent("Do not recreate"));
    const deleting = draft.remove(async () => { events.push("deleted"); });
    expect(events).toEqual([]);
    pending.release();
    expect(await saving).toBe(false);
    expect(await deleting).toBe(true);
    draft.update(agent("Already deleted"));
    expect(await draft.flush()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(events).toEqual(["saved", "deleted"]);
  });

  it("allows editing and saving again after deletion fails", async () => {
    const draft = new AgentDraft(agent(), async (value) => AgentConfig.parse(value));
    expect(await draft.remove(async () => { throw new Error("Delete failed"); })).toBe(false);
    draft.update(agent("Still editable"));
    expect(await draft.flush()).toBe(true);
    expect(draft.snapshot().value.name).toBe("Still editable");
  });
});
