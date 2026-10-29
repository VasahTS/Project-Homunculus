// Click tests of the first chat screen (browser preview + offline test AI). Author: CLAUDE, 2026-10-23.
import { expect, test, type Page } from "@playwright/test";
import { openTab } from "./ui.ts";

async function sendMessage(page: Page, text: string) {
  await page.getByPlaceholder(/Write your message/).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
}

test("starts a session with the starter character's greeting", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status")).toHaveText("preview · not saved");
  const first = page.getByTestId("message").first();
  await expect(first).toContainText("Lyra");
  await expect(first).toContainText("Who sent you?");
});

test("sends a message and the reply streams in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await sendMessage(page, "Nobody. I'm lost.");
  const msgs = page.getByTestId("message");
  await expect(msgs).toHaveCount(3);
  await expect(msgs.nth(1)).toContainText("Nobody. I'm lost.");
  await expect(msgs.nth(2)).toContainText('You said: Nobody. I\'m lost."');
});

test("a thinking model's reasoning is kept apart, folded under 'Reasoning'", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "What are you thinking?");
  const reply = page.getByTestId("message").last();
  const reasoning = reply.getByTestId("reasoning");
  await expect(reasoning).toHaveCount(1);
  await expect(reply.locator(".text")).not.toContainText("pretending to think");
  await expect(reasoning.locator(".reasoning-text")).toBeHidden();
  await reasoning.getByText("Reasoning").click();
  await expect(reasoning.locator(".reasoning-text")).toContainText("pretending to think");
});

test("swipes: a new version appears, and you can flip between versions", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "Hello there");
  const lastReply = page.getByTestId("message").last();
  const firstText = await lastReply.locator(".text").innerText();

  await page.getByRole("button", { name: "New Version" }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("swipe-counter")).toHaveText("2/2");
  const secondText = await page.getByTestId("message").last().locator(".text").innerText();
  expect(secondText).not.toBe(firstText);

  await page.getByRole("button", { name: "Previous version" }).click();
  await expect(page.getByTestId("swipe-counter")).toHaveText("1/2");
  await expect(page.getByTestId("message").last().locator(".text")).toHaveText(firstText);
});

test("continuing from a swipe keeps the conversation on that branch", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "First question");
  await page.getByRole("button", { name: "New Version" }).click();
  await expect(page.getByTestId("swipe-counter")).toHaveText("2/2", { timeout: 10_000 });
  await sendMessage(page, "Follow-up");
  await expect(page.getByTestId("message")).toHaveCount(5);

  // Flip the earlier reply back to version 1: the follow-up belonged to version 2, so it disappears.
  await page.getByRole("button", { name: "Previous version" }).click();
  await expect(page.getByTestId("message")).toHaveCount(3);
  await page.getByRole("button", { name: "Next version" }).click();
  await expect(page.getByTestId("message")).toHaveCount(5);
  await expect(page.getByTestId("message").nth(3)).toContainText("Follow-up");
  await page.screenshot({ path: "e2e/.results/chat-after.png" });
});

// Bug of 27/10 (Daniel): the message he sent disappeared until the AI finished answering.
// These look at the screen WHILE the reply is arriving, not only at the end.
test("the sent message stays on screen while the reply is being written", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  // watch every frame: the sent text must never be missing from the screen once it was sent
  await page.evaluate(() => {
    const w = window as unknown as { __gaps: number; __watch: boolean };
    w.__gaps = 0; w.__watch = false;
    const tick = () => {
      if (w.__watch && !document.querySelector("[data-testid=messages]")?.textContent?.includes("Still here?")) w.__gaps++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByPlaceholder(/Write your message/).fill("Still here?");
  await page.getByRole("button", { name: "Send" }).click();
  await page.evaluate(() => { (window as unknown as { __watch: boolean }).__watch = true; });
  await expect(page.getByTestId("streaming")).toContainText("She");
  const msgs = page.getByTestId("message");
  await expect(msgs).toHaveCount(2);
  await expect(msgs.nth(1)).toContainText("Still here?");
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(msgs).toHaveCount(3);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __gaps: number }).__gaps)).toBe(0);
});

test("a new version (swipe) replaces the old one on screen while it is written", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "Tell me something");
  const oldText = await page.getByTestId("message").last().locator(".text").innerText();
  // slow the offline AI down so the new version is still being written when we look (it failed once on Daniel's PC,
  // 29/10: on a fast machine the version could finish before the check)
  await page.evaluate(() => { (globalThis as { __h2ReplyDelayMs?: number }).__h2ReplyDelayMs = 60; });
  await page.getByRole("button", { name: "New Version" }).click();
  await expect(page.getByTestId("streaming")).toBeVisible();
  await expect(page.getByTestId("message")).toHaveCount(2); // greeting + your message; the old version is hidden
  await expect(page.getByTestId("messages")).not.toContainText(oldText);
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("swipe-counter")).toHaveText("2/2");
});

test("a thinking model shows its reasoning live before the reply starts", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Write your message/).fill("Think first");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("reasoning-live")).toHaveCount(1);
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
});

// UI "I" (D-018): the receipt under the last reply opens the Reply tab, which shows what went into it.
test("the receipt opens the Reply tab: what was sent, settings used, what changed", async ({ page }) => {
  await page.goto("/");
  await sendMessage(page, "Show me the receipt");
  const receipt = page.getByTestId("receipt");
  await expect(receipt).toContainText("tokens");
  await receipt.click();
  const pane = page.getByTestId("reply-pane");
  await expect(pane).toContainText("Character: Description");
  await expect(pane).toContainText("Preset: Main Prompt");
  await expect(pane).toContainText("Chat history");
  await expect(pane).toContainText("Offline test AI");
  await expect(page.getByTestId("reply-changes")).toContainText("Nothing in the scene changed");
  await pane.getByRole("button", { name: "Open the full prompt" }).click();
  const sheet = page.getByTestId("reply-prompt");
  await expect(sheet).toContainText("Show me the receipt");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("samplers: a value set in the Prompt tab is used by the next reply, empty means default", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "prompt");
  const temp = page.getByLabel("Temperature value");
  await expect(temp).toHaveValue("");
  await temp.fill("0,7");
  await temp.press("Enter");
  await expect(temp).toHaveValue("0.7");
  await sendMessage(page, "Hello");
  await page.getByTestId("receipt").click();
  const settings = page.getByTestId("reply-pane");
  await expect(settings.locator(".row", { hasText: "Temperature" })).toContainText("0.7");
  await expect(settings.locator(".row", { hasText: "Top P" })).toContainText("default");
});

test("the sidebar and the inspector can be hidden, and stay that way after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  await expect(page.locator("[data-region=inspector]")).toHaveCount(0);
  await page.getByRole("button", { name: "Hide Sidebar" }).click();
  await expect(page.locator("[data-region=sidebar]")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("messages")).toBeVisible();
  await expect(page.locator("[data-region=inspector]")).toHaveCount(0);
  await expect(page.locator("[data-region=sidebar]")).toHaveCount(0);
  await page.getByRole("button", { name: "Show Sidebar" }).click();
  await page.getByRole("button", { name: "Show Inspector" }).click();
  await expect(page.locator("[data-region=sidebar]")).toBeVisible();
  await expect(page.locator("[data-region=inspector]")).toBeVisible();
});
