# Architecture

Author: CLAUDE, 2026-10-23. v2 2026-10-27 (BLUEPRINT slice 0: the foundation matches the blueprint).

The whole-app plan (what goes where and in which order) is `docs/BLUEPRINT.md` (Portuguese). This file describes how the code is built. Where to look in other apps: `docs/reference/README.md`.

## One sentence
A **small core** with no UI stores data, runs **turns** (prompt → AI → agents), keeps per-message world state and **announces events**. Everything else is a **module** that plugs into it. The **UI** (React in Tauri) only reads data and sends commands.

## Layers
| Layer | Where | Rule |
|---|---|---|
| Data shapes | `packages/schemas` | Zod schemas; every boundary validates against them |
| Core ("brain") | `packages/core` | Never imports React, Tauri or `apps/` (enforced by `architecture.test.ts`) — this also keeps "run as a local server for phones" possible (BLUEPRINT §12) |
| Modules | `packages/*` (provider-openai, st-cards…) | Use only `ModuleApi`; our own features are modules too |
| UI | `apps/desktop` | Tauri + React; reads state, listens to events |

## Schemas (`packages/schemas/src`)
- `common.ts` — `Id`, `Json`, `UserRole`, `GenerationType`.
- `library.ts` — `Character` (+ `variants`, overrides only), `Persona` (+ variants, placement), `Avatar`.
- `setup.ts` — `SetupLayer` (every field optional = inherit), `ListOverride` (keep / only / add), `AgentOverride`, `Kit`.
- `play.ts` — `Campaign`, `Session` (`campaignId`, `setup`, `cast`), `CastMember` (`variantId`, `presence`, `muted`, `sheet`), `Message` (`kind`, `visibility`, `reasoning`), `Branch`.
- `agents.ts` — `AgentConfig`: triggers (`turn` before/parallel/after, `everyN`, `stateChange`, `sessionStart`, `chapterEnd`, `manual`) × output kind (`inject`, `intercept`, `rewrite`, `state`, `note`, `check`, `choices`, `proposal`, `speaker`, `media`) × run mode (`code`, `separate`, `inline`) + input, conditions, order, limits, randomness, tools, injection, state namespace, check policy.
- `trackers.ts` — `TrackerSchema` / `TrackerField` (text, number, meter, status, list, datetime, group; scope global/perCharacter/perPair; `lockedForAgents`; `toPrompt`).
- `records.ts` — per message: `StateDelta`, `AgentRun` (+ `stale`), `MessageRevision`, `AgentNote`, `GenerationRecord` (prompt parts with their source; `lore` = what the lorebooks did + timers).
- `lorebooks.ts` — `Lorebook`, `LoreEntry` (SillyTavern's World Info entry, clearer names, + `conditions`), `LoreSettings`, `LoreTimers`, `LoreReport` (D-027).
- `legacy.ts` — upgrades v0.0.1 sessions/cast on read (no data migration needed).

## Core pieces (`packages/core/src`)
- `prompt-control.ts` — immutable preset-ID/block-ID patches, inherited merge, order, field edits and reset (CODEX, D-042). `SetupLayer` also carries optional field-wise narrator placement. Turn/preview/manual context all resolve these before assembly; no database migration.
- `field-sets.ts` — versioned portable definition schema/validation, JSON serialization and immutable all-or-nothing copy/move between field-set drafts (CODEX, D-043). No UI/storage imports. `FieldSetTools.tsx` presents these operations in the existing tracker editor; `trackers.ts:portableSetOf` normalizes draft keys for Save/export.
- `events.ts` — `EventBus`: listeners run in parallel; a crashing listener is reported via `core.error`.
- `extensions.ts` — `ExtensionPoint<T>` and contracts: providers (`StreamChunk` = text | reasoning | usage), `ConnectionConfig` (+ `limits`, `fallback`), `AgentDefinition` (config + output schema + `run`), `AgentRunContext`, `AgentExecutor`, `AgentToolDefinition`, `PromptBlockDefinition`, `SetupFieldDefinition`, importers/exporters, macros, panels (+ `schemaId`).
- `core.ts` — `HomunculusCore`: module loading (dependency order), all extension points, `connections`, `state`.
- `setup.ts` — `resolveSetup(layers)`: builtin → default → campaign → session, with `sources` for the UI. **The only place that reads layers.**
- `connections.ts` — `ConnectionService`: per-connection gate (max concurrent, min interval), fallback before the first token, Stop (`AbortSignal`), `complete()` for agents.
- `agents/outputs.ts` — output shapes per kind, the built-in `separate` executor (prompt + transcript + state + dependency results + format instruction), JSON extraction, inline block instruction/extraction.
- `trackers.ts` — trackers driven only by their `TrackerSchema` (D-016): `trackerInstruction` (fields + example answer for the AI, names of the cast), `normalizeTrackerAnswer` (keeps only what fits: clamps numbers/bars, matches status options, list items, maps character names → ids, merges per-character/per-pair maps, drops read-only and unknown fields, reports what it left out), `trackerSummary` (the "Current scene" prompt part, fields with `toPrompt`), `valuesWithNames`, `formatFieldValue`, `fieldKeyFrom`. Storage layout per namespace: global `{key: v}`, per character `{key: {who: v}}` (who = character id, `user`, or `n:<Name>` for characters a tracker added in "anyone" sets), per pair `{key: {"whoA→whoB": v}}`. `trackerPeople` = cast (+ user unless the set is cast-only, + added characters found in the values). Lists with columns are rows (`{col: v}`); groups merge with the previous value. `trackerSummary` sends characters out of the scene (set `presence`) by name + their presence section only. The field set used is `setup.agentOverrides[tracker].schemaId` else `agent.state.schemaId` (`AgentRunner.trackerOf`). Agents with `input.cards` get the cast's cards (short) in their prompt.
- `agents/runner.ts` — `AgentRunner`: enabled agents of a setup (built-in + database), namespace owners (first claim wins), conditions (keywords, roles, generation types, min messages, state, stable/per-swipe probability), ordering (dependencies → sequential kinds intercept/rewrite/check by `order` → readers in parallel by dependency level), applying outputs (state with ownership + locked fields, notes, revisions), recording every run. State agents with a `schemaId` get the schema and cast in their context (`ctx.tracker`) and their answer goes through `normalizeTrackerAnswer` (left-out parts → `AgentRun.warnings`; nothing fits → failed run). `castOf(store, session)`.
- `turn.ts` — `TurnPipeline` (BLUEPRINT §6): user message → setup → before agents (inject/intercept/speaker) → prompt v0 + injections + inline instructions → main stream with parallel agents → reply + reasoning + generation record → inline extraction → after agents → regenerate on failed check → everyN / stateChange triggers → `turn.finished`. Also trackers catch-up when swipes skipped them, and `runManual`.
- `lorebook.ts` — `scanLorebooks` (pure port of SillyTavern's World Info scan; same results, checked against SillyTavern's code in `st-lorebooks/test/st-parity.test.ts`) and `loreConditionsHold` (ours). The turn calls it in `scanLore` (books of the setup, persona and speaking character; timers from the newest reply on the path) and passes the result to `buildPrompt` (`worldInfo`) (D-027).
- `presets.ts` — `buildPrompt` (preset blocks + markers + depth blocks + context budget → prompt parts with sources), `DEFAULT_PRESET`, `squashSystem`, `estimateTokens` (slice 2, D-021; replaced prompt-v0). `macros.ts` — `expandMacros` (SillyTavern syntax + `{{state.*}}`).
- `chat.ts` — `ChatService` (what the UI calls): `createSession` (simple cast, full cast, or from a campaign with its openings), `send`, `generate` (same parent again = swipe), `editMessage` (revision + stale marking), `editState` (user delta + stale marking).
- `state.ts` — `WorldState`: agents' delta then user's delta per message, pins last, snapshots every 50 messages along a path (a cache the store invalidates).
- `variants.ts` — `effectiveCharacter` / `effectivePersona`.
- `storage/` — `SqlDriver`, `migrate()` (backup hook), `SqlStore` (characters, personas, agents, tracker schemas, campaigns, default setup, sessions, message tree, branches, records, world state, snapshots), `SqlJsDriver`. Migration 3 = slice 0 tables; migration 4 = Trash (`trashed_at`) and `item_history` (slice 1, D-019); migration 5 = `connection_profiles` (slice 1b, D-020; `profileToConfig` in `connections.ts`); migration 6 = `presets` (slice 2, D-021); migration 7 = `lorebooks` (slice 3, D-027; `lorebooksForUse`, `getLoreSettings`, `loreTimersAlong`, `whoUsesLorebook`).

## Packages
- `packages/provider-openai` — module: OpenAI-compatible streaming provider (SSE parser, readable errors, reasoning from `reasoning`/`reasoning_content`, usage).
- `packages/st-cards` — module: SillyTavern character cards import/export (D-012).
- `packages/st-lorebooks` — module: SillyTavern World Info files and card books in/out, lossless; linking books to characters/personas; adopting the books embedded in cards (D-027).
- `apps/desktop` — Tauri 2 + React. `core-instance.ts` boots services once; `db.ts` picks the Tauri SQL driver or sql.js; `offline-ai.ts` is a fake provider (also sends a little "reasoning").

## Desktop UI (`apps/desktop/src`) — D-018
- `theme/tokens.css` — design tokens (the only colors, radii, fonts, sizes, panel widths). `theme/themes.ts` — `AppearanceProfile` data + `applyProfile` (data-theme / data-layout on `<html>`, token overrides, custom CSS).
- `styles.css` — uses tokens only. Regions carry `data-region` hooks (app, sidebar, toolbar, story, composer, inspector, library, editor) for themes and custom CSS.
- `ui/kit.tsx` — Button, IconButton, Segmented, Switch, Group/Row, Icon. New screens use the kit.
- `theme/navigation.ts` — data-defined primary destinations, Library groups, recent-chat limit and optional story shortcuts (D-040). `ui/LibraryWorkspace.tsx` groups the existing resource editors; `ui/CollectionTools.tsx` shares scoped search/activity filters between Stories and Characters. Quiet is an additional appearance profile; Customize remains pending.
- Shell (`App.tsx`): Sidebar (Stories, Characters, Library, Recent) + content (a session = `ChatView` with toolbar, story, composer and `Inspector`; or a Library page = `LibraryPages.tsx` master-detail with the editors).
- Lorebooks (D-028): `LorebookEditor.tsx` (editor "A": entries open in place; saves by itself; "Where it goes" by 5 kinds with `PlaceIcon` + Before/After; quick place menu and Always on on the closed row; Try It via `TurnPipeline.tryLorebook`), `LoreReplace.tsx` (Find and Replace, Ctrl+H), `LorePanels.tsx` (character/persona chips, the Prompt tab group via `TurnPipeline.lorebooksOf`, the Reply group, Settings → Lorebooks); the Global Lorebooks strip is in `LibraryPages.tsx` (the Default setup's list). Shared: `kit.tsx` `Collapse` holds its last frame when closing (no flicker); `Sortable.tsx` takes new items during render (no caret jump in boxes inside items).
- Inspector tabs: `ScenePanel` (trackers), `PromptPane` in `ConnectionPanel.tsx` (connection + samplers), `ReplyPane` (receipt from the generation record, agent runs and the state before/after a message).

## Golden rule
If a new feature requires editing the core, first ask "is an extension point missing?". If so, add the extension point and log it in `DECISIONS.md`. Never add a shortcut. Before building anything, answer BLUEPRINT §13.

## SillyTavern compatibility
At the border only: importers/exporters (modules) translate ST cards, lorebooks, presets and chats to our model and back. Originals are kept intact (`original` field). ST extensions are not supported.
