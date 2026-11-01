# HANDOFF — Homunculus 2

Notes for Daniel and for the next work sessions (Claude or CODEX). Read before changing anything.
Technical docs: `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`. **Everything in this repository is written in English** (D-038).
Full plans in the documents of the "Silly" Project: `PROTOTIPO-HOMUNCULUS-2.md`, `HOMUNCULUS-2-FUNDACAO.md`, `HOMUNCULUS-2-ARCHITECTURE.md`, `HOMUNCULUS-2-DECISIONS.md`.

## Regex scripts — done, tailored to the app (2026-11-01) — CLAUDE — D-060

- **Engine:** SillyTavern's, ported and checked against its own code (3,000 random cases). Runs global → preset → character, where SillyTavern runs them (saved user/AI text, reasoning, first messages, edits, prompt history and lore, display).
- **Ours around it:** scripts from presets/cards wait for the user's OK (asked again when a script changes); a saved message keeps its text before regex ("changed by regex · Original"); a chat can switch any script off (Prompt tab); HTML made by scripts is drawn in a sandboxed box.
- **Screens:** Library → Regex; "Regex scripts" in the preset and character editors; the chat bar "N new regex scripts … Review"; the review window. Draft skipped with Daniel's OK.
- **Still open:** a switch per story (data exists: `SetupLayer.regexOff`), pausing slow scripts (`onSlow` exists, no UI), agents' own regex (v1 postProcess).
- Tests: 286 unit, 153 click tests (new: `e2e/regex.e2e.ts`).

## Daniel's PC folder fixed (2026-10-31, 23h30) — CLAUDE

