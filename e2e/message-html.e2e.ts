// HTML5/CSS3 and Animation Agent output through the actual rewrite pipeline. Author: CODEX, 2026-11-03.
import { expect, test, type Page } from "@playwright/test";
import { newChatWith, send } from "./ui.ts";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.exposeFunction("htmlPageErrors", () => errors);
});
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as { htmlPageErrors: () => Promise<string[]> }).htmlPageErrors())).toEqual([]);
});

const HTML = `<header class="stream-header">
  <span class="live-badge"><span class="live-dot"></span>AO VIVO</span>
  <span class="channel-name">riverside</span>
  <span class="viewer-count">4.122 assistindo</span>
</header>
<section class="letter"><h2>A letter at the mill</h2><p>The gate is open.</p></section>
<style>
:root { --live-accent: rgb(255, 110, 130); }
.stream-header { display: flex; flex-wrap: wrap; gap: 16px; padding: 14px; background: #202329; border-radius: 12px; }
.live-badge { color: var(--live-accent); font-weight: 700; }
.live-dot { display: inline-block; width: 7px; height: 7px; background: currentColor; border-radius: 50%; margin-right: 6px; }
.letter { display: grid; gap: 12px; padding: 18px; background: linear-gradient(135deg, #393529, #252b32); }
.letter p { margin: 0; }
.channel-name::after { content: " · live"; }
</style>`;
const ANIMATED = `*Mara waited.* "You came."

<span class="tick">*tick... tick...*</span>

<span class="step">Slow</span> <span class="step" style="animation-delay: 0.15s">footsteps</span> crossed the room.
<style>
@keyframes tick { from { transform: translateX(-4px); opacity: .6; } to { transform: translateX(4px); opacity: 1; } }
.tick { display: inline-block; color: #e8bd75; animation: tick .8s ease-in-out infinite alternate; }
.step { display: inline-block; animation: tick 1.2s ease-in-out infinite alternate; }
body { color: rgb(230, 220, 190); }
</style>`;

async function rewriteWith(page: Page, output: string) {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await page.evaluate(async (html) => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    await svc.store.saveAgentConfig({ id: "html-fixture", name: "HTML fixture", prompt: "HTML_RENDER_FIXTURE", output: "rewrite", triggers: [{ on: "turn", phase: "after" }] });
    await svc.store.setDefaultSetup({ agents: { mode: "add", add: ["html-fixture"], remove: [] } });
    svc.core.connections.stream = async function* (_c: unknown, messages: Array<{ content: string }>) {
      yield messages.some((m) => m.content.includes("HTML_RENDER_FIXTURE")) ? html : "The gate is open.";
    };
  }, output);
  await send(page, "Read the screen.");
  const reply = page.getByTestId("message").last();
  const frame = reply.frameLocator('iframe[data-testid="message-html"]');
  return { reply, frame };
}

async function greeting(page: Page, text: string) {
  await page.goto("/");
  await page.evaluate(async (content) => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    const c = (await svc.store.listCharacters()).find((x: { name: string }) => x.name === "Lyra");
    await svc.store.saveCharacter({ ...c, firstMessages: [content] });
  }, text);
  await newChatWith(page);
}

test("the HTML5/CSS3 rewrite renders semantic HTML, classes and custom properties locally", async ({ page }) => {
  const { reply, frame } = await rewriteWith(page, HTML);
  await expect(reply.getByTestId("message-html")).toBeVisible();
  await expect(frame.locator("header")).toHaveCSS("display", "flex");
  await expect(frame.locator(".live-badge")).toHaveCSS("color", "rgb(255, 110, 130)");
  await expect(frame.locator(".letter")).toHaveCSS("display", "grid");
  expect(await frame.locator(".channel-name").evaluate((el) => getComputedStyle(el, "::after").content)).toBe('" · live"');
  await expect(frame.getByText("The gate is open.")).toBeVisible();
  await expect(reply.locator("pre")).toHaveCount(0);
  const saved = await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    const session = (await svc.store.listSessions())[0];
    const messages = await svc.store.messagesOf(session.id);
    const last = messages.at(-1);
    return { content: last.content, revisions: await svc.store.listRevisions(last.id) };
  });
  expect(saved.content).toBe(HTML);
  expect(saved.revisions.at(-1)).toMatchObject({ author: { kind: "agent", agentId: "html-fixture" }, before: "The gate is open.", after: HTML });
  await page.getByTestId("messages").evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))); });
  await page.screenshot({ path: "e2e/.results/message-html-desktop.png" });
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  await page.getByRole("button", { name: "Hide Sidebar" }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  const box = await reply.getByTestId("message-html").boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await expect(frame.getByText("4.122 assistindo")).toBeVisible();
  await page.screenshot({ path: "e2e/.results/message-html-mobile.png" });
});

