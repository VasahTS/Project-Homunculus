// Click tests of JanitorAI in the Card Browser (D-098, D-099). A fake JanitorAI (and its window's account) is injected, so no
// site is contacted: guest line, Sign In… opens the window, a public card is added with its lorebook, a hidden one is extracted
// (asked once; the account put back), a proxy-locked one can't be, signing in/out searches again, Cloudflare offers Open
// JanitorAI + Try Again, All Sites leaves JanitorAI out. CLAUDE, 2026-11-08.
import { expect, test, type Page } from "@playwright/test";

async function fakeJanitor(page: Page, opts: { challenge?: boolean; datacat?: boolean } = {}) {
  await page.addInitScript((o) => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const ok = (data: unknown) => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text: JSON.stringify(data) });
    const state = { user: null as string | null, actions: [] as string[], calls: [] as string[], writes: [] as string[], sends: [] as string[], challenge: o.challenge === true, selected: 7 as unknown, alpha: null as unknown };
    (globalThis as { __janitor?: unknown }).__janitor = state;
    const base = { creator_name: "kit", description: "<p>A short bio.</p>", avatar: "a.webp", tagIds: [53], is_nsfw: false, totalToken: 900, stats: { chat: 5 } };
    const open = { ...base, id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Open Keeper", showdefinition: true, personality: "Keeps the lighthouse.", scenario: "A storm.", first_message: "Hello.", first_messages: ["Hello.", "Again?"],
      scripts: [{ type: "lorebook", id: "bbbbbbbb-0000-4000-8000-000000000001", title: "Coast", is_public: true }] };
    const hidden = { ...base, id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Hidden Keeper", showdefinition: false, personality: "", scenario: "", first_message: "Psst." };
    const locked = { ...hidden, id: "aaaaaaaa-0000-4000-8000-000000000004", name: "Locked Keeper", allow_proxy: false };
    const prompt = "<Hidden Keeper's Persona>Hidden Keeper guards a secret lamp.</Hidden Keeper's Persona>\n<Scenario>Night.</Scenario>\nThe secret lamp: it never goes out.";
    (globalThis as { __h2FakeCardSites?: unknown }).__h2FakeCardSites = {
      async janitorAccount(action: string) {
        state.actions.push(action);
        if (action === "logout") state.user = null;
        return { username: state.user };
      },
      janitor: {
        async call(method: string, path: string, body?: { client_id?: string; selected_proxy_config_id?: unknown }) {
          if (method !== "GET") state.writes.push(`${method} ${path}`);
          const r = (v: unknown) => ({ status: 200, text: JSON.stringify(v) });
          if (path === "/hampter/api-settings" && method === "GET") return r({ settings: { selected_proxy_config_id: state.selected, source: "proxy", generation_settings: { context_length: 8000 } }, proxy_configs: [{ id: 7 }, ...(state.writes.includes("POST /hampter/api-settings/proxy-configs") && !state.writes.includes("DELETE /hampter/api-settings/proxy-configs/99") ? [{ id: 99, client_id: (globalThis as unknown as { __cid: string }).__cid }] : [])] });
          if (path === "/hampter/api-settings/proxy-configs") (globalThis as unknown as { __cid: string }).__cid = body?.client_id ?? "";
          if (path === "/hampter/api-settings" && method === "PATCH" && body && "selected_proxy_config_id" in body) state.selected = body.selected_proxy_config_id;
          if (path === "/hampter/profiles/mine") return r({ name: "Daniel", profile: "" });
          if (path === "/hampter/personas" && method === "GET") return r([]);
          if (path === "/hampter/personas" && method === "POST") return r({ id: "p1" });
          if (path === "/hampter/chats" && method === "POST") return r({ id: "c-1" });
          if (path === "/hampter/chats/c-1" && method === "GET") return r({ character: { first_message: "Psst.", first_messages: ["Psst.", "Again, {{user}}?"] } });
          return r({});
        },
        async page(op: string, text?: string) {
          state.calls.push("page " + op);
          if (op === "send") state.sends.push(String(text));
          const r = (v: unknown) => ({ status: 200, text: JSON.stringify(v) });
          if (op === "composer") return r({ ready: true });
          if (op === "reset") state.alpha = null;
          if (op === "send") { state.alpha = { messages: [{ role: "system", content: prompt }] }; return r({ ok: true, cleared: true }); }
          if (op === "alpha") return r({ payload: state.alpha, log: [] });
          return r({});
        },
      },
      async request(r: { url: string; method: string; expect: string }) {
        state.calls.push(r.method + " " + r.url);
        const u = new URL(r.url);
        if (r.expect === "image") return { status: 200, finalUrl: r.url, contentType: "image/png", cfMitigated: false, bytes: png, mime: "image/png" };
        if (u.host === "janitorai.com" && u.pathname === "/hampter/tags") return ok([{ id: 53, name: "Fantasy" }]);
        if (u.host === "janitorai.com" && u.pathname === "/hampter/characters") {
          if (state.challenge) return { status: 403, finalUrl: r.url, contentType: "text/html", cfMitigated: true, text: "<html>Access Restricted</html>" };
          const rows = state.user ? [open, hidden, locked, { ...open, id: "aaaaaaaa-0000-4000-8000-000000000003", name: "Member Only" }] : [open, hidden, locked];
          return ok({ data: rows, total: rows.length, size: 34 });
        }
        if (u.host === "janitorai.com" && u.pathname === `/hampter/characters/${open.id}`) return ok(open);
        if (u.host === "janitorai.com" && u.pathname === `/hampter/characters/${hidden.id}`) return ok(hidden);
        if (u.host === "janitorai.com" && u.pathname === `/hampter/characters/${locked.id}`) return ok(locked);
        if (u.host === "janitorai.com" && u.pathname.startsWith("/hampter/script/")) return ok({ script: JSON.stringify([{ key: ["lighthouse"], content: "The lighthouse is old." }]) });
        // DataCat (D-101): the hidden card is there, under JanitorAI's own id, only when the test says so
        if (u.host === "datacat.run" && u.pathname === "/api/liberator/identify") return ok({ success: true, sessionToken: "s" });
        if (u.host === "datacat.run" && u.pathname === `/api/characters/${hidden.id}` && o.datacat) return ok({ character: { character_id: hidden.id, name: "Hidden Keeper", personality: "Hidden Keeper guards a secret lamp.", scenario: "Night.", first_message: "Psst.", updatedAt: "2026-10-03T12:00:00Z", downloadsDisabled: false,
          chara_card_v2_json: { spec: "chara_card_v2", data: { name: "Hidden Keeper", description: "Hidden Keeper guards a secret lamp.", character_book: { entries: [{ keys: ["lamp"], content: "It never goes out." }] } } } } });
        if (u.host === "datacat.run" && u.pathname.startsWith("/api/characters/")) return { status: 404, finalUrl: r.url, contentType: "application/json", cfMitigated: false, text: "{}" };
        if (u.host === "api.chub.ai") return ok({ data: { count: 1, nodes: [{ fullPath: "anna/elf-1", name: "Elf Queen", tagline: "", topics: [], starCount: 1, nTokens: 10 }] } });
        throw new Error(`no fake for ${r.url}`);
      },
    };
  }, opts);
}
const janitor = (page: Page) => page.evaluate(() => (globalThis as unknown as { __janitor: { user: string | null; actions: string[]; calls: string[]; writes: string[]; sends: string[]; challenge: boolean; selected: unknown } }).__janitor);

