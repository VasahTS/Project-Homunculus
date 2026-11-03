// One import path for files and the Card Browser (T-009, D-081). CLAUDE, 2026-11-02.
import { describe, expect, it } from "vitest";
import { HomunculusCore } from "@homunculus/core";
import { createSillyTavernCardsModule, exportCardJson, importCardPng, solidPng, setTextChunks, bytesToBase64, utf8 } from "@homunculus/st-cards";
import { buildCard, cardSource, pauses, resetDatacat } from "@homunculus/card-browser";
import type { CardItem, SiteTransport } from "@homunculus/card-browser";
import { newTestStore } from "../../../packages/core/test/helpers.ts";
import { cardPngForSite, FROM_THE_WEB, importCharacterFile, importFromSite, siteIndex } from "../src/importCharacters.ts";

async function services() {
  const { store } = await newTestStore();
  const core = new HomunculusCore({ tree: store, stateRepository: store } as never);
  await core.loadModules([createSillyTavernCardsModule()]);
  return { core, store };
}
const card = buildCard({ name: "Elf Queen", description: "Proud.", first_mes: "Kneel.", tags: ["Fantasy", "Elf"], character_book: { entries: [{ keys: ["court"], content: "Old court.", id: 0 }] } });
const item: CardItem = { source: "chub", id: "anna/elf-queen", name: "Elf Queen", creator: "anna", tagline: "", tags: ["Fantasy"], thumb: "", nsfw: false, url: "https://chub.ai/characters/anna/elf-queen", stats: {} };
const toPng = async () => ({ mime: "image/png", base64: bytesToBase64(solidPng(2, 3, [1, 2, 3])) });

describe("importing characters", () => {
  // Source → shared importer → stored character → PNG: the DataCat V2 description survives every step. CODEX, 2026-11-03.
  it("imports and exports the DataCat V2 definition when legacy personality is null", async () => {
    pauses.clear(); resetDatacat();
    const embedded = buildCard({
      name: "Map Keeper", description: "Maintains the town's maps.\nCarries a green notebook.", personality: "Methodical.",
      first_mes: "Which road?", alternate_greetings: ["A new route?"], creator_notes: "A creator's introduction.",
      character_book: { entries: [{ keys: ["river"], content: "The river runs north.", id: 0 }] },
    });
    const t: SiteTransport = { async request(r) {
      return { status: 200, finalUrl: r.url, contentType: "application/json", cfMitigated: false, text: JSON.stringify(
        r.url.endsWith("identify") ? { success: true, sessionToken: "test" } : { character: {
          personality: null, description: "<p>Public biography.</p>", chara_card_v2_json: embedded,
          llm_request_payload: { userConfig: { irrelevant: "not card data" }, chatMessages: ["not a definition"] },
        } },
      ) };
    } };
    const datacatItem: CardItem = { ...item, source: "datacat", id: "dc-map", name: "Map Keeper", thumb: "", url: "https://datacat.run/characters/dc-map", nsfw: true };
    const file = await cardSource("datacat").download(datacatItem, t);
    const svc = await services();
    const r = await importFromSite(svc, file, datacatItem, { folder: "from-the-web", importTags: true }, toPng);
    expect(await svc.store.getCharacter(r.character.id)).toMatchObject({
      name: "Map Keeper", description: "Maintains the town's maps.\nCarries a green notebook.", personality: "Methodical.",
      firstMessages: ["Which road?", "A new route?"], creatorNotes: "A creator's introduction.", source: { site: "datacat", id: "dc-map" },
    });
    expect(r.character.lorebookIds).toHaveLength(1);
    const png = await cardPngForSite(file, toPng);
    expect(importCardPng(png).character.description).toBe(r.character.description);
    expect(JSON.stringify(file)).not.toMatch(/llm_request_payload|userConfig|chatMessages|Public biography/);
  });
  it("a file still imports as before (lorebook adopted, no source, no folder)", async () => {
    const svc = await services();
    const [r] = await importCharacterFile(svc, utf8.encode(JSON.stringify(card)), "elf.json");
    expect(r!.character).toMatchObject({ name: "Elf Queen", tags: ["Fantasy", "Elf"] });
    expect(r!.character.source).toBeUndefined();
    expect(r!.character.lorebookIds).toHaveLength(1);
    expect(r!.warnings[0]).toMatch(/embedded lorebook/);
    expect(await svc.store.listFolders("character")).toEqual([]);
    await expect(importCharacterFile(svc, new Uint8Array(), "x.txt")).rejects.toThrow("this kind of file can't be imported.");
  });
  it("a card from a site remembers where it came from, goes to From the Web (made once) and can drop its tags", async () => {
    const svc = await services();
    const a = await importFromSite(svc, { kind: "json", card, avatar: { mime: "image/webp", bytes: new Uint8Array([1]) } }, item, { folder: "from-the-web", importTags: true }, toPng);
    expect(a.character.source).toMatchObject({ site: "chub", id: "anna/elf-queen", url: item.url });
    expect(a.character.tags).toEqual(["Fantasy", "Elf"]);
    expect(await svc.store.getAvatar(a.character.id)).toMatchObject({ mime: "image/png" });
    const b = await importFromSite(svc, { kind: "json", card }, item, { folder: "from-the-web", importTags: false }, toPng);
    expect(b.character.tags).toEqual([]);
    const folders = await svc.store.listFolders("character");
    expect(folders.map((f) => f.name)).toEqual([FROM_THE_WEB]);
    const mine = await svc.store.saveFolder({ id: "f-rpg", kind: "character", name: "RPG", parentId: null, createdAt: 0 });
    const c = await importFromSite(svc, { kind: "json", card }, item, { folder: { id: mine.id }, importTags: true }, toPng);
    expect(siteIndex(await svc.store.listCharacters()).get("chub:anna/elf-queen")).toBe(c.character.id);
  });
  it("a ready card PNG goes through the normal PNG importer", async () => {
    const svc = await services();
    const png = setTextChunks(solidPng(2, 2, [0, 0, 0]), { chara: bytesToBase64(utf8.encode(JSON.stringify(card))) });
    const r = await importFromSite(svc, { kind: "png", bytes: png }, item, { folder: null, importTags: true }, toPng);
    expect(r.character).toMatchObject({ name: "Elf Queen", source: { site: "chub" } });
  });
  it("Save as PNG round-trips through the PNG importer, and exported cards never carry the source", async () => {
    const png = await cardPngForSite({ kind: "json", card }, toPng);
    expect(importCardPng(png).character).toMatchObject({ name: "Elf Queen", description: "Proud." });
    const svc = await services();
    const r = await importFromSite(svc, { kind: "json", card }, item, { folder: null, importTags: true }, toPng);
    expect(new TextDecoder().decode(exportCardJson(r.character))).not.toMatch(/anna\/elf-queen|"source"/);
  });
});
