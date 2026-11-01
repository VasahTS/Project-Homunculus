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

export function ReplyPane({ providers, svc, session, storySetup, messageId, trackers, connection, refreshKey, onChanged }: {
  providers: ProviderDefinition[]; svc: AppServices; session: Session; storySetup?: SetupLayer | undefined; messageId: string | null; trackers: Tracker[]; connection: ConnectionState; refreshKey: number; onChanged: () => void;
}) {
  const [r, setR] = useState<Receipt | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [runError, setRunError] = useState("");
  const [tick, setTick] = useState(0);
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
  }, [svc, session, messageId, refreshKey, tick]);

  if (!messageId || !r) return <div className="pane" data-testid="reply-pane"><p className="pane-note">Pick a reply's details in the story to see what went into it.</p></div>;
  if (!r.record) return <div className="pane" data-testid="reply-pane"><p className="pane-note">This message wasn’t written by the AI in this app (a greeting, your own message or an imported one), so there is nothing to show.</p></div>;

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

  const runAgain = async (agentId: string) => {
    setRunning(agentId);
    setRunError("");
    // failed runs record their reason (shown below); anything that fails before the run starts is shown here (D-057)
    try { await svc.chat.turns.runManual(session.id, agentId, r.message.id, connection.forRequest().connection, undefined, connection.forRequest().connections); }
    catch (e) { setRunError(e instanceof Error ? e.message : String(e)); }
    setRunning(null);
    setTick((x) => x + 1);
    onChanged();
  };

  return (
    <div className="pane" data-testid="reply-pane" ref={paneRef}>
      <section className="stat-strip" aria-label="This reply at a glance">
        <span className="stat"><strong className="tabular">{rec.tokensIn ? fmtTokens(total) : `~${fmtTokens(total)}`}</strong><span>tokens read</span></span>
        <span className="stat"><strong className="tabular">{rec.tokensOut ? fmtTokens(rec.tokensOut) : `~${fmtTokens(approxTokens(r.message.content))}`}</strong><span>written</span></span>
        <span className="stat"><strong className="tabular">{(rec.durationMs / 1000).toFixed(1)}s</strong><span>time</span></span>
        <span className="stat"><strong className="tabular">{r.runs.length}</strong><span>agent{r.runs.length === 1 ? "" : "s"}</span></span>
      </section>

      <Group title="What changed" testId="reply-changes" aside={changeCount ? <span className="tabular">{changeCount} value{changeCount === 1 ? "" : "s"}</span> : undefined}
        help="What the trackers (or you) changed in the scene with this reply. On the first reply everything is new, so it is folded by character: open one to see its values.">
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

      <Group title="Agents after the reply" testId="reply-agents">
        {r.runs.length === 0 && <Row wide><span className="hint">No agents ran for this reply.</span></Row>}
        {r.runs.map((run) => (
          <Row key={run.id} label={<><span className={`status-dot ${run.status}`} />{agentName(run.agentId, trackers)}</>}>
            <span className="run-meta">
              <span className="tabular">{(run.durationMs / 1000).toFixed(1)} s{run.tokensIn || run.tokensOut ? `, ${fmtTokens((run.tokensIn ?? 0) + (run.tokensOut ?? 0))} tok` : ""}</span>
              <Button variant="plain" small disabled={running !== null} onClick={() => void runAgain(run.agentId)}>{running === run.agentId ? "Running…" : "Run Again"}</Button>
            </span>
          </Row>
        ))}
        {r.runs.filter((x) => x.error).map((x) => <Row key={`e-${x.id}`} wide><span className="run-error">{agentName(x.agentId, trackers)}: {x.error}</span></Row>)}
        {runError && <Row wide><span className="run-error" role="alert">{runError}</span></Row>}
      </Group>

      <Group title="What was sent" aside={<span data-testid="sent-total">{rec.tokensIn ? `${total.toLocaleString()} tokens` : `about ${fmtTokens(total)} tokens`}</span>}
        help="Everything the AI read to write this reply, by where it came from. Counts are estimates unless the AI service reported them.">
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
          <Row label="Context" help="How much of the preset's context size this prompt used (estimated), the room kept for the reply, and how many older messages were left out to fit.">
            <span className="tabular" data-testid="reply-budget">
              {fmtTokens(rec.budget.used)}{rec.budget.limit ? ` of ${fmtTokens(rec.budget.limit)}` : ""}{rec.budget.reserved ? ` (+${fmtTokens(rec.budget.reserved)} for the reply)` : ""}
              {rec.budget.droppedMessages ? ` · ${rec.budget.droppedMessages} older message(s) left out` : ""}
            </span>
          </Row>
        )}
        {rec.promptNotes?.map((n, i) => <Row key={i} wide><span className="hint warn-text" data-testid="reply-note">{n}</span></Row>)}
        <Row wide>
          <Button small onClick={() => setPromptOpen(true)}><Icon name="eye" size={13} />Open the full prompt</Button>
        </Row>
      </Group>
      {promptOpen && (
        <PromptSheet title="Prompt of This Reply" testId="reply-prompt" trackers={trackers} parts={rec.prompt} budget={rec.budget} notes={rec.promptNotes}
          meta={<>{r.presetName ? <>preset <strong>{r.presetName}</strong> · </> : null}{rec.providerId === "offline-test" ? "offline test AI" : rec.model}</>}
          onClose={() => setPromptOpen(false)} />
      )}

      <Group title="Settings used" help="The settings of THIS reply, which may differ from the current ones.">
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
