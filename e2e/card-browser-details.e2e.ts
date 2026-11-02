// Card Browser full-field reading and portrait layout regressions. CODEX, 2026-11-02.
import { expect, test, type Page } from "@playwright/test";

async function openLongCard(page: Page) {
  await page.addInitScript(() => {
    const ok = (body: unknown) => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text: JSON.stringify(body) });
    const long = (field: string) => Array.from({ length: 70 }, (_, i) => `${field} paragraph ${i + 1}. A complete definition should remain readable, including its final lines.`).join("\n\n") + `\n${field} END`;
    (globalThis as { __h2FakeCardSites?: unknown }).__h2FakeCardSites = {
      async request(r: { url: string; expect: string }) {
        if (r.expect === "image") return { status: 200, bytes: Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0)), mime: "image/png" };
        if (new URL(r.url).pathname === "/search") return ok({ data: { count: 2, nodes: [1, 2].map((n) => ({ fullPath: `demo/reader-${n}`, name: `Reader ${n}`, topics: ["Fantasy"], nTokens: 4500 })) } });
        return ok({ node: { definition: { personality: long("Description"), tavern_personality: long("Personality"), scenario: long("Scenario"), first_message: long("Greeting"), alternate_greetings: ["A short alternate greeting."], description: long("Notes"), example_dialogs: long("Dialogue"), system_prompt: long("System"), post_history_instructions: long("History") } } });
      },
    };
  });
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  await page.getByTestId("cb-card").first().click();
  await expect(page.getByTestId("cb-sheet")).toContainText("Description END");
}

for (const width of [1440, 390]) {
  test(`Card Browser: full fields scroll and collapse at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openLongCard(page);
    const sheet = page.getByTestId("cb-sheet");
    const portrait = sheet.locator(".vs-pic");
    const box = await portrait.boundingBox();
    expect(box!.width).toBeGreaterThan(230);
    expect(box!.height).toBeGreaterThan(250);
    const field = sheet.getByRole("region", { name: "Description", exact: true });
    await expect(field).toBeVisible();
    expect(await field.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    await field.focus();
    await page.keyboard.press("Control+End");
    await expect.poll(() => field.evaluate((e) => e.scrollTop + e.clientHeight >= e.scrollHeight - 2)).toBe(true);
    const end = field.getByText("Description END", { exact: false });
    await expect(end).toContainText("Description END");
    const summary = sheet.locator("summary").filter({ hasText: /^Description$/ });
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(field).toBeHidden();
    await page.keyboard.press("Space");
    await expect(field).toBeVisible();
    for (const title of ["Creator's Notes", "First Message", "Scenario", "Personality", "Example Dialogue", "System Prompt", "Post-History Instructions"]) {
      const text = sheet.getByRole("region", { name: title, exact: true });
      await expect(text).toBeVisible();
      expect(await text.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
      expect(await text.textContent()).toMatch(/END$/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 1000) {
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId("cb-card").first()).toBeVisible();
    }
  });
}

test("Card Browser: greeting navigation resets reading position and a new card opens independently", async ({ page }) => {
  await openLongCard(page);
  const sheet = page.getByTestId("cb-sheet");
  const greeting = sheet.getByRole("region", { name: "First Message", exact: true });
  await greeting.scrollIntoViewIfNeeded();
  await greeting.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await sheet.getByRole("button", { name: "Next greeting" }).click();
  await expect(greeting).toHaveText("A short alternate greeting.");
  await sheet.getByRole("button", { name: "Previous greeting" }).click();
  await expect(greeting).toContainText("Greeting END");
  expect(await greeting.evaluate((e) => e.scrollTop)).toBe(0);
  await sheet.locator("summary").filter({ hasText: /^Description$/ }).click();
  await page.getByTestId("cb-card").nth(1).click();
  await expect(sheet.getByRole("region", { name: "Description", exact: true })).toBeVisible();
});
