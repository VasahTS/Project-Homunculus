// Fidelity tests for SillyTavern cards. Author: CLAUDE, 2026-10-23.
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Character } from "@homunculus/schemas";
import {
  parseCard, toCardV2, base64ToBytes, bytesToBase64, exportCardJson, exportCardPng, importCardJson, importCardPng,
  readChunks, readTextChunks, setTextChunks, solidPng, utf8,
} from "../src/index.ts";

/** A realistic V2 card, with fields Homunculus does not understand (must survive export). */
const v2Card = {
  name: "Mira", description: "old v1 copy", first_mes: "old", personality: "", scenario: "", mes_example: "",
  avatar: "none", create_date: "2025-1-1 @12h", talkativeness: "0.5", fav: false,
  spec: "chara_card_v2", spec_version: "2.0",
  data: {
    name: "Mira",
    description: "{{char}} is a cartographer who maps dreams. Ünïcödé ✓ 夢",
    personality: "Curious, blunt.",
    scenario: "A lighthouse library.",
    first_mes: "*Mira looks up from a map.* \"You're late, {{user}}.\"",
    alternate_greetings: ["*She doesn't look up.* \"Door's open.\""],
    mes_example: "<START>\n{{char}}: Maps lie. Dreams don't.",
    system_prompt: "", post_history_instructions: "",
    creator_notes: "Best with slow burn.", creator: "someone", character_version: "1.2",
    tags: ["fantasy", "slow burn"],
    character_book: { name: "Mira's world", entries: [{ keys: ["lighthouse"], content: "The lighthouse is alive.", extensions: {} }], extensions: {} },
    extensions: { depth_prompt: { prompt: "Mira hums.", depth: 4 }, talkativeness: "0.5", custom_tool: { x: 1 } },
  },
};

const asCharacter = (input: object, id = "x") => Character.parse({ ...input, id });
const tinyPng = () => solidPng(4, 6, [10, 20, 30]);
const pngWithCard = (card: object, key = "chara") =>
  setTextChunks(tinyPng(), { [key]: bytesToBase64(utf8.encode(JSON.stringify(card))) });

describe("PNG basics", () => {
  it("the placeholder PNG is a valid image (pixels decode to the right size)", () => {
    const chunks = readChunks(solidPng(5, 3, [1, 2, 3]));
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    const raw = inflateSync(chunks[1]!.data);
    expect(raw.length).toBe(3 * (1 + 5 * 3));
    expect([...raw.subarray(1, 4)]).toEqual([1, 2, 3]);
    // a big one spans several stored blocks
    expect(inflateSync(readChunks(solidPng(200, 300, [1, 1, 1]))[1]!.data).length).toBe(300 * 601);
  });

  it("replaces text chunks instead of duplicating them", () => {
    const once = setTextChunks(tinyPng(), { chara: "AAA" });
    const twice = setTextChunks(once, { chara: "BBB", ccv3: "CCC" });
    const types = readChunks(twice).map((c) => c.type);
    expect(types.filter((t) => t === "tEXt")).toHaveLength(2);
    expect(types.at(-1)).toBe("IEND");
    expect(Object.fromEntries(readTextChunks(readChunks(twice)))).toEqual({ chara: "BBB", ccv3: "CCC" });
  });

  it("explains non-card PNGs and non-PNG files", () => {
    expect(() => importCardPng(tinyPng())).toThrow(/no character card inside/);
    expect(() => importCardPng(utf8.encode("hello"))).toThrow(/not a PNG/);
  });
});

