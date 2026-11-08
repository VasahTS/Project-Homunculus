# CODEX change record

## Prepare the 0.3.6 release (2026-11-08) — CODEX

- Moved the existing release notes for the seven commits after 0.3.5 into the 0.3.6 section of CHANGELOG.md. Recorded the release scope in HANDOFF.md and CODEX-LOG.md.
- The release notes script reads the 0.3.6 section. The standard Publish release workflow tests the app and builds and signs the Windows and Linux installers.

## 0.3.2 Memory width follow-up (2026-11-05) — CODEX

- Daniel reported Memory still clipped after the UI hotfix and clarified that this is a visual problem affecting only some chats. This continues the authorized release hotfix; no memory behavior redesign is requested.
- Failing-first evidence in e2e/memory-overflow.e2e.ts: the short summary-model story fit, while a long model name widened Memory sections to 1,963 px inside a 364 px inspector. The Memory pane has its own nested grid hierarchy and was omitted from the earlier generic pane correction.
- Changed only Memory layout rules in apps/desktop/src/styles.css, the new regression file, CHANGELOG 0.3.2 and signed records/task entry. Set zero-minimum tracks through the nested grids, shrink children, wrap long content, keep icons/chevrons visible, permit narrow setting rows to wrap and bound Guide columns. No JSX, core memory, prompt, schema, saved-data or workflow edits.
- Validation: TypeScript, 726 unit passes (3 skipped), in-memory Vite production build, 38 related Chromium tests and a seven-regression repeat. Cases cover short/provider-style/extreme model names, per-story inheritance, four viewport widths, real manual chapter creation/editing and peek, all settings, Recall and Guide. Evidence stays local in dev-data/hotfix-0.3.2/; personal data and credentials were not used. The existing build import warning remains.
- Preserve and exclude the pre-existing local apps/desktop/src-tauri/Cargo.lock package-version change. Publish via the existing workflow as 0.3.2 after normal gpt/main fast-forward promotion, with CODEX as commit author/committer. Signed **CODEX**.

## 0.3.1 inspector overflow hotfix (2026-11-05) — CODEX

- Daniel requested fixing his clipped UI and publishing a hotfix. This authorizes the targeted bug fix, gpt-to-main promotion and existing Windows/Linux release workflow, superseding earlier branch/release restrictions for this task.
- Changed apps/desktop/src/styles.css to give panes and inspector groups zero-minimum content tracks, allow their direct children to shrink, wrap long character field labels/mappings, constrain character title tracks and bound the folded note's preview. No prompt assembly, persistence, schema, wording, or workflow changes.
- New failing-first regression: e2e/inspector-overflow.e2e.ts reproduced 3,111 px Prompt sections inside a 364 px body with fictional imported fields and a long folded note. Four viewport checks cover 1440/1000/620/390 px, inherited setup, editing and an Observatory rerun; the fifth checks world values and tracker status after scrolling populated Scene section tabs. Browser evidence is local in dev-data/hotfix-0.3.1/; no personal app data or credentials were read.
- Passed typecheck, an in-memory Vite build, 726 unit tests (3 skipped), 40 related Chromium tests and a repeat of the five new regressions with Observatory. The unit suite's initial cache/temp access errors were environmental; normal filesystem execution passed without source changes. The existing build import warning remains.
- Preserved the pre-existing, unattributed apps/desktop/src-tauri/Cargo.lock change from package version 0.2.0 to 0.3.0 and excluded it from staging. Version changes and signed installers are produced by the existing release workflow. Signed **CODEX**.

## Prepare and publish 0.3.0 (2026-11-05) — CODEX

- Daniel explicitly authorized pushing gpt to main, creating Windows/Linux installers, and publishing current screenshots in the README. This is the task-specific exception to earlier branch/release restrictions.
- Changed README.md, CHANGELOG.md, docs/images/{app,assistant,library,home,stories,memory,agents}.png, HANDOFF.md, CODEX-LOG.md and this record. The changelog retains existing authors' entries and adds the release summary and current connection, memory and catalog behavior.
- Captures show the unmodified browser preview with fictional in-memory data. The new world-state screenshot executes the real tracker runner against scripted model responses: Characters, Plot and World complete successfully and the applied world delta and statuses are saved in the local dev-data/release-0.3.0/screenshots/world-state-proof.json evidence. No personal installation or keys were accessed.
- Preflight passed: TypeScript, 726 unit tests (3 skipped), an in-memory production build, 16 existing Home/Stories/trackers Chromium tests, and browser screenshot navigation with no errors. The existing build import warning remains. Native Tauri and real providers are outside this local check; the release workflow builds Windows NSIS and Linux deb/AppImage and signs updater artifacts before publishing.
- No application implementation or workflow modifications. Version changes are performed by the existing release workflow. Commit author/committer: CODEX; promotion uses regular fast-forward pushes preserving all authorship. Signed **CODEX**.

## Publish all local gpt changes (2026-11-05) — CODEX

