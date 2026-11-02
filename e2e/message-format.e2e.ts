// Message formatting (D-061): Markdown, dialogue color, filtered HTML. Author: CLAUDE, 2026-11-01.
import { expect, test } from "@playwright/test";
import { newChatWith } from "./ui.ts";

const TEXT = `*She waits.* "You're late." **Very.**\n<font color="#ff0000">Red</font> <span style="position:fixed;color:#00ff00">green</span> <img src="https://example.com/x.png"><script>window.__x=1</script><a href="https://example.com">link</a>`;

test("narration, dialogue, bold and the AI's colors are drawn; scripts never; links open outside; web images wait for a click", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (text) => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    const c = (await svc.store.listCharacters()).find((x: { name: string }) => x.name === "Lyra");
    await svc.store.saveCharacter({ ...c, firstMessages: [text] });
  }, TEXT);
  await newChatWith(page);
  const f = page.getByTestId("msg-format").first();
  await expect(f.locator("em")).toHaveText("She waits.");
  await expect(f.locator("q.dlg")).toHaveText("\"You're late.\"");
  await expect(f.locator("strong")).toHaveText("Very.");
  await expect(f.locator("font")).toHaveAttribute("color", "#ff0000");
  await expect(f.locator("span")).toHaveAttribute("style", "color: #00ff00");
  await expect(f.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
  // a link opens in a new browser window, never inside the app
  await expect(f.locator("a.msg-link")).toHaveAttribute("href", "https://example.com");
  const popup = page.waitForEvent("popup");
  await f.locator("a.msg-link").click();
  expect((await popup).url()).toContain("example.com");
  await expect(page.getByTestId("messages")).toBeVisible();
  // a picture from a web address waits for a click
  await expect(f.locator("img")).toHaveCount(0);
  await f.getByRole("button", { name: /Show image · example\.com/ }).click();
  await expect(f.locator("img")).toHaveAttribute("src", "https://example.com/x.png");
  // Settings → Messages: formatting off shows the text as written
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-customize").click();
  await page.getByRole("switch", { name: "Formatting (Markdown)" }).click();
  await expect(page.getByTestId("settings-messages-body").getByTestId("msg-format").locator("em")).toHaveCount(0);
  await page.getByRole("switch", { name: "Formatting (Markdown)" }).click();
});
