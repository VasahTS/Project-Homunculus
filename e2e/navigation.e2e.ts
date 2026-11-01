// Approved collection navigation and quiet Library hierarchy. CODEX, D-040.
import { expect, test } from "@playwright/test";
import { openLibrary } from "./ui.ts";

test("Library categories are one row of tabs in their groups, and resource editing is preserved (D-069)", async ({ page }, info) => {
  await page.setViewportSize({ width: 1512, height: 988 });
  await page.goto("/");
  await openLibrary(page, "Kits");
  const navigation = page.getByRole("navigation", { name: "Library categories" });
  // D-069: one row of tabs under the title; the groups are kept (split by a line), Trash apart on the right
  await expect(navigation.getByRole("group")).toHaveCount(4);
  await expect(navigation.getByRole("group", { name: "Writing and context" }).getByRole("button")).toHaveText([/Personas/, /Lorebooks/, /Presets/, /Regex/]);
  const kitsBox = await navigation.getByRole("button", { name: "Kits", exact: true }).boundingBox();
  const agentsBox = await navigation.getByRole("button", { name: "Agents", exact: true }).boundingBox();
  expect(Math.abs((kitsBox?.y ?? 0) - (agentsBox?.y ?? 99))).toBeLessThan(2);
  await expect(navigation.getByRole("button")).toHaveCount(10);
  await expect(navigation.getByRole("button", { name: "Kits", exact: true })).toHaveAttribute("aria-current", "page");
  const inactive = navigation.getByRole("button", { name: "NPCs", exact: true });
  expect(await inactive.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  expect(await inactive.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe("0px");
  await page.screenshot({ path: info.outputPath("library.png") });
  await inactive.click();
  await page.getByRole("button", { name: "New NPC", exact: true }).click();
  await page.getByTestId("npc-sheet").getByLabel("NPC name").fill("Navigation check");
  await page.getByTestId("npc-sheet").getByRole("button", { name: "Save", exact: true }).click();
  await openLibrary(page, "Characters");
  await openLibrary(page, "NPCs");
  await expect(page.getByTestId("vault-npcs")).toContainText("Navigation check");
  await openLibrary(page, "Trash");
  await expect(navigation.getByRole("button", { name: "Trash", exact: true })).toHaveAttribute("aria-current", "page");
});

test("Stories is a peer of Characters and collection filters use actual chat activity", async ({ page }, info) => {
  await page.setViewportSize({ width: 1512, height: 988 });
  await page.goto("/");
  await openLibrary(page, "Characters");
  await expect(page.getByTestId("place-list").getByRole("button")).toHaveText([/Stories/, /Characters/, /Library/]);
  await page.getByRole("button", { name: "Recently played", exact: true }).click();
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "All characters", exact: true }).click();
  await page.screenshot({ path: info.outputPath("characters.png") });
  await page.getByTestId("character-sheet").getByRole("button", { name: "Turn into a Story" }).click();
  await page.getByTestId("new-story").getByTestId("create-story").click();
  await openLibrary(page, "Stories");
  await expect(page.getByTestId("vault-stories").getByRole("button", { name: "Lyra", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Recently played", exact: true }).click();
  await expect(page.getByTestId("vault-stories").getByRole("button")).toHaveCount(0);
  await page.getByRole("button", { name: "All stories", exact: true }).click();
  await page.getByTestId("vault-stories").getByRole("button", { name: "Lyra", exact: true }).click();
  await expect(page.getByTestId("story-sheet")).toBeVisible();
  await page.screenshot({ path: info.outputPath("stories.png") });
});

test("Library navigation and collection actions remain reachable in a narrow window", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openLibrary(page, "Kits");
  const toggle = page.getByRole("button", { name: "Hide Sidebar", exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByTestId("library-list").getByRole("button", { name: "Trackers", exact: true }).click();
  await expect(page.getByRole("button", { name: "New Tracker", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByTestId("library-list").getByRole("button", { name: "NPCs", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "New NPC", exact: true })).toBeVisible();
});

test("Ctrl K opens anything, including when the sidebar is hidden (D-069)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("palette");
  const search = palette.getByRole("combobox", { name: "Open anything" });
  await expect(search).toBeFocused();
  // nothing typed: the places and the Library sections
  await expect(palette.getByRole("group", { name: "Go to" }).getByRole("option", { name: /Lorebooks/ })).toBeVisible();
  await search.fill("Lyra");
  await expect(palette.getByRole("group", { name: "Characters" }).getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page.getByTestId("character-sheet")).toContainText("Lyra");
  await page.keyboard.press("Control+k");
  await search.fill("Scene: Plot");
  await palette.getByRole("group", { name: "Trackers" }).getByRole("option", { name: /Scene: Plot/ }).click();
  await expect(page.getByRole("navigation", { name: "Library categories" }).getByRole("button", { name: "Trackers", exact: true })).toHaveAttribute("aria-current", "page");
  // a section by name, with the keys; Esc closes
  await page.keyboard.press("Control+k");
  await search.fill("lorebooks");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("navigation", { name: "Library categories" }).getByRole("button", { name: "Lorebooks", exact: true })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
});
