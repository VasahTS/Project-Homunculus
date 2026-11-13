// Homunculus 2 — Settings → Library (SillyTavern import + linked folders), the marks on linked cards, the notice on a
// linked card's sheet and the "changed in both places" window (D-128, D-129). Draft docs/drafts/st-import, screens 1, 6–8.
// Author: CLAUDE, 2026-11-13.
import { useEffect, useState } from "react";
import type { Character } from "@homunculus/schemas";
import type { LinkedIndex, LinkedStatus } from "../linkedCards.ts";
import type { PickedFolder } from "../stFolder.ts";
import { isDesktop } from "../db.ts";
import { PER_PAGE, setPrefs, usePrefs } from "../prefs.ts";
import { Button, Group, Icon, Row } from "./kit.tsx";
import { Modal } from "./Vault.tsx";

const when = (ms: number) => {
  if (!ms) return "not checked yet";
  const min = Math.round((Date.now() - ms) / 60000);
  return min < 1 ? "checked just now" : min < 60 ? `checked ${min} min ago` : `checked ${new Date(ms).toLocaleString()}`;
};

export interface LinkedApi {
  folders: PickedFolder[];
  index: LinkedIndex;
  checking: boolean;
  onLink: () => void;
  onCheck: () => void;
  onShow: (folderId: string) => void;
  onUnlink: (folderId: string, cards: "keep" | "trash") => void;
}

