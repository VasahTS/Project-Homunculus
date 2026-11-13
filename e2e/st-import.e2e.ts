// D-128: Settings → Library → Import from SillyTavern — pick a folder, see what was found, import, report, undo. CLAUDE, 2026-11-13.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";

const J = JSON.stringify;
const jsonl = (...rows: unknown[]) => rows.map((r) => J(r)).join("\n");
const card = (name: string, extensions: Record<string, unknown> = {}) => J({ spec: "chara_card_v2", spec_version: "2.0", data: { name, description: `${name}, a test card.`, personality: "", scenario: "", first_mes: `Hi from ${name}`, mes_example: "", tags: [], extensions } });
const msg = (name: string, is_user: boolean, mes: string, send_date: string, more: Record<string, unknown> = {}) => ({ name, is_user, is_system: false, send_date, mes, extra: {}, ...more });

function stFolder(): string {
  const root = join(tmpdir(), `h2-st-${process.pid}-${Date.now()}`, "default-user");
  const put = (path: string, text: string) => { const f = join(root, path); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
  put("settings.json", J({ power_user: { personas: { "daniel.png": "Daniel the Wanderer" }, persona_descriptions: { "daniel.png": { description: "A traveler." } } }, tags: [{ id: "t1", name: "fantasy" }], tag_map: { "Mira.json": ["t1"] } }));
  put("secrets.json", J({ api_key_openai: "sk-never" }));
  put("characters/Mira.json", card("Mira", { world: "Old Roads" }));
  put("characters/Ivo.json", card("Ivo"));
  put("worlds/Old Roads.json", J({ name: "Old Roads", entries: { 0: { uid: 0, key: ["road"], content: "Roads are old." } } }));
  put("chats/Mira/Mira - first.jsonl", jsonl(
    { user_name: "Daniel", character_name: "Mira", create_date: "2026-1-5@12h30m10s", chat_metadata: {} },
    msg("Mira", false, "Hello, traveler.", "2026-01-05T15:30:00Z", { swipes: ["Hello, traveler.", "Who goes there?"], swipe_id: 0 }),
    msg("Daniel", true, "Hi Mira.", "2026-01-05T15:31:00Z"),
    msg("Mira", false, "Sit by the fire.", "2026-01-05T15:32:00Z"),
  ));
  put("instruct/ChatML.json", "{}");
  return root;
}

test("Import from SillyTavern: folder → what was found → import → report → undo", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).last().click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await expect(page.getByTestId("settings-sillytavern")).toBeVisible();
  if (process.env.H2_SHOTS) await page.screenshot({ path: process.env.H2_SHOTS + "/settings.png" });
  await page.getByTestId("st-import-open").click();

  const win = page.getByTestId("st-import");
  await expect(win).toContainText("Choose your SillyTavern folder");
  await page.getByTestId("st-import-folder").setInputFiles(stFolder());
  const found = page.getByTestId("st-found");
  await expect(found).toContainText("Characters");
  await expect(found).toContainText("Chats");
  await expect(found).toContainText("Lorebooks");
  await expect(found).toContainText("Personas");
  await expect(win).toContainText("Not brought");
  await expect(win).toContainText("Text Completion settings");
  await expect(win).toContainText("API keys (secrets.json)");
  await win.getByRole("button", { name: /By Character/ }).click();
  await expect(page.getByTestId("st-chats-by-character")).toContainText("Mira");
  if (process.env.H2_SHOTS) await page.screenshot({ path: process.env.H2_SHOTS + "/found.png" });
  await page.getByTestId("st-start").click();

  const report = page.getByTestId("st-report");
  await expect(report).toBeVisible({ timeout: 30_000 });
  await expect(report).toContainText("SillyTavern import finished");
  await expect(report.locator(".sti-sum")).toContainText("2");
  await expect(report).toContainText("1 swipe kept");
  if (process.env.H2_SHOTS) await page.screenshot({ path: process.env.H2_SHOTS + "/report.png" });
  await report.getByRole("button", { name: "Open" }).first().click();

  // the cards are in Characters, with the chat
  await page.getByRole("button", { name: "Mira", exact: true }).first().click();
  await expect(page.getByTestId("character-chats")).toContainText("Mira - first");

  // a second import: everything is already here
  await page.getByRole("button", { name: "Settings" }).last().click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await page.getByTestId("st-import-open").click();
  await page.getByTestId("st-import-folder").setInputFiles(stFolder());
  await expect(page.getByTestId("st-found")).toContainText("2 already here");
  await page.getByTestId("st-start").click();
  await expect(page.getByTestId("st-report")).toContainText("already here", { timeout: 30_000 });

  // Undo This Import (of this second, empty run) changes nothing; the first import's cards stay
  await page.getByTestId("st-undo").click();
  await page.getByRole("button", { name: "Move to Trash" }).click();
  await expect(page.getByTestId("notice")).toContainText("Import undone");
});
