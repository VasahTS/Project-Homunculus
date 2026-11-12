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
  // D-119: "How it works" says what it reads, remembers and writes; the On pill holds where it runs
  await expect(editor.getByTestId("cue-flow")).toContainText("paused");
  await editor.getByTestId("cue-on").click();
  await editor.getByRole("switch", { name: "On in every chat" }).click();
  await expect(editor.getByRole("switch", { name: "On in every chat" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(editor.getByTestId("cue-on")).toContainText("Every chat");
  await expect(page.getByTestId("cue-row").filter({ hasText: "Boundary" })).toContainText("Every chat");

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
  // D-119: Try It sits in the editor; How it works shows the result
  await expect(page.getByTestId("cue-try-it")).toBeVisible();
  await expect(page.getByTestId("cue-try-writes")).toContainText("Grounded Complication");
  await page.getByTestId("cue-try-it").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("cue-try-it")).toHaveCount(0);

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
  await expect(editor.getByTestId("cue-text").nth(1)).toContainText("sext · texting");
  await expect(editor.getByTestId("cue-text").nth(1)).toContainText("70%");
  // D-119: the always text has its own heading; a text opens in place with its words as chips
  await expect(editor).toContainText("Always");
  await editor.getByTestId("cue-text").nth(1).getByRole("button").first().click();
  await expect(editor.getByRole("button", { name: "Remove texting" })).toBeVisible();
  const words = editor.getByRole("textbox", { name: "Needs one of these words" });
  await words.fill("dirty text, phone");
  await words.press("Enter");
  await expect(editor.getByRole("button", { name: "Remove phone" })).toBeVisible();
  await expect(editor.getByTestId("cue-save-state")).toHaveText("✓ Saved");
});

test("D-119: a value's rules read as sentences, and a part that only tests that value is a table of its stages", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Cues");
  await page.getByTestId("cues-examples").click();
  await page.getByTestId("cue-example-opens-up").click();
  const editor = page.getByTestId("cue-editor");
  await expect(editor.getByTestId("cue-flow")).toContainText("guarded");
  const rules = editor.getByTestId("cue-rule");
  await expect(rules.first()).toContainText("close");
  await expect(rules.first()).toContainText("messages ≥ 60");
  const table = editor.getByTestId("cue-stage-table");
  await expect(table.locator("thead tr").last().getByRole("columnheader")).toHaveText(["Text", "guarded", "warming", "close", "tokens"]);
  await expect(table.locator("thead tr").first()).toContainText("stage");
  // "Warming" also at "close": click its dot
  await table.getByRole("button", { name: "Warming at close" }).click();
  await expect(table.getByRole("button", { name: "Warming at close" })).toHaveAttribute("aria-pressed", "true");
  await expect(editor.getByTestId("cue-save-state")).toHaveText("✓ Saved");
  // a rule opens in its line
  await rules.first().getByRole("button").click();
  await expect(editor.getByRole("textbox", { name: "Rule value" })).toHaveValue("close");
  await editor.getByRole("button", { name: "Done" }).click();
  // ⋯ → Duplicate makes an off copy and opens it
  await editor.getByTestId("cue-more").click();
  await editor.getByTestId("cue-duplicate").click();
  await expect(page.getByTestId("cue-editor").getByLabel("Cue name")).toHaveValue("Opens Up Slowly (copy)");
  await expect(page.getByTestId("cue-row").filter({ hasText: "Opens Up Slowly (copy)" })).toContainText("Off");
});

test("D-119: a part that tests the clock's part of the day is a table too", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Cues");
  await page.getByTestId("cues-examples").click();
  await page.getByTestId("cue-example-time-of-day").click();
  const table = page.getByTestId("cue-editor").getByTestId("cue-stage-table");
  await expect(table.locator("thead tr").last().getByRole("columnheader")).toHaveText(["Text", "morning", "afternoon", "evening", "night", "tokens"]);
  await expect(table.locator("thead tr").first()).toContainText("reading: part");
});