- Daniel explicitly requested pushing all local changes to gpt. This authorizes the commit and push and supersedes earlier local/unpublished notes for this batch.
- Fetched origin/gpt at 9256913. Its seven commits after the old local HEAD 16f2675 already contain Claude's UI, crop, chat metadata, Quick Replies and opening work. Compared the staged snapshot against that tip and verified those commits remain present; no native or opening source differs from the remote. Claude's authorship and notes are preserved.
- Advanced local gpt to that descendant using a soft reset, keeping the staged tree byte-identical. The 70-file delta above the remote contains the three CODEX tasks below, their tests and signed records, plus the pre-existing package-lock.json removal of 27 peer metadata lines. That lockfile edit's authorship is unestablished; it is included as requested without regenerating dependencies.
- Application files are unchanged from the completed validation: TypeScript, in-memory Vite production build, 726 unit passes (3 skipped), 301 earlier Chromium scenarios, 34 recall-focused cases and 37 later connection/memory/chat/Assistant cases, plus the final Streaming screenshot repeat. Counts describe their separate runs and overlap. No new source edits or expanded runtime claims were introduced during publication.
- Native Tauri and live providers were not exercised by CODEX for this batch. Existing browser duplicate-key and build import warnings are recorded below. Graphify refreshed successfully (3,892 nodes; all 403 code files unchanged); generated indexes remain outside the checkout. The existing sensitive-file filter still skips tokens.css.
- Commit author and committer are CODEX. Destination is origin/gpt only, with a regular push and no force, release or update to dev/main. Earlier local-only entries are historical checkpoints. Signed **CODEX**.

## Streaming per connection (2026-11-05) — CODEX

- Daniel requested a Connections option to disable streaming for Jev. Added Streaming below Model, using the existing save and unsaved-changes flow. Stored profiles without the field default to true; saved false values and fallback profiles retain their own setting.
- The OpenAI-compatible provider sends the chosen stream flag and accepts full JSON responses when false, sharing text, reasoning, tool-call, finish-reason and token/cost handling with SSE. Invalid JSON, missing messages and API errors produce readable failures. Extra request fields cannot override the switch.
- Removed the provider's model-name rejection. With streaming off, recall can send Jev through chat completions on the selected connection; older dedicated-decision configurations retain their endpoint behavior. Recall cache identity includes the streaming mode. The existing summary-writer restriction remains unchanged.
- Source files edited by CODEX for this task, on top of the earlier local work: `packages/schemas/src/library.ts`, `packages/core/src/extensions.ts`, `packages/core/src/connections.ts`, `packages/core/src/turn.ts`, `packages/provider-openai/src/index.ts`, `apps/desktop/src/ui/SettingsPage.tsx`.
- Tests edited: `packages/provider-openai/test/provider.test.ts`, `packages/core/test/connections.test.ts`, `packages/core/test/recall-connections.test.ts`, `e2e/connections.e2e.ts`, `e2e/memory-v2.e2e.ts`. Signed notes added to this record, `HANDOFF.md` and `CODEX-LOG.md`.
- Seven new regression cases failed before the implementation. Final validation passed TypeScript, an in-memory Vite production build, 726 unit tests (3 skipped), and 37 Chromium tests covering Connections, chat, Assistant and memory. A focused repeat passed after correcting a screenshot selector; the Streaming-off capture was visually checked.
- Browser checks used demo data, synthetic keys and simulated responses. Native Tauri and live providers were not exercised. The existing duplicate starter-lyra key and mixed static/dynamic files.ts import warnings remain.
- Local, uncommitted and unpublished. Graphify refreshed successfully (3,892 nodes); the extractor reported no symbols for e2e/memory-v2.e2e.ts and skipped tokens.css under its sensitive-file filter. Signed **CODEX**.

## Recall connection and model (2026-11-05) — CODEX

- Daniel requested removing the nano-gpt-only restriction from memory recall. The UI uses Agents’ model by default, or a Custom model on any saved connection. A blank override uses that connection’s model; changing connection clears the old override. The existing model picker is available.
- Kept legacy stored decider values and explicit Jev selections. Protocol selection follows the effective model, and the chosen connection supplies its own provider, address and key. A missing saved connection reports the problem instead of sending the request through another account.
- Recall cache keys include connection/model identity. Test Recall awaits queued settings writes and surfaces a failed write before attempting the request.
- Source files edited by CODEX for this task, layered on the earlier local work.
  - `packages/core/src/turn.ts`, `packages/core/src/memory.ts`, `packages/core/src/recall.ts`, `packages/core/src/extensions.ts`, `packages/provider-openai/src/index.ts`, `apps/desktop/src/ui/MemoryPane.tsx`.
  - Tests in `packages/provider-openai/test/provider.test.ts`, `packages/core/test/memory-v2.test.ts`, `e2e/memory-v2.e2e.ts`, `packages/core/test/recall-connections.test.ts`.
- Validation passed TypeScript, an in-memory Vite production build, 719 unit tests (3 skipped) and 34 Chromium cases. New regressions cover arbitrary chat providers, selected credentials and model overrides, inherited defaults, legacy Jev endpoints, cache separation, deleted connections, catalog selection, navigation persistence and a delayed settings save. Visually checked the compact recall panel.
- The first regression rejected an ordinary model because it forced the decision endpoint. The delayed-save case used the previous model before the UI fix. Both now pass. Tests used synthetic credentials and simulated services; native Tauri and live model availability were not exercised.
- Local, uncommitted and unpublished. Graphify refreshed the local gpt index successfully (3,890 nodes); tokens.css remained excluded by its sensitive-file filter. Signed **CODEX**.

## Concise interface copy (2026-11-05) — CODEX

