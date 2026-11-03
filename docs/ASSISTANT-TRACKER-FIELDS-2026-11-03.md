# Assistant tracker fields: context and preservation audit

Date: 2026-11-03. Author: **CODEX**. Status: **local, uncommitted, unpublished on gpt**.

## Reported behavior and cause

Daniel's screenshots show Quest instructions placed in "What it means in the story", the filling-instructions text area empty, and presentation left on Auto. He requested context for both text areas and a check of the other tracker functions the Assistant knows.

Two causes were verified in the owning sources:

1. The tracker guide described note but omitted the per-field help property and all presentation/manual-lock/column options.
2. trackerFieldsOf explicitly forced help to an empty string, lockedForAgents to false and fields to an empty list. It discarded display/icon/color and coerced datetime/group to text. trackerView also omitted those properties, so a read/edit could lose them even when they had been set manually.

The generic importer/store and TrackerEditor were not responsible: they already support these properties.

## Complete tracker field check

Compared the Assistant guide and tools with packages/schemas/src/trackers.ts, packages/core/src/trackers.ts, apps/desktop/src/trackers.ts, TrackerEditor.tsx, kit.tsx and ScenePanel.tsx.

| Option | Actual meaning / resulting support |
| --- | --- |
| field help | Tracker AI instructions: what to extract/write, format/unit, when to update or leave empty. Also the field tooltip. Preserved on create, approval, read and change. |
| field note | Optional story interpretation/consequences, sent under current scene values when included; also tracker context. Separate from filling instructions. |
| top-level help | Short tracker description for the user, distinct from per-field help. |
| type/options/min/max | Five editor types; status requires choices, numeric bounds retained, meter defaults 0–100. Legacy datetime/group remain intact. |
| scope/characters | Global, per-character and directional per-pair values; cast/castAndUser/anyone explained. |
| display | All schema choices documented. Global: Auto/Top strip/Row. Character/pair: Auto/Row/Tile/Right now/Highlight/Under the name/Lead/Note. Appropriate explicit choices requested for new fields, existing choices retained. |
| icon/color | Actual built-in icon names and optional label colour described and retained. |
| required | Always filled once applicable; not permission to invent an inapplicable value. |
| lockedForAgents | User edits only; the tracker AI reads but cannot change the value. Retained. |
| toPrompt | Inclusion of value/note in story replies; independent of tracker maintenance and manual lock. |
| section/order | UI group and array ordering, separate from group-valued legacy fields. |
| nested fields | List columns keep their keys, types, hints, status choices and bounds; normalization follows the existing editor rules. |
| key | Stable saved-value identity. Existing keys remain; new field/column keys use the editor's fieldKeyFrom helper with collision avoidance. Duplicate supplied keys are refused. |
| presence | Default-set Who is in the scene configuration supported for create/read/change; must reference a per-character status and one of its options. null disables it. Brief away-character behavior explained, including section/subtitle/text-lead filtering. |
| field sets | Tools operate on the default field set. Other set names are informational and their data is preserved. UI-only copying/importing/default selection/session selection is explicitly identified; the Assistant must not claim to perform these through tools. |

## Implementation and behavior

- CORE_RULES carries the help/note distinction and asks for scope-appropriate display choices, including in existing chats with old guide results.
- GUIDES.tracker contains the exact editor labels, a Quest example split between help/note, all options and tool boundaries.
- The recursive field mapper uses TrackerField validation, preserving every schema property rather than rebuilding a subset. Invalid type/display/scope combinations, malformed columns, invalid character selection/presence and duplicate keys are refused instead of silently falling back.
- read exposes the complete default-set field definition. Empty defaults can still be omitted by the existing compact read formatter and are restored by the schema.
- Changes to fields remain a complete replacement list. The guide requires reading first, keeping unchanged fields/options/columns and stable keys. Concurrent manual changes to help now participate in stale detection.
- Presence validation occurs before writes. The existing portable save remaps/normalizes data as before. No schema, SQL-table, dependency, core runtime or editor-layout change.

Auto remains a valid choice. The guide teaches the Assistant how to choose a display; the application now retains that choice. Existing trackers are not automatically rewritten or heuristically repaired.

## Validation

- Four initial regressions failed before the help/note correction. Three additional cases failed before the full presentation/options correction.
- Added **16 unit cases** covering immediate creation and approval, complete create/read/change round-trip, every field type/display, optional presence/clearing, stable generated nested keys, collisions, invalid options, preservation of nondefault sets and concurrent help-only edits. Guide assertions cover every actual schema field/type/display and the example in the model request.
- An intermediate recursive mapping rejected temporary keys in new list columns. The browser case exposed it; permanent keys now use the existing editor helper before recursive validation, with a dedicated unit regression for missing keys/collisions.
- npm test: **545 passed, 3 skipped**. npm run typecheck: pass.
- npm run build -w @homunculus/desktop: pass (existing large-chunk and mixed-import warnings).
- Browser: **4/4 pass** — new Assistant → tracker editor case plus all three assistant.e2e.ts flows. The new case verifies distinct hint/note, Quest Row and scroll icon, Time Top strip, Mood Highlight, Health Tile and nested inventory columns. All tool calls/model output are synthetic, using an in-memory preview database.
- The existing Assistant picker flow still emits starter-lyra duplicate-key warnings; no picker changes were made in this follow-up.
- git diff --check: pass.

No real provider, API credentials, personal/portable data, native Tauri UI or native transport was used. These tests verify the context sent and preservation/application of valid tool data; they do not establish that a particular live model always follows the guide.

Files and validation are recorded in REGISTRO-CODEX.md. Prior local UX/DataCat changes, the original lockfile edits and the seven already-pending generated screenshots are preserved.

Signed: **CODEX**.
