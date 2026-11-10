// The Assistant reads and writes cues (D-113). Author: CLAUDE, 2026-11-10.
import { describe, expect, it } from "vitest";
import type { AssistantResult } from "@homunculus/schemas";
import { newTestStore } from "../../../../packages/core/test/helpers.ts";
import { applyChange, runTool, saveDraftItem, undoCreate, type ToolContext } from "./tools.ts";
import { DRAFT_BLOCK, GUIDES } from "./guides.ts";

async function setup() {
  const { store } = await newTestStore();
  const ctx: ToolContext = { store, saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
  return { store, ctx };
}
const args = JSON.stringify;

describe("Assistant cues (D-113)", () => {
  it("creates a cue from loose data (missing keys and ids are filled in), off until switched on; Undo deletes it", async () => {
    const { store, ctx } = await setup();
    await store.saveCharacter({ id: "lyra", name: "Lyra" });
    const out = await runTool("create", args({ kind: "cue", data: {
      name: "Scene Direction", icon: "🎬", characterIds: ["character:lyra"],
      signals: [{ key: "heat", kind: "words", words: ["kiss", "lips"], last: 4 }, { key: "streak", kind: "words", words: ["kiss"], measure: "streak", perMessage: 2 }],
      values: [{ key: "scene", initial: "none", otherwise: "reset", rules: [{ when: [{ path: "signal.heat", op: "atLeast", value: "2" }], do: "set", value: "active" }] }],
      groups: [{ pick: "rotate", wrap: "[Direction: {{text}}]", placement: { position: "after" }, items: [{ text: "Slow down." }, { text: "Use the room.", when: [{ path: "value.scene", op: "equals", value: "active" }] }] }],
    } }), ctx);
    expect(out.error, out.result).toBeFalsy();
    const card = ctx.results.at(-1) as Extract<AssistantResult, { type: "created" }>;
    expect(card).toMatchObject({ kind: "cue", name: "Scene Direction" });
    expect(card.detail).toMatch(/2 texts · off until switched on/);
    const saved = (await store.cues.get(card.itemId))!;
    expect(saved).toMatchObject({ namespace: "cue-scene-direction", characterIds: ["lyra"], groups: [{ key: "group1", items: [{ id: "t1_1" }, { id: "t1_2" }] }] });
    expect(await store.getDefaultSetup()).not.toHaveProperty("cues");
    // it can find and read it
    const found = await runTool("find", args({ kind: "cue" }), ctx);
    expect(found.result).toContain(`cue:${saved.id}`);
    await undoCreate(store, "cue", saved.id);
    expect(await store.cues.get(saved.id)).toBeUndefined();
  });

  it("changes are proposed, then applied on approval; it never proposes a cue for the Trash", async () => {
    const { store, ctx } = await setup();
    await store.saveCue({ id: "c1", name: "Mood", namespace: "cue-mood", groups: [{ key: "g", items: [{ id: "a", text: "Calm." }] }] });
    const out = await runTool("change", args({ id: "cue:c1", summary: "Add a stormy text", changes: { groups: [{ key: "g", pick: "random", items: [{ id: "a", text: "Calm." }, { id: "b", text: "Stormy." }] }] } }), ctx);
    expect(out.error, out.result).toBeFalsy();
    const change = ctx.results.at(-1) as Extract<AssistantResult, { type: "change" }>;
    expect(change).toMatchObject({ type: "change", kind: "cue", itemId: "c1", status: "waiting" });
    expect((await store.cues.get("c1"))!.groups[0]!.items).toHaveLength(1);
    expect(await applyChange(store, change, () => crypto.randomUUID())).toBe("applied");
    expect((await store.cues.get("c1"))).toMatchObject({ namespace: "cue-mood", groups: [{ pick: "random", items: [{ id: "a" }, { id: "b" }] }] });
    const trash = await runTool("propose_trash", args({ id: "cue:c1", reason: "unused" }), ctx);
    expect(trash.error).toBe(true);
    expect(trash.result).toMatch(/Library → Cues/);
  });

  it("drafts: a homunculus-cue block saves as a cue; the guide explains converting JanitorAI scripts", async () => {
    const { store } = await setup();
    const reply = "```homunculus-cue\n{ \"name\": \"Weather\", \"groups\": [{ \"items\": [{ \"text\": \"It rains.\" }] }] }\n```";
    const [m] = [...reply.matchAll(DRAFT_BLOCK)];
    expect(m?.[1]).toBe("cue");
    const r = await saveDraftItem(store, "cue", JSON.parse(m![2]!), () => crypto.randomUUID());
    expect(r).toMatchObject({ type: "created", kind: "cue", name: "Weather" });
    expect(GUIDES.cue!.text).toMatch(/Converting a JanitorAI script/);
    expect(GUIDES.cue!.fields).toEqual(expect.arrayContaining(["signals", "values", "groups", "characterIds"]));
  });
});