async function openJanitor(page: Page) {
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  const browser = page.getByTestId("card-browser");
  await browser.getByTestId("cb-source").click();
  await page.getByRole("menuitemradio", { name: /JanitorAI/ }).click();
  return browser;
}

test("JanitorAI: guest search, a public card is added with its lorebook, hidden ones offer Extract unless proxies are locked", async ({ page }) => {
  await fakeJanitor(page);
  const browser = await openJanitor(page);
  const account = browser.getByTestId("cb-janitor-account");
  await expect(account).toContainText("Browsing JanitorAI without an account.");
  await expect(account.getByRole("button", { name: "Sign In…" })).toBeVisible();
  const cards = browser.getByTestId("cb-card");
  await expect(cards).toHaveCount(3);

  // hidden definition: public parts, the reason, Extract and Add; Save as PNG off
  await cards.filter({ hasText: "Hidden Keeper" }).click();
  const sheet = page.getByTestId("cb-sheet");
  await expect(sheet.getByTestId("cb-hidden")).toContainText("definition hidden");
  await expect(sheet).toContainText("Psst.");
  await expect(sheet.getByTestId("cb-extract")).toBeEnabled();
  await expect(sheet.getByTestId("cb-png")).toBeDisabled();
  // locked to JanitorAI's own model: nothing to do but read it
  await cards.filter({ hasText: "Locked Keeper" }).click();
  await expect(sheet.getByTestId("cb-hidden")).toContainText("can't be extracted");
  await expect(sheet.getByTestId("cb-add")).toBeDisabled();
  await expect(sheet.getByTestId("cb-extract")).toHaveCount(0);
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
  expect((await janitor(page)).writes).toEqual([]);
});

