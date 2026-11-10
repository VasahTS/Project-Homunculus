// D-115: pictures for a model that can't see them, and a comic read into one card — click tests with the offline AI.
import { expect, test, type Page } from "@playwright/test";

// a 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const shot = (page: Page, name: string) => (process.env.H2_SHOTS ? page.screenshot({ path: `e2e/.results/${name}.png` }) : Promise.resolve());

test("a picture is described by the model chosen in Customize → Pictures; the description can be corrected", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  // choose the vision model (all assistants)
  await page.getByTestId("assistant-customize").click();
  await expect(page.getByTestId("assistant-customize-page")).toBeVisible();
  const vision = page.getByTestId("assistant-vision-settings");
  await vision.getByLabel("Pictures Connection").selectOption({ label: "Offline test AI" });
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByTestId("assistant-file").setInputFiles({ name: "screenshot.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("why is the send button grey?");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Offline test AI here");
  const line = page.getByTestId("assistant-picture-line");
  await expect(line).toContainText("Described by Offline test AI");
  await line.getByTestId("assistant-see-description").click();
  const box = page.getByTestId("assistant-description");
  await expect(box.getByLabel("Picture description")).toHaveValue(/grey Send button/);
  await shot(page, "vision-1-description");
  await box.getByLabel("Picture description").fill("A dark window; the Send button is grey because the box is empty.");
  await box.getByTestId("assistant-description-save").click();
  await expect(line).toContainText("Edited by you");
  // what the model gets for the next message: the corrected description, no picture
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("and now?");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-reply")).toHaveCount(2);
  await page.locator("[data-message-id]").filter({ hasText: "and now?" }).getByRole("button", { name: "Request" }).click();
  await expect(page.getByTestId("assistant-request")).toContainText("corrected by the user");
});

test("Import From a Comic: pages, skip, read, What I Understood, questions, one card with page tags", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await page.getByTestId("assistant-plus").click();
  await page.getByTestId("assistant-import-comic").click();
  const sheet = page.getByTestId("comic-import");
  await sheet.locator('input[accept^="image/png"]').setInputFiles(["010.png", "002.png", "001.png", "000-cover.png"].map((name) => ({ name, mimeType: "image/png", buffer: PNG })));
  const pages = sheet.getByTestId("comic-page");
  await expect(pages).toHaveCount(4);
  await expect(pages.first()).toHaveAttribute("title", /000-cover\.png/);
  await expect(pages.last()).toHaveAttribute("title", /010\.png/);
  await pages.first().click(); // skip the cover
  await expect(sheet.getByTestId("comic-cost")).toContainText("3 pages · 1 call with Offline test AI");
  await sheet.getByLabel("Comic title").fill("After Hours");
  await shot(page, "vision-2-import");
  await sheet.getByTestId("comic-start").click();

  await expect(page.getByTestId("assistant-comic-pages").locator("img")).toHaveCount(3);
  const card = page.getByTestId("assistant-understood");
  await expect(card).toContainText("What I Understood");
  await expect(card).toContainText("Mei");
  await card.getByTestId("assistant-understood-details").click();
  await expect(page.getByTestId("assistant-reading")).toContainText("Offline line 2.");
  await card.getByRole("button", { name: "Edit synopsis" }).click();
  await card.getByLabel("Correction").fill("Mei and Ren, siblings, are locked in the studio.");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("corrected");
  await shot(page, "vision-3-understood");
  await card.getByTestId("assistant-looks-right").click();

  const q = page.getByTestId("assistant-question").last();
  await expect(q).toContainText("Who is {{user}} in this story?");
  await expect(q).toContainText("1 of 3");
  await shot(page, "vision-4-question");
  await q.getByTestId("assistant-option").filter({ hasText: "Ren" }).click();
  await q.getByTestId("assistant-option").filter({ hasText: "The Card and a Story" }).click();
  await q.getByTestId("assistant-option").filter({ hasText: "The Beginning" }).click();
  await expect(q).toContainText("Ren");

  const item = page.getByTestId("assistant-new-item").first();
  await expect(item).toContainText("New Character");
  await expect(item).toContainText("p. 1–8");
  await expect(item).toContainText("Use a Panel as Portrait…");
  await expect(page.getByTestId("assistant-new-item")).toHaveCount(2);
  await shot(page, "vision-5-card");
  await item.getByTestId("assistant-keep").click();
  await expect(page.getByTestId("assistant-result").filter({ hasText: "After Hours" })).toContainText("saved");
});
