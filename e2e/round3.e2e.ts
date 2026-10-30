// Click tests of round 3 (D-036): organization. Characters as a place with folders, a character's sheet with its chats
// (search + export), Recent in the sidebar, the story's chats at the bottom, Kits, the big "Add…" window, Save to the
// Vault from the Scene, and the character editable in the chat's Prompt tab (folds to one line). Author: CLAUDE, 2026-10-29.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { newChatWith, openLibrary, openTab, send, setTracker } from "./ui.ts";

async function newFolder(page: Page, name: string) {
  await page.getByTestId("new-folder").click();
  await page.getByLabel("New folder name").fill(name);
  await page.getByLabel("New folder name").press("Enter");
  await expect(page.getByTestId("folder-tile").filter({ hasText: name })).toBeVisible();
}

async function vault(page: Page, tab: "Stories" | "Kits" | "Narrators" | "NPCs") {
  await openLibrary(page, tab);
}

test("Characters: folders you can see (nested), a search looks in all of them, the sheet shows the whole card and its chats", async ({ page }) => {
  await page.goto("/");
  await send(page, "Where is the goblin camp?");
  await openLibrary(page, "Characters");
  await newFolder(page, "Fantasy");
  // put Lyra in it with the sheet's Folder pick
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  const sheet = page.getByTestId("character-sheet");
  await expect(sheet).toContainText("A wary ranger"); // the whole card before any chat
  await sheet.getByLabel("Folder").selectOption({ label: "Fantasy" });
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toHaveCount(0); // not at the top any more
  await expect(page.getByTestId("folder-tile").filter({ hasText: "Fantasy" })).toContainText("1");
  // a folder inside the folder
  await page.getByTestId("folder-tile").filter({ hasText: "Fantasy" }).click();
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toBeVisible();
  await newFolder(page, "Rangers");
  await sheet.getByLabel("Folder").selectOption({ label: "  Rangers" }); // indented: inside Fantasy
  await page.getByTestId("folder-tile").filter({ hasText: "Rangers" }).click();
  await expect(page.getByTestId("folders")).toContainText("All›Fantasy›Rangers");
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toBeVisible();
  // back at the top, a search finds her in any folder
  await page.getByTestId("folders").getByRole("button", { name: "All" }).click();
  await page.getByLabel("Search characters").fill("lyr");
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toBeVisible();
  await page.getByLabel("Search characters").fill("");

  // her chats are on her sheet; the search looks into the messages and opens the chat at that message
  await page.getByTestId("folder-tile").filter({ hasText: "Fantasy" }).click();
  await page.getByTestId("folder-tile").filter({ hasText: "Rangers" }).click();
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  const chats = page.getByTestId("character-chats");
  await expect(chats.getByTestId("chat-row")).toHaveCount(1);
  await chats.getByLabel("Search chats").fill("goblin");
  await expect(chats).toContainText("1 of 1 chats match");
  await expect(chats.locator("mark").first()).toHaveText(/goblin/i);
  await chats.getByTestId("chat-row").locator(".cl-main").click();
  await expect(page.getByTestId("messages")).toContainText("Where is the goblin camp?");
});

test("a chat exports as Markdown, JSONL, text and the Homunculus file, from its ⋯ menu", async ({ page }) => {
  await page.goto("/");
  await send(page, "Hello there.");
  await openLibrary(page, "Characters");
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  const chats = page.getByTestId("character-chats");
  await chats.getByRole("button", { name: "More for Session with Lyra" }).click();
  await chats.getByRole("menuitem", { name: "Export as ›" }).click();
  const [md] = await Promise.all([page.waitForEvent("download"), chats.getByRole("menuitem", { name: /Markdown/ }).click()]);
  expect(md.suggestedFilename()).toBe("Session with Lyra.md");
  expect(readFileSync((await md.path())!, "utf8")).toContain("**User:** Hello there.");
  await chats.getByRole("button", { name: "More for Session with Lyra" }).click();
  await chats.getByRole("menuitem", { name: "Export as ›" }).click();
  const [jl] = await Promise.all([page.waitForEvent("download"), chats.getByRole("menuitem", { name: /JSONL/ }).click()]);
  const lines = readFileSync((await jl.path())!, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(lines[0].character_name).toBe("Lyra");
  expect(lines.length).toBe(4); // header + greeting + yours + reply
  await expect(page.getByTestId("notice")).toContainText("Exported");
});

test("the sidebar: Characters is a place, Recent keeps the last 3 chats", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 3; i++) await newChatWith(page);
  await expect(page.getByTestId("session-list").getByRole("button")).toHaveCount(3);
  await page.getByPlaceholder("Search").first().fill("Lyra");
  await expect(page.getByTestId("session-list").getByRole("button")).toHaveCount(4); // a search lists every match
});

