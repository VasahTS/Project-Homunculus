// Homunculus 2 — the Scenario card of a chat's Prompt tab (D-138). Author: CLAUDE, 2026-11-17.
// Daniel: "a field in the Prompt tab to see which scenario is being used right now". Each opening of a story has its own
// scenario; a chat keeps a copy on its first message, so the scenario follows the first message on screen (a swipe of
// the first message changes it; every branch below keeps it). "Edit for This Chat" changes that copy, never the story.
import { useEffect, useState } from "react";
import { Button } from "./kit.tsx";

export function PromptScenario({ scenario, from, onSave, onOpenStory }: {
  scenario: string;
  /** Where it comes from, in words: "opening 2", "written for this chat"… */
  from: string;
  onSave: (text: string) => Promise<void> | void;
  onOpenStory?: (() => void) | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(scenario);
  const [saving, setSaving] = useState(false);
  // another opening on screen (a swipe of the first message) closes the editor and shows its scenario
  useEffect(() => { setEditing(false); setText(scenario); }, [scenario, from]);
  const save = async () => {
    setSaving(true);
    try { await onSave(text); setEditing(false); } finally { setSaving(false); }
  };
  if (editing) {
    return (
      <div className="prompt-scenario" data-testid="prompt-scenario">
        <textarea className="prose-input" rows={6} aria-label="This chat's scenario" value={text} autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setEditing(false); setText(scenario); } if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save(); }} />
        <p className="hint">Changes only this chat's copy ({from}), on every branch that starts with it. The story stays as it is.</p>
        <div className="prompt-scenario-actions">
          <Button small onClick={() => { setEditing(false); setText(scenario); }}>Cancel</Button>
          <Button small variant="prominent" disabled={saving || text === scenario} onClick={() => void save()} data-testid="prompt-scenario-save">Save</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="prompt-scenario" data-testid="prompt-scenario">
      {scenario.trim()
        ? <p className="prompt-scenario-text" data-testid="prompt-scenario-text">{scenario}</p>
        : <p className="hint">No scenario: the card's own goes, if it has one.</p>}
      <p className="hint">Sent with every reply. It comes with the first message on screen: swiping that message to another opening brings that opening's scenario.</p>
      <div className="prompt-scenario-actions start">
        <button type="button" className="link" onClick={() => setEditing(true)} data-testid="prompt-scenario-edit">Edit for This Chat</button>
        {onOpenStory && <button type="button" className="link" onClick={onOpenStory}>Open the Story</button>}
      </div>
    </div>
  );
}

/** The card's one-line summary: where the scenario comes from and how it starts. */
export function scenarioSummary(scenario: string, from: string): string {
  const line = scenario.replace(/\s+/g, " ").trim();
  return line ? `${from[0]!.toUpperCase()}${from.slice(1)} · ${line.length > 60 ? `${line.slice(0, 60)}…` : line}` : `${from[0]!.toUpperCase()}${from.slice(1)} · empty`;
}
