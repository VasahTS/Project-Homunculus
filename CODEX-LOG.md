# Work log — CODEX

## Story name and picture in chat (2026-11-04) — CODEX

Reproduced the generic Narrator header. Openings and replies now display the story's name and picture, with the story's initial as the fallback. The Chromium regression covers separate narrator and story pictures, an existing opening, and a streamed and saved reply. Typecheck, 699 unit tests (3 skipped), and 18 Chromium tests passed. Local and unpublished. Signed **CODEX**.

Daniel showed a cover in Stories and an initial in the chat. The chat now uses the collection's cover resolver, including inherited covers. Confirmed the missing inherited cover before the fix and verified matching collection and chat images, plus priority for an uploaded story cover. Typecheck, 699 unit tests (3 skipped), and 7 Chromium Stories tests passed. Local and unpublished. Signed **CODEX**.

## Card Browser search and portrait loading (2026-11-04) — CODEX

Reproduced a portrait queue blocking a new search and a superseded All Sites query making a follow-up request. Discarded obsolete queued pictures, prioritized the preview, shared active downloads, stopped stale follow-up requests, and reused native HTTP connections. Typecheck, Vite build, 699 unit tests (3 skipped), 28 Rust tests, and 22 Chromium cases with synthetic catalogs passed. Signed **CODEX**.

## gpt publication batch (2026-11-04) — CODEX

Daniel authorized publishing the recent local Card Browser and Memory changes on `gpt`. Typecheck, Vite build, 699 unit tests (3 skipped), and 42 Card Browser, branch, and Memory Chromium cases passed with synthetic data. The earlier local lockfile metadata changes were kept outside the batch. Signed **CODEX**.

## Card Browser All Sites (2026-11-04) — CODEX

Added a combined source picker option with interleaved results, per-site paging and retries, and a separate NSFW preference that defaults on. Three new Chromium cases cover all six catalogs, source-specific import, overlapping IDs, account permissions, failed pages, and late responses. Typecheck, Vite build, 699 unit tests (3 skipped), and 19 Card Browser Chromium cases passed with synthetic data. Local and unpublished. Signed **CODEX**.

## Chapter visibility on chat messages (2026-11-04) — CODEX

Added an eye-off marker and chapter number to summarized originals. Chromium verifies coverage, branch switching, and re-enabling memory. Typecheck, Vite build, and 699 unit tests passed (3 skipped). Local and unpublished. Signed **CODEX**.

## Branch memory and prompt coverage audit (2026-11-04) — CODEX

Reproduced chapter sharing between named branches with the same head and a merge covering a switched-off chapter. Fixed branch-local snapshots, invalidated stale merges, honored message visibility in recall, and verified that prompts omit covered originals.
Local and unpublished. Typecheck, Vite build, 699 unit tests (3 skipped), and 23 Chromium scenarios passed with synthetic data. Signed: **CODEX**.

## Memory writer settings and prompt visibility (2026-11-04) — CODEX

Reproduced a reasoning-only response cut off at 1,200 tokens and a blank title swallowing the summary. Added per-chat writer settings, clear errors, and prompt placement details. Inactive Chat History no longer produces a memory receipt.
Local and unpublished. Typecheck, Vite build, 695 unit tests (3 skipped), and 11 memory Chromium scenarios passed with synthetic data. Signed: **CODEX**.

## Chat fixes promotion (2026-11-04) — CODEX

Prepared the Markdown export and agent navigation fix for `gpt`, `dev`, and `ui` at Daniel's request.
Pre-push typecheck, Vite build, 677 unit tests (3 skipped), and 27 Chromium tests passed with synthetic data.
The local npm metadata changes in `package-lock.json` are outside this commit. Signed: **CODEX**.

## Markdown export from the open chat (2026-11-04) — CODEX

Added **Export as Markdown** to the Play chat menu. Reused the existing save flow and passed the branch end shown on screen.
The download test verifies the filename and saved transcript when the selected branch is older than another branch.
Initial checks passed with synthetic data. Typecheck, Vite build, 677 unit tests (3 skipped), and 25 Chromium tests. Signed: **CODEX**.

