# Homunculus v1 — reference map (the feature spec)

Repo: https://github.com/VasahTS/Homunculus · branch `main` · commit in `pins.json` (0884338a, 2026-10-23). Lines below are at that commit.
Symbol index: `symbols/homunculus.txt`. User docs: `README.md` (feature tour), `PRODUCT.md`, `DESIGN.md`/`DESIGN.json`, `docs/in-chat-agents-glossary.md` (every agent option explained, 308 lines).

**What it is:** SillyTavern → SillyBunny v1.8.0 → Homunculus. Daniel's app. Everything it does is what Homunculus 2 must eventually do; **how** it does it (patching ST, `extension_settings`, `chat_metadata`, DOM drawers, event hooks) is what we are leaving behind.

Base layout = SillyTavern's (see `sillytavern.md`), **but the shared files are heavily modified** — at the pinned commits `openai.js` is 11.7k lines here vs 7.4k in ST, `world-info.js` 7.6k vs 6.4k, `script.js` 19k vs 12.6k, and the ST base is whatever SillyBunny last synced from upstream (`docs/upstream-sync.md`). So: for **standard ST behaviour/formats** read the ST repo; read the same file here only to see **what the fork changed** (`docs/upstream-touch-ledger.md` lists the touched files). The fork's own code is easy to spot:
- `public/scripts/extensions/in-chat-agents/` — the **Agents** (from SillyBunny, extended).
- `public/scripts/classic-*.js` — Homunculus features on the classic ST UI (header comment of each file explains it in plain words).
- `public/scripts/homunculus-*.js`, `public/scripts/homunculus-conversation/` — the Homunculus shell and Conversation mode.
- `src/endpoints/{homunculus-*,conversation-*,classic-card-browser,in-chat-agents,chat-archive}.js` — server additions.
- Fork-vs-upstream bookkeeping: `docs/upstream-sync.md`, `docs/upstream-touch-ledger.md` (which ST files were edited).

