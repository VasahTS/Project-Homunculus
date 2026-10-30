// Click tests of the lorebook screens (D-028): Library → Lorebooks (editor "A" + Try It), the session's
// lorebooks in the Prompt tab, the Reply tab's group, Settings → Lorebooks. Author: CLAUDE, 2026-10-29.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary, openSession, openTab, send } from "./ui.ts";

const editor = (page: Page) => page.getByLabel("Lorebook editor");
const stEntry = (uid: number, keys: string[], content: string, extra: Record<string, unknown> = {}) => ({
  uid, key: keys, keysecondary: [], comment: "", content, constant: false, selective: true, selectiveLogic: 0, order: 100, position: 0,
  disable: false, probability: 100, useProbability: true, depth: 4, group: "", scanDepth: null, caseSensitive: null, matchWholeWords: null,
  sticky: null, cooldown: null, delay: null, role: 0, displayIndex: uid, ...extra,
});
const world = {
  entries: {
    "0": stEntry(0, ["old mill", "mill"], "The mill has stood empty since the flood.", { comment: "The Old Mill" }),
    "1": stEntry(1, ["Silver Fox"], "A bandit who leaves a silver coin behind.", { comment: "The Silver Fox", probability: 75 }),
    "2": stEntry(2, [], "Nobody travels the old roads after dark.", { comment: "Rules of the Reach", constant: true, order: 10 }),
  },
};

async function openLorebooks(page: Page) {
  await openLibrary(page, "Lorebooks");
}

async function importRealm(page: Page) {
  await openLorebooks(page);
  await page.getByTestId("lorebook-import-input").setInputFiles({ name: "Vaelthar.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(world)) });
  await expect(page.getByTestId("notice")).toContainText("Imported Vaelthar (3 entries)");
}

test("import a SillyTavern lorebook, open an entry, pick where it goes, and Try It explains what would go in", async ({ page }) => {
  await page.goto("/");
  await importRealm(page);
  const entries = editor(page).getByTestId("lore-entry");
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText("The Old Mill");
  await expect(entries.nth(2)).toContainText("Always on");
  await expect(entries.nth(1)).toContainText("75%");

  // open the entry in place; "Where it goes" is one line with a pop-up
  await entries.nth(1).getByRole("button", { name: /^The Silver Fox:/ }).click();
  await expect(editor(page).getByLabel("Entry text")).toHaveValue("A bandit who leaves a silver coin behind.");
  // 5 kinds in the menu; "Before | After" beside it when the kind has two sides
  const side = editor(page).getByRole("radiogroup", { name: "Before or after" });
  await side.getByRole("radio", { name: "After" }).click();
  await expect(entries.nth(1)).toContainText("After the character");
  await editor(page).getByRole("button", { name: "Where it goes: Character" }).click();
  await expect(editor(page).getByRole("listbox", { name: "Where it goes" }).getByRole("option")).toHaveCount(5);
  await page.waitForTimeout(250);
  await page.screenshot({ path: "e2e/.results/lorebook-where.png" });
  await editor(page).getByRole("option", { name: /Around the examples/ }).click();
  await expect(entries.nth(1)).toContainText("Examples (bottom)");
  await editor(page).getByRole("button", { name: "Where it goes: Examples" }).click();
  await editor(page).getByRole("option", { name: /In the chat/ }).click();
  await expect(side).toHaveCount(0);
  await expect(editor(page).getByLabel("Depth")).toHaveValue("4");
  await expect(entries.nth(1)).toContainText("In the chat · 4 back · System");

  // Try It (on by default): typed text is read as the next message
  const tryIt = page.getByTestId("lore-try");
  await tryIt.getByLabel("Test text").fill("Is the Silver Fox hiding at the old mill?");
  await expect(page.getByTestId("lore-try-in")).toContainText("The Old Mill");
  await expect(page.getByTestId("lore-try-in")).toContainText("Keyword “old mill”");
  await expect(page.getByTestId("lore-try-in")).toContainText("Rules of the Reach");
  await expect(tryIt.locator("mark").first()).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "e2e/.results/lorebook-editor.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: "e2e/.results/lorebook-editor-1440.png" });

  // a new keyword as a chip; save; the change is kept
  await editor(page).getByLabel("New keywords").fill("the Fox");
  await page.keyboard.press("Enter");
  await expect(editor(page).getByRole("group", { name: "Keywords", exact: true })).toContainText("the Fox");
  await expect(editor(page).getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.getByTestId("lorebook-list").getByRole("button", { name: "Vaelthar" }).click();
  // the closed row doesn't list keywords (only "Always on"), but they are kept
  await expect(editor(page).getByTestId("lore-entry").nth(1).getByRole("button", { name: /^The Silver Fox: Silver Fox, the Fox/ })).toBeVisible();
});

test("a session reads the lorebook, can switch it off, and the Reply tab says which entries went in", async ({ page }) => {
  await page.goto("/");
  await importRealm(page);
  await openSession(page);
  await openTab(page, "prompt");
  const group = page.getByTestId("session-lorebooks");
  await group.getByLabel("Add a lorebook to this session").selectOption({ label: "Vaelthar" });
  await expect(group.getByRole("switch", { name: "Vaelthar in this session" })).toHaveAttribute("aria-checked", "true");
  await expect(group).toContainText("Added to this session");
  await group.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "e2e/.results/lorebook-prompt-tab.png" });

  await send(page, "We pass the old mill.");
  await openTab(page, "reply");
  const lore = page.getByTestId("reply-lore");
  await expect(lore).toContainText("The Old Mill");
  await expect(lore).toContainText("Keyword “old mill”");
  await expect(lore).toContainText("Rules of the Reach");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "e2e/.results/lorebook-reply-tab.png" });

  // switched off for this session: the next reply has no lorebook group
  await openTab(page, "prompt");
  await group.getByRole("switch", { name: "Vaelthar in this session" }).click();
  await expect(group.getByRole("switch", { name: "Vaelthar in this session" })).toHaveAttribute("aria-checked", "false");
  await send(page, "Back at the old mill.");
  await openTab(page, "reply");
  await expect(page.getByTestId("reply-pane")).toBeVisible();
  await expect(page.getByTestId("reply-lore")).toHaveCount(0);
});

