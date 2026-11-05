// Memory v2 (D-083): Catch up, layers, smart recall's receipt, and "Messages to show". Browser preview + offline test AI.
// Author: CLAUDE, 2026-11-04.
import { expect, test } from "@playwright/test";
import { memoryOn, newChatWith, openLibrary, openSession, openTab, send } from "./ui.ts";

test("memory v2: catch up an old chat, merge chapters, and smart recall shows what it chose", async ({ page }) => {
  await page.goto("/");
  await newChatWith(page);
  for (const t of ["We reach the mill.", "Lyra hides the silver locket.", "We eat stew.", "It rains.", "We sleep.", "Morning comes."]) await send(page, t);
  const mem = await memoryOn(page, { every: 4, keep: 1 });
  await mem.getByTestId("memory-fold-layers").getByRole("button", { name: /Merging old chapters/ }).click();
  await mem.getByLabel("Summaries before merging").fill("3");
  await mem.getByLabel("Summaries before merging").press("Enter");
  await mem.getByLabel("Summaries merged into one").fill("2");
  await mem.getByLabel("Summaries merged into one").press("Enter");
  await expect(mem.getByTestId("memory-fold-layers")).toContainText("Chapter 4, Chapters 1–2 merge");
  // 13 messages, the newest kept: 12 wait → 3 chapters
  await expect(mem.getByTestId("memory-next")).toContainText("#1–#12");
  await expect(mem.getByTestId("memory-catch-up")).toHaveText("Catch Up (3)");
  await mem.getByTestId("memory-catch-up").click();
  await expect(mem.getByTestId("memory-progress")).toContainText("Done: 3 chapters written.");
  // 3 chapters with "more than 3" → no merge yet; one more chapter would merge the oldest two
  await expect(mem.getByTestId("memory-chapter")).toHaveCount(3);

  await mem.getByTestId("memory-tab-recall").click();
  await mem.getByTestId("memory-mode-smart").click();
  await expect(mem.getByRole("radio", { name: "Agents' model", exact: true })).toHaveAttribute("aria-checked", "true");
  await mem.getByRole("radio", { name: "Custom model", exact: true }).click();
  await mem.getByRole("textbox", { name: "Decision model" }).fill("typesafe/jev-latest");
  await mem.getByRole("textbox", { name: "Decision model" }).press("Enter");
  await expect(mem.getByRole("textbox", { name: "Decision model" })).toHaveValue("typesafe/jev-latest");
  await mem.getByLabel("What you might say next").fill("Where is the silver locket?");
  await mem.getByTestId("memory-test").click();
  await expect(mem.getByTestId("memory-try-result")).toContainText("typesafe/jev-latest");
  await expect(mem.getByTestId("memory-try-result").locator("li").last()).toContainText("newest, always");
  await page.setViewportSize({ width: 1280, height: 2000 });
  await page.waitForTimeout(500);
  await mem.screenshot({ path: "e2e/.results/memory-tab-recall.png" });
  await page.setViewportSize({ width: 1200, height: 800 });
  await send(page, "Where is the silver locket?");
  await openTab(page, "reply");
  const receipt = page.getByTestId("reply-memory");
  await expect(receipt).toContainText("Memory · smart");
  await expect(receipt).toContainText("typesafe/jev-latest");
  await expect(receipt.getByTestId("reply-memory-picked").locator("li").last()).toContainText("latest, always");
  await page.waitForTimeout(800);
  await page.getByTestId("reply-pane").screenshot({ path: "e2e/.results/memory-v2-reply.png" });

  await openTab(page, "memory");
  await mem.getByTestId("memory-tab-chapters").click();
  await mem.getByTestId("memory-fold-auto").getByRole("button", { name: /Automatic chapters/ }).click();
  await page.setViewportSize({ width: 1280, height: 2000 });
  await page.waitForTimeout(800);
  await mem.screenshot({ path: "e2e/.results/memory-tab-chapters.png" });
  await mem.getByTestId("memory-tab-guide").click();
  await page.waitForTimeout(500);
  await mem.screenshot({ path: "e2e/.results/memory-tab-guide.png" });
});

test("messages to show: a long chat draws only the newest, Show earlier brings the rest", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).last().click();
  await page.getByTestId("settings-chat").click();
  await page.getByLabel("Messages to show").selectOption("10");
  await newChatWith(page);
  for (const t of ["One.", "Two.", "Three.", "Four.", "Five.", "Six."]) await send(page, t);
  await expect(page.getByTestId("message")).toHaveCount(10);
  await expect(page.getByTestId("show-earlier")).toContainText("3 earlier");
  await page.getByTestId("show-earlier").screenshot({ path: "e2e/.results/show-earlier.png" });
  await page.getByTestId("show-earlier").getByRole("button", { name: /Show 3 earlier messages/ }).click();
  await expect(page.getByTestId("message")).toHaveCount(13);
  await expect(page.getByTestId("show-earlier")).toHaveCount(0);
});

