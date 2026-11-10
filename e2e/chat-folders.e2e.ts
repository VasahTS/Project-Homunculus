// D-108: the sidebar's chats — Pinned → folders → Recent, in Play and in the Assistant; Settings → Chat → Recent chats.
import { expect, test, type Page } from "@playwright/test";
import { newChatWith } from "./ui.ts";

const row = (page: Page, name: RegExp) => page.locator(".sc-li").filter({ has: page.locator(".sc-t", { hasText: name }) }).first();
async function menuOf(page: Page, name: RegExp) {
  const r = row(page, name);
  await r.hover();
  await r.getByRole("button", { name: /^More for/ }).click();
  return page.getByRole("menu").first();
}

test("pin a chat, make a folder from its menu, fold it (the open chat stays), drag another chat in, delete the folder", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  const chats = page.getByTestId("session-list");
  await expect(chats.locator(".sc-row").first()).toContainText("Lyra"); // where it is from, in grey
  // rename the newest chat "Mira" from its menu, so the two rows differ
  await (await menuOf(page, /./)).getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("textbox", { name: "Chat name" }).fill("Mira at the docks");
  await page.getByRole("textbox", { name: "Chat name" }).press("Enter");
  await expect(chats.locator(".sc-t").first()).toHaveText("Mira at the docks");

  // Pin, from the right-click menu
  await row(page, /Mira/).click({ button: "right" });
  await page.getByRole("menu").first().getByRole("menuitem", { name: "Pin" }).click();
  await expect(page.getByTestId("session-list-pinned")).toContainText("Mira");

  // Move to Folder → New Folder… (also unpins)
  const m = await menuOf(page, /Mira/);
  await m.getByRole("menuitem", { name: /Move to Folder/ }).click();
  await page.getByRole("menuitem", { name: "New Folder…" }).click();
  await page.getByRole("textbox", { name: "New folder name" }).fill("One-shots");
  await page.getByRole("textbox", { name: "New folder name" }).press("Enter");
  const folder = page.getByTestId("chat-folder").filter({ hasText: "One-shots" });
  await expect(folder).toContainText("Mira");
  await expect(page.getByTestId("session-list-pinned")).toHaveCount(0);

  // open it, fold the folder: the open chat stays in view, the count stays
  await folder.locator(".sc-row").first().click();
  await folder.getByRole("button", { name: /^One-shots/ }).click();
  await expect(folder.getByRole("button", { name: /^One-shots/ })).toHaveAttribute("aria-expanded", "false");
  await expect(folder.locator(".sc-row")).toHaveCount(1);

  // drag a chat from Recent onto the folder
  const lyra = chats.locator(".sc-li").first();
  // pointer drag (the desktop window swallows HTML drag and drop): press, move, release over the folder
  const from = (await lyra.boundingBox())!, to = (await folder.locator(".sc-folder-head").boundingBox())!;
  await page.mouse.move(from.x + 30, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 3 });
  await page.mouse.move(to.x + 30, to.y + 10, { steps: 8 });
  await expect(folder).toHaveClass(/drop/);
  await page.mouse.up();
  await expect(folder.locator(".sc-count")).toHaveText("2");

  // delete the folder: its chats go back to Recent
  const f = page.getByTestId("chat-folder").filter({ hasText: "One-shots" });
  await f.locator(".sc-folder-head").hover();
  await f.getByRole("button", { name: /More for the folder/ }).click();
  await page.getByRole("menuitem", { name: /Delete Folder/ }).click();
  await expect(page.getByTestId("chat-folder")).toHaveCount(0);
  await expect(chats).toContainText("Mira");
});

test("Settings → Chat → Recent chats changes how many the sidebar lists", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 4; i++) await newChatWith(page);
  await page.getByRole("button", { name: "Settings" }).last().click();
  await page.getByTestId("settings-chat").click();
  await page.getByTestId("recent-chats").selectOption("3");
  await expect(page.getByTestId("session-list").locator(".sc-row")).toHaveCount(3);
  await expect(page.getByTestId("session-list").getByRole("button", { name: /^Show \d+ more$/ })).toBeVisible();
});

test("the Assistant's chats have the same pins and folders", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Make a world tracker");
  await page.getByRole("textbox", { name: "Message to the Assistant" }).press("Enter");
  await expect(page.getByTestId("assistant-chats").locator(".sc-row")).toHaveCount(1, { timeout: 20_000 });
  await (await menuOf(page, /world tracker/i)).getByRole("menuitem", { name: "Pin" }).click();
  await expect(page.getByTestId("assistant-chats-pinned")).toContainText(/world tracker/i);
});
