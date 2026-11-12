# Changelog

What changed in each version. A version's section becomes the text of its download page and the "What's New"
inside the app, so write it for the people who use the app, not for programmers. New version: add `## X.Y.Z` at the top before publishing.

<!-- 0.4.5 release notes written by CODEX. -->
## 0.4.5 — 2026-11-12

Use Cues to guide replies, send pictures to the Assistant even when your main model lacks vision, and turn a comic into a character card or story Kit.

### Cues

- **Rules that react to the chat without an AI call.** In **Library → Cues**, use words, message counts, chance, time of day or tracker values to decide what text goes into the prompt. Cues can remember values across turns and keep them separate for each branch. Swiping a reply keeps counters from advancing twice.
- **See what a rule will do.** The editor summarizes what each cue reads, remembers and writes. Edit stages in a table, duplicate cues, or use **Try It** on any chat message without saving the result. After a reply, the **Reply** tab shows which cues ran and why. Values marked **Show in Scene** can be viewed and edited there.
- **Use rules where you need them.** Enable a cue for a chat or story, tie it to a character, or turn it on for every chat. Existing **No AI call** agents move to Cues automatically. Import JanitorAI lorebook scripts as cues or lorebooks, or ask the Assistant to help turn an advanced script into cue rules.

### Pictures and comics in the Assistant

- **Pictures with text-only models.** Choose a vision model in **Assistant → Customize → Pictures**. It can describe an attachment for your main model and answer follow-up questions about it. Open **See Description** under a picture to review or correct the saved description.
- **Import From a Comic.** Attach pictures, a folder, a CBZ or a ZIP. Reorder or skip pages, then choose manga or Western reading order. The Assistant presents an editable synopsis and cast and asks who you want to play. It can propose a shared character card, a persona or a story Kit. You can crop a panel to use as the card's portrait.
- **Recover from oversized comic requests.** When a batch fails, the Assistant retries with smaller groups of pages, down to one page per request if needed. Each group after the first includes the preceding page for context.

### Assistant and tracker improvements

- **Share assistants and presets.** Import or export `.h2.json` files from **Assistant → Customize**. Exports leave out connections and model selections. Imports skip identical items and save conflicting versions as separate copies.
- **More reliable lorebook edits.** The Assistant accepts the tool-call formats used by models such as MiniMax and Mimo through NanoGPT. It can read several entries at once, catches attempts to add duplicate entries and shows additions, edits and removals in draft cards.
- **Move tracker fields between groups.** Drag a field onto another group or drop it on the header of a collapsed group.

## 0.4.0 — 2026-11-10
<!-- 0.4.0 release notes written by CODEX. -->

Organize your chats, jump back to a line you remember, and try an Assistant edit on a real conversation before committing to it. This release also adds JanitorAI browsing and a document-style editor for character cards.

### Chats and sidebar

- **Pins and folders.** In Play and the Assistant, pin a chat to keep it at the top, or drag it into a collapsible folder. Right-click a chat or use its three-dot menu to move it. Story chats show the name of their story, so you can tell similarly named chats apart.
- **A shorter Recent list.** The sidebar shows 10 recent chats by default, with one line per chat and **Show more** for older ones. Set the limit in **Settings → Chat → Sidebar → Recent chats**.
- **Search inside messages.** Type a phrase in **Search chats and messages**. Results show a highlighted excerpt and open the chat at the matching message.

### Assistant

- **Ask about a conversation.** The Assistant can read a chat's history, search for a phrase, and link to specific messages in its answers. Use **Add Context** to select a chat or a range of messages. Opening the Assistant from Play brings the current chat or Library item into context as a removable chip.
- **More context for app questions.** The Assistant can read agents, regex scripts, Quick Replies and Directors, and consult a guide to explain how features such as prompt assembly and memory work.
- **Try It on an edit.** For a character card, narrator, lorebook or prompt preset copy, choose a chat and compare two versions of a reply side by side, with and without the change. The preview shows the model and asks before making two model calls. Both replies stay in the preview, outside your chat history.
- **Prompt presets in the Library.** Ask the Assistant to create a new preset or adapt an existing one. Edits create a separate preset you can select in a chat or story.
- **Easier to edit Assistant presets.** Rules and memories wrap as you type, and memories show their date and token count.

