// A failed start shows its reason instead of crashing React (hooks must not follow an early return). Author: CLAUDE, 2026-11-03.
import { expect, test } from "@playwright/test";

test("a database that cannot load shows the boot error screen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/sql-wasm\.wasm/, (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".boot.error")).toContainText("Could not start");
  expect(errors.filter((m) => /hooks/i.test(m))).toEqual([]);
});
