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
        <Row label="Formatting (Markdown)" help="Supports *italics*, **bold**, lists and quotes.">
          <Switch label="Formatting (Markdown)" checked={look.markdown} onChange={(markdown) => void setMessageLook({ markdown })} />
        </Row>
        <Row label="Dialogue color" help={`Quoted text. Colors are saved for the ${on.name} look.`}>
          <ColorPick label="Dialogue color" value={mine.dialogue ?? ""} fallback={themeColor("--dialogue", on.tokens.dialogue, "#e6bf7e")} onChange={(v) => void setTweaks(on.id, { dialogue: v || undefined })} />
          <Switch label="Color dialogue" checked={look.dialogue} onChange={(dialogue) => void setMessageLook({ dialogue })} />
        </Row>
        <Row label="Narration color" help="Italic text.">
          <ColorPick label="Narration color" value={mine.narration ?? ""} fallback={themeColor("--narration", on.tokens.narration, "#a8a8a8")} onChange={(v) => void setTweaks(on.id, { narration: v || undefined })} />
        </Row>
        <Row label="Links" help="Opens links in your browser. Off shows plain text.">
          <Switch label="Links" checked={look.links} onChange={(links) => void setMessageLook({ links })} />
        </Row>
        <Row label="Images from links" help="Loading an image contacts its host. Click to Show asks before loading.">
          <Segmented small label="Images from links" value={look.images} onChange={(images) => void setMessageLook({ images })}
            options={[{ value: "ask", label: "Click to Show" }, { value: "always", label: "Always" }, { value: "never", label: "Never" }]} />
        </Row>
        <Row label="Colors and styles from the AI" help="Shows AI-generated HTML, CSS and animations. Scripts stay disabled. Image settings still apply. Regex formatting always displays.">
          <Switch label="Colors and styles from the AI" checked={look.html} onChange={(html) => void setMessageLook({ html })} />
        </Row>
    </div>
  );
}
