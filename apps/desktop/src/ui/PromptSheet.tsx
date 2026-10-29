// Homunculus 2 — a wide sheet that shows a whole prompt in a readable way. Author: CLAUDE, 2026-10-28 (D-023).
// Used by Preview Prompt (what the NEXT reply would send) and by the Reply tab (what THIS reply sent).
// Left: how full the context is and what the tokens are made of. Right: every piece in the order the AI
// reads it, with a plain name, how it is sent, its size, and the first lines; click to read it all.
// Consecutive chat messages are folded into one "Chat history" entry. A search box finds text in the prompt.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PromptPart } from "@homunculus/schemas";
import { estimateTokens } from "@homunculus/core";
import type { Tracker } from "../trackers.ts";
import { CATEGORY_LABELS, categoryColor, roleLabel, sourceInfo, type SourceCategory } from "./promptSources.ts";
import { Button, Icon, IconButton } from "./kit.tsx";
import { EASE_SPRING, enter, flash, reducedMotion } from "./motion.ts";

export interface SheetBudget { limit?: number | undefined; used: number; reserved?: number | undefined; droppedMessages?: number | undefined }

type Entry =
  | { kind: "part"; index: number; part: PromptPart; label: string; category: SourceCategory; tokens: number }
  | { kind: "history"; index: number; parts: Array<{ part: PromptPart; tokens: number }>; tokens: number };

const fmt = (n: number) => n.toLocaleString("en-US");

