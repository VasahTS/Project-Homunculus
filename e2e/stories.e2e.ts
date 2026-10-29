// Click tests of slice 4 (D-029): Stories, the Vault (narrators, NPCs), the Library's card gallery.
// Author: CLAUDE, 2026-10-29.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary, openTab, send, addCardToStory } from "./ui.ts";

const vault = async (page: Page, tab: "Stories" | "Narrators" | "NPCs") => {
  await page.getByTestId("place-list").getByRole("button", { name: "Vault" }).click();
  await page.getByTestId("vault-tabs").getByRole("tab", { name: tab }).click();
};

async function newStory(page: Page, name: string, mode: RegExp, setup?: (sheet: ReturnType<Page["getByTestId"]>) => Promise<void>) {
  await page.getByRole("button", { name: "New story" }).click();
  const sheet = page.getByTestId("new-story");
  await sheet.getByLabel("Story name").fill(name);
  await sheet.getByRole("button", { name: mode }).click();
  await sheet.getByLabel("An empty story").check();
  if (setup) await setup(sheet);
  await sheet.getByTestId("create-story").click();
  await expect(page.getByTestId("story-page")).toBeVisible();
}

/** Start Story (or New Chat) → the New Chat sheet → Start Chat. */
async function startChat(page: Page, button: "play-story" | "new-chat" = "play-story") {
  await page.getByTestId(button).click();
  await page.getByTestId("new-chat-sheet").getByTestId("start-chat").click();
  await expect(page.getByTestId("messages")).toBeVisible();
}

async function previewPrompt(page: Page) {
  await openTab(page, "prompt");
  await page.getByRole("button", { name: "Preview Prompt" }).click();
  return page.getByTestId("prompt-preview");
}

test("a narrated story: Simple Narrator, an NPC made in the story, how it starts, Play", async ({ page }) => {
  await page.goto("/");
  await newStory(page, "High Fantasy Party", /Narrated adventure/);
  await expect(page.getByTestId("story-list")).toContainText("High Fantasy Party");
  await page.getByTestId("story-narrator").getByRole("button", { name: "Change…" }).click();
  await expect(page.getByLabel("Narrator")).toHaveValue("vault:simple-narrator");

  await page.getByLabel("Scenario").fill("A tavern in Greywater, the night the bells stop.");
  await page.getByLabel("Opening 1").fill("The tavern is loud tonight.");
  await page.getByTestId("story-people").getByRole("button", { name: "New NPC" }).click();
  const npc = page.getByTestId("npc-sheet");
  await npc.getByLabel("NPC name").fill("Sister Maelle");
  await npc.getByLabel("Sheet").selectOption({ label: "Characters — Fantasy" });
  await npc.getByLabel("Race").fill("Half-elf");
  await npc.getByLabel("Class").fill("Healer");
  await npc.getByRole("button", { name: "Save" }).click();
  await expect(npc.getByText("✓ Saved")).toBeVisible();
  await expect(page.getByTestId("story-people")).toContainText("Half-elf, Healer");
  await page.screenshot({ path: "e2e/.results/story-page.png" });

  await startChat(page);
  await expect(page.getByTestId("message").first()).toContainText("The tavern is loud tonight.");
  await expect(page.getByTestId("who-button")).toContainText("told by Simple Narrator");
  // round 3: "Recent" lists the last chats of any kind; a story's chat says which story it is from
  await expect(page.getByTestId("session-list")).toContainText("High Fantasy Party");

  const sheet = await previewPrompt(page);
  await expect(sheet).toContainText("You are the narrator of this story.");
  await expect(sheet).toContainText("Sister Maelle");
  await expect(sheet).toContainText("Race: Half-elf");
  await expect(sheet).toContainText("A tavern in Greywater");
  await page.keyboard.press("Escape");

  await send(page, "I look around.");
  await expect(page.getByTestId("message")).toHaveCount(3);
  // the way back to the story, and the session listed there
  await page.getByRole("button", { name: "High Fantasy Party" }).first().click();
  await expect(page.getByTestId("story-chats")).toContainText("Chat 1");
  await expect(page.getByTestId("continue-story")).toHaveText("Continue Chat 1");
});

