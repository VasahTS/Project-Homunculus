// Homunculus 2 — sets the app version everywhere it is written (D-037). Author: CLAUDE, 2026-10-29.
// Usage: node scripts/release/set-version.mjs 0.2.0
// Writes: package.json, apps/desktop/package.json, tauri.conf.json, Cargo.toml and the two matching entries
// of package-lock.json. Refuses a version lower than the current one or one that already has a git tag.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const at = (p) => root + p;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function compare(a, b) {
  const x = SEMVER.exec(a), y = SEMVER.exec(b);
  if (!x || !y) throw new Error(`not a version: ${!x ? a : b}`);
  for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i]);
  return 0;
}

function editJson(path, change) {
  const text = readFileSync(at(path), "utf8");
  const data = JSON.parse(text);
  change(data);
  writeFileSync(at(path), JSON.stringify(data, null, 2) + "\n");
}

export function setVersion(version) {
  editJson("package.json", (d) => { d.version = version; });
  editJson("apps/desktop/package.json", (d) => { d.version = version; });
  editJson("apps/desktop/src-tauri/tauri.conf.json", (d) => { d.version = version; });
  editJson("package-lock.json", (d) => {
    if (d.version !== undefined) d.version = version;
    if (d.packages?.[""]) d.packages[""].version = version;
    if (d.packages?.["apps/desktop"]) d.packages["apps/desktop"].version = version;
  });
  const cargo = readFileSync(at("apps/desktop/src-tauri/Cargo.toml"), "utf8");
  // only the [package] version (the first `version =` line after [package])
  const next = cargo.replace(/(\[package\][^[]*?\nversion\s*=\s*")[^"]*(")/, `$1${version}$2`);
  if (next === cargo && !cargo.includes(`version = "${version}"`)) throw new Error("Cargo.toml: [package] version not found");
  writeFileSync(at("apps/desktop/src-tauri/Cargo.toml"), next);
}

function tagExists(tag) {
  try { execFileSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { cwd: root, stdio: "ignore" }); return true; }
  catch { return false; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = (process.argv[2] ?? "").trim().replace(/^v/, "");
  const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };
  if (!SEMVER.test(version)) fail(`"${version}" is not a version number. Use three numbers, e.g. 0.2.0`);
  const current = JSON.parse(readFileSync(at("apps/desktop/package.json"), "utf8")).version;
  if (compare(version, current) < 0) fail(`Version ${version} is lower than the current one (${current}). Use a higher number.`);
  if (tagExists(`v${version}`)) fail(`Version ${version} was already published. Use a number higher than ${version}.`);
  setVersion(version);
  console.log(`Version ${current} → ${version}`);
}
