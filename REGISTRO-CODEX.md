# CODEX change record

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
