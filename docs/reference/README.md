# Reference maps

Where things live in the four projects we learn from, so nobody has to re-read them.
Author: CLAUDE, 2026-10-27. Pinned commits: `pins.json`.

| Repo | What it is to us | Map |
|---|---|---|
| **Homunculus v1** — VasahTS/Homunculus (`main`) | Daniel's own app (SillyTavern → SillyBunny fork). **The feature spec**: what Homunculus 2 must be able to do, minus the hacks. | [homunculus-v1.md](homunculus-v1.md) |
| **SillyTavern** — SillyTavern/SillyTavern (`release`) | **Format and behaviour spec at the border only**: cards, lorebook activation, CC presets/prompt order, macros, personas, chat files. Never its architecture. | [sillytavern.md](sillytavern.md) |
| **Marinara Engine** — Pasta-Devs/Marinara-Engine (`main`) | Modern TS rewrite with native agents (React + Fastify). Ideas: agent pipeline, memory recall, presets with variables, ST importers, library UI. AGPL-3.0. | [marinara.md](marinara.md) |
| **Aventuras** — AventurasTeam/Aventuras (**`master`**, not `main`) | Closest stack to ours (**Tauri 2 + SQLite**, Svelte). Ideas: phased generation pipeline, world state, retrieval tiers, Vault, scenario wizard. AGPL-3.0. | [aventuras.md](aventuras.md) |

## How to use this (for CLAUDE / CODEX sessions)

1. **Start from the topic table below** — it says which repo has the best reference for each Homunculus 2 feature.
2. Open that repo's map: it gives the file, the function and its line **at the pinned commit**.
3. Only then look at code, and read **only that range**. The source is not in this repo:
   - `npm run refs` fetches all four at the pinned commits into `.refs/` (git-ignored; ~1 min, needs git + network) and rebuilds `symbols/`.
   - Then `sed -n '4709,4790p' .refs/sillytavern/public/scripts/world-info.js` (or the Read tool with offset/limit).
4. Function not in the map? `grep -n "functionName" docs/reference/symbols/<repo>.txt` gives file + line without fetching anything. Symbol files are generated: path `(line count)` then `L<line> <kind> <name>`. Never read them whole.
5. After learning something worth keeping, **add it to the map** (one line, file + function). The map is the memory; the clone is disposable.
6. `npm run refs -- --latest` moves every repo to the tip of its branch and rewrites the pins; `npm run refs -- --check` verifies that every path cited in the maps still exists. Line numbers in the maps are for the pinned commit — after `--latest`, trust function names over line numbers and fix the lines you touch.

Rules that still apply: learn from them, keep our architecture (`docs/ARCHITECTURE.md`). Code adapted from Marinara/Aventuras/Homunculus/ST (all AGPL-3.0) goes in `CREDITS.md` with file and commit.

## Topic → where to look

| Homunculus 2 feature | Spec (what it must do) | Best implementation reference | Also useful |
|---|---|---|---|
| Character cards V1/V2/V3, PNG/JSON, CharX, BYAF | ST: `src/character-card-parser.js`, `src/endpoints/characters.js` | Aventuras `characterCardImport/` (small, clean) | Marinara `st-character.importer.ts` |
| Persona (user identity, description position/depth, lock per chat/char) | ST `personas.js` + `power-user.js` | Marinara `types/persona.ts`, `personas/` | Homunculus v1 `homunculus-conversation/personas.js` |
| Prompt assembly by blocks + CC presets (`prompt_order`) | ST `openai.js` `preparePromptsForChatCompletion` / `populateChatCompletion`, `PromptManager.js` | Marinara `services/prompt/assembler.ts` + `marker-expander.ts` | Aventuras `docs/architecture/prompts.md` (packs, prefix caching) |
| Preset variables ({{pov}}, {{tense}}…) | Homunculus v1 `classic-story-style.js` | Marinara `docs/prompts/preset-variables.md`, `types/chat-preset.ts` | — |
| Macros | ST `public/scripts/macros/` (new engine) | Marinara `shared/src/utils/macro-engine.ts` | Aventuras `services/templates/` (Liquid) |
| Lorebooks / World Info activation | ST `world-info.js` `checkWorldInfo` (exact semantics) | Marinara `services/lorebook/keyword-scanner.ts` (pure, testable) | Homunculus v1 `world-info-scan-core.js`; Aventuras retrieval tiers |
| Agents (pre / parallel / post, injections, trackers) | Homunculus v1 In-Chat Agents (`extensions/in-chat-agents/`, 69 templates) | Marinara `services/agents/agent-pipeline.ts` (phases + batching) | Aventuras `generation/phases/` |
| Companions (agents with their own panel/notes) | Homunculus v1 `in-chat-agents/companion/` | — | Marinara `components/agents/` |
| Scene panel / world state (time, place, weather, looks, plot) | Homunculus v1 `classic-scene*.js` | Aventuras `WorldStateInjector.ts`, `ClassifierService.ts`, `stateTracking/` | Marinara `RoleplayHUD.tsx`, `tracker-field-locks.ts` |
| Group sessions: narrator, roles player/co-author/director, cast sheets | Homunculus v1 `classic-group-*.js` | ST `group-chats.js` (only for import) | Marinara `docs/chats/group-chats.md` |
| Memory: chapters/summaries, recall | Homunculus v1 `classic-memory.js`; Pathfinder | Marinara `memory-recall.ts`, `advanced-memory.ts`; Aventuras `MemoryService.ts`, `ai/retrieval/` | ST `extensions/memory`; ST extension Summaryception (layers) — see `docs/MEMORY-PLAN.md` |
| Vault (reusable scenarios, NPCs) | Homunculus v1 `classic-vault.js` | Aventuras `ai/vault/`, `docs/architecture/exchange-format.md` | — |
| "Ready to play" setup / guided start / scenario wizard | Homunculus v1 `classic-group-start.js`, Group Studio | Aventuras `ai/wizard/ScenarioService.ts` | Marinara `utils/onboarding.ts` |
| Card Browser (Chub, JannyAI, Wyvern…) | Homunculus v1 `classic-card-browser.js` + `src/endpoints/classic-card-browser.js` | Marinara `routes/bot-browser*.routes.ts` | — |
| Conversation mode (DM-style chat, schedules, autonomous messages) | Homunculus v1 `homunculus-conversation/` | Marinara `services/conversation/` | — |
| Swipes, branches, chat tree | ST `script.js` `swipe` (behaviour) | Aventuras `components/branch`, `stateTracking/` (rollback per message) | Marinara `docs/chats/branches.md` |
| Regex scripts / render-in-HTML agents | ST `extensions/regex/engine.js` | Marinara `services/regex/`, `utils/regex-safety.ts` | Homunculus v1 agent `postProcess` + `regex-scripts.js` |
| Corrections / guided generations | Homunculus v1 `extensions/guided-generations/` | — | — |
| Importing ST chats | ST `src/endpoints/chats.js` (jsonl) | Marinara `st-chat.importer.ts`, Aventuras `stChatImporter.ts` | — |
| SQLite + migrations in Tauri, backups | — | Aventuras `src-tauri/` + `docs/architecture/persistence.md` | — |
| Providers, reasoning, streaming | ST `openai.js` (`sendOpenAIRequest`) | Aventuras `ai/sdk/` (Vercel AI SDK), Marinara `services/llm/` | — |
| UI ideas: library grid, HUD, panels | Homunculus v1 `classic-*.js` (+ `DESIGN.md`) | Marinara `CharacterLibraryView.tsx`, `DESIGN.md`, `docs/screenshots/` | Aventuras `docs/architecture/overview.md` (panels & gestures) |
