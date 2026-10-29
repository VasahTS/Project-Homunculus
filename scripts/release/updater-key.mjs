// Homunculus 2 — puts the updater's public key and this repo's address into the project (D-037).
// Author: CLAUDE, 2026-10-29. Run by "Set up updater.bat" after it creates the signing key:
//   node scripts/release/updater-key.mjs <path to the .key.pub file>
// - tauri.conf.json: plugins.updater.pubkey (public half; safe to publish) and the latest.json address;
// - README.md and the guides in docs/: the OWNER/REPO placeholders become the real repository;
// - opens GitHub's "new secret" page, where the SECRET half goes (never into the project).
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

/** owner/repo of the "origin" remote in .git/config, or null. */
export function repoFromGitConfig(text) {
  const origin = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(text)?.[1];
  const m = origin && /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(origin);
  return m ? `${m[1]}/${m[2]}` : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pubPath = process.argv[2];
  if (!pubPath || !existsSync(pubPath)) fail(`I could not find the public key at ${pubPath}.`);
  const pubkey = readFileSync(pubPath, "utf8").trim();

  const gitConfig = existsSync(root + ".git/config") ? readFileSync(root + ".git/config", "utf8") : "";
  const repo = repoFromGitConfig(gitConfig);
  if (!repo) fail("I could not find the GitHub address of this folder (git remote \"origin\"). The repository is github.com/VasahTS/Project-Homunculus; run \"Set up updater.bat\" again or send a screenshot to Claude.");

  const confPath = root + "apps/desktop/src-tauri/tauri.conf.json";
  const conf = JSON.parse(readFileSync(confPath, "utf8"));
  conf.plugins ??= {};
  conf.plugins.updater = { ...conf.plugins.updater, pubkey, endpoints: [`https://github.com/${repo}/releases/latest/download/latest.json`] };
  writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

  for (const doc of ["README.md", "docs/TESTING.md", "docs/RELEASING.md", ".github/ISSUE_TEMPLATE/config.yml"]) {
    if (!existsSync(root + doc)) continue;
    const text = readFileSync(root + doc, "utf8");
    if (text.includes("OWNER/REPO")) writeFileSync(root + doc, text.replaceAll("OWNER/REPO", repo));
  }

  const secretsUrl = `https://github.com/${repo}/settings/secrets/actions/new`;
  console.log(`\nProject on GitHub: https://github.com/${repo}`);
  console.log(`Public key written to apps/desktop/src-tauri/tauri.conf.json.`);
  console.log(`Opening: ${secretsUrl}`);
  if (process.platform === "win32") execFile("cmd", ["/c", "start", "", secretsUrl]);
}
