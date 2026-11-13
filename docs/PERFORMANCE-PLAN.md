# Performance plan — a smoother, faster Homunculus

Author: CLAUDE, 2026-11-13. Daniel (translated): "I want a session to make the app much smoother, faster and more professional."
Builds on D-121 (picture previews, only the cards on screen, visible import). Findings below come from reading the code and
measuring the browser build; the desktop app (Tauri) pays more for every database query, because each one is a round
trip from the WebView to the native side, so "many small queries" is the main enemy there.

## How we measure (before and after every step)

- A seeded library: 1000 cards, 200 chats, one chat of 3000 messages with branches (script in `e2e/`, not shipped).
- Numbers: start to first screen, opening Characters, opening the long chat, a reply streaming (frames per second, CPU),
  memory after 5 minutes of use, import of 100 cards. Browser build with Chrome's performance metrics; Windows and Linux
  desktop by hand with the same checklist.
- A step is kept only if it moves a number and changes nothing the user sees (unless it is a UI step with its own draft).

## Priority 1 — big wins, nothing changes on screen

1. **Message paths in one query.** `SqlStore.pathTo` walks up the tree with one query per message; it runs before every
   reply (prompt, notes, lore timers), on edits, and in `refresh()` for every chat just to count messages. A 2000-message
   chat = 2000 round trips each time. Replace with one `WITH RECURSIVE` query (same order, same cycle check).
   `WorldState.resolve` does the same (`parentOf` per message, then 2 queries per message since the last snapshot): read
   the path once and the deltas of those ids in one `IN (…)` query.
2. **Streaming re-renders the whole app.** `App` uses `useTurns()`, so every token re-runs the 2100-line `App` (every page's
   props, the chat lists, the character index) and the Sidebar. `App` and `Sidebar` only need each chat's phase: subscribe
   with a selector that changes on phase, not on text. Only the chat on screen should re-render per token, and only its
   last message: `React.memo` on message rows (none of the UI uses `memo` today).
3. **`refresh()` reloads everything after every action** (38 call sites: renaming a chat reloads characters, personas,
   lorebooks, presets, trash, cues, agents, and runs 3 queries per chat). Split it into small reloads (`reloadChats`,
   `reloadCharacters`, `reloadLibrary(kind)`), and get every chat's last line, last time and message count in 2 queries
   (latest message per session; count from the path query above or a stored count).
4. **Characters list without `original`.** The list reads every card's full JSON, including the untouched imported card
   (often with its embedded lorebook). Read a light list (name, tags, creator, short text, variants, folder, source) and
   the full card where it is edited, exported or played. Care: saving from the editor must never drop `original`.

## Priority 2 — first screen and memory

5. **One 2.6 MB script at start** (750 KB gzipped) holds every page: the Assistant, the Card Browser, editors, CodeMirror,
   comic import. Load big pages when first opened (`React.lazy`), so the app paints sooner and uses less memory if a page
   is never opened.
6. **Start-up work in a row.** `boot()` waits on the installers one by one (starter trackers, agents, cues, narrators,
   presets) — each reads settings first. Run the "once" checks from one settings read, in parallel, and show the window
   as soon as the core is ready; the rest after.
7. **Other long lists draw everything:** the list beside the character editor, Add a Card (Picker), Stories / NPCs /
   Narrators, the Assistant's Add Context grid (up to 300), the Trash. Reuse `VirtualCards` (grids) and a row version for
   lists.
8. **Import in batches.** Each card makes ~6 queries one after another (save, history, picture, lorebook link, folder,
   read back). Fewer round trips per card; the preview made while the next file is read.

## Priority 3 — feels professional (UI, needs drafts first)

9. **Light mode for slow machines / Linux:** no blur behind popovers, fewer arrival cascades, no animations on lists over
   N items; on by itself on Linux (WebKitGTK), a switch in Settings → Customize → Motion.
10. **Instant feedback everywhere:** skeletons instead of empty panes while something loads (opening a long chat, the
    Card Browser, Characters on first start), buttons that show "Saving…", no layout jumps when a picture arrives
    (fixed aspect boxes), optimistic updates for rename / move to folder / Trash.
