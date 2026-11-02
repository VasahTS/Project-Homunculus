// JannyAI audit: real PNGs and missing Marinara recovery paths. CODEX, 2026-11-02.
// Ordinary regressions: each case failed before its fix; no live network.
import { beforeEach, describe, expect, it } from "vitest";
import { bytesToBase64, importCardPng, setTextChunks, solidPng, utf8 } from "@homunculus/st-cards";
import { cardSource, pauses, resetJannyKey } from "../src/index.ts";
import type { CardItem, SiteRequest, SiteResponse, SiteTransport } from "../src/index.ts";

const source = cardSource("janny");
const item: CardItem = { source: "janny", id: "audit-demo", name: "Audit Demo", creator: "fixture", tagline: "Catalog excerpt only.", tags: ["Fantasy"], thumb: "", nsfw: false, url: "https://jannyai.com/characters/audit-demo_character-audit-demo", stats: {} };
const data = { name: item.name, description: "Full definition.", personality: "Patient.", scenario: "A quiet library.", first_mes: "Welcome.", alternate_greetings: ["Come in."], mes_example: "Example dialogue.", creator_notes: "Public notes.", system_prompt: "System instruction.", post_history_instructions: "Post history instruction.", tags: item.tags };
const png = setTextChunks(solidPng(2, 2, [50, 60, 70]), { chara: bytesToBase64(utf8.encode(JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data }))) });
const ok = (text: string): SiteResponse => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text });
const blocked = (): SiteResponse => ({ ...ok("<title>Just a moment...</title>"), status: 403, contentType: "text/html", cfMitigated: true });
const fullPage = { personality: "Full definition.", tavern_personality: "Patient.", scenario: "A quiet library.", firstMessage: "Welcome.", alternateGreetings: ["Come in."], exampleDialogs: "Example dialogue.", systemPrompt: "System instruction.", postHistoryInstructions: "Post history instruction." };
const astro = (character: Record<string, unknown>) => {
  const encode = (v: unknown): unknown => Array.isArray(v) ? [1, v.map(encode)] : v && typeof v === "object" ? [0, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]))] : [0, v];
  return '<astro-island component-export="CharacterButtons" props="' + JSON.stringify({ character: encode(character) }).replace(/"/g, "&quot;") + '"></astro-island>';
};
function transport(answer: (r: SiteRequest) => SiteResponse): SiteTransport { return { request: async (r) => answer(r), decodeCard: (bytes) => importCardPng(bytes).character.original as Record<string, unknown> }; }
beforeEach(() => { pauses.clear(); resetJannyKey(); });

describe("JannyAI reliability audit", () => {
  it("a genuine full-card PNG survives download and import with every definition field", async () => {
    const t = transport((r) => r.url.includes("/api/v1/download") ? ok(JSON.stringify({ status: "ok", downloadUrl: "https://files.example.invalid/card.png" })) : { ...ok(""), bytes: png, mime: "image/png" });
    const file = await source.download(item, t);
    expect(file.kind).toBe("png");
    if (file.kind !== "png") throw new Error("Expected the complete PNG");
    expect(importCardPng(file.bytes).character).toMatchObject({ name: item.name, description: data.description, personality: data.personality, scenario: data.scenario, firstMessages: ["Welcome.", "Come in."], systemPrompt: data.system_prompt, postHistoryInstructions: data.post_history_instructions });
  });

  it("J2: reads details from the complete PNG when HTML pages are blocked, as Marinara does", async () => {
    const t = transport((r) => r.url.includes("/api/v1/download") ? ok(JSON.stringify({ status: "ok", downloadUrl: "https://files.example.invalid/card.png" })) : r.expect === "card" ? { ...ok(""), bytes: png, mime: "image/png" } : blocked());
    expect(await source.details(item, t)).toMatchObject({ description: data.description, firstMessage: data.first_mes, systemPrompt: data.system_prompt, postHistory: data.post_history_instructions });
  });

  it("J3: recovers details from Marinara's public API mirror when the main page is blocked", async () => {
    const t = transport((r) => r.url.startsWith("https://api.jannyai.com/characters/") ? ok(astro(fullPage)) : blocked());
    expect(await source.details(item, t)).toMatchObject({ description: fullPage.personality, firstMessage: fullPage.firstMessage });
  });

  it("J4: builds an importable definition when the PNG API is blocked but the public page is complete", async () => {
    const t = transport((r) => r.url.includes("/api/v1/download") ? blocked() : ok(astro(fullPage)));
    expect(await source.details(item, t)).toMatchObject({ description: fullPage.personality });
    const file = await source.download(item, t);
    expect(file.kind).toBe("json");
    if (file.kind !== "json") throw new Error("Expected the recovered definition");
    expect(file.card).toMatchObject({ data: { description: fullPage.personality, first_mes: fullPage.firstMessage } });
  });

  it("J5: preserves nested definition fields supported by Marinara's detail mapper", async () => {
    const t = transport(() => ok(astro({ definition: data })));
    expect(await source.details(item, t)).toMatchObject({ description: data.description, firstMessage: data.first_mes, scenario: data.scenario, exampleDialogue: data.mes_example, systemPrompt: data.system_prompt, postHistory: data.post_history_instructions });
  });

  it("refuses import when only the catalog excerpt is available", async () => {
    const t = transport(() => blocked());
    expect(await source.details(item, t)).toMatchObject({ partial: true, creatorNotes: item.tagline, description: "", firstMessage: "" });
    await expect(source.download(item, t)).rejects.toThrow(/checking your browser/);
  });
});

it("shares one full-card request between details and Add, then decodes the original PNG", async () => {
  let downloads = 0;
  const t = transport((r) => { if (r.url.includes("/api/v1/download")) { downloads++; return ok(JSON.stringify({ status: "ok", downloadUrl: "https://files.example.invalid/card.png" })); } return { ...ok(""), bytes: png, mime: "image/png" }; });
  const [detail, file] = await Promise.all([source.details(item, t), source.download(item, t)]);
  expect(downloads).toBe(1); expect(file.kind).toBe("png"); expect(detail.description).toBe(data.description);
});
it("does not retain a rejected download promise after the site becomes available", async () => {
  let available = false;
  const t = transport((r) => !available ? blocked() : r.url.includes("/api/v1/download") ? ok(JSON.stringify({ status: "ok", downloadUrl: "https://files.example.invalid/card.png" })) : { ...ok(""), bytes: png, mime: "image/png" });
  expect(await source.details(item, t)).toMatchObject({ partial: true });
  pauses.clear(); available = true;
  expect((await source.download(item, t)).kind).toBe("png");
});
it("honours rate limits before trying alternate detail endpoints", async () => {
  let calls = 0;
  const t = transport(() => { calls++; return { ...ok("slow down"), status: 429, retryAfterSecs: 30 }; });
  await expect(source.details(item, t)).rejects.toThrow(/slow down/);
  expect(calls).toBe(1);
});
