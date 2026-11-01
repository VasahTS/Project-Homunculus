// Click tests (D-068): portrait cards with a size, a search that finds folders, and Folders · Everything.
// Author: CLAUDE, 2026-11-01.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary } from "./ui.ts";

async function newFolder(page: Page, name: string) {
  await page.getByTestId("new-folder").click();
  await page.getByLabel("New folder name").fill(name);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("folder-tile").filter({ hasText: name })).toBeVisible();
}

test("Characters: portrait cards in three sizes; the search finds folders; Everything ignores them", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  const grid = page.locator(".gallery-grid").first();
  await expect(grid).toHaveClass(/portrait size-m/);
  const pic = page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).locator(".card-pic");
  const m = (await pic.boundingBox())!;
  expect(Math.round((m.height / m.width) * 10) / 10).toBe(1.5); // 2:3, the whole portrait
  await page.getByTestId("size-s").click();
  await expect(grid).toHaveClass(/size-s/);
  expect((await pic.boundingBox())!.width).toBeLessThan(m.width);
  await page.getByTestId("size-l").click();
  expect((await pic.boundingBox())!.width).toBeGreaterThan(m.width);

  // put Lyra in RPG › Iron Party
  await newFolder(page, "RPG");
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  await page.getByTestId("character-sheet").getByLabel("Folder").selectOption({ label: "RPG" });
  await page.getByTestId("folder-tile").filter({ hasText: "RPG" }).click();
  await newFolder(page, "Iron Party");
  await page.getByTestId("character-sheet").getByLabel("Folder").selectOption({ label: "  Iron Party" });
  await page.getByTestId("folders").getByRole("button", { name: "All" }).click();
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toHaveCount(0);

  // a folder's name finds the folder and what is in it
  await page.getByLabel("Search characters").fill("iron");
  const hits = page.getByTestId("folder-hits");
  await expect(hits).toContainText("RPG › Iron Party");
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toContainText("in RPG › Iron Party");
  await hits.getByRole("button", { name: /Iron Party/ }).click();
  await expect(page.getByLabel("Search characters")).toHaveValue("");
  await expect(page.getByTestId("folders")).toContainText("All›RPG›Iron Party");
  await page.getByTestId("folders").getByRole("button", { name: "All" }).click();

  // Everything: one list, folders ignored, each card says where it lives; remembered
  await page.getByTestId("view-everything").click();
  await expect(page.getByTestId("folder-tile")).toHaveCount(0);
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toContainText("in RPG › Iron Party");
  await page.locator(".collection-page").first().screenshot({ path: "e2e/.results/collections-everything.png" });
  await page.reload();
  await openLibrary(page, "Characters");
  await expect(page.getByTestId("view-everything")).toHaveAttribute("aria-checked", "true");
  await expect(grid).toHaveClass(/size-l/);
});

test("Vault NPCs: Everything and the size are there too, and remembered apart from Characters", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "NPCs");
  await page.getByRole("button", { name: "New NPC" }).click();
  await page.getByTestId("npc-sheet").getByLabel("NPC name").fill("Old Tom");
  await page.getByTestId("npc-sheet").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-npcs")).toContainText("Old Tom");
  await page.getByTestId("view-everything").click();
  await expect(page.getByTestId("vault-npcs")).toContainText("not in a folder");
  await page.getByTestId("size-s").click();
  await expect(page.locator(".gallery-grid").first()).toHaveClass(/portrait size-s/);
  await openLibrary(page, "Characters");
  await expect(page.getByTestId("view-folders")).toHaveAttribute("aria-checked", "true");
});
