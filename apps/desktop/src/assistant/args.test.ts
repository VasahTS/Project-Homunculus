// D-120: tool arguments as some providers deliver them (XML-style tool calls turned back into JSON). CLAUDE.
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { SqlJsDriver, SqlStore, coreMigrations, migrate } from "@homunculus/core";
import { errorText, looseArgs } from "./args.ts";
import { runTool, saveDraftItem, type ToolContext } from "./tools.ts";

async function bookCtx() {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  const ctx: ToolContext = { store: new SqlStore(driver), saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(["lorebook"]), remember: async () => {} };
  const made = await runTool("create", JSON.stringify({ kind: "lorebook", data: { name: "Wren", entries: [
    { id: "e-wren", title: "Wren", keys: ["wren", "tinkerer"], content: "Wren is a traveling tinkerer. She is practical andobservant." },
    { id: "e-cart", title: "The Cart and Barley", keys: ["cart", "rooster", "barley", "mule"], content: "Her mule-drawn cart." },
  ] } }), ctx);
  const ref = /lorebook:[\w-]+/.exec(made.result)![0];
  return { ctx, ref };
}

describe("looseArgs", () => {
  it("unwraps { item } lists, at any depth, and one wrapped element", () => {
    expect(looseArgs({ changes: { entries: { update: { item: [{ id: "a", keys: { item: ["x", "y"] } }] } } } }))
      .toEqual({ changes: { entries: { update: [{ id: "a", keys: ["x", "y"] }] } } });
    expect(looseArgs({ entries: { update: { item: { id: "a" } } } })).toEqual({ entries: { update: [{ id: "a" }] } });
    expect(looseArgs({ keys: { item: { item: ["a", "b"] } } })).toEqual({ keys: ["a", "b"] });
  });
  it("turns schema booleans and numbers sent as text back into values, never a text field", () => {
    expect(looseArgs({ enabled: "true", constant: "false", order: "100", content: "true", title: "false", value: "1" }))
      .toEqual({ enabled: true, constant: false, order: 100, content: "true", title: "false", value: "1" });
  });
  it("drops empty-text operation lists and parses lists sent as JSON text", () => {
    expect(looseArgs({ entries: { add: "", remove: "", update: '[{"id":"a"}]' } })).toEqual({ entries: { update: [{ id: "a" }] } });
    expect(looseArgs({ content: "[not a list]" })).toEqual({ content: "[not a list]" });
  });
});

describe("change with provider-wrapped arguments (Daniel's real failed calls)", () => {
  // The shapes of the 14 `change` calls MiniMax M3.1 Flash made on NanoGPT on 2026-11-12, all "entries.update must be a list".
  const calls = (ref: string) => [
    { changes: { entries: { update: { item: [{ content: "Wren is a traveling tinkerer. She is practical and observant.", id: "e-wren", keys: { item: ["wren", "tinkerer", "tinker"] } }, { id: "e-cart", keys: { item: ["cart", "rooster", "barley", "mule", "wagon"] } }] } } }, id: ref, summary: "Fix a typo and add a key." },
    { changes: { entries: { update: { item: { keys: { item: ["cart", "rooster", "barley", "mule", "wagon"] }, title: "The Cart and Barley" } } } }, id: ref, summary: "Add a key by title." },
    { changes: { entries: { update: { item: { id: "e-wren", enabled: "true" } } } }, id: ref, summary: "Probe." },
    { changes: { entries: { add: "", remove: "", update: { item: { content: "Wren is a traveling tinkerer. She is practical and observant.", id: "e-wren" } } } }, id: ref, summary: "Fix the typo." },
    { changes: { entries: { add: { item: { content: "Wren works out of Millford in spring.", keys: { item: { item: ["millford", "saltgate"] } }, title: "Where She Is Found" } } } }, id: ref, summary: "Add an entry." },
  ];
  it("each one is now a proposal", async () => {
    const { ctx, ref } = await bookCtx();
    for (const c of calls(ref)) {
      const r = await runTool("change", JSON.stringify(c), ctx);
      expect(r.error, r.result).toBeFalsy();
    }
  });
  it("a really wrong call still fails, with a readable message", async () => {
    const { ctx, ref } = await bookCtx();
    const r = await runTool("change", JSON.stringify({ id: ref, changes: { entries: { update: [{ id: "e-wren", constant: "maybe" }] } } }), ctx);
    expect(r.error).toBe(true);
    expect(r.result).toContain("constant: expected boolean, received string");
    expect(r.result).not.toContain('"code"');
  });
});

describe("lorebook entries resent in add", () => {
  it("refuses a resend of the whole book instead of duplicating it", async () => {
    const { ctx, ref } = await bookCtx();
    const r = await runTool("change", JSON.stringify({ id: ref, changes: { entries: {
      update: [{ id: "e-cart", keys: ["cart", "wagon"] }],
      add: [{ title: "Wren", keys: ["wren", "tinkerer"], content: "Wren is a traveling tinkerer. She is practical andobservant." }, { title: "Pepper", keys: ["pepper"], content: "Her old mule." }],
    } } }), ctx);
    expect(r.error).toBe(true);
    expect(r.result).toContain("entries.add repeats 1 entry already in the book (“Wren”)");
  });
  it("a draft that resends entries is refused on Apply, and the book keeps one copy", async () => {
    const { ctx, ref } = await bookCtx();
    await expect(saveDraftItem(ctx.store, "lorebook", { id: ref, entries: { add: [{ id: "e-wren", title: "Wren", keys: ["wren"], content: "x" }] } }, ctx.newId)).rejects.toThrow(/already in the book/);
    const book = JSON.parse((await runTool("read", JSON.stringify({ id: ref, fields: ["entries"] }), ctx)).result) as unknown[];
    expect(book).toHaveLength(2);
  });
});

describe("read several lore entries at once", () => {
  it("returns each asked entry, and says which one is missing", async () => {
    const { ctx, ref } = await bookCtx();
    const r = JSON.parse((await runTool("read", JSON.stringify({ id: ref, fields: ["entry:Wren", "entry:The Cart and Barley", "entry:Nope"] }), ctx)).result) as Array<Record<string, unknown>>;
    expect(r.map((e) => e.title ?? e.entry)).toEqual(["Wren", "The Cart and Barley", "Nope"]);
    expect(r[2]!.missing).toBeTruthy();
    const c = JSON.parse((await runTool("read", JSON.stringify({ id: ref, fields: ["entry:e-wren", "entry:e-cart", "content"] }), ctx)).result) as Array<Record<string, unknown>>;
    expect(c.map((e) => e.content)).toEqual(["Wren is a traveling tinkerer. She is practical andobservant.", "Her mule-drawn cart."]);
  });
});

describe("errorText", () => {
  it("keeps plain errors as they are", () => { expect(errorText(new Error("Nope."))).toBe("Nope."); });
});
