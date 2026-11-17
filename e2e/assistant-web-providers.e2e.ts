// Click tests of Assistant → Customize → Web Search (D-148): the order (↑ ↓, on/off, remove, add), the Exa key (saved,
// adds Exa (API Key) to the top), NanoGPT without a connection, the fallback label in a reply, and the look in two
// themes. The browser preview has no web: a fake one is injected, so no site is contacted. Author: CLAUDE, 2026-11-17.
import { expect, test, type Page } from "@playwright/test";

const EXA = "Title: Fern - Wikipedia\nURL: https://en.wikipedia.org/wiki/Fern\nHighlights:\nFern is an apprentice.";

async function fakeWeb(page: Page, o: { ddgLimited?: boolean } = {}) {
  await page.addInitScript(([text, limited]) => {
    (globalThis as { __h2FakeWeb?: unknown }).__h2FakeWeb = {
      searchPage: async () => ({ status: 200, html: limited ? '<div id="anomaly-modal"></div>' : '<div class="result results_links"><a class="result__a" href="https://a.example/x">From DuckDuckGo</a></div>' }),
      get: async (url: string) => ({ status: 200, finalUrl: url, contentType: "text/plain", body: "text", cut: false }),
      api: async () => ({ status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } }) }),
    };
  }, [EXA, !!o.ddgLimited] as const);
}
async function openWebSettings(page: Page) {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await page.getByTestId("assistant-customize").click();
  await page.getByTestId("cust-web").click();
  await expect(page.getByTestId("web-search-settings")).toBeVisible();
}
const rowNames = (page: Page) => page.getByTestId("web-order-row").locator(".web-row-t b").allTextContents();

test("Web Search settings: the order, the Exa key, NanoGPT without a connection", async ({ page }) => {
  await fakeWeb(page);
  await openWebSettings(page);
  expect(await rowNames(page)).toEqual(["DuckDuckGo", "Exa (Free)"]);
  // ↑ moves Exa (Free) first; the switch turns DuckDuckGo off
  await page.getByRole("button", { name: "Move Exa (Free) up" }).click();
  expect(await rowNames(page)).toEqual(["Exa (Free)", "DuckDuckGo"]);
  await page.getByRole("switch", { name: "DuckDuckGo" }).click();
  await expect(page.getByTestId("web-order-row").nth(1)).toHaveClass(/off/);

  // the Exa key: saved (preview: kept until the app closes) and Exa (API Key) goes to the top of the order
  await page.getByTestId("web-provider-pick").selectOption("exa-key");
  await page.getByRole("textbox", { name: "Exa API key" }).fill("exa-test-key");
  await page.getByTestId("web-provider-setup").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("web-provider-setup")).toContainText("A key is saved");
  expect(await rowNames(page)).toEqual(["Exa (API Key)", "Exa (Free)", "DuckDuckGo"]);
  await expect(page.getByTestId("web-order-row").first()).not.toContainText("skipped");

  // NanoGPT with no NanoGPT connection: added, but marked as skipped
  await page.getByTestId("web-add-provider").selectOption("nanogpt");
  await expect(page.getByTestId("web-order-row").last()).toContainText("No NanoGPT connection · skipped");
  await page.getByRole("button", { name: "Remove NanoGPT" }).click();
  expect(await rowNames(page)).toEqual(["Exa (API Key)", "Exa (Free)", "DuckDuckGo"]);

  // kept after leaving and coming back; Options shows the first provider
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("assistant-options").click();
  await expect(page.locator(".asst-opt-row", { has: page.getByTestId("pick-web") })).toContainText("Exa (API Key)");
});

test("a reply that DuckDuckGo couldn't answer says Exa answered", async ({ page }) => {
  await fakeWeb(page, { ddgLimited: true });
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Search the web for Fern");
  await page.getByTestId("assistant-send").click();
  const reply = page.getByTestId("assistant-reply").last();
  await expect(reply.getByTestId("assistant-steps")).toContainText("Searched the web: “Fern” · 1 result · Exa (Free) (DuckDuckGo skipped)");
  await expect(reply.getByTestId("assistant-sources")).toContainText("1 source");
});

for (const theme of ["Mono", "Observatory"]) {
  test(`Web Search settings follow the theme (${theme})`, async ({ page }) => {
    await fakeWeb(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByTestId("settings-customize").click();
    await page.getByRole("radio", { name: theme }).click();
    await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
    await page.getByTestId("assistant-customize").click();
    await page.getByTestId("cust-web").click();
    const card = page.getByTestId("web-search-settings").locator(".web-card").first();
    // the card takes the theme's own group color (whatever it is), not a fixed one
    const [bg, group] = await card.evaluate((el) => {
      const probe = document.createElement("div"); probe.style.background = "var(--group)"; document.body.append(probe);
      const want = getComputedStyle(probe).backgroundColor; probe.remove();
      return [getComputedStyle(el).backgroundColor, want];
    });
    expect(bg).toBe(group);
    await page.getByTestId("web-search-settings").screenshot({ path: `e2e/.results/web-search-${theme.toLowerCase()}.png` });
  });
}
