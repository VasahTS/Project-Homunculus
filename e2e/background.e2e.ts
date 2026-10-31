// Click tests: a reply keeps being written when you leave its chat; several chats write at once. Author: CLAUDE, 2026-10-29.
// (Daniel: "things stop generating when we leave the chat… generate several messages in different chats".)
import { expect, test, type Page } from "@playwright/test";
import { newChatWith } from "./ui.ts";

const newChat = (page: Page) => newChatWith(page);

async function rename(page: Page, name: string) {
  await page.getByTitle("Click to rename").click();
  await page.getByLabel("Session title").fill(name);
  await page.getByLabel("Session title").press("Enter");
}

/** A chat in the sidebar by its name (the list reorders as chats get new messages). */
const chat = (page: Page, name: string) => page.getByTestId("session-list").getByRole("button", { name: new RegExp(`^${name}`) });

async function write(page: Page, text: string) {
  await page.getByPlaceholder(/Write your message/).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("streaming")).toBeVisible();
}

test("leaving a chat while it writes: the reply keeps going and is there when you come back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await rename(page, "Alpha");
  await newChat(page);
  await rename(page, "Beta");
  await chat(page, "Alpha").click();
  await page.evaluate(() => { (globalThis as { __h2ReplyDelayMs?: number }).__h2ReplyDelayMs = 120; });
  await write(page, "First chat, keep going without me.");
  // go to the other chat while the reply is still arriving
  await chat(page, "Beta").click();
  await expect(page.getByTestId("messages")).toBeVisible();
  await expect(page.getByTestId("streaming")).toHaveCount(0); // this chat is not writing
  await expect(page.getByTestId("session-list").getByTestId("side-writing")).toHaveCount(1); // the other one says so
  // and this one can write at the same time
  await write(page, "Second chat, at the same time.");
  await expect(page.getByTestId("session-list").getByTestId("side-writing")).toHaveCount(2);
  // back to the first: it is still writing, and finishes on screen
  await chat(page, "Alpha").click();
  await expect(page.getByTestId("streaming")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 20_000 });
  const msgs = page.getByTestId("message");
  await expect(msgs).toHaveCount(3);
  await expect(msgs.nth(2)).toContainText('You said: First chat, keep going without me."');
  // the second finished while we were away: a notice says so and opens it
  await expect(page.getByTestId("session-list").getByTestId("side-writing")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("notice")).toContainText("Reply ready in “Beta”");
  await page.getByTestId("notice").getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("message")).toHaveCount(3);
  await expect(page.getByTestId("message").nth(2)).toContainText('You said: Second chat, at the same time."');
  // a new reply in the first chat continues the same branch (no stray branch)
  await chat(page, "Alpha").click();
  await page.evaluate(() => { (globalThis as { __h2ReplyDelayMs?: number }).__h2ReplyDelayMs = 5; });
  await page.getByPlaceholder(/Write your message/).fill("Again.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("message")).toHaveCount(5, { timeout: 15_000 });
  await expect(page.getByTestId("session-list").locator(".side-fork")).toHaveCount(0); // still one branch per chat
});

test("Stop works after coming back, and keeps what arrived", async ({ page }) => {
  await page.goto("/");
  await rename(page, "Alpha");
  await newChat(page);
  await page.evaluate(() => { (globalThis as { __h2ReplyDelayMs?: number }).__h2ReplyDelayMs = 200; });
  await write(page, "Long one.");
  await chat(page, "Alpha").click();
  await chat(page, "Session with Lyra").click();
  await expect(page.getByTestId("streaming")).toBeVisible();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("message")).toHaveCount(3);
  await expect(page.getByTestId("message").nth(2)).toContainText("She tilts her head"); // what arrived stays
  await expect(page.getByTestId("message").nth(2)).not.toContainText('You said: Long one."'); // the rest never came
});
