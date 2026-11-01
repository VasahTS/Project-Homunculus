# Assistant reliability audit

Date: 2026-11-01. Author: **CODEX**.

## Scope and outcome

Daniel requested a bug check of the Assistant on dev. Audited committed local dev `b3c59e4` (D-062/D-064), imported into `Homunculus-gpt` / `gpt`. The Assistant engine, tools and view match that dev commit exactly. The existing gpt memory work was preserved.

The merge initially conflicted only in HANDOFF.md. Daniel explicitly authorized resolving it; both complete notes were preserved and merge `33d066a` completed. The dev checkout and its uncommitted files were not changed.

**Seven distinct bugs confirmed by eight reproductions: seven unit cases (including two Kit cases) and one browser case. No production fixes are included.** This is an inspection/report task; findings remain open for a follow-up fix. No screen design, schema, workflow, lockfile or release changes.

## Findings

### A1 - P1: imports bypass Ask me first

Source: `apps/desktop/src/assistant/tools.ts:658` (`import_file`).

Set the assistant's New items option to Ask me first, attach a character card and request an import. The tool saves the character immediately and returns a created card instead of a waiting proposal. `create` checks `ctx.saveNew`, but `import_file` does not. The lorebook import branch has the same omission (inspected; the automated reproduction uses a character).

Evidence: the database has **1 character instead of 0** with `saveNew: false`. Respect the same approval gate for imports, including embedded lore, before writing anything.

### A2 - P1: Stop does not guard tool writes

Source: `apps/desktop/src/assistant/engine.ts:241` (tool execution loop).

After the model returns a tool request, abort before that tool starts. The loop still executes it, because cancellation is passed to model streaming but is not rechecked before tools. A created item can therefore appear after Stop. Already-completed operations are a separate case and are not expected to be rolled back.

Evidence: the unit case aborts from the step's initial onUpdate callback, before `runTool` starts, yet **1 character is saved instead of 0**. Recheck cancellation before each tool and before subsequent model calls; tools that contain multiple writes also need an explicit cancellation strategy.

### A3 - P1: Kit proposals overwrite newer narrator and lore selections

Source: `apps/desktop/src/assistant/tools.ts:470-488` (`currentOf` / stale validation), and `kitOf`.

Have the Assistant propose a Kit's narrator or lorebook selection, manually change that selection in the meantime, then apply the old proposal. It is applied instead of becoming stale. The tool names are `narratorId` / `lorebookIds`, but stored values are under `narrator` / `setup.lorebooks`; the snapshot reads nonexistent top-level fields and always sees an empty string.

Evidence: **both narrator and lorebook cases return applied instead of stale**, allowing the old proposal to overwrite the user's latest selection. Normalize the snapshot to the tool-facing representation of actual stored fields.

### A4 - P2: the next request omits the user's result-card decisions

Source: `apps/desktop/src/assistant/engine.ts:144-168` (`toTurns`).

Create an item, press Undo on its result card, then send another message. The saved result card records undone, but the next request still replays only the original tool result saying Created. `toTurns` never includes `m.results`, so the model is not informed of that reversal. The same omission affects approval/discard/move decisions by inspection.

Evidence: serializing the request after Undo still contains `Created character:item`, with no undo/removal indication. Include concise current result-card outcomes in the request while preserving valid tool-call order. Only the Undo case was executed in this audit.

### A5 - P2: compaction removes guides that cannot be read again

Source: `apps/desktop/src/assistant/engine.ts:202` and `apps/desktop/src/assistant/tools.ts:609`.

Read a character guide, continue the conversation, compact away that exchange, then request the guide again. The guide body is absent from the request, but `chat.guides` still marks it as read. The tool refuses to return it with You already have the character guide earlier in this chat. Even before full compaction, old tool results are limited to 400 characters.

Evidence: the integration case actually compacts a chat, verifies the guide is absent from the model turns and its read flag survives, then receives the refusal instead of the full guide. Permit rereading when the full guide is no longer available, or maintain the needed content explicitly in context.

### A6 - P2: read-more instructions loop at offset 2500

Source: `apps/desktop/src/assistant/tools.ts:219-220,262-263`.

Read a 9,000-character description, then follow its continuation hint with offset 2500. The next chunk again instructs the model to use offset 2500 instead of 5000. It also undercounts remaining characters because the source was sliced before the compact helper calculated the remainder.

Evidence: the second page says **offset 2500** and **2,500 more characters**, although the next page should start at **5000**, with **4,000 characters** remaining. This can cause repeated tool calls and prevent the model from reading the ending. Keep absolute offsets and the original total length when paginating.

