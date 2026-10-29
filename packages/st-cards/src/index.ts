// Homunculus 2 — module: SillyTavern character cards (import PNG/JSON V1/V2/V3, export PNG/JSON).
// Author: CLAUDE, 2026-10-23.
import type { Avatar, Character } from "@homunculus/schemas";
import type { HomunculusModule, ImportedCharacter } from "@homunculus/core";
import { base64ToBytes, bytesToBase64, utf8 } from "./bytes.ts";
import { parseCard, toCardV2, toCardV3 } from "./card.ts";
import { isPng, readChunks, readTextChunks, setTextChunks, solidPng } from "./png.ts";

export * from "./card.ts";
export * from "./png.ts";
export * from "./bytes.ts";

function decodeCardText(b64: string): unknown {
  try { return JSON.parse(utf8.decode(base64ToBytes(b64))); }
  catch { throw new Error("The card data inside the PNG is damaged."); }
}

export function importCardPng(bytes: Uint8Array): ImportedCharacter {
  const texts = readTextChunks(readChunks(bytes));
  const raw = texts.get("ccv3") ?? texts.get("chara");
  if (!raw) throw new Error("This PNG has no character card inside (it is just an image).");
  let card = decodeCardText(raw);
  const warnings: string[] = [];
  // Some tools write a broken ccv3 next to a good chara chunk: fall back if needed.
  let parsed;
  try { parsed = parseCard(card); }
  catch (e) {
    const v2 = texts.get("chara");
    if (!texts.has("ccv3") || !v2) throw e;
    card = decodeCardText(v2);
    parsed = parseCard(card);
    warnings.push("The V3 data in this card was unreadable; the V2 data was used instead.");
  }
  return {
    character: parsed.character as ImportedCharacter["character"],
    avatar: { mime: "image/png", base64: bytesToBase64(bytes) },
    warnings: [...warnings, ...parsed.warnings],
  };
}

export function importCardJson(bytes: Uint8Array): ImportedCharacter {
  let card: unknown;
  try { card = JSON.parse(utf8.decode(bytes).replace(/^﻿/, "")); }
  catch { throw new Error("This JSON file could not be read (it is not valid JSON)."); }
  const parsed = parseCard(card);
  return { character: parsed.character as ImportedCharacter["character"], warnings: parsed.warnings };
}

const PLACEHOLDER_AVATAR = (() => {
  let cache: Uint8Array | undefined;
  return () => (cache ??= solidPng(200, 300, [0x4a, 0x1f, 0x1f]));
})();

const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "character";

export function exportCardPng(c: Character, avatar?: Avatar): Uint8Array {
  const base = avatar?.mime === "image/png" ? base64ToBytes(avatar.base64) : PLACEHOLDER_AVATAR();
  if (!isPng(base)) throw new Error("The avatar is not a valid PNG image.");
  return setTextChunks(base, {
    chara: bytesToBase64(utf8.encode(JSON.stringify(toCardV2(c)))),
    ccv3: bytesToBase64(utf8.encode(JSON.stringify(toCardV3(c)))),
  });
}

export function exportCardJson(c: Character): Uint8Array {
  const wasV3 = (c.original as { spec?: string } | undefined)?.spec === "chara_card_v3";
  return utf8.encode(JSON.stringify(wasV3 ? toCardV3(c) : toCardV2(c), null, 2));
}

export function createSillyTavernCardsModule(): HomunculusModule {
  return {
    manifest: { id: "st-cards", version: "0.0.1" },
    register(api) {
      api.registerCharacterImporter({
        id: "st-card",
        name: "SillyTavern character card",
        help: "PNG cards (with the character inside the image) or JSON cards, versions V1, V2 and V3. Unknown fields are kept for exporting back.",
        extensions: [".png", ".json"],
        async import(bytes, fileName) {
          const lower = fileName.toLowerCase();
          if (lower.endsWith(".png") || isPng(bytes)) return [importCardPng(bytes)];
          if (lower.endsWith(".json")) return [importCardJson(bytes)];
          throw new Error(`"${fileName}" is not a PNG or JSON card.`);
        },
      });
      api.registerCharacterExporter({
        id: "st-card-png",
        name: "SillyTavern card (PNG)",
        help: "The character inside its image, with both V2 and V3 data — the most compatible format. Characters without an image get a plain placeholder image.",
        async export(c, avatar) {
          return { fileName: `${safeFileName(c.name)}.png`, mime: "image/png", bytes: exportCardPng(c, avatar) };
        },
      });
      api.registerCharacterExporter({
        id: "st-card-json",
        name: "SillyTavern card (JSON)",
        help: "Text-only card (no image). Same version as the card you imported (V2 by default).",
        async export(c) {
          return { fileName: `${safeFileName(c.name)}.json`, mime: "application/json", bytes: exportCardJson(c) };
        },
      });
    },
  };
}
