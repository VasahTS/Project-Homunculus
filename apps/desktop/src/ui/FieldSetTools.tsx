// Field-set reuse in the tracker editor. CODEX, D-043; CLAUDE, D-046: files live on the set bar (Import · Export ·
// AI guide, with a "Save as" window), and fields/groups are sent to another set from their own row.
import { useRef } from "react";
import { parseFieldSetFile, serializeFieldSets } from "@homunculus/core";
import { portableSetOf, type SetDraft } from "../trackers.ts";
import { fileNameFrom, saveExport } from "../files.ts";
import { Icon } from "./kit.tsx";
import { useFloatingMenu } from "./FloatingMenu.ts";
import aiGuide from "../../../../docs/FIELD-SET-AI-GUIDE.md?raw";

type Say = (text: string, kind?: "ok" | "error") => void;

/** Quiet links at the end of the set bar: they act on the set chosen in the select beside them. */
export function SetFileLinks({ sets, current, onImport, say }: {
  sets: SetDraft[]; current: SetDraft; onImport: (sets: SetDraft[], message: string) => void; say: Say;
}) {
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(sets); latest.current = sets;
  const save = async (fileName: string, text: string, mime: string, done: (where: string) => string) => {
    try {
      const where = await saveExport({ fileName, bytes: new TextEncoder().encode(text), mime });
      if (where) say(done(where));
    } catch (e) { say(e instanceof Error ? e.message : String(e), "error"); }
  };
  const exportSet = () => save(`${fileNameFrom(current.name, "field-set")}.json`, serializeFieldSets([portableSetOf(current)]), "application/json",
    (where) => `Exported “${current.name || "the set"}” to ${where}. Saved chat values are not included.`);
  const saveGuide = () => save("homunculus-field-sets-guide.md", aiGuide, "text/markdown",
    (where) => `Saved the guide to ${where}. Give it to another AI together with what you want to track, then import its answer here.`);
  const importFile = async (file: File) => {
    const before = latest.current;
    try {
      const parsed = parseFieldSetFile(await file.text());
      if (latest.current !== before) throw new Error("The tracker changed while the file was being read. Import it again.");
      const names = new Set(before.map((s) => s.name));
      const added = parsed.sets.map((s) => {
        let name = s.name;
        for (let n = 2; names.has(name); n++) name = `${s.name} (${n})`;
        names.add(name);
        return { ...s, name, id: `set-${crypto.randomUUID()}` };
      });
      onImport([...before, ...added], added.length === 1 ? `Imported the set “${added[0]!.name}”.` : `Imported ${added.length} sets.`);
    } catch (e) {
      say(`“${file.name}” was not imported: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };
  return <span className="set-files" data-testid="field-set-files">
    <button type="button" className="link quiet" onClick={() => input.current?.click()} title="Add field sets from a file to this tracker">Import…</button>
    <button type="button" className="link quiet" onClick={() => void exportSet()} title="Save this set to a file, to keep or to share">Export…</button>
    <button type="button" className="link quiet" onClick={() => void saveGuide()} title="Instructions for another AI to write field sets you can import">AI guide</button>
    <input ref={input} type="file" accept=".json,application/json" aria-label="Import field sets JSON" hidden onChange={(e) => {
      const file = e.target.files?.[0]; e.target.value = ""; if (file) void importFile(file);
    }} />
  </span>;
}

export interface SendTarget { id: string; name: string; has: boolean }

/** The subtle "send to" button of a field or a group row: a menu of the other sets, each with Copy and Move. */
export function SendToMenu({ what, targets, canMove, onSend }: {
  what: string; targets: SendTarget[]; canMove: boolean; onSend: (to: string | "new", mode: "copy" | "move") => void;
}) {
  const rows = targets.length + 1;
  const m = useFloatingMenu(rows * 40 + 40, 300, ".lore-qside");
  const send = (to: string | "new", mode: "copy" | "move") => { m.setOpen(false); onSend(to, mode); };
  const actions = (to: string | "new", name: string) => <>
    <button type="button" role="menuitem" className="lore-qside" aria-label={`Copy to ${name}`} onClick={() => send(to, "copy")}>Copy</button>
    <button type="button" role="menuitem" className="lore-qside" aria-label={`Move to ${name}`} disabled={!canMove}
      title={canMove ? undefined : "A set keeps at least one field. Copy instead."} onClick={() => send(to, "move")}>Move</button>
  </>;
  return (
    <span className={`te-send${m.open ? " open" : ""}`} ref={m.box} onKeyDown={m.onKeyDown} onBlur={m.onBlur}>
      <button type="button" className="te-send-btn" aria-haspopup="menu" aria-expanded={m.open} aria-label={`Send ${what} to another set`}
        title="Send to another set" onClick={() => m.setOpen((v) => !v)}><Icon name="send" size={14} /></button>
      {m.open && m.pos && (
        <span className="lore-menu te-send-menu" role="menu" aria-label={`Send ${what} to`} style={{ top: m.pos.top, left: m.pos.left }}>
          <span className="te-send-title">Send {what} to</span>
          {targets.map((t) => (
            <span key={t.id} className="lore-qrow" role="group" aria-label={t.name}>
              <span className="lore-qname">{t.name}</span>
              {t.has ? <span className="hint">already there</span> : actions(t.id, t.name)}
            </span>
          ))}
          <span className="lore-qrow te-send-new" role="group" aria-label="A new set">
            <span className="lore-qname"><Icon name="plus" size={12} /> A new set</span>
            {actions("new", "a new set")}
          </span>
        </span>
      )}
    </span>
  );
}
