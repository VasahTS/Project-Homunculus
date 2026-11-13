// D-121: a library of many cards stays light (a friend on Linux with 1000 cards: 14 GB, 30 s to open Characters, a crash
// while scrolling); importing shows its progress; the highlight sits under the selected item. CLAUDE, 2026-11-13.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { bytesToBase64, setTextChunks, solidPng, utf8 } from "../packages/st-cards/src/index.ts";
import { openLibrary } from "./ui.ts";

const card = (name: string, w = 20, h = 30, rgb: [number, number, number] = [120, 60, 200]) => Buffer.from(setTextChunks(solidPng(w, h, rgb), {
  chara: bytesToBase64(utf8.encode(JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: {
    name, description: "A test card.", personality: "", scenario: "", first_mes: "Hello.", alternate_greetings: [], mes_example: "",
    creator_notes: "", system_prompt: "", post_history_instructions: "", tags: ["test"], creator: "", character_version: "", extensions: {} } }))),
}));

function files(n: number): string[] {
  const dir = join(tmpdir(), `h2-big-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return Array.from({ length: n }, (_, i) => {
    const f = join(dir, `card-${i}.png`);
    writeFileSync(f, card(`Card ${String(i).padStart(4, "0")}`, 20, 30, [(i * 37) % 255, (i * 91) % 255, 90]));
    return f;
  });
}

test("many cards: importing shows how far it is, and Characters builds only the cards on screen", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await openLibrary(page, "Characters");
  await page.getByTestId("import-input").setInputFiles(files(100));
  await expect(page.getByTestId("work-progress")).toContainText("Importing cards");
  await expect(page.getByTestId("notice")).toContainText("Imported 100 character(s): Card 0000, Card 0001, Card 0002, Card 0003, Card 0004 and 95 more", { timeout: 90_000 });
  await expect(page.getByTestId("work-progress")).toHaveCount(0);

  // 101 characters (Lyra + 100), but only a few screens of them are built
  const list = page.getByTestId("character-list");
  await expect(page.locator(".collection-heading")).toContainText("101 characters");
  const built = await list.locator(".gallery-card").count();
  expect(built).toBeGreaterThan(4);
  expect(built).toBeLessThan(80);
  // scrolling to the end builds the cards there (and lets go of the first ones)
  const names = () => list.locator(".gallery-card").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  const before = await names();
  await page.locator(".gallery-grid").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect.poll(async () => (await names()).filter((n) => !before.includes(n)).length).toBeGreaterThan(0);
  expect((await names()).length).toBeLessThan(80);
  expect(await names()).not.toContain(before[0]);
  // a search still finds any card
  await page.getByLabel("Search characters").fill("Card 0042");
  await expect(list.getByRole("button")).toHaveCount(1);
});

test("a big picture: lists show a small copy, the sheet the whole picture", async ({ page }) => {
  await page.goto("/");
  await openLibrary(page, "Characters");
  const dir = join(tmpdir(), `h2-pic-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, "Mira.png");
  writeFileSync(f, card("Mira", 600, 900, [200, 40, 40])); // ~1.6 MB, like a real card picture
  await page.getByTestId("import-input").setInputFiles(f);
  await expect(page.getByTestId("notice")).toContainText("Imported 1 character(s): Mira");
  const listSrc = await page.getByTestId("character-list").getByRole("button", { name: "Mira" }).locator("img").getAttribute("src");
  expect(listSrc!.length).toBeLessThan(200_000);
  const sheet = page.getByTestId("character-sheet").locator("img.vs-pic");
  await expect.poll(async () => (await sheet.getAttribute("src"))?.length ?? 0).toBeGreaterThan(1_000_000);
});

test("the highlight sits under the selected item after switching places (D-121)", async ({ page }) => {
  await page.goto("/");
  const aligned = async (pill: string, item: string) => {
    await page.waitForTimeout(1300); // every arrival animation has ended
    const [p, i] = await Promise.all([page.locator(pill).first().boundingBox(), page.locator(item).first().boundingBox()]);
    expect(p && i).toBeTruthy();
    expect(Math.abs(p!.y - i!.y)).toBeLessThan(1.5);
    expect(Math.abs(p!.x - i!.x)).toBeLessThan(1.5);
    expect(Math.abs(p!.height - i!.height)).toBeLessThan(1.5);
  };
  await openLibrary(page, "Characters");
  await aligned(".side-pill", ".side-item.on");
  await page.getByRole("button", { name: "Settings" }).click();
  await aligned(".side-pill", ".side-item.on");
  await openLibrary(page, "Lorebooks");
  await aligned(".side-pill", ".side-item.on");
});