### A7 - P1: navigating during a reply leaves the wrong chat visible

Source: `apps/desktop/src/ui/Assistant.tsx:142-147,207`.

Complete chat A, start a delayed reply in chat B, select A in Recents while B is answering, then let B finish. The sidebar selects A but the main view still shows B. Navigation's load effect returns while busy and does not rerun when busy becomes false; the completed request also unconditionally sets B as the displayed chat.

Evidence: the browser confirms Recents has Make a world tracker selected, but the title is **Make a narrator** after the reply completes. A following send would use the displayed chat B. Guard request completion by chat identity and load the selected chat when navigation becomes effective; preserve the current task's isolation.

## Verification and reproduction

- `npm run typecheck`: passed.
- `npm test`: 324 ordinary tests passed, 7 expected failures, 3 skipped.
- Existing `e2e/assistant.e2e.ts`: all 3 flows passed (creation/Undo, approval, context, settings, folder Undo/Redo, character versions, draft-first Save).
- New `e2e/assistant-audit.e2e.ts`: A7 reproduced in Chromium on exclusive port 1427. The normal run marks the final failing assertion as expected; setup failures are not marked expected.
- Running the seven unit assertions without expected-failure handling produced seven failures with the findings above. The browser reproduction without expected-failure handling failed specifically on the wrong title after the sidebar-selection assertion passed.

Reproduction files:

- `apps/desktop/src/assistant/assistant-audit.test.ts`
- `e2e/assistant-audit.e2e.ts`

Known-bug assertions use Vitest `.fails` / Playwright `test.fail` so the default suite explicitly reports expected failures. They do not indicate fixes. Set `H2_AUDIT_VERIFY=1` to run them as ordinary failing tests; unset it afterward. When fixing a finding, remove its expected-failure marker and require it to pass normally.

PowerShell:

```powershell
$env:H2_AUDIT_VERIFY = '1'
npx vitest run apps/desktop/src/assistant/assistant-audit.test.ts
npx playwright test e2e/assistant-audit.e2e.ts
Remove-Item Env:H2_AUDIT_VERIFY
```

For isolation, this audit used the ignored config `node_modules/.cache/agent-audit.config.mjs`: base URL `http://127.0.0.1:1427`, Vite on that same exclusive port, `reuseExistingServer: false`. Do not reuse an unrelated running app server. Browser tests use a fresh context and preview's in-memory database; unit tests use in-memory SQLite and scripted model responses.

## Follow-up for Claude: efficiency and request transparency

Daniel requested this review note after the audit and a source comparison with Marinara Engine (2026-11-01). His concern is reaching roughly 100k tokens after only a few visible messages. This section records review requirements and recommendations, not an approved screen design or an implemented fix.

### Assessment and priorities

The Assistant has a sound direction: a focused library-material workflow, small general tools, on-demand guides and item reads, file summaries instead of complete file injection, shortened old tool results, and a persisted conversation summary. Consolidate these foundations and the seven reliability findings before expanding capabilities; a rewrite is not warranted by this inspection.

Efficiency is not yet guaranteed. Review these in order:

1. A total per-answer token budget, distinct from a per-request context limit, output limit and maximum tool-round count. Include all internal calls, summaries and reported reasoning usage where available. Exact limits, defaults and exhaustion behavior require Daniel/Claude review; no new default is chosen here.
2. Old tool-call arguments: `toTurns` shortens previous results but replays full `round.calls[].arguments`. A large created lorebook can keep returning in later prompts. Consider compact references and concise outcomes for completed historical operations while preserving valid provider tool-call/result pairing and the current working material.
3. Bound every read by content size as well as entry/line count. Lorebook `entryFull` / pages of ten entries have no overall text-size cap; `read_file` line ranges can also contain arbitrarily long lines. Cover nested fields, names and summaries, not only ordinary descriptions.
4. Reassess rules, notes and memory included in full from presets; keep useful persistent context without allowing uncontrolled prompt growth. Preserve the existing saved-summary approach and fix A5/A6 so reduction does not cause repeated reading or lost guides.
5. Validate with scripted multi-round traces first; real-model behavior and spending still need a separate user-controlled trial. Do not infer low cost merely from a small first request or successful offline tests.

Synthetic measurements from this session (no API, credentials or private data): 2,566 characters of serialized model turns plus 4,697 characters of tool definitions for a minimal greeting (12 tools). Attaching a 400,000-character text file produced 2,628 characters of turns, excluding the file body. Replaying a previous creation with a 100,000-character content field produced 102,928 characters of turns on the following short user message. These are serialized character counts, not tokenizer measurements or billed costs; the measurement script was disposable and removed.

