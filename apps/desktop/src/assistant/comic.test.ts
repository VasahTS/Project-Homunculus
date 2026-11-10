// Tests for reading a comic (D-115). Author: CLAUDE, 2026-11-10.
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { AssistantChat, type AssistantMessage } from "@homunculus/schemas";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate, type ConnectionConfig, type GenerateRequest, type StreamChunk } from "@homunculus/core";
import { loadSettings, runAssistant, saveSettings, toTurns } from "./engine.ts";
import { checkBatch, jsonIn, linesOf, mergeCast, naturalCompare, readComic, readingText, type ComicBatch } from "./comic.ts";
import { emptyVisionUsage } from "./vision.ts";
import { aboutText } from "./about.ts";

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
const flash: ConnectionConfig = { providerId: "fake", model: "gemini-flash" };
const glm: ConnectionConfig = { providerId: "fake", model: "glm-5.3", vision: false };
const page = (n: number) => ({ name: `page ${String(n).padStart(3, "0")}.png`, mime: "image/png", base64: `P${n}` });
const textOf = (r: GenerateRequest) => (r.rich ?? []).map((t) => (typeof t.content === "string" ? t.content : t.content.map((p) => (p.type === "text" ? p.text : "<image>")).join(" "))).join("\n");
const imagesIn = (r: GenerateRequest) => (r.rich ?? []).flatMap((t) => Array.isArray(t.content) ? t.content.filter((p) => p.type === "image") : []).length;
/** A vision model that reads whatever pages it gets: page n has "Line n" said by A (and B from page 3). */
function reader(req: GenerateRequest): StreamChunk[] {
  const m = /pages (\d+)–(\d+) of/.exec(textOf(req))!;
  const first = Number(m[1]), last = Number(m[2]);
  const pages = [];
  for (let n = first; n <= last; n++) pages.push({ page: n, cast: n >= 3 ? ["A", "B"] : ["A"], panels: [{ action: `Panel on page ${n}.`, lines: [{ speaker: "A", kind: "speech", text: `Line ${n}` }] }] });
  const cast: ComicBatch["cast"] = [{ id: "A", name: first === 1 ? "" : "Mei", looks: "short brown hair", notes: "" }];
  if (last >= 3) cast.push({ id: "B", name: "Ren", looks: "tall, glasses", notes: "calm" });
  return [JSON.stringify({ cast, pages, summary: `Up to page ${last}.` })];
}

