// Click tests of slice 1b: saved connections (Settings → Connections), picked per session, the agents'
// connection, Test Connection, reasoning effort, and the old single connection becoming a profile.
// Author: CLAUDE, 2026-10-28.
import { expect, test, type Page } from "@playwright/test";
import { openSession, openTab, send } from "./ui.ts";

async function openSettings(page: Page) {
  await page.getByTestId("app-list").getByRole("button", { name: "Settings" }).click();
}
const editor = (page: Page) => page.getByLabel("Connection editor");
const sse = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;

test("Settings lists the connections; a key is asked only when needed", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await expect(page.getByTestId("connection-list")).toContainText("Offline test AIdefault");
  await expect(editor(page).getByLabel("AI provider")).toHaveValue("offline-test");
  await expect(page.getByPlaceholder("sk-…")).toHaveCount(0);
  await page.getByRole("button", { name: "New Connection" }).click();
  await expect(editor(page).getByLabel("AI provider")).toHaveValue("openai-compatible");
  await expect(page.getByPlaceholder("sk-…")).toBeVisible();
  await page.screenshot({ path: "e2e/.results/settings-connections.png" });
});

test("API key: saved when leaving the box, kept per address, and can be forgotten", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "New Connection" }).click();
  const status = page.getByTestId("key-status");
  await expect(status).toContainText("No key saved");

  await page.getByPlaceholder("sk-…").fill("sk-or-test-123");
  await expect(status).toContainText("not saved yet");
  await page.getByPlaceholder("e.g. deepseek/deepseek-chat").click(); // leave the key box
  await expect(status).toContainText("Key saved");

  // A different address has its own (empty) key; going back brings the saved one.
  const address = page.getByPlaceholder("https://openrouter.ai/api/v1");
  await address.fill("http://localhost:5001/v1");
  await address.blur();
  await expect(page.getByPlaceholder("sk-…")).toHaveValue("");
  await address.fill("");
  await expect(page.getByPlaceholder("sk-…")).toHaveValue("sk-or-test-123");

  await page.getByRole("button", { name: "Forget Key" }).click();
  await expect(status).toContainText("No key saved");
  await expect(page.getByPlaceholder("sk-…")).toHaveValue("");
});

test("a session picks its own connection; the reply says which one wrote it", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "New Connection" }).click();
  await editor(page).getByLabel("AI provider").selectOption("offline-test");
  await editor(page).getByLabel("Connection name").fill("Second offline");
  await page.getByRole("button", { name: "Create Connection" }).click();
  await expect(page.getByTestId("connection-list")).toContainText("Second offline");

  await openSession(page);
  await openTab(page, "prompt");
  await page.getByLabel("Story connection").selectOption({ label: "Second offline" });
  await expect(page.getByText("Sampling — Second offline")).toBeVisible();
  await send(page, "Hi");
  await page.getByTestId("receipt").click();
  await expect(page.getByTestId("reply-connection")).toHaveText("Second offline");
});

test("Test Connection, and the reasoning effort reaches the service", async ({ page }) => {
  let body: Record<string, unknown> | undefined;
  await page.route("**/chat/completions", async (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse("OK") });
  });
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "New Connection" }).click();
  await editor(page).getByLabel("Address").fill("https://nano-gpt.com/api/v1");
  await editor(page).getByLabel("Model").fill("z-ai/glm-5.3:thinking");
  await expect(editor(page).getByLabel("Connection name")).toHaveValue("nano-gpt.com — z-ai/glm-5.3:thinking");
  await editor(page).getByLabel("Reasoning effort").selectOption("high");
  await editor(page).locator("summary", { hasText: "Advanced" }).click();
  await editor(page).getByLabel("Extra request fields").fill('{ "provider": { "order": ["z-ai"] } }');
  await page.getByRole("button", { name: "Test Connection" }).click();
  await expect(page.getByTestId("test-result")).toContainText("Works. It answered “OK”");
  expect(body).toMatchObject({ model: "z-ai/glm-5.3:thinking", reasoning: { effort: "high" }, provider: { order: ["z-ai"] } });

  await editor(page).getByLabel("Extra request fields").fill("{ not json");
  await page.getByRole("button", { name: "Create Connection" }).click();
  await expect(editor(page).getByRole("alert")).toContainText("Not valid JSON");
  await page.screenshot({ path: "e2e/.results/connection-editor.png" });
});

