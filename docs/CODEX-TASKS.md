# CODEX tasks

Task cards for CODEX (GPT), written by Claude (D-056). CODEX works only on `gpt`; its rules are in `AGENTS.md` → "If you are CODEX".
Take the **first card marked Ready** unless Daniel names another. One card per session. When done, mark it **Done** and move it to the end.

## What CODEX is for (and what it is not)

| Good fit — give it to CODEX | Keep with Claude / Daniel |
|---|---|
| Bugs with steps to reproduce; a failing test first | Deciding how any screen looks or behaves |
| Reliability audits of a finished feature (like D-051) | New UI plans (UI-PLAN text) and drafts |
| Unit and click tests for code that has none | Schemas, stored data, migrations |
| Implementing a screen whose text **and** draft Daniel approved | Branching, world state, prompt assembly, memory path rule |
| Porting logic with a comparison test against the original app | Design decisions (D-xxx) |
| Maps of `docs/reference/` apps; summaries | Merging into `dev`, releases, workflows |
| Mechanical refactors proven by existing tests | Anything with no clear "done when" |
| Reviewing a Claude diff (report only) | |

Why the split: CODEX's reliability work (D-051, D-053) was excellent and well tested; its own UX choices (D-044/D-045) had to be redone in D-046.

## Card template (Claude fills this in)

```
### T-NNN · <short title>                     Status: Ready | In progress | Done | Blocked
Goal: one or two sentences — what is true when this is finished.
Context: decisions / docs to read (D-xxx, UI-PLAN section, reference file).
Files you may change: …
Do not touch: …
Steps / exact UI (only if the card has UI — copy it, do not improvise): …
Done when:
- [ ] concrete check 1
- [ ] npm run typecheck · npm test · npx playwright test e2e/<file>
Size: S (<150 lines) | M (<400 lines). Bigger → split the card.
Report: questions for Daniel go in the HANDOFF entry, not in code.
```

---

## Queue

