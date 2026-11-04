// Simple memory (D-054) and agent styles / setup window (D-055). Browser preview + offline test AI. Author: CLAUDE, 2026-10-30.
import { expect, test } from "@playwright/test";
import { memoryOn, newChatWith, openLibrary, openSession, openTab, send } from "./ui.ts";

test("memory: switch it on, summarize now, edit a chapter; the preview sends the chapter", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  for (const t of ["One.", "Two."]) await send(page, t);
  const mem = await memoryOn(page, { keep: 1 });
  await expect(mem.getByTestId("memory-stats")).toContainText("waiting");
  await mem.getByRole("button", { name: "Write Chapter Now" }).click();
  await expect(mem.getByTestId("memory-chapter")).toHaveCount(1);
  await expect(mem.getByTestId("memory-stats")).toContainText("1chapter");
  await mem.getByRole("button", { name: /Chapter 1 · Offline chapter/ }).click();
  await mem.getByLabel("Chapter 1 summary").fill("Dan met Lyra.");
  await mem.getByLabel("Chapter 1 title").click();
  await expect(mem.getByTestId("memory-chapter")).toContainText("edited by you");
  await openTab(page, "prompt");
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
  await expect(page.getByRole("radiogroup", { name: "How the note shows" }).locator("svg")).toHaveCount(5);
});

// T-001: deterministic latency/failure injection against a fresh browser database. CODEX.
async function editableMemory(page: import("@playwright/test").Page) {
  await page.goto("/");
  await newChatWith(page);
  for (const text of ["One.", "Two.", "Three."]) await send(page, text);
  const memory = await memoryOn(page, { keep: 1 });
  await expect(memory.getByRole("button", { name: "Write Chapter Now" })).toBeEnabled();
  await memory.getByRole("button", { name: "Write Chapter Now" }).click();
  await expect(memory.getByTestId("memory-chapter")).toHaveCount(1);
  await memory.getByRole("button", { name: /Chapter 1 · Offline chapter/ }).click();
  return memory;
}

for (const releaseWhileTyping of [false, true]) test(`memory keeps title and summary during a slow save (still typing: ${releaseWhileTyping})`, async ({ page }) => {
  const memory = await editableMemory(page);
  await page.evaluate(async () => {
    const { servicesReady } = await import("/src/core-instance.ts" as string);
    const svc = await servicesReady;
    const original = svc.store.setAppSetting.bind(svc.store);
    const control = { calls: 0, release: () => {} };
    (globalThis as any).memoryAudit = control;
    svc.store.setAppSetting = async (key: string, value: unknown) => {
      if (key.startsWith("memory.chapters:") && ++control.calls === 1) await new Promise<void>(r => { control.release = r; });
      return original(key, value);
    };
  });
  await memory.getByLabel("Chapter 1 title").fill("My latest title");
  await memory.getByLabel("Chapter 1 summary").click();
  await expect.poll(() => page.evaluate(() => (globalThis as any).memoryAudit.calls)).toBe(1);
  await memory.getByLabel("Chapter 1 summary").fill("My latest summary.");
  if (releaseWhileTyping) {
    await page.evaluate(() => (globalThis as any).memoryAudit.release());
    await expect(memory.getByRole("button", { name: /Chapter 1 · My latest title/ })).toBeVisible();
    await expect(memory.getByLabel("Chapter 1 summary")).toHaveValue("My latest summary.");
  }
  await memory.getByLabel("Chapter 1 title").click();
  if (!releaseWhileTyping) await page.evaluate(() => (globalThis as any).memoryAudit.release());
  await expect.poll(() => page.evaluate(() => (globalThis as any).memoryAudit.calls)).toBe(2);
  await expect(memory.getByLabel("Chapter 1 title")).toHaveValue("My latest title");
  await expect(memory.getByLabel("Chapter 1 summary")).toHaveValue("My latest summary.");
  await openTab(page, "prompt");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("My latest title");
  await expect(page.getByTestId("prompt-preview")).toContainText("My latest summary.");
});

