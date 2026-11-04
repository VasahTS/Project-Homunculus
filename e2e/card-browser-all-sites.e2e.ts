// All Sites uses synthetic catalog responses. CODEX, 2026-11-04.
import { expect, test, type Page } from "@playwright/test";

type FixtureState = {
  requests: string[];
  releaseWyvern: boolean;
  wyvernReleased: boolean;
  releaseJanny: boolean;
  jannyReleased: boolean;
  account: { username: string | null; showNsfw: boolean; showNsfl: boolean };
};

async function open(page: Page, options: { slowWyvern?: boolean; slowJanny?: boolean; paging?: boolean } = {}) {
  await page.addInitScript((o) => {
    const state: FixtureState = { requests: [], releaseWyvern: !o.slowWyvern, wyvernReleased: false, releaseJanny: !o.slowJanny, jannyReleased: false, account: { username: null, showNsfw: false, showNsfl: false } };
    Object.assign(globalThis, { __allSites: state });
    const ok = (data: unknown) => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text: JSON.stringify(data) });
    let wyvernFailed = false;
    Object.assign(globalThis, { __h2FakeCardSites: {
      async botbooruAccount(action: string) {
        if (action === "logout") state.account = { username: null, showNsfw: false, showNsfl: false };
        return { ...state.account };
      },
      async request(r: { url: string; expect: string; body?: string }) {
        if (r.expect === "image") throw new Error("No fixture picture");
        const u = new URL(r.url);
        const number = Number(u.searchParams.get("page") || 1);
        if (u.host === "api.chub.ai" && u.pathname === "/search") {
          state.requests.push(`chub:${number}:${u.searchParams.get("search")}`);
          const nodes = [{ fullPath: String(number), name: `Chub ${number}`, nsfw: false }];
          if (!o.paging) nodes.push({ fullPath: "adult", name: "Chub Adult", nsfw: true });
          return ok({ data: { nodes, cursor: o.paging && number < 3 ? "next" : null } });
        }
        if (u.host === "jannyai.com") {
          state.requests.push("janny:bootstrap");
          while (!state.releaseJanny) await new Promise((resolve) => setTimeout(resolve, 20));
          state.jannyReleased = true;
          return { ...ok(null), text: "<html></html>" };
        }
        if (u.host === "search.jannyai.com") {
          const q = JSON.parse(r.body ?? "{}").queries[0];
          state.requests.push(`janny:${q.page}:${q.q}`);
          return ok({ results: [{ hits: [{ id: "1", name: "Janny 1" }], totalPages: 1 }] });
        }
        if (u.host === "api.wyvern.chat") {
          const text = u.searchParams.get("q") || "";
          state.requests.push(`wyvern:${number}:${text}`);
          while (!state.releaseWyvern && text !== "new") await new Promise((resolve) => setTimeout(resolve, 20));
          if (!text) state.wyvernReleased = true;
          if (o.paging && number === 2 && !wyvernFailed) { wyvernFailed = true; return { ...ok(null), status: 500 }; }
          return ok({ results: [{ id: String(number), name: text ? `Wyvern ${text}` : `Wyvern ${number}` }], hasMore: o.paging && number < 2 });
        }
        if (u.host === "server.pygmalion.chat") {
          if (u.pathname.endsWith("/Character")) return ok({ character: { id: "1", displayName: "Pygmalion 1", personality: { persona: "Pygmalion definition." } } });
          state.requests.push("pygmalion");
          return ok({ totalItems: 1, characters: [{ id: "1", displayName: "Pygmalion 1" }] });
        }
        if (u.host === "datacat.run") {
          if (u.pathname.endsWith("identify")) return ok({ success: true, sessionToken: "fixture" });
          if (u.pathname.endsWith("faceted")) return ok({ tags: [] });
          state.requests.push("datacat");
          return ok({ characters: [{ id: "1", name: "DataCat 1" }], hasMore: false });
        }
        if (u.host === "botbooru.com") {
          const safe = u.searchParams.has("sfw_only");
          state.requests.push(`botbooru:${safe ? "sfw" : "nsfw"}`);
          const posts = [{ id: 1, character_name: "BotBooru 1", tags: [{ name: "sfw" }] }];
          if (!safe) posts.push({ id: 2, character_name: "BotBooru Adult", tags: [] }, { id: 3, character_name: "BotBooru NSFL", tags: [{ name: "nsfl" }] });
          return ok({ posts, total: posts.length });
        }
        throw new Error(`Missing fixture route for ${u.host}`);
      },
    } });
  }, options);
  await page.goto("/");
  await enterBrowser(page);
  await expect(page.getByTestId("cb-card").first()).toBeVisible();
  await pick(page, "All Sites");
}

const requests = (page: Page) => page.evaluate(() => (globalThis as typeof globalThis & { __allSites: FixtureState }).__allSites.requests);
const enterBrowser = (page: Page) => page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
async function pick(page: Page, name: string) {
  await page.getByTestId("cb-source").click();
  await page.getByRole("menuitemradio", { name: new RegExp(`^${name}`) }).click();
}

