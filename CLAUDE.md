# Homunculus 2 — rules for AI agents (Claude, CODEX…)

- **Everything in this repository is written in English** (D-038): file and folder names, docs, comments, commit messages, UI text, batch-file messages, issue forms. Daniel's quotes are translated. Talk to Daniel in Portuguese in the conversation, but write the files in English.
- Read `HANDOFF.md` before changing anything; design decisions are numbered in `docs/DECISIONS.md` (add one for anything new); the whole app's map is `docs/BLUEPRINT.md`.
- UI changes follow the rule in HANDOFF ("draft before code"); UX comes first: simple, elegant, effective.
- **Git workflow (Daniel's setup — follow it without being reminded):**
  - Work **only on `dev`**. Never commit or push to `main` by hand; `main` is changed only by merging `dev` when Daniel says a version is ready, and by the "Publish release" workflow (`docs/RELEASING.md`).
  - **Start of a session:** `git checkout dev`, `git pull`, and read `HANDOFF.md`. If Daniel's PC folder is reachable, check for his uncommitted changes first and never overwrite them.
  - **End of a task:** run the checks (`npm run typecheck`, `npm test`), commit with a clear English message, **push to `dev`**, and tell Daniel in Portuguese: "Pull origin no GitHub Desktop (branch dev)".
  - Daniel's copy on his PC is only updated by his **Pull origin**; if you also write files there, say so, so he commits them before the next session.
  - Do not touch `.github/workflows` unless asked; do not publish releases unless Daniel asks (he runs "Publish release" himself, or asks you to).
- CODEX works on its own `gpt` branch (D-050) from task cards Claude writes in `docs/CODEX-TASKS.md` (D-056); what it may and may not do is in `AGENTS.md`. Claude reviews the `gpt` diff against the card, merges it into `dev` when Daniel asks, then fast-forwards `gpt` to `dev`.
- One agent at a time changing the code; re-read a file from disk before writing it.
- Never touch, read or ask for Daniel's portable play folder or his API keys.
