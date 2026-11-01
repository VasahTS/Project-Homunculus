// Click tests: importing and exporting SillyTavern cards. Author: CLAUDE, 2026-10-23.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { editCharacter, openLibrary } from "./ui.ts";
import {
  base64ToBytes, bytesToBase64, readChunks, readTextChunks, setTextChunks, solidPng, utf8,
} from "../packages/st-cards/src/index.ts";

const card = {
  spec: "chara_card_v2", spec_version: "2.0",
  data: {
    name: "Mira", description: "{{char}} maps dreams for {{user}}.", personality: "Blunt.", scenario: "",
    first_mes: "*Mira looks up.* \"You're late, {{user}}.\"", alternate_greetings: [], mes_example: "",
    creator_notes: "", system_prompt: "", post_history_instructions: "", tags: ["fantasy"], creator: "", character_version: "",
    character_book: { entries: [{ keys: ["lighthouse"], content: "It is alive." }] },
    extensions: { custom_tool: { keep: "me" } },
  },
};
const cardPng = () => Buffer.from(setTextChunks(solidPng(20, 30, [200, 40, 40]), {
  chara: bytesToBase64(utf8.encode(JSON.stringify(card))),
}));

test("import a PNG card: it appears with its image, and greets with names filled in", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await page.getByTestId("import-input").setInputFiles({ name: "Mira.png", mimeType: "image/png", buffer: cardPng() });

  await expect(page.getByTestId("notice")).toContainText("Imported 1 character(s): Mira");
  await expect(page.getByTestId("notice")).toContainText("embedded lorebook");
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Mira" }).locator("img")).toBeVisible();
  await expect(page.getByTestId("character-sheet")).toContainText("Mira"); // its sheet opened on the new character

  await page.getByTestId("character-sheet").getByRole("button", { name: "Chat Now" }).click();
  await expect(page.getByTestId("message").first()).toContainText("You're late, User.");
});

test("import several files at once, with a clear message for bad ones", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await page.getByTestId("import-input").setInputFiles([
    { name: "Mira.png", mimeType: "image/png", buffer: cardPng() },
    { name: "Bob.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ name: "Bob", description: "v1", first_mes: "Yo." })) },
    { name: "photo.png", mimeType: "image/png", buffer: Buffer.from(solidPng(2, 2, [0, 0, 0])) },
  ]);
  const notice = page.getByTestId("notice");
  await expect(notice).toContainText("Imported 2 character(s): Mira, Bob");
  await expect(notice).toContainText("photo.png: This PNG has no character card inside");
  await expect(page.getByTestId("character-list").getByRole("button")).toHaveCount(3);
});

test("export keeps fields Homunculus doesn't use (lossless)", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await page.getByTestId("import-input").setInputFiles({ name: "Mira.png", mimeType: "image/png", buffer: cardPng() });
  await editCharacter(page, "Mira");
  await page.getByLabel("Character editor").getByLabel("Description").fill("Edited description.");
  await page.getByRole("button", { name: "Save" }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG card" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Mira.png");
  const bytes = new Uint8Array(readFileSync(await file.path()));
  const v2 = JSON.parse(utf8.decode(base64ToBytes(readTextChunks(readChunks(bytes)).get("chara")!)));
  expect(v2.data.description).toBe("Edited description.");
  expect(v2.data.character_book).toEqual(card.data.character_book);
  expect(v2.data.extensions.custom_tool).toEqual({ keep: "me" });
  await expect(page.getByTestId("notice")).toContainText("Exported Mira");
});

test("change and remove a character's image", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await editCharacter(page);
  await expect(page.locator(".avatar-big.placeholder")).toBeVisible();
  await page.getByTestId("avatar-input").setInputFiles({ name: "face.png", mimeType: "image/png", buffer: Buffer.from(solidPng(10, 10, [0, 120, 200])) });
  await expect(page.locator("img.avatar-big")).toBeVisible();
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(page.locator(".avatar-big.placeholder")).toBeVisible();
  await page.screenshot({ path: "e2e/.results/cards-after.png" });
});

test("a card's embedded lorebook works in its sessions: the keyword brings the entry into the prompt", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await page.getByTestId("import-input").setInputFiles({ name: "Mira.png", mimeType: "image/png", buffer: cardPng() });
  await expect(page.getByTestId("notice")).toContainText(`embedded lorebook "Mira's lorebook" (1 entries) was added`);
  await page.getByTestId("character-sheet").getByRole("button", { name: "Chat Now" }).click();
  await page.getByPlaceholder(/Write your message/).fill("Is that the lighthouse?");
  await page.getByRole("tab", { name: "Prompt" }).click();
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  const sheet = page.getByTestId("prompt-preview");
  await expect(sheet).toContainText("It is alive.");
  await expect(sheet).toContainText("Lorebooks");
  await page.waitForTimeout(600); // let the sheet finish opening
  await page.screenshot({ path: "e2e/.results/lorebook-preview.png" });
});
