// Assistant history, deletion and streaming scroll regressions. CODEX, 2026-11-03.
import { expect, test, type Page } from "@playwright/test";
async function start(page: Page) {
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error Vite serves application modules in the isolated browser preview.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady; let n = 0;
    svc.core.connections.stream = async function* () { yield `Answer ${++n}`; };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
}
async function send(page: Page, text: string) {
  await page.getByLabel("Message to the Assistant").fill(text); await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-stop")).toHaveCount(0);
  await expect(page.getByTestId("assistant-regenerate")).toBeVisible();
}
test("regeneration preserves answers, branches preserve continuations, and deletion has Undo", async ({ page }) => {
  await start(page); await send(page, "First question"); await expect(page.getByTestId("assistant-reply")).toContainText("Answer 1");
  await page.getByTestId("assistant-regenerate").click(); await expect(page.getByTestId("assistant-reply")).toContainText("Answer 2");
  await expect(page.getByTestId("assistant-version")).toHaveText("2/2");
  await page.getByRole("button", { name: "Previous Answer", exact: true }).click(); await expect(page.getByTestId("assistant-reply")).toContainText("Answer 1");
  await send(page, "Continue original"); await expect(page.getByTestId("assistant-reply").last()).toContainText("Answer 3");
  await page.getByLabel("Conversation Branch").selectOption({ label: "Branch 2" });
  await expect(page.getByTestId("assistant-messages")).not.toContainText("Continue original"); await expect(page.getByTestId("assistant-reply")).toContainText("Answer 2");
  await page.getByTestId("assistant-reply").getByRole("button", { name: "Branch From Here", exact: true }).click();
  await expect(page.getByLabel("Conversation Branch").locator("option")).toHaveCount(3); await send(page, "Branch only");
  await page.getByTestId("assistant-reply").first().getByRole("button", { name: "Delete Message", exact: true }).click();
  await expect(page.getByTestId("assistant-reply")).toHaveCount(1); await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(page.getByTestId("assistant-reply")).toHaveCount(2);
  await page.getByLabel("Conversation Branch").selectOption("main"); await expect(page.getByTestId("assistant-messages")).toContainText("Continue original"); await expect(page.getByTestId("assistant-messages")).not.toContainText("Branch only");
  await page.getByRole("tab", { name: "Play", exact: true }).click(); await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await expect(page.getByLabel("Conversation Branch").locator("option")).toHaveCount(3); await expect(page.getByTestId("assistant-messages")).toContainText("Continue original");
});
test("editing an earlier user message retains the original path", async ({ page }) => {
  await start(page); await send(page, "Original words"); await send(page, "Later question");
  await page.getByTestId("assistant-edit").first().click(); await page.getByLabel("Edit message", { exact: true }).fill("Edited words"); await page.locator(".asst-edit").getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("assistant-messages")).toContainText("Edited words"); await expect(page.getByTestId("assistant-regenerate")).toBeVisible();
  await page.getByLabel("Conversation Branch").selectOption("main"); await expect(page.getByTestId("assistant-messages")).toContainText("Original words"); await expect(page.getByTestId("assistant-messages")).toContainText("Later question");
});
test("repeating a regeneration click cannot land on Delete Message when versions appear", async ({ page }) => {
  await start(page); await send(page, "Stable action position");
  const again = page.getByTestId("assistant-regenerate"); const button = (await again.boundingBox())!;
  await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2); await expect(page.getByTestId("assistant-version")).toHaveText("2/2");
  await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2); await expect(page.getByTestId("assistant-version")).toHaveText("3/3");
  await expect(page.getByTestId("assistant-reply")).toHaveCount(1); await expect(page.getByRole("status")).toHaveCount(0);
});
test("streaming lets the reader scroll up and explicitly return to the latest text", async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    // @ts-expect-error Browser preview module, no real provider.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady; let n = 0;
    svc.core.connections.stream = async function* (_c: unknown, _m: unknown, signal: AbortSignal) {
      if (++n === 1) { yield "A long paragraph for reading.\n\n".repeat(90); return; }
      for (let i = 0; i < 45; i++) { signal?.throwIfAborted(); await new Promise(r => setTimeout(r, 70)); yield `Streaming paragraph ${i}.\n\n`; }
    };
  });
  await send(page, "Long response"); await page.getByLabel("Message to the Assistant").fill("Keep writing"); await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Streaming paragraph");
  await page.locator(".asst-scroll").evaluate(el => { el.scrollTop = 0; }); await expect(page.getByTestId("assistant-latest")).toBeVisible();
  await page.waitForTimeout(400); expect(await page.locator(".asst-scroll").evaluate(el => el.scrollTop)).toBeLessThan(30);
  await page.getByTestId("assistant-latest").click(); await expect(page.getByTestId("assistant-latest")).toHaveCount(0);
  expect(await page.locator(".asst-scroll").evaluate(el => el.scrollTop)).toBeGreaterThan(200);
  await expect(page.getByTestId("assistant-regenerate")).toBeVisible({ timeout: 15000 });
});
test("global search opens an Assistant message and drafts retain attachments", async ({ page }) => {
  await start(page); await send(page, "assistant-needle-UX");
  await page.getByTestId("assistant-plus").click(); await page.getByTestId("assistant-add-context").click(); await page.getByTestId("assistant-picker").getByRole("button", { name: /Lyra/ }).first().click(); await page.getByTestId("assistant-picker-add").click();
  await page.getByLabel("Message to the Assistant").fill("Unsent with attachment"); await page.getByRole("tab", { name: "Play", exact: true }).click();
  await page.keyboard.press("Control+k"); await page.getByRole("combobox", { name: "Open anything" }).fill("assistant-needle-UX");
  const hits = page.getByRole("group", { name: "Messages", exact: true }); await expect(hits).toContainText("assistant-needle-UX"); await hits.getByRole("option").first().click();
  await expect(page.getByTestId("assistant-messages")).toContainText("assistant-needle-UX"); await expect(page.getByLabel("Message to the Assistant")).toHaveValue("Unsent with attachment"); await expect(page.getByTestId("assistant-composer")).toContainText("Lyra");
});
test("a slow accepted save preserves the next draft and a failed first save keeps its draft", async ({ page }) => {
  await start(page); await send(page, "Existing chat");
  await page.evaluate(async () => {
    // @ts-expect-error Browser-only preview import.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady; const original = svc.store.setAppSetting.bind(svc.store); let delay = true;
    svc.store.setAppSetting = async (key: string, value: unknown) => { if (delay && value && typeof value === "object" && "messages" in value) { delay = false; await new Promise(r => setTimeout(r, 350)); } return original(key, value); };
  });
  await page.getByLabel("Message to the Assistant").fill("Accepted text"); await page.getByTestId("assistant-send").click(); await page.getByLabel("Message to the Assistant").fill("Next draft while saving");
  await expect(page.getByTestId("assistant-regenerate")).toBeVisible(); await expect(page.getByLabel("Message to the Assistant")).toHaveValue("Next draft while saving");
  await page.getByTestId("assistant-new").click();
  await page.evaluate(async () => {
    // @ts-expect-error Browser-only preview import.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady; const original = svc.store.setAppSetting.bind(svc.store); let fail = true;
    svc.store.setAppSetting = async (key: string, value: unknown) => { if (fail && value && typeof value === "object" && "messages" in value) { fail = false; throw new Error("Synthetic save failed"); } return original(key, value); };
  });
  await page.getByLabel("Message to the Assistant").fill("Keep after failed save"); await page.getByTestId("assistant-send").click();
  await expect(page.getByLabel("Message to the Assistant")).toHaveValue("Keep after failed save"); await expect(page.getByRole("alert")).toContainText("Synthetic save failed");
});
