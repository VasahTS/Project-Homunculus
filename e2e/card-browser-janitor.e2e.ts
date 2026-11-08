// Click tests of JanitorAI in the Card Browser (D-098). A fake JanitorAI (and its window's account) is injected, so no site is
// contacted: guest line, Sign In… opens the window, a public card is added with its lorebook, a hidden one can't be added,
// signing in/out searches again, Cloudflare offers Open JanitorAI + Try Again, All Sites leaves JanitorAI out. CLAUDE, 2026-11-08.
import { expect, test, type Page } from "@playwright/test";

async function fakeJanitor(page: Page, opts: { challenge?: boolean } = {}) {
  await page.addInitScript((o) => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const ok = (data: unknown) => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text: JSON.stringify(data) });
    const state = { user: null as string | null, actions: [] as string[], calls: [] as string[], challenge: o.challenge === true };
    (globalThis as { __janitor?: unknown }).__janitor = state;
    const base = { creator_name: "kit", description: "<p>A short bio.</p>", avatar: "a.webp", tagIds: [53], is_nsfw: false, totalToken: 900, stats: { chat: 5 } };
    const open = { ...base, id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Open Keeper", showdefinition: true, personality: "Keeps the lighthouse.", scenario: "A storm.", first_message: "Hello.", first_messages: ["Hello.", "Again?"],
      scripts: [{ type: "lorebook", id: "bbbbbbbb-0000-4000-8000-000000000001", title: "Coast", is_public: true }] };
    const hidden = { ...base, id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Hidden Keeper", showdefinition: false, personality: "", scenario: "", first_message: "Psst." };
    (globalThis as { __h2FakeCardSites?: unknown }).__h2FakeCardSites = {
      async janitorAccount(action: string) {
        state.actions.push(action);
        if (action === "logout") state.user = null;
        return { username: state.user };
      },
      async request(r: { url: string; method: string; expect: string }) {
        state.calls.push(r.method + " " + r.url);
        const u = new URL(r.url);
        if (r.expect === "image") return { status: 200, finalUrl: r.url, contentType: "image/png", cfMitigated: false, bytes: png, mime: "image/png" };
        if (u.host === "janitorai.com" && u.pathname === "/hampter/tags") return ok([{ id: 53, name: "Fantasy" }]);
        if (u.host === "janitorai.com" && u.pathname === "/hampter/characters") {
          if (state.challenge) return { status: 403, finalUrl: r.url, contentType: "text/html", cfMitigated: true, text: "<html>Access Restricted</html>" };
          const rows = state.user ? [open, hidden, { ...open, id: "aaaaaaaa-0000-4000-8000-000000000003", name: "Member Only" }] : [open, hidden];
          return ok({ data: rows, total: rows.length, size: 34 });
        }
        if (u.host === "janitorai.com" && u.pathname === `/hampter/characters/${open.id}`) return ok(open);
        if (u.host === "janitorai.com" && u.pathname === `/hampter/characters/${hidden.id}`) return ok(hidden);
        if (u.host === "janitorai.com" && u.pathname.startsWith("/hampter/script/")) return ok({ script: JSON.stringify([{ key: ["lighthouse"], content: "The lighthouse is old." }]) });
        if (u.host === "api.chub.ai") return ok({ data: { count: 1, nodes: [{ fullPath: "anna/elf-1", name: "Elf Queen", tagline: "", topics: [], starCount: 1, nTokens: 10 }] } });
        throw new Error(`no fake for ${r.url}`);
      },
    };
  }, opts);
}
const janitor = (page: Page) => page.evaluate(() => (globalThis as unknown as { __janitor: { user: string | null; actions: string[]; calls: string[]; challenge: boolean } }).__janitor);

async function openJanitor(page: Page) {
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  const browser = page.getByTestId("card-browser");
  await browser.getByTestId("cb-source").click();
  await page.getByRole("menuitemradio", { name: /JanitorAI/ }).click();
  return browser;
}

