// Homunculus 2 — the Assistant's decision cards (D-115). Author: CLAUDE, 2026-11-10.
// Approved draft: docs/drafts/vision-comic (boards 5–7): "What I Understood" with a pencil per part, Merge…, See Details
// and Looks Right; questions with buttons, one at a time; a new item shown field by field with where each part came
// from, Keep / Edit / Discard, and Use a Panel as Portrait.
import { useState, type ReactNode } from "react";
import { LoreEntry, type AssistantKind, type AssistantResult } from "@homunculus/schemas";
import { answersMessage, mergeCastOn, type Question, type Understood } from "../assistant/cards.ts";
import { AutoText, Button, Collapse, Icon } from "./kit.tsx";
import { badgesOf, kindOf, PlaceIcon, placeShort } from "./LorebookEditor.tsx";
import { cropImage } from "./ImageCropper.tsx";
import { bytesToBase64 } from "@homunculus/st-cards";

export interface PagePicture { id: string; name: string; mime: string; base64: string }
const FACE_TONES = ["#c9b8a6", "#a9b3bd", "#c7b0b9", "#b5c2a8", "#c4b896", "#a8b9c6"];

/** A cast member's round face (their id letter). */
export function Face({ id, index }: { id: string; index: number }) {
  return <span className="asst-face" style={{ background: FACE_TONES[index % FACE_TONES.length] }} aria-hidden>{id.slice(0, 2)}</span>;
}

// ------------------------------------------------------------------ What I Understood

const PARTS: Array<{ key: "synopsis" | "relationships" | "setting" | "scenes"; label: string }> = [
  { key: "synopsis", label: "Synopsis" }, { key: "relationships", label: "Relationships" }, { key: "setting", label: "Setting" }, { key: "scenes", label: "Key Scenes" },
];