test("All Sites mixes catalogs, keeps equal IDs distinct, and remembers its own NSFW setting", async ({ page }) => {
  await open(page);
  const cards = page.getByTestId("cb-card");
  const nsfw = page.getByRole("switch", { name: "NSFW", exact: true });
  await expect(nsfw).toHaveAttribute("aria-checked", "true");
  await expect(cards).toHaveCount(6);
  expect(await requests(page)).not.toContain("datacat");
  await page.getByRole("button", { name: "Include DataCat" }).click();
  await expect(cards).toHaveCount(7);
  await expect(cards.locator(".gallery-by")).toHaveText(["ChubAI · by 1", "JannyAI", "Wyvern", "Pygmalion", "DataCat", "BotBooru", "ChubAI · by adult"]);

  await cards.getByText("Pygmalion 1", { exact: true }).click();
  await expect(page.getByTestId("cb-sheet")).toContainText("Pygmalion definition.");
  await expect(page.getByRole("button", { name: "Open on Pygmalion" })).toBeVisible();
  await page.getByTestId("cb-add").click();
  await expect(page.getByTestId("notice")).toContainText("Added Pygmalion 1 to Characters");
  await expect(cards.filter({ hasText: "Pygmalion 1" }).getByLabel("In your Characters")).toBeVisible();

  await nsfw.click();
  await expect(cards).toHaveCount(5);
  await expect(cards.filter({ hasText: /Chub Adult|DataCat 1/ })).toHaveCount(0);
  await page.reload();
  await enterBrowser(page);
  await expect(page.getByTestId("cb-source")).toContainText("All Sites");
  await expect(nsfw).toHaveAttribute("aria-checked", "false");
  await expect(cards).toHaveCount(5);
  expect(await requests(page)).not.toContain("datacat");
  await pick(page, "ChubAI");
  await nsfw.click();
  await expect(nsfw).toHaveAttribute("aria-checked", "true");
  await pick(page, "All Sites");
  await expect(nsfw).toHaveAttribute("aria-checked", "false");
  await nsfw.click();
  await expect(cards.filter({ hasText: "DataCat 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Include DataCat" })).toHaveCount(0);
});

test("All Sites paginates working catalogs and retries a failed page independently", async ({ page }) => {
  await open(page, { paging: true });
  const cards = page.getByTestId("cb-card");
  const more = page.getByTestId("cb-load-more");
  await expect(cards).toHaveCount(5);
  await more.click();
  await expect(cards.filter({ hasText: "Chub 2" })).toBeVisible();
  await expect(page.getByTestId("cb-site-errors")).toContainText("Wyvern");
  await more.click();
  await expect(cards.filter({ hasText: "Chub 3" })).toBeVisible();
  await page.getByRole("button", { name: "Retry Failed Sites" }).click();
  await expect(cards.filter({ hasText: "Wyvern 2" })).toBeVisible();
  await expect(cards).toHaveCount(8);
  await expect(more).toHaveCount(0);
  await expect(page.getByTestId("cb-site-errors")).toHaveCount(0);
  const seen = await requests(page);
  expect(seen.filter((r) => r.startsWith("wyvern:"))).toEqual(["wyvern:1:", "wyvern:2:", "wyvern:2:"]);
  expect(seen.filter((r) => r.startsWith("chub:"))).toEqual(["chub:1:", "chub:1:", "chub:2:", "chub:3:"]);
  expect(seen.filter((r) => r.startsWith("janny:1:"))).toEqual(["janny:1:"]);
});

test("leaving All Sites stops follow-up requests for the old search", async ({ page }) => {
  await open(page, { slowJanny: true });
  await expect.poll(() => requests(page)).toContain("janny:bootstrap");
  await pick(page, "ChubAI");
  await expect(page.getByTestId("cb-card")).toHaveCount(2);
  await page.evaluate(() => { (globalThis as typeof globalThis & { __allSites: FixtureState }).__allSites.releaseJanny = true; });
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __allSites: FixtureState }).__allSites.jannyReleased)).toBe(true);
  expect(await requests(page)).not.toContain("janny:1:");
});

test("All Sites shows fast results, discards late searches, and respects BotBooru account permissions", async ({ page }) => {
  await open(page, { slowWyvern: true });
  const cards = page.getByTestId("cb-card");
  await expect(cards.filter({ hasText: "Chub 1" })).toBeVisible();
  await expect(page.getByTestId("cb-grid")).toHaveAttribute("aria-busy", "true");
  await expect.poll(() => requests(page)).toContain("wyvern:1:");
  await page.getByTestId("cb-search").fill("new");
  await expect(cards.filter({ hasText: "Wyvern new" })).toBeVisible();
  await page.evaluate(() => { (globalThis as typeof globalThis & { __allSites: FixtureState }).__allSites.releaseWyvern = true; });
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __allSites: FixtureState }).__allSites.wyvernReleased)).toBe(true);
  await expect(cards.filter({ hasText: "Wyvern 1" })).toHaveCount(0);
  expect(await requests(page)).not.toContain("botbooru:nsfw");

  await page.evaluate(() => {
    (globalThis as typeof globalThis & { __allSites: FixtureState }).__allSites.account = { username: "fixture", showNsfw: true, showNsfl: false };
  });
  await page.getByRole("button", { name: "Refresh Account" }).click();
  const restricted = cards.filter({ hasText: "BotBooru Adult" });
  await expect(restricted).toBeVisible();
  await expect(cards.filter({ hasText: "BotBooru NSFL" })).toHaveCount(0);
  await restricted.click();
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await expect(restricted).toHaveCount(0);
  await expect(page.getByTestId("cb-sheet")).toHaveCount(0);
  await expect(cards.filter({ hasText: "BotBooru 1" })).toBeVisible();
});