- Daniel authorized applying the 97-item copy audit to the local gpt checkout. CODEX shortened help, tooltips, empty states and example descriptions, consolidated Memory’s guide, corrected the display-only history setting description, and removed the disabled folder-import and Assistant-story choices.
- Files edited by CODEX for this task, on top of the pre-existing local work.
  - `apps/desktop/src/agents.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/ui/About.tsx`, `apps/desktop/src/ui/AgentEditor.tsx`, `apps/desktop/src/ui/AgentsPage.tsx`, `apps/desktop/src/ui/AgentsPanel.tsx`, `apps/desktop/src/ui/AgentTryIt.tsx`, `apps/desktop/src/ui/Assistant.tsx`, `apps/desktop/src/ui/AssistantCustomize.tsx`, `apps/desktop/src/ui/AssistantDetails.tsx`, `apps/desktop/src/ui/AuthorsNote.tsx`, `apps/desktop/src/ui/CardBrowser.tsx`, `apps/desktop/src/ui/CharacterEditor.tsx`, `apps/desktop/src/ui/ChatList.tsx`, `apps/desktop/src/ui/ChatView.tsx`, `apps/desktop/src/ui/ConnectionPanel.tsx`, `apps/desktop/src/ui/CustomizeSection.tsx`, `apps/desktop/src/ui/Folders.tsx`, `apps/desktop/src/ui/Gallery.tsx`, `apps/desktop/src/ui/Greetings.tsx`, `apps/desktop/src/ui/HomePage.tsx`, `apps/desktop/src/ui/ImageCropper.tsx`, `apps/desktop/src/ui/LibraryPages.tsx`, `apps/desktop/src/ui/LibraryWorkspace.tsx`, `apps/desktop/src/ui/LorebookEditor.tsx`, `apps/desktop/src/ui/LorePanels.tsx`, `apps/desktop/src/ui/MemoryPane.tsx`, `apps/desktop/src/ui/MessageLookSection.tsx`, `apps/desktop/src/ui/NarratorPromptGroup.tsx`, `apps/desktop/src/ui/PersonaEditor.tsx`, `apps/desktop/src/ui/PresetEditor.tsx`, `apps/desktop/src/ui/PromptBlocks.tsx`, `apps/desktop/src/ui/PromptCharacter.tsx`, `apps/desktop/src/ui/QuickConnect.tsx`, `apps/desktop/src/ui/QuickReplies.tsx`, `apps/desktop/src/ui/RegexScripts.tsx`, `apps/desktop/src/ui/ReplyPane.tsx`, `apps/desktop/src/ui/ScenePanel.tsx`, `apps/desktop/src/ui/SettingsPage.tsx`, `apps/desktop/src/ui/SettingsSections.tsx`, `apps/desktop/src/ui/StoryPage.tsx`, `apps/desktop/src/ui/TrackerEditor.tsx`, `apps/desktop/src/ui/UpdateBar.tsx`, `apps/desktop/src/ui/Vault.tsx`, `apps/desktop/src/ui/Versions.tsx`, `apps/desktop/src/ui/WhoPicker.tsx`.
  - `e2e/collection-sort.e2e.ts`, `e2e/lorebooks.e2e.ts`, `e2e/memory-v2.e2e.ts`, `e2e/memory.e2e.ts`, `e2e/presets.e2e.ts`, `e2e/untracked-cards.e2e.ts`, `e2e/updates.e2e.ts`, `apps/desktop/test/starter-copy.test.ts`.
- The only saved-content refresh matches original starter descriptions and built-in provenance, changes only help, is idempotent, and keeps deleted examples deleted. A new regression test covers customized instructions, custom descriptions, user-owned copies and repeat startup.
- Validation passed TypeScript, an in-memory Vite production build, 715 unit tests (3 skipped) and 301 unique Chromium cases across full-suite and focused runs. Ten cases initially expected old copy; their text assertions were updated. Six demo screenshots were inspected. Test-generated versioned PNGs were restored to their pre-task content.
- Browser runs logged duplicate starter-lyra keys, and the build logged the existing mixed static/dynamic files.ts import warning. Native Tauri, real accounts and live provider calls were outside this browser validation.
- Local, uncommitted and unpublished. Graphify refreshed the local gpt index successfully (3,869 nodes). Its extractor reported partial parsing for packages/core/src/storage/store.ts and skipped tokens.css as potentially sensitive. Signed **CODEX**.

## Card Browser search and portrait loading (2026-11-04) — CODEX

- `apps/desktop/src/ui/CardBrowser.tsx` drops queued portraits after their cards leave view, shares active downloads between grid and preview, and reserves a preview slot. Switching catalogs skips the typing delay. Superseded searches stop before their next request.
- `apps/desktop/src-tauri/src/lib.rs` reuses the Card Browser HTTP client across requests and preserves each request's deadline and URL checks.
- Reproduced both regressions with the original module using `e2e/card-browser-all-sites.e2e.ts` and `e2e/card-browser-pictures.e2e.ts`. Both passed with the fix. Typecheck, Vite build, 699 unit tests (3 skipped), 28 Rust tests, and 22 related Chromium tests passed.
- Kept All Sites and the existing portrait quality. Browser tests used synthetic catalogs. Live catalog latency was not measured. Signed **CODEX**.

## Consolidated gpt publication (2026-11-03) — CODEX

Daniel explicitly authorized reviewing and pushing all local gpt updates; the earlier local-only restriction is superseded.
Includes UX/Assistant reliability, DataCat, tracker/persona context, message metadata, HTML/CSS, rewrite menus and collection sorting.
Also includes the two unchanged pre-existing lockfile edits (original authorship unestablished) and seven synthetic test screenshots.
Validation: typecheck/build; 665 unit passes (3 skips); 261 complete-suite browser passes; no source changed during validation.
Inventory and limitations: docs/GPT-PUBLICATION-2026-11-03.md; destination origin/gpt only, without force or other-branch/release changes.
Earlier local/unpublished statuses are historical checkpoints. Signed: **CODEX**.

## ST-style collection sorting (2026-11-03) — CODEX