test("the Animation Agent keeps Markdown and CSS keyframes, delay and motion preferences", async ({ page }) => {
  const { frame } = await rewriteWith(page, ANIMATED);
  await expect(frame.locator(".tick em")).toHaveText("tick... tick...");
  await expect(frame.locator("q.dlg")).toHaveText('"You came."');
  await expect(frame.locator(".step").last()).toHaveCSS("animation-delay", "0.15s");
  await expect(frame.locator(".tick")).toHaveCSS("animation-name", "tick");
  await expect(frame.locator(".tick em")).toHaveCSS("color", "rgb(232, 189, 117)");
  const tick = frame.locator(".tick");
  const start = await tick.evaluate((el) => el.getAnimations()[0]!.currentTime);
  await expect.poll(() => tick.evaluate((el) => Number(el.getAnimations()[0]?.currentTime ?? 0))).toBeGreaterThan(Number(start) + 50);
  expect(await tick.evaluate((el) => el.getAnimations()[0]!.effect!.getTiming().iterations)).toBe(Infinity);
  expect(await page.evaluate(() => getComputedStyle(document.body).color)).not.toBe("rgb(230, 220, 190)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(tick).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(tick).toHaveCSS("animation-name", "tick");
  await page.evaluate(() => { document.documentElement.dataset.motion = "off"; });
  await expect(tick).toHaveCSS("animation-name", "none");
});

test("frame isolation blocks scripts, navigation and unapproved network resources; image clicks retain consent", async ({ page }) => {
  const requests: string[] = [];
  await page.route("https://rendering-fixture.invalid/**", async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64") });
  });
  const { reply, frame } = await rewriteWith(page, `<section class="guard">Visible<details><summary>Read more</summary><p style="height:500px">Long letter.</p></details></section>
<img src="https://rendering-fixture.invalid/chosen.png" onerror="parent.__bad=1">
<a href="https://example.com/letter">Letter link</a>
<meta http-equiv="refresh" content="0;url=https://rendering-fixture.invalid/navigate">
<script>parent.__bad=1</script><iframe src="https://rendering-fixture.invalid/frame"></iframe>
<style>body { background-image:url(https://rendering-fixture.invalid/css.png); } .guard { color:rgb(80,190,150); }</style>`);
  await expect(frame.locator(".guard")).toBeVisible();
  await expect(frame.locator("script, iframe, meta[http-equiv=refresh], [onerror]")).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __bad?: number }).__bad)).toBeUndefined();
  await expect(reply.getByTestId("message-html")).toHaveAttribute("sandbox", "allow-same-origin");
  const closed = (await reply.getByTestId("message-html").boundingBox())!.height;
  await frame.locator("summary").click();
  await expect.poll(async () => (await reply.getByTestId("message-html").boundingBox())!.height).toBeGreaterThan(closed + 300);
  await frame.locator("summary").click();
  await expect.poll(async () => (await reply.getByTestId("message-html").boundingBox())!.height).toBeLessThan(closed + 15);
  await frame.getByRole("button", { name: /Show image/ }).click();
  await expect.poll(() => requests).toEqual(["https://rendering-fixture.invalid/chosen.png"]);
  await expect(frame.locator("img")).toHaveAttribute("src", "https://rendering-fixture.invalid/chosen.png");
});

test("indented raw HTML renders, deliberate HTML code fences remain code, and the HTML switch is respected", async ({ page }) => {
  await greeting(page, '    <header class="stream-header"><span>Indented header</span></header>');
  const reply = page.getByTestId("message").first();
  await expect(reply.frameLocator('iframe[data-testid="message-html"]').locator("header")).toHaveText("Indented header");
  await page.evaluate(async () => { const { setMessageLook } = await import("/src/messageLook.ts" as string); await setMessageLook({ html: false }); });
  await expect(reply.getByTestId("message-html")).toHaveCount(0);
  await expect(reply).toContainText("Indented header");
  await page.evaluate(async () => { const { setMessageLook } = await import("/src/messageLook.ts" as string); await setMessageLook({ html: true }); });
  await expect(reply.getByTestId("message-html")).toBeVisible();
  await greeting(page, '```html\n<header class="stream-header">Deliberate code</header>\n```');
  await expect(page.getByTestId("message").first().locator("pre")).toContainText('<header class="stream-header">Deliberate code</header>');
  await expect(page.getByTestId("message-html")).toHaveCount(0);
});


