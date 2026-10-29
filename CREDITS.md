# Credits

Homunculus 2 is licensed under the GNU Affero General Public License v3.0 (see `LICENSE`).

Code adapted from other AGPL-3.0 projects must be listed here: project, original file, what was adapted, and the commit it came from. Keep the original copyright notices in adapted files.

| Project | Original file / feature | Adapted into | Commit | Notes |
|---|---|---|---|---|
| Homunculus v1 (VasahTS/Homunculus, Daniel's own project, AGPL-3.0 as a SillyTavern fork) | Scene tracker prompts and field presets: `public/scripts/extensions/in-chat-agents/templates/index.json` ("Scene: World", "Scene: Characters", "Scene: Plot"), `public/scripts/classic-scene-fields.js` (Standard / Superpowers / Sci-fi / Minimal / Survival presets, time and concreteness rules) | `apps/desktop/src/starter/trackers.json` (data, rewritten for the Homunculus 2 field format; Fantasy set is new) | 0884338ac4c2c8411757bb0108649aef458b5ade | text adapted, not code |

| SillyTavern (SillyTavern/SillyTavern, AGPL-3.0) | World Info activation: `public/scripts/world-info.js` (`WorldInfoBuffer`, `WorldInfoTimedEffects`, `getSortedEntries`, `parseDecorators`, `parseRegexFromString`, `checkWorldInfo`, `filterByInclusionGroups`, `filterGroupsByScoring`, `filterGroupsByTimedEffects`, `convertCharacterBook`) and `src/endpoints/characters.js` (`convertWorldInfoToCharacterBook`) | `packages/core/src/lorebook.ts` (logic ported to TypeScript, pure function), `packages/st-lorebooks/src/index.ts` (field mapping) | 06bde939fb1e9c4c8d8641d810f0a916b5bce127 | ported, same behaviour; the parity test runs SillyTavern's file itself (not copied into the repo) |

Formats read at the "border" (no code copied): SillyTavern's persona backup / settings (`public/scripts/personas.js` `onBackupPersonas`, `persona_description_positions`; commit 06bde939) for `packages/st-personas`; SillyTavern's Chat Completion preset format and prompt assembly order (`public/scripts/openai.js` `preparePromptsForChatCompletion`, `populationInjectionPrompts`; `default/content/presets/openai/Default.json`; macro names from `public/scripts/macros/`) for `packages/st-presets`, `packages/core/src/presets.ts` and `macros.ts`.

Reference projects studied (ideas, not code, unless listed above): SillyTavern, SillyBunny, Homunculus v1 (VasahTS/Homunculus), Marinara Engine, Aventuras. Studied commits are pinned in `docs/reference/pins.json`.

Planned reference (MIT): fiction-prose-style (github.com/unkarelian/fiction-prose-style, commit 2f5947ac) for the Style Reviewer — list here when its scanner or guide is adapted.
