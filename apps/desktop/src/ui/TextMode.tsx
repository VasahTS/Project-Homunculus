// Homunculus 2 — the character editor's Text layout (D-102): the whole card as one plain document, Find / Replace across
// every field, and Compare with Put back. Author: CLAUDE, 2026-11-08. Plan: docs/UI-PLAN.md "Text mode"; draft:
// docs/drafts/text-mode/. Built on CodeMirror 6 (MIT): one EditorState, so the search covers every field and Ctrl+Z is
// one history. The fields' titles are block widgets nobody can edit or delete (textDoc.ts holds the document model).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Annotation, EditorState, RangeSetBuilder, StateEffect, StateField, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, MatchDecorator, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { estimateTokens } from "@homunculus/core";
import { diffWords, mergeParts, type DiffPart } from "../diff.ts";
import {
  MARK, applyTexts, buildDoc, changedParts, clean, fieldLabel, fieldLook, findMatches, isGreeting, greetingIndex, lockedRanges, parseDoc,
  shownKeys, textOf, textsOf, allKeys, type CardText, type DocField, type TextKey, type TextMatch,
} from "../textDoc.ts";
import { buildSearch, expand } from "./LoreReplace.tsx";
import { Help } from "./Help.tsx";

/** Something to compare with: its values now, or a list loaded when Compare opens (History). */
export interface CompareSource { id: string; label: string; values: CardText }
type Mark = "changed" | "main";

const External = Annotation.define<boolean>();
const setMeta = StateEffect.define<Meta>();
const setHits = StateEffect.define<{ list: TextMatch[]; cur: number }>();
interface Meta { hits: Partial<Record<string, number>>; marks: Partial<Record<keyof CardText, Mark>> }

const HELP = "The whole card as one document. Titles are fixed; edit the text under them. Ctrl+F finds, Ctrl+H replaces, Ctrl+Z undoes. Changes show in the other layouts at once. Lorebooks, regex and the note's depth stay in the other layouts.";

/** The part of the card a field belongs to (for version marks). */
const partOf = (k: TextKey): keyof CardText => (isGreeting(k) ? "firstMessages" : k);

// ───────────────────────────── the editor's pieces (CodeMirror)

class HeadWidget extends WidgetType {
  constructor(readonly key: TextKey, readonly tokens: number, readonly hits: number, readonly mark: Mark | undefined, readonly onTitle: (k: TextKey, el: HTMLElement) => void) { super(); }
  eq(o: HeadWidget) { return o.key === this.key && o.tokens === this.tokens && o.hits === this.hits && o.mark === this.mark; }
  toDOM() {
    const row = document.createElement("div");
    row.className = `tm-head${fieldLook(this.key) === "title" ? " first" : ""}`;
    row.setAttribute("data-field", this.key);
    const name = document.createElement("button");
    name.type = "button"; name.className = "tm-name"; name.textContent = fieldLabel(this.key);
    name.setAttribute("aria-haspopup", "menu");
    name.title = "Field options";
    name.addEventListener("mousedown", (e) => e.preventDefault());
    name.addEventListener("click", (e) => { e.preventDefault(); this.onTitle(this.key, name); });
    row.append(name);
    const add = (cls: string, text: string) => { const s = document.createElement("span"); s.className = cls; s.textContent = text; row.append(s); };
    if (this.tokens > 0) add("tm-tok", `${this.tokens.toLocaleString()} tokens`);
    if (this.hits > 0) add("tm-hits", this.hits === 1 ? "1 match" : `${this.hits} matches`);
    if (this.mark === "changed") add("tm-mark changed", "changed in this version");
    if (this.mark === "main") add("tm-mark", "from Main");
    return row;
  }
  ignoreEvent() { return true; }
}

class EmptyWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement("span"); s.className = "tm-empty"; s.textContent = "Empty"; s.setAttribute("aria-hidden", "true"); return s; }
}

const metaField = StateField.define<Meta>({
  create: () => ({ hits: {}, marks: {} }),
  update: (v, tr) => { for (const e of tr.effects) if (e.is(setMeta)) return e.value; return v; },
});

