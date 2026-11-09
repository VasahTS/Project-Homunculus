// User-visible regressions from the November review. Author: CODEX, 2026-11-01.
import { expect, test } from "@playwright/test";
import { memoryOn, newChatWith, openTab, send } from "./ui.ts";

test("Original restores the current typed edit after regex transforms it", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { servicesReady } = await import("/src/core-instance.ts" as string);
    const svc = await servicesReady;
    await svc.store.setGlobalRegex([{ id: "redact", find: "/secret/g", replace: "[removed]", targets: ["ai"] }]);
  });
  await newChatWith(page);
  const message = page.getByTestId("message").first();
  await message.getByRole("button", { name: "Edit", exact: true }).click();
  await message.getByLabel("Edit the message").fill("NEW secret and MY EDIT");
  await message.getByTestId("save-edit").click();
  await expect(message.locator(".text")).toHaveText("NEW [removed] and MY EDIT");
  await message.getByTestId("regex-undo").click();
  await expect(message.locator(".text")).toHaveText("NEW secret and MY EDIT");
  await expect(message.getByTestId("regex-undo")).toHaveCount(0);
});

test("editing a summarized message sends its correction instead of the old chapter", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  for (const text of ["One.", "Two."]) await send(page, text);
  const memory = await memoryOn(page, { keep: 1 });
  await expect(memory.getByRole("button", { name: "Write Chapter Now" })).toBeEnabled();
  await memory.getByRole("button", { name: "Write Chapter Now" }).click();
  await expect(memory.getByTestId("memory-chapter")).toHaveCount(1);
  await page.getByRole("button", { name: "Close Memory" }).click(); // the window floats over the panel (D-105)
  const message = page.getByTestId("message").first();
  await message.getByRole("button", { name: "Edit", exact: true }).click();
  await message.getByLabel("Edit the message").fill("Corrected opening after the summary.");
  await message.getByTestId("save-edit").click();
  await expect(message.locator(".text")).toHaveText("Corrected opening after the summary.");
  await openTab(page, "memory");
  await expect(memory.getByTestId("memory-chapter")).toContainText("Not sent");
  await openTab(page, "prompt");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("Corrected opening after the summary.");
  await expect(page.getByTestId("prompt-preview")).not.toContainText("Chapter 1: Offline chapter");
});
