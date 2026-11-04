// Click tests: a reply keeps being written when you leave its chat; several chats write at once. Author: CLAUDE, 2026-10-29.
// (Daniel: "things stop generating when we leave the chat… generate several messages in different chats".)
import { expect, test, type Page } from "@playwright/test";
import { newChatWith, openLibrary, openTab, send, setTracker } from "./ui.ts";

const newChat = (page: Page) => newChatWith(page);

async function rename(page: Page, name: string) {
  await page.getByTitle("Click to rename").click();
  await page.getByLabel("Session title").fill(name);
  await page.getByLabel("Session title").press("Enter");
}

/** A chat in the sidebar by its name (the list reorders as chats get new messages). */
const chat = (page: Page, name: string) => page.getByTestId("session-list").getByRole("button", { name: new RegExp(`^${name}`) });

async function write(page: Page, text: string) {
  await page.getByPlaceholder(/Write your message/).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("streaming")).toBeVisible();
}

test("leaving a chat while it writes: the reply keeps going and is there when you come back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await rename(page, "Alpha");
  await newChat(page);
  await rename(page, "Beta");
  await chat(page, "Alpha").click();
  await page.evaluate(() => { (globalThis as { __h2ReplyDelayMs?: number }).__h2ReplyDelayMs = 120; });
  await write(page, "First chat, keep going without me.");
  // go to the other chat while the reply is still arriving
  await chat(page, "Beta").click();
  await expect(page.getByTestId("messages")).toBeVisible();
  await expect(page.getByTestId("streaming")).toHaveCount(0); // this chat is not writing
  await expect(page.getByTestId("session-list").getByTestId("side-writing")).toHaveCount(1); // the other one says so
  // and this one can write at the same time
  await write(page, "Second chat, at the same time.");
  await expect(page.getByTestId("session-list").getByTestId("side-writing")).toHaveCount(2);
  // back to the first: it is still writing, and finishes on screen
  await chat(page, "Alpha").click();
  await expect(page.getByTestId("streaming")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(page.getByTestId("streaming")).toHaveCount(0, { timeout: 20_000 });
  const msgs = page.getByTestId("message");
  await expect(msgs).toHaveCount(3);
  await expect(msgs.nth(2)).toContainText('You said: First chat, keep going without me."');
  // the second finished while we were away: a notice says so and opens it
  await expect(page.getByTestId("session-list").getByTestId("side-writing")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("notice")).toContainText("Reply ready in “Beta”");
  await page.getByTestId("notice").getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("message")).toHaveCount(3);
  await expect(page.getByTestId("message").nth(2)).toContainText('You said: Second chat, at the same time."');
  // a new reply in the first chat continues the same branch (no stray branch)
  await chat(page, "Alpha").click();
  await page.evaluate(() => { (globalThis as { __h2ReplyDelayMs?: number }).__h2ReplyDelayMs = 5; });
  await page.getByPlaceholder(/Write your message/).fill("Again.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("message")).toHaveCount(5, { timeout: 15_000 });
  await expect(page.getByTestId("session-list").locator(".side-fork")).toHaveCount(0); // still one branch per chat
});

test("Stop works after coming back, and keeps what arrived", async ({ page }) => {
  await page.goto("/");
  await rename(page, "Alpha");
  await newChat(page);
  await page.evaluate(() => { (globalThis as { __h2ReplyDelayMs?: number }).__h2ReplyDelayMs = 200; });
  await write(page, "Long one.");
  await chat(page, "Alpha").click();
  await chat(page, "Session with Lyra").click();
  await expect(page.getByTestId("streaming")).toBeVisible();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("message")).toHaveCount(3);
  await expect(page.getByTestId("message").nth(2)).toContainText("She tilts her head"); // what arrived stays
  await expect(page.getByTestId("message").nth(2)).not.toContainText('You said: Long one."'); // the rest never came
});

test("■ in the sidebar stops a reply without opening its chat", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await rename(page, "Gamma");
  await newChat(page);
  await rename(page, "Delta");
  await chat(page, "Gamma").click();
  await page.evaluate(() => { (globalThis as { __h2ReplyDelayMs?: number }).__h2ReplyDelayMs = 200; });
  await write(page, "Stop me from the side.");
  await chat(page, "Delta").click();
  await page.getByTestId("side-stop").click();
  await expect(page.getByTestId("session-list").getByTestId("side-writing")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByTestId("messages")).toBeVisible();
});

// CODEX: hold the offline completion until the test releases it or the user presses Stop.
async function holdAgent(page: Page) {
  await page.evaluate(async () => {
    const module = "/src/core-instance.ts";
    const { servicesReady } = await import(module) as typeof import("../apps/desktop/src/core-instance.ts");
    const { core } = await servicesReady;
    const complete = core.connections.complete.bind(core.connections);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const gate = { release, entered: false };
    Object.assign(globalThis, { agentGate: gate });
    core.connections.complete = async (connection, messages, options) => {
      gate.entered = true;
      const signal = options?.signal;
      await new Promise<void>((resolve) => {
        if (signal?.aborted) { resolve(); return; }
        const done = () => { signal?.removeEventListener("abort", done); resolve(); };
        signal?.addEventListener("abort", done, { once: true });
        void pending.then(done);
      });
      signal?.throwIfAborted();
      return complete(connection, messages, options);
    };
  });
}