/** Settings → Library. */
export function LibrarySettings({ onImport, linked }: { onImport: () => void; linked: LinkedApi }) {
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <div className="settings-page" data-testid="settings-library-body">
      <Group icon="import" title="SillyTavern" testId="settings-sillytavern">
        <Row label="Import from SillyTavern" help="Everything at once: cards, chats (with swipes and branches), lorebooks, personas, presets, regex, Quick Replies, tags. Your SillyTavern folder is only read, never changed.">
          <Button small variant="prominent" onClick={onImport} data-testid="st-import-open"><Icon name="import" size={13} /> Import…</Button>
        </Row>
      </Group>
      <Group icon="grid" title="Lists" testId="settings-lists">
        <Row label="Items per page" help="Characters, Stories and the Library's lists show this many at a time, with pages. Also on the menu under each list.">
          <PerPage />
        </Row>
      </Group>
      <Group icon="link" title="Linked Folders" testId="settings-linked"
        help="Folders of cards Homunculus keeps reading: SillyTavern's characters folder, or the one your card manager keeps. New and changed cards show up by themselves; Homunculus never writes into these folders.">
        {!isDesktop ? <Row label="Linked folders" help="In the desktop app." /> : (
          <>
            {linked.folders.length === 0 && <Row label="No linked folders yet" help="Link a folder and its cards appear in Characters, in a folder with its name." />}
            {linked.folders.length > 0 && (
              <div className="lf-list">
                {linked.folders.map((f) => {
                  const entry = linked.index[f.id];
                  const cards = Object.values(entry?.files ?? {}).filter((x) => x.characterId).length;
                  const fresh = Object.values(entry?.files ?? {}).filter((x) => x.isNew).length;
                  const waiting = Object.values(entry?.files ?? {}).filter((x) => x.conflict).length;
                  return (
                    <div className="lf-row" key={f.id} data-testid="linked-folder">
                      <Icon name="folder" size={15} />
                      <span className="sti-what"><strong>{f.name}</strong><span className="lf-path" title={f.path}>{f.path}</span></span>
                      <span className="lf-acts">
                        <span className="lf-tag">{cards.toLocaleString("en-US")} card{cards === 1 ? "" : "s"}</span>
                        {f.present === false ? <span className="lf-tag warn">folder not found</span>
                          : <span className="lf-tag ok">{when(entry?.checkedAt ?? 0)}{fresh ? ` · ${fresh} new` : ""}</span>}
                        {waiting > 0 && <span className="lf-tag warn">{waiting} to choose</span>}
                        <Button small variant="plain" onClick={() => linked.onShow(f.id)}>Show</Button>
                        {asking === f.id
                          ? <><Button small onClick={() => { setAsking(null); linked.onUnlink(f.id, "keep"); }}>Keep Its Cards</Button>
                            <Button small variant="plain" className="sti-danger" onClick={() => { setAsking(null); linked.onUnlink(f.id, "trash"); }}>Move Them to Trash</Button>
                            <Button small variant="plain" onClick={() => setAsking(null)}>Cancel</Button></>
                          : <Button small variant="plain" onClick={() => setAsking(f.id)}>Unlink…</Button>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <Row label="" >
              <Button small disabled={linked.checking || linked.folders.length === 0} onClick={linked.onCheck}><Icon name="refresh" size={13} /> {linked.checking ? "Checking…" : "Check Now"}</Button>
              <Button small variant="prominent" onClick={linked.onLink} data-testid="linked-add"><Icon name="link" size={13} /> Link a Folder…</Button>
            </Row>
          </>
        )}
      </Group>
    </div>
  );
}

const MARK: Record<LinkedStatus, { text: string; cls: string; icon: "link" | "alert" | "close" }> = {
  linked: { text: "linked", cls: "", icon: "link" },
  new: { text: "new", cls: "", icon: "link" },
  edited: { text: "edited here", cls: "", icon: "link" },
  conflict: { text: "changed in both", cls: "warn", icon: "alert" },
  missing: { text: "file missing", cls: "bad", icon: "close" },
};

/** The small mark on a linked card's picture. */
export function LinkedMark({ status }: { status: LinkedStatus }) {
  const m = MARK[status];
  return <span className={`lf-mark ${m.cls}`.trim()} data-testid="linked-mark"><Icon name={m.icon} size={10} /> {m.text}</span>;
}

/** On a linked card's sheet: where it comes from, and what to do when it changed in both places or its file is gone. */
export function LinkedNotice({ status, folderName, onChoose, onKeepOwn, onTrash }: { status: LinkedStatus; folderName: string;
  onChoose: () => void; onKeepOwn: () => void; onTrash: () => void }) {
  if (status === "conflict") return (
    <div className="sti-warn lf-notice" data-testid="linked-notice"><div><Icon name="alert" size={13} /><span>Changed here and in <b>{folderName}</b>. <button className="link" onClick={onChoose}>Choose a Version…</button></span></div></div>
  );
  if (status === "missing") return (
    <div className="sti-warn lf-notice" data-testid="linked-notice"><div><Icon name="alert" size={13} /><span>Its file is no longer in <b>{folderName}</b>. Its chats still work. <button className="link" onClick={onKeepOwn}>Keep as My Own Card</button> · <button className="link" onClick={onTrash}>Move to Trash</button></span></div></div>
  );
  return <p className="sti-muted lf-notice" data-testid="linked-notice"><Icon name="link" size={11} /> From the linked folder <b>{folderName}</b>{status === "edited" ? " · your edits stay here; the file is never changed" : ""}.</p>;
}

const FIELDS: Array<{ key: keyof Character; label: string }> = [
  { key: "name", label: "Name" }, { key: "description", label: "Description" }, { key: "personality", label: "Personality" },
  { key: "scenario", label: "Scenario" }, { key: "firstMessages", label: "Greetings" }, { key: "exampleMessages", label: "Example messages" },
  { key: "tags", label: "Tags" }, { key: "creatorNotes", label: "Creator notes" },
];
const show = (v: unknown) => (Array.isArray(v) ? (v.every((x) => typeof x === "string") ? (v.length > 3 || (v as string[]).some((x) => x.length > 60) ? `${v.length} items` : v.join(", ")) : `${v.length} items`) : typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));

/** Changed in both places: the fields that differ, side by side. */
export function LinkedConflictSheet({ mine, load, folderName, onChoose, onClose }: { mine: Character; folderName: string;
  load: () => Promise<Character | null>; onChoose: (c: "mine" | "file" | "both") => void; onClose: () => void }) {
  const [file, setFile] = useState<Character | null | undefined>(undefined);
  useEffect(() => { void load().then(setFile).catch(() => setFile(null)); }, [load]);
  const diffs = file ? FIELDS.filter((f) => JSON.stringify((mine as Record<string, unknown>)[f.key as string] ?? null) !== JSON.stringify((file as Record<string, unknown>)[f.key as string] ?? null)) : [];
  return (
    <Modal title={`${mine.name} changed in both places`} onClose={onClose} testId="linked-conflict" className="modal-small sti-window">
      <span className="sti-muted">You edited this card here, and its file in <b>{folderName}</b> changed too (your card manager, or SillyTavern).</span>
      {file === undefined && <span className="sti-muted">Reading the file…</span>}
      {file === null && <p className="sti-error">The file could not be read as a card.</p>}
      {file && (
        <div className="lf-cmp">
          <div><h4>Yours (Homunculus)</h4>{diffs.map((f) => <span className="lf-field" key={f.label}><b>{f.label}</b><span>{show((mine as Record<string, unknown>)[f.key as string]) || "—"}</span></span>)}
            {diffs.length === 0 && <span className="sti-muted">Only details that aren't shown here differ.</span>}</div>
          <div><h4>The file's</h4>{diffs.map((f) => <span className="lf-field" key={f.label}><b>{f.label}</b><span>{show((file as Record<string, unknown>)[f.key as string]) || "—"}</span></span>)}</div>
        </div>
      )}
      <span className="sti-faint">Both versions stay in the card's History either way.</span>
      <div className="sti-foot">
        <span className="sti-muted" />
        <Button onClick={() => onChoose("both")} disabled={!file}>Keep Both (as Two Cards)</Button>
        <Button onClick={() => onChoose("file")} disabled={!file}>Take the File's</Button>
        <Button variant="prominent" onClick={() => onChoose("mine")}>Keep Mine</Button>
      </div>
    </Modal>
  );
}

function PerPage() {
  const p = usePrefs();
  return (
    <select aria-label="Items per page" value={p.perPage} onChange={(e) => void setPrefs({ perPage: Number(e.target.value) })} data-testid="settings-per-page">
      {PER_PAGE.map((n) => <option key={n} value={n}>{n === 0 ? "All" : n}</option>)}
    </select>
  );
}
