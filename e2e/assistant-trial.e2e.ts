// D-111: Try It asks first under a change, then writes the chat's latest reply twice (before | after); nothing is saved.
import { expect, test } from "@playwright/test";
import { newChatWith } from "./ui.ts";

test("a change to a card offers Try It with its cost; Try It shows before and after", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  const count = () => page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    let n = 0;
    for (const x of await svc.store.listSessions()) n += (await svc.store.messagesOf(x.id)).length;
    return n;
  });
  const before = await count();
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  // D-121: what was on screen is offered; take both (the chat and its character)
  await page.getByTestId("assistant-offers").getByRole("button", { name: "Add Session with Lyra" }).click();
  await page.getByTestId("assistant-offers").getByRole("button", { name: "Add Lyra", exact: true }).click();
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Improve her description");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-send")).toBeVisible({ timeout: 20_000 });
  const trial = page.getByTestId("assistant-trial").last();
  await expect(trial).toContainText("2 calls");
  await expect(trial).toContainText("nothing is saved");
  await expect(trial.getByTestId("trial-chat")).toContainText("Session with Lyra");
  await trial.getByTestId("trial-run").click();
  await expect(trial).toContainText("Before", { timeout: 20_000 });
  await expect(trial).toContainText("After");
  await expect(trial).toContainText("nothing was saved");
  // nothing was added to any chat
  expect(await count()).toBe(before);
});