### Character editor

- **Text layout.** Open a character card and choose **Text** to edit its description, scenario, greetings, dialogue examples and other text fields in one document. **Ctrl+F** finds text and **Ctrl+H** replaces it across the card or in the current field, with match case, whole-word and regex options. One **Ctrl+Z** reverses a Replace All.
- **Compare and restore.** Open **Compare** for a side-by-side, word-level diff against the start of your edit, the last save, the original import, the main version or a history entry when available. Use **Put Back** to restore individual changes or **Put Back All** to restore the comparison version's text.

### JanitorAI in Card Browser

- **Browse and import public cards.** Open the dedicated **JanitorAI** source to search and preview cards as a guest, or sign in from its own window. Public lorebook entries come in with the card.
- **Choose how to import a hidden card.** When an eligible DataCat copy is available, **Add from DataCat** imports it, and **Save as PNG** can save it to disk. **Extract Yourself** reads the current JanitorAI card for supported cards and requires a JanitorAI sign-in and confirmation on first use.
- **Choose what triggers lore during extraction.** The **Lorebook Trigger** row lets you include the card, catalog page, scenario, greetings, lorebook descriptions or your own text. Large lorebooks are read in smaller passes when needed. If the AI cannot rebuild the hidden lore into entries with keywords, Homunculus imports the captured text as disabled entries for review.

### Chat panel and trackers

- **Character, Prompt and Memory have distinct homes.** Edit the card version the chat uses in the **Character** tab. **Prompt** puts the Author's Note first and groups model settings, presets, lorebooks and other controls into expandable cards. Open **Memory** from the chat's top bar while the conversation stays visible.
- **Pick trackers together.** Start from the Scene checklist to choose multiple trackers and their field sets in one step. Use the **Trackers** button to adjust them later. Switching several trackers quickly now keeps each change.
- **One Scene sheet per person.** Values from multiple trackers appear together on the same character sheet. Global values are grouped by tracker. Each group uses a consistent layout, the changed marker sits beside the label, and long lists display and edit one item per line.

### Layout fixes

- Long code lines wrap in chat and in narrow panels while preserving indentation and copied text.
- Long preset block names, story titles and version labels fit their panels without covering switches, dates or other controls.

## 0.3.6 — 2026-11-08

- **Mouse side buttons everywhere:** back (M4, or Alt+←) closes the open window, menu or card preview, then steps back through what you switched — tabs, the character editor's layout, the open entry — and screens; forward (M5, or Alt+→) goes forward again.
- **Interface size:** Settings → Appearance → Interface size (70% to 150%), or **Ctrl +** / **Ctrl −** anywhere; **Ctrl 0** goes back to 100%.
- In narrow windows the chat's top bar no longer overlaps its buttons, and the inspector's close button no longer covers the Reply tab.
- **Settings → Chat → Model:** show the model that wrote each reply, quietly beside its time.
- The line under the message box is shorter: your persona, a short hint and the model (temperature and thinking are in the Prompt tab).
- A Director window you closed no longer opens again every time you come back to the chat.
- **Personas window:** your persona now sits under the message box (picture, name, version) — click it or press **Ctrl+P** to open **Personas**: search, sort (Recent, Most chats, A-Z…), see each persona's versions and whole description, then **Play as**, **Make Default** or **Edit**. "Follow the default" and "No persona" are there too, and "Who is in this story" opens the same window.

## 0.3.5 — 2026-11-07