test("JanitorAI: Extract and Add asks once, reads the hidden card through the account, puts the account back", async ({ page }) => {
  await fakeJanitor(page);
  await page.addInitScript(() => { (globalThis as unknown as { __janitor?: { user: string } }).__janitor && ((globalThis as unknown as { __janitor: { user: string } }).__janitor.user = "daniel"); });
  const browser = await openJanitor(page);
  await browser.getByTestId("cb-card").filter({ hasText: "Hidden Keeper" }).click();
  const sheet = page.getByTestId("cb-sheet");
  await sheet.getByTestId("cb-extract").click();
  const ask = sheet.getByTestId("cb-extract-ask");
  await expect(ask).toContainText("JanitorAI's rules don't allow this");
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toHaveCount(0);
  expect((await janitor(page)).writes).toEqual([]);
  await sheet.getByTestId("cb-extract").click();
  await sheet.getByTestId("cb-extract-ask").getByRole("button", { name: "Extract" }).click();
  const notice = page.locator(".notice");
  await expect(notice).toContainText("Added Hidden Keeper to Characters", { timeout: 15_000 });
  await expect(notice).toContainText("No AI connection");
  await expect(sheet.getByTestId("cb-chat")).toBeVisible();
  const j = await janitor(page);
  expect(j.selected).toBe(7);
  expect(j.writes).toContain("DELETE /hampter/chats/c-1");
  expect(j.writes).toContain("DELETE /hampter/api-settings/proxy-configs/99");
  expect(j.writes).toContain("DELETE /hampter/personas/p1");
  // the card is in Characters with its recovered definition
  await sheet.getByTestId("cb-chat").isVisible();
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  await expect(page.getByText("Hidden Keeper").first()).toBeVisible();
});

