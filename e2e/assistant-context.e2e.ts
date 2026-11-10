// D-110: the Assistant knows the screen it was opened from, and Add context has Chats (whole or a range) and the other parts.
import { expect, test } from "@playwright/test";
import { newChatWith } from "./ui.ts";

test("opened from a chat: the chat and its character come as dashed chips; ✕ removes one", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  const box = page.getByTestId("assistant-composer");
  await expect(box.locator(".asst-chip.auto")).toHaveCount(2);
  await expect(box.locator(".asst-chip.auto").first()).toContainText("Session with Lyra");
  await expect(box.locator(".asst-chip.auto").nth(1)).toContainText("Lyra");
  await box.getByRole("button", { name: "Remove Lyra" }).click();
  await expect(box.locator(".asst-chip")).toHaveCount(1);
});

test("Add context → Chats: pick a chat and a range; Agents and Regex are there too", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await page.getByTestId("assistant-composer").locator(".asst-chip button").first().click();
  await page.getByTestId("assistant-composer").locator(".asst-chip button").first().click();
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-context").click();
  const picker = page.getByTestId("assistant-picker");
  await picker.getByRole("tab", { name: /Chats/ }).click();
  await picker.getByRole("button", { name: /Session with Lyra/ }).first().click();
  await picker.getByLabel("From message").fill("1");
  await picker.getByLabel("To message").fill("2");
  await picker.getByTestId("assistant-picker-add").click();
  await expect(page.getByTestId("assistant-composer")).toContainText("Session with Lyra · messages #1–#2");
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-context").click();
  await expect(picker.getByRole("tab", { name: /Agents/ })).toBeVisible();
});

test("D-114: opened from a cue, the cue comes as a chip; Add context has Cues", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Library" }).click();
  await page.getByTestId("library-list").getByRole("button", { name: "Cues", exact: true }).click();
  await page.getByTestId("cue-row").filter({ hasText: "Grounded Complication" }).click();
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  const box = page.getByTestId("assistant-composer");
  await expect(box.locator(".asst-chip.auto")).toHaveCount(1);
  await expect(box.locator(".asst-chip.auto")).toContainText("Grounded Complication");
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-context").click();
  const picker = page.getByTestId("assistant-picker");
  await picker.getByRole("tab", { name: /Cues/ }).click();
  await expect(picker.getByRole("button", { name: /Don't Write for User/ })).toBeVisible();
});
