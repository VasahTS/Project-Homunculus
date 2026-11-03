// The opt-in helper uses existing model controls, a separate model, and visible usage/local tool traces. CODEX.
import { expect, test } from "@playwright/test";
test("configure a helper, retrieve a large card and show both model usages", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    // @ts-expect-error In-memory browser preview services.
    const { servicesReady } = await import("/src/core-instance.ts"); const svc = await servicesReady;
    await svc.store.saveCharacter({ id: "helper-rin", name: "Helper Rin", description: "Cartographer. " + "x".repeat(12000) });
    let mains = 0, helpers = 0;
    svc.core.connections.stream = async function* (conn: { model: string }, _m: unknown, _s: AbortSignal, req: { rich: Array<{ content: string }> }) {
      if (conn.model === "retrieval-test") {
        yield { usage: { tokensIn: 200, tokensOut: 40, cost: 0.001 } };
        if (!helpers++) yield { toolCalls: [{ id: "helper-read", name: "read", arguments: '{"id":"character:helper-rin","fields":["description"]}' }] };
        else yield "Helper Rin is a cartographer. Only the first 6,000 characters were read; more remain.";
      } else {
        yield { usage: { tokensIn: 300, tokensOut: 50, cost: 0.01 } };
        if (!mains++) yield { toolCalls: [{ id: "delegate", name: "consult_library", arguments: '{"task":"Read character:helper-rin and briefly identify their profession."}' }] };
        else { if (JSON.stringify(req.rich).includes("x".repeat(1000))) throw Error("Worker source leaked to principal"); yield "Helper Rin is a cartographer."; }
      }
    };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  await page.getByTestId("assistant-customize").click();
  await expect(page.getByLabel("Use a tool helper", { exact: true })).not.toBeChecked();
  await page.getByLabel("Use a tool helper", { exact: true }).click();
  await page.getByLabel("Helper Connection", { exact: true }).selectOption("offline-test");
  await page.getByLabel("Helper Model", { exact: true }).fill("retrieval-test");
  await page.getByLabel("Helper reading calls per consultation").fill("4");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("Message to the Assistant").fill("What is Helper Rin's profession?"); await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-reply")).toContainText("Helper Rin is a cartographer.");
  await expect(page.getByTestId("assistant-usage")).toContainText("Helper retrieval-test: 2 calls");
  await page.getByTestId("assistant-steps").click();
  await expect(page.getByText("Helper reading steps (1)")).toBeVisible();
  await page.getByText("Helper reading steps (1)").click();
  await expect(page.getByText("Read Helper Rin (description)", { exact: true })).toBeVisible();
  await page.getByText("Read Helper Rin (description)", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 768 });
  if (await page.getByTestId("assistant-details").isVisible()) await page.getByRole("button", { name: "Hide details", exact: true }).click();
  await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
  const scroll = page.locator(".asst-scroll");
  expect(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("helper-narrow.png") });
  await expect(page.getByTestId("assistant-usage")).toContainText("$0.0020");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("button", { name: "Show Sidebar", exact: true }).click();
  await page.getByTestId("assistant-customize").click();
  await expect(page.getByLabel("Helper Model", { exact: true })).toHaveValue("retrieval-test");
  await expect(page.getByLabel("Helper reading calls per consultation")).toHaveValue("4");
  await page.getByTestId("cust-usage").click(); await expect(page.getByTestId("assistant-customize-page")).toContainText("$0.022");
});
