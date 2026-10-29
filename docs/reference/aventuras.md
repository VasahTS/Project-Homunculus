# Aventuras — reference map

Repo: https://github.com/AventurasTeam/Aventuras · branch **`master`** (not `main`) · commit in `pins.json` (d98ad752, 2026-10-26; v0.7.12). Lines below are at that commit. License AGPL-3.0.
Symbol index: `symbols/aventuras.txt`.

**What it is:** interactive fiction / adventure app. **Same stack family as Homunculus 2**: Tauri 2 + SQLite (sqlx migrations in Rust) + a web UI (SvelteKit 5, Tailwind 4, shadcn-svelte). AI through the Vercel AI SDK (`@ai-sdk/*`). Also runs on Android/iOS.

**Read first — their docs are excellent and short:** `CLAUDE.md` (table "Where the reasoning lives"), `docs/README.md`, then one file per area in `docs/architecture/`:
| Doc | About |
|---|---|
| `docs/architecture/overview.md` | repo layout, **data model** (L199), **generation pipeline** (L419), generation lease, panels & gestures, images |
| `docs/architecture/context-injection.md` | lorebook retrieval vs live world state, tiers, stickiness, agentic retrieval, memory fill |
| `docs/architecture/prompts.md` | prompt packs, template resolution, **block ordering for prefix caching** (L226) |
| `docs/architecture/ai-services.md` | every AI task is a `ServiceId` with its own model profile; reasoning effort; defaults |
| `docs/architecture/persistence.md` | SQLite, migrations, the settings blob |
| `docs/architecture/state-tracking.md` | records every change so revert/checkpoints can rebuild a past entry |
| `docs/architecture/lore-management.md` | AI that maintains the lorebook, duplicates |
| `docs/architecture/story-time.md` | in-story clock, time anchors |
| `docs/architecture/exchange-format.md` | their own file format for characters/lorebooks/scenarios (why not ST cards) |
| `docs/architecture/narration-cleaning.md`, `dialogue-and-tts.md` | cleaning narration for reviewers, dialogue highlighting |
| `docs/development/testing.md`, `platform-support.md` | testing pure logic outside Svelte; WebView minimums (Chrome 111 / Safari 16.4) |

## 1. Generation pipeline (phases)
Turn = `Retrieval → Narrative → Classification → Translation → Image/BackgroundImage → PostGeneration`, with `PreGeneration` first (retry backup). Only Narrative is fatal; other phases degrade. Phases are async generators yielding typed events; dependencies are injected (testable without a provider).
| What | Where |
|---|---|
| Wiring | `src/lib/services/generation/GenerationPipeline.ts` (class L106) |
| Phases | `src/lib/services/generation/phases/` — `RetrievalPhase.ts`, `NarrativePhase.ts`, `ClassificationPhase.ts`, `PostGenerationPhase.ts`, `PreGenerationPhase.ts`, `TranslationPhase.ts`, `ImagePhase.ts` |
| Dependencies built in the UI | `src/lib/components/story/ActionInput.svelte` (`buildPipelineDependencies`) |
| Background work after a turn (chapters, lore management, style review) | `src/lib/services/generation/BackgroundTaskCoordinator.ts`, `StyleReviewScheduler.ts`, `LoreManagementCoordinator.ts` |
| Retry / swipe-like regeneration | `src/lib/services/generation/RetryService.ts` |

## 2. AI services ("agents" as typed services)
`src/lib/services/ai/` — each task is a service with its own model profile (`ServiceId`; config `ai/core/config.ts`, `ai/core/defaults.ts`, factory `ai/core/factory.ts`).
| Service | Where |
|---|---|
| Narrator | `ai/generation/NarrativeService.ts` (class L328; chapter summaries block L168, timeline fill block L234) |
| Classifier (updates world state after each turn: characters, locations, items, story beats) | `ai/generation/ClassifierService.ts` (L64), `classifierCharacters.ts`, schema `ai/sdk/schemas/classifier.ts` |
| World state injection (`[PROTAGONIST]`, `[CURRENT LOCATION]`, `[CHARACTERS PRESENT]`, `[INVENTORY]`, `[ACTIVE THREADS]`…) | `ai/generation/WorldStateInjector.ts` (L177) |
| Memory (chapters, summaries) | `ai/generation/MemoryService.ts` (L59), templates `services/prompts/templates/memory.ts` |
| Suggestions / action choices / style reviewer | `ai/generation/SuggestionsService.ts`, `ActionChoicesService.ts`, `StyleReviewerService.ts` |
| Lorebook retrieval (tiers, stickiness, second pass) | `ai/retrieval/EntryRetrievalService.ts` (L219), `tier3Selection.ts`, `stickiness.ts`, `tier2SecondPass.ts` |
| Agentic retrieval (model uses tools to search lore/chapters) | `ai/retrieval/AgenticRetrievalService.ts` (L134), tools in `ai/sdk/tools/` |
| Lore management (AI edits lorebook between chapters) | `ai/lorebook/LoreManagementService.ts` (L128) |
| Vault assistant (chat with an AI that edits your vault via tools) | `ai/vault/InteractiveVaultService.ts` (L198). Tool categories loaded on demand `TOOL_CATEGORIES` / `load_toolset` (L62–104); stream events incl. tool cards and reasoning (L139); "effective vault" = saved + pending + unsaved (`effectiveState` L281, `ai/vault/effectiveVault.ts`); focused entity re-sent only when changed (`renderUserMessage` L340); tool loop `stopWhen: stopWhenDone(50)` (L631). Tools: `ai/sdk/tools/character.ts`, `lorebook.ts`, `scenario.ts`, `vault.ts`, `viewer.ts`, `fandom.ts`, `image.ts`; proposals schema `ai/sdk/schemas/vault.ts`; merge helpers `src/lib/utils/vaultMerge.ts`. Settings: `InteractiveVaultSettings` in `src/lib/stores/settings.svelte.ts` (L450: profileId — null = main profile —, model, temperature, reasoningEffort, manualBody; prompt template `interactive-vault`). UI: `src/lib/components/vault/InteractiveVaultAssistant.svelte` (approve/reject L742–758, saved conversations L322–480, auto-approve of lorebook creation L597), `src/lib/stores/vaultEditorStore.svelte.ts`. → Homunculus 2 idea: BLUEPRINT §4.9. |
| Scenario wizard (setup "ready to play") | `ai/wizard/ScenarioService.ts` (L70), templates `prompts/templates/wizard.ts`, UI `src/lib/components/wizard/` |
| AI SDK layer: generate, agents with stop conditions, middleware (retry, logging, schema), providers | `ai/sdk/generate.ts`, `ai/sdk/agents/`, `ai/sdk/middleware/`, `ai/sdk/providers/` |

