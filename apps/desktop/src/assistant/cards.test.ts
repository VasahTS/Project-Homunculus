// Tests for the decision cards and the ZIP reader (D-115). Author: CLAUDE, 2026-11-10.
import initSqlJs from "sql.js";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { AssistantChat, type AssistantMessage } from "@homunculus/schemas";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate, type GenerateRequest, type StreamChunk } from "@homunculus/core";
import { runAssistant, toTurns, loadSettings, withPictureDescription } from "./engine.ts";
import { answersMessage, mergeCastOn, questionFrom, understoodFrom, understoodText } from "./cards.ts";
import { approveNew } from "./tools.ts";
import { unzip } from "../zip.ts";

async function setup(script: (req: GenerateRequest, n: number) => StreamChunk[]) {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  const store = new SqlStore(driver);
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  const seen: GenerateRequest[] = [];
  let n = 0;
  await core.loadModules([{ manifest: { id: "fake-ai", version: "1" }, register(api) {
    api.registerProvider({ id: "fake", name: "", help: "", async *stream(req) { seen.push(req); for (const c of script(req, n++)) yield c; } });
  } }]);
  return { store, core, seen };
}
const main = { providerId: "fake", model: "m" };
const call = (name: string, args: unknown, id = name) => ({ toolCalls: [{ id, name, arguments: JSON.stringify(args) }] });
const userMsg = (text: string, extra: Partial<AssistantMessage> = {}): AssistantMessage =>
  ({ id: crypto.randomUUID(), role: "user", text, reasoning: "", attachments: [], steps: [], rounds: [], results: [], createdAt: 1, ...extra });
const chatWith = (...messages: AssistantMessage[]) => AssistantChat.parse({ id: "c1", messages, createdAt: 1, updatedAt: 1 });
const understanding = { title: "After Hours", synopsis: "Mei is locked in the studio with Ren.", cast: [{ id: "A", name: "Mei", looks: "short hair", line: "I just left fast.", pages: "p. 3" }, { id: "B", name: "Ren" }, { id: "D", name: "", looks: "girl in a coat" }], setting: "An art studio at night.", unsure: "Page 6's last balloon." };

/** A tiny ZIP: one stored and one deflated file, plus a folder. */
function zipOf(files: Array<{ name: string; data: Uint8Array; deflate?: boolean }>): Uint8Array {
  const enc = new TextEncoder();
  const parts: number[] = [], central: number[] = [];
  const le = (n: number, b: number) => Array.from({ length: b }, (_, i) => (n >>> (8 * i)) & 255);
  for (const f of files) {
    const name = enc.encode(f.name), body = f.deflate ? new Uint8Array(deflateRawSync(f.data)) : f.data, offset = parts.length;
    parts.push(...le(0x04034b50, 4), ...le(20, 2), 0, 0, ...le(f.deflate ? 8 : 0, 2), 0, 0, 0, 0, ...le(0, 4), ...le(body.length, 4), ...le(f.data.length, 4), ...le(name.length, 2), 0, 0, ...name, ...body);
    central.push(...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), 0, 0, ...le(f.deflate ? 8 : 0, 2), 0, 0, 0, 0, ...le(0, 4), ...le(body.length, 4), ...le(f.data.length, 4), ...le(name.length, 2), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...le(offset, 4), ...name);
  }
  const cdStart = parts.length;
  return new Uint8Array([...parts, ...central, ...le(0x06054b50, 4), 0, 0, 0, 0, ...le(files.length, 2), ...le(files.length, 2), ...le(central.length, 4), ...le(cdStart, 4), 0, 0]);
}

