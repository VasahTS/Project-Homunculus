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

// ---- D-136: what was left out of the first round

test("Continue adds to the last reply instead of writing another message; Next Message still writes one", async ({ page }) => {
  await page.goto("/");
  const msgs = page.getByTestId("message");
  await expect(msgs).toHaveCount(1);
  const before = (await msgs.first().innerText()).length;
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(msgs).toHaveCount(1); // the same message grew
  expect((await msgs.first().innerText()).length).toBeGreaterThan(before);
  await msgs.first().hover();
  await msgs.first().getByTestId("next-message").click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(msgs).toHaveCount(2);
});

test("Delete can take only one message and keep what follows; › on the newest version writes a new one", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "First line");
  await sendMessage(page, "Second line");
  const msgs = page.getByTestId("message");
  await expect(msgs).toHaveCount(5);
  // › on the last reply (one version) writes a second version
  await expect(page.getByTestId("swipe-counter")).toHaveText("1/1");
  await page.getByTestId("swipe-new").click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("swipe-counter")).toHaveText("2/2");
  // delete only "First line"
  await msgs.nth(1).hover();
  await msgs.nth(1).getByRole("button", { name: "Delete" }).click();
  await page.getByTestId("delete-only").click();
  await expect(msgs).toHaveCount(4);
  await expect(page.locator(".msg.user", { hasText: "First line" })).toHaveCount(0);
  await expect(page.locator(".msg.user", { hasText: "Second line" })).toHaveCount(1);
});

test("a character with chats goes to the Trash with them and comes back with them", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  await page.getByTestId("character-sheet").getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Move to Trash" }).first().click();
  await expect(page.getByTestId("trash-with-chats")).toContainText("Lyra has 1 chat");
  await page.getByTestId("trash-with-chats").getByRole("button", { name: /Move with 1 Chat/ }).click();
  await expect(page.locator(".sc-li")).toHaveCount(0);
  await page.getByTestId("notice").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".sc-li")).toHaveCount(1);
});

test("in a narrow window the Library's tabs wrap instead of hiding, and the Library opens on the tab used last", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.getByTestId("place-list").getByRole("button", { name: "Library" }).click();
  for (const name of ["Agents", "Cues", "Trash"]) await expect(page.getByTestId("library-list").getByRole("button", { name, exact: true })).toBeInViewport();
  await page.getByTestId("library-list").getByRole("button", { name: "Presets", exact: true }).click();
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  await page.getByTestId("place-list").getByRole("button", { name: "Library" }).click();
  await expect(page.getByTestId("library-list").getByRole("button", { name: "Presets", exact: true })).toHaveAttribute("aria-current", "page");
});