test("Settings → Lorebooks: reading settings and the books every session reads", async ({ page }) => {
  await page.goto("/");
  await importRealm(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-lorebooks").click();
  const s = page.getByTestId("lore-settings");
  await expect(s.getByLabel("Read the last")).toHaveValue("2");
  await s.getByLabel("Read the last").fill("4");
  await s.getByLabel("Add a lorebook").selectOption({ label: "Vaelthar" });
  await expect(s.getByTestId("lorebook-links")).toContainText("Vaelthar");
  await page.screenshot({ path: "e2e/.results/lorebook-settings.png" });
  await openLorebooks(page);
  await expect(page.getByTestId("lorebook-list")).toContainText("Global (every session)");
  await page.getByTestId("lorebook-list").getByRole("button", { name: "Vaelthar" }).click();
  await expect(page.getByTestId("lore-try")).toContainText("Reads the last 4 messages");
});

test("changes save by themselves (no Save button, no warnings); typing in the middle of a text works like a normal editor", async ({ page }) => {
  await page.goto("/");
  await importRealm(page);
  const ed = editor(page);
  await expect(ed.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  const entries = ed.getByTestId("lore-entry");
  await entries.nth(1).getByRole("button", { name: /^The Silver Fox:/ }).click();

  // a number box can be emptied and retyped; it is checked when you leave it
  const order = ed.getByRole("textbox", { name: "Order", exact: true });
  await order.fill("");
  await expect(order).toHaveValue("");
  await order.fill("250");
  await order.press("Tab");
  await expect(order).toHaveValue("250");
  await order.fill("abc");
  await order.press("Enter");
  await expect(order).toHaveValue("250");

  // typing in the middle of the text: the caret stays where you type, and Ctrl+Z undoes
  const text = ed.getByLabel("Entry text");
  await text.click();
  await text.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(2, 2)); // "A |bandit…"
  await page.keyboard.type("sly ");
  await expect(text).toHaveValue("A sly bandit who leaves a silver coin behind.");
  expect(await text.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(6);
  await page.keyboard.press("Control+z");
  await expect(text).not.toHaveValue("A sly bandit who leaves a silver coin behind.");
  await page.keyboard.press("Control+Shift+z");
  await expect(text).toHaveValue("A sly bandit who leaves a silver coin behind.");

  // it saves a moment later; leaving right away also keeps the change (no question asked)
  await expect(ed.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await text.press("Control+End");
  await page.keyboard.type(" Always.");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByTestId("notice")).not.toContainText("unsaved");
  await openLorebooks(page);
  await page.getByTestId("lorebook-list").getByRole("button", { name: "Vaelthar" }).click();
  await editor(page).getByTestId("lore-entry").nth(1).getByRole("button", { name: /^The Silver Fox:/ }).click();
  await expect(editor(page).getByRole("textbox", { name: "Order", exact: true })).toHaveValue("250");
  await expect(editor(page).getByLabel("Entry text")).toHaveValue("A sly bandit who leaves a silver coin behind. Always.");
  // a burst of edits is one version in History, not one per letter
  await editor(page).getByRole("button", { name: "History" }).click();
  await expect(editor(page).locator(".lore-history li, .lore-history [data-testid=history-entry]").first()).toBeVisible();
  expect(await editor(page).locator(".lore-history li, .lore-history [data-testid=history-entry]").count()).toBeLessThanOrEqual(3);
});

test("closing an entry shrinks it smoothly, with no frame where it jumps back open", async ({ page }) => {
  await page.goto("/");
  await importRealm(page);
  const entry = editor(page).getByTestId("lore-entry").nth(1);
  const head = entry.getByRole("button", { name: /^The Silver Fox:/ });
  await head.click();
  await expect(editor(page).getByLabel("Entry text")).toBeVisible();
  await page.waitForTimeout(400);
  const heights = await entry.evaluate(async (el) => {
    const out: number[] = [];
    (el.querySelector("button[aria-label^='The Silver Fox:']") as HTMLButtonElement).click();
    const end = performance.now() + 500;
    while (performance.now() < end) { out.push(el.getBoundingClientRect().height); await new Promise((r) => requestAnimationFrame(r)); }
    return out;
  });
  for (let i = 1; i < heights.length; i++) expect(heights[i]!, `frame ${i}: ${heights.join(", ")}`).toBeLessThanOrEqual(heights[i - 1]! + 0.5);
  expect(heights.at(-1)!).toBeLessThan(heights[0]! / 3);
});

test("on a closed entry: change where it goes and switch Always on, without opening it", async ({ page }) => {
  await page.goto("/");
  await importRealm(page);
  const entries = editor(page).getByTestId("lore-entry");
  const fox = entries.nth(1);
  await fox.getByRole("button", { name: /^Where The Silver Fox goes: Before the character/ }).click();
  const menu = page.getByRole("menu", { name: "Where The Silver Fox goes" });
  await expect(menu.getByRole("menuitemradio", { name: "Character, before" })).toHaveAttribute("aria-checked", "true");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "e2e/.results/lorebook-quick-place.png" });
  await menu.getByRole("menuitemradio", { name: "Examples, after" }).click();
  await expect(menu).toHaveCount(0);
  await expect(fox).toContainText("Examples (bottom)");
  await expect(editor(page).getByLabel("Entry text")).toHaveCount(0); // still closed

  // In the chat: messages back and role right in the menu
  await fox.getByRole("button", { name: /^Where The Silver Fox goes:/ }).click();
  await menu.getByLabel("Messages back").fill("2");
  await menu.getByLabel("Messages back").press("Enter");
  await menu.getByLabel("As").selectOption("user");
  await expect(fox).toContainText("In the chat · 2 back · User");
  await page.screenshot({ path: "e2e/.results/lorebook-quick-chat.png" });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // an outlet needs a name, so picking it opens the entry
  await fox.getByRole("button", { name: /^Where The Silver Fox goes:/ }).click();
  await menu.getByRole("menuitemradio", { name: "Outlet" }).click();
  await expect(editor(page).getByLabel("Outlet name")).toBeVisible();
  await fox.getByRole("button", { name: /^The Silver Fox:/ }).click();

  // Always on, right on the row
  const always = fox.getByRole("button", { name: "Always on: The Silver Fox" });
  await expect(always).toHaveAttribute("aria-pressed", "false");
  await always.click();
  await expect(always).toHaveAttribute("aria-pressed", "true");
  await expect(editor(page).getByRole("radio", { name: /Always on 2/ }).or(editor(page).getByText("Always on 2"))).toBeVisible();
  await expect(editor(page).getByLabel("Entry text")).toHaveCount(0);
});

