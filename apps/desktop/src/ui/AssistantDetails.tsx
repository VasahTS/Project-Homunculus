// Homunculus 2 — Assistant → Details: the panel beside the conversation (D-062, round 3). Author: CLAUDE, 2026-11-01.
// After Flint's Details: Context (how full, by part, compaction), What it is using (model, assistant, preset lines and
// memory — each marked when it was really in the last request), Files, Tools (switches), Activity (the tool timeline).
import { useEffect, useState, type ReactNode } from "react";
import type { AssistantChat, AssistantMessage, AssistantSettings } from "@homunculus/schemas";
import { resolveFor, TOOL_GROUPS } from "../assistant/engine.ts";
import { Icon, Switch } from "./kit.tsx";

const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
const PART: Record<string, string> = { app: "App rules", assistant: "Assistant", preset: "Preset", tools: "Tools", chat: "Messages and results" };

function Section({ title, icon, children, aside, open: start = true, testId }: { title: string; icon: string; children: ReactNode; aside?: ReactNode; open?: boolean; testId?: string }) {
  const [open, setOpen] = useState(start);
  // opens by itself when it gets something to show (files attached, a reply running)
  useEffect(() => { if (start) setOpen(true); }, [start]);
  return (
    <section className="det-sec" data-testid={testId}>
      <header className="det-head">
        <button type="button" className="det-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="det-ic" aria-hidden>{icon}</span><span>{title}</span>
        </button>
        {aside}
        <button type="button" className="det-chev" onClick={() => setOpen(!open)} aria-label={open ? `Fold ${title}` : `Unfold ${title}`}><Icon name="chevron" size={12} /></button>
      </header>
      {open && <div className="det-body">{children}</div>}
    </section>
  );
}

const Sent = ({ on, off = "Not in the last request" }: { on: boolean; off?: string }) =>
  <span className={`det-sent${on ? " on" : ""}`}>{on ? "● In the last request" : `○ ${off}`}</span>;

