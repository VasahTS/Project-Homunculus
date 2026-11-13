// D-110: the Assistant knows the screen it was opened from (D-121: nothing attached; + → Add a Chat…), and Add context has Chats (whole or a range) and the other parts.
import { expect, test } from "@playwright/test";
import { newChatWith } from "./ui.ts";

test("opened from a chat: nothing is attached; + → Add a Chat… opens the chats with that one first (D-121)", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  const box = page.getByTestId("assistant-composer");
  await expect(box.locator(".asst-chip")).toHaveCount(0);
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-chat").click();
  const picker = page.getByTestId("assistant-picker");
  await expect(picker.getByRole("tab", { name: /Chats/ })).toHaveAttribute("aria-selected", "true");
  await expect(picker.locator(".asst-card").first()).toContainText("Session with Lyra");
  await picker.locator(".asst-card").first().click();
  await picker.getByTestId("assistant-picker-add").click();
  await expect(box.locator(".asst-chip")).toContainText("Session with Lyra");
});

test("Add context → Chats: pick a chat and a range; Agents and Regex are there too", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
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

test("D-114: opened from a cue, nothing is attached (D-121); Add context has Cues", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Library" }).click();
  await page.getByTestId("library-list").getByRole("button", { name: "Cues", exact: true }).click();
  await page.getByTestId("cue-row").filter({ hasText: "Grounded Complication" }).click();
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  const box = page.getByTestId("assistant-composer");
  await expect(box.locator(".asst-chip")).toHaveCount(0);
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-context").click();
  const picker = page.getByTestId("assistant-picker");
  await picker.getByRole("tab", { name: /Cues/ }).click();
  await expect(picker.getByRole("button", { name: /Don't Write for User/ })).toBeVisible();
});