- `Pull dev.bat` (untracked, repo root) now stashes the regenerated lockfiles, moves untracked copies to `_before-pull\`, fast-forwards to `origin/dev` and runs `npm install`. Daniel ran it: the app works.
- Backups left on his PC: the git stashes ("before Pull dev…", "lockfiles before Pull dev") and `_before-pull\`. They can be deleted, together with `Pull dev.bat`, when Daniel says so.
- Sessions may have no shell on his PC (no device_bash): then the way to update his folder is that he runs `Pull dev.bat`.

## Draft 2 in the app, functional (2026-10-31, night) — CLAUDE — D-059

- Daniel: "not yet how I imagine it, but OK for now if it works". The agent editor is now section cards (phases **Pre-Generation / Parallel / Post-Processing**, How it runs incl. inline, context sources incl. chapters / Author's Note / previous notes / min tokens, model override, variables, use as written, hidden notes). The Narrators page is list + wide editor with blocks, one Style line and "What the AI gets" beside it; everything the narrator sends is inside `<narrator>…</narrator>`; New Narrator is blank with "Start from".
- Still ⏳ (see D-059): shared requests, keep notes in history, lorebook scan, preset block, hold until rewritten, append rewrites, format, pin, agent folders, per-story variables screen.
- Tests: 276 unit tests; agents, try-it, memory, stories, round2/3, reliability and prompt-control click tests pass (61).

## Narrators for the 3 modes + draft 2 of the agent and narrator screens (2026-10-31, late) — CLAUDE — D-058

- **Draft 1 rejected** ("still weird, you didn't really look at the two apps; it needs the same or more options than v1; the narrator part is VERY busy; the narrators are too simple"). **Draft 2** (`docs/drafts/agents-v4/index.html`) is built from Daniel's screenshots of Marinara's and v1's editors; `docs/UI-PLAN.md` → "Agents v4 and narrators" has a table of every v1/Marinara option and where it goes (✓ / ➕ / ⏳), and 4 open questions. No screen code until he approves.
- **In the app (D-058):** nine starter narrators from his v1 role presets — Storyteller, Game Master (player), Co-author, Director's Pen, plus Mystery Keeper, Slow Burn, Dread, Living World, Slice of Life — and `about` / `modes` on narrators.
- The repo is now attached to the cloud session (push works).

## Agents round 4 + a plan for the agent screens and the narrator editor (2026-10-31) — CLAUDE — D-057

- **In the app (D-057):** note agents' latest notes go back to the story's AI (switch in the editor; on for labels/cards, off for views/panel notes); **↻ Run again** on notes/cards/views and **↻ New options** on choices, each with an optional **direction for that run** (also in the ✦ panel); a **Model** row per agent (connection profile); the model shows beside a note; Styles text is generic; run failures are no longer silent.
- **Could not reproduce** "regenerating an agent does nothing" through the ✦ panel (it re-ran and replaced the note in the browser preview); the new ↻ buttons run on the message you click and show the reason when a run fails. If it still happens, ask Daniel which button and which agent.
- **Waiting for Daniel:** `docs/UI-PLAN.md` → "Agents v4 and the narrator editor" (5 open questions) and the clickable draft `docs/drafts/agents-v4/index.html` (Library → Agents in three families, New agent window, editor summary sentence, narrator editor with choice rows and "What the AI gets"). No code for those until he approves.
- Tests: 273 unit tests (4 new), agents click tests 14/14 (2 new). The offline test AI now numbers its plain agent answers ("call N") so a re-run is visible.

## How to use CODEX (GPT) from now on (2026-10-31) — CLAUDE — D-056

- **Tasks are cards** in `docs/CODEX-TASKS.md`. Three are Ready: T-001 memory reliability audit, T-002 tests for the late-30/10 additions, T-003 "Export all" chats of a Story.
- **Daniel's routine:** open Codex in `Homunculus-gpt` and say "do the next Ready card in docs/CODEX-TASKS.md". When it says it is done, ask Claude: "revisa a gpt e junta na dev".
- `AGENTS.md` now has a CODEX section (can / cannot) and a Claude section. `gpt` was fast-forwarded to `dev` (it was 16 commits behind).

## Small round (2026-10-30, late) — CLAUDE

- **Starter tracker notes:** Health, Mana, Level, Quests, Factions, Threat, Secrets… come with "What it means in the story" (trackers.json v3); installed trackers get them once, only where a field has no note (`starterTrackersNotes`).
- **Agent failed:** a warning notice names the agent/tracker and the reason, with Edit agent / Edit tracker (Stop is not a failure).
- **Tokens per chat:** the composer footer shows "· this chat: 12.3k tokens" (replies + agents, all branches, as providers reported; cost when reported). `SqlStore.sessionUsage`.
- Also: sidebar ■ Stop, ok notices hide after 6 s, Turn all off in Choose agents, chapter count in the Memory title.

- **Reply ready elsewhere:** when a reply finishes in a chat that is not on screen, a notice says "Reply ready in “<chat>”" with **Open** (App.tsx, from `useTurns`).
- **Library lists side by side:** Kits, Narrators, NPCs, Personas… use a grid of cards (min 300 px) instead of one card per row.

## Memory, agent styles and Daniel's agent review (2026-10-30) — CLAUDE — D-054 / D-055

- **Merged CODEX's `gpt`** into `dev` (D-051 reliability fixes, D-053 Try it); kept dev's workflow rules in CLAUDE.md/AGENTS.md (one line now says CODEX works on `gpt`), took gpt's lockfiles (dev's `package-lock.json` was out of sync: `npm ci` failed).
- **Memory (D-054):** Prompt tab → Memory: chapter summaries, Summarize now, editable chapters; Story page Setup → Memory. Off by default.
- **Agents (D-055):** ✦ panel over the reading column; Setup → Agents is one row + "Choose agents…" window with search; "How it shows" as drawings; tracker fields get "What it means in the story"; agent **styles** (Group Chat: Classmates, Redditors, 4chan…), picked per story/chat.
- Drafts were skipped for these (Daniel asked directly and is short on credits); adjust from his review.

## Try it integrated in the agent editor (2026-10-30) — CODEX — D-053

Daniel approved the visual draft after the text plan and project-example authorization (D-052). Library → Agents → an agent now has **Try it**: select a chat/message and optional connection, Run/Stop, then inspect Result, What it read, Raw answer and provider Reasoning when supplied. The current editor draft is used even if autosave failed. Opening makes no request; text mode makes no AI call.

Preview outputs never apply to the chat/story or create saved runs. Stop/Close/Escape/navigation abort; late answers are suppressed. Context/config changes mark the captured result outdated. Existing saved dependency results may be read, but dependencies are not run. Inline/code modes and tools explain their unsupported standalone status; keepers require a Story chat. Global activation/scopes remain deferred.

Validation: typecheck/build passed; **261 unit tests passed, 2 skipped; all 143 browser flows passed**, including 21 new core tests and 12 new browser flows. Actual/draft captures compared at 1366/620/390 px; full-content checks cover eight cast cards, long names, 25 choices, reduced motion and simulated 150% text. Report: `docs/AGENT-TRY-IT.md`. Only isolated project fixtures/offline or simulated providers were used; real API and native Tauri behavior are not claimed. No private play folder, credentials, other checkout, lockfile or workflow was touched.

Work is local PC editing exclusively in Homunculus-gpt, committed/pushed only to gpt under D-050. Signed: **CODEX**.

## Try it: visual draft ready (2026-10-30) — CODEX — D-052

Daniel approved the text plan and explicitly chose project examples for this draft, replacing the real-data rule for this review stage. The portable interactive draft is `docs/drafts/agent-try-it/index.html`; captures and instructions are beside it. It uses the current Quiet profile and four real starter agent definitions, with scripted old-mill conversation/results and clear review controls. No model/API calls or production changes are included.

Draft validation: 54 layout checks/combinations (four window sizes, reduced motion and 150% text), six interaction groups, minimum sampled text contrast 8.32:1, no page errors or HTTP(S) requests. Final project checks are recorded in `CODEX-LOG.md`. **Visual approval is still pending before implementation.** Agent activation/scopes remain deferred. Signed: **CODEX**.

## Try it: text plan for review (2026-10-30) — CODEX

Daniel deferred the agent activation/scopes task and authorized starting Try it in the editor. The Step 1 plan is in `docs/UI-PLAN.md` under "Try it in the agent editor". It proposes a contextual modal preview of the current draft, explicit Run/Stop, readable results/input details and no application of outputs. It reuses the existing Compare/dry-run foundation. Text approval, visual draft and implementation remain separate HANDOFF gates; no screen, production code or new design decision is implemented by this planning entry.

Validation is recorded in `CODEX-LOG.md`. Signed: **CODEX**.

## Agent reliability fixes (2026-10-30) — CODEX — D-051

The first agent audit reproduced and corrected out-of-order saves, failed drafts being lost on Close/navigation, manual/Compare calls accepting another chat's message, text/code answers being applied after Stop, and concurrent keepers losing lorebook proposals. Agent drafts now use app-owned per-agent queues; Close waits for success, and Delete waits for an active write. Drafts survive navigation during this app session only. Keeper writes serialize per story while model calls remain parallel. Slow Close/Delete completions preserve an editor opened in the meantime. Existing controls and UI appearance are retained.

Report: `docs/AGENT-RELIABILITY-AUDIT.md`. Typecheck/build and 240 unit tests passed (2 skipped); all 129 browser flows passed, then all 18 affected flows passed after the final navigation guards (2 new regressions; suite now 131). Details are recorded there and in `CODEX-LOG.md`. Real API/native/private-data checks are not claimed. Global defaults, Try it and the Library Assistant remain future tasks. Signed: **CODEX**.

## Isolated CODEX checkout (2026-10-30) — CODEX — D-050

Daniel assigned CODEX an exclusive working folder: `C:\Users\danie\Documents\SillyBunny-Classic-Dev\Homunculus-gpt`, cloned from `origin/gpt`. Work only here and on `gpt`; do not use or modify the original project checkout, `dev` or `main`. The older dev-only CODEX workflow is superseded by this instruction. `AGENTS.md` and `CLAUDE.md` now reflect it. CODEX signs its own change notes **CODEX** and prefixes its commit messages `[CODEX]`; existing CLAUDE attribution is preserved.

This task prepares the isolated checkout and its working rules. No application feature or UI change is included. The proposed agent reliability audit is the recommended next implementation task, followed by global agent defaults, an editor dry run, and the Library Assistant. Verification is recorded in `CODEX-LOG.md`. Signed: **CODEX**.

## Agents, round 2 (2026-10-30) — CLAUDE — D-048 / D-049

- **✦ panel** like v1: trackers + agents, live "Running… N s", ▶ run, ✎ edit, **Details · why it did this** (reasoning, what it read, raw answer, result, **Compare** on other models without changing anything).
- **Rewrite comparison**: click "polished" → word-by-word diff, side by side, click a change to keep the original there, Undo all.
- **How it shows** per agent (notes, choices, checks, rewrites) and an explicit **What it reads** (cast incl. narrator + NPCs, persona, active lore, scenario…).
- **Lorebook per story**: Library → Lorebooks → a book → "Showing: <story>'s version". The story keeps only its differences; the original never changes; Save as new / Apply to the original… / Back to the original. The **Lorebook Keeper** starter writes there.
- **Views**: an agent can show a feed, phone messages, a stat sheet or cards (starter "Class Group Chat").
- Tests: 126/126 click tests, 227 unit tests.

## Agents on screen (2026-10-30) — CLAUDE — D-047

- **Library → Agents** (under "Around each reply", beside Trackers): Table or List view, filters by kind, search; the editor saves by itself. Eight small starter agents, one per kind, all off.
- **Switch them on** in a story's or a chat's setup (Agents rows), or in a chat with the **✦** button in the toolbar (also Run for "only when I ask" agents and their notes).
- **In the chat**: choices as buttons under the latest reply (click sends); notes as small labels under the reply; a grey "polished" pencil / amber triangle beside the name when an agent rewrote the reply or a check failed (Undo, Write again).
- **Core**: run mode `text` (no AI call: the agent's own words, `{{random}}` included); Preview Prompt shows those agents.
- Next for agents: Settings → Agents (on everywhere), the full Agents tab as a Settings option, a "Try it" button, tools.

## Review of CODEX's rounds + Prompt/Tracker fixes (2026-10-30) — CLAUDE — D-046

- **Prompt tab:** block edits go to the **shared preset** by default; "Only this chat…" is a quiet secondary link. Text saves as you type (Undo changes instead of Apply/Cancel). Blocks overridden locally are tagged while editing the shared preset. Context size is back in the foot.
- **Story page:** if the story still has block changes from before D-045, a line says so with "Use the preset as it is".
- **Narrator depth/order:** saved on leaving the box or Enter.
- **Exports ask where** (Windows "Save as"; Linux keeps Downloads). Cancel = nothing saved.
- **Trackers:** Import… · Export… · AI guide on the set bar; a subtle **send** icon on each field/group row → menu of sets with Copy / Move (+ A new set), Undo in a quiet line. Guide for other AIs: `docs/FIELD-SET-AI-GUIDE.md`.
- **To check on the PC** (not possible in the cloud session, no package registry): `npm run test:e2e` (prompt-control, presets, field-sets updated) and the real "Save as" window in the app.

## Quiet Story setup (2026-10-29) — CODEX — D-045

Daniel requested less density on Story creation/setup. Removed the full **Prompt blocks** list from Story/Kit pages; the Setup preset picker, Library preset editor and chat Prompt editing remain. Existing stored Story block patches are preserved and still resolve normally; this is a UI removal, not a data migration.

Narrator placement is now a quiet **Prompt placement · Card/System/In chat** disclosure immediately beneath the narrator, inside Cast. Closed by default; depth/role/order/repetition/reset appear only on request. The same placement component retains its existing chat presentation. No new palette, fonts or theme values. Plan and closed/open draft: `docs/UI-PLAN.md`, `docs/drafts/story-narrator/quiet.html`.

Validation: typecheck/build passed; 213 unit tests passed (2 skipped); all 23 affected browser flows passed, including Story/Kit creation, keyboard disclosure and narrator/preset inheritance into chats. Actual closed/open captures were compared with the draft; 620 px layout had no control overflow/page errors. Isolated seeded data only; no private database/native window inspected. Existing lockfile changes excluded. Signed: **CODEX**.

## Review corrections: closing prompt blocks and complete-set export (2026-10-29) — CODEX — D-044

Daniel reported that closing an edited inline prompt block discarded text unless Apply was clicked. Pending block text and card-override settings now save on blur, collapse, scope change or leaving the view. Writes are queued and merged against the latest layer/shared preset; Apply remains available and Cancel explicitly discards pending text. Failed saves keep the draft available for retry while the editor is open.

Daniel also corrected the export workflow. Read the original development source, `GUIA-FIELDS-SCENE.md` §§8–9 and `Homunculus/public/scripts/classic-scene-fields.js:exportPreset`: export operates on the selected complete preset, independent of selected fields. He confirmed **the Homunculus 2 format**, not original-app compatibility. The editor now exposes **Export Set / Import Sets** outside the renamed **Copy or move fields** disclosure. Export includes the whole current set (metadata, all/nested fields, instructions, sections, display/presence settings); checkboxes affect transfers only. Partial/bulk export buttons were removed from this workflow; existing multi-set bundle import remains supported. The original project was read only; private portable data/credentials were not accessed.

This supersedes the earlier export-button instructions below. Updated guide: `docs/FIELD-SET-FORMAT.md`. Validation: typecheck and production build passed; 213 unit tests passed (2 skipped); all 111 browser flows passed, including close without Apply in both scopes, leaving the tab, Cancel, scope switching, direct Preview and complete-set export despite a one-field selection. Captures at 1280/620 px showed no panel overflow/page errors. Existing local lockfile changes remain excluded. Native/private play data was not used. Signed: **CODEX**.

## Functional rounds 4–5 implemented (2026-10-29) — CODEX — D-042 / D-043

Daniel authorized completing these plans while away and reviewing the result on return. Review instructions: `docs/REVIEW-CODEX-2026-10-29.md`.

- **Round 4, prompt control:** text blocks open inline in Prompt and on a Story/Kit. The default scope is the current chat/Story; Shared preset is explicit. Content, switches and ordering are patches keyed by preset/block IDs, inherited Default → Story → chat. Reset resumes inheritance without copying a preset or losing unrelated setup fields. Existing full preset editing remains available. Narrator placement supports the existing card layout (unchanged by default), a separate system block, or a chosen depth/role/order in the prompt, with optional explicit repetition. Preview and actual generation use the same resolution. No saved conversation messages are inserted. A preset without Chat History gets an explained system fallback for narrator depth instructions.
- **Round 5, tracker Sets:** the existing editor now has a closed **Reuse fields and sets** disclosure. Select one/multiple fields, copy/move to another set in that tracker, undo, export this set/selected fields/all sets, or import Homunculus JSON as new sets. Stable keys, nested columns and presentation are retained. Collisions and moves leaving an empty source are refused as a whole. Imports validate the entire file, never overwrite sets or change the default, and remain a draft until Save. Undo disappears after later definition edits/Save. These operations do not migrate or delete saved chat values.
- **Portable format and future Assistant:** `docs/FIELD-SET-FORMAT.md`, with a tested example in `docs/examples/travel-field-sets.json`. No subject-specific fields or real AI service are built into this feature. Round 6 (multi-character card extraction into NPCs) still depends on the Library Assistant; it is not implemented by this round.
- **Scope:** Customize and visual refinement stay deferred. Existing local changes in `package-lock.json` and `apps/desktop/src-tauri/Cargo.lock` are preserved and excluded from the feature commit. Native/private play data and credentials were not inspected.

Validation: typecheck/build passed; 213 unit tests passed (2 skipped); the full 105-flow browser suite passed, then 18 affected flows passed after fixing tracker editor container sizing (includes one new regression; suite now 106). Final captures at 1280/620 px show no reuse-panel/ancestor overflow. Details and manual-check limits are recorded in the review document and CODEX log. Signed: **CODEX**.

## Current priority: application functionality first (2026-10-29) — CODEX — D-041

Daniel asked to set UI refinement aside and focus on completing application functionality. Customize and further visual revisions are deferred until the app is more complete. Keep the approved UI as the current baseline; this does not remove the customization-first architecture requirement or authorize dropping features. CODEX must document its changes in English and sign them **CODEX**. The existing six-round plan resumes with round 4 (prompt control), then round 5 (tracker field sets); round 6 (multi-character cards to NPCs) still depends on the Library Assistant. No next feature is implemented by this priority update.

Signed: **CODEX**.

## Approved navigation draft in the app (2026-10-29) — CODEX — D-040

Daniel asked to finish the approved draft before Customize. Primary navigation is now **Stories / Characters / Library**. Library groups **Kits, Narrators, NPCs**, **Personas, Lorebooks, Presets**, **Trackers**, and **Trash**. Group headings are quiet text; categories are indented with a faint selected state. Existing editors, actions and data are retained. Stories and Characters share collection filters, scoped search, folders, vertical cards and details. **Ctrl+K** searches stories/chats, character names and Library resources.

The new **Quiet** appearance profile is the default; Graphite remains registered. Navigation groups and recent-list behavior are profile data in `theme/navigation.ts`; collection/layout values remain tokens. **Customize is not implemented yet.** Do not reintroduce the rejected revision's heavy outlines and tinted boxes on every control. This is a customization-first project: reorganizing the UI must not silently remove capabilities.

Validation: typecheck and UI build passed; 194 unit tests passed (2 skipped); all 100 browser flows passed, including narrow-window navigation and global search. Screenshots use isolated test data, not Daniel's private database. The real native window still needs Daniel's check. Existing local changes in package-lock.json and Cargo.lock are preserved and excluded from this UI commit. Signed: **CODEX**.

## Node.js tooling update (2026-10-29) — CODEX — D-039

Development, CI and release builds use **Node.js 24 LTS** (`.nvmrc`, `engines.node`, Node types and README aligned). Both workflows use `checkout@v6` and `setup-node@v6` to remove the warning about the actions' old Node.js 20 runtime. Node.js 22 itself remains supported until April 30, 2027.

## How to use it (Daniel's PC), inside the project folder
- **Easy way (10/28):** double-click **`Open Homunculus.bat`**: it runs `npm install` (quick when nothing changed) and opens the app with the newest code. The black window has to stay open while you use the app.
- **For the tester / public versions (10/29, D-037):** `docs/RELEASING.md` — Actions → **Publish release**; the installed app updates itself (it asks first). Windows installer, Linux `.deb` and AppImage (D-038).
- **As an installed program:** double-click **`Build installer.bat`** → wait (the first time takes 10 to 20 minutes; after that, a few minutes) → the folder with `Homunculus_<version>_x64-setup.exe` opens → install. Homunculus then opens from the Start menu, without the black window. Sessions, characters and keys are kept (they live in the app's data folder and in the Credential Manager, not in the program). Windows may warn about an "unknown publisher" (the app is not code-signed): "More info" → "Run anyway".
- The installed app and `Open Homunculus.bat` use **the same data**. Only screen preferences (sidebar open/closed) are separate.
- Opening the app from a terminal (old way): `npm install`, then `npm run app`.
- Core tests: `npm test`.
- Full battery (Claude runs it before delivering): `npm run test:all` (on the PC it needs `npx playwright install chromium` once — optional).

## ✅ Everything in English + Linux installers (10/29, 19h40) — CLAUDE — D-038
Daniel: "all files in git must be in ENGLISH" (and "save" that as a rule), and "can you make installers for Windows and Linux Debian?". His answers: rename everything, **including the data folders**; on Linux publish **.deb + AppImage**.
- **Translated:** these notes (were `PASSAGEM.md`), BLUEPRINT, UI-PLAN, MEMORY-PLAN, the release and tester guides, CHANGELOG, the CODEX log and draft notes, issue forms, workflows, batch-file messages, script messages and code comments (Daniel's quotes are now in English too).
- **Renamed:** `Open Homunculus.bat`, `Build installer.bat`, `Build portable version.bat`, `Set up updater.bat`, `HANDOFF.md`, `CODEX-LOG.md`, `docs/RELEASING.md`, `docs/TESTING.md`, `scripts/portable/` (`Update Homunculus.bat`, `portable.txt`), drafts `README.md` / `CODEX-PLAN.md`, issue forms `bug.yml` / `idea.yml`.
- **Data names:** portable folder `data` (was `dados`), `keys.json` (was `chaves.json`), `window` (was `janela`), env var `HOMUNCULUS_DATA`, build folder `Homunculus Portable`, `source.txt` (was `origem.txt`). **The app renames an old portable folder once, by itself**, the first time the new version opens it. `Build portable version.bat` also copies the new program into the old `Homunculus Portatil` folder if it exists, so the old update script of Daniel's play folder still works once; after that, copy `Update Homunculus.bat` and `source.txt` from `Homunculus Portable` into the play folder.
- **Linux:** "Publish release" builds Windows and Linux (Ubuntu 22.04) at the same time; `latest.json` is written once from both. The **AppImage** updates itself like Windows; a **.deb** is updated by the package manager, so the bar says "Homunculus X is out" and **Download** opens the release page (`update_channel` in Rust, `@tauri-apps/plugin-opener`). On Linux the API keys go to the Secret Service (GNOME Keyring / KWallet) so they survive a restart.
- **CI:** also checks that the Rust shell compiles (Linux).
- **Rule for the next sessions:** `CLAUDE.md` / `AGENTS.md` at the root: everything in git in English.

## ✅ GitHub + automatic updater (10/29, 19h) — CLAUDE — D-037
Daniel: "I already have a tester. How do I make it look nice on my GitHub, with an automatic updater?" Answers: **public** repository, he has **GitHub Desktop**, the app **tells and asks**, the tester uses the **installer**.
- **In the app:** a quiet bar on top when there is a new version ("Homunculus 0.2.0 is ready" · What's New · Later · **Update & Restart**), a progress line, a clear message if it fails. **Settings → About**: version, "Check for Updates", What's New. No update check in browser mode, in `Open Homunculus.bat` or in the portable version.
- **On GitHub:** **Actions → Publish release** (type the number) → tests, builds the installer, signs it, publishes the Release with `latest.json` and saves the new number in the files. README with download and screenshot, `CHANGELOG.md` (becomes the "What's New"), tester guide `docs/TESTING.md`, issue forms "Bug" and "Idea", automatic tests on every push.
- **Live:** <https://github.com/VasahTS/Project-Homunculus> (public), branches **`dev`** (daily work) and **`main`** (what the tester gets; only it publishes). `Set up updater.bat` links this folder to the repository on `dev` without moving it.
- **Daniel's steps:** `docs/RELEASING.md` (1. `Set up updater.bat` + paste the secret + Add local repository in GitHub Desktop; 2. dev → main and Run workflow on main; 3. send the guide to the tester).
- **Files:** `apps/desktop/src/updates.ts`, `ui/UpdateBar.tsx`, `ui/About.tsx` (new), `ui/SettingsPage.tsx`, `App.tsx`, `styles.css`, `vite.config.ts`, `vite-env.d.ts`, `package.json`, `src-tauri/Cargo.toml`, `src/lib.rs`, `capabilities/default.json`, `tauri.conf.json`; `scripts/release/*` (version, notes, key, overlay, latest.json + tests), `.github/` (workflows, issues), `Set up updater.bat`, `.gitattributes`, `.gitignore`, `README.md`, `CHANGELOG.md`, `docs/RELEASING.md`, `docs/TESTING.md`, `docs/images/app.png`; test `e2e/updates.e2e.ts`.
- **Checked on GitHub:** typecheck + unit tests green on `main` and `dev`. Click tests not run in the cloud (they run on the PC: `npm run test:all`).

## Play version (10/29) — CLAUDE
Daniel has a **private** portable version, **outside the project folder**, to play with his personal cards. Claude does not touch it, does not see it and **never asks for access**. How it works inside: D-030 in `docs/DECISIONS.md`.

## 🔒 NEW UI RULE: draft before code (agreed with Daniel on 10/28, 04:40) — CLAUDE
**Applies to every screen change from now on (Claude or CODEX).** Why: the last UI rounds were done straight in code, without a concrete reference, tested only with the offline mode's fake data, and the Scene panel got worse with every attempt. Daniel decided: **first plan the panels and the hierarchy, then drafts, only then code.** The Scene already went through steps 2 and 3 (C — Quiet, below); the next panel starts at step 1 (`docs/UI-PLAN.md`).

**Step 1 — UI document (text, no screens).** Create `docs/UI-PLAN.md` (and a copy in the "Homunculus 2" Project). One section per panel: sidebar, chat (messages, receipt, composer), inspector (Scene, Prompt, Reply), prompt window, Library (Characters, Personas, Presets, Trackers, Trash) and editors, Settings. For each panel, write:
- **What it is for** (one sentence) and **when Daniel looks at it**.
- **Hierarchy:** what is primary (seen at a glance), secondary (seen when looking for it) and hidden (only on request). For cards: what shows **closed** and what shows **open**.
- **States:** empty, loading/updating, normal and **full** (8+ characters, 2–4 line texts, long lists, long names), plus error.
- **Actions:** what can be done there and where each button goes.
- **What comes from v1** (with the v1 function or CSS name) and **what is different**, and why.
- **Open questions** for Daniel.

Daniel reviews and approves that text **before** any draft.

**Step 2 — Drafts with real data.** One visual draft per panel (artifact/page), with 2–3 versions side by side when in doubt. **Always with Daniel's real data**: a copy of his `homunculus.db` (ask for access to the app's data folder, probably `C:\Users\danie\AppData\Roaming\com.vasahts.homunculus\`, and work on a copy) and, for the Scene, v1 running (`Homunculus-Teste.bat`, port 4490, viewed in the app's browser) or screenshots of it. **Never** judge a layout with the offline mode's loose words. Iterate on the draft until Daniel approves. **No code in this phase.**

**Step 3 — Code equal to the approved draft.** Implement by copying the draft. Before delivering: test with the copy of the real database and **compare the app's screenshot × the draft, side by side**; send both screenshots to Daniel. If something depends on data already installed in his database (like the "Show as" of D-024), check on the database copy that it really arrived.

**Step 4 — One panel at a time.** Start with what bothers him most: **the Scene** (see the rejection note below). Each round changes one panel only and does not break the rest.

## ✅ Round 3: organization — Characters, folders everywhere, chats with search and export, Kits, the "Add…" window, Save to the Vault, the character in the Prompt tab (10/29, 16h) — CLAUDE — D-036
Built from the approved drafts (canvas "Homunculus 2 — Organização"; plan in the Project: `UI-PLAN-ORGANIZACAO.md`).
- **Sidebar:** new place **Characters** (moved out of the Library tabs). The long chat list and the "New session" popover are gone: **Recent** now shows the last 3 chats (story chats too, with the story's name); the sidebar search lists all of them.
- **Characters:** cards in **folders** (folders inside folders; the search looks in all of them). Clicking a card shows the whole character (versions, description, personality…) with **Continue / + New Chat**, Edit, Turn into a Story, Export, its folder, and **its chats** at the end.
- **Folders everywhere** (Characters, Vault: Stories, Kits, Narrators, NPCs; Library → Lorebooks): a path "All › Fantasy › Elves" + **discreet** folders (one line: small icon, name, count — Daniel's request mid-round). Drag a card onto a folder, or use "Folder" on the sheet. In Vault → NPCs, the NPCs of each story/Kit show as a folder of their own.
- **Chats:** a list with search by name **and by content** (the word is highlighted; the click opens the chat at that message) and ⋯ Open / Rename / **Export as** (full Homunculus, SillyTavern JSONL, Markdown, text) / Move to Trash. On a Story's page they sit **at the end of the page**.
- **Kits** (the v1 name is back): Vault → Kits; Story → More… → **Save as Kit**; Kit → **Start a Story** (a copy: changing the Kit later does not change the stories).
- **Big "Add…" window** (+ Add a Card, + From the Vault, narrators): opaque background, search, folders, "Recently used", preview, keyboard (↑ ↓ Enter Esc).
- **Save to the Vault:** in the Scene, someone only the tracker knows gets "Save to the Vault…": name, sheet, **where to keep it** (the chat's story / folders / loose / + new folder) and "keep in this chat".
- **Character in the Prompt tab:** at the top, editable right there (each field opens with one click, several together; saves by itself to the version the chat uses); **the whole group folds into one line** and remembers. "Full editor" opens the full editor.
- **Left for later:** "Export all" for a story; the Vault Assistant splitting multi-character cards into NPCs (waits for the assistant); the folders' look as an option of each theme (Daniel's idea, noted in `Theme-Ideas.md` in the Project).
- Tests: 91/91 click tests (7 new in `e2e/round3.e2e.ts`), 187 unit tests passing (4 new), typecheck clean.
- **Adjustments after Daniel tried it (18h40):** bigger, elegant folders (folder mark, name, how many items, faces), taking the whole width above the cards; the folder's ⋯ menu is no longer cut off; **press and drag** cards (and folders) onto a folder or onto "All" (done with pointer events, works in the app window); the Story's Chats sit at the end of the left column; "Add…" window with **Folders | All**; Vault → Stories works like Characters (sheet with Continue / + New Chat and the chats); the "new version" test is no longer flaky. 93/93 click tests.

## ✅ Round 2: version in the Story, clearer fields, editors with several open, pictures in the Vault (10/29, 15h) — CLAUDE — D-035
Daniel's request (14h16): "go ahead with round 2". About optional fields: he thought it already existed (it does: "Always filled" off) and the AI needs to be told when NOT to fill it; and he mixed up "one value" × "one per character".
- **Character version in the Story:** on the Story's page, every card with versions has "Main / <version>" beside it (and the narrator card too, in "Change…"). Chats that already existed start using the new version (except a chat that had picked another one just for itself).
- **Clearer tracker fields:** "one value" became **"one for the whole scene"**, "one per character" became **"one for each character"** (with "?" and examples: Mana, Mood → each character). The note box now says **"What the AI should write here — and when to leave it empty"** (example: "Only for characters who use magic. Leave it empty for anyone who doesn't."). With "Always filled" off, the AI gets "Optional: leave it out for anyone it does not apply to" and the Scene shows the empty field as **"Not used: Mana"** (no longer "Not known yet").
- **Tracker editor:** several fields open at the same time + **Open All / Fold All**; the Set you were editing is remembered.
- **Preset:** several blocks open + **Open All / Fold All**; the text box grows with the text; **"Bigger ⤢"** opens the block's text in a large window.
- **Pictures for NPCs, Narrators and Stories:** click the picture (or the letter) to set/change it; "Remove" takes it out. A Story without its own picture uses the narrator's. Shows in the Vault, the editors, the Story page, the sidebar and the Scene.
- **Fix:** in a Story chat in a narrow window, "with …" covered the "Story Page" button; "Move to Trash" became a trash icon and the buttons on the right no longer shrink.
- **For Daniel to check:** Vault → NPCs → click the NPC's letter → pick a picture. Library → Trackers → Scene: Characters → Fantasy → close and open again (still Fantasy); open Mana and Race together. Library → Presets → Open All / "Bigger ⤢". A Story's page with a card that has versions → pick the version.
- Verification (no npm here): **84/84 click tests** (4 new in `e2e/round2.e2e.ts`), 183/187 unit tests (the same 4 `skipIf` ones), typecheck with no new error. **On the PC: `npm run test:all`.**
- Files: `ui/ImagePicker.tsx` (new), `ui/StoryPage.tsx`, `ui/Vault.tsx`, `ui/TrackerEditor.tsx`, `ui/PresetEditor.tsx`, `ui/ScenePanel.tsx`, `ui/Sidebar.tsx`, `ui/ChatView.tsx`, `App.tsx`, `styles.css`, `packages/core/src/trackers.ts`; test `e2e/round2.e2e.ts`; `docs/DECISIONS.md` (D-035).
- **Next:** round 3 (organization) starts with the text in `docs/UI-PLAN.md` + a draft: Chats at the bottom and discreet on the Story page, a large window with search for "Add a Card"/NPC, folders, saving an NPC to the Vault, Scenarios.

## ✅ Replies keep going outside the chat + Cast like v1 (10/29, 14h) — CLAUDE — D-034
Daniel's request (10/29, 13h40): start with round 1 of the plan (`claude/PROXIMOS-PASSOS.md` in the Project) and, with it, in the Cast: delete an NPC, drag (also between Here and Away, like v1), open in place "without going to another screen", and Show All / Fold All.
- **The reply keeps going when you leave the chat.** You can open another chat (or the Library, the Story page…) and come back: the text keeps arriving, the trackers run and the branch moves on by itself. **Several chats can generate at the same time.** In the sidebar the chat that is writing shows "writing…" (or "updating the scene…") with a blinking dot; the Story shows "writing in Chat 2…" even when closed. Stop works when you come back. Moving a chat to the Trash stops its reply.
- **Scene → Cast:** clicking a person **opens right there**, under the row (the separate page is gone); **Show All / Fold All** beside "In the scene" (the app remembers who was open). **Dragging** by the ⋮⋮ (shows on hover) changes the order — saved per chat — and dropping below "Not in the scene" takes the person out of the scene (and vice versa); also by keyboard (focus on ⋮⋮ + arrows). An empty group becomes a dashed drop target.
- **Removing an NPC from the cast:** × on hover → "Remove" to confirm. An NPC added to the chat leaves the chat; an NPC the tracker brought in disappears with its values at this message. A Story's NPC leaves through the Story page (its × already existed); the card and you do not leave.
- **Fix along the way:** the ✎ ("you changed it") showed on everyone when you changed one person's value (the whole field is saved); now only where the value differs from what the tracker wrote.
- **UI rule:** no draft this time because the request was "like v1" — I copied the behavior of v1's `classic-scene.js` (read in the code). If the look does not please, the next round goes through a draft.
- **For Daniel to check:** `Open Homunculus.bat` → in a chat, send a message and switch chats right away → see "writing…" in the sidebar → send another message in the second chat → go back to the first. In the Scene (with Scene: Characters on): click a person, Show All, drag someone to "Not in the scene".
- Verification (no npm here: app bundled with esbuild, vitest replaced by node:test): **80/80 click tests** (3 new: `e2e/background.e2e.ts`, `e2e/cast.e2e.ts`; `trackers.e2e.ts` adjusted for "opens in place"), 183/187 unit tests (the 4 that fail use `skipIf`, which the stand-in lacks — as before), typecheck with no new error. **On the PC: `npm run test:all`.**
- Files: `apps/desktop/src/turns.ts` (new), `ui/ChatView.tsx`, `ui/Sidebar.tsx`, `ui/ScenePanel.tsx`, `App.tsx`, `offline-ai.ts` (`__h2ReplyDelayMs` for the tests), `styles.css`; tests `e2e/background.e2e.ts`, `e2e/cast.e2e.ts`, `e2e/trackers.e2e.ts`; `docs/DECISIONS.md` (D-034).
- **Next (plan in the Project, `claude/PROXIMOS-PASSOS.md`):** round 2 (character version in the Story, optional field, remember the open Set / several fields open, expandable preset, pictures for NPC/Narrator/Story). Round 3 with Daniel's clarifications: on the Story page the **Chats go to the bottom, discreet** (not the big grid on top), and "Add a Card"/NPC opens a **large window with an opaque background**: list on the left + search. "Split into NPCs" waits until the Vault Assistant exists.

## ✅ Stories in the app, like the approved draft (10/29, 06h) — CLAUDE
Daniel approved the drafts of the canvas **"Homunculus 2 — Stories"** ("it's good, make it exactly like this"). Decision **D-031** (D-030 is the portable version). **To try it: `Open Homunculus.bat`** (nothing in the database changes format).
- **The Story is the template; every chat inherits.** The Story's setup (Preset, Connection, Agents connection, You play as, **Trackers** with the field set, **Agents**) applies to all its chats. Each row shows "Default · …" until you pick something else. A chat can change one row just for itself: **"changed in this chat"** appears and **"Use the story's"** goes back to the Story's. Changing the Story applies to the chats that did not change that row, from the next reply on. Inside it is the Default → Story → chat layering that already existed (`resolveSetup`); now the screen uses it.
- **Story page:** cover, name (click to rename), scenario; on top **Duplicate**, **More…** (Rename, Move to Trash), **New Chat** and **Continue <newest chat>** (without chats: **Start Story**). Left: **Chats** as cards (name, last line, number of messages, when, which opening, "N changes", the newest one marked), **Cast** (Narrator with "Change…", NPCs, Characters), **How it starts** (Scenario + openings in tabs 1, 2, 3… + "+"; **"+ From a card's greetings"** brings the first message or a greeting from any card, the Story's own first — Daniel's request at 06:15). Right: **How you play**, **Setup**, **Trackers**, **Agents** (empty for now), **Lore**.
- **New Story:** "How do you want to play?" (3 cards), **Start from** (one of your cards, with a summary of what comes from it; an empty Story; Assistant "Later") and, beside it, the Story's setup with the trackers; footer "Ready to play". "Turn into a Story" on a card's sheet opens this same screen with the card picked.
- **New Chat:** name (suggests "Chat N"), which opening (says in which chat each one was already used) or **Write my own**, and the setup "Same as the story" with "Change for this chat…".
- **A Story's chat:** on top "‹ Story / Chat 1" and the **Story Page** button. **Prompt** tab: "This chat follows <Story>", the same setup block (each row "from the story") and the trackers; the preset blocks and Preview Prompt stay below. Scene and Reply follow the Story's trackers.
- **Sidebar:** each Story shows once ("N chats"), with its chats under a small arrow that opens (the open Story comes open).
- **Director mode (Daniel's request at 06:15):** "User" no longer shows as a person in the Scene and is not followed by the trackers (`userInStory`); the "You play as" row disappears from the setup.
- **Old names:** "Isekai RPG, session 2" becomes **"Chat 2"** by itself when the app opens.
- **Not touched:** 1:1 chats stay as before (old Prompt tab). Kits stay for later.
- Verification: **167 core tests** (3 new) + **62 click tests** (1 new: Story setup → chat, "changed in this chat", "Use the story's", a second chat inherits only the Story's; and the greeting as an opening + Director without "You play as"), typecheck clean. App × draft screenshots side by side (without the real database: access is still blocked).
- **Files:** `ui/SetupFields.tsx` (new), `ui/StoryPage.tsx`, `ui/Vault.tsx` (New story), `ui/Sidebar.tsx`, `ui/ChatView.tsx`, `ui/ConnectionPanel.tsx`, `ui/ScenePanel.tsx`, `ui/ReplyPane.tsx`, `trackers.ts` (on/off per layer), `connection.ts`, `App.tsx`, `styles.css`; core: `chat.ts` (`nextChatTitle`, `openingText`, `setup` on the new chat), `trackers.ts` and `agents/runner.ts` (`userInStory`).

**For Daniel to check:** `Open Homunculus.bat` → Stories **+** → pick a card in "Start from" → tick Scene: World and Scene: Characters (Fantasy) → **Create Story** → **Start Story** → **Start Chat** → **Prompt** tab: turn on Scene: Plot ("changed in this chat" appears) → **Story Page**: the chat's card shows "1 change".

## ✅ Quick Connection (from v1) in the app (10/29, 10h50) — CLAUDE
Daniel's request: "add the quick connections from my homunculus project and SillyTavern's quick replies" → draft on the canvas **"Homunculus 2 — Quick Connection & Quick Replies"** → **"let's think about the Quick Replies logic later. Just do the quick connections for now."** (Quick Replies: drafts A bar / B button and the edit screen stay on the canvas, undecided.)
- **From v1** (`public/scripts/classic-quick-connect.js`): a chain button in the text box → a window on top of it: **Connections** on the left (click = use it now), **Models · <connection>** on the right (search, ⟳ reload, ★ pin to the top with a "Pinned" section, "Use “typed-id”" or Enter for a model not on the list), footer with **Manage** (Settings → Connections), Esc closes.
- **Difference from v1:** the chosen connection applies **to this chat** (it is the same choice as the "Story" row of the Prompt tab; in a Story chat, picking the Story's goes back to inheriting). The chosen model is **saved in the connection** (as in v1), so every chat that uses that connection starts using the model. The stars are saved in the app (`app_settings` `quickConnectPins`), per connection. The model list is the same as Settings' "Browse" (one fetch per address, kept while the app is open).
- Verification: 1 new click test (`e2e/quick-connect.e2e.ts`: connection for the chat, list, star, search and pick, typed ID + Enter, Esc, Manage); full battery 76/77 (the one that failed passed on its own, it was slowness); typecheck with no new error.
- Files: `apps/desktop/src/ui/QuickConnect.tsx` (new), `ChatView.tsx` (button in the text box), `App.tsx` (shared `listModels`), `ModelPicker.tsx` (`rememberModels`), `kit.tsx` (`link` icon), `styles.css`.

**For Daniel to check:** `Open Homunculus.bat` → a chat → chain button to the left of the text box.

## ✅ Author's Note in the app (10/29, 10h30) — CLAUDE
Daniel's request: "do the Author's Note now". Draft first (canvas **"Homunculus 2 — Author's Note"**); he picked **A, "but make it collapsible"**. He also asked to send the cards' **Character's Note** (ST's depth_prompt, imported and ignored before).
- **How ST does it (code read):** `public/scripts/authors-note.js` `setFloatingPrompt`: text, **every N of your messages** (1 = always, 0 = never), **where** (in the chat N messages from the end / after the main prompt / before), **role**; a default note for new chats; the lorebook entries "around the Author's Note" (`world-info.js` ANTop/ANBottom) only go when the note goes. Marinara: only text + depth (`generate.routes.ts`).
- **On screen:** an **Author's Note** group at the top of the **Prompt** tab (text, tokens, **Sent** every N of yours, **Where** In the chat + N back / After / Before the main prompt, **As** System/User/AI). It **folds** with the title's arrow: one line remains with the start of the note and "every turn · in the chat, 4 back · System"; clicking opens it; the app remembers open/closed. In the chat a dashed purple line **"Author's Note goes here · 4 messages back"** shows where it goes (clicking opens the Prompt tab). The same group on the **Story page** (applies to all its chats) and in **Settings → Defaults → "Author's Note for New Chats"**. Each row inherits by itself (Defaults → Story → chat); in a Story chat "from the story" / **"changed in this chat"** + **"Use the story's"** appear. The Reply tab shows "Author's Note" and "Character: Character's Note".
- **Engine:** `SetupLayer.authorsNote` (text, interval, position, depth, role; each field inherited on its own in `resolveSetup`), `authorsNoteGoes` (ST's rule), `buildPrompt` (note + lorebook entries around it; when it does not go this turn the Reply tab says why), Character's Note always at the card's depth/role. Without a note written the prompt is the same as before.
- **Verification:** 7 new unit tests (`authors-note.test.ts`); **76/76 click tests** (4 new in `e2e/authors-note.e2e.ts`: Prompt tab + mark in the chat + fold/unfold + goes in the prompt; every 2 / after the main prompt / as User; Defaults; Story → chat → "changed in this chat" → "Use the story's"); typecheck with no new error. Screenshots of the Prompt tab (open and folded) and of the Story page checked against the draft.
- Files: `schemas/src/setup.ts`, `core/src/setup.ts`, `presets.ts`, `turn.ts`; `apps/desktop/src/ui/AuthorsNote.tsx` (new), `ConnectionPanel.tsx`, `ChatView.tsx`, `StoryPage.tsx`, `SettingsPage.tsx`, `SetupFields.tsx`, `promptSources.ts`, `App.tsx`, `styles.css`; tests `packages/core/test/authors-note.test.ts`, `e2e/authors-note.e2e.ts`.

- **Careful (10h17): two agents at the same time.** Another agent wrote `ChatView.tsx` at 10:11 from an earlier copy (it added "follow the end of the chat only when you are at the bottom" + a "Latest ↓" button and "empty Enter asks for a reply") and the Author's Note's link to the chat disappeared (3 click tests failed on the PC). Claude merged both versions (nothing from the other agent was removed) and the tests passed again. **The CSS of the "Latest ↓" button is missing** (`.to-end-dock`, `.to-end`): it is not in `styles.css` — either it was never written, or Claude's 10:10 delivery overwrote it. Whoever made that button should check. Rule to avoid it again: **one agent at a time changing the code**, and re-read the file from disk before writing.

**For Daniel to check:** `Open Homunculus.bat` → a chat → **Prompt** tab → write in the **Author's Note** → the purple line appears in the chat → send a message → the **Reply** tab shows "Author's Note" in what was sent. The small arrow beside the title folds the group.

## ✅ Branches v2: straight to the point, like SillyTavern and Marinara (10/29, 09h40) — CLAUDE — D-032 v2
Daniel tried it twice: first "the branch option isn't showing" (the button did not exist on the last message nor on his own) plus visual bugs; the first fix (09h) was still "weird": a notice "New branch starts with your next message" and the branch only existed after writing ("it felt like SillyTavern's checkpoint"). Request: **straight to the point, branches inside branches, working like ST/Marinara without losing our additions.**
- **How ST and Marinara do it (code read):** ST `public/scripts/bookmarks.js` `createBranch` + `branchChat` (copies the chat up to the message and opens the copy right away); Marinara `ChatArea.tsx` `handleBranch` → `POST /chats/:id/branch` (copies up to the message, switches to the new branch "New Branch", renamed later in the "Chat Branches" list, which shows the current one first and then by date). Map: `docs/reference/README.md` → "Swipes, branches, chat tree".
- **Now:** a ⑂ **Branch from here** icon on every message (yours or the AI's, the last one too) → the branch **already exists and you are on it** ("⑂ Branch 2 ▾", with a quick notice "New branch · you are on it" under the button). No form, no strip above the text box. Whatever you do next (write, New Version, delete) stays **only in that branch**. Branches inside branches, as many as you like. Rename/delete/switch from the "⑂ ▾" list.
- **Branch from one of your messages:** the branch ends at your message; its bar has **Get a Reply** (generates the reply there) or you write another one.
- **Our additions stay:** nothing is copied (the messages before the split are shared and the world state is tied to each message, so the branch starts with the right Scene); "The story splits here" marker; tree (Show Tree, with Go Here and Branch from here); Make a Separate Chat (that one is a copy, as in ST); versions ‹ 2/3 › on any message.
- **Each branch is as independent as a copy:** versions (New Version) made in one branch do not show as versions in another; deleting a message in a branch only deletes what **no other branch uses** ("Other branches keep the messages they use"); deleting a branch deletes only its own messages. **Exception:** editing (pencil) or hiding from the AI a message that comes **before** the split changes it in both branches (it is the same message). If Daniel wants, editing can make a copy just for that branch.
- **Inside (D-032 v2):** a branch is a **name + its last message** (`branches.end_message_id`, migration 9). `core/branches.ts` `resolveBranches` (paths, own messages, where it splits), `splitPoints`, `deletableFrom`. When an old chat opens, the names saved by the 07h version become "ends" by themselves (once); a chat with none becomes "Main". The app remembers which branch you were on in each chat (`app_settings` `branch:<chat>`).
- **Verification:** no npm here (app bundled with esbuild, vitest replaced by a simple runner): 178/179 unit tests (the failing one is a limitation of the stand-in and failed the same before); **72/72 click tests** (10 in `branches.e2e.ts`, rewritten); typecheck with no new error. **On the PC: `npm run test:all`.**
- Files: `packages/core/src/branches.ts`, `storage/store.ts`, `storage/migrations.ts`, `schemas/src/play.ts`, `apps/desktop/src/ui/Branches.tsx`, `ChatView.tsx`, `App.tsx`, `styles.css`; tests `packages/core/test/branches.test.ts`, `storage.test.ts`, `e2e/branches.e2e.ts`; `docs/DECISIONS.md`.

**For Daniel to check:** `Open Homunculus.bat` → a chat → ⑂ on the last reply → you are already on "Branch 2" → write → "⑂ Branch 2 ▾" shows both; ⑂ on a message of Branch 2 → "Branch 3" inside it.

## ✅ Branches in the app, like the draft (10/29, 07h) — CLAUDE — D-032
Daniel approved ("go ahead and do it like that, looks good but I need to test it"), with option (a) for swipes: a path continued from an older version becomes a branch by itself, with a name. Made like the canvas **"Homunculus 2 — Branches"**:
- **Nothing is copied:** messages are already a tree and the world state is tied to each message. A branch is a path to an end (`core/branches.ts`). Versions nobody continued stay versions (‹ 2/3 ›). Main = the oldest. Only the name is saved (table `branches`, the "head" = the first message that belongs only to that branch), so the name does not change when other branches appear or disappear.
- **At the top of the chat:** "⑂ Main ▾" opens the list (the current one first with "you are here"; name, last line, number of messages, when, where it splits; rename with the pencil; delete **for good** with confirmation — the branch on screen cannot be deleted; Show Tree; Make a Separate Chat).
- **Action bar on every message** (shows on hover; always shown on the last one): ‹ 2/2 ›, Copy, Edit (old text kept as a revision), New Version (only on the last reply), **Branch from here** (name + "Create Branch"; the branch starts with your next message; a strip above the text box says so and has Cancel), Hide from the AI (the message turns faint with "hidden from the AI" and does not go to the AI), Details | Delete (deletes the message and everything after it, for good, with a confirmation saying how many).
- **Marker** "The story splits here · N branches ▸" under the message where the story splits; opens the list with "Go".
- **Tree** (Show Tree): the whole chat, the path on screen in green, "Every message | Only where it splits", on the right the chosen message with Go Here / Branch from here and the branches that start at it.
- **Where it shows:** sidebar "Chat 1 ⑂ 3", the chat's card on the Story page "3 branches".
- **Make a Separate Chat:** a new chat with that branch's messages and each one's world state (`ChatService.copyPathToNewChat`), named "<chat> · <branch>".
- Left out: search in the branch list (the draft had the magnifier) and translation (does not exist in the app yet). Agreed for the future: name chats by themselves around message 4–5.
- Files: `packages/core/src/branches.ts` (new), `storage/store.ts` (`messageLinks`, `messagesOf`, `deleteMessages`, `deleteBranch`), `chat.ts` (`copyPathToNewChat`), `apps/desktop/src/ui/Branches.tsx` (new), `ChatView.tsx`, `Sidebar.tsx`, `StoryPage.tsx`, `App.tsx`, `styles.css`, `theme/tokens.css` (`--pop`: solid menus on top of text).
- Verification: 171 unit tests (4 new in `branches.test.ts`) + 68 click tests (6 new in `e2e/branches.e2e.ts`), types ok; app × draft screenshots side by side.

## (history) Branches: text plan (10/29, 06h30) — CLAUDE
Daniel's request: branches "similar to SillyTavern or Marinara; Aventuras' is quite limited". Following the UI rule: **text plan first** (`docs/UI-PLAN.md` → "Branches"), then draft, then code. **Daniel's answers (06:39):** (1) a marker on the message where the story splits: **yes**; (2) he still did not understand the swipe question (explained again in the conversation; the draft shows the recommended option); (3) deleting a branch **deletes it for good** (does not go to the Trash); (4) **tree view now**. He also sent Marinara's message action bar (copy, translate, edit, regenerate, bookmark, hide, search, branch, delete) as a reference. Drafts on the canvas **"Homunculus 2 — Branches"**. Afterwards: more work on Settings ("still a lot of basic stuff missing"). Code read: ST `public/scripts/bookmarks.js` (`createBranch`, `createNewBookmark`), Marinara `docs/chats/branches.md` + `routes/chats.routes.ts` (`POST /:id/branch`). **Our advantage:** messages are already a tree and the world state is tied to each message, so a branch does not need to copy anything (ST and Marinara copy the whole chat). The `branches` table already exists in the database, without a screen.

## 🟡 Stories v4: the Story is the template, with its own setup, and has several chats (10/29, 05h30–05h55) — CLAUDE
Daniel tried slice 4 and rejected it: "the UI is completely different from what we agreed"; creating a Story "looks really ugly compared to the mockup"; the **Sessions** list on the right is "really hard to read and confusing"; when creating, it must be possible to **pick the Scene: [Tracker] and the future agents**; and **"each Story should have its own independent configuration, otherwise they're all just the same variant of the same story"**. He asked to look at the **code** of Aventuras and Marinara (not just the docs).
- ~~Decision (05:31): Story = one playthrough~~ → **changed at 05:50 (Daniel): keep several chats inside the Story**, just with a better screen ("more flexibility"). **Final model: the Story is the template** (its own setup, independent from other Stories: preset, connection, trackers, agents, persona); **each chat inherits** and can change something just for itself (label "changed in this chat" + "Use the story's"); changing the Story applies to the chats that did not change that, from the next reply on. It is the Default → Story → session that `resolveSetup` already does.
- **New drafts (05:55) on the new canvas "Homunculus 2 — Stories"** (the "UI mockups" one was full, Daniel's request): (1) **Story page**: Continue (the newest chat) + New Chat; a **Chats** section with cards (name, last line, number of messages, when, which opening, "N changes"); Cast, How it starts (openings "for new chats"), How you play, Setup, Trackers, Agents, Lore; sidebar with the Story once and its chats under a small arrow. (2) **New Story** (same as before; "Create Story opens Chat 1"). (3) **New Chat**: name, which opening (shows in which chat it was already used; "Write my own"), setup "Same as the story" + "Change for this chat…". (4) **A Story's chat**: "‹ Isekai RPG / Chat 1", Prompt tab with each row "from the story" and Scene: Plot "changed in this chat". The drafts in the "Stories v4" row of the old canvas are superseded.
- **What their code shows:**
  - **Aventuras:** `Story` (`src/lib/types/index.ts`) keeps the messages, branches, memory **and** `settings: StorySettings` (model, temperature, POV, tense, tone, length…). A new story comes out of `SetupWizard.svelte` (steps: Mode → Prompt Pack → World & Setting → Character → Supporting Cast → Lorebook → Portraits → Writing Style → Opening). In the screen doc `story-settings.md` (branch `main`): **"Models are override-only"** — the Story only keeps what changes; each row shows "App default: <model>" until you pick another, and "×" goes back to the default; agents only show when you add an override. Story list (`story-list.md`): one card per Story with mode · chapter · when played.
  - **Marinara:** a new chat opens `ChatSetupWizard.tsx` (Roleplay: Name & Connection → Preset → Persona & Characters → Lorebooks → **Enable Agents**). Agents (trackers are agents) are **per chat**, grouped by category (`renderAgents`: Writer / Tracker / Misc / Custom), with search and a master switch. "Settings profiles" (`types/chat-preset.ts`) keep connection + preset + agents to reuse in new chats (that is our **Kit**).
- **Drafts (canvas "Homunculus 2 — UI mockups", row "Stories v4"):** (1) **New story**: "How do you want to play?" (Narrated adventure / Write it together / Director mode), "Start from" (one of your cards, with a summary of what comes from it / empty Story / Assistant "Later") and, beside it, **This story's setup**: Preset, Connection, Agents connection, You play as (each "Default · <value>" until changed), **Trackers** (tick Scene: World / Characters / Plot, each with its field set) and **Agents** (empty for now; they will show there, per Story); footer "Ready to play". (2) **Story page before playing**: cover, name, scenario, Start Story / Duplicate; Cast · How it starts (Scenario + openings 1–4) on the left; How you play · Setup · Trackers · Agents · Lore on the right; **no Sessions**. (3) **The same Story in progress**: Continue, "[N] messages · last played", "changes apply from the next reply on", last line; the sidebar shows each Story once, with its last line.
- **Pending:** Daniel approving the drafts on the canvas "Homunculus 2 — Stories". Only then code. The old Isekai RPG sessions become the Story's "Chat 1" and "Chat 2" (nothing is lost).
- **Real data:** the request for access to the app's folder (`AppData\Roaming\com.vasahts.homunculus`) was blocked again; the drafts use what can be known without the database (the app's trackers and sets, the Isekai RPG card from the screenshots, the nano-gpt connection). Code of both apps downloaded in Claude's session (versions from `pins.json` + Aventuras' `main` for `docs/ui`).

## ✅ Library tabs stay still (10/29, 05h) — CLAUDE
Daniel: the Characters / Personas / Lorebooks… bar "keeps shifting every time we select something different". Two causes: (1) the bar sat in the middle of the space left between the title (which changes: "Who you are in the story", "Empty"…) and the buttons on the right (which change: search + Import + New Character, or just Import…), so it moved sideways with every tab; (2) the selected tab is bold and was wider, pushing the others. Now both sides of the top bar share the space equally (the bar sits exactly in the center) and each tab already reserves the bold width (applies to every tab button in the app). In a narrow window, the Characters search shrinks down to 110 px before the bar gives way. Measured in the browser: the bar does not move across the 6 tabs from 1536 px up (below that only Characters still pushes a little, because it does not fit). Files: `ui/Toolbar.tsx`, `ui/kit.tsx` (`Segmented`), `styles.css`. Verification: 61 click tests, typecheck clean.

## ✅ Slice 4 in the app: Stories + Vault + NPCs (10/29, morning) — CLAUDE
Daniel's request: "Do whatever you think is best without getting bloated with redundant features. Go ahead so I can test it." Decision D-029. **To try it: `Open Homunculus.bat`** (the database gets migration 8; the app makes a backup first, as always).
- **Sidebar:** search; **Library** and **Vault** (places); **Stories** (+ creates) and **Chats** (+ creates), each conversation with its **last line** under the name (the "Session with Isekai RPG" ones become distinguishable). Story sessions do not show in Chats: they stay in the Story.
- **Library:** tabs on top (Characters, Personas, Lorebooks, Presets, Trackers, Trash). **Characters** = a grid of cards (picture, name, author/versions, scenario, tags, ~tokens) + a **sheet beside it**: **Chat Now**, **Edit** (opens the usual editor; Close goes back to the cards), **Turn into a Story**, **Export**.
- **Vault:** tabs **Stories / Narrators / NPCs**, same format. Narrator and NPC: the sheet is the editor (Save). Comes with the **Simple Narrator** (editable; cannot go to the Trash).
- **New Story** ("+" in Stories or Vault → New Story): name + **How do you want to play?** — **Narrated adventure** (you play a character), **Write it together** (co-author), **Director mode** (you are not in the story; the AI plays everyone equally; you give directions) — or **Turn a card into a story** (e.g. Isekai RPG: the card becomes the narrator, the 4 greetings become openings; the card does not change; the old chats stay in Chats).
- **Story page** (saves by itself): **How you play** · **Narrator** (from the Vault, a card, or "Written for this story…" + "Save to the Vault") · **People** (New NPC with the sheet in place — pick the Scene: Characters set, e.g. Fantasy → Race, Class, Level…; "+ Add an NPC from the Vault"; "+ Add a card", which goes in as it is; an NPC from another Story → "Make a Copy") · **How it starts** (Scenario + openings) · **Lore** · **About** (just for you) · **Sessions** on the right. **Play** (with several openings it asks which) creates "<Story>, session N"; in the session, "‹ <Story>" goes back to the page.
- **1:1 chat with NPCs:** at the top of the chat, "with … ▾" → **NPCs in this chat** → "+ Add an NPC". The character voices them when the story calls for it.
- **What the AI gets:** the narrator goes in place of the card (so any preset works); right after comes "[People in this story…]" with the NPC sheets (only filled fields, without the "Now" ones, which are the trackers' job) and the role note (Player: "never write {{user}}'s lines"; Director: "{{user}} is not in the story… everyone equal"). A player's 1:1 chat keeps the prompt it had.
- **Left for later (on purpose):** Kits, "Turn into an NPC" on Play, "When and where it starts", folders/tags in the Vault, NPC portrait, Vault Assistant (6b).
- Verification: 164 core tests + **61 click tests** (5 new: narrated story with NPC and Play; Director mode; card → Story; Vault + NPC in a chat; Story in the Trash with its sessions), typecheck clean; screenshots with the copy of Daniel's database.

## 🟡 Slice 4 rethought: Stories + Vault + NPCs (10/29, 03:00–03:45) — CLAUDE
Daniel's request: "make the drafts" for slice 4. I made a 1st version with "campaigns" (campaign page, sidebar with folders, origin labels, Kits, new session) and Daniel **changed the concept**. Drafts on the canvas **"Homunculus 2 — Campanhas e camadas"**: page **"Stories e Vault"** (the new one) and page "Campanhas (versão antiga)" (to compare; the value-origin and Kits screens still apply).
- **Concept (Daniel's):** join SillyTavern (1:1 chats) and Aventuras (narrated stories).
  - **Chats** = what already exists (1:1 with a card). Trackers and agents can be turned on in a chat without creating anything separate.
  - **Stories** (approved name; "campaign" sounded too grand) = narrated stories, an area **separate** from chats. **The Story is the narrator**: it is not a character and does not go into Characters.
  - **Everything of a Story lives in the Vault**, in **one folder per Story**: Narrator, World (scenario + initial state with the Scene: World fields), **NPCs**, Characters (optional cards), Lore, Start (openings), Setup (layer), Sessions.
  - **NPC ≠ character:** a light sheet in the Vault with the **Scene: Characters** fields (without the "Now" ones), not a v1/2/3 card. It can be put in a room, in any Story **or 1:1 chat** ("+ NPC from Vault" in the Scene tab). It ends the hack of several characters + a narrator in a lorebook: **a lorebook is only lore**.
  - **A real card in a Story:** on Play, each card picks "Use the card as it is" or **"Turn into an NPC"** (the AI fills Scene: Characters with a chosen connection; the card does not change).
  - **Vault Assistant** (BLUEPRINT §4.9): works inside the open folder; e.g. "fantasy party: mage, healer and tank, high fantasy" → creates the folder with Narrator, World and 3 NPCs (Scene: Characters Fantasy), all marked **new, not saved**, with Keep/Discard per item and Keep All.
  - "Scene characters creator" (for later): a helper that creates NPCs when they show up in the scene and keeps them in the Vault.
- **Daniel's decisions (10/29, 03:40):** (1) the name **Stories**; (2) an NPC used in another Story or chat is **the same NPC** (editing applies everywhere, notice "also in…"), with a **"Make a Copy for This Story"** button; (3) **no folders inside folders** (one level + tags); (4) NPCs and Worlds can be **loose** ("Not in a story").
- **My idea in the drafts:** "Turn into a Story" on a card that is a narrator in disguise (the **Isekai RPG**: system prompt → Narrator, scenario → World, Astraea → Lore, 4 greetings → openings). Its description (7,252 characters) is almost all stats rules (Physical Status, Inventory, Equipment, Gold, Level, BP) → suggestion "Make a Tracker From Them". The 4 old chats with the card stay in Chats.
- **Round 3 (10/29, 03:50–04:00), after reading v1's Group Studio and Vault and Aventuras' model.** Page **"Stories (v3)"** of the canvas (the newest). Daniel's decisions ("I agree, go ahead"):
  - **The Story page goes back to the style of the 1st draft** (v1's "Group Studio"): header with cover + Play/Continue, Cast (Narrator, NPCs, Characters), Sessions, How it starts, Lore, Setup (with "Your role": Player / Co-author / Director). Opening a Story in the Vault shows this page.
  - **New Story = "How do you want to play?"** (like v1's guided start): Narrated adventure / Write it together / Quick test, plus "Describe an idea to the Assistant", "Turn one of your cards into a story" and "Start from scratch"; footer **Ready to play**.
  - **"World" is gone** (it was redundant): lore → only in the **lorebook**; premise → **Scenario** in "How it starts" (ST's `scenario` field, the "setting" of v1/Aventuras); initial state → **"When and where it starts"** (optional; Scene: World fills it later).
  - **Narrator is a Vault item** (like an NPC): instructions, style (POV, tense, length, tone), "May bring in new NPCs", turn instruction. A **"Simple Narrator"** comes with the app. The Story picks: from the Vault (same narrator; "Make a Copy" if wanted), **one of your cards** (the Isekai RPG case) or written just for it ("Save to the Vault" later).
  - **Split:** Library = ST-format and engine things (Characters, Personas, Presets, Lorebooks, Trackers, Kits); **Vault** = story pieces (Stories, Narrators, NPCs).
  - **Reusable Scenario stays for later**; for now "Duplicate Story" reuses a start.
  - **04:05:** "Quick test" left "How do you want to play?"; **Director mode** came in (the user is not a player; the AI plays everyone equally; the user gives directions, lets them act or just watches). Daniel feels a sidebar with lists "doesn't look like an RP app" and wants to see other styles **before** coding: canvas page **"Estilos de UI"** with 3 directions for the same Story (High Fantasy Party): **A Shelf** (no sidebar, navigation on top, cover/portraits/items like a game on a shelf), **B Night Indigo** (inspired by pokebonk: indigo, an RPG party screen, inventory grid, "Begin the Adventure"), **C Stage** (the play screen first: portraits of who is in the scene on top, place/items/quest in cards, hidden navigation). Waiting for the choice (can mix).
  - **04:10, Daniel turned down A/B/C:** "it has to look like a NORMAL APP, not something aimed at RPG; UX and UI as top priority; don't redo it from scratch, only changes that make a difference." Back to the old idea of **Marinara's library** (v1 handoff notes, "Marinara interface ideas", item 3; `CharacterLibraryView.tsx`): a **grid of cards** (picture, name, author, summary, tags, tokens) + a **view sheet beside it** (portrait, Scenario, Description, opening; Chat Now / Edit / Turn into a Story / Export) between the list and the editor. Canvas page **"Ajustes (cards do Marinara)"**: Library → Characters and Vault → Stories in that format, in the current look (Graphite). A lean sidebar: search, **Library** and **Vault** as destinations (the Characters/Personas/Lorebooks/Presets/Trackers/Kits/Trash tabs live inside the Library page), Stories and Chats with the **last line** of each conversation (solves the 4 identical "Session with Isekai RPG").
- **Layers:** chats = Default → chat; Stories = Default → story → session (`resolveSetup` already does it; "campaign" in the code becomes the Story).
- **Next:** Daniel looks at the "Stories e Vault" page and picks/adjusts; then picks the value origin (A labels × B ladder) on the old page; then update BLUEPRINT §2/§3 (Campaign → Story, NPC sheet with tracker fields, Vault folder) before any code. Text plan: `docs/UI-PLAN.md` → "Stories and Vault".

## ✅ Lorebook screens: version "A" (10/29, early morning) — CLAUDE
Daniel asked for drafts ("A it is") and for "Where it goes" to be smaller. Decision D-028. Drafts on the canvas **"Homunculus 2 — UI mockups"**, row "Lorebooks".
- **Library → Lorebooks**: the list of books (how many entries, who uses it, where it came from), **Import** (several ST files at once), **New Lorebook**.
- **Book editor**: name (click to change), "Used by…", History, Export for SillyTavern, Duplicate, Move to Trash, Save. Search, filter (All / On / Always on / With conditions), **New Entry**.
  - Each entry is **one row** (on/off, title, keywords, labels only for what is not default, where it goes, tokens) and **opens right there**: Title → Text → Keywords (Enter adds; `/regex/` accepted) + "Also needs" → **Where it goes: a single button** ("In the chat ▾") with the list of the 8 options, and beside it "Messages back / As / Order" → **More** (chance, groups, timing, recursion, how it finds the words, for whom) → **Only when the world state…** (conditions: pick the tracker field from a list).
  - Dragging by the ⋮⋮ only changes the order in the list (not the order in the prompt; that is "Order").
- **Try It** (on the right, toggled by its button): takes the last messages of a session (pick which) plus a line you type, and shows **what would go in and why** and **what was left out and why**, with the keywords highlighted in the text. Uses even unsaved changes. Clicking a result opens the entry. Saves nothing.
- Session **Prompt tab**: a **Lorebooks** group with each book, where it comes from (Default, the character's, the persona's, this session's) and a switch **on/off only in this session** (works even for the character's book). "+ Add a Lorebook to This Session".
- **Reply tab**: a **Lorebooks** group with the entries that went in, why and how much they took; "Left out" folded.
- **Settings → Lorebooks**: the books **every session** reads and ST's reading settings in plain language ("Read the last 2 messages", "up to 25% of context"…), with "Restore SillyTavern's Defaults".
- **Character and persona**: a **Lorebooks** row (labels; × removes, a menu adds; the card's shows "from the card").
- Narrow window: the book list gets out of the way while a book is open (Close brings it back).
- Verification: 152 core tests + **50 click tests** (3 new), typecheck clean; screenshots at 1200 and 1440 px compared with the draft.

- **UX review (10/29, later):** (1) ~~an "Unsaved changes" warning~~ (later replaced by saving by itself, see below); (2) **Ctrl+S** saves; (3) number boxes now let you delete and type freely — the number is checked when you leave the box or press Enter (before, it "jumped back" on every key); Esc undoes; (4) "Used by" shows 3 names + "+N more" instead of cutting; (5) the "Where it goes" menu closes with Tab and shows where the focus is; closed entries light up on hover. 51 click tests (1 new).

- **"Where it goes" by kind (10/29, draft B chosen by Daniel):** the little-bars drawing was confusing. The menu now has **5 kinds**, each with its own drawing and color: **Character** (card with a person, blue), **In the chat** (bubble, green), **Examples** (quotes, yellow), **Author's Note** (note, purple), **Outlet** (plug, pink). When the kind has two sides, **Before | After** shows beside it. In the list, each entry shows the drawing + where it goes, so the kind is visible at a glance. Inside, ST's 8 positions stay (nothing changes in the files). Closed rows **no longer show the keywords** (only "Always on"); they show when the entry opens, and search still finds them. **Flash when closing** an entry (Daniel always saw it on his 240 Hz monitor): at the end of the animation the box came back open for 1 frame before disappearing; fixed in `Collapse` (applies to every part of the app that opens and closes), with a test that measures the height frame by frame. **Shortcuts on the closed row** (Daniel's request): clicking "where it goes" (e.g. "Before the character") opens a small menu with the 5 kinds and the **Before / After** buttons right there — one click to switch, without opening the entry (an Outlet without a name opens the entry to type the name). **"Always on"** also became a button on the row: green = on; off it shows faintly when the mouse is over the row (now just a dot + text, more discreet). In the quick menu, the **In the chat** row already has **how many messages back** and **as (System/User/AI)**. **Global lorebooks** (like ST's "Active World(s) for all chats"): a **Global** switch at the top of the book → every session/chat reads it; the full list is in Settings → Lorebooks → **Global Lorebooks**; a session can still turn a global one off in the Prompt tab. **Lorebook saves by itself** (Daniel's request): no more Save button or "unsaved" warning; each change is saved right after (and immediately when closing/switching books); "Saving…"/"Saved" shows at the top. History groups a burst of edits into one version (2 min). **Bug: cursor jumping to the end + Ctrl+Z broken**: it was the draggable list giving back the old text for an instant on every key; fixed (also for the tracker editor). **Global lorebooks** now sit in a **strip at the top** of Library → Lorebooks ("Global Lorebooks": labels, × removes, "+ Add a Global Lorebook"), like ST's "Active World(s) for all chats" — the Global switch on the book is gone. **Back to the session:** opening a book from the Prompt tab, "‹ session name" shows beside the page title. **Find and Replace (Ctrl+H, like Notepad++):** Ctrl+H/Ctrl+F or the Replace button; Aa / W / .* ; Enter or F3 = next, Shift = previous; Replace swaps the selected one (Ctrl+Z in the text undoes); Replace All across every entry (or only the open one, and titles/keywords if ticked) with "Undo Replace All".

**For Daniel to check:** close the app, open it with `Open Homunculus.bat` → **Library → Lorebooks** → one of the books that came from your cards (or **Import** a file from ST's `data/default-user/worlds` folder) → open an entry → **Try It**: type a keyword in the box → see "Would go in". Then, in a session: **Prompt** tab → Lorebooks group → send a message → **Reply** tab → Lorebooks group.

## 🟡→✅ Slice 3: lorebooks — engine (10/28, night) — CLAUDE
Daniel's request: "read the handoff notes and start on the lorebook part". Decision D-027. **There is no lorebook screen yet**: following the UI rule, I wrote the plan in `docs/UI-PLAN.md` (section "Lorebooks", copy in the Project) and it needs approval before the drafts.
- **What already works inside:**
  - **Activation the same as SillyTavern's**: keywords (and `/regex/`), "also needs" with AND ANY / AND ALL / NOT ALL / NOT ANY, whole word, case, how many messages to read, always on, chance (%), groups (priority, weight, scoring), sticky / cooldown / delay, recursion (and "only on recursion"), budget (% of context), minimum activations, filter by character/tag, generation type, `@@activate`. **Proof:** a test runs **SillyTavern's own code** (`world-info.js`) side by side with ours over 3,200 random turns: same entries, same text in each place and the same timers everywhere. That test found 2 differences, already fixed.
  - **Where they go:** before/after the character (the preset's "World Info" blocks), inside the chat (depth + role), before/after the examples, around the Author's Note (4 messages before the end, like ST's default, until we have an Author's Note), and `{{outlet::name}}`. If the preset has no "World Info" block, the Reply tab warns (ST drops it silently).
  - **Our extra:** an entry can require **world-state conditions** ("only if Scene: World → Location is Tavern", numbers greater/less, contains, exists…). Without a condition, same as ST.
  - **Swipes and branches right:** sticky/cooldown are tied to the reply; a swipe never sees the timers of the version it replaces (in ST they live on the whole chat).
  - **Which books apply:** the session's, the Default's, the replying character's and the persona's. A book in the Trash is not read.
  - **Record:** each reply keeps which entries went in and **why** ("keyword: castle", "sticky", "recursion…") and which were left out and why (budget, chance, group, condition). Preview Prompt already shows the "Lorebooks" parts.
  - **SillyTavern:** imports and exports World Info files (ST's `data/default-user/worlds` folder) **losslessly** (exporting without changes gives the same JSON) and JSON cards with an embedded lorebook. Agnai/Risu/NovelAI: refused with a clear message.
  - **Cards:** a card's embedded lorebook becomes a lorebook linked to the character on import (the notice says so). **Your already-imported cards get theirs by themselves on the 1st opening** (adjustment `embeddedLorebooksAdopted`). Exporting the card takes the lorebook back (with your edits).
- **For Daniel to check now (no screen):** close the app, open it with `Open Homunculus.bat` (it will run `npm install` because of the new module). Open a session with a character whose card had an embedded lorebook → write a keyword of an entry → **Preview Prompt**: the entry shows as "Lorebooks". After sending, the reply works as normal.
- **To approve:** read `docs/UI-PLAN.md` → "Lorebooks" (5 places: editor in the Library, linking on character/persona/session, Reply tab, Settings) and answer the 5 questions at the end.
- **Honest limit:** not tested with your real data (the request for access to the app's folder and to v1's `worlds` folder was blocked in this session). Database: migration 7 (automatic backup first).
- Verification: 150 core tests (13 new + the "same as ST" test) + 47 click tests (1 new: a card's lorebook reaches the prompt), typecheck clean, no Rust changes.

## ✅ New tracker editor: "B" (10/28, 19h) — CLAUDE
Daniel picked draft **B** ("it's better, but make the animations really polished"). Decision D-026.
- **Library → Trackers → a tracker**: on the left, **Tracker settings** (name, description, instructions; closed, click to open), the **Field set** and the **groups** (Appearance, Now, About, Stats, Fantasy…), each with its fields.
  - **Drag by the ⋮⋮**: a whole group (changes where it shows on the person's page) or a field inside the group. By keyboard: click the ⋮⋮ and use ↑ ↓.
  - To move a field to **another group**: open the field and pick the group in the menu, or use **Move up / Move down** at the edge of the group.
  - The group's name is editable right there (click the name). **+ Add field** in each group; **+ Add group** at the end.
  - **Click a field** and it opens right there: name, type, group, **"Shows on the person's page as"** with little drawings (Auto, Row, Tile, Right now, Highlight, Under the name, Lead, Note), icon, what the AI should write, rules, Move up/down, Remove.
  - A green label on the row when the field shows outside its group ("under the name", "in Notes").
- **On the right, the live preview** with **real values** (the last session that has this tracker; "Showing" picks the person). It changes before saving: drag, and the rows slide to their new place; the open field is highlighted.
- **Animations** (with the animate skill as the rule): smooth open/close, arrows that turn, dragging with the item "lifted" and the others making room, preview sliding, the "Shows as" choice responding to the click. All gone if Windows has animations off.
- Per-field color left the editor (the new panel uses a single color); the data is still kept.
- Verification: 124 core tests + 46 click tests; screenshots with the copy of Daniel's database.

**For Daniel to check:** close the app, open it with `Open Homunculus.bat` → Library → Trackers → Scene: Characters → drag "Appearance" by the ⋮⋮ → see the preview → click Mood → change "Shows as" → **Save**.

## ✅ New Scene panel: "C — Quiet" (10/28, afternoon) — CLAUDE
Daniel looked at the drafts on the canvas **"Homunculus 2 — UI mockups"** and picked **C — Quiet** ("it's good, go ahead and implement it"). The first screen made under the new rule (draft → approval → code). Decision D-025.
- **A list, like the system Settings**: groups with a title and "name · value" rows, a single accent color, no tabs and no colored blocks.
  1. **Now**: place, time (hour, part of day, date on a single line) and weather.
  2. **In the scene**: one row per person (photo, name, "(you)", what they are doing now). A green dot means something changed at this message. **Clicking opens the person's page.**
  3. The rest of each tracker in groups (Goals, Threads, Quests, Factions… each list is a group, with a title, status on the right and detail below), and at the end a discreet line "World ▸ ✓ updated · 0.3s · Run again".
  4. **Not in the scene**, fainter.
- **Person's page** (slides in from the right; "‹ Scene" or Esc goes back): big photo and name, role below, description in a book font, **Right now** (in the scene, mood, where, doing…), numbers three per row (Age, Height, Level, health/mana bars), the rest as rows, spells/skills as a list, Notes and "Not known yet".
- **⚙ (Trackers)** on top: turn on/off, pick the field set (Fantasy etc.) and edit each tracker.
- **Order fixed (10/28, 18h, Daniel's screenshot with real data):** in his database the World fields are not marked as "Top strip", so time/place/weather fell to the end, after the lists, and the "✓ updated" rows sat in the middle. Now: **time/place/weather on top** (if no field is "Top strip", the single values of trackers without characters go to the top) → **In the scene** → in each tracker, single values before the lists (Quests, Items, Factions…) → **Not in the scene** → all the "✓ updated · Run again" rows together at the end. Name and value aligned at the top.
- **Grouped (10/28, 18h15, Daniel's request with a screenshot):** "Now" became **a single group**, as in the draft: the fields of a section with short values become one row ("Time: 14:10, afternoon, Day 1"); long values (place, weather) get their own rows. Below, **tabs** as in the "Cast + sheet" draft: **Cast N** (In the scene · N, Between characters, Not in the scene · N) and one tab per list (Quests 3, Items 3, Factions 2…). With many tabs, the bar scrolls sideways.
- **Appearance at the top of the person's page (10/28, 18h30, Daniel's request, "for now"):** the order of the groups on the page now **follows the order of the fields in the tracker** (nothing fixed in code). The Scene: Characters sets start with Appearance; the trackers already installed get that order **once** (adjustment `starterTrackersOrder`; fields Daniel created stay right after the field they followed). Page order: name → description → **Appearance** → Right now → Stats → Fantasy… → Notes. It can be changed with ↑ ↓ in the tracker editor.
- **Mystery solved (10/28, 18h40, with the copy of Daniel's database):** his trackers were last saved at **03:55:08 on 10/28**, when the D-024 adjustment ran. At that moment the part of the code that knows "Show as" (`packages/schemas`) had not reached the PC yet (it arrived at 03:55:10; **Claude sent the files out of order**; Daniel always closes the app before updating), so the save threw the hints away. Fix: each adjustment only runs with the right version of `trackers.json` (`version: 2`), checks after saving that the hints stayed and only then marks itself "done". It runs again on his database. Checked on the copy: Appearance first, mood as a pill, time in "Now". Test `starter-trackers.test.ts` (with `H2_REAL_DB=<copy>` it also runs on the real database).
- **Rule for Claude:** send the base files to the PC first (`packages/*`, data), then the rest, and check they arrived.
- **Seeing the app with real data (Claude):** in browser mode, `globalThis.__h2SeedDb` (base64 of a `.db`) opens the app with that database; the script `.shots/real.mjs` takes the screenshots. The desktop app never uses it. The copy of Daniel's database stays only in Claude's temporary area, never in the project.
- **Next for the UI (Daniel's request, 10/28 18h24, confirmed: "that's exactly it"):** a tracker editor organized by **draggable groups** (Appearance, Right now, Stats…) with the **fields inside each group also draggable** (Face, Hair…); the order in the editor = the order in the panel. Follow the rule: text plan → draft → approval → code.
  - ✅ **Done as D-026 (section above).** **Drafts (10/28, 19h):** on the canvas "Homunculus 2 — UI mockups", row "Tracker editor — groups and fields you drag". **A** = list of groups and fields (⋮⋮ to drag) + settings of the chosen item on the right, with "Shows on the person's page as" in small drawings. **B** = the same list with the field opening in place + **Hoshino Mei's page live** on the right, changing while you drag. Real data: Scene: Characters (Fantasy) and Mei's values from Daniel's database. Generator: `scratchpad/scene-mock/gen3.py` (Claude's session). **Waiting for Daniel to choose.**
- The "Show as" choices of D-024 still apply (they decide where each field shows). "Block" now becomes a normal row, and the fields' colors are kept but not shown.
- Verification: 122 core tests + 46 click tests. An old test that drags a preset block sometimes fails when everything runs together on a busy PC; alone it passes (unrelated to the Scene).
- **Honest limit:** still tested with the offline mode's fake data (loose words). Still no access to the real database. **Daniel: open one of your sessions and compare with draft C on the canvas.** If something is different, send me a screenshot.

- UI skills installed on Daniel's account (repository emilkowalski/skills, MIT): **emil-design-eng**, **prototype**, **break-ui**. Use them in the next rounds.

**For Daniel to check:** `Open Homunculus.bat` → your session → **Scene** tab → click a person → "‹ Scene" → ⚙ to change the field set.

## ⚠ Scene panel: rejected by Daniel (replaced by C above) (10/28, 04:02) — CLAUDE
Daniel tried the D-024 version (section below) with his real data: **"it turned out truly horrible"**, worse than the previous one (D-023). His words: "the hierarchy needs a lot of work, everything is just thrown all around".
- In his screenshot, every field showed as identical colored blocks, one under the other (Distance, Doing, Notes, Description, Age, Height, Weight, Face, Hair…), without v1's hierarchy. A sign that the "Show as" choices **did not reach** the trackers already installed in his database (the `starterTrackersLook` update did not apply or did not match the fields), and "Auto" became a block for every text. But the underlying problem is the hierarchy itself, not only that bug.
- He first asked to go back to the previous version and right after said to **leave it as it is for now** and just note it down. **Nothing was reverted.**
- **Before touching the Scene again:** make a mockup/draft and show Daniel before coding (an old v1 rule: "wait for Daniel to approve before coding"). Really study v1's hierarchy (`classic-scene.js`: `renderCast`, `characterCard`, `characterDetails`, and the `.ct-sc-*` CSS in `classic-features.css`), with real data (his screenshots), not the offline mode's fake data.

## Scene panel with Homunculus v1's hierarchy (10/28, early morning) — CLAUDE
Daniel: "you already made this UI in Homunculus, look at how it's done there and the hierarchy"; the tabs inside each character (Now/About/Stats…) "make the experience poorer". Decision D-024. I studied v1's `classic-scene.js` and v1's handoff notes.
- **Panel**: on top, **Update Now** (↻, runs the trackers again at this message) and **⚙ Trackers** (on/off, edit, create; while none is on, the list shows in the panel itself). Then the **top strip** like v1's "D": date · time · part of day, the place and the weather. Then **one tab per tracker** (Characters 2 · World · Plot).
- **Characters** like v1: "Fold all", search (from 4 people), **All / In scene / Not here** with counts, groups that open and close, and **one card per character with everything visible**: photo, name, YOU, a dot if something changed at this message, the role under the name, **Here/Away** (click toggles), and in the body the same order as v1: description and traits → mood in a pill → where / posture / distance / doing → small tiles (Age, Height, Weight, Race, Level, health and mana bars…) → colored blocks (Face, Hair, Eyes… Skills, Spells) → notes in italics. An empty field becomes "Not known yet: …" (click to write). An **updated** label only on what changed at this message (on the 1st reply nothing is marked).
- **How each field shows is now your choice**, in the tracker editor: **Show as** (Auto, Top strip, Under the name, Lead, Pill, Line, Tile, Block, Note), **Icon** and **Color**. The app's trackers come with v1's choices. **Your trackers already in the database get these choices by themselves on the 1st opening**, only on fields that do not have one yet (nothing you edited is changed).
- Not brought from v1 yet: dragging cards to reorder, the big sheet with a portrait, the sun/moon clock, the factions' posture bars and "Who is where".
- Verification: 122 core tests + 46 click tests passing.

**For Daniel to check:** `Open Homunculus.bat` → your session → **Scene** tab: top strip, tabs, cards. Library → Trackers → Scene: Characters → see each field's "Show as".

## UI cleanup (10/28, early morning) — CLAUDE
Daniel's request, before the lorebooks: "fix this UI, it's a mess" (preset blocks did not drag, Preview Prompt was confusing, the Reply tab filled up with information on the 1st reply), with the Coffra site as the animation reference. Decision D-023. Nothing in the core, the database or Rust changed.
- **Dragging preset blocks**: each block has a handle (⋮⋮) on the left. Drag up/down, in the preset editor **and in the Prompt tab** (there it saves the preset right away). By keyboard: click the handle and use ↑ ↓. In the Prompt tab, clicking a block's **name** opens the editor at that block. "auto" = a block filled by the app; "26 tok" = the text's size.
- **Preview Prompt** now opens a **large window** over the chat: on the left, how much of the context is used and what the tokens are made of (click an item to jump to it); on the right, **everything in the order the AI reads it**, numbered and colored by origin, with a clear name, "as System/User/AI", size and the first lines (click to read it all). The conversation's messages are together in "Chat history · N messages". It has a **search** ("Find in the prompt"). Esc or clicking outside closes it. The Reply tab's "Open the full prompt" uses the same window.
- **Reply tab**: on top, tokens read / written / time / agents. **What changed** groups by tracker and by character ("Lyra · 31 values filled in"), folded when there is a lot — no more flood on the 1st reply. Changes show as ~~before~~ → after.
- A new **Scene panel**, made for **reading**: trackers on/off as "pills" on top; values as full text (nothing cut), two per row when short; status as a label, bars with a number (red health, blue mana), lists as labels, **quests/factions/spells as small cards**; **empty fields hidden** ("Show N empty fields" shows them); each **character is a card** (photo, name, a summary line) with the sections in **tabs** (Now / About / Stats / Fantasy / Appearance); only the first 3 in the scene open by themselves; whoever left the scene goes to "Not in the scene". **To edit: click the value** (Enter saves, Shift+Enter breaks the line, Esc cancels). The pencil at the top of the card opens the tracker editor.
- **Animations** (Coffra style): things come in smoothly one after another, a "pill" slides to the selected tab or item (inspector tabs and sidebar), a tab's content slides in from the side you came from, on/off switches slide, buttons "sink" when clicked, sections open and close smoothly, **a value that changed glows once**, and three dots while the reply has not started. If Windows has "animation effects" off, the app animates nothing.
- Verification: **122 core tests + 46 click tests** passing (1 new: dragging a block with the mouse).

**For Daniel to check on Windows:** `Open Homunculus.bat` → in your session, **Prompt** tab → drag "Main Prompt" by the ⋮⋮ handle → **Preview Prompt** → search a word → Esc → **Scene** tab: click a value, change it, Enter → send a message → **Reply** tab → "What changed" folded by character.

## Slice 2 done: block presets, macros, context limit, Preview Prompt (10/28, early morning) — CLAUDE
Next step of the BLUEPRINT (Daniel: "go ahead"). Decision D-021.
- **Presets** (Library → **Presets**): the prompt's "recipe", like SillyTavern's Prompt Manager. A list of **blocks** you turn on/off, move up/down (▲▼), open to edit the text (with macros), choose whether it goes as system/user/assistant, and where: **in the list** or **inside the chat, N messages before the end** (good for reminders). Blocks "filled by the app" fill themselves (description, personality, scenario, examples, persona, the trackers' current scene, what the agents add, the conversation). Buttons: **+ New Block**, **+ Add a block filled by the app**, **Export for SillyTavern**, Duplicate, Default, Move to Trash, History.
- The app comes with the **"Homunculus Default"** preset (the same prompt as before). Old sessions stay the same.
- **Import from SillyTavern**: Presets → **Import** → the preset JSON (ST's left panel, or the `data/default-user/OpenAI Settings` folder). The prompts, the order, what is on, the samplers and the context size come in. The service and the model do **not** (here they belong to the connection). Exporting gives back everything ST had.
- **Preset samplers** (optional): if the preset sets a temperature etc., it applies to the story and wins over the connection (the Prompt tab warns). Agents and trackers keep their connection's.
- **Context limit**: each preset has a maximum size (default 32,768 tokens). When the conversation does not fit, the **oldest** messages are left out, and the **Reply** tab says how many.
- **ST macros**: `{{char}}`, `{{user}}`, `{{description}}`, `{{persona}}`, `{{random::a::b}}`, `{{pick::a::b}}` (same choice on every swipe), `{{roll:1d20}}`, `{{time}}`, `{{date}}`, `{{setvar}}`/`{{getvar}}`, `{{// note}}`… and ours `{{state.tracker.field}}` (a tracker's current value). Not yet: `{{if}}`.
- **Prompt tab** (in the session): pick the session's preset, turn blocks on/off right there (changes the preset), and **Preview Prompt**: shows exactly what the next reply will send, without sending anything (uses what is written in the message box as the last message).
- **Reply tab**: which preset, how much of the context was used, how many old messages were left out, and warnings (e.g. "Current Scene was placed automatically…" for an imported preset with no place for the scene).
- Verification: **123 core tests + 45 click tests** passing, no Rust changes. Database migration 6 (backup first). Also tested with SillyTavern's real Default preset: the prompt comes out the same as ST's.

**For Daniel to check on Windows:** `npm install` (new module) and `npm run app` → Library → **Presets** → Import → one of your ST presets → in a session, Prompt tab → **Session preset** = the imported one → **Preview Prompt** → send a message → Details → the Reply tab shows the preset and the context used.
**Careful:** ST presets often have their own temperature; it starts applying to the story when you pick the preset (the Prompt tab shows a warning). To use the connection's again, clear the value in Presets → Samplers.

**Next in the BLUEPRINT order:** slice 3 — **lorebooks** the same as SillyTavern's (keywords, recursion, probability, groups, sticky/cooldown) + world-state conditions. Pending UI: Scene panel redesign and the Customize screen.

## Slice 1b done: Settings and saved connections (10/28, early morning) — CLAUDE
Daniel's request: "we still need to do the settings, API connections etc". Decision D-020.
- **Settings** (last item of the sidebar, at the bottom) with two tabs:
  - **Connections**: several saved connections, each with a **name**, AI, address, model, key, samplers, **Reasoning Effort** (how much the model "thinks": None, Minimal, Low, Medium, High, Extra high, Max), limits (how many calls at the same time, wait between calls), a **backup connection** (used if the main one fails before writing) and, in Advanced, extra request fields (JSON) and notes. Buttons **Test Connection** (sends "reply only OK" and shows whether it worked), **Duplicate**, **Default** and **Delete Connection** (two clicks).
  - **Defaults**: the story's default connection, the **agents' and trackers'** connection (can be a cheaper model), one connection **per tracker**, default persona and "trackers on new versions" (swipes).
- **Browse** (beside Model): asks the service (OpenRouter, nano-gpt or another compatible one) for the model list to **search and pick** without copying the ID. Shows name, ID, context size, price per million tokens and whether the model "thinks"; sorts by name, cheapest or biggest context; a "Thinking only" filter; Refresh button. After picking, the Reasoning Effort levels the model does not accept are greyed out (when the service says so, like OpenRouter). The key now comes before the model in the form.
- **In the session** (**Prompt** tab): pick the story's connection and the agents' just for that session. The samplers and reasoning effort there change the connection in use (the title says which: "Sampling — name").
- **Your current connection becomes a saved connection by itself** on the first opening (it should show as "nano-gpt.com — z-ai/glm-5.3:thinking", marked as default). The key stays in the Windows Credential Manager and **you do not need to type it again** (the key is kept per address, and the address did not change).
- The **Reply** tab shows which connection wrote each reply; the line under the text box says which connection you are writing with.
- Verification: **109 core tests + 40 click tests** passing, no Rust changes. Database migration 5 (automatic backup first).

**For Daniel to check on Windows:** `npm run app` → **Settings** → Connections → see your nano-gpt connection (default) → **Browse** → search "glm" → pick → **Reasoning Effort** = High → Save → **Test Connection** → then **New Connection** for a cheaper model → **Defaults** tab → "Agents & Trackers" = the cheap one → in a session with trackers on, send a message → Details: the reply was written by the main connection, and the trackers (Reply tab, "Agents after the reply") show the cheap model.
**If Test Connection complains about Reasoning Effort:** some models accept only some levels; go back to "Default".

**Next:** ✅ slice 2 done (section above).

## Slice 1 done: character versions, personas, history and Trash (10/28, early morning) — CLAUDE
Daniel's request: do the characters part now and refine the UI later. Decision D-019.
- **Character versions** (the "variants"): in the character editor, a **Version** bar with **Main** + the versions + **"+ New Version"** (e.g. "Lyra — Modern"). A version keeps **only what changes**; the rest follows Main (editing Main updates whatever the version did not change). A field changed in the version is marked **"changed in this version"**, with **"Use Main"** to go back. Each version can have **its own picture**. **Export** exports the version on screen, as a normal SillyTavern card.
- **In the session**: the text beside the title ("with Lyra · Modern · as Dan ▾") opens **"Who is in this story"**: pick the character's version, who you are (persona) and the persona's version. Applies from the next reply on. A session can also start with a version already (the Sessions "+" and the "Start Session with Lyra (Modern)" button).
- **Personas** (Library → **Personas**): name, description, picture, versions, **where the description goes in the prompt** (with the character / near the end of the conversation / not sent) and the **Default persona** switch. The first persona created becomes the default. Your name in the chat and `{{user}}` become the persona's.
- **Import from SillyTavern**: Personas → **Import** → pick the JSON from the **"Backup"** button of ST's Persona Management (or ST's `settings.json`) and, with it, the persona pictures (ST's `data/default-user/User Avatars` folder). It warns about what did not work (e.g. a picture not picked, a persona lorebook kept for slice 3).
- **History**: in the editor (character or persona), a **History** section: every Save is kept, shows what changed and has **"Restore This Version"** (two clicks; restoring is also a save, so it can be undone). Pictures are not in the history.
- **Trash** (Library → **Trash**): "Delete" became **"Move to Trash"** for sessions, characters and personas, with **Undo** in the notice. In the Trash: **Restore**, **Delete Forever** (two clicks) or **Empty Trash**. A character a session uses, or the default persona, cannot go to the Trash. Trackers are still deleted directly (they join the Trash later).
- **Reply tab**: now says which versions and which persona that reply used ("Characters", "You played as").
- Inside: database migration 4 (the app makes a backup first, by itself), new module `packages/st-personas`. Also fixed: `npm test` tried to run the tests of the reference projects downloaded by `npm run refs`; and a click test that sometimes failed (the "updating…" line stayed on screen only 0.3 s).
- Verification: **103 core tests + 35 click tests** passing, typecheck clean, no Rust changes.

**For Daniel to check on Windows:** `npm install` (because of the new module) and `npm run app` → Library → Characters → Lyra → **+ New Version** → "Modern" → change the description → Save → open the session → click "with Lyra ▾" → pick Modern → send a message → **Details** under the reply → the Reply tab shows "Lyra (Modern)". Then: Personas → Import with your ST backup (or New Persona) → see your name in the chat. Finally: a character's History, and Move to Trash → Trash → Restore.

**Next (Daniel's request, 10/28):** settings and API connections — ✅ done (slice 1b, section above).

## New UI in the app: direction "I" (10/27, night) — CLAUDE
Daniel picked **I** (H following Apple's guidelines), together with H's "receipt", and asked for the UI to be **always changeable** (like v1's themes). Applied in the app (D-018):
- **Sidebar** with two levels: **Sessions** (the **+** creates a session by picking the character) and **Library** (**Characters** and **Trackers**). Characters and Trackers open as a list on the left + editor on the right, with search.
- **Session**: title on top (click to rename), "Delete Session" with two clicks, buttons to hide/show the sidebar and the inspector (the app remembers the choice). The story uses the **Literata** font; the rest, the system font. A single highlighted button: **Send**.
- Under the last reply, a **receipt** line (tokens, time, trackers updated) → click opens the **Reply** tab. Older replies have "Details".
- **Inspector** on the right with 3 tabs: **Scene** (trackers, as before, with on/off switches), **Prompt** (connection + **samplers**: Temperature, Top P, Max Length, with a slider and a number box; empty = the model's default) and **Reply** (what was sent by origin, with a colored bar; settings used; agents that ran, with "Run Again"; what changed in the scene; the full prompt).
- **To stay changeable**: all colors, fonts, corners and widths live in `apps/desktop/src/theme/tokens.css`; "appearance profiles" in `theme/themes.ts` (today only "Graphite") change those without touching the rest; the screen's areas have fixed markers (`data-region`) for themes and custom CSS; buttons and lists come from a small kit (`ui/kit.tsx`). The **Customize screen** (profiles, layouts, effects, import/export, like v1) is the next UI step, and the Blood & Ink theme comes later.
- Verification: 94 core tests + 29 click tests (3 new: receipt → Reply tab; samplers used on the next reply; hide panels and reload). Nothing in the core, Rust or the database changed.

- **Still provisional (10/27, 22:39, agreed with Daniel):** the **Scene** tab's content works (real values, saved per message, editable), but the look is a raw form (each field becomes a text box, long texts are cut). Next UI step, before or together with the Customize screen: redesign the Scene panel — show for reading and edit only on click, full text with line breaks, bars/labels/rows by field type, a card per character (avatar, name, race/class/level) with collapsible sections, hide empty fields. Ask Daniel whether he wants a mockup first.

**For Daniel to check on Windows:** `npm install` (installs the Literata font, which ships with the app, no internet needed) and `npm run app` → open the session → **Prompt** tab: pick the connection and try a sampler → send a message → click the receipt under the reply → **Reply** tab → Library → **Trackers** and **Characters**.

## State on 10/23/2026 — CLAUDE (history; the newest is in the 10/27 sections below)
**Foundation (done and tested):** core with events, modules, agent engine, world state tied to each message (D-001), architecture tests.

**Phase 1 started — the first real chat:**
- A real **SQLite** database: in the desktop app, the data is saved on the PC (file `homunculus.db` in the app's config folder). Before upgrading the structure of an existing database, the app makes an automatic **backup** in the `backups/` folder (D-008).
- **AI connection**: an OpenAI-compatible module (OpenRouter by default, or any compatible address) with streaming replies and error messages in plain language. There is also an **offline test AI**, which needs no key (D-009).
- **Chat**: opens a session with the starter character (Lyra), sends messages, the reply appears bit by bit, a **Stop** button, **swipes** (‹ 1/2 ›) and continuing from any swipe (each swipe is a branch).
- If the connection drops in the middle of a reply, the text that arrived is saved and marked "incomplete".
- The screen is deliberately simple: the real design comes later (first UX, then UI).

**Verification (updated):** 45 core tests + 16 click tests passing, Rust compiling (`cargo check`), 0 vulnerabilities.

**✅ Chat with a real AI confirmed on Daniel's Windows (10/23, 17:24).**

**API key vault (10/23) — D-011:** the key lives in the **Windows Credential Manager** (never in files). It saves by itself when Daniel clicks outside the key box; a "Forget key" button deletes it. One key per address (OpenRouter and a local server can have different keys). To check on Windows: Control Panel → Credential Manager → Windows Credentials → "Homunculus" items.

**✅ Vault confirmed on Daniel's Windows (10/23, 17:28)** — he uses nano-gpt (`https://nano-gpt.com/api/v1`) with the model `z-ai/glm-5.3:thinking`.

**Sessions and characters (10/23):**
- Sidebar with **Sessions** (newest first; create with "+ New" picking the character) and **Characters** (open to see/edit; "+ New" creates).
- A simple **character editor**: name, description, personality, scenario, first message; a "Start a session with …" button.
- **Rename** a session by clicking the title; **delete** a session or character with **two clicks** (no pop-ups). A character used by some session cannot be deleted (a message explains which sessions).
- **"?"** buttons on every option (Daniel's rule).
- The screen code was split into parts: `src/ui/` (Sidebar, ChatView, CharacterEditor, ConnectionPanel, Help) and `src/connection.ts`.
- The click tests found and fixed 2 bugs: the app created **two** sessions on first opening, and "✓ Saved" disappeared when creating a new character.

**SillyTavern cards — start of Phase 2 (10/23) — D-012:**
- **Import** button (sidebar): **PNG and JSON cards, V1/V2/V3**, several at once. Clear warnings for bad files and for cards with an embedded lorebook (kept for when lorebooks arrive).
- **Export** in the editor: "PNG card" (V2 + V3 inside the picture) and "JSON card". Goes to the **Downloads** folder, without overwriting.
- **Lossless**: the original card is kept; on export, only the edited fields change (embedded lorebook, extensions and other tools' fields survive). Tested round-trip.
- **Character picture**: shows in the list and the editor; "Add/Change image" accepts any picture (converted to PNG); "Remove image".
- The editor gained **"Advanced card fields"**: example dialogue, character system prompt, post-history instructions, creator notes, tags.
- `{{char}}`, `{{user}}`, `<BOT>`, `<USER>` are replaced by the names on screen and in the prompt ({{user}} = "User" until personas exist).
- Screen fixes: the "?" bubble is no longer cut by the sidebar; "+ New" no longer sticks out of the bar.

## License and study of other apps (10/23) — D-013
- Homunculus 2 is now **AGPL-3.0** (`LICENSE` file). Daniel's decision: it is a personal project, so that is fine.
- This allows **adapting code** from Marinara Engine and Aventuras (both AGPL-3.0), always recording it in `CREDITS.md` (project, file, commit) and keeping the original copyright notices.
- ✅ **Done on 10/27** (see "Reference maps" below). Original plan from 10/23: study the code ("reverse engineering") of **SillyTavern**, **Marinara Engine** and **Aventuras**, producing a "map" of each in the Project documents (where each feature lives, how it works, prompts, what to adopt/adapt/avoid, commit studied).
  - **SillyTavern** (github.com/SillyTavern/SillyTavern): focus on what we need to reproduce faithfully — Chat Completion prompt assembly (prompt_order), macros, presets, World Info/lorebooks (activation: recursion, probability, groups, sticky/cooldown), personas, chat format.
  - **Marinara Engine** and **Aventuras**: focus on sessions, agents, memory (Memory Recall), Vault, "ready to play" Setup, trackers, Card Browser, UX/wireframes.
  - Ask Daniel for the GitHub links of Marinara and Aventuras.
  - Only after that: persona → block prompt + ST presets → lorebooks.
- Still applies: learn from them, but keep our architecture.

## UI: direction chosen (10/27, night) — CLAUDE
- Daniel asked to bring the UI forward (the app is "painful to look at" and will get busier). Mockups on the canvas **"Homunculus 2 — UI mockups"** (Daniel's design artifact on claude.ai).
- References studied: PokéBonk (rounded fonts, slate, Settings and Pokédex patterns — exact colors read from the page). Daniel wanted something **neutral to start**; Blood & Ink comes later.
- **Chosen as the main one: G — "Full control"**, close to Homunculus v1 on ST: a 6-icon rail; on the left **Prompt and samplers** (preset with an "unsaved" warning, blocks with tokens and on/off, context used, main samplers + "6 more", closed sections showing the value), collapsible with «; chat in the middle with actions and a big Send; on the right **Scene** like v1 (day/place/weather, Cast/World/Plot/Log tabs, All/In scene/Not here filters). A neutral graphite look, verdigris accent `#62B6A4`, UI in Instrument Sans, prose in Literata. Follows the 20 UX laws Daniel listed (table in the 10/27 conversation).
- Daniel likes **being in control of everything** (prompts, samplers visible); minimalist themes can come later for other users.
- Also on the canvas: **H — "Inspector"** (Claude's version): a single panel with Scene/Prompt/This reply tabs, samplers as "dials" above the text box, and a "receipt" per reply (what the tokens were made of, samplers used, agents, what changed). **Daniel liked H more than G** (10/27, 21:52): H becomes the main candidate.
- **I — H following Apple's guidelines** (skill github.com/dickwu/apple-design-skill, commit 914b6a37): a 2-level sidebar (Sessions/Library) instead of the rail, a toolbar with up to 3 groups, glass only on floating controls (sidebar and inspector), opaque content, a single highlighted button (Send), an inspector with a segmented control and Settings-like grouped lists, the system font on controls and Literata in prose, a native menu with every command. Made only for comparison.
- **J — H with Aventuras' screen ideas** (`docs/ui/screens`, branch `main`): a lean top bar with a chapter chip and the story's time, an indicator of what is running ("Updating trackers, 2 of 3", clickable to stop), a thin strip of context used, replies as cards with reply/reasoning tokens and the story's time in the footer, clickable suggestions (`choices` agents), a mode in the composer (Do/Say/Think/OOC), a "Browse" bar on the right (category, search, filters, highlight on what just changed) and a character details drawer. Map updated in `docs/reference/aventuras.md`.
- ✅ Applied in the app on 10/27 (section "New UI in the app" above).

## Homunculus v1's trackers as defaults + Fantasy set (10/27, night) — CLAUDE
Daniel's request: bring v1's trackers as defaults and, in the characters one, a **Fantasy** set (mana, skill slots, spells, race…).
- The app now comes with **Scene: World**, **Scene: Characters** and **Scene: Plot** already in the Trackers list, **as editable data** (everything can be changed or deleted; the engine still does not know what they are). They are installed once; if Daniel deletes one, it does not come back.
- **Field sets** (like v1's "Fields"): World = Standard, Survival, Minimal. Characters = Standard, **Fantasy**, Superpowers, Sci-fi, Minimal. Each session picks the set in the Scene panel ("Fields"). Switching sets keeps the values of fields with the same name.
- **Fantasy** = Standard + race, class, level, health (bar), mana (bar), affinity, skill slots, skills (rows: skill, rank, effect), spells (rows: spell, mana cost, effect), equipment, conditions.
- v1's Characters tracker follows **any character named by the story** (NPCs) and the user too; whoever leaves the scene is marked and goes to the prompt by name only.
- The engine gained generic pieces: field sets, **sections** (Now, About, Stats, Appearance…), "always filled", **lists with columns** (quests, factions, spells), who has per-character values, who is in the scene. The trackers also start reading the characters' **cards**.
- In the tracker editor: pick, copy, create and delete sets, and set the default; a section per field; columns in lists.
- **Left out:** **Scene: Map** (needs the map screen, which comes later); picking a **model per tracker** (needs connection profiles; today it uses the story's connection); v1's calendars (the date is text); lorebooks are not read yet (slice 3).
- Decision D-017; credits in `CREDITS.md`; v1 map updated. Verification: 94 core tests + 26 click tests.

**For Daniel to check on Windows:** `npm run app` → Scene panel → turn on **Scene: Characters** and **Scene: World** → in Characters, Fields = **Fantasy** → send a message with GLM → see Lyra and you in the panel (sections, health/mana bars, spells) → edit a value → open **edit** to see the fields.

## Idea noted for later: Library Assistant (10/27) — CLAUDE
Daniel's request: something like **Aventuras' VaultAssistant**. A chat with an AI that creates and edits characters, lorebooks and **trackers** (world, per character, custom: "make a tracker like…"). It has **its own API profile, model and reasoning effort**. The AI only **proposes**; Daniel approves, rejects or edits before saving.
I studied Aventuras' code and wrote it all down in **BLUEPRINT §4.9** (what to copy, how it fits our design and what has to exist first) and in the map `docs/reference/aventuras.md`. Place in the order: **slice 6b** (after agents with tools). **Not built yet.**

## Proof of concept done (10/27, night) — CLAUDE
**Daniel's new rule:** nothing with a fixed name or function in the code (no "emotions tracker"). Everything modular, works however the user wants. The app **comes with no ready-made tracker**.

**Bug fixed first:** the sent message disappeared from the screen until the AI finished replying (the list was only redrawn at the end) and the "writing…" bubble flickered before the new list appeared. Now the message stays on screen the whole time; on a swipe, the old version leaves the screen while the new one is written; a thinking model shows "is thinking…" with the live reasoning. The new tests look at the screen **during** the reply (the old ones only looked at the end, which is why they missed it).

**What can be done now:**
- Sidebar → **Trackers → + New**: give it a name, description, instructions for the AI, how many messages it reads, and build the **fields** (text, number, bar, status with options, item list; one value, one per character or one per pair; "Only I change it"; "Send to the AI"). "?" buttons on everything.
- In the session, the **Scene** panel on the right (the "Scene" button hides/shows it): turn the tracker on for that session. After each reply, the AI updates the values in a separate call.
- The reply shows **right away**; the panel says "updating…" while the tracker works.
- The values shown are **those of the last message on screen**: swiping and going back show the right values for each version.
- **Any value can be edited** in the panel: it applies at that message, wins over the tracker and is marked with ✎.
- **What the tracker did**: ✓/✗, time, model, tokens, its reply and what was left out (e.g. a value out of range). **Run now / Run again** button.
- Values with "Send to the AI" go back into the next reply's prompt ("Current scene").
- Renaming the tracker or a field **does not lose** the saved values. Deleting the tracker turns it off in every session.

**Inside:** `packages/core/src/trackers.ts` (the engine only reads the fields), `apps/desktop/src/trackers.ts`, `ui/TrackerEditor.tsx`, `ui/ScenePanel.tsx`. Decision D-016. The offline AI invents values for any tracker, so it can be tested without a key.
**Verification:** 88 core tests + 24 click tests passing, no Rust changes, no database migration.

**For Daniel to check on Windows:** `npm run app` → Trackers → + New → create a tracker with 2 or 3 fields however you like (e.g. one per character) → Save → Close → in the session, turn it on in the Scene panel → send a message with GLM → see the values → swipe and go back → edit a value.

**Honest limitations:** the tracker uses the same connection as the story (its own connection and a cheap model come in step 4/5); turning it on only per session (default/campaign come in step 4); the "date/time" and "group" types exist in the core but not in the editor yet; the offline AI repeats status options (it is just for testing).

**Next:** slice 1 (character variants + history; personas with variants + ST import).

## Step 0 done (10/27, night) — CLAUDE
The app's base now follows the BLUEPRINT (D-015). Almost nothing changes on screen; what changed is inside:
- **Layered configuration** (default → campaign → session) already exists in the core; the screen to edit it comes in step 4.
- **Campaigns** already exist in the database (sessions can be born from a campaign, with cast, scenario and openings).
- **Agents in the new format** (trigger → input → output), with order, dependencies, conditions, an owner for each state value, locked fields, connection limits and Stop. All tested with a fake AI.
- **Everything tied to the message**: what each agent did, undoable rewrites, notes, the prompt sent for each reply, and the user's edits (they mark what comes after as "outdated").
- Character and persona **variants** already exist in the data and already change the prompt; the screen comes in step 1.
- **Visible now**: the "thinking" of thinking models (like Daniel's GLM thinking) is kept separately and shows folded as **"Reasoning"** above the reply. Before, it was thrown away.
- Daniel's database is updated by itself on the first opening (with an automatic backup in `backups/`).
- Verification: 81 core tests + 17 click tests passing; no Rust changes.

**For Daniel to check on Windows:** `npm install` and `npm run app` → open an old session (should stay the same) → send a message with GLM thinking → see "Reasoning" folded above the reply.

**Next:** ~~proof of concept~~ ✅ done (see section above).

## BLUEPRINT — the full design (10/27) — CLAUDE
- Daniel's request: stop building piece by piece and put together the "big picture". Result: **`docs/BLUEPRINT.md`**. **Read it before any new work.**
- Core ideas: (1) **Layered setup** — default → campaign → session; presets, persona, lorebooks, agents and trackers can apply to everything, to one campaign or only to one session; named saved setups = **Kits** ("RPG campaign", "Drama"). (2) **A single agent format**, made for the app (phase × kind × inline/separate); Homunculus v1's 69 templates come in by import. (3) **Trackers designed by schema**: the Scene panel shows and is editable without programming a new screen (RPG: money, quests, factions; Drama: emotions, relationships). (4) Character/persona **variants** chosen per session (Daniel's option B) + history. (5) Everything tied to the message (state, what each agent did, undoable rewrites, notes).
- **v2 (10/27)**: a critical review Daniel asked for — agents in the trigger → input → output format (checker, choice buttons, proposals with approval, who speaks, dependencies, memory), context budget, "see the prompt" of any message, trash and history for everything, HTML safety, cost limits, proof of concept (emotions tracker) right after slice 0, and 4 open questions (BLUEPRINT §12).
- Daniel's answers (10/27): no mobile, but keep the door open; card scripts kept possible (the sandbox option, with permission); local models kept open; separate trackers by default. New request: **Style Reviewer** (BLUEPRINT §4.4), based on github.com/unkarelian/fiction-prose-style (MIT).
- Status: **approved by Daniel (10/27)**; step 0 done. After the OK: slice 0 (align the current code, BLUEPRINT §10), then slice 1 (variants + personas).
- New rule: every feature answers the 5 questions of BLUEPRINT §11 before it is built.

## Reference maps (10/27) — CLAUDE
- Study done of **4 projects**: Daniel's **original Homunculus** (VasahTS/Homunculus — it is the list of what the app has to do), **SillyTavern** (only formats and behavior at the "border": cards, lorebooks, presets, macros, personas, chats), **Marinara Engine** and **Aventuras** (branch `master`).
- It all lives in `docs/reference/`. Start with `docs/reference/README.md`: it has the table "Homunculus 2 feature → where to look" and a map per project (file + function + line).
- The code of the 4 is **not** in the folder. When it needs reading, run `npm run refs` (downloads the exact versions into `.refs/`, which git ignores). `npm run refs -- --check` checks that the maps still point to files that exist; `npm run refs -- --latest` updates to the new versions.
- Rule for the next sessions: **do not re-read the whole projects**. Map → file → only the excerpt. Learned something new? Add a line to the map.
- Decision (Daniel, 10/27): study each part of ST **when building** that part, and without copying its architecture.

## Tauri × Electron × pure Rust discussion (10/23)
- A friend of Daniel's suggested Electron for **Linux compatibility** (valid: on Linux Tauri uses WebKitGTK, which lags behind Chromium) and because he came from **React Native** (does not apply: our app is web React, desktop first).
- Pure Rust (native screens) was ruled out: it would lose the HTML/CSS in messages (render agents) and the themes.
- Decision: **stay with Tauri**; switching to Electron costs ~1 day (only db.ts, secrets.ts, files.ts and the Rust change). Before the visual design phase: run the click tests on a WebKit engine too and decide for good if a friend uses Linux.

## UI references (for the design phase)
- Daniel found the style of https://pokebonk.com/ **beautiful** (10/23). The site is a canvas/WebGL game; only the dark indigo theme `#1a1630` and the fantasy/nature mood could be read — **ask Daniel for screenshots** when the UI phase starts.
- A Marinara-style character library (grid of cards + panel with a portrait), already noted before.

## Known limitations (honest)
- Not on screen yet: Kits, the full layered configuration (persona and connections can already be picked per session), agents (other than trackers), groups — the core supports them, the screens come in the next steps. (Lorebooks have a screen since 10/29, D-028.) (Personas and versions have a screen since 10/28.)
- `npm run refs -- --check` points out 3 broken references in the maps (`homunculus-v1.md` cites one of our files as if it were v1's; `aventuras.md` cites 2 `docs/ui` files that do not exist on the `master` branch). It gets in the way of nothing; fix it when touching those maps.
- Character pictures are all loaded at once; with hundreds of cards it may get slow (thumbnails will come later).
- Prompt v0: only the character card + the conversation. The real assembly (blocks + ST presets) comes in Phase 2.

## Next steps
The order is now **BLUEPRINT §10** (slices). Done: the key vault, sessions and characters, ST cards.
Done: slice 0, the proof of concept (user-made trackers), v1's trackers as data (D-017), UI direction "I" in the app (D-018) and **slice 1** (versions, personas, history, Trash — D-019). Noted for later: the Library Assistant (BLUEPRINT §4.9, slice 6b). Slice 1b (Settings and saved connections — D-020) and **slice 2** (block presets — D-021) also done. **Slice 3 (lorebooks)**: ✅ engine, import/export and prompt (D-027) and screens (D-028). **Slice 4 (Stories + Vault + NPCs)**: ✅ in the app (D-029), waiting for Daniel's test. **Next:** adjustments from his test; then slice 5 (full agents) or "Turn into an NPC" (the AI fills a card's sheet). Pending UI: the Customize screen.

Signed: **CLAUDE**.
