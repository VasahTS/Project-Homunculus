// Homunculus 2 — regex scripts (find/replace on messages, lore and reasoning). Author: CLAUDE, 2026-11-01 (D-060).
//
// Same meaning as SillyTavern's regex scripts (public/scripts/extensions/regex/engine.js), with plain names:
//   ST field          → here
//   scriptName        → name
//   findRegex         → find          ("/pattern/flags" or a plain pattern)
//   replaceString     → replace       ({{match}} / $0 = the whole match, $1… / $<name> = groups, macros allowed)
//   trimStrings       → trim          (removed from each group before it goes in)
//   placement[]       → targets       (1 user, 2 ai, 3 command, 5 lore, 6 reasoning; 0 = old "display" value, kept)
//   disabled          → !on
//   markdownOnly      → displayOnly   (only changes what is shown; the saved text stays)
//   promptOnly        → promptOnly    (only changes what the AI is sent; the saved text stays)
//                       neither       → changes the saved message itself when it is sent/received
//   runOnEdit         → runOnEdit
//   substituteRegex   → findMacros    (0 none, 1 raw, 2 escaped: macros inside the pattern)
//   minDepth/maxDepth → minDepth/maxDepth (0 = the newest message; null = no limit)
import { z } from "zod";

export const RegexTarget = z.enum(["user", "ai", "command", "lore", "reasoning", "display"]);
export type RegexTarget = z.infer<typeof RegexTarget>;

export const RegexScript = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  find: z.string().default(""),
  replace: z.string().default(""),
  trim: z.array(z.string()).default([]),
  targets: z.array(RegexTarget).default([]),
  on: z.boolean().default(true),
  displayOnly: z.boolean().default(false),
  promptOnly: z.boolean().default(false),
  runOnEdit: z.boolean().default(true),
  findMacros: z.enum(["none", "raw", "escaped"]).default("none"),
  minDepth: z.number().int().nullable().default(null),
  maxDepth: z.number().int().nullable().default(null),
});
export type RegexScript = z.infer<typeof RegexScript>;
export type RegexScriptInput = z.input<typeof RegexScript>;

/** Where a script came from; the order is SillyTavern's priority (global first, then preset, then character). */
export const RegexScope = z.enum(["global", "preset", "character"]);
export type RegexScope = z.infer<typeof RegexScope>;
