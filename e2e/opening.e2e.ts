// The opening (D-091): plays at start, a key or a click skips it (and does nothing else), it clears by itself, and
// Settings → General can skip it or keep it silent. Click tests skip it unless they ask, so the window's copy of the
// setting is set here. Author: CLAUDE, 2026-11-04.
import { expect, test, type Page } from "@playwright/test";

const opening = (page: Page) => page.getByTestId("opening");
const ask = (page: Page, mode: "play" | "silent" | "skip") =>
  page.addInitScript((m) => { try { localStorage.setItem("homunculus.opening", m); } catch { /* */ } }, mode);

test("the opening types the name, then clears by itself and leaves the app usable", async ({ page }) => {
  await ask(page, "silent");
  await page.goto("/");
  await expect(opening(page)).toBeVisible();
  await expect(opening(page).locator(".opening-typed")).toHaveText("HOMUNCULUS");
  await expect(opening(page).locator(".opening-line")).toHaveText("ars narrandi");
  await expect(opening(page)).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
});

test("any key skips the opening and does nothing else; a click skips it too", async ({ page }) => {
  await ask(page, "silent");
  await page.goto("/");
  await expect(opening(page)).toBeVisible();
  await page.keyboard.press("Control+h");
  await expect(opening(page)).toHaveCount(0);
  // Ctrl+H went to the opening, not to the app: Home did not open
  await expect(page.getByTestId("home")).toHaveCount(0);
  await page.reload();
  await expect(opening(page)).toBeVisible();
  await opening(page).click();
  await expect(opening(page)).toHaveCount(0);
});

test("click tests and “skip” start without it; Settings has Skip the opening and Opening sound", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("place-list")).toBeVisible();
  await expect(opening(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Settings" }).click();
  const skip = page.getByRole("switch", { name: "Skip the opening" });
  const sound = page.getByRole("switch", { name: "Opening sound" });
  await expect(skip).toHaveAttribute("aria-checked", "false");
  await expect(sound).toHaveAttribute("aria-checked", "true");
  await skip.click();
  await expect(skip).toHaveAttribute("aria-checked", "true");
  await expect(sound).toBeDisabled();
  await skip.click();
  await expect(sound).toBeEnabled();
  await sound.click();
  await expect(sound).toHaveAttribute("aria-checked", "false");
});

test("with “skip” in the window's copy, the app starts straight away", async ({ page }) => {
  await ask(page, "skip");
  await page.goto("/");
  await expect(page.getByTestId("place-list")).toBeVisible();
  await expect(opening(page)).toHaveCount(0);
});
