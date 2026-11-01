# Simple memory reliability audit

Date: 2026-11-01. Author: **CODEX**. Card: T-001. Context: D-054.

## Scope

Audited the existing simple chapter memory in the isolated `Homunculus-gpt` checkout, on `gpt`, after fast-forwarding to the committed local `dev` history (`e774906`). The original dev checkout and its uncommitted files were preserved. This is a reliability audit, with no new screen design, schema, storage key, chapter path rule, prompt ordering, workflow or release changes.

Only the memory methods of `turn.ts` and the existing Memory group's saving behavior changed in production. `memory.ts` needed no change. Model calls and browser data are simulated and isolated.

## Reproduced failures and fixes

Each row has a regression that failed before its corresponding fix and passed afterward. Six new core cases failed in the first run; browser regressions reproduced the saving failures and then the same-field variations during refinement.

| Scenario | Evidence before the fix | Result |
| --- | --- | --- |
| A memory request names another chat's message | `summarizeNow` accepted the endpoint instead of rejecting it; `memoryAt` used the supplied path without checking its chat | Reject paths from another session before using them for memory status or model requests |
| The previous chapter is edited or removed while the next summary runs | Both cases still appended a summary based on the obsolete continuity input | Validate the previous chapter's identity, title and summary immediately before saving |
| Another chapter is saved over the requested range while the model runs | The late answer appended an overlapping chapter | Recompute the next readable span against the latest saved chapters; discard a changed range |
| The summarized branch is deleted while the model runs | The late answer threw while reading its deleted endpoint | Discard the answer when its destination no longer exists |
| A source message is hidden while the summary runs | The late answer still included the now-unreadable source | Revalidate the readable range and message content/speakers before saving |
| A title save is slow and the summary is saved next | The preview contained the new summary but the old title, even though the input still showed the new title | Apply field patches to the latest chapter list inside the shared write queue; retain concurrently added chapters |
| A save completes while another field or a newer value of the same field is being typed | The refresh erased the newer local draft; restoring the original title also failed in an intermediate regression | Track dirty local fields and acknowledge only matching saved values; refresh untouched fields |
| A chapter edit cannot be written | An unhandled rejection occurred and no error appeared | Use the existing error area, retain the draft in the open editor, and allow another blur to retry; successful retry clears the error |

A discarded late answer is not retried automatically. A later automatic or manual request can summarize the current range. No stored chapter is rewritten by these guards.

## Cases already working, now covered

- A branch from inside a chapter, including a regenerated sibling reply, does not use that chapter; its raw messages return. The original path still uses its chapter. Deleting a suffix detaches its chapter without altering the retained record.
- Existing edit regressions retire dependent chapters, preserve hand-edited text and leave an unrelated branch alone. The browser regression verifies that the corrected source returns to the prompt.
- Two turns completing on sibling paths and a concurrent manual request create three disjoint ranges over their shared history. Existing double-request regressions cover both insufficient remaining messages and enough messages for another chapter.
- Existing summary queues recover after a failed request. A provider that ignores Stop still cannot save its late answer.
- Provider failure, an empty summary, a storage-write failure and Stop during the summary all preserve the already completed reply, report `core.error` with source `memory`, and leave no partial chapter.
- Changing `every` and `keep` affects the next range without rewriting saved hand edits. Turning memory off restores raw history; turning it on reuses saved chapters. Chapter send switches and navigation preserve saved manual edits.

## Verification

- Added **14 unit cases** in `packages/core/test/memory-reliability.test.ts` and **6 browser cases** in `e2e/memory.e2e.ts`.
- `npm run typecheck`: passed on the final source.
- `npm test`: **309 passed, 3 skipped**, across 38 passed and 2 skipped suites.
- `npm run build -w @homunculus/desktop`: passed; existing large-chunk advisory remains.
- Browser checks: **20/20 passed**, covering all of `e2e/memory.e2e.ts` (8), `e2e/branches.e2e.ts` (10) and `e2e/review-regressions.e2e.ts` (2).
- Browser command: `npx playwright test e2e/memory.e2e.ts e2e/branches.e2e.ts e2e/review-regressions.e2e.ts --config node_modules/.cache/agent-audit.config.mjs`.
- The ignored temporary configuration uses exclusive port 1427 with `reuseExistingServer: false`; each test uses a fresh browser database. Missing dependencies from the imported dev commit were installed without changing the lockfile.
- `git diff --check`: passed.

## Limits and unchanged behavior

- No real model/API calls, credentials, private play data, native Tauri window, real disk interruption, crash recovery or power-loss tests were used.
- The browser preview database is intentionally in memory. Navigation was tested; browser reload persistence is not claimed. A failed edit remains a draft in its open chapter editor; persistence of unsaved drafts across navigation/restart is not added.
- Serialization is per pipeline/app instance, not cross-process database locking. Stop suppresses a late saved answer, without guaranteeing provider cancellation or billing behavior.
- Saved chapters keep their original ranges when `every`/`keep` changes. The unchanged endpoint path rule controls which chapters apply; this audit does not introduce content hashes, chapter cleanup or remapping for separate-chat copies.
- The full unrelated browser suite was not rerun. T-002 and T-003 remain Ready. No design question was required to finish this card.

Signed: **CODEX**.
