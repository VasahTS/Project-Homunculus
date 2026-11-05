// Homunculus 2 — Quick Replies: what a click puts in the box or sends, the ⋮ menu, which sets show, SillyTavern files.
// Author: CLAUDE, 2026-11-04 (D-090). Behaviour copied from SillyTavern's quick-reply extension at the pinned commit:
//   QuickReplySet.executeWithOptions (the text), ui/ctx/ContextMenu.build (the menu), ui/ButtonUi.renderBar (the order),
//   index.js loadSets (old v1 files), QuickReplySet.toJSON / QuickReply.toJSON (the export file).
// Text only: STscript is not run (a text starting with "/" is just text here).
import { QuickReply, QuickReplyData, QuickReplySet, type QuickReplyLink, type QuickReplyScope } from "@homunculus/schemas";

/** {{input}} as SillyTavern reads it: the whole message box, as it is (macros.js: `$('#send_textarea').val()`). */
const INPUT = /\{\{input\}\}/gi;
export const usesInput = (text: string) => /\{\{input\}\}/i.test(text);
export const fillInput = (text: string, box: string) => text.replace(INPUT, () => box);

export interface QuickReplyResult {
  /** What the message box holds afterwards (when `send`, what is sent; the box is then emptied). */
  text: string;
  send: boolean;
}

/**
 * One click (QuickReplySet.executeWithOptions): with "inject" and text in the box, the box text is kept and the reply
 * goes after it (or before it), with a space; otherwise the reply replaces the box, plus a trailing space. Either way
 * {{input}} becomes the box text as it was before the click. `stack` (ours) keeps the box text when the reply goes to the
 * box, on its own line, instead of replacing it.
 */
export function runQuickReply(set: Pick<QuickReplySet, "send" | "inject" | "before" | "stack">, message: string, box: string): QuickReplyResult {
  const filled = fillInput(message, box);
  let text: string;
  if (set.inject && box.length > 0) text = set.before ? `${filled} ${box}` : `${box} ${filled}`;
  else if (set.stack && !set.send && box.trim() && !usesInput(message)) text = set.before ? `${filled}\n${box.replace(/^\s+/, "")}` : `${box.replace(/\s+$/, "")}\n${filled} `;
  else text = `${filled} `;
  return set.send ? { text: text.trim(), send: true } : { text, send: false };
}

// ---------------------------------------------------------------- which sets show

export interface QuickReplyPlace { storyId?: string | null; characterIds?: readonly string[]; chatId?: string | null }
export interface ShownSet { set: QuickReplySet; link: QuickReplyLink; scope: QuickReplyScope }

/**
 * The sets on for a chat, in ButtonUi's order (global, then ours: story, then character, then chat). A set on in two
 * places shows once (its first place; its buttons show if any place shows them). Missing sets are left out.
 */
export function shownSets(data: QuickReplyData, at: QuickReplyPlace): ShownSet[] {
  const byId = new Map(data.sets.map((s) => [s.id, s]));
  const groups: Array<[QuickReplyScope, QuickReplyLink[]]> = [
    ["global", data.global],
    ["story", at.storyId ? data.story[at.storyId] ?? [] : []],
    ["character", (at.characterIds ?? []).flatMap((id) => data.character[id] ?? [])],
    ["chat", at.chatId ? data.chat[at.chatId] ?? [] : []],
  ];
  const out: ShownSet[] = [];
  const seen = new Map<string, ShownSet>();
  for (const [scope, links] of groups) for (const link of links) {
    const set = byId.get(link.setId);
    if (!set) continue;
    const had = seen.get(set.id);
    if (had) { if (link.visible && !had.link.visible) had.link = { ...had.link, visible: true }; continue; }
    const row = { set, link: { ...link }, scope };
    seen.set(set.id, row);
    out.push(row);
  }
  return out;
}

/** The buttons for the bar: the visible sets' replies that are not hidden. */
export function barReplies(shown: readonly ShownSet[]): Array<{ set: QuickReplySet; reply: QuickReply }> {
  return shown.filter((s) => s.link.visible).flatMap((s) => s.set.replies.filter((r) => !r.hidden).map((reply) => ({ set: s.set, reply })));
}

// ---------------------------------------------------------------- the ⋮ menu

export type QuickReplyMenuItem =
  | { kind: "header"; label: string }
  | { kind: "reply"; reply: QuickReply; set: QuickReplySet; message: string; children: QuickReplyMenuItem[] };