## Chat agents across navigation (2026-11-04) — CODEX

Tracked automatic and manual agent progress by chat. Manual work from Agents, Scene, and Reply survives navigation and shares the chat's Stop control.
Kept manual rewrites on the original message without advancing the branch. Four browser cases cover completion, progress isolation, cancellation and rewriting.
Fast-forwarded local `gpt` to `origin/gpt` at `b6c9fd4` and reapplied the fix. Pre-sync work is backed up in stash `1420c287`.
Initial checks passed with the offline provider. Typecheck, Vite build, 677 unit tests (3 skipped), and 37 Chromium tests. Signed: **CODEX**.

## Consolidated gpt publication (2026-11-03) — CODEX

Daniel explicitly authorized reviewing and pushing all local gpt updates; the earlier local-only restriction is superseded.
Includes UX/Assistant reliability, DataCat, tracker/persona context, message metadata, HTML/CSS, rewrite menus and collection sorting.
Also includes the two unchanged pre-existing lockfile edits (original authorship unestablished) and seven synthetic test screenshots.
Validation: typecheck/build; 665 unit passes (3 skips); 261 complete-suite browser passes; no source changed during validation.
Inventory and limitations: docs/GPT-PUBLICATION-2026-11-03.md; destination origin/gpt only, without force or other-branch/release changes.
Earlier local/unpublished statuses are historical checkpoints. Signed: **CODEX**.

## ST-style collection sorting (2026-11-03) — CODEX

Daniel requested the ST-style sorting selector for Library, Characters and Stories, supplying its options as the UI reference.
Shared native selectors support name, dates, applicable favorites/activity/chat counts, estimated tokens and stable random order.
Choices/seeds persist per collection in existing h2.collectionPrefs; search, folders, view/size preferences and editor selection remain independent.
Display sorting preserves agent execution order; sorted regex edits map back to original positions and drag handles return in Execution order.
Validation: 665 unit passes (3 skips), typecheck/build; 42 browser cases pass across final runs, including five new sorting cases.
Report: docs/COLLECTION-SORTING-2026-11-03.md. Local/uncommitted/unpublished; synthetic data only, no native/live-provider check. Signed: **CODEX**.

## Named menus for every rewrite agent (2026-11-03) — CODEX

Daniel requested a separate menu for every rewriting agent, labeled with its name instead of the last-only polished marker.
Each agent now has its own menu and exact saved before/after comparison; repeated runs are grouped with separate comparisons.
The current final rewrite retains undo/partial-edit controls; earlier snapshots are read-only, and exact undo restores earlier menus.
Reconstructs tied-timestamp histories by content; names wrap/truncate accessibly and menus fit the actual chat scrollport.
Validation: 645 unit passes (3 skips), typecheck/build; 35 related browser cases pass across final runs, including three new menu cases.
Report: docs/REWRITE-MENUS-2026-11-03.md. Local/uncommitted/unpublished; synthetic providers/data, no native/live-provider check. Signed: **CODEX**.

## HTML5/CSS3 and Animation Agent rendering (2026-11-03) — CODEX

Daniel supplied both agent prompts and requested completing their rendering support locally on gpt while away.
Styled chat replies now render in isolated documents, preserving HTML5, classes, CSS variables/layouts/keyframes and Markdown narration.
Includes stored rewrites and live replies; code samples keep their existing presentation, and HTML/motion/image preferences are respected.
Separate sanitizer/CSP prevent scripts, frame navigation and unapproved remote resources; expanding/collapsing content resizes without polling.
Validation: 639 unit passes (3 skips), typecheck/build; 37 related browser passes, including six new integration cases with no page errors.
Report: docs/MESSAGE-HTML-CSS-2026-11-03.md. Local/uncommitted/unpublished; synthetic provider/output, no native/live-provider test. Signed: **CODEX**.

## Message date, time, number and separate token counts (2026-11-03) — CODEX

