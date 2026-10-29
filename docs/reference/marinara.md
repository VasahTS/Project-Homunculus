# Marinara Engine — reference map

Repo: https://github.com/Pasta-Devs/Marinara-Engine · branch `main` · commit in `pins.json` (e5ead06a, 2026-10-23; v2.5.1). Lines below are at that commit. License AGPL-3.0.
Symbol index: `symbols/marinara.txt` (big: grep it).
Downloadable agents (Illustrator, Lorebook Keeper, trackers…) live in **another repo**: https://github.com/Pasta-Devs/Marinara-Agents (not pinned here).

**What it is:** a from-scratch TypeScript roleplay app. pnpm monorepo: `packages/shared` (types, Zod schemas, pure helpers), `packages/server` (Fastify + file-backed JSON "tables" in `DATA_DIR/storage`), `packages/client` (React 19 + Vite PWA, Zustand stores, React Query). Three modes: Conversation, Roleplay, Game.

**Read first (their own maps, better than re-deriving):**
- `docs/development/architecture-map.md` — package boundaries, section codes, mode ownership, the big files.
- `docs/contrib/engine-foundations-overview.md` — foundations.
- `docs/development/file-storage.md` — storage engine.
- User docs per feature in `docs/agents/`, `docs/prompts/`, `docs/lorebooks/`, `docs/chats/`, `docs/characters/`, `docs/roleplay/`, `docs/data/importing-from-sillytavern.md`. Screenshots in `docs/screenshots/`. Design language: `DESIGN.md`, product: `PRODUCT.md`.

Warning: generation is concentrated in huge files — `packages/server/src/routes/generate.routes.ts` (14.9k lines; `runGeneration` L14834, route `POST /` L14852), `packages/client/src/hooks/use-generate.ts` (4.5k; `useGenerate` L1237), `routes/generate/retry-agents-route.ts` (5.7k), `routes/generate/dry-run-route.ts` (2.7k). Read by function, never whole.

## 1. Agents (the main reason to study it)
Concept (`docs/agents/agents-overview.md` §The three phases): every agent runs at one **phase** — `pre_generation` (injects context), `parallel` (alongside the reply, cannot change it), `post_processing` (reads/edits the finished reply). Enabled **per chat**, not per character. Agents sharing provider+model are **batched into one LLM call**.

| What | Where |
|---|---|
| Phase orchestration + batching | `packages/server/src/services/agents/agent-pipeline.ts` (header comment L1–L13 explains it) |
| Execute one agent / a batch, prompt template rendering, token caps, output-format block | `packages/server/src/services/agents/agent-executor.ts` — `renderAgentPromptTemplate` L323, `buildAgentOutputFormatBlock` L553, `executeAgent` L847, `executeAgentBatch` L1451, `resolveAgentResultType` L3544 |
| Agent types (config, phases, result types, context given to agents, write approvals) | `packages/shared/src/types/agent.ts` — `AgentPhase` L14, `AgentConfig` L79, `AgentResult` L266, `AgentWriteApprovalProposal` L285, `AgentContext` L352, `BuiltInAgentMeta` L555 |
| Agent manifests / registry (package format) | `packages/shared/src/features/agents/agent-manifest.types.ts`, `agent-registry.ts`; docs `docs/development/optional-agent-packages.md`, `docs/agents/custom-agents.md` |
| Built-in prompt texts | `packages/shared/src/constants/agent-prompts.ts` |
| Knowledge retrieval / router agents | `packages/server/src/services/agents/knowledge-router.ts`, `knowledge-retrieval.ts` |
| Per-request agent glue (activation, approval of writes to lorebook/card/summary, result capabilities) | `packages/server/src/routes/generate/agent-activation.ts`, `agent-write-approval.ts`, `agent-result-capabilities.ts` |
| Agent storage | `packages/server/src/services/storage/agents.storage.ts` |
| UI: editor, catalog, activity, context injection panel | `packages/client/src/components/agents/` (`AgentEditor.tsx`, `AgentCatalogView.tsx`, `ContextInjectionPanel.tsx`, `AgentActivitySection.tsx`) |