### T-002 · Tests for the late-30/10 additions                           Status: Ready
Goal: the things Claude added on the night of 30/10 have click tests, so later changes cannot break them silently.
Context: HANDOFF "Small round (2026-10-30, late)", D-055, and the last commits on folder views (Ctrl+click picking, group drag, Ctrl+Z after a drag, Ctrl+A / Delete to Trash).
Files you may change: `e2e/*` (new file `e2e/late-30-10.e2e.ts` is fine), `packages/core/test/*`. App code **only** to fix a bug a new test proves, smallest possible fix, listed in the report.
Do not touch: any UI layout, text or behavior that is not a proven bug.
Cover:
- Notice "Reply ready in “<chat>”" + Open, when a reply ends in a chat not on screen.
- Composer footer "· this chat: N tokens" (`SqlStore.sessionUsage`: replies + agents, all branches).
- Agent failed → warning notice with Edit agent / Edit tracker; Stop is not a failure.
- Sidebar ■ Stop.
- Agent styles: picked per story and per chat, ★ default, `{{style}}` replaced or appended (`withStyle`).
- Folder views: Ctrl+click picks; group drag into a folder; Ctrl+Z puts it back as one step; Ctrl+A; Delete → Trash with one Undo, cards still in use listed.
Done when:
- [ ] every item above has at least one test
- [ ] npm run typecheck · npm test · the new e2e file passes 3 runs in a row (no flaky waits)
Size: M (tests don't count toward the limit).

### T-003 · "Export all" chats of a Story                               Status: Ready
Goal: a Story's chats can be exported in one go, in the same formats as a single chat.
Context: D-036 (organization round; "Export all" was approved in its plan and left for later). The exact UI below is the whole spec. Single-chat export already exists: `exportChat` (`packages/core/src/chatExport.ts`), `exportSession` + `saveExport` (`apps/desktop/src/App.tsx`, `files.ts`), menu in `apps/desktop/src/ui/ChatList.tsx`.
Exact UI (do not change it):
- In `ChatList`'s footer, on the Story page only, a quiet link **Export all…** next to "Show all N chats" (same `link` style). Hidden when the Story has fewer than 2 chats.
- Click → the same format menu as a chat's "Export as ›" (Homunculus chat, SillyTavern JSONL, Markdown, Text), same labels.
- Result: **one** `.zip` named `<Story name> chats.zip`, one file per chat, named as the single export names them; JSONL = the branch on screen, as today. One "Save as" dialog, not one per chat.
- Notice: `Exported N chats of “<Story>”` + `Saved to: …`. Cancel in the dialog = nothing, no notice. Error = the same error notice style as a single export.
Files you may change: `chatExport.ts` (add `exportStoryChats`), `ChatList.tsx`, `App.tsx` (wiring only), `files.ts` if needed, tests. You may add **`fflate`** as a dependency (and its lockfile change) for the zip.
Do not touch: single-chat export output, other menus, the Story page layout.
Done when:
- [ ] unit test: zip contains one file per chat, each identical to the single-chat export
- [ ] click test: link hidden with 1 chat; export with 3 chats; cancel does nothing
- [ ] npm run typecheck · npm test · npx playwright test e2e/stories.e2e.ts
Size: S–M.

---

## Ideas for later cards (Claude turns them into cards when their turn comes)
- Reliability audit of agents round 3 (D-055): Choose agents window, styles per story/chat, field notes reaching the prompt once.
- Reliability audit of Story lore patches (D-049) on branches.
- Click tests for lorebook Find and Replace (Ctrl+H) and Global Lorebooks.
- Map in `docs/reference/` of SillyTavern's chat import edge cases (for Backfill in memory slice 8).

## Done

### Direct request · Five review bugfixes (2026-11-01)                     Status: Done
Daniel explicitly authorized fixing the five bugs from CODEX's review, independently of the numbered queue.
Changed: `packages/core/src/{chat,turn}.ts`, `packages/core/src/agents/{feedback,runner}.ts`; new unit/browser regressions and signed notes/report.
Verified: typecheck/build, 295 unit tests passed (3 skipped), 37 affected browser flows passed.
Report: `docs/REVIEW-BUGFIXES-2026-11-01.md`. T-001 remains Ready: this is not its full reliability audit. Signed: **CODEX**.

### T-001 · Reliability audit: simple memory (D-054)                     Status: Done
Goal: chapter memory never loses, duplicates or misplaces story text, on any branch, and a failure never breaks a turn.
Context: D-054, `docs/MEMORY-PLAN.md` (proposal 1 — chapters tied to the tree path), format of `docs/AGENT-RELIABILITY-AUDIT.md`. This was written fast without a draft; it has only 39 lines of click tests.
Files you may change: `packages/core/src/memory.ts`, the memory step in `packages/core/src/turn.ts` (only to fix a proven bug), `apps/desktop/src/ui/MemoryGroup.tsx` (behavior only — no new controls or wording), `packages/core/test/*memory*`, `e2e/memory.e2e.ts`, new `docs/MEMORY-RELIABILITY-AUDIT.md`.
Do not touch: schemas, the storage key `memory.chapters:<sessionId>`, the path rule itself, prompt order, any UI layout or text.
Check at least:
- Branch from the middle of a chapter → that chapter does not count there; the raw messages come back.
- Swipe / regenerate / edit / delete a message inside a summarized range.
- Two turns finishing close together (background generation, D-034) → no duplicate or overlapping chapters.
- "Summarize now" pressed twice, or during a turn.
- A chapter edited by hand is never rewritten.
- Summary call fails or is stopped → turn still succeeds, `core.error` is reported, nothing half-saved.
- `every` / `keep` changed with chapters already saved; memory switched off and on.
Done when:
- [x] each problem found has a test that failed before the fix and passes after
- [x] cases that were already fine have a test too
- [x] report lists what was checked, what was fixed, what was not tested (real API, native app)
- [x] npm run typecheck · npm test · npx playwright test e2e/memory.e2e.ts
Size: M.
Report: `docs/MEMORY-RELIABILITY-AUDIT.md`; 309 unit tests passed (3 skipped), 20 affected browser flows passed. Signed: **CODEX**.