Daniel supplied v1 screenshots as the UI reference and explicitly selected this gpt checkout.
Chat messages now show local date/time, their 1-based position on the selected path, and separate Text/Reasoning counts.
Preserves provider reasoning usage in an optional generation-record field; total output/billing semantics remain unchanged.
Missing breakdowns and edited text use visible ~ estimates; versions/branches retain their own metadata, including hidden reasoning.
Validation: 629 unit passes (3 skips), typecheck/build; 13 related browser cases pass across final runs, including narrow/large-text checks.
Report: docs/MESSAGE-METADATA-2026-11-03.md. Local/uncommitted/unpublished; synthetic providers/data only, no native/live-provider check. Signed: **CODEX**.

## Assistant generation across navigation (2026-11-03) — CODEX

Reproduced Play/Settings navigation dropping the visible live reply and Stop handle while the provider kept running.
Assistant runtime now belongs to the app-level hook; the mounted view subscribes to its snapshot without rerendering App for each token.
Preserves pending chat/text/controller/compaction/error across remounts; accepted chats appear in Recents and duplicate starts are guarded.
Five new browser cases cover live return/Stop, background completion, Settings, chat/draft isolation and first-save failure/retry.
Validation: 615 unit passes (3 skips), typecheck/build; 19 related browser passes across final runs. Report: docs/ASSISTANT-BACKGROUND-2026-11-03.md.
Local/uncommitted/unpublished on gpt; synthetic data/providers, no native/private-data test; prior work/lockfiles/screenshots preserved. Signed: **CODEX**.

## Assistant code word wrap (2026-11-03) — CODEX

Daniel's screenshot showed code paragraphs continuing horizontally: the prior fix contained width but retained white-space: pre.
Scoped Assistant pre blocks now use pre-wrap/overflow-wrap:anywhere; indentation, blank lines and original Copy text remain intact.
Updated the existing two browser cases: deterministic streaming gate, actual wrapped-line geometry, no horizontal code scroll, exact mocked clipboard and resize.
Validation: both cases failed before CSS; final browser 2/2 plus message-format 1/1; 615 unit passes (3 skips), typecheck/build.
Report: docs/ASSISTANT-CODE-WRAP-2026-11-03.md. Browser screenshots inspected; synthetic data only, no native/provider check.
Local/uncommitted/unpublished on gpt; earlier source, lockfile and screenshot edits preserved. Signed: **CODEX**.

## Tracker persona context (2026-11-03) — CODEX

Reproduced missing persona in Scene: Characters at normal and depth placement: starter inputs never enabled that source.
All three bundled trackers now read it; existing built-ins upgrade once via their agent version; new custom trackers include it too.
Selected persona versions/macros reach automatic/manual/Compare calls; Not sent now also excludes the separate agent source.
Validation: 10 new unit cases (8 observed failing before their fixes), 615 full unit passes (3 skips), typecheck/build; 14 related browser passes across final runs.
Report: docs/TRACKER-PERSONA-CONTEXT-2026-11-03.md. Synthetic data/providers only; no native app or live-provider verification.
Local/uncommitted/unpublished on gpt; earlier work and lockfile/screenshot edits preserved. Signed: **CODEX**.

## Assistant helper, personas and code overflow (2026-11-03) — CODEX

Daniel chose an optional retrieval model on its own connection; configure Customize → Assistants → Tool helper (off by default).
Bounded read-only delegation returns evidence/cursors; writes/approvals stay with the principal; helper trace/usage and combined totals are visible.
Added persona create/change/approval/drafts/Open/Trash; fixed streaming code and expanded-trace overflow at desktop/narrow widths.
Validation: 605 unit passes (3 skips), typecheck/build; 38 affected browser passes, then 3 final helper/persona passes after snapshot/input refinements.
Reports: docs/ASSISTANT-TOOL-HELPER-2026-11-03.md and docs/ASSISTANT-PERSONAS-OVERFLOW-2026-11-03.md.
Optional Assistant schema extensions only; no SQL/dependency change. Synthetic data/providers; live savings/quality and native behavior unverified.
Local/uncommitted/unpublished on gpt; earlier work, lockfile and screenshot changes preserved. Signed: **CODEX**.

