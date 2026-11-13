// Homunculus 2 — Settings → About: the version and updates (D-037). Author: CLAUDE, 2026-10-29.
import { useEffect, useState } from "react";
import { bootParts, bootSummary, onBootTiming } from "../bootTiming.ts";
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
        <Row label="Diagnostics" wide help="Measures the app now and writes a report to copy or save: the system, how much is in your library, sizes and how long each read takes. Only numbers — no names, texts, messages or keys. Works on any computer."><Diagnostics version={u.current} /></Row>
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
  const [reads, setReads] = useState(bootParts());
  useEffect(() => onBootTiming(() => { setText(bootSummary()); setReads(bootParts()); }), []);
  return <span className="about-version" data-testid="start-time">{text || "—"}{reads && <><br /><small>slowest reads: {reads}</small></>}</span>;
}

/** Settings → About → Diagnostics (D-131): a report of numbers to copy or save. */
function Diagnostics({ version }: { version: string }) {
  const [step, setStep] = useState<string | null>(null);
  const [report, setReport] = useState("");
  const [note, setNote] = useState("");
  const run = async () => {
    setStep("Starting…"); setReport(""); setNote("");
    try {
      const [{ servicesReady }, { createDiagnosticReport }] = await Promise.all([import("../core-instance.ts"), import("../diagnostics.ts")]);
      setReport(await createDiagnosticReport(await servicesReady, version, (t) => setStep(t || null)));
    } catch (e) { setNote(`Couldn't make the report: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setStep(null); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(report); setNote("Copied."); } catch { setNote("Couldn't copy: select the text and copy it."); }
  };
  const save = async () => {
    const { saveExport } = await import("../files.ts");
    const where = await saveExport({ fileName: `homunculus-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`, mime: "text/plain", bytes: new TextEncoder().encode(report) });
    if (where) setNote(`Saved to ${where}`);
  };
  return (
    <span className="diag" data-testid="diagnostics">
      <span className="diag-acts">
        <Button small onClick={() => void run()} disabled={step !== null} data-testid="diagnostics-run">{step ?? (report ? "Create Again" : "Create Report")}</Button>
        {report && <><Button small onClick={() => void copy()}>Copy</Button><Button small onClick={() => void save()}>Save as File…</Button></>}
      </span>
      {note && <small className="diag-note">{note}</small>}
      {report && <textarea className="diag-report" readOnly value={report} aria-label="Diagnostic report" data-testid="diagnostics-report" onFocus={(e) => e.target.select()} />}
    </span>
  );
}
