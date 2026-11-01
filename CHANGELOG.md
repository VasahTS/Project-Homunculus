# Changelog

What changed in each version. A version's section becomes the text of its download page and the "What's New"
inside the app, so write it for the people who use the app, not for programmers. New version: add `## X.Y.Z` at the top before publishing.

## 0.2.0 — 2026-11-01

### New

- **Library Assistant:** a separate workspace to draft and revise characters, lorebooks, trackers, Kits and narrators. Add library context, files or images; choose an assistant, preset and model; review proposed changes and undo creations. Draft mode keeps new content out of your library until you save it.
- **Assistant web search:** search DuckDuckGo and read public pages in the desktop app, with a per-chat Web switch, visible search steps and sources below replies. Searches are paced and cached; roleplay chats do not use web search.
- **Assistant organization:** create folders, move items with Undo/Redo, and add character versions. Details shows context, files, tool activity and usage; chat compaction helps manage longer conversations.
- **Agents:** configurable helpers before, alongside and after replies, including notes, choices, rewrites and structured views. Inspect requests and raw answers, compare rewrites word by word, choose a model per agent, and preview a draft with **Try it** without changing your chat.
- **Simple memory:** summarize older messages into chapters, edit the title and summary, and choose which chapters go into the prompt.
- **Regex scripts:** import SillyTavern scripts and manage global, preset and character scripts for display or prompts. Review newly imported scripts, switch them per chat, and keep the original text available.
- **Message formatting:** Markdown, dialogue and text colors, Copy on code blocks, links in the system browser, and a choice of when remote pictures load.
- **Character's Note:** edit the note, depth and role directly, including separate values for character versions and SillyTavern import/export.

### Improved

- **Collections and navigation:** portrait cards in S/M/L, Folders and Everything views, folder-aware search, grouped Library tabs and **Ctrl+K** to open items or sections.
- **Stories and Scene:** clearer narrator and prompt setup, reusable tracker field sets, per-card **Track in Scene**, brief sheets for people offscreen, and removal of tracker values that no longer apply. A story keeps its own version of lorebooks changed by its agents.
- **Everyday controls:** move several cards between folders, undo a move, stop a reply from the sidebar, and see when a reply finishes in another chat.

### Fixed

- Memory summaries no longer overwrite newer edits or accept stale and overlapping results. Editing source messages switches affected chapters off so corrected text returns to the prompt.
- Agent drafts survive failed saves; cancelled previews discard late answers. Compare and Try it respect explicitly selected models, and before/parallel notes report their results reliably.
- Regex edits preserve their true originals, including after undo.
- Assistant imports wait for approval; Stop prevents further calls and writes while retaining completed work. Stale Kit proposals are rejected, and switching chats during a reply keeps the selected conversation on screen.
- Assistant history preserves result-card decisions, guides can be reread after compaction, and long reads keep accurate offsets.
- The first native web request initializes its TLS provider without requiring an updater check first.

Windows and Linux downloads are available below. Install the new version over the previous one; existing chats, characters and settings are kept.

## 0.1.0 — first version for testing

- **1:1 chats** with characters: import SillyTavern cards (PNG or JSON), make versions of a character, swap replies (swipes) and start branches from any message.
- **Stories**: stories told by a narrator, with NPCs, a scenario and openings. Save a story as a **Kit** to start others like it.
- **Trackers**: after each reply, the **Scene** panel updates itself (who is in the scene, where, when, mood, goals) and shows what changed.
- **Library**: personas, presets, lorebooks (SillyTavern-compatible) and folders everywhere.
- **Chats**: search by name and by content; export as SillyTavern (JSONL), Markdown or text.
- **Windows and Linux**: a Windows installer, a Linux AppImage and a Debian `.deb`.
- **Automatic updates**: when a new version is out, a quiet bar offers **Update & Restart**. Nothing is installed until you click, and your chats and characters stay.
