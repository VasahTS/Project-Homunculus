// CODEX: Memory has its own grid hierarchy; verify per-chat model labels and all expanded views stay inside it.
import { expect, test, type Page } from "@playwright/test";
import { newChatWith, openLibrary, openTab, send } from "./ui.ts";

test.use({ reducedMotion: "reduce" });
const LONG_MODEL = "deepseek/" + "a-long-summary-model-name-with-provider-metadata-".repeat(5);

async function prepare(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByTestId("messages")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByTestId("settings-customize").click();
  await page.getByRole("radio", { name: "Observatory", exact: true }).click();
  await page.evaluate(async model => {
    const { store } = await (await import("/src/core-instance.ts" as string)).servicesReady;
    for (const [id, name, summaryModel] of [["short-memory", "Short memory model", "offline"], ["standard-memory", "Provider memory model", "deepseek/deepseek-v3.2-speciale:free"], ["long-memory", "Long memory model", model]]) {
      await store.saveStory({ id, name, narrator: { kind: "vault", id: "simple-narrator" }, cast: [{ characterId: "starter-lyra" }],
        openings: ["The ranger studies the map."], createdAt: Date.now(), setup: { memory: { on: true, mode: "smart", summaryModel, decider: "jev", deciderModel: model } } });
    }
  }, LONG_MODEL);
  await newChatWith(page); // refresh the App collection snapshot after fixture storage writes
}

async function storyMemory(page: Page, name: string) {
  await openLibrary(page, "Stories");
  await page.getByTestId("vault-stories").getByRole("button", { name, exact: true }).click();
  await page.getByTestId("story-new-chat").click();
  await expect(page.getByTestId("messages")).toBeVisible();
  await openTab(page, "memory");
  await expect(page.getByTestId("memory-head")).toContainText("from the story");
}

async function fits(page: Page) {
  // D-105: Memory is a window of its own; everything must fit inside it
  const overflow = await page.getByTestId("memory-window").evaluate(body => {
    const left = body.getBoundingClientRect().left;
    const right = left + body.clientWidth;
    const selectors = [".mem-pane", ".mem-head", ".mem-stats", ".mem-stat", ".mem-head-foot", ".mem-head-foot button", ".mem-tabs", ".mem-view", ".mem-card", ".mem-empty", ".mem-fold", ".mem-fold-head", ".mem-fold-head b", ".mem-fold-value", ".mem-fold-chev", ".mem-fold-body", ".mem-setting", ".mem-setting-label", ".mem-setting-value", ".mem-setting-value > *", ".mem-writer-field", ".mem-writer-model", ".mem-writer-model > *", ".mem-choice", ".mem-choice-body", ".mem-terms", ".mem-terms dd", ".memory-chapter", ".memory-chapter-head", ".memory-chapter-title", ".memory-chapter-body", ".memory-chapter-body > *", ".mem-peek", ".mem-peek pre"];
    return [...body.querySelectorAll<HTMLElement>(selectors.join(","))].flatMap(el => {
      if (!el.getClientRects().length) return [];
      const r = el.getBoundingClientRect();
      return r.left < left - 1 || r.right > right + 1 ? [{ element: el.className, width: r.width, available: body.clientWidth }] : [];
    });
  });
  expect(overflow).toEqual([]);
  expect(await page.getByTestId("memory-pane").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
}

for (const width of [1440, 1000, 620, 390]) {
  test(`Memory contains short and long per-story model summaries at ${width}px`, async ({ page }) => {
    await prepare(page);
    if (width < 600) await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
    for (const name of ["Short memory model", "Provider memory model", "Long memory model"]) {
      // Navigate while the sidebar is available, then inspect the same panel at the requested size.
      await page.setViewportSize({ width: 1440, height: 1000 });
      if (width < 600) await page.getByRole("button", { name: "Show Sidebar", exact: true }).click();
      await storyMemory(page, name);
      if (width < 600) await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
      await page.setViewportSize({ width, height: 1000 });
      await openTab(page, "memory"); // a click outside (Hide Sidebar) closes the window
      await expect(page.getByTestId("memory-stats")).toContainText("0chapters");
      await page.getByTestId("memory-pane").screenshot({ path: test.info().outputPath(`${name.replace(/ .*/, "").toLowerCase()}-${width}.png`) });
      await fits(page);
    }
  });
}

test("a chapter's long title, summary editor and prompt preview stay inside Memory", async ({ page }) => {
  await prepare(page);
  await storyMemory(page, "Long memory model");
  for (const text of ["We reach the mill.", "Lyra finds the map.", "We stop beside the door."]) await send(page, text);
  await openTab(page, "memory");
  await page.getByTestId("memory-fold-auto").getByRole("button").first().click();
  await page.getByLabel("Newest messages kept word for word").fill("1");
  await page.getByLabel("Newest messages kept word for word").press("Enter");
  await expect(page.getByTestId("memory-write-own")).toBeEnabled();
  await page.getByTestId("memory-write-own").click();
  const title = "A very long chapter title " + "unbroken".repeat(30);
  await page.getByLabel("Your chapter's title").fill(title);
  await page.getByLabel("Your chapter's summary").fill("Lyra found the map near the mill. " + "unbroken".repeat(60));
  await page.getByRole("button", { name: "Save Chapter", exact: true }).click();
  await expect(page.getByTestId("memory-chapter")).toHaveCount(1);
  await page.getByTestId("memory-chapter").getByRole("button").first().click();
  await page.getByTestId("memory-peek").click();
  await page.setViewportSize({ width: 390, height: 1000 });
  await fits(page);
  await expect(page.getByLabel("Chapter 1 title")).toHaveValue(title);
  await page.getByTestId("memory-pane").screenshot({ path: test.info().outputPath("chapter-editor-390.png") });
});

for (const width of [1440, 390]) {
  test(`Memory expanded settings, Recall and Guide fit at ${width}px`, async ({ page }) => {
    await prepare(page);
    await storyMemory(page, "Long memory model");
    if (width < 600) await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
    await page.setViewportSize({ width, height: 1000 });
    await openTab(page, "memory");
    for (const id of ["auto", "layers", "placement", "writer"]) {
      await page.getByTestId(`memory-fold-${id}`).getByRole("button").first().click();
      await fits(page);
      await page.getByTestId(`memory-fold-${id}`).screenshot({ path: test.info().outputPath(`${id}-${width}.png`) });
    }
    await expect(page.getByLabel("Summary model")).toHaveValue(LONG_MODEL);
    await page.getByTestId("memory-tab-recall").click();
    await expect(page.getByRole("textbox", { name: "Decision model", exact: true })).toHaveValue(LONG_MODEL);
    await fits(page);
    await page.getByTestId("memory-pane").screenshot({ path: test.info().outputPath(`recall-${width}.png`) });
    await page.getByTestId("memory-tab-guide").click();
    await fits(page);
    await page.getByTestId("memory-pane").screenshot({ path: test.info().outputPath(`guide-${width}.png`) });
  });
}
