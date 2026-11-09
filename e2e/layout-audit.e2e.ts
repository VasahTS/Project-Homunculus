// Layout audit (Daniel 11/09: "in many parts of the UI things run over each other"). Visits the main screens in the
// default and the Observatory look at two window widths and fails when two pieces of text overlap or text runs out of
// its region (sidebar, chat, right panel). Author: CLAUDE, 2026-11-09.
import { expect, test, type Page } from "@playwright/test";
import { openLibrary, openTab } from "./ui.ts";

type Hit = { a: string; b?: string; kind: "overlap" | "out" };

async function audit(page: Page, where: string): Promise<string[]> {
  await page.waitForTimeout(1000); // let enter animations settle
  const hits = await page.evaluate(() => {
    const out: Hit[] = [];
    const name = (el: Element) => {
      const t = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} “${t}”`;
    };
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
    };
    // one box per run of text (text nodes), with the element that holds it
    const boxes: Array<{ el: Element; r: DOMRect }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const el = n.parentElement;
      if (!el || !visible(el) || el.closest("[aria-hidden=true], .sr-only, textarea, select, option, script, style, [data-audit-skip]")) continue;
      const closed = el.closest("details:not([open])");
      if (closed && !el.closest("summary")) continue; // inside a closed fold: not drawn
      const range = document.createRange(); range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 2 && r.height > 2) boxes.push({ el, r });
    }
    // icons count too (an icon over a name is as bad as two names)
    for (const svg of document.querySelectorAll("button svg, a svg")) {
      const el = svg.closest("button, a")!;
      if (!visible(el) || el.closest("[aria-hidden=true], [data-audit-skip]")) continue;
      const r = svg.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) boxes.push({ el, r });
    }
    // cut to what is really visible: every box (the element itself included) that clips its overflow cuts it
    const shown: Array<{ el: Element; r: DOMRect; clippedBy: Element[] }> = [];
    for (const { el, r } of boxes) {
      let L = r.left, T = r.top, R = r.right, B = r.bottom;
      const clippedBy: Element[] = [];
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
        const st = getComputedStyle(p);
        if (st.overflowX !== "visible" || st.overflowY !== "visible") {
          const pr = p.getBoundingClientRect();
          L = Math.max(L, pr.left); T = Math.max(T, pr.top); R = Math.min(R, pr.right); B = Math.min(B, pr.bottom);
          clippedBy.push(p);
        }
      }
      if (R - L > 2 && B - T > 2 && B > 0 && T < innerHeight && R > 0 && L < innerWidth) shown.push({ el, r: new DOMRect(L, T, R - L, B - T), clippedBy });
    }
    // what is drawn on top at a box's centre must be that text (or something inside it), not another piece of text
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      const A = shown[i]!, B = shown[j]!;
      if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
      const h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (w > 3 && h > 3) {
        // only when both are really painted there (a popover above text is fine)
        const cx = Math.max(A.r.left, B.r.left) + w / 2, cy = Math.max(A.r.top, B.r.top) + h / 2;
        const top = document.elementFromPoint(cx, cy);
        if (top && (A.el.contains(top) || top.contains(A.el) || B.el.contains(top) || top.contains(B.el))) {
          const pa = A.el.closest("[role=dialog], .popover, .scene-popover, .menu, [role=menu], [role=listbox]");
          const pb = B.el.closest("[role=dialog], .popover, .scene-popover, .menu, [role=menu], [role=listbox]");
          if (pa === pb) out.push({ kind: "overlap", a: name(A.el), b: name(B.el) });
        }
      }
    }
    // text out of its region
    for (const region of document.querySelectorAll<HTMLElement>("[data-region]")) {
      const rr = region.getBoundingClientRect();
      for (const { el, r } of shown) if (region.contains(el) && !el.closest("[role=dialog], .popover, [role=menu], [role=listbox]") && (r.right > rr.right + 2 || r.left < rr.left - 2)) out.push({ kind: "out", a: `${region.dataset.region}: ${name(el)}` });
    }
    return out;
  });
  const seen = new Set<string>();
  return hits.map((h) => `${where} · ${h.kind}: ${h.a}${h.b ? ` × ${h.b}` : ""}`).filter((x) => !seen.has(x) && seen.add(x));
}

for (const look of ["Mono", "Observatory"]) for (const width of [1440, 1200]) {
  test(`no text runs over other text — ${look} at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("messages")).toBeVisible();
    if (look !== "Mono") {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByTestId("settings-customize").click();
      await page.getByRole("radio", { name: look, exact: true }).click();
      await page.getByTestId("session-list").getByRole("button").first().click();
    }
    const found: string[] = [];
    found.push(...await audit(page, "chat"));
    for (const tab of ["scene", "character", "prompt", "director", "reply"] as const) { await openTab(page, tab); found.push(...await audit(page, `tab ${tab}`)); }
    await openTab(page, "memory"); found.push(...await audit(page, "memory")); await page.keyboard.press("Escape");
    await page.locator(".who-picker > button").first().click().catch(() => {}); found.push(...await audit(page, "who picker")); await page.keyboard.press("Escape");
    await openLibrary(page, "Characters"); found.push(...await audit(page, "characters"));
    await page.getByTestId("character-list").getByRole("button").first().click(); found.push(...await audit(page, "character sheet"));
    await openLibrary(page, "Stories"); found.push(...await audit(page, "stories"));
    for (const area of ["Personas", "Lorebooks", "Presets", "Trackers", "Narrators", "Regex", "Quick Replies", "Agents"] as const) { await openLibrary(page, area); found.push(...await audit(page, area)); }
    await page.getByRole("button", { name: "Settings", exact: true }).click(); found.push(...await audit(page, "settings"));
    // a story with a long name, a narrator and a chat (Daniel's story page and story chat bar)
    await page.evaluate(async () => {
      const { store } = await (await import("/src/core-instance.ts" as string)).servicesReady;
      await store.saveStory({ id: "audit-story", name: "The Observatory and the Cartographer's Unfinished Expedition", narrator: { kind: "vault", id: "simple-narrator" },
        cast: [{ characterId: "starter-lyra" }], openings: ["The bell rings beneath the observatory.", "Second opening.", "Third opening."], createdAt: Date.now() });
    });
    // a new chat refreshes the app's copy of the library after the store write
    await openLibrary(page, "Characters");
    await page.getByTestId("character-list").getByRole("button").first().click();
    await page.getByTestId("new-chat-with").click();
    await expect(page.getByTestId("messages")).toBeVisible();
    await openLibrary(page, "Stories");
    await page.getByTestId("vault-stories").getByRole("button", { name: "The Observatory and the Cartographer's Unfinished Expedition", exact: true }).click();
    found.push(...await audit(page, "story page"));
    await page.getByTestId("story-new-chat").click();
    await expect(page.getByTestId("messages")).toBeVisible();
    found.push(...await audit(page, "story chat"));
    await page.locator("[data-region=toolbar]").first().screenshot({ path: test.info().outputPath("story-bar.png") });
    await page.locator(".who-picker > button").first().click(); found.push(...await audit(page, "story who picker")); await page.keyboard.press("Escape");
    await openTab(page, "prompt"); found.push(...await audit(page, "story chat prompt"));
    await page.getByTestId("story-crumb").click(); found.push(...await audit(page, "story page with a chat"));
    await openLibrary(page, "Stories");
    await page.getByTestId("vault-stories").getByRole("button", { name: "The Observatory and the Cartographer's Unfinished Expedition", exact: true }).click();
    found.push(...await audit(page, "story sheet with a chat"));
    console.log(found.join("\n"));
    expect(found).toEqual([]);
  });
}
