// Regressions for the twelve UX findings authorized by Daniel. CODEX, 2026-11-03.
import { expect, test } from "@playwright/test";
import { editCharacter, openLibrary } from "./ui.ts";
test("Play and Assistant retain separate unsent drafts across navigation", async ({ page }) => {
  await page.goto("/"); await page.getByLabel("Your message", { exact: true }).fill("Play draft");
  await openLibrary(page, "Characters"); await page.getByTestId("session-list").getByRole("button").first().click();
  await expect(page.getByLabel("Your message", { exact: true })).toHaveValue("Play draft");
  await page.getByRole("tab", { name: "Assistant", exact: true }).click(); await page.getByLabel("Message to the Assistant").fill("Assistant draft");
  await page.getByRole("tab", { name: "Play", exact: true }).click(); await expect(page.getByLabel("Your message", { exact: true })).toHaveValue("Play draft");
  await page.getByRole("tab", { name: "Assistant", exact: true }).click(); await expect(page.getByLabel("Message to the Assistant")).toHaveValue("Assistant draft");
});
test("unsaved connection can stay, save then navigate, or discard", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("app-list").getByRole("button", { name: "Settings", exact: true }).click(); await page.getByTestId("settings-connections").click();
  await page.getByLabel("Connection name").fill("Protected connection"); await page.getByTestId("settings-defaults").click();
  const dialog = page.getByRole("dialog", { name: "Unsaved Changes" }); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stay", exact: true }).click(); await expect(page.getByLabel("Connection name")).toHaveValue("Protected connection");
  await page.getByTestId("settings-defaults").click(); await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("settings-defaults")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("settings-connections").click(); await expect(page.getByLabel("Connection name")).toHaveValue("Protected connection");
  await page.getByLabel("Connection name").fill("Discard me"); await page.getByTestId("settings-defaults").click(); await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByTestId("settings-connections").click(); await expect(page.getByLabel("Connection name")).toHaveValue("Protected connection");
});
test("character Close protects a dirty draft and failed saves keep it open", async ({ page }) => {
  await page.goto("/"); await openLibrary(page, "Characters"); await editCharacter(page, "Lyra");
  const editor = page.getByLabel("Character editor"); await editor.getByLabel("Name", { exact: true }).fill(""); await editor.getByRole("button", { name: "Close", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Unsaved Changes" }); await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toBeVisible(); await expect(editor).toContainText("needs a name"); await dialog.getByRole("button", { name: "Stay", exact: true }).click();
  await editor.getByLabel("Name", { exact: true }).fill("Saved Lyra"); await editor.getByRole("button", { name: "Close", exact: true }).click(); await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("character-sheet")).toContainText("Saved Lyra");
});
test("palette contains Tab, closes with Escape and restores the composer focus", async ({ page }) => {
  await page.goto("/"); const box = page.getByLabel("Your message", { exact: true }); await box.focus(); await page.keyboard.press("Control+k");
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="palette"]'))).toBe(true); }
  await page.keyboard.press("Escape"); await expect(page.getByTestId("palette")).toHaveCount(0); await expect(box).toBeFocused();
});
test("minimum desktop width keeps a readable chat and a reachable inspector", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 }); await page.goto("/");
  const composer = page.getByLabel("Your message", { exact: true }); await expect(composer).toBeVisible();
  expect((await page.locator(".story-pane").boundingBox())!.width).toBeGreaterThan(400);
  await page.getByRole("button", { name: "Show Inspector", exact: true }).click(); await expect(page.getByTestId("tab-prompt")).toBeVisible();
});
test("empty composer names continuation and global search finds actual message text", async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
  await page.getByLabel("Your message", { exact: true }).fill("cobalt-needle-UX"); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("message")).toHaveCount(3); await page.keyboard.press("Control+k"); await page.getByRole("combobox", { name: "Open anything" }).fill("cobalt-needle-UX");
  await expect(page.getByRole("group", { name: "Messages", exact: true })).toContainText("cobalt-needle-UX"); await page.getByRole("group", { name: "Messages", exact: true }).getByRole("option").first().click();
  await expect(page.getByTestId("messages")).toContainText("cobalt-needle-UX");
});
test("one send-key preference applies to both composers", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("app-list").getByRole("button", { name: "Settings", exact: true }).click(); await page.getByTestId("settings-general").click();
  await page.getByRole("radiogroup", { name: "Send Messages With" }).getByRole("radio", { name: "Ctrl+Enter" }).click();
  await page.getByTestId("session-list").getByRole("button").first().click(); const play = page.getByLabel("Your message", { exact: true });
  await play.fill("First line"); await play.press("Enter"); await expect(play).toHaveValue("First line\n"); await expect(page.getByTestId("message")).toHaveCount(1);
  await play.press("Control+Enter"); await expect(page.getByTestId("message")).toHaveCount(3);
  await page.getByRole("tab", { name: "Assistant", exact: true }).click(); const assistant = page.getByLabel("Message to the Assistant"); await assistant.fill("Hello"); await assistant.press("Enter");
  await expect(assistant).toHaveValue("Hello\n"); await expect(page.getByTestId("assistant-reply")).toHaveCount(0); await assistant.press("Control+Enter"); await expect(page.getByTestId("assistant-reply")).toHaveCount(1);
});
test("Play restores an unsent message if saving fails before accepting it", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error Browser-only preview import; no actual provider call.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady;
    svc.chat.send = async () => { throw new Error("Synthetic message save failed"); };
  });
  await page.getByLabel("Your message", { exact: true }).fill("Recover my draft"); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Synthetic message save failed"); await expect(page.getByLabel("Your message", { exact: true })).toHaveValue("Recover my draft");
  await expect(page.getByTestId("message")).toHaveCount(1);
});