async function twoChatsWithTracker(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await rename(page, "Alpha");
  await setTracker(page, "Scene: World");
  await newChat(page);
  await rename(page, "Beta");
  await setTracker(page, "Scene: World");
  await chat(page, "Alpha").click();
  await expect(page.getByTestId("message")).toHaveCount(1);
  await holdAgent(page);
}

const worldRun = (page: Page) => page.locator('[data-testid="run-log"][data-tracker="scene-world"]');
const openAgents = (page: Page) => page.getByTestId("agents-menu-button").click();
const worldAgent = (page: Page) => page.getByTestId("agents-menu-item").filter({ hasText: "Scene: World" });
const releaseAgent = (page: Page) => page.evaluate(() => (globalThis as typeof globalThis & { agentGate: { release: () => void } }).agentGate.release());

test("a manual tracker stays busy on return and saves while another chat is open", async ({ page }) => {
  await twoChatsWithTracker(page);
  await worldRun(page).getByRole("button", { name: "Run now" }).click();
  await expect(worldRun(page)).toContainText("running…");
  await chat(page, "Beta").click();
  await chat(page, "Alpha").click();
  await expect(worldRun(page).getByRole("button", { name: "running…" })).toBeDisabled();
  await chat(page, "Beta").click();
  await expect(chat(page, "Alpha").getByTestId("side-writing")).toBeVisible();
  await releaseAgent(page);
  await expect(chat(page, "Alpha").getByTestId("side-writing")).toHaveCount(0);
  await expect(worldRun(page)).toContainText("Not run at this message.");
  await chat(page, "Alpha").click();
  await expect(worldRun(page).getByTestId("run-status")).toHaveText("✓ updated");
});

test("an automatic tracker is visible on return and never appears to run in another chat", async ({ page }) => {
  await twoChatsWithTracker(page);
  await page.evaluate(() => { (globalThis as { __h2ReplyDelayMs?: number }).__h2ReplyDelayMs = 120; });
  await write(page, "I step into the woods.");
  await chat(page, "Beta").click();
  await openAgents(page);
  await page.waitForFunction(() => (globalThis as typeof globalThis & { agentGate: { entered: boolean } }).agentGate.entered);
  await expect(worldAgent(page)).not.toContainText("Running…");
  await expect(worldAgent(page).getByRole("button", { name: "Run Scene: World" })).toBeEnabled();
  await chat(page, "Alpha").click();
  await openAgents(page);
  await expect(worldAgent(page)).toContainText("Running…");
  await releaseAgent(page);
  await expect(worldAgent(page)).toContainText("Ran on the last reply");
});

test("Stop cancels a manual run after leaving and reopening the chat", async ({ page }) => {
  await twoChatsWithTracker(page);
  await openAgents(page);
  await worldAgent(page).getByRole("button", { name: "Run Scene: World" }).click();
  await expect(worldAgent(page)).toContainText("Running…");
  await chat(page, "Beta").click();
  await chat(page, "Alpha").click();
  const stop = page.getByRole("button", { name: "Stop", exact: true });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(worldRun(page).getByTestId("run-status")).toHaveText("cancelled");
});

test("a rewrite started from Reply updates the same message after a trip to the Library", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await rename(page, "Alpha");
  await openAgents(page);
  const menu = page.getByTestId("agents-menu");
  await menu.getByRole("button", { name: /^Off in this chat/ }).click();
  await menu.getByRole("switch", { name: "Prose Polisher in this chat" }).click();
  await page.keyboard.press("Escape");
  await send(page, "I wait by the gate.");
  const reply = page.getByTestId("message").last();
  await expect(reply.getByTestId("mark-rewrite")).toBeVisible();
  const before = await reply.locator(".text").innerText();
  const messageId = await reply.getAttribute("data-mid");
  await holdAgent(page);
  await openTab(page, "reply");
  const pane = page.getByTestId("reply-pane");
  await pane.getByRole("button", { name: "Run Again", exact: true }).click();
  await expect(pane.getByRole("button", { name: "Running…" })).toBeDisabled();
  await openLibrary(page, "Agents");
  await expect(chat(page, "Alpha").getByTestId("side-writing")).toBeVisible();
  await chat(page, "Alpha").click();
  await openTab(page, "reply");
  await expect(pane.getByRole("button", { name: "Running…" })).toBeDisabled();
  await expect(reply.locator(".text")).toHaveText(before);
  await releaseAgent(page);
  await expect(pane.getByRole("button", { name: "Run Again", exact: true }).first()).toBeEnabled();
  await expect(reply.locator(".text")).not.toHaveText(before);
  await expect(reply).toHaveAttribute("data-mid", messageId!);
  await expect(page.getByTestId("message")).toHaveCount(3);
});