Daniel requested the ST-style sorting selector for Library, Characters and Stories, supplying its options as the UI reference.
Shared native selectors support name, dates, applicable favorites/activity/chat counts, estimated tokens and stable random order.
Choices/seeds persist per collection in existing h2.collectionPrefs; search, folders, view/size preferences and editor selection remain independent.
Display sorting preserves agent execution order; sorted regex edits map back to original positions and drag handles return in Execution order.
Validation: 665 unit passes (3 skips), typecheck/build; 42 browser cases pass across final runs, including five new sorting cases.
Report: docs/COLLECTION-SORTING-2026-11-03.md. Local/uncommitted/unpublished; synthetic data only, no native/live-provider check. Signed: **CODEX**.

Files: apps/desktop/src/collection-sort.ts and ui/CollectionOrder.tsx (new); ui/CollectionTools.tsx, Gallery.tsx, Vault.tsx, LibraryWorkspace.tsx, LibraryPages.tsx, AgentsPage.tsx and RegexScripts.tsx; App.tsx (provider only); styles.css (appended rules only); packages/core/src/storage/store.ts (read-only metadata method only); apps/desktop/test/collection-sort.test.ts, packages/core/test/collection-sort-metadata.test.ts and e2e/collection-sort.e2e.ts (new); report and signed notes. Existing source, lockfile and tracked-screenshot edits were preserved. **CODEX**.

## Named menus for every rewrite agent (2026-11-03) — CODEX

Daniel requested a separate menu for every rewriting agent, labeled with its name instead of the last-only polished marker.
Each agent now has its own menu and exact saved before/after comparison; repeated runs are grouped with separate comparisons.
The current final rewrite retains undo/partial-edit controls; earlier snapshots are read-only, and exact undo restores earlier menus.
Reconstructs tied-timestamp histories by content; names wrap/truncate accessibly and menus fit the actual chat scrollport.
Validation: 645 unit passes (3 skips), typecheck/build; 35 related browser cases pass across final runs, including three new menu cases.
Report: docs/REWRITE-MENUS-2026-11-03.md. Local/uncommitted/unpublished; synthetic providers/data, no native/live-provider check. Signed: **CODEX**.

Files: apps/desktop/src/rewrite-history.ts (new); apps/desktop/src/ui/AgentResults.tsx (per-agent menus/snapshots, optional read-only DiffSheet and menu positioning/focus); apps/desktop/src/styles.css (appended rewrite-menu rules only); apps/desktop/test/rewrite-history.test.ts and e2e/rewrite-menus.e2e.ts (new); e2e/agents.e2e.ts (two existing comparisons now open through See changes); this report and signed notes. Earlier UI/source, both lockfiles and tracked screenshot changes are preserved and outside this task. **CODEX**.

## HTML5/CSS3 and Animation Agent rendering (2026-11-03) — CODEX

Daniel supplied both agent prompts and requested completing their rendering support locally on gpt while away.
Styled chat replies now render in isolated documents, preserving HTML5, classes, CSS variables/layouts/keyframes and Markdown narration.
Includes stored rewrites and live replies; code samples keep their existing presentation, and HTML/motion/image preferences are respected.
Separate sanitizer/CSP prevent scripts, frame navigation and unapproved remote resources; expanding/collapsing content resizes without polling.
Validation: 639 unit passes (3 skips), typecheck/build; 37 related browser passes, including six new integration cases with no page errors.
Report: docs/MESSAGE-HTML-CSS-2026-11-03.md. Local/uncommitted/unpublished; synthetic provider/output, no native/live-provider test. Signed: **CODEX**.

Files: apps/desktop/src/messageFormat.ts (independent rich sanitizer/Markdown path, CSS protection and frame detection); apps/desktop/src/ui/MessageHtml.tsx (new isolated renderer); MessageText.tsx (chat opt-in and shared click handling); ChatView.tsx (stored/live opt-ins only, prior metadata/UX work preserved); MessageLookSection.tsx (existing HTML option help); apps/desktop/test/message-html.test.ts and e2e/message-html.e2e.ts (new); report and these signed notes. Existing source/lockfile/screenshot changes remain outside this fix. **CODEX**.

## Message date, time, number and separate token counts (2026-11-03) — CODEX

Daniel supplied v1 screenshots as the UI reference and explicitly selected this gpt checkout.
Chat messages now show local date/time, their 1-based position on the selected path, and separate Text/Reasoning counts.
Preserves provider reasoning usage in an optional generation-record field; total output/billing semantics remain unchanged.
Missing breakdowns and edited text use visible ~ estimates; versions/branches retain their own metadata, including hidden reasoning.
Validation: 629 unit passes (3 skips), typecheck/build; 13 related browser cases pass across final runs, including narrow/large-text checks.
Report: docs/MESSAGE-METADATA-2026-11-03.md. Local/uncommitted/unpublished; synthetic providers/data only, no native/live-provider check. Signed: **CODEX**.

Files: apps/desktop/src/ui/MessageMetadata.tsx and message-metadata.ts (new); ChatView.tsx (two message hooks); styles.css (metadata rules only); packages/core/src/extensions.ts and turn.ts (optional usage field only); packages/schemas/src/records.ts; packages/provider-openai/src/index.ts and test/provider.test.ts; apps/desktop/test/message-metadata.test.ts, packages/core/test/message-usage.test.ts and e2e/message-metadata.e2e.ts (new); report and these signed notes. Existing local changes in shared files and both lockfiles were preserved. **CODEX**.

## Assistant generation across navigation (2026-11-03) — CODEX

