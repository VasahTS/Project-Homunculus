// Dragging cards into folders: the card follows the pointer; Ctrl+click picks several (D-055). Author: CLAUDE, 2026-10-30.
import { expect, test } from "@playwright/test";
import { bytesToBase64, setTextChunks, solidPng, utf8 } from "../packages/st-cards/src/index.ts";

const png = (name: string) => Buffer.from(setTextChunks(solidPng(20, 30, [40, 120, 200]), {
  chara: bytesToBase64(utf8.encode(JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: { name, description: "x", first_mes: "Hi." } }))),
}));

test("Ctrl+click picks two cards and one drag moves both into a folder", async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 760 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Characters/ }).first().click();
  await page.getByTestId("import-input").setInputFiles({ name: "Mira.png", mimeType: "image/png", buffer: png("Mira") });
  const list = page.getByTestId("character-list");
  await expect(list.getByRole("button", { name: "Mira" })).toBeVisible();
  await page.getByTestId("new-folder").click();
  await page.getByLabel("New folder name").fill("Fantasy");
  await page.keyboard.press("Enter");
  // like a real hand: the button is held a moment before it is released
  await list.getByRole("button", { name: "Lyra" }).click({ modifiers: ["Control"], delay: 150 });
  await list.getByRole("button", { name: "Mira" }).click({ modifiers: ["Control"], delay: 150 });
  await expect(page.getByTestId("character-sheet")).toContainText("Mira"); // the last plain pick stays; Ctrl+click opened nothing
  await expect(page.locator(".fd-selected")).toHaveCount(2);
  const a = (await list.getByRole("button", { name: "Lyra" }).boundingBox())!;
  const f = (await page.getByTestId("folder-tile").filter({ hasText: "Fantasy" }).boundingBox())!;
  await page.mouse.move(a.x + 60, a.y + 60);
  await page.mouse.down();
  await page.mouse.move(a.x + 200, a.y + 40, { steps: 6 });
  await expect(page.locator(".fd-carry-count")).toHaveText("2");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "e2e/.results/drag-two.png" });
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId("folder-tile").filter({ hasText: "Fantasy" })).toContainText("2 characters");
  await expect(page.locator(".fd-float")).toHaveCount(0, { timeout: 2000 });
});
