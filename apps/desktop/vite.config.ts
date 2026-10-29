// Homunculus 2 — Vite config for the Tauri window. Author: CLAUDE, 2026-10-23.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// the version shown in Settings → About and compared by the updater (D-037); the release script keeps it in step
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  // Do not watch the Rust build folder (avoids EBUSY errors on Windows while cargo compiles).
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist" },
});
