# Agent reliability audit

Date: 2026-10-30. Author: **CODEX**. Decision: D-051.

## Scope

First task authorized by Daniel: agent saving, session boundaries, cancellation, read-only comparisons and story lorebook isolation. Work is confined to the `Homunculus-gpt` checkout and `gpt` branch. UI appearance and new agent features remain outside this task.

## Evidence and fixes

| Scenario | Evidence before the fix | Result |
| --- | --- | --- |
| An earlier slow save finishes after a later edit | Browser test lost the latest name | Serialize saves; mark Saved only after the latest revision succeeds |
| Close after a persistence failure | Browser test closed the editor and lost its draft | Keep the editor open on failure; Close retries and waits |
| Leave a failed draft, edit another agent, return | Browser test lost the failed draft | Retain each agent's own queue and draft through navigation |
| A slow Close/Delete finishes after another agent is opened | Two browser regressions closed the new editor | Complete navigation only if the initiating agent is still selected |
| Delete while an earlier save is running | Added regression for the late-write recreation risk; not claimed as a baseline reproduction | Wait for the active write before deletion and drop pending writes |
| Run or compare using a message from another chat | Two core regressions accepted the foreign message, including its text in the comparison prompt | Reject the session mismatch before calling an AI |
| Stop a text agent or a code agent whose answer arrives after Stop | Two core regressions still rewrote the message | Check cancellation before execution and before applying the answer |
| Concurrent keepers in two chats of the same story | Both native-latency simulations lost one entry, with and without an existing lorebook | Serialize keeper persistence per story and merge against its latest version |
| Compare a rewrite, tracker or lorebook proposal | Read-only regressions passed | Keep messages, revisions, notes, state, run history, story patches and the Library book unchanged |
| Manually apply a keeper proposal | Positive isolation regression | Only that story's version changes; its shared Library original and another story stay unchanged |

Tests simulate disk failures and delayed writes in an isolated browser context. Store interception is in test code only. Core tests use a fake model and in-memory SQLite, with asynchronous reads injected for the native-latency concurrency cases.

## Verification

- `npm run typecheck`: passed after the final source change.
- `npm test`: 240 tests passed, 2 skipped (30 suites passed, 1 skipped), including 16 new unit regressions.
- `npm run build -w @homunculus/desktop`: passed after the final source change.
- Full browser suite: 129/129 passed before the final Close/Delete navigation guards.
- After those guards and two additional regressions, all 18 affected agent/lorebook browser scenarios passed. The suite now contains 131 scenarios; the unaffected flows were covered by the earlier full run.
- `git diff --check`: passed.

The browser suite runs this checkout on exclusive port 1427 with a temporary configuration under ignored `node_modules/.cache/`. It does not reuse a running app server or Daniel's play database.

## Limits

- Failed editor drafts survive navigation only while this app instance remains open. Restart/crash recovery is not added.
- Cancellation discards answers arriving after Stop; it does not undo outputs already applied or guarantee a provider stops billing an in-flight call.
- Keeper write serialization is per runner/app instance, not a cross-process database locking protocol.
- Lore changes remain story-wide as specified by D-049. Branch-only lore is still deferred.
- Real paid model/API calls, the native Tauri window, private databases and real disk/power failures are not tested here.
- Global agent defaults, the Try it editor feature, tools and the Library Assistant are not implemented by this audit.

Signed: **CODEX**.
