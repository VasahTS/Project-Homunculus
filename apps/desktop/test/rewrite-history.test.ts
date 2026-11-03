// Rewrites retain their own before/after snapshots, including rollback and timestamp ties. Author: CODEX, 2026-11-03.
import { describe, expect, it } from "vitest";
import type { MessageRevision } from "@homunculus/schemas";
import { rewriteGroups } from "../src/rewrite-history.ts";

const revision = (id: string, agentId: string | null, before: string, after: string, createdAt: number): MessageRevision => ({ id, messageId: "m", author: agentId ? { kind: "agent", agentId } : { kind: "user" }, before, after, createdAt });
const a = revision("a1", "a", "original", "prose", 1);
const b = revision("b1", "b", "prose", "layout", 2);
const c = revision("c1", "c", "layout", "animated", 3);

describe("rewrite menus", () => {
  it("shows every participating agent with its own unchanged snapshot", () => {
    const rows = rewriteGroups([a, b, c], "animated");
    expect(rows.map((r) => r.agentId)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.current)).toEqual([false, false, true]);
    expect(rows.map((r) => r.revisions)).toEqual([[a], [b], [c]]);
  });
  it("reconstructs the chain when consecutive writes share a timestamp and IDs sort differently", () => {
    const rows = rewriteGroups([{ ...c, createdAt: 1 }, { ...a, createdAt: 1 }, { ...b, createdAt: 1 }], "animated");
    expect(rows.map((r) => r.agentId)).toEqual(["a", "b", "c"]);
  });
  it("restores earlier menus after undoing the latest agent", () => {
    const undo = revision("u", null, "animated", "layout", 4);
    expect(rewriteGroups([a, b, c, undo], "layout").map((r) => [r.agentId, r.current])).toEqual([["a", false], ["b", true]]);
  });
  it("does not attach old rewrites to an unrelated manual edit", () => {
    expect(rewriteGroups([a, b, c, revision("u", null, "animated", "manual", 4)], "manual")).toEqual([]);
    expect(rewriteGroups([a, b, c], "manual")).toEqual([]);
  });
  it("groups repeated runs of the same agent while preserving each comparison", () => {
    const second = revision("a2", "a", "animated", "revised again", 4);
    const rows = rewriteGroups([a, b, c, second], "revised again");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ agentId: "a", revisions: [a, second], current: true });
    expect(rows[1]!.current).toBe(false);
  });
  it("keeps only rewrites after an unrelated edit and handles an empty history", () => {
    const edit = revision("u", null, "prose", "manual", 2);
    const fresh = revision("b2", "b", "manual", "fresh", 3);
    expect(rewriteGroups([a, edit, fresh], "fresh").map((r) => r.agentId)).toEqual(["b"]);
    expect(rewriteGroups([], "original")).toEqual([]);
  });
});
