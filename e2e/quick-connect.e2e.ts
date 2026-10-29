// Click tests of Quick Connection (from Homunculus v1 classic-quick-connect.js). Author: CLAUDE, 2026-10-29.
import { expect, test, type Page } from "@playwright/test";
import { openSession, openTab } from "./ui.ts";

const editor = (page: Page) => page.getByLabel("Connection editor");

async function mockModels(page: Page) {
  await page.route("**/models?detailed=true", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [
      { id: "z-ai/glm-5.3", name: "Z.ai: GLM 5.3", context_length: 200000 },
      { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", context_length: 64000 },
      { id: "meta/llama-free", name: "Llama (free)", context_length: 8000 },
    ] }) });
  });
}

async function makeOpenRouter(page: Page) {
  await page.getByTestId("app-list").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "New Connection" }).click();
  await editor(page).getByLabel("Connection name").fill("Router");
  await page.getByRole("button", { name: "Create Connection" }).click();
  await expect(page.getByTestId("connection-list")).toContainText("Router");
}

test("Quick Connection: pick a connection for this chat, then one of its models (saved into the connection)", async ({ page }) => {
  await mockModels(page);
  await page.goto("/");
  await makeOpenRouter(page);
  await openSession(page);

  await page.getByTestId("quick-connect").click();
  const menu = page.getByTestId("quick-connect-menu");
  await expect(menu.getByTestId("qc-profile")).toHaveCount(2);
  await expect(menu.getByTestId("qc-profile").filter({ hasText: "Offline test AI" }).getByRole("img", { name: "In use in this chat" })).toBeVisible();

  // a connection: used in this chat at once, its models listed
  await menu.getByTestId("qc-profile").filter({ hasText: "Router" }).click();
  await expect(menu.getByTestId("qc-model")).toHaveCount(3);
  await expect(menu.getByTestId("qc-profile").filter({ hasText: "Router" }).getByRole("img", { name: "In use in this chat" })).toBeVisible();

  // pin one: it goes to the top under "Pinned"
  await menu.getByRole("button", { name: "Pin DeepSeek Chat to the top" }).click();
  await expect(menu.getByTestId("qc-models")).toContainText("Pinned");
  await expect(menu.getByTestId("qc-model").first()).toContainText("DeepSeek Chat");

  // search and pick: the menu closes, the model is saved into the connection
  await menu.getByLabel("Search or type a model ID").fill("glm");
  await expect(menu.getByTestId("qc-model")).toHaveCount(1);
  await page.screenshot({ path: "e2e/.results/quick-connect.png" });
  await menu.getByTitle("z-ai/glm-5.3").click();
  await expect(menu).toHaveCount(0);
  await openTab(page, "prompt");
  await expect(page.getByLabel("Story connection")).toHaveValue(/.+/);
  await expect(page.getByLabel("Story connection").locator("option:checked")).toHaveText("Router");
  await expect(page.getByTestId("story-connection")).toContainText("z-ai/glm-5.3");

  // a model that is not listed: type its ID and press Enter
  await page.getByTestId("quick-connect").click();
  await page.getByTestId("quick-connect-menu").getByLabel("Search or type a model ID").fill("my/custom-model");
  await expect(page.getByTestId("qc-use-typed")).toContainText("Use “my/custom-model”");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("quick-connect-menu")).toHaveCount(0);
  await expect(page.getByTestId("story-connection")).toContainText("my/custom-model");

  // Escape closes; Manage opens Settings → Connections
  await page.getByTestId("quick-connect").click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("quick-connect-menu")).toHaveCount(0);
  await page.getByTestId("quick-connect").click();
  await page.getByTestId("quick-connect-menu").getByRole("button", { name: "Manage" }).click();
  await expect(page.getByTestId("connection-list")).toBeVisible();
});