test("a failing AI shows a readable error and keeps the user's message", async ({ page }) => {
  await page.route("**/chat/completions", (route) =>
    route.fulfill({ status: 401, body: '{"error":{"message":"Invalid API key"}}' }));
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "New Connection" }).click();
  await editor(page).getByLabel("Model").fill("some/model");
  await page.getByPlaceholder("sk-…").fill("sk-wrong");
  await page.getByRole("button", { name: "Create Connection" }).click();
  await page.getByRole("switch", { name: "Default connection" }).click();
  await expect(page.getByTestId("connection-list")).toContainText("OpenRouter — some/modeldefault");
  await openSession(page);
  await page.getByPlaceholder(/Write your message/).fill("Are you there?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert")).toContainText("401");
  await expect(page.getByRole("alert")).toContainText("Invalid API key");
  await expect(page.getByTestId("message").last()).toContainText("Are you there?");
});

test("the old single connection becomes a saved profile on first start", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("homunculus.connection", JSON.stringify({
    providerId: "openai-compatible", baseUrl: "https://nano-gpt.com/api/v1", model: "z-ai/glm-5.3:thinking", params: { temperature: 0.9 },
  })));
  await page.goto("/");
  await openSettings(page);
  await expect(page.getByTestId("connection-list")).toContainText("nano-gpt.com — z-ai/glm-5.3:thinkingdefault");
  await expect(page.getByLabel("Temperature value")).toHaveValue("0.9");
});

test("Defaults: the agents' connection and a tracker's own connection", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await page.getByTestId("settings-defaults").click();
  await expect(page.getByLabel("Default story connection")).toHaveValue("offline-test");
  await page.getByLabel("Default agents connection").selectOption({ label: "Offline test AI" });
  await page.getByLabel("Scene: World connection").selectOption({ label: "Offline test AI" });
  await page.screenshot({ path: "e2e/.results/settings-defaults.png" });
  await openSession(page);
  await openTab(page, "prompt");
  await expect(page.getByLabel("Agents connection")).toContainText("Default (Offline test AI)");
});

test("Browse: the service's models can be searched and picked; the model's thinking levels are shown", async ({ page }) => {
  let asked = "";
  await page.route("**/models?detailed=true", async (route) => {
    asked = route.request().url();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [
      { id: "z-ai/glm-5.3", name: "Z.ai: GLM 5.3", context_length: 200000, pricing: { prompt: "0.0000006", completion: "0.0000022" },
        reasoning: { supported_efforts: ["high", "medium", "low"] } },
      { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", context_length: 64000, pricing: { prompt: "0.0000003", completion: "0.0000012" } },
      { id: "meta/llama-free", name: "Llama (free)", context_length: 8000, pricing: { prompt: "0", completion: "0" } },
    ] }) });
  });
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "New Connection" }).click();
  await editor(page).getByRole("button", { name: "Browse" }).click();
  const picker = page.getByTestId("model-picker");
  await expect(picker).toContainText("3 models");
  expect(asked).toBe("https://openrouter.ai/api/v1/models?detailed=true");
  await picker.getByLabel("Search models").fill("glm");
  await expect(picker).toContainText("1 of 3 models");
  await expect(picker).toContainText("200k context · $0.60 in / $2.20 out per M tokens · thinks (high, medium, low)");
  await page.screenshot({ path: "e2e/.results/model-picker.png" });
  await picker.getByRole("option", { name: /GLM 5.3/ }).click();
  await expect(page.getByTestId("model-picker")).toHaveCount(0);
  await expect(editor(page).getByLabel("Model")).toHaveValue("z-ai/glm-5.3");
  await expect(editor(page).getByLabel("Connection name")).toHaveValue("OpenRouter — z-ai/glm-5.3");
  await expect(page.getByTestId("model-info")).toContainText("thinks (high, medium, low)");
  await expect(editor(page).getByLabel("Reasoning effort").locator("option", { hasText: "Max" })).toBeDisabled();

  // sort and filter
  await editor(page).getByRole("button", { name: "Browse" }).click();
  await page.getByLabel("Sort models").selectOption("cheap");
  const list = page.getByRole("listbox", { name: "Models" });
  await expect(list.getByRole("option").first()).toContainText("Llama (free)");
  await page.getByRole("switch", { name: "Thinking models only" }).click();
  await expect(list.getByRole("option")).toHaveCount(1);
});
