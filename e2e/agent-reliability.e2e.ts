// Agent editor persistence under slow and failing writes. Isolated browser data. CODEX, 2026-10-30.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary } from "./ui.ts";

async function fault(page: Page, failures = 0, slow = false) {
  await page.evaluate(async ({ failures, slow }) => {
    const path = "/src/core-instance.ts";
    const { servicesReady } = await import(path);
    const { store } = await servicesReady;
    const original = store.saveAgentConfig.bind(store);
    const control = { calls: 0, failures, release: () => {} };
    (globalThis as typeof globalThis & { audit: typeof control }).audit = control;
    store.saveAgentConfig = async (input: { name: string }) => {
      const call = ++control.calls;
      if (call <= control.failures) throw new Error("Simulated disk failure");
      if (slow && call === 1) await new Promise<void>((resolve) => { control.release = resolve; });
      return original(input);
    };
  }, { failures, slow });
}
const calls = (page: Page) => page.evaluate(() => (globalThis as typeof globalThis & { audit: { calls: number } }).audit.calls);
async function editPolisher(page: Page) {
  await page.goto("/");
  await openLibrary(page, "Agents");
  await page.getByTestId("agent-table").getByTestId("agent-row").filter({ hasText: "Prose Polisher" }).click();
  return page.getByTestId("agent-editor");
}

test("a slow earlier save cannot overwrite a newer edit", async ({ page }) => {
  const editor = await editPolisher(page);
  await fault(page, 0, true);
  await page.clock.install();
  await editor.getByLabel("Agent name").fill("Older name");
  await page.clock.runFor(650);
  await expect.poll(() => calls(page)).toBe(1);
  await editor.getByLabel("Agent name").fill("Latest name");
  await page.clock.runFor(650);
  await page.evaluate(() => (globalThis as typeof globalThis & { audit: { release: () => void } }).audit.release());
  await expect(editor.getByTestId("agent-save-state")).toHaveText("✓ Saved");
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  const row = page.getByTestId("agent-row").filter({ hasText: "Latest name" });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(editor.getByLabel("Agent name")).toHaveValue("Latest name");
});

test("Close keeps a failed draft open and retries it until saved", async ({ page }) => {
  const editor = await editPolisher(page);
  await fault(page, 2);
  await editor.getByLabel("Agent name").fill("Retried name");
  await expect(editor.getByTestId("agent-save-state")).toHaveText("Not saved");
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("alert")).toHaveText("Simulated disk failure");
  await expect.poll(() => calls(page)).toBe(2);
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("agent-row").filter({ hasText: "Retried name" })).toHaveCount(1);
});

test("leaving a failed draft retains it separately from another agent", async ({ page }) => {
  const editor = await editPolisher(page);
  await fault(page, 1000);
  await editor.getByLabel("Agent name").fill("Recovered Polisher");
  await expect(editor.getByTestId("agent-save-state")).toHaveText("Not saved");
  await page.getByTestId("agents-view-list").click();
  await page.getByTestId("agent-list").getByRole("button").filter({ hasText: "Continuity" }).click();
  await expect(editor.getByLabel("Agent name")).toHaveValue("Continuity");
  await expect.poll(() => calls(page)).toBeGreaterThanOrEqual(2);
  await page.getByTestId("agent-list").getByRole("button").filter({ hasText: "Prose Polisher" }).click();
  await expect(editor.getByLabel("Agent name")).toHaveValue("Recovered Polisher");
  await page.evaluate(() => { (globalThis as typeof globalThis & { audit: { failures: number } }).audit.failures = 0; });
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("agent-list")).toContainText("Recovered Polisher");
  await page.getByTestId("agent-list").getByRole("button").filter({ hasText: "Continuity" }).click();
  await expect(editor.getByLabel("Agent name")).toHaveValue("Continuity");
});

test("deleting waits for an earlier save and cannot recreate the agent", async ({ page }) => {
  const editor = await editPolisher(page);
  await fault(page, 0, true);
  await page.clock.install();
  await editor.getByLabel("Agent name").fill("Deleted Polisher");
  await page.clock.runFor(650);
  await expect.poll(() => calls(page)).toBe(1);
  await editor.getByRole("button", { name: "Delete Agent", exact: true }).click();
  await editor.getByRole("button", { name: "Click Again to Delete", exact: true }).click();
  await expect(editor).toBeVisible();
  await page.evaluate(() => (globalThis as typeof globalThis & { audit: { release: () => void } }).audit.release());
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("agent-table")).not.toContainText("Polisher");
});

for (const action of ["close", "delete"] as const) {
  test("finishing a pending " + action + " keeps a different agent's editor open", async ({ page }) => {
    const editor = await editPolisher(page);
    await fault(page, 0, true);
    await page.clock.install();
    await editor.getByLabel("Agent name").fill("Background Polisher");
    await page.clock.runFor(650);
    await expect.poll(() => calls(page)).toBe(1);
    if (action === "close") {
      await editor.getByRole("button", { name: "Close", exact: true }).click();
    } else {
      await editor.getByRole("button", { name: "Delete Agent", exact: true }).click();
      await editor.getByRole("button", { name: "Click Again to Delete", exact: true }).click();
    }
    await page.getByTestId("agents-view-list").click();
    await page.getByTestId("agent-list").getByRole("button").filter({ hasText: "Continuity" }).click();
    await expect(editor.getByLabel("Agent name")).toHaveValue("Continuity");
    await page.evaluate(() => (globalThis as typeof globalThis & { audit: { release: () => void } }).audit.release());
    const list = page.getByTestId("agent-list");
    if (action === "close") await expect(list).toContainText("Background Polisher");
    else await expect(list).not.toContainText("Polisher");
    await expect(editor.getByLabel("Agent name")).toHaveValue("Continuity");
  });
}
