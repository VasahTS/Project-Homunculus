// Homunculus 2 — the quiet "new version" bar at the top of the content (D-037). Author: CLAUDE, 2026-10-29.
// Shows only when there is something to do: a version is ready, it is downloading, or the install failed.
// One line; "What's New" opens the release notes under it. Nothing happens unless the person clicks.
import { useState } from "react";
import type { Updates } from "../updates.ts";
import { Button, Icon } from "./kit.tsx";

export function UpdateBar({ u }: { u: Updates }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const s = u.state;

  if (s.kind === "available" && !u.dismissed) {
    return (
      <div className="update-bar" role="status" data-testid="update-bar">
        <div className="update-line">
          <span className="update-mark" aria-hidden><Icon name="sparkle" size={14} /></span>
          <span className="update-text">
            <strong>Homunculus {s.version} is ready</strong>
            <span className="update-sub">You have {u.current}. Your chats, characters and keys stay as they are.</span>
          </span>
          <span className="update-actions">
            {s.notes && (
              <Button small variant="plain" aria-expanded={notesOpen} onClick={() => setNotesOpen((o) => !o)}>
                What’s New <span className={`update-chev${notesOpen ? " open" : ""}`}><Icon name="chevron" size={11} /></span>
              </Button>
            )}
            <Button small variant="plain" onClick={u.dismiss}>Later</Button>
            <Button small variant="bordered" className="update-go" onClick={() => void u.install()}>Update &amp; Restart</Button>
          </span>
        </div>
        {notesOpen && s.notes && <div className="update-notes" data-testid="update-notes">{s.notes}</div>}
      </div>
    );
  }

  if (s.kind === "downloading" || s.kind === "restarting") {
    const pct = s.kind === "downloading" ? s.percent : 100;
    return (
      <div className="update-bar" role="status" aria-live="polite" data-testid="update-bar">
        <div className="update-line">
          <span className="update-mark" aria-hidden><Icon name={s.kind === "restarting" ? "check" : "import"} size={14} /></span>
          <span className="update-text">
            <strong>{s.kind === "restarting" ? `Installing Homunculus ${s.version}…` : `Downloading Homunculus ${s.version}…`}</strong>
            <span className="update-sub">{s.kind === "restarting" ? "It will close and reopen by itself in a moment." : "You can keep reading; the app restarts when it is done."}</span>
          </span>
          {s.kind === "downloading" && pct !== null && <span className="update-pct">{pct}%</span>}
        </div>
        <div className="update-track" aria-hidden><span className={pct === null ? "busy" : ""} style={pct === null ? undefined : { width: `${pct}%` }} /></div>
      </div>
    );
  }

  if (s.kind === "error" && s.during === "install" && !u.dismissed) {
    return (
      <div className="update-bar error" role="alert" data-testid="update-bar">
        <div className="update-line">
          <span className="update-mark" aria-hidden><Icon name="alert" size={14} /></span>
          <span className="update-text">
            <strong>Could not install Homunculus {s.version}</strong>
            <span className="update-sub">{s.message} — nothing was changed; this version keeps working.</span>
          </span>
          <span className="update-actions">
            <Button small variant="plain" onClick={u.dismiss}>Later</Button>
            <Button small variant="bordered" onClick={() => void u.check()}>Try Again</Button>
          </span>
        </div>
      </div>
    );
  }

  return null;
}
