# DataCat missing Description — 2026-11-03

Author: **CODEX**. Status: **local, uncommitted, unpublished on gpt**.

## Reproduction and cause

Daniel reported that most DataCat cards lacked Description in both Card Browser details and imported Characters.
The public example [998c1dae-7801-4cc9-bffd-c8a6d0a53416](https://datacat.run/characters/998c1dae-7801-4cc9-bffd-c8a6d0a53416) reproduced the mismatch:

- The character endpoint's legacy personality field is null.
- Its chara_card_v2_json.data.description contains 3,705 characters.
- The adapter read only legacy personality for the model's Description in both details and download. The UI correctly omitted the resulting empty field; the shared importer correctly saved the empty value it received.

The top-level description is the public biography/creator notes, not the model definition. Substituting it would import the wrong content.
This establishes the reported example and a format-specific bug; the proportion of all DataCat cards affected was not measured.

## Change

packages/card-browser/src/sources/datacat.ts now builds one V2 definition for preview and download.
It reads the embedded card as an object or JSON string, preferring its Description and preserving canonical personality, scenario, greetings, examples, notes, prompts, creator/version, extensions and embedded lorebook.
Missing/invalid fields retain their legacy fallback; an empty canonical Description may use legacy personality. Other explicitly empty canonical text fields remain empty.
Malformed embedded cards fall back without breaking older records. Creator download-disable/deletion checks still run before importing or requesting an avatar.
Only standard card data and the existing DataCat source id are copied. Captured request payloads, chat messages and account configuration are not imported.

No UI, schema, SQL-table, dependency or native-transport change was needed. Prior UX implementation and pre-existing local edits are preserved.

## Validation

- Added synthetic unit regressions before changing production code: four cases failed on the old adapter, including null legacy personality with a populated V2 Description.
- Adapter tests cover object/JSON-string cards, canonical precedence, empty/partial/malformed definitions, companion fields, extensions/lorebook, and all four creator-control flags. Card Browser package: 37 tests pass.
- Import integration exercises source download → shared importer → test store → PNG export/import. Description, separate personality, greetings and embedded lorebook survive; unrelated payloads are excluded.
- npm run typecheck passes. npm test: **529 passed, 3 skipped**.
- npm run build -w @homunculus/desktop passes with existing large-chunk/mixed-import warnings.
- Browser preview: **10 existing Card Browser cases pass** and **1 new DataCat flow passes**. The new flow checks the visible Description, adding into Characters, the full editor value and reopening. Fixtures are synthetic and network-free. Initial test navigation assumed Open immediately after Add and an expanded import folder; the final test follows the existing Characters search flow. No production UI changes were made for those test assumptions.
- Live, read-only verification fetched Daniel's public example through an anonymous DataCat session. The actual adapter, JSON importer and PNG round-trip each preserved all **3,705 characters**. Definitions stayed in memory; only field shapes/counts and booleans were recorded. Evidence: docs/evidence/datacat-description-2026-11-03.json.
- git diff --check passes.

Live verification used Node fetch as SiteTransport and the actual TypeScript modules. It did not exercise native Tauri transport/UI, avatar download, a real AI provider, or personal data.

## Earlier imports

The fix applies when loading card details and to new imports/PNG saves. Existing Characters are not overwritten.
Use More → Add Again on a previously imported incomplete card to create a corrected copy, then review it before removing the old copy.

Signed: **CODEX**.
