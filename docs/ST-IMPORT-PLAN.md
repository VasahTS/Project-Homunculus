# Complete SillyTavern importer + external card source — plan

Author: CLAUDE, 2026-11-13. Daniel (translated): "the complete SillyTavern importer, as planned before, and an external card
source" — for a friend: "allow an external card source, so I can link my ST lib, I have an external card management thing".
Builds on BLUEPRINT ("Import the whole SillyTavern/Homunculus v1 folder at once … with a report of what came in and what did
not") and D-125 (writes in one go). **Text plan first; a draft with real data after Daniel's answers; code after the draft.**

## Part 1 — Import a whole SillyTavern folder

### What already exists (one file at a time)

| SillyTavern | Homunculus today | Module |
|---|---|---|
| `characters/*.png` / `.json` cards (embedded book, world link, card regex) | Library → Characters → Import | `st-cards`, `importCharacters.ts` |
| `worlds/*.json` | Library → Lorebooks → Import (links cards / personas that name it) | `st-lorebooks` |
| `settings.json` personas + `User Avatars/` | Library → Personas → Import | `st-personas` |
| `OpenAI Settings/*.json` (Chat Completion presets, their regex) | Library → Presets → Import | `st-presets` |
| global regex (`settings.json` → `extension_settings.regex`) | Library → Regex → Import | `st-regex` |
| `QuickReplies/*.json` | Quick Replies → Import | `core/quick-replies.ts` |

### What is missing

1. **Chats** (`chats/<card file name>/*.jsonl`): header line (`user_name`, `character_name`, `chat_metadata`), then one line
   per message (`name`, `is_user`, `is_system`, `send_date`, `mes`, `swipes`, `swipe_id`, `extra.reasoning`, `extra.model`…).
   - Messages → the chat tree. **Swipes → sibling replies** (the chosen `swipe_id` on the path shown).
   - `is_system` (hidden in ST) → hidden from the AI.
   - ST **branches and checkpoints** are separate files (`chat_metadata.main_chat`): merged into the main chat's tree as
     **branches** (the shared start is matched by date + text), so one story stays one chat.
   - `chat_metadata`: Author's Note (`note_prompt`, depth, interval, position, role) → the chat's Author's Note; chat lorebook
     (`world_info`) → the chat's lorebooks; locked persona (`persona`) → the chat's persona; variables kept in `original`.
   - Each chat is **one batch** (D-125): a 5,000-message chat is one trip to the database, not 5,000.
2. **Group chats** (`groups/*.json` + `group chats/*.jsonl`): members (by card file name), disabled members (→ muted), the
   group's chats. A message's speaker is found by `original_avatar`, else by name.
3. **Tags** (`settings.json` → `tags`, `tag_map`): card tags only (Daniel, 11/13: no folders from tags).
   Favorites (`fav`) → pinned/favorite if the app has it, else a "Favorite" tag.
4. **Links between things**: global lorebooks (`world_info.globalSelect`), extra books per card (`world_info.charLore`),
   the preset that was in use (named in the report).
5. **The whole folder in one go**, with a report.

### Not imported (said in the report, with the reason)

- `secrets.json` (API keys) — **never read**. Connections are set up in Homunculus.
- Text Completion settings (`TextGen Settings/`, `instruct/`, `context/`, `sysprompt/`) — Homunculus uses Chat Completion
  only; the report says how many were skipped.
- Backgrounds, themes, `thumbnails/`, extensions, vectors, `stats.json`.
- Character sprites/expressions (`characters/<name>/`) — later, maybe into the Gallery.
- Homunculus v1 (the ST fork) agent settings — the rest of a v1 folder imports like SillyTavern.

### The flow (to be drawn in the draft)

1. **Where:** Settings → Library → *Import from SillyTavern*; also the empty Characters page and the Home.
2. **Pick the folder:** the SillyTavern folder (or `data/default-user`); several users → choose one.
3. **What was found:** counts per kind ("812 cards · 1,204 chats · 41 lorebooks · 12 personas · 9 presets · 37 regex ·
   4 Quick Reply sets · 230 tags"), a switch per kind, chats by character (all, or pick), what will be skipped and why.
4. **Importing:** a progress bar at the bottom (like card import, D-121); the app stays usable; it can be paused/cancelled
   (what came in stays).
5. **Report:** what came in per kind (each opens the place), what didn't and why, warnings; **Undo this import** (everything
   it created goes to the Trash).

### Importing again

Each item remembers where it came from (`source: { site: "sillytavern", id: <file name> }` for cards; the chat's file name
for chats). A second import **skips what already came in unchanged** and lists what changed in ST since, to bring in as an
update (cards: a new version in History; chats: the new messages added).

### Reading the folder (native)

- The folder is picked with the system's folder dialog (new: `tauri-plugin-dialog`). The window can then list and read
  files **only inside folders the user picked** (`st_scan`, `st_read`): a page can never ask for another path.
- Only the folders that matter are listed (characters, chats, groups, group chats, worlds, User Avatars, OpenAI Settings,
  QuickReplies, settings.json); backgrounds etc. are never walked.
- Browser preview / click tests: the folder comes from `<input webkitdirectory>` (as Import From a Comic does).

## Part 2 — External card source (a linked folder)

**What it is:** a folder of cards outside Homunculus (SillyTavern's `characters/`, or the folder a card manager keeps) that
Homunculus **reads but never writes**. Cards added to the folder appear by themselves; changed files update the card.

- **Link:** Settings → Library → Linked Folders → *Link a Folder…* (system dialog). Several folders allowed.
- **Finding changes:** at start, when the window comes back to the front, and with *Check Now*: the folder is listed with
  size + date; only new or changed files are read (fast with thousands of cards). Later maybe a live watch.
- **Missing file:** the card stays (its chats keep working) with a "file missing" mark; *Remove* or *Keep as my own card*.
- **Unlink:** the cards stay as normal cards, or go to the Trash (asked).
- **Safety:** native commands read only the linked folders; the list of linked folders is kept by the native side.

### Daniel's answers (2026-11-13)

1. Linked cards appear **in Characters** with the others: a link mark and a folder named after the linked folder.
2. Editing a linked card is **saved only in Homunculus**; the file is never touched. If the file changes later, the app
   asks which version to keep.
3. A SillyTavern group becomes **a Story with that cast**; the group's chats are the story's chats.
4. ST tags become **tags only** (no folders made from tags).

## Order of work

1. Native folder access (dialog + scoped list/read) and the scan (what was found) — no screens yet.
2. Chat import (jsonl → tree with swipes, branches merged, chat metadata), tested on real ST chats; group chats.
3. The whole-folder run: order (tags → lorebooks → personas → presets → regex → QR → cards → links → chats), batches,
   progress, report data, undo, re-import.
4. Draft of the screens (pick → found → progress → report; Linked Folders) with real data; then the screens.
5. Linked folders.
