// D-126: SillyTavern chats → the message tree (swipes, hidden messages, branches merged, chat metadata).
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { SqlJsDriver, SqlStore, coreMigrations, migrate, pathOf, type SqlDriver, type SqlStatement } from "@homunculus/core";
import { authorsNoteOf, buildStChatTree, chatLinksOf, groupStChats, parseStChat, saveStChat, stDate } from "../src/index.ts";

const jsonl = (...rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n");
const header = (meta: Record<string, unknown> = {}) => ({ user_name: "Daniel", character_name: "Mira", create_date: "2026-1-5@12h30m10s", chat_metadata: meta });
const msg = (name: string, is_user: boolean, mes: string, send_date: string, more: Record<string, unknown> = {}) => ({ name, is_user, is_system: false, send_date, mes, extra: {}, ...more });

const main = jsonl(
  header({ note_prompt: "Keep it tense.", note_interval: 2, note_depth: 4, note_position: 1, note_role: 0, world_info: "Old Roads", persona: "daniel.png" }),
  msg("Mira", false, "Hello, traveler.", "January 5, 2026 12:30pm", { swipes: ["Hello, traveler.", "Who goes there?"], swipe_id: 0 }),
  msg("Daniel", true, "Hi Mira.", "2026-01-05T15:31:00.000Z"),
  msg("Mira", false, "Sit down.", "2026-01-05T15:32:00.000Z", {
    swipes: ["Stand up.", "Sit down.", "Leave."], swipe_id: 1,
    swipe_info: [{ send_date: "2026-01-05T15:32:00.000Z", extra: { reasoning: "r0" } }, { send_date: "2026-01-05T15:32:10.000Z", extra: {} }, { send_date: "2026-01-05T15:32:20.000Z", extra: {} }],
    extra: { model: "glm-5.3", reasoning: "she is tired" },
  }),
  msg("Daniel", true, "(OOC: hidden note)", "2026-01-05T15:33:00.000Z", { is_system: true }),
  msg("Narrator", false, "Three days later.", "2026-01-05T15:34:00.000Z", { extra: { type: "narrator" } }),
);
// a branch made at Mira's second message, from the swipe "Leave." (ST copies the start and changes the last line)
const branch = jsonl(
  header({ main_chat: "Mira - 2026-1-5@12h30m10s" }),
  msg("Mira", false, "Hello, traveler.", "January 5, 2026 12:30pm", { swipes: ["Hello, traveler.", "Who goes there?"], swipe_id: 0 }),
  msg("Daniel", true, "Hi Mira.", "2026-01-05T15:31:00.000Z"),
  msg("Mira", false, "Leave.", "2026-01-05T15:32:20.000Z"),
  msg("Daniel", true, "Fine, I'm going.", "2026-01-06T10:00:00.000Z"),
);
// a branch of the branch (checkpoint)
const checkpoint = jsonl(
  header({ main_chat: "Branch #1 - 2026-1-6@10h00m00s" }),
  msg("Mira", false, "Hello, traveler.", "January 5, 2026 12:30pm"),
  msg("Daniel", true, "Hi Mira.", "2026-01-05T15:31:00.000Z"),
  msg("Mira", false, "Leave.", "2026-01-05T15:32:20.000Z"),
  msg("Daniel", true, "No.", "2026-01-07T10:00:00.000Z"),
);

let n = 0;
const ids = () => `m${++n}`;
const speakerOf = () => ({ kind: "character" as const, characterId: "mira" });

describe("SillyTavern chats (D-126)", () => {
  it("reads every date shape SillyTavern has written", () => {
    expect(stDate("2026-1-5@12h30m10s")).toBe(new Date(2026, 0, 5, 12, 30, 10).getTime());
    expect(stDate("2026-1-5 @12h 30m 10s 250ms")).toBe(new Date(2026, 0, 5, 12, 30, 10, 250).getTime());
    expect(stDate("January 5, 2026 12:30pm")).toBe(new Date(2026, 0, 5, 12, 30).getTime());
    expect(stDate("June 1, 2023 12:05am")).toBe(new Date(2023, 5, 1, 0, 5).getTime());
    expect(stDate("2026-01-05T15:31:00.000Z")).toBe(Date.UTC(2026, 0, 5, 15, 31));
    expect(stDate(1767627060000)).toBe(1767627060000);
    expect(stDate(1767627060)).toBe(1767627060000);
    expect(stDate("nonsense", 7)).toBe(7);
  });

  it("parses lines, swipes, hidden and narrator messages; skips broken lines with a warning", () => {
    const c = parseStChat(main + "\n{broken\n", "Mira - 2026-1-5@12h30m10s.jsonl");
    expect(c.name).toBe("Mira - 2026-1-5@12h30m10s");
    expect(c.header.userName).toBe("Daniel");
    expect(c.lines).toHaveLength(5);
    expect(c.lines[2]).toMatchObject({ text: "Sit down.", swipeId: 1, model: "glm-5.3", reasoning: "she is tired" });
    expect(c.lines[2]!.swipes.map((s) => s.text)).toEqual(["Stand up.", "Sit down.", "Leave."]);
    expect(c.lines[3]!.isSystem).toBe(true);
    expect(c.lines[4]!.isNarrator).toBe(true);
    expect(c.warnings).toEqual(["line 7: not valid JSON"]);
    // dates always go forward, even when one is missing or older
    const dates = c.lines.map((l) => l.sendDate);
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });

  it("reads the chat's Author's Note, lorebook and persona", () => {
    const meta = parseStChat(main, "a.jsonl").header.metadata;
    expect(authorsNoteOf(meta)).toEqual({ text: "Keep it tense.", interval: 2, depth: 4, position: "inChat", role: "system" });
    expect(chatLinksOf(meta)).toEqual({ lorebook: "Old Roads", persona: "daniel.png" });
    expect(authorsNoteOf({})).toBeUndefined();
  });

  it("builds the tree: swipes are siblings, the shown one is on the path, hidden lines never reach the AI", () => {
    n = 0;
    const built = buildStChatTree({ main: parseStChat(main, "Mira - 2026-1-5@12h30m10s.jsonl") }, { sessionId: "s", speakerOf, newId: ids });
    const byId = new Map(built.messages.map((m) => [m.id, m]));
    const path = pathOf(built.messages.map((m) => ({ id: m.id, parentId: m.parentId, createdAt: m.createdAt })), built.branches[0]!.endMessageId);
    expect(path.map((id) => byId.get(id)!.content)).toEqual(["Hello, traveler.", "Hi Mira.", "Sit down.", "(OOC: hidden note)", "Three days later."]);
    const sitDown = built.messages.find((m) => m.content === "Sit down.")!;
    const siblings = built.messages.filter((m) => m.parentId === sitDown.parentId).map((m) => m.content).sort();
    expect(siblings).toEqual(["Leave.", "Sit down.", "Stand up."]);
    expect(built.messages.find((m) => m.content === "Stand up.")!.reasoning).toBe("r0");
    // the shown swipe is the newest of its siblings (the app opens the newest)
    expect(Math.max(...built.messages.filter((m) => m.parentId === sitDown.parentId).map((m) => m.createdAt))).toBe(sitDown.createdAt);
    expect(byId.get(path[3]!)!.visibility).toEqual({ ai: "none", user: true });
    expect(byId.get(path[4]!)!.speaker).toEqual({ kind: "narrator" });
    expect(byId.get(path[1]!)!.speaker).toEqual({ kind: "user" });
    expect(built.stored).toBe(8); // 5 lines + the greeting's other swipe + "Sit down."'s two others
  });

  it("merges branches and checkpoints into the main chat: the shared start is stored once", () => {
    n = 0;
    const files = [parseStChat(main, "Mira - 2026-1-5@12h30m10s.jsonl"), parseStChat(branch, "Branch #1 - 2026-1-6@10h00m00s.jsonl"), parseStChat(checkpoint, "Checkpoint #2.jsonl"), parseStChat(jsonl(header(), msg("Mira", false, "Another chat.", "2026-02-01T00:00:00Z")), "Mira - other.jsonl")];
    const groups = groupStChats(files);
    expect(groups.map((g) => [g.main.name, g.branches.map((b) => b.name)])).toEqual([
      ["Mira - 2026-1-5@12h30m10s", ["Branch #1 - 2026-1-6@10h00m00s", "Checkpoint #2"]],
      ["Mira - other", []],
    ]);
    const built = buildStChatTree(groups[0]!, { sessionId: "s", speakerOf, newId: ids });
    expect(built.branches.map((b) => b.name)).toEqual(["Main", "Branch #1 - 2026-1-6@10h00m00s", "Checkpoint #2"]);
    const byId = new Map(built.messages.map((m) => [m.id, m]));
    const links = built.messages.map((m) => ({ id: m.id, parentId: m.parentId, createdAt: m.createdAt }));
    const text = (end: string | null) => pathOf(links, end).map((id) => byId.get(id)!.content);
    expect(text(built.branches[1]!.endMessageId)).toEqual(["Hello, traveler.", "Hi Mira.", "Leave.", "Fine, I'm going."]);
    expect(text(built.branches[2]!.endMessageId)).toEqual(["Hello, traveler.", "Hi Mira.", "Leave.", "No."]);
    // "Leave." is the main chat's swipe, not a copy; the greeting is stored once
    expect(built.messages.filter((m) => m.content === "Leave.")).toHaveLength(1);
    expect(built.messages.filter((m) => m.content === "Hello, traveler.")).toHaveLength(1);
    expect(built.read).toBe(13);
  });

  it("saves a long chat in one trip to the database", async () => {
    const SQL = await initSqlJs();
    const inner = new SqlJsDriver(new SQL.Database());
    await migrate(inner, coreMigrations);
    const count = { executes: 0, batches: 0 };
    const driver: SqlDriver = {
      execute: (s, p) => { count.executes++; return inner.execute(s, p); },
      select: (s, p) => inner.select(s, p),
      batch: (list: SqlStatement[]) => { count.batches++; return inner.batch(list); },
    };
    const store = new SqlStore(driver);
    const rows = [header()];
    for (let i = 0; i < 1500; i++) rows.push(msg(i % 2 ? "Daniel" : "Mira", i % 2 === 1, `line ${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()) as never);
    const parsed = parseStChat(jsonl(...rows), "long.jsonl");
    const built = buildStChatTree({ main: parsed }, { sessionId: "s1", speakerOf });
    await saveStChat(store, { id: "s1", title: parsed.name, cast: [{ characterId: "mira" }], createdAt: parsed.header.createdAt }, built);
    expect(count.executes).toBe(0);
    expect(count.batches).toBe(1);
    const end = built.branches[0]!.endMessageId!;
    expect((await store.pathTo(end)).map((m) => m.content)).toEqual(Array.from({ length: 1500 }, (_, i) => `line ${i}`));
    expect((await store.listBranches("s1")).map((b) => [b.name, b.endMessageId])).toEqual([["Main", end]]);
  });
});