## 2. Prompt assembly and presets
| What | Where |
|---|---|
| Assembler (sections, markers, groups, history bounds) | `packages/server/src/services/prompt/assembler.ts` — `assemblePrompt` L275, `resolveSection` L876, `buildGroupMessages` L1018 |
| Marker expansion (char/persona/lorebook/examples… markers) | `packages/server/src/services/prompt/marker-expander.ts` |
| Macro context for prompts | `packages/server/src/services/prompt/macro-context.ts` |
| Preset types: `PromptPreset` L62, `PromptSection` L114, `MarkerConfig` L46, `InjectionPosition` L20, `WrapFormat` (xml/markdown/none) L27, **choice blocks / preset variables** `ChoiceBlock` L152, `PromptVariableGroup` L182 | `packages/shared/src/types/prompt.ts` |
| Chat presets (per-chat settings bundles) | `packages/shared/src/types/chat-preset.ts`, `packages/server/src/services/storage/chat-presets.storage.ts` |
| Default preset | `packages/server/src/db/default-preset.json` |
| Docs | `docs/prompts/presets.md`, `preset-variables.md`, `conditional-prompts.md`, `macros.md`, `prompt-overrides.md` |
| Macro engine (3.5k lines; list of supported macros `SUPPORTED_MACROS` L423) | `packages/shared/src/utils/macro-engine.ts` |
| Prompt preview / "peek prompt" | `packages/server/src/routes/generate/prompt-preview.ts`, `dry-run-route.ts`; docs `docs/chats/peek-prompt.md` |

## 3. Lorebooks
| What | Where |
|---|---|
| Keyword scan (pure functions: conditions, timing/sticky/cooldown, context filters, recursion) | `packages/server/src/services/lorebook/keyword-scanner.ts` — `evaluateConditions` L91, `updateTimingStatesForScan` L272, `lorebookEntryPassesContextFilters` L344, `scanForActivatedEntries` L501, `recursiveScan` L798 |
| Budget, depth injection, before/after blocks | `packages/server/src/services/lorebook/prompt-injector.ts` — `applyTokenBudget` L171, `injectAtDepth` L124, `buildWorldInfoBlocks` L68, `processActivatedEntries` L208 |
| Semantic (embedding) activation | `packages/server/src/services/lorebook/embeddings.ts`; docs `docs/lorebooks/semantic-search.md` |
| Card book ↔ lorebook sync | `packages/server/src/services/lorebook/character-book-sync.ts` |
| Types (`SelectiveLogic`, positions, decision mode, scope) | `packages/shared/src/types/lorebook.ts` |
| Pure helpers: keyword matching, lint, text format | `packages/shared/src/utils/lorebook-keyword-matching.ts`, `lorebook-lint.ts`, `lorebook-text-format.ts` |

## 4. Memory
Docs: `docs/agents/memory.md` (Memory Recall vs Advanced Memory Recall vs Chat Summary vs Conversation auto-summaries).
| What | Where |
|---|---|
| Memory Recall (embed message chunks, recall similar ones) | `packages/server/src/services/memory-recall.ts` — `chunkAndEmbedMessages` L549, `rebuildMemoryChunks` L561, `recallMemories` L588; `memory-recall-embedding.ts`; `services/generation/memory-recall-context.ts` |
| Advanced memory (scenes, who saw what, character recollections) | `packages/server/src/services/advanced-memory.ts` (6.6k; `createAdvancedMemoryService` L1091), `advanced-memory-ranking.ts`, `advanced-memory-decisions.ts`, prompt part `services/prompt/advanced-memory-prompt.ts` |
| Decision model (yes/no with calibrated probability: Jev via TypeSafe "System One"/OpenRouter, Open-Jev local) — used by Advanced Memory's two passes (scenes → messages) | `packages/server/src/services/advanced-memory-decisions.ts` — `rankDecisionMemories` L152, `detectDecisionSceneStarts` L306; `services/decision/system-one.client.ts` — `askNoulQuestions` L93; `services/decision/decision-connection.ts` — `resolveDecisionConnection` L54. Docs: `docs/connections/decision-models.md`. Our study: `docs/MEMORY-PLAN.md` |
| Chat Summary (Roleplay: every N user messages, Last/Range, Write, Backfill, hide summarised) | `packages/server/src/services/generation/roleplay-summary-runtime.ts`; `packages/shared/src/utils/chat-summary-entries.ts` |
| Long-term memory runtime, summaries | `packages/server/src/services/generation/long-term-memory-runtime.ts`, `roleplay-summary-retrieval.ts`; `packages/shared/src/utils/chat-summary-entries.ts` |

