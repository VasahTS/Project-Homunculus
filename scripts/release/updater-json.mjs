// Homunculus 2 — writes latest.json, the file the in-app updater reads (D-037, D-038). Author: CLAUDE, 2026-10-29.
// Usage (GitHub Actions, GH_TOKEN set): node scripts/release/updater-json.mjs 0.2.0 > latest.json
// The Windows and Linux builds run at the same time, so each uploads only its files and signatures; this
// script then makes ONE latest.json from them (two builds writing the same file could lose one platform).
// Only bundles that can replace themselves are listed: the Windows installer and the Linux AppImage.
// A Linux .deb is updated by hand (the app opens the release page), so it is not in here.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The platforms of latest.json from the release's asset names and their signatures. */
export function buildManifest({ version, notes, repo, assets, signature, date = new Date().toISOString() }) {
  const url = (name) => `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(name)}`;
  const find = (test) => assets.find((a) => test(a) && assets.includes(`${a}.sig`));
  const platforms = {};
  const windows = find((a) => /-setup\.exe$/i.test(a));
  const linux = find((a) => /\.AppImage$/.test(a));
  if (windows) {
    const entry = { signature: signature(`${windows}.sig`), url: url(windows) };
    platforms["windows-x86_64"] = entry;
    platforms["windows-x86_64-nsis"] = entry;
  }
  if (linux) {
    const entry = { signature: signature(`${linux}.sig`), url: url(linux) };
    platforms["linux-x86_64"] = entry;
    platforms["linux-x86_64-appimage"] = entry;
  }
  return { version, notes, pub_date: date, platforms };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = (process.argv[2] ?? "").replace(/^v/, "");
  const repo = process.env.GITHUB_REPOSITORY;
  const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };
  if (!version || !repo) fail("Usage: GITHUB_REPOSITORY=owner/repo node scripts/release/updater-json.mjs <version>");
  const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });
  const release = JSON.parse(gh("api", `repos/${repo}/releases`, "--paginate", "--jq", `[.[] | select(.tag_name == "v${version}")][0]`) || "null");
  if (!release) fail(`No release v${version} found.`);
  const assets = release.assets.map((a) => a.name);
  const dir = mkdtempSync(join(tmpdir(), "h2-sig-"));
  gh("release", "download", `v${version}`, "--repo", repo, "--pattern", "*.sig", "--dir", dir);
  const manifest = buildManifest({ version, notes: release.body ?? "", repo, assets, signature: (name) => readFileSync(join(dir, name), "utf8").trim() });
  const missing = ["windows-x86_64", "linux-x86_64"].filter((p) => !manifest.platforms[p]);
  if (missing.length) fail(`The release has no signed files for: ${missing.join(", ")}. Assets: ${assets.join(", ")}`);
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
}
