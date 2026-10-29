# Homunculus 2 — rules for AI agents (Claude, CODEX…)

- **Everything in this repository is written in English** (D-038): file and folder names, docs, comments, commit messages, UI text, batch-file messages, issue forms. Daniel's quotes are translated. Talk to Daniel in Portuguese in the conversation, but write the files in English.
- Read `HANDOFF.md` before changing anything; design decisions are numbered in `docs/DECISIONS.md` (add one for anything new); the whole app's map is `docs/BLUEPRINT.md`.
- UI changes follow the rule in HANDOFF ("draft before code"); UX comes first: simple, elegant, effective.
- Work on `dev`; `main` only receives `dev` when it is ready for testers; releases come from "Publish release" on `main` (`docs/RELEASING.md`).
- One agent at a time changing the code; re-read a file from disk before writing it.
- Never touch, read or ask for Daniel's portable play folder or his API keys.
