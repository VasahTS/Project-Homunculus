// M4 / M5 (the mouse's side buttons) and Alt+← / Alt+→ everywhere (D-097). Author: CLAUDE, 2026-11-08.
// Playwright can't press the side buttons, so the test sends the same mouse events the WebView gets (button 3 = back, 4 = forward).
import { expect, test, type Page } from "@playwright/test";
import { newChatWith, openLibrary } from "./ui.ts";

const side = (page: Page, button: 3 | 4) => page.evaluate((b) => {
  document.body.dispatchEvent(new MouseEvent("mousedown", { button: b, bubbles: true, cancelable: true }));
  document.body.dispatchEvent(new MouseEvent("mouseup", { button: b, bubbles: true, cancelable: true }));
}, button);

test("M4 closes what is open first, then goes back screen by screen; M5 goes forward", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  await openLibrary(page, "Personas"); // Library (opens on Kits), then Personas: two steps
  await page.getByTestId("library-list").getByRole("button", { name: "Presets", exact: true }).click();
  await expect(page.getByTestId("preset-list")).toBeVisible();

  await side(page, 3);
  await expect(page.getByTestId("persona-list")).toBeVisible();
  await side(page, 3); // Kits
  await side(page, 3);
  await expect(page.getByTestId("messages")).toBeVisible();
  await side(page, 4); await side(page, 4);
  await expect(page.getByTestId("persona-list")).toBeVisible();
  await side(page, 4);
  await expect(page.getByTestId("preset-list")).toBeVisible();

  // back in the chat: a window open on top closes first, and the screen stays
  await side(page, 3); await side(page, 3); await side(page, 3);
  await expect(page.getByTestId("messages")).toBeVisible();
  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("persona-picker")).toBeVisible();
  await side(page, 3);
  await expect(page.getByTestId("persona-picker")).toHaveCount(0);
  await expect(page.getByTestId("messages")).toBeVisible();
  // a popover too
  await page.getByTestId("who-button").click();
  await expect(page.getByTestId("who-pop")).toBeVisible();
  await side(page, 3);
  await expect(page.getByTestId("who-pop")).toHaveCount(0);
  await expect(page.getByTestId("messages")).toBeVisible();

  // Alt+← / Alt+→ do the same outside text boxes
  await page.locator("body").click({ position: { x: 5, y: 400 } });
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.getByTestId("messages")).toHaveCount(0);
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page.getByTestId("messages")).toBeVisible();
});
