// A story's own version of a lorebook (D-049). Author: CLAUDE, 2026-10-30.
import { expect, test } from "@playwright/test";
import { openLibrary } from "./ui.ts";

test("a story edits its own version of a lorebook; the original stays; changes can go to the original", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Lorebooks");
  await page.getByRole("button", { name: "New Lorebook" }).click();
  const editor = page.getByLabel("Lorebook editor");
  await editor.getByLabel("Lorebook name").fill("Isekai World");
  await editor.getByRole("button", { name: "New Entry" }).first().click();
  await expect(editor.getByTestId("lore-entry")).toHaveCount(1);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const create = page.getByTestId("new-story");
  await create.getByLabel("Story name").fill("Isekai RPG");
  await create.getByRole("button", { name: /Narrated adventure/ }).click();
  await create.getByLabel("An empty story").check();
  await create.getByTestId("create-story").click();
  await page.getByLabel("Add a lorebook").selectOption({ label: "Isekai World" });
  await page.getByTestId("lorebook-links").getByRole("button", { name: "Isekai World", exact: true }).first().click();

  const bar = page.getByTestId("lore-version-bar");
  await bar.getByLabel("Lorebook version").selectOption({ label: "Isekai RPG's version" });
  await expect(bar).toContainText("Edits here change only Isekai RPG");
  await editor.getByRole("button", { name: "New Entry" }).first().click();
  await expect(editor.getByTestId("lore-entry")).toHaveCount(2);
  await expect(editor.locator(".lv-tag.new")).toHaveCount(1, { timeout: 10_000 });
  await expect(bar).toContainText("1 change in Isekai RPG");

  await bar.getByLabel("Lorebook version").selectOption({ label: "Original (the Library's book)" });
  await expect(editor.getByTestId("lore-entry")).toHaveCount(1);

  await bar.getByLabel("Lorebook version").selectOption({ index: 1 });
  await bar.getByRole("button", { name: "Apply to the original…" }).click();
  await page.getByTestId("lore-apply").getByRole("button", { name: "Apply 1" }).click();
  await expect(bar).toContainText("Same as the original");
  await bar.getByLabel("Lorebook version").selectOption({ label: "Original (the Library's book)" });
  await expect(editor.getByTestId("lore-entry")).toHaveCount(2);
});
