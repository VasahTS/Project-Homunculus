// JannyAI browser regressions and full-PNG import control. CODEX, 2026-11-02.
// All site traffic is synthetic; recovery cases are ordinary regressions.
import { expect, test, type Page } from "@playwright/test";
import { bytesToBase64, setTextChunks, solidPng, utf8 } from "@homunculus/st-cards";

const card = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Audit Demo", description: "Full public definition.", personality: "Patient.", scenario: "A quiet library.", first_mes: "Welcome.", alternate_greetings: ["Come in."], mes_example: "Example.", creator_notes: "Fixture only.", system_prompt: "System instruction.", post_history_instructions: "Post history instruction.", tags: ["Fantasy"] } };
const png = bytesToBase64(setTextChunks(solidPng(2, 2, [50, 60, 70]), { chara: bytesToBase64(utf8.encode(JSON.stringify(card))) }));

async function fakeJanny(page: Page, options: { download?: boolean; details?: boolean; searchBlocked?: boolean } = {}) {
  await page.addInitScript(({ options, png }) => {
    localStorage.setItem("h2.cardBrowser", JSON.stringify({ source: "janny", sorts: {}, nsfw: {}, size: "m", folder: "web", importTags: true }));
    const state = { recovered: false, calls: [] as string[] };
    (globalThis as { __jannyAudit?: typeof state }).__jannyAudit = state;
    const ok = (text: string) => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text });
    const blocked = () => ({ ...ok("<title>Just a moment...</title>"), status: 403, contentType: "text/html", cfMitigated: true });
    const raw = { personality: [0, "Full public definition."], firstMessage: [0, "Welcome."], scenario: [0, "A quiet library."] };
    const html = '<astro-island component-export="CharacterButtons" props="' + JSON.stringify({ character: [0, raw] }).replace(/"/g, "&quot;") + '"></astro-island>';
    (globalThis as { __h2FakeCardSites?: unknown }).__h2FakeCardSites = {
      async request(r: { url: string; expect: string }) {
        const u = new URL(r.url);
        state.calls.push(r.url);
        if (u.hostname === "search.jannyai.com") return options.searchBlocked ? blocked() : ok(JSON.stringify({ results: [{ totalHits: 1, totalPages: 1, hits: [{ id: "audit-demo", name: "Audit Demo", description: "Catalog excerpt only.", tagIds: [53], totalToken: 1500, isNsfw: false }] }] }));
        if (u.pathname === "/api/v1/download") return options.download ? ok(JSON.stringify({ status: "ok", downloadUrl: "https://files.example.invalid/card.png" })) : blocked();
        if (r.expect === "card") return { ...ok(""), bytes: Uint8Array.from(atob(png), (c) => c.charCodeAt(0)), mime: "image/png" };
        if (u.pathname === "/characters/search") return ok("<!doctype html><title>Public search fixture</title>");
        if (u.pathname.startsWith("/characters/")) return options.details || state.recovered ? ok(html) : blocked();
        throw new Error("No synthetic response for " + u.hostname);
      },
    };
  }, { options, png });
}

async function openCard(page: Page) {
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  await expect(page.getByTestId("cb-card")).toHaveCount(1);
  await page.getByTestId("cb-card").click();
  await expect(page.getByTestId("cb-sheet")).toBeVisible();
}

test("JannyAI control: a complete PNG imports with provenance and intact definition fields", async ({ page }) => {
  await fakeJanny(page, { download: true, details: true });
  await openCard(page);
  await page.getByTestId("cb-add").click();
  await expect(page.getByTestId("notice")).toContainText("Added Audit Demo to Characters");
  await expect(page.getByTestId("cb-chat")).toBeVisible();
  const saved = await page.evaluate(async () => {
    const path = "/src/core-instance.ts";
    const { servicesReady } = await import(/* @vite-ignore */ path);
    const { store } = await servicesReady;
    return (await store.listCharacters()).filter((c: { source?: { site: string; id: string } }) => c.source?.site === "janny" && c.source.id === "audit-demo");
  });
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ name: "Audit Demo", description: "Full public definition.", personality: "Patient.", scenario: "A quiet library.", firstMessages: ["Welcome.", "Come in."], systemPrompt: "System instruction.", postHistoryInstructions: "Post history instruction.", source: { site: "janny", id: "audit-demo" } });
});

test("JannyAI control: a blocked search offers Open JannyAI and downloaded-file import", async ({ page }) => {
  await fakeJanny(page, { searchBlocked: true });
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  const notice = page.getByTestId("cb-notice");
  await expect(notice).toContainText("Cloudflare");
  await expect(notice.getByRole("button", { name: "Open JannyAI", exact: true })).toBeVisible();
  await expect(notice.getByRole("button", { name: "Import a Downloaded File…" })).toBeVisible();
});

test("J6: a blocked card download offers the same recovery actions as a blocked search", async ({ page }) => {
  await fakeJanny(page);
  await openCard(page);
  await expect(page.getByTestId("cb-partial")).toBeVisible();
  await page.getByTestId("cb-add").click();
  const notice = page.getByTestId("notice");
  await expect(notice).toContainText("checking your browser");
  await expect(notice.getByRole("button", { name: "Import a Downloaded File…" })).toBeVisible({ timeout: 1200 });
});

test("J7: details recover after the page pause expires and the site becomes available", async ({ page }) => {
  await page.clock.install();
  await fakeJanny(page);
  await openCard(page);
  await expect(page.getByTestId("cb-partial")).toBeVisible();
  await page.evaluate(() => {
    const state = (globalThis as { __jannyAudit?: { recovered: boolean } }).__jannyAudit!;
    state.recovered = true;
  });
  await page.clock.fastForward(6 * 60_000);
  await page.getByTestId("place-list").getByRole("button", { name: "Characters", exact: true }).click();
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  await expect(page.getByTestId("cb-sheet")).toBeVisible();
  await expect(page.getByTestId("cb-sheet")).toContainText("Full public definition.", { timeout: 1200 });
});

test("JannyAI: a complete public page imports when the PNG endpoint is refused", async ({ page }) => {
  await fakeJanny(page, { details: true });
  await openCard(page);
  await expect(page.getByTestId("cb-sheet")).toContainText("Full public definition.");
  await page.getByTestId("cb-add").click();
  await expect(page.getByTestId("notice")).toContainText("Added Audit Demo to Characters");
  await expect(page.getByTestId("cb-chat")).toBeVisible();
});
