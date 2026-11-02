// Click tests of Settings → Customize (D-075): looks, Undo, tweaks, motion, Edit colors, Extra CSS, import. CLAUDE, 2026-11-01.
import { expect, test, type Page } from "@playwright/test";

const rootVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const rootData = (page: Page, key: string) => page.evaluate((k) => document.documentElement.dataset[k], key);

async function openCustomize(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("settings-customize").click();
  await expect(page.getByTestId("settings-customize-body")).toBeVisible();
}

test("Mono is the default look; picking another applies it at once and Undo brings Mono back", async ({ page }) => {
  await openCustomize(page);
  expect(await rootData(page, "theme")).toBe("mono");
  await expect(page.getByRole("radio", { name: "Mono" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Quiet" }).click();
  expect(await rootData(page, "theme")).toBe("quiet");
  expect(await rootVar(page, "--round")).not.toBe("0");
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  expect(await rootData(page, "theme")).toBe("mono");
  expect(await rootVar(page, "--round")).toBe("0");
});

test("tweaks: accent with readable text on it, story size; Reset puts the look's own back", async ({ page }) => {
  await openCustomize(page);
  await page.getByRole("radio", { name: "#e2474c" }).click();
  expect(await rootVar(page, "--accent")).toBe("#e2474c");
  expect(await rootVar(page, "--accent-ink")).toBe("#0d0d0d");
  await page.getByRole("slider", { name: "Story text size" }).fill("18");
  expect(await rootVar(page, "--size-prose")).toBe("18px");
  await page.getByRole("button", { name: "Reset Mono" }).click();
  expect(await rootVar(page, "--accent")).toBe("#f2f2f2");
  expect(await rootVar(page, "--size-prose")).toBe("16.5px");
});

test("motion: off and speed reach the whole window", async ({ page }) => {
  await openCustomize(page);
  expect(await rootData(page, "motion")).toBe("on");
  await page.getByRole("radio", { name: "Calm" }).click();
  expect(await rootVar(page, "--motion-k")).toBe("1.35");
  await page.getByRole("switch", { name: "Animations" }).click();
  expect(await rootData(page, "motion")).toBe("off");
});

test("Edit colors on a built-in look makes an editable copy; Extra CSS applies; the copy can be deleted", async ({ page }) => {
  await openCustomize(page);
  await page.getByTestId("edit-colors").locator("summary").click();
  const win = page.getByTestId("token-window").getByRole("textbox", { name: "Window" });
  await win.fill("#202020");
  await win.press("Enter");
  await expect(page.getByRole("radio", { name: "Mono (edited)" })).toHaveAttribute("aria-checked", "true");
  expect(await rootVar(page, "--window")).toBe("#202020");
  // Mono itself is unchanged
  await page.getByRole("radio", { name: "Mono", exact: true }).click();
  expect(await rootVar(page, "--window")).toBe("#0d0d0d");
  await page.getByRole("radio", { name: "Mono (edited)" }).click();
  await page.getByTestId("extra-css").locator("summary").click();
  await page.getByRole("textbox", { name: "Extra CSS" }).fill('[data-region="sidebar"] { outline: 3px solid rgb(255, 0, 0); }');
  await page.getByRole("textbox", { name: "Extra CSS" }).blur();
  await expect(page.locator('[data-region="sidebar"]')).toHaveCSS("outline-color", "rgb(255, 0, 0)");
  // Ctrl+Shift+0 turns it off until restart
  await page.keyboard.press("Control+Shift+0");
  await expect(page.locator('[data-region="sidebar"]')).not.toHaveCSS("outline-color", "rgb(255, 0, 0)");
  await page.keyboard.press("Control+Shift+0");
  await page.getByRole("button", { name: "More for Mono (edited)" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("radio", { name: "Mono (edited)" })).toHaveCount(0);
  expect(await rootData(page, "theme")).toBe("mono");
});

test("Import Look reads a look file and switches to it; a broken file says why", async ({ page }) => {
  await openCustomize(page);
  const look = { format: "homunculus-look@1", name: "Paper", tokens: { window: "#f4f1ea", label: "#1f1b16", round: "0.5" }, css: "" };
  await page.getByLabel("Look file").setInputFiles({ name: "paper.look.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(look)) });
  await expect(page.getByRole("radio", { name: "Paper" })).toHaveAttribute("aria-checked", "true");
  expect(await rootVar(page, "--window")).toBe("#f4f1ea");
  await page.getByLabel("Look file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{ nope") });
  await expect(page.getByText("Couldn't import this look")).toBeVisible();
});

test("a dialogue color can be taken back: Theme's returns to the look's own color (Daniel, 11/02)", async ({ page }) => {
  await openCustomize(page);
  const q = page.getByTestId("settings-messages-body").locator("q.dlg").first();
  const before = await q.evaluate((el) => getComputedStyle(el).color);
  await page.getByLabel("Dialogue color", { exact: true }).fill("#ff0000");
  await expect(q).toHaveCSS("color", "rgb(255, 0, 0)");
  await page.getByTestId("settings-messages-body").getByRole("button", { name: "Theme's" }).first().click();
  await expect(q).toHaveCSS("color", before);
});

test("a look's ⋯ menu is whole (not cut by its group) and only one is open at a time", async ({ page }) => {
  await openCustomize(page);
  await page.getByRole("button", { name: "More for Mono" }).click();
  const exp = page.getByRole("menuitem", { name: "Export" });
  await expect(exp).toBeVisible();
  const box = (await exp.boundingBox())!;
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.textContent ?? "", { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(hit).toBe("Export");
  await page.getByRole("button", { name: "More for Graphite" }).click();
  await expect(page.getByRole("menu")).toHaveCount(1);
});

test("the selected card's ring is drawn above its picture", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("place-list").getByRole("button", { name: "Characters" }).click();
  const card = page.getByTestId("character-list").getByRole("button").first();
  await card.click();
  const ring = await card.evaluate((el) => { const s = getComputedStyle(el, "::after"); return { z: s.zIndex, o: s.opacity, pos: s.position }; });
  expect(ring).toEqual({ z: "2", o: "1", pos: "absolute" });
});
