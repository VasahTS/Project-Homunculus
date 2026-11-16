# Linked folders: read-only, cards come in when used — plan (2026-11-16, CLAUDE)

Daniel (translated): "make the library link read-only and import only what you are going to use, not a mass importer — what do you think?"
Today (D-129) a linked folder is never written to, but **every card in it is copied** into Characters at the first check
(hundreds of cards and pictures duplicated in the database, and "changed in both" questions about cards never played).

**Draft:** `docs/drafts/linked-on-use/index.html` (4 screens; artifact 45D4YWoBruogXkASCx25ho). **Approved and built (D-137)** with Daniel's answers: 1 yes, 2 yes, 3 yes, 4 no.

## The idea

- A linked folder keeps only an **index** in Homunculus: per file its path, size, date, name, creator, tags, a short
  excerpt (for search), a token estimate and a small picture. Nothing else is copied.
- Its cards still show in **Characters**, in the folder named after the linked folder, with a mark: **In folder**
  (not copied) or **In use** (copied). Opening a card **reads the file** for the sheet (description, greetings, lorebook).
- A card **comes in** (becomes a Homunculus card, with its picture and embedded lorebook) the first time it is
  **used**: New Chat, added to a story or a Kit, Edit, an Assistant change, or **Add to Library** on its sheet.
  From then on it is an ordinary linked card, as today: edits stay in Homunculus; when the file changes, an unedited
  card follows it and an edited one asks Keep Mine / Take the File's / Keep Both.
- **Each folder chooses** how it works (Settings → Library → Linked Folders): **Cards come in when used** (new default)
  or **Copy every card** (today's behaviour), so nobody loses what they have.
- Files that disappear: an unused card simply leaves the list; a used card stays ("file missing", as today).
- **Unlink:** nothing to delete for unused cards; used ones stay as your own or go to the Trash (as today).

## What changes where

- `linkedCards.ts`: the check builds the index (reads name/creator/tags/excerpt and a preview from each new or changed
  file) instead of importing; `useLinkedCard(folder, path)` imports one card on demand and links it to its file.
- Index storage: a small table (`linked_cards`: folder, path, size, modified, name, creator, tags, excerpt, tokens,
  character id) instead of the `linkedIndex` app setting, so a folder of thousands of cards stays fast to search and
  page; previews go in the pictures table under `linked:<folder>:<path>`.
- Characters page / sheet / Add a Card / Ctrl+K / Assistant `find`: list index entries next to cards; "use" actions call
  `useLinkedCard` first. The sheet of an unused card is read-only with a line saying where it is read from.
- Migration: folders linked before this keep **Copy every card** (nothing changes until the user switches). Switching
  a folder to **Cards come in when used** offers to remove the copies that were never used (no chats, stories, Kits or
  edits) — they go back to being read from the folder.

## Questions for Daniel

1. Should Characters' count (and the sidebar's) include the cards in linked folders that are not in use? Proposal:
   "666 · 1,204 in linked folders".
2. When switching an existing folder to "when used", remove the unused copies? Proposal: yes, after showing the count.
3. Is exporting a linked card a "use"? Proposal: no — it exports straight from the file.
4. The SillyTavern import stays a one-time move of everything (chats included). Should it also let you pick
   characters one by one? Proposal: later, if wanted.
