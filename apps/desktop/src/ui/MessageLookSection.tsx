// Homunculus 2 — how messages look (D-061), shown in Settings → Customize → Messages (D-075). Author: CLAUDE, 2026-11-01.
import { setMessageLook, useMessageLook } from "../messageLook.ts";
import { activeLook, setTweaks, useAppearance } from "../theme/appearance.ts";
import { Button, Row, Segmented, Switch } from "./kit.tsx";
import { MessageText } from "./MessageText.tsx";

const SAMPLE = `*Lyra lowers her bow, eyes still on the trees.* "You're late. **Very** late."\n<font color="#8fb8ff">The wind carries a whisper from the north.</font> [A map](https://example.com/map)`;

/** The look's own color (its token, not the user's), as #rrggbb for the color input (D-075, D-088). */
function themeColor(token: string, lookValue: string | undefined, fallback: string): string {
  if (lookValue && /^#[0-9a-f]{6}$/i.test(lookValue)) return lookValue;
  const v = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(token).trim();
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
  // D-088: the colors belong to the look that is on; every other look keeps its own
  const app = useAppearance();
  const on = activeLook(app);
  const mine = app.tweaks[on.id] ?? {};
  return (
    <div data-testid="settings-messages-body">
        <div className="row row-wide"><div className="look-preview msg"><div className="text prose"><MessageText text={SAMPLE} /></div></div></div>
        <Row label="Formatting (Markdown)" help="*italics* for narration, **bold**, lists and quotes, like SillyTavern.">
          <Switch label="Formatting (Markdown)" checked={look.markdown} onChange={(markdown) => void setMessageLook({ markdown })} />
        </Row>
        <Row label="Dialogue color" help={`Text between quotes (“…”, "…", «…») in its own color. A color you pick is for the ${on.name} look only; “Theme's” goes back to its own.`}>
          <ColorPick label="Dialogue color" value={mine.dialogue ?? ""} fallback={themeColor("--dialogue", on.tokens.dialogue, "#e6bf7e")} onChange={(v) => void setTweaks(on.id, { dialogue: v || undefined })} />
          <Switch label="Color dialogue" checked={look.dialogue} onChange={(dialogue) => void setMessageLook({ dialogue })} />
        </Row>
        <Row label="Narration color" help={`The color of *italic* text. A color you pick is for the ${on.name} look only.`}>
          <ColorPick label="Narration color" value={mine.narration ?? ""} fallback={themeColor("--narration", on.tokens.narration, "#a8a8a8")} onChange={(v) => void setTweaks(on.id, { narration: v || undefined })} />
        </Row>
        <Row label="Links" help="Links in messages and cards open in your web browser, never inside the app. Off = shown as plain text.">
          <Switch label="Links" checked={look.links} onChange={(links) => void setMessageLook({ links })} />
        </Row>
        <Row label="Images from links" help="Some cards and replies show pictures from web addresses. Loading one tells that site you opened it, so by default you click to see each one.">
          <Segmented small label="Images from links" value={look.images} onChange={(images) => void setMessageLook({ images })}
            options={[{ value: "ask", label: "Click to Show" }, { value: "always", label: "Always" }, { value: "never", label: "Never" }]} />
        </Row>
        <Row label="Colors and styles from the AI" help="Shows HTML/CSS layouts, text styles and animations in chat messages. Scripts stay off, and linked images follow the option above. Regex scripts' formatting is always shown.">
          <Switch label="Colors and styles from the AI" checked={look.html} onChange={(html) => void setMessageLook({ html })} />
        </Row>
    </div>
  );
}
