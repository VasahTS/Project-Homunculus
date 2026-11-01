// Homunculus 2 — a character's greetings: the first message and the alternates (D-070). Author: CLAUDE, 2026-11-01.
// Greeting 1 is the main one; in a new chat the others are swipes of it. Three looks, one per editor layout:
// "list" (Sheet: list + editor/preview), "strip" (Tabs: cards + editor beside a chat preview), "inline" (Writer: blocks).
import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { estimateTokens } from "@homunculus/core";
import { MessageText } from "./MessageText.tsx";
import { FieldLabel } from "./Versions.tsx";
import { Segmented } from "./kit.tsx";

export type GreetingsLook = "list" | "strip" | "inline";

/** "~N tokens", or nothing for an empty text. */
export const tokensText = (t: string) => (t.trim() ? `~${estimateTokens(t).toLocaleString()} tokens` : "");

/** A textarea that grows with its text (the Writer layout has no boxes and no inner scroll). */
export function AutoText({ inputRef, value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; inputRef?: (el: HTMLTextAreaElement | null) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; };
  useLayoutEffect(fit, [value]);
  useEffect(() => { window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); }, []);
  return <textarea rows={1} {...rest} value={value} ref={(el) => { ref.current = el; inputRef?.(el); }} />;
}

const HELP = "How a new chat with this character opens. Greeting 1 is shown first; the others are swipes of it, so you can flip to another opening. Imported and exported with the card (SillyTavern's first message and alternate greetings).";