test("a story's chats are at the bottom of its page; Save as Kit; a Kit starts a new story with its own copy", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  await page.getByTestId("character-sheet").getByRole("button", { name: "Turn into a Story" }).click();
  await page.getByTestId("new-story").getByTestId("create-story").click();
  await page.getByTestId("story-people").getByRole("button", { name: "+ New NPC" }).click();
  await page.getByTestId("npc-sheet").getByLabel("NPC name").fill("Miller Bram");
  await page.getByTestId("npc-sheet").getByRole("button", { name: "Save" }).click();
  // the chats are the last thing on the page
  const chats = page.getByTestId("story-chats");
  await expect(chats).toContainText("No chats yet");
  const cast = (await page.getByTestId("story-people").boundingBox())!;
  const box = (await chats.boundingBox())!;
  expect(box.y).toBeGreaterThan(cast.y);

  await page.getByRole("button", { name: "More…" }).click();
  await page.getByRole("menuitem", { name: "Save as Kit" }).click();
  await expect(page.getByTestId("notice")).toContainText("as a Kit");
  await page.getByTestId("notice").getByRole("button", { name: "Open the Kit" }).click();
  const kit = page.getByTestId("kit-sheet");
  await expect(kit).toContainText("Miller Bram");
  await expect(kit).toContainText("Dusk, at the gates");
  await kit.getByTestId("kit-start").click();
  await expect(page.getByTestId("story-page")).toBeVisible();
  await expect(page.getByTestId("story-people")).toContainText("Miller Bram");
  // its NPC is a copy: the Vault has three Bram (the story's, the Kit's, the new story's), each in its own folder
  await vault(page, "NPCs");
  await expect(page.getByTestId("folder-tile")).toHaveCount(3);
  await page.getByLabel("Search npcs").fill("Bram");
  await expect(page.getByTestId("vault-npcs").getByRole("button")).toHaveCount(3);
});

test("the big Add window: opaque, with folders and search; Enter adds", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await newFolder(page, "Fantasy");
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  await page.getByTestId("character-sheet").getByLabel("Folder").selectOption({ label: "Fantasy" });
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  await page.getByTestId("new-story").getByTestId("create-story").click();
  await page.getByTestId("story-people").getByRole("button", { name: "+ Add a Card" }).click();
  const picker = page.getByTestId("picker");
  // at the top: Lyra only under "Recently used" (she has a chat); otherwise she is in her folder
  await expect(picker).toContainText("Recently used");
  await expect(picker.getByTestId("pick-row")).toHaveCount(1);
  await picker.getByTestId("pick-folder").filter({ hasText: "Fantasy" }).click();
  await expect(picker.getByTestId("pick-row")).toHaveCount(1);
  await expect(picker.getByTestId("pick-preview")).toContainText("A wary ranger");
  const bg = await picker.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).not.toMatch(/rgba\(.*, 0(\.\d+)?\)$/); // not see-through
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect(page.getByTestId("story-card-row")).toContainText("Lyra");
});

test("Save to the Library: someone the tracker knows becomes a Library NPC, in a folder you pick", async ({ page }) => {
  await page.goto("/");
  // a Vault NPC joins, the tracker learns about him, then he leaves the chat's list: only the tracker knows him now
  await vault(page, "NPCs");
  await page.getByRole("button", { name: "New NPC" }).click();
  await page.getByTestId("npc-sheet").getByLabel("NPC name").fill("Old Tom");
  await page.getByTestId("npc-sheet").getByRole("button", { name: "Save" }).click();
  await page.getByTestId("session-list").getByRole("button").first().click();
  await page.getByTestId("who-button").click();
  await page.getByLabel("Add an NPC to this chat").selectOption({ label: "Old Tom" });
  await page.keyboard.press("Escape");
  await openTab(page, "scene");
  await setTracker(page, "Scene: Characters");
  await send(page, "We walk into the forest.");
  await page.getByTestId("who-button").click();
  await page.getByTestId("chat-npcs").getByRole("button", { name: "Remove" }).click();
  await page.keyboard.press("Escape");
  const tom = page.getByTestId("person-card").filter({ hasText: "Old Tom" }).first();
  await tom.getByTestId("who-block").click();
  await tom.getByTestId("save-to-vault").click();
  const dialog = page.getByTestId("save-npc");
  await dialog.getByLabel("NPC name").fill("Tom the Miller");
  await dialog.getByRole("button", { name: "+ New folder" }).click();
  await dialog.getByLabel("New folder name").fill("Villagers");
  await dialog.getByTestId("save-npc-confirm").click();
  await expect(page.getByTestId("notice")).toContainText("Tom the Miller is in the Library");
  await page.getByTestId("notice").getByRole("button", { name: "Open in the Library" }).click();
  await expect(page.getByTestId("npc-sheet").getByLabel("NPC name")).toHaveValue("Tom the Miller");
  await expect(page.getByTestId("folder-tile").filter({ hasText: "Villagers" })).toBeVisible();
});

