// Assistant audit reproductions. Author: CODEX, 2026-11-01.
// Expected failures assert the intended behavior; remove .fails as each reported bug is fixed.
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { AssistantChat, Character, Story, type AssistantMessage, type AssistantResult } from "@homunculus/schemas";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate, type GenerateRequest, type StreamChunk } from "@homunculus/core";
import { compactChat, loadSettings, runAssistant, toTurns } from "./engine.ts";
import { applyChange, runTool, type ToolContext } from "./tools.ts";
import { GUIDES } from "./guides.ts";

async function setup(script: (req: GenerateRequest, n: number) => StreamChunk[] = () => ["ok"]) {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  const store = new SqlStore(driver);
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  let n = 0;
  await core.loadModules([{ manifest: { id: "audit-ai", version: "1" }, register(api) {
    api.registerProvider({ id: "audit", name: "Audit", help: "", async *stream(req) {
      for (const c of script(req, n++)) yield c;
    } });
  } }]);
  const ctx: ToolContext = { store, saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
  return { store, core, ctx };
}
const audit = process.env.H2_AUDIT_VERIFY === "1" ? it : it.fails;
const main = { providerId: "audit", model: "audit" };
const message = (role: "user" | "assistant", text: string): AssistantMessage => ({ id: crypto.randomUUID(), role, text, reasoning: "", attachments: [], steps: [], rounds: [], results: [], createdAt: 1 });
const tool = (name: string, args: unknown): StreamChunk => ({ toolCalls: [{ id: crypto.randomUUID(), name, arguments: JSON.stringify(args) }] });
const proposal = (r: AssistantResult): Extract<AssistantResult, { type: "change" }> => {
  if (r.type !== "change") throw new Error("Expected a change proposal");
  return r;
};

describe("Assistant audit: confirmed bugs awaiting fixes", () => {
  audit("A1: importing a file must respect Ask me first", async () => {
    const { store, ctx } = await setup();
    ctx.saveNew = false;
    ctx.files.set("file", { name: "card.json", mime: "application/json", text: JSON.stringify({ spec: "chara_card_v2", data: { name: "Imported", description: "Description", personality: "", scenario: "", first_mes: "Hello", mes_example: "" } }) });
    const out = await runTool("import_file", JSON.stringify({ file: "file", as: "character" }), ctx);
    expect(out.error).toBeFalsy();
    expect(await store.listCharacters()).toHaveLength(0);
    expect(ctx.results[0]).toMatchObject({ type: "new", status: "waiting" });
  });

  audit("A2: Stop before a tool starts must prevent the library write", async () => {
    const ctrl = new AbortController();
    const { store, core } = await setup((_req, n) => n === 0 ? [tool("create", { kind: "character", data: { name: "Late write" } })] : ["ok"]);
    await runAssistant({ core, store, main, connections: {}, signal: ctrl.signal,
      chat: AssistantChat.parse({ id: "stop", messages: [message("user", "Make a character")], createdAt: 1, updatedAt: 1 }),
      onUpdate: (m) => { if (m.steps.some((s) => s.label === "…")) ctrl.abort(); },
    });
    expect(await store.listCharacters()).toHaveLength(0);
  });

  audit("A3: a Kit narrator proposal must detect a later manual narrator edit", async () => {
    const { store, ctx } = await setup();
    const kit = Story.parse({ id: "kit", name: "Kit", createdAt: 1, narrator: { kind: "vault", id: "old" } });
    await store.kits.save(kit);
    await runTool("change", JSON.stringify({ id: "kit:kit", changes: { narratorId: "proposed" } }), ctx);
    await store.kits.save({ ...kit, narrator: { kind: "vault", id: "manual" } });
    expect(await applyChange(store, proposal(ctx.results[0]!), ctx.newId)).toBe("stale");
    expect((await store.kits.get("kit"))!.narrator).toEqual({ kind: "vault", id: "manual" });
  });

  audit("A3b: a Kit lore proposal must detect later manual lore selection", async () => {
    const { store, ctx } = await setup();
    const kit = Story.parse({ id: "kit", name: "Kit", createdAt: 1, setup: { lorebooks: { mode: "add", add: ["old"], remove: [] } } });
    await store.kits.save(kit);
    await runTool("change", JSON.stringify({ id: "kit:kit", changes: { lorebookIds: ["proposed"] } }), ctx);
    await store.kits.save({ ...kit, setup: { ...kit.setup, lorebooks: { mode: "add", add: ["manual"], remove: [] } } });
    expect(await applyChange(store, proposal(ctx.results[0]!), ctx.newId)).toBe("stale");
  });

  audit("A4: tool replay must tell the model a created item was undone", async () => {
    const { store } = await setup();
    const reply = message("assistant", "Created it");
    reply.rounds = [{ text: "", calls: [{ id: "create", name: "create", arguments: "{}" }] }];
    reply.steps = [{ id: "create", name: "create", args: "{}", result: "Created character:item", label: "Created", error: false }];
    reply.results = [{ type: "created", kind: "character", itemId: "item", name: "Item", detail: "", undone: true }];
    const chat = AssistantChat.parse({ id: "replay", createdAt: 1, updatedAt: 1, messages: [message("user", "Make it"), reply, message("user", "What exists now?")] });
    expect(JSON.stringify(toTurns(chat, await loadSettings(store), "empty").slice(1))).toMatch(/undone|removed|trash/i);
  });

  audit("A5: a previously read guide must remain retrievable after history compaction", async () => {
    const { core, store, ctx } = await setup((_req, n) => n === 0 ? [tool("guide", { kind: "character" })] : ["A short summary"]);
    let chat = await runAssistant({ core, store, main, connections: {}, onUpdate: () => {},
      chat: AssistantChat.parse({ id: "guides", createdAt: 1, updatedAt: 1, messages: [message("user", "Read the character guide")] }),
    });
    for (let i = 0; i < 4; i++) chat.messages.push(message("user", `Question ${i}`), message("assistant", `Answer ${i}`));
    chat = await compactChat({ core, store, main, connections: {}, chat });
    expect(chat.compact).toBeDefined();
    expect(chat.guides).toContain("character");
    expect(JSON.stringify(toTurns(chat, await loadSettings(store), "empty").slice(1))).not.toContain("SillyTavern-compatible");
    ctx.guides = new Set(chat.guides); // Same restoration as runAssistant, after the guide has left the request.
    const out = await runTool("guide", JSON.stringify({ kind: "character" }), ctx);
    expect(out.result).toBe(GUIDES.character!.text);
  });

  audit("A6: read-more hints must advance by the absolute offset", async () => {
    const { store, ctx } = await setup();
    await store.saveCharacter(Character.parse({ id: "long", name: "Long", description: "a".repeat(9000) }));
    const next = await runTool("read", JSON.stringify({ id: "character:long", fields: ["description"], offset: 2500 }), ctx);
    expect(next.result).toContain("offset 5000");
    expect(next.result).toContain("4,000 more characters");
  });
});
