// Agents (slice 5, D-047): Library → Agents, the ✦ menu in a chat, and what agents leave on a reply.
// Browser preview + offline test AI. Author: CLAUDE, 2026-10-30.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary, openSession, openTab, send } from "./ui.ts";

async function turnOn(page: Page, name: string) {
  const menu = page.getByTestId("agents-menu");
  if (!(await menu.isVisible())) await page.getByTestId("agents-menu-button").click();
  const sw = menu.getByRole("switch", { name: `${name} in this chat` });
  if (!(await sw.isVisible())) await menu.getByRole("button", { name: /^Off in this chat/ }).click();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
}

test("Library → Agents: the starter examples in a table, a list view, and an editor that saves by itself", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Agents");
  const table = page.getByTestId("agent-table");
  await expect(table.getByTestId("agent-row")).toHaveCount(10);
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
  await expect(choices.locator("button.choice")).toHaveCount(2, { timeout: 15_000 });
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
  await page.getByTestId("diff-sheet").getByRole("button", { name: "Undo all" }).click();
  await expect(reply.locator(".text")).toContainText("You said: Hello again.");
  await expect(reply.getByTestId("mark-rewrite")).toHaveCount(0);
});

test("a manual agent runs from the ✦ panel, its note stays there, and Details shows what it read", async ({ page }) => {
  await page.goto("/");
  await turnOn(page, "Actor Interview");
  await page.getByTestId("agents-menu-button").click();
  const menu = page.getByTestId("agents-menu");
  await expect(menu.getByText("Runs when you ask")).toBeVisible();
  await menu.getByRole("button", { name: "Run Actor Interview" }).click();
  await expect(menu.getByText(/Ran on the last reply/)).toBeVisible({ timeout: 15_000 });
  await menu.getByRole("button", { name: /Actor Interview/ }).first().click();
  await expect(menu).toContainText("Offline test AI");
  await expect(page.getByTestId("message").last().getByTestId("agent-notes")).toHaveCount(0);
  await menu.getByRole("button", { name: "Details · why it did this" }).click();
  const sheet = page.getByTestId("run-sheet");
  await sheet.getByRole("tab", { name: "What it read" }).click();
  await expect(sheet).toContainText("Step outside the story");
  await sheet.getByRole("tab", { name: "Compare" }).click();
  await sheet.getByRole("button", { name: "Compare" }).click();
  await expect(sheet.getByTestId("run-compare")).toContainText("Its own connection", { timeout: 15_000 });
});

test("the panel lists trackers too and shows a tracker running live", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { (globalThis as { __h2AgentDelayMs?: number }).__h2AgentDelayMs = 2500; });
  await turnOn(page, "Scene: World");
  await page.getByPlaceholder(/Write your message/).fill("Where are we?");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByTestId("agents-menu-button").click();
  const menu = page.getByTestId("agents-menu");
  await expect(menu.getByText(/Running…/)).toBeVisible({ timeout: 15_000 });
  await expect(menu.getByText(/Ran on the last reply/)).toBeVisible({ timeout: 20_000 });
});

test("a story switches an agent on for its chats", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const create = page.getByTestId("new-story");
  await create.getByLabel("Story name").fill("Agents Story");
  await create.getByRole("button", { name: /Narrated adventure/ }).click();
  await create.getByLabel("An empty story").check();
  await create.getByTestId("setup-agents").getByRole("button", { name: "Choose agents…" }).click();
  await page.getByTestId("setup-agents-sheet").getByLabel("Don't Write for User").check();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("setup-agents-sheet")).toBeHidden();
  await create.getByTestId("create-story").click();
  await expect(page.getByTestId("story-setup").getByTestId("setup-agents-summary")).toContainText("Don't Write for User");
  await page.getByTestId("play-story").click();
  await page.getByTestId("new-chat-sheet").getByTestId("start-chat").click();
  await expect(page.getByTestId("agents-menu-button")).toHaveAccessibleName("Agents: 1 on in this chat");
});

