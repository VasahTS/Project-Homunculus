# Work log — CODEX

(Translated to English by CLAUDE on 2026-10-29, D-038: everything in the repository is in English. Content unchanged.)

## 2026-10-30 · Try it visual draft — D-052

After Daniel approved the text plan and authorized project examples, created `docs/drafts/agent-try-it/`: portable HTML, source template/styles/script, builder, verifier, validation report, font license, README and eight captures. Reused current app tokens/styles and Quiet profile; extracted four starter agent definitions directly from project source. Additional scene dialogue, results, reasoning explanation and model usage are explicitly scripted examples. Added focus cycling, stop/close cancellation, stale-result snapshots, typed result previews and full/empty/error states. Production source files and functionality are unchanged; implementation awaits visual approval. Signed: **CODEX**.

Validation: draft verification passed 54 layout checks/combinations and six interaction groups, including reduced motion and simulated 150% text; minimum sampled text contrast 8.32:1; no page errors or HTTP(S) requests. Project typecheck passed; 240 unit tests passed (2 skipped); diff check passed. Only documentation and draft artifacts changed; no production app, package, lockfile or workflow changes.

## 2026-10-30 · Try it text plan for review

Prepared the Step 1 UI plan after Daniel deferred agent activation/scopes and authorized Try it. Inspected the current editor, Compare sheet and pipeline, and the original prompt preview reference. Planned current-draft preview, existing chat/message context, explicit request/cost feedback, cancellation, read-only outputs, error/full states and regression criteria. Applied targeted UI/UX Pro Max guidance for loading feedback, duplicate-action prevention and contextual status announcements. No screen/draft or application code was created; the text awaits Daniel's review under HANDOFF.

Validation: typecheck passed; 240 unit tests passed (2 skipped); diff check passed. Only UI-PLAN.md, HANDOFF.md and CODEX-LOG.md changed. Signed: **CODEX**.

## 2026-10-30 · Agent reliability audit — D-051

Reproduced failures before implementation with browser/core regression tests, then corrected agent save ordering and retry/navigation retention, waited for active saves before deletion, rejected cross-chat manual/Compare message IDs, checked cancellation for text/code outputs and comparisons, and serialized keeper persistence per story to preserve concurrent proposals. Guarded slow Close/Delete completions so they preserve another editor opened in the meantime (both cases reproduced by new browser regressions). Kept the existing controls, visual states and appearance. Added deterministic queue tests and positive comparison/lorebook isolation coverage. Report: `docs/AGENT-RELIABILITY-AUDIT.md`.

Validation: final typecheck and production build passed; 240 unit tests passed (2 skipped); the full 129-scenario browser suite passed, then all 18 affected scenarios passed after the final Close/Delete guards (includes 2 new regressions; suite now 131 scenarios). Diff check passed. Browser/core validation used isolated test data and a fake AI; native Tauri, paid API and real disk/power failures were not tested. Draft retention lasts for the open app instance. All work is in `Homunculus-gpt` on `gpt`. Signed: **CODEX**.

## 2026-10-30 · Isolated gpt checkout — D-050

Cloned `origin/gpt` into Daniel's authorized `Homunculus-gpt` folder. Replaced the inherited dev-only workflow in this checkout's agent instructions with the exclusive folder and `gpt` branch rule. Own notes are signed **CODEX**, commit messages use `[CODEX]`, and prior authorship is preserved. Recorded D-050 and the handoff. No application code, UI, release workflow or original checkout was changed by this setup task.

Validation in this checkout: dependencies installed with `npm ci --ignore-scripts --no-audit --no-fund`; `npm run typecheck` passed; `npm test` passed (224 tests, 2 skipped; 28 suites passed, 1 skipped). `git diff --check` passed. Only the five instruction/handoff/decision/log Markdown files changed; application code and dependency lockfiles are unchanged. Signed: **CODEX**.

## 2026-10-29 · Quiet Story setup — D-045