describe("import", () => {
  it("reads a V2 PNG card with all fields and keeps the image as avatar", () => {
    const png = pngWithCard(v2Card);
    const r = importCardPng(png);
    expect(r.character).toMatchObject({
      name: "Mira",
      description: "{{char}} is a cartographer who maps dreams. Ünïcödé ✓ 夢",
      firstMessages: [v2Card.data.first_mes, v2Card.data.alternate_greetings[0]],
      exampleMessages: v2Card.data.mes_example,
      creatorNotes: "Best with slow burn.", creator: "someone", characterVersion: "1.2",
      tags: ["fantasy", "slow burn"],
    });
    expect(r.avatar?.mime).toBe("image/png");
    expect(base64ToBytes(r.avatar!.base64)).toEqual(png);
    expect(r.warnings).toEqual([]); // the embedded lorebook stays in original; the app makes it a linked lorebook (st-lorebooks)
  });

  it("prefers the V3 chunk, and falls back to V2 if V3 is broken", () => {
    const v3 = { spec: "chara_card_v3", spec_version: "3.0", data: { ...v2Card.data, name: "Mira V3", group_only_greetings: [] } };
    const both = setTextChunks(tinyPng(), {
      chara: bytesToBase64(utf8.encode(JSON.stringify(v2Card))),
      ccv3: bytesToBase64(utf8.encode(JSON.stringify(v3))),
    });
    expect(importCardPng(both).character.name).toBe("Mira V3");

    const broken = setTextChunks(both, { ccv3: bytesToBase64(utf8.encode('{"spec":"chara_card_v3"}')) });
    const r = importCardPng(broken);
    expect(r.character.name).toBe("Mira");
    expect(r.warnings[0]).toMatch(/V2 data was used/);
  });

  it("reads V1 and V2 JSON cards, with clear errors for other JSON", () => {
    const v1 = { name: "Old Bob", description: "A v1 card", first_mes: "Hey.", personality: "", scenario: "", mes_example: "" };
    expect(importCardJson(utf8.encode(JSON.stringify(v1))).character).toMatchObject({ name: "Old Bob", firstMessages: ["Hey."] });
    expect(importCardJson(utf8.encode("﻿" + JSON.stringify(v2Card))).character.name).toBe("Mira");
    expect(() => importCardJson(utf8.encode('{"hello":1}'))).toThrow(/not a SillyTavern character card/);
    expect(() => importCardJson(utf8.encode("{nope"))).toThrow(/not valid JSON/);
    expect(() => importCardJson(utf8.encode(JSON.stringify({ ...v2Card, data: { ...v2Card.data, name: " " } })))).toThrow(/no character name/);
  });
});

describe("export (lossless round trip)", () => {
  it("an edited card keeps every unknown field and updates the edited ones", () => {
    const imported = importCardPng(pngWithCard(v2Card));
    const c = asCharacter({ ...imported.character, description: "Edited in Homunculus.", firstMessages: ["New hello."] });
    const out = importCardPng(exportCardPng(c, imported.avatar)); // what SillyTavern would read back
    const card = c.original as typeof v2Card;
    const v2 = JSON.parse(utf8.decode(base64ToBytes(readTextChunks(readChunks(exportCardPng(c, imported.avatar))).get("chara")!)));

    expect(out.character.description).toBe("Edited in Homunculus.");
    expect(out.character.firstMessages).toEqual(["New hello."]);
    expect(v2.data.character_book).toEqual(card.data.character_book);
    expect(v2.data.extensions).toEqual(card.data.extensions);
    expect(v2.create_date).toBe("2025-1-1 @12h");
    expect(v2.talkativeness).toBe("0.5");
    expect(v2.data.alternate_greetings).toEqual([]);
    expect(v2.description).toBe("Edited in Homunculus."); // top-level V1 copy updated too
    expect(v2.spec).toBe("chara_card_v2");
  });

  it("unchanged import -> export -> import gives the same character", () => {
    const first = importCardPng(pngWithCard(v2Card));
    const c = asCharacter(first.character);
    const again = importCardPng(exportCardPng(c, first.avatar));
    const { original: _o1, ...a } = first.character as Record<string, unknown>;
    const { original: _o2, ...b } = again.character as Record<string, unknown>;
    expect(b).toEqual(a);
  });

  it("a character made in Homunculus exports as a valid card with a placeholder image", () => {
    const c = asCharacter({ name: "Corvin", description: "Innkeeper.", firstMessages: ["Room's two silver."] });
    const png = exportCardPng(c);
    const back = importCardPng(png);
    expect(back.character).toMatchObject({ name: "Corvin", description: "Innkeeper.", firstMessages: ["Room's two silver."] });
    const texts = readTextChunks(readChunks(png));
    expect(JSON.parse(utf8.decode(base64ToBytes(texts.get("ccv3")!))).spec).toBe("chara_card_v3");
    expect(JSON.parse(utf8.decode(base64ToBytes(texts.get("chara")!))).spec).toBe("chara_card_v2");
  });

  it("JSON export keeps the imported version", () => {
    const v3 = { spec: "chara_card_v3", spec_version: "3.0", data: { ...v2Card.data, group_only_greetings: ["hi all"], nickname: "M" } };
    const c3 = asCharacter(importCardJson(utf8.encode(JSON.stringify(v3))).character);
    const out3 = JSON.parse(utf8.decode(exportCardJson(c3)));
    expect(out3.spec).toBe("chara_card_v3");
    expect(out3.data.group_only_greetings).toEqual(["hi all"]);
    expect(out3.data.nickname).toBe("M");

    const c2 = asCharacter(importCardJson(utf8.encode(JSON.stringify(v2Card))).character);
    expect(JSON.parse(utf8.decode(exportCardJson(c2))).spec).toBe("chara_card_v2");
  });
});

