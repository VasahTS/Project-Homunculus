// Click tests of web search in the Assistant (D-067): 🌐 Web per chat, the default in Details → Tools, the sources
// row. The browser preview has no web: a fake one is injected (as updates.e2e does), so no site is contacted.
// Author: CLAUDE, 2026-11-01.
import { expect, test } from "@playwright/test";

const RESULTS = [
  ["Mount Fuji - Wikipedia", "https://en.wikipedia.org/wiki/Mount_Fuji"],
  ["Mount Fuji | Britannica", "https://www.britannica.com/place/Mount-Fuji"],
  ["Not a web page", "javascript:alert(1)"],
];

test("Assistant web search: per-chat 🌐 Web, the default in Details, and the sources under a reply", async ({ page }) => {
  await page.addInitScript((results) => {
    const html = results.map(([t, u]) => `<div class="result results_links"><a class="result__a" href="${u}">${t}</a><a class="result__snippet">About ${t}</a></div>`).join("");
    (globalThis as { __h2FakeWeb?: unknown }).__h2FakeWeb = {
      searchPage: async () => ({ status: 200, html }),
      get: async (url: string) => ({ status: 200, finalUrl: url, contentType: "text/plain", body: "text", cut: false }),
    };
  }, RESULTS);
  await page.goto("/");
  await page.getByTestId("mode-switch").getByRole("tab", { name: /Assistant/ }).click();
  const web = page.getByTestId("pick-web");
  await expect(web).toHaveAttribute("aria-pressed", "true");
  await expect(web).toHaveAttribute("title", "Web search (DuckDuckGo) is on for this chat — click to turn it off");

  // a search: the step says what was looked up; the sources row shows the two web results (the javascript: one is dropped)
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Search the web for Mount Fuji");
  await page.getByTestId("assistant-send").click();
  const reply = page.getByTestId("assistant-reply").last();
  await expect(reply).toContainText("Done (offline test AI)");
  await expect(reply.getByTestId("assistant-steps")).toContainText("Searched the web: “Mount Fuji” · 2 results");
  const sources = reply.getByTestId("assistant-sources");
  await expect(sources).toContainText("2 sources");
  await expect(sources).toHaveAttribute("aria-expanded", "false");
  await sources.click();
  const list = reply.locator(".asst-sources-list li");
  await expect(list).toHaveCount(2);
  await expect(list.first()).toContainText("Mount Fuji - Wikipedia");
  await expect(list.first()).toContainText("en.wikipedia.org");
  await expect(list.nth(1)).toContainText("britannica.com");
  for (const href of await reply.locator(".asst-sources-list a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) expect(href).toMatch(/^https?:\/\//);

  // off for this chat: remembered when coming back; a new chat follows the default (on)
  await web.click();
  await expect(web).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("assistant-new").click();
  await expect(page.getByTestId("pick-web")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("assistant-chats").getByText("Search the web for Mount Fuji").click();
  await expect(page.getByTestId("pick-web")).toHaveAttribute("aria-pressed", "false");
  // with web off, the same request gets no web tool
  await page.getByRole("textbox", { name: "Message to the Assistant" }).fill("Search the web for Kyoto");
  await page.getByTestId("assistant-send").click();
  await expect(page.getByTestId("assistant-reply")).toHaveCount(2);
  await expect(page.getByTestId("assistant-reply").last().getByTestId("assistant-steps")).toContainText("web_search is off");
  await expect(page.getByTestId("assistant-reply").last().getByTestId("assistant-sources")).toHaveCount(0);

  // the default: Details → Tools → Search the web off → a new chat starts with 🌐 Web off
  const tools = page.getByTestId("det-tools");
  await tools.getByText("Tools").first().click();
  const sw = tools.getByRole("switch", { name: "Search the web" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("assistant-new").click();
  await expect(page.getByTestId("pick-web")).toHaveAttribute("aria-pressed", "false");
});