- **Stories: From a card…** — take the scenario and any greetings of any card in Characters, with a button for each, instead of copying and pasting. A card's {{char}} becomes its name in the story.
- **Export and Import** for narrators, NPCs, stories, Kits, agents, trackers and Directors: one Homunculus file (`.h2.json`) with everything the item uses (cards, lorebooks, preset, NPCs, agents, pictures), to keep or share. Import sits beside New on each of those pages; nothing you already have is changed, and a changed copy comes in as "(imported)". Connections, personas and chats are never in the file.
- **Presets:** Export is now at the top of the preset editor too (it was hidden at the very bottom).
- **New app icon:** a serif H on warm black, in the colors of the Observatory look.
- **Director** (new tab in the inspector, can pop out into its own window): talk about your story out of character — where it is going, a character acting off, which part of your preset causes something. It reads what the story's AI reads (you choose what), never writes the story, and proposes **notes** for the story: Whisper (quiet), Steer (gradual) or Turn (now), each for N turns or always. Swiping or regenerating a turn keeps the note without using another turn; expired notes stay listed. Everything is editable in its Setup, including the weights and their instructions.
- The Director can also **fix things in your story** when you allow it — tracker values, lorebook entries, the Author's Note, a Character's Note, memory chapters — showing before and after, with Undo. Optional: it checks whether replies followed its notes, or asks itself a question every few replies. **Ask the Director** from any message, quick questions, and handy chat actions (copy, edit and ask again, turn an answer into a note).
- **Library → Directors:** make several Directors, pick the default, and choose which one each story uses. The Director's notes and talk now **follow branches and swipes**, and its chat fills the panel with the message box at the bottom.

## 0.3.2 — 2026-11-05

<!-- Memory layout follow-up: CODEX. -->

- Fixed the Memory tab being cut off in chats with long summary-model names, including settings inherited from a story.
- Collapsed settings, expanded controls, chapter editors, Recall and Guide now stay within the inspector width. Long names remain compact and longer text wraps where needed.
- This is a layout correction; chapter generation, recall selection and stored memory are unchanged.

## 0.3.1 — 2026-11-05

<!-- Hotfix notes: CODEX. -->

- Fixed the Prompt panel cutting off character fields, the Author's Note and inherited setup controls when imported text or names were long.
- Long field labels wrap within the inspector; previews remain compact and fields can still be opened and edited normally.
- Scene section tabs scroll within their own row, keeping world values and tracker status controls inside the panel.

## 0.3.0 — 2026-11-05

Home and the Observatory look, character browsing across six catalogs, Quick Replies, expanded chapter memory, and more control over connections and background agents.

<!-- Release notes prepared by CODEX, 2026-11-05; existing entries below retain their original authorship. -->

### Home and character browsing

- **Home** brings together your last chat, recently played characters, stories, the Assistant and Library shortcuts. Open it from the sidebar or with **Ctrl+H**.
- **Observatory** is the starting look, with warm paper colors, serif story text and alchemical icons. Other looks remain available in Appearance.
- **Card Browser** searches ChubAI, JannyAI, Wyvern, Pygmalion, DataCat and BotBooru. **All Sites** combines their results with source labels, independent pagination and retries. Site consent, account access and download permissions apply.
- Card details include readable descriptions and full-size pictures. Preview downloads take priority, repeated image requests share work, and obsolete queued downloads are discarded when searches change.

### Connections and reliability

- **Streaming per connection:** turn it off for services that return complete responses instead of streamed chunks.
- **Summary writer:** choose a connection, model, instructions and answer limit for writing chapters in each chat.
- **Recall:** use the agents' model or choose a custom connection and model. Dedicated decision models use their decision endpoint; chat models use chat completions.
- Chapters stay isolated on each branch. Covered messages are marked in the chat; hiding original messages also retires summaries that could contain them.
- Background agents keep running when you leave the chat. Their results and Stop control remain attached to the chat that started them.
- Markdown chat export follows the selected branch, including its chosen message versions.
- Shorter interface text across settings, memory, trackers, agents, the Assistant and Library.

### Opening

- **A short opening when the app starts:** the name typed on a typewriter, a strike, then it settles into Home. A click or any key skips it; **Settings → General → Skip the opening** turns it off, and **Opening sound** keeps it silent.

### Quick Replies

- **Quick Replies** like SillyTavern's: your saved texts (OOC instructions, author directions, things you always send) as buttons above the message box. `{{input}}` puts what you typed inside the text; a set can send at once or put the text in the box, before or after what you typed.
- **Stack:** click several quick replies and they pile up in the box, one per line (SillyTavern replaces each time).
- **Bar or one button** (Settings → Chat → Quick Replies): the bar of buttons, or a single button that opens a searchable list (Ctrl+/).
- Sets can be on everywhere, in a story, for a character or in one chat (Prompt tab). ⋮ menus open other sets. Ctrl+click a button to edit it.
- **Import and export SillyTavern's Quick Reply sets** (one set, several, or its settings.json); exported sets open in SillyTavern again.

