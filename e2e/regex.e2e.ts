// Click tests of regex scripts (D-060). Author: CLAUDE, 2026-11-01.
import { expect, test } from "@playwright/test";
import { newChatWith, openLibrary, openTab } from "./ui.ts";

test("Library → Regex: make a script and try it", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Regex");
  await expect(page.getByTestId("regex-page")).toContainText("No scripts");
  await page.getByTestId("regex-new").click();
  await page.getByTestId("regex-name").fill("Actions");
  await page.getByTestId("regex-find").fill("/\\*(.+?)\\*/g");
  await page.getByTestId("regex-replace").fill("_$1_");
  await expect(page.getByTestId("regex-try-result")).toContainText("_draws her bow_");
  await page.getByTestId("regex-find").fill("/[/");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByTestId("regex-find").fill("/\\*(.+?)\\*/g");
  // saved: still there after leaving the page
  await openLibrary(page, "Lorebooks");
  await openLibrary(page, "Regex");
  await expect(page.getByTestId("regex-script")).toHaveCount(1);
  await expect(page.getByTestId("regex-script")).toContainText("Actions");
});

test("a card's scripts wait for an OK; HTML from display scripts is drawn in a safe box", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    const c = (await svc.store.listCharacters()).find((x: { name: string }) => x.name === "Lyra");
    await svc.store.saveCharacter({ ...c, regexScripts: [{ id: "rx-bold", name: "Bold names", find: "/(Lyra)/g", replace: "<b class=\"n\">$1</b>", targets: ["ai"], displayOnly: true }] });
  });
  await newChatWith(page);
  await expect(page.getByTestId("regex-waiting")).toContainText("1 new regex script");
  await expect(page.getByTestId("safe-html")).toHaveCount(0);
  await page.getByTestId("regex-review-open").click();
  await expect(page.getByTestId("regex-review")).toContainText("Bold names");
  await page.getByTestId("regex-review-allow").click();
  await expect(page.getByTestId("regex-waiting")).toHaveCount(0);
  const box = page.getByTestId("safe-html").first();
  await expect(box).toBeVisible();
  await expect(box.contentFrame().locator("b.n").first()).toHaveText("Lyra");
  // the Prompt tab lists it, with a switch for this chat
  await openTab(page, "prompt");
  await expect(page.getByTestId("session-regex")).toContainText("Bold names");
  await page.getByTestId("session-regex").getByRole("switch").click();
  await expect(page.getByTestId("safe-html")).toHaveCount(0);
});
