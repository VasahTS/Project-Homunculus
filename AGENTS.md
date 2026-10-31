# Homunculus 2 — rules for AI agents (CODEX, Claude…)

## Everyone

- **Everything in this repository is written in English** (D-038): file and folder names, docs, comments, commit messages, UI text, batch-file messages, issue forms. Daniel's quotes are translated. Talk to Daniel in Portuguese in the conversation, but write the files in English.
- Read `HANDOFF.md` before changing anything; design decisions are numbered in `docs/DECISIONS.md`; the whole app's map is `docs/BLUEPRINT.md`. How other apps do things: `docs/reference/` (SillyTavern, Marinara, Aventuras, v1).
- UX comes first: simple, elegant, effective. UI changes follow the rule in HANDOFF ("draft before code").
- One agent at a time changing the code; re-read a file from disk before writing it.
- Never touch, read or ask for Daniel's portable play folder or his API keys.
- Do not touch `.github/workflows` and do not publish releases unless Daniel asks.

---

## If you are CODEX (GPT) — read this whole section

You work **only** in `C:\Users\danie\Documents\SillyBunny-Classic-Dev\Homunculus-gpt`, **only on the `gpt` branch** (D-050). The "Claude" section below does **not** apply to you. Your tasks are cards in **`docs/CODEX-TASKS.md`** (D-056).

### Start of every session
1. Check the folder and that you are on `gpt` (`git branch --show-current`). Keep any uncommitted changes.
2. Bring in the latest `dev`: `git fetch origin` then `git merge --ff-only origin/dev`. If it is not a fast-forward, `git merge origin/dev`; if there are conflicts, **stop and tell Daniel** — do not resolve conflicts in code you did not write.
3. Read `HANDOFF.md` (top entries) and your card in `docs/CODEX-TASKS.md`.

### You CAN do (no extra permission needed)
- **The card you were given**, inside the files it lists.
- **Find and fix bugs** with a failing test first (unit or click test) that passes after the fix — as in D-051.
- **Write tests**: unit tests (`packages/*/test`) and click tests (`e2e/`). Run the click tests on the PC; CI does not run them.
- **Reliability audits** of a feature: reproduce, fix, report in `docs/` (format of `docs/AGENT-RELIABILITY-AUDIT.md`).
- **Implement a screen that is already approved** — text in `docs/UI-PLAN*.md` marked approved **and** a draft Daniel approved. Copy the draft; do not redesign it.
- **Port logic from another app** when a test compares the result with the original (like the lorebook engine against SillyTavern), with credit in `CREDITS.md`.
- **Read `docs/reference/` and write maps/summaries** of how other apps work.
- **Mechanical refactors** that change no behavior (rename, move, extract), proven by the existing tests.
- **Review a diff** from Claude when Daniel asks: list problems, do not rewrite.

### You must NOT do
- **Decide how a screen looks or behaves.** No new buttons, panels, labels, wording, defaults or layouts unless the card says exactly what. If a task seems to need a UI choice, stop and write the question in your HANDOFF entry. (Why: D-044/D-045 had three ways to save the same text and the wrong default scope; D-046 had to redo them.)
- **Change schemas or stored data** (`packages/schemas`, SQL tables, `appSettings` keys) unless the card allows it.
- **Change the branching / world-state / prompt-assembly core** (`packages/core/src/turn.ts`, `presets.ts`, branch resolution, memory chapters' path rule) except to fix a bug proven by a test, and say so in the report.
- **Create decisions (D-xxx).** If something needs a decision, write it as a question for Daniel in HANDOFF. Claude records decisions.
- **Work on `dev` or `main`**, merge anything into them, or push anywhere except `gpt`.
- **Touch** lockfiles (`package-lock.json`, `Cargo.lock`) unless the card says so; `.github/workflows`; releases.
- **Grow the task.** If the diff passes ~400 changed lines (tests not counted) or needs files outside the card, stop, commit what is safe, and say what is left.

### End of every task
1. `npm run typecheck`, `npm test`, and the click tests the card names (`npx playwright test e2e/<file>`).
2. Commit with `[CODEX] <what changed>`, push to `gpt`.
3. **Short notes** (≤ 8 lines each), signed **CODEX**: one entry at the top of `HANDOFF.md` and one in `CODEX-LOG.md` — what changed, how to see it, test counts, open questions. Mark the card **Done** in `docs/CODEX-TASKS.md`.
4. Tell Daniel in Portuguese: "Pronto na branch gpt. Peça para o Claude revisar e juntar na dev."

---

## If you are Claude

- Work **only on `dev`**. Never commit or push to `main` by hand; `main` is changed only by merging `dev` when Daniel says a version is ready, and by the "Publish release" workflow (`docs/RELEASING.md`).
- **Start of a session:** `git checkout dev`, `git pull`, and read `HANDOFF.md`. If Daniel's PC folder is reachable, check for his uncommitted changes first and never overwrite them.
- **End of a task:** run the checks (`npm run typecheck`, `npm test`), commit with a clear English message, **push to `dev`**, and tell Daniel in Portuguese: "Pull origin no GitHub Desktop (branch dev)".
- Daniel's copy on his PC is only updated by his **Pull origin**; if you also write files there, say so, so he commits them before the next session.
- **CODEX:** you write its task cards in `docs/CODEX-TASKS.md` (template there), review the `gpt` diff against the card, and merge `gpt` into `dev` when Daniel asks. After merging, fast-forward `gpt` to `dev` so it never starts behind.
