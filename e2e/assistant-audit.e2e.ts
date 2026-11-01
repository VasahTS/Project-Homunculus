// Assistant audit: a blocked fake request makes navigation deterministic. Author: CODEX, 2026-11-01.
import { expect, test } from "@playwright/test";

test("A7: switching chats during a reply must leave the selected chat on screen", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  const input = page.getByRole("textbox", { name: "Message to the Assistant" });
  await input.fill("Make a world tracker");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Done (offline test AI)");
  await expect(page.getByTestId("assistant-send")).toBeVisible();
  await page.getByTestId("assistant-new").click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = "/src/core-instance.ts";
    const { servicesReady } = await import(/* @vite-ignore */ modulePath);
    const svc = await servicesReady;
    const original = svc.core.connections.stream.bind(svc.core.connections);
    const gate = new Promise<void>((resolve) => { (window as unknown as { releaseAuditAnswer: () => void }).releaseAuditAnswer = resolve; });
    svc.core.connections.stream = async function* (...args: unknown[]) {
      await gate;
      yield* original(...args);
    };
  });
  await input.fill("Make a narrator");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await page.getByTestId("assistant-chats").getByRole("button", { name: /Make a world tracker/ }).click();
  await expect(page.locator(".asst-title")).toHaveText("Make a world tracker");
  await page.evaluate(() => (window as unknown as { releaseAuditAnswer: () => void }).releaseAuditAnswer());
  await expect(page.getByTestId("assistant-send")).toBeVisible();
  await expect(page.getByTestId("assistant-chats").locator(".side-item.on")).toContainText("Make a world tracker");
  await expect(page.locator(".asst-title")).toHaveText("Make a world tracker");
  await input.fill("Continue the selected chat");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-send")).toBeVisible();
  await expect(page.getByTestId("assistant-messages")).toContainText("Continue the selected chat");
  await page.getByTestId("assistant-chats").getByRole("button", { name: /Make a narrator/ }).click();
  await expect(page.locator(".asst-title")).toHaveText("Make a narrator");
  await expect(page.getByTestId("assistant-messages")).not.toContainText("Continue the selected chat");
  await expect(page.getByTestId("assistant-reply").last()).toContainText("Offline test AI here");
});

for (const kind of ["character", "lorebook"] as const) test(`A1: approve an imported ${kind} from its existing result card`, async ({ page }) => {
  await page.goto("/");
  const before = await page.evaluate(async (kind) => {
    const corePath = "/src/core-instance.ts", toolsPath = "/src/assistant/tools.ts", enginePath = "/src/assistant/engine.ts";
    const { servicesReady } = await import(/* @vite-ignore */ corePath);
    const { runTool } = await import(/* @vite-ignore */ toolsPath);
    const { saveChat } = await import(/* @vite-ignore */ enginePath);
    const { store } = await servicesReady;
    const counts = { characters: (await store.listCharacters()).length, books: (await store.lorebooks.list()).length };
    const text = JSON.stringify({ spec: "chara_card_v2", data: { name: "Audit import", description: "Imported intact", personality: "", scenario: "", first_mes: "Hello", mes_example: "", character_book: { name: "Embedded audit", entries: [{ keys: ["place"], content: "Canon", enabled: true, insertion_order: 1, position: "before_char" }] } } });
    const ctx = { store, saveNew: false, newId: () => crypto.randomUUID(), files: new Map([["file", { name: "card.json", text, mime: "application/json" }]]), images: new Map(), results: [], guides: new Set(), remember: async () => {} };
    await runTool("import_file", JSON.stringify({ file: "file", as: kind }), ctx);
    await saveChat(store, { id: "import-approval", title: "Approve import", summary: "", createdAt: 1, updatedAt: 1, messages: [{ id: "reply", role: "assistant", text: "Prepared", reasoning: "", attachments: [], steps: [], rounds: [], results: ctx.results, createdAt: 1 }] });
    if ((await store.listCharacters()).length !== counts.characters || (await store.lorebooks.list()).length !== counts.books) throw new Error("Import wrote before approval");
    return counts;
  }, kind);
  // An ordinary offline reply refreshes Recents after seeding the isolated proposal.
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Show my prepared import");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-send")).toBeVisible();
  await page.getByTestId("assistant-chats").getByRole("button", { name: /Approve import/ }).click();
  const card = page.getByTestId("assistant-result").first();
  await expect(card).toContainText(/audit/i);
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card).toContainText("saved");
  const after = await page.evaluate(async () => {
    const path = "/src/core-instance.ts";
    const { servicesReady } = await import(/* @vite-ignore */ path);
    const { store } = await servicesReady;
    const characters = await store.listCharacters(), books = await store.lorebooks.list();
    return { characters: characters.length, books: books.length, imported: characters.find((c: { name: string }) => c.name === "Audit import")?.lorebookIds };
  });
  expect(after.characters).toBe(before.characters + (kind === "character" ? 1 : 0));
  expect(after.books).toBe(before.books + 1);
  if (kind === "character") expect(after.imported).toHaveLength(1);
});