export function AssistantDetails({ chat, live, settings, modelName, modelFrom, onSettings, onChat, onCompact, compacting, onCustomize, onClose }: {
  chat: AssistantChat | null; live: AssistantMessage | null; settings: AssistantSettings; modelName: string; modelFrom: string;
  onSettings: (s: AssistantSettings) => void; onChat: (c: AssistantChat) => void; onCompact: () => void; compacting: boolean;
  onCustomize: (tab: "assistants" | "presets" | "limits" | "usage") => void; onClose: () => void;
}) {
  const { assistant, preset } = resolveFor(chat, settings);
  const replies = chat?.messages.filter((m) => m.role === "assistant") ?? [];
  const last = live ?? replies.at(-1);
  const used = [...replies].reverse().find((m) => m.used)?.used;
  const sent = new Set(used?.sent ?? []);
  const total = used?.lastPrompt ?? (used?.parts ? Object.values(used.parts).reduce((a, b) => a + b, 0) : 0);
  const estimated = !used?.lastPrompt;
  const ctx = chat?.contextLength;
  const pct = ctx && total ? Math.min(100, Math.round((total / ctx) * 100)) : null;
  const spent = replies.reduce((a, m) => ({ tin: a.tin + (m.used?.tokensIn ?? 0), tout: a.tout + (m.used?.tokensOut ?? 0), cost: a.cost + (m.used?.cost ?? 0) }), { tin: 0, tout: 0, cost: 0 });
  const cut = chat?.compact ? chat.messages.findIndex((m) => m.id === chat.compact!.uptoId) : -1;
  const atts = (chat?.messages ?? []).flatMap((m, i) => m.attachments.map((a) => ({ a, gone: i <= cut })));
  const readCount = (id: string) => (chat?.messages ?? []).reduce((n, m) => n + m.steps.filter((s) => s.args.includes(id)).length, 0);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  return (
    <aside className="det" aria-label="Details" data-testid="assistant-details">
      <header className="det-top"><b>Details</b><button type="button" className="det-x" onClick={onClose} aria-label="Hide details"><Icon name="close" size={13} /></button></header>

      <Section title="Context" icon="◔" testId="det-context">
        <div className="det-ctx-line"><b>{total ? `${estimated ? "~" : ""}${fmtK(total)}` : "—"}</b><span>{ctx ? `of ${fmtK(ctx)} (${pct}%)` : "used in the last request"}</span></div>
        <div className="det-meter"><i style={{ width: `${pct ?? Math.min(100, Math.round((total / 75_000) * 100))}%` }} className={pct !== null && pct > 80 ? "hot" : ""} /></div>
        {used?.parts && <div className="det-parts">{Object.entries(used.parts).filter(([, n]) => n > 0).map(([k, n]) => <div key={k}><span>{PART[k] ?? k}</span><b>{fmtK(n)}</b></div>)}</div>}
        {!ctx && <p className="det-hint">Pick the model with Browse… (model menu) to know the context size.</p>}
        {estimated && total > 0 && <p className="det-hint">Estimated: the service did not report the prompt size.</p>}
        <div className="det-row"><span>Compact by itself at 80%</span>{chat && <Switch label="Auto-compact" checked={chat.autoCompact} onChange={(autoCompact) => onChat({ ...chat, autoCompact })} />}</div>
        {chat?.compact
          ? <div className="det-compact"><span>Older messages are sent as a summary{chat.compact.before ? ` (was ~${fmtK(chat.compact.before)})` : ""}.</span>
            <span className="det-links"><button className="link" onClick={() => setShowSummary(!showSummary)}>{showSummary ? "Hide summary" : "Show summary"}</button>
              <button className="link" onClick={() => { const { compact: _c, ...rest } = chat; onChat(rest as AssistantChat); }}>Undo</button></span>
            {showSummary && <p className="det-summary">{chat.compact.summary}</p>}</div>
          : chat && chat.messages.filter((m) => m.role === "user").length > 2 && <button type="button" className="link" disabled={compacting} onClick={onCompact} data-testid="det-compact-now">{compacting ? "Compacting…" : "Compact now"}</button>}
        <div className="det-kv"><span>This chat</span><b>{spent.tin || spent.tout ? `${fmtK(spent.tin)} in · ${fmtK(spent.tout)} out` : "tokens not reported"}</b><span>Cost</span><b>{spent.cost ? `$${spent.cost.toFixed(3)}` : "not reported"}</b></div>
      </Section>

      <Section title="What it is using" icon="✦" testId="det-using">
        <div className="det-item"><div className="det-item-h">Model</div><b>{modelName}</b><small>{modelFrom}</small><Sent on={!!used} off="Not sent yet" /><button className="link" onClick={() => onCustomize("limits")}>Limits</button></div>
        <div className="det-item"><div className="det-item-h">Instructions</div><b>{assistant.emoji} {assistant.name}</b><small>{chat?.assistantId ? "This chat" : "Default assistant"} · ~{fmtK(Math.round(assistant.instructions.length / 3.6))} tokens + app rules</small><Sent on={!!used} off="Not sent yet" /><button className="link" onClick={() => onCustomize("assistants")}>Edit assistant</button></div>
        {preset ? <>
          <div className="det-item"><div className="det-item-h">Preset</div><b>📘 {preset.name}</b><small>{chat?.presetId ? "This chat" : "Default preset"}</small><button className="link" onClick={() => onCustomize("presets")}>Manage preset</button></div>
          {preset.style.trim() && <div className="det-line"><span className="det-line-t">How I like it written</span><span className="det-line-x">{preset.style}</span><Sent on={!!used} /></div>}
          {preset.rules.filter((r) => r.text.trim()).map((r) => <div key={r.id} className={`det-line${r.on ? "" : " off"}`}><span className="det-line-t">Rule</span><span className="det-line-x">{r.text}</span>{r.on ? <Sent on={sent.has(r.id)} /> : <span className="det-sent">○ Off</span>}</div>)}
          {preset.notes.filter((n) => n.text.trim()).map((n) => <div key={n.id} className={`det-line${n.on ? "" : " off"}`}><span className="det-line-t">{n.title || "Note"}</span><span className="det-line-x">{n.text}</span>{n.on ? <Sent on={sent.has(n.id)} /> : <span className="det-sent">○ Off</span>}</div>)}
          <div className="det-item-h sub">Memory{!preset.memoryOn && " (off)"}</div>
          {preset.memory.length === 0 && <p className="det-hint">Nothing remembered yet. Say “remember …” in a chat.</p>}
          {preset.memory.map((m) => <div key={m.id} className={`det-line${preset.memoryOn ? "" : " off"}`}><span className="det-line-x">{m.text}</span><small>{m.from ? `from “${m.from}”` : "added by you"}</small>{preset.memoryOn ? <Sent on={sent.has(m.id)} /> : <span className="det-sent">○ Off</span>}</div>)}
        </> : <div className="det-item"><div className="det-item-h">Preset</div><b>None</b><button className="link" onClick={() => onCustomize("presets")}>Presets</button></div>}
      </Section>

      <Section title={`Files${atts.length ? ` (${atts.length})` : ""}`} icon="📎" testId="det-files" open={atts.length > 0}>
        {atts.length === 0 && <p className="det-hint">Nothing attached. Use @ Add context or the clip.</p>}
        {atts.map(({ a, gone }) => (
          <div key={a.id} className={`det-file${gone ? " off" : ""}`}>
            {a.type === "image" ? <img src={`data:${a.mime};base64,${a.base64}`} alt="" /> : <span className="det-file-ic">{a.type === "item" ? "◯" : "📄"}</span>}
            <span className="det-file-t"><b>{a.name}</b><small>{a.type === "item" ? `${a.kind} from your library` : a.type === "file" ? a.summary : `${a.mime} · picture`}</small>
              <small>{gone ? "Summed up (compacted)" : a.type === "image" ? "Sent with the newest messages" : readCount(a.id) ? `Read ${readCount(a.id)} time(s)` : "Not read yet"}</small></span>
          </div>
        ))}
      </Section>

      <Section title="Tools" icon="⚙" testId="det-tools" open={false}>
        {TOOL_GROUPS.map((g) => (
          <div key={g.id} className="det-tool">
            <span className="det-file-t"><b>{g.label}</b><small>{g.help}</small></span>
            <Switch label={g.label} disabled={g.id === "read"} checked={!settings.toolsOff.includes(g.id)}
              onChange={(on) => onSettings({ ...settings, toolsOff: on ? settings.toolsOff.filter((x) => x !== g.id) : [...settings.toolsOff, g.id] })} />
          </div>
        ))}
        <p className="det-hint">Applies to every chat. Search the web is the default: 🌐 Web in the message box changes it for one chat.</p>
      </Section>

      <Section title="Activity" icon="⏱" testId="det-activity" open={!!live || !!last?.steps.length}>
        {!last?.steps.length && <p className="det-hint">{last ? "The last reply used no tools." : "Nothing yet."}</p>}
        {last?.steps.map((s, i) => (
          <div key={i} className={`det-step${s.error ? " bad" : ""}`}>
            <button type="button" className="det-step-h" onClick={() => setOpenStep(openStep === i ? null : i)} aria-expanded={openStep === i}>
              <span className="det-step-dot" aria-hidden>{s.label === "…" ? "◌" : s.error ? "!" : "✓"}</span><span className="det-step-l">{s.label}</span><small>{s.ms !== undefined ? `${(s.ms / 1000).toFixed(1)} s` : ""}</small>
            </button>
            {openStep === i && <div className="det-step-b"><small>{s.name} — input</small><pre>{pretty(s.args)}</pre><small>Result</small><pre>{s.result.length > 3000 ? `${s.result.slice(0, 3000)}…` : s.result || "…"}</pre></div>}
          </div>
        ))}
        {last?.used?.calls ? <p className="det-hint">{last.used.calls} call(s) to the model · {((last.used.ms ?? 0) / 1000).toFixed(1)} s in all</p> : null}
      </Section>
    </aside>
  );
}

function pretty(s: string): string { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } }
