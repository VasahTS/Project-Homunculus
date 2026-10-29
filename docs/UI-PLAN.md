# UI-PLAN — Homunculus 2

The screens' plan **before** any draft or code (rule agreed with Daniel on 10/28, see HANDOFF "🔒 NEW UI RULE").
One section per panel. Daniel approves the text → drafts with real data → code equal to the approved draft → one panel at a time.
Already done under this rule: the **Scene** panel ("C — Quiet", D-025) and the **tracker editor** ("B", D-026). The other panels (sidebar, chat, Prompt, Reply, Library, Settings) get their section when their turn comes.

---

## Branches — CLAUDE, 10/29/2026 · ✅ approved and done in the app (D-032)
**Done (10/29, 07h):** the same as the canvas "Homunculus 2 — Branches" (details in HANDOFF and in D-032). Small differences: the list has no search magnifier yet; the action bar shows on hover (on the last message it is always shown); on the user's messages the bar sits under the bubble.
**Daniel's answers (06:39):** marker on the message: yes · delete = **for good** (no Trash) · **tree now** · the swipe question was explained again · reference: Marinara's message action bar. Drafts on the canvas **"Homunculus 2 — Branches"**: (1) **Main** — action bar on the message (‹ 2/3 ›, Copy, Edit, New Version, **Branch from here**, Hide from the AI, Details | Delete), marker "The story splits here · 2 branches ▸", selector "⑂ Main ▾" with the list (current first; name, last line, number of messages, when, where it came from; rename, delete; Show Tree, Make a Separate Chat); (2) **Tree** — the whole chat as a tree, the path on screen in green, "Every message | Only where it splits", on the right the chosen message with Go Here / Branch from here; (3) **Actions** — the small Branch from here form, delete for good (the branch on screen cannot be deleted), and where it shows (sidebar "⑂ 3", chat card "3 branches", the open marker). Marinara's translation and search stay out for now (they do not exist in the app).
**What it is for:** trying another path in a conversation without losing the original, and going back to any path later. **When Daniel looks at it:** when a reply took the story somewhere he wants to try differently; when he wants to keep "the good ending" and "the bad ending".

### How the others do it (code read)
- **SillyTavern** (`public/scripts/bookmarks.js`): **Branch** on a message button = a **new chat**, a copy up to that message (even from a chosen swipe), called "<chat> - Branch #N"; the original message keeps the list of branches (icon). **Checkpoint** = a branch with a name you give, with a link icon on the message and "Back to main chat". The tree only shows with the (third-party) Timelines extension.
- **Marinara** (`docs/chats/branches.md`, `chats.routes.ts` `POST /:id/branch`): **Branch from here** on any message copies the chat up to there (with swipes, tracker state and memory). In the chat list, a chat's branches are **a single row** with the count; in Chat Settings → **Chat Branches**: a list (current first, name and when it changed), rename, delete, delete all, export (ST JSONL, text, Markdown), import a JSONL as a new branch.
- **Aventuras:** branches tied to checkpoints, without a real list (Daniel finds it limited).

