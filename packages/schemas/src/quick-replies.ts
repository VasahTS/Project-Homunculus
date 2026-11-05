// Homunculus 2 — Quick Replies (SillyTavern's Quick Reply extension, text only). Author: CLAUDE, 2026-11-04 (D-090).
//
// Same meaning as SillyTavern's quick-reply sets (public/scripts/extensions/quick-reply/src/QuickReplySet.js,
// QuickReply.js), without STscript (Daniel: "it doesn't need ST's commands, just {{input}}, saving what I always send, OOC").
//   ST field                         → here
//   disableSend                      → !send          (true = put it in the message box)
//   injectInput                      → inject         (keep what is in the box and add the reply to it, with a space)
//   placeBeforeInput                 → before         (the reply goes before the box text, not after)
//   color / onlyBorderColor          → color / borderOnly
//   qrList[].label/title/message     → label / title / message
//   qrList[].icon / showLabel        → icon / showLabel  (ST's Font Awesome name is kept as written)
//   qrList[].contextList[]           → menu[]  ({ setId, chained }: ST keeps the set's name, we keep its id)
//   qrList[].isHidden                → hidden          (only in menus)
//   (ours)                           → stack           (repeated clicks pile up in the box; ST replaces)
// Not kept: auto-execute triggers and automation ids (they run STscript by themselves; Daniel doesn't use them).
import { z } from "zod";

export const QuickReplyMenuLink = z.object({
  setId: z.string().min(1),
  /** ST "Chaining": this reply's text goes first, then the picked one's. */
  chained: z.boolean().default(false),
});
export type QuickReplyMenuLink = z.infer<typeof QuickReplyMenuLink>;

export const QuickReply = z.object({
  id: z.string().min(1),
  label: z.string().default(""),
  /** Tooltip; empty = the text. */
  title: z.string().default(""),
  message: z.string().default(""),
  icon: z.string().default(""),
  showLabel: z.boolean().default(false),
  hidden: z.boolean().default(false),
  menu: z.array(QuickReplyMenuLink).default([]),
});
export type QuickReply = z.infer<typeof QuickReply>;
export type QuickReplyInput = z.input<typeof QuickReply>;

export const QuickReplySet = z.object({
  id: z.string().min(1),
  name: z.string().default("Quick Replies"),
  /** false = put the text in the message box (ST "Disable send"). */
  send: z.boolean().default(true),
  /** ST "Inject user input automatically": off = what you typed is replaced (unless the text uses {{input}}). */
  inject: z.boolean().default(false),
  /** ST "Place quick reply before input". */
  before: z.boolean().default(false),
  /**
   * Ours, not ST's (Daniel: "in the original they don't stack"): when the text goes to the box and the box already has
   * text, keep it and add the new text on its own line (after it, or before it with `before`) instead of
   * replacing it. A reply with {{input}} already holds the box text, so it replaces it as usual.
   */
  stack: z.boolean().default(true),
  /** A CSS color, or "" for none. */
  color: z.string().default(""),
  borderOnly: z.boolean().default(false),
  replies: z.array(QuickReply).default([]),
});
export type QuickReplySet = z.infer<typeof QuickReplySet>;
export type QuickReplySetInput = z.input<typeof QuickReplySet>;

/** A set switched on somewhere (ST's QuickReplySetLink): `visible` = its buttons show (ST "Buttons"). */
export const QuickReplyLink = z.object({
  setId: z.string().min(1),
  visible: z.boolean().default(true),
});
export type QuickReplyLink = z.infer<typeof QuickReplyLink>;

/** Everything about Quick Replies, kept in one app setting (ST keeps them in its settings too). */
export const QuickReplyData = z.object({
  sets: z.array(QuickReplySet).default([]),
  /** Global (every chat), then per story, per character and per chat, by id. */
  global: z.array(QuickReplyLink).default([]),
  story: z.record(z.string(), z.array(QuickReplyLink)).default({}),
  character: z.record(z.string(), z.array(QuickReplyLink)).default({}),
  chat: z.record(z.string(), z.array(QuickReplyLink)).default({}),
});
export type QuickReplyData = z.infer<typeof QuickReplyData>;
export type QuickReplyScope = "global" | "story" | "character" | "chat";
