// The Personas window (D-096): the button under the message box, Ctrl+P, search, Sort, versions, Make Default,
// "Follow the default" and "No persona". Synthetic personas in the in-memory browser preview. Author: CLAUDE, 2026-11-08.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary, openSession } from "./ui.ts";

async function newPersona(page: Page, name: string, description: string) {
  await openLibrary(page, "Personas");
  await page.getByRole("button", { name: "New Persona", exact: true }).click();
  const editor = page.getByLabel("Persona editor");
  await editor.getByLabel("Name", { exact: true }).fill(name);
  await editor.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "Create Persona" }).click();
  await expect(page.getByTestId("persona-list")).toContainText(name);
}

test("the persona button opens Personas; search, play as, follow the default, no persona, Ctrl+P", async ({ page }) => {
  await page.goto("/");
  await newPersona(page, "Daniel", "A quiet cartographer from the northern coast.");
  await newPersona(page, "Kael Venn", "Mercenary with a debt he never talks about.");
  await newPersona(page, "Sister Odile", "A nun who reads forbidden books by candlelight.");
  await openSession(page);

  // the first persona is the default; the chat follows it and the button says so
  const chip = page.getByTestId("persona-chip");
  await expect(chip).toContainText("Daniel");
  await expect(chip).toContainText("(default)");

  await chip.click();
  const win = page.getByTestId("persona-picker");
  await expect(win.getByRole("heading", { name: "Personas" })).toBeVisible();
  await expect(win.getByTestId("persona-option").first()).toContainText("Follow the default");
  await expect(win.getByTestId("persona-option").first()).toContainText("now");
  // the search looks in descriptions too; Enter plays the first match
  await win.getByLabel("Search personas").fill("forbidden");
  await expect(win.getByTestId("persona-row")).toHaveCount(1);
  await expect(win.getByTestId("persona-preview")).toContainText("Sister Odile");
  await page.keyboard.press("Enter");
  await expect(win).toHaveCount(0);
  await expect(chip).toContainText("Sister Odile");
  await expect(chip).not.toContainText("(default)");
  await expect(page.getByTestId("who-button")).toContainText("as Sister Odile");

  // Esc clears the search first, then closes; Ctrl+P opens and closes it
  await page.keyboard.press("Control+p");
  await expect(win).toBeVisible();
  await win.getByLabel("Search personas").fill("zzz");
  await expect(win).toContainText("No persona matches");
  await page.keyboard.press("Escape");
  await expect(win.getByLabel("Search personas")).toHaveValue("");
  await expect(win).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);

  // a click only shows a persona; Make Default changes the default, not this chat
  await page.keyboard.press("Control+p");
  await win.getByTestId("persona-row").filter({ hasText: "Kael Venn" }).click();
  await expect(win.getByTestId("persona-preview")).toContainText("Mercenary with a debt");
  await expect(chip).toContainText("Sister Odile");
  await win.getByTestId("persona-make-default").click();
  await expect(win.getByTestId("persona-row").filter({ hasText: "Kael Venn" })).toContainText("default");
  // follow the default again: the chat now plays the new default
  await win.getByTestId("persona-option").filter({ hasText: "Follow the default" }).click();
  await expect(win.getByTestId("persona-preview")).toContainText("now Kael Venn");
  await win.getByTestId("persona-play").click();
  await expect(chip).toContainText("Kael Venn");
  await expect(chip).toContainText("(default)");

  // no persona: "You", and the top bar says nothing about a persona
  await chip.click();
  await win.getByTestId("persona-option").filter({ hasText: "No persona" }).dblclick();
  await expect(chip).toContainText("You");
  await expect(page.getByTestId("who-button")).not.toContainText(" as ");

  // "Who is in this story" opens the same window
  await page.getByTestId("who-button").click();
  await page.getByTestId("who-persona").click();
  await expect(win).toBeVisible();
  // Sort is shared with Library → Personas
  await win.getByLabel("Sort personas").selectOption("za");
  await expect(win.getByTestId("persona-row").first()).toContainText("Sister Odile");
  await win.getByLabel("Sort personas").selectOption("az");
  await expect(win.getByTestId("persona-row").first()).toContainText("Daniel");
});
