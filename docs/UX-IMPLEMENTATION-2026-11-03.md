# UX review implementation — 2026-11-03

Author: **CODEX**. Status: local work on `gpt`; no commit, push or merge into another branch.

Daniel directly requested implementation of all twelve findings in the review, including his Assistant history, branching, deletion and scrolling reports. This authorizes the described controls and the compatible data additions needed for them. The existing visual direction and slow entrance motion are retained.

The actual checkout is `Project-Homunculus/Homunculus-gpt`; the configured `Homunculus2` folder no longer exists. The starting commit was `5292047e4f26e865683f293a7a9ad71f6a088b1d`. The pre-existing `package-lock.json` and `apps/desktop/src-tauri/Cargo.lock` changes are preserved and are not attributed to this work.

## Delivered behavior

| Review item | Implementation |
| --- | --- |
| R1 — Draft continuity | Play keeps text by session; Assistant keeps text and attachments by conversation, with a separate new-chat draft. Drafts survive navigation for the lifetime of the window. Failed message saves preserve the draft, and a slow accepted save does not clear newly typed text. |
| R2 — Unsaved changes | Connections, Characters, Personas, Presets and Trackers use Save / Discard / Stay on navigation away from dirty editors. A failed or invalid save keeps the editor open. Existing automatic-save surfaces retain their behavior. |
| R3 — Ctrl+K keyboard | The dialog contains Tab/Shift+Tab, makes the background inert, closes with Escape and restores the previously focused control. |
| R4 — Minimum window width | Small windows start without the Play inspector unless a saved preference says otherwise. At 1100 px and below, an opened inspector overlays the chat with its own Close control instead of squeezing the reading pane. |
| R5 — Model scope | Quick Connection stores the model in the current session's setup. The core applies it to actual turn/preview routing without modifying the saved profile or other sessions. Changing/removing the connection clears its associated model selection. |
| R6 — Card Browser actions | Card identity and Add to Characters / Chat Now stay in a sticky action strip. Large artwork and complete collapsible fields remain. The secondary menu stays inside the detail pane. |
| R7 — Send versus continue | An empty Play composer says Continue. Settings → Customize → Messages → Send With selects Enter or Ctrl+Enter for both composers. Input composition does not trigger premature sending. |
| R8 — Global message search | Ctrl+K has a Messages group with excerpts and chat identity. It searches stored Play messages and Assistant conversations' selected paths; a result opens the corresponding conversation/message. Play resolves the matching branch through its existing message-focus behavior. |
| R9 — Regenerated answers | Assistant retains earlier answers and exposes Previous Answer / Next Answer with a version count. Reasoning, tool rounds and result cards remain with their answers. Failed/stopped regeneration does not remove the original path. |
| R10 — Assistant branches | Branch From Here preserves the original continuation. A Conversation Branch selector switches saved paths. Editing and resending earlier user text creates a preserved path instead of replacing the old continuation. |
| R11 — Individual deletion | User and Assistant message rows have Delete Message. Undo restores the removed message in that path. Deletion clears the affected summary/guide cache; it does not implicitly undo Library operations. |
| R12 — Streaming scroll | Scrolling upward suspends bottom-following. Latest / Writing… returns to the response and resumes following. Finalizing a response keeps the reading position when following is suspended. |

## History and data compatibility

The Assistant continues to use its existing `assistant.chat:<id>` settings records and chat index. New history fields are optional, so existing linear chats still load. On disk, branch paths reference message ids and inactive messages are stored once; shared prefixes do not multiply large attachment payloads for every regeneration. Loading restores complete paths for the UI and the selected path alone supplies the model's conversation.

Switching versions or branches only changes the selected conversation path; it does not replay or undo completed Library actions. Shared messages keep their tool-card decision state consistent across paths. Deleting a message affects the selected path and invalidates its summary, so the deleted content is not retained through that summary. Other explicitly preserved paths keep their own history.

Play adds the optional `modelOverride` setup field. Existing sessions inherit their saved connection model when the field is absent or empty. No SQL table migration, dependency change or credential-storage change is required.

Draft contents remain in memory in this window. Only the send-key preference is saved in browser storage. Closing/restarting the window does not retain unsent drafts; saved Assistant paths use the application's existing database.

## Source map

- `apps/desktop/src/ui/ux.tsx`, `main.tsx`, `App.tsx`: draft state, navigation protection, modal focus and global message search.
- `ui/Assistant.tsx`, `assistant/history.ts`, `assistant/engine.ts`, `packages/schemas/src/assistant.ts`: Assistant paths, answer versions, deletion, storage and streaming scroll.
- `ui/CharacterEditor.tsx`, `PersonaEditor.tsx`, `PresetEditor.tsx`, `TrackerEditor.tsx`, `SettingsPage.tsx`: manual-save editor safeguards.
- `ui/ChatView.tsx`, `CustomizeSection.tsx`, `QuickConnect.tsx`, `ConnectionPanel.tsx`, `SetupFields.tsx`, `Inspector.tsx`, `styles.css`: composer behavior, model scope, responsive panels and fixed card actions; `ui/CardBrowser.tsx` owns the card strip.
- `packages/schemas/src/setup.ts`, `packages/core/src/setup.ts`, `turn.ts`, `storage/store.ts`: compatible model selection and its lifecycle.
- `apps/desktop/src/assistant/history.test.ts`, `packages/core/test/ux-model.test.ts`, `e2e/ux-review.e2e.ts`, `e2e/assistant-history.e2e.ts`, `e2e/card-browser-details.e2e.ts`: new regression coverage. Existing send-helper assertions now expect Continue when the composer is empty.

## Validation

Final checks: `npm run typecheck` passed; `npm test` passed **516 tests** with **3 skipped**; desktop Vite build passed. Initial regression checks reproduced the draft, dirty-exit, focus and narrow-window failures before their fixes. Additional integrity checks reproduced shared-attachment duplication and a stale model selection after deleting its connection before their fixes.

The first broad browser round had 223/225 passes. Its two failures were addressed: the Card Browser's secondary menu needed alignment inside the sticky strip, and the motion test needed the runner's reduced-motion preference turned off. The following 30 affected browser flows passed with normal motion. The subsequent full round passed **227/227 browser flows**. After the final compact-history/lifecycle changes and stable placement of Again, **21/21 affected flows passed**, including an additional repeated-pointer-click regression. No failing product check remains.

The browser runner regenerated seven tracked screenshots in `docs/drafts/agent-try-it/integration/`. They were clean at the session start, but automatic approval review rejected restoring them from HEAD under the user's no-discard rule. They remain local and are identified as generated test output; cleanup awaits explicit approval. No bypass or indirect overwrite was used.

Visual QA uses the actual React UI with bundled/synthetic data at 1366 and 900 px. The temporary loopback preview uses in-memory SQLite; site/model requests in the targeted tests use explicit fakes. No personal play folder, private database, account or actual API key was used. This validation does not establish native Tauri behavior, real-provider/live-site behavior, power-loss recovery or a screen-reader audit.

Existing build notices about bundle size and the mixed dynamic/static import of `files.ts` are separate from these UX changes. Existing Assistant fixture runs also log a duplicate `starter-lyra` React-key notice; this review does not establish its original authorship.

Signed: **CODEX**.
