# Review bugfixes — memory, regex and agents

Date: 2026-11-01. Author: **CODEX**.

## Scope

Daniel authorized fixes for the five bugs found while reviewing Claude's changes through `8602599` (D-054/D-057/D-059/D-060). Work is confined to Homunculus-gpt on gpt. This direct request does not complete the broader T-001 memory audit or start the other Ready cards.

## Evidence and fixes

| Scenario | Evidence before the fix | Result |
| --- | --- | --- |
| Edit a message already covered by memory | The prompt omitted the correction and sent the old summary | Switch affected and dependent later chapters off, returning corrected raw messages to the prompt; preserve their content and hand edits |
| Edit while a summary call is pending | The late answer hid the corrected source text | Revalidate source messages before committing; short invalidation writes do not wait for a model call |
| Summarize twice concurrently | Both requests saved the same span, even with enough backlog for two different spans | Serialize summary requests per session and recalculate each span from the latest chapters |
| Regex changes an edited message | No original was saved, or Original restored an unrelated earlier generation | Store the latest typed edit as beforeRegex, update it even when transformed content is unchanged, clear obsolete originals on ordinary edits |
| Before/parallel agents write notes with feedback enabled | Notes on user messages were omitted from the next main prompt | Read notes on all messages of the current branch; existing feedback switches and limits still apply |
| Compare/Try it selects another model | Every candidate used the agent's fixed modelOverride | Explicit test connections bypass the agent's model override for that test only; ordinary/manual runs retain it |

The original regression run had **10 failures and 1 passing recovery control** before implementation. The completed file has 12 passing cases, including a guard against chapters whose endpoint was deleted. Tests also verify an unaffected sibling branch, preserved hand-edited summaries, queue recovery, read-only previews, retained ordinary model overrides and unrelated message metadata.

`turn.ts` was changed only for proven memory bugs: per-session queues, invalidation and late-answer checks. The chapter endpoint/path rule, prompt order, schemas, SQL tables and appSettings keys are unchanged. Disabled chapters are not supplied as continuity context to a new summary.

## How to check

- Edit text inside a summarized range, then open Preview Prompt. The correction is present; affected chapters are retained as not sent, including any hand-edited text.
- Edit an AI message containing a regex match and click Original. The latest typed text is restored, preserving the current edit.
- Enable feedback on a before/parallel note agent. Its note reaches the main prompt on the same branch; another branch does not inherit that note.
- Set an agent's Model override and choose another connection/model in Compare or Try it. The explicit test model is used; the saved agent stays unchanged.
- Simultaneous summaries, late answers and provider failures are deterministic unit scenarios using an in-memory database and fake providers.

## Verification

- `npm run typecheck`: passed.
- `npm test`: **295 passed, 3 skipped** (37 suites passed, 2 skipped).
- `npm run build -w @homunculus/desktop`: passed; existing large-chunk advisory remains.
- Playwright: **37/37 affected flows passed**, covering review regressions, regex, memory, agents, Try it and agent reliability. The two new browser flows use the existing Edit, Original and Preview Prompt controls.
- `git diff --check`: passed.

Browser tests used an exclusive server on port 1427, an ignored temporary configuration, isolated browser storage and offline/fake providers. Regenerated draft captures were discarded; approved imagery is unchanged.

## Limits

- Queues coordinate one TurnPipeline/app instance, not independent processes editing the same database.
- Chapters affected by a new edit are retained with the existing off flag, rather than automatically rewriting hand-edited summaries. Existing controls can edit, remove or explicitly re-enable them.
- Chapters already stale before this fix are not retrospectively detected or migrated.
- Native Tauri behavior, real paid API calls, private databases and disk/power failures were not tested. The portable play folder and credentials were not accessed.
- No UI layout, labels, defaults, schemas, storage keys, lockfiles, workflows, release or dev/main branch changes are included.

Signed: **CODEX**.
