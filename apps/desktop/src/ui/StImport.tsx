// Homunculus 2 — the SillyTavern import screens (D-128): the window (folder → what to bring), the bar while it runs, the
// report. Built from the approved draft docs/drafts/st-import (screens 1–5). Author: CLAUDE, 2026-11-13.
// The run lives outside the window (`stImportRun`), so the window can close and the app stays usable while it imports.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AppServices } from "../core-instance.ts";
import { isDesktop } from "../db.ts";
import { browserFolder, findStUsers, nativeFolder, pickFolder, scanSt, type FolderSource, type StScan, type StUser } from "../stFolder.ts";
import { ST_KINDS, alreadyImported, runStImport, undoStImport, type StControl, type StKind, type StProgress, type StReport } from "../stImport.ts";
import { Button, Icon, Switch } from "./kit.tsx";
import { Modal } from "./Vault.tsx";

// ---------------------------------------------------------------- the run (one at a time, outside any screen)
type RunState =
  | { phase: "idle" }
  | { phase: "running"; progress: StProgress; control: StControl; user: string }
  | { phase: "done"; report: StReport };

let state: RunState = { phase: "idle" };
const listeners = new Set<() => void>();
const set = (s: RunState) => { state = s; for (const l of listeners) l(); };
export const stImportRun = {
  get: () => state,
  subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
  /** Back to idle (after the report is closed). */
  clear: () => set({ phase: "idle" }),
};
export const useStImportRun = () => useSyncExternalStore(stImportRun.subscribe, stImportRun.get);

async function start(svc: AppServices, src: FolderSource, scan: StScan, kinds: Record<StKind, boolean>, chatsOf: string[] | undefined, onDone: (r: StReport) => void) {
  const control: StControl = { paused: false, cancelled: false };
  let last = 0;
  set({ phase: "running", control, user: scan.user.name, progress: { stage: "Starting", done: 0, total: 1 } });
  const report = await runStImport(svc, src, scan, { kinds, ...(chatsOf ? { chatsOf } : {}) }, (p) => {
    // the bar redraws at most ~6 times a second
    const now = Date.now();
    if (now - last < 160 && p.done !== p.total) return;
    last = now;
    const s = stImportRun.get();
    if (s.phase === "running") set({ ...s, progress: p });
  }, control);
  set({ phase: "done", report });
  onDone(report);
}

