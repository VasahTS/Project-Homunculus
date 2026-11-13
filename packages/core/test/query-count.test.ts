// D-122: a long chat costs a few queries, not one per message (the desktop app pays a round trip for every query).
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { SqlJsDriver, SqlStore, WorldState, coreMigrations, migrate, type SqlDriver } from "../src/index.ts";

async function countingStore() {
  const SQL = await initSqlJs();
  const inner = new SqlJsDriver(new SQL.Database());
  await migrate(inner, coreMigrations);
  const counter = { selects: 0 };
  const driver: SqlDriver = {
    execute: (sql, p) => inner.execute(sql, p),
    select: <T,>(sql: string, p?: unknown[]) => { counter.selects++; return inner.select<T>(sql, p); },
  };
  return { store: new SqlStore(driver), counter };
}

async function longChat(store: SqlStore, n: number) {
  let parent: string | null = null;
  for (let i = 0; i < n; i++) {
    const id = `m${i}`;
    await store.addMessage({ id, sessionId: "s1", parentId: parent, speaker: { kind: i % 2 ? "character" as const : "user" as const, ...(i % 2 ? { characterId: "c" } : {}) }, content: `message ${i}`, createdAt: i, meta: {} } as never);
    if (i % 7 === 0) await store.setDelta(id, { world: { turn: i } });
    if (i % 11 === 0) await store.setUserDelta(id, { world: { note: `n${i}` } });
    parent = id;
  }
  // a branch off the middle
  await store.addMessage({ id: "b1", sessionId: "s1", parentId: "m100", speaker: { kind: "user" }, content: "branch", createdAt: n + 1, meta: {} } as never);
}

describe("long chats in a few queries (D-122)", () => {
  it("pathTo and the world state read a 600-message path in a handful of queries, with the same result", async () => {
    const { store, counter } = await countingStore();
    await longChat(store, 600);
    counter.selects = 0;
    const path = await store.pathTo("m599");
    expect(counter.selects).toBe(1);
    expect(path.map((m) => m.id)).toEqual(Array.from({ length: 600 }, (_, i) => `m${i}`));
    expect((await store.pathTo("b1")).map((m) => m.id)).toEqual([...Array.from({ length: 101 }, (_, i) => `m${i}`), "b1"]);

    counter.selects = 0;
    const ws = new WorldState(store, store);
    const state = await ws.resolve("s1", "m599");
    expect(counter.selects).toBeLessThan(40);
    expect(state).toEqual({ world: { turn: 595, note: "n594" } });
    expect(await ws.resolve("s1", "b1")).toEqual({ world: { turn: 98, note: "n99" } });
  });

  it("still reports a cycle and a missing message", async () => {
    const { store } = await countingStore();
    await store.addMessage({ id: "a", sessionId: "s1", parentId: "b", speaker: { kind: "user" }, content: "a", createdAt: 1, meta: {} } as never);
    await store.addMessage({ id: "b", sessionId: "s1", parentId: "a", speaker: { kind: "user" }, content: "b", createdAt: 2, meta: {} } as never);
    await expect(store.pathTo("a")).rejects.toThrow(/cycle/);
    await store.addMessage({ id: "c", sessionId: "s1", parentId: "gone", speaker: { kind: "user" }, content: "c", createdAt: 3, meta: {} } as never);
    await expect(store.pathTo("c")).rejects.toThrow(/"gone" not found/);
    await expect(store.pathTo("nothing")).rejects.toThrow(/"nothing" not found/);
  });
});

describe("the light character list (D-122)", () => {
  const card = { spec: "chara_card_v2", data: { name: "Mira", description: "d", character_book: { entries: [{ keys: ["a"], content: "x".repeat(5000) }] }, extensions: { regex_scripts: [] } } };
  it("leaves the embedded book out of the list and never loses it on save or export", async () => {
    const { store } = await countingStore();
    await store.saveCharacter({ id: "c1", name: "Mira", description: "d", original: card });
    await store.saveCharacter({ id: "c2", name: "Bob" });
    const list = await store.listCharactersLight();
    const light = list.find((c) => c.id === "c1"), plain = list.find((c) => c.id === "c2");
    expect(JSON.stringify(light!.original)).not.toContain("xxxxx");
    expect(plain).toEqual(await store.getCharacter("c2"));
    // saving from the editor (a copy of the light one, edited)
    await store.saveCharacter({ ...light!, description: "edited" });
    const back = await store.getCharacter("c1");
    expect(back!.description).toBe("edited");
    expect(back!.original).toEqual(card);
    // a duplicate made from the light one keeps the book too
    await store.saveCharacter({ ...light!, id: "c3", name: "Mira (copy)" });
    expect((await store.getCharacter("c3"))!.original).toEqual(card);
    // export reads the whole card
    expect((await store.withFullOriginal(light!)).original).toEqual(card);
  });
});

describe("the light character list carries each card once (D-130)", () => {
  const long = "a long description ".repeat(400);
  const card = { spec: "chara_card_v2", spec_version: "2.0", data: {
    name: "Mira", description: long, personality: "p ".repeat(300), scenario: "s ".repeat(300), first_mes: "hi ".repeat(300), mes_example: "ex ".repeat(400),
    alternate_greetings: ["g1 ".repeat(200), "g2 ".repeat(200)], creator_notes: "notes ".repeat(200), system_prompt: "sys", post_history_instructions: "post",
    create_date: "2024-01-05", tags: ["t"], extensions: { fav: true, world: "Old Roads", depth_prompt: { prompt: "note", depth: 4 }, regex_scripts: [{ scriptName: "r" }] } } };
  it("leaves the repeated texts out, keeps what lists use, and gives the whole card back on save and export", async () => {
    const { store } = await countingStore();
    await store.saveCharacter({ id: "c1", name: "Mira", description: long, original: card });
    const full = JSON.stringify(await store.getCharacter("c1"));
    const [light] = await store.listCharactersLight();
    expect(JSON.stringify(light).length).toBeLessThan(full.length * 0.6);
    const data = (light!.original as { data: Record<string, unknown> }).data;
    expect(data.extensions).toEqual(card.data.extensions);
    expect(data.create_date).toBe("2024-01-05");
    expect(data.description).toBeUndefined();
    await store.saveCharacter({ ...light!, personality: "edited" });
    const back = await store.getCharacter("c1");
    expect(back!.personality).toBe("edited");
    expect(back!.original).toEqual(card);
    expect((await store.withFullOriginal(light!)).original).toEqual(card);
  });
});
