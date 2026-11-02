// Click tests: sessions and characters (sidebar + editor). Author: CLAUDE, 2026-10-23.
import { expect, test, type Page } from "@playwright/test";
import { editCharacter, newChatWith, openLibrary } from "./ui.ts";

const sessions = (p: Page) => p.getByTestId("session-list").getByRole("button");

test("create a character, then start a session with them", async ({ page }) => {
  await page.goto("/");
  await expect(sessions(page)).toHaveCount(1);

  await openLibrary(page, "Characters");
  await page.getByRole("button", { name: "New Character" }).click();
  await page.getByRole("button", { name: "Create Character" }).click();
  await expect(page.getByRole("alert")).toContainText("needs a name");

  await page.getByPlaceholder("e.g. Lyra").fill("Corvin");
  await page.getByLabel("Character editor").getByLabel("Description").fill("A tired innkeeper with a secret.");
  await page.getByLabel("Greeting 1", { exact: true }).fill("*Corvin wipes a mug.* \"Room's two silver.\"");
  await page.getByRole("button", { name: "Create Character" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await expect(page.getByText("2 in the library")).toBeVisible(); 

  await page.getByLabel("Character editor").getByRole("button", { name: "Chat Now" }).click();
  await expect(sessions(page)).toHaveCount(2);
  await expect(sessions(page).first()).toContainText("Session with Corvin");
  await expect(page.getByTestId("message").first()).toContainText("Room's two silver.");
});

test("switch between sessions keeps each conversation separate", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Write your message/).fill("Message in Lyra's story");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("message")).toHaveCount(3, { timeout: 10_000 });

  await newChatWith(page);
  await expect(sessions(page)).toHaveCount(2);
  await expect(page.getByTestId("message")).toHaveCount(1); // fresh session: only the greeting

  await sessions(page).nth(1).click(); // the older session
  await expect(page.getByTestId("message")).toHaveCount(3);
  await expect(page.getByTestId("message").nth(1)).toContainText("Message in Lyra's story");
});

test("rename a session; moving it to the Trash can be undone", async ({ page }) => {
  await page.goto("/");
  await page.getByTitle("Click to rename").click();
  const title = page.getByLabel("Session title");
  await title.fill("The Mill at Dusk");
  await title.press("Enter");
  await expect(sessions(page).first()).toContainText("The Mill at Dusk");

  await page.getByTestId("chat-menu").click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(sessions(page)).toHaveCount(0);
  await expect(page.getByText("No session open.")).toBeVisible();
  await expect(page.getByTestId("notice")).toContainText("moved to the Trash");
  await page.getByTestId("notice").getByRole("button", { name: "Undo" }).click();
  await expect(sessions(page)).toHaveCount(1);
  await expect(page.getByTestId("messages")).toBeVisible();
});

test("a character used by a session cannot go to the Trash, with a clear reason", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page);
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByRole("alert")).toContainText("used by 1 session");
  await expect(page.getByText("1 in the library")).toBeVisible();
});

test("every option has a '?' that explains it", async ({ page }) => {
  await page.goto("/");
  // D-078: the "?" stay out of sight until their row is pointed at; Recent's explanation is now its tooltip
  await expect(page.getByText("Recent", { exact: true })).toHaveAttribute("title", /Your last chats/);
  await page.getByRole("button", { name: "Explain" }).first().click();
  await expect(page.getByRole("note")).toBeVisible();
  await page.mouse.click(900, 400); // click elsewhere closes it
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.screenshot({ path: "e2e/.results/library-after.png" });
});
