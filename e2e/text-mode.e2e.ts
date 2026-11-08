// Click tests of the character editor's Text layout (D-102): one document, fixed titles, Find / Replace with one Undo,
// Compare with Put back, and the same card in the other layouts. Author: CLAUDE, 2026-11-08.
import { expect, test, type Page } from "@playwright/test";
import { editCharacter, openLibrary } from "./ui.ts";

const editor = (page: Page) => page.getByLabel("Character editor");
const doc = (page: Page) => editor(page).locator(".cm-content");
const title = (page: Page, name: string) => editor(page).locator(".tm-head").filter({ has: page.getByRole("button", { name, exact: true }) });

async function openText(page: Page) {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  await editor(page).getByRole("radio", { name: "Text" }).click();
  await expect(editor(page).getByTestId("text-mode")).toBeVisible();
}

/** Puts the cursor at the end of the first line of a field and types. */
async function typeAtEndOf(page: Page, field: string, text: string) {
  const line = title(page, field).locator("xpath=following-sibling::div[contains(@class,'cm-line')][1]");
  await line.click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

test("the card as one document: fixed titles, edits reach the other layouts, empty fields hidden until asked", async ({ page }) => {
  await openText(page);
  await expect(title(page, "Name")).toBeVisible();
  await expect(title(page, "Description")).toBeVisible();
  await expect(title(page, "First Message")).toBeVisible();
  const hidden = await editor(page).locator(".tm-head").count();
  await editor(page).getByLabel("Show Empty Fields").check();
  await expect(editor(page).locator(".tm-head")).not.toHaveCount(hidden);
  await expect(title(page, "Creator Notes")).toBeVisible();
  await editor(page).getByLabel("Show Empty Fields").uncheck();
  await expect(title(page, "Creator Notes")).toHaveCount(0);

  await typeAtEndOf(page, "Description", " Hums when nervous.");
  await expect(editor(page).locator(".ce-dirty")).toHaveText("Unsaved changes");
  await page.screenshot({ path: "e2e/.results/text-mode.png" });

  // select everything and delete: the texts go, the titles stay
  await doc(page).click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await expect(title(page, "Name")).toBeVisible();
  await expect(title(page, "Description")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(doc(page)).toContainText("Hums when nervous.");

  await editor(page).getByRole("radio", { name: "Sheet" }).click();
  await expect(editor(page).getByLabel("Description")).toHaveValue(/Hums when nervous\.$/);
  await expect(editor(page).getByLabel("Name")).toHaveValue("Lyra");
});

test("Find and Replace across fields: every match marked, regex with $1, Replace All is one undo, a broken regex says so", async ({ page }) => {
  await openText(page);
  await typeAtEndOf(page, "Description", " Lyra hums. Lyra sings.");
  await page.keyboard.press("Control+h");
  const find = editor(page).getByLabel("Find", { exact: true });
  await expect(find).toBeFocused();
  await find.fill("Lyra");
  await expect(editor(page).locator(".tm-count")).toHaveText(/found|of/);
  const n = await editor(page).locator(".tm-hit").count();
  expect(n).toBeGreaterThanOrEqual(3); // the name and the two in the description
  await expect(title(page, "Name").locator(".tm-hits")).toHaveText("1 match");
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.screenshot({ path: "e2e/.results/text-mode-find.png" });

  await page.keyboard.press("F3");
  await expect(editor(page).locator(".tm-count")).toHaveText(new RegExp(`^\\d+ of ${n}$`));

  await editor(page).getByTitle("Regular expression ($1 works in Replace)").click();
  await find.fill("(Ly)ra (\\w+)");
  await editor(page).getByLabel("Replace with").fill("$1RA $2!");
  await editor(page).getByRole("button", { name: "Replace All" }).click();
  await expect(editor(page).getByRole("status")).toContainText(/Replaced \d+\. Ctrl\+Z undoes it\./);
  await expect(doc(page)).toContainText("LyRA hums!. LyRA sings!.");
  await doc(page).click();
  await page.keyboard.press("Control+z");
  await expect(doc(page)).toContainText("Lyra hums. Lyra sings.");

  await find.fill("(oops");
  await expect(editor(page).getByRole("alert")).toContainText("Not a valid regular expression");
  await expect(editor(page).getByRole("button", { name: "Replace All" })).toBeDisabled();
  await find.press("Escape");
  await expect(editor(page).getByRole("search")).toHaveCount(0);
});

test("Compare with Before This Edit: changes side by side, Put Back one, Put Back All", async ({ page }) => {
  await openText(page);
  await typeAtEndOf(page, "Description", " First addition.");
  await typeAtEndOf(page, "Name", " Vale");
  await editor(page).getByRole("button", { name: "Compare…" }).click();
  const cmp = editor(page).getByRole("dialog", { name: "Compare" });
  await expect(cmp.getByLabel("Compare with")).toHaveValue("before");
  await expect(cmp.locator(".tm-sum")).toHaveText("2 changes");
  await expect(cmp.getByRole("region", { name: "Name" }).locator("ins")).toHaveText(" Vale");
  await page.screenshot({ path: "e2e/.results/text-mode-compare.png" });

  await cmp.getByRole("region", { name: "Name" }).getByRole("button", { name: "Put Back" }).click();
  await expect(cmp.locator(".tm-sum")).toHaveText("1 change");
  await cmp.getByRole("button", { name: "Put Back All" }).click();
  await expect(cmp.getByText("The card is the same as before this edit.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cmp).toHaveCount(0);
  await expect(doc(page)).not.toContainText("First addition.");

  // the title's menu: a new greeting, and Open in Form
  await title(page, "First Message").getByRole("button", { name: "First Message" }).click();
  await page.getByRole("menuitem", { name: "Add Another Greeting" }).click();
  await expect(title(page, "Greeting 2")).toBeVisible();
  await page.keyboard.type("A second opening.");
  await title(page, "Description").getByRole("button", { name: "Description" }).click();
  await page.getByRole("menuitem", { name: "Open in Form" }).click();
  await expect(editor(page).getByRole("radio", { name: "Sheet" })).toHaveAttribute("aria-checked", "true");
  await expect(editor(page).getByRole("button", { name: /^Show greeting \d$/ })).toHaveCount(2);
});
