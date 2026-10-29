# SillyTavern — reference map

Repo: https://github.com/SillyTavern/SillyTavern · branch `release` · commit in `pins.json` (06bde939, 2026-09-14). Lines below are at that commit.
Symbol index: `symbols/sillytavern.txt`.

**Why we read it:** only to be faithful **at the border** (import/export and "a preset/lorebook made for ST behaves the same here"). We do **not** copy its architecture: global mutable state, jQuery DOM, events used as an extension API, agents as extensions. All of that is what Homunculus 2 replaces.

Layout: `public/script.js` (12.6k lines, the god file: chat, generation, characters), `public/scripts/*.js` (features, browser side), `src/endpoints/*.js` (Express server: files on disk), `default/content/` (bundled presets, themes, example card).

## 1. Character cards
| What | Where |
|---|---|
| PNG read/write (`tEXt` chunks `chara` = V2 base64, `ccv3` = V3) | `src/character-card-parser.js` — `write` L15, `read` L54, `parse` L86 |
| Normalize to V2 (`data.*` vs top-level V1 fields), what gets saved | `src/endpoints/characters.js` — `getCharaCardV2` L450, `convertToV2` L469, `readFromV2` L504, `charaFormatData` L565 |
| CharX (zip) and BYAF imports | `src/charx.js`, `src/byaf.js` |
| Card validator tests (useful fixtures) | `tests/tavern-card-validator.test.js` |
| Fields used in the prompt (description, personality, scenario, mesExamples, depth prompt, system/jailbreak override) | `public/script.js` `getCharacterCardFields` L3476 (lazy version L3402) |
| Example dialogue parsing (`<START>` blocks) | `public/script.js` `parseMesExamples` L3501; CC split into messages: `public/scripts/openai.js` `parseExampleIntoIndividual` L729 |
| Embedded lorebook (`character_book`) ↔ World Info | `public/scripts/world-info.js` `convertCharacterBook` L5617, `checkEmbeddedWorld` L5691, `importEmbeddedWorldInfo` L5731 |

## 2. Chat Completion prompt assembly (the part presets depend on)
Flow: `Generate()` (`public/script.js` L4290) → collects card fields L4470, WI L4635 (`getWorldInfoPrompt`), examples L4616, persona L4683 → for CC calls `prepareOpenAIMessages` (L5285) → `public/scripts/openai.js`:

| Step | Where (`public/scripts/openai.js`) |
|---|---|
| Default prompt texts (main, impersonation, continue nudge, new chat, group nudge, formats) | L102–L115 |
| Entry point | `prepareOpenAIMessages` L1542 |
| Builds the system prompt objects for markers: `worldInfoBefore/After`, `charDescription`, `charPersonality`, `scenario`, `personaDescription`, summary (`1_memory`), author's note (`2_floating_prompt`), vectors… | `preparePromptsForChatCompletion` L1367 |
| Walks `prompt_order`, fills markers, budgets tokens, adds examples/history | `populateChatCompletion` L1185 |
| Chat history (newest first until budget), continue nudge | `populateChatHistory` L885 |
| Dialogue examples | `populateDialogueExamples` L1101 |
| In-chat injections at depth (`injection_position` ABSOLUTE + `injection_depth`, role) | `populationInjectionPrompts` L810 |
| WI wrapper format (`wi_format`, default `{0}`) | `formatWorldInfo` L789 |
| Message / collection / budget classes | `Message` L3511, `MessageCollection` L3808, `ChatCompletion` L3917, `TokenHandler` L3420 |
| Preset save/import/export (what keys a CC preset JSON has) | `saveOpenAIPreset` L4598, `onPresetImportFileChange` L4766, `default_settings` L411 |
| Request params per provider | `createGenerationParameters` L2691, `sendOpenAIRequest` L3138 |

