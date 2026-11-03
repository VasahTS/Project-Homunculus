# Review of the gpt branch (CODEX, 2026-11-02 → 2026-11-03) — CLAUDE, 2026-11-03

Daniel asked Claude to review CODEX's work on `gpt` (dev...gpt, CODEX commits 7304ab9, 8571866, e19bf40, 62318af,
5292047, 49ba890) and improve it where it can be better. Scope read: native transport and site windows (Rust,
capabilities, injected scripts), the styled-message frame, the Assistant (helper, long reads, branches, background
runtime), per-chat model choice, collection sorting, rewrite menus, message metadata, schemas and core changes.

Overall: careful work. Security boundaries hold (checked against the Tauri 2.12.5 source: remote origins are always
ACL-checked, and the app's own permission files make local commands ACL-checked too); every remote window can only
call its own `*_report` command; the frame uses `sandbox="allow-same-origin"` without scripts plus a CSP, so no
script runs and no unapproved resource loads. Tests are thorough. Five problems were found and fixed below.

## Fixed (each with a test that fails before the fix)

| # | Problem | Effect | Fix | Test |
|---|---|---|---|---|
| 1 | `App.tsx`: the `searchMessages` `useCallback` came after `if (bootError) return …` | Any start failure crashed React ("Rendered fewer hooks than expected") instead of showing "Could not start: …" | Hook moved above the early returns | `e2e/boot-error.e2e.ts` |
| 2 | `MessageHtml.tsx`: the whole `srcdoc` changed on every streamed token | The frame reloaded per token (blank flash, height re-measured, document state lost) | Body is patched in the loaded frame; the frame reloads only when its head (styles/CSP) changes; invalid image URLs no longer throw | `e2e/message-html.e2e.ts` "streaming text keeps the same frame document…" |
| 3 | `resolveSetup`: `modelOverride` was resolved independently of `connectionId` | A layer that picked another connection inherited an earlier layer's model (wrong model sent to another provider) | A layer that sets `connectionId` without a model resets the model to the connection's own | `packages/core/test/ux-model.test.ts` |
| 4 | `decodeHistory` threw when a saved branch named a missing message | One damaged branch made the whole Assistant chat impossible to open | Missing messages are skipped; the rest opens | `apps/desktop/src/assistant/history.test.ts` |
| 5 | `botbooru_window` waited on the request lock | While a request waited (up to 25 s) for the site's browser check, "Open Account" — the thing the error tells you to do — was blocked behind it | Window creation has its own small lock; opening no longer waits for requests | Rust tests (build) |

Also: the main window's permission (`allow-main-commands`) lived inside `permissions/janny.toml`; removing the JannyAI
integration would have silently disabled every command in the app. It now lives in `permissions/app.toml`, and
`apps/desktop/src/native-permissions.test.ts` checks that every command in `generate_handler!` is allowed for some
window and that remote windows reach only their `*_report` command.

And: the Rust test `caps_and_total_request_timeouts_are_exact` built its own HTTP client without installing the TLS
provider, so it passed only when another test happened to run first (it panics alone, or in another order). It now
calls `web_crypto()` like the app does.

## Noted, not changed

- Running the click tests rewrites seven tracked screenshots under `docs/drafts/agent-try-it/integration/`; every
  run leaves the working tree dirty. Better: write them to `e2e/.results/` and copy on purpose. (Not changed: test
  output location is CODEX's audit evidence.)
- `ui/message-metadata.ts` estimates tokens as `length / 4`; the rest of the app uses `estimateTokens`
  (`length / 3.6 + 4`). Both are labeled "~", so only a consistency note.
- Ctrl+K message search loads and decodes every Assistant chat on each (debounced) query, and searches only each
  chat's active path. Fine for now; an index would be needed for hundreds of chats.
- `e2e/message-format.e2e.ts:7` fails in a sandbox without internet (the opened link page cannot load); it passes
  with network. `memory.e2e.ts:114`, `presets.e2e.ts:57` and `background.e2e.ts:23` were flaky under parallel load
  and pass when re-run (background: 9/9).
- React warns "two children with the same key, `starter-lyra`" in several click tests (already on gpt before this
  review). A list renders the same id twice somewhere; worth finding.

## Verification

Typecheck passes. Unit: 671 passed, 3 skipped (was 665). Click tests: 261 of 263 passed in the full run, the two
others are the network-only and flaky cases above. Rust `cargo test` on Linux (WebKitGTK): 27 passed. Every fixed
problem has a test that was seen failing on the old code. Not checked: the Windows app and live sites.
