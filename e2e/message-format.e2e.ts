// Message formatting (D-061): Markdown, dialogue color, filtered HTML. Author: CLAUDE, 2026-11-01.
import { expect, test } from "@playwright/test";
import { newChatWith } from "./ui.ts";

const TEXT = `*She waits.* "You're late." **Very.**\n<font color="#ff0000">Red</font> <span style="position:fixed;color:#00ff00">green</span> <img src="https://example.com/x.png"><script>window.__x=1</script><a href="https://example.com">link</a>`;

test("narration, dialogue, bold and the AI's colors are drawn; scripts, links and outside images are not", async ({ page }) => {
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
  await expect(f.locator("script, a, img")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
  // Settings → Messages: formatting off shows the text as written
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-messages").click();
  await page.getByRole("switch", { name: "Formatting (Markdown)" }).click();
  await expect(page.getByTestId("settings-messages-body").getByTestId("msg-format").locator("em")).toHaveCount(0);
  await page.getByRole("switch", { name: "Formatting (Markdown)" }).click();
});
