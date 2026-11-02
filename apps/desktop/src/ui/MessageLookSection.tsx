// Homunculus 2 — how messages look (D-061), shown in Settings → Customize → Messages (D-075). Author: CLAUDE, 2026-11-01.
import { setMessageLook, useMessageLook } from "../messageLook.ts";
import { Button, Row, Segmented, Switch } from "./kit.tsx";
import { MessageText } from "./MessageText.tsx";

const SAMPLE = `*Lyra lowers her bow, eyes still on the trees.* "You're late. **Very** late."\n<font color="#8fb8ff">The wind carries a whisper from the north.</font> [A map](https://example.com/map)`;

/** The look's own color, as #rrggbb for the color input (D-075). */
function themeColor(name: string, fallback: string): string {
  const v = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

function ColorPick({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <span className="look-color">
      <input type="color" aria-label={label} value={value || fallback} onChange={(e) => onChange(e.target.value)} />
      {value ? <Button small variant="plain" onClick={() => onChange("")}>Theme's</Button> : <span className="hint">Theme's</span>}
    </span>
  );
}

/** The message rows; they live in Settings → Customize → Messages since D-075 (they were the Messages tab). */
export function MessageLookRows() {
  const look = useMessageLook();
  return (
    <div data-testid="settings-messages-body">
        <div className="row row-wide"><div className="look-preview msg"><div className="text prose"><MessageText text={SAMPLE} /></div></div></div>
        <Row label="Formatting (Markdown)" help="*italics* for narration, **bold**, lists and quotes, like SillyTavern.">
          <Switch label="Formatting (Markdown)" checked={look.markdown} onChange={(markdown) => void setMessageLook({ markdown })} />
        </Row>
        <Row label="Dialogue color" help={'Text between quotes (“…”, "…", «…») in its own color.'}>
          <ColorPick label="Dialogue color" value={look.dialogueColor} fallback={themeColor("--dialogue", "#e6bf7e")} onChange={(dialogueColor) => void setMessageLook({ dialogueColor })} />
          <Switch label="Color dialogue" checked={look.dialogue} onChange={(dialogue) => void setMessageLook({ dialogue })} />
        </Row>
        <Row label="Narration color" help="The color of *italic* text.">
          <ColorPick label="Narration color" value={look.narrationColor} fallback={themeColor("--narration", "#a8a8a8")} onChange={(narrationColor) => void setMessageLook({ narrationColor })} />
        </Row>
        <Row label="Links" help="Links in messages and cards open in your web browser, never inside the app. Off = shown as plain text.">
          <Switch label="Links" checked={look.links} onChange={(links) => void setMessageLook({ links })} />
        </Row>
        <Row label="Images from links" help="Some cards and replies show pictures from web addresses. Loading one tells that site you opened it, so by default you click to see each one.">
          <Segmented small label="Images from links" value={look.images} onChange={(images) => void setMessageLook({ images })}
            options={[{ value: "ask", label: "Click to show" }, { value: "always", label: "Always" }, { value: "never", label: "Never" }]} />
        </Row>
        <Row label="Colors and styles from the AI" help="Lets the AI color and style its own text (<font color>, <span style>, <b>…), as presets often ask. Only text styles: it can never run code, load anything or change the app. Regex scripts' formatting is always shown.">
          <Switch label="Colors and styles from the AI" checked={look.html} onChange={(html) => void setMessageLook({ html })} />
        </Row>
    </div>
  );
}