// ---------------------------------------------------------------- words
const KIND_TEXT: Record<StKind, { title: string; help: string }> = {
  characters: { title: "Characters", help: "Cards with their pictures, embedded lorebooks and card regex" },
  chats: { title: "Chats", help: "Branches and checkpoints join their chat · swipes kept" },
  groups: { title: "Group chats", help: "Each group becomes a Story with its cast; its chats are the story's chats" },
  lorebooks: { title: "Lorebooks", help: "Linked again to the cards, personas and chats that use them; your global ones stay global" },
  personas: { title: "Personas", help: "With their pictures and descriptions; your default persona stays the default" },
  presets: { title: "Presets", help: "Chat Completion presets" },
  regex: { title: "Regex", help: "Global scripts; card and preset scripts come with them" },
  quickReplies: { title: "Quick Replies", help: "Your Quick Reply sets" },
  tags: { title: "Tags", help: "Written into the cards as tags" },
};
const n = (x: number) => x.toLocaleString("en-US");
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;
const mb = (bytes: number) => (bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);
function countOf(scan: StScan, k: StKind): number {
  switch (k) {
    case "characters": return scan.cards.length;
    case "chats": return scan.chatCount;
    case "groups": return scan.groups.length;
    case "lorebooks": return scan.lorebooks.length;
    case "personas": return scan.personas;
    case "presets": return scan.presets.length;
    case "regex": return scan.regex;
    case "quickReplies": return scan.quickReplies.length;
    case "tags": return scan.tags;
  }
}
function minutes(scan: StScan): string {
  const seconds = scan.cards.length * 0.08 + scan.chatBytes / 1.5e6 + scan.lorebooks.length * 0.05;
  return seconds < 60 ? "Under a minute" : `About ${Math.round(seconds / 60)} minute${Math.round(seconds / 60) === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------- the window
type Step =
  | { kind: "folder"; busy?: boolean; error?: string; src?: FolderSource; users?: StUser[]; pick?: number }
  | { kind: "found"; src: FolderSource; scan: StScan; already: { cards: number } };

export function StImportWindow({ svc, onClose, onDone }: { svc: AppServices; onClose: () => void; onDone: (r: StReport) => void }) {
  const [step, setStep] = useState<Step>({ kind: "folder" });
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.setAttribute("webkitdirectory", ""); }, []);

  const openFolder = async (src: FolderSource) => {
    setStep({ kind: "folder", busy: true });
    try {
      const users = await findStUsers(src);
      if (!users.length) { setStep({ kind: "folder", error: "No SillyTavern data here. Choose the SillyTavern folder or data/default-user." }); return; }
      if (users.length > 1) { setStep({ kind: "folder", src, users, pick: 0 }); return; }
      await scanUser(src, users[0]!);
    } catch (e) { setStep({ kind: "folder", error: e instanceof Error ? e.message : String(e) }); }
  };
  const scanUser = async (src: FolderSource, user: StUser) => {
    setStep((s) => ({ ...(s.kind === "folder" ? s : { kind: "folder" as const }), busy: true }));
    const scan = await scanSt(src, user);
    setStep({ kind: "found", src, scan, already: await alreadyImported(svc.store, scan) });
  };
  const choose = async () => {
    if (isDesktop) {
      try {
        const f = await pickFolder("Choose your SillyTavern folder");
        if (f) await openFolder(nativeFolder(f));
      } catch (e) { setStep({ kind: "folder", error: e instanceof Error ? e.message : String(e) }); }
    } else input.current?.click();
  };

  const steps = (on: 1 | 2) => (
    <span className="sti-steps" aria-hidden><span className={on === 1 ? "on" : "done"}>1 Folder</span><span className={on === 2 ? "on" : ""}>2 What to bring</span><span>3 Import</span></span>
  );

  return (
    <Modal title="Import from SillyTavern" onClose={onClose} testId="st-import" className="modal-small sti-window" head={steps(step.kind === "folder" ? 1 : 2)}>
      <input ref={input} type="file" multiple hidden data-testid="st-import-folder"
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) void openFolder(browserFolder(files)); }} />
      {step.kind === "folder" ? (
        <>
          <div className="sti-drop">
            <strong>Choose your SillyTavern folder</strong>
            <span className="sti-muted">The folder where SillyTavern is installed is fine — Homunculus finds your data inside it. It is only read, never changed.</span>
            <Button variant="prominent" onClick={() => void choose()} disabled={step.busy}><Icon name="folder" size={14} /> {step.busy ? "Reading…" : "Choose Folder…"}</Button>
          </div>
          {step.error && <p className="sti-error" role="alert">{step.error}</p>}
          {step.users && step.src && (
            <>
              <span className="sti-muted">This folder has {step.users.length} SillyTavern users. Which one?</span>
              <div className="sti-choices" role="radiogroup" aria-label="SillyTavern user">
                {step.users.map((u, i) => (
                  <button key={u.dir} role="radio" aria-checked={step.pick === i} className={`sti-choice${step.pick === i ? " on" : ""}`} onClick={() => setStep({ ...step, pick: i })}>
                    <span className="sti-radio" /> <strong>{u.name}</strong>
                  </button>
                ))}
              </div>
              <div className="sti-foot">
                <span className="sti-muted">Nothing is copied yet.</span>
                <Button variant="plain" onClick={onClose}>Cancel</Button>
                <Button variant="prominent" disabled={step.busy} onClick={() => void scanUser(step.src!, step.users![step.pick ?? 0]!)}>Next</Button>
              </div>
            </>
          )}
        </>
      ) : (
        <Found svc={svc} src={step.src} scan={step.scan} already={step.already} onBack={() => setStep({ kind: "folder" })}
          onStart={(kinds, chatsOf) => { void start(svc, step.src, step.scan, kinds, chatsOf, onDone); onClose(); }} />
      )}
    </Modal>
  );
}

function Found({ scan, already, onBack, onStart }: { svc: AppServices; src: FolderSource; scan: StScan; already: { cards: number };
  onBack: () => void; onStart: (kinds: Record<StKind, boolean>, chatsOf: string[] | undefined) => void }) {
  const present = ST_KINDS.filter((k) => countOf(scan, k) > 0);
  const [kinds, setKinds] = useState<Record<StKind, boolean>>(() => Object.fromEntries(ST_KINDS.map((k) => [k, countOf(scan, k) > 0])) as Record<StKind, boolean>);
  const owners = useMemo(() => Object.keys(scan.chats).sort((a, b) => scan.chats[b]!.length - scan.chats[a]!.length || a.localeCompare(b)), [scan]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(owners));
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const shownOwners = more ? owners : owners.slice(0, 8);
  const onCount = present.filter((k) => kinds[k]).length;
  const chatsOf = picked.size === owners.length ? undefined : [...picked];
  const pickedChats = owners.filter((o) => picked.has(o)).reduce((x, o) => x + scan.chats[o]!.length, 0);

  return (
    <>
      <span className="sti-muted">From <strong>{scan.user.name}</strong>. Everything is on; turn off what you don't want.</span>
      <div className="sti-found" data-testid="st-found">
        {present.map((k) => (
          <div className="sti-kind" key={k}>
            <Switch checked={kinds[k]} label={KIND_TEXT[k].title} onChange={(v) => setKinds({ ...kinds, [k]: v })}
              disabled={(k === "chats" || k === "groups") && !kinds.characters && already.cards === 0} />
            <span className="sti-what"><strong>{KIND_TEXT[k].title}</strong>
              <span>{k === "chats" ? `${KIND_TEXT.chats.help}${chatsOf ? ` · ${plural(pickedChats, "file")} picked` : ""}` : KIND_TEXT[k].help}</span></span>
            <span className="sti-count">{n(countOf(scan, k))}
              {k === "characters" && already.cards > 0 && <small>{n(already.cards)} already here</small>}
              {k === "chats" && <small>{mb(scan.chatBytes)}</small>}
              {k === "groups" && <small>{plural(scan.groupChats.length, "chat")}</small>}
            </span>
            {k === "chats" ? <Button small variant="plain" aria-expanded={open} onClick={() => setOpen(!open)}>By Character <Icon name="chevron" size={11} /></Button> : <span />}
            {k === "chats" && open && (
              <div className="sti-sub" data-testid="st-chats-by-character">
                {shownOwners.map((o) => (
                  <label key={o} className="sti-sub-row">
                    <input type="checkbox" checked={picked.has(o)} onChange={(e) => { const next = new Set(picked); if (e.target.checked) next.add(o); else next.delete(o); setPicked(next); }} />
                    <span>{o}</span><span className="sti-faint">{plural(scan.chats[o]!.length, "file")}</span>
                  </label>
                ))}
                <div className="sti-sub-row sti-sub-tools">
                  {owners.length > 8 && <button className="link" onClick={() => setMore(!more)}>{more ? "Show fewer" : `+ ${n(owners.length - 8)} more`}</button>}
                  <button className="link" onClick={() => setPicked(new Set(owners))}>Select All</button>
                  <button className="link" onClick={() => setPicked(new Set())}>Select None</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {present.length === 0 && <p className="sti-muted sti-pad">This SillyTavern folder is empty.</p>}
      </div>
      {scan.skipped.length > 0 && (
        <div className="sti-skip">
          <strong>Not brought</strong>
          {scan.skipped.map((s) => <span key={s.what}><b>{s.what}{s.count > 1 ? ` · ${n(s.count)}` : ""}</b> {s.why}</span>)}
        </div>
      )}
      <div className="sti-foot">
        <span className="sti-muted">{minutes(scan)} · you can keep using the app.</span>
        <Button variant="plain" onClick={onBack}>Back</Button>
        <Button variant="prominent" disabled={onCount === 0} onClick={() => onStart(kinds, chatsOf)} data-testid="st-start">
          <Icon name="import" size={14} /> {onCount === present.length ? "Import Everything" : `Import ${plural(onCount, "Kind")}`}
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- the bar while it runs
export function StImportBar() {
  const s = useStImportRun();
  const [, force] = useState(0);
  if (s.phase !== "running") return null;
  const { progress: p, control } = s;
  const pct = p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
  return (
    <div className="work-toast sti-bar" role="status" aria-live="polite" data-testid="st-import-progress">
      <div className="work-head"><strong>Importing from SillyTavern</strong><span className="work-count">{p.stage} {n(p.done)} / {n(p.total)}</span></div>
      <div className="work-bar" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done}><span style={{ width: `${pct}%` }} /></div>
      <div className="sti-bar-row">
        <span className="work-detail">{control.paused ? "Paused" : p.detail ?? ""}</span>
        <Button small onClick={() => { control.paused = !control.paused; force((x) => x + 1); }}>{control.paused ? "Resume" : "Pause"}</Button>
        <Button small variant="plain" onClick={() => { control.cancelled = true; control.paused = false; force((x) => x + 1); }}>Cancel</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the report
export function StImportReport({ svc, report, onOpen, onClose, onUndone }: { svc: AppServices; report: StReport;
  onOpen: (where: "characters" | "chats" | "lorebooks" | "personas" | "stories") => void; onClose: () => void; onUndone: () => void }) {
  const [undoing, setUndoing] = useState<"" | "ask" | "busy">("");
  const [showAll, setShowAll] = useState(false);
  const c = report.counts;
  const secs = Math.max(1, Math.round((report.endedAt - report.startedAt) / 1000));
  const took = secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`;
  const others = c.lorebooks + c.personas + c.presets + c.regex + c.quickReplies;
  const warnings = showAll ? report.warnings : report.warnings.slice(0, 6);
  const undo = async () => { setUndoing("busy"); await undoStImport(svc, report); onUndone(); };
  return (
    <Modal title={report.cancelled ? "SillyTavern import stopped" : "SillyTavern import finished"} onClose={onClose} testId="st-report" className="modal-small sti-window"
      head={<span className="sti-steps">{report.user} · {took}</span>}>
      <div className="sti-sum">
        <div><b>{n(c.characters)}</b><span>characters{c.alreadyHere ? ` (${n(c.alreadyHere)} already here)` : ""}</span></div>
        <div><b>{n(c.chats)}</b><span>chats · {plural(c.messages, "message")}</span></div>
        <div><b>{n(c.groups)}</b><span>Stories from groups</span></div>
        <div><b>{n(others)}</b><span>lorebooks, personas, presets, regex, Quick Replies</span></div>
      </div>
      <div className="sti-found">
        {c.chats > 0 && <ReportRow title="Chats" text={[`${n(c.chats)}`, c.branches && `${plural(c.branches, "branch", "branches")} and checkpoints joined their chat`, c.swipes && `${plural(c.swipes, "swipe")} kept`,
          report.links.chats && `${n(report.links.chats)} with their own lorebook or persona`].filter(Boolean).join(" · ")} onOpen={() => onOpen("chats")} />}
        {c.characters > 0 && <ReportRow title="Characters" text={[`${n(c.characters)}`, report.links.cards && `${n(report.links.cards)} with lorebooks`, c.tags && `tags from ${plural(c.tags, "SillyTavern tag")}`].filter(Boolean).join(" · ")} onOpen={() => onOpen("characters")} />}
        {c.lorebooks > 0 && <ReportRow title="Lorebooks" text={`${n(c.lorebooks)}${report.links.global ? ` · ${n(report.links.global)} global` : ""}`} onOpen={() => onOpen("lorebooks")} />}
        {c.personas > 0 && <ReportRow title="Personas" text={`${n(c.personas)}${report.links.personas ? ` · ${n(report.links.personas)} with a lorebook` : ""}`} onOpen={() => onOpen("personas")} />}
        {c.groups > 0 && <ReportRow title="Stories" text={`${n(c.groups)} from groups`} onOpen={() => onOpen("stories")} />}
        {c.presets > 0 && <ReportRow title="Presets" text={`${n(c.presets)}${report.presetInUse ? ` · "${report.presetInUse}" was the one in use` : ""}`} />}
      </div>
      {report.warnings.length > 0 && (
        <div className="sti-warn" data-testid="st-report-warnings">
          {warnings.map((w, i) => <div key={i}><Icon name="alert" size={13} /><span>{w.text}</span></div>)}
          {report.warnings.length > 6 && <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${n(report.warnings.length)}`}</button>}
        </div>
      )}
      {report.skipped.length > 0 && (
        <div className="sti-skip"><strong>Not brought</strong><span>{report.skipped.map((s) => `${s.what}${s.count > 1 ? ` (${n(s.count)})` : ""}`).join(", ")}</span></div>
      )}
      <div className="sti-foot">
        {undoing === "ask"
          ? <><span className="sti-muted">Move everything this import made to the Trash?</span><Button variant="plain" onClick={() => setUndoing("")}>Keep</Button><Button className="sti-danger" onClick={() => void undo()}>Move to Trash</Button></>
          : <><Button variant="plain" className="sti-danger" disabled={undoing === "busy"} onClick={() => setUndoing("ask")} data-testid="st-undo"><Icon name="back" size={13} /> {undoing === "busy" ? "Undoing…" : "Undo This Import"}</Button>
            <span className="sti-muted">Import again later: only new things come in.</span>
            <Button variant="prominent" onClick={onClose}>Done</Button></>}
      </div>
    </Modal>
  );
}

function ReportRow({ title, text, onOpen }: { title: string; text: string; onOpen?: () => void }) {
  return (
    <div className="sti-kind sti-report-row">
      <span className="sti-ok"><Icon name="check" size={13} /></span>
      <span className="sti-what"><strong>{title}</strong><span>{text}</span></span>
      <span />
      {onOpen ? <Button small variant="plain" onClick={onOpen}>Open</Button> : <span />}
    </div>
  );
}
