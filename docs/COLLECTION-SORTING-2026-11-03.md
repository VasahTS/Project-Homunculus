# ST-style collection sorting — 2026-11-03

Author: **CODEX**. Local, uncommitted, unpublished on `gpt` in `Project-Homunculus/Homunculus-gpt`.

Daniel requested sorting like the supplied ST screenshot in Library, Characters and Stories. The screenshot supplies the selector's reference; the existing page hierarchy is retained.

## Behavior and data

- Characters exposes A-Z, Z-A, Newest, Oldest, Date added, Favorites, Recent, Most/Least chats, Most/Least tokens and Random. Other categories expose applicable options. Library includes Kits, Narrators, NPCs, Personas, Lorebooks, Presets, Trackers, Agents, Regex and Trash.
- Favorites reads preserved imported ST flags (original.fav, original.extensions.fav, original.data.extensions.fav), accepting true/1/"true" and rejecting "false". No native favorite marking data existed; this selector does not create such a feature.
- Creation order uses native createdAt or the imported source creation date (ISO and ST legacy timestamps). Missing dates fall back to the earliest retained saved-version timestamp; legacy items without history use their existing storage timestamp. Agents/trackers without creation fields use addition order.
- Date added uses existing SQLite row insertion order, preserved by edits/upserts and independent of older source creation dates. Trash uses its existing trashedAt and namespaces identities by kind.
- Recent/Most/Least chats apply to Characters and Stories: active sessions containing the character, or belonging to the story; a character counts once per session. Recent uses its latest message/session time. This is a session count rather than message volume.
- Token sorting estimates prompt-bearing text owned by the item, ignoring original-file metadata; includes nested NPC values and a story/Kit's own narrator. It is not the complete assembled-context size or billing usage. Token estimation runs only for the token sort modes.
- Random uses a saved seed and stable per-id ranks. Searching, selecting, filtering and navigating retain the order; choosing Random again after another mode generates a new seed.
- Existing h2.collectionPrefs gains optional sort/sortSeed values per collection. Folder/view/size preferences and current editor selection are retained. Data arrays are cloned/decorated rather than mutated; measurements are computed once per item per sort.
- Agents retain their table-header sorting as Default order. Regex retains Execution order; A-Z/Z-A/Random affect display only. Editing/deleting/duplicating sorted regex rows maps by id back to original positions. Reorder handles are hidden outside Execution order, and the page explains the distinction.

## Files

- New helpers/control: apps/desktop/src/collection-sort.ts; apps/desktop/src/ui/CollectionOrder.tsx.
- Integration: CollectionTools.tsx, Gallery.tsx, Vault.tsx, LibraryWorkspace.tsx, LibraryPages.tsx, AgentsPage.tsx, RegexScripts.tsx; App.tsx provider; appended styles.css rules.
- Storage: packages/core/src/storage/store.ts adds only collectionSortMetadata, a read-only query with a fixed table allow-list. No SQL migration/entity schema/dependency/lockfile change.
- New tests: apps/desktop/test/collection-sort.test.ts; packages/core/test/collection-sort-metadata.test.ts; e2e/collection-sort.e2e.ts. Signed HANDOFF/CODEX-LOG/REGISTRO-CODEX/CODEX-TASKS notes.

## Verification and limits

- Before implementation: the Characters reproduction failed because the sorting combobox did not exist.
- Twenty focused unit cases cover comparators, stable/non-mutating random order, imported dates/favorites, original regex positions, nested prompt text, Trash identity and stable addition/history metadata. The nested-NPC case reproduced equal estimates before its JSON-text fix.
- Final full suite: 665 passed, 3 skipped. Typecheck and frontend production build passed. Existing Vite chunk-size/mixed-import warnings remain.
- Forty-two browser cases passed across collection-sort, collections, round3, library, agents, regex and agent-reliability. Five new cases cover every Character choice, Stories metrics, category independence/persistence, search/size/view/selection, all Library categories, regex execution protection and 375px controls. The final regex wording case was rerun successfully.
- Desktop/375px captures reviewed. Stable copies are in the chat's visualization output directory: collection-sort-characters.png, collection-sort-stories.png, collection-sort-mobile.png, collection-sort-library.png. Test originals live in ignored e2e/.results.
- Synthetic in-memory preview data only. No personal database, API key, real-provider or native Tauri validation. Historical creation timestamps remain limited to source/native/retained-history evidence; addition order is independently stable.
- Earlier local App.tsx/store.ts/styles.css work, both lockfiles and tracked screenshots are preserved and outside this change. No commit, push, branch merge or publication.

Signed: **CODEX**.
