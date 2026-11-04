// Card Browser pictures: the grid shows the site's real picture shrunk to fit, the sheet shows it full size; the sheet closes
// at every width and no empty pane is left. CLAUDE, 2026-11-03 (Daniel: "images in horrible quality, square").
import { expect, test } from "@playwright/test";

test("ChubAI cards use the full picture: shrunk in the grid, full size in the sheet; the sheet closes", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (globalThis as { __cbCalls?: string[] }).__cbCalls = calls;
    // A tall portrait, like a real chara_card_v2.png (ChubAI's avatar.webp is a 200×200 square crop).
    const tall = (async () => {
      const c = new OffscreenCanvas(900, 1500);
      const g = c.getContext("2d")!; g.fillStyle = "#c86"; g.fillRect(0, 0, 900, 1500); g.fillStyle = "#246"; g.fillRect(0, 1200, 900, 300);
      return new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer());
    })();
    const ok = (text: string) => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text });
    (globalThis as { __h2FakeCardSites?: unknown }).__h2FakeCardSites = {
      async request(r: { url: string; expect: string }) {
        calls.push(r.url);
        const u = new URL(r.url);
        if (r.expect === "image") {
          if (r.url.endsWith("/avatar.webp")) throw new Error("the small square crop must not be used");
          return { status: 200, finalUrl: r.url, contentType: "image/png", cfMitigated: false, bytes: await tall, mime: "image/png" };
        }
        if (u.host === "api.chub.ai" && u.pathname === "/search") {
          return ok(JSON.stringify({ data: { count: 2, nodes: [1, 2].map((n) => ({ fullPath: `anna/elf-${n}`, name: `Elf ${n}`, tagline: "", topics: [], nTokens: 900 })) } }));
        }
        if (u.host === "api.chub.ai" && u.pathname.startsWith("/api/characters/")) return ok(JSON.stringify({ node: { definition: { name: "Elf", personality: "Old.", first_message: "Hello." } } }));
        throw new Error(`no fake for ${r.url}`);
      },
    };
  });
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  const browser = page.getByTestId("card-browser");
  const cards = browser.getByTestId("cb-card");
  await expect(cards).toHaveCount(2);

  // no card open: no sheet beside the grid
  await expect(browser.locator("[data-region=sheet]")).toBeHidden();

  // grid: the real picture, shrunk (no larger than a card needs on a 2× screen)
  const thumb = cards.first().locator("img.card-pic");
  await expect(thumb).toHaveJSProperty("complete", true);
  await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalHeight)).toBe(720);

  // sheet: the same picture at full size, its own shape
  await cards.first().click();
  const sheet = browser.getByTestId("cb-sheet");
  const big = sheet.locator("img.vs-pic");
  await expect.poll(() => big.evaluate((i: HTMLImageElement) => i.naturalHeight)).toBe(1500);
  const box = await big.boundingBox();
  expect(box!.height / box!.width).toBeGreaterThan(1.5);
  const calls = await page.evaluate(() => (globalThis as { __cbCalls?: string[] }).__cbCalls ?? []);
  expect(calls.some((c) => c.endsWith("/anna/elf-1/chara_card_v2.png"))).toBe(true);

  // the sheet closes on a wide window too, and the grid takes the space back
  const before = (await browser.locator(".gallery-grid").boundingBox())!.width;
  await browser.getByRole("button", { name: "Close" }).click();
  await expect(browser.locator("[data-region=sheet]")).toBeHidden();
  expect((await browser.locator(".gallery-grid").boundingBox())!.width).toBeGreaterThan(before);

  // the reading view (D-082): full window, ← → change card, Back to Preview returns to the sheet
  await cards.first().click();
  await browser.getByTestId("cb-read").click();
  const reader = page.getByTestId("card-reader");
  await expect(reader.getByRole("heading", { name: "Elf 1" })).toBeVisible();
  await expect(reader.getByText("Hello.")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(reader.getByRole("heading", { name: "Elf 2" })).toBeVisible();
  await reader.getByTestId("reader-back").click();
  await expect(reader).toHaveCount(0);
  await expect(browser.getByTestId("cb-sheet")).toContainText("Elf 2");
});

// Slow downloads expose the queue shared across catalog searches. CODEX, 2026-11-04.
test("a new search drops queued old pictures and opening a card prioritizes a single shared download", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { requests: [] as string[], releaseOld: false };
    const canvas = new OffscreenCanvas(12, 24);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#346";
    context.fillRect(0, 0, 12, 24);
    const portrait = canvas.convertToBlob().then(async (blob) => new Uint8Array(await blob.arrayBuffer()));
    const ok = { status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false };
    Object.assign(globalThis, { __cbQueue: state, __h2FakeCardSites: {
      async request(r: { url: string; expect: string }) {
        const url = new URL(r.url);
        if (r.expect === "image") {
          state.requests.push(url.pathname);
          while (url.pathname.includes("/old-") && !state.releaseOld) await new Promise((resolve) => setTimeout(resolve, 20));
          return { ...ok, bytes: await portrait, mime: "image/png" };
        }
        if (url.pathname === "/search") {
          const nodes = url.searchParams.get("search")
            ? [{ fullPath: "fixture/new", name: "New portrait" }, { fullPath: "fixture/another", name: "Another portrait" }]
            : Array.from({ length: 30 }, (_, i) => ({ fullPath: `fixture/old-${i}`, name: `Old portrait ${i}` }));
          return { ...ok, text: JSON.stringify({ data: { nodes } }) };
        }
        return { ...ok, text: JSON.stringify({ node: { definition: { first_message: "Hello." } } }) };
      },
    } });
  });
  const requests = () => page.evaluate(() => (globalThis as typeof globalThis & { __cbQueue: { requests: string[] } }).__cbQueue.requests);
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  await expect(page.getByTestId("cb-card")).toHaveCount(30);
  await expect.poll(async () => (await requests()).length).toBe(4);

  await page.getByTestId("cb-search").fill("new");
  const card = page.getByTestId("cb-card").filter({ hasText: "New portrait" });
  await card.click();
  await expect(page.getByTestId("cb-sheet").locator("img.vs-pic")).toHaveJSProperty("naturalHeight", 24);

  await page.evaluate(() => { (globalThis as typeof globalThis & { __cbQueue: { releaseOld: boolean } }).__cbQueue.releaseOld = true; });
  await expect(card.locator("img.card-pic")).toHaveJSProperty("naturalHeight", 24);
  await expect(page.getByTestId("cb-card").filter({ hasText: "Another portrait" }).locator("img.card-pic")).toHaveJSProperty("naturalHeight", 24);
  const seen = await requests();
  expect(seen.filter((path) => path.includes("/old-"))).toHaveLength(4);
  expect(seen.filter((path) => path.includes("/new/"))).toHaveLength(1);
});