/**
 * ContextMenu.build: for each set in the reply's menu, a header and its visible replies (a set already on the way is
 * skipped, so menus can't loop). A reply's own set in its menu lists only its hidden replies that have an icon (ST's
 * "burger menu"). Chained: the parent's text goes first — ST joins with " | " (an STscript pipe); as text, a new line.
 * %%parent%% / %%parent-2%% become the labels above.
 */
export function quickReplyMenu(reply: QuickReply, sets: readonly QuickReplySet[], parentMessage: string | null = null, path: readonly string[] = [], labels: readonly string[] = []): QuickReplyMenuItem[] {
  const message = (parentMessage && reply.message ? `${parentMessage}\n` : "") + reply.message;
  const items: QuickReplyMenuItem[] = [];
  for (const link of reply.menu) {
    const set = sets.find((s) => s.id === link.setId);
    if (!set || path.includes(set.id)) continue;
    const nextPath = [...path, set.id], nextLabels = [...labels, reply.label];
    items.push({ kind: "header", label: set.name });
    const own = set.replies.some((r) => r.id === reply.id);
    for (const sub of set.replies.filter((r) => (own ? r.hidden && !!r.icon : !r.hidden))) {
      const subMessage = (link.chained && message && sub.message ? `${message}\n` : link.chained && message ? message : "") + sub.message;
      items.push({
        kind: "reply", reply: sub, set,
        message: subMessage.replace(/%%parent(-\d+)?%%/g, (_, i: string | undefined) => nextLabels.slice(parseInt(i ?? "-1", 10))[0] ?? ""),
        children: quickReplyMenu(sub, sets, link.chained ? message : null, nextPath, nextLabels),
      });
    }
  }
  return items;
}

/** A menu has something to open (ST's ⋮ shows on every button; we show it only when it leads somewhere). */
export const hasQuickReplyMenu = (reply: QuickReply, sets: readonly QuickReplySet[]) => quickReplyMenu(reply, sets).some((i) => i.kind === "reply");

// ---------------------------------------------------------------- data

export const emptyQuickReplyData = (): QuickReplyData => QuickReplyData.parse({});
export const cleanQuickReplyData = (v: unknown): QuickReplyData => {
  const r = QuickReplyData.safeParse(v ?? {});
  return r.success ? r.data : emptyQuickReplyData();
};

/** The links of one place (global, or a story / character / chat by id). */
export function linksAt(data: QuickReplyData, scope: QuickReplyScope, id?: string | null): QuickReplyLink[] {
  if (scope === "global") return data.global;
  return id ? data[scope][id] ?? [] : [];
}

export function withLinks(data: QuickReplyData, scope: QuickReplyScope, id: string | null | undefined, links: QuickReplyLink[]): QuickReplyData {
  if (scope === "global") return { ...data, global: links };
  if (!id) return data;
  const map = { ...data[scope] };
  if (links.length) map[id] = links; else delete map[id];
  return { ...data, [scope]: map };
}

/** A set leaves everywhere: its links and the menus that open it. */
export function withoutSet(data: QuickReplyData, setId: string): QuickReplyData {
  const strip = (m: Record<string, QuickReplyLink[]>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.filter((l) => l.setId !== setId)] as const).filter(([, v]) => v.length > 0));
  return {
    sets: data.sets.filter((s) => s.id !== setId).map((s) => ({ ...s, replies: s.replies.map((r) => ({ ...r, menu: r.menu.filter((l) => l.setId !== setId) })) })),
    global: data.global.filter((l) => l.setId !== setId),
    story: strip(data.story), character: strip(data.character), chat: strip(data.chat),
  };
}

