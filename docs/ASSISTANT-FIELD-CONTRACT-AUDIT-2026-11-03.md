# Assistant field-contract audit — 2026-11-03

Author: **CODEX**. Status: **local, uncommitted, unpublished on gpt**.
Scope: the five kinds the Assistant can write, comparing guide → read → create/approval/change → stored data. No personal/portable data or API keys.

| Finding | Corrected behavior |
| --- | --- |
| Narrator edits reset mayAddNpcs/turnInstruction | Unchanged metadata is retained and documented. |
| Advertised flat narrator style keys were ignored; stale checks missed them | Aliases map to nested style, can be read and participate in stale checks. |
| Plain narrator instructions were ignored behind blocks; clearing blocks lost replacement prose | Ambiguous changes are refused; explicit blocks: [] plus instructions works. |
| Kit read lacked writable narratorId/lorebookIds aliases | Read exposes vault/local-book links and read-only inheritance information. |
| Kit cast read/edit lost variantId, presence, tracked, muted and sheet | Existing member properties and versions round-trip; explicit version overrides work. |
| Empty Kit narratorId could not restore Simple Narrator | Explicit empty id resets it; omitted id retains the current narrator. |
| Kit lorebook updates reset only/add mode and exclusions | Existing only mode, exclusions and unrelated setup are retained. |
| Lore entry options were dropped on creation/read; stale checks omitted them | All editable schema options are retained/read/snapshotted; original import payload remains private to the importer and is preserved. |
| Lore operations silently ignored missing targets/arrays or edited duplicate titles | Operations are validated before proposal; exact ids win over titles; ambiguous/missing targets and duplicate ids are refused. |
| Partial Character Note edits reset depth/role, including variants | Partial properties merge with the effective note. Partial lore scan/filter objects also retain their other properties. |
| Nested-only field names could be accepted at the item root and ignored | Root fields are validated separately from nested guide metadata. |
| Draft fence kind and target id could address different collections | Shared draft/tool validation rejects the mismatch before any write, including shared-id collisions. |
| Invalid edits/new items reached approval and failed only after the click | Same pure mappers validate before offering approval; no writes occur during validation. |

Implementation: apps/desktop/src/assistant/tools.ts and guides.ts; Assistant.tsx delegates draft persistence to the same validated contract. No schema, SQL-table, dependency, native transport or UI-layout change. The guide explains blocks versus plain prose, style aliases, full-list cast/block replacement, local lorebook inheritance, advanced entry options, partial notes and read-only kinds.

Validation:

- 17 initial unit regressions failed; 3 later approval-validation regressions failed; all now pass. The browser mismatched-draft case also failed before its fix.
- Added 25 unit cases in field-contract.test.ts. Full npm test: **570 passed, 3 skipped**. Typecheck and desktop Vite build pass; existing bundle/mixed-import warnings remain.
- Six affected browser cases pass across final runs: two new field-contract cases, the tracker field case and three existing Assistant flows. The new positive case applies narrator/Kit/lorebook/Character Note proposals through the real UI and checks saved values.
- Existing starter-lyra picker key warnings remain visible in the old Assistant picker test. git diff --check passes.
- Tests use synthetic content, fake model output and in-memory SQLite/browser databases. No real provider/native Tauri validation; model compliance is not guaranteed by mapper tests.

All changes remain local. Existing items are not automatically repaired. Original lockfile edits, prior UX/DataCat/tracker work and the already-pending screenshots are preserved. The subsequent large-card pagination/looping report is outside this snapshot and is being handled separately.

Signed: **CODEX**.
