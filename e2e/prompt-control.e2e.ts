// Real prompt output and scope isolation, without model calls. CODEX, D-042; CLAUDE, D-046 (shared preset by
// default, "Only this chat…" as the quiet second choice, text that saves itself, no Apply/Cancel).
import { expect, test, type Page, type Locator } from "@playwright/test";
import { newChatWith, openLibrary, openTab } from "./ui.ts";

async function editMain(blocks: Locator, text: string) {
  const name = blocks.getByRole("button", { name: "Main Prompt", exact: true });
  await name.click();
  await blocks.getByRole("textbox", { name: "Text of Main Prompt", exact: true }).fill(text);
  await name.click(); // closing the block saves it
  await expect(blocks.getByRole("textbox", { name: "Text of Main Prompt", exact: true })).toHaveCount(0);
}
async function setScope(blocks: Locator, scope: "local" | "preset") {
  const line = blocks.getByTestId("prompt-scope");
  if (await line.getAttribute("data-scope") === scope) return;
  await line.getByRole("button").click();
  await expect(line).toHaveAttribute("data-scope", scope);
}
async function preview(page: Page) {
  await page.getByRole("button", { name: "Preview Prompt", exact: true }).click();
  const sheet = page.getByTestId("prompt-preview");
  await expect(sheet).toBeVisible();
  return sheet;
}

for (const scope of ["local", "preset"]) {
  test(`closing a ${scope} block saves its text without Apply`, async ({ page }) => {
    await page.goto("/"); await openTab(page, "prompt");
    const blocks = page.getByTestId("scoped-prompt-blocks");
    await setScope(blocks, scope as "local" | "preset");
    const name = blocks.getByRole("button", { name: "Main Prompt", exact: true });
    const text = blocks.getByRole("textbox", { name: "Text of Main Prompt", exact: true });
    await name.click(); await text.fill(`SAVED ON CLOSE ${scope}.`);
    await name.click(); await expect(text).toHaveCount(0);
    await name.click(); await expect(text).toHaveValue(`SAVED ON CLOSE ${scope}.`);
    await expect(await preview(page)).toContainText(`SAVED ON CLOSE ${scope}.`);
  });
}

test("leaving Prompt with an open edit saves it; Undo changes restores the text it was opened with", async ({ page }) => {
  await page.goto("/"); await openTab(page, "prompt");
  const blocks = page.getByTestId("scoped-prompt-blocks");
  const name = blocks.getByRole("button", { name: "Main Prompt", exact: true });
  const text = blocks.getByRole("textbox", { name: "Text of Main Prompt", exact: true });
  await name.click(); await text.fill("SAVED WHEN LEAVING PROMPT.");
  await openTab(page, "scene"); await openTab(page, "prompt");
  if (await text.count() === 0) await name.click();
  await expect(text).toHaveValue("SAVED WHEN LEAVING PROMPT.");
  await name.click(); await name.click(); // reopen: Undo goes back to the text the block was opened with
  await text.fill("UNDO THIS EDIT.");
  await blocks.getByRole("button", { name: "Undo changes", exact: true }).click();
  await expect(text).toHaveValue("SAVED WHEN LEAVING PROMPT.");
  await name.click(); await name.click(); await expect(text).toHaveValue("SAVED WHEN LEAVING PROMPT.");
});

test("typing saves by itself after a short pause", async ({ page }) => {
  await page.goto("/"); await openTab(page, "prompt");
  const blocks = page.getByTestId("scoped-prompt-blocks");
  await blocks.getByRole("button", { name: "Main Prompt", exact: true }).click();
  await blocks.getByRole("textbox", { name: "Text of Main Prompt", exact: true }).fill("SAVED WHILE TYPING.");
  await expect(blocks.locator(".inline-prompt-foot").getByRole("status")).toContainText("Saved to");
});

test("switching scope saves the pending text in its original scope", async ({ page }) => {
  await page.goto("/"); await openTab(page, "prompt");
  const blocks = page.getByTestId("scoped-prompt-blocks");
  await setScope(blocks, "local");
  const name = blocks.getByRole("button", { name: "Main Prompt", exact: true });
  const text = blocks.getByRole("textbox", { name: "Text of Main Prompt", exact: true });
  await name.click(); await text.fill("LOCAL BEFORE SCOPE SWITCH.");
  await setScope(blocks, "preset");
  await name.click(); await expect(text).not.toHaveValue("LOCAL BEFORE SCOPE SWITCH.");
  await setScope(blocks, "local");
  await name.click(); await expect(text).toHaveValue("LOCAL BEFORE SCOPE SWITCH.");
});

test("Preview Prompt directly after typing uses the pending text", async ({ page }) => {
  await page.goto("/"); await openTab(page, "prompt");
  const blocks = page.getByTestId("scoped-prompt-blocks");
  await blocks.getByRole("button", { name: "Main Prompt", exact: true }).click();
  await blocks.getByRole("textbox", { name: "Text of Main Prompt", exact: true }).fill("PENDING TEXT IN PREVIEW.");
  await expect(await preview(page)).toContainText("PENDING TEXT IN PREVIEW.");
});

test("inline chat edits stay local and can resume inheritance", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "prompt");
  const blocks = page.getByTestId("prompt-preset").getByTestId("scoped-prompt-blocks");
  await expect(blocks.getByTestId("prompt-scope")).toHaveAttribute("data-scope", "preset"); // the shared preset is the default
  await setScope(blocks, "local");
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

test("editing the shared preset is the default and reaches another chat", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "prompt");
  const blocks = page.getByTestId("prompt-preset").getByTestId("scoped-prompt-blocks");
  await editMain(blocks, "SHARED PROMPT CHECK.");
  await newChatWith(page);
  await openTab(page, "prompt");
  await expect(await preview(page)).toContainText("SHARED PROMPT CHECK");
});

test("a Story inherits its preset; quiet narrator placement stays with the narrator and reaches its chats", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "prompt");
  const shared = page.getByTestId("scoped-prompt-blocks");
  await editMain(shared, "STORY PROMPT CHECK.");
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const create = page.getByTestId("new-story");
  await create.getByLabel("Story name").fill("Prompt Inheritance");
  await create.getByRole("button", { name: /Narrated adventure/ }).click();
  await create.getByLabel("An empty story").check();
  await create.getByTestId("create-story").click();
  await expect(page.getByTestId("story-prompt-blocks")).toHaveCount(0);
  await expect(page.getByTestId("scoped-prompt-blocks")).toHaveCount(0);
  const placement = page.getByTestId("story-narrator").getByTestId("narrator-prompt");
  await expect(placement.getByLabel("Narrator placement")).toBeHidden();
  await expect(placement.locator("summary")).toContainText("Card");
  await placement.locator("summary").focus();
  await page.keyboard.press("Space");
  await placement.getByLabel("Narrator placement").selectOption("system");
  await placement.getByLabel("Also send narrator in chat").check();
  await placement.getByLabel("Narrator depth").fill("0");
  await placement.locator("summary").click();
  await expect(placement.locator("summary")).toContainText("System + in chat");
  await expect(placement.getByLabel("Narrator depth")).toBeHidden();
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
  await setScope(own, "local");
  await editMain(own, "CHAT OVERRIDE CHECK.");
  await expect(await preview(page)).toContainText("CHAT OVERRIDE CHECK");
  await page.keyboard.press("Escape");
  await own.getByRole("button", { name: "Use inherited blocks", exact: true }).click();
  await expect(await preview(page)).toContainText("STORY PROMPT CHECK");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("message")).toHaveCount(count);
});
