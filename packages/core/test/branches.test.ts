// Tests for branches of a chat (D-032). Author: CLAUDE, 2026-10-29.
import { describe, expect, it } from "vitest";
import { computeBranches, deletableFrom, forkPoints, heldEnds, nameBranches, pinKey, resolveBranches, splitPoints, type BranchRow, type MessageLink } from "../src/index.ts";
import { connection, world } from "./helpers.ts";

let t = 0;
const L = (id: string, parentId: string | null): MessageLink => ({ id, parentId, createdAt: ++t });

describe("v1 (kept to turn old rows into ends): finding branches in the tree", () => {
  it("a straight chat is one branch, and versions nobody continued are not branches", () => {
    t = 0;
    const links = [L("a", null), L("b", "a"), L("c1", "b"), L("c2", "b"), L("c3", "b")];
    const bs = computeBranches(links);
    expect(bs).toHaveLength(1);
    expect(bs[0]!.path).toEqual(["a", "b", "c3"]); // the newest version ends it
    expect(forkPoints(bs).size).toBe(0);
  });

  it("a path continued from an older version is its own branch; Main is the oldest", () => {
    t = 0;
    const links = [L("a", null), L("b", "a"), L("c1", "b"), L("c2", "b"), L("d2", "c2"), L("d1", "c1"), L("e1", "d1")];
    const bs = computeBranches(links);
    expect(bs.map((b) => b.key)).toEqual(["c1", "c2"]);
    expect(bs[0]!.path).toEqual(["a", "b", "c1", "d1", "e1"]);
    expect(bs[1]!.own.sort()).toEqual(["c2", "d2"]);
    expect([...forkPoints(bs).keys()]).toEqual(["b"]);
    const { named, toSave } = nameBranches(bs, []);
    expect(named.map((b) => b.name)).toEqual(["Main", "Branch 2"]);
    expect(toSave).toHaveLength(2);
  });

  it("a saved name follows its branch when the branch grows or splits again; the oldest keeps it", () => {
    t = 0;
    const links = [L("a", null), L("x", "a"), L("x1", "x"), L("y", "a"), L("y1", "y"), L("y2", "y"), L("y1a", "y1"), L("y2a", "y2")];
    const bs = computeBranches(links);
    expect(bs.map((b) => b.key)).toEqual(["x", "y1", "y2"]);
    const { named } = nameBranches(bs, [{ id: "r1", name: "Main", headMessageId: "x" }, { id: "r2", name: "Dark ending", headMessageId: "y" }]);
    expect(named.map((b) => b.name)).toEqual(["Main", "Dark ending", "Branch 2"]);
  });
});

describe("v1 rows held at a message", () => {
  it("the branch left stays ending there; the new one owns only what comes after", () => {
    t = 0;
    const links = [L("a", null), L("b", "a"), L("m", "b"), L("x", "m"), L("y", "x")];
    const saved = [{ id: "r1", name: "Main", headMessageId: "a", endMessageId: "m" }, { id: "r2", name: "Dark path", headMessageId: "x" }];
    const bs = computeBranches(links, heldEnds(saved));
    expect(bs).toHaveLength(2);
    const held = bs.find((b) => b.pinned)!;
    expect(held.path).toEqual(["a", "b", "m"]);
    expect(held.key).toBe(pinKey("m"));
    expect(held.own).toEqual([]);
    const dark = bs.find((b) => !b.pinned)!;
    expect(dark.key).toBe("x");
    expect(dark.own.sort()).toEqual(["x", "y"]);
    expect(dark.forkAt).toBe("m");
    expect(forkPoints(bs).get("m")).toHaveLength(2);
    const { named, unused } = nameBranches(bs, saved);
    expect(named.map((b) => b.name)).toEqual(["Main", "Dark path"]);
    expect(unused).toHaveLength(0);
  });

  it("before anything comes after it, the hold just names the branch ending there", () => {
    t = 0;
    const links = [L("a", null), L("b", "a"), L("m", "b")];
    const saved = [{ id: "r1", name: "Main", headMessageId: "a", endMessageId: "m" }];
    const bs = computeBranches(links, heldEnds(saved));
    expect(bs).toHaveLength(1);
    expect(bs[0]!.pinned).toBe(false);
    expect(nameBranches(bs, saved).named[0]!.name).toBe("Main");
  });

  it("without the hold the same tree is one straight branch (the bug Daniel saw: no split at the end)", () => {
    t = 0;
    const links = [L("a", null), L("b", "a"), L("m", "b"), L("x", "m"), L("y", "x")];
    expect(computeBranches(links)).toHaveLength(1);
  });
});