## Assistant large-card reading (2026-11-03) — CODEX

Reproduced historical reads cut through JSON at 400 characters, losing source cursors after a user continuation.
Added clean 6k source pages and explicit _read ranges/next arguments; recent read bodies retained within a 24k/known-context budget.
Older excerpts stay valid and preserve cursors; legacy saved results are upgraded only for replay. Version/lore-entry text pagination now works.
Validation: six failing regressions fixed; 13 new unit cases, 583 full unit passes (3 skips), typecheck/build; 13 affected browser passes.
Report: docs/ASSISTANT-LONG-READS-2026-11-03.md. Synthetic model/browser checks; no private chat or live-provider/native verification.
Local/uncommitted/unpublished on gpt; earlier audit fixes and all prior local work preserved. Signed: **CODEX**.


## Assistant field-contract audit (2026-11-03) — CODEX

Audited all five writable item kinds after Daniel requested more bugs like the tracker failures.
Fixed narrator metadata/style/blocks, Kit links/cast/inheritance, advanced lore/read/stale/operations and partial Character Notes.
Draft target kinds and unknown/root fields are checked; invalid proposals/new-item approvals return to the model before user action.
Validation: 20 failing unit cases and a failing browser reproduction fixed; 570 unit passes (3 skips), typecheck/build; 6 affected browser cases pass across final runs.
Report: docs/ASSISTANT-FIELD-CONTRACT-AUDIT-2026-11-03.md. Synthetic data only; no real-provider/native validation.
Local/uncommitted/unpublished on gpt; prior changes preserved. Daniel's subsequent long-card reading report is a separate follow-up. Signed: **CODEX**.


## Assistant tracker context and field preservation (2026-11-03) — CODEX

Daniel reported misplaced filling instructions and every field returning to Auto; audited tracker options against editor/schema/runtime.
Guide now explains help versus note, scoped display choices, locks, prompt inclusion, lists, presence and default-field-set limits.
Tools retain the complete field schema and nested columns through create/read/approval/change; default-set presence is supported and validated.
Validation: seven original regression failures fixed; 545 unit passes (3 skips), typecheck/build, 4 related browser passes.
Report: docs/ASSISTANT-TRACKER-FIELDS-2026-11-03.md. Existing tracker content is not automatically rewritten; real-provider/native checks not run.
Local/uncommitted/unpublished on gpt; prior UX/DataCat work and lockfile edits preserved. Signed: **CODEX**.


## DataCat V2 description fix (2026-11-03) — CODEX

Reproduced Daniel's public card: legacy personality is null; embedded V2 description contains 3,705 characters.
Preview and download now share the V2 mapping, with legacy fallbacks and creator download controls preserved.
Validation: four failing regression cases now pass; typecheck/build; 529 unit passes (3 skips); 11 related browser cases pass across final runs.
Live public response passed the actual adapter/importer/PNG round-trip in memory; no native Tauri check this follow-up.
Report: docs/DATACAT-DESCRIPTION-FIX-2026-11-03.md. Re-add earlier incomplete imports; existing characters are unchanged.
Local/uncommitted/unpublished on gpt; prior UX work and lockfile edits preserved. Signed: **CODEX**.


## Twelve UX findings implemented locally (2026-11-03) — CODEX

Daniel directly authorized all R1–R12 on gpt: draft/save protection, keyboard/layout/model/search, fixed card actions, Assistant versions/branches/delete/scroll.
Compatible optional setup/history fields; shared messages stored once; Library actions are not replayed when selecting paths; no dependency or SQL-table changes.
Validation: typecheck/build; 516 unit passes (3 skips); 227 full browser passes, then 21 affected passes after final integrity/action-position changes.
Report: docs/UX-IMPLEMENTATION-2026-11-03.md. Local/uncommitted/unpublished; dev/ui unchanged; original lockfile edits preserved.
Seven test-regenerated screenshots remain local: automatic review rejected restoring them under the no-discard rule; cleanup awaits approval. Signed: **CODEX**.