test("a rewrite opens a word-by-word comparison; putting one change back saves that mix", async ({ page }) => {
  await page.goto("/");
  await turnOn(page, "Prose Polisher");
  await send(page, "Hello again.");
  const reply = page.getByTestId("message").last();
  await reply.getByTestId("mark-rewrite").click();
  const sheet = page.getByTestId("diff-sheet");
  await expect(sheet.locator(".df-del").first()).toBeVisible();
  await expect(sheet.locator(".df-ins").first()).toContainText("Offline test AI");
  await sheet.getByRole("tab", { name: "Side by side" }).click();
  await expect(sheet.getByRole("heading", { name: "Original" })).toBeVisible();
  await sheet.getByRole("tab", { name: "Changes" }).click();
  await sheet.getByRole("button", { name: "Put the original words back" }).first().click();
  await expect(sheet.getByRole("button", { name: "Use the rewritten words" })).toHaveCount(1);
  await sheet.getByRole("button", { name: /^Save 1 put back/ }).click();
  await expect(sheet).toHaveCount(0);
  // a mix: part of the original is back, the rest stays rewritten
  await expect(reply.locator(".text")).not.toHaveText(/^\(Offline test AI: no real answer/);
  await expect(reply.getByTestId("mark-rewrite")).toHaveCount(0);
});

test("choices can show as a numbered list or above the message box", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Agents");
  await page.getByTestId("agent-table").getByTestId("agent-row").filter({ hasText: "CYOA Choices" }).click();
  await page.getByRole("radio", { name: "Above the message box" }).click();
  await expect(page.getByTestId("agent-save-state")).toHaveText("✓ Saved");
  await openSession(page);
  await turnOn(page, "CYOA Choices");
  await send(page, "Now what?");
  await expect(page.getByTestId("composer-choices").locator("button.choice")).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId("message").last().getByTestId("choices")).toHaveCount(0);
});

test("a view agent draws its answer with the app's parts", async ({ page }) => {
  await page.goto("/");
  await turnOn(page, "Group Chat");
  await send(page, "I wave at everyone.");
  const view = page.getByTestId("message").last().getByTestId("agent-view");
  await expect(view).toBeVisible({ timeout: 15_000 });
  await expect(view).toContainText("kaito_2A");
});

test("the Lorebook Keeper writes into the story's own version, and See opens it", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const create = page.getByTestId("new-story");
  await create.getByLabel("Story name").fill("Keeper Story");
  await create.getByRole("button", { name: /Narrated adventure/ }).click();
  await create.getByLabel("An empty story").check();
  await create.getByTestId("create-story").click();
  await page.getByTestId("play-story").click();
  await page.getByTestId("new-chat-sheet").getByTestId("start-chat").click();
  await turnOn(page, "Lorebook Keeper");
  await send(page, "I learn the Shura path.");
  await page.getByTestId("agents-menu-button").click();
  await page.getByTestId("agents-menu").getByRole("button", { name: "Run Lorebook Keeper" }).click();
  await expect(page.getByTestId("agents-menu").getByText(/Ran on the last reply/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  const line = page.getByTestId("proposal-line");
  await expect(line).toContainText("added “Offline fact” to this story's lorebook");
  await line.getByRole("button", { name: "See" }).click();
  await expect(page.getByTestId("lore-version-bar")).toContainText("1 change in Keeper Story");
  await expect(page.getByLabel("Lorebook editor").locator(".lv-tag.new")).toHaveCount(1);
});

test("D-057: a note shows its model and runs again with a direction; choices get new options", async ({ page }) => {
  await page.goto("/");
  await turnOn(page, "Continuity");
  await turnOn(page, "CYOA Choices");
  await send(page, "I look at the door.");
  const reply = page.getByTestId("message").last();
  const notes = reply.getByTestId("agent-notes");
  await notes.getByRole("button", { name: "Continuity" }).click({ timeout: 15_000 });
  const note = notes.getByRole("note");
  await expect(note).toContainText("Offline test AI");
  const before = await note.innerText();
  await note.getByTestId("run-again").click();
  await page.getByRole("dialog", { name: "Run again: Continuity" }).getByLabel("Direction for this run").fill("look for the lantern");
  await page.keyboard.press("Enter");
  await expect(note).not.toHaveText(before, { timeout: 15_000 });
  await page.getByTestId("agents-menu-button").click();
  const menu = page.getByTestId("agents-menu");
  await menu.getByRole("button", { name: /Continuity/ }).first().click();
  await expect(menu).toContainText("Last run's direction: “look for the lantern”");
  await page.keyboard.press("Escape");
  const choices = reply.getByTestId("choices");
  await choices.getByTestId("run-again").click();
  await page.keyboard.press("Enter");
  await expect(choices.locator("button.choice")).toHaveCount(2, { timeout: 15_000 });
});

test("D-057: the editor picks a connection for one agent, and a note's switch for the story's AI", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Agents");
  await page.getByTestId("agent-table").getByTestId("agent-row").filter({ hasText: "Continuity" }).click();
  const editor = page.getByTestId("agent-editor");
  await expect(editor.getByLabel("Connection for this agent")).toHaveValue("");
  const sw = editor.getByRole("switch", { name: "The story's AI reads it" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(editor.getByTestId("agent-save-state")).toHaveText("✓ Saved");
});
