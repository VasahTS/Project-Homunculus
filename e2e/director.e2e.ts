// The Director (D-092): ask out of character, add a proposed note, the story's replies use it, setup is data, pop out.
// Author: CLAUDE, 2026-11-06. Uses the offline test AI.
import { expect, test } from "@playwright/test";
import { newChatWith, openTab, send } from "./ui.ts";

test.use({ reducedMotion: "reduce" });

test("ask the Director, add its note, and the next replies use it until it expires", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await newChatWith(page);
  await openTab(page, "director");
  const d = page.getByTestId("director");
  await d.getByTestId("director-input").fill("The story is drifting into a fight. How do we keep it calm?");
  await d.getByTestId("director-ask").click();
  const proposal = d.getByTestId("director-proposal");
  await expect(proposal).toContainText("Keep the scene calm for a while.");
  await proposal.getByLabel("Lasts").selectOption("2");
  await proposal.getByTestId("director-add").click();
  await expect(proposal).toContainText("Added");
  await expect(d.getByTestId("director-active")).toContainText("2 of 2 left");

  await send(page, "I sit by the fire.");
  await expect(d.getByTestId("director-active")).toContainText("1 of 2 left");
  await send(page, "I wait.");
  await expect(d.getByTestId("director-active")).toHaveCount(0);
  await d.getByTestId("director-view-notes").click();
  await d.getByRole("radio", { name: /Expired 1/ }).click();
  await expect(d.getByTestId("director-note")).toContainText("sent with 2 replies");
});

test("the setup is editable data: weights, the writer line; it pops out and docks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await newChatWith(page);
  await openTab(page, "director");
  const d = page.getByTestId("director");
  await d.getByTestId("director-view-setup").click();
  const line = d.getByLabel("The writer line");
  await line.fill("You may write short story samples when asked.");
  await line.blur();
  await d.getByTestId("director-add-weight").click();
  await expect(d.getByTestId("director-weight")).toHaveCount(4);
  await d.getByTestId("director-view-notes").click();
  await expect(d.getByLabel("Weight").first()).toContainText("New weight");

  await d.getByTestId("director-pop").click();
  const win = page.getByTestId("director-window");
  await expect(win).toBeVisible();
  await win.getByTestId("director-view-setup").click();
  await expect(win.getByLabel("The writer line")).toHaveValue("You may write short story samples when asked.");
  await win.getByRole("button", { name: "Close the Director" }).click();
  await expect(win).toHaveCount(0);
  await page.locator(".inspector").getByRole("button", { name: "Show it" }).click();
  await expect(win).toBeVisible();
  await win.getByTestId("director-pop").click(); // Dock
  await expect(win).toHaveCount(0);
  await expect(page.locator(".inspector").getByTestId("director")).toBeVisible();
});
