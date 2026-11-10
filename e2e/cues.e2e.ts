// Cues (D-113): Library → Cues, an example, switching it on, the reply's receipt, the Scene's values, Try It, Setup,
// and a JanitorAI lorebook script imported as a cue. Browser preview + offline test AI. Author: CLAUDE, 2026-11-10.
import { expect, test } from "@playwright/test";
import { openLibrary, openSession, openTab, send } from "./ui.ts";

test("an example cue, on in every chat: it reads your words, remembers, writes, and says so in the Reply tab and the Scene", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Cues");
  // the two starters that used to be "No AI call" agents are here
  await expect(page.getByTestId("cue-row")).toHaveCount(2);
  await page.getByTestId("cues-examples").click();
  await page.getByTestId("cue-example-boundary").click();
  const editor = page.getByTestId("cue-editor");
  await expect(editor.getByLabel("Cue name")).toHaveValue("Boundary");
  await editor.getByRole("switch", { name: "On in every chat" }).click();
  await expect(editor.getByRole("switch", { name: "On in every chat" })).toHaveAttribute("aria-checked", "true");

  await openSession(page);
  await send(page, "Please stop, I don't want this.");
  await openTab(page, "reply");
  const receipt = page.getByTestId("reply-cues");
  await expect(receipt).toContainText("Boundary", { timeout: 15_000 });
  await expect(receipt).toContainText("paused");
  await expect(receipt).toContainText("yes");
  await expect(receipt).toContainText("Stop");
  await openTab(page, "scene");
  await expect(page.getByTestId("scene-cues")).toContainText("Boundary");
  await expect(page.getByTestId("scene-cue-value")).toHaveValue("yes");

  // the next reply: "go on" lifts it, a value you edit wins
  await send(page, "It's okay now, go on.");
  await expect(page.getByTestId("scene-cue-value")).toHaveValue("no", { timeout: 15_000 });
  await page.getByTestId("scene-cue-value").fill("yes");
  await page.getByTestId("scene-cue-value").press("Enter");
  await expect(page.getByTestId("scene").locator(".edited-mark")).toBeVisible();
});

test("Try It shows what a cue would read, remember and write, with nothing saved; the chat's Prompt tab switches cues", async ({ page }) => {
  await page.goto("/");
  await openSession(page);
  await send(page, "Hello.");
  await openLibrary(page, "Cues");
  await page.getByTestId("cue-row").filter({ hasText: "Grounded Complication" }).click();
  await page.getByTestId("cue-try").click();
  const tryIt = page.getByTestId("cue-try-it");
  await expect(tryIt.getByTestId("cue-try-writes")).toContainText("Grounded Complication");
  await page.keyboard.press("Escape");

  await openSession(page);
  await openTab(page, "prompt");
  const card = page.getByRole("button", { name: /^Cues/ }).first();
  if (!(await page.getByTestId("session-cues").isVisible())) await card.click();
  await page.getByTestId("session-cues").getByLabel("Don't Write for User").check();
  await expect(page.getByTestId("session-cues")).toContainText("changed in this chat");
  await page.getByRole("button", { name: "Preview Prompt", exact: true }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("Never write User's actions");
});

test("a JanitorAI lorebook script comes in as a cue of writing rules", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Cues");
  const script = [
    { key: ["None."], constant: true, content: "Keep bodies plausible.", name: "PLAUSIBILITY", extensions: {}, insertion_order: 100, minMessages: 0 },
    { key: ["/sext|texting/i"], content: "Texting rules.", name: "SEXTING", extensions: {}, insertion_order: 200, minMessages: 3, probability: 70, inclusionGroup: ["behavior"] },
  ];
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import" }).click();
  await (await chooser).setFiles({ name: "Rules.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(script)) });
  const editor = page.getByTestId("cue-editor");
  await expect(editor.getByLabel("Cue name")).toHaveValue("Rules");
  await expect(editor.getByTestId("cue-text")).toHaveCount(2);
  await expect(editor.getByTestId("cue-text").nth(1)).toContainText("words: sext, texting");
  await expect(editor.getByTestId("cue-text").nth(1)).toContainText("70%");
});