test("styled HTML streams and finishes as the same readable message", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    svc.core.connections.stream = async function* () {
      yield '<section class="live-fragment">The gate is open.</section>';
      await new Promise<void>((resolve) => { (window as unknown as { releaseHtml: () => void }).releaseHtml = resolve; });
      yield '<style>.live-fragment { color: rgb(90, 190, 160); padding: 8px }</style>';
    };
  });
  await page.getByPlaceholder(/Type a message/).fill("Look.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("streaming").frameLocator('iframe[data-testid="message-html"]').locator(".live-fragment")).toHaveText("The gate is open.");
  await page.evaluate(() => (window as unknown as { releaseHtml: () => void }).releaseHtml());
  await expect(page.getByTestId("streaming")).toHaveCount(0);
  await expect(page.getByTestId("message").last().frameLocator('iframe[data-testid="message-html"]').locator(".live-fragment")).toHaveCSS("color", "rgb(90, 190, 160)");
});

test("complete HTML documents keep head styles and SVG isolated from other messages", async ({ page }) => {
  await greeting(page, '<!doctype html><html><head><style>.shared { color: rgb(210, 90, 100) }</style></head><body><article class="shared">First letter<svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="currentColor" /></svg></article></body></html>');
  const first = page.getByTestId("message").first().frameLocator('iframe[data-testid="message-html"]');
  await expect(first.locator(".shared")).toHaveCSS("color", "rgb(210, 90, 100)");
  await expect(first.locator("svg circle")).toHaveCount(1);
  await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    svc.core.connections.stream = async function* () { yield '<article class="shared">Second letter</article><style>.shared { color: rgb(90, 120, 210) }</style>'; };
  });
  await send(page, "The other letter.");
  const last = page.getByTestId("message").last().frameLocator('iframe[data-testid="message-html"]');
  await expect(last.locator(".shared")).toHaveCSS("color", "rgb(90, 120, 210)");
  await expect(first.locator(".shared")).toHaveCSS("color", "rgb(210, 90, 100)");
  expect(await page.locator("[data-region=sidebar] .shared").count()).toBe(0);
});

// CLAUDE, 2026-11-03: streamed tokens patch the loaded frame instead of reloading it for every token.
test("streaming text keeps the same frame document until a new style arrives", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("message")).toHaveCount(1);
  await page.evaluate(async () => {
    const svc = await (await import("/src/core-instance.ts" as string)).servicesReady;
    const w = window as unknown as { nextChunk: () => void };
    const gate = () => new Promise<void>((resolve) => { w.nextChunk = resolve; });
    svc.core.connections.stream = async function* () {
      yield '<section class="live-fragment">The gate</section>';
      await gate();
      yield '<section class="live-fragment">is open.</section>';
      await gate();
      yield '<style>.live-fragment { color: rgb(90, 190, 160) }</style>';
    };
  });
  await page.getByPlaceholder(/Type a message/).fill("Look.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const iframe = page.getByTestId("streaming").locator('iframe[data-testid="message-html"]');
  const frame = page.getByTestId("streaming").frameLocator('iframe[data-testid="message-html"]');
  await expect(frame.locator(".live-fragment")).toHaveCount(1);
  await iframe.evaluate((f: HTMLIFrameElement) => { f.contentDocument!.documentElement.dataset.mark = "first"; });
  await page.evaluate(() => (window as unknown as { nextChunk: () => void }).nextChunk());
  await expect(frame.locator(".live-fragment")).toHaveCount(2);
  expect(await iframe.evaluate((f: HTMLIFrameElement) => f.contentDocument!.documentElement.dataset.mark)).toBe("first");
  await page.evaluate(() => (window as unknown as { nextChunk: () => void }).nextChunk());
  await expect(page.getByTestId("streaming")).toHaveCount(0);
  const done = page.getByTestId("message").last().frameLocator('iframe[data-testid="message-html"]');
  await expect(done.locator(".live-fragment").last()).toHaveCSS("color", "rgb(90, 190, 160)");
  await expect(done.locator(".live-fragment")).toHaveCount(2);
});
