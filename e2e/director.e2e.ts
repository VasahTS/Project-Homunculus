// The Director (D-092): ask out of character, add a proposed note, the story's replies use it, setup is data, pop out.
// Author: CLAUDE, 2026-11-06. Uses the offline test AI.
import { expect, test } from "@playwright/test";
import { newChatWith, openLibrary, openTab, send } from "./ui.ts";

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
  await expect(d.getByTestId("director-note")).toContainText("Sent with 2 replies here");
  // writing one yourself: the box grows with the text; its own instruction opens under "How the story treats it"
  await d.getByRole("radio", { name: /Active/ }).click();
  await d.getByTestId("director-write").click();
  await d.getByTestId("director-new-note").fill("Mira hums an old song while she works. ".repeat(6));
  await d.getByTestId("director-new-add").click();
  const card = d.getByTestId("director-note").first();
  expect((await card.getByLabel("Note", { exact: true }).boundingBox())!.height).toBeGreaterThan(60);
  await card.getByRole("button", { name: /How the story treats it/ }).click();
  await card.getByTestId("director-own").click();
  await expect(card.getByLabel("Its own instruction")).toHaveValue(/Follow quietly/);
});

test("the setup is editable data: weights, the writer line; it pops out and docks", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await newChatWith(page);
  await openTab(page, "director");
  const d = page.getByTestId("director");
  await d.getByTestId("director-setup-open").click();
  const sheet = page.getByTestId("director-sheet");
  const line = sheet.getByLabel("The writer line");
  await line.fill("You may write short story samples when asked.");
  await line.blur();
  await sheet.getByTestId("director-add-weight").click();
  await expect(sheet.getByTestId("director-weight")).toHaveCount(4);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await d.getByTestId("director-view-notes").click();
  await d.getByTestId("director-write").click();
  await expect(d.getByLabel("Weight").first()).toContainText("New weight");

  await d.getByTestId("director-pop").click();
  const win = page.getByTestId("director-window");
  await expect(win).toBeVisible();
  // resize from the corner, then maximize and restore
  const before = (await win.boundingBox())!;
  const corner = (await win.getByTestId("director-resize-se").boundingBox())!;
  await page.mouse.move(corner.x + 5, corner.y + 5);
  await page.mouse.down();
  await page.mouse.move(corner.x + 125, corner.y - 95, { steps: 5 });
  await page.mouse.up();
  const after = (await win.boundingBox())!;
  expect(Math.round(after.width - before.width)).toBe(120);
  expect(Math.round(after.height - before.height)).toBe(-100);
  await win.getByTestId("director-max").click();
  expect((await win.boundingBox())!.width).toBeGreaterThan(1400);
  await win.getByTestId("director-max").click();
  expect(Math.round((await win.boundingBox())!.width)).toBe(Math.round(after.width));
  await win.getByTestId("director-setup-open").click();
  await expect(page.getByTestId("director-sheet").getByLabel("The writer line")).toHaveValue("You may write short story samples when asked.");
  await page.getByRole("button", { name: "Close the setup" }).click();
  await win.getByRole("button", { name: "Close the Director" }).click();
  await expect(win).toHaveCount(0);
  await page.locator(".inspector").getByRole("button", { name: "Show it" }).click();
  await expect(win).toBeVisible();
  await win.getByTestId("director-pop").click(); // Dock
  await expect(win).toHaveCount(0);
  await expect(page.locator(".inspector").getByTestId("director")).toBeVisible();
});

test("a proposed change shows before and after, applies, and Undo puts it back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await newChatWith(page);
  await openTab(page, "director");
  const d = page.getByTestId("director");
  await d.getByTestId("director-input").fill("Can you fix the Author's Note?");
  await d.getByTestId("director-ask").click();
  const card = d.getByTestId("director-change");
  await expect(card).toContainText("Author's Note");
  await expect(card.getByLabel("After")).toHaveText("Keep the night quiet and slow.");
  await card.getByTestId("director-apply").click();
  await expect(card).toContainText("Applied");
  await openTab(page, "prompt");
  await expect(page.locator(".inspector")).toContainText("Keep the night quiet and slow.");
  await openTab(page, "director");
  await d.getByTestId("director-change").getByTestId("director-undo").click();
  await expect(d.getByTestId("director-change")).toContainText("Undone");
});

test("Ask the Director from a message, quick questions, edit and ask again, a note from an answer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await newChatWith(page);
  await page.getByTestId("messages").locator("li").first().hover();
  await page.getByTestId("ask-director").first().click();
  const d = page.getByTestId("director");
  await expect(d.getByTestId("director-input")).toHaveValue(/^About #1 \(Lyra\): "/);
  await d.getByTestId("director-quick").getByRole("button", { name: "Where is the story going?" }).click();
  await expect(d.getByTestId("director-proposal")).toHaveCount(1);
  await expect(d.getByTestId("director-meter")).toContainText("tokens per question");
  // edit the question: it goes back into the box and the answer leaves
  await d.getByTestId("director-question").hover();
  await d.getByTestId("director-edit").click();
  await expect(d.getByTestId("director-input")).toHaveValue("Where is the story going?");
  await expect(d.getByTestId("director-proposal")).toHaveCount(0);
  await d.getByTestId("director-ask").click();
  await expect(d.getByTestId("director-proposal")).toHaveCount(1);
  await d.locator(".director-turn.a").hover();
  await d.getByTestId("director-note-from").click();
  await expect(d.getByTestId("director-new-note")).toHaveValue(/Offline test AI here/);
});

test("Library → Directors: make one, rename it, make it the default; a chat then uses it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await openLibrary(page, "Directors");
  const lib = page.getByTestId("directors-page");
  await lib.getByTestId("directors-new").click();
  const name = lib.getByLabel("Director name");
  await expect(name).toHaveValue("New director");
  await name.fill("Campaign Director");
  await name.blur();
  await lib.getByTestId("directors-make-default").click();
  await expect(lib.getByRole("button", { name: /Campaign Director/ })).toContainText("★ Default");
  await newChatWith(page);
  await openTab(page, "director");
  await expect(page.getByTestId("director").getByLabel("Director", { exact: true })).toContainText("Default: Campaign Director");
});

test("docked, the Director fills the inspector: the box sits at the bottom and grows with the text", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await newChatWith(page);
  await openTab(page, "director");
  const body = (await page.locator(".inspector-body").boundingBox())!;
  const input = page.getByTestId("director-input");
  const small = (await input.boundingBox())!;
  expect(body.y + body.height - (small.y + small.height)).toBeLessThan(80);
  await input.fill("test ".repeat(120));
  await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(small.height + 40);
  const big = (await input.boundingBox())!;
  expect(big.y + big.height).toBeLessThanOrEqual(body.y + body.height + 1);
});