test("Global Lorebooks: a strip on top of Library → Lorebooks, read in every session, like SillyTavern's global list", async ({ page }) => {
  await page.goto("/");
  await importRealm(page);
  const globals = page.getByTestId("lore-globals");
  await expect(globals).toContainText("None yet");
  await globals.getByLabel("Add a lorebook").selectOption({ label: "Vaelthar" });
  await expect(globals.getByRole("button", { name: "Vaelthar", exact: true })).toBeVisible();
  await expect(page.getByTestId("lorebook-list")).toContainText("Global (every session)");
  await page.screenshot({ path: "e2e/.results/lorebook-global.png" });
  // a session reads it without adding it
  await openSession(page);
  await openTab(page, "prompt");
  await expect(page.getByTestId("session-lorebooks")).toContainText("Global (every session)");
  // the same list in Settings → Lorebooks
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-lorebooks").click();
  await expect(page.getByTestId("lore-settings").getByTestId("lorebook-links")).toContainText("Vaelthar");
  // × takes it off
  await openLorebooks(page);
  await page.getByTestId("lore-globals").getByRole("button", { name: "Remove Vaelthar" }).click();
  await expect(page.getByTestId("lore-globals")).toContainText("None yet");
});

test("opened from a session, the lorebook page has a button straight back to that session", async ({ page }) => {
  await page.goto("/");
  await importRealm(page);
  await openSession(page);
  await openTab(page, "prompt");
  const group = page.getByTestId("session-lorebooks");
  await group.getByLabel("Add a lorebook to this session").selectOption({ label: "Vaelthar" });
  await group.getByRole("button", { name: "Vaelthar", exact: true }).click();
  await expect(editor(page)).toBeVisible();
  const back = page.getByRole("button", { name: /Session with Lyra/ }).and(page.locator(".back-btn"));
  await expect(back).toBeVisible();
  // still there after moving around inside Lorebooks
  await editor(page).getByRole("button", { name: "Close" }).click();
  await expect(back).toBeVisible();
  await page.getByTestId("lorebook-list").getByRole("button", { name: "Vaelthar" }).click();
  await page.screenshot({ path: "e2e/.results/lorebook-back.png" });
  await back.click();
  await expect(page.getByTestId("messages")).toBeVisible();
  await expect(page.locator(".back-btn")).toHaveCount(0);
});

