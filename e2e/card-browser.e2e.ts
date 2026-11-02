// Click tests of the Card Browser (UI-PLAN "Card Browser", D-081). The browser preview has no web: a fake set of card sites is
// injected (as assistant-web.e2e does), so no site is contacted. CLAUDE, 2026-11-02.
import { expect, test, type Page } from "@playwright/test";

/** A fake ChubAI and Pygmalion: 48 elves per page (so Load More shows), details, pictures; card files are "not a card" so one is built. */
async function fakeSites(page: Page, opts: { pause?: boolean } = {}) {
  await page.addInitScript((o) => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const ok = (text: string) => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text });
    const calls: string[] = [];
    (globalThis as { __cbCalls?: string[] }).__cbCalls = calls;
    (globalThis as { __h2FakeCardSites?: unknown }).__h2FakeCardSites = {
      async request(r: { url: string; expect: string }) {
        calls.push(r.url);
        const u = new URL(r.url);
        if (r.expect === "image") return { status: 200, finalUrl: r.url, contentType: "image/png", cfMitigated: false, bytes: png, mime: "image/png" };
        if (r.expect === "card") throw new Error("The card site did not return a PNG with a chara or ccv3 text chunk.");
        if (u.host === "api.chub.ai" && u.pathname === "/search") {
          if (o.pause) return { status: 429, finalUrl: r.url, contentType: "text/html", cfMitigated: false, text: "slow down" };
          const q = u.searchParams.get("search") ?? "";
          const pageNo = Number(u.searchParams.get("page"));
          if (q === "nothing") return ok(JSON.stringify({ data: { count: 0, nodes: [] } }));
          const nodes = Array.from({ length: 48 }, (_, i) => {
            const n = (pageNo - 1) * 48 + i + 1;
            return { fullPath: `anna/elf-${n}`, name: n === 1 ? "Elf Queen" : `Elf ${n}`, tagline: "Rules the <b>woods</b>", topics: ["Fantasy", "Elf"], starCount: 100 + n, nTokens: 1500, nsfw: n === 2 };
          });
          return ok(JSON.stringify({ data: { count: 96, nodes } }));
        }
        if (u.host === "api.chub.ai" && u.pathname.startsWith("/api/characters/")) {
          const name = u.pathname.endsWith("elf-1") ? "Elf Queen" : "Elf";
          return ok(JSON.stringify({ node: { definition: { name, personality: "Proud and old.", scenario: "A court of silver trees.", first_message: "Kneel, traveller.", alternate_greetings: ["Rise."], description: "Made with care. https://example.com/notes", embedded_lorebook: { entries: [{ keys: ["court"], content: "The court is old.", id: 0 }] } } } }));
        }
        if (u.host === "datacat.run" && u.pathname === "/api/liberator/identify") return ok(JSON.stringify({ success: true, sessionToken: "s" }));
        if (u.host === "datacat.run" && u.pathname === "/api/tags/faceted") return ok(JSON.stringify({ success: true, tags: [{ id: 3, name: "Female" }] }));
        if (u.host === "datacat.run" && u.pathname === "/api/characters/recent-public") return ok(JSON.stringify({ success: true, totalCount: 1, hasMore: false, characters: [{ characterId: "d-1", name: "Rook", creatorName: "kit", description: "A card", totalTokens: 2000 }] }));
        if (u.host === "server.pygmalion.chat") return ok(JSON.stringify({ totalItems: "1", characters: [{ id: "p-1", displayName: "Monika", description: "Club president", avatarUrl: "https://assets.pygmalion.chat/m.png" }] }));
        throw new Error(`no fake for ${r.url}`);
      },
    };
  }, opts);
}

test("Card Browser: sidebar place, search, Load More, tags, sheet, Add to Characters into From the Web, then Chat Now", async ({ page }) => {
  await fakeSites(page);
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  const browser = page.getByTestId("card-browser");
  await expect(browser.getByRole("heading", { name: "96 cards" })).toBeVisible();
  const cards = browser.getByTestId("cb-card");
  await expect(cards).toHaveCount(48);
  await expect(cards.nth(1)).toContainText("NSFW");

  // Load More appends the next page
  await browser.getByTestId("cb-load-more").click();
  await expect(cards).toHaveCount(96);

  // tags: must have + hide, shown as chips; clearing them
  await browser.getByTestId("cb-tags").click();
  const panel = page.getByTestId("cb-tag-panel");
  await panel.getByRole("button", { name: "Fantasy", exact: true }).click();
  await panel.getByRole("button", { name: "Hide Horror" }).click();
  await page.keyboard.press("Escape");
  const chips = page.getByTestId("cb-chips");
  await expect(chips).toContainText("Fantasy");
  await expect(chips).toContainText("− Horror");
  await expect.poll(() => page.evaluate(() => (globalThis as { __cbCalls?: string[] }).__cbCalls!.some((u) => u.includes("topics=Fantasy") && u.includes("excludetopics=Horror")))).toBe(true);
  await chips.getByRole("button", { name: "Clear All" }).click();
  await expect(chips).toHaveCount(0);

  // the sheet: details, greetings, Add
  await cards.first().click();
  const sheet = page.getByTestId("cb-sheet");
  await expect(sheet).toContainText("Elf Queen");
  await expect(sheet).toContainText("Proud and old.");
  await expect(sheet).toContainText("Lorebook");
  await expect(sheet).toContainText("2 Greetings");
  await sheet.getByRole("button", { name: "Next greeting" }).click();
  await expect(sheet).toContainText("Rise.");
  await expect(sheet.getByTestId("cb-folder")).toHaveValue("web");
  await sheet.getByTestId("cb-add").click();
  await expect(page.locator(".notice")).toContainText("Added Elf Queen to Characters");
  await expect(page.locator(".notice")).toContainText("embedded lorebook");
  await expect(sheet.getByTestId("cb-chat")).toBeVisible();
  await expect(sheet.getByTestId("cb-in")).toContainText("In your Characters");
  await expect(cards.first().getByLabel("In your Characters")).toBeVisible();

  // it is in Characters, in From the Web, with its tags
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  await expect(page.getByRole("button", { name: /From the Web/ }).first()).toBeVisible();
  await page.getByRole("searchbox", { name: "Search characters" }).or(page.getByRole("textbox", { name: "Search characters" })).fill("Elf Queen");
  await page.getByTestId("character-list").getByRole("button", { name: "Elf Queen" }).click();
  await expect(page.getByTestId("character-sheet")).toContainText("Fantasy");

  // coming back keeps the place (the search after Clear All: page 1); the card now opens in Characters
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  await expect(cards).toHaveCount(48);
  await cards.first().click();
  await expect(page.getByTestId("cb-open")).toBeVisible();
  await page.getByTestId("cb-sheet").getByRole("button", { name: "More" }).click();
  await page.getByTestId("cb-add-again").click();
  await expect(page.locator(".notice")).toContainText("Added Elf Queen to Characters");
});

