// Homunculus 2 — Settings → About: the version and updates (D-037). Author: CLAUDE, 2026-10-29.
import { updateStatusText, type Updates } from "../updates.ts";
import { Button, Group, Row } from "./kit.tsx";

export function AboutSection({ u }: { u: Updates }) {
  const s = u.state;
  const working = s.kind === "checking" || s.kind === "downloading" || s.kind === "restarting";
  return (
    <div className="settings-page" data-testid="about">
      <Group title="Homunculus">
        <Row label="Version"><span className="about-version">{u.current}</span></Row>
        <Row label="Updates" help="The installed app asks GitHub for a newer version each time it opens. It never installs anything until you click Update & Restart (on Linux .deb: Download, then install the new .deb). Your chats, characters and keys are not touched by an update.">
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
