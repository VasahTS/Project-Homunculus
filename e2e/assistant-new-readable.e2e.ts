// D-152: a new item waiting for the user reads as fields and lorebook entries, not raw JSON. CLAUDE, 2026-11-25.
import { expect, test } from "@playwright/test";

test("a new lorebook opens readable: entries with keywords, text and badges; Edit changes them before saving", async ({ page }) => {
  await page.goto("/"); await page.getByTestId("message").first().waitFor();
  await page.evaluate(async () => {
    const corePath = "/src/core-instance.ts";
    const { servicesReady } = await import(/* @vite-ignore */ corePath);
    const svc = await servicesReady;
    let round = 0;
    svc.core.connections.stream = async function* () {
      if (round++ === 0) yield { toolCalls: [{ id: "lore-new", name: "create", arguments: JSON.stringify({ kind: "lorebook", data: {
        name: "Hanazono Elementary", description: "The school and its rooms.",
        entries: [
          { title: "Hanazono Elementary", keys: ["hanazono", "school"], content: "A private elementary school on a hill.\nUniforms are navy." },
          { title: "Classroom", keys: ["classroom", "homeroom", "class 4-b", "4-b"], content: "Class 4-B is on the second floor.", position: "atDepth", depth: 2 },
          { title: "School Rules", keys: [], constant: true, content: "No running in the halls.", probability: 50 },
        ],
      } }) }] };
      else yield "Want me to attach this to a card?";
    };
  });
  await page.getByRole("tab", { name: "Assistant", exact: true }).click();
  // new items wait for the user (Customize → New Items → Ask me first)
  await page.getByTestId("assistant-customize").click();
  await page.locator("label.cust-field", { hasText: "New items" }).locator("select").selectOption("ask");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("Message to the Assistant").fill("Make a lorebook for the school."); await page.getByTestId("assistant-send").click();
  const card = page.getByTestId("assistant-result").last();
  await expect(card).toContainText("New lorebook · 3 entries · waiting for you");
  await expect(page.getByTestId("assistant-stop")).toHaveCount(0);

  await card.getByTestId("assistant-see-new").click();
  // no JSON on screen: labels, rows, chips
  await expect(card.locator("pre")).toHaveCount(0);
  await expect(card).not.toContainText('"keys"');
  await expect(card).toContainText("The school and its rooms.");
  const rows = card.getByTestId("assistant-lore-entry");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("Classroom");
  await expect(rows.nth(1).locator(".lore-key")).toHaveText(["classroom", "homeroom", "class 4-b", "4-b"]);
  await expect(rows.nth(2)).toContainText("Always On");
  // closed: the first line of the text; open: the whole text and what differs from the defaults
  await expect(rows.nth(1)).toContainText("Class 4-B is on the second floor.");
  await rows.nth(1).getByRole("button").first().click();
  await expect(rows.nth(1).locator(".lore-badge")).toContainText(["In the chat · 2 back · System"]);
  await rows.nth(2).getByRole("button").first().click();
  await expect(rows.nth(2).locator(".lore-badge")).toContainText(["50%"]);

  // the raw data is still one click away
  await card.getByRole("button", { name: "View Raw" }).click();
  await expect(card.locator("pre")).toContainText('"class 4-b"');
  await card.getByRole("button", { name: "Readable View" }).click();

  // Edit: title, keywords and text of an entry
  await card.getByTestId("assistant-edit-new").click();
  await expect(card.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await card.getByLabel("Keywords").nth(1).fill("classroom, 4-b, sensei's desk");
  await card.getByLabel("Text").nth(1).fill("Class 4-B, second floor, by the stairs.");
  await card.getByRole("button", { name: "Save Edits" }).click();
  await expect(rows.nth(1).locator(".lore-key")).toHaveText(["classroom", "4-b", "sensei's desk"]);

  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card).toContainText("saved");
  const saved = await page.evaluate(async () => {
    const path = "/src/core-instance.ts";
    const { servicesReady } = await import(/* @vite-ignore */ path);
    const { store } = await servicesReady;
    const book = (await store.lorebooks.list()).find((b: { name: string }) => b.name === "Hanazono Elementary");
    const full = book && await store.lorebooks.get(book.id);
    return full?.entries.map((e: { title: string; keys: string[]; content: string }) => ({ title: e.title, keys: e.keys, content: e.content }));
  });
  expect(saved?.[1]).toEqual({ title: "Classroom", keys: ["classroom", "4-b", "sensei's desk"], content: "Class 4-B, second floor, by the stairs." });
});
