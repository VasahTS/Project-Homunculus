// Architecture rule: the core never depends on the UI. Author: CLAUDE, 2026-10-23.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = join(import.meta.dirname, "..", "src");
const forbidden = [/from\s+["']react/, /from\s+["']@tauri-apps/, /apps\/desktop/, /\bwindow\./, /\bdocument\./];

describe("architecture rules", () => {
  it("core source files do not import UI or desktop code", () => {
    for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".ts"))) {
      const text = readFileSync(join(srcDir, file), "utf8");
      for (const rule of forbidden) expect(text, `${file} breaks rule ${rule}`).not.toMatch(rule);
    }
  });
});
