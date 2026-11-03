// One named menu per rewriting agent, through the real turn/revision pipeline. Author: CODEX, 2026-11-03.
import { expect, test, type Page } from "@playwright/test";
import { newChatWith, openLibrary, openSession, send } from "./ui.ts";

const names = ["Grounded Prose", "HTML5/CSS3", "Animation"];
const stages = ["The guard waits.", "The wary guard waits.", "The wary guard waits by the gate.", "The wary guard waits by the gate. Tick."];
async function setup(page: Page, labels = names) {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await page.evaluate(async ({ labels, stages }) => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    for (let i = 0; i < labels.length; i++) await svc.store.saveAgentConfig({ id: `rewrite-${i}`, name: labels[i], prompt: `REWRITE_FIXTURE_${i}`, output: "rewrite", order: i, triggers: [{ on: "turn", phase: "after" }] });
    await svc.store.setDefaultSetup({ agents: { mode: "add", add: labels.map((_n: string, i: number) => `rewrite-${i}`), remove: [] } });
    svc.core.connections.stream = async function* (_c: unknown, messages: Array<{ content: string }>) {
      const index = labels.findIndex((_n: string, i: number) => messages.some((m) => m.content.includes(`REWRITE_FIXTURE_${i}`)));
      yield stages[index + 1];
    };
  }, { labels, stages });
  await newChatWith(page);
  await send(page, "I wait.");
  return page.getByTestId("message").last();
}

test("every rewrite has a named menu and its own exact comparison; undo preserves earlier menus", async ({ page }) => {
  const reply = await setup(page);
  await expect(reply.getByTestId("mark-rewrite")).toHaveText(names);
  await expect(reply).not.toContainText("polished");
  for (let i = 0; i < names.length; i++) {
    await reply.getByTestId("mark-rewrite").nth(i).click();
    const menu = page.getByRole("dialog", { name: `Rewrites by ${names[i]}`, exact: true });
    await expect(menu).toBeVisible();
    await menu.evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))); });
    const menuBox = await menu.boundingBox();
    const storyRight = await page.locator('[data-region="story"]').evaluate((el) => el.getBoundingClientRect().left + el.clientWidth);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(storyRight);
    await menu.getByRole("button", { name: "See changes", exact: true }).click();
    const comparison = page.getByTestId("diff-sheet");
    await expect(comparison.getByRole("heading", { name: `Changes by ${names[i]}`, exact: true })).toBeVisible();
    await comparison.getByRole("tab", { name: "Original", exact: true }).click();
    await expect(comparison.locator(".df-text")).toHaveText(stages[i]!);
    await comparison.getByRole("tab", { name: "Rewritten", exact: true }).click();
    await expect(comparison.locator(".df-text")).toHaveText(stages[i + 1]!);
    await expect(comparison.getByRole("button", { name: "Undo All", exact: true })).toHaveCount(i === 2 ? 1 : 0);
    await comparison.getByRole("button", { name: "Done", exact: true }).click();
  }
  await page.getByTestId("messages").evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))); });
  await reply.getByTestId("mark-rewrite").last().click();
  await page.getByRole("dialog", { name: "Rewrites by Animation", exact: true }).evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))); });
  await page.screenshot({ path: "e2e/.results/rewrite-menus-desktop.png" });
  await page.keyboard.press("Escape");
  for (let i = 2; i >= 0; i--) {
    await reply.getByTestId("mark-rewrite").last().click();
    await page.getByRole("dialog", { name: `Rewrites by ${names[i]}`, exact: true }).getByRole("button", { name: "Undo rewrite", exact: true }).click();
    await expect(reply.locator(".text")).toHaveText(stages[i]!);
    await expect(reply.getByTestId("mark-rewrite")).toHaveCount(i);
  }
});

test("repeated rewrites share one agent menu with a separate comparison for each run", async ({ page }) => {
  const reply = await setup(page);
  await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    const session = (await svc.store.listSessions())[0];
    const message = await svc.store.latestMessage(session.id);
    await svc.store.addRevision({ id: crypto.randomUUID(), messageId: message.id, author: { kind: "agent", agentId: "rewrite-0" }, before: message.content, after: "A second prose rewrite.", createdAt: Date.now() });
    await svc.store.updateMessageContent(message.id, "A second prose rewrite.");
  });
  await openLibrary(page, "Agents"); await openSession(page);
  await expect(reply.getByTestId("mark-rewrite")).toHaveCount(3);
  await reply.getByTestId("mark-rewrite").first().click();
  const menu = page.getByRole("dialog", { name: "Rewrites by Grounded Prose", exact: true });
  await menu.getByRole("button", { name: "See rewrite 1", exact: true }).click();
  await page.getByTestId("diff-sheet").getByRole("tab", { name: "Rewritten", exact: true }).click();
  await expect(page.getByTestId("diff-sheet").locator(".df-text")).toHaveText(stages[1]!);
  await expect(page.getByTestId("diff-sheet").getByRole("button", { name: "Undo All", exact: true })).toHaveCount(0);
  await page.getByTestId("diff-sheet").getByRole("button", { name: "Done", exact: true }).click();
  await reply.getByTestId("mark-rewrite").first().click();
  await menu.getByRole("button", { name: "See rewrite 2", exact: true }).click();
  await page.getByTestId("diff-sheet").getByRole("tab", { name: "Rewritten", exact: true }).click();
  await expect(page.getByTestId("diff-sheet").locator(".df-text")).toHaveText("A second prose rewrite.");
  await expect(page.getByTestId("diff-sheet").getByRole("button", { name: "Undo All", exact: true })).toHaveCount(1);
});

test("long names and independent menus fit narrow screens and support keyboard navigation", async ({ page }) => {
  const labels = ["Grounded Prose " + "long agent name ".repeat(8), "HTML5/CSS3", "Animation"];
  const reply = await setup(page, labels);
  await page.getByRole("button", { name: "Hide Inspector", exact: true }).click();
  await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  const marks = reply.getByTestId("mark-rewrite");
  for (let i = 0; i < 3; i++) {
    await marks.nth(i).click();
    const menu = page.getByRole("dialog", { name: `Rewrites by ${labels[i]}`, exact: true });
    await expect(menu.getByRole("button", { name: "See changes", exact: true })).toBeFocused();
    await menu.evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))); });
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(812);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(marks.nth(i)).toBeFocused();
  }
  expect(await marks.evaluateAll((els) => els.every((el) => el.getBoundingClientRect().right <= innerWidth))).toBe(true);
  await marks.first().click();
  const opened = page.getByRole("dialog", { name: `Rewrites by ${labels[0]}`, exact: true });
  await opened.evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))); });
  await page.screenshot({ path: "e2e/.results/rewrite-menus-mobile.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 812, height: 375 });
  await marks.first().click();
  await opened.evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))); });
  const landscape = await opened.boundingBox();
  expect(landscape!.y).toBeGreaterThanOrEqual(0);
  expect(landscape!.y + landscape!.height).toBeLessThanOrEqual(375);
});