### Proposal for Homunculus 2
Our chat is already a **tree** (swipes and paths are siblings) and the **world state is tied to each message**, so creating a branch **copies nothing** and each path's trackers are already right.
- **On the message:** a **Branch from here** button (fork icon, in the message menu). Creates a named branch ("Branch 2", editable right away) whose tip is that message, and the screen switches to it. You keep writing from there.
- **Sign on the message:** where the story splits, a small "⑂ 2 branches" marker shows (like ST's icon); clicking it shows the paths that leave from there.
- **Selector at the top of the chat** (beside the name): "⑂ Main ▾" shows the **Branches** list — the current one first, each with name, last line, number of messages and when it changed; clicking switches. Right there: rename, delete (only the messages that belong only to that path; asks for confirmation), "Make a Separate Chat" (a copy like ST/Marinara, for whoever wants the path in a separate chat).
- **Sidebar:** a chat stays **one row** (like Marinara); if it has branches, it shows "⑂ 3".
- **Swipe × branch:** a swipe stays "another version of this reply" (‹ 1/3 ›). Continuing from an old swipe **already** creates a new path today; with this it gets an automatic name and shows in the list.
- **Story:** the chat's card on the Story page shows "⑂ N branches".
- **Tree (later, if wanted):** a tree view of the whole chat, like ST's Timelines extension.
- **Import/Export:** export the current branch as ST JSONL; import an ST JSONL as a new branch (Marinara does it; our ST chat import does not exist yet).

### States
Chat without branches: nothing shows besides the button on the message. 10+ branches: the list scrolls and has search. A deleted branch: do its messages go to the Trash too? (question 3).

### Open questions for Daniel
1. Do you want the "⑂ N" marker **on the message** where the story splits, or only the list on top?
2. Should continuing from an old swipe become a named branch by itself, or only when you click "Branch from here"?
3. Deleting a branch: does it go to the Trash (can come back) or is it deleted for good?
4. Does the tree view come now or later?

---

## Stories v4 — CLAUDE, 10/29/2026 · 🟡 draft, waiting for Daniel
**Update 05:55 (Daniel): keep several chats inside the Story.** The Story is the template (its own setup); each chat inherits and can change something just for itself ("changed in this chat" / "Use the story's"). New drafts on the canvas **"Homunculus 2 — Stories"**: Main (the Story page with the Chats section as cards, Continue + New Chat), StoryNew, NewChat (opening, name, "Same as the story" / "Change for this chat…"), ChatInStory (Prompt tab showing "from the story" and "changed in this chat"). The text below (V1–V3, "one Story = one playthrough") is superseded on the sessions point; the rest (override-only setup, trackers and agents at creation) still applies.
Why: slice 4 in the app turned out different from the approved draft (no Setup on the page, creation without trackers, Sessions in a confusing column) and Daniel decided **Story = one playthrough** (like Aventuras). Drafts: canvas "Homunculus 2 — UI mockups", row "Stories v4" (StoryNew, StoryPage, StoryPlaying).

### V1. New story (a sheet over the app)
- **What it is for:** creating a Story ready to play, with its setup. **When:** "+" in Stories or "Turn into a Story" on a card.
- **Primary:** "How do you want to play?" (3 cards) and "Start from" (card / empty / Assistant "Later"). **Secondary (right column):** This story's setup (Preset, Connection, Agents connection, You play as), Trackers (tick + field set), Agents.
- Each setup row shows **"Default · <value>"** until it is changed (from Aventuras: "override-only"); "×" goes back to the Default.
- States: no cards → "Start from" only has "Empty story"; no trackers → "No trackers yet · Library → Trackers"; no agents → a short text (always, today).
- Footer: Ready to play (Narrator, Opening, Connection, N trackers) · Cancel · Create Story.

### V2. Story page (before playing)
- Bar: name · Duplicate · More… · **Start Story**. Header: cover, name (Literata), short scenario, "Not started · Made from your card…".
- Left: **Cast** (Narrator + Change…, NPCs + New NPC / From the Vault, Characters + Add a Card), **How it starts** (Scenario, Opening 1–4 + "+").
- Right: **How you play** (Player / Co-author / Director), **Setup**, **Trackers**, **Agents**, **Lore**.
- **No Sessions.** Saves by itself (as today).

### V3. The same page with the Story in progress
- The main button becomes **Continue**; status "In progress · N messages · last played …" + last line; "Changes here apply from the next reply"; the openings say they were already used.
- **Duplicate** = another Story with the same setup and start, without messages.
- Sidebar: one row per Story with the last line; clicking opens the conversation; in the conversation, the Story's title opens this page.

### From Aventuras / Marinara (code read)
- Aventuras `Story.settings` (`src/lib/types/index.ts`), `SetupWizard.svelte`, docs `story-settings.md` (override-only), `story-list.md`.
- Marinara `ChatSetupWizard.tsx` (`ROLEPLAY_STEPS`, `renderAgents` by category), `types/chat-preset.ts` (settings profiles = Kits).
- Different: a single sheet instead of 5–9 steps (the approved draft was one sheet); trackers and agents already at creation.

### Open questions
1. Are the drafts right? (main one)
2. Old data: does Isekai RPG's session 2 become "Isekai RPG (2)"? (proposal)
3. In a Story's conversation, do the trackers and the setup also show in the inspector's Prompt tab (like in a chat) or only on the Story page?

---

## Stories and Vault (slice 4) — CLAUDE, 10/29/2026 · ✅ **in the app on 10/29 (D-029)**
**What went into the code (10/29, morning):** sidebar = search, **Library** and **Vault** (destinations), **Stories** and **Chats** with the last line; Library and Vault with **tabs** on top; Library → Characters = **grid of cards + sheet beside it** (Chat Now / Edit / Turn into a Story / Export; Edit opens the usual editor); Vault → Stories / Narrators / NPCs in the same format (Narrator and NPC: the sheet is already the editor, with Save); **Story page** (How you play: Player / Co-author / Director · Narrator: from the Vault, a card or written for it + "Save to the Vault" · People: NPCs with an editor in place, "+ Add an NPC from the Vault", "+ Add a card", "Make a Copy" · How it starts: Scenario + openings · Lore · About · Sessions on the right; saves by itself) and **Play** (picks the opening when there is more than one); **New story** = "How do you want to play?" (Narrated adventure / Write it together / **Director mode**) + "Turn a card into a story"; 1:1 chat → "Who is in this story" gained **NPCs in this chat**; a Story session has "‹ <Story>" to go back. **Left out (on purpose, no bloat):** Kits, "Turn into an NPC" on Play (needs the AI to fill the sheet), "When and where it starts", the Vault Assistant (slice 6b), folders/tags in the Vault, NPC portrait.
Drafts: canvas "Homunculus 2 — Campanhas e camadas", page "Stories e Vault". Daniel's decisions in HANDOFF (10/29, 03:00).

### S1. Sidebar
- **Chats** (1:1, as today) · **Stories** (shortcuts to the folders; each with its sessions) · **Library** (+ **Vault**, + **Kits**). Two levels at most.

### S2. Vault (three columns + assistant)
- **Folders (left):** search; "All NPCs", "All Worlds", "Not in a story" (loose); then one folder per Story (one level only; tags group them). "+ New Story".
- **Open folder (middle):** header with the name (reading font), where it came from, **Assistant**, **Play**, "…" (Rename, Tags, Duplicate, Export, Move to Trash). Parts: **Narrator**, **World** (text + initial state with the Scene: World fields, empty ones dashed), **NPCs** (grid of cards: portrait, name, "race, class, level", one line), **Lore**, **Characters** (cards), **Start** (openings, who starts in the scene), **Setup** (summary + "Apply a Kit…"), **Sessions**.
- Clicking an item opens the editor in place, with "‹ folder" to go back.
- **States:** an empty folder → each part with a short invitation ("People who live in this story…") and "Ask the Assistant"; full → NPCs in a grid with search; new items from the assistant with a dashed border + "New".

### S3. Vault Assistant
- A panel on the right, "Working in: <folder>", its own connection. Creates **proposals** (nothing saved): Keep/Discard per item, Keep All/Discard All on top; next-step suggestions as buttons.

### S4. NPC sheet
- Portrait (click to set a picture), name, a "race, class, level" line, where it lives and where else it is used ("edits here reach both"), "Fields" (the Scene: Characters set), **Make a Copy for This Story**, History, Move to Trash.
- The set's sections (About, Fantasy, Appearance, Stats); click a value to edit; Health/Mana as bars; empty ones in grey. "Now" fields do not live on the sheet.

### S5. Play
- Name (suggests "<Story>, session N"), how it starts (an opening × continue from the end of a session), who is in the 1st scene (NPCs and cards), and for each card **Use the card as it is / Turn into an NPC** (+ connection), persona, **Start Session**.

### S6. 1:1 chat with NPCs
- Scene tab → "In the room": the card + NPCs ("Card"/"NPC", from which folder), "+ NPC from Vault" (search, grouped by folder, "Already here"), "+ New NPC…".

### Round 3 (10/29, approved for drafting): canvas page "Stories (v3)"
- **S2 changes:** opening a Story shows the page in the style of the 1st draft (Cast with Narrator/NPCs/Characters, Sessions, How it starts, Lore, Setup with "Your role"). "World" goes away: Scenario (premise) + "When and where it starts" (optional) stay in How it starts; lore only in the lorebook.
- **S7. New story:** "How do you want to play?" (Narrated adventure / Write it together / Quick test; Assistant; Turn a card into a story; Start from scratch) + Ready to play. Inspired by `renderGuide()`/`readyChecks()` in `classic-group-studio.js`.
- **S8. Narrators in the Vault:** list + sheet (Instructions, Style: POV/Tense/Length/Tone, May bring in new NPCs, Turn instruction and "What the AI gets" folded; Duplicate, History, Restore Original on the Simple Narrator). From v1: a "card" or "builtin" narrator in `classic-group-campaign.js` (`narrator.type`, `style`, `turnPrompt`).
- **S9. Picking a narrator:** from the Vault / one of your cards / write one just for this Story.
- Vault = Stories, Narrators, NPCs. Library = Characters, Personas, Presets, Lorebooks, Trackers, Kits. A reusable Scenario: later (for now "Duplicate Story").

### From v1 / Aventuras
- v1: Group Studio (`classic-group-studio.js`), narrator and sheets (`classic-group-campaign.js`), "How the story starts" (`classic-group-start.js`), Vault (`classic-vault.js`).
- Aventuras: Vault + VaultAssistant (`ai/vault/InteractiveVaultService.ts`, "effective vault" = saved + pending).
- Different: everything of a Story in one folder; an NPC is a sheet with the tracker's fields (the Scene already knows how to show and update them).

### Open questions
1. Value origin: A (labels) or B (ladder)? (old canvas page)
2. "Turn into a Story" on Isekai RPG: do the 4 old chats stay as chats (proposal) or become the Story's sessions?
3. NPC portrait: only a picture you set, or can the assistant suggest one (media slice, later)?

---

## Lorebooks (slice 3) — CLAUDE, 10/28/2026 · ✅ **done on 10/29 (D-028)**: Daniel picked draft **A** and asked for a smaller "Where it goes" (it became a choice button on one line)

**Later adjustments, at Daniel's request (10/29, D-028):** "Where it goes" with 5 kinds with a drawing and color + Before/After (draft "LorePlaceKinds" B); closed rows without keywords; shortcuts on the closed row (a quick place menu, with "N back / As" for the chat; a discreet Always on button); saves by itself (no Save button or warning); a **Global Lorebooks** strip at the top of the page (like ST's "Active World(s) for all chats"); a "‹ session" button to go back when the book was opened from the session; **Find and Replace** (Ctrl+H, like Notepad++). Fixes: flash when closing an entry, cursor jumping to the end / Ctrl+Z.

