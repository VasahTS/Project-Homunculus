// Homunculus 2 — Settings → Customize (D-075): the look, its tweaks, messages, motion, and advanced (colors, extra CSS).
// Built from the approved draft `docs/drafts/neutral-look/` page 2 and the plan in docs/UI-PLAN.md ("Customize"). CLAUDE, 2026-11-01.
import { useEffect, useRef, useState } from "react";
import {
  ACCENTS, activeLook, allLooks, copyLook, deleteLook, exportLook, importLook, isBuiltin, resetTweaks, saveLook, setActiveLook,
  setMotion, setTweaks, useAppearance, useSafeMode, type MotionSpeed,
} from "../theme/appearance.ts";
import { BUILTIN_PROFILES, type AppearanceProfile } from "../theme/themes.ts";
import { saveExport } from "../files.ts";
import { revealLook } from "./motion.ts";
import { Button, Group, Icon, Row, Segmented, Switch } from "./kit.tsx";
import { MessageLookRows } from "./MessageLookSection.tsx";

/** Token groups shown in Edit colors, with plain names (D-075). */
const TOKEN_GROUPS: Array<{ title: string; tokens: Array<[string, string]> }> = [
  { title: "Window and panels", tokens: [["window", "Window"], ["surface", "Panels and cards"], ["field", "Text boxes"], ["pop", "Menus"], ["separator", "Lines"]] },
  { title: "Text", tokens: [["label", "Text"], ["label-2", "Secondary text"], ["label-3", "Faint text"]] },
  { title: "Accent and status", tokens: [["accent", "Accent"], ["accent-ink", "Text on the accent"], ["ok", "Done"], ["warn", "Warning"], ["danger", "Danger"]] },
];
const CORNERS: Array<{ value: string; label: string }> = [{ value: "0", label: "Square" }, { value: "0.5", label: "Soft" }, { value: "1", label: "Round" }];

const rootValue = (name: string): string =>
  typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
