# Card Browser and JannyAI reliability audit

Date: 2026-11-02. Author: **CODEX**. Status: **fixed and validated on gpt; commit/push authorized by Daniel after his successful local test**.

## Result

The packaged Windows app searched JannyAI and imported three real public safe cards through Card Browser → Add to Characters.
After closing the app, the isolated native SQLite database contained all three characters, their avatars, source metadata, descriptions, personalities, scenarios and greetings.
This is an actual native UI/import/persistence check, not a browser fake or a direct Node request.

The earlier direct HTTP approach returned Cloudflare challenges. The working solution keeps the protected request in a JannyAI browser session on the API origin, then fetches the supported signed PNG through the existing bounded native transport.

## Implementation

- Retain Marinara's browser-first JSON route for JannyAI search/download, with native fallback. Search omits credentials; download includes them. Response reading is bounded and redirects are refused.
- If the normal download request receives a Cloudflare 403/503, a hidden JannyAI webview navigates to the public card page at api.jannyai.com.
- The page's normal browser verification completes in that session. A fixed script waits for the real character page and calls the supported /api/v1/download endpoint from the same origin.
- The remote window can return only the one active, bounded response. It has no database, secrets, file, opener or general application permissions.
- A serialized native queue, request correlation, fixed window/origin checks, a 128 KiB response cap and a 45-second timeout bound the bridge. Stale and duplicate reports are refused.
- The signed file is still fetched through card_site_request: public-only HTTPS, DNS/redirect checks, size cap and PNG/card validation are unchanged.
- Full-PNG details reuse the existing card decoder injected at the transport boundary. The source package gained no dependency or second PNG importer.
- Public API-mirror/main-page recovery and Marinara-compatible definition field mapping cover cases where the original PNG cannot be fetched. A catalog excerpt is never sufficient.
- Details/Add share a short-lived full-card promise. Rejected promises and partial detail results are not retained for the app session.
- Download refusals reuse the planned Import a Downloaded File action; the selected card already has Open on JannyAI.

No schema, migration, appSettings key, dependency, lockfile, theme or layout change was introduced.

## Verification

| Check | Final result |
| --- | --- |
| TypeScript check | Passed |
| Desktop frontend build | Passed |
| Complete unit suite | **488 passed, 3 skipped**, zero expected failures |
| Complete browser suite | **204 passed**, zero expected failures |
| Rust tests | **23 passed** |
| Native packaged build | Passed with tauri/custom-protocol |
| Actual packaged Windows UI | Search found 80 safe cards; three selected cards imported |
| Persistence after app exit | Three full definitions, avatars and source records present |
| Remote permission check | JannyAI window's database_url invocation was denied |

The six original unit reproductions and two browser reproductions now pass as ordinary regressions. Additional cases cover concurrency, failure recovery, response caps, rate limits, native-session failure, stale reports and capability scope.
Synthetic full-PNG controls also preserve alternate greetings and system/post-history prompts when those fields exist.

## Findings resolved

| ID | Original failure | Fix |
| --- | --- | --- |
| J1a/J1b | Native-only transport discarded a usable browser route | Browser-first search/download, plus the API-origin native session for Cloudflare/CORS recovery |
| J2 | Details never read an available full PNG | Decode its original card through the shared app boundary |
| J3 | The public API character mirror was never queried | Mirror then main page, with separate refusal scopes |
| J4 | A complete public definition could not import after PNG refusal | Build a card only when definition fields are present |
| J5 | Supported nested fields and prompts were lost | Port Marinara's field variants, preserving prompts/greetings/lorebook metadata when available |
| J6 | Download error had no downloaded-file import action | Reuse the existing notice action and file input |
| J7 | A partial result blocked retry for the app lifetime | Cache complete details only and clear failed full-card promises |

The recovery clock test uses Playwright's clock rather than reassigning Date.now, so the refusal clock captured by Pauses actually advances.

## Native evidence

- [Initial refusal evidence](evidence/card-browser-native-2026-11-02.json): native search 200; native download 403; browser preflight rejected from the app origin.
- [Restricted bridge and real PNG evidence](evidence/card-browser-bridge-2026-11-02.json): supported download 200, genuine PNG decoded; remote database command denied.
- [Final packaged UI and persistence evidence](evidence/card-browser-native-fixed-2026-11-02.json): http://tauri.localhost, three actual imports, persisted field/avatar checks, no page errors.

The three tested public IDs were 5d03e1ca-b79d-40dc-b93c-3ff85e918437, 4a95858a-413b-4eec-b0a9-47864d4831de and 2c32face-6d40-4d15-9e33-001120c693c9.
No definition text, browser cookies, signed download URLs or API credentials are included in the evidence.

## Provenance

The checkout was clean before the authorized ui integration. Fast-forwarded gpt from 7304ab9 to ui 9fac7f5, preserving original authors and commits.
The initial audit added reproductions only; this follow-up implements the fixes after Daniel asked for a solution.

Marinara Engine at e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44 supplied the reference behavior:

- [Browser-first download](https://github.com/Pasta-Devs/Marinara-Engine/blob/e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44/packages/client/src/components/bot-browser/BotBrowserView.tsx#L87).
- [Search credentials/CORS behavior](https://github.com/Pasta-Devs/Marinara-Engine/blob/e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44/packages/client/src/components/bot-browser/BotBrowserView.tsx#L711).
- [Full-PNG/page recovery and field mapping](https://github.com/Pasta-Devs/Marinara-Engine/blob/e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44/packages/client/src/components/bot-browser/BotBrowserView.tsx#L801).
- [Validated definition import fallback](https://github.com/Pasta-Devs/Marinara-Engine/blob/e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44/packages/client/src/components/bot-browser/BotBrowserView.tsx#L1943).

The original helper remains a credited test fixture. CODEX authored the native bridge, integration, corrections and regressions.
The remote permission boundary follows [Tauri capabilities](https://v2.tauri.app/security/capabilities/); only the report is granted to the fixed remote origin/window.

## Isolation and limits

- Browser regressions use a dedicated gpt server, synthetic sites and in-memory SQLite.
- Native validation uses the latest gpt source, a separate app identifier, hidden test window and new profiles/databases under the Dev dev-data directory.
- The project Cargo.lock has a pre-existing root-version mismatch (0.1.0 vs Cargo.toml 0.2.0). Only the isolated lock copy was aligned; project lockfiles and crate versions/features are unchanged.
- The packaged UI test uses the same custom-protocol build feature as the distribution, not a Vite preview.
- Existing Try It tests regenerate seven tracked screenshots. Their generated copies are archived outside Git and their verified pre-test bytes restored.
- Windows/WebView2 is tested. Linux/macOS behavior, a manual interactive challenge and future site policy changes remain unverified; timeout/refusal retains manual import recovery.
- Three real cards passed; this is not a claim that every future card or verification policy will succeed.
- No personal/portable installation, private database, API key, paid AI provider, login credentials or hidden definition extraction was accessed. JanitorAI remains parked.

Signed: **CODEX**.