Reproduced Play/Settings navigation dropping the visible live reply and Stop handle while the provider kept running.
Assistant runtime now belongs to the app-level hook; the mounted view subscribes to its snapshot without rerendering App for each token.
Preserves pending chat/text/controller/compaction/error across remounts; accepted chats appear in Recents and duplicate starts are guarded.
Five new browser cases cover live return/Stop, background completion, Settings, chat/draft isolation and first-save failure/retry.
Validation: 615 unit passes (3 skips), typecheck/build; 19 related browser passes across final runs. Report: docs/ASSISTANT-BACKGROUND-2026-11-03.md.
Local/uncommitted/unpublished on gpt; synthetic data/providers, no native/private-data test; prior work/lockfiles/screenshots preserved. Signed: **CODEX**.

Files: apps/desktop/src/assistant/runtime.ts (new); apps/desktop/src/ui/Assistant.tsx (runtime ownership/subscription, selected-chat/error continuity and pending-run guards only); e2e/assistant-background.e2e.ts (new); docs/ASSISTANT-BACKGROUND-2026-11-03.md and signed HANDOFF/CODEX-LOG/CODEX-TASKS/REGISTRO entries. Earlier changes in Assistant.tsx, including draft/history/persona/helper/overflow work, were preserved and are outside this follow-up.

## Assistant code word wrap (2026-11-03) — CODEX

Daniel's screenshot showed code paragraphs continuing horizontally: the prior fix contained width but retained white-space: pre.
Scoped Assistant pre blocks now use pre-wrap/overflow-wrap:anywhere; indentation, blank lines and original Copy text remain intact.
Updated the existing two browser cases: deterministic streaming gate, actual wrapped-line geometry, no horizontal code scroll, exact mocked clipboard and resize.
Validation: both cases failed before CSS; final browser 2/2 plus message-format 1/1; 615 unit passes (3 skips), typecheck/build.
Report: docs/ASSISTANT-CODE-WRAP-2026-11-03.md. Browser screenshots inspected; synthetic data only, no native/provider check.
Local/uncommitted/unpublished on gpt; earlier source, lockfile and screenshot edits preserved. Signed: **CODEX**.

Files: apps/desktop/src/styles.css (one scoped pre rule and the adjacent CODEX comment); e2e/assistant-overflow.e2e.ts; docs/ASSISTANT-CODE-WRAP-2026-11-03.md and signed HANDOFF/CODEX-LOG/CODEX-TASKS/REGISTRO entries. All other existing styles.css changes predate this follow-up.

## Tracker persona context (2026-11-03) — CODEX

Reproduced missing persona in Scene: Characters at normal and depth placement: starter inputs never enabled that source.
All three bundled trackers now read it; existing built-ins upgrade once via their agent version; new custom trackers include it too.
Selected persona versions/macros reach automatic/manual/Compare calls; Not sent now also excludes the separate agent source.
Validation: 10 new unit cases (8 observed failing before their fixes), 615 full unit passes (3 skips), typecheck/build; 14 related browser passes across final runs.
Report: docs/TRACKER-PERSONA-CONTEXT-2026-11-03.md. Synthetic data/providers only; no native app or live-provider verification.
Local/uncommitted/unpublished on gpt; earlier work and lockfile/screenshot edits preserved. Signed: **CODEX**.

Files: apps/desktop/src/starter/trackers.json; apps/desktop/src/trackers.ts; packages/core/src/turn.ts (persona callback guard only); apps/desktop/test/tracker-persona.test.ts; e2e/tracker-persona.e2e.ts; the report and signed HANDOFF/CODEX-LOG/CODEX-TASKS/REGISTRO entries. Existing turn.ts chat-model changes predate this task and were preserved.

## Assistant helper, personas and code overflow (2026-11-03) — CODEX

Daniel chose an optional retrieval model on its own connection; configure Customize → Assistants → Tool helper (off by default).
Bounded read-only delegation returns evidence/cursors; writes/approvals stay with the principal; helper trace/usage and combined totals are visible.
Added persona create/change/approval/drafts/Open/Trash; fixed streaming code and expanded-trace overflow at desktop/narrow widths.
Validation: 605 unit passes (3 skips), typecheck/build; 38 affected browser passes, then 3 final helper/persona passes after snapshot/input refinements.
Reports: docs/ASSISTANT-TOOL-HELPER-2026-11-03.md and docs/ASSISTANT-PERSONAS-OVERFLOW-2026-11-03.md.
Optional Assistant schema extensions only; no SQL/dependency change. Synthetic data/providers; live savings/quality and native behavior unverified.
Local/uncommitted/unpublished on gpt; earlier work, lockfile and screenshot changes preserved. Signed: **CODEX**.

Files: packages/schemas/src/assistant.ts; apps/desktop/src/assistant/{engine,guides,tools,assistant.test,helper,helper.test,persona-tools.test}.ts; apps/desktop/src/ui/{Assistant,AssistantCustomize,AssistantDetails}.tsx; apps/desktop/src/{App.tsx,styles.css}; e2e/assistant-{helper,persona,overflow}.e2e.ts; the two reports and signed HANDOFF/CODEX-LOG/CODEX-TASKS/REGISTRO records. Existing lockfile and seven generated screenshot edits were not modified or attributed to this follow-up.

## Assistant large-card reading (2026-11-03) — CODEX

Reproduced historical reads cut through JSON at 400 characters, losing source cursors after a user continuation.
Added clean 6k source pages and explicit _read ranges/next arguments; recent read bodies retained within a 24k/known-context budget.
Older excerpts stay valid and preserve cursors; legacy saved results are upgraded only for replay. Version/lore-entry text pagination now works.
Validation: six failing regressions fixed; 13 new unit cases, 583 full unit passes (3 skips), typecheck/build; 13 affected browser passes.
Report: docs/ASSISTANT-LONG-READS-2026-11-03.md. Synthetic model/browser checks; no private chat or live-provider/native verification.
Local/uncommitted/unpublished on gpt; earlier audit fixes and all prior local work preserved. Signed: **CODEX**.