## 1. In-Chat Agents (the thing Daniel "can't live without")
`public/scripts/extensions/in-chat-agents/` (~25k lines). Concepts (glossary §Core Terms): an agent = stored prompt + config: **phase** (`pre`, `post`, `both`), **execution** (`inline` = touches the main generation, `companion` = separate model call with its own stored result and panel), **injection** (position/depth/role/order/scan, same semantics as ST prompts), **postProcess** (`extract` a tagged block into a variable, `regex` find/replace, `append`), **conditions** (trigger keywords, probability, generation types), optional own **connection profile**, **tools** (function calling), pre-generation **mode** `inject` or `intercept` (rewrites the user's message / prompt).

| What | Where |
|---|---|
| Agent schema + defaults + normalization (the real data model) | `agent-store.js` — `createDefaultAgent` L1241, `normalizeAgent` L1331, `normalizeToolDef` L1312, `createDefaultCompanionConfig` L994, `normalizeCompanionConfig` L1034 |
| Enable per scope (global / per chat type / group profile override) | `agent-store.js` `isAgentEnabledForScope` L329, `setAgentEnabledForScope` L370, `getGroupProfileAgentOverride` L298 |
| Connection profile per agent | `agent-store.js` `resolveConnectionProfile` L543, `resolveCompanionConnectionProfile` L559 |
| Agent groups (bundles), import/export, bundled-template updates | `agent-store.js` `createDefaultGroup` L1893, `importAgents` L1835, `exportAgent` L1873, `getBundledAgentLatestTemplatePlan` L795 |
| **Runtime** — wired to ST events (generation started/ended, prompt ready, message received/edited/swiped, WI activated…) | `agent-runner.js` `initAgentRunner` L5347 (event list L5357–L5414) |
| Dynamic macros given to agent prompts | `agent-runner.js` `buildPromptDynamicMacros` L2012 |
| Prompt transform / intercept (rewrite before main generation), undo/redo | `agent-runner.js` `requestPromptTransform` L3218, `runAsInternalPromptTransform` L3197, `undoPromptTransform` L5292, `redoPromptTransform` L5312 |
| Post passes on a reply, manual "run agent on message", tracker repair | `agent-runner.js` `runSingleAgentPostPassesOnText` L5440, `runAgentOnMessage` L5599, `runTrackerFixOnMessage` L5618 |
| Per-message agent data (stored in `message.extra`) | `agent-runner.js` `getAgentExtraValue` L1093, `setAgentExtraValue` L1102 |
| Tracker blocks (`[TAG]…[/TAG]` in replies), inspection and repair | `tracker-state.js` `findTrackerBlocks` L30, `inspectTrackerState` L116, `mergeTrackerRepairPayload` L221 |
| Agent regex scripts + snapshots per chat | `regex-scripts.js`, `regex-snapshot-store.js` |
| Tool registry for agents | `tool-action-registry.js` |
| Preview the current editor prompt with macros (reference for Try it) | `index.js` `previewPreGenerationPrompt` L1251; opens `.ica--prompt-preview` in a popup. Prompt-only, not a model execution. Reference reviewed by **CODEX**, 2026-10-30. |
| UI (panel, editor, tabs All/Quick/Pre/Post/Companions) | `index.js` (6.3k lines), `editor.html`, `settings.html` |
| **Companions**: build prompt, run, store result, feed back into next generation, batching, panel + dashboard | `companion/companion-runner.js` — `buildCompanionPromptMessages` L1227, `runCompanionStage` L2046, `injectCompanionFeedbackPrompts` L2064, `runCompanionsOnMessage` L2299, `setCompanionResult` L490; UI `companion/companion-panel.js`, `companion/companion-dashboard.js` |
| **Pathfinder** (agentic lorebook retrieval: model browses/searches/edits lorebooks with tools; tree of entries; summary memory) | `pathfinder/` (`tree-builder.js`, `tree-store.js`, `entry-manager.js`, `sidecar-retrieval.js`, `pathfinder-tool-bridge.js`, `prompts/`, `tools/`), settings `pathfinder-settings-ui.js` |
| **69 bundled templates** (trackers, randomizers, prose, HTML, CYOA, directors…) — the catalogue of what agents must be able to express | `templates/*.json`, list in `templates/index.json`. Good examples: `scene-tracker.json` (inline tracker with `extract`), `memory-shard-companion.json` (companion), `prose-polisher.json` (post rewrite), `html-toggle.json` (pre inject), `pathfinder.json` (tools) |
| Server endpoint (agent storage) | `src/endpoints/in-chat-agents.js` |
| Inspector for what agents did to the prompt | `public/scripts/in-chat-agent-inspection.js`, `extensions/prompt-inspector/` |

## 2. Scene panel and story state
| What | Where |
|---|---|
| Scene panel (side panel: who is present, looks, mood, time/place/weather, plot beats). Two ordinary companion agents write JSON blocks per message/swipe: "Scene: Characters" `[CAST]{…}[/CAST]` and "Scene: World" `[WORLD]{…}[/WORLD]`; user edits are written back into that result; a compact copy goes into the next prompt | `public/scripts/classic-scene.js` — `parseBlock` L173, `formatBlock` L189, `findResult` L198, `historyOf` L232, `scenePrompt` L470 (what goes back into the prompt), `castPrompt` L383, `worldPrompt` L420, `plotPrompt` L454, beats L314–L349 |
| Field presets (what the trackers record / panel shows) | `classic-scene-fields.js` — built-in presets `BUILTIN` L88 (cast: Standard/Superpowers/Sci-fi/Minimal with sections About/Stats/Appearance/Powers/Tech; world: Standard/Survival/Minimal = modules time/location/weather/quests/inventory/factions + extra fields), prompt rules `castFieldsPrompt` L337 (LORE_RULE, CONCRETE_RULE L333), `worldFieldsPrompt` L406 (TIME_RULE L371, factions/quests rules L386–402). Tracker prompts: `extensions/in-chat-agents/templates/index.json` L4088 (World), L4153 (Characters), L4219 (Plot), L4284 (Map). What goes back into the prompt: `classic-scene.js` `castPrompt` L383 (away characters by name only), `worldPrompt` L420 (only active quests), `plotPrompt` L454. → Homunculus 2: `apps/desktop/src/starter/trackers.json` (D-017). |
| Story memory from the per-message states | `classic-scene-story.js` |
| Story clock calendars | `classic-calendars.js` |
| World Map (reusable maps per chat) | `classic-world-map.js` |

## 3. Groups: Group Studio, narrator, roles
| What | Where |
|---|---|
| Group Studio page (create/setup groups: cast, narrator, user role, start, Scene trackers, agents, settings) | `classic-group-studio.js` (2.5k lines) |
| Narrated mode + cast sheets (`group.homunculus_campaign`) | `classic-group-campaign.js` |
| Group profile = preset + persona + lorebooks + agents switched on with the chat (`group.homunculus_profile`) and the group bar | `classic-group-profile.js` |
| Agents menu on the group bar | `classic-group-agents.js` |
| "How the story starts" (`group.homunculus_start` = scenario, openings, speaker, vault item) | `classic-group-start.js` |
| Story style variables ({{pov}}, {{tense}}… à la Marinara) | `classic-story-style.js` |
| Where every Homunculus prompt block goes (role instructions, style, author's plan…) | `classic-prompt-blocks.js` |

## 4. Memory, Vault, library, connection
| What | Where |
|---|---|
| Memory drawer: **Chapters** (several summaries per chat, ranges, AI or hand-written, toggle, placement before/after main, at depth or `{{chapters}}`, hide summarized messages) + **Recall** (front for ST Vector Storage) | `classic-memory.js` (stored in `chat_metadata.classic_memory`) |
| Vault (reusable scenarios, NPCs…) | `classic-vault.js`, `src/endpoints/homunculus-vault.js` |
| Card Browser (ChubAI, JannyAI, Wyvern, DataCat, Pygmalion) | `classic-card-browser.js` + `src/endpoints/classic-card-browser.js` |
| Quick Connection switcher | `classic-quick-connect.js` |
| Home page, layout, characters gallery, themes | `classic-home.js`, `classic-ui.js`, `classic-editor.js`, `classic-themes.js` (+ `public/classic-themes/`) |
| Import a whole ST folder / backup ZIP | `classic-importer.js` |
| OOC notes kept visible but out of the prompt | `ooc-blocks.js` |

## 5. Conversation mode (DM-style chats)
Client `public/scripts/homunculus-conversation/` (42 files: `generation.js`, `prompt.js`, `context.js`, `auto-engine.js` autonomous messages, `schedule*.js`, `thread-store.js`, `timeline-render.js`, `notifications.js`, `typing.js`); server `src/endpoints/conversation-*.js`, `src/endpoints/homunculus-conversation.js`. Docs: `docs/conversation-mode-glossary.md`, `docs/conversation-mode-rest-api.md`.

## 6. Generation robustness (ideas worth keeping)
- Generations that survive a dropped connection: `public/scripts/resumable-generation.js`, `src/resumable-generations.js`.
- Guided generations / corrections (SB-GG-Corrections lineage): `public/scripts/extensions/guided-generations/scripts/` (`guidedCorrection.js`, `guidedResponse.js`, `guidedSwipe.js`, `guidedImpersonate.js`).
- Sampling parameter policy per model/provider: `public/scripts/sampling-parameter-policy.js`.
- Card scripts in a sandbox (allow-list, rate limit): `public/scripts/card-script-runtime.js`, `public/scripts/card-script-sandbox/`.
- WI scan helpers split out of ST: `public/scripts/world-info-scan-core.js`, `public/scripts/world-info-character-book.js`.

## Verdict
**Adopt (as requirements):** the agent model (phase, inline vs companion, injection, extract/regex post-process, conditions, own connection, tools), the 69 templates as a compatibility target (we should import them), Scene panel, Group Studio roles, chapters memory, Vault, resumable generation.
**Avoid:** storing agent output inside `message.extra`/`chat_metadata` blobs, tracker data parsed back out of reply text as the source of truth (Homunculus 2: structured world state per message, D-001), agents implemented as ST event listeners.