`public/scripts/PromptManager.js` — the prompt list and order:
- Default prompts (identifiers `main`, `nsfw`, `jailbreak`, `enhanceDefinitions`, markers `worldInfoBefore`, `personaDescription`, `charDescription`, `charPersonality`, `scenario`, `worldInfoAfter`, `dialogueExamples`, `chatHistory`) — `chatCompletionDefaultPrompts` L2001; default order `promptManagerDefaultPromptOrder` L2087.
- `INJECTION_POSITION` (RELATIVE 0 / ABSOLUTE 1) L37; classes `Prompt` L80, `PromptCollection` L201, `PromptManager` L300.
- `getPromptOrderForCharacter` L1207 (order can be per character; global uses dummy id 100001), `preparePrompt` L1277 (macro substitution), `getPromptCollection` L1516 (filters by `injection_trigger` generation types), `isPromptDisabledForActiveCharacter` L949.
- Bundled presets: `default/content/presets/openai/*.json`; text-completion story strings: `presets/context/`, `presets/instruct/`, `presets/sysprompt/`.

## 3. World Info / lorebooks — exact activation
All in `public/scripts/world-info.js`.

| What | Where |
|---|---|
| Enums: `world_info_logic` (AND_ANY, NOT_ALL, NOT_ANY, AND_ALL) L33, `scan_state` L43, `world_info_position` (before 0, after 1, ANTop 2, ANBottom 3, atDepth 4, EMTop 5, EMBottom 6, outlet 7) L855, `DEFAULT_DEPTH`=4 L96, `MAX_SCAN_DEPTH` L98 |
| Global settings (depth, budget %, budget cap, min activations, max recursion steps, case/whole-words, group scoring, char strategy) | L69–L82, `getWorldInfoSettings` L795 |
| Entry fields + defaults (the lorebook JSON schema) | `newWorldInfoEntryDefinition` L4082 |
| Scan buffer: what text is scanned (last N messages, depth, inject prompts, recursion buffer), key matching (regex keys, whole words) | `WorldInfoBuffer` L199 — `get` L279, `matchKeys` L337 |
| Timed effects: sticky, cooldown, delay | `WorldInfoTimedEffects` L479, `checkTimedEffects` L682 |
| Which books apply (character primary+aux, global, chat, persona) and sort | `getCharacterLore` L4475, `getGlobalLore` L4527, `getChatLore` L4544, `getPersonaLore` L4564, `getSortedEntries` L4590 |
| `@@decorators` in entry content | `parseDecorators` L4652 |
| **Main loop** | `checkWorldInfo` L4709. Inside: budget L4734, timed effects L4745, recursion-delay levels L4752, loop L4766, char filter/tags L4815, recursion flags L4859, primary keys L4913, secondary keys + selective logic L4938–L4985, sort + probability roll + budget L4993–L5076, recursion / min-activations continuation L5096–L5147, assembling before/after/depth/AN/EM/outlets L5191–L5276 |
| Inclusion groups, group scoring, group + timed effects | `filterByInclusionGroups` L5388, `filterGroupsByScoring` L5292, `filterGroupsByTimedEffects` L5337 |
| Final strings into the prompt | `getWorldInfoPrompt` L892 |
| How Generate() uses the result (chat newest first as "Name: text", examples before/after, depth injections per depth+role, outlets) | `public/script.js` L4624–L4680; depth injections joined with the preset's in-chat prompts in `openai.js` `populationInjectionPrompts` L810 |
| Author's Note defaults (WI anTop/anBottom go around it: interval 1, depth 4, in chat, system) | `public/scripts/authors-note.js` `setFloatingPrompt`, defaults L272 |

Ported in `packages/core/src/lorebook.ts`; `packages/st-lorebooks/test/st-parity.test.ts` cuts this file into its pure parts and checks that both give the same results (D-027). If a newer pin breaks the cut, the test says which marker moved.
| Converters from other formats (Agnai, Risu, NovelAI, card book) | L5477–L5617 |
| Server side (files in `data/<user>/worlds/*.json`) | `src/endpoints/worldinfo.js` |