Removed Story/Kit inline Prompt blocks following Daniel's request. Kept preset selection, Library editing, chat Prompt controls and existing stored overrides. Moved narrator placement into Cast beside the narrator as a closed, token-styled disclosure with a short current-value summary. Detailed controls, inherited reset and autosave behavior remain available after opening it. The chat presentation is unchanged. Created the closed/open HTML draft before implementation and compared actual captures with it. Files: StoryPage.tsx, NarratorPromptGroup.tsx, styles.css, prompt-control.e2e.ts and the plan/review/handoff docs. Signed: **CODEX**.

Validation: typecheck and production build passed; 213 unit tests passed (2 skipped); 23 affected browser flows passed (Story/Kit creation, narrator/preset inheritance, keyboard access and existing Prompt saves). Actual desktop closed/open captures inspected against the draft; 620 px placement had no overflow or page errors. Isolated seeded data; native/private data not inspected. Existing lockfile changes excluded. Signed: **CODEX**.

## 2026-10-29 · Review corrections — D-044

Fixed inline prompt text disappearing on collapse/navigation without Apply. Blur, close, scope changes and unmount flush pending edits; queued writes merge against the latest layer/preset, preserving the original scope. Apply remains immediate; Cancel explicitly discards pending edits. Updated the existing tracker editor to visible Export Set / Import Sets actions independent of field selection, with transfer controls under Copy or move fields. Export always contains the complete current Homunculus 2 set. Read the original Scene Fields guide §§8–9 and exportPreset implementation as Daniel requested; Daniel chose whole-set behavior with the Homunculus 2 format. No original-app or private play files were changed. Signed: **CODEX**.

Validation for D-044: typecheck/build passed; 213 unit tests passed (2 skipped); all 111 browser tests passed. New cases cover local/shared block collapse without Apply, leaving Prompt, explicit Cancel, original-scope preservation and Preview directly after typing. Export test selects one field, closes transfer tools and verifies the downloaded JSON still matches the complete documented set, including nested fields/presence/display; import/undo/refusal regressions remain green. Final 1280/620 px captures inspected without panel overflow/page errors. Existing lockfiles excluded. Signed: **CODEX**.

## 2026-10-29 · Functional rounds 4–5 — D-042 / D-043

Implemented scoped prompt-block edits in the chat inspector and Story/Kit, explicit shared-preset scope, field-by-field inheritance/reset, and configurable narrator placement/repetition without adding stored messages. Added optional setup schemas and immutable core helpers; preview, recorded generation and real turn assembly share the same effective preset. Existing defaults and full editors remain available.

Implemented tracker-set field selection, copy/move, collision refusal, nonempty-source protection, guarded draft undo and versioned JSON import/export (whole set, selection or all sets). Imports append fresh IDs after complete validation. Preserves stable keys, nested fields, display hints and presence rules; no saved chat values are rewritten. Added an English format/AI guide and a tested portable example. UI additions use the existing controls and tokens; no Customize work or visual redesign.

Review: `docs/REVIEW-CODEX-2026-10-29.md`. Existing local lockfile changes are excluded. Work is limited to `dev`; no release workflow or private portable data was touched. Signed: **CODEX**.

Verification: typecheck and production build passed; 213 unit tests passed (2 skipped); all 105 browser flows passed. Screenshot review caught the tracker preview compressing the form inside Library: corrected using the editor container's width and explicit shrinking grid tracks. All 18 affected flows passed again, including a new 1280/620 px regression (106 flows now in the suite). No reuse-panel or containing-panel overflow/page errors in the final captures. Native rendering and a real AI service remain separate manual checks. Signed: **CODEX**.

## 2026-10-29 · Functional work takes priority — D-041

Daniel asked to set UI refinement aside and focus on completing application functionality. Customize and further visual revisions are deferred until the app is more complete. Keep the approved UI as the current baseline; this does not remove the customization-first architecture requirement or authorize dropping features. CODEX must document its changes in English and sign them **CODEX**. The existing six-round plan resumes with round 4 (prompt control), then round 5 (tracker field sets); round 6 (multi-character cards to NPCs) still depends on the Library Assistant. No next feature is implemented by this priority update.

Documentation only; application code and data are unchanged. Signed: **CODEX**.

