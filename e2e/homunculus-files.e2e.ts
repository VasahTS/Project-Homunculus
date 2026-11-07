// Homunculus files (D-094): Export and Import of narrators, NPCs, stories, Kits, agents, trackers and Directors.
// Browser preview: Export is a download, Import reads the downloaded file. Author: CLAUDE, 2026-11-07.
import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { addCardToStory, openLibrary } from "./ui.ts";

/** Clicks an Export button and returns the saved file's name and text. */
async function exportBy(page: Page, button: Locator) {
  const [file] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return { name: file.suggestedFilename(), path: (await file.path())!, text: await readFile((await file.path())!, "utf8") };
}

const importFile = async (page: Page, what: string, path: string) => {
  await page.getByLabel(`Import ${what} from a file`).setInputFiles(path);
  await expect(page.getByTestId("notice")).toContainText("Imported");
};

test("a narrator goes out to a file and comes back: the same one is kept, a changed one comes in beside it", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Narrators");
  await page.getByTestId("vault-narrators").getByRole("button", { name: "Simple Narrator" }).click();
  const sheet = page.getByTestId("narrator-sheet");
  const file = await exportBy(page, sheet.getByTestId("narrator-export"));
  expect(file.name).toBe("Simple-Narrator.h2.json");
  expect(JSON.parse(file.text)).toMatchObject({ format: "homunculus-bundle", roots: [{ kind: "narrator" }] });
  await expect(page.getByTestId("notice")).toContainText("Exported “Simple Narrator”");

  await importFile(page, "narrators", file.path);
  await expect(page.getByTestId("notice")).toContainText("Already here, so kept as they are: 1 narrator");
  await expect(page.getByTestId("vault-narrators").getByRole("button", { name: /Simple Narrator/ })).toHaveCount(1);

  await sheet.getByLabel("Turn instruction").fill("Changed after the export.");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await importFile(page, "narrators", file.path);
  await expect(page.getByTestId("notice")).toContainText("the narrator “Simple Narrator (imported)”");
  await expect(page.getByTestId("narrator-sheet").getByLabel("Narrator name")).toHaveValue("Simple Narrator (imported)");
  await expect(page.getByTestId("narrator-sheet").getByLabel("Turn instruction")).toHaveValue("");
  await expect(page.getByTestId("vault-narrators").getByRole("button", { name: /Simple Narrator/ })).toHaveCount(2);
});

test("a story with a card: exported, moved to the Trash, imported back with its people", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const create = page.getByTestId("new-story");
  await create.getByLabel("Story name").fill("Harbor Lights");
  await create.getByRole("button", { name: /Narrated adventure/ }).click();
  await create.getByLabel("An empty story").check();
  await create.getByTestId("create-story").click();
  await expect(page.getByTestId("story-page")).toBeVisible();
  await page.getByLabel("Scenario").first().fill("Fog over the harbor.");
  await addCardToStory(page, "Lyra");

  // from the story page's More… menu
  await page.getByRole("button", { name: "More…" }).click();
  const file = await exportBy(page, page.getByTestId("story-page-export"));
  expect(file.name).toBe("Harbor-Lights.h2.json");
  const doc = JSON.parse(file.text) as { stories: Array<{ scenario: string }>; characters: Array<{ name: string }> };
  expect(doc.stories[0]!.scenario).toBe("Fog over the harbor.");
  expect(doc.characters.map((c) => c.name)).toEqual(["Lyra"]);
  await expect(page.getByTestId("notice")).toContainText("With 1 character");

  await page.getByRole("button", { name: "More…" }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await openLibrary(page, "Stories");
  await expect(page.getByTestId("vault-stories").getByRole("button", { name: "Harbor Lights", exact: true })).toHaveCount(0);

  await importFile(page, "stories", file.path);
  await expect(page.getByTestId("notice")).toContainText("the story “Harbor Lights”");
  await expect(page.getByTestId("notice")).toContainText("Already here, so kept as they are: 1 character");
  await expect(page.getByTestId("vault-stories").getByRole("button", { name: "Harbor Lights", exact: true })).toHaveCount(1);
  await expect(page.getByTestId("story-sheet")).toContainText("Lyra");
  // and the sheet can export it too
  const again = await exportBy(page, page.getByTestId("story-sheet").getByTestId("story-export"));
  expect(JSON.parse(again.text).stories[0].scenario).toBe("Fog over the harbor.");
});

test("an agent and a tracker: Export in their editors, Import on their pages", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Agents");
  await page.getByRole("button", { name: "New Agent" }).click();
  const editor = page.getByTestId("agent-editor");
  await editor.getByLabel("Agent name").fill("Weather Rules");
  await expect(editor.getByTestId("agent-save-state")).toHaveText("✓ Saved");
  const agent = await exportBy(page, editor.getByTestId("agent-export"));
  expect(agent.name).toBe("Weather-Rules.h2.json");
  await editor.getByRole("button", { name: "Delete Agent" }).click();
  await editor.getByRole("button", { name: "Click Again to Delete" }).click();
  await expect(page.getByTestId("agent-table").getByTestId("agent-row").filter({ hasText: "Weather Rules" })).toHaveCount(0);
  await importFile(page, "agents", agent.path);
  await expect(page.getByTestId("notice")).toContainText("the agent “Weather Rules”");
  await expect(page.getByTestId("agent-editor").getByLabel("Agent name")).toHaveValue("Weather Rules");

  await openLibrary(page, "Trackers");
  await page.getByTestId("tracker-list").getByRole("button").first().click();
  const name = await page.locator(".tracker-editor .editor-title").innerText();
  const tracker = await exportBy(page, page.getByTestId("tracker-export"));
  const doc = JSON.parse(tracker.text) as { roots: Array<{ kind: string }>; trackerSchemas: unknown[] };
  expect(doc.roots[0]!.kind).toBe("agent");
  expect(doc.trackerSchemas.length).toBeGreaterThan(0);
  await importFile(page, "trackers", tracker.path);
  await expect(page.getByTestId("notice")).toContainText(`Already here, so kept as they are`);
  await expect(page.locator(".tracker-editor .editor-title")).toHaveText(name);
});

test("a file that isn't a Homunculus file is explained, and nothing changes", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Kits");
  await page.getByLabel("Import Kits from a file").setInputFiles({ name: "card.json", mimeType: "application/json", buffer: Buffer.from('{"spec":"chara_card_v2"}') });
  await expect(page.getByTestId("notice")).toContainText("Nothing was imported");
  await expect(page.getByTestId("notice")).toContainText("card.json: This is not a Homunculus file");
});

test("a preset's Export is at the top of its editor too (it was only below every block)", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Presets");
  await page.getByTestId("preset-list").getByRole("button").first().click();
  const file = await exportBy(page, page.getByTestId("preset-export"));
  expect(file.name).toMatch(/\.json$/);
  expect(JSON.parse(file.text)).toHaveProperty("prompts");
  await expect(page.getByTestId("notice")).toContainText("Exported");
});