describe("decision cards (D-115)", () => {
  it("What I Understood: the user's corrections and merges are what the model reads next", () => {
    const r = understoodFrom(understanding, "u1");
    expect(r.cast.map((c) => c.id)).toEqual(["A", "B", "D"]);
    const corrected = mergeCastOn({ ...r, synopsis: "Mei and her brother Ren are locked in.", edited: ["synopsis"] }, "D", "A");
    expect(corrected.cast.map((c) => c.id)).toEqual(["A", "B"]);
    expect(corrected.cast[0]).toMatchObject({ name: "Mei", looks: "short hair" });
    const t = understoodText({ ...corrected, confirmed: true });
    expect(t).toContain("Synopsis (corrected by the user): Mei and her brother Ren are locked in.");
    expect(t).toContain("Cast (corrected by the user):");
    expect(t).toContain("The user merged D into A Mei");
    expect(t).toContain("the user said it looks right");
    expect(() => understoodFrom({ synopsis: "" }, "x")).toThrow();
  });

  it("questions: options need labels, at most 4 questions, answers go back as one message", () => {
    const q = questionFrom({ questions: [
      { question: "Who is {{user}}?", options: [{ label: "Mei", cast: "A" }, { label: "Ren", cast: "B" }, { label: "Someone New" }] },
      { question: "What should I make?", options: [{ label: "The Card" }, { label: "The Card and a Story" }] },
      { question: "bad", options: [{ label: "only one" }] },
    ] }, "q1");
    expect(q.questions).toHaveLength(2);
    expect(answersMessage(q, ["Ren", "The Card and a Story"])).toBe("Who is {{user}}? Ren\nWhat should I make? The Card and a Story");
    expect(answersMessage({ ...q, questions: q.questions.slice(0, 1) }, ["Ren"])).toBe("Ren");
  });

  it("ask and show_understanding end the reply; the card is what the model reads after the user answers", async () => {
    const { store, core, seen } = await setup((_r, n) => n === 0 ? ["Here is what I understood.", call("show_understanding", understanding)] : ["Thanks."]);
    const done = await runAssistant({ core, store, chat: chatWith(userMsg("read it")), main, connections: {}, onUpdate: () => {} });
    expect(seen).toHaveLength(1);
    const reply = done.messages.at(-1)!;
    expect(reply.text).toBe("Here is what I understood.");
    expect(reply.results[0]).toMatchObject({ type: "understood", title: "After Hours" });
    // the user corrects the card and says it looks right
    const card = { ...(reply.results[0] as Extract<typeof reply.results[0], { type: "understood" }>), setting: "A library.", edited: ["setting"], confirmed: true };
    const next = { ...done, messages: [...done.messages.slice(0, -1), { ...reply, results: [card] }, userMsg("Looks right now (I corrected the card).")] };
    const turns = toTurns(next, await loadSettings(store), "");
    const all = turns.map((t) => (typeof t.content === "string" ? t.content : "")).join("\n");
    expect(all).toContain("Setting (corrected by the user): A library.");
    expect(all.split("Here is what I understood.").length - 1).toBe(1); // the reply's text isn't sent twice
  });

  it("in a chat with comic pages, new items wait for Keep, with their sources; Keep saves the chosen portrait", async () => {
    const { store, core } = await setup((_r, n) => n === 0
      ? [call("create", { kind: "character", data: { name: "After Hours", description: "## Synopsis\n…" }, sources: { description: "p. 1–8", firstMessages: "p. 2", bad: 3 } })]
      : ["Done."]);
    const page = { type: "image" as const, id: "c1", name: "1.png", mime: "image/png", base64: "QUJD", comicPage: true };
    const done = await runAssistant({ core, store, chat: chatWith(userMsg("After Hours · 1 page · manga order", { attachments: [page] })), main: { providerId: "fake", model: "gemini-pro" }, connections: {}, onUpdate: () => {} });
    const r = done.messages.at(-1)!.results[0]!;
    expect(r).toMatchObject({ type: "new", kind: "character", status: "waiting", sources: { description: "p. 1–8", firstMessages: "p. 2" } });
    expect(await store.listCharacters()).toHaveLength(0);
    const made = await approveNew(store, { ...(r as Extract<typeof r, { type: "new" }>), picture: { mime: "image/png", base64: "QUJD" } }, () => crypto.randomUUID());
    expect((await store.getAvatar(made.id))?.base64).toBe("QUJD");
  });

  it("a corrected picture description reaches every branch that shares the message", () => {
    const m = userMsg("look", { attachments: [{ type: "image", id: "p1", name: "a.png", mime: "image/png", base64: "x" }] });
    const chat = { ...chatWith(m), branches: [{ id: "b", name: "b", messages: [m], guides: [] }] };
    const next = withPictureDescription(chat, "p1", { text: "A door.", model: "", edited: true, at: 1 });
    for (const msg of [next.messages[0]!, next.branches![0]!.messages[0]!]) expect(msg.attachments[0]).toMatchObject({ description: { text: "A door.", edited: true } });
  });
});

describe("ZIP / CBZ reader (D-115)", () => {
  it("reads stored and deflated pages and skips folders and unwanted names", async () => {
    const page = new Uint8Array(Array.from({ length: 3000 }, (_, i) => i % 7));
    const z = zipOf([{ name: "comic/", data: new Uint8Array() }, { name: "comic/002.png", data: page, deflate: true }, { name: "comic/001.png", data: new Uint8Array([1, 2, 3]) }, { name: "comic/notes.txt", data: new Uint8Array([9]) }]);
    const files = await unzip(z, (n) => n.endsWith(".png"));
    expect(files.map((f) => f.name)).toEqual(["comic/002.png", "comic/001.png"]);
    expect(files[0]!.bytes).toEqual(page);
    expect(files[1]!.bytes).toEqual(new Uint8Array([1, 2, 3]));
    await expect(unzip(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a ZIP/);
  });
});
