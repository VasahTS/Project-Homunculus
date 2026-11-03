// DataCat description regression with synthetic card content and no network. CODEX, 2026-11-03.
import { expect, test } from "@playwright/test";

test("DataCat: V2 description appears in details, imports into Characters and survives reopening", async ({ page }) => {
  await page.addInitScript(() => {
    const ok = (data: unknown) => ({ status: 200, finalUrl: "", contentType: "application/json", cfMitigated: false, text: JSON.stringify(data) });
    (globalThis as { __h2FakeCardSites?: unknown }).__h2FakeCardSites = { async request(r: { url: string }) {
      const u = new URL(r.url);
      if (u.host === "api.chub.ai") return ok({ data: { count: 0, nodes: [] } });
      if (u.pathname === "/api/liberator/identify") return ok({ success: true, sessionToken: "test" });
      if (u.pathname === "/api/tags/faceted") return ok({ tags: [] });
      if (u.pathname === "/api/characters/recent-public") return ok({ characters: [{ characterId: "dc-map", name: "Map Keeper", description: "Public biography.", totalTokens: 1500 }], totalCount: 1, hasMore: false });
      if (u.pathname === "/api/characters/dc-map") return ok({ character: {
        name: "Map Keeper", personality: null, description: "<p>Public biography.</p>", downloadsDisabled: false,
        chara_card_v2_json: { spec: "chara_card_v2", spec_version: "2.0", data: {
          name: "Map Keeper", description: "Maintains the town's maps.\nCarries a green notebook.", personality: "Methodical.",
          first_mes: "Which road?", alternate_greetings: ["A new route?"], creator_notes: "A creator's introduction.",
        } },
      } });
      throw new Error(`Unexpected fixture request: ${r.url}`);
    } };
  });
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  const browser = page.getByTestId("card-browser");
  await browser.getByTestId("cb-source").click();
  await page.getByRole("menuitemradio", { name: /DataCat/ }).click();
  await page.getByTestId("cb-adult").getByRole("button", { name: "Continue" }).click();
  await browser.getByTestId("cb-card").click();
  const sheet = page.getByTestId("cb-sheet");
  await expect(sheet.getByText("Description", { exact: true })).toBeVisible();
  await expect(sheet).toContainText("Maintains the town's maps.");
  await expect(sheet).toContainText("Carries a green notebook.");
  await expect(sheet).toContainText("A creator's introduction.");
  await sheet.getByTestId("cb-add").click();
  await expect(page.locator(".notice")).toContainText("Added Map Keeper to Characters");
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  await page.getByRole("searchbox", { name: "Search characters" }).or(page.getByRole("textbox", { name: "Search characters" })).fill("Map Keeper");
  await page.getByTestId("character-list").getByRole("button", { name: "Map Keeper" }).click();
  await page.getByTestId("character-sheet").getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByLabel("Character editor");
  await expect(editor.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("Maintains the town's maps.\nCarries a green notebook.");
  await page.getByTestId("place-list").getByRole("button", { name: "Card Browser" }).click();
  await browser.getByTestId("cb-card").click();
  await expect(page.getByTestId("cb-sheet")).toContainText("Maintains the town's maps.");
  await page.getByTestId("cb-open").click();
  await page.getByTestId("character-sheet").getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Character editor").getByRole("textbox", { name: "Description", exact: true })).toHaveValue("Maintains the town's maps.\nCarries a green notebook.");
});
