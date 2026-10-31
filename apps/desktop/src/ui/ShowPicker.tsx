// Homunculus 2 — "How it shows" as pictures (Daniel, 30/10: "it should show visually what each one looks like").
// Author: CLAUDE, 2026-10-30.
//
// Each option is a tiny drawing of a reply in the chat with the agent's result where it would appear. The drawings
// use only theme colors (currentColor and CSS variables), so they follow every theme.
import type { ReactNode } from "react";

export type Pic =
  | "choices-buttons" | "choices-list" | "choices-composer" | "panel"
  | "note-message" | "note-card" | "note-view"
  | "view-feed" | "view-phone" | "view-sheet" | "view-cards"
  | "mark-rewrite" | "mark-check" | "check-line" | "silent";

export function ShowPicker<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Array<{ value: T; label: string; pic: Pic }>; onChange: (v: T) => void;
}) {
  return (
    <div className="show-pick" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.label}
          className={`show-opt${value === o.value ? " on" : ""}`} onClick={() => onChange(o.value)}>
          <svg viewBox="0 0 120 80" aria-hidden="true">{drawing(o.pic)}</svg>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A reply: the name bar and a few lines of text. `mark` draws a small sign beside the name. */
function Reply({ h = 34, mark }: { h?: number; mark?: "pencil" | "warn" }) {
  return (
    <g>
      <circle className="s-dim" cx="12" cy="11" r="5" />
      <rect className="s-strong" x="21" y="8" width="26" height="5" rx="2.5" />
      {mark === "pencil" && <path className="s-line" d="M52 13l5-5 2 2-5 5h-2z" />}
      {mark === "warn" && <path className="s-warn" d="M55 6l5 8h-10z" />}
      <rect className="s-dim" x="21" y="18" width="88" height="4" rx="2" />
      <rect className="s-dim" x="21" y="25" width="80" height="4" rx="2" />
      {h > 30 && <rect className="s-dim" x="21" y="32" width="64" height="4" rx="2" />}
    </g>
  );
}

function drawing(p: Pic): ReactNode {
  switch (p) {
    case "choices-buttons":
      return <><Reply /><rect className="s-accent" x="21" y="46" width="40" height="10" rx="5" /><rect className="s-accent" x="65" y="46" width="34" height="10" rx="5" /><rect className="s-accent" x="21" y="60" width="46" height="10" rx="5" /></>;
    case "choices-list":
      return <><Reply h={26} />{[36, 46, 56].map((y, i) => <g key={y}><text className="s-num" x="21" y={y + 5}>{i + 1}.</text><rect className="s-accent-soft" x="30" y={y} width={70 - i * 10} height="5" rx="2.5" /></g>)}</>;
    case "choices-composer":
      return <><Reply h={26} /><rect className="s-accent" x="10" y="44" width="36" height="9" rx="4.5" /><rect className="s-accent" x="50" y="44" width="30" height="9" rx="4.5" /><rect className="s-box" x="6" y="58" width="108" height="16" rx="6" /><rect className="s-dim" x="12" y="64" width="40" height="4" rx="2" /></>;
    case "panel":
      return <><Reply /><g transform="translate(96 46)"><rect className="s-box" x="-12" y="0" width="22" height="22" rx="6" /><path className="s-accent" d="M-1 4l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></g><text className="s-num" x="21" y="62">result in the ✦ panel</text></>;
    case "note-message":
      return <><Reply /><rect className="s-chip" x="21" y="46" width="44" height="9" rx="4.5" /><rect className="s-chip" x="69" y="46" width="28" height="9" rx="4.5" /></>;
    case "note-card":
      return <><Reply h={26} /><rect className="s-box" x="21" y="38" width="90" height="36" rx="6" /><rect className="s-strong" x="27" y="44" width="30" height="4" rx="2" /><rect className="s-dim" x="27" y="52" width="76" height="4" rx="2" /><rect className="s-dim" x="27" y="59" width="64" height="4" rx="2" /><rect className="s-dim" x="27" y="66" width="50" height="4" rx="2" /></>;
    case "note-view":
      return <><Reply h={26} /><rect className="s-box" x="21" y="38" width="90" height="36" rx="6" />{[44, 58].map((y) => <g key={y}><circle className="s-accent" cx="30" cy={y + 4} r="4" /><rect className="s-strong" x="38" y={y} width="24" height="3" rx="1.5" /><rect className="s-dim" x="38" y={y + 6} width="64" height="3" rx="1.5" /></g>)}</>;
    case "view-feed":
      return <>{[8, 32, 56].map((y) => <g key={y}><circle className="s-accent" cx="14" cy={y + 7} r="6" /><rect className="s-strong" x="25" y={y + 1} width="30" height="4" rx="2" /><rect className="s-dim" x="25" y={y + 9} width="84" height="4" rx="2" /><rect className="s-dim" x="25" y={y + 15} width="60" height="3" rx="1.5" /></g>)}</>;
    case "view-phone":
      return <><rect className="s-box" x="34" y="3" width="52" height="74" rx="9" /><rect className="s-dim" x="40" y="14" width="30" height="10" rx="5" /><rect className="s-accent" x="50" y="28" width="30" height="10" rx="5" /><rect className="s-dim" x="40" y="42" width="34" height="10" rx="5" /><rect className="s-accent" x="54" y="56" width="26" height="10" rx="5" /></>;
    case "view-sheet":
      return <>{[10, 26, 42, 58].map((y, i) => <g key={y}><rect className="s-strong" x="10" y={y} width="26" height="5" rx="2.5" /><rect className="s-box" x="42" y={y - 1} width="68" height="8" rx="4" /><rect className="s-accent" x="42" y={y - 1} width={[54, 30, 44, 18][i]} height="8" rx="4" /></g>)}</>;
    case "view-cards":
      return <>{([[8, 8], [62, 8], [8, 44], [62, 44]] as const).map(([x, y]) => <g key={`${x}${y}`}><rect className="s-box" x={x} y={y} width="50" height="30" rx="6" /><circle className="s-accent" cx={x + 10} cy={y + 10} r="5" /><rect className="s-strong" x={x + 18} y={y + 8} width="24" height="4" rx="2" /><rect className="s-dim" x={x + 6} y={y + 19} width="38" height="3" rx="1.5" /></g>)}</>;
    case "mark-rewrite":
      return <><Reply mark="pencil" /><text className="s-num" x="21" y="56">“polished” beside the name</text></>;
    case "mark-check":
      return <><Reply mark="warn" /><text className="s-num" x="21" y="56">a warning beside the name</text></>;
    case "check-line":
      return <><Reply /><rect className="s-warn-soft" x="21" y="46" width="90" height="12" rx="4" /><path className="s-warn" d="M28 49l4 6h-8z" /><rect className="s-warn" x="36" y="50" width="56" height="4" rx="2" /></>;
    case "silent":
      return <><Reply /><text className="s-num" x="21" y="56">nothing extra in the chat</text></>;
  }
}
