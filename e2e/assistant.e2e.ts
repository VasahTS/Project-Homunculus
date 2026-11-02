// Click tests of the Assistant mode (D-062), with the offline test AI's tiny tool script. Author: CLAUDE, 2026-11-01.
import { expect, test } from "@playwright/test";

test("Assistant: switch mode, make a tracker, undo it; add context and make a Kit; customize rules", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await expect(page.getByTestId("assistant")).toContainText("What shall we make?".slice(0, 0));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Assistant");
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Make a world tracker with time, weather and place");
  await page.getByTestId("assistant-send").click();
  const card = page.getByTestId("assistant-result").first();
  await expect(card).toContainText("World");
  await expect(card).toContainText("Tracker · created");
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Done (offline test AI)");
  await expect(page.getByTestId("assistant-chats")).toContainText("Make a world tracker");
  await card.getByRole("button", { name: "Undo" }).click();
  await expect(card).toContainText("removed");

  // a new chat with a character as context → a Kit
  await page.getByTestId("assistant-new").click();
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-context").click();
  await page.getByTestId("assistant-picker").getByRole("button", { name: /Lyra/ }).first().click();
  await page.getByTestId("assistant-picker-add").click();
  await expect(page.getByTestId("assistant-composer")).toContainText("Lyra");
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Make a Kit with her at the old mill");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-result").first()).toContainText("Kit · created");
  await expect(page.getByTestId("assistant-messages")).toContainText("Lyra");

  // a change waits for an OK
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-context").click();
  await page.getByTestId("assistant-picker").getByRole("button", { name: /Lyra/ }).first().click();
  await page.getByTestId("assistant-picker-add").click();
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Improve her description");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-reply")).toHaveCount(2);
  await expect(page.getByTestId("assistant-send")).toBeVisible();
  const change = page.getByTestId("assistant-result").last();
  await change.getByTestId("assistant-see-change").click();
  await expect(change).toContainText("eleven winters");
  await change.getByTestId("assistant-apply").click();
  await expect(change).toContainText("Applied");

  // the picks under the message box: another assistant for this chat; the context meter
  await page.getByTestId("assistant-options").click();
  await page.getByTestId("pick-assistant").click();
  await page.getByRole("radiogroup", { name: "Assistant" }).getByRole("radio", { name: /Card Smith/ }).click();
  await expect(page.getByTestId("pick-assistant")).toContainText("Card Smith");
  await expect(page.getByTestId("assistant-summary")).toContainText("Card Smith");
  await page.keyboard.press("Escape");
  await page.getByTestId("pick-context").click();
  await expect(page.getByRole("dialog", { name: "Context and spending" })).toContainText("Card Smith");
  await page.keyboard.press("Escape");

  // Details: context, what it is using, files, tools, activity; message actions
  await expect(page.getByTestId("assistant-details")).toBeVisible();
  await expect(page.getByTestId("det-using")).toContainText("Card Smith");
  await expect(page.getByTestId("det-files")).toContainText("Lyra");
  await expect(page.getByTestId("det-activity")).toContainText("Proposed changes");
  await expect(page.getByTestId("assistant-usage").first()).toContainText("tokens not reported");
  await page.getByTestId("assistant-reply").last().hover();
  await page.getByTestId("assistant-regenerate").click();
  await expect(page.getByTestId("assistant-reply")).toHaveCount(2);
  await expect(page.getByTestId("assistant-send")).toBeVisible();
  await page.getByTestId("assistant-chat-menu").click();
  await expect(page.getByRole("dialog", { name: "Chat" })).toContainText("Export as Markdown");
  await page.keyboard.press("Escape");
  await page.getByTestId("assistant-details-toggle").click();
  await expect(page.getByTestId("assistant-details")).toHaveCount(0);

  // Customize: a page with assistants, presets (a rule), limits and usage
  await page.getByTestId("assistant-customize").click();
  await expect(page.getByTestId("cust-assistant")).toHaveCount(5);
  await page.getByTestId("cust-new-assistant").click();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("New assistant");
  await page.getByTestId("cust-presets").click();
  await page.getByTestId("assistant-new-rule").fill("Cards in English.");
  await page.getByTestId("assistant-new-rule").press("Enter");
  await expect(page.getByRole("textbox", { name: "Rule", exact: true })).toHaveValue("Cards in English.");
  await page.getByTestId("cust-limits").click();
  await expect(page.getByTestId("assistant-customize-page")).toContainText("Try again when busy");
  await page.getByTestId("cust-usage").click();
  await expect(page.getByTestId("assistant-customize-page")).toContainText("Tokens");
  await page.getByRole("button", { name: "Done" }).click();

  // back to Play
  await page.getByTestId("mode-switch").getByRole("tab", { name: "Play" }).click();
  await expect(page.getByTestId("place-list")).toBeVisible();
});

