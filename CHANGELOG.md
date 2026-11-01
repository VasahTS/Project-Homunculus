# Changelog

What changed in each version. A version's section becomes the text of its download page and the "What's New"
inside the app, so write it for the people who use the app, not for programmers. New version: add `## X.Y.Z` at the top before publishing.

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