test("JanitorAI: guest search, a public card is added with its lorebook, a hidden one can't be added", async ({ page }) => {
  await fakeJanitor(page);
  const browser = await openJanitor(page);
  const account = browser.getByTestId("cb-janitor-account");
  await expect(account).toContainText("Browsing JanitorAI without an account.");
  await expect(account.getByRole("button", { name: "Sign In…" })).toBeVisible();
  const cards = browser.getByTestId("cb-card");
  await expect(cards).toHaveCount(2);

  // hidden definition: public parts, the reason, Add and Save as PNG off
  await cards.filter({ hasText: "Hidden Keeper" }).click();
  const sheet = page.getByTestId("cb-sheet");
  await expect(sheet.getByTestId("cb-hidden")).toContainText("definition hidden");
  await expect(sheet).toContainText("Psst.");
  await expect(sheet.getByTestId("cb-add")).toBeDisabled();
  await expect(sheet.getByTestId("cb-png")).toBeDisabled();
  await expect(sheet.getByTestId("cb-folder")).toHaveCount(0);

  // public definition: added, with its public lorebook
  await cards.filter({ hasText: "Open Keeper" }).click();
  await expect(sheet).toContainText("Keeps the lighthouse.");
  await expect(sheet).toContainText("Lorebook");
  await sheet.getByTestId("cb-add").click();
  await expect(page.locator(".notice")).toContainText("Added Open Keeper to Characters");
  await expect(sheet.getByTestId("cb-chat")).toBeVisible();

  // JanitorAI is only ever asked read-only GETs of its API and its picture host (ChubAI ran first, as the default site)
  const calls = (await janitor(page)).calls.filter((c) => c.includes("janitorai.com"));
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((c) => c.startsWith("GET https://janitorai.com/hampter/") || c.startsWith("GET https://ella.janitorai.com/"))).toBe(true);
  expect(calls.some((c) => c.includes("/hampter/script/bbbbbbbb-0000-4000-8000-000000000001"))).toBe(true);
});

test("JanitorAI: Sign In… opens its window; coming back signed in searches again; Sign Out goes back to guest", async ({ page }) => {
  await fakeJanitor(page);
  const browser = await openJanitor(page);
  const account = browser.getByTestId("cb-janitor-account");
  await expect(browser.getByTestId("cb-card")).toHaveCount(2);
  await account.getByRole("button", { name: "Sign In…" }).click();
  expect((await janitor(page)).actions).toContain("open");
  // the person signs in in JanitorAI's window, then comes back to the app
  await page.evaluate(() => { (globalThis as unknown as { __janitor: { user: string } }).__janitor.user = "daniel"; window.dispatchEvent(new Event("focus")); });
  await expect(account).toContainText("Signed in to JanitorAI as daniel");
  await expect(browser.getByTestId("cb-card")).toHaveCount(3);
  await account.getByRole("button", { name: "Sign Out" }).click();
  await expect(account).toContainText("Browsing JanitorAI without an account.");
  await expect(browser.getByTestId("cb-card")).toHaveCount(2);
});

test("JanitorAI: its browser check offers Open JanitorAI (its own window) and Try Again", async ({ page }) => {
  await fakeJanitor(page, { challenge: true });
  const browser = await openJanitor(page);
  const notice = page.getByTestId("cb-notice");
  await expect(notice).toContainText("JanitorAI is blocking requests");
  await notice.getByRole("button", { name: "Open JanitorAI" }).click();
  expect((await janitor(page)).actions).toContain("show");
  await page.evaluate(() => { (globalThis as unknown as { __janitor: { challenge: boolean } }).__janitor.challenge = false; });
  await notice.getByRole("button", { name: "Try Again" }).click();
  await expect(browser.getByTestId("cb-card")).toHaveCount(2);
});

test("JanitorAI: All Sites leaves it out (it needs its own window first)", async ({ page }) => {
  await fakeJanitor(page);
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  const browser = page.getByTestId("card-browser");
  await browser.getByTestId("cb-source").click();
  await page.getByRole("menuitemradio", { name: /All Sites/ }).click();
  await expect(browser.getByTestId("cb-card").first()).toBeVisible();
  expect((await janitor(page)).calls.some((c) => c.includes("janitorai.com"))).toBe(false);
});
