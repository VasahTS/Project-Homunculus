// Click tests of trackers made by the user + the Scene panel (proof of concept). Author: CLAUDE, 2026-10-27.
// The first tests build a tracker in the UI from nothing; the fields are just test data, any fields
// must work the same way. The last ones use the starter trackers (Homunculus v1's, installed as data).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openLibrary, openSession, send, setTracker } from "./ui.ts";

/** Builds a tracker with one text field (one value) and one bar per character, then goes back to the session. */
async function makeTracker(page: Page, name: string) {
  await openLibrary(page, "Trackers");
  await page.getByRole("button", { name: "New Tracker" }).click();
  await page.getByLabel("Tracker name").fill(name);
  await page.getByLabel("Field 1 name").fill("Place");
  await page.getByRole("button", { name: "Add Field" }).click();
  await page.getByLabel("Field 2 name").fill("Level");
  await page.getByLabel("Field 2 type").selectOption("meter");
  await page.getByLabel("Field 2 scope").selectOption("perCharacter");
  await page.getByLabel("Field 2 highest").fill("10");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await expect(page.getByTestId("tracker-list")).toContainText(name);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await openSession(page);
}

/** The shown value of a field (the Scene panel shows values as text; click to change). */
const fv = (scope: Locator, key: string) => scope.locator(`[data-field="${key}"] [data-testid="fv"]`).first();
/** Opens a person in the Scene list (29/10, like v1: everything about them opens right under their row). */
async function openPerson(page: Page, name: string) {
  const card = page.getByTestId("person-card").filter({ has: page.getByTestId("who-block").filter({ hasText: name }) }).first();
  if ((await card.getByTestId("who-block").getAttribute("aria-expanded")) !== "true") await card.getByTestId("who-block").click();
  const p = card.getByTestId("person-page");
  await expect(p).toBeVisible();
  return p;
}
/** Folds every open person back to one line. */
const back = async (page: Page) => {
  for (const b of await page.getByTestId("who-block").all()) if ((await b.getAttribute("aria-expanded")) === "true") await b.click();
  await expect(page.getByTestId("person-page")).toHaveCount(0);
};
const levelOf = (page: Page) => fv(page.getByTestId("person-page"), "level");
const num = async (l: Locator) => Number((await l.innerText()).split("/")[0]);
/** Clicks a value, types a new one, Enter. */
async function setValue(scope: Locator, label: string, value: string) {
  await scope.getByRole("button", { name: `Change ${label}` }).first().click();
  const box = scope.getByLabel(`${label} value`);
  await box.fill(value);
  await box.press("Enter");
}

test("a tracker made in the UI fills the Scene panel, follows swipes, and can be edited", async ({ page }) => {
  await page.goto("/");
  await makeTracker(page, "My values");

  // switch it on for this session
  await setTracker(page, "My values");
  const card = page.getByTestId("tracker-card");
  const nowBox = page.getByTestId("scene-header"); // single values sit in "Now" at the top
  const runs = page.getByTestId("run-log"); // how each tracker ran: all together at the end of the panel
  await expect(runs).toContainText("Not run at this message.");

  await send(page, "Hello");
  await expect(runs.getByTestId("run-status")).toHaveText("✓ updated");
  await expect(page.getByTestId("who-block").first()).toContainText("Lyra");
  await openPerson(page, "Lyra");
  const first = await num(levelOf(page));
  expect(first).toBeGreaterThanOrEqual(0);
  expect(first).toBeLessThanOrEqual(10);
  await back(page);
  const firstPlace = await fv(nowBox, "place").innerText();
  expect(firstPlace).not.toBe("");

  // a swipe gets its own values; flipping back shows the first ones again
  await page.getByRole("button", { name: "New Version" }).click();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("swipe-counter")).toHaveText("2/2");
  await expect(runs.getByTestId("run-status")).toHaveText("✓ updated");
  const secondPlace = await fv(nowBox, "place").innerText();
  expect(secondPlace).not.toBe(firstPlace);
  await page.getByRole("button", { name: "Previous version" }).click();
  await expect(fv(nowBox, "place")).toHaveText(firstPlace);

  // the user edits a value at this message: it sticks, is marked, and is per swipe
  const lyra = await openPerson(page, "Lyra");
  await setValue(lyra, "Level", "2");
  await expect(levelOf(page)).toHaveText("2/10");
  await expect(lyra.locator('[data-field="level"]')).toContainText("✎");
  await back(page);
  await page.getByRole("button", { name: "Next version" }).click();
  await expect(fv(nowBox, "place")).toHaveText(secondPlace);
  await page.getByRole("button", { name: "Previous version" }).click();
  await expect(fv(nowBox, "place")).toHaveText(firstPlace);
  await openPerson(page, "Lyra");
  await expect(levelOf(page)).toHaveText("2/10");

  // Esc cancels an edit; clicking the person again folds them
  await lyra.getByRole("button", { name: "Change Level" }).click();
  await lyra.getByLabel("Level value").fill("7");
  await page.keyboard.press("Escape");
  await expect(levelOf(page)).toHaveText("2/10");
  await back(page);

  // what the tracker did is visible
  await runs.getByTestId("run").locator("summary").click();
  await expect(runs.getByTestId("run")).toContainText('"level"');
  await page.screenshot({ path: "e2e/.results/scene-panel.png" });
});