Files: apps/desktop/src/assistant/{reads,reads.test}.ts, tools.ts, engine.ts, guides.ts, assistant.test.ts, assistant-audit.test.ts; e2e/assistant-long-read.e2e.ts; docs/ASSISTANT-LONG-READS-2026-11-03.md and signed HANDOFF/CODEX-LOG/CODEX-TASKS/REGISTRO records. Existing pagination tests were updated to assert source ranges rather than the removed inline prose suffix.


## Assistant field-contract audit (2026-11-03) — CODEX

Audited all five writable item kinds after Daniel requested more bugs like the tracker failures.
Fixed narrator metadata/style/blocks, Kit links/cast/inheritance, advanced lore/read/stale/operations and partial Character Notes.
Draft target kinds and unknown/root fields are checked; invalid proposals/new-item approvals return to the model before user action.
Validation: 20 failing unit cases and a failing browser reproduction fixed; 570 unit passes (3 skips), typecheck/build; 6 affected browser cases pass across final runs.
Report: docs/ASSISTANT-FIELD-CONTRACT-AUDIT-2026-11-03.md. Synthetic data only; no real-provider/native validation.
Local/uncommitted/unpublished on gpt; prior changes preserved. Daniel's subsequent long-card reading report is a separate follow-up. Signed: **CODEX**.

Files: apps/desktop/src/assistant/{guides,tools}.ts, apps/desktop/src/ui/Assistant.tsx, apps/desktop/src/assistant/field-contract.test.ts, e2e/assistant-field-contract.e2e.ts, docs/ASSISTANT-FIELD-CONTRACT-AUDIT-2026-11-03.md and signed HANDOFF/CODEX-LOG/CODEX-TASKS/REGISTRO records.


## Assistant tracker context and field preservation (2026-11-03) — CODEX

Daniel reported misplaced filling instructions and every field returning to Auto; audited tracker options against editor/schema/runtime.
Guide now explains help versus note, scoped display choices, locks, prompt inclusion, lists, presence and default-field-set limits.
Tools retain the complete field schema and nested columns through create/read/approval/change; default-set presence is supported and validated.
Validation: seven original regression failures fixed; 545 unit passes (3 skips), typecheck/build, 4 related browser passes.
Report: docs/ASSISTANT-TRACKER-FIELDS-2026-11-03.md. Existing tracker content is not automatically rewritten; real-provider/native checks not run.
Local/uncommitted/unpublished on gpt; prior UX/DataCat work and lockfile edits preserved. Signed: **CODEX**.

Files changed by CODEX in this follow-up:

- apps/desktop/src/assistant/guides.ts: core reminder and complete tracker guide with editor labels/examples/options/tool boundaries.
- apps/desktop/src/assistant/tools.ts: complete recursive field mapping/read view, stable keys, presence and option validation.
- apps/desktop/src/assistant/assistant.test.ts: 16 additional cases; schema/guide coverage and create/approval/read/change preservation.
- e2e/assistant-tracker-fields.e2e.ts: synthetic tool response through the Assistant to the real tracker editor.
- docs/ASSISTANT-TRACKER-FIELDS-2026-11-03.md, HANDOFF.md, CODEX-LOG.md, docs/CODEX-TASKS.md and this record.


## DataCat V2 description fix (2026-11-03) — CODEX

Reproduced Daniel's public card: legacy personality is null; embedded V2 description contains 3,705 characters.
Preview and download now share the V2 mapping, with legacy fallbacks and creator download controls preserved.
Validation: four failing regression cases now pass; typecheck/build; 529 unit passes (3 skips); 11 related browser cases pass across final runs.
Live public response passed the actual adapter/importer/PNG round-trip in memory; no native Tauri check this follow-up.
Report: docs/DATACAT-DESCRIPTION-FIX-2026-11-03.md. Re-add earlier incomplete imports; existing characters are unchanged.
Local/uncommitted/unpublished on gpt; prior UX work and lockfile edits preserved. Signed: **CODEX**.

Files changed by CODEX in this follow-up:

- packages/card-browser/src/sources/datacat.ts
- packages/card-browser/test/card-browser.test.ts
- apps/desktop/test/import-characters.test.ts
- e2e/datacat.e2e.ts
- docs/DATACAT-DESCRIPTION-FIX-2026-11-03.md
- docs/evidence/datacat-description-2026-11-03.json
- HANDOFF.md, CODEX-LOG.md, docs/CODEX-TASKS.md and this record


## Twelve UX findings implemented locally (2026-11-03) — CODEX

Daniel directly authorized all R1–R12 on gpt: draft/save protection, keyboard/layout/model/search, fixed card actions, Assistant versions/branches/delete/scroll.
Compatible optional setup/history fields; shared messages stored once; Library actions are not replayed when selecting paths; no dependency or SQL-table changes.
Validation: typecheck/build; 516 unit passes (3 skips); 227 full browser passes, then 21 affected passes after final integrity/action-position changes.
Report: docs/UX-IMPLEMENTATION-2026-11-03.md. Local/uncommitted/unpublished; dev/ui unchanged; original lockfile edits preserved.
Seven test-regenerated screenshots remain local: automatic review rejected restoring them under the no-discard rule; cleanup awaits approval. Signed: **CODEX**.