describe("v2: a branch is a named end (direct, like SillyTavern and Marinara)", () => {
  let n = 0;
  const id = () => `new${++n}`;
  const row = (rid: string, name: string, end: string | null): BranchRow => ({ id: rid, name, headMessageId: null, endMessageId: end });

  it("a chat with messages and no row gets Main at its newest end", () => {
    t = 0; n = 0;
    const links = [L("a", null), L("b", "a"), L("c1", "b"), L("c2", "b")];
    const r = resolveBranches(links, [], id);
    expect(r.branches.map((b) => [b.name, b.endId])).toEqual([["Main", "c2"]]);
    expect(r.save).toHaveLength(1);
  });

  it("Branch from here on the last message: a branch at once, nothing of its own yet; the split shows", () => {
    t = 0;
    const links = [L("a", null), L("b", "a"), L("m", "b"), L("x", "m"), L("y", "x")];
    const { branches } = resolveBranches(links, [row("r1", "Main", "y"), row("r2", "Branch 2", "m")], id);
    const [main, b2] = branches;
    expect(b2!.path).toEqual(["a", "b", "m"]);
    expect(b2!.own).toEqual([]);
    expect(b2!.forkAt).toBe("m");
    expect(main!.own.sort()).toEqual(["x", "y"]);
    expect(main!.forkAt).toBe("m");
    expect(splitPoints(branches).get("m")!.map((b) => b.name)).toEqual(["Main", "Branch 2"]);
  });

  it("a branch inside a branch splits from it; deleting one keeps what the others use", () => {
    t = 0;
    const links = [L("a", null), L("b", "a"), L("m", "b"), L("x", "m"), L("y", "x"), L("m2", "b"), L("p", "m2"), L("q", "p"), L("q2", "p")];
    const rows = [row("r1", "Main", "y"), row("r2", "Branch 2", "q"), row("r3", "Branch 3", "q2")];
    const { branches } = resolveBranches(links, rows, id);
    const b2 = branches[1]!, b3 = branches[2]!;
    expect(branches[0]!.forkAt).toBe("b");
    expect(b2.forkAt).toBe("p");
    expect(b3.forkAt).toBe("p");
    expect(b3.own).toEqual(["q2"]);
    expect(b2.own).toEqual(["q"]);
    // deleting m2 while on Branch 3 removes only Branch 3's own message; Branch 2 keeps m2, p, q
    expect(deletableFrom(links, branches, b3, "m2")).toEqual(["q2"]);
    // on Main, deleting m removes m, x, y (nobody else uses them)
    expect(deletableFrom(links, branches, branches[0], "m").sort()).toEqual(["m", "x", "y"]);
  });

  it("rows saved by v1 (a head, no end) become ends once; a row whose end is gone goes away", () => {
    t = 0;
    const links = [L("a", null), L("b", "a"), L("c1", "b"), L("c2", "b"), L("d2", "c2"), L("d1", "c1"), L("e1", "d1")];
    const r = resolveBranches(links, [{ id: "r1", name: "Main", headMessageId: "c1", endMessageId: null }, { id: "r2", name: "Dark", headMessageId: "c2", endMessageId: null }], id);
    expect(r.branches.map((b) => [b.name, b.endId])).toEqual([["Main", "e1"], ["Dark", "d2"]]);
    expect(r.save.map((x) => x.endMessageId)).toEqual(["e1", "d2"]);
    const r2 = resolveBranches(links, [row("r1", "Main", "e1"), row("r9", "Old", "zzz")], id);
    expect(r2.remove).toEqual(["r9"]);
    expect(r2.branches).toHaveLength(1);
  });
});

describe("branches in a real chat", () => {
  it("deleting a branch removes only its own messages; a path can become a separate chat with its world state", async () => {
    const w = await world(() => "reply");
    const { session } = await w.chat.createSession({ characterIds: ["lyra"] });
    const first = await w.chat.send(session.id, null, "hello", connection);
    const a = await w.chat.send(session.id, first.reply.id, "path A", connection);
    const b = await w.chat.send(session.id, first.reply.id, "path B", connection);
    await w.store.setDelta(b.reply.id, { world: { place: "Tavern" } });
    let bs = computeBranches(await w.store.messageLinks(session.id));
    expect(bs).toHaveLength(2);

    const copy = await w.chat.copyPathToNewChat(session.id, b.reply.id, "Path B");
    expect((await w.store.messageLinks(copy.id))).toHaveLength(4);
    expect(await w.core.state.resolve(copy.id, (await w.store.latestMessage(copy.id))!.id)).toMatchObject({ world: { place: "Tavern" } });

    const branchB = bs.find((x) => x.endId === b.reply.id)!;
    await w.store.deleteMessages(session.id, branchB.own);
    bs = computeBranches(await w.store.messageLinks(session.id));
    expect(bs).toHaveLength(1);
    expect(bs[0]!.endId).toBe(a.reply.id);
    expect(await w.store.getDelta(b.reply.id)).toBeUndefined();
  });
});

  it("a held end is saved, and deleting its message removes the hold", async () => {
    const w = await world(() => "reply");
    const { session } = await w.chat.createSession({ characterIds: ["lyra"] });
    const first = await w.chat.send(session.id, null, "hello", connection);
    await w.store.saveBranch({ id: "held", sessionId: session.id, name: "Main", headMessageId: first.userMessage.id, endMessageId: first.reply.id });
    expect((await w.store.listBranches(session.id))[0]).toMatchObject({ name: "Main", endMessageId: first.reply.id });
    await w.store.deleteMessages(session.id, [first.reply.id]);
    expect(await w.store.listBranches(session.id)).toHaveLength(0);
  });