### Pictures and layout

- **Stories:** the story you played last sits on top with **Continue**; every story's cover stands (2:3) and fills its card.
- **Crop and zoom** any picture you pick (characters, personas, stories, narrators, NPCs): Portrait, Square or its own shape; or **Use Whole Image**.
- **Dialogue and narration colors are per look:** a color you pick stays with that look; the others keep their own.
- **Chat avatars:** a new **Portrait** shape and bigger sizes.
- The inspector keeps the same width on every tab; **Connections** is easier to read.

### Memory

- Memory has its **own tab** beside Scene, Prompt and Reply: what it is doing right now, the chapters with their message numbers, **Write It Myself**, settings with live examples, **Try it** for Smart recall, and a Guide.
- Chapters can close **by size in tokens** (always ending at an AI reply), not only every N messages.
- **Merge old chapters:** when summaries pile up, the oldest merge into one shorter summary, so very long stories keep a small memory.
- **Catch Up** writes every chapter an old or imported chat is missing, with progress and Stop.
- **Smart recall:** before each reply, your agents' model or a custom recall model picks the chapters that matter right now and quotes their key messages word for word. The Reply tab shows what it chose and why.

### Chat

- **Messages to show** (Settings → Chat): long chats draw only the newest messages and open faster; **Show earlier** brings the rest. The AI still reads everything.

## 0.2.0 — 2026-11-01

This release adds the Library Assistant, web search, on-screen agent controls and chapter memory, and expands prompt editing, trackers, narrators and library organization. The changes below cover the shipped differences from 0.1.0; intermediate design drafts are not listed as features.

### Library Assistant

- Added a separate **Play / Assistant** workspace with its own conversations, recent chats and search inside messages.
- Added five editable assistants: **Homunculus, Card Smith, Loremaster, Story Architect and Editor**. Create, duplicate and customize assistants, or reset a built-in assistant to the app's version.
- Draft and revise **characters, lorebooks, trackers, Kits and narrators** through conversation. The Assistant can search and read the library as needed instead of including the whole library in every request.
- **Add context** searches across library kinds and attaches several items at once. Folder paths and character versions help distinguish items with the same name.
- Attach **JSON, JSONL, Markdown, text files, PNG character cards and images**. File summaries and paged reads limit how much material enters a request.
- New-item result cards provide **Undo**. Proposed content changes show a readable comparison and wait for approval; stale proposals cannot overwrite newer edits.
- Added per-chat **Drafts** mode: revise readable draft cards before saving a new item or applying a draft to an existing one. Drafts and code blocks have Copy actions.
- The Assistant can create folder paths and move items into them, with **Undo / Redo**, including removing newly created folders when Undo leaves them empty.
- Create and update **character versions**, keep only their differences from the main card, assign pictures per version, and choose a version for a Kit's cast.
- Added Assistant **presets** for writing style, individual rules, notes, lore and memory, with switches and size estimates.
- Choose the **assistant, preset, connection and model** from the composer. A chat can override its assistant's model or return to that model.
- Added a **context meter** and a Details panel for the last request's size, automatic or manual compaction, the current summary, files, tool permissions and activity. Compaction can be undone.
- Details identifies the assistant instructions and preset content used in the last request. Reported token usage, cost, speed and model information are shown when available; estimates and missing usage are labeled.
- Added message actions for **Copy, Again, Edit and Request**, plus chat renaming, Markdown export and deletion.
- Added per-tool-group permissions, step budgets and repeated-call guards. Tool activity records what was done and how long it took.

### Assistant web search

