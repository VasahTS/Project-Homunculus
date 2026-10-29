// Click tests: the "new version" bar and Settings → About (D-037). Author: CLAUDE, 2026-10-29.
// The browser has no updater; `__h2FakeUpdate` makes the app behave as if GitHub had a newer version.
import { expect, test, type Page } from "@playwright/test";

const fakeUpdate = (page: Page, update: { version: string; notes?: string; fail?: string }) =>
  page.addInitScript((u) => { (globalThis as { __h2FakeUpdate?: unknown }).__h2FakeUpdate = u; }, update);

test("a newer version shows a quiet bar; Later hides it; Settings → About still offers it", async ({ page }) => {
  await fakeUpdate(page, { version: "9.9.9", notes: "• Folders everywhere\n• Search inside chats" });
  await page.goto("/");
  const bar = page.getByTestId("update-bar");
  await expect(bar).toContainText("Homunculus 9.9.9 is ready");
  await expect(bar).toContainText("Your chats, characters and keys stay as they are.");

  await bar.getByRole("button", { name: /What’s New/ }).click();
  await expect(page.getByTestId("update-notes")).toContainText("Search inside chats");

  await bar.getByRole("button", { name: "Later" }).click();
  await expect(bar).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-about").click();
  const about = page.getByTestId("about");
  await expect(about.getByTestId("update-status")).toContainText("Homunculus 9.9.9 is ready to install.");
  await expect(about).toContainText("Search inside chats");

  await about.getByRole("button", { name: "Update & Restart" }).click();
  await expect(page.getByTestId("update-bar")).toContainText(/Downloading Homunculus 9\.9\.9|Installing Homunculus 9\.9\.9/);
  await expect(page.getByTestId("update-bar")).toContainText("Installing Homunculus 9.9.9");
});

test("a failed install says nothing changed and offers Try Again", async ({ page }) => {
  await fakeUpdate(page, { version: "9.9.9", fail: "The download was interrupted" });
  await page.goto("/");
  const bar = page.getByTestId("update-bar");
  await bar.getByRole("button", { name: "Update & Restart" }).click();
  await expect(bar).toContainText("Could not install Homunculus 9.9.9");
  await expect(bar).toContainText("nothing was changed");
  await bar.getByRole("button", { name: "Try Again" }).click();
  await expect(bar).toContainText("Homunculus 9.9.9 is ready");
});

test("without a newer version there is no bar, and the preview says updates are for the installed app", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-about").click();
  await expect(page.getByTestId("update-status")).toContainText("Updates work in the installed app.");
  await expect(page.getByTestId("update-bar")).toHaveCount(0);
});
