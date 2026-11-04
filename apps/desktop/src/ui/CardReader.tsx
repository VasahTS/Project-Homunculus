// Homunculus 2 — the card reading view (D-082, approved canvas draft 11/03): a card full window, its picture large on the
// left and every field whole in one readable column. Used by the Card Browser, Characters and Stories.
// Back to Preview / Esc / the mouse's back button return to the small sheet; × closes the sheet too. CLAUDE, 2026-11-03.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Avatar } from "@homunculus/schemas";
import { avatarUrl } from "../files.ts";
import { IconButton, Icon, Button } from "./kit.tsx";
import { useModalFocus } from "./ux.tsx";

export interface ReaderSection { id: string; title: string; text: string; prose?: boolean }

export function CardReader({ name, where, byline, picture, tags = [], actions, sections, greetings = [], greetingLabel = "Opening message", extra, onBack, onClose, onPrev, onNext, renderText }: {
  name: string;
  /** "Card Browser · ChubAI", "Characters · Folklore"… */
  where: string;
  byline?: string;
  picture?: Avatar | undefined;
  tags?: string[];
  actions?: ReactNode;
  sections: ReaderSection[];
  greetings?: string[];
  greetingLabel?: string;
  /** Anything else under the fields (a lorebook note, the chats). */
  extra?: ReactNode;
  onBack: () => void;
  onClose: () => void;
  onPrev?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  /** How a field's text is drawn (links, formatting); plain text by default. */
  renderText?: (text: string) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLElement>(null);
  const [g, setG] = useState(0);
  const [zoom, setZoom] = useState(false);
  useModalFocus(box, () => (zoom ? setZoom(false) : onBack()));
  useEffect(() => { setG(0); scroller.current?.scrollTo?.({ top: 0 }); }, [name]);
  // ← → change card; the mouse's back button goes back to the preview (Daniel: "or back with M4"). Handled on the reader
  // itself: it is a portal, so its events never reach the page's own keys below (stopPropagation).
  const onKey = (e: ReactKeyboardEvent) => {
    e.stopPropagation();
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); onPrev(); }
    if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); }
  };
  const onMouseUp = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (e.button === 3) { e.preventDefault(); if (zoom) setZoom(false); else onBack(); }
  };
  const text = (t: string) => (renderText ? renderText(t) : t);
  const shown = sections.filter((s) => s.text.trim());
  const opening = greetings[Math.min(g, greetings.length - 1)];
  const tokens = Math.round([...shown.map((s) => s.text), ...greetings].join("\n").length / 3.6);

  return createPortal(
    <div className="card-reader" role="dialog" aria-modal="true" aria-label={`${name} — reading view`} ref={box} tabIndex={-1} data-testid="card-reader"
      // a portal still bubbles React events to the page under it (its own arrows/Escape): keep them here
      onKeyDown={onKey} onMouseUp={onMouseUp} onMouseDown={(e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); }}>
      <header className="cr-bar">
        {onPrev && <Button small variant="bordered" onClick={onPrev} aria-label="Previous card">‹ Previous</Button>}
        {onNext && <Button small variant="bordered" onClick={onNext} aria-label="Next card">Next ›</Button>}
        <span className="cr-where">{where}{(onPrev || onNext) ? " · ← → change card" : ""}</span>
        <span className="cr-grow" />
        <span className="cr-hint">Esc or the mouse's back button</span>
        <Button small variant="bordered" onClick={onBack} data-testid="reader-back"><Icon name="back" size={13} /> Back to Preview</Button>
        <IconButton label="Close" onClick={onClose} data-testid="reader-close"><Icon name="close" size={14} /></IconButton>
      </header>
      <div className="cr-body">
        <div className="cr-picture">
          {picture
            ? <button type="button" className="cr-pic-button" onClick={() => setZoom(true)} aria-label="See the picture alone"><img src={avatarUrl(picture)} alt="" /></button>
            : <span className="cr-letter" aria-hidden>{(name || "?").slice(0, 1).toUpperCase()}</span>}
          {picture && <span className="cr-pic-hint">Click the picture to see it alone</span>}
        </div>
        <article className="cr-text" ref={scroller}>
          <div className="cr-head">
            <h1>{name}</h1>
            {byline && <div className="cr-byline">{byline}</div>}
            {tags.length > 0 && <div className="cr-tags">{tags.map((t) => <span key={t} className="gallery-tag">{t}</span>)}</div>}
          </div>
          {actions && <div className="cr-actions">{actions}</div>}
          {(shown.length > 0 || greetings.length > 0) && (
            <nav className="cr-nav" aria-label="Sections">
              {shown.map((s) => <a key={s.id} href={`#cr-${s.id}`} onClick={(e) => { e.preventDefault(); box.current?.querySelector(`#cr-${s.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }); }}>{s.title}</a>)}
              {greetings.length > 0 && <a href="#cr-opening" onClick={(e) => { e.preventDefault(); box.current?.querySelector("#cr-opening")?.scrollIntoView({ block: "start", behavior: "smooth" }); }}>{greetings.length > 1 ? `Openings (${greetings.length})` : "Opening"}</a>}
              <span className="cr-grow" />
              <span className="cr-tokens">~{tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} tokens</span>
            </nav>
          )}
          {shown.map((s) => (
            <section key={s.id} id={`cr-${s.id}`} className="cr-sec">
              <h2>{s.title}</h2>
              <div className={`cr-field${s.prose ? " prose" : ""}`}>{text(s.text)}</div>
            </section>
          ))}
          {opening !== undefined && (
            <section id="cr-opening" className="cr-sec">
              <div className="cr-sec-head">
                <h2>{greetings.length > 1 ? `${greetingLabel} ${g + 1} of ${greetings.length}` : greetingLabel}</h2>
                {greetings.length > 1 && (
                  <span className="cr-greet" role="group" aria-label="Openings">
                    <IconButton label="Previous opening" disabled={g === 0} onClick={() => setG(g - 1)}><Icon name="back" size={13} /></IconButton>
                    <span>{g + 1}/{greetings.length}</span>
                    <IconButton label="Next opening" disabled={g >= greetings.length - 1} onClick={() => setG(g + 1)}><Icon name="chevron" size={13} /></IconButton>
                  </span>
                )}
              </div>
              <div className="cr-field prose" key={g}>{text(opening)}</div>
            </section>
          )}
          {extra}
        </article>
      </div>
      {zoom && picture && (
        <button type="button" className="cr-zoom" onClick={() => setZoom(false)} aria-label="Back to the card"><img src={avatarUrl(picture)} alt="" /></button>
      )}
    </div>,
    document.body,
  );
}
