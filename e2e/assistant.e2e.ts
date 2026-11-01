// Click tests of the Assistant mode (D-062), with the offline test AI's tiny tool script. Author: CLAUDE, 2026-11-01.
import { expect, test } from "@playwright/test";

test("Assistant: switch mode, make a tracker, undo it; add context and make a Kit; customize rules", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await expect(page.getByTestId("assistant")).toContainText("What shall we make?".slice(0, 0));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
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
  await page.getByTestId("assistant-add-context").click();
  await page.getByTestId("assistant-picker").getByRole("button", { name: /Lyra/ }).first().click();
  await page.getByTestId("assistant-picker-add").click();
  await expect(page.getByTestId("assistant-composer")).toContainText("Lyra");
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Make a Kit with her at the old mill");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-result").first()).toContainText("Kit · created");
  await expect(page.getByTestId("assistant-messages")).toContainText("Lyra");

  // a change waits for an OK
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
  await page.getByTestId("pick-assistant").click();
  await page.getByRole("dialog", { name: "Assistant" }).getByRole("button", { name: /Card Smith/ }).click();
  await expect(page.getByTestId("pick-assistant")).toContainText("Card Smith");
  await page.getByTestId("pick-context").click();
  await expect(page.getByRole("dialog", { name: "Context and spending" })).toContainText("Card Smith");
  await page.keyboard.press("Escape");

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
