# Agent editor Try it

Implemented after Daniel approved the text and visual draft on 2026-10-30. Decision D-053. Author: **CODEX**.

## Use

Open Library → Agents → an agent → Try it. Select a chat, a suitable message and optionally a connection, then Run test. Opening the preview makes no request. Separate-call agents use the normal provider path and may incur cost; text agents only expand their macros.

Result shows the typed answer. What it read shows the actual sent prompt, Raw answer preserves the response, and Reasoning appears only when reported. Model, duration and reported token usage belong to that captured test. Selecting another context marks the old snapshot outdated until rerun. Stop, Escape, Close and leaving the editor abort the pending preview; late answers are ignored. Closing discards this preview and returns focus to Try it.

The current in-memory editor draft is used even when its autosave is pending or has failed. Autosave itself continues as before. Try it never enables the agent, applies its answer, moves the active chat branch, or saves a test history.

## Boundaries

- Supported standalone modes: text and separate call. Inline/code modes and tool-enabled definitions explain that standalone preview is unavailable.
- Automatic timing, probability and keyword conditions do not block an explicit test. Passing Try it does not prove an automatic trigger will fire.
- Dependencies use successful results already saved on the selected message. A missing result produces an explanation; dependencies are not run.
- Lorebook keepers require a Story chat. Proposals are readable previews; no lorebook, patch or destination is created.
- The selected message determines the history path and state. Before-turn agents select user messages; after-turn agents select replies; text agents accept either.
- Normal output validators and native view renderers are reused. Choices have no send action; proposed changes have no Apply action. Raw text is displayed as text.
- No messages, notes, revisions, state deltas, lorebooks/story patches, agent runs, generation records, activation or connection settings are written by preview execution.

## Validation

Core regression coverage is in `packages/core/test/agent-preview.test.ts` (21 tests): ephemeral instructions, all eight effectful output kinds without writes/events, text expansion without AI, foreign-chat rejection, unsupported modes/tools, missing and saved dependencies, trigger bypass, connection override, historical branch/speaker context, keeper constraints, provider failure and cancellation. Public store mutators and domain events are observed in addition to before/after snapshots.

Browser regression coverage is in `e2e/agent-try-it.e2e.ts` (12 flows): no request on open; failed autosave/current instructions; captured inputs/raw; Stop, duplicate Run, Escape, focus return; inert choices and stale snapshots; text expansion; provider/malformed-output retry; conditional reasoning and reported usage; unsupported definitions; load failure/retry and empty context; delayed chat loading/navigation; layout and large content.

Checks: typecheck and production build passed; 261 unit tests passed, 2 skipped. Full browser results are recorded in CODEX-LOG.md. The build retains the existing large-chunk advisory.

Only the project's starter agents/Lyra and authored fixtures were used, with an in-memory browser database and offline/simulated providers. No private database, portable play folder, credentials or paid API was accessed. Real provider behavior and the native Tauri window were not verified.

## Visual comparison

Compared the actual Quiet UI with the approved portable draft. The 808 px width, spacing, controls, prose typography, tabs, colors and footer follow that draft. The production dialog omits the draft's external review controls and therefore has more room for content. Reasoning is absent when the provider reports none; context labels and usage are actual fixture values.

| State | Approved draft | Integrated app |
|---|---|---|
| Ready | [Draft](drafts/agent-try-it/previews/desktop-ready.png) | [1366 px](drafts/agent-try-it/integration/actual-1366-ready.png) |
| Result | [Draft](drafts/agent-try-it/previews/desktop-result.png) | [Long result, 1366 px](drafts/agent-try-it/integration/actual-1366-result.png) |
| Narrow | [Draft](drafts/agent-try-it/previews/narrow-full.png) | [620 px](drafts/agent-try-it/integration/actual-620-result.png), [390 px](drafts/agent-try-it/integration/actual-390-result.png) |
| Full | Project examples | [Eight cast cards, long names, 25 choices, 150% text](drafts/agent-try-it/integration/actual-full-620.png) |

Browser geometry assertions verify contained horizontal overflow and a visible footer at 1366, 620 and 390 px. Reduced motion and text enlargement are included in the full-content flow. This is functional integration of the approved design; global agent activation/scopes and Customize remain deferred.

Signed: **CODEX**.
