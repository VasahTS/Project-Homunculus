// Click tests of slice 2: presets (blocks, order, switches, depth), Preview Prompt, the context limit,
// SillyTavern import/export. Author: CLAUDE, 2026-10-28.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary, openSession, openTab, send } from "./ui.ts";

const editor = (page: Page) => page.getByLabel("Preset editor");
async function openPresets(page: Page) {
  await openLibrary(page, "Presets");
}

test("the default preset: blocks can be switched, moved and added; the next reply follows it", async ({ page }) => {
  await page.goto("/");
  await openPresets(page);
  await expect(page.getByTestId("preset-list")).toContainText("Homunculus Defaultdefault");
  await page.getByTestId("preset-list").getByRole("button", { name: "Homunculus Default" }).click();
  const blocks = editor(page).getByTestId("preset-block");
  await expect(blocks).toHaveCount(12);
  await editor(page).getByRole("switch", { name: "Char Personality on" }).click();
  // keyboard: focus the handle, Arrow Up moves the block one place up
  await editor(page).getByRole("button", { name: "Reorder Char Description" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(blocks.nth(1)).toContainText("Char Description");
  await expect(editor(page).getByRole("button", { name: "Reorder Char Description" })).toBeFocused();
  await editor(page).getByRole("button", { name: "+ New Block" }).click();
  await editor(page).getByLabel("Block name").fill("Rhyme rule");
  await editor(page).getByLabel("Block text").fill("Always answer in rhyme, {{user}}.");
  await editor(page).getByLabel("Block place").selectOption("depth");
  await editor(page).getByLabel("Block depth").fill("0");
  await page.screenshot({ path: "e2e/.results/preset-editor.png" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();

  await openSession(page);
  await openTab(page, "prompt");
  await page.getByPlaceholder(/Write your message/).fill("Hello there");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  const preview = page.getByTestId("prompt-preview");
  await expect(preview).toContainText("Homunculus Default");
  await expect(preview).toContainText("Preset: Rhyme rule");
  await expect(preview).not.toContainText("Personality:");
  await preview.locator("summary", { hasText: "Preset: Rhyme rule" }).click();
  await expect(preview).toContainText("Always answer in rhyme, User.");
  await page.screenshot({ path: "e2e/.results/prompt-preview.png" });
  // the search finds text inside the prompt
  await preview.getByLabel("Find in the prompt").fill("rhyme");
  await expect(preview.locator(".pentry:not(.filtered)")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);

  await send(page, "Hello there");
  await page.getByTestId("receipt").click();
  await expect(page.getByTestId("reply-preset")).toHaveText("Homunculus Default");
  await page.getByRole("button", { name: "Open the full prompt" }).click();
  await expect(page.getByTestId("reply-prompt")).toContainText("Always answer in rhyme, User.");
});

test("blocks can be dragged into a new order, in the editor and in the Prompt tab", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "prompt");
  // round 3: the character sits on top of the Prompt tab; fold it (one line) to have the preset in view
  await page.getByTestId("prompt-character-toggle").click();
  await expect(page.getByTestId("prompt-character-field")).toHaveCount(0); // folded (after its animation)
  const quick = page.getByTestId("prompt-preset").locator(".sortable-item");
  await expect(quick.nth(0)).toContainText("Main Prompt");
  // drag "Main Prompt" by its handle below "Char Description" (the 3rd row)
  const grip = page.getByTestId("prompt-preset").getByRole("button", { name: "Reorder Main Prompt" });
  const target = quick.nth(2);
  const g = (await grip.boundingBox())!;
  const t = (await target.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y + 20, { steps: 4 });
  await page.mouse.move(g.x + g.width / 2, t.y + t.height * 0.75, { steps: 8 });
  await page.mouse.up();
  await expect(quick.nth(2)).toContainText("Main Prompt");
  await expect(quick.nth(0)).toContainText("World Info (before)");
  // the preset itself changed: the editor shows the same order
  await page.getByRole("button", { name: "Edit Preset" }).click();
  await expect(editor(page).getByTestId("preset-block").nth(2)).toContainText("Main Prompt");
  // and clicking a block's name in the Prompt tab opens it in the editor
  await openSession(page);
  await openTab(page, "prompt");
  await page.getByTestId("prompt-preset").getByRole("button", { name: "Char Personality", exact: true }).click();
  await expect(editor(page).getByLabel("Block name")).toHaveValue("Char Personality");
});

test("a block switched off in the Prompt tab is left out", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "prompt");
  await page.getByTestId("prompt-preset").getByRole("switch", { name: "Char Description on" }).click();
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await expect(page.getByTestId("prompt-preview")).not.toContainText("Description:");
  await expect(page.getByTestId("prompt-preview")).toContainText("Personality:");
  await page.getByTestId("prompt-preview").getByRole("button", { name: "Close" }).click();
  await page.getByTestId("prompt-preset").getByRole("switch", { name: "Char Description on" }).click();
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await page.getByTestId("prompt-preview").getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("Description:");
});