## 3. Prompts and templates
- Templates are **Liquid** (`liquidjs`): `src/lib/services/templates/engine.ts` (`TemplateEngine` L18), variables `templates/variables.ts`, validator `templates/validator.ts`.
- Built-in prompt packs: `src/lib/services/prompts/templates/*.ts` (`content` = system part, `userContent` = user part). Update rules for user-edited packs: `CLAUDE.md` §Prompt template changes.
- Context builder: `src/lib/services/context/context-builder.ts` (`ContextBuilder` L23).

## 4. World state, history, rollback
- State tracking (pure, tested): `src/lib/services/stateTracking/` (`record.ts`, `reverse.ts`, `runs.ts`, `past.ts`); rollback: `src/lib/services/rollbackService.ts` (`planRollback` L61, `RollbackService` L201).
- Story time: `src/lib/services/storyTime/`.
- Branches UI: `src/lib/components/branch/`.

## 5. Persistence (closest to our Tauri setup)
- Rust side: `src-tauri/src/lib.rs` (plugin setup, commands), `db.rs`, `db_tx.rs` (transactions), `backup.rs`, migrations `src-tauri/migrations/*.sql` (43 numbered, sqlx-checksummed: never edit a shipped one; LF endings).
- TS side: `src/lib/services/database.ts` (4.8k lines, all queries).
- Docs: `docs/architecture/persistence.md`.

## 6. Import / export
- ST cards: `src/lib/services/characterCardImport/` (`pngDecoder.ts` `readFromPng` L17, `sillyTavernCards.ts`, `parseJson.ts`, AI-assisted conversion `aiService.ts`).
- ST chats: `src/lib/services/stChatImporter.ts` (`parseSTChat` L42).
- Lorebooks in/out (incl. embedded, type inference): `src/lib/services/lorebookImportExport/`.
- Own format: `src/lib/services/exchange/` + `docs/architecture/exchange-format.md`.

## 7. Story = one playthrough, with its own settings (read 2026-10-29 for Stories v4)
- `Story` (`src/lib/types/index.ts` L41): entries, branches, memory **and** `settings: StorySettings` (L162: model, temperature, maxTokens, pov, tense, tone, targetLength, customSystemPrompt…). No sessions inside a story; a new run = a new story.
- New story: `src/lib/components/wizard/SetupWizard.svelte` (step titles L107: Mode → Prompt Pack → World & Setting → Character → Supporting Cast → Lorebook → Portraits → Writing Style → Opening), steps in `wizard/steps/`.
- Screen docs (branch `main`): `docs/ui/screens/story-settings/story-settings.md` (Story vs Settings sections; **models are override-only**: "App default: X" until picked, × to clear; agent overrides empty by default), `story-list/story-list.md` (one card per story: mode · chapter · last opened).

## Verdict
**Adopt/adapt:** phases as injected, testable steps; "only the narrator is fatal"; one model profile per AI task; classifier → structured world state → injector (instead of parsing tracker text); state tracking + rollback; prompt block order chosen for prefix caching; their Tauri/SQLite migration discipline.
**Avoid:** it is single-player adventure-first (no group chat/roleplay cards as the core); lorebook model differs from ST, so not a reference for ST-faithful activation.

## UI design docs (branch `main`, commit 92fe08be, 2026-10-27)
Studied for the UI phase (mockup "J" on the UI canvas). Not in `.refs/` (that pins `master`); clone `main` with sparse checkout `docs/ui`.
| What | Where |
|---|---|
| Cross-screen rules: top bar tiers (essentials / in-story / reader-only), generation status pill, chapter progress strip, World vs Plot split, Settings icon scope | `docs/ui/principles.md` |
| Reader / composer: layout, per-entry meta line (reasoning toggle + reply/reasoning tokens), per-entry world-time footer, suggestions panel (Action/Dialogue/Examine/Move), composer mode, Browse rail (category dropdown, filters, grouped list, recently-classified tint), collapsed rail as a 28–32 px dashboard strip with counts, peek drawer (~440 px sheet) | `docs/ui/screens/reader-composer/reader-composer.md` (+ `.html` wireframe with state toggles) |
| Other screens with wireframes | `docs/ui/screens/{story-list,world,plot,story-settings,app-settings,chapter-timeline,wizard,onboarding,vault/calendars,diagnostics,memory-probe}/` |
| Foundations (color slots + contrast targets, type, spacing, theming, mobile) and patterns (entity rows, chips, forms, overlays, toolbar, actions menu, delta log row…) | `docs/ui/foundations/`, `docs/ui/patterns/` |