// CODEX, 2026-11-05. Model selection goes through saved connections and ordinary chat requests.
test("recall accepts custom models and non-streamed Jev on another provider", async ({ page }) => {
  const calls: Array<{ model: string; auth: string | undefined; stream: boolean }> = [];
  await page.route("https://recall.example/v1/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/models")) {
      await route.fulfill({ json: { data: [{ id: "catalog-recall", name: "Catalog recall" }] } });
      return;
    }
    expect(new URL(route.request().url()).pathname).toBe("/v1/chat/completions");
    const body = route.request().postDataJSON();
    calls.push({ model: body.model, auth: route.request().headers().authorization, stream: body.stream });
    const text = body.messages.map((m: { content: string }) => m.content).join("\n");
    const ids = [...text.matchAll(/^### (\S+)/gm)].map((m) => m[1]!);
    const answer = JSON.stringify(Object.fromEntries(ids.map((id) => [id, 0.9])));
    await route.fulfill({ json: { choices: [{ message: { content: answer }, finish_reason: "stop" }] } });
  });
  await page.goto("/");
  await newChatWith(page);
  await send(page, "Lyra finds a locket.");
  const mem = await memoryOn(page, { keep: 0 });
  await mem.getByTestId("memory-write-now").click();
  await expect(mem.getByTestId("memory-chapter")).toHaveCount(1);
  await send(page, "We leave the mill.");
  await mem.getByTestId("memory-write-now").click();
  await expect(mem.getByTestId("memory-chapter")).toHaveCount(2);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByTestId("settings-connections").click();
  await page.getByRole("button", { name: "New Connection" }).click();
  const editor = page.getByLabel("Connection editor");
  await editor.getByLabel("Connection name").fill("Fixture recall");
  await editor.getByLabel("Address", { exact: true }).fill("https://recall.example/v1");
  await editor.getByLabel("API key", { exact: true }).fill("fixture-recall-key");
  await editor.getByLabel("Model", { exact: true }).fill("typesafe/jev-latest");
  await editor.getByRole("switch", { name: "Streaming", exact: true }).click();
  await editor.getByRole("button", { name: "Create Connection" }).click();
  await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeVisible();

  await openSession(page);
  await openTab(page, "memory");
  await mem.getByTestId("memory-tab-recall").click();
  await mem.getByTestId("memory-mode-smart").click();
  await mem.getByRole("radio", { name: "Custom model", exact: true }).click();
  await mem.getByLabel("Decision model connection").selectOption({ label: "Fixture recall" });
  const model = mem.getByLabel("Decision model", { exact: true });
  await expect(model).toHaveValue("");
  await expect(model).toHaveAttribute("placeholder", "typesafe/jev-latest");
  await mem.getByRole("button", { name: "Browse models" }).click();
  await mem.getByRole("option", { name: /Catalog recall/ }).click();
  await expect(model).toHaveValue("catalog-recall");
  await mem.getByTestId("memory-decider").screenshot({ path: test.info().outputPath("custom-recall.png") });
  await mem.getByLabel("What you might say next").fill("Where is the locket?");
  await mem.getByTestId("memory-test").click();
  await expect(mem.getByTestId("memory-try-result")).toContainText("catalog-recall");
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((c) => c.model === "catalog-recall" && c.auth === "Bearer fixture-recall-key" && c.stream === false)).toBe(true);

  await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    const save = svc.store.saveSession.bind(svc.store);
    svc.store.saveSession = async (session: { setup: { memory?: { deciderModel?: string } } }) => {
      if (session.setup.memory?.deciderModel === "") await new Promise((resolve) => setTimeout(resolve, 350));
      return save(session);
    };
  });
  await model.fill("");
  await model.press("Enter");
  await mem.getByTestId("memory-test").click();
  await expect(mem.getByTestId("memory-try-result")).toContainText("typesafe/jev-latest");
  expect(calls.at(-1)?.model).toBe("typesafe/jev-latest");
  expect(calls.at(-1)?.stream).toBe(false);
  await openLibrary(page, "Characters");
  await openSession(page);
  await openTab(page, "memory");
  await mem.getByTestId("memory-tab-recall").click();
  await expect(model).toHaveValue("");
  await expect(mem.getByLabel("Decision model connection")).toHaveValue(/.+/);
  await mem.getByLabel("Decision model connection").selectOption("offline-test");
  await expect(model).toHaveValue("");
});
