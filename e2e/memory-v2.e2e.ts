// Memory v2 (D-083): Catch up, layers, smart recall's receipt, and "Messages to show". Browser preview + offline test AI.
// Author: CLAUDE, 2026-11-04.
import { expect, test } from "@playwright/test";
import { newChatWith, openTab, send } from "./ui.ts";

test("memory v2: catch up an old chat, merge chapters, and smart recall shows what it chose", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  for (const t of ["We reach the mill.", "Lyra hides the silver locket.", "We eat stew.", "It rains.", "We sleep.", "Morning comes."]) await send(page, t);
  await openTab(page, "prompt");
  const mem = page.getByTestId("memory-group");
  await mem.getByRole("switch", { name: "Chapter summaries" }).click();
  for (const [label, value] of [["Messages per chapter", "4"], ["Newest messages kept word for word", "1"]] as const) {
    await mem.getByLabel(label).fill(value);
    await mem.getByLabel(label).press("Enter");
  }
  await mem.getByLabel("Summaries before merging").fill("3");
  await mem.getByLabel("Summaries before merging").press("Enter");
  await mem.getByLabel("Summaries merged into one").fill("2");
  await mem.getByLabel("Summaries merged into one").press("Enter");
  // 13 messages, the newest kept: 12 wait → 3 chapters
  await expect(mem.getByTestId("memory-catch-up")).toHaveText("Catch Up (3)");
  await mem.getByTestId("memory-catch-up").click();
  await expect(mem.getByTestId("memory-progress")).toContainText("Done: 3 chapters written.");
  // 3 chapters with "more than 3" → no merge yet; one more chapter would merge the oldest two
  await expect(mem.getByTestId("memory-chapter")).toHaveCount(3);

  await mem.getByRole("radiogroup", { name: "What the AI reads" }).getByRole("radio", { name: "Smart" }).click();
  await expect(mem.getByRole("textbox", { name: "Decision model" })).toHaveValue("typesafe/jev-latest");
  await send(page, "Where is the silver locket?");
  await openTab(page, "reply");
  const receipt = page.getByTestId("reply-memory");
  await expect(receipt).toContainText("Memory · smart");
  await expect(receipt).toContainText("typesafe/jev-latest");
  await expect(receipt.getByTestId("reply-memory-picked").locator("li").last()).toContainText("latest, always");
  await page.waitForTimeout(800);
  await page.getByTestId("reply-pane").screenshot({ path: "e2e/.results/memory-v2-reply.png" });

  await openTab(page, "prompt");
  await page.waitForTimeout(800);
  await page.getByTestId("memory-group").screenshot({ path: "e2e/.results/memory-v2-group.png" });
});

test("messages to show: a long chat draws only the newest, Show earlier brings the rest", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).last().click();
  await page.getByTestId("settings-chat").click();
  await page.getByLabel("Messages to show").selectOption("10");
  await newChatWith(page);
  for (const t of ["One.", "Two.", "Three.", "Four.", "Five.", "Six."]) await send(page, t);
  await expect(page.getByTestId("message")).toHaveCount(10);
  await expect(page.getByTestId("show-earlier")).toContainText("3 not drawn");
  await page.getByTestId("show-earlier").screenshot({ path: "e2e/.results/show-earlier.png" });
  await page.getByTestId("show-earlier").getByRole("button", { name: /Show 3 earlier messages/ }).click();
  await expect(page.getByTestId("message")).toHaveCount(13);
  await expect(page.getByTestId("show-earlier")).toHaveCount(0);
});
