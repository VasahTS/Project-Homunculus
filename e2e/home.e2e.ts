// Home (D-086): the full-window "index of plates" (draft H3), how it closes and comes back; the Observatory look and its
// Alchemical icons. Author: CLAUDE, 2026-11-04. Click tests open at the last chat (navigator.webdriver), so Home is opened
// here with Ctrl+H the way Daniel would.
import { expect, test, type Page } from "@playwright/test";
import { newChatWith } from "./ui.ts";

const home = (page: Page) => page.getByTestId("home");
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Sidebar" });

test("Ctrl+H opens Home without the sidebar; Esc, Ctrl+H and every choice on it go back to the app", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  await page.keyboard.press("Control+h");
  await expect(home(page)).toBeVisible();
  await expect(sidebar(page)).toHaveCount(0);
  // the last chat waits under Home
  await expect(page.getByTestId("home-back")).toContainText("Back to");
  await expect(page.getByTestId("home-continue")).toContainText("Lyra");
  await page.keyboard.press("Escape");
  await expect(home(page)).toHaveCount(0);
  await expect(page.getByTestId("messages")).toBeVisible();
  // Ctrl+H twice: there and back
  await page.keyboard.press("Control+h");
  await expect(home(page)).toBeVisible();
  await page.keyboard.press("Control+h");
  await expect(home(page)).toHaveCount(0);
  // the sidebar's Home item and the name bring it back; a plate's title opens that place with the sidebar
  await page.getByTestId("side-home").click();
  await expect(home(page)).toBeVisible();
  await home(page).getByRole("button", { name: /Played last/ }).click();
  await expect(home(page)).toHaveCount(0);
  await expect(sidebar(page)).toBeVisible();
  await sidebar(page).getByRole("button", { name: "Homunculus" }).click();
  await expect(home(page)).toBeVisible();
  // Continue opens the last chat
  await page.getByTestId("home-continue-button").click();
  await expect(page.getByTestId("messages")).toBeVisible();
  await expect(home(page)).toHaveCount(0);
});

test("Home's Assistant box opens the Assistant with the question in its message box; Ctrl+K stays over Home", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("place-list")).toBeVisible();
  await page.keyboard.press("Control+h");
  await expect(home(page)).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(home(page)).toBeVisible();
  await page.getByTestId("home-ask").fill("Make a tracker for money");
  await page.getByRole("button", { name: "Open in Assistant" }).click();
  await expect(home(page)).toHaveCount(0);
  await expect(page.getByRole("textbox").last()).toHaveValue("Make a tracker for money");
});

test("Open at offers Home; the Observatory look switches to its fonts and the Alchemical icons, and Lines can be picked back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Open at")).toContainText("Home");
  await page.getByTestId("settings-customize").click();
  const searchPath = () => page.locator(".side-search svg path").first().getAttribute("d");
  const linesPath = await searchPath();
  await page.getByRole("radio", { name: "Observatory" }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("observatory");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--window").trim())).toBe("#0b0b0a");
  await expect.poll(searchPath).not.toBe(linesPath);
  await page.getByRole("radiogroup", { name: "Icons" }).getByRole("radio", { name: "Lines" }).click();
  await expect.poll(searchPath).toBe(linesPath);
  await page.getByRole("radiogroup", { name: "Icons" }).getByRole("radio", { name: "Alchemical" }).click();
  await page.keyboard.press("Control+h");
  await expect(home(page)).toBeVisible();
  await page.screenshot({ path: "e2e/.results/home-observatory.png" });
});
