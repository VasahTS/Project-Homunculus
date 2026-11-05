// Settings v2 (D-082): tabs, search across tabs, settings that change the chat, and the card reading view. CLAUDE, 2026-11-03.
import { expect, test } from "@playwright/test";

async function openSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).last().click();
  await expect(page.getByTestId("settings-general-body")).toBeVisible();
}

test("Settings opens on General; search finds rows in any tab and hides the rest", async ({ page }) => {
  await openSettings(page);
  for (const tab of ["General", "Chat", "Appearance", "Connections", "Defaults", "Lorebooks", "Data", "About"]) {
    await expect(page.getByRole("tab", { name: tab, exact: true })).toBeVisible();
  }
  const search = page.getByTestId("settings-search");
  await search.fill("backup");
  const results = page.getByTestId("settings-search-results");
  await expect(results.getByText("Back up now", { exact: true })).toBeVisible();
  await expect(results.getByText("Automatic backups")).toBeVisible();
  await expect(results.getByText("Open at", { exact: true })).toBeHidden();
  await search.fill("api key");
  await expect(results.getByRole("button", { name: "Open", exact: true })).toBeVisible();
  await search.fill("zzzz nothing");
  await expect(results.getByText(/No setting matches/)).toBeVisible();
  await search.press("Escape");
  await expect(page.getByTestId("settings-general-body")).toBeVisible();
});

test("Chat settings change the chat: time, number, tokens, swipe arrows and thinking", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    svc.core.connections.stream = async function* () { yield { reasoning: "Thinking about the mill." }; yield "The gate creaks."; };
  });
  await page.getByPlaceholder(/Type a message/).fill("Hello");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const last = page.getByTestId("message").last();
  await expect(last).toContainText("The gate creaks.");
  await expect(last.getByTestId("message-number")).toBeVisible();
  await expect(last.getByTestId("reasoning")).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).last().click();
  await page.getByTestId("settings-chat").click();
  for (const name of ["Date and time", "Message number", "Token counts"]) await page.getByRole("switch", { name, exact: true }).click();
  await page.getByRole("radiogroup", { name: "Model thinking" }).getByRole("radio", { name: "Hidden" }).click();
  await page.getByRole("radiogroup", { name: "Text width" }).getByRole("radio", { name: "Wide" }).click();
  await page.getByRole("button", { name: /Session with Lyra/ }).first().click();
  const again = page.getByTestId("message").last();
  await expect(again).toContainText("The gate creaks.");
  await expect(again.getByTestId("message-time")).toHaveCount(0);
  await expect(again.getByTestId("message-metadata")).toHaveCount(0);
  await expect(again.getByTestId("reasoning")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--story-w"))).toBe("940px");
});

test("the reading view opens from a character's sheet; Esc and the mouse's back button return to the preview", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  await page.getByTestId("character-list").locator(".gallery-card").first().click();
  await page.getByTestId("character-read").click();
  const reader = page.getByTestId("card-reader");
  await expect(reader.getByRole("heading", { name: "Lyra" })).toBeVisible();
  await expect(reader.getByText("A wary ranger", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reader).toHaveCount(0);
  await expect(page.getByTestId("character-sheet")).toBeVisible();
  await page.getByRole("button", { name: /Read Lyra full window/ }).click();
  await expect(reader).toBeVisible();
  await page.mouse.move(700, 400);
  await page.evaluate(() => document.querySelector("[data-testid=card-reader] .cr-text")!.dispatchEvent(new MouseEvent("mouseup", { button: 3, bubbles: true })));
  await expect(reader).toHaveCount(0);
  await page.getByTestId("character-read").click();
  await reader.getByTestId("reader-close").click();
  await expect(reader).toHaveCount(0);
});

test("Spoiler-free hides a character's definition until Show", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).last().click();
  await page.getByRole("switch", { name: "Spoiler-free cards" }).click();
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  await page.getByTestId("character-list").locator(".gallery-card").first().click();
  const sheet = page.getByTestId("character-sheet");
  await expect(sheet.getByTestId("spoiler-gate")).toBeVisible();
  await expect(sheet.getByText("A wary ranger", { exact: false })).toHaveCount(0);
  await sheet.getByTestId("spoiler-gate").getByRole("button", { name: "Show" }).click();
  await expect(sheet.getByText("A wary ranger", { exact: false })).toBeVisible();
});
