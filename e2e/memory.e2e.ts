// Simple memory (D-054) and agent styles / setup window (D-055). Browser preview + offline test AI. Author: CLAUDE, 2026-10-30.
import { expect, test } from "@playwright/test";
import { newChatWith, openTab, send } from "./ui.ts";

test("memory: switch it on, summarize now, edit a chapter; the preview sends the chapter", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  for (const t of ["One.", "Two."]) await send(page, t);
  await openTab(page, "prompt");
  const mem = page.getByTestId("memory-group");
  await mem.getByRole("switch", { name: "Chapter summaries" }).click();
  await mem.getByLabel("Newest messages kept word for word").fill("1");
  await mem.getByLabel("Newest messages kept word for word").press("Enter");
  await expect(mem.getByTestId("memory-status")).toContainText("waiting");
  await mem.getByRole("button", { name: "Summarize now" }).click();
  await expect(mem.getByTestId("memory-chapter")).toHaveCount(1);
  await expect(mem.getByTestId("memory-status")).toContainText("1 chapter on this branch");
  await mem.getByRole("button", { name: /Chapter 1 · Offline chapter/ }).click();
  await mem.getByLabel("Chapter 1 summary").fill("Dan met Lyra.");
  await mem.getByLabel("Chapter 1 title").click();
  await expect(mem.getByTestId("memory-chapter")).toContainText("edited by you");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("Dan met Lyra.");
});

test("an agent's style is picked in the ✦ panel and How it shows is drawn", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  await page.getByTestId("agents-menu-button").click();
  const menu = page.getByTestId("agents-menu");
  await menu.getByRole("button", { name: /^Off in this chat/ }).click();
  await menu.getByRole("switch", { name: "Group Chat in this chat" }).click();
  await menu.getByRole("button", { name: /Group Chat/ }).first().click();
  await menu.getByLabel("Group Chat style").selectOption({ label: "4chan" });
  await expect(menu.getByTestId("agents-menu-item").filter({ hasText: "Group Chat" })).toContainText("4chan");
  await menu.getByRole("button", { name: "Edit Group Chat" }).click();
  await expect(page.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name: "A feed of posts" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radiogroup", { name: "How the note shows" }).locator("svg")).toHaveCount(4);
});
