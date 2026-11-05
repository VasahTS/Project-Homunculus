// ST-style display sorting across collections, with an isolated preview database. Author: CODEX, 2026-11-03.
import { expect, test, type Page } from "@playwright/test";
import { newChatWith, openLibrary } from "./ui.ts";

async function seed(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    const data = [{ id: "z", name: "Sort Zulu", year: 2020, text: "x".repeat(100), fav: true }, { id: "a", name: "Sort Alpha", year: 2023, text: "short", fav: false }, { id: "b", name: "Sort Bravo", year: 2021, text: "x".repeat(1000), fav: false }];
    for (const x of data) {
      await svc.store.saveCharacter({ id: `sort-${x.id}`, name: x.name, description: x.text, firstMessages: ["Hello."], original: { create_date: `${x.year}-01-01T00:00:00Z`, data: { extensions: { fav: x.fav } } } });
      await svc.store.saveStory({ id: `story-${x.id}`, name: x.name, description: x.text, narrator: { kind: "vault", id: "simple-narrator" }, createdAt: Date.UTC(x.year, 0, 1) });
      await svc.store.savePersona({ id: `persona-${x.id}`, name: x.name, description: x.text });
      await svc.store.saveAgentConfig({ id: `agent-${x.id}`, name: x.name, prompt: x.text, output: "rewrite", order: x.id === "z" ? 0 : x.id === "a" ? 1 : 2, triggers: [{ on: "manual" }] });
    }
    for (const [key, count, day] of [["z", 1, 4], ["a", 3, 1]] as const) for (let i = 0; i < count; i++) {
      await svc.store.saveSession({ id: `sort-chat-${key}-${i}`, title: "Synthetic sorting chat", cast: [{ characterId: `sort-${key}` }], createdAt: Date.UTC(2025, 0, day) });
      await svc.store.saveSession({ id: `story-chat-${key}-${i}`, title: "Synthetic story chat", storyId: `story-${key}`, createdAt: Date.UTC(2025, 0, day) });
    }
    await svc.store.setGlobalRegex([
      { id: "rx-z", name: "Zulu script", find: "/ZZZ/g", replace: "z", targets: ["ai"], on: true },
      { id: "rx-a", name: "Alpha script", find: "/AAA/g", replace: "a", targets: ["ai"], on: true },
    ]);
  });
  await newChatWith(page);
}
const characterNames = (page: Page) => page.getByTestId("character-list").getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));

test("Characters offers the ST sort choices and combines them with search, selection and persistent view preferences", async ({ page }) => {
  await seed(page); await openLibrary(page, "Characters");
  await page.getByLabel("Search characters", { exact: true }).fill("Sort ");
  const sort = page.getByRole("combobox", { name: "Sort characters", exact: true });
  await expect(sort).toBeVisible();
  await expect(sort.locator("option")).toHaveText(["A-Z", "Z-A", "Newest", "Oldest", "Date added", "Favorites", "Recent", "Most chats", "Least chats", "Most tokens", "Least tokens", "Random"]);
  const orders = { az: ["Sort Alpha", "Sort Bravo", "Sort Zulu"], za: ["Sort Zulu", "Sort Bravo", "Sort Alpha"], newest: ["Sort Alpha", "Sort Bravo", "Sort Zulu"], oldest: ["Sort Zulu", "Sort Bravo", "Sort Alpha"], added: ["Sort Bravo", "Sort Alpha", "Sort Zulu"], favorites: ["Sort Zulu", "Sort Alpha", "Sort Bravo"], recent: ["Sort Zulu", "Sort Alpha", "Sort Bravo"], mostChats: ["Sort Alpha", "Sort Zulu", "Sort Bravo"], leastChats: ["Sort Bravo", "Sort Zulu", "Sort Alpha"], mostTokens: ["Sort Bravo", "Sort Zulu", "Sort Alpha"], leastTokens: ["Sort Alpha", "Sort Zulu", "Sort Bravo"] };
  for (const [mode, names] of Object.entries(orders)) { await sort.selectOption(mode); await expect.poll(() => characterNames(page)).toEqual(names); }
  await sort.selectOption("random"); const random = await characterNames(page);
  await page.getByTestId("character-list").getByRole("button", { name: "Sort Alpha", exact: true }).click();
  await expect.poll(() => characterNames(page)).toEqual(random);
  await page.getByLabel("Search characters", { exact: true }).fill("Sort Bravo");
  await page.getByLabel("Search characters", { exact: true }).fill("Sort ");
  await expect.poll(() => characterNames(page)).toEqual(random);
  await sort.selectOption("za"); await page.getByTestId("size-s").click(); await page.getByTestId("view-everything").click();
  await expect(sort).toHaveValue("za");
  await page.screenshot({ path: "e2e/.results/collection-sort-characters.png" });
  await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  const sortBox = await sort.boundingBox(); expect(sortBox!.x + sortBox!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "e2e/.results/collection-sort-mobile.png" });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.getByRole("button", { name: "Show Sidebar", exact: true }).click();
  await page.reload(); await openLibrary(page, "Characters"); await expect(sort).toHaveValue("za");
});

