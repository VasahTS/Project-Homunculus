// Notices (D-055). Author: CLAUDE, 2026-10-30.
import { expect, test } from "@playwright/test";
import { newChatWith, send } from "./ui.ts";
test("an agent failure shows a notice with the reason", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    await svc.core.events.emit("agent.failed", { agentId: "starter-prose-polisher", messageId: "x", trigger: "turn.after", reason: "Provider said no" });
  });
  await expect(page.getByTestId("notice")).toContainText("failed");
  await expect(page.getByTestId("notice")).toContainText("Provider said no");
  await send(page, "Hi.");
});
