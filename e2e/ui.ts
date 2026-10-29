// Shared steps for the click tests: moving around the UI "I" layout (D-018). Author: CLAUDE, 2026-10-27.
import { expect, type Page } from "@playwright/test";

/**
 * Opens a kind of the Library: the sidebar's Library, then its tab (slice 4, D-029: the kinds are tabs).
 * Round 3 (D-036): Characters is a place of its own in the sidebar.
 */
export async function openLibrary(page: Page, area: "Characters" | "Personas" | "Lorebooks" | "Presets" | "Trackers" | "Trash") {
  if (area === "Characters") { await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click(); return; }
  await page.getByTestId("place-list").getByRole("button", { name: "Library" }).click();
  await page.getByTestId("library-list").getByRole("tab", { name: area }).click();
}

/** Opens a character's editor: its card (or the first one), then Edit on its sheet (slice 4: cards + view sheet). */
export async function editCharacter(page: Page, name?: string) {
  const list = page.getByTestId("character-list");
  await (name ? list.getByRole("button", { name }) : list.getByRole("button").first()).click();
  await page.locator('[data-testid="character-sheet"], [aria-label="Character editor"]').first().waitFor();
  const sheet = page.getByTestId("character-sheet");
  if (await sheet.isVisible()) await sheet.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Character editor")).toBeVisible();
}

/** A new 1:1 chat (round 3): Characters → the card → New Chat (or Chat Now). */
export async function newChatWith(page: Page, name = "Lyra") {
  await openLibrary(page, "Characters");
  await page.getByTestId("character-list").getByRole("button", { name }).click();
  await page.getByTestId("new-chat-with").click();
  await expect(page.getByTestId("messages")).toBeVisible();
}

/** Adds a card to the story on screen with the big "Add…" window (round 3): search, Enter. */
export async function addCardToStory(page: Page, name: string) {
  await page.getByTestId("story-people").getByRole("button", { name: "+ Add a Card" }).click();
  const picker = page.getByTestId("picker");
  await picker.getByLabel("Search Cards").fill(name);
  await expect(picker.getByTestId("pick-row").first()).toContainText(name);
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
}

/** Goes back to a session from the sidebar (the first one = the newest). */
export async function openSession(page: Page, index = 0) {
  await page.getByTestId("session-list").getByRole("button").nth(index).click();
  await expect(page.getByTestId("messages")).toBeVisible();
}

/** Opens a tab of the inspector beside the story. */
export async function openTab(page: Page, tab: "scene" | "prompt" | "reply") {
  await page.getByTestId(`tab-${tab}`).click();
}

/** Writes a message, sends it, and waits until the turn ends (reply and trackers). */
export async function send(page: Page, text: string) {
  await page.getByPlaceholder(/Write your message/).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 15_000 });
}

/** Switches a tracker on or off in the Scene panel (the list is in the panel until one is on, then under the ⚙ "Trackers" button). */
export async function setTracker(page: Page, name: string, on = true) {
  const scene = page.getByTestId("scene");
  const sw = scene.getByRole("switch", { name, exact: true });
  // wait until the panel is drawn: either the list of trackers or the ⚙ button
  await scene.locator('[data-testid="tracker-toggles"], button[aria-label="Trackers"]').first().waitFor();
  if (!(await sw.isVisible())) await scene.getByRole("button", { name: "Trackers" }).click();
  if ((await sw.getAttribute("aria-checked")) !== String(on)) await sw.click();
  if (await scene.getByRole("dialog").isVisible()) await page.keyboard.press("Escape");
  // the tracker's tab appears (or goes away)
  if (on) await expect(scene.locator(`[data-testid="tracker-card"][aria-label="${name}"]`)).toHaveCount(1);
}
