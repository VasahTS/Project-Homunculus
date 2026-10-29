// Click tests of the "round 2" fixes (29/10): a card's version in a story, pictures for NPCs / narrators / stories,
// preset blocks open together (+ a big window), the tracker editor remembers its set and opens several fields.
// Author: CLAUDE, 2026-10-29.
import { expect, test, type Page } from "@playwright/test";
import { editCharacter, openLibrary, addCardToStory } from "./ui.ts";

// a 2×2 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAr7HtOUAAAAASUVORK5CYII=", "base64");

async function newStory(page: Page, name: string) {
  await page.getByRole("button", { name: "New story" }).click();
  const sheet = page.getByTestId("new-story");
  await sheet.getByLabel("Story name").fill(name);
  await sheet.getByRole("button", { name: /Narrated adventure/ }).click();
  await sheet.getByLabel("An empty story").check();
  await sheet.getByTestId("create-story").click();
  await expect(page.getByTestId("story-page")).toBeVisible();
}

test("a story uses the version of a card you pick, and its chats follow", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  await page.getByRole("button", { name: "+ New Version" }).click();
  await page.getByLabel("New version name").fill("Modern");
  await page.getByRole("button", { name: "Add Version" }).click();
  await page.getByLabel("Character editor").getByLabel("Description").fill("A barista in a rainy city.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();

  await newStory(page, "Rainy Town");
  await addCardToStory(page, "Lyra");
  const row = page.getByTestId("story-card-row").filter({ hasText: "Lyra" });
  await expect(row).toContainText("Card, joins as it is");
  await page.getByTestId("play-story").click();
  await page.getByTestId("new-chat-sheet").getByTestId("start-chat").click();
  await expect(page.getByTestId("messages")).toBeVisible();

  // back on the story page: pick the Modern version
  await page.getByTestId("story-page-button").click();
  await page.getByLabel("Version of Lyra").selectOption({ label: "Modern" });
  await expect(page.getByTestId("story-card-row").filter({ hasText: "Lyra" })).toContainText("Modern version");
  await page.getByTestId("story-chats").getByRole("button", { name: /^Chat 1/ }).first().click();
  await page.getByTestId("tab-prompt").click();
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("A barista in a rainy city.");
});

test("NPCs, narrators and stories can have a picture", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Vault" }).click();
  await page.getByTestId("vault-tabs").getByRole("tab", { name: "NPCs" }).click();
  await page.getByRole("button", { name: "New NPC" }).click();
  const npc = page.getByTestId("npc-sheet");
  await npc.getByLabel("NPC name").fill("Old Tom");
  await npc.getByRole("button", { name: "Save" }).click();
  await npc.getByTestId("npc-image-input").setInputFiles({ name: "tom.png", mimeType: "image/png", buffer: PNG });
  await expect(npc.getByTestId("npc-image").locator("img")).toHaveCount(1);
  await expect(page.locator(".gallery-card, [data-testid=vault-npcs] button").filter({ hasText: "Old Tom" }).locator("img").first()).toBeVisible();

  await page.getByTestId("vault-tabs").getByRole("tab", { name: "Narrators" }).click();
  await page.getByTestId("vault-narrators").getByRole("button", { name: "Simple Narrator" }).click();
  await page.getByTestId("narrator-image-input").setInputFiles({ name: "n.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("narrator-image").locator("img")).toHaveCount(1);

  await newStory(page, "Painted Story");
  // the story shows its narrator's picture until it has its own
  await expect(page.getByTestId("story-image").locator("img")).toHaveCount(1);
  await page.getByTestId("story-image-input").setInputFiles({ name: "s.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("story-image").getByRole("button", { name: "Remove" })).toBeVisible();
  await expect(page.getByTestId("story-list").locator("img")).toHaveCount(1);
  await page.screenshot({ path: "e2e/.results/story-picture.png" });
});

test("preset blocks open together (Open All / Fold All) and a block's text opens in a big window", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Presets");
  await page.getByTestId("preset-list").getByRole("button", { name: "Homunculus Default" }).click();
  const editor = page.getByLabel("Preset editor");
  await editor.getByRole("button", { name: "Main Prompt", exact: true }).click();
  await editor.getByRole("button", { name: "Char Description", exact: true }).click();
  await expect(editor.locator(".block-body")).toHaveCount(2); // both stay open
  await editor.getByTestId("blocks-open-all").click(); // something is open: Fold All
  await expect(editor.locator(".block-body")).toHaveCount(0);
  await editor.getByTestId("blocks-open-all").click();
  await expect(editor.locator(".block-body")).toHaveCount(12);
  await editor.getByTestId("blocks-open-all").click();
  await editor.getByRole("button", { name: "Main Prompt", exact: true }).click();
  await editor.getByRole("button", { name: "Bigger ⤢" }).first().click();
  const big = page.getByTestId("block-big");
  await expect(big).toBeVisible();
  await big.getByLabel("Block text (big)").fill("Write vividly. {{char}} speaks in short sentences.");
  await page.keyboard.press("Escape");
  await expect(editor.getByLabel("Block text").first()).toHaveValue("Write vividly. {{char}} speaks in short sentences.");
});

test("the tracker editor remembers the set you edited and opens several fields at once", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Trackers");
  await page.getByTestId("tracker-list").getByText("Scene: Characters").click();
  await page.getByLabel("Field set", { exact: true }).selectOption({ label: "Fantasy" });
  await page.getByTestId("field-label").filter({ hasText: /^Mana$/ }).click();
  await page.getByTestId("field-label").filter({ hasText: /^Race$/ }).click();
  await expect(page.locator(".te-field.open")).toHaveCount(2);
  // "one value" is now said plainly
  const scope = page.locator(".te-field.open").first().getByLabel(/scope$/);
  await expect(scope.locator("option:checked")).toHaveText("one for each character");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByTestId("tracker-list").getByText("Scene: Characters").click();
  await expect(page.getByLabel("Field set", { exact: true }).locator("option:checked")).toHaveText("Fantasy");
  await page.getByTestId("fields-open-all").click();
  await expect(page.locator(".te-field.open")).toHaveCount(await page.getByTestId("field-label").count());
});
