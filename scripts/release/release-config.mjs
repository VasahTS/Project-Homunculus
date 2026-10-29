// Homunculus 2 — checks a release can be signed and writes the build overlay (D-037). Author: CLAUDE, 2026-10-29.
// Runs in GitHub Actions before `tauri build`:
//  - the signing key (secret TAURI_SIGNING_PRIVATE_KEY) and the public key in tauri.conf.json must exist,
//    otherwise installed copies could never verify the update — stop with a clear message instead;
//  - writes src-tauri/tauri.release.conf.json: updater files on, and the address of latest.json taken from
//    this very repository (GITHUB_REPOSITORY), so a renamed repo or account never breaks updates.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const confPath = root + "apps/desktop/src-tauri/tauri.conf.json";
const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

const conf = JSON.parse(readFileSync(confPath, "utf8"));
const repo = process.env.GITHUB_REPOSITORY;
if (!repo) fail("GITHUB_REPOSITORY is not set (this script runs inside GitHub Actions).");
if (!conf.plugins?.updater?.pubkey) {
  fail("The public key is missing from tauri.conf.json. On the PC, run \"Set up updater.bat\" once, then commit and push tauri.conf.json (and merge dev into main).");
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  fail("The secret TAURI_SIGNING_PRIVATE_KEY is missing on GitHub (Settings → Secrets and variables → Actions). See docs/RELEASING.md, step 1.");
}

const endpoint = `https://github.com/${repo}/releases/latest/download/latest.json`;
const overlay = { bundle: { createUpdaterArtifacts: true }, plugins: { updater: { endpoints: [endpoint] } } };
writeFileSync(root + "apps/desktop/src-tauri/tauri.release.conf.json", JSON.stringify(overlay, null, 2) + "\n");
console.log(`Updates will be read from ${endpoint}`);