test("Folders and versions (D-064): the Assistant puts a character in a party folder (Undo, Redo) and proposes a new version", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-context").click();
  await page.getByTestId("assistant-picker").getByRole("button", { name: /Lyra/ }).first().click();
  await page.getByTestId("assistant-picker-add").click();
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Put her in a party folder inside RPG");
  await page.getByTestId("assistant-send").click();
  const moved = page.getByTestId("assistant-result").first();
  await expect(moved).toContainText("RPG › Offline Party");
  await expect(moved).toContainText("1 moved here · 2 new folders");
  await moved.getByRole("button", { name: "See items" }).click();
  await expect(moved).toContainText("Lyra");
  await moved.getByRole("button", { name: "Undo" }).click();
  await expect(moved).toContainText("Put back where they were");
  await moved.getByRole("button", { name: "Redo" }).click();
  await expect(moved).toContainText("1 moved here");
  await expect(page.getByTestId("assistant-send")).toBeVisible();

  // another version of her, in the same card
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-context").click();
  await page.getByTestId("assistant-picker").getByRole("button", { name: /Lyra/ }).first().click();
  await page.getByTestId("assistant-picker-add").click();
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Make a modern version of her");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-reply")).toHaveCount(2);
  await expect(page.getByTestId("assistant-send")).toBeVisible();
  await expect(page.getByTestId("assistant-result").last()).toContainText("Lyra · versions");
  const change = page.getByTestId("assistant-result").last();
  await change.getByTestId("assistant-see-change").click();
  await expect(change).toContainText("Modern AU");
  await expect(change).toContainText("new version");
  await expect(change).toContainText("bookshop");
  await change.getByTestId("assistant-apply").click();
  await expect(change).toContainText("Applied");

  // the picker now shows where she is and that she has two versions
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-add-context").click();
  await expect(page.getByTestId("assistant-picker").getByRole("button", { name: /Lyra/ }).first()).toContainText("RPG › Offline Party · 2 versions");
  await page.keyboard.press("Escape");

  // and the Library has the folders
  await page.getByTestId("mode-switch").getByRole("tab", { name: "Play" }).click();
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  await expect(page.getByText("1 character · 1 folder")).toBeVisible();
});

test("Draft first: drafts show as cards with Save; nothing is saved until the user does; code blocks have Copy", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await page.getByTestId("assistant-options").click();
  await page.getByTestId("pick-draft").click();
  await expect(page.getByTestId("pick-draft")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("assistant-summary")).toContainText("Drafts");
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Make a mercenary character");
  await page.getByTestId("assistant-send").click();
  const draft = page.getByTestId("assistant-draft");
  await expect(draft).toContainText("Character draft");
  await expect(draft).toContainText("You're short.");
  await expect(page.getByTestId("assistant-result")).toHaveCount(0);
  await draft.getByTestId("assistant-save-draft").click();
  await expect(page.getByTestId("assistant-result")).toContainText("Character · created");
  await expect(draft).toContainText("Saved");
  // it is in the library
  await page.getByTestId("mode-switch").getByRole("tab", { name: "Play" }).click();
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  await expect(page.getByTestId("character-list")).toContainText("Kessa");
});
