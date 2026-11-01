# UI-PLAN — Homunculus 2

The screens' plan **before** any draft or code (rule agreed with Daniel on 10/28, see HANDOFF "🔒 NEW UI RULE").
One section per panel. Daniel approves the text → drafts with real data → code equal to the approved draft → one panel at a time.
Already done under this rule: the **Scene** panel ("C — Quiet", D-025) and the **tracker editor** ("B", D-026). The other panels (sidebar, chat, Prompt, Reply, Library, Settings) get their section when their turn comes.

---


## Agents v4 and narrators — CLAUDE, 2026-10-31 · ✅ draft 2 in the app, functional (D-059); Daniel: "not yet how I imagine it, OK for now"

**Round 1 was rejected** (31/10, translated): "The UI is still weird. You are not really looking at how the two apps are; it must have the same or more options than the original app. The narrator part got VERY busy. And the narrators you made are too simple and don't serve much; remember the 3 modes of a Story — each should have its narrators — plus extras with other features that complement them." He sent screenshots of Marinara's agent editor (Prose Guardian) and v1's companion editor (Direction Menu).
The functional fixes of D-057 (notes back to the AI, Run again with a direction, model beside notes, a connection per agent) are in the app and stay.

### What the two editors really look like (from Daniel's screenshots and the code)
- **Marinara** (`AgentEditor.tsx`): one page of **section cards, all open**, each with an icon and a "?": Description + Author · **Pipeline Phase** as three big buttons (Pre-Generation / Parallel / Post-Processing) · **Context Sources** as a two-column grid of switch tiles (Previous output, Chat history, Characters, Persona, Activated lorebook entries, Chat summary, Author notes, Tracker data, Recalled memories) · **Connection Override** + "Share requests with other agents" · **Agent Budget** (context size in messages, max output tokens) · the agent's **Defaults** = its own variables (`{{banned}}`, `{{prefer}}`, `{{avoid}}`, "Hold message until rewrite") · **Add as Prompt Section** · **Prompt Template** ("Using built-in default", "Copy default to edit", named prompt options picked per chat). The list is a side panel: search, A–Z, New Folder, mode tabs, groups with icon + count, rows with an icon tile, name and one line.
- **v1** (`agent-store.js` `createDefaultAgent` / `createDefaultCompanionConfig`, glossary): Name, Category, Phase, **Execution** (Inline / Companion), Description, Pin to Quick Toggles; Prompt with Preview / Refine with AI / Fullscreen; **Connection Profile + Model Override**; Companion Settings: Order, Trigger (auto / manual), Display (card / panel / hidden), Format (Markdown / HTML / plain), Context Messages, Min Context Tokens, History Depth, Max Tokens, Include character card / persona / World Info / Author's Note / System Prompt, **Include prior notes**, **Keep in Chat History**, **Feed notes into future generations**, Use prompt as-is, **Run selected companions in one request**, send context to other companions, re-run after / wait for other companions. Inline: Position (in prompt / in chat / before prompt), Depth, Role, Order, Scan World Info, intercept (replace / wrap / patch), post passes (rewrite / append), regex, extract to variable, conditions (keywords, probability, generation types, run on impersonation).