export function UnderstoodCard({ r, reading, busy, onChange, onSend }: {
  r: Understood; reading?: string; busy: boolean; onChange: (next: Understood) => void; onSend: (text: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [details, setDetails] = useState(false);
  const [merging, setMerging] = useState(false);
  const [from, setFrom] = useState(r.cast[1]?.id ?? "");
  const [into, setInto] = useState(r.cast[0]?.id ?? "");
  const mark = (key: string) => (r.edited.includes(key) ? r.edited : [...r.edited, key]);
  const pencil = (key: string, text: string) => (
    <button type="button" className="asst-pen" aria-label={`Edit ${key}`} title="Correct this" onClick={() => { setEditing(key); setDraft(text); }}><Icon name="pencil" size={12} /></button>
  );
  const editor = (save: (t: string) => void) => (
    <div className="asst-wiu-edit">
      <AutoText value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} aria-label="Correction" />
      <div className="asst-desc-acts"><Button small variant="prominent" disabled={!draft.trim()} onClick={() => { save(draft.trim()); setEditing(null); }}>Save</Button><Button small variant="plain" onClick={() => setEditing(null)}>Cancel</Button></div>
    </div>
  );
  const row = (label: string, key: string, body: ReactNode, text: string) => (
    <div className="asst-wiu-row" key={key}>
      <h4>{label}{r.edited.includes(key) && <small> · corrected</small>}</h4>
      {editing === key ? editor((t) => onChange({ ...r, [key]: t, edited: mark(key) } as Understood)) : <div className="asst-wiu-v">{body}</div>}
      {editing !== key && pencil(label.toLowerCase(), text)}
    </div>
  );
  return (
    <div className="asst-dcard asst-wiu" data-testid="assistant-understood">
      <div className="asst-dcard-h"><b>What I Understood</b>{r.title && <small>{r.title}</small>}
        {reading && <button type="button" className="asst-desc-btn right" onClick={() => setDetails(!details)} aria-expanded={details} data-testid="assistant-understood-details">{details ? "Hide Details" : "See Details"}</button>}</div>
      <div className="asst-wiu-rows">
        {row("Synopsis", "synopsis", <p>{r.synopsis}</p>, r.synopsis)}
        <div className="asst-wiu-row">
          <h4>Cast{r.edited.includes("cast") && <small> · corrected</small>}</h4>
          {editing?.startsWith("cast:") ? (() => {
            const id = editing.slice(5);
            return editor((t) => onChange({ ...r, cast: r.cast.map((c) => (c.id === id ? { ...c, ...personFrom(t, c) } : c)), edited: mark("cast") }));
          })() : (
            <div className="asst-wiu-v asst-who">
              {r.cast.map((c, i) => (
                <div className="asst-person" key={c.id}>
                  <Face id={c.id} index={i} />
                  <div className="asst-person-t">
                    <b>{c.name || c.id}</b>
                    {(c.looks || c.personality) && <span>{[c.looks, c.personality].filter(Boolean).join(" ")}</span>}
                    {c.line && <q>{c.line}</q>}
                    {c.pages && <span className="asst-src">{c.pages}</span>}
                  </div>
                  <button type="button" className="asst-pen" aria-label={`Edit ${c.name || c.id}`} onClick={() => { setEditing(`cast:${c.id}`); setDraft(personText(c)); }}><Icon name="pencil" size={12} /></button>
                </div>
              ))}
              {r.merged.map((m) => <span key={m} className="hint">Merged {m}.</span>)}
              {r.cast.length > 1 && (merging ? (
                <div className="asst-merge">
                  <select aria-label="Merge this person" value={from} onChange={(e) => setFrom(e.target.value)}>{r.cast.map((c) => <option key={c.id} value={c.id}>{c.id} {c.name}</option>)}</select>
                  <span>is the same person as</span>
                  <select aria-label="Into this person" value={into} onChange={(e) => setInto(e.target.value)}>{r.cast.map((c) => <option key={c.id} value={c.id}>{c.id} {c.name}</option>)}</select>
                  <Button small variant="prominent" disabled={from === into} onClick={() => { onChange(mergeCastOn(r, from, into)); setMerging(false); }}>Merge</Button>
                  <Button small variant="plain" onClick={() => setMerging(false)}>Cancel</Button>
                </div>
              ) : <button type="button" className="asst-desc-btn" onClick={() => setMerging(true)} data-testid="assistant-merge">Merge…</button>)}
            </div>
          )}
          <span />
        </div>
        {PARTS.slice(1).filter((p) => r[p.key] || r.edited.includes(p.key)).map((p) => row(p.label, p.key, <p>{r[p.key]}</p>, r[p.key]))}
      </div>
      {r.unsure && <div className="asst-unsure">Not sure: {r.unsure}</div>}
      {details && reading && <pre className="asst-reading" data-testid="assistant-reading">{reading}</pre>}
      <div className="asst-dcard-acts">
        {r.confirmed ? <span className="ok-text">✓ You said it looks right</span> : <>
          <Button small variant="prominent" disabled={busy} onClick={() => { onChange({ ...r, confirmed: true }); onSend(r.edited.length || r.merged.length ? "Looks right now (I corrected the card)." : "Looks right."); }} data-testid="assistant-looks-right">Looks Right</Button>
          <span className="hint">or tell me what to fix</span>
        </>}
      </div>
    </div>
  );
}

type Person = Understood["cast"][number];
const personText = (c: Person) => [`Name: ${c.name}`, `Looks: ${c.looks}`, `Personality: ${c.personality}`, `Line: ${c.line}`, `Pages: ${c.pages}`].join("\n");
/** Reads the "Name: … / Looks: …" text of the person editor back (a line without a label goes to Personality). */
function personFrom(text: string, c: Person): Partial<Person> {
  const out: Partial<Person> = {};
  const keys: Record<string, keyof Person> = { name: "name", looks: "looks", personality: "personality", line: "line", pages: "pages" };
  let free = "";
  for (const raw of text.split("\n")) {
    const m = /^\s*(name|looks|personality|line|pages)\s*:\s*(.*)$/i.exec(raw);
    if (m) (out as Record<string, string>)[keys[m[1]!.toLowerCase()]!] = m[2]!.trim();
    else if (raw.trim()) free += `${free ? " " : ""}${raw.trim()}`;
  }
  if (free) out.personality = [out.personality ?? c.personality, free].filter(Boolean).join(" ");
  return out;
}

// ------------------------------------------------------------------ questions with buttons

export function QuestionCard({ r, busy, onChange, onSend, faces }: {
  r: Question; busy: boolean; onChange: (next: Question) => void; onSend: (text: string) => void;
  /** Cast ids in order (for the faces' tones). */
  faces?: string[];
}) {
  const [other, setOther] = useState<string | null>(null);
  const i = r.answers.length;
  const q = r.questions[i];
  const answer = (a: string) => {
    if (!a.trim() || busy) return;
    const answers = [...r.answers, a.trim()];
    setOther(null);
    if (answers.length >= r.questions.length) { onChange({ ...r, answers, done: true }); onSend(answersMessage(r, answers)); }
    else onChange({ ...r, answers });
  };
  if (r.done || !q) return (
    <div className="asst-dcard asst-asked" data-testid="assistant-question">
      {r.questions.map((x, j) => <div key={j} className="asst-asked-row"><span>{x.question}</span><b>{r.answers[j] ?? "—"}</b></div>)}
    </div>
  );
  return (
    <div className="asst-dcard" data-testid="assistant-question">
      <div className="asst-dcard-h"><b>{q.question}</b>{r.questions.length > 1 && <small>{i + 1} of {r.questions.length}</small>}
        {i > 0 && <button type="button" className="asst-desc-btn right" onClick={() => onChange({ ...r, answers: r.answers.slice(0, -1) })}>Back</button>}</div>
      <div className="asst-opts">
        {q.options.map((o) => (
          <button key={o.label} type="button" className="asst-opt" disabled={busy} onClick={() => answer(o.label)} data-testid="assistant-option">
            {o.cast && <Face id={o.cast} index={Math.max(0, faces?.indexOf(o.cast) ?? 0)} />}
            <span className="asst-opt-t"><span>{o.label}</span>{o.detail && <small>{o.detail}</small>}</span>
          </button>
        ))}
      </div>
      {other === null ? <button type="button" className="asst-desc-btn" onClick={() => setOther("")}>Other…</button> : (
        <div className="asst-merge">
          <input autoFocus value={other} placeholder="Your answer" aria-label="Your answer" onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") answer(other); if (e.key === "Escape") setOther(null); }} />
          <Button small variant="prominent" disabled={!other.trim() || busy} onClick={() => answer(other)}>OK</Button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ a new item, field by field

type NewItem = Extract<AssistantResult, { type: "new" }>;
const FIELD_LABEL: Record<string, string> = { description: "Description", personality: "Personality", scenario: "Scenario", first_mes: "First Message", firstMessages: "First Messages", mes_example: "Examples", exampleMessages: "Examples", openings: "Openings", name: "Name" };
const labelOf = (k: string) => FIELD_LABEL[k] ?? k.replace(/_/g, " ").replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const KIND_ONE: Record<AssistantKind, string> = { character: "Character", persona: "Persona", lorebook: "Lorebook", tracker: "Tracker", kit: "Story Kit", narrator: "Narrator", preset: "Preset", cue: "Cue", story: "Story" };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
/** The fields of a new item worth showing (its name is the title; empty ones are left out). */
export const shownFields = (data: Obj) => Object.entries(data).filter(([k, v]) => k !== "name" && k !== "folder" && k !== "importFile" && v !== "" && v != null && !(Array.isArray(v) && !v.length));

/**
 * A new item's fields, readable (D-152): a label and the value, never raw JSON. A lorebook's entries read like the
 * lorebook editor's rows. With `editing` (the user's changes so far), text fields and entries become editable.
 */
export function NewItemFields({ r, editing, onEditing, renderValue }: {
  r: NewItem; editing: Obj | null; onEditing: (next: Obj) => void; renderValue: (name: string, value: unknown) => ReactNode;
}) {
  const data = isObj(r.data) ? r.data : {};
  return <>{shownFields(data).map(([k, v]) => {
    const entries = k === "entries" && Array.isArray(v) && v.some(isObj);
    return (
      <div className={`asst-newitem-f${entries ? " wide" : ""}`} key={k}>
        {!entries && <span className="asst-newitem-n">{labelOf(k)}{r.sources?.[k] && <span className="asst-src">{r.sources[k]}</span>}</span>}
        {entries
          ? <LoreEntriesView entries={Array.isArray(editing?.entries) ? editing.entries : v} onEdit={editing ? (next) => onEditing({ ...editing, entries: next }) : undefined}
            label={<span className="asst-newitem-n">{labelOf(k)} <small>· {v.length}</small></span>} />
          : editing && typeof v === "string"
            ? <AutoText value={typeof editing[k] === "string" ? editing[k] : v} onChange={(e) => onEditing({ ...editing, [k]: e.target.value })} aria-label={labelOf(k)} />
            : <div className="asst-newitem-v">{renderValue(k, v)}</div>}
      </div>
    );
  })}</>;
}

/** An entry the AI wrote (only some fields), with the schema's defaults filled in, for the badges and the place. */
function asEntry(x: Obj, i: number): LoreEntry | null {
  const parsed = LoreEntry.safeParse({ ...x, id: typeof x.id === "string" && x.id ? x.id : `new-${i}` });
  return parsed.success ? parsed.data : null;
}
const keysText = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : "");
const keysOf = (t: string) => t.split(",").map((k) => k.trim()).filter(Boolean);

/**
 * A lorebook's entries as readable rows (D-152): the title, the keywords as chips and the first line of the text;
 * a click opens the whole text and what differs from the defaults (place, chance, timers…), with the lorebook
 * editor's own badges. With `onEdit`: title, keywords and text of each entry can be changed in place.
 */
export function LoreEntriesView({ entries, onEdit, label }: { entries: unknown[]; onEdit?: (next: Obj[]) => void; label?: ReactNode }) {
  const list = entries.filter(isObj);
  const [open, setOpen] = useState<Set<number>>(() => new Set(list.length === 1 ? [0] : []));
  const allOpen = list.length > 0 && open.size === list.length;
  const toggle = (i: number) => setOpen((o) => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const patch = (i: number, p: Obj) => onEdit?.(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  if (onEdit) return (
    <div className="asst-lore editing">{label}{list.map((x, i) => <LoreEntryEdit key={i} x={x} onPatch={(p) => patch(i, p)} />)}</div>
  );
  const all = list.length > 2 && <button type="button" className="asst-lnk" onClick={() => setOpen(allOpen ? new Set() : new Set(list.map((_, i) => i)))}>{allOpen ? "Collapse All" : "Expand All"}</button>;
  return (
    <div className="asst-lore">
      {(label || all) && <div className="asst-lore-bar">{label}{all}</div>}
      {list.map((x, i) => {
        const e = asEntry(x, i);
        const title = String(x.title ?? x.name ?? "").trim() || (e?.keys[0] ?? "") || "Untitled entry";
        const keys = e?.keys ?? (Array.isArray(x.keys) ? x.keys.map(String) : []);
        const content = String(x.content ?? "");
        const isOpen = open.has(i);
        const place = e && e.position !== "before" ? placeShort(e) : "";
        const badges = e ? [...(e.enabled ? [] : ["off"]), ...(place ? [place] : []), ...badgesOf(e), ...(e.order !== 100 ? [`order ${e.order}`] : []), ...(e.triggers.length ? [`only on ${e.triggers.join(", ")}`] : [])] : [];
        return (
          <div key={i} className={`asst-lore-e${isOpen ? " open" : ""}${e && !e.enabled ? " off" : ""}`} data-testid="assistant-lore-entry">
            <button type="button" className="asst-lore-head" aria-expanded={isOpen} onClick={() => toggle(i)}>
              <span className={`te-chev${isOpen ? " open" : ""}`} aria-hidden><Icon name="chevron" size={12} /></span>
              {e && <PlaceIcon kind={kindOf(e.position).kind} size={15} />}
              <span className="asst-lore-t">{title}</span>
              <span className="lore-keys asst-lore-keys">
                {e?.constant && <span className="lore-key always">Always On</span>}
                {keys.map((k) => <span key={k} className={`lore-key${k.startsWith("/") ? " re" : ""}`}>{k}</span>)}
                {!e?.constant && !keys.length && <span className="lore-key warn">No keywords</span>}
              </span>
            </button>
            {!isOpen && content && <p className="asst-lore-peek">{content}</p>}
            <Collapse open={isOpen}>
              <div className="asst-lore-body">
                {content ? <div className="asst-lore-text">{content}</div> : <p className="hint">No text.</p>}
                {badges.length > 0 && <div className="asst-lore-badges">{badges.map((b) => <span key={b} className="lore-badge">{b}</span>)}</div>}
              </div>
            </Collapse>
          </div>
        );
      })}
    </div>
  );
}

function LoreEntryEdit({ x, onPatch }: { x: Obj; onPatch: (p: Obj) => void }) {
  // the keywords as typed ("a, b, "), so a comma can be written; the entry gets the list
  const [keys, setKeys] = useState(() => keysText(x.keys));
  return (
    <div className="asst-lore-e open edit">
      <span>Title</span><input className="asst-lore-title-in" value={String(x.title ?? "")} aria-label="Title" onChange={(e) => onPatch({ title: e.target.value })} />
      <span>Keywords</span><input value={keys} placeholder={x.constant ? "Always on: none needed" : "Separated by commas"} aria-label="Keywords" onChange={(e) => { setKeys(e.target.value); onPatch({ keys: keysOf(e.target.value) }); }} />
      <span>Text</span><AutoText value={String(x.content ?? "")} aria-label="Text" onChange={(e) => onPatch({ content: e.target.value })} />
    </div>
  );
}

/**
 * A new item waiting for the user, shown open: each field with where it came from, Keep / Edit / Discard, and for a
 * character or persona made from a comic, Use a Panel as Portrait (a page, cropped).
 */
export function NewItemCard({ r, pages, onAct, onChange, renderValue }: {
  r: NewItem; pages: PagePicture[]; onAct: (w: "apply" | "discard") => void; onChange: (next: NewItem) => void;
  renderValue: (name: string, value: unknown) => ReactNode;
}) {
  const data = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
  const [editing, setEditing] = useState<Obj | null>(null);
  const [choosing, setChoosing] = useState(false);
  const all = Object.values(r.sources ?? {});
  const portrait = (r.kind === "character" || r.kind === "persona") && pages.length > 0;
  const usePage = async (p: PagePicture) => {
    setChoosing(false);
    const bytes = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
    const file = await cropImage(new File([bytes], p.name, { type: p.mime }), "portrait");
    if (!file) return;
    onChange({ ...r, picture: { mime: file.type || p.mime, base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())) } });
  };
  const waiting = r.status === "waiting";
  return (
    <div className="asst-dcard asst-newitem" data-testid="assistant-new-item">
      <div className="asst-dcard-h"><b>New {KIND_ONE[r.kind]}</b><small className={waiting ? "wait" : r.status === "applied" ? "ok-text" : ""}>{waiting ? "waiting for you" : r.status === "applied" ? "saved" : "discarded"}</small>
        {all.length > 0 && <span className="asst-src right">from {all.length === 1 ? all[0] : "the pages"}</span>}</div>
      <div className="asst-newitem-body">
        <h5>{String(data.name ?? r.name)}</h5>
        <NewItemFields r={r} editing={editing} onEditing={setEditing} renderValue={renderValue} />
        {portrait && (
          <div className="asst-newitem-f">
            <span className="asst-newitem-n">Portrait</span>
            <div className="asst-portrait">
              {r.picture && <img src={`data:${r.picture.mime};base64,${r.picture.base64}`} alt="Portrait" />}
              {waiting && <button type="button" className="asst-desc-btn" onClick={() => setChoosing(!choosing)} data-testid="assistant-panel-portrait">{r.picture ? "Choose Another Panel…" : "Use a Panel as Portrait…"}</button>}
            </div>
            {choosing && <div className="asst-pagepick" role="listbox" aria-label="Pick a page">
              {pages.map((p, i) => <button key={p.id} type="button" role="option" aria-selected={false} onClick={() => void usePage(p)} title={p.name}><img src={`data:${p.mime};base64,${p.base64}`} alt="" /><span>p. {i + 1}</span></button>)}
            </div>}
          </div>
        )}
      </div>
      {waiting && <div className="asst-dcard-acts">
        {editing ? <>
          <Button small variant="prominent" onClick={() => { onChange({ ...r, data: { ...data, ...editing } }); setEditing(null); }}>Save Edits</Button>
          <Button small variant="plain" onClick={() => setEditing(null)}>Cancel</Button>
        </> : <>
          <Button small variant="prominent" onClick={() => onAct("apply")} data-testid="assistant-keep">Keep</Button>
          <Button small onClick={() => setEditing({})}>Edit</Button>
          <Button small variant="plain" onClick={() => onAct("discard")}>Discard</Button>
          <span className="hint">Nothing is saved until you choose.</span>
        </>}
      </div>}
    </div>
  );
}
