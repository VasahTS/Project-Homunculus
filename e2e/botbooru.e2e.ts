// BotBooru account gates, original PNG import, paging and logout. Synthetic content only. CODEX, 2026-11-02.
import { expect, test, type Page } from "@playwright/test";
import { bytesToBase64, setTextChunks, solidPng, utf8 } from "@homunculus/st-cards";
const card = { spec: "chara_card_v2", spec_version: "2.0", data: { name: "Fixture Explorer", description: "A complete harmless definition.", personality: "Patient.", scenario: "A quiet library.", first_mes: "Welcome.", alternate_greetings: ["Come in."], mes_example: "An example.", creator_notes: "A synthetic test card.", tags: ["Fantasy"], character_book: { entries: [{ id: 0, keys: ["library"], content: "The library is quiet." }] } } };
const png = bytesToBase64(setTextChunks(solidPng(2, 2, [55, 65, 75]), { chara: bytesToBase64(utf8.encode(JSON.stringify(card))) }));
async function open(page: Page, options: { pause?: boolean } = {}) {
  await page.addInitScript(({ card, png, options }) => {
    localStorage.setItem("h2.cardBrowser", JSON.stringify({ source: "botbooru", sorts: {}, nsfw: {}, size: "m", folder: "web", importTags: true }));
    const state = { account: { username: null as string | null, showNsfw: false, showNsfl: false }, calls: [] as string[], opened: 0, pause: !!options.pause };
    (globalThis as { __bb?: typeof state }).__bb = state;
    const ok = (data: unknown) => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text: JSON.stringify(data) });
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    (globalThis as { __h2FakeCardSites?: unknown }).__h2FakeCardSites = {
      async botbooruAccount(action: string) {
        if (action === "open") state.opened++;
        if (action === "logout") state.account = { username: null, showNsfw: false, showNsfl: false };
        return { ...state.account };
      },
      async request(r: { url: string; expect: string }) {
        state.calls.push(r.url);
        const u = new URL(r.url);
        if (r.expect === "image" || r.expect === "card") return { ...ok(null), bytes, mime: "image/png" };
        if (u.pathname === "/tags/") return ok([{ name: "Fantasy", category: "General" }, { name: "Horror", category: "General" }]);
        if (u.pathname.startsWith("/download/json/")) return ok(card);
        if (u.hostname === "api.chub.ai" && u.pathname === "/search") return ok({ data: { count: 1, nodes: [{ fullPath: "fixture/chub", name: "Chub Fixture", topics: ["Fantasy"] }] } });
        if (u.pathname === "/posts/") {
          if (state.pause) return { ...ok({}), status: 429, retryAfterSecs: 120 };
          if (u.searchParams.get("qtext") === "nothing") return ok({ posts: [], total: 0 });
          const adult = !u.searchParams.has("sfw_only") && state.account.username && state.account.showNsfw;
          const offset = Number(u.searchParams.get("offset"));
          const count = adult ? 1 : offset === 0 ? 40 : 1;
          return ok({ total: adult ? 1 : 41, posts: Array.from({ length: count }, (_, i) => ({
            id: adult ? 500 : offset + i + 1, character_name: adult ? "Synthetic Restricted Card" : i === 0 && offset === 0 ? "Fixture Explorer" : "Fixture " + (offset + i + 1), filename: "fixture.png",
            tagline: "A harmless fixture.", token_count: 900, tags: adult ? [{ name: "horror", category: state.account.showNsfl ? "NSFL" : "General" }] : [{ name: "sfw", category: "Meta" }, { name: "Fantasy", category: "General" }, { name: "fixture", category: "Writer" }],
          })) });
        }
        throw new Error("Missing synthetic route");
      },
    };
  }, { card, png, options });
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  await expect(page.getByTestId("cb-account").getByRole("button", { name: "Refresh Account" })).toBeEnabled();
}
async function signIn(page: Page, nsfl = true) {
  await page.evaluate((showNsfl) => {
    const state = (globalThis as { __bb?: { account: { username: string | null; showNsfw: boolean; showNsfl: boolean } } }).__bb!;
    state.account = { username: "fixture-account", showNsfw: true, showNsfl };
  }, nsfl);
  await page.getByRole("button", { name: "Refresh Account" }).click();
  await expect(page.getByTestId("cb-account")).toContainText("Signed in as fixture-account");
}
test("BotBooru: public paging, server filters, full details, original PNG import and source metadata", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("cb-card")).toHaveCount(40);
  await expect(page.getByTestId("cb-nsfw").getByRole("switch")).toBeDisabled();
  await page.getByTestId("cb-load-more").click();
  await expect(page.getByTestId("cb-card")).toHaveCount(41);
  await page.getByTestId("cb-search").fill("knight -male");
  await expect.poll(() => page.evaluate(() => (globalThis as { __bb?: { calls: string[] } }).__bb!.calls.some((u) => u.includes("q=-male") && u.includes("qtext=knight")))).toBe(true);
  await page.getByTestId("cb-card").first().click();
  await expect(page.getByTestId("cb-sheet")).toContainText(card.data.description);
  await expect(page.getByTestId("cb-sheet")).toContainText("Lorebook");
  await page.getByTestId("cb-add").click();
  await expect(page.getByTestId("notice")).toContainText("Added Fixture Explorer to Characters");
  const saved = await page.evaluate(async () => {
    const path = "/src/core-instance.ts";
    const { servicesReady } = await import(/* @vite-ignore */ path);
    const { store } = await servicesReady;
    const rows = await store.listCharacters();
    const c = rows.find((x: { source?: { site: string } }) => x.source?.site === "botbooru");
    return { c, avatar: c ? !!(await store.getAvatar(c.id)) : false };
  });
  expect(saved.c).toMatchObject({ description: card.data.description, personality: "Patient.", source: { site: "botbooru", id: "1", url: "https://botbooru.com/character/1" }, firstMessages: ["Welcome.", "Come in."] });
  expect(saved.c.lorebookIds).toHaveLength(1); expect(saved.avatar).toBe(true);
});
test("BotBooru: account preferences gate NSFW/NSFL; logout clears adult results and the open sheet", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Account…" }).click();
  expect(await page.evaluate(() => (globalThis as { __bb?: { opened: number } }).__bb!.opened)).toBe(1);
  await signIn(page);
  await expect(page.getByTestId("cb-account")).toContainText("NSFL: On");
  await page.getByTestId("cb-nsfw").getByRole("switch").click();
  await expect(page.getByTestId("cb-card")).toHaveCount(1);
  await expect(page.getByTestId("cb-card")).toContainText("NSFL");
  await page.getByTestId("cb-card").click();
  await expect(page.getByTestId("cb-sheet")).toBeVisible();
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await expect(page.getByTestId("cb-nsfw").getByRole("switch")).toBeDisabled();
  await expect(page.getByTestId("cb-nsfw").getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("cb-sheet")).toHaveCount(0);
  await expect(page.getByTestId("cb-card")).toHaveCount(40);
  await expect(page.getByTestId("cb-grid")).not.toContainText("Synthetic Restricted Card");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("fixture-account");
});
test("BotBooru: a focus refresh keeps the selection when account permissions are unchanged", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("cb-card")).toHaveCount(40);
  await page.getByTestId("cb-card").first().click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("cb-sheet")).toBeVisible();
  await signIn(page, false);
  await expect(page.getByTestId("cb-account")).toContainText("NSFL: Off");
  await page.getByTestId("cb-nsfw").getByRole("switch").click();
  await expect(page.getByTestId("cb-card")).toHaveCount(1);
  await expect(page.getByTestId("cb-card")).toContainText("NSFW");
});
test("BotBooru: refreshing the account does not bypass a rate-limit pause", async ({ page }) => {
  await open(page, { pause: true });
  await expect(page.getByTestId("cb-notice")).toContainText("BotBooru asked this app to slow down");
  const before = await page.evaluate(() => (globalThis as { __bb?: { calls: string[] } }).__bb!.calls.filter((u) => new URL(u).pathname === "/posts/").length);
  await page.getByRole("button", { name: "Refresh Account" }).click();
  await expect(page.getByTestId("cb-notice")).toContainText("slow down");
  const after = await page.evaluate(() => (globalThis as { __bb?: { calls: string[] } }).__bb!.calls.filter((u) => new URL(u).pathname === "/posts/").length);
  expect(after).toBe(before);
});
test("BotBooru: account controls wrap within a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await open(page);
  await signIn(page);
  await expect(page.getByRole("button", { name: "Account…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign Out", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
