// Click tests of the bug fixes of 2026-11-16 (D-135). Author: CLAUDE.
import { expect, test, type Page } from "@playwright/test";

async function sendMessage(page: Page, text: string) {
  await page.getByPlaceholder(/Type a message/).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("turn-status")).toHaveCount(0, { timeout: 10_000 });
}

test("a rename made in the sidebar is not undone by clicking the chat's title", async ({ page }) => {
  await page.goto("/");
  await page.locator(".sc-li").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Chat name").fill("Renamed in the sidebar");
  await page.keyboard.press("Enter");
  await expect(page.locator(".title-btn")).toHaveText("Renamed in the sidebar");
  await page.locator(".title-btn").click();
  await expect(page.getByLabel("Chat title")).toHaveValue("Renamed in the sidebar");
  await page.getByPlaceholder(/Type a message/).click(); // blur without a change
  await expect(page.locator(".title-btn")).toHaveText("Renamed in the sidebar");
  await expect(page.locator(".sc-t").first()).toHaveText("Renamed in the sidebar");
});

test("the sidebar's time follows a new reply, and Recent is ordered by the chat played last", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  // a second chat with Lyra, then wait three hours and play the first one again
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  await page.getByTestId("new-chat-with").click();
  await expect(page.getByTestId("messages")).toBeVisible();
  await page.getByLabel("Chat title").or(page.locator(".title-btn")).first().click();
  await page.getByLabel("Chat title").fill("Second chat");
  await page.keyboard.press("Enter");
  await expect(page.locator(".sc-t").first()).toHaveText("Second chat");
  await page.clock.fastForward("03:00:00");
  await page.locator(".sc-li", { hasText: "Chat with Lyra" }).click();
  await sendMessage(page, "Back again.");
  // the chat just played is first, and says "now" (it said the time of the message before)
  await expect(page.locator(".sc-t").first()).toHaveText("Chat with Lyra");
  await expect(page.locator(".sc-when").first()).toHaveText("now");
  // the other chat's time moves on by itself
  await page.clock.fastForward("00:02:00");
  await expect(page.locator(".sc-when").first()).toHaveText("2m");
});

test("Scene says Updating… only when trackers are on; New Story keeps Create Story in sight", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Type a message/).fill("Hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("scene-busy")).toHaveCount(0);
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByTestId("place-list").getByRole("button", { name: "Stories" }).click();
  await page.getByRole("button", { name: /New Story/ }).first().click();
  const create = page.getByTestId("new-story").getByRole("button", { name: "Create Story" });
  await expect(create).toBeInViewport();
});

test("the reply in progress has the same shape as the saved reply (no jump when it is saved)", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Type a message/).fill("Hello");
  await page.getByRole("button", { name: "Send" }).click();
  const live = page.getByTestId("streaming");
  await expect(live).toBeVisible();
  await expect(live.locator(".msg-body")).toHaveCount(1);
  await expect(live.locator(".msg-actions-hold")).toHaveCount(1);
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
});