export function Greetings({ value, onChange, look, name, avatarSrc, changed, onReset }: {
  value: string[];
  onChange: (next: string[]) => void;
  look: GreetingsLook;
  /** The character's name and picture, for the chat preview. */
  name: string;
  avatarSrc?: string;
  changed: boolean;
  onReset: () => void;
}) {
  const list = value.length ? value : [""];
  const [picked, setPicked] = useState(0);
  const cur = Math.min(picked, list.length - 1);
  const [preview, setPreview] = useState(false);
  const [armed, setArmed] = useState(-1);
  const boxes = useRef<Record<number, HTMLTextAreaElement | null>>({});
  useEffect(() => { if (armed < 0) return; const t = setTimeout(() => setArmed(-1), 4000); return () => clearTimeout(t); }, [armed]);

  const put = (next: string[], pick?: number) => { onChange(next); if (pick !== undefined) setPicked(pick); setArmed(-1); };
  const edit = (k: number, text: string) => onChange(list.map((t, j) => (j === k ? text : t)));
  const add = () => { put([...list, ""], list.length); setPreview(false); requestAnimationFrame(() => boxes.current[list.length]?.focus()); };
  const duplicate = (k: number) => put([...list.slice(0, k + 1), list[k]!, ...list.slice(k + 1)], k + 1);
  const remove = (k: number) => { if (armed !== k) { setArmed(k); return; } put(list.filter((_, j) => j !== k), Math.max(0, Math.min(cur, list.length - 2))); };
  const move = (k: number, d: number) => {
    const j = k + d; if (j < 0 || j >= list.length) return;
    const n = [...list]; [n[k], n[j]] = [n[j]!, n[k]!]; put(n, j);
  };
  const makeMain = (k: number) => { const n = [...list]; const [x] = n.splice(k, 1); put([x!, ...n], 0); };
  const insertUser = (k: number) => {
    const el = boxes.current[k]; const t = list[k] ?? "";
    const s = el?.selectionStart ?? t.length; const e = el?.selectionEnd ?? s;
    edit(k, t.slice(0, s) + "{{user}}" + t.slice(e));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + 8, s + 8); });
  };

  const title = (k: number) => <>Greeting {k + 1}{k === 0 && <span className="ce-main-badge" aria-hidden>Main</span>}</>;
  const snippet = (t: string) => (t.trim() ? t.replace(/\s+/g, " ") : "Empty");
  const tools = (k: number) => (
    <div className="ce-gtools">
      <button type="button" className="btn btn-plain btn-small" title="Insert {{user}} (the person chatting)" onClick={() => insertUser(k)}>{"{{user}}"}</button>
      {k > 0 && <button type="button" className="btn btn-plain btn-small" title="Show this one first in new chats" onClick={() => makeMain(k)}>Make Main</button>}
      <button type="button" className="btn btn-plain btn-small" aria-label={`Move greeting ${k + 1} up`} disabled={k === 0} onClick={() => move(k, -1)}>↑</button>
      <button type="button" className="btn btn-plain btn-small" aria-label={`Move greeting ${k + 1} down`} disabled={k === list.length - 1} onClick={() => move(k, 1)}>↓</button>
      <button type="button" className="btn btn-plain btn-small" onClick={() => duplicate(k)}>Duplicate</button>
      {list.length > 1 && <button type="button" className={`btn btn-plain btn-small ce-danger${armed === k ? " armed" : ""}`} onClick={() => remove(k)}>{armed === k ? "Click Again to Delete" : "Delete"}</button>}
    </div>
  );
  const box = (k: number, rows: number, cls = "ce-ta prose") => (
    <textarea className={cls} rows={rows} aria-label={`Greeting ${k + 1}`} value={list[k] ?? ""} ref={(el) => { boxes.current[k] = el; }}
      placeholder={k === 0 ? "The character's opening message, e.g. *She looks up from the fire.* \"You're late.\"" : "Another way the chat can open…"}
      onChange={(e) => edit(k, e.target.value)} />
  );
  const chatPreview = (k: number) => (
    <div className="ce-msg">
      <span className="ce-msg-av">{avatarSrc ? <img src={avatarSrc} alt="" /> : (name || "?").slice(0, 1).toUpperCase()}</span>
      <div className="ce-msg-body">
        <div className="ce-msg-who">{name || "Character"}{list.length > 1 && <small>greeting {k + 1} of {list.length}</small>}</div>
        <div className="prose ce-msg-text">{(list[k] ?? "").trim()
          ? <MessageText text={(list[k] ?? "").replace(/\{\{char\}\}/gi, name || "{{char}}")} />
          : <p className="hint">Empty greeting: write how the chat opens.</p>}</div>
      </div>
    </div>
  );
  const head = <FieldLabel label="Greetings" help={HELP} changed={changed} onReset={onReset} />;

  if (look === "inline") {
    return (
      <div className="ce-greetings ce-g-inline" data-testid="greetings">
        <div className="ce-lab">{head}<span className="ce-sub">the first opens a new chat; the others are its swipes</span></div>
        {list.map((t, k) => (
          <div className="ce-gblock" key={k}>
            <div className="ce-ghead"><b>{title(k)}</b><span className="ce-tok">{tokensText(t)}</span>{tools(k)}</div>
            <AutoText className="ce-plain prose" aria-label={`Greeting ${k + 1}`} value={t} inputRef={(el) => { boxes.current[k] = el; }}
              placeholder={k === 0 ? "The character's opening message…" : "Another way the chat can open…"} onChange={(e) => edit(k, e.target.value)} />
          </div>
        ))}
        <div><button type="button" className="btn btn-plain btn-small ce-add" onClick={add}>+ Add Greeting</button></div>
      </div>
    );
  }

  if (look === "strip") {
    return (
      <div className="ce-greetings ce-g-strip" data-testid="greetings">
        <div className="ce-lab">{head}<span className="ce-sub">the first opens a new chat; the others are its swipes</span></div>
        <div className="ce-gstrip" role="group" aria-label="Pick a greeting">
          {list.map((t, k) => (
            <button type="button" aria-pressed={k === cur} aria-label={`Show greeting ${k + 1}`} key={k} className={`ce-gcard${k === cur ? " on" : ""}${t.trim() ? "" : " blank"}`} onClick={() => setPicked(k)}>
              <b>{title(k)}</b><span className="ce-snip">{snippet(t)}</span>
            </button>
          ))}
          <button type="button" className="ce-gcard add" onClick={add}>+ Add Greeting</button>
        </div>
        <div className="ce-gsplit">
          <div className="ce-gedit">{tools(cur)}{box(cur, 12)}<span className="ce-tok">{tokensText(list[cur] ?? "")}{list[cur]?.trim() ? " · sent only when the chat starts" : ""}</span></div>
          <div className="ce-gchat">
            <span className="ce-k">How it looks in a chat</span>
            {chatPreview(cur)}
            {list.length > 1 && (
              <div className="ce-swipe">
                <button type="button" aria-label="Previous greeting" onClick={() => setPicked((cur - 1 + list.length) % list.length)}>‹</button>
                <span>{cur + 1} / {list.length}</span>
                <button type="button" aria-label="Next greeting" onClick={() => setPicked((cur + 1) % list.length)}>›</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ce-greetings ce-g-list" data-testid="greetings">
      <div className="ce-lab">{head}<span className="ce-sub">the first opens a new chat; the others are its swipes</span></div>
      <div className="ce-glist" role="group" aria-label="Pick a greeting">
        {list.map((t, k) => (
          <button type="button" aria-pressed={k === cur} aria-label={`Show greeting ${k + 1}`} key={k} className={`ce-gitem${k === cur ? " on" : ""}${t.trim() ? "" : " blank"}`} onClick={() => setPicked(k)}>
            <b>{title(k)}</b><span className="ce-snip">{snippet(t)}</span>
          </button>
        ))}
        <button type="button" className="ce-gadd" onClick={add}>+ Add Greeting</button>
      </div>
      <div className="ce-gedit">
        <div className="ce-gedit-head">
          <Segmented small label="Greeting view" value={preview ? "preview" : "edit"} options={[{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview" }]}
            onChange={(x) => setPreview(x === "preview")} />
          <span className="spacer" />
          {tools(cur)}
        </div>
        {preview ? <div className="ce-gpreview">{chatPreview(cur)}</div> : box(cur, 9)}
        <div className="ce-gfoot"><span className="ce-tok">{tokensText(list[cur] ?? "")}{list[cur]?.trim() ? " · sent only when the chat starts" : ""}</span></div>
      </div>
    </div>
  );
}
