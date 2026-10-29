// Homunculus 2 — Find and Replace for the lorebook editor (Daniel, 29/10: "uma feature do Notepad++… dá Ctrl+H e
// consegue substituir o texto"). Ctrl+H or Ctrl+F opens it; Enter = find next, Shift+Enter = previous, F3 / Shift+F3
// anywhere in the editor; Replace replaces the match that is selected and goes to the next; Replace All works on all
// entries (or the open one) and can be undone from the bar. Match case, whole word, regular expression ($1 works),
// and optionally titles and keywords too. Author: CLAUDE, 2026-10-29.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { LoreEntry } from "@homunculus/schemas";
import { Icon, Segmented } from "./kit.tsx";

export interface ReplaceOptions { find: string; replace: string; matchCase: boolean; wholeWord: boolean; regex: boolean }
interface Match { id: string; start: number; end: number }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The search as a RegExp (global), or an error message when the regular expression is broken. */
export function buildSearch(o: Pick<ReplaceOptions, "find" | "matchCase" | "wholeWord" | "regex">): RegExp | string | null {
  if (!o.find) return null;
  let src = o.regex ? o.find : escapeRe(o.find);
  let flags = "g" + (o.matchCase ? "" : "i");
  if (o.wholeWord) {
    // "whole word" that also understands accents (ç, ã, é…), unlike \b
    src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
    flags += "u";
  }
  try {
    const re = new RegExp(src, flags);
    if (re.test("")) return "This search matches empty text. Make it more specific.";
    re.lastIndex = 0;
    return re;
  } catch (e) {
    return `Not a valid regular expression: ${e instanceof Error ? e.message.replace(/^Invalid regular expression: /, "") : String(e)}`;
  }
}

/** Replaces every match in a text; returns the new text and how many were replaced. */
export function replaceIn(text: string, re: RegExp, o: Pick<ReplaceOptions, "replace" | "regex">): [string, number] {
  let n = 0;
  re.lastIndex = 0;
  const out = o.regex
    ? text.replace(re, (...args) => { n++; return expand(o.replace, args); })
    : text.replace(re, () => { n++; return o.replace; });
  return [out, n];
}

/** "$1", "$&", "$$" in a regex replacement (what String.replace does), with the match's own groups. */
function expand(tpl: string, args: unknown[]): string {
  const groups = args.slice(0, args.findIndex((a) => typeof a === "number")) as Array<string | undefined>;
  return tpl.replace(/\$(\$|&|\d{1,2})/g, (_, k: string) => (k === "$" ? "$" : k === "&" ? groups[0] ?? "" : groups[Number(k)] ?? ""));
}

