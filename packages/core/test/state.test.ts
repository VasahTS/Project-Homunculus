// Tests for decision D-001 (state attached to messages). Author: CLAUDE, 2026-10-23.
import { describe, expect, it } from "vitest";
import { WorldState, type MessageTree } from "../src/index.ts";

/** Builds a message tree from { child: parent } pairs. */
function tree(links: Record<string, string | null>): MessageTree {
  return { parentOf: async (id) => links[id] };
}

//   m1 ── m2 ── m3a   (original reply)
//          └─── m3b   (swipe / branch)
const links = { m1: null, m2: "m1", m3a: "m2", m3b: "m2" };

describe("world state attached to messages", () => {
  it("rebuilds the state by applying the changes along the path", async () => {
    const ws = new WorldState(tree(links));
    await ws.applyDelta("m1", { clock: { time: "18:00", day: 1 } });
    await ws.applyDelta("m2", { clock: { time: "19:00" } });
    expect(await ws.resolve("s", "m2")).toEqual({ clock: { time: "19:00", day: 1 } });
  });

  it("a swipe does not see the changes of the other swipe", async () => {
    const ws = new WorldState(tree(links));
    await ws.applyDelta("m2", { clock: { time: "18:00" }, inventory: { sword: 1 } });
    await ws.applyDelta("m3a", { clock: { time: "22:00" }, inventory: { sword: null } });
    await ws.applyDelta("m3b", { clock: { time: "18:30" } });

    expect(await ws.resolve("s", "m3a")).toEqual({ clock: { time: "22:00" } });
    expect(await ws.resolve("s", "m3b")).toEqual({ clock: { time: "18:30" }, inventory: { sword: 1 } });
  });

  it("going back in the story gives the old state", async () => {
    const ws = new WorldState(tree(links));
    await ws.applyDelta("m1", { clock: { time: "08:00" } });
    await ws.applyDelta("m3a", { clock: { time: "23:00" } });
    expect(await ws.resolve("s", "m1")).toEqual({ clock: { time: "08:00" } });
    expect(await ws.resolve("s", null)).toEqual({});
  });

  it("pinned values apply on every branch and can be unpinned", async () => {
    const ws = new WorldState(tree(links));
    await ws.applyDelta("m3a", { appearance: { lyra: "red cloak" } });
    await ws.pin("s", "appearance", "lyra", "silver hair, blue cloak");
    expect((await ws.resolve("s", "m3a")).appearance).toEqual({ lyra: "silver hair, blue cloak" });
    expect((await ws.resolve("s", "m3b")).appearance).toEqual({ lyra: "silver hair, blue cloak" });

    await ws.unpin("s", "appearance", "lyra");
    expect((await ws.resolve("s", "m3a")).appearance).toEqual({ lyra: "red cloak" });
    expect((await ws.resolve("s", "m3b")).appearance).toBeUndefined();
  });

  it("detects a broken (circular) message tree instead of freezing", async () => {
    const ws = new WorldState(tree({ a: "b", b: "a" }));
    await expect(ws.resolve("s", "a")).rejects.toThrow(/cycle/);
  });
});
