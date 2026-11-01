// Homunculus 2 — small UI kit: the few control styles every screen shares. Author: CLAUDE, 2026-10-27 (D-018).
// Look comes only from theme tokens (theme/tokens.css) via the classes in styles.css, so a new theme
// or a restyle never touches the screens. Keep this list short: one button family, one switch, one
// segmented control, grouped lists.
import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Help } from "./Help.tsx";
import { EASE_OUT, reducedMotion, useSlidingPill } from "./motion.ts";

type ButtonVariant = "plain" | "bordered" | "prominent" | "destructive";

/** plain = text only · bordered = quiet filled · prominent = the ONE main action of a view (accent) · destructive */
export function Button({ variant = "bordered", small = false, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; small?: boolean;
}) {
  return <button type="button" {...rest} className={`btn btn-${variant}${small ? " btn-small" : ""} ${className}`.trim()} />;
}

/** A square icon-only button; `label` is read by screen readers and shown as a tooltip. */
export function IconButton({ label, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} {...rest} className={`icon-btn ${className}`.trim()}>{children}</button>;
}

/** Segmented control (also used as tabs: pass role="tablist"). A pill slides under the selected option. */
export function Segmented<T extends string>({ options, value, onChange, label, tabs = false, small = false }: {
  options: Array<{ value: T; label: string; testId?: string }>; value: T; onChange: (v: T) => void; label: string; tabs?: boolean; small?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  useSlidingPill(box, pill, "button.on", value);
  const keys = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
    if (next) { onChange(next.value); requestAnimationFrame(() => box.current?.querySelector<HTMLElement>("button.on")?.focus()); }
  };
  return (
    <div ref={box} className={`segmented${small ? " small" : ""}`} role={tabs ? "tablist" : "radiogroup"} aria-label={label} onKeyDown={keys}>
      <span className="slide-pill" ref={pill} aria-hidden />
      {options.map((o) => (
        <button key={o.value} type="button" role={tabs ? "tab" : "radio"} data-testid={o.testId} tabIndex={o.value === value ? 0 : -1}
          aria-selected={tabs ? o.value === value : undefined} aria-checked={tabs ? undefined : o.value === value}
          className={o.value === value ? "on" : ""} data-label={o.label} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/**
 * A title whose letters rise into place one after another, the way Coffra's "Good morning" arrives (D-072). It plays
 * when it first shows (key it by the text to replay it when the text changes). Words stay whole (a word never breaks between letters), the
 * text reads normally to screen readers and searches, and reduced motion shows it at once.
 */
export function RiseText({ text, stagger = 22 }: { text: string; stagger?: number }) {
  // long titles keep the whole rise under about half a second
  const step = Math.min(stagger, 480 / Math.max(text.length, 1));
  let i = 0;
  return (
    <span className="rise-text">
      {text.split(/(\s+)/).map((word, w) => /^\s+$/.test(word) ? word : (
        <span className="rise-word" key={w}>
          {[...word].map((ch, c) => <span className="rise-l" key={c} style={{ animationDelay: `${Math.round(i++ * step)}ms` }}>{ch}</span>)}
        </span>
      ))}
    </span>
  );
}

/** On/off switch. */
export function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      className={`switch${checked ? " on" : ""}`} onClick={() => onChange(!checked)}><span /></button>
  );
}

/** A titled group of rows, like the system Settings. */
export function Group({ title, help, aside, children, testId }: { title?: string; help?: string; aside?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="group-section" data-testid={testId}>
      {(title || aside) && (
        <div className="group-head">
          <span className="label-row">{title}{help && <Help text={help} />}</span>
          {aside && <span className="group-aside">{aside}</span>}
        </div>
      )}
      <div className="group">{children}</div>
    </section>
  );
}

/** One row of a group: a label on the left, the value or control on the right. */
export function Row({ label, help, children, wide = false }: { label?: ReactNode; help?: string; children?: ReactNode; wide?: boolean }) {
  return (
    <div className={`row${wide ? " row-wide" : ""}`}>
      {label !== undefined && <span className="row-label label-row">{label}{help && <Help text={help} />}</span>}
      {children !== undefined && <span className="row-value">{children}</span>}
    </div>
  );
}

/** Icons: one stroke family, matched to the text weight. Decorative unless `label` is given. */
export function Icon({ name, size = 16, label, stroke = 1.9 }: { name: keyof typeof ICONS; size?: number; label?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={ICONS[name]} />
    </svg>
  );
}

export const ICONS = {
  branch: "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
  copy: "M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16v-4M12 8h.01",
  eyeOff: "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6",
  sidebar: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 4v16",
  inspector: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM15 4v16",
  characters: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4.2 4.1-6.5 8-6.5s7 2.3 8 6.5",
  trackers: "M4 20V11M10 20V5M16 20v-6M2 20h20",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  plus: "M12 5v14M5 12h14",
  chevron: "M9 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  import: "M12 3v12M7 10l5 5 5-5M5 21h14",
  play: "M8 5.5v13l11-6.5z",
  send: "M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4",
  persona: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5M3 4h3M3 4v3M21 4h-3M21 4v3",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  preset: "M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  grip: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  pencil: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  check: "M5 12.5l4.5 4.5L19 7.5",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  lock: "M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  cloud: "M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z",
  masks: "M4 5c3 1 6 1 9 0v6a4.5 4.5 0 0 1-9 0zM7 9h.01M10 9h.01M7.5 13c1 .7 1.6.7 2.5 0M13 8.5c2.2.6 4.6.4 7-.5v5.5a4.5 4.5 0 0 1-7.5 3.3",
  figure: "M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 8v7M8 10l4-2 4 2M9.5 22l2.5-7 2.5 7",
  ruler: "M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2",
  hand: "M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.7-2.3L3.5 16a1.6 1.6 0 0 1 2.4-2.1L8 16",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9",
  weight: "M6 8h12l2 12H4zM12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14c1.9 2 5.1 2 7 0M9 9.5h.01M15 9.5h.01",
  scissors: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9L20 20M8.1 16.1L20 4",
  shirt: "M8 3l4 3 4-3 5 4-3 3v11H6V10L3 7z",
  gem: "M6 3h12l3 6-9 12L3 9zM3 9h18M9 3l3 18 3-18",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z",
  drop: "M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  alert: "M12 3l10 18H2zM12 10v4M12 17.5h.01",
  mask: "M3 8c3-1 6-1 9 1 3-2 6-2 9-1v3a6 6 0 0 1-6 6c-1.3 0-2.3-.6-3-1.6-.7 1-1.7 1.6-3 1.6a6 6 0 0 1-6-6zM7.5 11h2M14.5 11h2",
  chip: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  scroll: "M7 4h11a2 2 0 0 1 2 2v1h-4M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7M7 4a2 2 0 0 1 2 2v1M9 11h6M9 15h6",
  bag: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.7-3.5 3.3-5.5 6.5-5.5s5.8 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.8c1.8.8 3 2.5 3.5 5.2",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21a2 2 0 0 1 2-2h13v2H6",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  back: "M15 6l-6 6 6 6",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
} as const;

/** Icons a tracker field may use (tracker editor → Icon). */
export const FIELD_ICONS = ["calendar", "clock", "pin", "cloud", "masks", "figure", "ruler", "hand", "hourglass", "weight", "smile", "scissors", "shirt", "gem", "bolt",
  "shield", "star", "heart", "drop", "grid", "alert", "mask", "chip", "scroll", "bag", "flag", "users", "book", "eye", "lock", "sparkle"] as const;
export const isIconName = (n: string | undefined): n is keyof typeof ICONS => !!n && n in ICONS;

/**
 * Opens and closes its content smoothly (height + opacity, 200 ms, the accordion recipe): a group or a field of the
 * tracker editor. Closed content is not in the page (so its inputs aren't reachable). D-026, CLAUDE.
 */
export function Collapse({ open, children, className = "" }: { open: boolean; children: ReactNode; className?: string }) {
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true);
  const ref = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const was = useRef(open);
  useLayoutEffect(() => {
    if (was.current === open) return;
    was.current = open;
    const el = ref.current;
    if (!el) return;
    if (reducedMotion() || typeof el.animate !== "function") { if (!open) setRendered(false); return; }
    const from = anim.current ? `${el.getBoundingClientRect().height}px` : open ? "0px" : `${el.scrollHeight}px`;
    // also drops a finished close that is still holding the box at 0 (fill: forwards)
    for (const x of el.getAnimations()) x.cancel();
    const to = open ? `${el.scrollHeight}px` : "0px";
    // closing keeps its last frame (height 0) until React removes the box: without it the box springs back to full
    // height for a frame between the end of the animation and the re-render — a flicker, easy to see at 240 Hz
    const a = el.animate([{ height: from, opacity: open ? 0 : 1 }, { height: to, opacity: open ? 1 : 0 }], { duration: 200, easing: EASE_OUT, fill: open ? "none" : "forwards" });
    anim.current = a;
    a.onfinish = () => { if (anim.current !== a) return; anim.current = null; if (!open) setRendered(false); };
  }, [open]);
  if (!rendered) return null;
  return <div ref={ref} className={`collapse ${className}`.trim()} style={{ overflow: "hidden" }}>{children}</div>;
}
