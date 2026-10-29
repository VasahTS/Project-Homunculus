// Tests for the SQLite store and migrations. Author: CLAUDE, 2026-10-23.
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { SqlJsDriver, SqlStore, WorldState, coreMigrations, migrate, type Migration } from "../src/index.ts";
import { newTestStore } from "./helpers.ts";

const msg = (id: string, parentId: string | null, content: string, t: number) => ({
  id, sessionId: "s1", parentId, speaker: { kind: "user" as const }, content, createdAt: t, meta: {},
});

describe("migrations", () => {
  it("apply once, in order, and call the backup hook only when something is pending", async () => {
    const SQL = await initSqlJs();
    const db = new SqlJsDriver(new SQL.Database());
    const backups: number[][] = [];
    const hook = { beforeMigrate: async (p: Migration[]) => { backups.push(p.map((m) => m.version)); } };
    const extra: Migration = { version: 99, name: "test", statements: ["CREATE TABLE extra (x TEXT)"] };
    const all = coreMigrations.map((m) => m.version);

    expect(await migrate(db, [extra, ...coreMigrations], hook)).toEqual([...all, 99]);
    expect(await migrate(db, [extra, ...coreMigrations], hook)).toEqual([]);
    expect(backups).toEqual([[...all, 99]]);
  });

  it("upgrades a database made by the first version (migrations 1–2) without losing anything", async () => {
    const SQL = await initSqlJs();
    const db = new SqlJsDriver(new SQL.Database());
    await migrate(db, coreMigrations.filter((m) => m.version <= 2));
    await db.execute("INSERT INTO messages (id, session_id, parent_id, speaker, content, meta, created_at) VALUES ('m1','s1',NULL,'{\"kind\":\"user\"}','hello','{}',1)");
    await db.execute("INSERT INTO state_deltas (message_id, delta) VALUES ('m1', '{\"clock\":{\"t\":\"18:00\"}}')");
    expect(await migrate(db, coreMigrations)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    const store = new SqlStore(db);
    expect(await store.getMessage("m1")).toMatchObject({ content: "hello", kind: "user" });
    expect(await new WorldState(store, store).resolve("s1", "m1")).toEqual({ clock: { t: "18:00" } });
  });

  it("refuses duplicate versions", async () => {
    const SQL = await initSqlJs();
    const db = new SqlJsDriver(new SQL.Database());
    await expect(migrate(db, [...coreMigrations, { ...coreMigrations[0]!, name: "dup" }])).rejects.toThrow(/Duplicate/);
  });
});

describe("store", () => {
  it("saves and reads characters and sessions, validating them", async () => {
    const { store } = await newTestStore();
    await store.saveCharacter({ id: "c1", name: "Lyra", description: "A ranger", personality: "", scenario: "", firstMessages: ["Hi."] });
    await store.saveSession({ id: "s1", title: "Mill", userRole: "coauthor", cast: [{ characterId: "c1" }], createdAt: 1 });
    expect((await store.getCharacter("c1"))?.name).toBe("Lyra");
    expect((await store.getSession("s1"))?.userRole).toBe("coauthor");
    expect(await store.listCharacters()).toHaveLength(1);
    expect(await store.getCharacter("nope")).toBeUndefined();
  });

  it("keeps messages as a tree: swipes are siblings, paths are correct", async () => {
    const { store } = await newTestStore();
    await store.addMessage(msg("m1", null, "Hello", 1));
    await store.addMessage(msg("m2", "m1", "Reply A", 2));
    await store.addMessage(msg("m3", "m1", "Swipe B", 3));
    await store.addMessage(msg("m4", "m3", "Continue B", 4));

    expect((await store.childrenOf("s1", "m1")).map((m) => m.id)).toEqual(["m2", "m3"]);
    expect((await store.childrenOf("s1", null)).map((m) => m.id)).toEqual(["m1"]);
    expect((await store.pathTo("m4")).map((m) => m.content)).toEqual(["Hello", "Swipe B", "Continue B"]);
    expect(await store.parentOf("m4")).toBe("m3");
  });

  it("world state persists in SQLite and still follows swipes", async () => {
    const { store } = await newTestStore();
    await store.addMessage(msg("m1", null, "a", 1));
    await store.addMessage(msg("m2", "m1", "b", 2));
    await store.addMessage(msg("m3", "m1", "c", 3));
    const ws = new WorldState(store, store);
    await ws.applyDelta("m1", { clock: { time: "18:00" } });
    await ws.applyDelta("m2", { clock: { time: "22:00" } });
    await ws.pin("s1", "looks", "lyra", "silver hair");

    // A second WorldState on the same database sees the same data (it was really saved).
    const again = new WorldState(store, store);
    expect(await again.resolve("s1", "m2")).toEqual({ clock: { time: "22:00" }, looks: { lyra: "silver hair" } });
    expect(await again.resolve("s1", "m3")).toEqual({ clock: { time: "18:00" }, looks: { lyra: "silver hair" } });
  });

  it("deleting a session removes its messages and state, and nothing else", async () => {
    const { store } = await newTestStore();
    const base = { userRole: "player" as const, scenario: "", cast: [] };
    await store.saveSession({ ...base, id: "s1", title: "One", createdAt: 1 });
    await store.saveSession({ ...base, id: "s2", title: "Two", createdAt: 2 });
    await store.addMessage(msg("m1", null, "in s1", 1));
    await store.addMessage({ ...msg("x1", null, "in s2", 2), sessionId: "s2" });
    await store.setDelta("m1", { clock: { time: "1" } });
    await store.setPins("s1", { looks: { a: "b" } });

    await store.deleteSession("s1");
    expect(await store.getSession("s1")).toBeUndefined();
    expect(await store.getMessage("m1")).toBeUndefined();
    expect(await store.getDelta("m1")).toBeUndefined();
    expect(await store.getPins("s1")).toEqual({});
    expect(await store.getMessage("x1")).toBeDefined();
    expect(await store.countMessages("s2")).toBe(1);
  });

  it("refuses to delete a character still used by a session", async () => {
    const { store } = await newTestStore();
    await store.saveCharacter({ id: "c1", name: "Lyra", description: "", personality: "", scenario: "", firstMessages: [] });
    await store.saveSession({ id: "s1", title: "Mill", userRole: "player", cast: [{ characterId: "c1" }], createdAt: 1 });
    await expect(store.deleteCharacter("c1")).rejects.toThrow(/used by 1 session.*"Mill"/);
    await store.deleteSession("s1");
    await store.deleteCharacter("c1");
    expect(await store.getCharacter("c1")).toBeUndefined();
  });

  it("a new message makes its session the most recent", async () => {
    const { store } = await newTestStore();
    const base = { userRole: "player" as const, scenario: "", cast: [] };
    await store.saveSession({ ...base, id: "s1", title: "Old", createdAt: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await store.saveSession({ ...base, id: "s2", title: "New", createdAt: 2 });
    expect((await store.listSessions())[0]?.id).toBe("s2");
    await new Promise((r) => setTimeout(r, 5));
    await store.addMessage(msg("m1", null, "hi", 3));
    expect((await store.listSessions())[0]?.id).toBe("s1");
  });

  it("stores avatars apart and removes them with the character", async () => {
    const { store } = await newTestStore();
    await store.saveCharacter({ id: "c1", name: "Lyra" });
    await store.setAvatar("c1", { mime: "image/png", base64: "iVBORw0KGgo=" });
    expect(await store.getAvatar("c1")).toEqual({ mime: "image/png", base64: "iVBORw0KGgo=" });
    await expect(store.setAvatar("c1", { mime: "text/plain", base64: "x" })).rejects.toThrow();
    await store.deleteCharacter("c1");
    expect(await store.getAvatar("c1")).toBeUndefined();
  });

  it("rejects damaged data instead of passing it on", async () => {
    const { store, driver } = await newTestStore();
    await driver.execute("INSERT INTO characters (id, name, data, updated_at) VALUES ('bad', 'x', '{\"id\":\"bad\"}', 0)");
    await expect(store.getCharacter("bad")).rejects.toThrow();
  });
});

describe("store v2 (BLUEPRINT slice 0)", () => {
  it("reads sessions and messages saved by the first version", async () => {
    const { store, driver } = await newTestStore();
    await driver.execute("INSERT INTO sessions (id, data, created_at, updated_at) VALUES (?, ?, 1, 1)", ["old", JSON.stringify({
      id: "old", title: "Old", userRole: "player", presetId: null, personaId: null, scenario: "",
      cast: [{ characterId: "c1", role: "character", active: true, joinedAtMessageId: null }], agents: [], lorebookIds: [], settings: {}, createdAt: 1,
    })]);
    await driver.execute("INSERT INTO messages (id, session_id, parent_id, speaker, content, meta, created_at) VALUES ('m1','old',NULL,'{\"kind\":\"user\"}','hi','{}',1)");
    await driver.execute("INSERT INTO messages (id, session_id, parent_id, speaker, content, meta, created_at) VALUES ('m2','old','m1','{\"kind\":\"narrator\"}','yo','{}',2)");
    expect((await store.getSession("old"))?.cast[0]?.presence).toBe("in_scene");
    expect((await store.getMessage("m1"))?.kind).toBe("user");
    expect((await store.getMessage("m2"))).toMatchObject({ kind: "reply", visibility: { ai: "full", user: true } });
  });

  it("keeps message kind, visibility and reasoning", async () => {
    const { store } = await newTestStore();
    await store.addMessage({ ...msg("m1", null, "(brb)", 1), kind: "ooc", visibility: { ai: "none", user: true } });
    await store.addMessage({ ...msg("m2", "m1", "Hello", 2), speaker: { kind: "narrator" }, reasoning: "thinking…" });
    expect(await store.getMessage("m1")).toMatchObject({ kind: "ooc", visibility: { ai: "none" } });
    expect(await store.getMessage("m2")).toMatchObject({ kind: "reply", reasoning: "thinking…" });
    await store.updateMessage("m2", { visibility: { ai: "summary", user: false } });
    expect((await store.getMessage("m2"))?.visibility).toEqual({ ai: "summary", user: false });
  });

  it("saves personas, user agents, tracker schemas, stories and the default setup", async () => {
    const { store } = await newTestStore();
    await store.savePersona({ id: "p1", name: "Daniel", variants: [{ id: "v1", label: "Mercenary", overrides: { description: "Tired of war." } }] });
    await store.saveAgentConfig({ id: "emotions", name: "Emotions", triggers: [{ on: "turn", phase: "after" }], output: "state", state: { namespace: "emotions" } });
    await store.saveTrackerSchema({ id: "drama", name: "Drama", fields: [{ key: "trust", label: "Trust", type: "meter", min: 0, max: 100, scope: "perPair" }] });
    await store.saveStory({ id: "c1", name: "RPG", setup: { presetId: "gm" }, createdAt: 1 });
    await store.setDefaultSetup({ agents: { mode: "add", add: ["emotions"], remove: [] } });
    expect((await store.personas.get("p1"))?.variants[0]?.overrides.description).toBe("Tired of war.");
    expect((await store.agentConfigs.get("emotions"))?.runMode).toBe("separate");
    expect((await store.trackerSchemas.list())[0]?.fields[0]?.scope).toBe("perPair");
    expect((await store.getStory("c1"))?.setup.presetId).toBe("gm");
    expect((await store.getStory("c1"))?.narrator).toEqual({ kind: "vault", id: "simple-narrator" });
    expect((await store.getDefaultSetup()).agents?.add).toEqual(["emotions"]);
  });

  it("a story goes to the Trash with its sessions and comes back with them; deleting it deletes them", async () => {
    const { store } = await newTestStore();
    await store.saveStory({ id: "st1", name: "Isekai", createdAt: 1 });
    await store.saveSession({ id: "s1", storyId: "st1", title: "One", createdAt: 1 });
    await store.saveSession({ id: "s2", title: "A chat", createdAt: 1 });
    await store.moveToTrash("story", "st1");
    expect((await store.listStories()).map((x) => x.id)).toEqual([]);
    expect((await store.listSessions()).map((x) => x.id)).toEqual(["s2"]);
    // the Trash shows the story, not its sessions one by one
    expect((await store.listTrash()).map((x) => `${x.kind}:${x.id}`)).toEqual(["story:st1"]);
    await store.restoreFromTrash("story", "st1");
    expect((await store.listSessions()).map((x) => x.id).sort()).toEqual(["s1", "s2"]);
    await store.moveToTrash("story", "st1");
    await store.deleteForever("story", "st1");
    expect(await store.getSession("s1")).toBeUndefined();
    expect(await store.getSession("s2")).toBeDefined();
  });

  it("narrators and NPCs: the built-in narrator can't be trashed, a narrator in use can't, a trashed NPC is never used", async () => {
    const { store } = await newTestStore();
    await store.saveNarrator({ id: "simple-narrator", name: "Simple Narrator", builtin: true });
    await store.saveNarrator({ id: "gm", name: "Game Master" });
    await store.saveStory({ id: "st1", name: "Party", narrator: { kind: "vault", id: "gm" }, npcIds: ["n1", "n2"], createdAt: 1 });
    await expect(store.moveToTrash("narrator", "simple-narrator")).rejects.toThrow("comes with the app");
    await expect(store.moveToTrash("narrator", "gm")).rejects.toThrow("Party");
    await store.saveNpc({ id: "n1", name: "Orin", storyId: "st1" });
    await store.saveNpc({ id: "n2", name: "Maelle", storyId: "st1", values: { race: "Half-elf" } });
    expect((await store.npcsForUse(["n2", "n1", "missing"])).map((n) => n.name)).toEqual(["Maelle", "Orin"]);
    await store.moveToTrash("npc", "n1");
    expect((await store.npcsForUse(["n1", "n2"])).map((n) => n.name)).toEqual(["Maelle"]);
    expect((await store.whereIsNpc("n2")).stories.map((x) => x.name)).toEqual(["Party"]);
    await store.deleteForever("npc", "n1");
    expect((await store.getStory("st1"))?.npcIds).toEqual(["n2"]);
    expect((await store.listHistory("npc", "n2")).length).toBe(1);
  });

  it("a character that tells a story can't go to the Trash", async () => {
    const { store } = await newTestStore();
    await store.saveCharacter({ id: "isekai", name: "Isekai RPG" });
    await store.saveStory({ id: "st1", name: "Isekai RPG", narrator: { kind: "card", characterId: "isekai" }, createdAt: 1 });
    await expect(store.moveToTrash("character", "isekai")).rejects.toThrow("Isekai RPG");
  });

  it("records agent runs, revisions, notes and generation records per message, and deletes them with the session", async () => {
    const { store } = await newTestStore();
    await store.saveSession({ id: "s1", createdAt: 1 });
    await store.addMessage(msg("m1", null, "a", 1));
    await store.saveAgentRun({ id: "r1", sessionId: "s1", messageId: "m1", agentId: "x", trigger: "turn.after", status: "ok", startedAt: 1, output: { a: 1 } });
    await store.addRevision({ id: "v1", messageId: "m1", author: { kind: "user" }, before: "a", after: "b", createdAt: 2 });
    await store.addNote({ id: "n1", sessionId: "s1", messageId: "m1", agentId: "x", content: "note", createdAt: 3 });
    await store.saveGenerationRecord({ messageId: "m1", sessionId: "s1", generationType: "normal", providerId: "p", model: "m", prompt: [{ role: "user", content: "hi", source: "history" }], durationMs: 5, createdAt: 4 });
    expect((await store.listAgentRuns("m1"))[0]).toMatchObject({ status: "ok", stale: false, output: { a: 1 } });
    expect(await store.listRevisions("m1")).toHaveLength(1);
    expect((await store.listNotes("m1"))[0]?.content).toBe("note");
    expect((await store.getGenerationRecord("m1"))?.prompt[0]?.source).toBe("history");
    await store.deleteSession("s1");
    expect(await store.listAgentRuns("m1")).toEqual([]);
    expect(await store.listNotes("m1")).toEqual([]);
    expect(await store.getGenerationRecord("m1")).toBeUndefined();
  });

  it("editing a message marks only the records of later messages as out of date", async () => {
    const { store } = await newTestStore();
    for (let i = 1; i <= 3; i++) await store.addMessage(msg(`m${i}`, i === 1 ? null : `m${i - 1}`, `t${i}`, i));
    for (let i = 1; i <= 3; i++) await store.saveAgentRun({ id: `r${i}`, sessionId: "s1", messageId: `m${i}`, agentId: "x", trigger: "t", status: "ok", startedAt: i });
    expect(await store.markStaleAfter("m1")).toBe(2);
    expect((await store.listAgentRuns("m1"))[0]?.stale).toBe(false);
    expect((await store.listAgentRuns("m3"))[0]?.stale).toBe(true);
  });

  it("long chats: snapshots speed up the state and are refreshed when an earlier value changes", async () => {
    const { store, driver } = await newTestStore();
    for (let i = 1; i <= 120; i++) await store.addMessage(msg(`m${i}`, i === 1 ? null : `m${i - 1}`, "x", i));
    const ws = new WorldState(store, store);
    await ws.applyDelta("m1", { clock: { day: 1 } });
    await ws.applyDelta("m70", { clock: { time: "noon" } });
    expect(await ws.resolve("s1", "m120")).toEqual({ clock: { day: 1, time: "noon" } });
    const snaps = await driver.select<{ n: number }>("SELECT COUNT(*) AS n FROM state_snapshots");
    expect(Number(snaps[0]!.n)).toBe(2); // at messages 50 and 100

    await ws.applyUserDelta("m10", { clock: { day: 2 } }); // the user edits an early value
    expect(await ws.resolve("s1", "m120")).toEqual({ clock: { day: 2, time: "noon" } });
    expect(await ws.resolve("s1", "m5")).toEqual({ clock: { day: 1 } });
  });

  it("a user edit wins over the trackers at the same message, and pins win over both", async () => {
    const { store } = await newTestStore();
    await store.addMessage(msg("m1", null, "x", 1));
    const ws = new WorldState(store, store);
    await ws.applyDelta("m1", { mood: { lyra: "angry" }, world: { place: "mill" } });
    await ws.applyUserDelta("m1", { mood: { lyra: "calm" } });
    expect(await ws.resolve("s1", "m1")).toEqual({ mood: { lyra: "calm" }, world: { place: "mill" } });
    await ws.pin("s1", "world", "place", "forest");
    expect((await ws.resolve("s1", "m1")).world).toEqual({ place: "forest" });
  });
});

describe("lorebook history while it saves by itself (D-028)", () => {
  it("a burst of saves is one version; a later save after the window adds one", async () => {
    const { store } = await newTestStore();
    await store.saveLorebook({ id: "b", name: "Realm", entries: [] });
    for (let i = 0; i < 12; i++) await store.saveLorebook({ id: "b", name: `Realm ${i}`, entries: [] }, { mergeHistoryWithinMs: 60_000 });
    const h = await store.listHistory("lorebook", "b");
    expect(h.length).toBe(2); // the created version + the newest of the burst
    expect((h[0]!.data as { name: string }).name).toBe("Realm 11");
    expect((h[1]!.data as { name: string }).name).toBe("Realm");
    // outside the window: a new version
    await store.saveLorebook({ id: "b", name: "Realm later", entries: [] }, { mergeHistoryWithinMs: -1 });
    expect((await store.listHistory("lorebook", "b")).length).toBe(3);
  });
});