## 5. SillyTavern import (useful as a second opinion on ST formats)
`packages/server/src/services/import/`: `st-character.importer.ts` (`importSTCharacter` L209, `importCharX` L421), `st-lorebook.importer.ts` (`resolveSelectiveLogic` L223, `resolvePosition` L236, `importSTLorebook` L374), `st-prompt.importer.ts` (`importSTPreset` L48 — CC preset → their preset), `st-chat.importer.ts` (`importSTChat` L298), `st-bulk.importer.ts` (whole ST data folder: `scanSTFolder` L208, `runSTBulkImport` L561). Docs: `docs/data/importing-from-sillytavern.md`.

## 6. Characters, personas, chats, UI
| What | Where |
|---|---|
| Types | `packages/shared/src/types/character.ts`, `persona.ts`, `chat.ts` |
| Storage | `packages/server/src/services/storage/characters.storage.ts`, `chats.storage.ts` (4k) |
| Persona projection into prompts | `packages/server/src/services/personas/persona-projector.ts` |
| Character library (card grid + portrait panel — Daniel liked this) | `packages/client/src/components/characters/CharacterLibraryView.tsx`, `CardLibraryPreview.tsx`, `CharacterEditor.tsx` |
| Roleplay HUD / trackers | `packages/client/src/components/chat/RoleplayHUD.tsx`, `packages/shared/src/utils/tracker-field-locks.ts`; docs `docs/roleplay/hud-and-trackers.md` |
| Bot browser (Chub, Janny, Pygmalion, Wyvern, DataCat) | `packages/server/src/routes/bot-browser*.routes.ts`, `packages/client/src/components/bot-browser/` |
| Onboarding / setup | `packages/shared/src/utils/onboarding.ts`, `packages/client/src/components/onboarding/` |
| Conversation mode (schedules, autonomous messages, awareness) | `packages/server/src/services/conversation/` |
| Providers | `packages/server/src/services/llm/` (`provider-registry.ts`, `base-provider.ts`, `providers/openai.provider.ts`) |
| Regex scripts | `packages/server/src/services/regex/regex-application.ts`, `packages/shared/src/utils/regex-safety.ts` |

## 7. New chat setup and per-chat agents (read 2026-10-29 for Stories v4)
- `packages/client/src/components/chat/ChatSetupWizard.tsx`: `ROLEPLAY_STEPS` L130 (Name & Connection → Preset → Persona & Characters → Lorebooks → Enable Agents); `renderAgents` (~L3366): master "Enable agents" switch, search, sections by category (Writer / Tracker / Misc / Custom), preview with context size before adding.
- Settings profiles (= our Kits): `packages/shared/src/types/chat-preset.ts` — connection + preset + metadata (agents, lorebook settings…), never the chat's identity (characters, persona, summaries).
- Docs: `docs/roleplay/getting-started.md` §Starting a roleplay, `docs/chats/chat-settings.md`.

## Verdict
**Adopt/adapt:** the 3-phase agent model with batching per connection, agents enabled per chat, write approvals (agent proposes, user confirms), pure lorebook scanner as a model for ours, preset variables/choice blocks, memory recall design, ST importers as cross-check.
**Avoid:** orchestration in giant route files, client hook that touches every store, file-backed table store (we have SQLite).