11. **Long chats:** keep the newest N messages drawn (already in memory v2) for the normal chat too, and keep scrolling
    anchored while a reply streams in.
12. **Workers for heavy work:** lorebook scans on big books, token counting of long prompts, picture previews
    (`OffscreenCanvas` where the WebView has it) off the main thread, so typing never stutters.

## Status

Done in D-122 (2026-11-13): 1, 2 (without `React.memo` on rows: the streaming bubble took the per-token cost), 3, 4 (embedded lorebooks left out of the list), 5 in part (the big settings/editor pages; the Assistant and the Vault still load at start), 7 in part, 8 (no more reading every lorebook per card), 9 (Light effects). Left: 6, the rest of 5, 10–12.

Done in D-123: the rest of 5 (the Assistant and Text Mode load when opened; start script 2.6 → 1.78 MB). 6 dropped on purpose (parallel writes at start risk "database is locked"; tiny gain). 10–12 wait for a draft.

## Order for the session

1 → 2 → 3 (each is small, testable and invisible), then 4, 5, 6. Measure after each. Priority 3 starts with drafts, one at
a time (HANDOFF rule).

## Risks to watch

- Path query: must return exactly what `pathTo` returns today, including the cycle error; unit tests on branched trees.
- Light character list: any screen that writes a character must load the full one first (editor, Assistant changes,
  bundles, story from card). A test that saving from the editor keeps `original`.
- Smaller reloads: a screen that relied on the big refresh to see a change must call the right small one; the click
  suite catches most of these.

## What the other apps do with heavy loads (read 2026-11-13, for ideas — not to copy)

Daniel (translated): "look at how each app is optimized for these heavy loads — SillyTavern, Marinara, Aventuras — to know what you can do".

| Technique | SillyTavern | Marinara Engine | Aventuras | Homunculus 2 |
|---|---|---|---|---|
| Small pictures in lists | thumbnails 96×144 JPEG on disk (`src/endpoints/thumbnails.js`, `image-metadata.js` `thumbnailDimensions`) | avatars are files, served by URL with `Cache-Control: immutable` (`routes/avatars.routes.ts`) | images in the DB | previews 320×480 in the DB (D-121). **Idea:** serve pictures through a Tauri protocol as URLs, so the WebView caches and frees them itself |
| Light character list | `performance.lazyLoadCharacters` → shallow characters (`endpoints/characters.js` `toShallow`) | a cached catalog (search text and token counts worked out once, a generation number to know when it is stale) served in pages of 100 (`services/storage/character-catalog.ts`, `useInfiniteQuery`) | — | light list without embedded books (D-122). **Idea:** keep the catalog's token count and search text instead of working them out per render |
| Long lists on screen | pagination of the character list | pages + `memo` on rows | a window of story entries (`StoryView.svelte`) | `VirtualCards`, `content-visibility` (D-121, D-122) |
| Long chats | "messages to load" + Show more (`showMoreMessages`, `chat_truncation`) | messages by pages with a cursor (`?limit=&before=`) | entries by position; world-state snapshots by position | draw the newest 50 (memory v2); the path in one query (D-122) |
| Streaming | the screen updates on an interval (`StreamingProcessor` + `Stopwatch.tick`) | the stream buffer redraws at most once per frame (`use-throttled-stream-buffer.ts`, `rafThrottle`); `ChatMessage` is `memo` | — | only `StreamingReply` redraws, at most once per frame (`useFrameValue`, D-123) |
| Writes | debounced saves (`debounce_timeout`) | — | many statements in **one IPC call and one transaction** (`src-tauri/src/db_tx.rs` `db_transaction`) | one IPC call per statement. **Idea:** a native batch command for imports and turns (needs Rust) |
| Database | — | — | WAL, busy timeout, `PRAGMA foreign_keys` | WAL and busy timeout come with the SQL plugin (sqlx defaults) |

Next ideas, in order of value: pictures as cached URLs through a Tauri protocol; a native batch/transaction command (imports, the writes of a turn); the catalog's cached token counts and search text.
