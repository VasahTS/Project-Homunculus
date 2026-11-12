// Click test: export an Assistant preset and an assistant, import them back (D-118). Author: CLAUDE, 2026-11-12.
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Assistant → Customize: export a preset and an assistant, import them as copies", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  await page.getByTestId("assistant-customize").click();

  // a preset: export it, change it here, import the file → a copy beside it
  await page.getByTestId("cust-presets").click();
  await page.getByRole("textbox", { name: "Preset name" }).fill("Dark Fantasy");
  const [presetDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("cust-export-preset").click()]);
  expect(presetDownload.suggestedFilename()).toBe("Dark-Fantasy.h2.json");
  const presetFile = await presetDownload.path();
  await expect(page.getByTestId("cust-share-status")).toContainText("Exported Dark Fantasy");
  await page.getByRole("textbox", { name: "How I like things written" }).fill("Changed after export.");
  await page.getByLabel("Import presets and assistants from a file").setInputFiles({ name: "Dark-Fantasy.h2.json", mimeType: "application/json", buffer: await readFile(presetFile) });
  await expect(page.getByTestId("cust-share-status")).toHaveText("Added Dark Fantasy (imported)");
  await expect(page.getByRole("textbox", { name: "Preset name" })).toHaveValue("Dark Fantasy (imported)");
  await expect(page.getByTestId("cust-preset")).toHaveCount(2);

  // the same file again: the original changed since export, so it comes in as another copy
  await page.getByLabel("Import presets and assistants from a file").setInputFiles({ name: "Dark-Fantasy.h2.json", mimeType: "application/json", buffer: await readFile(presetFile) });
  await expect(page.getByTestId("cust-preset")).toHaveCount(3);

  // an assistant: export the default one; importing it unchanged adds nothing
  await page.getByTestId("cust-assistants").click();
  const [asstDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("cust-export-assistant").click()]);
  const asstFile = await asstDownload.path();
  const json = JSON.parse(await readFile(asstFile, "utf8"));
  expect(json).toMatchObject({ format: "homunculus-assistant", presets: [] });
  expect(json.assistants[0]).toMatchObject({ connectionId: null, model: "" });
  await page.getByLabel("Import assistants and presets from a file").setInputFiles({ name: "a.h2.json", mimeType: "application/json", buffer: await readFile(asstFile) });
  await expect(page.getByTestId("cust-share-status")).toHaveText("Nothing new · 1 was already here");

  // a file that isn't one of these says so
  await page.getByLabel("Import assistants and presets from a file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("{\"format\":\"homunculus-bundle\"}") });
  await expect(page.getByTestId("cust-share-status")).toContainText("not an assistant or preset file");
});