/** A name not used by another set ("Name", "Name 2"…). */
export function freeSetName(sets: readonly QuickReplySet[], name: string, exceptId?: string): string {
  const base = name.trim() || "Quick Replies";
  const used = new Set(sets.filter((s) => s.id !== exceptId).map((s) => s.name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let n = 2;
  while (used.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

// ---------------------------------------------------------------- SillyTavern files

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const bool = (v: unknown) => v === true;

/** A set from SillyTavern still names its menu sets; they become ids once every set of the import is known. */
export interface StQuickReplySet { set: QuickReplySet; menuNames: Map<string, string[]> }

/** One set from an ST file: version 2 (today's) or the old v1 one (quickReplySlots), as index.js loadSets migrates it. */
export function fromStQuickReplySet(json: unknown, newId: () => string = () => crypto.randomUUID()): StQuickReplySet {
  if (!isObj(json)) throw new Error("This is not a SillyTavern Quick Reply set.");
  const v1 = json.version !== 2 && Array.isArray(json.quickReplySlots);
  if (!v1 && !Array.isArray(json.qrList)) throw new Error("This is not a SillyTavern Quick Reply set.");
  const menuNames = new Map<string, string[]>();
  const rows = (v1 ? (json.quickReplySlots as unknown[]) : (json.qrList as unknown[])).filter(isObj);
  const replies = rows.map((r) => {
    const id = newId();
    const ctx = (v1 ? r.contextMenu : r.contextList);
    const links = (Array.isArray(ctx) ? ctx : []).filter(isObj).map((c) => ({ name: str(v1 ? c.preset : c.set), chained: bool(v1 ? c.chain : c.isChained) }));
    menuNames.set(id, links.map((l) => `${l.chained ? "1" : "0"}${l.name}`));
    return QuickReply.parse({
      id, label: str(r.label), title: str(r.title), message: str(v1 ? r.mes : r.message),
      icon: v1 ? "" : str(r.icon), showLabel: bool(r.showLabel), hidden: bool(v1 ? r.hidden : r.isHidden), menu: [],
    });
  });
  const color = str(json.color);
  return {
    set: QuickReplySet.parse({
      id: newId(), name: str(json.name) || "Quick Replies",
      send: !bool(v1 ? json.quickActionEnabled : json.disableSend),
      inject: bool(v1 ? json.AutoInputInject : json.injectInput),
      before: bool(v1 ? json.placeBeforeInputEnabled : json.placeBeforeInput),
      color: color && color !== "transparent" ? color : "", borderOnly: bool(json.onlyBorderColor), replies,
    }),
    menuNames,
  };
}

/** Menu names → ids, among `sets` (by name, case-insensitive like nothing in ST, but names are unique here). */
export function linkStMenus(imported: readonly StQuickReplySet[], sets: readonly QuickReplySet[]): QuickReplySet[] {
  const byName = new Map<string, string>();
  for (const s of sets) if (!byName.has(s.name.toLowerCase())) byName.set(s.name.toLowerCase(), s.id);
  return imported.map(({ set, menuNames }) => ({
    ...set,
    replies: set.replies.map((r) => ({
      ...r,
      menu: (menuNames.get(r.id) ?? []).flatMap((k) => { const id = byName.get(k.slice(1).toLowerCase()); return id ? [{ setId: id, chained: k[0] === "1" }] : []; }),
    })),
  }));
}

/**
 * A picked file: one exported set, a list of them, or SillyTavern's settings.json (its `quickReplyPresets`). Sets keep
 * their names, made unique against `existing`; menus point at sets of the same file first, then at `existing` ones.
 */
export function importStQuickReplies(text: string, fileName: string, existing: readonly QuickReplySet[], newId?: () => string): QuickReplySet[] {
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error(`"${fileName}" is not valid JSON.`); }
  const raw = Array.isArray(json) ? json : isObj(json) && Array.isArray(json.quickReplyPresets) ? json.quickReplyPresets : [json];
  const parsed: StQuickReplySet[] = [];
  for (const r of raw) { try { parsed.push(fromStQuickReplySet(r, newId)); } catch { /* not a set */ } }
  if (!parsed.length) throw new Error(`No SillyTavern Quick Reply set was found in "${fileName}".`);
  // menus resolve by the names in the file, before any rename
  const linked = linkStMenus(parsed, [...parsed.map((p) => p.set), ...existing]);
  const out: QuickReplySet[] = [];
  for (const s of linked) out.push({ ...s, name: freeSetName([...existing, ...out], s.name) });
  return out;
}

/** SillyTavern's export file for one set (QuickReplySet.toJSON), so it imports back into SillyTavern. */
export function toStQuickReplySet(set: QuickReplySet, sets: readonly QuickReplySet[]): Obj {
  const nameOf = (id: string) => sets.find((s) => s.id === id)?.name;
  return {
    version: 2, name: set.name, disableSend: !set.send, placeBeforeInput: set.before, injectInput: set.inject,
    color: set.color || "transparent", onlyBorderColor: set.borderOnly,
    qrList: set.replies.map((r, i) => ({
      id: i + 1, icon: r.icon, showLabel: r.showLabel, label: r.label, title: r.title, message: r.message,
      contextList: r.menu.flatMap((l) => { const name = nameOf(l.setId); return name ? [{ set: name, isChained: l.chained }] : []; }),
      preventAutoExecute: true, isHidden: r.hidden, executeOnStartup: false, executeOnUser: false, executeOnAi: false,
      executeOnChatChange: false, executeOnGroupMemberDraft: false, executeOnNewChat: false, executeBeforeGeneration: false, automationId: "",
    })),
    idIndex: set.replies.length + 1,
  };
}
