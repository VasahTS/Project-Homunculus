# BotBooru integration — CODEX, 2026-11-02

Status: implemented on gpt. Daniel directly requested BotBooru first, including account-visible NSFW/NSFL, and subsequently authorized commit/push to gpt and merge/push to ui. Pre-existing local lockfile edits are excluded. CODEX.

## Behavior

BotBooru is the sixth Card Browser source. Existing search, sort, tags, token filters, paging, details, Add to Characters and Save as PNG are reused.
Search supports ordinary words plus the site's exact tag/name/writer/exclusion/OR syntax. Downloads preserve the original V2 PNG; details read the full exported V2 JSON.
Preview requests use the site's supported 320px endpoint. A response containing adult/unknown rows is filtered defensively when NSFW is off.

Account opens BotBooru's own site in an isolated persistent webview. The user signs in and changes preferences there.
The app reads only username, show_nsfw and the effective NSFL state (show_nsfl AND show_nsfl_active is not false).
NSFW in Card Browser is a local search filter; it cannot override either account gate or change the site's account preferences.
Refresh Account rechecks the session; returning focus refreshes only when account state changed. Sign Out clears the isolated site's token and the rendered results/details.
The site's browser profile persists in the app's data folder; credentials do not enter the app's database, main-window storage or report payloads.

## Implementation and boundary

- packages/card-browser/src/sources/botbooru.ts: query, tag/writer/rating mapping, full details and original PNG download; types/index/pauses register the source.
- apps/desktop/src/cardSites.ts: fixed BotBooru JSON routing and account actions; ui/BotbooruAccount.tsx, ui/CardBrowser.tsx and styles.css reuse the existing controls.
- apps/desktop/src-tauri/src/botbooru.{rs,js}, capabilities/botbooru.json, permissions/botbooru.toml: site-only session, serialized fixed GET requests, correlation ids, timeouts, 8 MiB streamed response/report caps and no-store fetch.
- lib.rs registers the three commands, allows public BotBooru images and destroys the account window when main closes; the main command permission list adds only request/window.
- The remote page has only botbooru_report for its own origin/window; stale/duplicate/expired or oversized reports are refused. It has no database/secrets/file commands.
- Successful account refresh resumes browser-check pauses, while rate-limit pauses remain in force. No schema, dependency, lockfile, workflow or JanitorAI change.
- Tests: package BotBooru tests and an original BotSearcher query-reference fixture; actual injected-JS and transport tests; five browser flows; four native boundary tests.

## Validation

| Check | Result |
|---|---|
| npm run typecheck | Passed |
| npm test | 506 passed, 3 skipped |
| Card Browser browser flows (BotBooru, existing browser/details, Janny controls) | 19 passed |
| cargo test --locked --lib | 27 passed |
| Production frontend and custom-protocol Windows executable build | Passed |
| Actual packaged Windows UI, public SFW | 40 cards; thumbnails, complete definition and original PNG import passed |
| Native persistence after app exit | Source 95050, avatar, description/personality/scenario and four greetings retained |
| Main-window close | Process exits, including its hidden account window |

Evidence: [native UI/import and post-exit SQLite checks](evidence/botbooru-native-2026-11-02.json).
Native tests used fresh empty databases and profiles under Dev dev-data/botbooru-2026-11-02-codex[-final]; no personal installation/data was adopted.
A lifecycle regression was reproduced before its fix: closing main left the hidden account window/process alive. The final native run exits normally.
An initial full cargo test encountered a linker PDB write error; the explicit library tests and the final packaged executable build both passed.

## Limits and provenance

No real account credentials were used. Authenticated NSFW/NSFL preferences, logout clearing and rate-limit behavior were tested with synthetic sessions/cards; a real authenticated download remains for Daniel to verify.
Windows/WebView2 was tested; Linux/macOS, interactive Cloudflare and future site/API changes remain unverified.
Source query/mapping reference: SillyBunnyTeam/SillyBunny-BotSearcher 2e175ff439f884fc0bb662ff9930212237053780/server/sources/botbooru.js (AGPL-3.0), credited in CREDITS.md.
The account bridge is new CODEX work; the pre-existing Card Browser and original reference authorship are preserved.
Signed: **CODEX**.
