// Message metadata with synthetic data and a scripted provider. Author: CODEX, 2026-11-03.
import { expect, test } from "@playwright/test";
import { send, openLibrary, openSession } from "./ui.ts";

test.use({ locale: "pt-BR", timezoneId: "America/Sao_Paulo" });

test("each message shows its date, time, position and separate counts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await expect(page.getByTestId("message").first().getByTestId("message-number")).toHaveText("#1");
  await page.evaluate(async () => {
    // @ts-expect-error Isolated Vite preview services, never the native database.
    const { servicesReady } = await import("/src/core-instance.ts");
    const svc = await servicesReady;
    let call = 0;
    svc.core.connections.stream = async function* () {
      call++;
      yield { reasoning: "The ranger considers the question." };
      yield "She lowers her bow and lets you through.";
      yield { usage: { tokensIn: 100, tokensOut: call === 1 ? 745 : 90, tokensReasoning: call === 1 ? 170 : 20 } };
    };
  });
  await send(page, "Hello there.");
  const messages = page.getByTestId("message");
  for (let i = 0; i < 3; i++) {
    await expect(messages.nth(i).getByTestId("message-number")).toHaveText(`#${i + 1}`);
    const stamp = messages.nth(i).getByTestId("message-time");
    expect(Number.isNaN(Date.parse((await stamp.getAttribute("datetime"))!))).toBe(false);
    await expect(stamp).toContainText(/\d{4}/);
    await expect(stamp).toContainText(/\d{1,2}:\d{2}/);
  }
  const reply = messages.last();
  const originalTime = await reply.getByTestId("message-time").getAttribute("datetime");
  const expectedTime = await page.evaluate((at) => {
    const d = new Date(at!);
    return `${new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(d)} · ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(d)}`;
  }, originalTime);
  await expect(reply.getByTestId("message-time")).toHaveText(expectedTime);
  await expect(reply.getByTestId("message-text-tokens")).toHaveText("Text 575t");
  await expect(reply.getByTestId("message-reasoning-tokens")).toHaveText("Reasoning 170t");
  await expect(messages.nth(1).getByTestId("message-text-tokens")).toContainText("~");
  await expect(messages.nth(1).getByTestId("message-reasoning-tokens")).toHaveCount(0);
  await page.getByTestId("messages").evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))); });
  await page.screenshot({ path: "e2e/.results/message-metadata-desktop.png" });
  await reply.getByRole("button", { name: "Hide from the AI", exact: true }).click();
  await expect(reply.getByTestId("message-number")).toHaveText("#3");
  await reply.getByRole("button", { name: "New Version", exact: true }).click();
  await expect(page.getByTestId("streaming")).toHaveCount(0);
  await expect(messages.last().getByTestId("message-number")).toHaveText("#3");
  await expect(messages.last().getByTestId("message-text-tokens")).toHaveText("Text 70t");
  await expect(messages.last().getByTestId("message-reasoning-tokens")).toHaveText("Reasoning 20t");
  await messages.last().getByRole("button", { name: "Previous version" }).click();
  await expect(messages.last().getByTestId("message-text-tokens")).toHaveText("Text 575t");
  await messages.last().getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Edit the message").fill("Edited text.");
  await page.getByTestId("save-edit").click();
  await expect(messages.last().getByTestId("message-text-tokens")).toHaveText("Text ~3t");
  await expect(messages.last().getByTestId("message-time")).toHaveAttribute("datetime", originalTime!);
  await openLibrary(page, "Characters");
  await openSession(page);
  await expect(messages.last().getByTestId("message-text-tokens")).toHaveText("Text ~3t");
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  await page.getByRole("button", { name: "Hide Sidebar" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(messages.last().getByTestId("message-reasoning-tokens")).toBeVisible();
  await page.getByTestId("messages").evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))); });
  await page.screenshot({ path: "e2e/.results/message-metadata-mobile.png" });
  await page.evaluate(() => document.documentElement.style.setProperty("--size-small", "18px"));
  for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(viewport);
    const overflow = await messages.locator('[data-testid="message-time"], [data-testid="message-metadata"] > span').evaluateAll((els) => els.some((el) => {
      const r = el.getBoundingClientRect();
      return r.left < 0 || r.right > innerWidth;
    }));
    expect(overflow).toBe(false);
  }
  await page.screenshot({ path: "e2e/.results/message-metadata-large-text.png" });
});


test("branch positions follow the current path and reasoning counts can exist without reasoning text", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await page.evaluate(async () => {
    // @ts-expect-error Synthetic in-memory preview.
    const { servicesReady } = await import("/src/core-instance.ts");
    const svc = await servicesReady;
    svc.core.connections.stream = async function* () {
      yield "A reply.";
      yield { usage: { tokensOut: 30, tokensReasoning: 25 } };
    };
  });
  await send(page, "First path.");
  const messages = page.getByTestId("message");
  await expect(messages.last().getByTestId("reasoning")).toHaveCount(0);
  await expect(messages.last().getByTestId("message-reasoning-tokens")).toHaveText("Reasoning 25t");
  await messages.first().getByRole("button", { name: "Branch from here", exact: true }).click();
  await expect(messages).toHaveCount(1);
  await send(page, "New path.");
  await expect(messages).toHaveCount(3);
  await expect(messages.nth(1).getByTestId("message-number")).toHaveText("#2");
  await expect(messages.last().getByTestId("message-number")).toHaveText("#3");
  await expect(messages.last().getByTestId("message-text-tokens")).toHaveText("Text 5t");
});