- Added **DuckDuckGo search and public-page reading** in the desktop Assistant without a separate search API key or provider fallback.
- Added a **Web** switch for each chat. New chats follow the default in **Details → Tools → Search the web** until given their own choice. Story and roleplay chats have no web-search tools.
- Search results include titles, addresses and snippets; page reads return plain text and can continue from an absolute offset.
- Replies show an expandable **sources** list. Search and reading steps name the query or page and report what was returned; request inspection includes the web text supplied to the model.
- Searches run one at a time, at least two seconds apart, with cooldowns for rate limits or bot checks and bounded retries for other HTTP errors. Stop cancels a wait or pending result.
- Added ten-minute session caches for searches and page reads. Each reply is limited to **five searches and 30,000 characters of page text**; an individual page read returns up to 6,000 characters.
- Page reads refuse local and private-network addresses, limit redirects, time and response size, and treat fetched content as data rather than instructions.

### Agents and previews

- Added **Library → Agents** with searchable, sortable Table and grouped List views, editable starter examples and an editor that saves automatically.
- Organize agents by **Pre-Generation, Parallel and Post-Processing**, with explicit input sources, model overrides, styles and configurable variables.
- Configure context from recent messages, cast, narrator, NPCs, persona, scenario, Scene values, active lorebook entries, chapter summaries, the Author's Note, previous notes and other agents' results. A minimum-context threshold can delay agents until enough history is available.
- Choose a separate AI call, supported execution inside the main reply, or text mode. Configure run frequency, conditions, answer length and whether to use instructions as written.
- Added **text mode**: expand an agent's text and macros, including random choices, without calling a model. Text prompt additions also appear in Preview Prompt.
- Added compact **Choose agents** controls in story and chat setup, with search, active agents first and **Turn all off**.
- The chat's **✦ panel** combines agents and trackers, with switches, model labels, live status, elapsed time, errors, Run and Edit controls.
- Display outputs as notes, checks, choices, rewrites or structured **feed, phone, sheet and card views**. Presentation choices include folded or open notes, numbered or button choices, and panel-only or quiet results.
- Choices can send a message or place their text in the composer. Notes can be kept in the panel or under a reply; eligible notes can feed back into the story's prompt.
- Added **Hidden: only for the AI** notes and reusable instruction versions/styles. The agent editor also supports author information and an emoji icon.
- Added **Run again with a direction**, model information beside results and per-agent connection/model overrides.
- Run Details preserves the actual prompt, raw answer, reported reasoning and usage. **Compare** tries other connections without applying results.
- Rewrites have a **word-by-word comparison**, side-by-side and original/rewritten views. Restore individual changes or undo the entire rewrite.
- Added editor **Try it** previews using the current draft, even while autosave is pending or has failed. Choose a chat, message and connection, then explicitly run or stop the test.
- Try it shows typed results and captured inputs without applying them or writing run history. Text previews make no model call; unsupported standalone modes explain why they cannot run. Changing context marks an earlier result outdated.

### Chapter memory

- Added optional **chapter summaries** for older chat messages, with configurable messages per chapter and a recent-message window kept word for word. Memory settings can be inherited by stories and chats; memory starts off, with a 20-message chapter size and the newest 10 messages preserved when enabled with the defaults.
- **Prompt → Memory** shows waiting messages, **Summarize now**, chapter counts and individual send switches. Edit chapter titles and summaries or remove chapters.
- Chapters replace only the messages they cover in the model's prompt; the original conversation remains intact. Edited summaries are retained instead of being regenerated automatically.
- Chapter selection follows the current branch. Preview Prompt identifies the memory included, and reply details report summarized messages.
- Summary failures leave the completed reply available and report the memory error separately.

### Prompt editing and story setup

- Added inline **prompt-block editing** in the Prompt tab, including switches and order, with **Shared preset** as the default editing scope and **Only this chat** as an alternative.
- Local changes inherit unmodified preset values, remain isolated per preset and can return to inherited blocks. Shared edits are marked when a story or chat overrides them.
- Text saves after a short pause and when leaving a block, tab or editing scope. **Undo changes** restores the text present when the block was opened.
- Preview Prompt uses pending edits immediately and resolves the same effective blocks as ordinary replies and manual agent context.
- Story and Kit setup keep the preset picker without duplicating the block editor. Existing story overrides are disclosed with an option to use the preset unchanged.
- Moved **narrator placement** options next to the narrator in a collapsed section, with placement, repeat, depth, role, order and inheritance controls.
- Clearing a narrator depth/order box while typing no longer immediately saves zero; numeric edits commit on leaving the field or pressing Enter.
- Added **Character's Note** editing with depth and role, version-specific overrides and SillyTavern import/export support.