## BotBooru source and account — publication authorized (2026-11-02) — CODEX

Daniel directly requested BotBooru first: source/search/filter/details/original-PNG import plus the site's own account window for NSFW/NSFL.
Fixed GET-only isolated session; no credentials returned to main; account flags respected; logout clears results; closing main also ends the site window.
Validation: typecheck/build, 506 unit passes (3 skips), 19 browser passes, 27 native passes; real SFW Windows import and post-exit persistence passed.
Report: docs/BOTBOORU-INTEGRATION.md; evidence: docs/evidence/botbooru-native-2026-11-02.json.
Real authenticated NSFW/NSFL remains untested; no personal data/API keys, schema or dependency changes; pre-existing lockfiles preserved.
Daniel explicitly authorized committing/pushing gpt and merging/pushing ui. Existing local lockfile edits remain excluded. Signed: **CODEX**.


(Translated to English by CLAUDE on 2026-10-29, D-038: everything in the repository is in English. Content unchanged.)

## Card Browser review and ui promotion (2026-11-02) — CODEX

Daniel authorized gpt push followed by gpt → ui integration; e19bf40 is included with the JannyAI fix.
The details review found one keyboard bug: arrows in full-text fields were intercepted by grid navigation; failing regression added, minimal focus-scope fix applied.
Checks: typecheck/build, 488 units (3 skips), 14 related browser flows. Report: docs/CARD-BROWSER-DETAILS-REVIEW.md.
Both checkouts' existing lockfile edits are preserved; no native transport, schema or dependency changes. Signed: **CODEX**.

## Card Browser readable details (2026-11-02) — CODEX

Daniel explicitly authorized UI changes on gpt and supplied v1 screenshots as the target for larger artwork and full, scrollable, collapsible fields.
CardBrowser.tsx and styles.css: full-width contained portrait; eight independently collapsible text sections with bounded scrolling and keyboard focus; greeting changes reset text scroll.
New e2e/card-browser-details.e2e.ts: desktop/narrow layouts, all long fields, keyboard reading/folding, greetings and card changes; three cases failed before the fix and pass now.
Checks: typecheck/build; 488 unit passes (3 skips); 13 related browser passes. Visual review uses synthetic content and bundled sample artwork; native app/live sites untested this round.
Actual checkout: Project-Homunculus/Homunculus-gpt (gpt); the configured Homunculus2 path no longer exists. Existing lockfile edits preserved, not attributed to this task.
Status: committed locally on gpt with Daniel's authorization; no push; no schema/dependency/personal-data changes. Signed: **CODEX**.

## JannyAI publication authorized (2026-11-02) — CODEX

Daniel confirmed the working fix and explicitly requested its push to gpt.
Commit authorship is CODEX with [CODEX]; publication contains the tested correction, tests, provenance and evidence only.
Existing local package-lock.json/Cargo.lock changes are preserved unstaged and not attributed to CODEX.
Validation retained: 488 units (3 skips), 204 browser flows, 23 Rust tests; three real native imports. Signed: **CODEX**.

## JannyAI recovery implemented (2026-11-02) — CODEX

Daniel asked for a working solution after the test-only audit. API-origin browser verification now supplies the supported signed PNG; native fetch validation remains unchanged.
Actual packaged Windows UI imported three public safe cards; persisted avatars, definition fields and source verified after exit. Remote database command denied.
Eight reproductions now pass normally; extra tests cover caps, rate limits, queue correlation, stale replies, native failure and shared card fetch.
Validation: typecheck/build, 488 units (3 skips), 204 browser flows, 23 Rust tests; Linux/macOS not validated.
Local/uncommitted, no push. Report: docs/CARD-BROWSER-RELIABILITY-AUDIT.md. Signed: **CODEX**.

## Card Browser / JannyAI test audit (2026-11-02) — CODEX