### Daniel's explicit requirement: show what the AI receives and omits

The user must be able to inspect what is actually sent to the AI and identify what the application includes or leaves out. This needs to go beyond the existing approximate context meter and a reconstruction of the current chat.

- Capture each actual outgoing application request at the final send boundary, after prompt assembly, compaction, trimming and provider-format conversion. Cover every internal tool/model round, retry or fallback that actually makes another request, and summary calls. Do not reconstruct it afterward from settings or messages that may have changed.
- Make the submitted instructions and context inspectable: app rules, assistant instructions, active preset/rules/notes/memory, summary, ordered conversation messages, item/file content, image presence and identity, tool definitions, tool-call arguments and results. Distinguish an attachment reference/summary from content actually read and sent, and an advertised tool from an executed tool.
- Explain exclusions and transformations with their source and reason: inactive rules, unselected material, content never fetched, compacted older messages, shortened results, paginated portions, omitted older images, context/budget cuts and other actual filtering. Do not imply that an entire file or library item was included when only a portion was sent. If a reason was not recorded, report it as unknown rather than inventing it.
- Distinguish the context size of one request from total usage across the answer and conversation. Label provider-reported token/cost figures separately from local estimates; distinguish cache data where the provider exposes it. Missing usage must remain visibly unknown, not zero or a claim of cheap execution.
- Keep authentication headers and API keys out of any request view/export. Review this without opening Daniel's private play folder or credentials. A view can establish what the application submitted; it cannot reveal a provider's undisclosed internal prompt changes or prove what a model attended to.
- Verification should compare the inspectable record with an intercepted final outbound request, and exercise tool rounds, compaction, truncation, disabled context, attachments, summaries and failures. The user should be able to answer: What did this specific call receive? What relevant material was omitted or shortened, and why?

Claude should review the existing `Request` view and Details panel against this requirement, then propose any necessary UI and storage changes through the project's normal approval process. Daniel requested recording the requirement here, not implementing a new interface in this task. No D-number or numerical budget has been assigned.

### Marinara comparison: useful evidence, not a measured user bill

Source inspected: Pasta-Devs/Marinara-Engine main at `e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44`, matching the local reference pin at the time of inspection.

- Full Mari's default pi runtime allows 400 tool-bearing rounds. Its in-memory compaction summary does not persist to the next user turn: [pi-runtime.ts](https://github.com/Pasta-Devs/Marinara-Engine/blob/e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44/packages/server/src/services/professor-mari/pi-runtime.ts#L66), especially lines 872-909. This is a safety ceiling, not a spending budget. Homunculus defaults to 25 tool steps, also without a total token budget.
- Mari's attached-chat block permits 400,000 characters (the source approximates 100k tokens) before the provider's context fitting, and is preserved as injected context: [mari-workspace-context-prompt.ts](https://github.com/Pasta-Devs/Marinara-Engine/blob/e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44/packages/server/src/services/professor-mari/mari-workspace-context-prompt.ts#L22). Text files are inlined by [prompt-attachments.ts](https://github.com/Pasta-Devs/Marinara-Engine/blob/e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44/packages/server/src/services/generation/prompt-attachments.ts#L171).
- Mari also has useful economy mechanisms: indexed memories/skills, bounded reads, context fitting/caching support and a one-call Quick mode. Avoid describing it as blindly sending the whole library: [workspace-agent.service.ts](https://github.com/Pasta-Devs/Marinara-Engine/blob/e5ead06ac2fe1cb3e039f8cab7e4d266b01dac44/packages/server/src/services/professor-mari/workspace-agent.service.ts#L3215).
- A short visible exchange may include many paid internal calls. Five requests with 20k input tokens each total 100k input tokens; this is illustrative arithmetic, not a reproduction of Daniel's Marinara session. Caching can change pricing; raw token totals alone do not establish cost.

Signed: **CODEX**.

## Limits

No real model, paid API, credentials, private play data or native Tauri window was accessed. Simulated tool responses prove application behavior, not how often a particular model triggers it. Persistence under actual native-disk latency, restart/crash recovery, compaction concurrent with edits/deletion, and full import Undo of embedded lore were not certified. Other possible issues were not promoted to confirmed findings without a reproduction.

React emitted duplicate-key warnings for repeated context attachments in existing flows; their visible impact was not reproduced, so they are not included among the seven confirmed bugs.

Signed: **CODEX**.
