# Named rewrite menus — 2026-11-03

Author: **CODEX**. Local/uncommitted/unpublished on `gpt` in `Project-Homunculus/Homunculus-gpt`.

## Request and behavior

Daniel confirmed HTML/CSS rendering worked, then requested a separate menu for each agent that rewrote the reply, labeled with its actual name. Previously AgentMarks selected only the final revision and always called it polished.

- Each participating agent gets a named menu with See changes. Comparisons use that revision's own saved before/after, so a later agent's changes are not attributed to an earlier one.
- Multiple rewrites from one agent share one named menu with a count and a comparison per run.
- The current final step keeps Undo rewrite and the existing word-level editing/Undo All comparison controls. Earlier comparisons are read-only so they cannot overwrite later rewrites. An exact undo reconnects the earlier active chain and restores its menus; an unrelated edit stops the chain.
- Before/after matching reconstructs actual execution order even when revisions share a millisecond and UUID ordering differs. Existing silent display settings remain respected; an unavailable agent falls back to its stored id.
- Long names truncate on the button while the operable menu exposes the full name. Menus support keyboard focus/Escape, bounded scrolling and narrow portrait/landscape layouts.
- The chat's mask/scrollport can clip fixed descendants even when they fit the browser viewport. Rewrite menus now constrain their position and size to that actual region.

No new schema, SQL table, settings key, dependency or prompt/agent-execution change.

## Files

- `apps/desktop/src/rewrite-history.ts` — new active-chain/group helper.
- `apps/desktop/src/ui/AgentResults.tsx` — named menus, independent comparisons, read-only historical DiffSheet, focus and constrained placement.
- `apps/desktop/src/styles.css` — appended name/menu layout rules only; prior file content retained.
- `apps/desktop/test/rewrite-history.test.ts` — six unit cases.
- `e2e/rewrite-menus.e2e.ts` — three browser cases using synthetic agents through real execution/storage.
- `e2e/agents.e2e.ts` — two existing comparison flows now click See changes after opening the menu.
- This report and signed HANDOFF/CODEX-LOG/CODEX-TASKS/REGISTRO-CODEX entries.

## Validation

- Initial browser reproduction failed with one polished label instead of the three agent names.
- Six helper cases cover each snapshot, tied timestamps, sequential undo, arbitrary edits, repeated agents and empty histories.
- Three new browser cases cover exact snapshots per agent, read-only versus current controls, rolling back three rewrites without losing earlier menus, repeated runs, long names, full menu bounds, keyboard focus and Escape.
- Visual review caught the final menu ending at x=823.75 outside the chat's x=812 boundary. A failing geometry assertion reproduced it and now passes after the placement fix.
- Final checks: typecheck; 645 unit passes, 3 skipped; frontend build. Browser checks: 35 distinct cases passed across final runs (13 agents, 11 chat, 6 HTML/CSS, 2 metadata, 3 rewrite-menu cases). The 16 agents/menu cases were rerun successfully after the placement fix.
- Inspected stable desktop/narrow captures: `e2e/.results/rewrite-menus-desktop.png`, `rewrite-menus-mobile.png` (ignored outputs). Existing build warnings about chunk size/mixed imports remain.

Synthetic browser data/providers only; no real-provider, native Tauri or personal-data verification. Existing source, lockfiles and tracked screenshot edits are preserved and are not attributed to this task. No commit, push or merge.

Signed: **CODEX**.
