# CODEX change record

## BotBooru source and account — publication authorized (2026-11-02) — CODEX

Daniel directly requested BotBooru first: source/search/filter/details/original-PNG import plus the site's own account window for NSFW/NSFL.
Fixed GET-only isolated session; no credentials returned to main; account flags respected; logout clears results; closing main also ends the site window.
Validation: typecheck/build, 506 unit passes (3 skips), 19 browser passes, 27 native passes; real SFW Windows import and post-exit persistence passed.
Report: docs/BOTBOORU-INTEGRATION.md; evidence: docs/evidence/botbooru-native-2026-11-02.json.
Real authenticated NSFW/NSFL remains untested; no personal data/API keys, schema or dependency changes; pre-existing lockfiles preserved.
Daniel explicitly authorized committing/pushing gpt and merging/pushing ui. Existing local lockfile edits remain excluded. Signed: **CODEX**.

Files: packages/card-browser/src/{sources/botbooru,types,index,pauses}.ts; package tests and original-query fixture; apps/desktop/src/{cardSites.ts,ui/BotbooruAccount.tsx,ui/CardBrowser.tsx,styles.css} and new bridge/transport tests; native src/{botbooru.rs,botbooru.js,lib.rs}, capabilities/botbooru.json, permissions/{botbooru,janny}.toml; e2e/botbooru.e2e.ts; CREDITS.md; report/evidence and signed work records. CODEX.


## 2026-11-02 — Review of readable details and authorized ui promotion — CODEX

Daniel explicitly requested publishing gpt, then bringing it into ui; this overrides the repository's usual gpt-only publication rule for this operation.
Reviewed pre-existing CODEX commit e19bf40: enlarged contained portrait, complete scrollable fields and native collapsible sections. Its authorship/history is retained.
Found and reproduced a keyboard regression before fixing it: ArrowDown in the Description text moved focus to another card. Added a regression to e2e/card-browser-details.e2e.ts.
Changed apps/desktop/src/ui/CardBrowser.tsx only to scope grid arrow navigation away from the details sheet; standard text scrolling and grid navigation both pass.
Validation: typecheck, production frontend build, 488 unit passes (3 skips), 14 related browser flows. New review record: docs/CARD-BROWSER-DETAILS-REVIEW.md.
Updated HANDOFF.md, CODEX-LOG.md, docs/CODEX-TASKS.md and this record. Native transport, dependencies, schemas and lockfiles are unchanged by this follow-up.
Existing package-lock.json and apps/desktop/src-tauri/Cargo.lock edits in both checkouts remain local and are not attributed to this work.
Publication to gpt and ui is authorized; integration must preserve both checkouts' local changes and use a normal push.

Signed: **CODEX**.

## 2026-11-02 — Card Browser readable details — CODEX

Status: **committed locally on gpt, not pushed**, as Daniel authorized after reviewing the completed work. Daniel authorized UI work on gpt and specified the supplied v1 screenshots as the reference for this correction.
Files: apps/desktop/src/ui/CardBrowser.tsx and apps/desktop/src/styles.css: enlarge and contain the portrait above the title, slightly widen this sheet, replace clipped field excerpts with native disclosure sections and full independently scrollable text, and reset reading position on greeting changes.
Tests: e2e/card-browser-details.e2e.ts; original three failures reproduced the 65px portrait and inaccessible full-text regions; final three pass at desktop/narrow widths, covering all eight fields, keyboard folding/reading, greetings, card switches and narrow-sheet close.
Records: HANDOFF.md, CODEX-LOG.md, docs/CODEX-TASKS.md and this file.
Validation: npm run typecheck; npm test (488 pass, 3 skips); npm run build -w @homunculus/desktop; 13 related browser flows pass; git diff --check.
Visual captures: card-browser-image.png and card-browser-fields.png in this chat's visualizations directory; synthetic definitions and the repository-distributed default_Seraphina.png only. No private database or credentials used. Native app and live sites untested this round.
The checkout moved to C:/Users/danie/Documents/SillyBunny-Classic-Dev/Project-Homunculus/Homunculus-gpt; branch gpt at 8571866. Fetched dev; it adds no commits beyond HEAD, so no merge was needed.
Pre-existing package-lock.json and apps/desktop/src-tauri/Cargo.lock edits preserved and excluded from this task's authorship. No schema, dependency, transport, release or workflow change.
Signed: **CODEX**.

