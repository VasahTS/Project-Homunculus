# BLUEPRINT — Homunculus 2 (the full design)

Author: CLAUDE. v1 on 2026-10-27; **v2 on 2026-10-27** (critical review Daniel asked for: gaps in data, agents, prompt, performance, security, cost). Status: **approved by Daniel** (§12 questions answered; Style Reviewer added).
This is the map of the whole app. Every new feature has to fit here; if it does not, first the blueprint changes (and it is recorded in `DECISIONS.md`), then the code.
Written in English like everything in the repository (D-038; it was in Portuguese before, as an exception to D-004).
Related: `ARCHITECTURE.md` (how the core is built), `DECISIONS.md`, `docs/reference/` (where to look in the other apps).

---

## 1. The idea in one sentence

**A small core that runs "turns", and everything else is combinable pieces** — characters, personas, presets, lorebooks, agents, trackers, companions — that the user puts together the way they play: per campaign, per short session, or as the default.

Principles that settle doubts:

1. **As flexible as the user plays.** A preset, a tracker or an agent can apply to *everything*, to *one campaign* or to *one session*; the most specific layer wins (§3).
2. **Agents are citizens of the app, not patches.** One format, one place where they run (the turn), organized and visible results. Homunculus v1's 69 templates come in by **import** — the app does not adapt itself to them.
3. **Everything that happens at a message is tied to that message** (D-001, extended). Swiping, going back or branching always shows everything right.
4. **Nothing is lost in silence.** Every rewrite can be undone, every edit has history, every delete goes through the trash, and the app can always show *what was sent to the AI and why*.
5. **Cost under control.** Agents run in parallel and with cheap models, but with clear limits per connection and per agent; the user sees how much each session spent.

---

## 2. The pieces (the data model)

### 2.1 Library — reusable things

| Piece | What it is | Important details |
|---|---|---|
| **Character** | A character (an ST card inside) | **Variants** (§2.5). Keeps the original card to export without loss (D-012). |
| **Persona** | Who the user is in the story | Same variant mechanism. Its own picture. |
| **Preset** | The prompt's recipe: ordered blocks + AI parameters | Import/export of ST Chat Completion presets. **Style variables** (`{{pov}}`, `{{tense}}`…). |
| **Lorebook** | Entries activated by keywords | Activation **the same as ST's**; our extension: also activate **by world state** (§5.3). |
| **Agent** | An AI helper (§4) | It is **data** (editable, importable). |
| **Tracker schema** | The fields a tracker follows | Draws the panel and defines what the tracker fills (§4.5). |
| **Kit** | A named saved setup: "RPG campaign", "Drama", "Light chat" | Applying a kit **copies** the values into the layer (§2.6). |
| **Connection** | Provider + address + model (+ limits, §7.3) | Key in the OS keychain (D-011). |
| **Scenario** (Vault) | Setting, NPCs, openings, lorebooks, starting time | Starts a campaign or session. |
| **NPC sheet** (Vault) | An NPC's sheet | Can become a Character. |
| **Regex script** | Find/replace in the text (display, prompt or both) | Import from ST; also used by agents. |

### 2.2 Play — where the story happens

```
Story (optional, in the Vault) ──< Session ──< Message (tree) ──< per-message records (§2.4)
   │ narrator (Vault / card / own)       │ session setup
   │ NPCs (Vault) + optional cards       │ cast (character + variant + presence), extra NPCs
   │ scenario + openings                 │ persona (+ variant), user's role
   │ user's role, story setup            │ branches, markers ("save points")
   └ the story's sessions                └ agents' memory space (in the state, §4.7)
```

