// Click tests of D-138: each opening of a story has its own scenario; the chat's Prompt tab shows the one in use and
// follows a swipe of the first message. Author: CLAUDE, 2026-11-17.
import { expect, test } from "@playwright/test";
import { openLibrary, openTab, send } from "./ui.ts";

test("each opening has its own scenario; New Chat shows it; the Prompt tab follows the first message", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const create = page.getByTestId("new-story");
  await create.getByLabel("Story name").fill("Two Worlds");
  await create.getByRole("button", { name: /Narrated adventure/ }).click();
  await create.getByLabel("An empty story").check();
  await create.getByTestId("create-story").click();
  await expect(page.getByTestId("story-page")).toBeVisible();

  // opening 1: modern; + copies its scenario into opening 2, which then gets its own
  await page.getByLabel("Scenario", { exact: true }).fill("Modern day. Aru'Kala was left at Alice's house.");
  await page.getByLabel("Opening 1").fill("The car drives off too fast.");
  await page.getByRole("button", { name: "Add an opening" }).click();
  await expect(page.getByLabel("Scenario", { exact: true })).toHaveValue("Modern day. Aru'Kala was left at Alice's house.");
  await page.getByLabel("Opening 2").fill("Chains ring on the marble floor.");
  await page.getByLabel("Scenario", { exact: true }).fill("Fantasy. Alice is the queen of Valdren.");
  await page.getByRole("tab", { name: "1" }).click();
  await expect(page.getByLabel("Scenario", { exact: true })).toHaveValue("Modern day. Aru'Kala was left at Alice's house.");
  await page.getByTestId("story-start").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.getByTestId("story-start").screenshot({ path: "e2e/.results/opening-scenarios-page.png" });

  // "Use This Scenario in All Openings" needs a second click
  const useAll = page.getByRole("button", { name: "Use This Scenario in All Openings" });
  await expect(useAll).toBeVisible();

  // New Chat: each opening says its scenario
  await page.getByTestId("play-story").click();
  const sheet = page.getByTestId("new-chat-sheet");
  await expect(sheet).toContainText("Scenario: Modern day.");
  await expect(sheet).toContainText("Scenario: Fantasy.");
  await page.screenshot({ path: "e2e/.results/opening-scenarios-new-chat.png" });
  await sheet.getByTestId("start-chat").click();
  await expect(page.getByTestId("messages")).toBeVisible();

  // the Prompt tab: the scenario of the opening on screen
  await openTab(page, "prompt");
  const card = page.getByTestId("prompt-card-scenario");
  await expect(card).toContainText("Opening 1 · Modern day.");
  // openTab opens every card; open it if it is not
  const toggle = card.getByTestId("prompt-card-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(card.getByTestId("prompt-card-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(card.getByTestId("prompt-scenario-text")).toHaveText("Modern day. Aru'Kala was left at Alice's house.");

  // a swipe of the first message: the fantasy opening, and its scenario
  await page.getByTestId("message").first().getByRole("button", { name: "Next version" }).click();
  await expect(page.getByTestId("message").first()).toContainText("Chains ring");
  await expect(card.getByTestId("prompt-scenario-text")).toHaveText("Fantasy. Alice is the queen of Valdren.");
  await expect(card).toContainText("Opening 2 ·");
  await expect(card.getByTestId("prompt-card-toggle")).toHaveAttribute("aria-expanded", "true");
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await card.screenshot({ path: "e2e/.results/opening-scenarios-prompt.png" });

  // Edit for This Chat: this chat's copy only
  await card.getByTestId("prompt-scenario-edit").click();
  await card.getByLabel("This chat's scenario").fill("Fantasy, in winter.");
  await card.getByTestId("prompt-scenario-save").click();
  await expect(card.getByTestId("prompt-scenario-text")).toHaveText("Fantasy, in winter.");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("Fantasy, in winter.");
  await page.keyboard.press("Escape");

  // replies on the fantasy branch keep it; back on opening 1, the modern one
  await send(page, "Your Majesty.");
  await expect(card.getByTestId("prompt-scenario-text")).toHaveText("Fantasy, in winter.");
  await page.getByTestId("message").first().getByRole("button", { name: "Previous version" }).click();
  await expect(page.getByTestId("message").first()).toContainText("The car drives off");
  await expect(card.getByTestId("prompt-scenario-text")).toHaveText("Modern day. Aru'Kala was left at Alice's house.");

  // the story itself did not change
  await page.getByTestId("story-crumb").click();
  await page.getByRole("tab", { name: "2" }).click();
  await expect(page.getByLabel("Scenario", { exact: true })).toHaveValue("Fantasy. Alice is the queen of Valdren.");
});
