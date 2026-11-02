# UX review of the whole app — CLAUDE, 2026-11-02

Daniel asked for it with the Flint-style Assistant changes (D-077): "aproveite a análise a ux geral do app".
Method: the running app (browser preview, demo data) at 1366 × 768: chat with Scene / Prompt / Reply, Stories, Characters, Library (Narrators, Lorebooks, Presets, Trackers, Agents), Settings (Connections, Defaults, Customize), Assistant. **Nothing below is changed yet**; each item says what it would be and why. Ordered by how often Daniel meets the problem.

## Most felt

1. **Two ways to show tabs.** Library uses an underlined row under a big title; Settings uses a segmented box in the toolbar; the inspector uses another segmented box; the character editor has a third style. Same job, four looks. → One tab pattern (the Library's underline row) for pages; segmented boxes only for small choices inside a form (S·M·L, Edit/Preview).
2. **Two kinds of page head.** Stories, Characters and Library have a big title with a line under it; Settings, a chat and editors have a small toolbar title. Moving between them the page jumps. → Every *place* gets the big title (Settings too); only a chat and editors keep the small bar, because their content needs the height.
3. **Big empty "Pick something on the left" panes.** Presets, Trackers, Lorebooks and Stories show a narrow list and a large empty detail with one hint line. With one preset, the user always has to click it. → Open the first (or last used) item at once; when the list is empty, the empty state takes the whole width with its one action ("Import", "New Preset").
4. **The two message boxes differ.** The Assistant now has + · Options · meter · Send and the model under the box; a Play chat has the link icon (Quick Connection) inside the box, a long placeholder ("Enter sends, Shift+Enter makes a new line; empty Enter gets a reply") and "Writing with …" under it. → Same box in both: + (attach / add a card or lore), Options (preset, agents, Author's Note shortcut), the model under the box opening Quick Connection, a short placeholder ("Write your message"); the key hints move to the help.
5. **"?" everywhere.** Settings → Defaults has 10+ help buttons, the sidebar's "Recent" has one, every Customize group has one. They read as noise and are rarely needed. → Keep "?" only where a choice can lose data or costs money; elsewhere the help shows when hovering the label (same text).

## Worth doing

6. **Chat toolbar icons with no words** (✦ agents, trash, inspector). The trash icon sits next to everyday buttons and deletes the chat. → Move "Delete chat" into a ⋯ menu with Rename and Export (as in the Assistant); keep agents and inspector, with tooltips that name them.
7. **Settings → Defaults is one long form** (connections, per-tracker connections, Author's Note, preset, persona). → Group it as cards with a short title each, or split "Defaults for new chats" from "Connections used by agents".
8. **Narrators page:** narrow cards in one column with most of the screen empty. → The same portrait grid as Characters/Kits (S·M·L), grouped by "You play a character / Written together / Director mode" as now.
9. **Inspector Scene tab when no tracker is on:** it shows switches, an edit pencil per tracker and "+ New Tracker" — setup, not a scene. → An empty state ("Follow who is here, where and when") with one button that switches on the starter trackers; the switches move to Options of the chat (item 4).
10. **Status chip "preview · not saved"** sits in the brand row of both sidebars. In the installed app it says "saved on this PC" forever. → Show it only when it matters (the browser preview), or move it to Settings → About.

## Small

11. **Title Case vs sentence case on buttons** ("New Character", "Turn into a Story" vs "Add context…", "Edit colors"). D-018 chose Title Case on buttons; unslop asks for sentence case. → Decide once (Daniel), then one pass.
12. **Sidebar "Recent" shows 3 chats** — fine; but its "?" and the empty space under it make the sidebar look unfinished. → Up to 5–6 recents (fits at 768 px), no "?".
13. **The Assistant's built-in assistants use glyphs as their marks** (✦ ◯ ▤ ❖ ✎). They are data (each assistant's own emoji), so they stayed in D-074. → Give the built-in ones line icons (or their initial) and keep emoji only for assistants the user makes.

## Suggested order

1–4 together as one "consistency" round (tabs, page heads, empty panes, one message box), each with a draft first (rule "draft before code"); then 5–6; the rest when convenient.
