// Agents (slice 5, D-047): Library → Agents, the ✦ menu in a chat, and what agents leave on a reply.
// Browser preview + offline test AI. Author: CLAUDE, 2026-10-30.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary, openSession, openTab, send } from "./ui.ts";

async function turnOn(page: Page, name: string) {
  const menu = page.getByTestId("agents-menu");
  if (!(await menu.isVisible())) await page.getByTestId("agents-menu-button").click();
  const add = menu.getByRole("button", { name: "+ Turn on another agent…" });
  if (await add.isVisible()) await add.click();
  await menu.getByRole("switch", { name: `${name} in this chat` }).click();
  await expect(menu.getByRole("switch", { name: `${name} in this chat` })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
}

test("Library → Agents: the starter examples in a table, a list view, and an editor that saves by itself", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Agents");
  const table = page.getByTestId("agent-table");
  await expect(table.getByTestId("agent-row")).toHaveCount(8);
  await page.getByRole("radio", { name: "Choices" }).click();
  await expect(table.getByTestId("agent-row")).toHaveCount(1);
  await expect(table.getByTestId("agent-row")).toContainText("CYOA Choices");
  await page.getByRole("radio", { name: /^All/ }).click();
  await table.getByTestId("agent-row").filter({ hasText: "Prose Polisher" }).click();
  const editor = page.getByTestId("agent-editor");
  await expect(editor.getByLabel("Agent name")).toHaveValue("Prose Polisher");
  await editor.getByLabel("Agent name").fill("Line Editor");
  await expect(editor.getByTestId("agent-save-state")).toHaveText("✓ Saved");
  await editor.getByRole("button", { name: "Close" }).click();
  await expect(table.getByTestId("agent-row").filter({ hasText: "Line Editor" })).toHaveCount(1);
  await page.getByTestId("agents-view-list").click();
  await expect(page.getByTestId("agent-list")).toContainText("Rewrites the reply");
  await expect(page.getByTestId("agent-list")).toContainText("Line Editor");
});

test("a new agent of the 'adds rules' kind goes into the prompt as written", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Agents");
  await page.getByRole("button", { name: "New Agent" }).click();
  const editor = page.getByTestId("agent-editor");
  await editor.getByLabel("Agent name").fill("Rain");
  await editor.getByLabel("Agent instructions").fill("It is raining on {{user}}.");
  await expect(editor.getByTestId("agent-save-state")).toHaveText("✓ Saved");
  await openSession(page);
  await turnOn(page, "Rain");
  await openTab(page, "prompt");
  await page.getByRole("button", { name: "Preview Prompt", exact: true }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("It is raining on User.");
});

test("choices become buttons and a click sends them; a note waits under the reply", async ({ page }) => {
  await page.goto("/");
  await turnOn(page, "CYOA Choices");
  await turnOn(page, "Continuity");
  await expect(page.getByTestId("agents-menu-button")).toHaveAccessibleName("Agents: 2 on in this chat");
  await send(page, "I look at the door.");
  const reply = page.getByTestId("message").last();
  const choices = reply.getByTestId("choices");
  await expect(choices.getByRole("button")).toHaveCount(2, { timeout: 15_000 });
  const notes = reply.getByTestId("agent-notes");
  await expect(notes.getByRole("button", { name: "Continuity" })).toBeVisible();
  await expect(notes.getByRole("note")).toHaveCount(0);
  await notes.getByRole("button", { name: "Continuity" }).click();
  await expect(notes.getByRole("note")).toContainText("Continuity");
  const count = await page.getByTestId("message").count();
  await choices.getByRole("button", { name: "Look around" }).click();
  await expect(page.getByTestId("message")).toHaveCount(count + 2, { timeout: 15_000 });
  await expect(page.getByTestId("message").nth(count)).toContainText("Look around");
});

test("a rewrite leaves a quiet mark beside the name, with Undo", async ({ page }) => {
  await page.goto("/");
  await turnOn(page, "Prose Polisher");
  await send(page, "Hello again.");
  const reply = page.getByTestId("message").last();
  const mark = reply.getByTestId("mark-rewrite");
  await expect(mark).toBeVisible({ timeout: 15_000 });
  await expect(reply.locator(".text")).toContainText("Offline test AI");
  await mark.click();
  await page.getByRole("dialog", { name: /Rewritten by Prose Polisher/ }).getByRole("button", { name: "Undo" }).click();
  await expect(reply.locator(".text")).toContainText("You said: Hello again.");
  await expect(reply.getByTestId("mark-rewrite")).toHaveCount(0);
});

test("a manual agent runs from the ✦ menu and its note stays in the menu", async ({ page }) => {
  await page.goto("/");
  await turnOn(page, "Actor Interview");
  await page.getByTestId("agents-menu-button").click();
  const menu = page.getByTestId("agents-menu");
  await menu.getByRole("button", { name: "Run" }).click();
  await menu.getByRole("button", { name: /Actor Interview/ }).click();
  await expect(menu).toContainText("Offline test AI", { timeout: 15_000 });
  await expect(page.getByTestId("message").last().getByTestId("agent-notes")).toHaveCount(0);
});

test("a story switches an agent on for its chats", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const create = page.getByTestId("new-story");
  await create.getByLabel("Story name").fill("Agents Story");
  await create.getByRole("button", { name: /Narrated adventure/ }).click();
  await create.getByLabel("An empty story").check();
  await create.getByTestId("setup-agents").getByLabel("Don't Write for User").check();
  await create.getByTestId("create-story").click();
  await expect(page.getByTestId("story-setup").getByTestId("setup-agents").getByLabel("Don't Write for User")).toBeChecked();
  await page.getByTestId("play-story").click();
  await page.getByTestId("new-chat-sheet").getByTestId("start-chat").click();
  await expect(page.getByTestId("agents-menu-button")).toHaveAccessibleName("Agents: 1 on in this chat");
});
