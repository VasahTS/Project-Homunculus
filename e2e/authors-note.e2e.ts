// Click tests of the Author's Note (canvas "Homunculus 2 — Author's Note", version A with folding). Author: CLAUDE, 2026-10-29.
import { expect, test, type Page } from "@playwright/test";
import { openTab, send } from "./ui.ts";

async function writeNote(page: Page, text: string) {
  const box = page.getByTestId("authors-note").getByLabel("Author's Note");
  await box.fill(text);
  await box.blur();
}

test("a note in the Prompt tab goes into the prompt, shows where it sits in the chat, and folds", async ({ page }) => {
  await page.goto("/");
  await send(page, "Hello");
  await send(page, "Who are you?");
  await openTab(page, "prompt");
  await writeNote(page, "Keep the tone tense, {{user}}.");
  // where it goes in the chat: 4 messages before the end
  const mark = page.getByTestId("authors-note-mark");
  await expect(mark).toContainText("Author's Note goes here · 4 messages back");
  const items = page.locator("[data-testid=messages] > li");
  await expect(items.nth(1)).toHaveAttribute("class", /an-mark-li/); // 5 messages: before the 2nd

  // folding: one line with the note and how it is sent; remembered
  await page.getByTestId("authors-note-toggle").click();
  await expect(page.getByTestId("authors-note-summary")).toContainText("Keep the tone tense");
  await expect(page.getByTestId("authors-note-summary")).toContainText("every turn · in the chat, 4 back · System");
  await page.getByTestId("authors-note-summary").click();
  await expect(page.getByTestId("authors-note").getByLabel("Author's Note")).toBeVisible();

  // the next reply's prompt has it
  await send(page, "Go on");
  await openTab(page, "reply");
  await expect(page.getByTestId("reply-pane")).toContainText("Author's Note");
});

test("sent every 2 of your messages; after the main prompt; as User", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "prompt");
  await writeNote(page, "Remember the map.");
  const group = page.getByTestId("authors-note");
  await group.getByLabel("Sent every how many of your messages").fill("2");
  await group.getByLabel("Where the note goes").selectOption("afterMain");
  await expect(group.getByLabel("Messages before the end")).toHaveCount(0);
  await group.getByLabel("Sent as").selectOption("user");
  await expect(page.getByTestId("authors-note-mark")).toHaveCount(0); // not in the chat
  await page.getByTestId("authors-note-toggle").click();
  await expect(page.getByTestId("authors-note-summary")).toContainText("every 2 of your messages · after the main prompt · User");
});

test("Settings → Defaults gives chats a note; a chat shows where it comes from", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-defaults").click();
  const def = page.getByTestId("default-authors-note");
  await expect(def).toContainText("Author's Note for New Chats");
  await def.getByLabel("Author's Note").fill("Default note.");
  await def.getByLabel("Author's Note").blur();
  await page.waitForTimeout(800);
  // the chat (1:1) inherits it
  await page.getByTestId("session-list").getByRole("button").first().click();
  await openTab(page, "prompt");
  await expect(page.getByTestId("authors-note").getByLabel("Author's Note")).toHaveValue("Default note.");
  await expect(page.getByTestId("authors-note")).toContainText("from Settings → Defaults");
});

test("a story's note reaches its chats; a chat can change it and go back to the story's", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New story", exact: true }).click();
  const sheet = page.getByTestId("new-story");
  await sheet.getByLabel("Story name").fill("Mill Road");
  await sheet.getByRole("button", { name: /Narrated adventure/ }).click();
  await sheet.getByLabel("An empty story").check();
  await sheet.getByTestId("create-story").click();
  await expect(page.getByTestId("story-page")).toBeVisible();
  const storyNote = page.getByTestId("story-authors-note");
  await storyNote.getByLabel("Author's Note").fill("The road is cursed.");
  await storyNote.getByLabel("Author's Note").blur();
  await page.waitForTimeout(900); // the story page saves by itself
  await page.screenshot({ path: "e2e/.results/authors-note-story.png" });
  await page.getByTestId("play-story").click();
  await page.getByTestId("new-chat-sheet").getByTestId("start-chat").click();
  await expect(page.getByTestId("messages")).toBeVisible();
  await page.getByTestId("tab-prompt").click();
  const chatNote = page.getByTestId("authors-note");
  await expect(chatNote.getByLabel("Author's Note")).toHaveValue("The road is cursed.");
  await expect(chatNote).toContainText("from the story");
  await chatNote.getByLabel("Author's Note").fill("Only this chat: the road is safe.");
  await chatNote.getByLabel("Author's Note").blur();
  await expect(chatNote).toContainText("changed in this chat");
  await chatNote.getByRole("button", { name: "Use the story's" }).click();
  await expect(chatNote.getByLabel("Author's Note")).toHaveValue("The road is cursed.");
});
