// Approved collection navigation and quiet Library hierarchy. CODEX, D-040.
import { expect, test } from "@playwright/test";
import { openLibrary } from "./ui.ts";

test("Library distinguishes static group headings from categories and preserves resource editing", async ({ page }, info) => {
  await page.setViewportSize({ width: 1512, height: 988 });
  await page.goto("/");
  await openLibrary(page, "Kits");
  const navigation = page.getByRole("navigation", { name: "Library categories" });
  await expect(navigation.getByRole("heading")).toHaveText(["Story building", "Writing and context", "Around each reply", "Manage"]);
  await expect(navigation.getByRole("button")).toHaveCount(9);
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

test("Ctrl K finds characters and Library resources, including when the sidebar is hidden", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("textbox", { name: "Search everything", exact: true });
  await expect(search).toBeFocused();
  await search.fill("Lyra");
  await page.getByRole("region", { name: "Matching library items and characters" }).getByRole("button", { name: /Lyra/ }).click();
  await expect(page.getByTestId("character-sheet")).toContainText("Lyra");
  await search.fill("Scene: Plot");
  await page.getByRole("region", { name: "Matching library items and characters" }).getByRole("button", { name: /Scene: Plot/ }).click();
  await expect(page.getByRole("navigation", { name: "Library categories" }).getByRole("button", { name: "Trackers", exact: true })).toHaveAttribute("aria-current", "page");
});
