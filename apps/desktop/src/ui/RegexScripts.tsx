// Homunculus 2 — regex scripts: the list, the editor, Try it, the review of new scripts and the safe HTML box.
// Author: CLAUDE, 2026-11-01 (D-060). Plan: docs/UI-PLAN.md → "Regex scripts".
// One list component is used in three places: Library → Regex (global), the preset editor and the character editor.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { applyRegexScripts, regexError, REGEX_HTML, type RegexRunContext } from "@homunculus/core";
import { RegexScript, type RegexTarget } from "@homunculus/schemas";
import { Button, Collapse, Icon, Segmented, Switch } from "./kit.tsx";
import { SortableList, move } from "./Sortable.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { Modal } from "./Vault.tsx";

const TARGETS: Array<{ id: RegexTarget; label: string }> = [
  { id: "user", label: "My messages" }, { id: "ai", label: "AI replies" }, { id: "lore", label: "Lorebook entries" },
  { id: "reasoning", label: "Reasoning" }, { id: "command", label: "Commands" },
];
type Changes = "saved" | "display" | "prompt" | "both";
const CHANGES: Array<{ value: Changes; label: string }> = [
  { value: "saved", label: "The saved message" }, { value: "display", label: "Only what I see" },
  { value: "prompt", label: "Only what the AI gets" }, { value: "both", label: "What I see and the AI gets" },
];
const changesOf = (s: RegexScript): Changes => (s.displayOnly && s.promptOnly ? "both" : s.displayOnly ? "display" : s.promptOnly ? "prompt" : "saved");
const withChanges = (c: Changes) => ({ displayOnly: c === "display" || c === "both", promptOnly: c === "prompt" || c === "both" });

const plainMacros: RegexRunContext = { macros: (t) => t.replace(/\{\{char\}\}/gi, "Lyra").replace(/\{\{user\}\}/gi, "You") };

export const newRegexScript = (): RegexScript => RegexScript.parse({ id: crypto.randomUUID(), name: "New script", targets: ["ai"] });

/** "AI replies, Lorebook entries" */
const targetsText = (s: RegexScript) => s.targets.filter((t) => t !== "display").map((t) => TARGETS.find((x) => x.id === t)?.label ?? t).join(", ") || "Nothing yet";

function chipsOf(s: RegexScript): string[] {
  const out: string[] = [];
  const c = changesOf(s);
  if (c !== "saved") out.push(CHANGES.find((x) => x.value === c)!.label);
  if (!s.runOnEdit) out.push("Not on edit");
  if (s.minDepth !== null || s.maxDepth !== null) out.push(`Depth ${s.minDepth ?? 0}–${s.maxDepth ?? "∞"}`);
  if (s.findMacros !== "none") out.push("Macros in Find");
  return out;
}

/** The scripts of one place, in order. `waiting` marks scripts the user has not allowed yet (presets and cards). */
export function RegexList({ scripts, onChange, sample, waiting, onAllow, emptyText, testId = "regex-list" }: {
  scripts: RegexScript[]; onChange: (next: RegexScript[]) => void; sample?: string;
  waiting?: (s: RegexScript) => boolean; onAllow?: (s: RegexScript[]) => void; emptyText?: string; testId?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const put = (s: RegexScript) => onChange(scripts.map((x) => (x.id === s.id ? s : x)));
  const add = () => { const s = newRegexScript(); onChange([...scripts, s]); setOpen(s.id); };
  const pending = waiting ? scripts.filter((s) => s.on && waiting(s)) : [];
  return (
    <div className="rx-list" data-testid={testId}>
      {pending.length > 0 && onAllow && (
        <div className="rx-waiting" role="status">
          <Icon name="lock" size={14} />
          <span>{pending.length === 1 ? "1 script is" : `${pending.length} scripts are`} waiting for your OK and do not run yet.</span>
          <Button small onClick={() => onAllow(pending)} data-testid="regex-allow-all">Allow</Button>
        </div>
      )}
      {scripts.length === 0 ? <p className="hint rx-empty">{emptyText ?? "No scripts."}</p> : (
        <SortableList items={scripts} id={(s) => s.id} name={(s) => s.name || "Script"} label="Regex scripts" itemTestId="regex-script"
          onReorder={(from, to) => onChange(move(scripts, from, to))}
          render={(s, handle) => (
            <RegexRow script={s} handle={handle} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)}
              onChange={put} sample={sample} waiting={waiting?.(s) ?? false}
              onDuplicate={() => { const c = { ...s, id: crypto.randomUUID(), name: `${s.name} (copy)` }; const i = scripts.indexOf(s); onChange([...scripts.slice(0, i + 1), c, ...scripts.slice(i + 1)]); setOpen(c.id); }}
              onDelete={() => { onChange(scripts.filter((x) => x.id !== s.id)); setOpen(null); }} />
          )} />
      )}
      <Button small variant="plain" onClick={add} data-testid="regex-new"><Icon name="plus" size={12} /> New script</Button>
    </div>
  );
}