## 4. Macros
| What | Where |
|---|---|
| New macro engine (lexer → parser → CST walker; scoped `{{if}}…{{/if}}`, args with `::`) | `public/scripts/macros/engine/` — `MacroEngine.js` (`evaluate` L117), `MacroLexer.js`, `MacroParser.js`, `MacroCstWalker.js`, `MacroRegistry.js`, `MacroEnvBuilder.js` |
| Macro definitions by group | `public/scripts/macros/definitions/`: `env-macros.js` (user, char, group, persona, charDescription, mesExamples, model…), `core-macros.js` (newline, trim, if/else, roll, random, pick, reverse, comment, outlet…), `chat-macros.js` (lastMessage, lastUserMessage, currentSwipeId…), `time-macros.js`, `variable-macros.js` (setvar/getvar/… local and global), `instruct-macros.js`, `state-macros.js` |
| Legacy entry points still called everywhere | `public/scripts/macros.js` `evaluateMacros` L610; `public/script.js` `substituteParams` L2981 (`substituteParamsExtended` L2815, legacy L2831) |
| Variables storage (chat vs global) | `public/scripts/variables.js` |

## 5. Personas
`public/scripts/personas.js`. Positions enum `persona_description_positions` L88 (IN_PROMPT 0, TOP_AN 2, BOTTOM_AN 3, AT_DEPTH 4; AFTER_CHAR deprecated). Persona data lives in `power_user.personas` / `power_user.persona_descriptions` (`public/scripts/power-user.js`). Locking to chat/character: `lockPersona` L1061, `unlockPersona` L1018, `loadPersonaForCurrentChat` L1543, `autoSelectPersona` L806. Description entering the prompt: `getOrCreatePersonaDescriptor` L1334, `public/script.js` `addPersonaDescriptionExtensionPrompt` L3203. Persona lorebook: `world-info.js` `getPersonaLore` L4564. Backup format: `onBackupPersonas` L1743.

## 6. Chats, swipes, groups
| What | Where |
|---|---|
| Chat file = JSONL; first line is the header `{user_name, character_name, create_date, chat_metadata}`, then one message per line (`name, is_user, mes, send_date, swipes[], swipe_id, swipe_info[], extra{}`) | save: `public/script.js` `saveChat` L7395; server: `src/endpoints/chats.js` `trySaveChat` L532, `getChatData` L577, `getChatInfo` L393 |
| Importers for other apps' chats (Ooba, Agnai, CAI, Kobold, Risu, Chub) | `src/endpoints/chats.js` L131–L309 |
| Swipe behaviour | `public/script.js` `swipe` L9954, `syncMesToSwipe` L6896, `syncSwipeToMes` L6954, `deleteSwipe` L9339 |
| Saving the reply / cleaning output | `saveReply` L6642, `cleanUpMessage` L6442 |
| Group chats (separate files, member order, auto mode) | `public/scripts/group-chats.js` — `getGroupChat` L255, `saveGroupChat` L623, `generateGroupWrapper` L945 |
| Author's note | `public/scripts/authors-note.js` |

## 7. Other things we may need to read once
- Regex scripts (placement, scoped to char/preset, markdown-only): `public/scripts/extensions/regex/engine.js` — `getRegexedString` L334, `runRegexScript` L391.
- Summary extension (old "memory"): `public/scripts/extensions/memory/index.js`.
- Reasoning/thinking parsing: `public/scripts/reasoning.js`. Tool calling: `public/scripts/tool-calling.js`.
- Converting CC messages to Claude/Google formats (system squashing, etc.): `src/prompt-converters.js` (tests: `tests/prompt-converters.test.js`).

## Verdict
**Adopt:** the formats (card V2/V3, lorebook entry schema, CC preset JSON, chat JSONL) and the WI activation semantics, verified by tests that compare our output with ST's.
**Avoid:** everything structural — global state, prompt built by mutating shared arrays, extensions hooking `eventSource`, string-based `{{macro}}` replacement scattered around.

## Homunculus 2 implementation (where we did it)
- CC presets: import/export `packages/st-presets/src/index.ts`; assembly `packages/core/src/presets.ts` (D-021). Macros: `packages/core/src/macros.ts`. Personas: `packages/st-personas` (D-019).