test("the reply appears before the trackers finish", async ({ page }) => {
  // slow the offline tracker down, so the "updating" line stays long enough to be seen (it was flaky at 0.3 s)
  await page.addInitScript(() => { (globalThis as { __h2AgentDelayMs?: number }).__h2AgentDelayMs = 2000; });
  await page.goto("/");
  await makeTracker(page, "Slow values");
  await setTracker(page, "Slow values");
  await expect(page.getByTestId("run-log")).toBeVisible();
  await page.getByPlaceholder(/Write your message/).fill("Hi");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("turn-status")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("streaming")).toHaveCount(0);
  await expect(page.getByTestId("message")).toHaveCount(3);
  await expect(page.getByTestId("turn-status")).toHaveCount(0, { timeout: 10_000 });
});

test("editing a tracker keeps its saved values; deleting it switches it off everywhere", async ({ page }) => {
  await page.goto("/");
  await makeTracker(page, "Temp");
  await setTracker(page, "Temp");
  await send(page, "Hello");
  const place = await fv(page.getByTestId("scene-header"), "place").innerText();

  await page.getByTestId("scene").getByRole("button", { name: "Trackers" }).click();
  await page.getByTestId("tracker-toggles").getByRole("button", { name: "Edit Temp" }).click();
  await page.getByTestId("field-label").filter({ hasText: "Place" }).click(); // a field opens in place (D-026)
  await page.getByLabel("Field 1 name").fill("Location"); // rename the field: the value must stay
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("scene-header").getByRole("button", { name: "Change Location" })).toHaveText(place);

  await openLibrary(page, "Trackers");
  await page.getByTestId("tracker-list").getByText("Temp").click();
  await page.getByRole("button", { name: "Delete Tracker" }).click();
  await page.getByRole("button", { name: "Click Again to Delete" }).click();
  await expect(page.getByTestId("tracker-list")).not.toContainText("Temp");
  await openSession(page);
  await expect(page.getByTestId("tracker-card")).toHaveCount(0);
  await expect(page.getByTestId("scene").getByRole("switch", { name: "Temp" })).toHaveCount(0);
});

test("the tracker editor explains what is missing", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Trackers");
  await page.getByRole("button", { name: "New Tracker" }).click();
  await page.getByLabel("Field 1 type").selectOption("status");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("The tracker needs a name.");
  await expect(page.getByRole("alert")).toContainText("Field 1 needs a name.");
  await expect(page.getByRole("alert")).toContainText("write at least one option");
});

