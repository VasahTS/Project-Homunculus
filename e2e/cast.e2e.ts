// Click tests: the Scene's cast works like Homunculus v1 — open in place, Show All / Fold All, drag between
// "In the scene" and "Not in the scene", remove an NPC. Author: CLAUDE, 2026-10-29.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary, openTab, send, setTracker } from "./ui.ts";

const card = (page: Page, name: string) => page.getByTestId("person-card").filter({ has: page.getByTestId("who-block").filter({ hasText: name }) }).first();

async function withNpc(page: Page, name: string) {
  await openLibrary(page, "NPCs");
  await page.getByRole("button", { name: "New NPC" }).click();
  const npc = page.getByTestId("npc-sheet");
  await npc.getByLabel("NPC name").fill(name);
  await npc.getByRole("button", { name: "Save" }).click();
  await page.getByTestId("session-list").getByRole("button").first().click();
  await page.getByTestId("who-button").click();
  await page.getByLabel("Add an NPC to this chat").selectOption({ label: name });
  await page.keyboard.press("Escape");
}

test("cast: people open in place, Show All / Fold All, drag out of the scene and back, remove an NPC", async ({ page }) => {
  await page.goto("/");
  await withNpc(page, "Old Tom");
  await openTab(page, "scene");
  await setTracker(page, "Scene: Characters");
  await send(page, "We walk into the forest.");
  const scene = page.getByTestId("scene");
  await expect(scene.getByTestId("cast-group-here")).toContainText("In the scene");
  await expect(card(page, "Lyra")).toBeVisible();
  await expect(card(page, "Old Tom")).toBeVisible();

  // a click opens the person right under the row (no other page); a second click folds them
  await card(page, "Lyra").getByTestId("who-block").click();
  await expect(card(page, "Lyra").getByTestId("person-page")).toBeVisible();
  await expect(scene.getByTestId("cast-group-here")).toBeVisible(); // the list is still there
  await card(page, "Lyra").getByTestId("who-block").click();
  await expect(scene.getByTestId("person-page")).toHaveCount(0);

  // Show All / Fold All
  await scene.getByTestId("fold-all").click();
  await expect(scene.getByTestId("person-page")).toHaveCount(await scene.getByTestId("person-card").count());
  await expect(scene.getByTestId("fold-all")).toHaveText(/Fold All/);
  await scene.getByTestId("fold-all").click();
  await expect(scene.getByTestId("person-page")).toHaveCount(0);

  // drag Lyra (pointer, by her ⋮⋮) under "Not in the scene": she leaves the scene
  const grip = card(page, "Lyra").getByRole("button", { name: "Reorder Lyra" });
  await card(page, "Lyra").hover();
  const g = (await grip.boundingBox())!;
  const away = (await scene.getByTestId("cast-group-away").boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(g.x + g.width / 2, g.y + (away.y + away.height + 30 - g.y) * (i / 12));
  await page.mouse.up();
  await expect(scene.getByTestId("cast-group-away")).toContainText("Not in the scene · 1");
  await expect(card(page, "Lyra")).toHaveClass(/away/);
  await page.mouse.move(0, 0);
  await scene.screenshot({ path: "e2e/.results/cast-away.png" });
  // the change is the user's at this message (the tracker's value says "away")
  await card(page, "Lyra").getByTestId("who-block").click();
  await expect(card(page, "Lyra").locator('[data-field="present"]')).toContainText("away");
  await card(page, "Lyra").getByTestId("who-block").click();

  // and back with the keyboard: focus her ⋮⋮, arrow up past the title
  await card(page, "Lyra").hover();
  await card(page, "Lyra").getByRole("button", { name: "Reorder Lyra" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(card(page, "Lyra")).not.toHaveClass(/away/);
  await expect(scene.getByTestId("cast-group-away")).toContainText("Not in the scene · 0");

  // remove the NPC from the cast (asks once)
  await card(page, "Old Tom").hover();
  await card(page, "Old Tom").getByTestId("remove-person").click();
  await card(page, "Old Tom").getByRole("button", { name: "Confirm: remove Old Tom" }).click();
  await expect(scene.getByTestId("person-card").filter({ hasText: "Old Tom" })).toHaveCount(0);
  await expect(page.getByTestId("who-button")).not.toContainText("NPC");
  // the card character and you can't be removed
  await card(page, "Lyra").hover();
  await expect(card(page, "Lyra").getByTestId("remove-person")).toHaveCount(0);
  await card(page, "Lyra").getByTestId("who-block").click();
  await page.mouse.move(0, 0);
  await scene.screenshot({ path: "e2e/.results/cast-open.png" });
});
