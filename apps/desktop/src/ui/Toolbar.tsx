// Homunculus 2 — the toolbar at the top of a view. Author: CLAUDE, 2026-10-27 (D-018).
// No bezels, three groups at most: leading (sidebar toggle + title), center (optional), trailing (actions).
// With a center (the Library and Vault tabs), leading and trailing share the free space equally, so the center stays
// in the same place whatever the title or the buttons are (Daniel, 2026-10-29: the tabs jumped on every tab change).
import type { ReactNode } from "react";

export function Toolbar({ lead, title, subtitle, center, trailing }: {
  lead?: ReactNode; title: ReactNode; subtitle?: ReactNode; center?: ReactNode; trailing?: ReactNode;
}) {
  return (
    <header className={`toolbar${center ? " has-center" : ""}`} data-region="toolbar">
      <div className="toolbar-leading">
        {lead}
        <div className="toolbar-title">
          <span className="toolbar-name">{title}</span>
          {subtitle && <span className="toolbar-sub">{subtitle}</span>}
        </div>
      </div>
      {center && <div className="toolbar-center">{center}</div>}
      <div className="toolbar-trailing">{trailing}</div>
    </header>
  );
}
