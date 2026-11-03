# Assistant large-card reading — 2026-11-03

Author: **CODEX**. Status: **local, uncommitted, unpublished on gpt**.

## Reproduction

Daniel's screenshot shows repeated offset calculations and overlapping reads of a large character description. No private chat/database/provider request was inspected.
The owning code reproduced a compatible failure: toTurns cut old tool results to 400 characters after a new user message, including the middle of a JSON string, discarding its continuation suffix. A resumed model received a broken preview without the source cursor and was told to call the tool again.
Six regression cases failed before the fix, including invalid JSON after Continue, lost page bodies, missing authoritative ranges and nonworking version/lore-entry continuations.

## Correction

- read returns clean source text and a separate _read array for paginated fields: field, offset, end, total, nextOffset, done and next (the exact arguments for the next read). No pagination prose is inserted into the field value.
- Each page is at most 6,000 UTF-16 source units, with surrogate pairs kept together. Source offsets are independent of JSON escapes and preview length; EOF has done=true and no next cursor.
- Main fields and nested paths work as before. A version field can be selected with ["variant:<id or label>", "description"]; a lore entry with ["entry:<id or title>", "content"]. Generated cursors use stable ids. Whole-version/entry reads expose continuations for long fields; entry-list pages retain each entry's cursors.
- Recent distinct read/read_file results before the newest user message are retained in full, up to 24k serialized characters or one third of a known context window (using the app's existing character/token estimate), whichever is smaller. Duplicate read requests keep the latest result.
- Older library read excerpts remain valid JSON and retain root/nested _read metadata. _replay explicitly marks a body preview. File/text excerpts keep the original continuation footer. The model is no longer told to repeat a read merely because its historical body was shortened.
- Legacy saved library results recover ranges from their original inline suffix. Retained legacy pages remove that app-generated suffix from source text and expose the new metadata. Stored chat history is not rewritten and no schema/migration is needed.
- CORE_RULES and the read tool explain copying next exactly, zero-based source units, EOF, source versus preview length, selective reading and completing a field before replacing it. The character's version index does not falsely claim unseen override pages were delivered.

## Validation and limits

- Added **13 unit cases**: exact ranges/clean text, retained pages, old/new excerpts, legacy upgrade, selected variants and entries, nested entry-list cursors, Unicode/JSON escapes, file footers, EOF and a real runAssistant request loop across step-limit continuations. Existing A6 tests now assert the same absolute-offset guarantee using structured ranges.
- A 13,000-character synthetic card is read exactly once in three pages at offsets **0, 6000, 12000**. All page bodies survive two user continuations; the source card is unchanged. Verified both in the engine requests and through the real browser UI with a fake provider.
- npm test: **583 passed, 3 skipped**. Typecheck and desktop Vite build pass (existing bundle-size/mixed-import warnings).
- **13/13 browser cases pass** across assistant-long-read, assistant-history, assistant-field-contract, assistant-tracker-fields and assistant. Existing starter-lyra picker warnings remain outside this fix. git diff --check passes.
- Validation uses synthetic content and in-memory stores. No real provider, native Tauri UI/transport, API keys or personal/portable data was used. Tests establish the app protocol and delivered context, not guaranteed compliance by a live model.

The read budget is bounded: older bodies may be marked as previews, and compacted messages remain compacted. A source larger than the model's context still requires selective reading. The earlier field-contract audit remains delivered and documented separately; no commit/push or change to dev/ui was made. Prior lockfile edits and the already-pending screenshots remain preserved.

Signed: **CODEX**.
