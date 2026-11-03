# Message metadata — 2026-11-03

Author: **CODEX**. Status: local, uncommitted, unpublished on `gpt` in `Project-Homunculus/Homunculus-gpt`.

- Request/reference: Daniel's two v1 screenshots and request for message date/time, number and separate text/reasoning counts. The supplied reference sets the small UI change's hierarchy.
- Presentation: localized date/time beside the speaker; 1-based number and separate Text/Reasoning values below the message. Numbers follow the selected path; a swipe retains its position.
- Provider accounting: preserve `completion_tokens_details.reasoning_tokens` as optional `tokensReasoning` in the existing JSON generation record. No SQL migration or dependency/lockfile change. `tokensOut` still includes reasoning for existing billing/session totals. Reference: [OpenRouter's official reasoning documentation](https://github.com/OpenRouterTeam/docs/blob/main/guides/best-practices/reasoning-tokens.mdx).
- Text counts subtract a known reasoning count from total output. An unavailable breakdown uses separate estimates from each text; `~` is always visible for estimates. Provider reasoning counts also appear when the provider hides reasoning text. Legacy records stay valid. Changed text uses an estimate instead of reusing its original generation count.
- Metadata reads are independent of streaming frames, cancelled on unmount, and ignored when stale. Data-read failures fall back to estimates. Date and time can wrap separately at larger text sizes.

## Files for this change

- New: `apps/desktop/src/ui/MessageMetadata.tsx`, `apps/desktop/src/ui/message-metadata.ts`.
- UI hooks/styles only: `apps/desktop/src/ui/ChatView.tsx`, `apps/desktop/src/styles.css`.
- Optional usage field only: `packages/core/src/extensions.ts`, `packages/core/src/turn.ts`, `packages/schemas/src/records.ts`.
- Provider parsing and regressions: `packages/provider-openai/src/index.ts`, `packages/provider-openai/test/provider.test.ts`.
- New regressions: `apps/desktop/test/message-metadata.test.ts`, `packages/core/test/message-usage.test.ts`, `e2e/message-metadata.e2e.ts`.
- Signed task/change notes: `HANDOFF.md`, `CODEX-LOG.md`, `REGISTRO-CODEX.md`, `docs/CODEX-TASKS.md`.

## Validation and limits

- Before implementation: browser metadata assertion failed; two provider usage regressions and the core persistence regression failed. The helper did not yet exist.
- Focused unit run: 24 passes. Full suite: 629 passes, 3 skipped. Typecheck and production frontend build passed.
- Browser: 11 existing chat cases plus 2 metadata cases passed across final runs. Covers greeting/user/reply timestamps, local formatting, per-version counts, hidden messages, path numbering, hidden reasoning, edit/remount, 375px portrait, landscape and larger metadata text with reduced motion.
- Larger text initially clipped the timestamp; its regression now passes after allowing the date and time to wrap separately. Desktop/portrait/large-text captures were visually inspected.
- Screenshots (ignored test output): `e2e/.results/message-metadata-desktop.png`, `message-metadata-mobile.png`, `message-metadata-large-text.png`.
- Synthetic preview data and scripted providers only. No personal data/API keys, native Tauri verification or real-provider accuracy check. Estimates reuse the app's existing four-character heuristic rather than a model tokenizer.
- Existing Vite chunk-size and mixed-import warnings remain. Earlier local changes, lockfiles and tracked screenshots are outside this change and preserved. No commit, push or merge.

Signed: **CODEX**.