function RegexRow({ script: s, handle, open, onToggle, onChange, onDuplicate, onDelete, sample, waiting }: {
  script: RegexScript; handle: ReactNode; open: boolean; onToggle: () => void; onChange: (s: RegexScript) => void;
  onDuplicate: () => void; onDelete: () => void; sample?: string | undefined; waiting: boolean;
}) {
  const error = regexError(s.find);
  const chips = chipsOf(s);
  return (
    <div className={`rx-row${open ? " open" : ""}${s.on ? "" : " off"}`}>
      <div className="rx-head">
        {handle}
        <Switch checked={s.on} onChange={(on) => onChange({ ...s, on })} label={`${s.name || "Script"} on`} />
        <button type="button" className="rx-open" onClick={onToggle} aria-expanded={open}>
          <span className="rx-name">{s.name || "Untitled script"}</span>
          <span className="rx-where hint">{targetsText(s)}</span>
          {error && s.find && <span className="rx-chip bad">Pattern error</span>}
          {!s.find && <span className="rx-chip">No pattern</span>}
          {waiting && s.on && <span className="rx-chip warn">Waiting for OK</span>}
          {chips.map((c) => <span key={c} className="rx-chip">{c}</span>)}
          <Icon name="chevron" size={12} />
        </button>
      </div>
      <Collapse open={open}>
        {open && <RegexEditor script={s} onChange={onChange} onDuplicate={onDuplicate} onDelete={onDelete} sample={sample} error={error} />}
      </Collapse>
    </div>
  );
}