test("Card Browser: Import Tags off, another folder, empty results, source switch keeps the search, Ctrl+K", async ({ page }) => {
  await fakeSites(page);
  await page.goto("/");
  await expect(page.getByTestId("place-list")).toBeVisible();
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("palette");
  await palette.getByRole("combobox", { name: "Open anything" }).fill("Card Browser");
  await palette.getByRole("group", { name: "Go to" }).getByRole("option", { name: /Card Browser/ }).click();
  const browser = page.getByTestId("card-browser");
  await expect(browser.getByTestId("cb-card")).toHaveCount(48);
  await browser.getByTestId("cb-card").nth(4).click();
  const sheet = page.getByTestId("cb-sheet");
  await sheet.getByRole("switch", { name: "Import Tags" }).click();
  await sheet.getByTestId("cb-folder").selectOption("");
  await sheet.getByTestId("cb-add").click();
  await expect(page.locator(".notice")).toContainText("Added Elf to Characters");

  await browser.getByTestId("cb-search").fill("nothing");
  await expect(page.getByTestId("cb-empty")).toContainText("Nothing on ChubAI matches “nothing”.");
  await browser.getByTestId("cb-source").click();
  await page.getByRole("menuitemradio", { name: /Pygmalion/ }).click();
  await expect(browser.getByTestId("cb-search")).toHaveValue("nothing");
  await expect(browser.getByTestId("cb-nsfw").getByRole("switch")).toBeDisabled();
  await expect(browser.getByTestId("cb-card")).toHaveCount(1);
  await expect(browser.getByTestId("cb-card")).toContainText("Monika");
});

test("Card Browser: a site pausing us shows its message with Open and Import a Downloaded File", async ({ page }) => {
  await fakeSites(page, { pause: true });
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  const notice = page.getByTestId("cb-notice");
  await expect(notice).toContainText("ChubAI asked this app to slow down");
  await expect(notice.getByRole("button", { name: "Open ChubAI" })).toBeVisible();
  await expect(notice.getByRole("button", { name: "Import a Downloaded File…" })).toBeVisible();
});

test("Card Browser: the browser preview without a fake says it works in the desktop app", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  await expect(page.getByTestId("cb-notice")).toContainText("The Card Browser works in the desktop app.");
});

test("Card Browser: DataCat asks once that it is adult only; Back stays, Continue switches and the NSFW switch is locked on", async ({ page }) => {
  await fakeSites(page);
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  const browser = page.getByTestId("card-browser");
  await expect(browser.getByTestId("cb-card")).toHaveCount(48);
  const pick = async () => { await browser.getByTestId("cb-source").click(); await page.getByRole("menuitemradio", { name: /DataCat/ }).click(); };
  await pick();
  const ask = page.getByTestId("cb-adult");
  await expect(ask).toContainText("DataCat lists adult cards only.");
  await ask.getByRole("button", { name: "Back" }).click();
  await expect(ask).toBeHidden();
  await expect(browser.getByTestId("cb-source")).toContainText("ChubAI");
  await pick();
  await page.getByTestId("cb-adult").getByRole("button", { name: "Continue" }).click();
  await expect(browser.getByTestId("cb-source")).toContainText("DataCat");
  await expect(browser.getByTestId("cb-card")).toHaveCount(1);
  await expect(browser.getByTestId("cb-card")).toContainText("Rook");
  const nsfw = browser.getByTestId("cb-nsfw").getByRole("switch");
  await expect(nsfw).toBeDisabled();
  await expect(nsfw).toHaveAttribute("aria-checked", "true");
  // asked only once
  await browser.getByTestId("cb-source").click(); await page.getByRole("menuitemradio", { name: /ChubAI/ }).click();
  await pick();
  await expect(page.getByTestId("cb-adult")).toHaveCount(0);
  await expect(browser.getByTestId("cb-source")).toContainText("DataCat");
});
