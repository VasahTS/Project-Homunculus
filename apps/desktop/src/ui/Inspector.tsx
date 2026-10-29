// Homunculus 2 — the inspector: one floating panel with tabs, beside the story. Author: CLAUDE, 2026-10-27 (D-018).
// Scene = trackers at the message on screen · Prompt = connection, preset and sampling · Reply = the receipt of one reply.
// New tabs (Agents, Notes…) plug in here. 2026-10-28 (D-023): the tab body slides in from the side of the tab you came from.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Segmented } from "./kit.tsx";
import { EASE_OUT, reducedMotion } from "./motion.ts";

export type InspectorTab = "scene" | "prompt" | "reply";
const ORDER: InspectorTab[] = ["scene", "prompt", "reply"];

export function Inspector({ tab, onTab, scene, prompt, reply }: {
  tab: InspectorTab; onTab: (t: InspectorTab) => void; scene: ReactNode; prompt: ReactNode; reply: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const prev = useRef(tab);
  useLayoutEffect(() => {
    const from = ORDER.indexOf(prev.current);
    const to = ORDER.indexOf(tab);
    prev.current = tab;
    if (from === to || reducedMotion() || !body.current?.animate) return;
    body.current.scrollTop = 0;
    body.current.animate([{ opacity: 0, transform: `translateX(${to > from ? 14 : -14}px)` }, { opacity: 1, transform: "none" }], { duration: 360, easing: EASE_OUT });
  }, [tab]);
  return (
    <aside className="inspector glass" aria-label="Inspector" data-region="inspector">
      <div className="inspector-tabs">
        <Segmented tabs label="Inspector" value={tab} onChange={onTab} options={[
          { value: "scene", label: "Scene", testId: "tab-scene" },
          { value: "prompt", label: "Prompt", testId: "tab-prompt" },
          { value: "reply", label: "Reply", testId: "tab-reply" },
        ]} />
      </div>
      <div className="inspector-body" role="tabpanel" ref={body}>
        {tab === "scene" ? scene : tab === "prompt" ? prompt : reply}
      </div>
    </aside>
  );
}