function RegexEditor({ script: s, onChange, onDuplicate, onDelete, sample, error }: {
  script: RegexScript; onChange: (s: RegexScript) => void; onDuplicate: () => void; onDelete: () => void; sample?: string | undefined; error: string | null;
}) {
  const [more, setMore] = useState(false);
  const set = (p: Partial<RegexScript>) => onChange({ ...s, ...p });
  const depth = (v: string) => (v.trim() === "" ? null : Math.trunc(Number(v)));
  const moreSummary = [s.runOnEdit ? "Runs on edit" : "Not on edit", s.findMacros === "none" ? "No macros in Find" : `Macros in Find${s.findMacros === "escaped" ? " (escaped)" : ""}`,
    s.minDepth !== null || s.maxDepth !== null ? `depth ${s.minDepth ?? 0}–${s.maxDepth ?? "∞"}` : "any depth", s.trim.length ? `removes ${s.trim.length} text(s) from groups` : ""].filter(Boolean).join(" · ");
  return (
    <div className="rx-edit">
      <label className="rx-field"><span className="rx-lbl">Name</span>
        <input value={s.name} onChange={(e) => set({ name: e.target.value })} data-testid="regex-name" /></label>
      <label className="rx-field"><span className="rx-lbl">Find</span>
        <input className="mono" value={s.find} placeholder="/pattern/flags" spellCheck={false} onChange={(e) => set({ find: e.target.value })} data-testid="regex-find" />
        {error && s.find ? <span className="rx-err" role="alert">{error}</span> : <span className="hint">Like <code>/\*(.+?)\*/g</code>. Flags: g every match, i any case, s dot matches new lines, m lines.</span>}
      </label>
      <label className="rx-field"><span className="rx-lbl">Replace with</span>
        <textarea className="mono" rows={2} value={s.replace} spellCheck={false} onChange={(e) => set({ replace: e.target.value })} data-testid="regex-replace" />
        <span className="hint"><code>$1</code> is the first group, <code>{"{{match}}"}</code> the whole match; <code>{"{{char}}"}</code> and <code>{"{{user}}"}</code> work. Empty = remove.</span>
      </label>
      <div className="rx-field"><span className="rx-lbl">Applies to</span>
        <div className="rx-targets" role="group" aria-label="Applies to">
          {TARGETS.map((t) => {
            const on = s.targets.includes(t.id);
            return <button key={t.id} type="button" className={`rx-target${on ? " on" : ""}`} aria-pressed={on}
              onClick={() => set({ targets: on ? s.targets.filter((x) => x !== t.id) : [...s.targets, t.id] })}>{t.label}</button>;
          })}
        </div>
      </div>
      <div className="rx-field"><span className="rx-lbl">It changes</span>
        <Segmented small label="It changes" options={CHANGES} value={changesOf(s)} onChange={(c) => set(withChanges(c))} />
        <span className="hint">{changesOf(s) === "saved" ? "The message is saved changed (you can put the original back from the message)." : "The saved message stays as it was."}</span>
      </div>
      <div className="rx-more">
        <button type="button" className="link" onClick={() => setMore(!more)} aria-expanded={more}>More</button>
        {!more && <span className="hint"> {moreSummary}</span>}
        <Collapse open={more}>
          {more && (
            <div className="rx-more-body">
              <label className="rx-check"><input type="checkbox" checked={s.runOnEdit} onChange={(e) => set({ runOnEdit: e.target.checked })} /> Also when I edit a message</label>
              <div className="rx-field"><span className="rx-lbl">Macros in Find</span>
                <Segmented small label="Macros in Find" value={s.findMacros} onChange={(v) => set({ findMacros: v })}
                  options={[{ value: "none", label: "No" }, { value: "raw", label: "Yes" }, { value: "escaped", label: "Yes, as plain text" }]} />
              </div>
              <div className="rx-field"><span className="rx-lbl">Only messages at depth</span>
                <span className="rx-depth">
                  <input type="number" min={-1} aria-label="From depth" placeholder="0" value={s.minDepth ?? ""} onChange={(e) => set({ minDepth: depth(e.target.value) })} />
                  to
                  <input type="number" min={0} aria-label="To depth" placeholder="any" value={s.maxDepth ?? ""} onChange={(e) => set({ maxDepth: depth(e.target.value) })} />
                  <span className="hint">0 = the newest message</span>
                </span>
              </div>
              <label className="rx-field"><span className="rx-lbl">Remove from groups</span>
                <input value={s.trim.join("\n").replace(/\n/g, ", ")} placeholder="Texts, separated by commas"
                  onChange={(e) => set({ trim: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
              </label>
            </div>
          )}
        </Collapse>
      </div>
      <RegexTry script={s} sample={sample} />
      <div className="rx-actions">
        <Button small variant="plain" onClick={onDuplicate}>Duplicate</Button>
        <span className="spacer" />
        <Button small variant="plain" className="danger-text" onClick={onDelete} data-testid="regex-delete">Delete</Button>
      </div>
    </div>
  );
}

/** Try it: a text and what the script makes of it (as a saved message, so every mode shows a result). */
function RegexTry({ script, sample }: { script: RegexScript; sample?: string | undefined }) {
  const [text, setText] = useState(sample ?? "Lyra *draws her bow* and says \"Who goes there?\"");
  const result = useMemo(() => {
    const plain = { ...script, on: true, displayOnly: false, promptOnly: false };
    const target = script.targets.find((t) => t !== "display") ?? "ai";
    return applyRegexScripts([{ ...plain, targets: [target] }], text, { target, mode: "saved" }, plainMacros);
  }, [script, text]);
  return (
    <div className="rx-try" data-testid="regex-try">
      <span className="rx-lbl">Try it</span>
      <div className="rx-try-grid">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Text to try" />
        <div className="rx-try-out" data-testid="regex-try-result" aria-live="polite">
          {result === text ? <span className="hint">No change.</span> : REGEX_HTML.test(result) && changesOf(script) !== "prompt" ? <SafeHtml html={result} /> : result}
        </div>
      </div>
    </div>
  );
}

/**
 * HTML made by regex scripts, drawn in a box that cannot run scripts, load anything or touch the app
 * (sandboxed iframe, no scripts, a strict Content-Security-Policy). Its height follows the content.
 */
export function SafeHtml({ html, className = "" }: { html: string; className?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(24);
  const doc = useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const color = style.getPropertyValue("--label").trim() || "inherit";
    const font = style.getPropertyValue("--font-prose").trim() || "serif";
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`
      + `<style>html,body{margin:0;padding:0;background:transparent;color:${color};font-family:${font};font-size:inherit;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>${html}</body></html>`;
  }, [html]);
  useLayoutEffect(() => {
    const f = frame.current;
    if (!f) return;
    const fit = () => { const b = f.contentDocument?.body; if (b) setH(Math.max(18, Math.ceil(b.scrollHeight))); };
    f.addEventListener("load", fit);
    const t = setInterval(fit, 400);
    return () => { f.removeEventListener("load", fit); clearInterval(t); };
  }, [doc]);
  return <iframe ref={frame} className={`safe-html ${className}`.trim()} title="Formatted message" sandbox="allow-same-origin" srcDoc={doc} style={{ height: h }} data-testid="safe-html" />;
}

/** Library → Regex: the scripts that run everywhere. */
export function RegexPage({ lead, scripts, onChange, onImport, onExport, sample }: {
  lead: ReactNode; scripts: RegexScript[]; onChange: (next: RegexScript[]) => void;
  onImport: (files: File[]) => void; onExport: () => void; sample?: string | undefined;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const shown = q.trim() ? scripts.filter((s) => `${s.name}\n${s.find}`.toLowerCase().includes(q.trim().toLowerCase())) : scripts;
  return (
    <section className="rx-page" data-testid="regex-page">
      <Toolbar lead={lead} title="Regex" subtitle="Find and replace that runs by itself, on every chat"
        trailing={<>
          <Button small onClick={() => file.current?.click()} title="SillyTavern: one script, a list, or settings.json"><Icon name="import" size={13} /> Import</Button>
          {scripts.length > 0 && <Button small variant="plain" onClick={onExport}>Export for SillyTavern</Button>}
          <input ref={file} type="file" accept=".json" multiple hidden data-testid="regex-import-input"
            onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) onImport(fs); }} />
        </>} />
      <div className="rx-page-body">
        <p className="hint">These run first, in this order; then the scripts of the chat's preset and character. Drag to change the order.</p>
        {scripts.length > 8 && (
          <label className="search-box"><Icon name="search" size={13} /><input aria-label="Search scripts" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        )}
        <RegexList scripts={shown} sample={sample}
          onChange={(next) => onChange(q.trim() ? mergeFiltered(scripts, shown, next) : next)}
          emptyText="No scripts. Import them from SillyTavern or make one." />
      </div>
    </section>
  );
}

/** Editing a filtered list: put the changes back into the full list (order of the filtered ones kept). */
function mergeFiltered(all: RegexScript[], shown: RegexScript[], next: RegexScript[]): RegexScript[] {
  const shownIds = new Set(shown.map((s) => s.id));
  const nextIds = new Set(next.map((s) => s.id));
  const queue = [...next];
  const out: RegexScript[] = [];
  for (const s of all) {
    if (!shownIds.has(s.id)) out.push(s);
    else if (nextIds.has(s.id)) out.push(queue.shift()!);
  }
  return [...out, ...queue];
}

/** The window that asks before scripts from a preset or card run: what each one does, and what it does to the last reply. */
export function RegexReview({ groups, sample, onAllow, onClose }: {
  groups: Array<{ ownerName: string; owner: "preset" | "character"; scripts: RegexScript[] }>;
  sample?: string | undefined; onAllow: (scripts: RegexScript[]) => void; onClose: () => void;
}) {
  const all = groups.flatMap((g) => g.scripts);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(all.map((s) => s.id)));
  const text = sample ?? "";
  return (
    <Modal title="New regex scripts" onClose={onClose} testId="regex-review" className="modal-small rx-review">
      <p className="hint">They change text by themselves. They run only after you allow them; if one changes later, you are asked again.</p>
      {groups.map((g) => (
        <section key={g.owner + g.ownerName} className="rx-review-group">
          <h3>{g.owner === "preset" ? "Preset" : "Character"} “{g.ownerName}”</h3>
          {g.scripts.map((s) => {
            const target = s.targets.find((t) => t !== "display") ?? "ai";
            const after = text ? applyRegexScripts([{ ...s, on: true, displayOnly: false, promptOnly: false, targets: [target] }], text, { target, mode: "saved" }, plainMacros) : text;
            return (
              <label key={s.id} className="rx-review-item">
                <input type="checkbox" checked={picked.has(s.id)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(s.id); else n.delete(s.id); setPicked(n); }} />
                <span className="rx-review-body">
                  <strong>{s.name || "Untitled script"}</strong> <span className="hint">· {targetsText(s)} · changes {CHANGES.find((c) => c.value === changesOf(s))!.label.replace(/^The /, "the ").replace(/^Only/, "only").replace(/^What/, "what")}</span>
                  <code className="rx-review-code">{s.find} → {s.replace || "(removed)"}</code>
                  {text && <span className="hint">{after === text ? "Does not change the last reply." : REGEX_HTML.test(after) && !REGEX_HTML.test(text) ? "Changes the last reply and adds formatting (shown in a safe box)." : "Changes the last reply."}</span>}
                </span>
              </label>
            );
          })}
        </section>
      ))}
      <div className="modal-foot">
        <Button variant="plain" onClick={onClose} data-testid="regex-review-later">Not now</Button>
        <span className="grow" />
        <Button variant="prominent" disabled={picked.size === 0} data-testid="regex-review-allow"
          onClick={() => { onAllow(all.filter((s) => picked.has(s.id))); onClose(); }}>
          {picked.size === all.length ? "Allow all" : `Allow ${picked.size}`}
        </Button>
      </div>
    </Modal>
  );
}

/** Prompt tab: the scripts that run in this chat; a switch turns one off for this chat only. */
export function SessionRegex({ rows, regexOff, onChange, onOpenLibrary }: {
  rows: Array<{ script: RegexScript; from: "global" | "preset" | "character"; on: boolean; offAbove: boolean }> | null;
  regexOff: string[]; onChange: (regexOff: string[]) => void; onOpenLibrary: () => void;
}) {
  const FROM = { global: "Global", preset: "Preset", character: "Character" } as const;
  if (rows && rows.length === 0) return null;
  return (
    <section className="group-section" data-testid="session-regex">
      <div className="group-head"><span className="label-row">Regex scripts</span>
        <span className="group-aside"><button type="button" className="link quiet" onClick={onOpenLibrary}>Library → Regex</button></span></div>
      <div className="group">
        {rows === null && <div className="row row-wide"><span className="hint">Loading…</span></div>}
        {rows?.map((r) => (
          <div key={r.from + r.script.id} className="row">
            <span className="row-label"><strong>{r.script.name || "Untitled script"}</strong> <span className="hint">{FROM[r.from]} · {targetsText(r.script)}{r.offAbove ? " · off in the story" : ""}</span></span>
            <span className="row-value"><Switch label={`${r.script.name} in this chat`} checked={r.on} disabled={r.offAbove}
              onChange={(on) => onChange(on ? regexOff.filter((x) => x !== r.script.id) : [...regexOff, r.script.id])} /></span>
          </div>
        ))}
      </div>
    </section>
  );
}
