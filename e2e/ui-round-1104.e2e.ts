// Click tests of Daniel's 11/04 UI round (D-088): Stories with the story played last on top and standing covers, the
// crop sheet, dialogue colors kept per look, the inspector's width, Connections, and portrait avatars in the chat.
// Author: CLAUDE, 2026-11-04.
import { expect, test, type Page } from "@playwright/test";
import { newChatWith, openLibrary, openTab } from "./ui.ts";
import { solidPng } from "../packages/st-cards/src/index.ts";

const rootVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

async function newStory(page: Page, name: string, play: boolean) {
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  const sheet = page.getByTestId("new-story");
  await sheet.getByLabel("Story name").fill(name);
  await sheet.getByRole("button", { name: /Narrated adventure/ }).click();
  await sheet.getByLabel("An empty story").check();
  await sheet.getByTestId("create-story").click();
  await expect(page.getByTestId("story-page")).toBeVisible();
  if (play) {
    await page.getByTestId("play-story").click();
    await page.getByTestId("new-chat-sheet").getByTestId("start-chat").click();
    await expect(page.getByTestId("messages")).toBeVisible();
  }
}

test("Stories: the story played last is on top with Continue; covers stand 2:3 and fill their card", async ({ page }) => {
  await page.goto("/");
  await newStory(page, "Never Played", false);
  await newStory(page, "Isekai RPG", true);
  await openLibrary(page, "Stories");
  const hero = page.getByTestId("story-hero");
  await expect(hero).toContainText("Isekai RPG");
  await expect(hero).toContainText("Continue where you left off");
  const card = page.getByTestId("vault-stories").getByRole("button", { name: "Never Played" });
  const pic = card.locator(".story-mark");
  const [cardBox, picBox] = [(await card.boundingBox())!, (await pic.boundingBox())!];
  expect(Math.abs(picBox.width - cardBox.width)).toBeLessThan(2);
  expect(picBox.height / picBox.width).toBeCloseTo(1.5, 1);
  await hero.getByTestId("story-hero-continue").click();
  await expect(page.getByTestId("messages")).toBeVisible();
});

test("a picked picture opens the crop sheet: Portrait cuts it to 2:3, Cancel keeps the old one", async ({ page }) => {
  await page.goto("/");
  await newStory(page, "Painted", false);
  await openLibrary(page, "Stories");
  const input = page.getByTestId("story-image-input");
  await input.setInputFiles({ name: "wide.png", mimeType: "image/png", buffer: Buffer.from(solidPng(300, 120, [40, 120, 200])) });
  const sheet = page.getByTestId("crop-sheet");
  await expect(sheet).toBeVisible();
  await page.getByLabel("Zoom").fill("2");
  await expect(sheet.locator("output")).toHaveText("200%");
  await page.getByTestId("crop-apply").click();
  await expect(sheet).toHaveCount(0);
  const img = page.getByTestId("story-image").locator("img");
  await expect(img).toHaveCount(1);
  const ratio = await img.evaluate(async (el: HTMLImageElement) => { await el.decode(); return el.naturalHeight / el.naturalWidth; });
  expect(ratio).toBeCloseTo(1.5, 1);
  // Cancel: nothing changes
  const before = await img.getAttribute("src");
  await input.setInputFiles({ name: "b.png", mimeType: "image/png", buffer: Buffer.from(solidPng(50, 50, [200, 0, 0])) });
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(img).toHaveAttribute("src", before!);
});

test("a dialogue color belongs to the look it was picked in; other looks keep their own", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-customize").click();
  await page.getByRole("radio", { name: "Mono" }).click();
  await page.getByTestId("settings-chat").click();
  await page.getByLabel("Dialogue color", { exact: true }).fill("#ff0000");
  await expect.poll(() => rootVar(page, "--dialogue")).toBe("#ff0000");
  await page.getByTestId("settings-customize").click();
  await page.getByRole("radio", { name: "Graphite" }).click();
  await expect.poll(() => rootVar(page, "--dialogue")).toBe("#e6bf7e");
  await page.getByRole("radio", { name: "Mono" }).click();
  await expect.poll(() => rootVar(page, "--dialogue")).toBe("#ff0000");
});

test("the inspector keeps its width on every tab", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  const width = () => page.locator("aside.inspector").evaluate((e) => Math.round(e.getBoundingClientRect().width));
  await openTab(page, "scene");
  const w = await width();
  for (const tab of ["prompt", "memory", "reply", "scene"] as const) { await openTab(page, tab); expect(await width()).toBe(w); }
});

test("Connections: each explanation reads as a line beside its control, not a narrow strip", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("app-list").getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-connections").click();
  await page.getByRole("button", { name: "New Connection" }).click();
  const help = page.getByLabel("Connection editor").locator(".row-help").nth(1);
  expect((await help.boundingBox())!.width).toBeGreaterThan(380);
});

test("chat avatars: Portrait is 2:3 and Large is big", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-customize").click();
  await page.getByRole("radiogroup", { name: "Avatars in the chat" }).getByRole("radio", { name: "Portrait" }).click();
  await page.getByRole("radiogroup", { name: "Avatar size" }).getByRole("radio", { name: "Large" }).click();
  await newChatWith(page);
  const box = (await page.locator(".msg-side > .chat-avatar").first().boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(100);
  expect(box.height / box.width).toBeCloseTo(1.5, 1);
});

test("with pictures on, the number and tokens sit under the picture; the bar shows the chat's size", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-customize").click();
  await page.getByRole("radiogroup", { name: "Avatars in the chat" }).getByRole("radio", { name: "Portrait" }).click();
  await newChatWith(page);
  const msg = page.getByTestId("message").first();
  const pic = (await msg.locator(".msg-side > .chat-avatar").boundingBox())!;
  const meta = (await msg.locator(".msg-side [data-testid=message-metadata]").boundingBox())!;
  expect(meta.y).toBeGreaterThan(pic.y + pic.height - 1);
  await expect(msg.getByTestId("message-number")).toHaveText("#1");
  await expect(msg.getByTestId("message-text-tokens")).toHaveText(/^~?\d[\d,.]*t$/);
  await expect(msg.locator("[data-testid=message-metadata]")).toHaveCount(1);
  await expect(page.getByTestId("chat-size")).toHaveText(/~\d[\d.]*k? tokens · 1 msg/);
  const ring = await msg.locator(".chat-avatar").evaluate((el) => getComputedStyle(el).boxShadow);
  expect(ring).not.toBe("none");
});
