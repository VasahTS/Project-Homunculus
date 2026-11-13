// D-131: Settings → About → Diagnostics makes a report of numbers — and never a name, a text or a message. CLAUDE, 2026-11-13.
import { expect, test } from "@playwright/test";
import { newChatWith, send } from "./ui.ts";

test("the diagnostic report measures the app and holds only numbers", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page, "Lyra");
  await send(page, "A secret line about the old mill.");
  await page.getByRole("button", { name: "Settings" }).last().click();
  await page.getByRole("tab", { name: "About", exact: true }).click();
  await expect(page.getByTestId("start-time")).toContainText(" s · ");
  await page.getByTestId("diagnostics-run").click();
  const report = page.getByTestId("diagnostics-report");
  await expect(report).toBeVisible({ timeout: 30_000 });
  const text = await report.inputValue();
  for (const part of ["# Homunculus diagnostic report", "## System", "## Library (counts and sizes)", "## Reads, measured now", "characters (list)", "lorebooks", "messages", "frame time"]) expect(text).toContain(part);
  expect(text).not.toContain("Lyra");
  expect(text).not.toContain("secret line");
  expect(text).not.toContain("mill");
});