describe("reading a comic (D-115)", () => {
  it("orders file names naturally", () => {
    expect(["p10.png", "p2.png", "p1.png", "P003.png"].sort(naturalCompare)).toEqual(["p1.png", "p2.png", "P003.png", "p10.png"]);
  });

  it("finds JSON in an answer and checks it has exactly the pages sent", () => {
    expect(jsonIn("Sure!\n```json\n{\"pages\":[]}\n```")).toEqual({ pages: [] });
    expect(() => jsonIn("no json")).toThrow(/no JSON/);
    const ok = checkBatch({ pages: [{ page: 2 }, { page: 1, panels: [{ lines: [{ text: "Hi", kind: "yelling" }] }] }] }, 1, 2);
    expect(ok.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(ok.pages[0]!.panels[0]!.lines[0]).toEqual({ speaker: "?", kind: "speech", text: "Hi" });
    expect(() => checkBatch({ pages: [{ page: 1 }] }, 1, 2)).toThrow(/missing.*2/);
    expect(() => checkBatch({ pages: "x" }, 1, 1)).toThrow(/shape/);
  });

  it("keeps cast ids stable and adds what later pages teach", () => {
    const merged = mergeCast([{ id: "A", name: "", looks: "short hair", notes: "shy" }], [{ id: "A", name: "Mei", looks: "short brown hair, paint apron", notes: "ironic when nervous" }, { id: "B", name: "Ren", looks: "", notes: "" }]);
    expect(merged).toEqual([{ id: "A", name: "Mei", looks: "short brown hair, paint apron", notes: "shy ironic when nervous" }, { id: "B", name: "Ren", looks: "", notes: "" }]);
  });

  it("reads ten pages in one call that sees them all, in the order asked, and caches it", async () => {
    const { store, core, seen } = await setup(reader);
    const usage = emptyVisionUsage("gemini-flash");
    const progress: string[] = [];
    const r = await readComic({ core, store, conn: flash, pages: Array.from({ length: 10 }, (_, i) => page(i + 1)), order: "manga", usage, onProgress: (d, t) => progress.push(`${d}/${t}`) });
    expect(seen).toHaveLength(1);
    expect(imagesIn(seen[0]!)).toBe(10);
    expect(textOf(seen[0]!)).toContain("MANGA — panels right to left");
    expect(r.pages.map((p) => p.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.cast.map((c) => c.id)).toEqual(["A", "B"]);
    expect(r.files[0]).toBe("page 001.png");
    expect(progress).toEqual(["0/10", "10/10"]);
    const again = await readComic({ core, store, conn: flash, pages: Array.from({ length: 10 }, (_, i) => page(i + 1)), order: "manga", usage });
    expect(seen).toHaveLength(1);
    expect(usage.cached).toBe(1);
    expect(again).toEqual(r);
  });

  it("reads a long comic in batches, giving each batch the cast and story so far", async () => {
    const { store, core, seen } = await setup(reader);
    const r = await readComic({ core, store, conn: flash, pages: Array.from({ length: 25 }, (_, i) => page(i + 1)), order: "western", usage: emptyVisionUsage(), batchSize: 10 });
    expect(seen.map(imagesIn)).toEqual([10, 11, 6]); // later batches see the page before them
    expect(textOf(seen[1]!)).toContain("pages 11–20 of 25");
    expect(textOf(seen[1]!)).toContain("The cast so far (keep these ids):\nA: short brown hair\nB — Ren: tall, glasses | calm"); // A is named from batch 2
    expect(textOf(seen[1]!)).toContain("The story so far:\nUp to page 10.");
    expect(r.pages).toHaveLength(25);
    expect(r.cast.find((c) => c.id === "A")!.name).toBe("Mei");
    expect(r.summary).toBe("Up to page 25.");
    expect(linesOf(r, "A")).toHaveLength(25);
    expect(linesOf(r, "A")[4]).toEqual({ page: 5, kind: "speech", text: "Line 5" });
  });

  it("retries once with the error when the JSON is broken, then gives up saying which pages", async () => {
    let n = 0;
    const { store, core, seen } = await setup((req) => (n++ === 0 ? ["{ broken"] : reader(req)));
    const r = await readComic({ core, store, conn: flash, pages: [page(1), page(2)], order: "western", usage: emptyVisionUsage() });
    expect(seen).toHaveLength(2);
    expect(textOf(seen[1]!)).toContain("Your previous answer could not be used");
    expect(r.pages).toHaveLength(2);
    const bad = await setup(() => ["nope"]);
    await expect(readComic({ core: bad.core, store: bad.store, conn: flash, pages: [page(1)], order: "western", usage: emptyVisionUsage() })).rejects.toThrow(/Couldn't read page 1/);
    expect(bad.seen).toHaveLength(2);
  });

  it("splits the pages when the service refuses a call, down to one page with the page before it", async () => {
    // a service that refuses more than 3 pictures per call
    const { store, core, seen } = await setup((req) => { if (imagesIn(req) > 3) throw new Error("413 Request Entity Too Large"); return reader(req); });
    const r = await readComic({ core, store, conn: flash, pages: Array.from({ length: 6 }, (_, i) => page(i + 1)), order: "manga", usage: emptyVisionUsage() });
    expect(r.pages.map((p) => p.page)).toEqual([1, 2, 3, 4, 5, 6]);
    const ok = seen.filter((q) => imagesIn(q) <= 3);
    expect(ok.map(imagesIn)).toEqual([3, 3, 2]); // pages 1–3; page 3 + pages 4–5; page 5 + page 6
    expect(textOf(ok[1]!)).toContain("The FIRST picture is page 3, already read");
    expect(textOf(ok[1]!)).toContain("pages 4–5 of 6");
  });

  it("writes the reading as text with pages, speakers by id and name, and kinds", async () => {
    const { store, core } = await setup(reader);
    const r = await readComic({ core, store, conn: flash, pages: [page(1), page(2), page(3)], order: "western", usage: emptyVisionUsage() });
    const t = readingText(r, 3, 3);
    expect(t).toContain("B — Ren: tall, glasses | calm");
    expect(t).toContain("## Page 3 (page 003.png) — A, B Ren");
    expect(t).toContain('  A: "Line 3"');
    expect(t).not.toContain("## Page 2");
  });

  it("in the Assistant: comic pages are never described one by one nor sent whole; read_comic reads them with the vision model", async () => {
    let mainCalls = 0;
    const { store, core, seen } = await setup((req) => {
      if (req.connection.model === "gemini-flash") return reader(req);
      return mainCalls++ === 0 ? [{ toolCalls: [{ id: "r1", name: "read_comic", arguments: JSON.stringify({ order: "manga", skip: ["c0"] }) }] }] : ["Here is what I understood."];
    });
    const s = await loadSettings(store);
    await saveSettings(store, { ...s, vision: { connectionId: "flash", model: "" } });
    const pages = [3, 1, 2].map((n) => ({ type: "image" as const, id: `c${n}`, name: `page ${n}.png`, mime: "image/png", base64: `P${n}`, comicPage: true }));
    const cover = { type: "image" as const, id: "c0", name: "page 0.png", mime: "image/png", base64: "P0", comicPage: true };
    const msg: AssistantMessage = { id: "u1", role: "user", text: "turn this into a card", reasoning: "", attachments: [cover, ...pages], steps: [], rounds: [], results: [], createdAt: 1 };
    const done = await runAssistant({ core, store, chat: AssistantChat.parse({ id: "c", messages: [msg], createdAt: 1, updatedAt: 1 }), main: glm, connections: { flash }, onUpdate: () => {} });
    const visionCalls = seen.filter((r) => r.connection.model === "gemini-flash");
    expect(visionCalls).toHaveLength(1); // no single-picture descriptions
    expect(imagesIn(visionCalls[0]!)).toBe(3);
    expect((visionCalls[0]!.rich![1]!.content as Array<{ type: string; base64?: string }>).filter((p) => p.type === "image").map((p) => p.base64)).toEqual(["P3", "P1", "P2"]);
    const main1 = seen.find((r) => r.connection.model === "glm-5.3")!;
    expect(imagesIn(main1)).toBe(0);
    expect(textOf(main1)).toContain("[Comic page c1: page 1.png — read the pages with read_comic]");
    const step = done.messages.at(-1)!.steps[0]!;
    expect(step.error).toBe(false);
    expect(step.result).toContain("Read 3 pages (1=c3, 2=c1, 3=c2) in manga order."); // the order the pages were imported in
    expect(done.messages.at(-1)!.used!.vision).toMatchObject({ calls: 1 });
  });

  it("a main model that sees pictures reads the comic itself; comic pages still aren't sent with the message", async () => {
    let mainCalls = 0;
    const { store, core, seen } = await setup((req) => (mainCalls++ === 0 ? [{ toolCalls: [{ id: "r1", name: "read_comic", arguments: JSON.stringify({ order: "western" }) }] }] : textOf(req).includes("pages 1–1 of") && imagesIn(req) ? reader(req) : ["ok"]));
    const msg: AssistantMessage = { id: "u1", role: "user", text: "read", reasoning: "", attachments: [{ type: "image", id: "c1", name: "1.png", mime: "image/png", base64: "P1", comicPage: true }], steps: [], rounds: [], results: [], createdAt: 1 };
    const done = await runAssistant({ core, store, chat: AssistantChat.parse({ id: "c", messages: [msg], createdAt: 1, updatedAt: 1 }), main: { providerId: "fake", model: "gemini-pro" }, connections: {}, onUpdate: () => {} });
    expect(imagesIn(seen[0]!)).toBe(0);
    expect(done.messages.at(-1)!.steps[0]!.result).toContain("Read 1 page");
  });

  it("the Assistant is told how to do it: one shared card with sections, {{user}} question, a Kit for the story", () => {
    const t = aboutText("comic")!;
    expect(t).toContain("ONE shared card");
    expect(t).toContain('"Synopsis", "Characters"');
    expect(t).toContain("Who is {{user}}?");
    expect(t).toContain("create kit");
    const turns = toTurns(AssistantChat.parse({ id: "c", messages: [], createdAt: 1, updatedAt: 1 }), { assistants: [], presets: [], defaultAssistantId: "", defaultPresetId: "", toolsOff: [], vision: { connectionId: null, model: "" } }, "");
    expect(String(turns[0]!.content)).toContain('topic "comic"');
  });
});
