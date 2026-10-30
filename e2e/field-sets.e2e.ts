// Tracker definitions reused through the real editor, with isolated browser data. CODEX, D-043; CLAUDE, D-046:
// Import / Export / AI guide on the set bar, and "Send to" on each field and group row.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { openLibrary } from "./ui.ts";

const files = (page: Page) => page.getByTestId("field-set-files");
const notice = (page: Page) => page.getByTestId("set-notice");
const fieldNames = (page: Page) => page.getByTestId("field-label");
const setPicker = (page: Page) => page.getByLabel("Field set", { exact: true });

async function setup(page: Page) {
  await page.goto("/"); await openLibrary(page, "Trackers");
  await page.getByRole("button", { name: "New Tracker", exact: true }).click();
  await page.getByLabel("Tracker name", { exact: true }).fill("Reusable values");
  await page.getByLabel("Field 1 name", { exact: true }).fill("Anchor");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("✓ Saved", { exact: true })).toBeVisible();
  await files(page).getByLabel("Import field sets JSON", { exact: true }).setInputFiles("docs/examples/travel-field-sets.json");
  await expect(notice(page)).toContainText("Imported 2 sets");
  await setPicker(page).selectOption({ label: "Travel" });
  await expect(fieldNames(page)).toHaveText(["Place", "Supplies", "Presence", "Inventory"]);
}
async function sendMenu(page: Page, what: string) {
  await page.getByRole("button", { name: `Send “${what}” to another set`, exact: true }).click();
  const menu = page.getByRole("menu", { name: `Send “${what}” to` });
  await expect(menu).toBeVisible();
  return menu;
}

test("a field row sends the field to another set; Undo puts it back", async ({ page }) => {
  await setup(page);
  let menu = await sendMenu(page, "Place");
  // the minimal set already has "place": no buttons, just a note
  await expect(menu.getByRole("menuitem", { name: "Copy to Minimal travel", exact: true })).toHaveCount(0);
  await expect(menu.getByText("already there")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  menu = await sendMenu(page, "Supplies");
  await menu.getByRole("menuitem", { name: "Move to Minimal travel", exact: true }).click();
  await expect(fieldNames(page)).toHaveText(["Place", "Presence", "Inventory"]);
  await expect(notice(page)).toContainText("moved to “Minimal travel”");
  await notice(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(fieldNames(page)).toHaveText(["Place", "Supplies", "Presence", "Inventory"]);

  menu = await sendMenu(page, "Supplies");
  await menu.getByRole("menuitem", { name: "Copy to Minimal travel", exact: true }).click();
  await expect(fieldNames(page)).toHaveCount(4);
  await setPicker(page).selectOption({ label: "Minimal travel" });
  await expect(fieldNames(page)).toHaveText(["Place", "Supplies"]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("✓ Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByTestId("tracker-list").getByRole("button", { name: /Reusable values/ }).click();
  await expect(fieldNames(page)).toHaveText(["Place", "Supplies"]);
});

test("a group moves to a new set with its presence rule; a set never empties", async ({ page }) => {
  await setup(page);
  const menu = await sendMenu(page, "People");
  await menu.getByRole("menuitem", { name: "Move to a new set", exact: true }).click();
  await expect(fieldNames(page)).toHaveText(["Place", "Supplies"]);
  await setPicker(page).selectOption({ label: "New set" });
  await expect(fieldNames(page)).toHaveText(["Presence", "Inventory"]);
  await expect(page.getByLabel("Presence field", { exact: true })).toHaveValue("presence");
  // the only group of this set cannot be moved away, only copied
  const only = await sendMenu(page, "People");
  await expect(only.getByRole("menuitem", { name: "Move to a new set", exact: true })).toBeDisabled();
});

test("Export saves the whole set, the AI guide downloads, invalid files append nothing, later edits end Undo", async ({ page }) => {
  await setup(page);
  const download = page.waitForEvent("download");
  await files(page).getByRole("button", { name: "Export…", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Travel.json");
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.format).toBe("homunculus-field-sets");
  expect(data.sets).toHaveLength(1);
  const original = JSON.parse(await readFile("docs/examples/travel-field-sets.json", "utf8"));
  expect(data.sets[0]).toMatchObject(original.sets[0]);
  expect(data.sets[0].id).toBeUndefined(); expect(data.sets[0].trackerId).toBeUndefined();

  const guide = page.waitForEvent("download");
  await files(page).getByRole("button", { name: "AI guide", exact: true }).click();
  const md = await readFile((await (await guide).path())!, "utf8");
  expect(md).toContain("homunculus-field-sets");

  await files(page).getByLabel("Import field sets JSON", { exact: true }).setInputFiles({ name: "travel.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  const options = setPicker(page).locator("option");
  await expect(options).toHaveCount(4);
  await expect(options.last()).toHaveText("Travel (2)");
  await notice(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(options).toHaveCount(3);
  await files(page).getByLabel("Import field sets JSON", { exact: true }).setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...data, version: 2 })) });
  await expect(page.getByRole("alert").filter({ hasText: "was not imported" })).toBeVisible();
  await expect(options).toHaveCount(3);
  await files(page).getByLabel("Import field sets JSON", { exact: true }).setInputFiles({ name: "travel.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await expect(options).toHaveCount(4);
  await expect(notice(page).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  await page.getByLabel("Field set description", { exact: true }).fill("A later edit");
  await expect(notice(page).getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
});

test("the set bar keeps its links inside the editor at narrow widths", async ({ page }) => {
  await setup(page);
  for (const width of [1280, 620]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.locator(".te-main").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(files(page).getByRole("button", { name: "Export…", exact: true })).toBeVisible();
  }
});