The engine already works (D-027): it activates entries exactly like SillyTavern (compared with ST's own code over 3,200 random turns), imports/exports ST files and the lorebooks embedded in cards. **The screen is missing.** There are five places; the main one is the editor (L1).

### L1. Library → Lorebooks (list + book editor)
- **What it is for:** creating, importing and editing lorebooks; seeing where each came from and who uses it.
- **When Daniel looks at it:** when importing from ST, when writing new lore, and when an entry "did not go in" and he wants to know why.
- **Shape:** the same as the other Library pages (list on the left, editor on the right; `LibraryPages.tsx`).

**List (left)**
- Primary: the book's name, number of entries.
- Secondary: where it came from ("from Mira's card", "ST file") and who uses it ("Mira · 2 sessions · Default").
- Buttons on top: **+ New Lorebook**, **Import** (several files at once; ST JSON or a JSON card), search.

**Book editor (right)**, top to bottom:
1. **Header:** name (click to rename), short description, "Used by…" (characters, personas, sessions, Default — clickable), buttons **Export for SillyTavern**, **Duplicate**, **Move to Trash**, **History**.
2. **Entry list bar:** search (title, keywords and text), filter (All / On / Always on / With conditions), sort (like ST / by order / A–Z), **+ New Entry**, and **"Try it"** (see L1b).
3. **Entry list** — each entry is a card that opens and closes (like the fields in tracker editor "B"):
   - **Closed** (primary, a single line): on/off switch · title (or the 1st keyword) · keywords as labels (or "Always on") · where it goes in a few words ("Before the character", "In the chat · 4 back · as User", "Examples (top)", "Outlet: secrets") · size in tokens. Small labels only when they exist: `75%`, `sticky 3`, `cooldown 5`, `group: places`, `only Lyra`, `⚑ conditions`, `↻ no recursion`.
   - **Open** (secondary, in the order we think about an entry):
     1. **Text** — a big box in the reading font, size in tokens, macros `{{char}}` `{{user}}` work.
     2. **Keywords** — main keywords (labels; `/regex/` accepted, with a warning if the regex is invalid) and "Also needs" (secondary) with the logic written as a sentence: *"and any of"* / *"and all of"* / *"but not all of"* / *"and none of"*. An **Always on** switch (constant).
     3. **Where it goes** — ST's 8 places grouped into **5 kinds with their own drawing and color** (Character, In the chat [+ depth + role], Examples, Author's Note, Outlet [+ name]) and **Before | After** beside it when the kind has two sides (draft "LorePlaceKinds" B, picked on 10/29), and **Order** (number; "higher = later and wins the budget first").
     4. **More** (hidden, closed by default; each row with "?"): chance (%), group (name, priority, weight, scoring), timing (sticky, cooldown, delay), recursion (does not activate others / is not activated by others / only at recursion level N), ignores the budget, how many messages to read, case, whole word, also read (persona, description, personality, depth note, scenario, creator notes), only for characters/tags (or all but), generation types.
     5. **Conditions** (ours; closed by default) — "Only when the world state…": rows *tracker field · condition · value*, picking the field from a list of the trackers (e.g. "Scene: World → Location · is · Tavern"), and "all / any".
   - Dragging by the ⋮⋮ changes the **display** order (ST's `displayIndex`), not the order in the prompt (that is the Order field) — say so in the "?".
- **Hidden (only on request):** fields that exist only for ST (vectorized, automation id) live in "More" with a note "SillyTavern only".

**L1b. Try it** — a panel that slides over the list: a box "Type a few lines of chat" (pre-filled with the last messages of the most recent open session) and the live result: which entries would go in, **why** ("keyword: castle", "always on", "recursion, keyword: Silver Fox") and which would be left out and why ("lost its 30% chance", "budget full", "another entry of the group won", "world state doesn't match"). Uses the real engine. *A new idea, it does not exist in ST — see question 3.*

**States**
- Empty (no books): a short text + **Import from SillyTavern** + **New Lorebook**; explain in 1 sentence what a lorebook is.
- Empty book: "No entries yet" + **+ New Entry**.
- Full: books with 300+ entries (common in ST) — a virtualized list, fast search, one-line closed cards; 2–4 line texts **do not show** on the closed card (only on the open one). Too many keywords: show 4 labels + "+7".
- Importing: a progress bar per file; a notice with what did not come in (e.g. "vectorized" entries, Agnai/Risu/NovelAI formats).
- Error: an invalid regex marked on its label; an entry without a keyword and without "Always on" is flagged ("This entry never activates").

**From v1 (= SillyTavern's World Info editor, `public/scripts/world-info.js`, `#world_popup`, `.world_entry`)** and what changes:
- Same: all fields and position names; the list of entries that opens and closes; search and sorting.
- Different: in ST the closed header has ~10 controls side by side (position, depth, order, %, strategy…) — it becomes unreadable. Here the closed one shows **only what is read at a glance**, and the rest goes to the open one, grouped by question (what does it say? when does it go in? where does it go? the rest). ST's global settings (reading depth, budget…) leave the book editor and go to Settings (L4).

### L2. Linking books (character, persona, session, Default)
- **Character and persona editor:** a **Lorebooks** row with the linked books as labels (× removes), **+ Add** (pick from the list) and the card's one marked "from the card". Clicking a label opens the book (L1).
- **Session:** in the inspector's **Prompt** tab, a **Lorebooks** group: the ones that apply to this session, with their origin ("from Lyra", "from your persona", "Default", "this session") and switches to turn the session's on/off and add others.
- **Default:** Settings → Defaults → "Lorebooks for every session".
- From v1: in ST this is scattered (the globe button on the character, "Chat Lore" in the chat menu, the global list at the top of World Info, persona in Persona Management). Here it is always the same row of labels.

### L3. What went into this reply (Reply tab + Preview Prompt)
- **Reply tab:** a **Lorebooks · N entries** group (closed when N > 5): title · book · reason ("keyword: castle", "sticky") · tokens; below, discreet, **Left out · M** (each one's reason) and the budget line ("312 of 8,192 tokens"). Clicking an entry opens it in the editor.
- **Preview Prompt:** already shows the "Lorebooks" parts in prompt order (done); add the same L3 group in the left panel.

### L4. Settings → Lorebooks (reading settings)
- ST's 12 global settings with the same defaults (read 2 messages, budget 25% of the context, recursion on, whole word on, names in the scanned text, character first…), each with "?". In plain language: "Read the last **2** messages", "Lorebooks may use up to **25%** of the context".
- From v1: the same as the controls at the top of ST's World Info, just outside the book editor.

### Open questions for Daniel
1. Do the reading settings (L4) apply to the whole app (like in ST) or do you want to change them **per session/campaign** (slice 4)?
2. A lorebook embedded in a card: does it also show in the general list (L1), marked "from Mira's card" — or only inside the character?
3. Do you want **"Try it"** (L1b)? It is the fastest way to understand why an entry did not go in.
4. In the chat, do you want a sign **on the message itself** that lorebooks went in (e.g. in the receipt under the reply: "· 3 lore") besides the Reply tab?
5. Do you have a big lorebook of yours from ST (or v1) that I could use in the drafts? I need access to the `data/default-user/worlds` folder (the access request was blocked in this session).
