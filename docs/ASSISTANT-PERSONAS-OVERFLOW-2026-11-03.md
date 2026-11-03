# Assistant personas and long code — 2026-11-03

Author: **CODEX**. Status: **local, uncommitted, unpublished on gpt**.
Daniel reported that long code expanded the conversation horizontally and that the Assistant could not create library personas.

| Before | After | Why |
| --- | --- | --- |
| Long fenced code widened the Assistant message grid and displaced controls. | Conversation/body grid columns shrink; code scrolls within its own block. Tested during and after streaming at 1366 px and 390 px. | Reading code keeps the composer and message actions reachable. |
| Persona was a read-only tool kind, despite an existing Library editor/storage API. | Create, approve-new, propose/apply changes, draft saves, Trash/Undo/Restore, and Open support personas. | The Assistant can complete the requested work through the app's normal safeguards. |
| No guide explained the persona fields. | Guide distinguishes the user's in-story identity from an Assistant personality, including prompt placement, shared lorebooks, versions and UI-only selection/pictures. | Prevent unsupported or misleading tool operations. |
| Expanded helper read traces could also exceed narrow conversation width. | Message-body columns and trace wrapping stay within the available width. | The new retrieval feature must preserve the same layout guarantee. |

Persona writes preserve existing import data, unmentioned placement properties, unchanged versions, version ids and pictures. Version updates accept add/update/remove or list upserts. Unknown properties and malformed versions fail before a write/approval card. Existing approval stale checks and default/in-use persona Trash safeguards apply. Creating a persona does not select it as the default or change a story. No automatic rewrite of existing library data occurs.

Files: `packages/schemas/src/assistant.ts`; `apps/desktop/src/assistant/{guides,tools,assistant.test,persona-tools.test}.ts`; `apps/desktop/src/ui/Assistant.tsx`; `apps/desktop/src/App.tsx`; `apps/desktop/src/styles.css`; `e2e/assistant-{persona,overflow}.e2e.ts`; signed work records. Adding persona to AssistantKind extends result-card validation without changing the Persona domain schema or SQL tables.

Validation: seven persona unit failures and a desktop overflow browser failure reproduced before their fixes. Eight new persona unit cases cover immediate/approved creation, preservation, versions/read, stale approval, drafts, Trash/default safeguards and invalid fields. The two new persona browser cases cover create/Open/editor/Undo/Restore and draft persistence. The two overflow cases cover open fences while streaming, completion, internal horizontal scrolling and visible actions. The optional helper browser case additionally opens a large read trace at 390 px.

Full checks for this follow-up: **605 unit passes, 3 skips**, typecheck and desktop build; affected Assistant/Connections/Customize browser checks are recorded with the helper report. Synthetic in-memory browser/model data only; no personal installation, private chats, keys, native-Tauri run or live provider. Existing lockfile/screenshot changes remain preserved and unattributed. Signed: **CODEX**.

Final browser check: **38 passed** across Assistant, Connections and Customize. Three affected helper/persona cases passed again after the final version-preview/integer-input refinements. Signed: **CODEX**.
