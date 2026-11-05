// Click tests of Quick Replies (D-090): import a SillyTavern set, switch it on, {{input}}, stacking, the ⋮ menu, the
// one-button list, the Prompt tab places and export. Author: CLAUDE, 2026-11-04.
import { expect, test, type Page } from "@playwright/test";
import { newChatWith, openLibrary, openTab } from "./ui.ts";

// Daniel's "RP Control Panel" as SillyTavern exports it (shortened texts), plus a menu set
const panel = {
  version: 2, name: "RP Control Panel", disableSend: true, placeBeforeInput: true, injectInput: false, color: "transparent", onlyBorderColor: false,
  qrList: [
    { id: 1, label: "Continue", message: "[Continue the scene naturally.]", contextList: [], isHidden: false },
    { id: 2, label: "AuthorS", message: "[Author Directions: {{input}}]", contextList: [], isHidden: false },
    { id: 3, label: "Time Skip", message: "OOC: Advance time.", contextList: [{ set: "Skips", isChained: true }], isHidden: false },
  ],
  idIndex: 4,
};
const skips = { version: 2, name: "Skips", disableSend: true, qrList: [{ id: 1, label: "Next morning", message: "Next morning.", contextList: [], isHidden: false }], idIndex: 2 };

async function importPanel(page: Page) {
  await page.goto("/");
  await openLibrary(page, "Quick Replies");
  await page.getByTestId("qr-import-input").setInputFiles({ name: "qr.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify([panel, skips])) });
  await expect(page.getByTestId("qr-set")).toHaveCount(2);
  await page.getByTestId("qr-set").filter({ hasText: "RP Control Panel" }).click();
  await page.getByRole("switch", { name: "On in every chat" }).click();
}
const box = (page: Page) => page.getByRole("textbox", { name: "Your message" });

test("an imported ST set shows above the box; {{input}}, stacking and the ⋮ menu work", async ({ page }) => {
  await importPanel(page);
  // the editor shows the set's options as SillyTavern had them
  await expect(page.getByRole("radiogroup", { name: "When a button is clicked" }).getByRole("radio", { name: "Put it in the box" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radiogroup", { name: "The reply goes" }).getByRole("radio", { name: "Before it" })).toHaveAttribute("aria-checked", "true");

  await newChatWith(page);
  const bar = page.getByTestId("qr-bar");
  await expect(bar.getByTestId("qr-button")).toHaveCount(3);

  // {{input}} takes what is in the box
  await box(page).fill("she runs");
  await bar.getByRole("button", { name: "AuthorS" }).click();
  await expect(box(page)).toHaveValue("[Author Directions: she runs] ");
  // stacking: the next one goes on its own line, before (the set's "Place before input")
  await bar.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(box(page)).toHaveValue("[Continue the scene naturally.]\n[Author Directions: she runs] ");

  // the ⋮ menu: chained, the parent's text first
  await box(page).fill("");
  await bar.getByRole("button", { name: "Time Skip menu" }).click();
  await page.getByTestId("qr-menu").getByRole("menuitem", { name: "Next morning" }).click();
  await expect(box(page)).toHaveValue("OOC: Advance time.\nNext morning. ");

  // Ctrl+click opens the reply in the Library
  await bar.getByRole("button", { name: "Continue", exact: true }).click({ modifiers: ["Control"] });
  await expect(page.getByTestId("qr-label")).toHaveValue("Continue");
});

test("one button instead of the bar; the Prompt tab switches sets per place", async ({ page }) => {
  await importPanel(page);
  await page.getByRole("button", { name: "Settings" }).last().click();
  await page.getByTestId("settings-chat").click();
  await page.getByTestId("qr-style-drawer").click();

  await newChatWith(page);
  await expect(page.getByTestId("qr-bar")).toHaveCount(0);
  await box(page).focus();
  await page.keyboard.press("Control+/");
  const drawer = page.getByTestId("qr-drawer");
  await expect(drawer).toContainText("RP Control Panel");
  await drawer.getByLabel("Find a quick reply").fill("author");
  await drawer.getByTestId("qr-drawer-item").click();
  await expect(drawer).toHaveCount(0);
  await expect(box(page)).toHaveValue("[Author Directions: ] ");

  // Prompt tab: hide the global set's buttons, add the other set to this chat only
  await openTab(page, "prompt");
  const places = page.getByTestId("session-quick-replies");
  await places.getByTestId("qr-place-global").getByRole("switch").click();
  await expect(page.getByTestId("qr-drawer-button")).toHaveCount(0);
  await places.getByTestId("qr-add-chat").selectOption({ label: "Skips" });
  await page.getByTestId("qr-drawer-button").click();
  await expect(page.getByTestId("qr-drawer")).toContainText("This chat");
  await expect(page.getByTestId("qr-drawer-item")).toHaveCount(1);
});

test("export gives SillyTavern's file back", async ({ page }) => {
  await importPanel(page);
  const download = page.waitForEvent("download");
  await page.getByTestId("qr-export").click();
  const file = await download;
  const json = JSON.parse(await (await file.createReadStream()).toArray().then((b) => Buffer.concat(b).toString("utf8")));
  expect(json).toMatchObject({ version: 2, name: "RP Control Panel", disableSend: true, placeBeforeInput: true, injectInput: false });
  expect(json.qrList.map((q: { label: string }) => q.label)).toEqual(["Continue", "AuthorS", "Time Skip"]);
  expect(json.qrList[2].contextList).toEqual([{ set: "Skips", isChained: true }]);
});
