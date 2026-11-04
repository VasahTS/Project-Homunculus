// Dialogue color follows the look in styled (framed) messages too (D-086). Author: CLAUDE, 2026-11-04.
// Daniel: "the dialogue colors don't follow the theme's; you change it and it doesn't come back".
import { expect, test, type Page } from "@playwright/test";
import { newChatWith } from "./ui.ts";

const STYLED = '<style>.scene{border:1px solid #444;padding:8px}</style>\n<div class="scene">\n\n*She waits.* "You are late."\n\n<span style="color:#00ff00">"Green, as the AI wrote it."</span>\n\n</div>';

const frameColor = (page: Page, nth: number) => page.evaluate((i) => {
  const d = document.querySelector<HTMLIFrameElement>("[data-testid=message-html]")?.contentDocument;
  const q = d?.querySelectorAll("q.dlg")[i];
  return q ? getComputedStyle(q).color : "none";
}, nth);

async function pickLook(page: Page, name: string) {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-customize").click();
  await page.getByRole("radio", { name }).click();
  await page.getByTestId("session-list").getByRole("button").first().click();
}

test("a styled message's dialogue takes the look's color, changes with the look and comes back; the AI's own color stays", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (text) => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    const c = (await svc.store.listCharacters()).find((x: { name: string }) => x.name === "Lyra");
    await svc.store.saveCharacter({ ...c, firstMessages: [text] });
  }, STYLED);
  await newChatWith(page);
  await expect(page.getByTestId("message-html")).toBeVisible();
  await expect.poll(() => frameColor(page, 0)).toBe("rgb(242, 242, 242)"); // Mono
  await pickLook(page, "Graphite");
  await expect.poll(() => frameColor(page, 0)).toBe("rgb(230, 191, 126)");
  await expect.poll(() => frameColor(page, 1)).toBe("rgb(0, 255, 0)");
  await pickLook(page, "Mono");
  await expect.poll(() => frameColor(page, 0)).toBe("rgb(242, 242, 242)");
});
