// Assistant audit: a blocked fake request makes navigation deterministic. Author: CODEX, 2026-11-01.
import { expect, test } from "@playwright/test";

test("A7: switching chats during a reply must leave the selected chat on screen", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  const input = page.getByRole("textbox", { name: "Message to the Assistant" });
  await input.fill("Make a world tracker");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Done (offline test AI)");
  await expect(page.getByTestId("assistant-send")).toBeVisible();
  await page.getByTestId("assistant-new").click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/src/core-instance.ts";
    const { servicesReady } = await import(/* @vite-ignore */ modulePath);
    const svc = await servicesReady;
    const original = svc.core.connections.stream.bind(svc.core.connections);
    const gate = new Promise<void>((resolve) => { (window as unknown as { releaseAuditAnswer: () => void }).releaseAuditAnswer = resolve; });
    svc.core.connections.stream = async function* (...args: unknown[]) {
      await gate;
      yield* original(...args);
    };
  });
  await input.fill("Make a narrator");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByTestId("assistant-chats").getByRole("button", { name: /Make a world tracker/ }).click();
  await page.evaluate(() => (window as unknown as { releaseAuditAnswer: () => void }).releaseAuditAnswer());
  await expect(page.getByTestId("assistant-send")).toBeVisible();
  await expect(page.getByTestId("assistant-chats").locator(".side-item.on")).toContainText("Make a world tracker");
  test.fail(process.env.H2_AUDIT_VERIFY !== "1", "Confirmed Assistant audit bug A7; remove when navigation is fixed.");
  await expect(page.locator(".asst-title")).toHaveText("Make a world tracker", { timeout: 2000 });
});
