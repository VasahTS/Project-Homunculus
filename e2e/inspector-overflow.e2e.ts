// CODEX: 0.3.1 regression coverage for clipped Prompt content and horizontally scrolling Scene sections.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary, openTab, send } from "./ui.ts";

test.use({ reducedMotion: "reduce" });

async function openLongStory(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("messages")).toBeVisible();
  await page.evaluate(async () => {
    const { store } = await (await import("/src/core-instance.ts" as string)).servicesReady;
    const c = (await store.getCharacter("starter-lyra"))!;
    const text = "A long imported card field with enough detail to exceed a narrow inspector. ".repeat(12);
    await store.saveCharacter({ ...c, name: "Lyra and the Keepers of the Northern Observatory", description: text, personality: text, scenario: text, exampleMessages: text, systemPrompt: text, postHistoryInstructions: text });
    await store.savePreset({ id: "wide-preset", name: "Narrative preset with a deliberately long imported display name", blocks: [] });
    await store.saveConnectionProfile({ id: "wide-profile", name: "Offline connection with a deliberately long model display name", providerId: "offline-test", model: "offline" });
    await store.saveStory({ id: "wide-story", name: "The Observatory and the Cartographer's Unfinished Expedition", narrator: { kind: "vault", id: "simple-narrator" }, cast: [{ characterId: c.id }], setup: { presetId: "wide-preset", connectionId: "wide-profile", agentConnectionId: "wide-profile" }, openings: ["The bell rings beneath the observatory."], createdAt: Date.now() });
  });
  // Creating a chat refreshes App's collection snapshot after the isolated storage fixture is seeded.
  await openLibrary(page, "Characters");
  await page.getByTestId("character-list").getByRole("button").first().click();
  await page.getByTestId("new-chat-with").click();
  await expect(page.getByTestId("messages")).toBeVisible();
  await openLibrary(page, "Stories");
  await page.getByTestId("vault-stories").getByRole("button", { name: "The Observatory and the Cartographer's Unfinished Expedition", exact: true }).click();
  await page.getByTestId("story-new-chat").click();
  await expect(page.getByTestId("messages")).toBeVisible();
  await openTab(page, "prompt");
}

async function horizontalOverflow(page: Page, selectors: string[]) {
  return page.locator(".inspector-body").evaluate((body, selectors) => {
    const edge = body.getBoundingClientRect();
    return [...body.querySelectorAll<HTMLElement>(selectors.join(","))].flatMap(el => {
      if (!el.getClientRects().length) return [];
      const r = el.getBoundingClientRect();
      return r.left < edge.left - 1 || r.right > edge.left + body.clientWidth + 1
        ? [{ element: el.className, width: r.width, available: body.clientWidth }]
        : [];
    });
  }, selectors);
}

for (const width of [1440, 1000, 620, 390]) {
  test(`Prompt fields, inherited setup and note stay inside the inspector at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLongStory(page);
    if (width === 1000) {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByTestId("settings-customize").click();
      await page.getByRole("radio", { name: "Observatory", exact: true }).click();
      await page.getByTestId("session-list").getByRole("button").first().click();
      await openTab(page, "prompt");
    }
    await page.getByTestId("authors-note").getByLabel("Author's Note").fill("<output_language>" + "unbroken-imported-instruction".repeat(15));
    await page.getByTestId("authors-note-toggle").click();
    if (width < 600) await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: test.info().outputPath(`prompt-${width}.png`) });
    await expect.poll(() => horizontalOverflow(page, [".pane", ".prompt-card-head", ".follows-story", ".setup-row", ".setup-v select", ".an-summary"])).toEqual([]);
    await expect.poll(() => page.getByTestId("prompt-pane").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await openTab(page, "character");
    await expect(page.getByTestId("prompt-character-field")).toHaveCount(6);
    const add = page.getByTestId("prompt-character").getByRole("button", { name: "Add Post-history instructions" });
    if (await add.isVisible()) await add.click();
    await expect(page.getByTestId("prompt-character").getByLabel("Post-history instructions")).toBeVisible();
    await expect.poll(() => horizontalOverflow(page, [".pc-sfield-head", ".pc-stext"])).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`prompt-${width}-edited.png`) });
  });
}

test("scrolling Scene section tabs keeps world values and run controls in the inspector", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/");
  await page.getByTestId("scene").getByRole("button", { name: "Select All" }).click();
  await page.getByTestId("scene-start").click();
  await send(page, "We reach the mill before sunset. Lyra checks the old map.");
  await page.getByTestId("scene-tab-scene-world-quests").click();
  await expect(page.getByTestId("run-status").filter({ hasText: "updated" })).toHaveCount(3);
  await page.screenshot({ path: test.info().outputPath("scene-quests.png") });
  await expect.poll(() => horizontalOverflow(page, [".pane", "[data-testid=scene-header]", ".q-tabs", ".q-runs"])).toEqual([]);
  await expect.poll(() => page.getByTestId("scene").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
});

// Daniel's imported presets (11/09): many blocks with long names and big token counts pushed the switches out of the
// Preset card, and a story chat's setup selects were cut. Nothing in the Prompt tab may pass the panel's edge.
for (const width of [1440, 1200]) {
  test(`a long imported preset and a story chat's setup stay inside the Prompt tab at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openLongStory(page);
    // Daniel's theme: a wide typewriter font
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByTestId("settings-customize").click();
    await page.getByRole("radio", { name: "Observatory", exact: true }).click();
    await page.evaluate(async () => {
      const { store } = await (await import("/src/core-instance.ts" as string)).servicesReady;
      const p = (await store.presets.get("wide-preset"))!;
      const names = ["Main Prompt", "Post-History Instructions For The Imported Narrator", "GM Mode Rules", "Instructions Realism", "Anti Omniscient NPCs", "NPC Instincts", "NPC Voice", "World Consequences", "Literal Narration", "{{authorPlan}}", "Enhance Definitions"];
      await store.savePreset({ ...p, blocks: [
        ...names.map((name, i) => ({ id: `b${i}`, name, content: "x ".repeat(400 + i * 900), enabled: i % 3 !== 0 })),
        { id: "chatHistory", name: "Chat History", marker: "chatHistory" },
      ] });
    });
    // a new chat of the story refreshes the app's copy of the presets
    await openLibrary(page, "Stories");
    await page.getByTestId("vault-stories").getByRole("button", { name: "The Observatory and the Cartographer's Unfinished Expedition", exact: true }).click();
    await page.getByTestId("story-new-chat").click();
    await expect(page.getByTestId("messages")).toBeVisible();
    await openTab(page, "prompt");
    await expect(page.getByTestId("prompt-preset")).toContainText("Enhance Definitions");
    await page.screenshot({ path: test.info().outputPath(`long-preset-${width}.png`) });
    const out = await page.getByTestId("prompt-pane").evaluate((pane) => {
      // the cards clip what passes their edge, so measure against the card body, not only the pane
      const body = pane.querySelector("[data-testid=prompt-card-preset] .prompt-card-body");
      const right = Math.min(pane.getBoundingClientRect().right, body ? body.getBoundingClientRect().right : Infinity);
      return [...pane.querySelectorAll<HTMLElement>("[data-testid=prompt-card-preset] .prompt-card-body *")].filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > right + 1)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`).slice(0, 10);
    });
    expect(out).toEqual([]);
  });
}