Daniel authorized ui into gpt and the test battery; clean fast-forward 7304ab9 → 9fac7f5, no new commit/push.
Typecheck/build pass; final units 472 pass + 6 expected fail + 3 skip; browser baseline 199 pass plus new Janny 2 pass + 2 expected fail; native 20 pass.
Eight expected-failure cases record seven unfixed findings; a genuine synthetic PNG import preserves provenance, greetings and prompts.
Live isolated WebView2: native search 200/80 cards, native download 403; original Marinara browser helper fails CORS and its Node fallback gets 403.
Report: docs/CARD-BROWSER-RELIABILITY-AUDIT.md. No product fixes or real native import claimed. Signed: **CODEX**.

## Four ui review bugfixes (2026-11-02) — CODEX

Daniel requested these four ui fixes before committing, then explicitly authorized the local gpt commit. T-007 is preserved; no push is authorized or performed.
Quick Connection is viewport-clamped and portaled, preserving Assistant width; Library remembers the last saved item without replacing new drafts; Settings restores arrow navigation/focus; summary help reveals on hover.
Added e2e/ui-review-fixes.e2e.ts: original four cases failed before fixes; seven final regression cases cover both chat modes, resizing, all three editors, draft protection, tab wrap/focus and help by mouse/keyboard.
Validation: typecheck; **441 unit passes (3 skips); 40 affected browser flows pass**, including the seven new cases. No native UI/real-provider/private-data checks.
No dependency, lockfile, schema or existing native-command changes in this follow-up. Signed: **CODEX**.

## T-007 Card Browser desktop transport (2026-11-02) — CODEX

Fast-forwarded gpt to ui f7417e8 as Daniel requested; copied the three Card Browser planning documents from dev 4966f63, preserving CLAUDE authorship.
Added card_site_request and cardSites.ts: public-only HTTPS, host/header rules, bounded redirects and sizes, image/card checks, native metadata and the browser fake. Existing web commands are unchanged.
Checks: typecheck; **441 unit passes (3 skips), including 11 new transport tests; 20 native passes (11 new)**; diff check. No live site or native UI check.
Native tests used identical source/dependencies in an isolated copy: only its temporary lock's root-package version was aligned to 0.2.0 (the repository lock still says 0.1.0 and was preserved).
T-007 is complete; T-008 remains Ready. Daniel explicitly authorized committing this work locally on gpt on 2026-11-02 after the earlier approval rejection. No push. Signed: **CODEX**.

## Expanded 0.2.0 changelog (2026-11-01) — CODEX