## 2026-11-02 — Authorized JannyAI commit and push — CODEX

Daniel confirmed the correction works and explicitly requested publication to origin/gpt.
The commit has CODEX authorship and a [CODEX] message; it includes the correction, regression tests, credited reference fixture, evidence and signed records.
No application source changed during publication; the completed validation remains 488 unit passes (3 skips), 204 browser passes, 23 Rust passes and three real packaged-app imports.
At publication start, package-lock.json had peer-flag removals and apps/desktop/src-tauri/Cargo.lock had a root-version metadata change. They are preserved locally and excluded from this commit; their authorship is not established by Git.
Only gpt is being published. Signed: **CODEX**.

## 2026-11-02 — Working JannyAI native-session recovery — CODEX

Status: **local, uncommitted, not pushed**. Follow-up to Daniel's request for a solution after the audit.
Files: apps/desktop/src-tauri/src/{janny.rs,janny.js,lib.rs}, capabilities/{janny,default}.json and permissions/janny.toml: serialized fixed-origin browser session, bounded report/timeout, local-main command permissions and report-only remote access.
Files: apps/desktop/src/cardSites.ts and packages/card-browser/src/{types.ts,sources/janny.ts}: browser/native/session routing, shared decoder, PNG details, mirror/page recovery, preserved definition fields and short-lived file sharing.
Files: apps/desktop/src/ui/CardBrowser.tsx and App.tsx: retry incomplete details and expose the existing downloaded-file import action after download refusal.
Tests: cardSites-janny-audit.test.ts, packages/card-browser/test/janny-audit.test.ts, e2e/janny-audit.e2e.ts and native janny.rs tests; original eight reproductions now ordinary passes.
Records: CREDITS.md; docs/CARD-BROWSER-RELIABILITY-AUDIT.md; native/bridge evidence JSON; HANDOFF.md, CODEX-LOG.md, docs/CODEX-TASKS.md and this record.
Validation: typecheck/frontend and packaged native build; 488 unit passes (3 skips), 204 browser passes, 23 Rust passes.
Real packaged app at http://tauri.localhost imported three safe public JannyAI cards; after exit, isolated native SQLite retained their avatars, full definition fields and source metadata. The remote window was denied database_url.
No project schema, dependency, lockfile, workflow, release or personal/portable-data change. No new commit/push; original ui authorship preserved.
Windows tested; Linux/macOS and interactive human checks unverified. Timeout/refusal retains manual recovery. Details and initial-vs-fixed evidence are in the report.

Signed: **CODEX**.

## 2026-11-02 — ui into gpt and Card Browser/JannyAI test battery — CODEX

Status: **local, uncommitted, not pushed**. Daniel explicitly authorized the ui integration and testing; implementation fixes remain open.
Clean gpt fast-forwarded from 7304ab9 to ui 9fac7f5 after fetching ui/dev. Existing authorship preserved; no new commit.
Added tests: apps/desktop/src/cardSites-janny-audit.test.ts; packages/card-browser/test/janny-audit.test.ts; e2e/janny-audit.e2e.ts.
Added the unchanged Marinara download-helper reference (export/provenance only): packages/card-browser/test/fixtures/marinara-janny-download.ts; credited its original authors in CREDITS.md.
Added docs/CARD-BROWSER-RELIABILITY-AUDIT.md and docs/evidence/card-browser-native-2026-11-02.json; updated this record, HANDOFF.md, CODEX-LOG.md and the direct-request task entry.
Validation: typecheck/build pass; 472 ordinary unit passes + 6 expected failures + 3 skips; existing 199 browser cases pass, new Janny cases have 2 ordinary passes + 2 expected failures; 20 Rust tests pass.
Expected failures are eight unfixed reproductions of seven grouped findings, not fixes. Synthetic full-PNG import preserves definition fields and provenance.
Native runtime used unchanged Rust/provider source in an isolated hidden WebView2, blank diagnostic page and Dev test profile: search 200/80 cards, download 403/Cloudflare. Marinara's original browser helper also failed CORS, then its Node fallback got 403.
Native source/dependencies were unchanged; only the temporary lock's stale root version and temporary window configuration were aligned for testing. Project lockfiles are unchanged by this audit.
The existing suite regenerated seven tracked Try It screenshots; generated copies were archived outside the repository and their initial clean-baseline bytes restored.
No private/portable data, API keys or real providers accessed; no successful real native import claimed. Details and remaining session/origin validation are in the report.

