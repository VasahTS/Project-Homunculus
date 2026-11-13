// Homunculus 2 — Settings → About: the version and updates (D-037). Author: CLAUDE, 2026-10-29.
import { useEffect, useState } from "react";
import { bootSummary, onBootTiming } from "../bootTiming.ts";
import { updateStatusText, type Updates } from "../updates.ts";
import { Button, Group, Row } from "./kit.tsx";

export function AboutSection({ u }: { u: Updates }) {
  const s = u.state;
  const working = s.kind === "checking" || s.kind === "downloading" || s.kind === "restarting";
  return (
    <div className="settings-page" data-testid="about">
      <Group title="Homunculus">
        <Row label="Version"><span className="about-version">{u.current}</span></Row>
        <Row label="Last start" help="How long this start took, step by step: the window, the database, the setup, reading your library, the first screen. Send it to Claude if starting feels slow."><StartTime /></Row>
        <Row label="Updates" help="Checks GitHub on startup. Select Update & Restart to install. On Linux .deb, download and install the package. Your data stays in place.">
          <span className="about-update">
            <span className={`about-status${s.kind === "error" ? " danger-text" : ""}`} data-testid="update-status">{updateStatusText(u)}</span>
            {s.kind === "available"
              ? <Button small variant="bordered" onClick={() => void u.install()}>{s.manual ? "Download" : "Update & Restart"}</Button>
              : s.kind !== "off" && <Button small variant="bordered" disabled={working} onClick={() => void u.check()}>Check for Updates</Button>}
          </span>
        </Row>
      </Group>
      {s.kind === "available" && s.notes && (
        <Group title={`What’s New in ${s.version}`}>
          <div className="about-notes">{s.notes}</div>
        </Group>
      )}
    </div>
  );
}

/** This start's timing (D-130). */
function StartTime() {
  const [text, setText] = useState(bootSummary());
  useEffect(() => onBootTiming(() => setText(bootSummary())), []);
  return <span className="about-version" data-testid="start-time">{text || "—"}</span>;
}
