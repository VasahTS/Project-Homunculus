// Homunculus 2 — the release notes of one version, from CHANGELOG.md (D-037). Author: CLAUDE, 2026-10-29.
// Usage: node scripts/release/notes.mjs 0.2.0 ["one-line notes from the form"]
// Prints the "## 0.2.0" section of CHANGELOG.md (without the heading). If there is none, the line typed
// in the "Publicar versão" form; if that is empty too, a short default. Shown on GitHub and in the app.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function sectionFor(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const head = new RegExp(`^##\\s+\\[?v?${version.replace(/\./g, "\\.")}\\]?(\\s|$)`);
  const start = lines.findIndex((l) => head.test(l));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [version = "", typed = ""] = process.argv.slice(2);
  const path = fileURLToPath(new URL("../../CHANGELOG.md", import.meta.url));
  const fromLog = existsSync(path) ? sectionFor(readFileSync(path, "utf8"), version.replace(/^v/, "")) : "";
  process.stdout.write((fromLog || typed.trim() || "Melhorias e correções.") + "\n");
}