Signed: **CODEX**.

## 2026-11-02 — UI integration and T-007 Card Browser transport — CODEX

Status: **local commit on gpt, not pushed**. Implementation and validation are complete. Daniel explicitly authorized the local commit on 2026-11-02 after the earlier automatic approval rejection; push remains outside this authorization.

### Provenance and scope

- Daniel requested ui merged into gpt and the next Ready Card Browser task. The gpt checkout was clean before work.
- Fast-forwarded gpt from 214df2f to ui f7417e8; original commits and authorship are preserved. No merge conflict occurred in the working tree.
- The clone fetched only gpt by default. Fetched explicit origin/ui and origin/dev refs to locate the current queue.
- Carried docs/CARD-BROWSER.md, docs/CODEX-TASKS.md and docs/UI-PLAN.md from dev 4966f63. The plans/cards are pre-existing CLAUDE work; CODEX only updated and moved the completed T-007 card. No decisions were created or renumbered.
- No changes to dev, main, workflows, schemas, personal/portable data, UI screens, or existing web_get/web_search_page behavior.

### Files changed by CODEX

- apps/desktop/src-tauri/src/lib.rs: card_site_request, local validation/response helpers, command registration and 11 native tests.
- apps/desktop/src/cardSites.ts: SiteRequest, SiteResponse, SiteTransport, desktopCardSites, browser-only __h2FakeCardSites and base64 decoding into bytes.
- apps/desktop/src/cardSites.test.ts: 11 adapter tests covering native/fake isolation, preview refusal, binary decoding, non-2xx metadata and errors.
- docs/CODEX-TASKS.md: T-007 marked Done (local commit, not pushed), checks recorded and card moved to Done; T-008 remains Ready.
- HANDOFF.md, CODEX-LOG.md, REGISTRO-CODEX.md: signed scope, validation, provenance and publication status.

### Validation

- npm run typecheck: pass.
- npm test: **441 passed, 3 skipped**, including all 11 new adapter tests.
- Native cargo test --locked --offline: **20 passed**, including 11 new tests; source is byte-identical to the gpt checkout. Tests cover host wildcards/look-alikes, HTTPS/ports/private-address refusal, headers/methods, redirects and credential stripping, image signatures, card tEXt chunk framing, caps, streaming chunks, response metadata and early request rejection.
- Native validation ran in an isolated copy. The repository's pre-existing Cargo.lock records the root app as 0.1.0 while Cargo.toml is 0.2.0, so cargo test --locked in the checkout refuses the stale metadata. Only the temporary lock copy's root-package version was aligned to 0.2.0; all dependency versions/features are identical. No project lockfile or Cargo dependency changes were made.
- npm ci --ignore-scripts --no-audit --no-fund repaired workspace junctions left pointing at the old checkout path; project manifests/lockfiles are unchanged by the task.
- git diff --check: pass. The only HTTP traffic in native tests is a synthetic loopback fixture for streamed bodies; no card-site, real-provider, API-key, persistent-data, or native UI validation.

### Transport contract for T-008

