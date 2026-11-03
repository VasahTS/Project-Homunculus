// Optional retrieval uses an independent connection and leaves writes/approvals with the main Assistant. CODEX.
import { describe, expect, it } from "vitest";
import { AssistantChat, AssistantPersona, Character } from "@homunculus/schemas";
import { HomunculusCore } from "@homunculus/core";
import { newTestStore } from "../../../../packages/core/test/helpers.ts";
import { loadSettings, runAssistant, saveSettings, toolsFor, toTurns } from "./engine.ts";
import { consultLibrary } from "./helper.ts";
import type { ToolContext } from "./tools.ts";
const user = { id: "u", role: "user", text: "Inspect Rin.", createdAt: 1 };
async function setup() {
  const { store } = await newTestStore(); const core = new HomunculusCore({ tree: store, stateRepository: store });
  const ctx: ToolContext = { store, newId: () => crypto.randomUUID(), saveNew: true, files: new Map(), images: new Map(), guides: new Set(), results: [], remember: async () => { throw Error("No memory writes"); } };
  return { store, core, ctx };
}
describe("optional Assistant tool helper", () => {
  it("is absent from old/default Assistants and all default requests", async () => {
    const { store } = await setup(); const s = await loadSettings(store);
    expect(AssistantPersona.parse({ id: "old", name: "Old" }).toolHelper?.enabled).toBeFalsy();
    expect(toolsFor(s).map(t => t.name)).not.toContain("consult_library");
  });
  it("persists the helper's own connection/model without changing the main one", async () => {
    const { store } = await setup(); const s = await loadSettings(store);
    s.assistants[0]!.toolHelper = { enabled: true, connectionId: "helper-profile", model: "small", maxSteps: 4 };
    await saveSettings(store, s); const loaded = await loadSettings(store);
    expect(loaded.assistants[0]!.toolHelper).toEqual(s.assistants[0]!.toolHelper);
    expect(loaded.assistants[0]!.connectionId).toBeNull();
  });
  it("routes retrieval to the helper, returns bounded evidence, and records its own usage/trace", async () => {
    const { store, core } = await setup(); const s = await loadSettings(store);
    s.assistants.forEach(a => { a.toolHelper = { enabled: true, connectionId: "worker", model: "helper-model", maxSteps: 4 }; }); await saveSettings(store, s);
    await store.saveCharacter(Character.parse({ id: "rin", name: "Rin", description: "Explorer. " + "x".repeat(12000) }));
    const mainRequests: string[] = [], helperRequests: string[] = []; let mains = 0, helpers = 0;
    core.connections.stream = async function* (conn, _messages, _signal, req) {
      if (conn.model === "helper-model") {
        helperRequests.push(JSON.stringify(req!.rich));
        expect(conn.providerId).toBe("helper-provider"); expect(conn.baseUrl).toBe("http://helper.invalid");
        expect(conn.fallback).toBeUndefined();
        expect(req!.tools!.map(t => t.name)).not.toContain("create");
        yield { usage: { tokensIn: 100, tokensOut: 20, cost: 0.001 } };
        if (helpers++ === 0) yield { toolCalls: [{ id: "read-worker", name: "read", arguments: JSON.stringify({ id: "character:rin", fields: ["description"] }) }] };
        else yield "Rin is an explorer. " + "brief ".repeat(1200);
      } else {
        mainRequests.push(JSON.stringify(req!.rich));
        yield { usage: { tokensIn: 50, tokensOut: 10, cost: 0.01 } };
        if (mains++ === 0) yield { toolCalls: [{ id: "delegate", name: "consult_library", arguments: JSON.stringify({ task: "Summarize character:rin's identity only." }) }] };
        else { expect(mainRequests.at(-1)).toContain("character:rin"); yield "Rin is an explorer."; }
      }
    };
    const out = await runAssistant({ core, store, chat: AssistantChat.parse({ id: "h", messages: [user], createdAt: 1, updatedAt: 1 }), main: { providerId: "main", model: "main-model" }, connections: { worker: { providerId: "helper-provider", model: "default-helper", baseUrl: "http://helper.invalid", fallback: { providerId: "main", model: "expensive-main" } } }, onUpdate: () => {} });
    const reply = out.messages.at(-1)!; expect(reply.error).toBeUndefined();
    const report = JSON.parse(reply.steps[0]!.result);
    expect(report.summary.length).toBeLessThanOrEqual(2000); expect(report.summaryTruncated).toBe(true);
    expect(report.evidence[0]).toMatchObject({ name: "read", args: { id: "character:rin", fields: ["description"] }, ranges: [{ nextOffset: 6000 }] });
    expect(reply.steps[0]!.helperSteps).toHaveLength(1);
    expect(reply.used!.helper).toMatchObject({ model: "helper-model", calls: 2, tools: 1, tokensIn: 200, tokensOut: 40, cost: 0.002 });
    expect(reply.used!.tokensIn).toBe(100); expect(reply.used!.cost).toBe(0.02);
    expect(mainRequests.at(-1)).not.toContain("x".repeat(500)); expect(helperRequests[0]).not.toContain("Inspect Rin.");
    const continued = toTurns({ ...out, messages: [...out.messages, { ...out.messages[0]!, id: "continue", text: "Continue." }] }, await loadSettings(store), "1 character");
    const brief = JSON.parse(continued.find(t => t.role === "tool")!.content as string);
    expect(brief.evidence[0].ranges[0].nextOffset).toBe(6000); expect(brief.summaryExcerpted).toBe(true);
    expect(JSON.stringify(continued)).not.toContain("x".repeat(500));
  });
  it("refuses an unavailable helper connection instead of silently spending on the main model", async () => {
    const { store, core } = await setup(), s = await loadSettings(store);
    s.assistants.forEach(a => { a.toolHelper = { enabled: true, connectionId: "missing", model: "", maxSteps: 2 }; }); await saveSettings(store, s);
    let n = 0; core.connections.stream = async function* (_c, _m, _sig, req) { if (n++ === 0) yield { toolCalls: [{ id: "d", name: "consult_library", arguments: '{"task":"Find Rin"}' }] }; else { expect(JSON.stringify(req!.rich)).toContain("connection"); yield "Pick a helper connection."; } };
    const out = await runAssistant({ core, store, chat: AssistantChat.parse({ id: "h", messages: [user], createdAt: 1, updatedAt: 1 }), main: { providerId: "main", model: "main" }, connections: {}, onUpdate: () => {} });
    expect(n).toBe(2); expect(out.messages.at(-1)!.steps[0]!.error).toBe(true);
  });
  it("enforces the read-only allowlist, total call budget and repeated-call stop", async () => {
    const { core, ctx, store } = await setup(); let calls = 0;
    core.connections.stream = async function* () { calls++; yield { toolCalls: Array.from({ length: 10 }, (_, i) => ({ id: `${calls}-${i}`, name: i ? "find" : "create", arguments: i ? '{}' : '{"kind":"persona","data":{"name":"Sneaky"}}' })) }; };
    const out = await consultLibrary({ core, connection: { providerId: "fake", model: "worker" }, task: "Find a card", ctx, maxSteps: 4, tools: ["find", "read", "guide", "folders"] });
    expect(out.helperSteps!.length).toBeLessThanOrEqual(4); expect(calls).toBeLessThanOrEqual(5);
    expect(out.helperSteps![0]!.error).toBe(true); expect(await store.personas.list()).toHaveLength(0); expect(ctx.results).toHaveLength(0);
    expect(JSON.parse(out.result).complete).toBe(false);
  });
  it.each(["web_fetch", "read_file", "consult_library", "remember"])("cannot execute disabled or recursive %s", async name => {
    const { core, ctx } = await setup(); let n = 0;
    core.connections.stream = async function* () { if (!n++) yield { toolCalls: [{ id: "bad", name, arguments: '{}' }] }; else yield "Unavailable."; };
    const out = await consultLibrary({ core, connection: { providerId: "fake", model: "worker" }, task: "Inspect", ctx, maxSteps: 2, tools: ["find"] });
    expect(out.helperSteps![0]!.error).toBe(true); expect(out.helperSteps![0]!.result).toContain("not available");
  });
  it("propagates Stop to the helper request before executing requested tools", async () => {
    const { core, ctx } = await setup(); const stop = new AbortController(); ctx.signal = stop.signal;
    core.connections.stream = async function* (_c, _m, signal) { expect(signal).toBe(stop.signal); stop.abort(new Error("Stopped")); yield { toolCalls: [{ id: "x", name: "find", arguments: '{}' }] }; };
    await expect(consultLibrary({ core, connection: { providerId: "fake", model: "worker" }, task: "Inspect", ctx, maxSteps: 2, tools: ["find"] })).rejects.toThrow("Stopped");
  });
  it("stops at two consultations per reply and preserves approval/draft tool switches", async () => {
    const { store, core } = await setup(), s = await loadSettings(store);
    s.toolsOff = ["files", "web", "create"];
    s.assistants.forEach(a => { a.toolHelper = { enabled: true, connectionId: "worker", model: "helper", maxSteps: 2 }; }); await saveSettings(store, s);
    let main = 0, helpers = 0;
    core.connections.stream = async function* (conn, _m, _sig, req) {
      if (conn.model === "helper") {
        helpers++; const names = req!.tools!.map(t => t.name);
        expect(names).not.toContain("read_file"); expect(names).not.toContain("web_fetch"); expect(names).not.toContain("change"); expect(names).not.toContain("consult_library"); yield "No matching source.";
      } else if (main++ === 0) {
        expect(req!.tools!.map(t => t.name)).not.toContain("create");
        yield { toolCalls: [1, 2, 3].map(i => ({ id: `consult-${i}`, name: "consult_library", arguments: JSON.stringify({ task: `Find source ${i}` }) })) };
      } else yield "Done.";
    };
    const out = await runAssistant({ core, store, chat: AssistantChat.parse({ id: "limit", draftFirst: true, messages: [user], createdAt: 1, updatedAt: 1 }), main: { providerId: "fake", model: "main" }, connections: { worker: { providerId: "fake", model: "helper" } }, onUpdate: () => {} });
    expect(helpers).toBe(2); expect(out.messages.at(-1)!.steps[2]!.result).toContain("Two helper consultations"); expect(out.messages.at(-1)!.results).toHaveLength(0);
  });
  it("saves a stopped parent call with its completed helper trace and usage", async () => {
    const { store, core } = await setup(), s = await loadSettings(store), stop = new AbortController();
    s.assistants.forEach(a => { a.toolHelper = { enabled: true, connectionId: "worker", model: "helper", maxSteps: 2 }; }); await saveSettings(store, s);
    let worker = 0;
    core.connections.stream = async function* (conn) {
      if (conn.model !== "helper") yield { toolCalls: [{ id: "delegate", name: "consult_library", arguments: '{"task":"Find Rin"}' }] };
      else if (!worker++) yield { toolCalls: [{ id: "find", name: "find", arguments: '{}' }] };
      else { stop.abort(new Error("Stopped")); throw new Error("Stopped"); }
    };
    const out = await runAssistant({ core, store, signal: stop.signal, chat: AssistantChat.parse({ id: "stop", messages: [user], createdAt: 1, updatedAt: 1 }), main: { providerId: "fake", model: "main" }, connections: { worker: { providerId: "fake", model: "helper" } }, onUpdate: () => {} });
    const reply = out.messages.at(-1)!; expect(reply.error).toBe("Stopped");
    expect(reply.steps[0]).toMatchObject({ error: true, result: "Stopped before execution.", helperSteps: [{ name: "find" }] });
    expect(reply.used!.helper!.calls).toBe(2);
  });
  it("reports provider failure without retrying on another connection", async () => {
    const { core, ctx } = await setup(); let n = 0;
    core.connections.stream = async function* () { n++; throw Error("Provider unavailable"); };
    const out = await consultLibrary({ core, connection: { providerId: "fake", model: "worker" }, task: "Find Rin", ctx, tools: ["read"], maxSteps: 2 });
    expect(n).toBe(1); expect(out.error).toBe(true); expect(JSON.parse(out.result).warning).toContain("Provider unavailable");
  });
  it("marks empty briefs as incomplete instead of claiming successful retrieval", async () => {
    const { core, ctx } = await setup(); core.connections.stream = async function* () { yield { usage: { tokensIn: 20, tokensOut: 0 } }; };
    const out = await consultLibrary({ core, connection: { providerId: "fake", model: "worker" }, task: "Find Rin", ctx, tools: ["read"], maxSteps: 2 });
    expect(out.error).toBe(true); expect(JSON.parse(out.result)).toMatchObject({ complete: false, warning: expect.stringContaining("no brief") });
  });
});