test("Stories sorts by creation, addition, recency, chats and token estimate independently of Characters", async ({ page }) => {
  await seed(page); await page.getByTestId("place-list").getByRole("button", { name: "Stories", exact: true }).click();
  await page.getByLabel("Search stories", { exact: true }).fill("Sort ");
  const sort = page.getByRole("combobox", { name: "Sort stories", exact: true });
  for (const [mode, expected] of Object.entries({ az: ["Sort Alpha", "Sort Bravo", "Sort Zulu"], added: ["Sort Bravo", "Sort Alpha", "Sort Zulu"], newest: ["Sort Alpha", "Sort Bravo", "Sort Zulu"], mostChats: ["Sort Alpha", "Sort Zulu", "Sort Bravo"], leastTokens: ["Sort Alpha", "Sort Zulu", "Sort Bravo"], recent: ["Sort Zulu", "Sort Alpha", "Sort Bravo"] })) {
    await sort.selectOption(mode);
    await expect.poll(() => page.getByTestId("vault-stories").getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).toEqual(expected);
  }
  await sort.selectOption("za");
  await page.screenshot({ path: "e2e/.results/collection-sort-stories.png" });
  await openLibrary(page, "Characters");
  await expect(page.getByRole("combobox", { name: "Sort characters", exact: true })).toHaveValue("recent");
});

test("Library sorting works across categories and leaves agent execution order untouched", async ({ page }) => {
  await seed(page); await openLibrary(page, "Personas");
  await page.getByLabel("Search personas", { exact: true }).fill("Sort ");
  const sort = page.getByRole("combobox", { name: "Sort personas", exact: true });
  const editorName = page.getByLabel("Persona editor").getByLabel("Name", { exact: true });
  await expect(editorName).toBeVisible(); const selectedName = await editorName.inputValue();
  await sort.selectOption("za"); await expect(editorName).toHaveValue(selectedName);
  await expect.poll(() => page.getByTestId("persona-list").locator("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).toEqual(["Sort Zulu", "Sort Bravo", "Sort Alpha"]);
  await openLibrary(page, "Agents"); await page.getByLabel("Search agents", { exact: true }).fill("Sort ");
  await page.getByRole("combobox", { name: "Sort agents", exact: true }).selectOption("mostTokens");
  await expect.poll(() => page.getByTestId("agent-table").locator(".ag-cell-name").allTextContents()).toEqual(["Sort Bravo", "Sort Zulu", "Sort Alpha"]);
  const orders = await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    return (await svc.store.agentConfigs.list()).filter((a: { id: string }) => a.id.startsWith("agent-")).sort((a: { order: number }, b: { order: number }) => a.order - b.order).map((a: { name: string }) => a.name);
  });
  expect(orders).toEqual(["Sort Zulu", "Sort Alpha", "Sort Bravo"]);
  await openLibrary(page, "Personas"); await expect(sort).toHaveValue("za");
});

test("sorting regex display never changes execution order when editing a script", async ({ page }) => {
  await seed(page); await openLibrary(page, "Regex");
  const sort = page.getByRole("combobox", { name: "Sort regex", exact: true });
  await expect(sort).toHaveValue("original"); await sort.selectOption("az");
  const rows = page.getByTestId("regex-script");
  await expect(rows.first()).toContainText("Alpha script");
  await expect(page.getByTestId("regex-page")).toContainText("Sorting affects this list only.");
  await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(0);
  await rows.first().getByRole("switch").click();
  const saved = await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    return (await svc.store.getGlobalRegex()).map((s: { id: string; on: boolean }) => ({ id: s.id, on: s.on }));
  });
  expect(saved).toEqual([{ id: "rx-z", on: true }, { id: "rx-a", on: false }]);
  await sort.selectOption("original"); await expect(rows.first()).toContainText("Zulu script");
  await expect(page.getByRole("button", { name: "Reorder Zulu script", exact: true })).toBeVisible();
});


test("every other Library category exposes sorting and preserves its selected editor", async ({ page }) => {
  await seed(page);
  for (const [label, kind, list] of [
    ["Kits", "kits", "vault-kits"], ["Narrators", "narrators", "vault-narrators"], ["NPCs", "npcs", "vault-npcs"],
    ["Lorebooks", "lorebooks", "lorebook-list"], ["Presets", "presets", "preset-list"], ["Trackers", "trackers", "tracker-list"], ["Trash", "trash", "trash-list"],
  ]) {
    await openLibrary(page, label as "Kits");
    const sort = page.getByRole("combobox", { name: `Sort ${kind}`, exact: true });
    await expect(sort).toBeVisible(); await sort.selectOption("za"); await expect(sort).toHaveValue("za");
    await expect(page.getByTestId(list!)).toHaveCount(1);
    if (kind === "narrators") {
      const names = await page.getByTestId(list!).getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
      expect(names).toEqual([...names].sort((a, b) => new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare(b, a)));
    }
  }
  await openLibrary(page, "Personas");
  await page.getByRole("button", { name: "Hide Sidebar", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  const sort = page.getByRole("combobox", { name: "Sort personas", exact: true });
  const box = await sort.boundingBox(); expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await page.screenshot({ path: "e2e/.results/collection-sort-library.png" });
});
