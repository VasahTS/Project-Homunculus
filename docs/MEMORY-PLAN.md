# Memory — chapters + recall (plan for slice 8)

Author: CLAUDE, 2026-10-29, at Daniel's request ("we'll sort this out later, but save it now").
**Status: study only. Nothing approved, nothing to code now.** Comes after branching and slice 5 (full agents). See BLUEPRINT §4.3 ("Chapter summary"), §5.2 (ceiling "chapters ≤ 15%"), §8 (`memory-chapters`, `recall`), §10 (slice 8).

## The idea in one sentence
**A single memory engine**, which answers three questions: **when to close a chapter**, **how to keep it** and **what to send to the AI**. Each reference below comes in as a set of choices, not as a separate system.

## The four references

| | When it closes | How it keeps it | What goes into the prompt |
|---|---|---|---|
| **Chapter Memory** (Daniel's friend; file `Chapter_Memory.txt`, Python) | un-chaptered history > 32k tokens (minus the newest `keep_recent_tokens`; cuts at an AI reply; never swallows the last exchange) | one summary per chapter (a 3–7 word title + 250–600 words), written with the previous summary alongside, for continuity | **2 stages with a decision model (Jev)**: (1) each summary becomes a yes/no question "does this chapter matter for the last exchange?"; (2) for each approved chapter, each of its messages: "does it have something VERY relevant the summary lacks?". The approved ones go in word for word under the summary (`<story_so_far>`). The last chapter always goes in. Cache by (question, hash of the exchange); batches by token budget; up to 6 in parallel. |
| **Marinara — Advanced Memory Recall** (scenes) | when the **scene changes** (place, time, characters elsewhere, `***`), decided by the decision model or the helper; also by a context ceiling | a summary per scene (2–3 paragraphs) + continuity "constants" + (optional) **each character's memory** in the 1st person | **The friend's idea, more mature**: a cheap pre-selection (up to 24 scenes, by text + embeddings, + the scene after the best 3) → the decision model picks the scenes → judges up to 12 messages of each → **a continuous excerpt** of 3–10 messages around the best one. A time limit per stage (10–25 s, 40 s total); if it fails, it falls back to the pre-selection order and the receipt says why. Swipes reuse the choice. |
| **Marinara — Chat Summary** (the panel in the screenshot) | every N user messages (default 5), or by hand (Last / Range) | entries you turn on/off; **Write** = write by hand | every entry that is on (+ optional "semantic retrieval") |
| **Summaryception** (ST extension, Lodactio, AGPL-3.0) | batches of 3 replies, outside the last 7–10 kept word for word | **layers**: layer 0 with up to 30 summaries; when it fills, the oldest merge 3 by 3 into the layer below (the 1st is copied, without AI); up to 5 layers | everything, without choosing (needs no decision model) |

**Jev:** TypeSafe's decision model ("System One" API, direct or through OpenRouter), calibrated probabilities (threshold 0.5). **Open-Jev** 2B/9B = a separate model, on Qwen, runs locally (NVIDIA GPU). The friend's `noul()` = Marinara's `NoulQuestion` (same question format).

## What to take from each
- **Friend:** the two-stage choice; a new summary receives the previous one; the last chapter always goes in; cache per exchange (fits swipes).
- **Marinara (scenes):** close a chapter **on a scene change**; **pre-selection before the decision model** (solves stage 2's cost: hundreds of questions per turn); **time limit + plan B** with the reason in the receipt; **a continuous excerpt** instead of loose messages; swipes reuse the choice; a **Fix** that never rewrites a summary edited by hand ("need your review"). Later (slice 7, groups): who saw each message; per-character memories.
- **Marinara (Chat Summary):** **Write** (summary by hand), on/off per entry, **Backfill** for old chats (important for importing from ST), its own connection + maximum size, approval before it applies (our `proposal`).
- **Summaryception:** **layers** for very long stories (summarize the summaries; the base does not grow forever); works **without a decision model** (default and plan B); a failed batch never hides messages; with 100+ messages it asks what to do with the backlog (all / skip / one batch); retry with growing wait.

## What H2 already has for this
- The `chapterEnd` trigger (`schemas/src/agents.ts`); `event` messages ("Chapter 2") and `visibility.ai = "summary"` (`schemas/src/play.ts`); `buildPrompt` already skips messages that are not `full` (`core/src/presets.ts`).
- A `chapters` marker planned in the preset (§5.1) with a ceiling (§5.2); a connection per agent and a limit of simultaneous calls (`ConnectionService`).
- Reply tab / "see the prompt" for the receipt (like the lorebooks group, UI-PLAN L3).

## Missing
- **Logprobs / the probability of "yes"**: `provider-openai` does not read logprobs. Either add it, or a decision connection type (below), or JSON true/false (the threshold becomes yes/no).
- A new step in the turn, next to the lorebook scan (§6 step 4), before the main reply, with a status ("Weighing 12 chapters…").

## To decide when the time comes (proposals, not decisions)
1. **A chapter tied to the tree's path**, kept on the message where it ends (like the world state, D-001) — not an index. The current path decides which chapters apply; a branch opened in the middle of a chapter → that chapter does not apply there and the raw history comes back. So do **not** change the messages' `visibility` in the database: "covered by a chapter" comes from the path. (Summaryception needs a "branch repair"; Marinara reopens the scene. Here it would come for free.)
   - **Checked with branching done (D-032 v2, 10/29, CLAUDE):** it fits without repair. A branch is a name + its last message; the path up to it applies; messages before the split are shared (not copied). A chapter that ends before the split applies on both branches; a branch opened in the middle of a chapter does not see that chapter and the raw history comes back; branches inside branches work the same. When coding, remember:
     - **Deleting messages:** chapters tied to a message join the list of `deleteMessages` (`storage/store.ts`), together with the world state. Deleting in a branch only removes what no other branch uses (`deletableFrom`), so a shared chapter stays.
     - **Make a Separate Chat** (`ChatService.copyPathToNewChat`, the only real copy) copies the path's chapters, as it already copies the world state.
     - **Editing a message from before the split** changes it on both branches (it is the same message) → the chapter covering it becomes "outdated" (Resummarize) on both; fits item 3.
     - **Layers (Summaryception style):** the summary of summaries is tied to the final message of the last chapter it merges and keeps which chapters it merged; on a branch opened in the middle of that range it does not apply and the lower chapters that still apply come back.
2. **"Decision connection"** (yes/no with a probability) as a connection type — in Marinara it serves memory, lorebook fields and prompt conditions; here it could also serve agent conditions and lorebook conditions.
3. **A summary edited by the user is never rewritten by itself**; the edit goes into the item's history. An old message edited → the chapter marked as outdated ("Resummarize").

## UX (an idea sketch, before the UI-PLAN)
- **A single place: Memory** (per session / Story), not three panels. Marinara's panel shows 7 boxes before the first summary — avoid that.
- **Empty:** 1 sentence about what it is + one choice: **Simple** (summaries always in the prompt, Summaryception style) / **Smart** (picks what matters every turn; only shows with a decision connection).
- **With chapters:** a list (title, editable summary, on/off, Always / Auto / Never, Resummarize) + a discreet divider in the chat ("Chapter 3 · The Silver Fox"); messages above stay visible, lightly marked.
- **Reply tab:** "Memory · 2 chapters · 4 excerpts", with the reason and what was left out.
- **More (closed):** when to close, the summarizer's and the decider's connection, prompt, layers, limits.

## Suggested order
1. Chapters only (close, summarize, send the last one / all of them; layers past X).
2. Stage 1 (pick chapters) with pre-selection.
3. Stage 2 (word-for-word excerpts).

## Where to look
- Friend: `Chapter_Memory.txt` (sent by Daniel on 10/29; ask her: which model her Jev is, where `p_yes` comes from, cost/time per turn, and whether she is fine with us porting the idea with credit).
- Marinara @ `e5ead06`: `docs/agents/memory.md`, `docs/connections/decision-models.md`; see the map `docs/reference/marinara.md` §4.
- Summaryception: github.com/Lodactio/Extension-Summaryception (`index.js`: `ghostMessagesUpTo`, `repairIfBranched`, `buildFullContext`; v5.5.4).
- Code adapted from any of them (all AGPL-3.0) goes into `CREDITS.md`.