export function ReplaceBar({ entries, openId, focusTick, onOpenEntry, onApply, onClose }: {
  entries: LoreEntry[];
  openId: string | null;
  /** Changes every time Ctrl+H / Ctrl+F is pressed: the Find box gets focus and its text selected. */
  focusTick: number;
  onOpenEntry: (id: string) => void;
  onApply: (entries: LoreEntry[]) => void;
  onClose: () => void;
}) {
  const [o, setO] = useState<ReplaceOptions>(() => {
    try { const s = JSON.parse(localStorage.getItem("homunculus.ui.loreReplace") ?? "null"); if (s) return { find: "", replace: "", ...s }; } catch { /* fine */ }
    return { find: "", replace: "", matchCase: false, wholeWord: false, regex: false };
  });
  const [scope, setScope] = useState<"all" | "entry">("all");
  const [meta, setMeta] = useState(false);
  const [note, setNote] = useState("");
  const [undo, setUndo] = useState<LoreEntry[] | null>(null);
  const last = useRef<Match | null>(null);
  const findBox = useRef<HTMLInputElement>(null);
  const put = (patch: Partial<ReplaceOptions>) => setO((x) => {
    const next = { ...x, ...patch };
    try { localStorage.setItem("homunculus.ui.loreReplace", JSON.stringify({ matchCase: next.matchCase, wholeWord: next.wholeWord, regex: next.regex })); } catch { /* fine */ }
    return next;
  });
  useEffect(() => { findBox.current?.focus(); findBox.current?.select(); }, [focusTick]);
  useEffect(() => { if (scope === "entry" && !openId) setScope("all"); }, [openId, scope]);

  const search = useMemo(() => buildSearch(o), [o]);
  const inScope = scope === "entry" && openId ? entries.filter((e) => e.id === openId) : entries;
  const matches = useMemo(() => {
    const out: Match[] = [];
    if (!(search instanceof RegExp)) return out;
    for (const e of inScope) {
      search.lastIndex = 0;
      for (const m of e.content.matchAll(search)) out.push({ id: e.id, start: m.index, end: m.index + m[0].length });
    }
    return out;
  }, [search, inScope]);
  const metaCount = useMemo(() => {
    if (!meta || !(search instanceof RegExp)) return 0;
    let n = 0;
    for (const e of inScope) for (const t of [e.title, ...e.keys, ...e.secondaryKeys]) { search.lastIndex = 0; n += [...t.matchAll(search)].length; }
    return n;
  }, [meta, search, inScope]);
  const entryCount = new Set(matches.map((m) => m.id)).size;

  const box = (id: string) => document.querySelector<HTMLTextAreaElement>(`[data-entry="${CSS.escape(id)}"] textarea.lore-prose`);
  /** Opens the entry and selects the match in its text (the text box gets focus, so the selection shows). */
  const select = (m: Match) => {
    last.current = m;
    onOpenEntry(m.id);
    const go = (tries: number) => {
      const ta = box(m.id);
      if (!ta) { if (tries > 0) requestAnimationFrame(() => go(tries - 1)); return; }
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(m.start, m.end);
      ta.closest("[data-entry]")?.scrollIntoView({ block: "nearest" });
    };
    requestAnimationFrame(() => go(6));
  };
  /** Where the search goes on from: the selection in the open entry's text, else the last match. */
  const here = (dir: 1 | -1): { index: number; pos: number } => {
    const order = new Map(entries.map((e, i) => [e.id, i]));
    const active = document.activeElement as HTMLTextAreaElement | null;
    const id = active?.classList.contains("lore-prose") ? active.closest<HTMLElement>("[data-entry]")?.dataset.entry : undefined;
    if (id && active) return { index: order.get(id) ?? -1, pos: dir === 1 ? active.selectionEnd : active.selectionStart };
    if (last.current) return { index: order.get(last.current.id) ?? -1, pos: dir === 1 ? last.current.end : last.current.start };
    return { index: dir === 1 ? -1 : entries.length, pos: 0 };
  };
  const next = (dir: 1 | -1 = 1) => {
    setNote("");
    if (typeof search === "string") return;
    if (!matches.length) { setNote(o.find ? "Not found." : ""); return; }
    const order = new Map(entries.map((e, i) => [e.id, i]));
    const at = here(dir);
    const key = (m: Match) => [order.get(m.id) ?? 0, m.start] as const;
    const after = (m: Match) => { const [i, s] = key(m); return i > at.index || (i === at.index && s >= at.pos); };
    const before = (m: Match) => { const [i, s] = key(m); return i < at.index || (i === at.index && m.end <= at.pos); };
    const pick = dir === 1 ? matches.find(after) ?? matches[0] : [...matches].reverse().find(before) ?? matches[matches.length - 1];
    if (pick) select(pick);
  };
  const replaceOne = () => {
    setNote("");
    if (!(search instanceof RegExp)) return;
    const m = last.current;
    const ta = m ? box(m.id) : null;
    if (m && ta && ta.selectionStart === m.start && ta.selectionEnd === m.end) {
      const text = ta.value.slice(m.start, m.end);
      const one = new RegExp(search.source, search.flags.replace("g", ""));
      const rep = replaceIn(text, new RegExp(one.source, one.flags + "g"), o)[0];
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(m.start, m.end);
      // typed into the box the browser's way, so Ctrl+Z in the text undoes it
      const ok = document.execCommand?.("insertText", false, rep);
      if (!ok) onApply(entries.map((e) => (e.id === m.id ? { ...e, content: e.content.slice(0, m.start) + rep + e.content.slice(m.end) } : e)));
      last.current = { id: m.id, start: m.start, end: m.start + rep.length };
      // the text changes on the next render: look for the next match after it
      requestAnimationFrame(() => next(1));
      return;
    }
    next(1);
  };
  const replaceAll = () => {
    setNote("");
    if (!(search instanceof RegExp)) return;
    const ids = new Set(inScope.map((e) => e.id));
    let total = 0;
    let touched = 0;
    const out = entries.map((e) => {
      if (!ids.has(e.id)) return e;
      let n = 0;
      const r = (t: string) => { const [s, k] = replaceIn(t, search, o); n += k; return s; };
      const ne: LoreEntry = { ...e, content: r(e.content) };
      if (meta) { ne.title = r(e.title); ne.keys = e.keys.map(r).filter(Boolean); ne.secondaryKeys = e.secondaryKeys.map(r).filter(Boolean); }
      if (n) { total += n; touched++; }
      return n ? ne : e;
    });
    if (!total) { setNote("Not found."); return; }
    setUndo(entries);
    onApply(out);
    last.current = null;
    setNote(`Replaced ${total} in ${touched} entr${touched === 1 ? "y" : "ies"}.`);
  };

  // F3 / Shift+F3 anywhere in the lorebook editor (also while typing in an entry's text)
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const f3 = (ev: KeyboardEvent) => {
      if (ev.key !== "F3" || !(ev.target as HTMLElement | null)?.closest?.(".lore-editor")) return;
      ev.preventDefault();
      nextRef.current(ev.shiftKey ? -1 : 1);
    };
    document.addEventListener("keydown", f3);
    return () => document.removeEventListener("keydown", f3);
  }, []);

  const keys = (ev: ReactKeyboardEvent) => {
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); onClose(); }
  };
  const status = typeof search === "string" ? search
    : note || (!o.find ? "" : matches.length || metaCount
      ? `${matches.length} in the text of ${entryCount} entr${entryCount === 1 ? "y" : "ies"}${meta && metaCount ? ` · ${metaCount} in titles and keywords` : ""}`
      : "Not found.");
  const toggle = (k: "matchCase" | "wholeWord" | "regex", label: string, text: string) => (
    <button type="button" className={`lore-rp-opt${o[k] ? " on" : ""}`} aria-pressed={o[k]} title={label} aria-label={label} onClick={() => put({ [k]: !o[k] })}>{text}</button>
  );

  return (
    <div className="lore-rp" role="search" aria-label="Find and replace" data-testid="lore-replace" onKeyDown={keys}>
      <div className="lore-rp-row">
        <input ref={findBox} className="lore-rp-in" aria-label="Find" placeholder="Find…" spellCheck={false} autoComplete="off" value={o.find}
          onChange={(e) => { put({ find: e.target.value }); last.current = null; setNote(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); next(e.shiftKey ? -1 : 1); } }} />
        {toggle("matchCase", "Match case", "Aa")}
        {toggle("wholeWord", "Whole words only", "W")}
        {toggle("regex", "Regular expression", ".*")}
        <button type="button" className="lore-rp-icon" aria-label="Previous match (Shift+F3)" title="Previous (Shift+F3)" onClick={() => next(-1)}><Icon name="chevron" size={12} /></button>
        <button type="button" className="lore-rp-icon down" aria-label="Next match (F3)" title="Next (F3)" onClick={() => next(1)}><Icon name="chevron" size={12} /></button>
        <span className={`lore-rp-status${typeof search === "string" ? " bad" : ""}`} role="status" aria-live="polite">{status}</span>
        {undo && <button type="button" className="link quiet" onClick={() => { onApply(undo); setUndo(null); setNote("Undone."); }}>Undo Replace All</button>}
        <button type="button" className="lore-rp-icon" aria-label="Close Find and Replace (Esc)" title="Close (Esc)" onClick={onClose}>×</button>
      </div>
      <div className="lore-rp-row">
        <input className="lore-rp-in" aria-label="Replace with" placeholder="Replace with…" spellCheck={false} autoComplete="off" value={o.replace}
          onChange={(e) => put({ replace: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.altKey) { e.preventDefault(); replaceAll(); }
            else if (e.key === "Enter") { e.preventDefault(); replaceOne(); }
          }} />
        <button type="button" className="btn btn-bordered btn-small" onClick={replaceOne} title="Replace the selected match and go to the next (Enter)">Replace</button>
        <button type="button" className="btn btn-bordered btn-small" onClick={replaceAll} title="Replace every match (Ctrl+Alt+Enter)">Replace All</button>
        <Segmented small label="Where to search" value={scope} onChange={setScope}
          options={[{ value: "all", label: "All entries" }, ...(openId ? [{ value: "entry" as const, label: "Open entry" }] : [])]} />
        <label className="lore-rp-check"><input type="checkbox" checked={meta} onChange={(e) => setMeta(e.target.checked)} /> Titles and keywords too</label>
      </div>
    </div>
  );
}
