// M4 / M5 (the mouse's side buttons) and Alt+← / Alt+→ everywhere (D-097). Author: CLAUDE, 2026-11-08.
// Playwright can't press the side buttons, so the test sends the same mouse events the WebView gets (button 3 = back, 4 = forward).
import { expect, test, type Page } from "@playwright/test";
import { editCharacter, newChatWith, openLibrary, openTab } from "./ui.ts";

const side = (page: Page, button: 3 | 4) => page.evaluate((b) => {
  document.body.dispatchEvent(new MouseEvent("mousedown", { button: b, bubbles: true, cancelable: true }));
  document.body.dispatchEvent(new MouseEvent("mouseup", { button: b, bubbles: true, cancelable: true }));
}, button);

test("M4 closes what is open first, then goes back screen by screen; M5 goes forward", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  await openLibrary(page, "Personas"); // Library (opens on Kits), then Personas: two steps
  await page.getByTestId("library-list").getByRole("button", { name: "Presets", exact: true }).click();
  await expect(page.getByTestId("preset-list")).toBeVisible();

  await side(page, 3);
  await expect(page.getByTestId("persona-list")).toBeVisible();
  await side(page, 3); // Kits
  await side(page, 3);
  await expect(page.getByTestId("messages")).toBeVisible();
  await side(page, 4); await side(page, 4);
  await expect(page.getByTestId("persona-list")).toBeVisible();
  await side(page, 4);
  await expect(page.getByTestId("preset-list")).toBeVisible();

  // back in the chat: a window open on top closes first, and the screen stays
  await side(page, 3); await side(page, 3); await side(page, 3);
  await expect(page.getByTestId("messages")).toBeVisible();
  await page.keyboard.press("Control+p");
  await expect(page.getByTestId("persona-picker")).toBeVisible();
  await side(page, 3);
  await expect(page.getByTestId("persona-picker")).toHaveCount(0);
  await expect(page.getByTestId("messages")).toBeVisible();
  // a popover too
  await page.getByTestId("who-button").click();
  await expect(page.getByTestId("who-pop")).toBeVisible();
  await side(page, 3);
  await expect(page.getByTestId("who-pop")).toHaveCount(0);
  await expect(page.getByTestId("messages")).toBeVisible();

  // Alt+← / Alt+→ do the same outside text boxes
  await page.locator("body").click({ position: { x: 5, y: 400 } });
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.getByTestId("messages")).toHaveCount(0);
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page.getByTestId("messages")).toBeVisible();
});

test("inside a screen M4/M5 step through what you switched: editor layout and tabs, inspector tabs, the open card", async ({ page }) => {
  await page.goto("/");
  // the character editor: Sheet → Tabs → the Greetings tab → Writer; M4 walks it back, without leaving the editor
  await openLibrary(page, "Characters");
  await editCharacter(page, "Lyra");
  const editor = page.getByLabel("Character editor");
  const layout = editor.getByRole("radiogroup", { name: "Layout" });
  await editor.getByRole("radio", { name: "Tabs" }).click();
  await editor.getByRole("tab", { name: /^Greetings/ }).click();
  await editor.getByRole("radio", { name: "Writer" }).click();
  await side(page, 3);
  await expect(layout.getByRole("radio", { name: "Tabs" })).toHaveAttribute("aria-checked", "true");
  await expect(editor.getByRole("tab", { name: /^Greetings/ })).toHaveAttribute("aria-selected", "true");
  await side(page, 3);
  await expect(editor.getByRole("tab", { name: "Character" })).toHaveAttribute("aria-selected", "true");
  await side(page, 3);
  await expect(layout.getByRole("radio", { name: "Sheet" })).toHaveAttribute("aria-checked", "true");
  await side(page, 4);
  await expect(layout.getByRole("radio", { name: "Tabs" })).toHaveAttribute("aria-checked", "true");
  await expect(editor).toBeVisible();
  await editor.getByRole("radio", { name: "Sheet" }).click();

  // the inspector's tabs
  await newChatWith(page);
  await openTab(page, "prompt");
  await openTab(page, "memory");
  await side(page, 3);
  await expect(page.getByTestId("tab-prompt")).toHaveAttribute("aria-selected", "true");
  await side(page, 3);
  await expect(page.getByTestId("tab-scene")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("messages")).toBeVisible();

});

test("Card Browser: M4 closes the card preview and stays; M5 opens it again", async ({ page }) => {
  await page.addInitScript(() => {
    const ok = (text: string) => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text });
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    (globalThis as { __h2FakeCardSites?: unknown }).__h2FakeCardSites = {
      async request(r: { url: string; expect: string }) {
        const u = new URL(r.url);
        if (r.expect === "image") return { status: 200, finalUrl: r.url, contentType: "image/png", cfMitigated: false, bytes: png, mime: "image/png" };
        if (u.host === "api.chub.ai" && u.pathname === "/search") return ok(JSON.stringify({ data: { count: 2, nodes: [1, 2].map((n) => ({ fullPath: `anna/elf-${n}`, name: `Elf ${n}`, tagline: "Woods", topics: ["Elf"], starCount: 1, nTokens: 100, nsfw: false })) } }));
        if (u.host === "api.chub.ai" && u.pathname.startsWith("/api/characters/")) return ok(JSON.stringify({ node: { definition: { name: "Elf", personality: "Proud.", scenario: "", first_message: "Hi.", alternate_greetings: [], description: "" } } }));
        throw new Error(`no fake for ${r.url}`);
      },
    };
  });
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  const browser = page.getByTestId("card-browser");
  await browser.getByTestId("cb-card").first().click();
  await expect(page.getByTestId("cb-sheet")).toBeVisible();
  await side(page, 3);
  await expect(page.getByTestId("cb-sheet")).toHaveCount(0);
  await expect(browser).toBeVisible();
  await side(page, 4);
  await expect(page.getByTestId("cb-sheet")).toBeVisible();
});