test("the chat's character is edited in the Prompt tab, and the whole group folds to one line", async ({ page }) => {
  await page.goto("/");
  await openTab(page, "prompt");
  const pc = page.getByTestId("prompt-character");
  await expect(pc).toContainText("Lyra");
  await pc.getByRole("button", { name: /^Personality/ }).click();
  await pc.getByLabel("Personality").fill("Dry humor. Hates goblins.");
  await pc.getByLabel("Personality").blur();
  await expect(pc).toContainText("saved");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  await expect(page.getByTestId("prompt-preview")).toContainText("Hates goblins.");
  await page.keyboard.press("Escape");
  // the card itself changed (Characters sheet)
  await openLibrary(page, "Characters");
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  await expect(page.getByTestId("character-sheet")).toContainText("Hates goblins.");
  // fold: one line, remembered
  await page.getByTestId("session-list").getByRole("button").first().click();
  await openTab(page, "prompt");
  await page.getByTestId("prompt-character-toggle").click();
  await expect(pc.getByTestId("prompt-character-field")).toHaveCount(0);
  await page.reload();
  await openTab(page, "prompt");
  await expect(page.getByTestId("prompt-character-toggle")).toHaveAttribute("aria-expanded", "false");
});

test("hold a card and drag it onto a folder (and back to All)", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await newFolder(page, "Fantasy");
  const drag = async (from: import("@playwright/test").Locator, to: import("@playwright/test").Locator) => {
    const a = (await from.boundingBox())!;
    const b = (await to.boundingBox())!;
    await page.mouse.move(a.x + 40, a.y + 30);
    await page.mouse.down();
    await page.mouse.move(a.x + 60, a.y + 40, { steps: 3 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
  };
  await drag(page.getByTestId("character-list").getByRole("button", { name: "Lyra" }), page.getByTestId("folder-tile").filter({ hasText: "Fantasy" }));
  await expect(page.getByTestId("folder-tile").filter({ hasText: "Fantasy" })).toContainText("1 character");
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toHaveCount(0);
  await expect(page.getByTestId("character-sheet")).toHaveCount(0); // the drop did not open the card
  // inside the folder, drag her onto "All" in the path: back at the top
  await page.getByTestId("folder-tile").filter({ hasText: "Fantasy" }).click();
  await drag(page.getByTestId("character-list").getByRole("button", { name: "Lyra" }), page.getByTestId("folders").getByRole("button", { name: "All" }));
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toHaveCount(0);
  await page.getByTestId("folders").getByRole("button", { name: "All" }).click();
  await expect(page.getByTestId("character-list").getByRole("button", { name: "Lyra" })).toBeVisible();
});

test("the Add window can show everything at once (All), not folder by folder", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await newFolder(page, "Fantasy");
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  await page.getByTestId("character-sheet").getByLabel("Folder").selectOption({ label: "Fantasy" });
  await openLibrary(page, "Stories");
  await page.getByRole("button", { name: "New Story", exact: true }).click();
  await page.getByTestId("new-story").getByTestId("create-story").click();
  await page.getByTestId("story-people").getByRole("button", { name: "+ Add a Card" }).click();
  const picker = page.getByTestId("picker");
  await picker.getByTestId("pick-view-all").click();
  await expect(picker.getByTestId("pick-folder")).toHaveCount(0);
  await expect(picker.getByTestId("pick-row").filter({ hasText: "Lyra" })).toContainText("Fantasy"); // says where it is
  await page.keyboard.press("Escape");
  // remembered next time
  await page.getByTestId("story-people").getByRole("button", { name: "+ Add a Card" }).click();
  await expect(page.getByTestId("pick-view-all")).toHaveClass(/on/);
});
