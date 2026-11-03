# Assistant generation across navigation — 2026-11-03

Author: **CODEX**. Status: **local, uncommitted, unpublished on gpt**.

## Reproduction and cause

Daniel reported that leaving the Assistant tab stops the response. Controlled browser streams reproduced leaving for Play or Settings and returning before completion: the live reply disappeared and Stop was lost. A control case showed that the provider itself could continue and save a finished reply while the user was away.

`App` conditionally mounts `AssistantView`. Its live message, displayed chat, running-chat id, AbortController and compaction/error state previously belonged to that view. On return, the new view had neither the active run nor its Stop controller and loaded the stored user message alone. Its busy guard also no longer represented the outstanding request.

## Changes

- New `apps/desktop/src/assistant/runtime.ts`: a transient, window-owned snapshot and run refs. It holds the selected chat/live reply/error/compaction state, original controller and pending chat identity. No new global singleton, database table, schema or storage key.
- `apps/desktop/src/ui/Assistant.tsx`: the existing app-level `useAssistant` hook creates that runtime once. `AssistantView` subscribes through `useSyncExternalStore`; token updates rerender the subscribed view rather than the whole App. The view can unmount normally while its asynchronous generation continues to publish updates.
- Returning to a pending chat restores its accepted user/history snapshot and its existing live reply. Completion only replaces the displayed chat if the same chat is still selected. Selecting a new chat/draft does not receive another chat's streamed or finished text.
- The accepted save refreshes Recents, and a synchronous run guard retains the existing single-run behavior across remounts. No additional model request is made just because the user returns.
- Errors now remain in the persistent snapshot until an explicit new selection/request clears them. The previous effect-based one-use error restoration could erase a background first-save failure during remount. A failing browser case proved this before the error-continuity fix; the unsaved draft survives and can be retried.
- Stop still uses the original AbortController and saves the partial answer through the existing engine. The engine, tools, approvals, generation history format and provider adapters are unchanged by this follow-up.

## Validation

New `e2e/assistant-background.e2e.ts`, five cases with synthetic provider/save gates:

1. Leave for Play, advance the same provider stream while hidden, return to the same partial reply, and Stop. Exactly one provider request and one saved partial reply; the final chunk never arrives.
2. Finish while Play is visible; return to exactly one complete saved answer.
3. Leave through Settings, return to the existing pending reply/Stop, finish with one request and one saved answer.
4. Open a separate new-chat draft, revisit the running chat, leave again and finish it while away; preserve the selected draft and reveal the completed answer only when its own chat is selected.
5. Fail the first save while away; preserve and show the error and original unsent draft, then retry successfully once.

The Play and Settings live-return assertions failed before the runtime change. The background-completion case passed before and after it, establishing the difference between a missing UI subscription and a provider cancellation. Test setup selectors were corrected to the actual accessible Stop/Settings controls. The chat-switch test uses real New chat/Recents controls, avoiding a synthetic database insertion that did not refresh the already-mounted sidebar.

Final checks:

- TypeScript: passed.
- Full unit suite: **615 passed, 3 skipped**.
- Desktop frontend build: passed; existing bundle-size/static-and-dynamic-import warnings remain.
- **19 related browser cases passed across final runs**: background (5), history (6), Assistant (3), helper (1), personas (2), code wrap (2).
- Existing duplicate React-key warnings for `starter-lyra` were observed in the broader Assistant suite; those passing fixtures and their warnings are outside this navigation fix.
- `git diff --check`: passed.

Only synthetic browser/in-memory databases and fake/offline providers were used. No native Tauri or real-provider run, portable/personal data, API keys, native rebuild, dependency/lockfile/schema change, merge, commit or push. Earlier local source changes and generated screenshot edits were preserved.

Signed: **CODEX**.