test("the context limit leaves out the oldest messages, and the Reply tab says so", async ({ page }) => {
  await page.goto("/");
  await openPresets(page);
  await page.getByTestId("preset-list").getByRole("button", { name: "Homunculus Default" }).click();
  await editor(page).getByLabel("Context size").fill("1400");
  await editor(page).getByLabel("Preset Max Length").fill("600");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await openSession(page);
  await send(page, "A long message ".repeat(80));
  await send(page, "Another one ".repeat(100));
  await page.getByTestId("receipt").click();
  await expect(page.getByTestId("reply-budget")).toContainText("older message(s) left out");
  await expect(page.getByTestId("reply-note").first()).toContainText("left out to fit the context size");
});

test("a SillyTavern preset imports, is picked per session, and exports back", async ({ page }) => {
  await page.goto("/");
  await openPresets(page);
  const st = {
    temperature: 0.8, openai_max_context: 8000, openai_max_tokens: 400, squash_system_messages: false,
    prompts: [
      { identifier: "main", name: "Main Prompt", system_prompt: true, role: "system", content: "Narrate for {{char}} in second person." },
      { identifier: "charDescription", name: "Char Description", system_prompt: true, marker: true },
      { identifier: "chatHistory", name: "Chat History", system_prompt: true, marker: true },
      { identifier: "jailbreak", name: "Post-History Instructions", system_prompt: true, role: "system", content: "Keep it short." },
    ],
    prompt_order: [{ character_id: 100001, order: [
      { identifier: "main", enabled: true }, { identifier: "charDescription", enabled: true }, { identifier: "chatHistory", enabled: true }, { identifier: "jailbreak", enabled: true },
    ] }],
  };
  await page.getByTestId("preset-import-input").setInputFiles([{ name: "Second Person.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(st)) }]);
  await expect(page.getByTestId("notice")).toContainText("Imported 1 preset(s): Second Person");
  await expect(editor(page).getByTestId("preset-block")).toHaveCount(4);
  await expect(editor(page).getByLabel("Preset Temperature")).toHaveValue("0.8");

  await openSession(page);
  await openTab(page, "prompt");
  await page.getByLabel("Session preset").selectOption({ label: "Second Person" });
  await expect(page.getByTestId("preset-overrides")).toContainText("temperature 0.8");
  await send(page, "Hi");
  await page.getByTestId("receipt").click();
  await expect(page.getByTestId("reply-preset")).toHaveText("Second Person");
  await expect(page.getByTestId("reply-pane").locator(".row", { hasText: "Temperature" })).toContainText("0.8");
  await page.getByRole("button", { name: "Open the full prompt" }).click();
  await expect(page.getByTestId("reply-prompt")).toContainText("Narrate for Lyra in second person.");
  await page.getByTestId("reply-prompt").getByRole("button", { name: "Close" }).click();

  await openPresets(page);
  await page.getByTestId("preset-list").getByRole("button", { name: "Second Person" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export for SillyTavern" }).click();
  expect((await download).suggestedFilename()).toBe("Second Person.json");
  await expect(page.getByTestId("notice")).toContainText("Exported Second Person");
});

test("presets go to the Trash; the default one can't", async ({ page }) => {
  await page.goto("/");
  await openPresets(page);
  await page.getByRole("button", { name: "New Preset" }).click();
  await editor(page).getByLabel("Preset name").fill("Scratch");
  await page.getByRole("button", { name: "Create Preset" }).click();
  await expect(page.getByTestId("preset-list")).toContainText("Scratch");
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByTestId("preset-list")).not.toContainText("Scratch");
  await openLibrary(page, "Trash");
  await expect(page.getByTestId("trash-list")).toContainText("Scratch");
  await openPresets(page);
  await page.getByTestId("preset-list").getByRole("button", { name: "Homunculus Default" }).click();
  await expect(editor(page).getByRole("button", { name: "Move to Trash" })).toHaveCount(0);
});
