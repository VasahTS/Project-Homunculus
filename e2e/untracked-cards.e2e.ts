// Click tests (D-065): a card can be sent but not tracked as a person (on the card, a story or a chat), and the Prompt
// tab says where each field goes; someone out of the scene shows a brief, with the full sheet on request. Author: CLAUDE, 2026-11-01.
import { expect, test, type Page } from "@playwright/test";
import { addCardToStory, editCharacter, openLibrary, openSession, openTab, send, setTracker } from "./ui.ts";

const card = (page: Page, name: string) => page.getByTestId("person-card").filter({ has: page.getByTestId("who-block").filter({ hasText: name }) }).first();

async function newStory(page: Page, name: string) {
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const sheet = page.getByTestId("new-story");
  await sheet.getByLabel("Story name").fill(name);
  await sheet.getByRole("button", { name: /Narrated adventure/ }).click();
  await sheet.getByLabel("An empty story").check();
  await sheet.getByTestId("create-story").click();
  await expect(page.getByTestId("story-page")).toBeVisible();
}

test("Characters: 'Don't track' is the card's default; the chat can change it; the Prompt tab says where the card goes", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  const kind = page.getByTestId("card-kind");
  await expect(kind.getByRole("radio", { name: "Track as a person" })).toHaveAttribute("aria-checked", "true");
  await expect(kind).toContainText("a card with several characters");
  await kind.getByRole("radio", { name: "Don't track" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await page.getByLabel("Character editor").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toContainText("Not tracked");

  await openSession(page);
  await openTab(page, "prompt");
  const pc = page.getByTestId("prompt-character");
  await expect(pc).toContainText("Not tracked in the Scene");
  await expect(pc.getByTestId("prompt-untracked-note")).toContainText("Sent whole");
  await expect(pc.getByRole("button", { name: /^Description/ })).toContainText("→ Char Description");

  await openTab(page, "scene");
  await setTracker(page, "Scene: Characters");
  await send(page, "Hello, both of you.");
  const scene = page.getByTestId("scene");
  await expect(scene.getByTestId("untracked-note")).toContainText("“Lyra” is sent whole but not tracked as a person");
  await expect(scene.getByTestId("person-card").filter({ has: page.getByTestId("who-block").filter({ hasText: /^Lyra/ }) })).toHaveCount(0);
  await scene.screenshot({ path: "e2e/.results/untracked-scene.png" });

  // this chat only: track her again from "Who is in this story"
  await page.getByTestId("who-button").click();
  const sw = page.getByTestId("who-pop").getByRole("switch", { name: "Track Lyra in the Scene" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await page.keyboard.press("Escape");
  await expect(scene.getByTestId("untracked-note")).toHaveCount(0);
});

test("Story → Characters: 'Track in Scene' per card, clearly explained", async ({ page }) => {
  await page.goto("/");
  await newStory(page, "Tea Shop");
  await addCardToStory(page, "Lyra");
  const people = page.getByTestId("story-people");
  await expect(people).toContainText("a card with several characters, a world card");
  const row = page.getByTestId("story-card-row").filter({ hasText: "Lyra" });
  const sw = row.getByRole("switch", { name: "Track Lyra in the Scene" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(row).toContainText("not tracked in the Scene");
  await people.screenshot({ path: "e2e/.results/story-track.png" });
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