test("director mode: the user is not in the story, and their messages are directions", async ({ page }) => {
  await page.goto("/");
  await newStory(page, "Watch Them", /Director mode/);
  await addCardToStory(page, "Lyra");
  await expect(page.getByTestId("story-people")).toContainText("Card, joins as it is");
  // a card's greeting becomes an opening; Director mode has no "You play as"
  const greeting = page.getByLabel("Add a card's greeting as an opening");
  // only the story's own cards are offered (Lyra is in the cast; no other card)
  await expect(greeting.locator("optgroup")).toHaveCount(1);
  await expect(greeting.locator("optgroup")).toHaveAttribute("label", "Lyra");
  await greeting.selectOption({ index: 1 });
  await expect(page.getByLabel("Opening 1")).toHaveValue(/That's close enough/);
  await expect(page.getByTestId("story-setup").getByLabel("You play as")).toHaveCount(0);
  await startChat(page);
  await page.getByPlaceholder(/Write your message|direction/i).fill("have Lyra hear a noise");
  const sheet = await previewPrompt(page);
  await expect(sheet).toContainText("is not in the story");
  await expect(sheet).toContainText("### Lyra");
});

test("turn a card into a story from its sheet in the Library", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  await page.getByTestId("character-list").getByRole("button", { name: "Lyra" }).click();
  await page.getByTestId("character-sheet").getByRole("button", { name: "Turn into a Story" }).click();
  const sheet = page.getByTestId("new-story");
  await expect(sheet.getByLabel("One of your cards")).toBeChecked();
  await expect(sheet).toContainText("its 1 greeting");
  await sheet.getByTestId("create-story").click();
  await expect(page.getByTestId("story-page")).toBeVisible();
  await page.getByTestId("story-narrator").getByRole("button", { name: "Change…" }).click();
  await expect(page.getByLabel("Narrator")).toHaveValue(/^card:/);
  await expect(page.getByLabel("Opening 1")).toHaveValue(/That's close enough/);
  await expect(page.getByTestId("story-list")).toContainText("Lyra");
});

test("the Vault: edit the Simple Narrator, a loose NPC joins a 1:1 chat", async ({ page }) => {
  await page.goto("/");
  await vault(page, "Narrators");
  await page.getByTestId("vault-narrators").getByRole("button", { name: "Simple Narrator" }).click();
  const n = page.getByTestId("narrator-sheet");
  await n.getByLabel("Point of view").fill("second person");
  await n.getByRole("button", { name: "Save" }).click();
  await expect(n.getByText("✓ Saved")).toBeVisible();
  await expect(n.getByRole("button", { name: "Move to Trash" })).toHaveCount(0); // the built-in one stays

  await vault(page, "NPCs");
  await page.getByRole("button", { name: "New NPC" }).click();
  const npc = page.getByTestId("npc-sheet");
  await npc.getByLabel("NPC name").fill("The Bard");
  await npc.getByLabel("Description").fill("Sings too loudly.");
  await npc.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("vault-npcs")).toContainText("The Bard");

  await page.getByTestId("session-list").getByRole("button").first().click();
  await page.getByTestId("who-button").click();
  await page.getByLabel("Add an NPC to this chat").selectOption({ label: "The Bard" });
  await expect(page.getByTestId("chat-npcs")).toContainText("The Bard");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("who-button")).toContainText("+1 NPC");
  const sheet = await previewPrompt(page);
  await expect(sheet).toContainText("Other people in the scene");
  await expect(sheet).toContainText("Sings too loudly.");
});

test("a story goes to the Trash with its sessions and comes back with them", async ({ page }) => {
  await page.goto("/");
  await newStory(page, "Short One", /Write it together/);
  await page.getByLabel("Opening 1").fill("Once upon a time.");
  await startChat(page);
  await expect(page.getByTestId("message").first()).toContainText("Once upon a time.");
  await page.getByTestId("story-page-button").click();
  await page.getByTestId("story-page").waitFor();
  await page.getByRole("button", { name: "More…" }).click();
  await page.getByRole("menuitem", { name: "Move to Trash" }).click();
  await expect(page.getByTestId("story-list")).not.toContainText("Short One");
  await openLibrary(page, "Trash");
  await expect(page.getByTestId("trash-list")).toContainText("Short One");
  await expect(page.getByTestId("trash-list").locator("li")).toHaveCount(1); // its session is not listed apart
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByTestId("story-list")).toContainText("Short One");
  await expect(page.getByTestId("story-list")).toContainText("1 chat");
});

test("a story's setup reaches its chats; a chat can change a row for itself and go back to the story's", async ({ page }) => {
  await page.goto("/");
  await newStory(page, "Setup Story", /Narrated adventure/, async (sheet) => {
    await sheet.getByRole("checkbox", { name: "Scene: World" }).check();
  });
  await expect(page.getByTestId("story-setup").getByRole("checkbox", { name: "Scene: World" })).toBeChecked();
  await page.getByLabel("Opening 1").fill("The road is quiet.");
  await startChat(page);

  // the chat follows the story
  await openTab(page, "prompt");
  const own = page.getByTestId("chat-setup");
  await expect(page.getByTestId("follows-story")).toContainText("Setup Story");
  await expect(own.getByRole("checkbox", { name: "Scene: World" })).toBeChecked();
  await expect(own.getByTestId("setup-tracker-scene-world")).toContainText("from the story");
  // one change, for this chat only
  await own.getByRole("checkbox", { name: "Scene: Plot" }).check();
  await expect(own.getByTestId("setup-tracker-scene-plot")).toContainText("changed in this chat");
  await page.getByTestId("story-page-button").click();
  await expect(page.getByTestId("story-chats")).toContainText("1 change");
  await expect(page.getByTestId("story-setup").getByRole("checkbox", { name: "Scene: Plot" })).not.toBeChecked();

  // a second chat starts with the story's setup only
  await startChat(page, "new-chat");
  await openTab(page, "prompt");
  await expect(page.getByTestId("chat-setup").getByRole("checkbox", { name: "Scene: Plot" })).not.toBeChecked();
  await expect(page.getByTestId("chat-setup").getByRole("checkbox", { name: "Scene: World" })).toBeChecked();

  // back to the first chat: "Use the story's" undoes its change
  await page.getByTestId("story-list").getByRole("button", { name: "Chat 1" }).click();
  await openTab(page, "prompt");
  await page.getByTestId("chat-setup").getByTestId("setup-tracker-scene-plot").getByRole("button", { name: "Use the story's" }).click();
  await expect(page.getByTestId("chat-setup").getByRole("checkbox", { name: "Scene: Plot" })).not.toBeChecked();
  await expect(page.getByTestId("chat-setup")).not.toContainText("changed in this chat");
});