test("JanitorAI: Sign In… opens its window; coming back signed in searches again; Sign Out goes back to guest", async ({ page }) => {
  await fakeJanitor(page);
  const browser = await openJanitor(page);
  const account = browser.getByTestId("cb-janitor-account");
  await expect(browser.getByTestId("cb-card")).toHaveCount(3);
  await account.getByRole("button", { name: "Sign In…" }).click();
  expect((await janitor(page)).actions).toContain("open");
  // the person signs in in JanitorAI's window, then comes back to the app
  await page.evaluate(() => { (globalThis as unknown as { __janitor: { user: string } }).__janitor.user = "daniel"; window.dispatchEvent(new Event("focus")); });
  await expect(account).toContainText("Signed in to JanitorAI as daniel");
  await expect(browser.getByTestId("cb-card")).toHaveCount(4);
  await account.getByRole("button", { name: "Sign Out" }).click();
  await expect(account).toContainText("Browsing JanitorAI without an account.");
  await expect(browser.getByTestId("cb-card")).toHaveCount(3);
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
  await expect(browser.getByTestId("cb-card")).toHaveCount(3);
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

test("JanitorAI: the Lorebook Trigger row changes what the extraction sends, and remembers its switches", async ({ page }) => {
  await fakeJanitor(page);
  await page.addInitScript(() => { const j = (globalThis as unknown as { __janitor?: { user: string } }).__janitor; if (j) j.user = "daniel"; });
  const browser = await openJanitor(page);
  await browser.getByTestId("cb-card").filter({ hasText: "Hidden Keeper" }).click();
  const sheet = page.getByTestId("cb-sheet");
  const trigger = sheet.getByTestId("cb-trigger");
  await expect(trigger).toContainText("Card, Catalog Page, Scenario");
  await trigger.locator("summary").click();
  await trigger.getByRole("switch", { name: "Card" }).click();
  await trigger.getByRole("switch", { name: "Catalog Page" }).click();
  await trigger.getByRole("switch", { name: "Scenario" }).click();
  // the switches are remembered for the next card (here: the same card opened again); the extra text belongs to one card
  await browser.getByTestId("cb-card").filter({ hasText: "Locked Keeper" }).click();
  await browser.getByTestId("cb-card").filter({ hasText: "Hidden Keeper" }).click();
  await expect(trigger.locator("summary")).toContainText("Nothing (sends a dot)");
  await trigger.locator("summary").click();
  await trigger.getByTestId("cb-trigger-extra").fill("The Silver Fox inn");
  await expect(trigger.locator("summary")).toContainText("Extra Text");
  await sheet.getByTestId("cb-extract").click();
  await sheet.getByTestId("cb-extract-ask").getByRole("button", { name: "Extract" }).click();
  await expect(page.locator(".notice")).toContainText("Added Hidden Keeper to Characters", { timeout: 15_000 });
  const sends = (await janitor(page)).sends;
  expect(sends).toEqual([".", "The Silver Fox inn"]);
});

test("JanitorAI + DataCat: a hidden card already on DataCat offers Add from DataCat, with Extract Yourself beside it", async ({ page }) => {
  await fakeJanitor(page, { datacat: true });
  await page.addInitScript(() => { try { localStorage.setItem("h2.cardBrowser", JSON.stringify({ datacatOk: true })); } catch { /* none */ } });
  const browser = await openJanitor(page);
  await browser.getByTestId("cb-card").filter({ hasText: "Hidden Keeper" }).click();
  const sheet = page.getByTestId("cb-sheet");
  await expect(sheet.getByTestId("cb-datacat")).toContainText("Already on DataCat");
  await expect(sheet.getByTestId("cb-datacat")).toContainText("lorebook: 1 entry");
  await expect(sheet.getByTestId("cb-extract")).toHaveText("Extract Yourself");
  await expect(sheet.getByTestId("cb-png")).toBeEnabled();
  await sheet.getByTestId("cb-datacat-add").click();
  await expect(page.locator(".notice")).toContainText("Added Hidden Keeper to Characters");
  await expect(page.locator(".notice")).toContainText("From DataCat's copy");
  // nothing was done on the JanitorAI account
  const j = await janitor(page);
  expect(j.writes).toEqual([]);
  expect(j.calls.some((c) => c.startsWith("page "))).toBe(false);
});

test("JanitorAI + DataCat: not on DataCat (or DataCat not allowed) keeps Extract and Add", async ({ page }) => {
  await fakeJanitor(page);
  await page.addInitScript(() => { try { localStorage.setItem("h2.cardBrowser", JSON.stringify({ datacatOk: true })); } catch { /* none */ } });
  const browser = await openJanitor(page);
  await browser.getByTestId("cb-card").filter({ hasText: "Hidden Keeper" }).click();
  const sheet = page.getByTestId("cb-sheet");
  await expect(sheet.getByTestId("cb-extract")).toHaveText("Extract and Add");
  await expect(sheet.getByTestId("cb-hidden")).not.toContainText("Looking on DataCat");
  await expect(sheet.getByTestId("cb-datacat-add")).toHaveCount(0);
});