const fieldsField = StateField.define<DocField[]>({
  create: (s) => parseDoc(s.doc.toString()),
  update: (v, tr) => (tr.docChanged ? parseDoc(tr.state.doc.toString()) : v),
});

function layoutDeco(doc: Text, fields: DocField[], meta: Meta, onTitle: (k: TextKey, el: HTMLElement) => void): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const f of fields) {
    const text = doc.sliceString(f.from, f.to);
    b.add(f.headFrom, f.headTo, Decoration.replace({
      widget: new HeadWidget(f.key, text.trim() ? estimateTokens(text) : 0, meta.hits[f.key] ?? 0, meta.marks[partOf(f.key)], onTitle), block: true,
    }));
    if (f.from <= f.headTo) continue; // (a header always ends with a line break; this is only a guard)
    // the field's text lines get the field's look; the last one leaves room before the next title
    const first = doc.lineAt(f.from).number, last = doc.lineAt(f.to).number;
    for (let n = first; n <= last; n++) {
      const line = doc.line(n);
      b.add(line.from, line.from, Decoration.line({ class: `tm-l tm-${fieldLook(f.key)}${n === last ? " tm-end" : ""}` }));
      if (f.from === f.to) b.add(line.from, line.from, Decoration.widget({ widget: new EmptyWidget(), side: 1 }));
    }
  }
  return b.finish();
}

const hitsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) {
    v = v.map(tr.changes);
    for (const e of tr.effects) if (e.is(setHits)) {
      const b = new RangeSetBuilder<Decoration>();
      e.value.list.forEach((m, i) => b.add(m.from, m.to, Decoration.mark({ class: i === e.value.cur ? "tm-hit cur" : "tm-hit" })));
      v = b.finish();
    }
    return v;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const macros = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  m = new MatchDecorator({ regexp: /\{\{[^{}\n]{1,60}\}\}/g, decoration: Decoration.mark({ class: "tm-macro" }) });
  constructor(view: EditorView) { this.decorations = this.m.createDeco(view); }
  update(u: ViewUpdate) { this.decorations = this.m.updateDeco(u, this.decorations); }
}, { decorations: (p) => p.decorations });

function extensions(handlers: { current: Handlers }): Extension[] {
  const onTitle = (k: TextKey, el: HTMLElement) => handlers.current.onTitle(k, el);
  return [
    metaField, fieldsField, hitsField, macros,
    EditorView.decorations.compute([fieldsField, metaField, "doc"], (s) => layoutDeco(s.doc, s.field(fieldsField), s.field(metaField), onTitle)),
    EditorView.atomicRanges.of((view) => {
      const b = new RangeSetBuilder<Decoration>();
      for (const [a, z] of lockedRanges(view.state.field(fieldsField))) if (z > a) b.add(a, z, Decoration.mark({}));
      return b.finish();
    }),
    // headers can't be changed; nothing is typed before the first field; header marks pasted in are dropped
    EditorState.changeFilter.of((tr) => (tr.annotation(External) ? true : lockedRanges(tr.startState.field(fieldsField)).flat())),
    EditorState.transactionFilter.of((tr) => {
      if (!tr.docChanged || tr.annotation(External)) return tr;
      const first = tr.startState.field(fieldsField)[0];
      let bad = false, marked = false;
      tr.changes.iterChanges((fromA, _toA, _fromB, _toB, ins) => { if (first && fromA < first.from && ins.length) bad = true; if (ins.toString().includes(MARK)) marked = true; });
      if (bad) return [];
      if (!marked) return tr;
      const changes: Array<{ from: number; to: number; insert: string }> = [];
      tr.changes.iterChanges((fromA, toA, _fb, _tb, ins) => changes.push({ from: fromA, to: toA, insert: clean(ins.toString()) }));
      return { changes, selection: tr.selection, scrollIntoView: tr.scrollIntoView };
    }),
    history(),
    keymap.of([...historyKeymap, ...defaultKeymap]),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: "true", "aria-label": "Card as text", autocorrect: "off" }),
    EditorView.updateListener.of((u) => handlers.current.onUpdate(u)),
  ];
}