describe("Character's Note (D-063)", async () => {
  const { buildPrompt, DEFAULT_PRESET, characterNoteOf } = await import("@homunculus/core");
  it("is read from depth_prompt, edited as a field, written back, and sent at its depth and role", () => {
    const card = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Lyra", description: "", personality: "", scenario: "", first_mes: "", mes_example: "",
      extensions: { depth_prompt: { prompt: "Lyra never says thank you.", depth: 2, role: "system" }, talkativeness: "0.5" } } };
    const parsed = parseCard(card);
    expect(parsed.character.characterNote).toEqual({ text: "Lyra never says thank you.", depth: 2, role: "system" });
    const c = Character.parse({ ...parsed.character, id: "lyra", original: card, characterNote: { text: "{{char}} never thanks anyone.", depth: 3, role: "user" } });
    const out = toCardV2(c) as { data: { extensions: Record<string, unknown> } };
    expect(out.data.extensions.depth_prompt).toEqual({ prompt: "{{char}} never thanks anyone.", depth: 3, role: "user" });
    expect(out.data.extensions.talkativeness).toBe("0.5");
    const prompt = buildPrompt({ preset: DEFAULT_PRESET, generationType: "normal", character: c, sessionScenario: "", names: { char: "Lyra", user: "Ann" }, scene: [], injections: [], inline: [], reserve: 100,
      history: [0, 1, 2, 3, 4].map((i) => ({ id: `m${i}`, sessionId: "s", parentId: null, speaker: { kind: i % 2 ? "user" as const : "character" as const, characterId: "lyra" }, kind: "reply" as const, visibility: { ai: "full" as const, user: true }, content: `msg ${i}`, createdAt: i, meta: {} })) as never });
    const note = prompt.parts.findIndex((p) => p.source === "card:note");
    expect(prompt.parts[note]).toMatchObject({ role: "user", content: "Lyra never thanks anyone." });
    // an older character without the field still uses the one in its imported card
    expect(characterNoteOf(Character.parse({ id: "x", name: "X", original: card }))?.text).toBe("Lyra never says thank you.");
    expect(characterNoteOf(Character.parse({ id: "x", name: "X", original: card, characterNote: { text: "", depth: 4, role: "system" } }))).toBeUndefined();
  });
});

describe("Don't track in the Scene (D-065)", () => {
  it("is kept in extensions.homunculus through export and import, beside the card's other extensions", () => {
    const c = asCharacter({ ...importCardPng(pngWithCard(v2Card)).character, tracked: false });
    const out = toCardV2(c) as { data: { extensions: Record<string, unknown> } };
    expect(out.data.extensions.homunculus).toEqual({ tracked: false });
    expect(out.data.extensions.custom_tool).toEqual({ x: 1 });
    expect(importCardPng(exportCardPng(c)).character.tracked).toBe(false);
    // a card that never had it exports without it (lossless)
    expect((toCardV2(asCharacter(importCardPng(pngWithCard(v2Card)).character)) as typeof out).data.extensions.homunculus).toBeUndefined();
  });
});
