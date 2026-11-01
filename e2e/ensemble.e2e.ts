// Click tests (D-065): a card with several characters is sent but not tracked as one person, and the Prompt tab says
// where each field goes; someone out of the scene shows a brief, with the full sheet on request. Author: CLAUDE, 2026-11-01.
import { expect, test, type Page } from "@playwright/test";
import { editCharacter, openLibrary, openSession, openTab, send, setTracker } from "./ui.ts";

const card = (page: Page, name: string) => page.getByTestId("person-card").filter({ has: page.getByTestId("who-block").filter({ hasText: name }) }).first();

test("a card marked 'Several characters' is not a person in the Scene, and the Prompt tab says where it is sent", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  const kind = page.getByTestId("card-kind");
  await expect(kind.getByRole("radio", { name: "One character" })).toHaveAttribute("aria-checked", "true");
  await kind.getByRole("radio", { name: "Several characters" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await page.getByLabel("Character editor").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toContainText("Several characters");

  await openSession(page);
  await openTab(page, "prompt");
  const pc = page.getByTestId("prompt-character");
  await expect(pc).toContainText("Several characters");
  await expect(pc.getByTestId("prompt-ensemble-note")).toContainText("sent whole");
  await expect(pc.getByRole("button", { name: /^Description/ })).toContainText("→ Char Description");

  await openTab(page, "scene");
  await setTracker(page, "Scene: Characters");
  await send(page, "Hello, both of you.");
  const scene = page.getByTestId("scene");
  await expect(scene.getByTestId("ensemble-note")).toContainText("“Lyra” has several characters");
  await expect(scene.getByTestId("person-card").filter({ has: page.getByTestId("who-block").filter({ hasText: /^Lyra/ }) })).toHaveCount(0);
  await scene.screenshot({ path: "e2e/.results/ensemble-scene.png" });
});

test("someone out of the scene opens as a brief; 'Full sheet' shows everything", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "scene");
  await setTracker(page, "Scene: Characters");
  await send(page, "We walk into the forest.");
  const scene = page.getByTestId("scene");
  await expect(card(page, "Lyra")).toBeVisible();
  // out of the scene with the keyboard: focus her ⋮⋮, arrow down past "Not in the scene"
  await card(page, "Lyra").hover();
  const grip = card(page, "Lyra").getByRole("button", { name: "Reorder Lyra" });
  await grip.focus();
  for (let i = 0; i < 4 && !(await card(page, "Lyra").getAttribute("class"))?.includes("away"); i++) await page.keyboard.press("ArrowDown");
  await expect(card(page, "Lyra")).toHaveClass(/away/);

  await card(page, "Lyra").getByTestId("who-block").click();
  await expect(card(page, "Lyra").getByTestId("person-brief")).toBeVisible();
  await expect(card(page, "Lyra").getByTestId("person-page")).toHaveCount(0);
  await scene.screenshot({ path: "e2e/.results/away-brief.png" });
  await card(page, "Lyra").getByTestId("full-sheet").click();
  await expect(card(page, "Lyra").getByTestId("person-page")).toBeVisible();
  await expect(card(page, "Lyra").locator('[data-field="present"]')).toContainText("away");
});
