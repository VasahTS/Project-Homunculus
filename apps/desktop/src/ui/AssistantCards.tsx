// Homunculus 2 — the Assistant's decision cards (D-115). Author: CLAUDE, 2026-11-10.
// Approved draft: docs/drafts/vision-comic (boards 5–7): "What I Understood" with a pencil per part, Merge…, See Details
// and Looks Right; questions with buttons, one at a time; a new item shown field by field with where each part came
// from, Keep / Edit / Discard, and Use a Panel as Portrait.
import { useState, type ReactNode } from "react";
import type { AssistantKind, AssistantResult } from "@homunculus/schemas";
import { answersMessage, mergeCastOn, type Question, type Understood } from "../assistant/cards.ts";
import { AutoText, Button, Icon } from "./kit.tsx";
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
const KIND_ONE: Record<AssistantKind, string> = { character: "Character", persona: "Persona", lorebook: "Lorebook", tracker: "Tracker", kit: "Story Kit", narrator: "Narrator", preset: "Preset", cue: "Cue" };

/**
 * A new item waiting for the user, shown open: each field with where it came from, Keep / Edit / Discard, and for a
 * character or persona made from a comic, Use a Panel as Portrait (a page, cropped).
 */
export function NewItemCard({ r, pages, onAct, onChange, renderValue }: {
  r: NewItem; pages: PagePicture[]; onAct: (w: "apply" | "discard") => void; onChange: (next: NewItem) => void;
  renderValue: (name: string, value: unknown) => ReactNode;
}) {
  const data = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [choosing, setChoosing] = useState(false);
  const shown = Object.entries(data).filter(([k, v]) => k !== "name" && k !== "folder" && v !== "" && v != null && !(Array.isArray(v) && !v.length));
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
        {shown.map(([k, v]) => (
          <div className="asst-newitem-f" key={k}>
            <span className="asst-newitem-n">{labelOf(k)}{r.sources?.[k] && <span className="asst-src">{r.sources[k]}</span>}</span>
            {editing && typeof v === "string"
              ? <AutoText value={editing[k] ?? v} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} aria-label={labelOf(k)} />
              : <div className="asst-newitem-v">{renderValue(k, v)}</div>}
          </div>
        ))}
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
