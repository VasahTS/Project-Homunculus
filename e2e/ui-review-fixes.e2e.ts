// Regressions from the ui review, requested by Daniel. CODEX, 2026-11-02.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary, send } from "./ui.ts";

async function openSettings(page: Page) {
  await page.getByTestId("app-list").getByRole("button", { name: "Settings", exact: true }).click();
}

test("Quick Connection stays on screen after usage appears and while the window resizes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    // The offline AI reports synthetic usage only in this page; no provider or personal data.
    // @ts-expect-error Vite serves application modules at /src in browser tests.
    const { servicesReady } = await import("/src/core-instance.ts");
    const svc = await servicesReady;
    const original = svc.core.connections.stream.bind(svc.core.connections);
    svc.core.connections.stream = async function* (...args: unknown[]) {
      yield* original(...args); yield { usage: { tokensIn: 1000, tokensOut: 300 } };
    };
  });
  await send(page, "Hello");
  await expect(page.getByTestId("chat-usage")).toContainText("1.3k");
  await page.getByTestId("quick-connect").click();
  const menu = page.getByTestId("quick-connect-menu");
  for (const width of [1200, 900, 390, 1512]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(menu).toBeVisible();
    await expect.poll(async () => {
      const r = await menu.boundingBox();
      return !!r && r.x >= 8 && r.x + r.width <= width - 8 && r.y >= 0 && r.y + r.height <= 800;
    }).toBe(true);
    const firstConnection = menu.getByTestId("qc-profile").first();
    await expect(firstConnection).toContainText("Offline test AI");
    await firstConnection.click();
    await expect(menu.getByTestId("qc-model").first()).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("Trackers remembers a manual selection and keeps a new draft open", async ({ page }) => {
  await page.goto("/"); await openLibrary(page, "Trackers");
  await page.getByTestId("tracker-list").getByRole("button", { name: /Scene: World/ }).click();
  await openLibrary(page, "Kits"); await openLibrary(page, "Trackers");
  await expect(page.getByTestId("tracker-list").locator(".on")).toContainText("Scene: World");
  await page.getByRole("button", { name: "New Tracker", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByTestId("tracker-list").locator(".on")).toHaveCount(0);
});

test("Settings tabs use arrows, wrap, move focus and leave one Tab stop", async ({ page }) => {
  await page.goto("/"); await openSettings(page);
  const tabs = page.getByRole("tablist", { name: "Settings sections" });
  await page.getByTestId("settings-connections").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("settings-defaults")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("settings-defaults")).toBeFocused();
  await expect(tabs.locator('[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("settings-about")).toBeFocused();
  await expect(page.getByTestId("settings-about")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("settings-connections")).toBeFocused();
});

test("Advanced help becomes visible on mouse hover and keyboard focus", async ({ page }) => {
  await page.goto("/"); await openSettings(page);
  // Reduced motion makes this a hover test independent of page-entrance timing.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const summary = page.getByLabel("Connection editor").locator("summary", { hasText: "Advanced" });
  const help = summary.getByRole("button", { name: "Explain", exact: true });
  await summary.hover();
  await expect(help).toHaveCSS("opacity", "1");
  await help.hover();
  await expect(help).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0); await summary.focus(); await page.keyboard.press("Tab");
  await expect(help).toBeFocused();
  await expect(help).toHaveCSS("opacity", "1");
  await help.click(); await expect(help).toHaveAttribute("aria-expanded", "true");
});

test("Personas remembers the chosen saved item without replacing a new persona", async ({ page }) => {
  await page.goto("/"); await openLibrary(page, "Personas");
  const editor = page.getByLabel("Persona editor");
  for (const name of ["Review Alpha", "Review Omega"]) {
    await page.getByRole("button", { name: "New Persona", exact: true }).click();
    await editor.getByLabel("Name", { exact: true }).fill(name);
    await editor.getByRole("button", { name: "Create Persona", exact: true }).click();
    await expect(page.getByTestId("persona-list")).toContainText(name);
  }
  await page.getByTestId("persona-list").getByRole("button", { name: "Review Alpha", exact: true }).click();
  await page.getByTestId("persona-list").getByRole("button", { name: "Review Omega", exact: true }).click();
  await openLibrary(page, "Kits"); await openLibrary(page, "Personas");
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("Review Omega");
  await page.getByRole("button", { name: "New Persona", exact: true }).click();
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("");
});

test("Presets remembers a saved copy without replacing an unsaved new preset", async ({ page }) => {
  await page.goto("/"); await openLibrary(page, "Presets");
  const editor = page.getByLabel("Preset editor");
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Duplicate", exact: true }).click();
  await editor.getByLabel("Preset name", { exact: true }).fill("Review Copy");
  await editor.getByRole("button", { name: "Create Preset", exact: true }).click();
  await expect(page.getByTestId("preset-list")).toContainText("Review Copy");
  await page.getByTestId("preset-list").getByRole("button", { name: "Homunculus Default", exact: true }).click();
  await page.getByTestId("preset-list").getByRole("button", { name: "Review Copy", exact: true }).click();
  await openLibrary(page, "Kits"); await openLibrary(page, "Presets");
  await expect(editor.getByLabel("Preset name", { exact: true })).toHaveValue("Review Copy");
  await page.getByRole("button", { name: "New Preset", exact: true }).click();
  await editor.getByLabel("Preset name", { exact: true }).fill("Unsaved review draft");
  await expect(editor.getByLabel("Preset name", { exact: true })).toHaveValue("Unsaved review draft");
  await expect(editor.getByRole("button", { name: "Create Preset", exact: true })).toBeVisible();
});

test("Assistant's shared Quick Connection keeps its size and remains inside a narrow window", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  const trigger = page.getByTestId("assistant-model");
  await trigger.click();
  const menu = page.getByTestId("quick-connect-menu");
  await expect(menu).toBeVisible();
  await expect.poll(async () => Math.round((await menu.boundingBox())?.width ?? 0)).toBe(640);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect.poll(async () => {
    const r = await menu.boundingBox(); return !!r && r.x >= 8 && r.x + r.width <= 382;
  }).toBe(true);
  await menu.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(page.getByTestId("connection-list")).toBeVisible();
});
