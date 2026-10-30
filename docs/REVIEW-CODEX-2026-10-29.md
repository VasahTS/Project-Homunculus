# Functional rounds 4–5: review guide

Implemented by **CODEX** on 2026-10-29, on `dev`, following Daniel's instruction to finish functionality and review on his return. Customize and further visual design remain deferred. Nothing was installed in or read from the private portable play folder. This development checkout already contains the changes.

## Prompt controls

1. Open a chat → **Prompt** → **Preset**. **Save changes to** starts at **Only this chat**.
2. Open **Main Prompt**, edit text, then close the block or leave it. Pending text saves automatically on blur, collapse, scope change or leaving the view; **Apply block** still saves immediately. **Cancel** explicitly discards pending edits. **Preview Prompt** shows the saved change. Another chat keeps the shared text. The full **Edit Preset** editor remains available. This corrects Daniel's close-without-Apply report (D-044).
3. **Use inherited blocks** restores the inherited content/switches/order for this preset. Switching presets keeps their patches separate.
4. On a Story/Kit, **Prompt blocks** defaults to **This story and its chats**. Its chats inherit each field until they change it locally. Story setup uses the existing autosave; chat/shared-preset edits save when applied.
5. Choose **Shared preset** only when intending to edit that reusable resource for all its users. Local patches still take precedence.
6. On a Story or narrated chat, **Narrator in the prompt** offers card/system/chat placement, depth, role and order. **Also in chat** explicitly repeats instructions. Check the narrator source labels in Preview. These settings do not add messages to the conversation. The default card setting preserves prior behavior.

## Tracker field sets

1. **Library → Trackers → a tracker**. **Export Set / Import Sets** are visible beneath the current set's settings. **Copy or move fields** starts closed below them.
2. Select fields and another set, then Copy or Move. A conflicting key cancels the entire operation. Move cannot empty the source; Copy can include all fields. Lists/groups retain their children and display settings.
3. **Undo last reuse action** restores the definitions. Another definition edit or Save removes Undo, so it cannot erase later work. Changing sets closes this tool and clears its temporary selection.
4. **Export Set** always downloads the complete current set, including all fields and nested definitions, description, presentation and presence settings. Select only one field and export to confirm that selection does not affect the file. Unsaved keys are normalized; the tracker itself stays a draft. This replaces the earlier partial/bulk export UI following Daniel's review (D-044). The format remains Homunculus 2, as he requested.
5. **Import Sets** accepts [the travel example](examples/travel-field-sets.json) or an exported file. New sets are appended with fresh IDs. Existing sets/default selection remain intact. An invalid file appends nothing.
6. Review the definitions, then **Save** the tracker. Transfers/imports do not rewrite values in existing chat messages. Inside a tracker, a stable field key continues to identify its value when switching sets.

[File format and instructions for an AI](FIELD-SET-FORMAT.md). This is an import format and guide, not an implemented Library Assistant. Round 6 (extracting NPCs from multi-character cards) remains dependent on that Assistant.

## Verification

- TypeScript check and production UI build passed.
- 213 unit tests passed; 2 existing tests skipped. Includes SQLite setup round-trips, actual recorded generation, inherited/isolated prompt patches, narrator placement, atomic transfer failures and the documented JSON example.
- All 111 browser flows passed after D-044, including close without Apply in local/shared scopes, leaving Prompt, explicit Cancel, scope switching, direct Preview and complete-set export independent of selection. Final screenshots inspected at 1280/620 px; no panel overflow or page errors. Browser data is isolated and seeded, with simulated AI connections.
- Native Tauri rendering and a real AI service still need a separate manual check. No native shell code changed. The build retains its existing large-chunk warning.
- Daniel's pre-existing `package-lock.json` and `apps/desktop/src-tauri/Cargo.lock` changes are preserved and excluded from the feature commit. No release or workflow changes.

Signed: **CODEX**.