- **Story** (D-029, replaces "Campaign"): a narrated story, an area separate from 1:1 chats. Told by a **Narrator** (not a character: a Vault item with instructions, style, "may bring in new people" and a per-turn instruction; the **Simple Narrator** comes with the app; or one of the user's cards; or written just for it). It has **NPCs** (light Vault sheets with the per-character fields of a Scene: Characters set, without the "Now" ones; the same NPC can be in several Stories and chats; "Make a Copy"), optional cards (they go in as they are), Scenario, openings, the user's role (*player / coauthor / director*) and the "story" setup layer. Each Play creates a session. Continuing from the final state of another session: later.
- **Vault** = Stories, Narrators, NPCs (story pieces). **Library** = what belongs to the ST format and to the engine (Characters, Personas, Lorebooks, Presets, Trackers, Trash). A lorebook is only lore.
- **Session**: one conversation — cast (members with a variant, *In scene / Offscreen / Off*, *muted*, a sheet for the narrator; or a **narrator**), the user's role (*player / coauthor / director*), persona + variant, its own setup.
- A 1:1 chat, a group and a narrated adventure are **the same system** with a different cast.

### 2.3 Messages — kinds and visibility

Not every message is "speech". Each message has a **kind** and a **visibility**:

| Kind | Example |
|---|---|
| `user` | the player's speech/action |
| `direction` | an order from the coauthor/director ("make them argue") |
| `reply` | the AI's reply (who spoke — character or narrator — is in the `speaker` field) |
| `ooc` | an out-of-character note (stays visible, may not go to the AI) |
| `event` | a system marker: "3 days passed", "new scene", "chapter 2" |

Visibility: **for the AI** (yes / no / summary only) and **for the user** (visible / hidden). This replaces v1's various workarounds (OOC blocks, hiding summarized messages).

### 2.4 What is tied to each message

| Record | Example | What for |
|---|---|---|
| `state delta` | "time: 21:40", "Lyra.outfit: wet cloak" | Swiping/going back shows the right world (D-001). |
| `agent run` | "Prose Polisher: ok, 1.2 s, model X, 340 tokens, output Y" | See what each agent did, run it again, debug, cost. |
| `revision` | original × rewritten (by an agent **or by the user**) | Undo any rewrite/edit. |
| `companion note` | summary, director's comment | The panel shows the note of the current swipe. |
| `generation record` | model, parameters, **prompt sent** (compressed), which block each piece came from, tokens, cost, time | "See the prompt" of **any** message, not just the last one; compare swipes. |
| `reasoning` | the "thinking" of thinking models (e.g. Daniel's GLM thinking) | Kept separately: show/hide; **never** goes back into the prompt history. |

**Old messages edited:** if the user edits message N (or a panel value at N), the records of the messages **after N** may become outdated. The app marks those as **"outdated"** and offers "recalculate from here" — it never recalculates by itself (it would spend tokens without asking).

### 2.5 Variants (Daniel's option B)

- A Character (or Persona) has **one or more variants**: "Lyra — fantasy", "Lyra — modern". The first is the main one.
- A variant keeps **only what changes** from the main one. Editing the main one updates whatever the variants did not change.
- **Each session picks the variant** of each cast member (and of the persona).
- Export to ST: exports **one variant** as a normal card.

### 2.6 General library rules

- **Live reference × copy.** Sessions and campaigns **point** to library items (editing a lorebook applies to everyone using it). **Kits and scenarios are copied** when applied (changing the kit later does not touch campaigns already created). The app shows "used in 3 campaigns" before editing something shared, with an option **"duplicate and edit only here"**.
- **History for everything**, not just characters: presets, lorebooks, agents, schemas and kits keep versions; they can be compared and restored. **Done for characters and personas** (2026-10-28, D-019: table `item_history`); the others join when they get an editor.
- **Trash**: deleting sends to the trash (characters, sessions, messages, items); it only disappears for good when emptied. Deleting something in use warns who uses it. **Done for sessions, characters and personas** (D-019), with "Undo"; trackers and messages join later.
- **Packages to share**: export a whole campaign (cards, lorebooks, kit, agents, schemas) as **one** Homunculus file, and import it. Our own versioned format (Aventuras' lesson: do not cram everything into an ST card). Cards/lorebooks/presets still export in ST's format too.

---

## 3. Layered setup — the heart of the flexibility

Everything that configures the way of playing lives in a **Setup**:
preset · persona · extra lorebooks · agents · trackers (and their fields) · companions · story style · main connection and agents' connections · rules for who replies · narrator and opening · cost limits · rules for when trackers run.

```
  Default (what I always use)
     ↓ overridden by
  Campaign
     ↓ overridden by
  Session
```

- Each item is **"inherit"** (empty) or a value. The lowest layer with a value wins.
- Lists (agents, lorebooks, trackers): **keep the ones above / only these / add** (+ these − the unticked ones).
- The UI shows **where each value came from** and a "go back to inheriting" button.
- **A single function** resolves the setup (`resolveSetup`). Nobody else reads layer by layer.
- The setup **changes mid-session** (turning a tracker on at message 200) and applies **from then on**; the generation record (§2.4) keeps which setup was used for each reply.

Daniel's examples:
- **A full RPG campaign**: kit "RPG" → world trackers, **money**, inventory, **quests**, **factions**, reputation; Game Master preset; narrator. Every session of the campaign inherits.
- **A normal session, another focus**: kit "Drama" on the session → **emotions** and **relationships** trackers; no money or quests.
- Both use **the same mechanism**: pick/edit schemas, never program.

---

## 4. Agents — a single model, made for the app

### 4.1 The format: trigger → input → output

Every agent (built-in or the user's) is **a trigger**, **what it reads** and **where the result goes**, plus options.

**Triggers** (when it runs):
| Trigger | Example |
|---|---|
| `turn.before` / `turn.parallel` / `turn.after` | before, together with or after the main reply |
| `every N messages` | a chapter summary every 40 messages |
| `state change` | "the place changed" → describe the new surroundings |
| `session start` / `chapter end` | set up the opening; close the chapter |
| `manual` | a button in the UI or in the panel |

**Inputs** (what it reads): the last N messages · active cards and lorebooks · world state · **other agents' results** (see dependencies) · its own memory (§4.7). All with a token limit.

**Outputs** (where the result goes):
| Output | What it does | v1 examples |
|---|---|---|
| `inject` | text that goes into the main reply's prompt | Don't write for user, HTML toggle, randomizers |
| `intercept` | rewrites the user's message before sending (keeps a revision) | v1's intercept mode |
| `rewrite` | rewrites the reply (keeps a revision, undoable) | Prose Polisher |
| `state` | structured data → world state, validated by schema | all trackers |
| `note` | its own note in the agent's panel; can go back into the prompt | companions |
| `check` | approves or rejects the reply, with a reason → **warn**, **fix** (calls a rewrite) or **generate again** (with a retry limit) | Continuity Checker |
| `choices` | options that become **clickable buttons** in the UI, outside the text | CYOA, Direction Menu, Reply Ideas |
| `proposal` | proposes changing library data (card, lorebook, vault) → **the user approves or rejects** | Lorebook Keeper, Card Evolution (Marinara) |
| `speaker` | decides **who speaks now** in a group | ST's natural/pooled order, Marinara's decision |
| `media` (later) | image, music, voice | Illustrator (Marinara) |

**Options that apply to any agent:**
- **How it runs**: `separate` (its own call, can be a cheap model) or `inline` (the main model writes a block together with the reply and the app **strips** and keeps it — a single call; it is how 36 of v1's 69 templates work). Inline saves money, but makes the main reply longer and may worsen the writing; the default for new trackers is `separate`.
- **Tools** (`tools`): an **ability**, not a kind — any agent can get tools (search the lorebook, read old messages, query the state). The Pathfinder is an `inject` agent with tools.
- **Conditions**: trigger words, probability, generation type (normal, swipe, continue, impersonate), the user's roles, only if a state value is X.
- **Dependencies**: "run after X and read its result" (e.g. Relationships → Director). The runner sorts the order; cycles are refused on save.
- **Connection**: the setup's or its own.
- **Limits**: maximum tokens per run, only after N messages, at most X runs per turn.
- **Luck and swipes**: random agents can **draw again on every swipe** or **keep the same draw** (seed tied to the parent message).
- **Output validated** by schema before saving (already in the core). A malformed reply → one automatic repair attempt, then a visible failure.

**Built-in** agents (modules) and **user** agents (data) use the same format; the runner cannot tell them apart.

### 4.2 Phases inside a turn

`before` runs **in parallel** (grouping agents of the same connection into a single call, Marinara's idea). `after` runs in **two waves**: first the ones that touch the text (`rewrite` and `check`, **in sequence**, in the set order), then the ones that only read (`state`, `note`, `choices`, `proposal`, **in parallel**), so the trackers read the final text.

### 4.3 Example combinations

- **Relationship tracker**: `turn.after` → reads 6 messages + state → `state` (a "per pair" schema: affection, trust, tension).
- **Story director** (Daniel's Story Director): `turn.after`, depends on the plot tracker → `note` + goals memory (§4.7) → on the next turn `inject` "steer the story toward beat X".
- **"Don't write for the user" guard**: `turn.after` → `check` → if it fails, `rewrite` fixes only that part.
- **Chapter summary**: `every 40 messages` → `note` + marks the summarized messages as "summary only for the AI" (§2.3).

### 4.4 Style Reviewer (Daniel's request, 2026-10-27)

A reviewer of the AI's writing style, along the lines of SillyBunny's Prose Polisher, but stronger. Reference: **fiction-prose-style** (github.com/unkarelian/fiction-prose-style, MIT license, commit 2f5947ac from 2026-10-24) — a prose standard blind-tested with a real reader, which goes after the *shapes* of sentences typical of AI ("It wasn't X. It was Y.", double echo, the witty closer, the narrator explaining the scene, every scene ending in calm…).

Its big idea, which we adopt: **two halves**.
1. **Counting (no AI, free)**: code reads the last messages — or the chapter — and counts what a model does not notice by itself across many replies: **repeated phrases**, words used far more than normal, rhythm (all short sentences or all chained with "and"), density of comparisons, paragraph closers. It compares against a **reference** (texts the user marked "liked"; starts with the project's reference).
2. **Judgment (agent)**: a reviewer that **only points out** passages that match the guide's banned shapes, without rewriting (their `REVIEWER.md`).

How it fits our agent model (§4.1), with nothing special:
- **Counting** = a module's code, runs every turn over the recent window (zero cost).
- **Reviewer** = an agent with `check` output, trigger `every N messages` or `manual`; the result shows in a **report** with the marked passages.
- **Back into the story** in three ways, by choice: `inject` ("avoid these phrases and shapes in this reply" — the cheapest and the most effective against repetition), `rewrite` only of the marked passages (the Prose Polisher), or just the report.
- **The style guide is data**: the default comes from fiction-prose-style, but the user swaps, edits or writes their own (it is a block/file, not code).
- **"Liked" on a message** teaches the user's reference rhythm and vocabulary.

Module `style-reviewer`. Aventuras has something similar (`StyleReviewerService.ts`, phrases repeated across entries) — see `docs/reference/aventuras.md`. The counter is Python (`scripts/prose_check.py`); port it to TypeScript with credit in `CREDITS.md` (MIT).

### 4.5 Trackers and the Scene panel (editable and in the UI)

- Tracker = an agent with `state` output + **Tracker schema**.
- The panel is **drawn from the schema**: a new tracker gets a panel without programming a screen.
- **Field types**: text · number (coins) · 0–100 gauge (affection) · status (quest *active/done/failed*) · item list (inventory with quantity) · **story date/time** (with a calendar, like v1) · **per character** (one value per cast member) · **per pair** (A→B) · field group.
- Each field has: a label, help ("?"), whether the tracker can change it by itself or **only the user** (locked), and whether it goes to the prompt.
- **Field owner**: each state namespace has **one** owning tracker; the others only read. This keeps two trackers from fighting over the same value.
- **User edit** → a user delta at that message (or a **pin**, which applies on every branch). A user edit always wins over the tracker's at the same message.
- Goes back into the prompt as a short summary ("current scene" marker), with a token limit.
- **Daniel's rule (2026-10-27): no tracker with a fixed name or function in code.** The app does not know *what* is followed; the user creates the tracker and its fields on screen, and it works however they want. Examples like RPG (money, quests, factions) or Drama (emotions, relationships) are just **configurations the user builds** — if they ever come ready-made, they come as **optional data** (a file to import or a Kit), never as code.
- **Starter trackers (Daniel's request, 2026-10-27, D-017):** v1's — **Scene: World** (Standard, Survival, Minimal), **Scene: Characters** (Standard, **Fantasy** — new: race, class, level, health, mana, affinity, skill slots, skills, spells, equipment, conditions —, Superpowers, Sci-fi, Minimal) and **Scene: Plot** — come **as editable data** (`apps/desktop/src/starter/trackers.json`), installed once; the engine still does not know what they are. **Scene: Map** waits for the map screen (World Map, "later" in §10): it only replies with what changed and needs coordinates and routes.
- **Field sets**: a tracker can have several field sets; the session picks one (`agentOverrides[tracker].schemaId`), otherwise the tracker's default applies. Fields with the same key keep their value when switching sets. Fields have a **section** (only groups in the panel and the prompt), **"always filled"**, and lists can have **columns** (quests: title/status/note). A set says **who has per-character values**: only the cast, cast + user, or **anyone the story names** (the tracker adds NPCs). Optional: the field that says **who is in the scene** — whoever is not goes to the prompt by name only.
- **Proof of concept done (2026-10-27):** `packages/core/src/trackers.ts` (the engine only reads the schema) + tracker editor + Scene panel. See `DECISIONS.md` D-016.

### 4.6 Companions

An agent with `note` output: notes per message, its own panel, can feed the next prompt and read other agents' notes. v1 examples: Memory Shard, Director's Commentary, Continuity.

### 4.7 Agents' memory

Notes per message are for "what happened here". For things that **last** (long-term goals, planted secrets, planned beats), each agent has **its own space inside the world state** (namespace `agent:<id>`). Since it is state, it works with swipes and branches with nothing new.

### 4.8 Importing Homunculus v1's agents

Module `homunculus-v1-agents`: translates `phase`, `execution`, `injection`, `postProcess.extract/regex`, `conditions`, `companion` into the format above. v1's inline trackers become `state` with a **schema inferred** from the block they extracted (when possible). The ones that do not fit show a notice of what was left out.

### 4.9 Library Assistant (Daniel's idea, 2026-10-27 — **to build later**)

A chat with an AI that **creates and edits library things for you**, in the style of **Aventuras' VaultAssistant** (studied at commit `d98ad752`, see `docs/reference/aventuras.md` §2). Example requests: "make a world tracker with time, weather and place", "make a per-character tracker the way I describe", "improve Lyra's description", "write a lorebook entry about the guild".

**What Aventuras does that is worth copying** (the idea, not the code):
- **A streaming chat**, folded reasoning, and the **tools the AI used** showing as cards in the conversation.
- **Every change is a proposal**: the AI never saves by itself; a card shows "before → after", and the user **approves, rejects or edits** before approving (several can be approved at once).
- **The tools see the "effective" library**: what is saved + the proposals not yet decided + what the user typed and did not save. So the AI never works with stale data.
- **Tools loaded by category when needed** (`load_toolset`: characters, lorebooks, scenarios…), so the prompt stays small.
- **Opening from an editor** already focused on that item (the item's record goes along, and is only resent if it changed).
- **Saved conversations**: list, rename, continue later.
- **Its own settings**: API profile (empty = the story's), model, temperature, **reasoning effort**, manual request body; the **system prompt is editable**. A limit of tool steps per message (they use 50).

**How it fits our design** (answers to §13):
1. **Piece (§2)**: not a new data piece — it is an **agent**: `manual` trigger, with **tools** (`tools`), `proposal` output (§4.1). Only the **"assistant conversation"** record is new (messages + proposals and what was decided), kept in the library.
2. **Setup layer (§3)**: the assistant's settings (connection/profile, model, effort, temperature, prompt) live in the **Default**; they can be changed in the assistant's own panel.
3. **Turn step (§6)**: none — it runs outside turns, when the user talks to it.
4. **Core or module (§8)**: module `library-assistant`. Each item type brings its tools (e.g. the trackers module registers `list_trackers`, `read_tracker`, `create_tracker`, `update_tracker_fields`, `switch_on_in_session`).
5. **Tied to the message (§2.4)**: no; proposals are tied to the assistant conversation. On approval, the item gets an entry in its **history** (§2.6), so it can be undone.
6. **Failure / cost / undo**: nothing is saved without approval; a tool error shows on the card; tokens and cost per conversation visible; a step limit; undo through the item's history.

**Trackers through the assistant** (Daniel's explicit request): the user describes what they want ("a world tracker…", "one per character…") and the AI proposes **a complete tracker** — name, instructions, fields with type, scope (one value / per character / per pair), ranges, options, locked, goes to the prompt. The proposal shows **like in the tracker editor** (and with a preview of how it looks in the Scene panel); approve = save; an extra "turn on in this session" button. The rule still applies: nothing ready-made in code — the assistant only **builds data** from the request.

**Needs first**: (a) ✅ **named connection profiles** (done 2026-10-28, D-020: address, key in the keychain, model, **reasoning effort**, limits, backup); (b) agent **tools** really working (slice 5; today they are only a contract); (c) `proposal` output with an approve/reject screen; (d) library item history (slice 1). **Suggested fit**: right after slice 5, together with slice 6 (trackers + Scene panel) — see §10.

---

## 5. The prompt

### 5.1 Blocks

A **Preset** is an ordered list of **blocks** (role system/user/assistant, position in the list or "N messages from the end", on/off).
- The user's **text blocks** (with macros).
- **Markers** filled by modules: card, persona, examples, history, World Info before/after, cast, current scene, chapters, story style, role instructions, agents' injections.
- A marker that is on but has no place in the preset → **default position** + a notice "placed automatically — pin it in the preset?". It never disappears silently.
- ST import: `prompt_order` + prompts → blocks; a test compares our prompt with ST's.
- **"See the prompt"** of any message (§2.4), showing where each piece came from and how many tokens.

### 5.2 Context budget (missing in v1)

The prompt has a maximum size. When everything does not fit, **a budget manager** decides what to cut, always the same way and visibly:
- each marker has a **priority** and a **ceiling** (e.g. World Info ≤ 25%, current scene ≤ 800 tokens, chapters ≤ 15%);
- the message history takes what is left, newest to oldest;
- what was cut shows in "see the prompt" ("3 lorebook entries were left out for lack of space").
Token counting: an estimate per model; exact when the provider reports it.

### 5.3 Macros and state

- A macro engine with the same syntax as ST (`{{char}}`, `{{user}}`, `{{random}}`, `{{if}}`, variables…).
- **State macros**: `{{state.world.time}}`, `{{state.relationships.Lyra.trust}}` — presets, agents and lorebooks can use the world state.
- **Lorebook by state** (our extension): an entry can require a condition ("only if the place is the Tavern"). Without a condition, activation is identical to ST's.

### 5.4 Order that saves money (provider cache)

Providers charge less when the **start** of the prompt is the same as the previous call's. The builder puts first what changes little (instructions, card, persona) and last what always changes (current scene, injections, recent history) — Aventuras' idea. It is the default of the built-in presets; presets imported from ST keep their own order.

---

## 6. A turn, from the click to the end

**Generation types**: `normal` · `swipe` (another version of the same reply) · `continue` (continue the last one) · `impersonate` (the AI writes *your* line) · `let them act` (a turn without the user speaking) · `quiet` (agents only, nothing shows in the chat).

```
 1. The user sends (or swipe / continue / impersonate / let them act / auto-play)
 2. resolveSetup(session)                  → preset, persona, agents, trackers, connections, limits
 3. BEFORE   (parallel, grouped by connection)
      intercept → the user's message rewritten (revision)
      inject (+ tools) → texts for the prompt; Pathfinder picks entries
      speaker  → in a group, who speaks now
 4. Lorebook scan (ST rules + state conditions)
 5. Prompt assembly: blocks + context budget (§5.2) + inline agents' instructions
 6. Main reply streaming  ── PARALLEL runs alongside
 7. Save message + generation record + reasoning; strip inline blocks → data
 8. AFTER, wave 1 (sequence): rewrite, check (can fix or ask for a new generation)
    AFTER, wave 2 (parallel):  state, note, choices, proposal
 9. Non-turn triggers: every N, state change, chapter end
10. Events → the UI updates the Scene panel, companions, choice buttons, status and cost
```

Rules:
- **Only step 6 is fatal.** An agent that fails → the reply stays, a visible notice, a "try again" button.
- **Stop** cancels everything in the turn, agents included; the partial text stays (already exists).
- **Swipe** repeats from step 3. The setup decides whether trackers run on every swipe or only when the story continues.
- **Auto-play** has a turn and cost limit, and stops on any error.
- The turn is **a core piece** (`TurnPipeline`), testable step by step with the offline AI (D-009).
- **One generation per session at a time**; different sessions can generate at the same time (read one while another generates).

---

## 7. Things that cut across everything (missing in v1)

### 7.1 Performance
- **State with periodic "snapshots"**: rebuilding the state by adding deltas since message 1 gets slow in chats with thousands of messages. The core keeps a snapshot of the state every ~50 messages and adds only from there (a cache; can be recreated any time).
- **Long chat**: the screen only draws the visible messages; thumbnail avatars.
- **Database**: indexes on the per-message tables; old prompts stored compressed.

### 7.2 Security (imported content is unknown)
- **HTML coming from the AI or from agents** (Daniel's render agents) runs **in an isolated box** (an iframe with no access to the app or the network). Pretty, but harmless.
- **Regex** with a time limit (a bad regex does not freeze the app).
- Imported agents **do not run code** — only prompts, schemas and rules. Code only in modules.
- Keys only in the keychain (D-011); never in exports.

### 7.3 Cost and limits
- Each **Connection** has: maximum simultaneous calls, wait between calls and a **backup connection** (if the main one fails, it tries the backup — Marinara's idea).
- Cost per message, per agent and per session, when the provider reports price/usage.
- An optional cost limit per session/auto-play.

### 7.4 Data: backup and import
- An automatic database backup before upgrading (already exists, D-008) + **scheduled backup** + "export everything".
- **Import the whole SillyTavern/Homunculus v1 folder** at once (cards, personas, lorebooks, presets, chats), with a report of what came in and what did not.

### 7.5 Tests
- "Same as ST" tests for the prompt and lorebooks (same input → same result).
- An offline AI to test whole turns without spending tokens (already exists).
- UI click tests before delivering (D-007).

---

## 8. Where each thing fits

**Core** (`packages/core`): data and database · events · `resolveSetup` · `TurnPipeline` · agent runner (triggers, dependencies, waves, limits) · per-message state (+ snapshots) · prompt builder + budget · macro engine · per-connection limits · extension points.

**Extension points**:
| Already exists | To create |
|---|---|
| `registerAgent`, `registerMacro`, `registerPanel`, `registerSetting`, `registerProvider`, `registerCharacterImporter/Exporter` | `registerPromptBlock` · `registerTrackerSchema` · `registerFieldType` (a new field type in the panel) · `registerAgentTool` · `registerAgentOutput` (a new output, e.g. `media`) · `registerTrigger` · generic `registerImporter/Exporter` · `registerSetupField` |

**Modules**:
| Module | Does |
|---|---|
| `provider-openai` ✅ | OpenAI-compatible AI |
| `st-cards` ✅ | PNG/JSON cards V1–V3 |
| `personas` ✅ | personas, variants (core + screens); ST import in the `st-personas` module |
| `st-presets` ✅ | ST CC presets (import/export, D-021) |
| `lorebooks` ✅ | activation the same as ST + state conditions (core `lorebook.ts`) + import/export (module `st-lorebooks`) — D-027 |
| `st-import` | import the whole ST/v1 folder |
| `scene` | World/Characters/Plot trackers + field packs + panel |
| `companions` | panel and notes |
| `homunculus-v1-agents` | imports the 69 templates |
| `memory-chapters` | chapters + `chapters` marker — study of the references (a friend's/Jev's, Marinara, Summaryception) in `docs/MEMORY-PLAN.md` (10/29, nothing approved) |
| `story-style` | pov/tense/length/tone + marker |
| `roles` | coauthor/director, let them act, auto-play |
| `group-turns` | who speaks now (ST's orders + `speaker` agent) |
| `vault` | scenarios and NPCs |
| `card-browser` | Chub, JannyAI, Wyvern… |
| `regex-render` | regex + HTML in an isolated box |
| `guided` | guided corrections and replies |
| `style-reviewer` | repetition/rhythm counting + reviewer agent + editable style guide (§4.4) |
| `card-scripts` (later) | card scripts in the isolated box, with permission (§12) |
| `world-map` / `calendars` (later) | v1's world map and calendars |
| later | `recall` (embeddings in Rust), `pathfinder`, `conversation-mode`, `media`, themes |

---

## 9. Homunculus v1 → Homunculus 2 inventory

| v1 feature | In H2 | How |
|---|---|---|
| In-Chat Agents | ✅ | §4 + import |
| Companions | ✅ | §4.6 |
| Pathfinder | ✅ later | `inject` agent with tools |
| Group Studio | ✅ | Story page (D-029) |
| Narrated mode + cast sheets | ✅ | cast with a narrator + `sheet` |
| Roles, Let them act, auto-play | ✅ | `roles` |
| Editable Scene panel | ✅ | §4.5 |
| Group bar | ✅ | session bar |
| Group settings that switch on open | 🔄 | **Layered setup** (§3) |
| Vault | ✅ | `vault` |
| Memory: chapters | ✅ | `memory-chapters` |
| Memory: Recall | ✅ later | `recall` |
| Card Browser, Quick Connection | ✅ | modules |
| World Map, calendars | ✅ later | `world-map`, date/time field type |
| OOC blocks | 🔄 | `ooc` message kind (§2.3) |
| Prompt inspector | 🔄 | "see the prompt" of any message (§2.4) — the inspector's **Reply** tab (D-018) |
| Sampling parameter policy (per-model parameters) | ✅ | in the Connection |
| Generation that survives a drop | ✅ | partial text already saved; "resume" later |
| Chat archive | 🔄 | trash + search |
| Home, themes, layouts, effects | ✅ UI phase | tokens, profiles and `data-region` (D-018); Quiet profile, data-defined collection navigation and grouped Library (D-040); Customize remains missing |
| Homunculus, Hob, The Ninth Summoning presets | ✅ | built-in content |
| Guided generations | ✅ | `guided` |
| Prose Polisher | 🔄 | part of the **Style Reviewer** (§4.4) |
| Conversation mode | ⏳ later | its own module |
| Card scripts with a sandbox | ❓ | §12 |
| ST extensions, Quick Replies, slash commands | ❌ | modules and agents instead |
| Text Completion/instruct, Horde, Kobold, NovelAI | ❌ for now | only Chat Completion (covers nano-gpt, OpenRouter, compatible local servers) |

---

## 10. Build order (end-to-end slices)

Each slice ends with: tests passing, Daniel testing on Windows, a check against this blueprint.

| # | Slice | Daniel can… |
|---|---|---|
| 0 | **Align the foundation** (§11) | — (the right base) |
| **PoC** ✅ | **Proof of concept** (done 2026-10-27, D-016): a session with a tracker **created by the user on screen** (any field), made only of data, a minimal editable panel, right on swipes, a record of what the agent did | see the heart of the design working early; if there is a hole, it shows here |
| 1 ✅ | **Character** variants; **Personas** with variants + ST import; history and trash (done 2026-10-28, D-019) | Lyra fantasy/modern; a persona per session |
| 1b ✅ | **Settings** + named **connection profiles** (done 2026-10-28, D-020) (several addresses/keys/models, reasoning effort, limits, backup) — Daniel's request 2026-10-28; also a prerequisite of §4.9 | pick the connection per session and per agent |
| 2 ✅ | **Block presets** + macros + budget + ST import + "see the prompt" (done 2026-10-28, D-021) | use his ST presets and see the exact prompt |
| 3 ✅ | **Lorebooks** the same as ST + state conditions — engine, import/export and prompt (2026-10-28, D-027; compared with ST's code) and screens (2026-10-29, D-028) | use his lorebooks |
| 4 ✅ | **Stories + Vault (Narrators, NPCs)** + the "story" setup layer (2026-10-29, D-029); Kits came later (D-036) | narrated stories with a narrator and reusable NPCs; Director mode |
| 5 | **Full agents**: triggers, inject/intercept/rewrite/check/choices outputs, dependencies, limits; import of v1's templates | Prose Polisher, Don't write for user, CYOA as buttons… |
| 6 | **Trackers + Scene panel** (World, Characters, Plot, RPG/Drama packs) | play with the Scene panel |
| 6b | **Library Assistant** (§4.9) — a chat that proposes and edits characters, lorebooks, **trackers** etc.; its own API profile, model and effort | ask "make a per-character tracker like…" and approve |
| 7 | **Groups and narrator**: full cast, roles, who speaks, let them act, auto-play, style | narrated adventures |
| 8 | **Companions**, **memory** (chapters, agents' memory), **proposals**, **Style Reviewer** | companions, chapters, Story Director, style review |
| 9 | **Vault**, **Card Browser**, Quick Connection, **import the ST/v1 folder**, campaign packages | bring everything from v1 at once |
| UI ✅ | **UI direction "I"** brought forward (done 2026-10-27, D-018): Sessions/Library sidebar, Scene/Prompt/Reply inspector with the "receipt", tokens + appearance profiles | a pleasant app to use, still changeable |
| 10 | **UI phase** (Customize screen: profiles, layouts, effects, import/export; Blood & Ink theme; Home; native menu) | the app beautiful and his way |
| later | Recall, Pathfinder, World Map, Conversation mode, media | — |

---

## 11. What changes in the existing code (slice 0) — ✅ DONE on 2026-10-27

Checked on 2026-10-27 against `packages/schemas` and `packages/core`, and implemented the same day (D-015; details in `ARCHITECTURE.md`). Left for later on purpose: `check` with `fix` acts as `warn` until the fixing rewrite exists (slice 5); tools and prompt markers are only contracts (slices 2 and 5); who speaks uses only the natural order or the `speaker` agent (slice 7).

| Today | Adjustment |
|---|---|
| `Session` with loose `presetId`, `personaId`, `lorebookIds`, `agents`, `settings` | `setup: SetupLayer` (everything optional = inherit) + `storyId?` + `npcIds` |
| `CastMember` = `characterId`, `role`, `active` | + `variantId`, `presence`, `muted`, `sheet?` |
| `Persona` = name + description | variants, picture (same format as Character) |
| `Message.speaker` + free `meta` | + `kind` (user/direction/character/narrator/ooc/event) and `visibility`; `reasoning` separately |
| `AgentDefinition` with `trigger` before/after/manual, code only | `AgentConfig` schema (data): triggers, inputs, outputs, options (§4.1) |
| `runAgents`: all in parallel, only writes a delta | runner by phase and waves, dependencies, limits; tables `agent_runs`, `message_revisions`, `companion_notes`, `generation_records` |
| `ChatService.generate` calls agents at the end | `TurnPipeline` (§6); `ChatService` starts using it |
| `WorldState.resolve` adds from message 1 | + periodic snapshots (§7.1); an owner per namespace |
| `PanelDefinition` = only a namespace | `TrackerSchema` + field types |
| `ConnectionConfig` without limits | + simultaneous calls, wait, backup |
| `buildPrompt` v0 and basic `macros.ts` | stay until slice 2 |

Nothing is thrown away: database, per-message state, tree, cards, provider, keychain and screens stay. Validated JSON (D-008) accepts new fields without a migration; new tables come in new migrations.

---

## 12. Daniel's decisions on the open questions (2026-10-27)

1. **Mobile**: he does not play on mobile, but **keep the door open**. The rule that guarantees it: the core and the modules **never** depend on Tauri or on the screen (already checked by `architecture.test.ts`); everything platform-specific (database, keychain, files) sits behind small interfaces. So the core could, one day, run as a local server reached by the phone's browser.
2. **Card scripts** (cards whose messages carry HTML with `<script>`/`<iframe>`: animated status screens, mini-games, health bars inside the chat — common in cards from some Chub communities): he does not know if he will use them; **keep it possible**. Since HTML already runs in an isolated box (§7.2), card scripts become an option of that same box: off by default, on **per card with the user's permission**, with no access to the app or the network (v1 does something similar in `card-script-runtime.js`). It comes as the `card-scripts` module, after the UI phase.
3. **Local models**: he does not use them, but **keep it open**. It already works with any OpenAI-compatible address (LM Studio, KoboldCpp, Ollama, llama.cpp). "Real" Text Completion is possible through `registerProvider` (a new module, without touching the core).
4. **Trackers**: **separate by default**, inline as an option to save money. ✅

---

## 13. The rule so cohesion is never lost

Before building anything new, answer:
1. **Which piece (§2) does it live in?** A new piece goes into §2 first.
2. **Which setup layer (§3) configures it?**
3. **Which turn step (§6) — or which trigger (§4.1) — does it act in?**
4. **Is it core or a module (§8)?** (Almost always a module.)
5. **What is tied to the message (§2.4)?**
6. **How does it fail, how much does it cost, and how does the user undo it?** (§1, principles 4 and 5)

If any answer is "I don't know" or "it needs a workaround", **stop and adjust the blueprint** with Daniel.
