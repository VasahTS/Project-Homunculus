// Homunculus 2 — Card Browser: find character cards on public sites (docs/CARD-BROWSER.md). CLAUDE, 2026-11-02.
// Site knowledge ported from Homunculus v1's Card Browser (VasahTS/Homunculus 0884338a), which followed Marinara Engine's.
import type { CardSource, SourceId } from "./types.ts";
import { chub } from "./sources/chub.ts";
import { janny } from "./sources/janny.ts";
import { wyvern } from "./sources/wyvern.ts";
import { pygmalion } from "./sources/pygmalion.ts";
import { datacat } from "./sources/datacat.ts";
import { botbooru } from "./sources/botbooru.ts";
import { janitor } from "./sources/janitor.ts";

export * from "./types.ts";
export * from "./pauses.ts";
export { buildCard, detailsFromCard, plain, slugify } from "./build.ts";
export { parseJannyPage, searchKey, resetJannyKey } from "./sources/janny.ts";
export { wyvernAvatarUrl } from "./sources/wyvern.ts";
export { datacatAvatarUrl, datacatCopy, resetDatacat, type DatacatCopy } from "./sources/datacat.ts";
export { HIDDEN_DEFINITION, NO_PROXY, janitorAvatarUrl, janitorSearchUrl, resetJanitor } from "./sources/janitor.ts";

/** In the source picker's order (UI-PLAN "Card Browser"). DataCat: Daniel's choice (D-081). JanitorAI: D-098. */
export const CARD_SOURCES: CardSource[] = [chub, janny, wyvern, pygmalion, datacat, botbooru, janitor];
export const cardSource = (id: string): CardSource => CARD_SOURCES.find((s) => s.id === id) ?? chub;
export const isSourceId = (id: unknown): id is SourceId => CARD_SOURCES.some((s) => s.id === id);
