# Tracker persona context — 2026-11-03

Author: **CODEX**. Status: **local, uncommitted, unpublished on gpt**.

## Reproduction and cause

Daniel reported conflicting facts about the player's character in `Scene: Characters` when the persona uses `Near the end of the chat`.
`AgentRunner.context` only requests persona text when `agent.input.persona` is true. All three bundled trackers omitted it, so schema parsing selected false. New trackers made through `saveTracker` had the same omission.
The separate agent prompt is assembled from its selected sources, not copied from the main prompt. The main prompt correctly contained the persona at depth while the tracker only received the player's name and no description. Normal placement also reproduced the omission.

## Changes

- `apps/desktop/src/starter/trackers.json`: World, Characters and Plot explicitly enable their persona source and use the existing agent version field (version 2).
- `apps/desktop/src/trackers.ts`: new custom trackers include the persona. Existing bundled definitions with the same built-in provenance upgrade once through their agent version; only that version and persona input change. Custom instructions, connections, other inputs, field sets and saved tracker values are preserved. Deleted trackers are not restored, imported replacements are not changed, and later explicit opt-outs are preserved. Existing custom/imported trackers keep their source choices.
- `packages/core/src/turn.ts`: one test-proven guard in the runner's persona callback excludes descriptions whose placement is `Not sent`; this previously suppressed the main prompt but still permitted a separately opted-in agent to read the description. The pre-existing chat-model changes in this file were preserved and are outside this task.
- No new schema, SQL table, appSettings key, dependency, UI control, layout or prompt wording. Other agents retain their configured persona-source choice.

## Validation

- `apps/desktop/test/tracker-persona.test.ts`: 10 new cases. Seven of the first eight failed before the tracker fixes; the additional Not sent case failed before the callback guard. The deleted/imported and missing-persona controls passed throughout.
- The actual recorded tracker request contains the selected persona version's full description, expanded name macros and character card at normal placement, depth 0/user, depth 2/system and depth 100/assistant. Manual reruns and read-only Compare receive the same source; Compare creates no saved runs.
- New/existing starter installation, custom tracker creation, preservation of edited instructions/field sets, migration idempotence and explicit opt-outs are covered in synthetic in-memory SQLite.
- `npm run typecheck`: passed.
- `npm test`: **615 passed, 3 skipped**.
- `npm run build -w @homunculus/desktop`: passed; existing bundle-size/static-and-dynamic-import warnings remain.
- Browser checks: **14 passed across final runs**: 12 existing tracker/persona cases plus 2 new `e2e/tracker-persona.e2e.ts` cases. The new cases create the persona through the UI, select normal/depth placement, run Characters, and inspect both saved main and tracker prompts. Their first attempt used a full tracker name where the run panel shows an abbreviated name; corrected the test selector to the existing tracker id, then both passed. No product change was needed for that selector issue.
- `git diff --check`: passed.

## Trying the correction and limits

Reopen this local gpt app to run the existing-starter upgrade. Then run `Scene → Update Now` or `Run again`, or generate another reply, so a new tracker request includes the persona. Earlier tracker values are model-produced: a new execution is needed to reassess conflicting facts; old story messages are not rewritten by this fix.
The checks prove source delivery using synthetic data and fake/offline providers. They do not establish real-model consistency or native Tauri behavior. No portable/personal data or API keys were read and no native executable was rebuilt. No commit, push, merge, release, lockfile change or discard of earlier local work was performed for this task.

Signed: **CODEX**.
