// Homunculus 2 — what each part of the app IS, for the Assistant (D-110). Daniel (translated): "add, for each one, its
// context (what it means in the app), its features etc., for the assistant to consult and do things properly".
// The Assistant asks for a topic with `about` (once per chat, like `guide`); `guide` stays the writing guide with the
// exact fields. Keep each topic short, true to the app as it is, and in plain words. CLAUDE, 2026-11-10.

export interface AboutTopic { topic: string; title: string; text: string }

const T = (topic: string, title: string, text: string): AboutTopic => ({ topic, title, text: text.trim() });

export const ABOUT: Record<string, AboutTopic> = Object.fromEntries([
  T("app", "Homunculus 2 as a whole", `
Homunculus 2 is a desktop app for roleplay and narrated stories. Two modes: Play (the chats and stories) and Assistant (you).
- Play has 1:1 chats with a character card (SillyTavern style) and Stories (narrated, Aventuras style). Trackers, agents, lorebooks and the Director work in both.
- The Library keeps reusable things: Kits, Narrators, NPCs, Directors (story building); Personas, Lorebooks, Presets, Regex, Quick Replies (writing and context); Trackers, Agents (around each reply); Trash.
- Characters (the cards) and Stories are places of their own in the sidebar; a character's chats are on its sheet, a story's chats on its page.
- Settings come in layers: Defaults (Settings → Defaults) → a Story → one chat. A chat inherits and can change something "just for this chat" ("Use the story's" undoes it).
- How a reply is made: the preset's blocks are put in order (system rules, character card, persona, scenario, lorebook entries that fired, examples, memory chapters, the chat history, Author's Note, Character's Note, Director's notes, agents' injections) → the main model writes → regex scripts may change it → agents after the reply (rewrites, checks, notes, choices) and trackers update the Scene.
- The chat's right panel has tabs: Scene (trackers' values), Character (the card, editable), Prompt (Author's Note, model, preset, narrator, lorebooks, regex, quick replies; Preview Prompt), Director, Reply (what went into the last reply: lore entries, agents, tokens). Memory opens from the chat's top bar.
Topics you can ask about: ${"{{topics}}"}.`),

  T("character", "Characters (cards)", `
A character is a card (SillyTavern Character Card V2/V3 compatible): name, description, personality, scenario, first message + alternate greetings, example messages, system prompt, post-history instructions, creator notes, tags, a picture, and an embedded lorebook.
- Versions: one card can hold several versions (Main, Wounded, Modern AU…) as variants; a chat picks one. Ask for "another version" → a variant, not a new card.
- Character's Note: a short text sent at a depth in the chat (like the Author's Note but tied to the card), with @depth and role. Strong: it sits right before the reply. A common cause of a character behaving oddly.
- A card's regex scripts and lorebook come with it; the app asks before running a card's regex.
- In a 1:1 chat the card is the AI's role; in a Story, cards can be cast members next to the narrator and NPCs.
- Edited in Characters → the card → Edit (layouts Sheet, Tabs, Writer, Text), or in a chat's Character tab (that chat's version).`),

  T("persona", "Personas", `
A persona is who the user plays: name, description, picture, versions, and its own lorebook. {{user}} becomes its name.
- The default persona (Settings) or one picked per chat (the button under the message box, Ctrl+P), per story, or "No persona".
- Its description goes in the prompt where the preset puts the persona block. Trackers can read it.`),

  T("lorebook", "Lorebooks (World Info)", `
SillyTavern-compatible World Info. Entries go into the prompt only when they fire.
- An entry fires when one of its keywords (or /regex/) appears in the last messages read (default: the last 2), with optional secondary keys (and any / and all / not all / none), or always ("Always on"/constant).
- Where it goes (5 kinds): Character (before/after the card), In the chat (N messages back, as System/User/AI), Examples (before/after), Author's Note (before/after), Outlet (a named slot a preset places). Order: higher goes later and wins the budget first.
- More: chance %, inclusion groups, sticky / cooldown / delay (in messages), recursion (entries can fire others), case/whole-word, which sources are scanned, only for some characters, generation types.
- Conditions (ours): only when a tracker value matches, e.g. Scene: World → Location is Tavern.
- Linked to a character (embedded or added), a persona, a story or chat, Global Lorebooks (every chat), or Defaults. Settings → Lorebooks: how many messages are read and the budget (default 25% of the context).
- The Reply tab shows which entries went in and why, and which were left out (chance, budget, group).`),

  T("preset", "Prompt presets", `
A preset decides how the prompt is built and sent: an ordered list of blocks (like SillyTavern's prompt manager: Main prompt, character parts, World Info before/after, chat history, Post-history instructions, custom blocks…), each on/off, with role and depth; samplers (temperature, top-p, penalties…), context size and max reply length; formats; its own regex scripts.
- A chat uses one preset (Prompt tab → Preset); Library → Presets to edit; SillyTavern presets import and export.
- You never edit a preset in place: \`change\` saves an edited copy.
- Narrator placement: in a story, the narrator's text goes where the preset's narrator block is (Prompt tab → Narrator in the Prompt).`),

  T("story", "Stories", `
A Story is a narrated adventure: a narrator (not a character) tells it, with NPCs and optional cards, a scenario, openings (first messages) and its own setup.
- How you play: Player (you play one person), Co-author (you write together), Director (you give orders; the narrator writes everyone).
- One story has several chats. The story is the template: each chat inherits its setup and can change something just for itself ("changed in this chat").
- Its page: Cast (narrator, NPCs, characters), How it starts (scenario, openings), How you play, Setup (preset, connection, persona…), Trackers, Agents, Lore, and the chats at the bottom.
- Stories come from a card ("Turn into a Story"), from a Kit (a copy), or from scratch.`),

  T("kit", "Kits", `
A Kit is a story starter kept in the Library: the same parts as a Story (narrator, NPCs, cards, scenario, openings, setup, lore) but no chats. "Start a Story" COPIES it: changing the Kit later never changes stories made from it. A story can be saved as a Kit (More… → Save as Kit).`),

  T("narrator", "Narrators", `
A narrator is how a story is told: instructions (blocks), style (point of view, tense, length, tone), whether it may bring in new people, and a reminder sent each turn. Kept in Library → Narrators and picked by a story (or a card can act as the narrator, or a story writes its own).
- Narrators are written for a way of playing (you play a character / written together / director) or as extras (mystery, slow burn, dread…).
- In the prompt it sits where the preset's narrator block is.`),

  T("npc", "NPCs", `
An NPC is a person of the story world kept as a sheet in Library → NPCs: name, notes and the same fields trackers use for people (appearance, stats, relationships…). Stories and 1:1 chats can add NPCs ("NPCs in this chat"). Trackers can bring someone new into the Scene, and "Save to the Library" turns them into an NPC. One NPC can be used by several stories (edits reach all of them; "Make a Copy for This Story" splits it).`),

  T("tracker", "Trackers and the Scene", `
A tracker is an agent that keeps world state after each reply: it reads the last messages and fills fields (Scene: World = time, place, weather, quests…; Scene: Characters = who is here, how they look, stats; Scene: Plot = threads and secrets). The values show in the Scene tab and can go back into the prompt.
- Fields have a type and a display (text, number, bar, status, list…), are global or per character, and belong to field sets (a set = a version of the tracker's fields, e.g. Fantasy). help = what the tracker AI writes; note = what the value means for the story AI.
- A chat follows the trackers picked in its Scene tab; values follow swipes and branches (state is kept per message).
- People kept by several trackers show as one sheet in the Scene.`),

  T("agent", "Agents", `
Agents do one job around each reply. Each has: when it runs (before the reply / alongside / after it / every N messages / only when asked), what it does, how it runs and what it reads.
- What it does: adds rules to the prompt (inject, often with no AI call: text with macros and {{random}}), rewrites your message before sending (intercept), rewrites the reply (rewrite; the original stays as a revision, Undo), checks the reply (check: warn, fix or write again), offers choices (buttons under the reply; a click sends it), writes a side note (note: under the message or in the ✦ panel), proposes Library changes (proposal), keeps world state (state = trackers).
- How it runs: its own AI call (own connection/model possible), inside the main reply (inline), or no AI call (text).
- Reads: last N messages, cards, persona, scenario, lorebooks, tracker values, Author's Note, memory chapters, other agents' results, its own previous notes.
- Conditions: keywords, chance %, generation types, only after N messages, tracker values. Variables ({{name}}) a chat can change; versions of the instructions.
- Switched on per story/chat in the chat's ✦ panel (Setup), or for every chat. Library → Agents edits them; Try It previews one without applying anything.`),

  T("regex", "Regex scripts", `
SillyTavern-compatible find/replace scripts. Each has a pattern (/pattern/flags), a replacement ($1, {{match}}, macros), targets (user messages, AI replies, slash text, lorebook text, reasoning) and when it acts:
- Display only: changes what is shown; the saved text stays. Prompt only: changes what the AI is sent; the saved text stays. Neither: changes the saved message when it is sent or received.
- Depth limits (min/max messages back), run on edit, macros inside the pattern.
- Where: global (Library → Regex), in a preset, or in a card. Scripts that come with a preset or a card run only after the user approves them. Each can be switched off per chat (Prompt tab → Regex). "Original" shows a message without them.
- Uses: cleaning repeated phrases, hiding status blocks, formatting, removing tags from old messages before they go to the AI.`),

  T("quickreply", "Quick Replies", `
SillyTavern's Quick Replies, text only: sets of saved texts shown as buttons above the message box (or one bolt button with a list, Ctrl+/).
- A reply: label, text (may use {{input}} = what is in the box), optional menu of other sets (chained: its text first).
- A set decides: send at once or put it in the box; keep what you typed and add to it (inject, before/after); stack clicks; color.
- Sets are switched on globally, per story, per character or per chat (Prompt tab → Quick Replies). Uses: OOC notes, repeated instructions ("continue", "describe the room"), formatting reminders.`),

  T("director", "The Director", `
The Director is an out-of-character helper inside each chat (right panel → Director, or popped out). You talk with it about the story; it never writes the story.
- Notes: short steering instructions it proposes and the user adds, each with a weight (Whisper / Steer / Turn by default; editable) and how many turns it lasts (or always). Active notes go into the story's prompt near the end (a depth and role set in its setup), under a header telling the AI to follow them silently. Swipes of a turn don't spend a note by default. Notes belong to the branch where they were made.
- Changes: with permission (Never / Ask first / Allowed per kind) it can propose changes to notes, tracker values, lorebook entries, the Author's Note, the Character's Note and memory chapters; the user applies them (Undo).
- Options: check replies against notes, ask itself a question every N replies, what it sees (card, lore, preset, Scene…), its own connection/model.
- Profiles: Library → Directors; a chat uses its own pick, else its story's, else the default.`),

  T("chat", "Chats, messages and branches", `
A chat is a tree of messages. Swipes are other versions of one reply (‹ 2/3 ›); branching ("Branch from here") starts another path from any message, with a name; the chat shows one branch at a time (the selector at the top). Tracker values, Director notes and memory chapters follow the branch.
- Message kinds: your in-character message, a reply, a direction (co-author/director orders), OOC, an event marker. A message can be hidden from the AI.
- Numbers (#12) count along the branch on screen. read_chat uses the same numbers.
- A message's actions: copy, edit, new version, branch, hide from the AI, details, delete; the Reply tab shows what went into a reply.
- 1:1 chats belong to a character; story chats to a story. The sidebar keeps Pinned, folders and Recent.`),

  T("memory", "Memory (chapters)", `
Memory turns older parts of a chat into chapter summaries so long stories fit the context. Open it from the Memory button in the chat's top bar.
- A chapter covers a range of messages on the branch; its summary goes into the prompt instead of those messages (the covered messages can stay visible to you). Chapters can be written by the AI (its own connection, model, length and instructions) or by hand, edited, switched off.
- Chapters belong to the branch they were made on.
- Recall (optional) lets a decision model pick only the chapters that matter for the current turn.`),

  T("prompt", "What decides how the AI writes (and where to look when it misbehaves)", `
From strongest (closest to the reply) to weakest:
1. Director notes and the Author's Note at a low depth, the Character's Note, agents that inject near the end, Post-history instructions in the preset.
2. The latest messages themselves (style is contagious: a wordy reply invites wordy replies).
3. Lorebook entries placed in the chat at a depth.
4. The preset's main prompt and blocks, the narrator, the card's description and examples.
When a character drifts (talks like a narrator, breaks character, repeats), check in order: the chat's last messages around where it started, the Character's Note and Author's Note, Director notes, agents switched on, lore entries that fired (Reply tab), then the preset blocks and the card. Change the smallest thing that explains it, and offer to test the change.`),
].map((t) => [t.topic, t]));

export const ABOUT_TOPICS = Object.keys(ABOUT);

/** The text for a topic, with the list of topics filled in. */
export function aboutText(topic: string): string | null {
  const t = ABOUT[topic];
  return t ? `# ${t.title}\n${t.text.replace("{{topics}}", ABOUT_TOPICS.join(", "))}` : null;
}