test("a failed memory edit reports the error and can be retried without losing the draft", async ({ page }) => {
  const memory = await editableMemory(page);
  await page.evaluate(async () => {
    const { servicesReady } = await import("/src/core-instance.ts" as string);
    const svc = await servicesReady;
    const original = svc.store.setAppSetting.bind(svc.store);
    let fail = true;
    svc.store.setAppSetting = async (key: string, value: unknown) => {
      if (key.startsWith("memory.chapters:") && fail) { fail = false; throw new Error("Simulated memory disk failure"); }
      return original(key, value);
    };
  });
  await memory.getByLabel("Chapter 1 summary").fill("My recoverable draft.");
  await memory.getByLabel("Chapter 1 title").click();
  await expect(memory.getByRole("alert")).toContainText("Simulated memory disk failure");
  await expect(memory.getByLabel("Chapter 1 summary")).toHaveValue("My recoverable draft.");
  await memory.getByLabel("Chapter 1 summary").click();
  await memory.getByLabel("Chapter 1 title").click();
  await expect(memory.getByTestId("memory-chapter")).toContainText("edited by you");
  await expect(memory.getByRole("alert")).toHaveCount(0);
  await openTab(page, "prompt");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("My recoverable draft.");
});

test("memory off/on and chapter switches restore raw messages and retain manual edits after navigation", async ({ page }) => {
  const memory = await editableMemory(page);
  await memory.getByLabel("Chapter 1 summary").fill("A permanent hand edit.");
  await memory.getByLabel("Chapter 1 title").click();
  await expect(memory.getByTestId("memory-chapter")).toContainText("edited by you");
  await memory.getByRole("switch", { name: "Send Chapter 1" }).click();
  await expect(memory.getByTestId("memory-chapter")).toContainText("Not sent");
  await memory.getByRole("switch", { name: "Send Chapter 1" }).click();
  await expect(memory.getByTestId("memory-chapter")).not.toContainText("Not sent");
  await memory.getByRole("switch", { name: "Memory", exact: true }).click();
  await expect(memory).toContainText("kept while memory is off");
  await openTab(page, "prompt");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  const preview = page.getByTestId("prompt-preview");
  await expect(preview).toContainText("One.");
  await expect(preview).not.toContainText("A permanent hand edit.");
  await page.keyboard.press("Escape");
  await openTab(page, "memory");
  await memory.getByTestId("memory-turn-on").click();
  await expect(memory.getByTestId("memory-chapter")).toHaveCount(1);
  await openLibrary(page, "Characters");
  await openSession(page);
  await openTab(page, "memory");
  await expect(memory.getByTestId("memory-chapter")).toHaveCount(1);
  await expect(memory.getByTestId("memory-chapter")).toContainText("edited by you");
  await openTab(page, "prompt");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await expect(preview).toContainText("A permanent hand edit.");
});


for (const latest of ["Newer title still being typed", "Offline chapter"]) test(`a completed save keeps the newer title draft: ${latest}`, async ({ page }) => {
  const memory = await editableMemory(page);
  await page.evaluate(async () => {
    const { servicesReady } = await import("/src/core-instance.ts" as string);
    const svc = await servicesReady;
    const original = svc.store.setAppSetting.bind(svc.store);
    const control = { calls: 0, release: () => {} };
    (globalThis as any).memoryAudit = control;
    svc.store.setAppSetting = async (key: string, value: unknown) => {
      if (key.startsWith("memory.chapters:") && ++control.calls === 1) await new Promise<void>(r => { control.release = r; });
      return original(key, value);
    };
  });
  const title = memory.getByLabel("Chapter 1 title");
  await title.fill("First title");
  await memory.getByLabel("Chapter 1 summary").click();
  await expect.poll(() => page.evaluate(() => (globalThis as any).memoryAudit.calls)).toBe(1);
  await title.fill(latest);
  await page.evaluate(() => (globalThis as any).memoryAudit.release());
  await expect(memory.getByRole("button", { name: /Chapter 1 · First title/ })).toBeVisible();
  await expect(title).toHaveValue(latest);
  await memory.getByLabel("Chapter 1 summary").click();
  await expect(memory.getByRole("button", { name: new RegExp(`Chapter 1 · ${latest}`) })).toBeVisible();
});
