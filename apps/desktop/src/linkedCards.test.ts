// D-129: a linked folder of cards — new, changed, changed in both places, missing, unlink. The folder is never written.
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate } from "@homunculus/core";
import { createSillyTavernCardsModule } from "@homunculus/st-cards";
import type { FolderEntry, FolderSource } from "./stFolder.ts";
import { checkLinkedFolder, compareLinked, keepAsOwn, linkedFolderOf, linkedStatuses, readIndex, resolveLinked, unlinkFolder } from "./linkedCards.ts";

const card = (name: string, description: string) => JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: { name, description, personality: "", scenario: "", first_mes: "Hi.", mes_example: "", tags: [], extensions: {} } });

/** A folder in memory; `writes` stays 0 (the source has no way to write). */
function memFolder(files: Record<string, string>) {
  let clock = 1000;
  const meta = new Map<string, { modified: number }>(Object.keys(files).map((p) => [p, { modified: clock++ }]));
  const src: FolderSource = {
    name: "CardVault",
    async list() {
      const out: FolderEntry[] = [];
      for (const [p, t] of Object.entries(files)) out.push({ path: p, dir: false, size: t.length, modified: meta.get(p)!.modified });
      return out;
    },
    async read(p) { if (!(p in files)) throw new Error("not found"); return new TextEncoder().encode(files[p]); },
  };
  return {
    src,
    set(p: string, text: string) { files[p] = text; meta.set(p, { modified: clock++ }); },
    remove(p: string) { delete files[p]; meta.delete(p); },
  };
}

async function setup() {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  const store = new SqlStore(driver);
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  await core.loadModules([createSillyTavernCardsModule()]);
  return { svc: { core, store }, store };
}
const folder = { id: "f1", name: "CardVault" };

describe("linked card folders (D-129)", () => {
  it("brings new cards into a folder named after the linked folder; unchanged files are not read again", async () => {
    const { svc, store } = await setup();
    const fs = memFolder({ "Mira.json": card("Mira", "A cartographer."), "sprites/joy.png": "not a card", "notes.txt": "x" });
    const r = await checkLinkedFolder(svc, folder, fs.src);
    expect(r).toMatchObject({ added: 1, updated: 0, conflicts: 0, missing: 0 });
    const [mira] = await store.listCharacters();
    expect(linkedFolderOf(mira!)).toBe("f1");
    const folders = await store.listFolders("character");
    expect(folders.map((f) => f.name)).toEqual(["CardVault"]);
    expect((await store.folderMap("character"))[mira!.id]).toBe(folders[0]!.id);
    expect(linkedStatuses(await readIndex(store), [mira!]).get(mira!.id)).toBe("new");

    let reads = 0;
    const counted = { ...fs.src, read: (p: string) => { reads++; return fs.src.read(p); } };
    const again = await checkLinkedFolder(svc, folder, counted);
    expect(again).toMatchObject({ added: 0, updated: 0 });
    expect(reads).toBe(0); // the sprite is remembered as "not a card"
    expect(linkedStatuses(await readIndex(store), [mira!]).get(mira!.id)).toBe("linked");
  });

  it("a changed file updates a card not edited here; edited in both places asks", async () => {
    const { svc, store } = await setup();
    const fs = memFolder({ "Mira.json": card("Mira", "v1"), "Ivo.json": card("Ivo", "v1") });
    await checkLinkedFolder(svc, folder, fs.src);
    const byName = async (n: string) => (await store.listCharacters()).find((c) => c.name === n)!;

    fs.set("Mira.json", card("Mira", "v2 from the manager"));
    const ivo = await byName("Ivo");
    await store.saveCharacter({ ...ivo, description: "edited here" });
    expect(linkedStatuses(await readIndex(store), [ivo, await byName("Ivo")]).get(ivo.id)).toBe("edited");
    fs.set("Ivo.json", card("Ivo", "v2 from the manager"));

    const r = await checkLinkedFolder(svc, folder, fs.src);
    expect(r).toMatchObject({ updated: 1, conflicts: 1 });
    expect((await byName("Mira")).description).toBe("v2 from the manager");
    expect((await store.listHistory("character", (await byName("Mira")).id)).length).toBeGreaterThanOrEqual(2);
    expect((await byName("Ivo")).description).toBe("edited here");
    const all = await store.listCharacters();
    expect(linkedStatuses(await readIndex(store), all).get((await byName("Ivo")).id)).toBe("conflict");
    expect((await compareLinked(svc, fs.src, "Ivo.json"))?.file.description).toBe("v2 from the manager");
    // a check while waiting doesn't ask again
    expect((await checkLinkedFolder(svc, folder, fs.src)).conflicts).toBe(0);

    await resolveLinked(svc, fs.src, (await byName("Ivo")).id, "both");
    const ivos = (await store.listCharacters()).filter((c) => c.name === "Ivo");
    expect(ivos.map((c) => [c.description, linkedFolderOf(c)]).sort()).toEqual([["edited here", null], ["v2 from the manager", "f1"]]);
    expect(linkedStatuses(await readIndex(store), await store.listCharacters()).get(ivos.find((c) => linkedFolderOf(c))!.id)).toBe("linked");
  });

  it("Keep Mine keeps your version until the file changes again", async () => {
    const { svc, store } = await setup();
    const fs = memFolder({ "Mira.json": card("Mira", "v1") });
    await checkLinkedFolder(svc, folder, fs.src);
    const [m] = await store.listCharacters();
    await store.saveCharacter({ ...m!, description: "mine" });
    fs.set("Mira.json", card("Mira", "theirs"));
    await checkLinkedFolder(svc, folder, fs.src);
    await resolveLinked(svc, fs.src, m!.id, "mine");
    expect((await store.getCharacter(m!.id))?.description).toBe("mine");
    expect(linkedStatuses(await readIndex(store), await store.listCharacters()).get(m!.id)).toBe("linked");
    expect((await checkLinkedFolder(svc, folder, fs.src))).toMatchObject({ updated: 0, conflicts: 0 });
    fs.set("Mira.json", card("Mira", "theirs again"));
    expect((await checkLinkedFolder(svc, folder, fs.src)).updated).toBe(1);
  });

  it("a missing file is marked, comes back when the file does, and unlinking keeps the cards", async () => {
    const { svc, store } = await setup();
    const fs = memFolder({ "Mira.json": card("Mira", "v1"), "Ivo.json": card("Ivo", "v1") });
    await checkLinkedFolder(svc, folder, fs.src);
    const text = card("Mira", "v1");
    fs.remove("Mira.json");
    expect((await checkLinkedFolder(svc, folder, fs.src)).missing).toBe(1);
    const mira = (await store.listCharacters()).find((c) => c.name === "Mira")!;
    expect(linkedStatuses(await readIndex(store), [mira]).get(mira.id)).toBe("missing");
    fs.set("Mira.json", text);
    await checkLinkedFolder(svc, folder, fs.src);
    expect(linkedStatuses(await readIndex(store), [mira]).get(mira.id)).not.toBe("missing");
    expect((await store.listCharacters()).filter((c) => c.name === "Mira")).toHaveLength(1);

    await keepAsOwn(svc, mira.id);
    expect(linkedFolderOf((await store.getCharacter(mira.id))!)).toBeNull();
    const out = await unlinkFolder(svc, "f1", "keep");
    expect(out.kept).toBe(1);
    expect((await store.listCharacters()).every((c) => linkedFolderOf(c) === null)).toBe(true);
    expect(await readIndex(store)).toEqual({});
  });
});