test("the starter trackers from Homunculus v1 are there, editable, with their field sets", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Trackers");
  const list = page.getByTestId("tracker-list");
  for (const name of ["Scene: Characters", "Scene: Plot", "Scene: World"]) await expect(list).toContainText(name);
  await list.getByText("Scene: Characters").click();
  const sets = page.getByLabel("Field set", { exact: true });
  await expect(sets.locator("option")).toHaveText(["Standard — default", "Fantasy", "Minimal", "Sci-fi", "Superpowers"]);
  await sets.selectOption({ label: "Fantasy" });
  const names = await page.getByTestId("field-label").allTextContents();
  for (const label of ["Race", "Class", "Level", "Health", "Mana", "Skill slots", "Skills", "Spells", "Equipment", "Conditions"]) expect(names).toContain(label);
  // how each field is shown in the Scene panel is data, editable here (Mood is field 10: the sets begin with Appearance)
  await page.getByTestId("field-label").filter({ hasText: /^Mood$/ }).click();
  await expect(page.getByRole("radiogroup", { name: "Field 10 show as" }).getByRole("radio", { name: "Highlight" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Field 10 icon")).toHaveValue("masks");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await openSession(page);
});

test("Scene: Characters with the Fantasy set and Scene: World fill the panel (people, sections, rows)", async ({ page }) => {
  await page.goto("/");
  const scene = page.getByTestId("scene");
  await setTracker(page, "Scene: Characters");
  await setTracker(page, "Scene: World");
  // the field set of a tracker is picked in the ⚙ Trackers menu
  await scene.getByRole("button", { name: "Trackers" }).click();
  await scene.getByLabel("Scene: Characters field set").selectOption({ label: "Fantasy" });
  await page.keyboard.press("Escape");
  await send(page, "We walk into the forest.");

  const chars = page.locator('[data-tracker="scene-characters"]');
  await expect(chars.getByTestId("run-status")).toHaveText("✓ updated");
  // "In the scene": one row per person; the first fill marks nothing as changed
  const who = page.getByTestId("who-block");
  await expect(who).toHaveCount(2); // Lyra and the user
  await expect(who.first()).toContainText("Lyra");
  await expect(who.nth(1)).toContainText("User");
  await expect(scene.locator(".q-chg")).toHaveCount(0);

  // a person's page: everything the tracker knows about them, in groups (C — Quiet)
  const lyra = await openPerson(page, "Lyra");
  await expect(lyra.locator('.q-kv [data-field="mood"]')).toHaveCount(1); // "Right now"
  await expect(lyra.locator('.q-tile[data-field="age"]')).toHaveCount(1);
  await expect(lyra.locator('[data-field="face"]')).toHaveCount(1);
  await expect(lyra.locator('.q-note [data-field="notes"]')).toHaveCount(1);
  expect(await num(fv(lyra, "mana"))).toBeGreaterThanOrEqual(0);
  await expect(lyra.locator('[data-field="spells"]').getByTestId("rows").locator(".row-line")).toHaveCount(1);
  await back(page);

  // when / where / weather sit in "Now" at the top
  await expect(fv(page.getByTestId("scene-header"), "clock")).not.toHaveText("");
  const world = page.locator('[data-tracker="scene-world"]');
  // the lists are tabs under "Now": Cast · … · Quests 1 · Items · Factions
  await page.getByTestId("scene-tab-scene-world-quests").click();
  await expect(world.getByTestId("run-status")).toHaveText("✓ updated");
  await expect(world.locator('[data-field="quests"]').getByTestId("rows").locator(".row-line")).toHaveCount(1);
  // edit a row cell: saved as the user's change at this message
  await setValue(world, "Quests 1 Title", "Reach the mill");
  await expect(world.locator('[data-field="quests"]')).toContainText("✎");
  await expect(world.getByRole("button", { name: "Change Quests 1 Title" })).toHaveText("Reach the mill");
  await page.screenshot({ path: "e2e/.results/starter-trackers.png", fullPage: true });

  // the Reply tab doesn't flood: the first values are folded per person, with a count
  await page.getByTestId("tab-reply").click();
  const changes = page.getByTestId("reply-changes");
  await expect(changes).toContainText("Scene: Characters");
  await expect(changes.locator(".chg-who", { hasText: "Lyra" })).toContainText("values filled in");
  await expect(changes.locator(".chg-who", { hasText: "Lyra" })).not.toHaveAttribute("open");
});
