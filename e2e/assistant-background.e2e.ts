// Assistant generation survives view navigation and keeps its Stop control. Author: CODEX, 2026-11-03.
import { expect, test, type Page } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

async function startGatedReply(page: Page) {
  await page.goto("/");
  await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error Isolated Vite services; synthetic provider only.
    const { servicesReady } = await import("/src/core-instance.ts");
    const svc = await servicesReady;
    const state = { calls: 0, aborted: false, finished: false, advance: () => {}, finish: () => {} };
    (globalThis as typeof globalThis & { __assistantBackground?: typeof state }).__assistantBackground = state;
    svc.core.connections.stream = async function* (_c: unknown, _m: unknown, signal: AbortSignal) {
      state.calls++;
      const wait = (key: "advance" | "finish") => new Promise<void>((resolve, reject) => {
        const abort = () => { state.aborted = true; reject(signal.reason ?? new DOMException("Stopped", "AbortError")); };
        state[key] = () => { signal.removeEventListener("abort", abort); resolve(); };
        if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
      });
      const next = wait("advance");
      yield "First part. ";
      await next; signal.throwIfAborted();
      const end = wait("finish");
      yield "Second part. ";
      await end; signal.throwIfAborted();
      yield "Final part.";
      state.finished = true;
    };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message to the Assistant").fill("Keep this answer going.");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-reply")).toContainText("First part.");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
}

async function release(page: Page, key: "advance" | "finish") {
  await page.evaluate(k => (globalThis as typeof globalThis & { __assistantBackground?: { advance: () => void; finish: () => void } }).__assistantBackground![k](), key);
}

async function savedReplies(page: Page) {
  return page.evaluate(async () => {
    // @ts-expect-error Synthetic in-memory preview database.
    const { servicesReady } = await import("/src/core-instance.ts");
    const { store } = await servicesReady;
    // @ts-expect-error Vite module path is resolved in the browser.
    const { listChats, loadChat } = await import("/src/assistant/engine.ts");
    const chat = await loadChat(store, (await listChats(store))[0].id);
    return chat.messages.filter((m: { role: string }) => m.role === "assistant");
  });
}

test("returning from Play reconnects to the same live reply and its Stop control", async ({ page }) => {
  await startGatedReply(page);
  await page.getByRole("tab", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("messages")).toBeVisible();
  await release(page, "advance");
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await expect(page.getByTestId("assistant-reply")).toContainText("First part. Second part.");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __assistantBackground?: { calls: number; aborted: boolean } }).__assistantBackground)).toMatchObject({ calls: 1, aborted: false });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  const replies = await savedReplies(page);
  expect(replies).toHaveLength(1);
  expect(replies[0].text).toBe("First part. Second part. ");
  expect(replies[0].text).not.toContain("Final part.");
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __assistantBackground?: { aborted: boolean } }).__assistantBackground!.aborted)).toBe(true);
});

test("a reply finishes while Play is open and appears once on return", async ({ page }) => {
  await startGatedReply(page);
  await page.getByRole("tab", { name: "Play", exact: true }).click();
  await release(page, "advance");
  await release(page, "finish");
  await expect.poll(async () => (await savedReplies(page)).length).toBe(1);
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await expect(page.getByTestId("assistant-reply")).toHaveCount(1);
  await expect(page.getByTestId("assistant-reply")).toContainText("First part. Second part. Final part.");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
});

test("leaving through Settings preserves the pending reply and finishes without a second request", async ({ page }) => {
  await startGatedReply(page);
  await page.getByTestId("assistant-settings").click();
  await expect(page.getByRole("tablist", { name: "Settings sections", exact: true })).toBeVisible();
  await release(page, "advance");
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await expect(page.getByTestId("assistant-reply")).toContainText("First part. Second part.");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await release(page, "finish");
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("assistant-reply")).toHaveCount(1);
  await expect(page.getByTestId("assistant-reply")).toContainText("Final part.");
  expect(await page.evaluate(() => (globalThis as typeof globalThis & { __assistantBackground?: { calls: number } }).__assistantBackground!.calls)).toBe(1);
  expect(await savedReplies(page)).toHaveLength(1);
});

test("switching Assistant chats and visiting Play restores only the selected chat", async ({ page }) => {
  await startGatedReply(page);
  const chats = page.getByTestId("assistant-chats");
  await page.getByTestId("assistant-new").click();
  await page.getByLabel("Message to the Assistant").fill("Other question draft");
  await expect(page.getByTestId("assistant-reply")).toHaveCount(0);
  await release(page, "advance");
  await chats.getByRole("button", { name: /^New chat/ }).click();
  await expect(page.getByTestId("assistant-messages")).toContainText("Keep this answer going.");
  await expect(page.getByTestId("assistant-reply")).toContainText("Second part.");
  await page.getByTestId("assistant-new").click();
  await expect(page.getByLabel("Message to the Assistant")).toHaveValue("Other question draft");
  await page.getByRole("tab", { name: "Play", exact: true }).click();
  await release(page, "finish");
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __assistantBackground?: { finished: boolean } }).__assistantBackground!.finished)).toBe(true);
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await expect(page.getByLabel("Message to the Assistant")).toHaveValue("Other question draft");
  await expect(page.getByTestId("assistant-reply")).toHaveCount(0);
  await expect(chats).toContainText("Keep this answer going.");
  await chats.getByRole("button", { name: /Keep this answer going/ }).click();
  await expect(page.getByTestId("assistant-reply")).toContainText("First part. Second part. Final part.");
});

test("returning during a failed initial save retains the original draft and permits retry", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error Synthetic in-memory services.
    const { servicesReady } = await import("/src/core-instance.ts"); const { store } = await servicesReady;
    const original = store.setAppSetting.bind(store); let first = true;
    store.setAppSetting = async (key: string, value: unknown) => {
      if (first && key.startsWith("assistant.chat:") && value && typeof value === "object" && "messages" in value) {
        first = false;
        await new Promise<void>(resolve => { (globalThis as typeof globalThis & { __failAssistantSave?: () => void }).__failAssistantSave = resolve; });
        throw new Error("Background first save failed");
      }
      return original(key, value);
    };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await page.getByLabel("Message to the Assistant").fill("Keep my unsaved question");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Play", exact: true }).click();
  await page.evaluate(() => (globalThis as typeof globalThis & { __failAssistantSave?: () => void }).__failAssistantSave!());
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await expect(page.getByLabel("Message to the Assistant")).toHaveValue("Keep my unsaved question");
  await expect(page.getByRole("alert")).toContainText("Background first save failed");
  await expect(page.getByTestId("assistant-send")).toBeEnabled();
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-regenerate")).toBeVisible();
  await expect(page.getByTestId("assistant-reply")).toHaveCount(1);
});
