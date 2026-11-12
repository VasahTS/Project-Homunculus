// Homunculus 2 — inspector "Reply" tab: the receipt of one reply. Author: CLAUDE, 2026-10-27 (D-018).
// Everything here is already kept per message by the core (BLUEPRINT §2.4): the generation record (what
// was sent, with which settings, how long it took), the agent runs, and the world state before and after.
import { ReplyLorebooks } from "./LorePanels.tsx";
import { useEffect, useRef, useState } from "react";
import type { AgentRun, GenerationRecord, Message, Session, SetupLayer, TrackerSchema } from "@homunculus/schemas";
import { applyBasicMacros, castOf, userInStory, type ProviderDefinition, DEFAULT_USER_NAME, effectivePersona, formatFieldValue, trackerPeople, type ResolvedState } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import type { Tracker } from "../trackers.ts";
import { fieldSetOf } from "../trackers.ts";
import { Button, Group, Icon, Row } from "./kit.tsx";
import { categoryColor, sourceInfo, type SourceCategory } from "./promptSources.ts";
import { PromptSheet } from "./PromptSheet.tsx";
import { useEnter } from "./motion.ts";

interface Receipt {
  message: Message;
  record?: GenerationRecord;
  runs: AgentRun[];
  before: ResolvedState;
  after: ResolvedState;
  cast: Array<{ id: string; name: string }>;
  /** False in Director mode: the user is not one of the people (D-031). */
  withUser: boolean;
  /** Who was in the story for this reply, in words ("Lyra (Modern)", "Sir Dan (Knight)"). */
  who?: { cast: string[]; persona: string };
  presetName?: string;
}