const hex6 = (v: string): string | null => (/^#[0-9a-f]{6}$/i.test(v) ? v : /^#[0-9a-f]{3}$/i.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join("")}` : null);
/** What a look's preview card is drawn with: its own tokens over Graphite's. */
const swatch = (p: AppearanceProfile, name: string, fallback: string): string => p.tokens[name] ?? fallback;

function LookCard({ look, on, onPick, onDuplicate, onExport, onDelete }: {
  look: AppearanceProfile; on: boolean; onPick: (at: { x: number; y: number }) => void; onDuplicate: () => void; onExport: () => void; onDelete?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const win = swatch(look, "window", "#1b1c1f");
  return (
    <div className={`look-card${on ? " on" : ""}`} data-testid="look-card" ref={box}>
      <button type="button" className="look-pick" role="radio" aria-checked={on} onClick={(e) => onPick({ x: e.clientX, y: e.clientY })} aria-label={look.name}>
        <span className="lookcard-preview" style={{ background: win }} aria-hidden>
          <span className="look-side" style={{ background: swatch(look, "glass", swatch(look, "surface", "#26282c")), borderColor: swatch(look, "separator", "transparent") }} />
          <span className="look-lines">
            <i style={{ width: "70%", background: swatch(look, "label", "#e0e0e0") }} />
            <i style={{ width: "90%", background: swatch(look, "label-3", "#8a8a92") }} />
            <i style={{ width: "38%", background: swatch(look, "accent", "#62b6a4") }} />
          </span>
        </span>
        <span className="look-meta"><b>{look.name}</b><small>{isBuiltin(look.id) ? "Built in" : "Yours"}</small></span>
      </button>
      <button type="button" className="look-more" aria-label={`More for ${look.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="dots" size={16} /></button>
      {menu && (
        <div className="look-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onDuplicate(); }}>Duplicate</button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onExport(); }}>Export</button>
          {onDelete && <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); onDelete(); }}>Delete</button>}
        </div>
      )}
    </div>
  );
}

function TokenRow({ name, label, value, onChange }: { name: string; label: string; value: string; onChange?: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const h = hex6(text);
  return (
    <label className="token-row" data-testid={`token-${name}`}>
      <span className="token-swatch" style={{ background: text }} aria-hidden>
        {onChange && h && <input type="color" aria-label={`${label} color`} value={h} onChange={(e) => { setText(e.target.value); onChange(e.target.value); }} />}
      </span>
      <span className="token-name">{label}</span>
      {onChange
        ? <input className="token-value" aria-label={label} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)}
            onBlur={() => { if (text.trim() && text !== value) onChange(text.trim()); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        : <code className="token-value">{value}</code>}
    </label>
  );
}

export function CustomizeSection({ notify }: { notify: (title: string, lines?: string[]) => void }) {
  const st = useAppearance();
  const safe = useSafeMode();
  const look = activeLook(st);
  const tweaks = st.tweaks[look.id] ?? {};
  const builtin = isBuiltin(look.id);
  const [undo, setUndo] = useState<{ from: string; to: string } | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  const file = useRef<HTMLInputElement>(null);
  const [css, setCss] = useState(look.css ?? "");
  useEffect(() => setCss(look.css ?? ""), [look.id, look.css]);
  // values are read from the window after the look is applied
  const [, redraw] = useState(0);
  useEffect(() => { redraw((n) => n + 1); }, [st]);

  const pick = (id: string, at?: { x: number; y: number }) => {
    if (id === look.id) return;
    setUndo({ from: look.id, to: id });
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), 6000);
    revealLook(() => void setActiveLook(id), at);
  };
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const doExport = async (p: AppearanceProfile) => {
    const where = await saveExport({ fileName: `${p.name.replace(/[\\/:*?"<>|]+/g, "_")}.look.json`, mime: "application/json", bytes: new TextEncoder().encode(exportLook(p)) });
    if (where) notify(`“${p.name}” exported`, [where]);
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    try { const l = await importLook(await f.text()); notify(`“${l.name}” imported and switched on`); }
    catch (e) { notify("Couldn't import this look", [e instanceof Error ? e.message : String(e)]); }
  };
  /** The first change to a built-in look's colors or CSS makes an editable copy. */
  const editable = async (): Promise<AppearanceProfile> => (builtin ? copyLook(look) : look);
  const setToken = async (name: string, value: string) => { const l = await editable(); await saveLook({ ...l, tokens: { ...l.tokens, [name]: value } }); };
  const saveCss = async () => { if (css === (look.css ?? "")) return; const l = await editable(); await saveLook({ ...l, css }); };

  const palette = [...new Set([BUILTIN_PROFILES.find((p) => p.id === look.id)?.tokens.accent ?? look.tokens.accent ?? rootValue("accent"), ...ACCENTS].map((c) => c.toLowerCase()))];
  const accent = (tweaks.accent ?? rootValue("accent")).toLowerCase();
  const motionOffBySystem = st.motion.on && st.motion.followSystem && typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="settings-page customize" data-testid="settings-customize-body">
      <Group title="Look" help="Each look brings its colors, fonts and corners. It changes the whole app at once; nothing you wrote changes."
        aside={<><Button small variant="bordered" onClick={() => file.current?.click()}>Import Look…</Button>
          <input ref={file} type="file" accept=".json,application/json" hidden aria-label="Look file" onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ""; }} /></>}>
        <div className="look-grid" role="radiogroup" aria-label="Look">
          {allLooks(st).map((p) => (
            <LookCard key={p.id} look={p} on={p.id === look.id} onPick={(at) => pick(p.id, at)}
              onDuplicate={() => void copyLook(p, `${p.name} (copy)`)} onExport={() => void doExport(p)}
              onDelete={isBuiltin(p.id) ? undefined : () => { void deleteLook(p.id); notify(`“${p.name}” deleted`); }} />
          ))}
        </div>
        {undo && (
          <div className="look-undo" role="status">
            <span>Switched to {allLooks(st).find((p) => p.id === undo.to)?.name}</span>
            <Button small variant="plain" onClick={(e) => { const from = undo.from; revealLook(() => void setActiveLook(from), { x: e.clientX, y: e.clientY }); setUndo(null); }}>Undo</Button>
          </div>
        )}
        {safe && <p className="hint look-safe">This look's extra CSS is off until the app restarts (Ctrl+Shift+0 turns it back on).</p>}
      </Group>

      <Group title={`Tweaks for ${look.name}`} help="Kept for this look only. They never change the look itself."
        aside={<Button small variant="plain" onClick={() => void resetTweaks(look.id)} disabled={!Object.keys(tweaks).length}>Reset {look.name}</Button>}>
        <Row label="Accent" help="The main button, the selection, links. Text on it turns black or white by itself.">
          <span className="accent-swatches" role="radiogroup" aria-label="Accent">
            {palette.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={accent === c} aria-label={c} title={c}
                className={`accent-swatch${accent === c ? " on" : ""}`} style={{ background: c }} onClick={() => void setTweaks(look.id, { accent: c })} />
            ))}
            <label className="accent-custom" title="Another color">
              <input type="color" aria-label="Another accent color" value={hex6(accent) ?? "#f2f2f2"} onChange={(e) => void setTweaks(look.id, { accent: e.target.value })} />
              <Icon name="plus" size={14} />
            </label>
          </span>
        </Row>
        <Row label="Story font" help="The face of messages and story text.">
          <Segmented small label="Story font" value={tweaks.storyFont ?? "prose"} onChange={(storyFont) => void setTweaks(look.id, { storyFont })}
            options={[{ value: "prose", label: "Literata" }, { value: "ui", label: "Interface font" }]} />
        </Row>
        <Row label="Story text size">
          <span className="size-row">
            <input type="range" min={14} max={20} step={0.5} aria-label="Story text size" value={tweaks.storySize ?? 16.5}
              onChange={(e) => void setTweaks(look.id, { storySize: Number(e.target.value) })} />
            <span className="tabular">{(tweaks.storySize ?? 16.5).toFixed(1)} px</span>
          </span>
        </Row>
      </Group>

      <Group title="Messages" help="How the text of messages is drawn (was Settings → Messages). Nothing here changes what is saved or what the AI is sent.">
        <MessageLookRows />
      </Group>

      <Group title="Motion" help="Titles that rise, cascades, sliding tabs. Every look uses the same motion.">
        <Row label="Animations">
          <Switch label="Animations" checked={st.motion.on} onChange={(on) => void setMotion({ on })} />
        </Row>
        <Row label="Speed">
          <Segmented small label="Motion speed" value={st.motion.speed} onChange={(speed: MotionSpeed) => void setMotion({ speed })}
            options={[{ value: "calm", label: "Calm" }, { value: "normal", label: "Normal" }, { value: "quick", label: "Quick" }]} />
        </Row>
        <Row label="Follow the system's “reduce motion”" help="When Windows asks apps for less animation, everything here stops.">
          <Switch label="Follow the system's reduce motion" checked={st.motion.followSystem} onChange={(followSystem) => void setMotion({ followSystem })} />
        </Row>
        {motionOffBySystem && <p className="hint">Windows is asking for less animation, so motion is off now.</p>}
      </Group>

      <Group title="Advanced">
        <details className="cz-adv" data-testid="edit-colors">
          <summary>Edit colors</summary>
          {builtin && <p className="hint">{look.name} is built in and stays as it is: your first change makes a copy, “{look.name} (edited)”, and switches to it.</p>}
          {!builtin && (
            <label className="token-row">
              <span className="token-swatch" aria-hidden />
              <span className="token-name">Name</span>
              <input className="token-value" aria-label="Look name" defaultValue={look.name} key={look.id}
                onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== look.name) void saveLook({ ...look, name }); }} />
            </label>
          )}
          {TOKEN_GROUPS.map((g) => (
            <div key={g.title} className="token-group">
              <h4>{g.title}</h4>
              {g.tokens.map(([name, label]) => <TokenRow key={`${look.id}:${name}`} name={name} label={label} value={look.tokens[name] ?? rootValue(name)} onChange={(v) => void setToken(name, v)} />)}
            </div>
          ))}
          <div className="token-group">
            <h4>Shape</h4>
            <div className="token-row">
              <span className="token-swatch" aria-hidden />
              <span className="token-name">Corners</span>
              <Segmented small label="Corners" value={CORNERS.find((c) => c.value === (look.tokens.round ?? "1"))?.value ?? "1"} onChange={(v) => void setToken("round", v)} options={CORNERS} />
            </div>
          </div>
        </details>
        <details className="cz-adv" data-testid="extra-css">
          <summary>Extra CSS</summary>
          <textarea className="cz-css" aria-label="Extra CSS" spellCheck={false} value={css} onChange={(e) => setCss(e.target.value)} onBlur={() => void saveCss()}
            placeholder={'/* Reaches only the app\'s stable regions: app, sidebar, toolbar, story, message, composer, inspector, library, editor */\n[data-region="message"] { max-width: 680px; }'} />
          <p className="hint">Saved with this look when you leave the box, and exported with it. If it breaks the screen, Ctrl+Shift+0 turns it off until the app restarts.</p>
        </details>
      </Group>
    </div>
  );
}
