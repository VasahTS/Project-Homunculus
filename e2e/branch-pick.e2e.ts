// D-155: a long branch list scrolls inside the window (with a find box); Add Context picks a chat's branch and previews
// exactly the messages it attaches. Author: CLAUDE, 2026-11-27.
import { expect, test, type Page } from "@playwright/test";

async function sendMessage(page: Page, text: string) {
  await page.getByPlaceholder(/Type a message/).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("turn-status")).toHaveCount(0, { timeout: 10_000 });
}
const msgs = (page: Page) => page.getByTestId("message");

test("many branches: the list fits the window and scrolls; Find a Branch narrows it", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 640 });
  await page.goto("/");
  await sendMessage(page, "A1");
  await sendMessage(page, "A2");
  for (let i = 0; i < 11; i++) {
    await msgs(page).nth(1).getByRole("button", { name: "Branch from Here" }).click();
    await expect(page.getByTestId("branch-button")).toContainText(`Branch ${i + 2}`);
  }
  await page.getByTestId("branch-button").click();
  const list = page.getByTestId("branch-list");
  await expect(list.getByTestId("branch-row")).toHaveCount(12);
  const box = (await list.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(640);
  await expect(list.getByTestId("show-tree")).toBeInViewport();
  const last = list.getByTestId("branch-row").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await page.screenshot({ path: "e2e/.results/branch-list-many.png" });
  await list.getByLabel("Find a branch").fill("Main");
  await expect(list.getByTestId("branch-row")).toHaveCount(1);
  await expect(list.getByTestId("branch-row")).toContainText("Main");
});

test("Add Context: pick a chat's branch and preview what is attached", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "A1");
  await sendMessage(page, "A2");
  await msgs(page).nth(2).getByRole("button", { name: "Branch from Here" }).click();
  await expect(page.getByTestId("branch-button")).toContainText("Branch 2");
  await sendMessage(page, "B1");

  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-chat").click();
  const picker = page.getByTestId("assistant-picker");
  await picker.locator(".asst-card").first().click();
  const branch = picker.getByTestId("assistant-chat-branch");
  await expect(branch).toHaveValue("Branch 2");
  await picker.getByTestId("assistant-chat-preview-toggle").click();
  const preview = picker.getByTestId("assistant-chat-preview");
  await expect(preview).toContainText("B1");
  await expect(preview).not.toContainText("A2");
  await branch.selectOption("Main");
  await expect(preview).toContainText("A2");
  await expect(preview).not.toContainText("B1");
  await picker.getByLabel("From message").fill("2");
  await expect(preview.locator(".asst-preview-head")).toContainText("#2–#5");
  await page.screenshot({ path: "e2e/.results/add-context-preview.png" });
  await picker.getByTestId("assistant-picker-add").click();
  await expect(page.getByTestId("assistant-composer")).toContainText("· Main · messages #2–end");
});