/** Rough token count when the service didn't report one (about 4 characters per token). */
export const approxTokens = (text: string) => Math.ceil(text.length / 4);
export const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function ReplyPane({ providers, svc, session, storySetup, messageId, trackers, connection, refreshKey, busy, running, onRun }: {
  providers: ProviderDefinition[]; svc: AppServices; session: Session; storySetup?: SetupLayer | undefined; messageId: string | null; trackers: Tracker[]; connection: ConnectionState; refreshKey: number;
  busy: boolean; running: string | null; onRun: (agentIds: string[], messageId: string) => void;
}) {
  const [r, setR] = useState<Receipt | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  useEnter(paneRef, `${messageId}:${r ? "y" : "n"}`, ":scope > section", { y: 8, stagger: 40 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!messageId) { setR(null); return; }
      const message = await svc.store.getMessage(messageId);
      if (!message) { setR(null); return; }
      const [record, runs, before, after, cast, withUser] = await Promise.all([
        svc.store.getGenerationRecord(messageId), svc.store.listAgentRuns(messageId),
        svc.core.state.resolve(session.id, message.parentId), svc.core.state.resolve(session.id, messageId), castOf(svc.store, session),
        userInStory(svc.store, session),
      ]);
      let who: Receipt["who"];
      if (record?.who) {
        const names = await Promise.all(record.who.cast.map(async (m) => {
          const c = m.characterId ? await svc.store.getCharacter(m.characterId) : undefined;
          if (!c) return "Narrator";
          const v = m.variantId ? c.variants.find((x) => x.id === m.variantId) : undefined;
          return v ? `${c.name} (${v.label})` : c.name;
        }));
        const p = record.who.personaId ? await svc.store.personas.get(record.who.personaId) : undefined;
        const pv = p && record.who.personaVariantId ? p.variants.find((x) => x.id === record.who!.personaVariantId) : undefined;
        who = { cast: names, persona: p ? `${effectivePersona(p, pv?.id).name}${pv ? ` (${pv.label})` : ""}` : `none (“${DEFAULT_USER_NAME}”)` };
      }
      const presetName = record?.presetId ? (await svc.store.presets.get(record.presetId))?.name ?? "(deleted preset)" : undefined;
      if (!cancelled) setR({ message, record, runs, before, after, cast, withUser, who, presetName });
    })();
    return () => { cancelled = true; };
  }, [svc, session, messageId, refreshKey]);

  if (!messageId || !r) return <div className="pane" data-testid="reply-pane"><p className="pane-note">Select a reply's details to inspect it.</p></div>;
  if (!r.record) return <div className="pane" data-testid="reply-pane"><p className="pane-note">No generation details for this message.</p></div>;

  const rec = r.record;
  const groups = new Map<string, { label: string; category: SourceCategory; tokens: number }>();
  for (const p of rec.prompt) {
    const info = sourceInfo(p.source, trackers);
    const g = groups.get(info.label) ?? { label: info.label, category: info.category, tokens: 0 };
    g.tokens += approxTokens(p.content);
    groups.set(info.label, g);
  }
  const parts = [...groups.values()].sort((a, b) => b.tokens - a.tokens);
  const approxTotal = parts.reduce((s, g) => s + g.tokens, 0);
  const total = rec.tokensIn ?? approxTotal;
  const params = rec.params as { temperature?: number; topP?: number; maxTokens?: number };
  const changes = groupChanges(diffState(r.before, r.after, trackers, session, r.cast, storySetup, r.withUser));
  const changeCount = changes.reduce((n, t) => n + t.count, 0);

  return (
    <div className="pane" data-testid="reply-pane" ref={paneRef}>
      <section className="stat-strip" aria-label="This reply at a glance">
        <span className="stat"><strong className="tabular">{rec.tokensIn ? fmtTokens(total) : `~${fmtTokens(total)}`}</strong><span>tokens read</span></span>
        <span className="stat"><strong className="tabular">{rec.tokensOut ? fmtTokens(rec.tokensOut) : `~${fmtTokens(approxTokens(r.message.content))}`}</strong><span>written</span></span>
        <span className="stat"><strong className="tabular">{(rec.durationMs / 1000).toFixed(1)}s</strong><span>time</span></span>
        <span className="stat"><strong className="tabular">{r.runs.length}</strong><span>agent{r.runs.length === 1 ? "" : "s"}</span></span>
      </section>

      <Group title="What changed" testId="reply-changes" aside={changeCount ? <span className="tabular">{changeCount} value{changeCount === 1 ? "" : "s"}</span> : undefined}
        help="Changes from this reply. Expand a character to see its first recorded values.">
        {changes.length === 0 && <Row wide><span className="hint">Nothing in the scene changed with this reply.</span></Row>}
        {changes.map((t) => (
          <div key={t.tracker} className="chg-tracker">
            <div className="chg-tracker-head"><strong>{t.tracker}</strong><span className="hint">{summaryOf(t.filled, t.changed)}</span></div>
            {t.subjects.map((sub) => (
              <details key={sub.who ?? "_"} className="chg-who" open={t.count <= 6 || (sub.changed > 0 && sub.changed <= 6)}>
                <summary>
                  <span className="chg-who-name">{sub.who ?? "Scene"}</span>
                  <span className="hint">{summaryOf(sub.filled, sub.changed)}</span>
                  <span className="spacer" />
                  <span className="chev" aria-hidden><Icon name="chevron" size={12} /></span>
                </summary>
                <ul className="chg-list">
                  {sub.items.map((c, i) => (
                    <li key={i} className="chg">
                      <span className="chg-field">{c.field}</span>
                      <span className="chg-val">
                        {c.from === "—" ? <span className="tag new">new</span> : <><span className="chg-from">{c.from}</span><span className="chg-arrow" aria-label="to">→</span></>}
                        <span className="chg-to">{c.to}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        ))}
      </Group>

      {rec.lore && <ReplyLorebooks lore={rec.lore} />}
      {rec.cues?.length ? <ReplyCues cues={rec.cues} /> : null}

      <Group title="Agents after the reply" testId="reply-agents">
        {r.runs.length === 0 && <Row wide><span className="hint">No agents ran for this reply.</span></Row>}
        {r.runs.map((run) => (
          <Row key={run.id} label={<><span className={`status-dot ${run.status}`} />{agentName(run.agentId, trackers)}</>}>
            <span className="run-meta">
              <span className="tabular">{(run.durationMs / 1000).toFixed(1)} s{run.tokensIn || run.tokensOut ? `, ${fmtTokens((run.tokensIn ?? 0) + (run.tokensOut ?? 0))} tok` : ""}</span>
              <Button variant="plain" small disabled={busy} onClick={() => onRun([run.agentId], r.message.id)}>{running === run.agentId ? "Running…" : "Run Again"}</Button>
            </span>
          </Row>
        ))}
        {r.runs.filter((x) => x.error).map((x) => <Row key={`e-${x.id}`} wide><span className="run-error">{agentName(x.agentId, trackers)}: {x.error}</span></Row>)}
      </Group>

      <Group title="What was sent" aside={<span data-testid="sent-total">{rec.tokensIn ? `${total.toLocaleString()} tokens` : `about ${fmtTokens(total)} tokens`}</span>}
        help="Prompt sources. Token counts are estimated unless reported by the provider.">
        <Row wide>
          <span className="stack-bar" aria-hidden>
            {parts.map((g) => <span key={g.label} style={{ flexGrow: Math.max(g.tokens, 1), background: categoryColor(g.category) }} />)}
          </span>
        </Row>
        <Row wide>
          <ul className="legend compact">
            {parts.map((g) => (
              <li key={g.label} className="legend-item static">
                <span className="key-dot" style={{ background: categoryColor(g.category) }} />
                <span className="legend-label">{g.label}</span>
                <span className="tabular">{fmtTokens(g.tokens)}</span>
              </li>
            ))}
          </ul>
        </Row>
        {rec.budget && (
          <Row label="Context" help="Estimated prompt usage, reply allowance and omitted messages.">
            <span className="tabular" data-testid="reply-budget">
              {fmtTokens(rec.budget.used)}{rec.budget.limit ? ` of ${fmtTokens(rec.budget.limit)}` : ""}{rec.budget.reserved ? ` (+${fmtTokens(rec.budget.reserved)} for the reply)` : ""}
              {rec.budget.droppedMessages ? ` · ${rec.budget.droppedMessages} older message(s) left out` : ""}
            </span>
          </Row>
        )}
        {rec.promptNotes?.filter((n) => !(rec.memory && n.startsWith("Memory"))).map((n, i) => <Row key={i} wide><span className="hint warn-text" data-testid="reply-note">{n}</span></Row>)}
        <Row wide>
          <Button small onClick={() => setPromptOpen(true)}><Icon name="eye" size={13} />Open the Full Prompt</Button>
        </Row>
      </Group>
      {rec.memory && <MemoryReceipt m={rec.memory} />}
      {promptOpen && (
        <PromptSheet title="Prompt of This Reply" testId="reply-prompt" trackers={trackers} parts={rec.prompt} budget={rec.budget} notes={rec.promptNotes}
          meta={<>{r.presetName ? <>preset <strong>{r.presetName}</strong> · </> : null}{rec.providerId === "offline-test" ? "offline test AI" : rec.model}</>}
          onClose={() => setPromptOpen(false)} />
      )}

      <Group title="Settings used" help="Settings at the time of this reply.">
        {rec.connectionId && <Row label="Connection"><span data-testid="reply-connection">{connection.byId.get(rec.connectionId)?.name ?? "(deleted connection)"}</span></Row>}
        <Row label="AI"><span>{providers.find((p) => p.id === rec.providerId)?.name ?? rec.providerId}</span></Row>
        {rec.providerId !== "offline-test" && <Row label="Model"><span>{rec.model}</span></Row>}
        {r.presetName && <Row label="Preset"><span data-testid="reply-preset">{r.presetName}</span></Row>}
        {r.who && <Row label="Characters"><span data-testid="reply-cast">{r.who.cast.join(", ")}</span></Row>}
        {r.who && <Row label="You played as"><span data-testid="reply-persona">{r.who.persona}</span></Row>}
        <Row label="Temperature"><span className="tabular">{params.temperature ?? "default"}</span></Row>
        <Row label="Top P"><span className="tabular">{params.topP ?? "default"}</span></Row>
        <Row label="Max length"><span className="tabular">{params.maxTokens ?? "default"}</span></Row>
        <Row label="Time"><span className="tabular">{(rec.durationMs / 1000).toFixed(1)} s{rec.tokensOut ? `, ${rec.tokensOut.toLocaleString()} tokens written` : ""}</span></Row>
      </Group>
    </div>
  );
}

const summaryOf = (filled: number, changed: number) =>
  [changed ? `${changed} changed` : "", filled ? (changed ? `${filled} new` : `${filled} value${filled === 1 ? "" : "s"} filled in`) : ""].filter(Boolean).join(" · ");

interface Change { tracker: string; who: string | null; field: string; from: string; to: string }

/** Tracker → person (or the scene) → its changes, with how many were new values vs real changes. */
function groupChanges(list: Change[]) {
  const out: Array<{ tracker: string; count: number; filled: number; changed: number; subjects: Array<{ who: string | null; filled: number; changed: number; items: Change[] }> }> = [];
  for (const c of list) {
    let t = out.find((x) => x.tracker === c.tracker);
    if (!t) { t = { tracker: c.tracker, count: 0, filled: 0, changed: 0, subjects: [] }; out.push(t); }
    let sub = t.subjects.find((x) => x.who === c.who);
    if (!sub) { sub = { who: c.who, filled: 0, changed: 0, items: [] }; t.subjects.push(sub); }
    sub.items.push(c);
    const isNew = c.from === "—";
    t.count++; if (isNew) { t.filled++; sub.filled++; } else { t.changed++; sub.changed++; }
  }
  // real changes first: a person with something that moved comes before people only filled in
  for (const t of out) t.subjects.sort((a, b) => Number(b.changed > 0) - Number(a.changed > 0));
  return out;
}

function agentName(id: string, trackers: Tracker[]): string {
  return trackers.find((t) => t.agent.id === id)?.agent.name ?? id;
}

/** Human-readable changes between two states, using tracker field labels and character names when known. */
function diffState(before: ResolvedState, after: ResolvedState, trackers: Tracker[], session: Session, cast: Array<{ id: string; name: string }>, storySetup?: SetupLayer, withUser = true) {
  const out: Change[] = [];
  const show = (v: unknown) => (v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));
  for (const ns of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[ns] ?? {};
    const a = after[ns] ?? {};
    const t = trackers.find((x) => x.agent.id === ns);
    const schema: TrackerSchema | undefined = t ? (t.sets.find((s) => s.id === fieldSetOf(session, ns, storySetup)) ?? t.sets.find((s) => s.id === t.agent.state?.schemaId) ?? t.sets[0]) : undefined;
    const people = schema ? trackerPeople(schema, a, cast, DEFAULT_USER_NAME, withUser) : [];
    for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
      if (JSON.stringify(b[key]) === JSON.stringify(a[key])) continue;
      const f = schema?.fields.find((x) => x.key === key);
      const label = applyBasicMacros(f?.label ?? key, { char: "the character", user: DEFAULT_USER_NAME });
      const fmt = (v: unknown) => (f ? formatFieldValue(f, v) : show(v));
      if (f && f.scope !== "global") {
        const bm = (b[key] ?? {}) as Record<string, unknown>;
        const am = (a[key] ?? {}) as Record<string, unknown>;
        for (const who of new Set([...Object.keys(bm), ...Object.keys(am)])) {
          if (JSON.stringify(bm[who]) === JSON.stringify(am[who])) continue;
          const name = people.find((p) => p.id === who)?.name ?? who.replace(/^n:/, "");
          out.push({ tracker: t?.agent.name ?? ns, who: name, field: label, from: fmt(bm[who]), to: fmt(am[who]) });
        }
      } else out.push({ tracker: t?.agent.name ?? ns, who: null, field: label, from: fmt(b[key]), to: fmt(a[key]) });
    }
  }
  return out;
}

/** What memory sent with this reply (D-083): simple summaries, or what smart recall chose and why. CLAUDE, 2026-11-04. */
export function MemoryReceipt({ m }: { m: NonNullable<GenerationRecord["memory"]> }) {
  const smart = m.mode === "smart";
  const aside = smart && !m.fallback
    ? `${m.picked?.length ?? 0} of ${m.chapters} chapters${m.quotes ? ` · ${m.quotes} quote${m.quotes === 1 ? "" : "s"}` : ""}`
    : `${m.sent} summar${m.sent === 1 ? "y" : "ies"}`;
  return (
    <Group title={smart ? "Memory · smart" : "Memory"} testId="reply-memory" aside={<span data-testid="reply-memory-aside">{aside}</span>}
      help={smart ? "Selected chapters and quotes. Includes the newest chapter and merged summaries." : "Chapter summaries replaced their covered messages."}>
      <Row label="Stood in for" help="Older messages the summaries replaced in this prompt."><span className="tabular">{m.covered} message{m.covered === 1 ? "" : "s"}</span></Row>
      {smart && m.fallback && <Row wide><span className="hint warn-text" data-testid="reply-memory-fallback">Every summary went instead: {m.fallback}</span></Row>}
      {smart && !m.fallback && <>
        <Row label="Decided by"><span className="tabular">{m.decider}{m.ms !== undefined ? ` · ${(m.ms / 1000).toFixed(1)} s` : ""}{m.questions ? ` · ${m.questions} question${m.questions === 1 ? "" : "s"}${m.cached ? ` (${m.cached} reused)` : ""}` : ""}</span></Row>
        {!!m.layers && <Row label="Merged summaries" help="Short summaries of old stretches, always sent."><span className="tabular">{m.layers}</span></Row>}
        <Row wide>
          <ul className="memory-picked" data-testid="reply-memory-picked">
            {m.picked?.map((c, i) => <li key={i}><span>{c.title}</span><span className="hint tabular">{c.p === undefined ? "latest, always" : `${Math.round(c.p * 100)}%`}</span></li>)}
          </ul>
        </Row>
        {m.asked !== undefined && m.asked < m.chapters - 1 && <Row wide><span className="hint">{m.chapters - 1 - m.asked} chapter(s) were left out before asking: they share fewer words with this exchange.</span></Row>}
      </>}
    </Group>
  );
}

/** What each cue read, remembered and wrote for this reply (D-113): no AI call, so this is the whole story of it. */
export function ReplyCues({ cues }: { cues: NonNullable<GenerationRecord["cues"]> }) {
  const texts = cues.reduce((n, c) => n + c.groups.reduce((k, g) => k + g.picked.length, 0), 0);
  const tokens = cues.reduce((n, c) => n + c.tokens, 0);
  const show = (x: unknown) => (x === undefined || x === null || x === "" ? "—" : typeof x === "object" ? JSON.stringify(x) : String(x));
  return (
    <Group title={`Cues · ${cues.length}`} testId="reply-cues" aside={<span className="tabular">{texts} text{texts === 1 ? "" : "s"} · {tokens} tok</span>}
      help="Rules that ran with no AI call: what they read, what they remember (before → after) and what they wrote.">
      {cues.map((c) => (
        <details key={c.cueId} className="chg-who" open={cues.length <= 2}>
          <summary><span className="chg-who-name">{c.name}</span><span className="hint">{c.skipped ? `didn't run: ${c.skipped}` : c.groups.some((g) => g.picked.length) ? `${c.tokens} tok` : "nothing this turn"}</span><span className="spacer" /><span className="chev" aria-hidden><Icon name="chevron" size={12} /></span></summary>
          {/* D-119: the same reads → remembers → writes as the cue editor's "How it works", stacked for the panel */}
          {!c.skipped && <div className="cx cx-flow stack">
            {c.signals.length > 0 && <div className="cx-col read"><h4>Reads</h4>
              {c.signals.map((s) => <div key={s.key} className="cx-it"><b>{s.key} = <span className="cx-live">{show(s.value)}</span></b>{s.detail && <span>{s.detail}</span>}</div>)}
            </div>}
            {c.values.length > 0 && <div className="cx-col mem"><h4>Remembers</h4>
              {c.values.map((v) => <div key={v.key} className="cx-it" title={v.why}><b>{v.key}</b>
                <span>{show(v.before) !== show(v.after) ? <>{show(v.before)} → </> : null}<b className="cx-mem-now">{show(v.after)}</b> · {v.why}</span></div>)}
            </div>}
            <div className="cx-col write"><h4>Writes</h4>
              {c.groups.map((g) => <div key={g.key} className="cx-it"><b>{g.name || g.key}{g.picked.length ? ` · ${g.picked.length}` : ""}</b>
                <span>{g.picked.length ? g.picked.map((x) => x.title).join(", ") : "nothing"} · {g.reason}{g.tokens ? ` · ${g.tokens} tok` : ""}</span></div>)}
            </div>
          </div>}
        </details>
      ))}
    </Group>
  );
}
