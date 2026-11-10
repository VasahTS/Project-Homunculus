// Tests for pictures with a main model that can't see them (D-115). Author: CLAUDE, 2026-11-10.
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { AssistantChat, type AssistantMessage } from "@homunculus/schemas";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate, type ConnectionConfig, type GenerateRequest, type StreamChunk } from "@homunculus/core";
import { loadSettings, runAssistant, saveSettings, toTurns } from "./engine.ts";
import { guessVision, modelKey, pictureRoute, rememberModels, seesPictures } from "./vision.ts";

async function setup(script: (req: GenerateRequest) => StreamChunk[]) {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  const store = new SqlStore(driver);
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  const seen: GenerateRequest[] = [];
  await core.loadModules([{ manifest: { id: "fake-ai", version: "1" }, register(api) {
    api.registerProvider({ id: "fake", name: "", help: "", async *stream(req) { seen.push(req); for (const c of script(req)) yield c; } });
  } }]);
  return { store, core, seen };
}
const glm: ConnectionConfig = { providerId: "fake", model: "glm-5.3", vision: false };
const flash: ConnectionConfig = { providerId: "fake", model: "gemini-flash" };
const pic = (id: string, name = `${id}.png`) => ({ type: "image" as const, id, name, mime: "image/png", base64: `BASE64-${id}` });
const userMsg = (text: string, attachments: AssistantMessage["attachments"] = []): AssistantMessage =>
  ({ id: crypto.randomUUID(), role: "user", text, reasoning: "", attachments, steps: [], rounds: [], results: [], createdAt: 1 });
const chatWith = (...messages: AssistantMessage[]) => AssistantChat.parse({ id: "c1", messages, createdAt: 1, updatedAt: 1 });
const isVision = (r: GenerateRequest) => r.connection.model === "gemini-flash";
const hasImage = (r: GenerateRequest) => (r.rich ?? []).some((t) => Array.isArray(t.content) && t.content.some((p) => p.type === "image"));
const textOf = (r: GenerateRequest) => (r.rich ?? []).map((t) => (typeof t.content === "string" ? t.content : t.content.map((p) => (p.type === "text" ? p.text : "<image>")).join(" "))).join("\n");
async function useVision(store: SqlStore) {
  const s = await loadSettings(store);
  await saveSettings(store, { ...s, vision: { connectionId: "flash", model: "" } });
}