### Every v1 / Marinara option and where it goes (✓ in the app · ➕ new in this plan · ⏳ later)
| Option (v1 / Marinara) | Homunculus 2 |
|---|---|
| Name, description, author, icon | ✓ name, description · ➕ author, icon |
| Category / folders | ➕ folders (like every Library page) and "group by phase / folder" |
| Pin to Quick Toggles | ➕ "Pin to the top of the ✦ panel" |
| Phase pre / post (v1), Pre / Parallel / Post (Marinara) | ➕ three big buttons: Before / Alongside / After the reply (core already has `before / parallel / after`) |
| Execution inline / companion | ➕ "How it runs": its own AI call · inside the main reply (core `inline` mode, never shown before) · no AI call |
| Result type | ✓ "What it does" tiles, the ones that don't fit the phase greyed out |
| Trigger auto / manual, every N | ✓ "Runs: on every reply / every N messages / only when I ask" |
| Connection profile / Connection Override | ✓ (D-057) |
| Model override | ➕ |
| Share requests / run companions in one request | ➕ switch (core batching per connection) |
| Context messages + min context tokens | ✓ messages · ➕ "at least N tokens" |
| Include character card / persona / World Info / tracker data | ✓ |
| Include Author's Note, System Prompt, chat summary | ➕ (chat summary = our chapter memory) |
| Include prior notes + history depth / Previous output | ➕ "Its previous notes · last N" |
| Send context to / re-run after / wait for other companions | ✓ reads other agents' results (they run first) · ➕ "run again when they change" |
| Display card / panel / hidden | ✓ label, card, view, ✦ panel · ➕ "Hidden: only for the AI" |
| Format Markdown / HTML / plain | ➕ (safe HTML drawn by the app, never scripts) |
| Feed notes into future generations (depth) | ✓ (D-057) with where (depth, role) |
| Keep in chat history (also when hidden) | ➕ |
| Scan World Info | ➕ "Lorebook can match it" |
| Add as Prompt Section | ➕ "Add as a prompt block" (a marker presets can place) |
| Hold message until rewrite | ➕ for rewrites |
| Post pass rewrite / append | ✓ replace · ➕ "Adds after the reply" |
| Run on impersonation | ➕ "Also on written-for-you text" + a "Written for you" generation type |
| Agent Defaults / variables | ➕ **Variables**: `{{name}}` fields with default text; each story or chat can change them (replaces the old one-off Styles idea for this need) |
| Prompt options per chat | ✓ Styles, renamed **Versions** (`{{version}}`; `{{style}}` keeps working) |
| Preview / Refine with AI / Fullscreen | ✓ Try it · ➕ Preview with macros, Improve with AI, Expand |
| Use prompt as-is | ➕ "Use as written: add no answer format" |
| Order, tools | ✓ |
| Conditions: keywords, chance, generation types | ✓ (+ same roll, only after N messages) |
| Intercept replace / wrap / patch, regex scripts, extract to variable | ⏳ need the app's own regex first (Daniel, earlier) |
| Custom Tracker Builder, AI Maker | ⏳ trackers have their own editor; AI Maker with the Library Assistant |

