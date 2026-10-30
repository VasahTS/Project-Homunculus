// Real prompt output and scope isolation, without model calls. CODEX, D-042.
import { expect, test, type Page, type Locator } from "@playwright/test";
import { newChatWith, openLibrary, openTab } from "./ui.ts";

async function editMain(blocks: Locator, text: string) {
  await blocks.getByRole("button", { name: "Main Prompt", exact: true }).click();
  await blocks.getByRole("textbox", { name: "Text of Main Prompt", exact: true }).fill(text);
  await blocks.getByRole("button", { name: "Apply block", exact: true }).click();
  await expect(blocks.getByRole("textbox", { name: "Text of Main Prompt", exact: true })).toHaveCount(0);
}
async function preview(page: Page) {
  await page.getByRole("button", { name: "Preview Prompt", exact: true }).click();
  const sheet = page.getByTestId("prompt-preview");
  await expect(sheet).toBeVisible();
  return sheet;
}

test("inline chat edits stay local and can resume inheritance", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "prompt");
  const blocks = page.getByTestId("prompt-preset").getByTestId("scoped-prompt-blocks");
  await expect(blocks.getByLabel("Prompt edit scope")).toHaveValue("local");
  await editMain(blocks, "LOCAL PROMPT CHECK for {{user}}.");
  await expect(await preview(page)).toContainText("LOCAL PROMPT CHECK for User.");
  await page.keyboard.press("Escape");
  await blocks.getByRole("button", { name: "Use inherited blocks", exact: true }).click();
  await expect(await preview(page)).not.toContainText("LOCAL PROMPT CHECK");
  await page.keyboard.press("Escape");
  await editMain(blocks, "ANOTHER LOCAL CHECK.");
  await newChatWith(page);
  await openTab(page, "prompt");
  await expect(await preview(page)).not.toContainText("ANOTHER LOCAL CHECK");
});

test("editing the shared preset is explicit and reaches another chat", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "prompt");
  const blocks = page.getByTestId("prompt-preset").getByTestId("scoped-prompt-blocks");
  await blocks.getByLabel("Prompt edit scope").selectOption("preset");
  await editMain(blocks, "SHARED PROMPT CHECK.");
  await newChatWith(page);
  await openTab(page, "prompt");
  await expect(await preview(page)).toContainText("SHARED PROMPT CHECK");
});

test("a Story's block and narrator placement reach its chats; local changes can be restored", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const create = page.getByTestId("new-story");
  await create.getByLabel("Story name").fill("Prompt Inheritance");
  await create.getByRole("button", { name: /Narrated adventure/ }).click();
  await create.getByLabel("An empty story").check();
  await create.getByTestId("create-story").click();
  await editMain(page.getByTestId("story-prompt-blocks"), "STORY PROMPT CHECK.");
  const placement = page.getByTestId("narrator-prompt");
  await placement.getByLabel("Narrator placement").selectOption("system");
  await placement.getByLabel("Also send narrator in chat").check();
  await placement.getByLabel("Narrator depth").fill("0");
  await page.getByTestId("play-story").click();
  await page.getByTestId("new-chat-sheet").getByTestId("start-chat").click();
  await openTab(page, "prompt");
  const prompt = await preview(page);
  await expect(prompt).toContainText("STORY PROMPT CHECK");
  await expect(prompt.locator(".plabel").filter({ hasText: /^Narrator instructions$/ })).toHaveCount(1);
  await expect(prompt.locator(".plabel").filter({ hasText: /^Narrator in chat$/ })).toHaveCount(1);
  await page.keyboard.press("Escape");
  const count = await page.getByTestId("message").count();
  const own = page.getByTestId("prompt-preset").getByTestId("scoped-prompt-blocks");
  await editMain(own, "CHAT OVERRIDE CHECK.");
  await expect(await preview(page)).toContainText("CHAT OVERRIDE CHECK");
  await page.keyboard.press("Escape");
  await own.getByRole("button", { name: "Use inherited blocks", exact: true }).click();
  await expect(await preview(page)).toContainText("STORY PROMPT CHECK");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("message")).toHaveCount(count);
});
