// Homunculus 2 — the "?" button that explains an option (Daniel's rule: every option gets one).
// Author: CLAUDE, 2026-10-23.
// The bubble is positioned on the screen (fixed), so a scrolling panel never cuts it.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const POP_WIDTH = 260;

export function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_WIDTH - 8));
    setPos({ top: r.bottom + 6, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const closeOnScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", closeOnScroll);
    document.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", closeOnScroll);
      document.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open]);

  return (
    <span className="help" ref={ref}>
      <button ref={btn} type="button" className="help-btn" aria-label="Explain" aria-expanded={open} aria-controls={id}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}>?</button>
      {open && pos && (
        <span className="help-pop" id={id} role="note" style={{ top: pos.top, left: pos.left, width: POP_WIDTH }}>{text}</span>
      )}
    </span>
  );
}

/** A button that needs a second click to confirm (no browser pop-ups). */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = "btn btn-destructive" }: {
  label: string; confirmLabel: string; onConfirm: () => void; className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? "armed" : ""}`}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmLabel : label}
    </button>
  );
}
