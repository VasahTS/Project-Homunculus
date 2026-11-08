# JanitorAI extraction — how it works (notes for the next agent session)

Written by CLAUDE on 2026-11-08 so the next session can continue without re-reading Glaze. Decisions: D-098 (source + sign-in window),
D-099 (hidden-card extraction), D-100 (trigger choices, field diff, lore cap). Reference: Glaze, hydall/Glaze at f1fe39e (AGPL-3.0), `lib/features/catalog/services/janitor_*.dart`.
The dev machine cannot reach janitorai.com (it answers "Access Restricted"). Only Daniel's Windows PC can test it live.

## 1. The trick in one paragraph

JanitorAI hides a card's definition from `/hampter/characters/{id}` (`showdefinition: false`). But when an account uses a **proxy**,
JanitorAI's server assembles the full prompt (hidden card + lorebook entries whose keys fired) and returns it to the **browser** from
`/generateAlpha`. Only then does the browser send it to the proxy. A script inside the page wraps `fetch`/`XMLHttpRequest` and keeps
that response. The proxy we select points to `http://127.0.0.1:<random>`, which does not exist. JanitorAI's page then shows an
error toast, but the prompt was already captured. Daniel saw these "rate limited / error" flashes, and they are **expected**.

## 2. File map

| File | Role |
|---|---|
| `packages/card-browser/src/sources/janitor.ts` | The `janitor` CardSource: search/tags/details/download of public cards and public lorebooks. `details()` sets `hidden` + `canExtract` (false when `allow_proxy === false`). `extract()` calls `extractJanitor` with deps (meta, publicBook, avatar, tags). |
| `packages/card-browser/src/sources/janitor-extract.ts` | **The run** (§3) + `LORE_PROMPT` (Glaze's rebuild prompt) + `parseLoreAnswer` + `closedEntries`. Pure TS; talks only through `SiteTransport.janitor` (a `JanitorBridge`). |
| `packages/card-browser/src/sources/janitor-diff.ts` | D-100. Field diff (port of Glaze `janitor_field_diff.dart`): `fieldsOf(payload, restore)`, `fieldsOfMeta(meta)`, `scanInjectedFields({capture, extra, probe, clean, publicContents, existing})` → `InjectedBlock[]`, `withoutInjected(text, field, blocks)`. Lore cap (Glaze `janitor_lore_budget.dart`): `LORE_TOKEN_CAP` 120 000, `LORE_SATURATION_MARGIN` 8 000, `estimateTokens` = chars ÷ 3, `loreTokens`, `isSaturated`, `splitTrigger`. |
| `packages/card-browser/src/sources/janitor-prompt.ts` | Prompt → parts (port of Glaze `janitor_separate.dart`): `systemContent`, `extractCard/Name/Scenario/Example/FirstMessage`, `separate` (closed lore = system message minus jailbreak/persona/scenario/example blocks, minus card lines, minus public entries), `mergeLore`, `restoreMacros`, `stripJanitorCredit`. |
| `packages/card-browser/src/types.ts` | `JanitorBridge { call(method, path, body), page(op, text) }`, `JanitorPageOp`, `ExtractOptions { onPhase, trigger, complete, sleep, limits }`, `TriggerChoice` + `DEFAULT_TRIGGER` (card, catalog, scenario on; greetings, lorebooks off; extra ""), `CardDetails.hidden/canExtract`, `CardSource.extract/separate`. |
| `apps/desktop/src/cardSites.ts` | Desktop `JanitorBridge`: `call` → `invoke("janitor_request", { path, method, body: JSON })`; `page(op)` → `invoke("janitor_request", { path: "page:"+op, body: text })`. Browser tests use `globalThis.__h2FakeCardSites.janitor`. Read-only GETs from the package go through `request()` → `janitor_request`. |
| `apps/desktop/src-tauri/src/janitor.rs` | Native side. Window label `janitor` on `https://janitorai.com`, profile in `<data>/janitor-browser/`, Windows UA = Chrome of WebView2's version (Google sign-in). `valid_path` (GET allow-list), `valid_call` (the ONLY writes allowed, §4), `PAGE_OPS`, one pending request (random id, 25 s ready wait, 35 s answer / 60 s for page ops, 8 MiB). `janitor_window(sign_in)`, `janitor_request`, `janitor_report`. |
| `apps/desktop/src-tauri/src/janitor.js` | Initialization script in every JanitorAI page. `__h2Janitor({id,path,method,body})`: in-page `fetch` with the Supabase token (`sb-*-auth-token` cookies) → reports back. Only on `/chats/*`: the `/generateAlpha` hook (`__h2Alpha`, `__h2AlphaLog`) and `__h2JanitorPage({op})` = `composer` / `reset` / `send` (React value setter + click send button, Enter fallback, close modals, stop old generation) / `alpha`. |
| `capabilities/janitor.json`, `permissions/janitor.toml` | The remote page may call only `janitor_report`. |
| `apps/desktop/src/ui/CardBrowser.tsx` | Sheet: **Extract and Add** button (phase text on it), one-time notice (`prefs.janitorExtractOk`), notes into the Added notice, folded **Lorebook Trigger** row (`TriggerOptions`; switches in `prefs.janitorTrigger`, extra text per sheet). `JanitorAccount.tsx` = Sign In… / Sign Out / Refresh line. |
| `apps/desktop/src/App.tsx` | Passes `complete` = default connection, `maxTokens: 8192`; none when the provider is `offline-test`. |
| Tests | `packages/card-browser/test/janitor.test.ts`, `janitor-extract.test.ts` (a whole run against a fake account that must end identical), `e2e/card-browser-janitor.e2e.ts`, Rust tests in `janitor.rs`. |

## 3. The run (`extractJanitor`)

1. `janitorAccount("status")`. Signed out → error. `meta = GET /hampter/characters/{id}`. `allow_proxy === false` → error (nothing written).
2. Public lorebook entries (`GET /hampter/script/{id}` for public `scripts`). Their `content` is subtracted from the closed lore later.
3. `page("show")`: the window is shown while it works, because a hidden WebView2 may not render the chat.
4. `enterExtractionMode` (Glaze `_enterExtractionMode`): `GET /hampter/api-settings` (snapshot: `selected_proxy_config_id`, `source`,
   `generation_settings`, whether the account has its own presets) → `POST /hampter/api-settings/proxy-configs` (random `client_id`,
   name, port, `sk-` key; a client_id can never be reused) → `GET` again to find the server id → `PATCH selected_proxy_config_id`
   → best-effort `PATCH source: "proxy"` and `generation_settings.context_length: 0` (otherwise JanitorAI compresses the prompt and
   drops the tags).
5. `seedProfileName`: an empty profile name opens a modal on the first chat, so a random sentinel name goes in (and is
   restored). `userPersona`: reuse or `POST /hampter/personas` named `{{user}}`, so the macro survives in the captured text.
6. Every chat goes through `inFreshChat(body)`: `POST /hampter/chats {character_id, persona_id}` → **the id comes back as a NUMBER**
   (bug fixed d54c4f3) → `page("open-chat", id)` (Rust navigates to `/chats/{id}`), wait for the composer, `page("reload")` (JanitorAI
   caches the old proxy until a reload), wait again → `body` → `DELETE /hampter/chats/{id}` in a `finally`.
   First chat: `GET /hampter/chats/{id}` → greetings (`character.first_message(s)`, which hidden cards still carry).
7. `sendAndCapture(".")` = **probe** (the clean card). Then `sendAndCapture(trigger)` where trigger = [probe's card if `choice.card`,
   `triggerText(meta, tags, choice)`] joined, or "." when empty. `triggerText` = catalog page (`catalogText`: Name / Tags / Catalog
   description / Scenario / Lorebooks lines), scenario, greetings, lorebook lines (`lorebookLines` from `meta.scripts` title +
   description), extra. Each send polls `page("alpha")` every 800 ms. An HTTP ≥ 400 in `__h2AlphaLog` is final (e.g. 403).
7b. **Split passes (D-100):** if `isSaturated(full, probe)` and not `isSaturated(probe)`: queue = `splitTrigger(trigger)`; while the
   queue has pieces (≤ 16 passes) send each in `inFreshChat`; a piece still saturated is split again; a lost piece is skipped.
8. `finally`: `page("hide")`, `DELETE` the persona (only if we made it), restore the profile name,
   `restoreSettings` (old selection; **account without own presets → `source: "janitor"`, selection null**; context_length back, or
   4096 if there was none), `DELETE` the temporary preset. Each step is best-effort.
9. Build: name from `<Name's Persona>` tag, `restoreMacros` (char names longest-first; user = sentinel, or the profile name when no
   persona), greetings = chat → meta → prompt's assistant turn (deduped), separated = `mergeLore(separate(each capture + probe))`.
   **Field diff (D-100):** `scanInjectedFields` with capture = trigger's fields, extra = split passes' fields, probe = probe's fields,
   clean = `fieldsOfMeta(meta)` only when meta has personality/scenario (a public definition). Lore = separated + injected blocks.
   Card / scenario / example = probe's, minus `withoutInjected` lines for that field. Rebuild context = card + `catalogText`.
10. Lore → `opts.complete(loreMessages(lore, card, bio))` → `parseLoreAnswer` (tolerates fences/prose; needs `{entries:[...]}`).
    Entries with keys are on; without keys they are off. AI failed or none → blank-line blocks as text entries, off, with a note that
    says **why** (empty / not JSON + its start / connection error). `closedEntries` counts only AI-built entries (fixed 58f3bc7).
11. Card V2 JSON (+ avatar) → the normal `onAdd` import path (lorebook becomes a linked lorebook).

## 4. Native write allow-list (`valid_call`) — keep it this tight

GET: `valid_path` (catalog with `page|mode|sort|search|tag_id[]|custom_tags[]`, `characters/{id}`, `script/{id}`, `chats/{id}`, `tags`,
`profiles/mine`, `api-settings`, `personas`, plus `account`/`logout`). POST: `api-settings/proxy-configs`, `personas`, `chats`.
PATCH: `api-settings`, `profiles/mine`. DELETE: `api-settings/proxy-configs/{id}`, `personas/{id}`, `chats/{id}`. Bodies must be JSON
objects ≤ 64 KB. Ids: `[A-Za-z0-9-]{1,64}`. `profiles/mine` GET returns only `name`, `profile` and `user_name` to the app.

## 5. Known gaps (what to build next, in suggested order)

1. **Rebuild failure on "Sarah"** (Daniel's first live run): the AI did not return parseable JSON. Ask for the new notice text, which
   now says why. Likely a small reply limit before 8192 was passed, or a reasoning-only/empty answer.
2. ✅ Trigger-context choices — done (D-100).
3. ✅ Lore cap / split passes — done with an estimate (D-100). An exact count would need cl100k (`gpt-tokenizer` npm); only worth it
   if the estimate splits too often or too late on a real book.
4. ✅ Field diff — done (D-100). Not live-tested: JanitorAI's `placement` entries are what it should catch.
5. **Review before saving**: Glaze previews the result (card + lore text) before importing. Ours adds directly.
6. **Orphan chats**: if a step fails after `POST /hampter/chats` but before the id is read, the chat stays. Two were left on
   Daniel's account on 11/08 (asked him to delete them). Fix idea: on failure, `GET` his chats for this character and delete the newest.
7. Scripted ("advanced") public lorebooks (JS source) are skipped. Glaze has the AI convert them (`kLorebookSystemPromptJs`).
8. Not verified live: Google sign-in in the window, Linux/WebKitGTK at runtime, the Windows-only UA line compiling (it did run on Windows).

## 6. Practical notes

- Test pattern: change code here → `npx vitest run packages/card-browser`, `npm run typecheck`,
  `cargo test --lib janitor` (needs `libwebkit2gtk-4.1-dev`; `git checkout Cargo.lock` after, since `--locked` fails offline), and
  `npx playwright test e2e/card-browser-janitor.e2e.ts` → commit/push `dev` → Daniel tries it on Windows.
- Writing files straight into Daniel's PC (`device_commit_files`): use a **fresh output path per write** (a re-used staged path once
  wrote the old file), keep CRLF, and check the size afterwards with `device_list_dir`. His `HANDOFF.md` / `CODEX-LOG.md` /
  `REGISTRO-CODEX.md` carry a local-only CODEX entry ("Local dev test suite repair"), so keep it when overwriting them.
- His app runs from source (`Open Homunculus.bat` → `npm run app` → Vite + Tauri dev). TS changes hot-reload; Rust/JS-in-`src-tauri`
  changes need the app closed and reopened.
