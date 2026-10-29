// Click tests of slice 1: character versions, personas (+ versions, default, SillyTavern import),
// history of saves and the Trash. Author: CLAUDE, 2026-10-28.
import { expect, test, type Page } from "@playwright/test";
import { editCharacter, openLibrary, openSession, send } from "./ui.ts";

const editor = (page: Page) => page.getByLabel("Character editor");

test("a character version is edited apart from Main, picked per session, and used by the AI", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  const description = editor(page).getByLabel("Description");
  const original = await description.inputValue();

  await page.getByRole("button", { name: "+ New Version" }).click();
  await page.getByLabel("New version name").fill("Modern");
  await page.getByRole("button", { name: "Add Version" }).click();
  await expect(description).toHaveValue(original); // a new version starts like Main
  await description.fill("A barista in a rainy city.");
  await expect(editor(page).locator(".changed-mark", { hasText: "changed in this version" }).last()).toBeVisible();
  await expect(editor(page).getByRole("button", { name: "Use Main" })).toHaveCount(1);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await page.getByRole("tab", { name: "Main" }).click();
  await expect(description).toHaveValue(original); // Main did not change
  await page.screenshot({ path: "e2e/.results/character-versions.png" });

  await openSession(page);
  await page.getByTestId("who-button").click();
  await page.getByLabel("Lyra version").selectOption({ label: "Modern" });
  await expect(page.getByTestId("who-button")).toContainText("with Lyra · Modern");
  await page.screenshot({ path: "e2e/.results/who-picker.png" });
  await page.keyboard.press("Escape");
  await send(page, "Hi");
  await page.getByRole("button", { name: "Details" }).last().click();
  await expect(page.getByTestId("reply-cast")).toHaveText("Lyra (Modern)");
  await page.getByRole("button", { name: "Open the full prompt" }).click();
  await expect(page.getByTestId("reply-prompt")).toContainText("A barista in a rainy city.");
});

test("a new session can start with a version", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  await page.getByRole("button", { name: "+ New Version" }).click();
  await page.getByLabel("New version name").fill("Wounded");
  await page.getByRole("button", { name: "Add Version" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Start Session with Lyra (Wounded)" }).click();
  await expect(page.getByTestId("who-button")).toContainText("with Lyra · Wounded");
  await expect(page.getByTestId("session-list").getByRole("button").first()).toContainText("Session with Lyra (Wounded)");
});

test("personas: the first one becomes the default, its name is used in the story, a version can be picked", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Personas");
  await page.getByRole("button", { name: "New Persona" }).click();
  await page.getByLabel("Persona editor").getByLabel("Name", { exact: true }).fill("Dan");
  await page.getByLabel("Persona editor").getByLabel("Description").fill("A traveller from the coast.");
  await page.getByRole("button", { name: "Create Persona" }).click();
  await expect(page.getByTestId("persona-list")).toContainText("Dandefault");
  await expect(page.getByRole("switch", { name: "Default persona" })).toHaveAttribute("aria-checked", "true");

  await openSession(page);
  await expect(page.getByTestId("who-button")).toContainText("as Dan");
  await send(page, "Hello, I am {{user}}.");
  const mine = page.getByTestId("message").nth(1);
  await expect(mine).toContainText("Dan");
  await expect(mine).toContainText("Hello, I am Dan.");

  // a version of the persona, picked in the session
  await openLibrary(page, "Personas");
  await page.getByTestId("persona-list").getByRole("button", { name: "Dan" }).click();
  await page.getByRole("button", { name: "+ New Version" }).click();
  await page.getByLabel("New version name").fill("Knight");
  await page.getByRole("button", { name: "Add Version" }).click();
  await page.getByLabel("Persona editor").getByLabel("Name", { exact: true }).fill("Sir Dan");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await openSession(page);
  await page.getByTestId("who-button").click();
  await page.getByLabel("Persona version").selectOption({ label: "Knight" });
  await expect(page.getByTestId("who-button")).toContainText("as Sir Dan");
  await page.keyboard.press("Escape");
  await send(page, "Kneel.");
  await page.getByRole("button", { name: "Details" }).last().click();
  await expect(page.getByTestId("reply-persona")).toHaveText("Sir Dan (Knight)");
});

test("history: every save is kept and an old version can be restored", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  const personality = editor(page).getByLabel("Personality");
  const first = await personality.inputValue();
  await personality.fill("Warm and open.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await personality.fill("Cold as winter.");
  await page.getByRole("button", { name: "Save" }).click();

  await editor(page).locator("summary", { hasText: "History" }).click();
  const items = page.getByTestId("history").locator("li");
  await expect(items).toHaveCount(3); // the version from before + two saves
  await expect(items.first()).toContainText("current");
  await expect(items.nth(1)).toContainText("changed: personality");
  await items.nth(2).locator("summary").click();
  await page.getByRole("button", { name: "Restore This Version" }).click();
  await page.getByRole("button", { name: "Click Again to Restore" }).click();
  await expect(personality).toHaveValue(first);
  await expect(items).toHaveCount(4); // restoring is a new save, so it can be undone too
  await page.screenshot({ path: "e2e/.results/history.png" });
});

test("the Trash: restore, then delete forever", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await page.getByRole("button", { name: "New Character" }).click();
  await editor(page).getByLabel("Name", { exact: true }).fill("Temp");
  await page.getByRole("button", { name: "Create Character" }).click();
  await expect(page.getByTestId("character-list")).toContainText("Temp");
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByTestId("character-list")).not.toContainText("Temp");

  await openLibrary(page, "Trash");
  await expect(page.getByTestId("trash-list")).toContainText("Temp");
  await page.screenshot({ path: "e2e/.results/trash.png" });
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByTestId("trash-list")).toContainText("The Trash is empty.");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Temp");
  await page.getByRole("button", { name: "Move to Trash" }).click();

  await openLibrary(page, "Trash");
  await page.getByRole("button", { name: "Delete Forever" }).click();
  await page.getByRole("button", { name: "Click Again to Delete" }).click();
  await expect(page.getByTestId("trash-list")).toContainText("The Trash is empty.");
});

test("personas import from a SillyTavern backup, with their pictures", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Personas");
  const backup = {
    personas: { "user-default.png": "Daniel", "1700000000.png": "Mara" },
    persona_descriptions: {
      "user-default.png": { description: "A traveller.", position: 0, depth: 2, role: 0, lorebook: "", title: "" },
      "1700000000.png": { description: "A smuggler.", position: 4, depth: 1, role: 0, lorebook: "", title: "" },
    },
    default_persona: "1700000000.png",
  };
  // a 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.getByTestId("persona-import-input").setInputFiles([
    { name: "personas_20261028.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) },
    { name: "user-default.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(page.getByTestId("notice")).toContainText("Imported 2 persona(s): Daniel, Mara");
  await expect(page.getByTestId("notice")).toContainText('"1700000000.png" was not among the picked files');
  await expect(page.getByTestId("persona-list")).toContainText("Maradefault");
  await page.getByTestId("persona-list").getByRole("button", { name: "Mara" }).click();
  await expect(page.getByLabel("Place in the prompt")).toHaveValue("atDepth");
  await page.getByTestId("persona-list").getByRole("button", { name: "Daniel" }).click();
  await expect(page.getByAltText("Daniel portrait")).toBeVisible();
  await page.screenshot({ path: "e2e/.results/personas.png" });
});
