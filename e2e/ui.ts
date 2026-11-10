// Shared steps for the click tests: moving around the UI "I" layout (D-018). Author: CLAUDE, 2026-10-27.
import { expect, type Page } from "@playwright/test";

/**
 * Opens a primary collection or a category in the grouped Library (D-040).
 * Round 3 (D-036): Characters is a place of its own in the sidebar.
 */
export async function openLibrary(page: Page, area: "Characters" | "Personas" | "Lorebooks" | "Presets" | "Regex" | "Quick Replies" | "Trackers" | "Agents" | "Cues" | "Trash" | "Stories" | "Kits" | "Narrators" | "NPCs" | "Directors") {
  if (area === "Stories") { await page.getByTestId("place-list").getByRole("button", { name: "Stories", exact: true }).click(); return; }
  if (area === "Characters") { await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click(); return; }
  await page.getByTestId("place-list").getByRole("button", { name: "Library" }).click();
  await page.getByTestId("library-list").getByRole("button", { name: area, exact: true }).click();
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

/**
 * Opens a tab of the inspector beside the story. D-105: Memory is a window opened from the chat's top bar; the Prompt
 * tab's cards are opened (a card stays open once opened, so the tests see every control as before).
 */
export async function openTab(page: Page, tab: "scene" | "character" | "prompt" | "memory" | "director" | "reply") {
  if (tab === "memory") {
    // in narrow windows the inspector lies over the top bar: close it to reach the Memory button
    const closeInspector = page.getByRole("button", { name: "Close Inspector" });
    if (!(await page.getByTestId("memory-window").isVisible()) && await closeInspector.isVisible()) await closeInspector.click();
    if (!(await page.getByTestId("memory-window").isVisible())) await page.getByTestId("open-memory").click();
    await expect(page.getByTestId("memory-window")).toBeVisible();
    return;
  }
  // the Memory window floats over the inspector: close it before using a tab
  if (await page.getByTestId("memory-window").isVisible()) await page.getByRole("button", { name: "Close Memory" }).click();
  await page.getByTestId(`tab-${tab}`).click();
  if (tab !== "prompt") return;
  const closed = page.getByTestId("prompt-pane").locator('[data-testid="prompt-card-toggle"][aria-expanded="false"]');
  while (await closed.count()) await closed.first().click();
}

/** Writes a message, sends it, and waits until the turn ends (reply and trackers). */
export async function send(page: Page, text: string) {
  await page.getByPlaceholder(/Type a message/).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible({ timeout: 15_000 });
}

/**
 * Switches a tracker on or off in the Scene panel (D-104): with none on, tick it in the checklist and Start Following;
 * with some on, the "Trackers N" button opens the sheet with the switches.
 */
export async function setTracker(page: Page, name: string, on = true) {
  const scene = page.getByTestId("scene");
  // wait until the panel is drawn: either the checklist or the Trackers button
  await scene.locator('[data-testid="scene-picker"], [data-testid="scene-trackers"]').first().waitFor();
  if (await scene.getByTestId("scene-picker").isVisible()) {
    if (!on) return;
    const box = scene.getByRole("checkbox", { name, exact: true });
    if ((await box.getAttribute("aria-checked")) !== "true") await box.click();
    await scene.getByTestId("scene-start").click();
  } else {
    const sw = scene.getByRole("switch", { name, exact: true });
    if (!(await sw.isVisible())) await scene.getByTestId("scene-trackers").click();
    if ((await sw.getAttribute("aria-checked")) !== String(on)) await sw.click();
    if (await scene.getByRole("dialog", { name: "Trackers in this chat" }).isVisible()) await page.keyboard.press("Escape");
  }
  // the tracker's tab appears (or goes away)
  if (on) await expect(scene.locator(`[data-testid="tracker-card"][aria-label="${name}"]`)).toHaveCount(1);
}

/** Opens the Memory tab (D-084), turns memory on and (optionally) sets the Automatic chapters numbers. */
export async function memoryOn(page: Page, set: { keep?: number; every?: number } = {}) {
  await openTab(page, "memory");
  const pane = page.getByTestId("memory-pane");
  await pane.getByTestId("memory-turn-on").click();
  await expect(pane.getByTestId("memory-stats")).toBeVisible();
  if (set.keep !== undefined || set.every !== undefined) {
    await pane.getByTestId("memory-fold-auto").getByRole("button", { name: /Automatic chapters/ }).click();
    for (const [label, v] of [["Messages per chapter", set.every], ["Newest messages kept word for word", set.keep]] as const) {
      if (v === undefined) continue;
      await pane.getByLabel(label).fill(String(v));
      await pane.getByLabel(label).press("Enter");
    }
  }
  return pane;
}
