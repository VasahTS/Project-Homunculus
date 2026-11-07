// "From a card…" on a story's "How it starts" (D-095): any card's scenario and greetings, without copying and pasting.
// Author: CLAUDE, 2026-11-07.
import { expect, test } from "@playwright/test";
import { openLibrary } from "./ui.ts";

const MIRA = {
  spec: "chara_card_v2", spec_version: "2.0",
  data: {
    name: "Mira", description: "A harbor smuggler.", scenario: "{{char}} runs a tea shop over a smuggling tunnel.",
    first_mes: "*{{char}} wipes the counter.* \"Closed, {{user}}.\"", alternate_greetings: ["The bell rings twice.", "Rain on the shutters."],
  },
};

test("a story takes a card's scenario and greetings from any card in Characters", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await page.getByTestId("import-input").setInputFiles({ name: "Mira.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(MIRA)) });
  await expect(page.getByTestId("notice")).toContainText("Mira");

  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const create = page.getByTestId("new-story");
  await create.getByLabel("Story name").fill("Tea and Tunnels");
  await create.getByRole("button", { name: /Narrated adventure/ }).click();
  await create.getByLabel("An empty story").check();
  await create.getByTestId("create-story").click();
  await expect(page.getByTestId("story-page")).toBeVisible();

  // Mira is not in the story: every card in Characters can be used
  await page.getByTestId("scenario-from-card").click();
  const picker = page.getByTestId("picker");
  await picker.getByLabel("Search Cards").fill("Mira");
  await picker.getByTestId("pick-row").filter({ hasText: "Mira" }).click(); // a click only shows it
  await expect(picker).toBeVisible();
  const detail = picker.getByTestId("card-start-detail");
  await expect(detail).toContainText("3");
  await detail.getByRole("button", { name: "Use as the scenario" }).click();
  await expect(detail).toContainText("✓ In the scenario");
  await detail.getByRole("button", { name: "Add the first message as an opening" }).click();
  await detail.getByRole("button", { name: "Add greeting 2 as an opening" }).click();
  await expect(detail.getByText("✓ An opening")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);

  await expect(page.getByLabel("Scenario").first()).toHaveValue("Mira runs a tea shop over a smuggling tunnel.");
  await expect(page.getByLabel("Opening 2")).toHaveValue("Rain on the shutters.");
  await page.getByRole("tab", { name: "1" }).click();
  await expect(page.getByLabel("Opening 1")).toHaveValue("*Mira wipes the counter.* \"Closed, {{user}}.\"");

  // the greetings link opens the same window; Enter adds the ones still missing
  await page.getByTestId("openings-from-card").click();
  await picker.getByLabel("Search Cards").fill("Mira");
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(page.getByLabel("Openings").getByRole("tab")).toHaveCount(3);
  await page.getByRole("tab", { name: "3" }).click();
  await expect(page.getByLabel("Opening 3")).toHaveValue("The bell rings twice.");
});
