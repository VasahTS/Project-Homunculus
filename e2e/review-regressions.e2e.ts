// User-visible regressions from the November review. Author: CODEX, 2026-11-01.
import { expect, test } from "@playwright/test";
import { newChatWith, openTab, send } from "./ui.ts";

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
  await openTab(page, "prompt");
  const memory = page.getByTestId("memory-group");
  await memory.getByRole("switch", { name: "Chapter summaries" }).click();
  await memory.getByLabel("Newest messages kept word for word").fill("1");
  await memory.getByLabel("Newest messages kept word for word").press("Enter");
  await expect(memory.getByRole("button", { name: "Summarize now" })).toBeEnabled();
  await memory.getByRole("button", { name: "Summarize now" }).click();
  await expect(memory.getByTestId("memory-chapter")).toHaveCount(1);
  const message = page.getByTestId("message").first();
  await message.getByRole("button", { name: "Edit", exact: true }).click();
  await message.getByLabel("Edit the message").fill("Corrected opening after the summary.");
  await message.getByTestId("save-edit").click();
  await expect(message.locator(".text")).toHaveText("Corrected opening after the summary.");
  await expect(memory.getByTestId("memory-chapter")).toContainText("not sent");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("Corrected opening after the summary.");
  await expect(page.getByTestId("prompt-preview")).not.toContainText("Chapter 1: Offline chapter");
});