### Library → Agents (draft 2, tab "Agent editor")
- **List** on the left, Marinara's rhythm: search, group by (phase / folder), + New agent, + New folder, Import…; groups with a colour dot and count; rows = icon tile, name, one line. Trackers listed last as a link.
- **Editor**: one page of section cards, all open, in this order: Description · **Phase** · **What it does** · **How it runs** · **Context sources** (switch tiles, numbers inside the tile they belong to) · **Connection and budget** · **Result** (only what fits the kind) · **Variables** · **Instructions** (versions as chips under it) · **Only if** · **Advanced**. Sections that don't apply disappear (a "No AI call" agent has no context, connection or variables).
- Selecting another agent in the draft shows how the sections change (Prose Polisher v2 with variables, Continuity, Direction Menu, Class Group Chat with versions, Don't Write for User with no AI call).

### Narrators (draft 2, tab "Narrators") — less busy
- **Library page groups narrators by story mode**: You play a character · Written together · Director mode · Extras (any mode). Cards show the one-line "about" and, for extras, "Works well with" (trackers / agents to switch on).
- **Editor**: name, the one line, **Written for** (mode chips), a **single Style line** of pills ("3rd person · past · about 300–500 words · Tone: —") with **Change…** that opens the choice rows only when asked, then **Instructions as blocks** (Role, Story, NPCs, Dialogue, Narration…), each a row with a switch, its name and first line; click opens the text. "+ Add a block". Then "May bring in new people" and the reminder. **What the AI gets** on the right.
- **In the app now (D-058, data only):** nine narrators written from Daniel's v1 role presets: **Storyteller** and **Game Master** (you play a character), **Co-author** (written together), **Director's Pen** (director), and extras **Mystery Keeper**, **Slow Burn**, **Dread**, **Living World**, **Slice of Life**. Today their blocks are one Instructions text; the block editor waits for this approval.

### Open questions for Daniel
1. All section cards open (Marinara), or the rarely used ones (Only if, Advanced) folded?
2. Variables: should a story/chat change them in its Agents window (like Marinara's per-chat settings)?
3. Narrator blocks: should a story be able to switch a block off just for itself (e.g. Dialogue rules off in one story)?
4. "Works well with": also offer to switch those trackers/agents on when you pick that narrator for a story?

---

## Try it in the agent editor — CODEX, 2026-10-30 · text and visual approved; integrated (D-052, D-053)

### Purpose and scope
Test the agent currently being edited, inspect what it read and what it answered, and return to editing without applying the result to a story or chat. Daniel approved this Step 1 text and authorized project examples for the draft. The visual draft is now available at `docs/drafts/agent-try-it/index.html`; Daniel subsequently approved the visual and its production integration (D-053).

Global agent activation/scopes remain deferred at Daniel's request. This task adds no Settings section or agent activation changes.

### Entry and hierarchy
- Add a quiet **Try it** action beside Close in the existing agent editor. It opens one modal sheet titled **Try <agent name>**; the editor remains behind it.
- Primary: the chosen **Chat**, **Message**, **Run test**, and the resulting answer.
- Secondary: **Connection**, its resolved model when known, and a short explanation: the test previews the result without applying it. Text agents show **No AI call**; AI agents indicate that the selected connection is used and the call may incur cost.
- Default to the source chat when opened from a chat; otherwise suggest a recent available chat. Select a suitable existing user message for a before/intercept test, or a reply for an after/rewrite/check/note/choices/proposal test. The user can choose another message and see its speaker and text preview.
- The selected message defines the history path. Choosing it does not change that chat's active branch or selection.
- Results show **Result** first. **What it read**, **Raw answer** and **Reasoning**, when supplied, are secondary tabs/disclosures. Show actual model, elapsed time, and reported usage; unknown values stay unknown.
- Context and controls remain visible after a result, so another run needs no reopening. Details are closed until requested.

### Actions
- **Try it** opens the sheet; opening it does not call a model.
- **Run test** validates the current editor draft and context, then runs exactly this agent as a read-only preview. It does not require activating the agent or successfully saving the draft first. The editor's ordinary autosave behavior continues independently.
- Use the agent's connection resolved for the chosen chat by default. An optional connection override affects only this test.
- Run one preview at a time. Disable duplicate Run actions while busy, show **Running...**, and expose **Stop**.
- **Stop** aborts the preview; late completions cannot replace a newer result or appear in another agent's editor.
- **Close**, Escape, changing the selected agent or leaving the editor aborts the pending preview and returns focus appropriately.
- A new context, connection, or changed agent configuration clears/marks the old preview as outdated; an old result must never look like a test of newer instructions.
- No Apply, save-to-story, automatic rewrite, or chained execution of other agents is included.

### States
- **Empty:** no eligible chat/message; explain what is missing and keep Run disabled.
- **Loading context:** retain the chosen chat label and announce loading; prevent a run with stale context.
- **Ready:** context and connection are explicit; no AI call has been made.
- **Running:** one contextual live status, Stop available, duplicate submission prevented.
- **Success:** display the validated result first; typed results remain readable (rewrite text, check findings, choices, note, injection, or lore proposal).
- **Cancelled:** show Stopped; preserve the chosen context for another run.
- **Error:** show validation, missing connection/resource, provider or malformed-output errors inside the sheet; keep the draft and context for retry.
- **Full:** test 8+ cast members, long chat/agent/model names, several paragraphs, long histories and large structured results. Use contained scrolling and wrapping; the whole window must not widen or scroll sideways.

### Read-only behavior
- Preview the current in-memory AgentConfig through the existing dry-run runner, extending the pipeline to accept an ephemeral configuration rather than silently reading an older saved definition.
- Reuse the same context builders, output validators and connection resolution as actual agents. Show the prompt actually sent.
- Test only the selected agent, using already available dependency results. Do not run its dependency agents, create messages, revisions, notes, state deltas, lorebooks/story patches, agent-run records or generation records.
- Timing, keyword and probability conditions do not block an explicit test; explain that a test does not prove an automatic trigger would fire.
- Text-mode agents expand their text/macros without an AI call. Modes/tools without a safe standalone preview show an explicit unsupported reason; do not fall back to executing a full turn.
- Guard the chat/message session boundary and check cancellation, including responses arriving after Stop.
- Results live only while this preview is open. This feature is not a saved test history.

### From v1 and the existing v2
- v1: `public/scripts/extensions/in-chat-agents/index.js:previewPreGenerationPrompt` (L1251 at reference commit 0884338a) previews the current editor prompt with macros in a popup. Keep the direct editor action and visible context.
- v2: `AgentsPanel.tsx:Compare`, `TurnPipeline.compareAgent`, and `AgentRunner.dryRun` already provide model previews without applying outputs. Reuse their execution/context contracts; extend to an ephemeral editor draft and cancellation. Keep the current kit, theme tokens and modal conventions.
- Unlike v1's prompt-only preview, this feature can ask the selected agent to produce its actual typed answer. Running remains an explicit user action.

### Accessibility and validation
Use visible labels, keyboard-operable controls, contained focus with return to Try it, a contextual live status, and text explaining errors near the action. Preserve readable result wrapping and the existing theme.

Core regression coverage: current draft versus saved definition; no writes for each supported output; foreign-chat rejection; cancellation; unchanged saved activation/connections; missing dependencies/resources.
Browser coverage: opening without a request, choosing context, text-mode preview, successful AI preview with a fake provider, double-click prevention, Stop, errors/retry, close/navigation during a delayed request, stale results, keyboard focus and full/narrow layouts.

### Review gates and data
Daniel approved this text and selected project examples instead of real data for this draft review stage (D-052). The portable draft and validation are in `docs/drafts/agent-try-it/`. Never inspect or request the portable play folder or keys. Production implementation follows approval of the visual draft.

**Completed:** Daniel approved the visual; integration and validation are recorded in `docs/AGENT-TRY-IT.md` (D-053).

Signed: **CODEX**.

---

## Agents (slice 5) — CLAUDE, 10/30/2026 · ✅ draft v2 in the app (D-047); draft 3 approved ("do everything") and in the app (D-048, D-049)

**What it is for:** the agents Daniel "can't live without" from v1 (In-Chat Agents), on the engine Homunculus 2 already has. The core
runner already runs every output kind (inject, intercept, rewrite, check, choices, note, state, speaker), with conditions, order,
dependencies, inline/separate, own connection, every-N and manual triggers, and tests for each (`packages/core/src/agents`,
`turn.test.ts`). **What is missing is everything Daniel sees:** a place to make/edit agents, a way to switch them on per story/chat,
and a place for their results in the chat. Plus bringing v1's 69 templates over as **data** (never as code — the app knows no agent by name).

### A1. Library → Agents (beside Trackers)
- **List**, grouped by what the agent does, in plain words (not output kinds):
  *Adds rules to the prompt* (inject: Don't Write for User, Grounded Prose, HTML Toggle) · *Rolls dice on the scene* (inject with chance:
  randomizers) · *Rewrites the reply* (rewrite: Prose Polisher) · *Checks the reply* (check) · *Offers choices* (choices: CYOA, Direction
  Menu) · *Writes a side note* (note: Continuity, Director's Commentary, Actor Interview) · *Rewrites your message* (intercept).
  Each row: name, one-line description, where it is on (count of stories/chats), folder like the rest of the Library.
- **"Add from templates…"**: the big "Add…" window (D-036) listing v1's templates by group, with a preview of the prompt; adding makes an
  editable copy. Nothing is installed or switched on by itself.
- **Editor** (same look as the tracker editor, D-026: cards that open in place):
  1. **What it does** (the 7 plain choices above) and **When** (before the reply / after the reply / every N messages / only when I ask).
  2. **Instructions** — the prompt, with `{{char}}`, `{{user}}`, `{{lastMessage}}`… and a "?" listing the macros.
  3. **Where it goes** — only for "adds rules": the lorebook's "Where it goes" button (D-028: in the chat N back as System/User/AI, before/after the character…).
  4. **What it reads** — last N messages, the cards, the lorebooks, the Scene values, other agents' results.
  5. **When it fires** (folded): keywords, chance %, kinds of generation (normal / swipe / continue), only after N messages, same roll on every swipe.
  6. **Advanced** (folded): separate call vs. written by the main model (inline), its own connection, order among rewriters, token limit,
     for "checks": what happens on a fail (just warn / fix with a rewrite / write the reply again, up to N times).
  - **Try it** button: runs the agent on the last message of the latest chat and shows the result without saving (like Preview Prompt).

### A2. Switching them on — Setup → Agents (story and chat)
- Same rows as Trackers: a switch per agent, "Default · on/off" until changed, **"changed in this chat"** + "Use the story's" (layers D-031).
  The empty "No other agents yet" box goes away.
- Default = off everywhere. Settings → Agents can switch one on for **every** story/chat (the Default layer), like v1's global scope.

### A3. Results in the chat
- **Choices** → buttons under the latest AI reply (not in the text). Click = **sends it as your message**; Alt/right-click = put it in the box
  to edit first. They disappear when you write something else. Swipes keep their own choices.
- **Rewrites** (Prose Polisher, intercept) → the message gets a quiet "polished by Prose Polisher · Undo" line; the original stays as a revision (already stored).
- **Checks** → pass = nothing shown; fail = a small warning mark on the message with the reason (and "Fix" / "Write again" if the agent allows).
- **Notes** (companions) → a new **Notes** group in the Reply tab of the inspector, one card per agent for the message on screen; a
  "Run" button for agents that run only when asked (Actor Interview, Lorebook Scout).
- **Only when I ask** agents also appear in the message's action bar under "⋯ → Run agent ▸".
- Everything an agent did stays in the Reply tab's receipt (it already lists agent runs).

### A4. v1's templates
- Imported once into `apps/desktop/src/starter/agents.json` (translated to English), like the starter trackers (D-017): data the user can edit or delete.
- v1's inline "tracker" templates (Item, Relationship, Time, Status…) become **Scene trackers** where they map cleanly; the others become
  "writes a side note" agents. The ones that do not fit (Pathfinder — needs tools; Expressions — needs sprites; Chatroom/Message Inbox — need
  their own panels) stay out with a note, for later.
- **Import my v1 agents…** (Settings → Agents): reads an exported v1 agent JSON, with a report of what was left out (BLUEPRINT §4.8).

### States
Empty (no agents: "Add from templates…" as the main action) · running (the message shows "Prose Polisher…" like "updating…" of trackers) ·
failed (the receipt says why; the reply is never lost — already true in the core) · many (10+ agents on: Setup groups them by kind, folded).

### Draft v2 — Daniel's decisions (10/30, 16:58)
- **In the chat: the light option** — a "✦ N" button in the chat's toolbar opens a small menu: agents on here, last run (ran / failed / waiting), switch, **Run** for "only when I ask", the note of agents set to "in the agents menu", "+ Turn on another agent…", "Manage". **Keep the full "Agents" inspector tab for later, as a Settings option** (draft section 1, main mock).
- **Notes:** each agent chooses "Under the message" (a closed label under the reply) or "In the agents menu".
- **Rewrite and check:** only a small grey pencil "polished" and an amber triangle beside the speaker's name; details (See the original, Undo / reason, Write again, Ignore) on click.
- **Library → Agents:** a table (Name, What it does, When, On in), kinds as filters, search — **plus other views** ("other view options would be good for the app"): a List view grouped by kind beside the editor. Remembered per computer.
- **Setup per story / chat:** approved as drafted.

### Daniel's answers (10/30)
1. **Almost nothing from v1**: only a few basic examples, one per kind, to test each one. The Prose Polisher will be redone later with another idea. → A4 shrinks to ~7 small starter agents written for Homunculus 2.
2. **Choices: a click sends at once** (right-click puts it in the box to edit).
3. **Notes: he needs to see it first** → draft with three placements (A Reply tab · B own Notes tab · C under the message, folded): artifact "Homunculus Agents Draft".
4. **v1 compatibility only if it sacrifices NOTHING** of our app → no v1 importer in this slice.

## Story setup simplification — CODEX, 2026-10-29 · D-045

Daniel asked to remove Prompt blocks from the Story screen and put narrator placement near the narrator, subtly. Implement his explicit direction with the current palette, system control font, spacing and semantic tokens; no new visual theme. Reference draft: `docs/drafts/story-narrator/quiet.html`, with closed/open states using the narrator shown in Daniel's screenshot.

```
Cast
  Narrator · Isekai RPG                         Change…
    ▸ Prompt placement                            Card
  NPCs                                         + New NPC
```

The narrator remains primary; one quiet disclosure row underneath shows placement and an optional repeat summary. Placement/depth/role/order/reset are hidden until requested. Keep standard keyboard focus and disclosure semantics. Remove the full block list from Story/Kit, including creation; retain the preset picker and Library preset editor. Do not delete existing setup patches or change generation. Chat Prompt editing stays available. Validate closed/open states, save/reopen/inheritance, keyboard access and narrow widths. Signed: **CODEX**.

## Functional rounds 4–5 — CODEX, 2026-10-29

**Daniel's correction (D-044, CODEX):** retain the block editor but save pending text on blur, collapse, scope change and leaving the view; Cancel explicitly discards only pending text. For trackers, use one visible **Export Set** action outside the field-selection disclosure, beside **Import Sets**. Export always includes the current complete set, independent of selection. Rename the existing selection disclosure **Copy or move fields**. Daniel confirmed the Homunculus 2 format, not compatibility with the original app. Reference: the original `GUIA-FIELDS-SCENE.md` sections 8–9 and `classic-scene-fields.js:exportPreset` export the selected preset as a whole. Keep the existing appearance and transfer behavior.

Daniel authorized continuing the functional plans and reviewing the result on his return (D-041). Keep the current appearance; no new visual direction or Customize work.

- **Prompt:** retain the inspector's existing block list. A scope selector defaults to the current chat/Story; shared-preset edits require selecting that scope. Opening a text block reveals its editor in place. Reset resumes inheritance. Narrator placement uses the existing setup rows. Empty text and disabled blocks remain intentional values; failures are shown beside the controls.
- **Tracker editor:** retain its existing set selector, fields, settings and preview. A closed disclosure, **Reuse fields and sets**, contains selection, destination, Copy/Move, Undo, JSON import/export. Selection is independent of opening a field. Transfers operate within the current tracker; files reuse sets across trackers. Duplicate keys stop the entire transfer. Moving every field is refused. Imports append fresh sets after validating the whole file; nothing existing is overwritten. Changes remain a draft until Save. Long lists use the editor's existing scrolling area.
- **Review:** verify inheritance and actual generation, selection/transfer failures and undo, portable round-trips, invalid imports, existing editor flows and narrow-window layout. Test data stays isolated from Daniel's private app data.

Signed: **CODEX**.

## Collection navigation — CODEX, 2026-10-29 · approved for implementation (D-040)

**Purpose:** choose a character or story, inspect it, and continue a chat; find reusable resources predictably. Daniel approved the latest draft after rejecting a version that gave every interactive row a heavy outline.

**Hierarchy:** Stories and Characters are peer destinations. Library contains grouped reusable resources; Recent is a shortcut list. Category groups are quiet static headings; categories are brighter indented rows with a restrained selected marker. Collection headers own creation/import; folder controls own organization; selecting a card reveals its details and existing actions.

**States:** empty collections retain creation guidance; empty folders retain the path and creation controls; name search spans folders and has a no-match state; Recently played uses actual chat activity; long names wrap/truncate without hiding actions; existing loading/error notices remain. Resource editors and all existing actions remain accessible, including Trash.

**Implementation:** one shared collection toolbar, the existing card/sheet and folder components, and a grouped Library shell around existing pages. Quiet supplies the approved appearance; navigation and visual defaults are data/tokens. Full chat/Scene/Settings redesign and Customize are outside this approval.

**Content and review:** the draft used the screenshot and organization export supplied in this chat. Implementation verification uses the app's isolated built-in test data; no private play folder or keys are accessed.

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

---

## Regex scripts (D-060) — step 1, text plan (2026-11-01)

**What it is for:** text that changes by itself — hide tags, format actions, clean up what the AI writes, change what the AI is sent. **When Daniel looks at it:** when importing a SillyTavern preset or card that brings scripts, and when a reply shows something odd.

**Where it lives**
- **Library → Regex** (new, beside Lorebooks): the global scripts, in order (drag to reorder; order matters). "Import" (SillyTavern: one script, a list, or settings.json) and "New script".
- **Preset editor → Regex** and **Character editor → Regex**: the same list for the scripts that came with them (these run after the global ones).
- **Prompt tab** (inspector): one line "Regex: Global 3 · Preset 2 · Character 1", each opens its list.

**A script, closed (one row):** switch · name · what it touches in words ("AI replies, Lore") · a chip only when it is not the default ("Only on screen", "Only for the AI", "Not on edit", "Depth 0–3") · broken pattern = red "Pattern error".

**A script, open (in place, like lorebook entries):**
1. **Name**
2. **Find** (monospace; `/pattern/flags`; the error is named under it, live) · **Replace with** (help line: `$1`, `{{match}}`, macros)
3. **Applies to:** chips — User messages · AI replies · Lorebook entries · Reasoning · Commands
4. **It changes:** one choice — *The saved message* (default) · *Only what I see* · *Only what the AI gets* · *What I see and what the AI gets*
5. **More** (closed shows a one-line summary): Run on edit · Macros in Find (No / Yes / Yes, escaped) · Only messages from depth __ to __ · Remove from groups (trim strings)
6. **Try it:** a text box (starts with the last AI reply) → the result beside it, matches highlighted.
7. Duplicate · Delete · Export for SillyTavern

**States:** empty ("No scripts. Import from SillyTavern or make one"), normal, full (30+ scripts: search by name/pattern), error (pattern error on the row; a slow script is paused with a notice "“<name>” was too slow and was paused").

**Daniel's answers (2026-11-01):** 1. Library → Regex. 2. Ask every time there is a new script ("so it doesn't mess up the app's view"). 3. Render HTML. Built the same day (D-060 round 2; draft skipped with his OK: "do it the way you think is best").
