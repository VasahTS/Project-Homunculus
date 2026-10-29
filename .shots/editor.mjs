// The tracker editor (D-026) with a copy of Daniel's database. CLAUDE, 2026-10-28.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const db = readFileSync(process.env.H2_REAL_DB).toString("base64");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 950 } });
p.on("pageerror", (e) => console.log("PAGEERR", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
await p.addInitScript((d) => { globalThis.__h2SeedDb = d; }, db);
await p.goto("http://localhost:1420/"); await p.waitForTimeout(2500);
await p.getByTestId("library-list").getByRole("button", { name: /^Trackers/ }).click();
await p.getByTestId("tracker-list").getByText("Scene: Characters").click(); await p.waitForTimeout(2500);
await p.screenshot({ path: "/home/claude/shots/ed-1.png" });
await p.getByTestId("field-label").filter({ hasText: /^Mood$/ }).click(); await p.waitForTimeout(600);
await p.screenshot({ path: "/home/claude/shots/ed-2.png" });
// drag the Appearance group below "About"
await p.getByTestId("field-label").filter({ hasText: /^Mood$/ }).click(); await p.waitForTimeout(400);
await p.locator(".te-main").evaluate((e) => e.scrollTop = 0); await p.waitForTimeout(200);
await p.getByRole("button", { name: "Hide the fields of Appearance" }).click();
await p.getByRole("button", { name: "Hide the fields of Now" }).click(); await p.waitForTimeout(400);
await p.screenshot({ path: "/home/claude/shots/ed-2b.png" });
const grip = p.getByRole("button", { name: "Reorder Appearance" });
const box = await grip.boundingBox();
const target = await p.getByRole("button", { name: "Reorder About" }).boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down();
for (let i = 1; i <= 12; i++) { await p.mouse.move(box.x + 10, box.y + (target.y - box.y + 10) * i / 12); await p.waitForTimeout(30); }
await p.screenshot({ path: "/home/claude/shots/ed-3.png" });
await p.mouse.up(); await p.waitForTimeout(120);
await p.screenshot({ path: "/home/claude/shots/ed-4.png" });
await p.waitForTimeout(600);
await p.screenshot({ path: "/home/claude/shots/ed-5.png" });
await b.close();
