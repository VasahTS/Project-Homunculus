# Homunculus 2 — rules for AI agents (CODEX, Claude…)

- **Everything in this repository is written in English** (D-038): file and folder names, docs, comments, commit messages, UI text, batch-file messages, issue forms. Daniel's quotes are translated. Talk to Daniel in Portuguese in the conversation, but write the files in English.
- Read `HANDOFF.md` before changing anything; design decisions are numbered in `docs/DECISIONS.md` (add one for anything new); the whole app's map is `docs/BLUEPRINT.md`.
- UI changes follow the rule in HANDOFF ("draft before code"); UX comes first: simple, elegant, effective.
- **Git workflow for CODEX's isolated checkout (D-050):**
  - Work **only on `gpt`**, in `C:\Users\danie\Documents\SillyBunny-Classic-Dev\Homunculus-gpt`. Do not read, edit or use other project checkouts for CODEX tasks. Daniel's original checkout is outside this working scope.
  - Never commit or push to `dev` or `main`, merge into them, or publish a release without Daniel's explicit instruction. This supersedes the older dev-only workflow for CODEX.
  - **Start of a session:** verify the folder and `gpt` branch, inspect local changes, read `HANDOFF.md`, then `git pull --ff-only origin gpt` when the worktree is clean. Never overwrite existing changes or switch to `dev`.
  - **End of a task:** run `npm run typecheck` and `npm test`, commit with a clear English message prefixed `[CODEX]`, and push **only to `origin/gpt`**. Report results to Daniel in Portuguese and identify the `gpt` branch.
  - Sign CODEX's own change notes **CODEX**. Preserve the attribution of work by other agents; do not claim their existing changes.
  - Edits in this folder are local PC edits and must be committed and pushed here. Daniel's other checkout is not updated by this work.
  - Do not touch `.github/workflows` unless asked; do not publish releases unless Daniel asks.
- **Change notes:** CODEX must document its changes in `HANDOFF.md` and `CODEX-LOG.md`, signed **CODEX**; record new design/architecture decisions in `docs/DECISIONS.md`. UI refinement and Customize are currently deferred in favor of application functionality (D-041).
- One agent at a time changing the code; re-read a file from disk before writing it.
- Never touch, read or ask for Daniel's portable play folder or his API keys.