- SiteTransport.request(SiteRequest) returns SiteResponse. Native invoke payload is { request } for card_site_request.
- Native binary base64 becomes SiteResponse.bytes (Uint8Array); mime is derived from magic bytes. The browser fake supplies decoded SiteResponse values through the same request interface.
- Non-2xx HTTP results return status, retryAfterSecs when valid, cfMitigated, finalUrl, contentType and text, even for image/card requests; validation, network and oversize failures reject.
- Successful JSON/text cap: 8 MB; image: 15 MB; card: 64 MB. Oversize bodies are refused, never silently truncated. Total timeout: 30 s, or 60 s for card, shared across up to five redirects.
- Public-only resolver and no-proxy client are reused unchanged. Redirects recheck the target; Authorization and X-Session-Token are removed on origin changes.
- This is a byte-signature/chunk-framing gate, not a pixel decoder or card-definition parser; the import layer validates those later. No new capability is required for a local command registered like existing web commands.

Signed: **CODEX**.

## 2026-11-02 — Four reported ui bugs fixed before committing — CODEX

Status: **local, unpublished**. Direct follow-up from Daniel; no commit or push attempted during this follow-up. Existing T-007 source and validation are preserved.

### Changes and regression coverage

1. **Quick Connection outside the window:** ui/QuickConnect.tsx renders the popup/scrim through a portal and positions the popup relative to the viewport. It measures before paint, clamps both axes, and updates on resize/external scroll while open; listeners are removed on close. styles.css retains the Assistant's original 640 px maximum width through the popup's context class. Test: usage reported by an in-memory offline stream, open with sidebar/inspector present, resize through 1200/900/390/1512 px while open, connections remain clickable; Assistant width, narrow-window bounds and Manage also verified.
2. **Last saved Library selection not remembered:** ui/LibraryPages.tsx records the saved selected id before the already-open guard. Existing h2.lastOpen keys are reused. Tests: Trackers, Personas and Presets return to the manually chosen item; unsaved/new drafts remain open.
3. **Settings tabs lost keyboard behavior:** ui/SettingsPage.tsx restores Left/Right with wrapping, focuses the selected tab and exposes only the active tab in the Tab sequence. Labels and visual style are unchanged.
4. **Help stayed transparent under the pointer:** styles.css reveals help under a hovered summary or its own help wrapper, retaining keyboard focus-visible and expanded states. Test: Advanced summary hover, direct hover, real Tab navigation and opening help.

### Validation and files

- New e2e/ui-review-fixes.e2e.ts: four original reproductions failed before the fixes; seven final cases pass.
- Final affected browser run: **40/40 passed** across ui-review-fixes, quick-connect, connections, library, people, presets, navigation and assistant. Browser uses fresh demo databases, the offline AI, synthetic usage and mocked provider responses. No personal data or live provider requests.
- npm run typecheck passed; npm test: **441 passed, 3 skipped**. git diff --check passed.
- Initial test-only follow-up corrections used real Tab navigation (rather than programmatic focus after mouse input) and existing Assistant/Preset accessible names. No production changes were made to accommodate those test mistakes.
- HANDOFF.md, CODEX-LOG.md and docs/CODEX-TASKS.md record completion and local/unpublished status, signed CODEX.
- Application source changed in this follow-up: apps/desktop/src/ui/QuickConnect.tsx, apps/desktop/src/ui/LibraryPages.tsx, apps/desktop/src/ui/SettingsPage.tsx, apps/desktop/src/styles.css. No dependency/lockfile/schema/native changes. The T-007 native suite was not rerun because native source is unchanged.
- Limits: browser validation only for these UI fixes; no native Tauri UI, real API, persistent database, private data or custom user CSS validation.

Signed: **CODEX**.

## 2026-11-02 — Local gpt commit authorization — CODEX

Daniel explicitly requested: "You may commit on gpt" (translated from Portuguese). This supersedes the earlier no-commit restriction for the completed T-007 and four reviewed bugfixes only. The commit uses author CODEX and a [CODEX] message. No push, release or change to dev/main is authorized or performed.
Validation remains the completed typecheck, 441 unit passes (3 skipped), 40 affected browser passes, and 20 native passes in the isolated copy described above. Only these signed status notes changed after validation; git diff --check is verified before committing.

Signed: **CODEX**.