interface Handlers { onTitle: (k: TextKey, el: HTMLElement) => void; onUpdate: (u: ViewUpdate) => void }

// ───────────────────────────── the layout

export function TextMode({ values, marks, resetKey, versions, onChange, sources, loadHistory, onOpenInForm }: {
  /** The card's texts in the version being edited. */
  values: CardText;
  /** On a version: which parts it changes and which follow Main. */
  marks: Partial<Record<keyof CardText, Mark>>;
  /** Changes when another version is picked: the document is drawn again and "Before this edit" taken again. */
  resetKey: string;
  versions: ReactNode;
  onChange: (next: CardText, parts: Array<keyof CardText>) => void;
  /** More things to compare with, besides "Before this edit" (Last saved, Original import, Main version). */
  sources: CompareSource[];
  loadHistory?: () => Promise<CompareSource[]>;
  onOpenInForm: (k: TextKey) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const valuesRef = useRef(values); valuesRef.current = values;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const [showEmpty, setShowEmpty] = useState(false);
  const [tick, setTick] = useState(0); // the document changed
  const [curKey, setCurKey] = useState<TextKey | null>(null);
  const [menu, setMenu] = useState<{ key: TextKey; x: number; y: number } | null>(null);
  const [before, setBefore] = useState<CardText>(values);
  const pendingFocus = useRef<TextKey | null>(null);
  const shown = useRef<Set<string>>(new Set());

  // ── find
  const [find, setFind] = useState<{ open: boolean; replace: boolean }>({ open: false, replace: false });
  const [q, setQ] = useState({ find: "", replace: "", matchCase: false, wholeWord: false, regex: false, scope: "all" as "all" | "field" });
  const [cur, setCur] = useState(-1);
  const [notice, setNotice] = useState("");
  const findBox = useRef<HTMLInputElement>(null);

  // ── compare
  const [cmp, setCmp] = useState<string | null>(null);
  const [history, setHistory] = useState<CompareSource[] | null>(null);

  const handlers = useRef<Handlers>({ onTitle: () => {}, onUpdate: () => {} });
  handlers.current = {
    onTitle: (key, el) => { const r = el.getBoundingClientRect(); setMenu({ key, x: r.left, y: r.bottom + 4 }); },
    onUpdate: (u) => {
      if (u.selectionSet || u.docChanged) {
        const head = u.state.selection.main.head;
        const f = u.state.field(fieldsField).find((x) => head >= x.from && head <= x.to);
        if (f) setCurKey((k) => (k === f.key ? k : f.key));
      }
      if (!u.docChanged) return;
      setTick((t) => t + 1);
      if (u.transactions.every((t) => t.annotation(External))) return;
      const next = applyTexts(valuesRef.current, textsOf(u.state.doc.toString(), u.state.field(fieldsField)));
      const parts = changedParts(next, valuesRef.current);
      if (parts.length) { valuesRef.current = next; onChangeRef.current(next, parts); }
    },
  };

  const stateFor = (doc: string) => EditorState.create({ doc, extensions: extensions(handlers) });
  const desiredKeys = (c: CardText) => shownKeys(c, shown.current, showEmpty);

  // the editor is made once; later the document is drawn again only when the card changed from outside
  useLayoutEffect(() => {
    const keys = desiredKeys(values);
    keys.forEach((k) => shown.current.add(k));
    const v = new EditorView({ state: stateFor(buildDoc(values, keys)), parent: host.current! });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastReset = useRef(resetKey);
  const lastEmpty = useRef(showEmpty);
  useEffect(() => {
    const v = view.current; if (!v) return;
    const reset = lastReset.current !== resetKey;
    if (reset) { lastReset.current = resetKey; setBefore(values); }
    // another version, or "Show Empty Fields" switched: start over with what has text
    if (reset || lastEmpty.current !== showEmpty) { lastEmpty.current = showEmpty; shown.current = new Set(); }
    const fields = v.state.field(fieldsField);
    const keys = desiredKeys(values);
    const sameKeys = !reset && keys.length === fields.length && keys.every((k, i) => fields[i]!.key === k);
    if (sameKeys && changedParts(applyTexts(values, textsOf(v.state.doc.toString(), fields)), values).length === 0) return;
    keys.forEach((k) => shown.current.add(k));
    const top = v.scrollDOM.scrollTop;
    v.setState(stateFor(buildDoc(values, keys)));
    v.scrollDOM.scrollTop = top;
    setTick((t) => t + 1);
    const go = pendingFocus.current;
    if (go) {
      pendingFocus.current = null;
      const f = v.state.field(fieldsField).find((x) => x.key === go);
      if (f) { v.dispatch({ selection: { anchor: f.to }, effects: EditorView.scrollIntoView(f.from, { y: "center" }) }); v.focus(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, resetKey, showEmpty]);

  // version marks on the titles
  useEffect(() => { view.current?.dispatch({ effects: setMeta.of({ ...(view.current.state.field(metaField)), marks }) }); }, [JSON.stringify(marks)]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── matches
  const search = useMemo(() => buildSearch(q), [q.find, q.matchCase, q.wholeWord, q.regex]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopeKey = q.scope === "field" ? curKey ?? undefined : undefined;
  const matches = useMemo<TextMatch[]>(() => {
    const v = view.current;
    if (!v || !find.open || !(search instanceof RegExp)) return [];
    const doc = v.state.doc.toString();
    return findMatches(doc, v.state.field(fieldsField), search, (g) => (q.regex ? expand(q.replace, [...g, 0]) : q.replace), scopeKey);
  }, [tick, search, find.open, q.replace, q.regex, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const curIdx = cur >= 0 && cur < matches.length ? cur : -1;
  useEffect(() => {
    const v = view.current; if (!v) return;
    const hits: Partial<Record<string, number>> = {};
    for (const m of matches) hits[m.key] = (hits[m.key] ?? 0) + 1;
    v.dispatch({ effects: [setHits.of({ list: matches, cur: curIdx }), setMeta.of({ ...v.state.field(metaField), hits })] });
  }, [matches, curIdx]);

  const select = (i: number) => {
    const v = view.current; const m = matches[i]; if (!v || !m) return;
    setCur(i);
    v.dispatch({ selection: { anchor: m.from, head: m.to }, effects: EditorView.scrollIntoView(m.from, { y: "center" }) });
  };
  const step = (dir: 1 | -1) => {
    const v = view.current; if (!v || !matches.length) return;
    const { from, to } = v.state.selection.main;
    let i: number;
    if (dir === 1) { i = matches.findIndex((m) => m.from >= to && !(m.from === from && m.to === to)); if (i < 0) i = 0; }
    else { i = -1; for (let k = matches.length - 1; k >= 0; k--) if (matches[k]!.to <= from && !(matches[k]!.from === from && matches[k]!.to === to)) { i = k; break; } if (i < 0) i = matches.length - 1; }
    select(i);
  };
  const replaceOne = () => {
    const v = view.current; if (!v) return;
    const { from, to } = v.state.selection.main;
    const m = matches.find((x) => x.from === from && x.to === to);
    if (!m) { step(1); return; }
    v.dispatch({ changes: { from: m.from, to: m.to, insert: m.replacement }, selection: { anchor: m.from + m.replacement.length }, userEvent: "input.replace" });
    requestAnimationFrame(() => step(1));
  };
  const replaceAll = () => {
    const v = view.current; if (!v || !matches.length) return;
    const n = matches.length;
    // one transaction: one Ctrl+Z puts every match back
    v.dispatch({ changes: matches.map((m) => ({ from: m.from, to: m.to, insert: m.replacement })), userEvent: "input.replace.all" });
    setNotice(`Replaced ${n}. Ctrl+Z undoes it.`);
  };
  useEffect(() => { setNotice(""); }, [q.find, q.matchCase, q.wholeWord, q.regex, q.scope]);

  const openFind = (replace: boolean) => {
    const v = view.current;
    const sel = v ? v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to) : "";
    if (sel && !sel.includes("\n") && sel.length < 200) setQ((x) => ({ ...x, find: sel }));
    setFind({ open: true, replace });
    requestAnimationFrame(() => { findBox.current?.focus(); findBox.current?.select(); });
  };
  const closeFind = () => { setFind({ open: false, replace: false }); setCur(-1); view.current?.focus(); };

  // Ctrl+F / Ctrl+H / F3 while the Text layout is open
  const keysRef = useRef({ openFind, step, findOpen: find.open });
  keysRef.current = { openFind, step, findOpen: find.open };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector(".tm-cmp")) return;
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
      const k = e.key.toLowerCase();
      if (mod && !e.shiftKey && (k === "f" || k === "h")) { e.preventDefault(); keysRef.current.openFind(k === "h"); }
      else if (e.key === "F3") { e.preventDefault(); if (!keysRef.current.findOpen) keysRef.current.openFind(false); else keysRef.current.step(e.shiftKey ? -1 : 1); }
    };
    // capture: before the app's own Ctrl+H (Home), which skips keys already handled (D-086)
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const findKeys = (e: ReactKeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); if ((e.target as HTMLElement).getAttribute("aria-label") === "Replace with") replaceOne(); else step(e.shiftKey ? -1 : 1); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeFind(); }
  };

  // ── title menu
  const field = (k: TextKey) => view.current?.state.field(fieldsField).find((f) => f.key === k);
  const copyField = (k: TextKey) => { const f = field(k); const v = view.current; if (f && v) void navigator.clipboard?.writeText(v.state.sliceDoc(f.from, f.to)).catch(() => {}); };
  const addGreeting = (k: TextKey) => {
    const i = isGreeting(k) ? greetingIndex(k) : valuesRef.current.firstMessages.length - 1;
    const g = [...valuesRef.current.firstMessages];
    g.splice(i + 1, 0, "");
    pendingFocus.current = `greeting:${i + 1}`;
    const next = { ...valuesRef.current, firstMessages: g };
    onChange(next, ["firstMessages"]);
  };
  const removeGreeting = (k: TextKey) => {
    const g = valuesRef.current.firstMessages.filter((_, i) => i !== greetingIndex(k));
    onChange({ ...valuesRef.current, firstMessages: g.length ? g : [""] }, ["firstMessages"]);
  };

  // ── compare
  const allSources: CompareSource[] = [{ id: "before", label: "Before This Edit", values: before }, ...sources, ...(history ?? [])];
  const source = cmp ? allSources.find((s) => s.id === cmp) ?? allSources[0]! : null;
  const openCompare = () => {
    setCmp("before");
    if (loadHistory && history === null) void loadHistory().then(setHistory).catch(() => setHistory([]));
  };
  const keysOfBoth = (a: CardText, b: CardText): TextKey[] => {
    const big = a.firstMessages.length >= b.firstMessages.length ? a : b;
    return allKeys(big);
  };
  const diffs = useMemo(() => {
    if (!source) return [];
    return keysOfBoth(source.values, values).map((k) => ({ key: k, parts: diffWords(textOf(source.values, k), textOf(values, k)) }))
      .filter((d) => d.parts.some((p) => p.kind === "change"));
  }, [source, values]); // eslint-disable-line react-hooks/exhaustive-deps
  const changes = diffs.reduce((n, d) => n + d.parts.filter((p) => p.kind === "change").length, 0);

  /** Puts texts back: inside the document when every field is there (so Ctrl+Z works), else through the card. */
  const putBack = (texts: Partial<Record<TextKey, string>>) => {
    const v = view.current; if (!v) return;
    const fields = v.state.field(fieldsField);
    const inDoc = Object.keys(texts).every((k) => fields.some((f) => f.key === k));
    if (inDoc) {
      v.dispatch({ changes: Object.entries(texts).map(([k, t]) => { const f = fields.find((x) => x.key === k)!; return { from: f.from, to: f.to, insert: clean(t ?? "") }; }), userEvent: "input.putback" });
      return;
    }
    const next = applyTexts(valuesRef.current, texts);
    const g = { ...next, firstMessages: next.firstMessages.slice() };
    for (const k of Object.keys(texts)) if (isGreeting(k)) { const i = greetingIndex(k); while (g.firstMessages.length <= i) g.firstMessages.push(""); g.firstMessages[i] = texts[k as TextKey] ?? ""; }
    onChange(g, changedParts(g, valuesRef.current));
  };
  const putBackPart = (k: TextKey, parts: DiffPart[], id: number) => putBack({ [k]: mergeParts(parts, new Set([id])) });
  const putBackAll = () => {
    if (!source) return;
    const s = source.values;
    if (s.firstMessages.length !== values.firstMessages.length) { onChange({ ...s }, changedParts(s, values)); return; }
    putBack(Object.fromEntries(diffs.map((d) => [d.key, textOf(s, d.key)])));
  };
  useEffect(() => {
    if (!cmp) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setCmp(null); } };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [cmp]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest(".tm-menu")) { e.stopPropagation(); setMenu(null); } };
    window.addEventListener("keydown", close, true);
    window.addEventListener("mousedown", close, true);
    return () => { window.removeEventListener("keydown", close, true); window.removeEventListener("mousedown", close, true); };
  }, [menu]);

  const err = typeof search === "string" ? search : "";
  const count = !q.find ? "" : err ? "" : matches.length === 0 ? "No matches" : curIdx >= 0 ? `${curIdx + 1} of ${matches.length}` : `${matches.length} found`;
  const opt = (key: "matchCase" | "wholeWord" | "regex", text: string, title: string) => (
    <button type="button" className={`tm-opt${q[key] ? " on" : ""}`} aria-pressed={q[key]} title={title} onClick={() => setQ((x) => ({ ...x, [key]: !x[key] }))}>{text}</button>
  );

  return (
    <div className="ce-body tm" data-testid="text-mode">
      <div className="tm-bar">
        {versions}
        <span className="spacer" />
        <label className="tm-check"><input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> Show Empty Fields</label>
        <button type="button" className={`btn btn-plain btn-small${find.open && !find.replace ? " on" : ""}`} title="Ctrl+F" onClick={() => (find.open && !find.replace ? closeFind() : openFind(false))}>Find</button>
        <button type="button" className={`btn btn-plain btn-small${find.open && find.replace ? " on" : ""}`} title="Ctrl+H" onClick={() => (find.open && find.replace ? closeFind() : openFind(true))}>Replace</button>
        <button type="button" className="btn btn-bordered btn-small" onClick={openCompare}>Compare…</button>
        <Help text={HELP} />
      </div>
      {find.open && (
        <div className="tm-find" role="search" onKeyDown={findKeys}>
          <span className="tm-lbl">Find</span>
          <div className="tm-row">
            <input ref={findBox} type="text" className={err ? "bad" : ""} aria-label="Find" placeholder="Find in the card" autoComplete="off" spellCheck={false}
              value={q.find} onChange={(e) => { setQ((x) => ({ ...x, find: e.target.value })); setCur(-1); }} aria-invalid={!!err} />
            {opt("matchCase", "Aa", "Match case")}
            {opt("wholeWord", "W", "Whole word")}
            {opt("regex", ".*", "Regular expression ($1 works in Replace)")}
            <select aria-label="Search in" value={q.scope} onChange={(e) => setQ((x) => ({ ...x, scope: e.target.value as "all" | "field" }))}>
              <option value="all">In: All Fields</option>
              <option value="field">In: {curKey ? fieldLabel(curKey) : "This Field"}</option>
            </select>
          </div>
          <div className="tm-row tm-nav">
            {err ? <span className="tm-count err" role="alert">{err}</span> : <span className="tm-count" aria-live="polite">{count}</span>}
            <button type="button" className="btn btn-plain btn-small" aria-label="Previous match (Shift+F3)" disabled={!matches.length} onClick={() => step(-1)}>↑</button>
            <button type="button" className="btn btn-plain btn-small" aria-label="Next match (F3)" disabled={!matches.length} onClick={() => step(1)}>↓</button>
            <button type="button" className="btn btn-plain btn-small" aria-label="Close Find" onClick={closeFind}>✕</button>
          </div>
          {find.replace && <>
            <span className="tm-lbl">Replace</span>
            <div className="tm-row"><input type="text" aria-label="Replace with" placeholder="Replace with" autoComplete="off" spellCheck={false}
              value={q.replace} onChange={(e) => setQ((x) => ({ ...x, replace: e.target.value }))} /></div>
            <div className="tm-row tm-nav">
              <button type="button" className="btn btn-bordered btn-small" disabled={!matches.length} onClick={replaceOne}>Replace</button>
              <button type="button" className="btn btn-bordered btn-small" disabled={!matches.length} onClick={replaceAll}>Replace All</button>
            </div>
          </>}
          {notice && <span className="tm-notice" role="status">{notice}</span>}
        </div>
      )}
      <div className="tm-doc" ref={host} />
      {menu && (
        <div className="tm-menu popover" role="menu" aria-label={`${fieldLabel(menu.key)} options`} style={{ left: menu.x, top: menu.y }}>
          <button type="button" role="menuitem" onClick={() => { setMenu(null); onOpenInForm(menu.key); }}>Open in Form</button>
          <button type="button" role="menuitem" onClick={() => { copyField(menu.key); setMenu(null); }}>Copy This Field</button>
          {isGreeting(menu.key) && <>
            <button type="button" role="menuitem" onClick={() => { addGreeting(menu.key); setMenu(null); }}>Add Another Greeting</button>
            {values.firstMessages.length > 1 && <button type="button" role="menuitem" className="danger-text" onClick={() => { removeGreeting(menu.key); setMenu(null); }}>Remove This Greeting</button>}
          </>}
        </div>
      )}
      {source && (
        <div className="tm-cmp" role="dialog" aria-label="Compare">
          <div className="tm-cmp-bar">
            <b>Compare With</b>
            <select aria-label="Compare with" value={source.id} onChange={(e) => setCmp(e.target.value)}>
              {allSources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              {loadHistory && history === null && <option disabled>Loading History…</option>}
            </select>
            <span className="tm-sum">{changes === 0 ? "No differences." : changes === 1 ? "1 change" : `${changes} changes`}</span>
            <span className="spacer" />
            <button type="button" className="btn btn-bordered btn-small" disabled={!changes} onClick={putBackAll}>Put Back All</button>
            <button type="button" className="btn btn-prominent btn-small" onClick={() => setCmp(null)}>Done</button>
          </div>
          <div className="tm-cmp-body">
            {diffs.map((d) => (
              <section key={d.key} className="tm-cf" aria-label={fieldLabel(d.key)}>
                <div className="tm-cf-head">{fieldLabel(d.key)}</div>
                <div className="tm-cf-cols">
                  <div><span className="tm-side">{source.label}</span>{d.parts.map((p, i) => (p.kind === "same" ? <span key={i}>{p.text}</span> : p.before ? <del key={i}>{p.before}</del> : null))}</div>
                  <div><span className="tm-side">Now</span>{d.parts.map((p, i) => (p.kind === "same" ? <span key={i}>{p.text}</span> : (
                    <span key={i} className="tm-chg">
                      {p.after && <ins>{p.after}</ins>}
                      <button type="button" className="tm-pb" title={p.before ? `Put back “${p.before.slice(0, 60)}”` : "Remove this addition"} onClick={() => putBackPart(d.key, d.parts, p.id)}>Put Back</button>
                    </span>
                  )))}</div>
                </div>
              </section>
            ))}
            {diffs.length === 0 && <p className="tm-same">The card is the same as {source.label.toLowerCase()}.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
