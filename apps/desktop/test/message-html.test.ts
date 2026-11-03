// Detect styled messages without interpreting code examples as UI. Author: CODEX, 2026-11-03.
import { describe, expect, it } from "vitest";
import { needsMessageFrame } from "../src/messageFormat.ts";

describe("rich HTML message detection", () => {
  for (const text of [
    '<header class="stream-header"><span>Live</span></header><style>.stream-header { display: flex }</style>',
    '    <header class="stream-header">Live</header>',
    'Narration. <span class="beat">*ba-bump*</span>\n<style>@keyframes beat { to { opacity: .5 } } .beat { animation: beat 1s infinite }</style>',
    '<!doctype html><html><body><main>A letter</main></body></html>',
    '<section><details><summary>Letter</summary>Its words.</details></section>',
  ]) it(`detects ${text.slice(0, 35)}`, () => expect(needsMessageFrame(text)).toBe(true));
  for (const text of [
    '*Narration.* "Dialogue."', '<b class="n">Lyra</b>',
    '```html\n<style>.x { color: red }</style><header>Example</header>\n```',
    '~~~html\n<header>Example</header>\n~~~',
    'This is the `<style>` tag, and `<header>` is semantic HTML.',
  ]) it(`keeps code/ordinary formatting: ${text.slice(0, 35)}`, () => expect(needsMessageFrame(text)).toBe(false));
});