## 2026-10-29 · Approved navigation draft implementation — D-040

Author: **CODEX**. Daniel approved moving the last refined draft into the app before Customize. Stories and Characters are peer collections; Library groups reusable resources using quiet headings, indented categories and subtle selection. Existing data, editors and operations are retained. Shared collection tools, global name search (Ctrl+K), data-defined navigation and an additional Quiet profile are integrated. The Graphite profile remains available in the registry; no Customize UI is added.

Checks: typecheck, 194 unit tests (2 skipped) and production UI build passed. Affected browser flows: 32/32 passed; final full browser suite: 100/100 passed. Screenshots are from isolated seeded browser data. Native Tauri behavior is not claimed. Existing dependency-lock changes are outside the UI commit. Signed: **CODEX**.

## 2026-10-29 · Round 2: Apple Design, navigation and motion

Author: **CODEX**. State: local / unpublished, no commit or push. Daniel's request: more drafts with apple-design, frontend-design, design-taste-frontend and animate, focused on the menu experience.

New files in `docs/drafts/homepage-motion/`: `CODEX-PLAN.md`, `README.md`, `index.html`, `styles.css`, `app.js`, `build.mjs`, `verify.mjs`, `home-motion-drafts.html`, `validation.json`; Literata fonts and license and four SVGs in `assets/`; screenshots in `previews/`. CODEX SVGs reused from round 1, noted in the files; the font's original copyright preserved. No pre-existing CLAUDE work was attributed to CODEX. The previous round preserved.

Three drafts: D Atelier (gallery and cover transition), E Lantern (reading and discreet navigation), F Workspace (list and preview). Native popovers and dialog, immediate shortcuts, temporary changes with undo, keyboard and accessibility variants. The taste landing-page workflow was adapted to the explicit request for Apple Design in an app; the reasoning is in the plan.

Validation: `node --check docs/drafts/homepage-motion/app.js`; the Playwright/Chrome verifier passed for the separate sources and for the final portable HTML. 18 layout/color combinations per run, extra states, no overflow/broken images/JavaScript errors. Minimum contrast of the solid semantic pairs: 4.76:1. Checked focus/arrows/Escape, shortcuts without animation, create and Undo, pin and Undo, split view/tabs/filter, cover transition/cancellation, reduced motion, reduced transparency and increased contrast. Resting and mid-transition screenshots inspected. FPS and native Tauri behavior not measured. No database, personal installation, API or credential accessed; no app screen was implemented. Signed: **CODEX**.

## 2026-10-29 · Homunculus 2 HomePage drafts

Author: **CODEX**. State: local / unpublished, no commit or push.

Request: look at the project and suggest an HTML with alternatives for the app's start screen, confirmed by Daniel.

New files: `docs/drafts/homepage/index.html`, `styles.css`, `app.js`, `README.md`, `verify.mjs` (isolated verification), `serve.mjs` (loopback preview); local Literata font resources and their license in `assets/`; screenshots in `previews/`; this log. Three proposals independent from the current app: A Resume, B Library, C Refuge. The data is fictional; there was no access to the personal installation, the app's database or credentials. Fonts copied from dependencies already present; Literata's original authorship preserved in the license. No pre-existing CLAUDE work was attributed to CODEX.

Additional delivery file: `docs/drafts/homepage/home-drafts.html`, a single version that embeds the CSS, JavaScript, fonts and illustrations of the separate sources.

Validation: `node --check docs/drafts/homepage/app.js` and `node docs/drafts/homepage/verify.mjs` passed, for both `index.html` and `home-drafts.html`. Playwright + Chrome in an isolated context: 45 combinations per file (3 proposals, 3 widths, 5 states), no horizontal overflow or console/JavaScript errors; checked search, filter, Story/chat, resume, create/import and simulated navigation actions, error recovery, narrow sidebar and reduced motion. Visual inspection of the desktop A/B/C screenshots and narrow A. App tests not run: no application code was changed. The HTTP preview was not reachable in the built-in browser; server stopped, delivery through the local HTML. Signed: **CODEX**.
