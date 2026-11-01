// Click tests of the character editor (D-070): greetings (alternates included) reach a new 1:1 chat as swipes,
// the three layouts (remembered), the Description's <sections>, the token meter. Author: CLAUDE, 2026-11-01.
import { expect, test, type Page } from "@playwright/test";
import { editCharacter, openLibrary } from "./ui.ts";

const editor = (page: Page) => page.getByLabel("Character editor");
const greeting = (page: Page, n: number) => editor(page).getByLabel(`Greeting ${n}`, { exact: true });

test("alternate greetings: add, reorder and make main; a new chat opens with the main one and the others are swipes", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  const main = await greeting(page, 1).inputValue();

  await editor(page).getByRole("button", { name: "+ Add Greeting" }).click();
  await expect(greeting(page, 2)).toBeFocused();
  await greeting(page, 2).fill("*Rain drums on the watchtower roof.* \"You're soaked.\"");
  await expect(editor(page).locator(".ce-dirty")).toHaveText("Unsaved changes");
  // an empty third one is dropped when saving
  await editor(page).getByRole("button", { name: "+ Add Greeting" }).click();
  await editor(page).getByRole("button", { name: "Save" }).click();
  await expect(editor(page).getByText("✓ Saved")).toBeVisible();
  await expect(editor(page).getByRole("button", { name: /^Show greeting \d$/ })).toHaveCount(2);

  // the preview shows it the way a chat does
  await editor(page).getByRole("button", { name: "Show greeting 2", exact: true }).click();
  await editor(page).getByRole("radio", { name: "Preview" }).click();
  await expect(editor(page).getByTestId("greetings").getByTestId("msg-format")).toContainText("You're soaked.");
  await editor(page).getByRole("radio", { name: "Edit" }).click();

  await editor(page).getByRole("button", { name: "Chat Now" }).click();
  const first = page.getByTestId("message").first();
  await expect(first).toContainText(main.replace(/[*"]/g, "").slice(0, 20));
  await expect(page.getByTestId("swipe-counter")).toHaveText("1/2");
  await page.getByRole("button", { name: "Next version" }).click();
  await expect(page.getByTestId("message").first()).toContainText("You're soaked.");
});

test("Make Main moves a greeting to the top; Ctrl+S saves", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  const main = await greeting(page, 1).inputValue();
  await editor(page).getByRole("button", { name: "+ Add Greeting" }).click();
  await greeting(page, 2).fill("The other opening.");
  await editor(page).getByRole("button", { name: "Make Main" }).click();
  await expect(greeting(page, 1)).toHaveValue("The other opening.");
  await editor(page).getByRole("button", { name: "Show greeting 2", exact: true }).click();
  await expect(greeting(page, 2)).toHaveValue(main);
  await page.keyboard.press("Control+s");
  await expect(editor(page).getByText("✓ Saved")).toBeVisible();
});

test("layouts: Sheet, Tabs and Writer show the same card; the choice is remembered", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  const description = editor(page).getByLabel("Description");
  await description.fill("<lyra>\nA wary ranger.\n</lyra>\n\n<thornwood>\nBlack pines.\n</thornwood>");
  const chips = editor(page).getByTestId("description-sections");
  await expect(chips.getByRole("button")).toHaveText([/<lyra>/, /<thornwood>/]);
  await chips.getByRole("button", { name: /<thornwood>/ }).click();
  await expect(description).toBeFocused();
  await expect(editor(page).getByTestId("token-meter")).toContainText("Description");

  await editor(page).getByRole("radio", { name: "Tabs" }).click();
  await expect(editor(page).getByRole("tab", { name: "Character" })).toHaveAttribute("aria-selected", "true");
  await expect(editor(page).getByLabel("Description")).toHaveValue(/Black pines/); // the unsaved edit is kept
  await editor(page).getByRole("tab", { name: /^Greetings/ }).click();
  await expect(editor(page).getByTestId("greetings").getByText("How it looks in a chat")).toBeVisible();
  await page.screenshot({ path: "e2e/.results/character-editor-tabs.png" });

  await editor(page).getByRole("radio", { name: "Writer" }).click();
  await expect(editor(page).getByLabel("Description")).toHaveValue(/Black pines/);
  await expect(editor(page).getByTestId("greetings")).toBeVisible();
  await page.screenshot({ path: "e2e/.results/character-editor-writer.png" });

  await editor(page).getByRole("button", { name: "Save" }).click();
  await page.reload();
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  await expect(editor(page).getByRole("radio", { name: "Writer" })).toHaveAttribute("aria-checked", "true");
});

test("a new character: Greeting 1 can stay empty while an alternate exists, and nothing moves", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await page.getByRole("button", { name: "New Character" }).click();
  await editor(page).getByPlaceholder("e.g. Lyra").fill("Mira");
  await editor(page).getByRole("button", { name: "+ Add Greeting" }).click();
  await greeting(page, 2).fill("Only an alternate.");
  await editor(page).getByRole("button", { name: "Create Character" }).click();
  await expect(editor(page).getByText("✓ Saved")).toBeVisible();
  await expect(greeting(page, 1)).toHaveValue("");
  await editor(page).getByRole("button", { name: "Show greeting 2", exact: true }).click();
  await expect(greeting(page, 2)).toHaveValue("Only an alternate.");
});