### Trackers and field sets

- Added portable **field-set JSON import/export** for reusing tracker definitions across trackers. Export includes the complete selected set, including nested fields and presentation, without saved chat values or database identifiers.
- Added **Import, Export and AI guide** links beside the selected set. The downloadable guide documents the format, supported fields and a working example.
- Each field or group can **Copy or Move** to another set or a new set through its row menu. Existing destination keys are identified, nested definitions are preserved, and Move cannot empty a set.
- Transfers provide **Undo** until a later definition change or Save. Invalid imports and edits made while a file is being read do not partially replace the draft.
- Tracker fields can include explanatory notes in their instructions. Starter field descriptions were revised to avoid unnecessarily copying full card or lorebook text into Scene sheets.
- Added per-card **Track in Scene** in story/chat cast controls, with a default in the character editor. A card can still contribute its description while the tracker follows its individual people separately.
- People **out of the scene** open as a brief sheet, with **Full sheet** available. Tracker requests use their brief fields while preserving withheld details for their return.
- Trackers can **remove values that no longer apply**, such as an ended status, without removing those values from earlier messages.
- Tracker editors retain the selected field set and support opening several fields for editing.

### Narrators and story lorebooks

- Added editable starter narrators: **Storyteller, Game Master, Co-author, Director's Pen, Mystery Keeper, Slow Burn, Dread, Living World and Slice of Life**.
- Added a narrator list beside a wide editor, with instruction blocks and style settings. New custom narrators start blank.
- Narrators have a short description and suggested story modes, a **Start from** choice, a **What the AI gets** preview, and grouped instructions kept together inside the narrator prompt section.
- A story keeps **its own version of a lorebook** when an agent changes it; other stories continue to use their own versions or the Library original.
- The lorebook editor can switch between **Original** and a story's version, identify new/edited/disabled entries and show who changed them.
- Save a story's version as a new lorebook, apply selected changes to the original, or return to the original.
- Added **Lorebook Keeper** and structured-view starter examples. Keeper results identify the entries added to that story's lorebook and provide a link to inspect them.

### Collections, folders and everyday navigation

- Made **Stories and Characters** peer sidebar destinations. Kits, Narrators and NPCs live alongside writing resources, trackers and agents in Library.
- Added the **Quiet** appearance profile as the default, while retaining Graphite, with quieter navigation and collection presentation.
- Library categories now occupy **one grouped row of tabs** under the title, with Trash at the end. Narrow windows can scroll the row horizontally, and repeated section titles were removed.
- Added **Ctrl+K → Open anything** from Play or Assistant, with grouped results, recent chats, section shortcuts and keyboard navigation.
- Characters, Stories, Kits and NPCs use portrait cards in **S / M / L**. Collection size and view choices are remembered separately for each place.
- Added **Folders / Everything** views, folder-path search, matching-folder results and item locations. Recently played filters use actual chat activity.
- Added folder **Back**, the mouse back button and **Alt+Left** for going up one folder.
- Added **Ctrl+click** multi-selection and group dragging, with a moving card stack, folder drop feedback and return animation on cancellation.
- **Ctrl+Z** undoes a folder move, including a group move as one operation. **Ctrl+A** selects the visible cards; Delete sends eligible items to Trash with a single Undo and reports items still in use.
- Added a sidebar **Stop** control for running replies and a notice with **Open** when a reply finishes in another chat. Successful notices dismiss automatically.
- Added clearer agent-failure notices and per-chat token spending in the composer footer.

### Message formatting, files and connections

