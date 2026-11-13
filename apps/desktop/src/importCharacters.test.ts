// D-125: importing a card writes everything in one go (one transaction), with the same result as before.
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate, type SqlDriver, type SqlStatement } from "@homunculus/core";
import { createSillyTavernCardsModule, utf8 } from "@homunculus/st-cards";
import { importCharacterFile } from "./importCharacters.ts";

async function setup(failAt?: number) {
  const SQL = await initSqlJs();
  const inner = new SqlJsDriver(new SQL.Database());
  await migrate(inner, coreMigrations);
  const count = { executes: 0, selects: 0, batches: 0, rows: 0 };
  const driver: SqlDriver = {
    execute: (sql, p) => { count.executes++; return inner.execute(sql, p); },
    select: <T,>(sql: string, p?: unknown[]) => { count.selects++; return inner.select<T>(sql, p); },
    batch: (list: SqlStatement[]) => {
      count.batches++; count.rows += list.length;
      if (failAt !== undefined) return inner.batch(list.map((s, i) => (i === failAt ? { sql: "INSERT INTO nowhere VALUES (1)", params: [] } : s)));
      return inner.batch(list);
    },
  };
  const store = new SqlStore(driver);
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  await core.loadModules([createSillyTavernCardsModule()]);
  return { svc: { core, store }, store, count };
}

const card = {
  spec: "chara_card_v2", spec_version: "2.0",
  data: {
    name: "Mira", description: "A cartographer.", personality: "", scenario: "", first_mes: "Hello.", mes_example: "",
    tags: ["map"], extensions: { world: "Old Roads" },
    character_book: { name: "Mira's notes", entries: [{ keys: ["map"], content: "Mira draws maps.", enabled: true, insertion_order: 1 }] },
  },
};

describe("importing a card in one go (D-125)", () => {
  it("saves the card, its embedded book and the named world in one transaction", async () => {
    const { svc, store, count } = await setup();
    const world = await store.saveLorebook({ id: "old-roads", name: "Old Roads", entries: [] } as never);
    Object.assign(count, { executes: 0, selects: 0, batches: 0, rows: 0 });

    const [r] = await importCharacterFile(svc, utf8.encode(JSON.stringify(card)), "mira.json");
    expect(count.executes).toBe(0); // no write went alone
    expect(count.batches).toBe(1);
    expect(count.selects).toBeLessThanOrEqual(2);

    const saved = await store.getCharacter(r!.character.id);
    expect(saved?.name).toBe("Mira");
    const books = await store.lorebooksForUse(saved!.lorebookIds);
    expect(books.map((b) => b.name).sort()).toEqual(["Mira's notes", "Old Roads"]);
    expect(books.find((b) => b.id !== world.id)?.source).toMatchObject({ kind: "card", characterId: saved!.id });
    expect(r!.warnings[0]).toMatch(/embedded lorebook "Mira's notes" \(1 entries\)/);
    expect(await store.listHistory("character", saved!.id)).toHaveLength(1);
  });

  it("a failure saves nothing — never half a card", async () => {
    const { svc, store } = await setup(1);
    await expect(importCharacterFile(svc, utf8.encode(JSON.stringify(card)), "mira.json")).rejects.toThrow();
    expect(await store.listCharacters()).toEqual([]);
    expect(await store.lorebooks.list()).toEqual([]);
  });

  it("a batched store's reads see the writes made before them", async () => {
    const { store } = await setup();
    const { store: b, flush } = store.batched();
    await b.saveCharacter({ id: "x", name: "X" } as never, { isNew: true });
    expect((await b.getCharacter("x"))?.name).toBe("X");
    await b.setFolder("character", "x", "f1");
    await flush();
    expect(await store.folderMap("character")).toEqual({ x: "f1" });
  });
});