export function PromptSheet({ title, meta, parts, budget, notes = [], sent, trackers, onClose, onRefresh, refreshing = false, testId }: {
  title: string;
  /** One line under the title (preset, model…). */
  meta?: ReactNode;
  parts: PromptPart[];
  budget?: SheetBudget | undefined;
  notes?: string[] | undefined;
  /** How many messages actually go to the AI (after joining system messages). */
  sent?: number | undefined;
  trackers: Tracker[];
  onClose: () => void;
  onRefresh?: (() => void) | undefined;
  refreshing?: boolean;
  testId: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [closing, setClosing] = useState(false);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    parts.forEach((part, index) => {
      const tokens = estimateTokens(part.content);
      if (part.source === "history") {
        const prev = out[out.length - 1];
        if (prev?.kind === "history") { prev.parts.push({ part, tokens }); prev.tokens += tokens; return; }
        out.push({ kind: "history", index, parts: [{ part, tokens }], tokens });
        return;
      }
      const info = sourceInfo(part.source, trackers);
      out.push({ kind: "part", index, part, label: info.label, category: info.category, tokens });
    });
    return out;
  }, [parts, trackers]);

  /** Token totals by label (for the legend), biggest first, with their category. */
  const bySource = useMemo(() => {
    const m = new Map<string, { label: string; category: SourceCategory; tokens: number; first: number }>();
    for (const e of entries) {
      const label = e.kind === "history" ? "Chat history" : e.label;
      const category = e.kind === "history" ? "history" : e.category;
      const g = m.get(label) ?? { label, category, tokens: 0, first: e.index };
      g.tokens += e.tokens;
      m.set(label, g);
    }
    return [...m.values()].sort((a, b) => b.tokens - a.tokens);
  }, [entries]);
  const total = bySource.reduce((n, g) => n + g.tokens, 0);

  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const entryMatches = (e: Entry) => e.kind === "history" ? e.parts.some((p) => matches(p.part.content)) || matches("chat history") : matches(e.part.content) || matches(e.label);
  const shownCount = entries.filter(entryMatches).length;

  // open: remember focus, animate in, focus the panel; Esc closes
  useLayoutEffect(() => {
    returnFocus.current = document.activeElement;
    panel.current?.focus();
    if (!reducedMotion()) {
      scrim.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "linear" });
      panel.current?.animate([{ opacity: 0, transform: "translateY(-18px) scale(0.97)" }, { opacity: 1, transform: "none" }], { duration: 440, easing: EASE_SPRING });
      if (list.current) enter(list.current.children, { y: 8, delay: 120, stagger: 22, max: 12 });
    }
  }, []);
  const close = () => {
    if (closing) return;
    const done = () => { onClose(); (returnFocus.current as HTMLElement | null)?.focus?.(); };
    if (reducedMotion() || !panel.current) { done(); return; }
    setClosing(true);
    scrim.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
    const a = panel.current.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-10px) scale(0.97)" }], { duration: 180, easing: "cubic-bezier(0.55, 0, 1, 0.45)", fill: "forwards" });
    a.onfinish = done;
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const toggle = (i: number, on: boolean) => setOpen((s) => { const n = new Set(s); if (on) n.add(i); else n.delete(i); return n; });
  const allOpen = entries.length > 0 && entries.every((e) => open.has(e.index));
  const jumpTo = (index: number) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    setTimeout(() => flash(el), 250);
  };

  const used = budget?.used ?? total;
  const limit = budget?.limit;
  const reserved = budget?.reserved ?? 0;
  const usedPct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const resPct = limit ? Math.min(100 - usedPct, (reserved / limit) * 100) : 0;

  return createPortal(
    <div className="sheet-layer" data-region="sheet">
      <div className="sheet-scrim" ref={scrim} onClick={close} />
      <div className="sheet glass" ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid={testId}>
        <header className="sheet-head">
          <div className="sheet-title">
            <h2>{title}</h2>
            {meta && <span className="sheet-meta">{meta}</span>}
          </div>
          <label className="search-box sheet-search">
            <Icon name="search" size={14} />
            <input placeholder="Find in the prompt" aria-label="Find in the prompt" value={query} onChange={(e) => setQuery(e.target.value)} />
            {q && <span className="hint tabular">{shownCount}</span>}
          </label>
          <Button small variant="plain" onClick={() => setOpen(allOpen ? new Set() : new Set(entries.map((e) => e.index)))}>{allOpen ? "Collapse All" : "Expand All"}</Button>
          {onRefresh && <Button small onClick={onRefresh} disabled={refreshing}><Icon name="refresh" size={13} />{refreshing ? "Building…" : "Refresh"}</Button>}
          <IconButton label="Close" onClick={close}><Icon name="close" size={16} /></IconButton>
        </header>

        <div className="sheet-body">
          <aside className="sheet-summary" aria-label="Summary">
            <section className="meter-card">
              <div className="meter-big tabular" data-testid="preview-size">
                <strong>{fmt(used)}</strong>
                <span>{limit ? `of ${fmt(limit)} tokens` : "tokens (no limit)"}</span>
              </div>
              {limit ? (
                <span className="context-bar" aria-hidden>
                  <span className="used" style={{ width: `${usedPct}%` }} />
                  <span className="reserved" style={{ width: `${resPct}%` }} />
                </span>
              ) : null}
              <ul className="meter-facts">
                {reserved > 0 && <li><span className="swatch reserved" />{fmt(reserved)} kept free for the reply</li>}
                {sent !== undefined && <li>{sent} message{sent === 1 ? "" : "s"} sent to the AI</li>}
                <li>{parts.length} piece{parts.length === 1 ? "" : "s"} in this prompt</li>
                {budget?.droppedMessages ? <li className="warn-text">{budget.droppedMessages} older message{budget.droppedMessages === 1 ? "" : "s"} left out to fit</li> : null}
              </ul>
            </section>

            <section className="source-card">
              <h3>What the tokens are</h3>
              <span className="stack-bar" aria-hidden>
                {bySource.map((g) => <span key={g.label} style={{ flexGrow: Math.max(g.tokens, 1), background: categoryColor(g.category) }} />)}
              </span>
              <ul className="legend">
                {bySource.map((g) => (
                  <li key={g.label}>
                    <button type="button" className="legend-item" onClick={() => jumpTo(g.first)} title={`${CATEGORY_LABELS[g.category]} · jump to it`}>
                      <span className="key-dot" style={{ background: categoryColor(g.category) }} />
                      <span className="legend-label">{g.label}</span>
                      <span className="tabular hint">{total ? Math.round((g.tokens / total) * 100) : 0}%</span>
                      <span className="tabular">{fmt(g.tokens)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {notes.length > 0 && (
              <section className="notes-card">
                {notes.map((n, i) => <p key={i} className="warn-text">{n}</p>)}
              </section>
            )}
          </aside>

          <div className="sheet-main">
            <div className="sheet-main-head">In the order the AI reads it <span className="hint">· token counts are estimates</span></div>
            <ol className="prompt-order" ref={list}>
              {entries.map((e, n) => {
                const hidden = !entryMatches(e);
                const isOpen = open.has(e.index) || (!!q && !hidden);
                if (e.kind === "history") {
                  return (
                    <li key={e.index} data-index={e.index} className={`pentry${hidden ? " filtered" : ""}`} style={{ ["--cat" as string]: categoryColor("history") }}>
                      <details open={isOpen} onToggle={(ev) => toggle(e.index, (ev.target as HTMLDetailsElement).open)}>
                        <summary>
                          <span className="pnum tabular">{n + 1}</span>
                          <span className="plabel">Chat history</span>
                          <span className="tag">{e.parts.length} message{e.parts.length === 1 ? "" : "s"}</span>
                          <span className="spacer" />
                          <span className="hint tabular">~{fmt(e.tokens)}</span>
                          <Chevron />
                        </summary>
                        <ul className="history-msgs">
                          {e.parts.map((p, i) => (
                            <li key={i} className={`hmsg role-${p.part.role}${matches(p.part.content) ? "" : " filtered"}`}>
                              <span className="hmsg-who">{roleLabel(p.part.role)}</span>
                              <span className="hmsg-text"><Mark text={p.part.content} q={q} /></span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  );
                }
                return (
                  <li key={e.index} data-index={e.index} className={`pentry${hidden ? " filtered" : ""}`} style={{ ["--cat" as string]: categoryColor(e.category) }}>
                    <details open={isOpen} onToggle={(ev) => toggle(e.index, (ev.target as HTMLDetailsElement).open)}>
                      <summary>
                        <span className="pnum tabular">{n + 1}</span>
                        <span className="plabel">{e.label}</span>
                        <span className={`tag role-${e.part.role}`} title="How this piece is sent to the AI">as {roleLabel(e.part.role)}</span>
                        <span className="spacer" />
                        <span className="hint tabular">~{fmt(e.tokens)}</span>
                        <Chevron />
                        <span className="pexcerpt"><Mark text={e.part.content.slice(0, 400)} q={q} /></span>
                      </summary>
                      <pre className="ptext"><Mark text={e.part.content} q={q} /></pre>
                    </details>
                  </li>
                );
              })}
              {q && shownCount === 0 && <li className="hint pempty">Nothing in this prompt says “{query.trim()}”.</li>}
            </ol>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Chevron() {
  return <span className="chev" aria-hidden><Icon name="chevron" size={13} /></span>;
}

/** Text with the search words highlighted. */
function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const out: ReactNode[] = [];
  const low = text.toLowerCase();
  let at = 0;
  for (let i = low.indexOf(q); i >= 0 && out.length < 400; i = low.indexOf(q, at)) {
    if (i > at) out.push(text.slice(at, i));
    out.push(<mark key={i}>{text.slice(i, i + q.length)}</mark>);
    at = i + q.length;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