describe("pictures for a model that can't see them (D-115)", () => {
  it("decides the route: describe when a vision model is set and the main one isn't known to see", () => {
    expect(pictureRoute(false, flash)).toBe("describe");
    expect(pictureRoute(undefined, flash)).toBe("describe");
    expect(pictureRoute(true, flash)).toBe("send");
    expect(pictureRoute(undefined, undefined)).toBe("send");
    expect(pictureRoute(false, undefined)).toBe("drop");
  });

  it("knows a model sees pictures from its switch, the service's list, then its name", async () => {
    const { store } = await setup(() => []);
    expect(await seesPictures(store, { providerId: "fake", model: "z-ai/glm-5.3" })).toBeUndefined();
    expect(await seesPictures(store, { providerId: "fake", model: "google/gemini-2.5-flash" })).toBe(true);
    await rememberModels(store, { providerId: "fake", baseUrl: "https://nano-gpt.com/api/v1/" }, [{ id: "z-ai/glm-5.3", vision: false }, { id: "x/vl", vision: true }, { id: "silent" }]);
    expect(await seesPictures(store, { providerId: "fake", baseUrl: "https://nano-gpt.com/api/v1", model: "z-ai/glm-5.3" })).toBe(false);
    expect(await seesPictures(store, { providerId: "fake", baseUrl: "https://nano-gpt.com/api/v1", model: "z-ai/glm-5.3", vision: true })).toBe(true);
    expect(modelKey({ providerId: "p", baseUrl: "https://a/v1/", model: " m " })).toBe("p|https://a/v1|m");
    expect(guessVision("qwen2.5-vl-72b")).toBe(true);
    expect(guessVision("glm-4.5v")).toBe(true);
    expect(guessVision("deepseek-v3")).toBeUndefined();
  });

  it("describes a new picture with the vision model, sends the words to the main model, and keeps them on the attachment", async () => {
    const { store, core, seen } = await setup((req) => isVision(req)
      ? ["A screenshot of a chat app. The send button says \"Go\".", { usage: { tokensIn: 300, tokensOut: 20, cost: 0.0001 } }]
      : ["The button says Go."]);
    await useVision(store);
    const updates: AssistantMessage[] = [];
    const done = await runAssistant({ core, store, chat: chatWith(userMsg("what does the button say?", [pic("p1")])), main: glm, connections: { flash }, onUpdate: (m) => updates.push(m) });
    const visionCall = seen.find(isVision)!;
    expect(hasImage(visionCall)).toBe(true);
    expect(textOf(visionCall)).toContain("what does the button say?");
    const mainCall = seen.find((r) => !isVision(r))!;
    expect(hasImage(mainCall)).toBe(false);
    expect(textOf(mainCall)).toContain("what the vision model saw");
    expect(textOf(mainCall)).toContain("The send button says \"Go\"");
    expect(textOf(mainCall)).toContain("You can't see pictures");
    expect(mainCall.tools!.some((t) => t.name === "look_at_image")).toBe(true);
    const att = done.messages[0]!.attachments[0]!;
    expect(att.type === "image" && att.description).toMatchObject({ model: "gemini-flash", edited: false });
    expect(updates.some((u) => u.activity === "Describing picture…")).toBe(true);
    expect(done.messages.at(-1)!.activity).toBeUndefined();
    expect(done.messages.at(-1)!.used!.vision).toMatchObject({ model: "gemini-flash", calls: 1, tokensIn: 300, tokensOut: 20 });
  });

  it("never describes a picture twice: a saved description is reused, an edited one wins, and the cache serves new chats", async () => {
    const { store, core, seen } = await setup((req) => isVision(req) ? ["A red door."] : ["ok"]);
    await useVision(store);
    const first = await runAssistant({ core, store, chat: chatWith(userMsg("look", [pic("p1")])), main: glm, connections: { flash }, onUpdate: () => {} });
    expect(seen.filter(isVision)).toHaveLength(1);
    // the user corrects the description; the next message uses the correction, with no new call
    const edited = { ...first, messages: first.messages.map((m, i) => i === 0 ? { ...m, attachments: m.attachments.map((a) => a.type === "image" ? { ...a, description: { text: "A blue door.", model: "", edited: true, at: 2 } } : a) } : m) };
    await runAssistant({ core, store, chat: { ...edited, messages: [...edited.messages, userMsg("and now?")] }, main: glm, connections: { flash }, onUpdate: () => {} });
    expect(seen.filter(isVision)).toHaveLength(1);
    expect(textOf(seen.at(-1)!)).toContain("A blue door.");
    expect(textOf(seen.at(-1)!)).toContain("corrected by the user");
    // the same picture with the same words in another chat: from the cache
    const again = await runAssistant({ core, store, chat: { ...chatWith(userMsg("look", [pic("p1")])), id: "c2" }, main: glm, connections: { flash }, onUpdate: () => {} });
    expect(seen.filter(isVision)).toHaveLength(1);
    expect(again.messages.at(-1)!.used!.vision).toMatchObject({ calls: 0, cached: 1 });
  });

  it("lets the main model ask the vision model again with look_at_image", async () => {
    let mainCalls = 0;
    const { store, core, seen } = await setup((req) => {
      if (isVision(req)) return [textOf(req).includes("ribbon") ? "The ribbon is red." : "A girl with a ribbon."];
      return mainCalls++ === 0 ? [{ toolCalls: [{ id: "l1", name: "look_at_image", arguments: JSON.stringify({ image: "p1", question: "What colour is the ribbon?" }) }] }] : ["Red."];
    });
    await useVision(store);
    const done = await runAssistant({ core, store, chat: chatWith(userMsg("describe her", [pic("p1")])), main: glm, connections: { flash }, onUpdate: () => {} });
    const step = done.messages.at(-1)!.steps[0]!;
    expect(step).toMatchObject({ name: "look_at_image", result: "The ribbon is red.", error: false });
    expect(seen.filter(isVision)).toHaveLength(2);
    expect(done.messages.at(-1)!.text).toBe("Red.");
  });

  it("keeps going when the vision model fails, and tells the main model the picture wasn't described", async () => {
    const { store, core, seen } = await setup((req) => { if (isVision(req)) throw new Error("refused"); return ["Sorry, I couldn't see it."]; });
    await useVision(store);
    const done = await runAssistant({ core, store, chat: chatWith(userMsg("look", [pic("p1")])), main: glm, connections: { flash }, onUpdate: () => {} });
    expect(done.messages.at(-1)!.error).toBeUndefined();
    expect(textOf(seen.find((r) => !isVision(r))!)).toContain("not described yet");
    const att = done.messages[0]!.attachments[0]!;
    expect(att.type === "image" && att.description).toBeFalsy();
  });

  it("without a vision model: pictures go as before, unless the model is known blind (then only the name goes)", async () => {
    const { store, core, seen } = await setup(() => ["ok"]);
    await runAssistant({ core, store, chat: chatWith(userMsg("look", [pic("p1")])), main: { providerId: "fake", model: "mystery" }, connections: {}, onUpdate: () => {} });
    expect(hasImage(seen[0]!)).toBe(true);
    await runAssistant({ core, store, chat: chatWith(userMsg("look", [pic("p1")])), main: glm, connections: {}, onUpdate: () => {} });
    expect(hasImage(seen[1]!)).toBe(false);
    expect(textOf(seen[1]!)).toContain("not sent: this model can't see pictures");
    expect(textOf(seen[1]!)).toContain("For Pictures, Use");
  });

  it("a main model that sees pictures gets them as they are, even with a vision model set", async () => {
    const { store, core, seen } = await setup(() => ["ok"]);
    await useVision(store);
    await runAssistant({ core, store, chat: chatWith(userMsg("look", [pic("p1")])), main: { providerId: "fake", model: "glm-5.3", vision: true }, connections: { flash }, onUpdate: () => {} });
    expect(seen).toHaveLength(1);
    expect(hasImage(seen[0]!)).toBe(true);
  });

  it("older descriptions are shortened in later requests; the newest two messages keep them whole", async () => {
    const { store } = await setup(() => []);
    const long = "x".repeat(2000);
    const withDesc = (id: string) => ({ ...pic(id), description: { text: long, model: "m", edited: false, at: 1 } });
    const chat = chatWith(userMsg("a", [withDesc("p1")]), userMsg("b"), userMsg("c"));
    const turns = toTurns(chat, await loadSettings(store), "", "describe");
    const first = turns.find((t) => t.role === "user" && String(t.content).includes("p1"))!;
    expect(String(first.content)).toContain("shortened; look_at_image for details");
  });
});
