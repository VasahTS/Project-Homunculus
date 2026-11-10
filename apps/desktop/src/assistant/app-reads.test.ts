// D-110: the Assistant reads chats (branch on screen, numbered, ranges, search), the other app parts, and `about`.
import { describe, expect, it } from "vitest";
import { Character } from "@homunculus/schemas";
import { newTestStore } from "../../../../packages/core/test/helpers.ts";
import { runTool, type ToolContext } from "./tools.ts";
import { ABOUT_TOPICS, aboutText } from "./about.ts";
import { chatLink, messageAt, parseChatLink } from "./appReads.ts";

async function setup() {
  const { store } = await newTestStore();
  const ctx: ToolContext = { store, saveNew: true, newId: () => crypto.randomUUID(), files: new Map(), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
  await store.saveCharacter(Character.parse({ id: "lyra", name: "Lyra" }));
  await store.saveSession({ id: "s1", title: "Docks", cast: [{ characterId: "lyra" }], createdAt: 1 });
  let parent: string | null = null;
  const ids: string[] = [];
  for (let i = 1; i <= 40; i++) {
    const user = i % 2 === 1;
    const m = await store.addMessage({ id: `m${i}`, sessionId: "s1", parentId: parent, speaker: user ? { kind: "user" } : { kind: "character", characterId: "lyra" },
      content: i === 33 ? "The ship with black sails is here." : `Line ${i}.`, createdAt: i });
    parent = m.id; ids.push(m.id);
  }
  // a swipe of #40 written earlier: the chat shows the newest message's branch
  await store.addMessage({ id: "old40", sessionId: "s1", parentId: "m39", speaker: { kind: "character", characterId: "lyra" }, content: "An older version.", createdAt: 0 });
  return { store, ctx, ids };
}
const run = async (ctx: ToolContext, name: string, args: unknown) => runTool(name, JSON.stringify(args), ctx);

describe("the Assistant reads chats (D-110)", () => {
  it("lists chats only when asked for that kind, and finds them by what was said", async () => {
    const { ctx } = await setup();
    expect((await run(ctx, "find", {})).result).not.toContain("chat:s1");
    expect((await run(ctx, "find", { kind: "chat" })).result).toContain("chat:s1 · Docks — 1:1 with Lyra");
    expect((await run(ctx, "find", { kind: "chat", query: "black sails" })).result).toMatch(/chat:s1 · Docks .*match/);
  });
  it("reads the last 30 on the branch on screen, numbered like the chat, with a link format", async () => {
    const { ctx } = await setup();
    const r = (await run(ctx, "read_chat", { id: "chat:s1" })).result;
    expect(r).toContain("40 messages on it");
    expect(r).toContain("Messages #11–#40");
    expect(r).toContain("#40 Lyra: Line 40.");
    expect(r).not.toContain("An older version");
    expect(r).toContain(chatLink("s1", 0).replace(/0$/, "N"));
    expect((await run(ctx, "read", { id: "chat:s1" })).result).toContain("#40 Lyra");
  });
  it("reads a range and searches", async () => {
    const { ctx } = await setup();
    const r = (await run(ctx, "read_chat", { id: "s1", from: 2, to: 4 })).result;
    expect(r).toContain("#2 Lyra: Line 2.");
    expect(r).toContain("#4 Lyra: Line 4.");
    expect(r).not.toContain("#5 ");
    expect((await run(ctx, "read_chat", { id: "s1", search: "black sails" })).result).toContain("#33 User: …The ship with black sails is here.…");
  });
  it("turns a message number into its id and parses its own links", async () => {
    const { store } = await setup();
    expect(await messageAt(store, "s1", 33)).toBe("m33");
    expect(parseChatLink(chatLink("s1", 33))).toEqual({ sessionId: "s1", n: 33 });
    expect(parseChatLink("https://example.com/chat/s1/3")).toBeNull();
  });
  it("reads agents, regex scripts and Quick Reply sets", async () => {
    const { store, ctx } = await setup();
    await store.setGlobalRegex([{ id: "rx", name: "No em dashes", find: "/—/g", replace: ", ", targets: ["ai"] } as never]);
    expect((await run(ctx, "find", { kind: "regex" })).result).toContain("regex:rx · No em dashes");
    expect((await run(ctx, "read", { id: "regex:rx" })).result).toContain("\"find\":\"/—/g\"");
  });
});

describe("about (D-110)", () => {
  it("has a text for every topic the tool offers, and gives each once per chat", async () => {
    for (const t of ABOUT_TOPICS) expect(aboutText(t)!.length).toBeGreaterThan(200);
    expect(aboutText("app")).toContain("director");
    const { ctx } = await setup();
    expect((await run(ctx, "about", { topic: "regex" })).result).toContain("Display only");
    expect((await run(ctx, "about", { topic: "regex" })).result).toContain("already have");
    expect((await run(ctx, "about", { topic: "nope" })).error).toBe(true);
  });
});
