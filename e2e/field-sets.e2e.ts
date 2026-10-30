// Tracker definitions reused through the real editor, with isolated browser data. CODEX, D-043.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { openLibrary } from "./ui.ts";

const tools = (page: Page) => page.getByTestId("field-set-tools");
const fieldNames = (page: Page) => page.getByTestId("field-label");
test("reuse controls fit the actual editor width with the Library sidebar open", async ({ page }) => {
  await setup(page);
  for (const width of [1280, 620]) {
    await page.setViewportSize({ width, height: 900 });
    await tools(page).scrollIntoViewIfNeeded();
    const dimensions = await page.locator(".te-main").evaluate((el) => {
      const panel = el.getBoundingClientRect();
      const tool = el.querySelector('[data-testid="field-set-tools"]')!.getBoundingClientRect();
      return { overflow: el.scrollWidth - el.clientWidth, left: tool.left - panel.left, right: panel.right - tool.right };
    });
    expect(dimensions.overflow).toBeLessThanOrEqual(1);
    expect(dimensions.left).toBeGreaterThanOrEqual(0);
    expect(dimensions.right).toBeGreaterThanOrEqual(0);
    await expect(page.locator(".te-preview")).toBeHidden();
  }
});
async function openTools(page: Page) {
  if (!await tools(page).evaluate((el) => (el as HTMLDetailsElement).open)) await tools(page).locator("summary").click();
}
async function setup(page: Page) {
  await page.goto("/"); await openLibrary(page, "Trackers");
  await page.getByRole("button", { name: "New Tracker", exact: true }).click();
  await page.getByLabel("Tracker name", { exact: true }).fill("Reusable values");
  await page.getByLabel("Field 1 name", { exact: true }).fill("Anchor");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("✓ Saved", { exact: true })).toBeVisible();
  await openTools(page);
  await tools(page).getByLabel("Import field sets JSON", { exact: true }).setInputFiles("docs/examples/travel-field-sets.json");
  await expect(tools(page).getByRole("status")).toContainText("Imported 2 set(s)");
  await page.getByLabel("Field set", { exact: true }).selectOption({ label: "Travel" });
  await openTools(page);
}

test("multiple fields copy/move together, collisions cancel everything and undo restores the source", async ({ page }) => {
  await setup(page);
  const destination = await page.getByLabel("Field set", { exact: true }).locator("option").filter({ hasText: /^Minimal travel$/ }).getAttribute("value");
  await tools(page).getByLabel("Destination set", { exact: true }).selectOption(destination!);
  await tools(page).getByLabel("Select field Place", { exact: true }).check();
  await tools(page).getByLabel("Select field Inventory", { exact: true }).check();
  await tools(page).getByRole("button", { name: "Move fields", exact: true }).click();
  await expect(tools(page).getByRole("alert")).toContainText("already has these keys: place");
  await expect(fieldNames(page)).toHaveCount(4);
  await tools(page).getByRole("button", { name: "Clear selection", exact: true }).click();
  for (const name of ["Supplies", "Inventory"]) await tools(page).getByLabel(`Select field ${name}`, { exact: true }).check();
  await tools(page).getByRole("button", { name: "Move fields", exact: true }).click();
  await expect(fieldNames(page)).toHaveText(["Place", "Presence"]);
  await tools(page).getByRole("button", { name: "Undo last reuse action", exact: true }).click();
  await expect(fieldNames(page)).toHaveText(["Place", "Supplies", "Presence", "Inventory"]);
  await tools(page).getByRole("button", { name: "Select all fields", exact: true }).click();
  // A destination without collisions proves the nonempty-source guard separately.
  const standard = await page.getByLabel("Field set", { exact: true }).locator("option").filter({ hasText: /^Standard/ }).getAttribute("value");
  await tools(page).getByLabel("Destination set", { exact: true }).selectOption(standard!);
  await tools(page).getByRole("button", { name: "Move fields", exact: true }).click();
  await expect(tools(page).getByRole("alert")).toContainText("Keep at least one field");
  await tools(page).getByRole("button", { name: "Clear selection", exact: true }).click();
  for (const name of ["Supplies", "Inventory"]) await tools(page).getByLabel(`Select field ${name}`, { exact: true }).check();
  await tools(page).getByLabel("Destination set", { exact: true }).selectOption(destination!);
  await tools(page).getByRole("button", { name: "Copy fields", exact: true }).click();
  await expect(fieldNames(page)).toHaveCount(4);
  await page.getByLabel("Field set", { exact: true }).selectOption(destination!);
  await expect(fieldNames(page)).toHaveText(["Place", "Supplies", "Inventory"]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("✓ Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByTestId("tracker-list").getByRole("button", { name: /Reusable values/ }).click();
  await expect(fieldNames(page)).toHaveText(["Place", "Supplies", "Inventory"]);
});

test("JSON export imports as a fresh set; invalid files append nothing; later edits invalidate undo", async ({ page }) => {
  await setup(page);
  const download = page.waitForEvent("download");
  await tools(page).getByRole("button", { name: "Export this set", exact: true }).click();
  const file = await download;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.format).toBe("homunculus-field-sets");
  expect(data.sets[0].id).toBeUndefined(); expect(data.sets[0].trackerId).toBeUndefined();
  expect(data.sets[0].fields[3].fields[1].key).toBe("quantity");
  await tools(page).getByLabel("Import field sets JSON", { exact: true }).setInputFiles({ name: "travel.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  const options = page.getByLabel("Field set", { exact: true }).locator("option");
  await expect(options).toHaveCount(4);
  await expect(options.last()).toHaveText("Travel (2)");
  await tools(page).getByRole("button", { name: "Undo last reuse action", exact: true }).click();
  await expect(options).toHaveCount(3);
  await tools(page).getByLabel("Import field sets JSON", { exact: true }).setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...data, version: 2 })) });
  await expect(tools(page).getByRole("alert")).toBeVisible();
  await expect(options).toHaveCount(3);
  await tools(page).getByLabel("Import field sets JSON", { exact: true }).setInputFiles({ name: "travel.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await expect(options).toHaveCount(4);
  await expect(tools(page).getByRole("button", { name: "Undo last reuse action", exact: true })).toBeVisible();
  await page.getByLabel("Field set description", { exact: true }).fill("A later edit");
  await expect(tools(page).getByRole("button", { name: "Undo last reuse action", exact: true })).toHaveCount(0);
});
