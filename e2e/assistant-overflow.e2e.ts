// Assistant code wraps during streaming and after completion without changing copied text. CODEX, 2026-11-03.
import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

const paragraph = "{{user}} gains a skill point on each level. Experience comes from completed quests and discoveries. ".repeat(6).trim();
const indented = '  const payload = "' + "VeryLongUnbrokenCode".repeat(80) + '";';
const streamedCode = `${paragraph}\n\n${indented}`;
const completedCode = `${streamedCode}\nline two\n`;

for (const width of [1366, 390]) test(`long Assistant code wraps at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 768 });
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async code => {
    // @ts-expect-error Browser preview services; synthetic stream only.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady;
    const testWindow = globalThis as typeof globalThis & { __finishCodeStream?: () => void; __copiedCode?: string };
    const gate = new Promise<void>(resolve => { testWindow.__finishCodeStream = resolve; });
    Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async (text: string) => { testWindow.__copiedCode = text; } });
    svc.core.connections.stream = async function* () {
      yield "Before the code.\n\n```text\n" + code;
      await gate;
      yield "\nline two\n```\n\nAfter the code.";
    };
  }, streamedCode);
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  if (width < 700 && await page.getByTestId("assistant-details").isVisible()) await page.getByRole("button", { name: "Hide details", exact: true }).click();
  if (width < 700) await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
  await page.getByLabel("Message to the Assistant").fill("Show the long code.");
  await page.getByTestId("assistant-send").click();
  const reply = page.getByTestId("assistant-reply");
  const pre = reply.locator("pre");
  await expect(pre).toBeVisible();
  const fits = async () => page.locator(".asst-scroll").evaluate(el => el.scrollWidth <= el.clientWidth + 1);
  const codeFits = async () => pre.evaluate(el => el.scrollWidth <= el.clientWidth + 1);
  const firstLineRows = async () => pre.locator("code").evaluate(el => {
    const text = el.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0); range.setEnd(text, text.textContent!.indexOf("\n"));
    return range.getClientRects().length;
  });
  await expect.poll(fits).toBe(true);
  await expect.poll(codeFits).toBe(true);
  expect(await firstLineRows()).toBeGreaterThan(1);
  await expect(reply).not.toContainText("After the code.");
  await page.evaluate(() => (globalThis as typeof globalThis & { __finishCodeStream?: () => void }).__finishCodeStream!());
  await expect(reply).toContainText("After the code.");
  await expect.poll(fits).toBe(true);
  await expect.poll(codeFits).toBe(true);
  expect(await firstLineRows()).toBeGreaterThan(1);
  expect(await pre.locator("code").textContent()).toBe(completedCode);
  await pre.evaluate(el => { el.scrollLeft = 1000; });
  expect(await pre.evaluate(el => el.scrollLeft)).toBe(0);

  // Wrapping is visual: the code's Copy action retains spaces, blank lines and original line endings.
  const copy = reply.locator(".code-copy");
  await copy.focus(); await copy.press("Enter");
  await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { __copiedCode?: string }).__copiedCode)).toBe(completedCode);

  await page.screenshot({ path: `e2e/.results/assistant-code-wrap-${width}.png`, animations: "disabled" });

  // A saved response reflows as the available width changes.
  await page.setViewportSize({ width: width === 1366 ? 820 : 620, height: 768 });
  await expect.poll(codeFits).toBe(true);
  expect(await firstLineRows()).toBeGreaterThan(1);
  await expect(page.getByTestId("assistant-send")).toBeInViewport();
  const messageCopy = reply.getByRole("button", { name: "Copy", exact: true }).last();
  await messageCopy.scrollIntoViewIfNeeded();
  await expect(messageCopy).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
