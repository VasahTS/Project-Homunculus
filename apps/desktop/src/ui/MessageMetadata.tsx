// Date/time and per-message text/reasoning counts, following Daniel's v1 reference. Author: CODEX, 2026-11-03.
import { useEffect, useState } from "react";
import type { GenerationRecord, Message } from "@homunculus/schemas";
import type { AppServices } from "../core-instance.ts";
import { messageTokenCounts } from "./message-metadata.ts";

const date = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" });
const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const number = new Intl.NumberFormat();

export function MessageTime({ at }: { at: number }) {
  const value = new Date(at);
  if (!Number.isFinite(value.getTime())) return null;
  return <time className="message-time" dateTime={value.toISOString()} data-testid="message-time"><span>{date.format(value)}</span>{" "}<span>· {time.format(value)}</span></time>;
}

export function MessageMetadata({ svc, message, position, showNumber = true, showTokens = true }: { svc: AppServices; message: Message; position: number; showNumber?: boolean; showTokens?: boolean }) {
  const [saved, setSaved] = useState<{ id: string; content: string; record?: GenerationRecord; edited: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    if (message.speaker.kind === "user" || message.speaker.kind === "system") return;
    void Promise.all([svc.store.getGenerationRecord(message.id), svc.store.listRevisions(message.id)])
      .then(([record, revisions]) => {
        if (live) setSaved({ id: message.id, content: message.content, record,
          edited: revisions.length > 0 || typeof message.meta.beforeRegex === "string" || !!record?.agents.inline?.length });
      }).catch(() => { if (live) setSaved(null); });
    return () => { live = false; };
  }, [svc, message.id, message.content, message.speaker.kind, message.meta.beforeRegex]);
  const current = saved?.id === message.id && saved.content === message.content ? saved : null;
  const counts = messageTokenCounts(message, current?.record, current?.edited);
  return <div className="message-metadata" data-testid="message-metadata">
    {showNumber && <span data-testid="message-number">#{position}</span>}
    {showTokens && <><span data-testid="message-text-tokens" title={counts.textEstimated ? "Estimated tokens in the message text" : "Text tokens reported by the provider, excluding reasoning"}>Text {counts.textEstimated ? "~" : ""}{number.format(counts.text)}t</span>
    {(counts.reasoning > 0 || !!message.reasoning) && <span className="message-reasoning-count" data-testid="message-reasoning-tokens"
      title={counts.reasoningEstimated ? "Estimated tokens in the reasoning text" : "Reasoning tokens reported by the provider"}>Reasoning {counts.reasoningEstimated ? "~" : ""}{number.format(counts.reasoning)}t</span>}</>}
  </div>;
}