Daniel requested fuller English notes after reviewing the release summary. Compared v0.1.0..v0.2.0 commits, shipped source, decisions and reliability reports.
Expanded CHANGELOG.md by feature area, including prompt scopes/autosave, field-set reuse, narrators, story lorebooks, folder shortcuts, exports, connection limits and individual reliability fixes.
Synchronized the 104-item changelog with the existing [0.2.0 release](https://github.com/VasahTS/Project-Homunculus/releases/tag/v0.2.0) and latest.json notes; verified the tag, binaries, signatures, date and updater platform entries are unchanged.
Validation: typecheck and **420 unit passes (3 skips)**; release-note extraction, unchanged 0.1.0 section and diff checks pass. No application changes or installer rebuild. Signed: **CODEX**.

## Release 0.2.0 preparation (2026-11-01) — CODEX

Daniel directly requested dev → main, current README screenshots, English changelogs and Windows/Linux installers; this explicitly authorizes the release/branch exception to D-050.
Prepared on Homunculus-gpt/gpt from dev 955b1c2: README feature refresh, three current UI captures and the 0.2.0 changelog. Screenshots use only the isolated browser demo/offline AI.
Validation: typecheck; **420 unit passes (3 skips), 174 browser passes, 9 Rust passes**. Regenerated draft-test images restored; no app code, workflow or manual lockfile edits.
Published **0.2.0**: [release](https://github.com/VasahTS/Project-Homunculus/releases/tag/v0.2.0), [successful run 41308386059](https://github.com/VasahTS/Project-Homunculus/actions/runs/41308386059). Windows NSIS, Linux deb/AppImage, signatures and latest.json verified; dev/main received the workflow version commit.
The workflow owns version bumps, publication and syncing the version back to dev. Native installation and real-provider behavior are not certified by these checks. Signed: **CODEX**.

## 2026-11-01 · T-005 native web access and DuckDuckGo reader

Added only T-005's native commands, web module, synthetic fixtures/tests and Flint credit; no Assistant UI/tools, schemas, settings keys or roleplay changes.
Searches share a paced queue and cooldown; pages use public-only DNS, bounded same-host redirects and 2 MB bodies. Stop returns immediately; late native answers retain their slots and are discarded. Session caches expire/evict; duplicate page reads share the native request.
Validation: typecheck; **406 unit passes, 3 skips (47 web tests); 8 Rust passes; cargo build**. Pinned original Flint functions executed offline to generate parity cases. Initial transient MSVC PDB link error cleared on rerun.
Only Cargo.lock's app dependency list changed (reqwest 0.13.5 already present); no new crates or TLS features. No live search, native UI, keys or private data used; no browser-flow changes to test in this card.
T-005 Done; T-006 waits for Claude's review/merge into dev, as its card requires. No open questions. Signed: **CODEX**.

## 2026-11-01 · T-004 Assistant audit bug fixes

Reproduced all seven unit failures and A7 in Chromium before fixing A1–A7, on Homunculus-gpt/gpt only. No changes to dev/main, schemas, storage keys, tool definitions, token limits, lockfiles or workflows.
Fixed import approval with original/embedded data intact, Stop write boundaries and partial-write reports, Kit stale checks, current card outcomes, available guides, absolute paging, and selected-chat/reply isolation.
Validation: typecheck and diff check passed; **352 unit passes, 3 skips; 19 audit regressions pass with H2_AUDIT_VERIFY=1; 6 browser flows pass**, including approval of both import kinds and the next send after navigation.
T-004 marked Done. Report: `docs/ASSISTANT-RELIABILITY-AUDIT.md`. Real APIs, native Tauri and full embedded-import Undo not tested; Stop intentionally retains completed writes. No open questions. Signed: **CODEX**.

## 2026-11-01 · DuckDuckGo web search request for Claude

Recorded Daniel's explicit request for Assistant web_search/web_fetch with DuckDuckGo only, no required Exa/key or silent provider fallback, controlled concurrency and temporary-error cooldown.
Saved his Flint settings screenshot and pinned implementation references in `docs/ASSISTANT-WEB-SEARCH-REVIEW.md`; his reported 404 recovery is user experience, not a verified error diagnosis.
Linked total token budgets, source citations and actual request visibility. Documentation/reference only; no app, UI, schema or dependency changes. Validation: typecheck passed; 324 unit passes, 7 expected failures, 3 skips; diff check passed. Signed: **CODEX**.

## 2026-11-01 · Assistant efficiency and transparency review notes

Recorded Daniel's request for Claude: consolidate the current Assistant, control total spending, reduce old argument replay, bound reads and review always-included preset context.
Added the explicit requirement to inspect actual final outbound requests and explain inclusions, omissions and transformations per call; separate measured/estimated and per-call/cumulative usage, excluding credentials.
Added synthetic character measurements, versioned Marinara sources, review priorities and verification expectations to `docs/ASSISTANT-RELIABILITY-AUDIT.md`. No production, UI, schema or budget-default changes. Validation: typecheck passed; 324 unit passes, 7 expected failures, 3 skips; diff check passed. Signed: **CODEX**.

## 2026-11-01 · Assistant bug audit — direct request

Resolved the pending note-only HANDOFF merge with Daniel's explicit authorization; preserved dev b3c59e4 and prior gpt work (merge 33d066a).
Seven confirmed findings, eight reproductions: 7 unit cases and 1 browser case. Audit only; no production fixes or UI decisions.
Validation: typecheck; 324 ordinary unit passes, 7 expected failures, 3 skips; all 3 existing Assistant browser flows pass; new navigation case reproduces the wrong displayed chat.
Report: `docs/ASSISTANT-RELIABILITY-AUDIT.md`. Real API/native/private data not tested. Work only in Homunculus-gpt/gpt. Signed: **CODEX**.

## 2026-11-01 · T-001 simple memory reliability audit

Fast-forwarded gpt to committed local dev (`e774906`), preserving the original checkout's uncommitted files. Reproduced six core failures plus browser saving/draft failures before their corresponding fixes.
Memory requests reject foreign paths and revalidate late answers; chapter patches use the shared write queue. The existing editor retains newer local drafts and reports failed saves for retry. No schema, chapter path rule, prompt order, layout or wording changes.
Validation: typecheck/build passed; **309 unit tests passed (3 skipped); 20 browser flows passed** on exclusive port 1427. Added 14 unit and 6 browser cases; diff check passed.
Report: `docs/MEMORY-RELIABILITY-AUDIT.md`. T-001 Done; T-002/T-003 Ready. Real API/native/private-data and unsaved-draft restart persistence are not claimed. Work only in Homunculus-gpt/gpt. Signed: **CODEX**.

## 2026-11-01 · Five review bugfixes — direct request

Fixed all five reviewed bugs after ten failing unit regressions: stale chapter summaries after edits, duplicate summary spans, missing/obsolete originals of regex edits, omitted before/parallel feedback, and ignored per-test model choices.
Added per-session summary/write queues, late-summary validation and preserved-but-off affected chapters; kept the existing chapter path rule. Queues recover after failure; edits do not wait for model calls. No UI/schema/lockfile/workflow changes.
Validation: typecheck/build passed; **295 unit tests passed (3 skipped); 37 affected browser flows passed** on exclusive port 1427. Added 12 unit cases and 2 browser flows. Report: `docs/REVIEW-BUGFIXES-2026-11-01.md`.
Daniel authorized this direct bugfix request; T-001's full audit and the other Ready cards remain pending. Work only in Homunculus-gpt on gpt; no native/real-API/private-data checks. Signed: **CODEX**.

## 2026-10-30 · Agent editor Try it integrated — D-053

Daniel approved the visual draft. Added the editor action and native modal using the app-owned live AgentDraft, chat/message selection, agent/per-test connection, explicit Run/Stop, typed result, actual sent input/raw answer, conditional reported reasoning and usage. Matched the approved Quiet layout and retained only production controls. Kept failed/pending autosave independent; trapped/returned focus; guarded duplicate requests, loading races, context changes, cancellation and late results. Added a theme token for the approved backdrop.

Added TurnPipeline.previewAgent for ephemeral definitions and shared read-only context with Compare. Local speaker/name snapshots avoid changing running-turn labels. Reused AgentRunner.dryRun/output validation without application/events/records. Explicit tests bypass automatic conditions, read only already-saved dependency results, explain missing dependencies/Story context and unsupported standalone modes/tools, and expand text mode without AI. Failed requests retain their actual prompt.

Validation: `npm run typecheck` passed; `npm test` passed **261 tests** (2 skipped); production desktop UI build passed (existing large-chunk advisory); **all 143 Playwright browser flows passed** on isolated port 1427. New coverage: 21 core tests, 12 browser flows. Before/after snapshots and mutator/event spies verify read-only execution; browser checks cover failed autosave, Stop/Escape/navigation, duplicate Run, loading races, errors/retry, unsafe raw text, stale snapshots, text mode, reasoning/usage, unsupported/empty states and narrow/full content. Actual screenshots in `docs/drafts/agent-try-it/integration/` were compared with the approved draft; eight added cast cards, long names, 25 choices, reduced motion and simulated enlarged text are included. Report: `docs/AGENT-TRY-IT.md`.

No private data, portable play folder, credentials or paid API was accessed; native Tauri/real-provider checks were not performed. All work stays in Homunculus-gpt on gpt. No other checkout, workflow, lockfile, release or activation/scopes feature changed. Signed: **CODEX**.

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