test("Find and Replace (Ctrl+H) like Notepad++: next match, replace one (Ctrl+Z undoes it), replace all (and undo it)", async ({ page }) => {
  await page.goto("/");
  await importRealm(page);
  const ed = editor(page);
  await ed.getByTestId("lore-entry").first().getByRole("button", { name: /^The Old Mill:/ }).click();
  await ed.getByLabel("Entry text").click();
  await page.keyboard.press("Control+h");
  const bar = page.getByTestId("lore-replace");
  await expect(bar.getByLabel("Find", { exact: true })).toBeFocused();
  await page.keyboard.type("the");
  await expect(bar).toContainText("in the text of");
  await bar.getByLabel("Whole words only").click();
  // Enter = next match: the entry opens with the word selected
  await bar.getByLabel("Find", { exact: true }).press("Enter");
  const text = ed.getByLabel("Entry text");
  await expect(text).toBeFocused();
  const sel = await text.evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
  expect(sel.toLowerCase()).toBe("the");
  await page.screenshot({ path: "e2e/.results/lorebook-replace.png" });
  // Replace: only that one; Ctrl+Z in the text puts it back
  const before = await text.inputValue();
  await bar.getByLabel("Replace with").fill("a");
  await bar.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(text).not.toHaveValue(before);
  await text.focus();
  await page.keyboard.press("Control+z");
  await expect(text).toHaveValue(before);
  // Replace All over every entry, then undo it from the bar
  await bar.getByLabel("Find", { exact: true }).fill("mill");
  await bar.getByLabel("Replace with").fill("ancient");
  await bar.getByRole("button", { name: "Replace All" }).click();
  await expect(bar).toContainText(/Replaced \d+ in \d+ entr/);
  await expect(text).toHaveValue(/ancient/);
  await bar.getByRole("button", { name: "Undo Replace All" }).click();
  await expect(text).not.toHaveValue(/ancient/);
  // a broken regular expression says so
  await bar.getByLabel("Regular expression").click();
  await bar.getByLabel("Find", { exact: true }).fill("(unclosed");
  await expect(bar).toContainText("Not a valid regular expression");
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);
});