Files in this authorized implementation and its records:

- `apps/desktop/src/ui/Assistant.tsx`
- `apps/desktop/src/assistant/engine.ts`
- `packages/schemas/src/assistant.ts`
- `apps/desktop/src/ui/ChatView.tsx`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/ui/SettingsPage.tsx`
- `apps/desktop/src/ui/CharacterEditor.tsx`
- `apps/desktop/src/ui/CommandPalette.tsx`
- `apps/desktop/src/ui/QuickConnect.tsx`
- `apps/desktop/src/ui/CardBrowser.tsx`
- `apps/desktop/src/styles.css`
- `packages/schemas/src/setup.ts`
- `apps/desktop/src/assistant/history.ts`
- `apps/desktop/src/assistant/history.test.ts`
- `apps/desktop/src/ui/ux.tsx`
- `apps/desktop/src/main.tsx`
- `apps/desktop/src/ui/PersonaEditor.tsx`
- `apps/desktop/src/ui/PresetEditor.tsx`
- `apps/desktop/src/ui/TrackerEditor.tsx`
- `packages/core/src/setup.ts`
- `packages/core/src/turn.ts`
- `packages/core/test/ux-model.test.ts`
- `e2e/ux-review.e2e.ts`
- `e2e/assistant-history.e2e.ts`
- `apps/desktop/src/ui/Inspector.tsx`
- `apps/desktop/src/ui/ConnectionPanel.tsx`
- `apps/desktop/src/ui/CustomizeSection.tsx`
- `e2e/quick-connect.e2e.ts`
- `e2e/card-browser.e2e.ts`
- `e2e/ui.ts`
- `e2e/background.e2e.ts`
- `e2e/trackers.e2e.ts`
- `e2e/card-browser-details.e2e.ts`
- `apps/desktop/src/ui/SetupFields.tsx`
- `HANDOFF.md`
- `CODEX-LOG.md`
- `docs/CODEX-TASKS.md`
- `REGISTRO-CODEX.md`
- `docs/UX-IMPLEMENTATION-2026-11-03.md`
- `packages/core/src/storage/store.ts`

Generated test captures also changed: `docs/drafts/agent-try-it/integration/actual-{1366,390,620}-{ready,result}.png` and `actual-full-620.png`. Cleanup was rejected by automatic review; no restoration or bypass was performed. No personal play folder, private data or API key was used. Author: **CODEX**.

## BotBooru source and account — publication authorized (2026-11-02) — CODEX

Daniel directly requested BotBooru first: source/search/filter/details/original-PNG import plus the site's own account window for NSFW/NSFL.
Fixed GET-only isolated session; no credentials returned to main; account flags respected; logout clears results; closing main also ends the site window.
Validation: typecheck/build, 506 unit passes (3 skips), 19 browser passes, 27 native passes; real SFW Windows import and post-exit persistence passed.
Report: docs/BOTBOORU-INTEGRATION.md; evidence: docs/evidence/botbooru-native-2026-11-02.json.
Real authenticated NSFW/NSFL remains untested; no personal data/API keys, schema or dependency changes; pre-existing lockfiles preserved.
Daniel explicitly authorized committing/pushing gpt and merging/pushing ui. Existing local lockfile edits remain excluded. Signed: **CODEX**.

Files: packages/card-browser/src/{sources/botbooru,types,index,pauses}.ts; package tests and original-query fixture; apps/desktop/src/{cardSites.ts,ui/BotbooruAccount.tsx,ui/CardBrowser.tsx,styles.css} and new bridge/transport tests; native src/{botbooru.rs,botbooru.js,lib.rs}, capabilities/botbooru.json, permissions/{botbooru,janny}.toml; e2e/botbooru.e2e.ts; CREDITS.md; report/evidence and signed work records. CODEX.


## 2026-11-02 — Review of readable details and authorized ui promotion — CODEX

Daniel explicitly requested publishing gpt, then bringing it into ui; this overrides the repository's usual gpt-only publication rule for this operation.
Reviewed pre-existing CODEX commit e19bf40: enlarged contained portrait, complete scrollable fields and native collapsible sections. Its authorship/history is retained.
Found and reproduced a keyboard regression before fixing it: ArrowDown in the Description text moved focus to another card. Added a regression to e2e/card-browser-details.e2e.ts.
Changed apps/desktop/src/ui/CardBrowser.tsx only to scope grid arrow navigation away from the details sheet; standard text scrolling and grid navigation both pass.
Validation: typecheck, production frontend build, 488 unit passes (3 skips), 14 related browser flows. New review record: docs/CARD-BROWSER-DETAILS-REVIEW.md.
Updated HANDOFF.md, CODEX-LOG.md, docs/CODEX-TASKS.md and this record. Native transport, dependencies, schemas and lockfiles are unchanged by this follow-up.
Existing package-lock.json and apps/desktop/src-tauri/Cargo.lock edits in both checkouts remain local and are not attributed to this work.
Publication to gpt and ui is authorized; integration must preserve both checkouts' local changes and use a normal push.

Signed: **CODEX**.

## 2026-11-02 — Card Browser readable details — CODEX

Status: **committed locally on gpt, not pushed**, as Daniel authorized after reviewing the completed work. Daniel authorized UI work on gpt and specified the supplied v1 screenshots as the reference for this correction.
Files: apps/desktop/src/ui/CardBrowser.tsx and apps/desktop/src/styles.css: enlarge and contain the portrait above the title, slightly widen this sheet, replace clipped field excerpts with native disclosure sections and full independently scrollable text, and reset reading position on greeting changes.
Tests: e2e/card-browser-details.e2e.ts; original three failures reproduced the 65px portrait and inaccessible full-text regions; final three pass at desktop/narrow widths, covering all eight fields, keyboard folding/reading, greetings, card switches and narrow-sheet close.
Records: HANDOFF.md, CODEX-LOG.md, docs/CODEX-TASKS.md and this file.
Validation: npm run typecheck; npm test (488 pass, 3 skips); npm run build -w @homunculus/desktop; 13 related browser flows pass; git diff --check.
Visual captures: card-browser-image.png and card-browser-fields.png in this chat's visualizations directory; synthetic definitions and the repository-distributed default_Seraphina.png only. No private database or credentials used. Native app and live sites untested this round.
The checkout moved to C:/Users/danie/Documents/SillyBunny-Classic-Dev/Project-Homunculus/Homunculus-gpt; branch gpt at 8571866. Fetched dev; it adds no commits beyond HEAD, so no merge was needed.
Pre-existing package-lock.json and apps/desktop/src-tauri/Cargo.lock edits preserved and excluded from this task's authorship. No schema, dependency, transport, release or workflow change.
Signed: **CODEX**.

## 2026-11-02 — Authorized JannyAI commit and push — CODEX

Daniel confirmed the correction works and explicitly requested publication to origin/gpt.
The commit has CODEX authorship and a [CODEX] message; it includes the correction, regression tests, credited reference fixture, evidence and signed records.
No application source changed during publication; the completed validation remains 488 unit passes (3 skips), 204 browser passes, 23 Rust passes and three real packaged-app imports.
At publication start, package-lock.json had peer-flag removals and apps/desktop/src-tauri/Cargo.lock had a root-version metadata change. They are preserved locally and excluded from this commit; their authorship is not established by Git.
Only gpt is being published. Signed: **CODEX**.

## 2026-11-02 — Working JannyAI native-session recovery — CODEX

Status: **local, uncommitted, not pushed**. Follow-up to Daniel's request for a solution after the audit.
Files: apps/desktop/src-tauri/src/{janny.rs,janny.js,lib.rs}, capabilities/{janny,default}.json and permissions/janny.toml: serialized fixed-origin browser session, bounded report/timeout, local-main command permissions and report-only remote access.
Files: apps/desktop/src/cardSites.ts and packages/card-browser/src/{types.ts,sources/janny.ts}: browser/native/session routing, shared decoder, PNG details, mirror/page recovery, preserved definition fields and short-lived file sharing.
Files: apps/desktop/src/ui/CardBrowser.tsx and App.tsx: retry incomplete details and expose the existing downloaded-file import action after download refusal.
Tests: cardSites-janny-audit.test.ts, packages/card-browser/test/janny-audit.test.ts, e2e/janny-audit.e2e.ts and native janny.rs tests; original eight reproductions now ordinary passes.
Records: CREDITS.md; docs/CARD-BROWSER-RELIABILITY-AUDIT.md; native/bridge evidence JSON; HANDOFF.md, CODEX-LOG.md, docs/CODEX-TASKS.md and this record.
Validation: typecheck/frontend and packaged native build; 488 unit passes (3 skips), 204 browser passes, 23 Rust passes.
Real packaged app at http://tauri.localhost imported three safe public JannyAI cards; after exit, isolated native SQLite retained their avatars, full definition fields and source metadata. The remote window was denied database_url.
No project schema, dependency, lockfile, workflow, release or personal/portable-data change. No new commit/push; original ui authorship preserved.
Windows tested; Linux/macOS and interactive human checks unverified. Timeout/refusal retains manual recovery. Details and initial-vs-fixed evidence are in the report.

Signed: **CODEX**.

## 2026-11-02 — ui into gpt and Card Browser/JannyAI test battery — CODEX

Status: **local, uncommitted, not pushed**. Daniel explicitly authorized the ui integration and testing; implementation fixes remain open.
Clean gpt fast-forwarded from 7304ab9 to ui 9fac7f5 after fetching ui/dev. Existing authorship preserved; no new commit.
Added tests: apps/desktop/src/cardSites-janny-audit.test.ts; packages/card-browser/test/janny-audit.test.ts; e2e/janny-audit.e2e.ts.
Added the unchanged Marinara download-helper reference (export/provenance only): packages/card-browser/test/fixtures/marinara-janny-download.ts; credited its original authors in CREDITS.md.
Added docs/CARD-BROWSER-RELIABILITY-AUDIT.md and docs/evidence/card-browser-native-2026-11-02.json; updated this record, HANDOFF.md, CODEX-LOG.md and the direct-request task entry.
Validation: typecheck/build pass; 472 ordinary unit passes + 6 expected failures + 3 skips; existing 199 browser cases pass, new Janny cases have 2 ordinary passes + 2 expected failures; 20 Rust tests pass.
Expected failures are eight unfixed reproductions of seven grouped findings, not fixes. Synthetic full-PNG import preserves definition fields and provenance.
Native runtime used unchanged Rust/provider source in an isolated hidden WebView2, blank diagnostic page and Dev test profile: search 200/80 cards, download 403/Cloudflare. Marinara's original browser helper also failed CORS, then its Node fallback got 403.
Native source/dependencies were unchanged; only the temporary lock's stale root version and temporary window configuration were aligned for testing. Project lockfiles are unchanged by this audit.
The existing suite regenerated seven tracked Try It screenshots; generated copies were archived outside the repository and their initial clean-baseline bytes restored.
No private/portable data, API keys or real providers accessed; no successful real native import claimed. Details and remaining session/origin validation are in the report.

Signed: **CODEX**.

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
