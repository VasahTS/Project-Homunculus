// Homunculus 2 — click tests of the UI in a real browser. Author: CLAUDE, 2026-10-23.
// Runs the React UI with Vite (no Rust needed) and drives it like a user would.
// On a new machine, run once: npx playwright install chromium
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  outputDir: "./e2e/.results",
  use: {
    baseURL: "http://localhost:1420",
    screenshot: "only-on-failure",
    viewport: { width: 1200, height: 800 },
  },
  webServer: {
    command: "npm run dev -w @homunculus/desktop",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