- Added **Markdown formatting**, dialogue highlighting and narration colors, including formatted streaming replies, code blocks, lists, tables and quotations.
- **Settings → Messages** controls Markdown, dialogue/narration colors and allowed colors/styles from the AI. Formatting HTML is filtered; regex-generated styled output uses an isolated sandbox.
- Added **Copy** on code blocks. Supported message links open in the system browser.
- Remote images can be **Click to show, Always or Never**, with click-to-show as the default.
- Exports use a **Save as** picker when the webview supports it. Cancelling saves nothing; other environments retain the Downloads fallback and report the path. Export filenames preserve accents.
- Added configurable connection **retries when busy** and **timeouts without new response data**, shared by stories, agents and the Assistant. Busy/rate-limited requests can retry before response content has arrived.

### Regex scripts

- Added SillyTavern-compatible regex processing for **global, preset and character** scripts, with display, prompt and saved-message targets.
- Added **Library → Regex**, inline script editing, ordering, import/export, live pattern errors and **Try it** previews; preset and character editors expose their own scripts too.
- New scripts imported with cards or presets wait for approval. Changing a script's behavior requires approval again; the review shows its effect on the last reply.
- Added per-chat switches in the Prompt tab. Saved-message transformations preserve the original text with **Original / Undo** support, and edited scripts are included when exporting their card or preset.

### Reliability fixes

- Agent saves are serialized so an older slow write cannot replace a newer edit. Failed saves retain their drafts; Close retries instead of discarding them.
- Completing a delayed Close/Delete cannot close a different agent's editor, and deletion waits for earlier writes so they cannot recreate the agent.
- Agent runs and comparisons reject messages from another chat. Cancelled text/code execution and preview results cannot apply late changes; Compare and Try it honor explicitly chosen models.
- Concurrent Lorebook Keeper writes merge against the latest story version instead of losing entries or modifying the shared original.
- Before/parallel agent notes reliably report their results and their contribution to the prompt.
- Memory requests reject foreign-chat paths and discard summaries whose source text, prior chapter, readable range or destination changed while the request ran.
- Concurrent summaries cannot save overlapping chapters. Editing summarized messages disables affected chapters and returns corrected source text to the prompt while retaining saved summaries and manual edits.
- Memory saves merge title/summary changes against the latest chapter list, preserve newer typed drafts and surface save failures for retry.
- Regex transformations of edited messages retain the correct original, including after Undo.
- Assistant imports wait for approval, including embedded lorebook content. Stop prevents further calls and writes, ignores late answers and retains already completed work.
- Stale Assistant Kit proposals detect later narrator/lorebook changes instead of overwriting them.
- Assistant request history reflects current result-card decisions, including Undo, approval and moves. Guides can be read again after trimming or compaction; long reads use correct absolute offsets and remaining counts.
- Switching Assistant chats during a reply keeps the selected chat on screen, and the next message goes to that conversation.
- The first native web request initializes its TLS provider without requiring a previous updater check.

### Build and documentation

- Moved the source-build and GitHub Actions runtime to **Node.js 24 LTS**.
- Added regression tests and reliability reports for agent saving/execution, previews, memory, regex, Assistant tools, web search and navigation.
- Refreshed the README with current feature descriptions and three screenshots of the shipped interface, captured with isolated sample data.

Windows NSIS, Linux AppImage and Debian/Ubuntu packages are available with updater signatures. Install over the previous version to retain existing data. Windows and AppImage support in-app updates; Debian/Ubuntu packages are updated by downloading and installing the new package.

[Full source comparison: 0.1.0 → 0.2.0](https://github.com/VasahTS/Project-Homunculus/compare/v0.1.0...v0.2.0).

## 0.1.0 — first version for testing

- **1:1 chats** with characters: import SillyTavern cards (PNG or JSON), make versions of a character, swap replies (swipes) and start branches from any message.
- **Stories**: stories told by a narrator, with NPCs, a scenario and openings. Save a story as a **Kit** to start others like it.
- **Trackers**: after each reply, the **Scene** panel updates itself (who is in the scene, where, when, mood, goals) and shows what changed.
- **Library**: personas, presets, lorebooks (SillyTavern-compatible) and folders everywhere.
- **Chats**: search by name and by content; export as SillyTavern (JSONL), Markdown or text.
- **Windows and Linux**: a Windows installer, a Linux AppImage and a Debian `.deb`.
- **Automatic updates**: when a new version is out, a quiet bar offers **Update & Restart**. Nothing is installed until you click, and your chats and characters stay.
