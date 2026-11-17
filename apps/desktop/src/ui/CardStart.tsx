// Homunculus 2 — "From a card…" on a story's (or Kit's) "How it starts" (D-095). Author: CLAUDE, 2026-11-07.
// Daniel: "in Stories, can you make it possible to pick the greetings of each card in Characters? Copying and pasting
// every time, or asking the Assistant, felt odd; the same with the scenario".
// The big "Add…" window (Picker, D-036) in its browse mode: every card on the left (the story's own first), and on the
// right the card's scenario and greetings, each with its own button, so several can be taken without closing it.
// D-138: each opening has its own scenario. A scenario goes to the opening open on the page; a greeting comes in as a
// new opening with its card's (or version's) scenario, or, when the card has none, a copy of the open opening's.
import { storyOpenings, type Avatar, type Character, type Folder, type Story } from "@homunculus/schemas";
import { cardTextForStory, effectiveCharacter } from "@homunculus/core";
import { Button } from "./kit.tsx";
import { Picker, type PickItem } from "./Picker.tsx";

interface Version {
  id: string | null; label: string; name: string; greetings: string[];
  /** The version's own scenario (empty when it uses the main one): shown once in the Scenario list. */
  scenario: string;
  /** The scenario its greetings come with (D-138): its own, else the card's main one. */
  greetingScenario: string;
}

/** The card's main version, and each variant that has greetings or a scenario of its own. */
function versionsOf(c: Character): Version[] {
  const main = effectiveCharacter(c, null);
  const out: Version[] = [{ id: null, label: "", name: main.name, greetings: main.firstMessages.filter((m) => m.trim()), scenario: main.scenario.trim(), greetingScenario: main.scenario.trim() }];
  for (const v of c.variants) {
    const own = v.overrides;
    if (!own.firstMessages && own.scenario === undefined) continue;
    const e = effectiveCharacter(c, v.id);
    out.push({ id: v.id, label: v.label, name: e.name, greetings: own.firstMessages ? e.firstMessages.filter((m) => m.trim()) : [], scenario: own.scenario !== undefined ? e.scenario.trim() : "", greetingScenario: e.scenario.trim() });
  }
  return out;
}

/** A greeting taken as a new opening; no scenario = the card has none (the page copies the open opening's). */
export interface CardOpening { text: string; scenario?: string }

export function CardStartPicker({ story, characters, avatars, folders, tab, onAddOpenings, onScenario, onClose }: {
  story: Story; characters: Character[]; avatars: Record<string, Avatar>;
  /** The opening open on the page (0-based): a scenario taken here becomes its scenario. */
  tab: number;
  /** The Characters folders, so the window shows them like "+ Add a Card" does. */
  folders?: { folders: Folder[]; map: Record<string, string> } | undefined;
  onAddOpenings: (openings: CardOpening[]) => void;
  onScenario: (text: string) => void;
  onClose: () => void;
}) {
  const narratorId = story.narrator.kind === "card" ? story.narrator.characterId : null;
  const inStory = [...(narratorId ? [narratorId] : []), ...story.cast.flatMap((m) => (m.characterId && m.role !== "narrator" ? [m.characterId] : []))];
  const openings = new Set(story.openings.map((o) => o.text.trim()));
  const current = storyOpenings(story)[tab]?.scenario ?? (story.openings.length ? "" : story.scenario);
  const scenario = current.trim();
  const which = `opening ${tab + 1}'s scenario`;
  const asOpening = (v: { greetingScenario: string }, g: string): CardOpening => (v.greetingScenario ? { text: g, scenario: v.greetingScenario } : { text: g });

  const texts = (c: Character) => versionsOf(c).map((v) => ({
    ...v,
    greetings: v.greetings.map((g) => cardTextForStory(g, v.name, c.id === narratorId)),
    scenario: cardTextForStory(v.scenario, v.name, c.id === narratorId),
    greetingScenario: cardTextForStory(v.greetingScenario, v.name, c.id === narratorId),
  }));

  const detail = (c: Character) => {
    const vs = texts(c);
    const scenarios = vs.filter((v) => v.scenario);
    const greetings = vs.flatMap((v) => v.greetings.map((g, i) => ({ v, g, i })));
    const missing = greetings.filter((x) => !openings.has(x.g.trim()));
    return (
      <div className="cs-detail" data-testid="card-start-detail">
        {scenarios.length > 0 && (
          <section className="cs-sec" aria-label="Scenario">
            <h4>Scenario</h4>
            {scenarios.map((v) => {
              const already = scenario.includes(v.scenario);
              return (
                <div key={v.id ?? "main"} className="cs-item">
                  {v.label && <span className="cs-label">{v.label}</span>}
                  <p className="cs-text">{v.scenario}</p>
                  <div className="cs-actions">
                    {already ? <span className="ok-text">✓ In {which}</span> : <>
                      <Button small onClick={() => onScenario(v.scenario)}>{scenario ? `Replace ${which}` : `Use as ${which}`}</Button>
                      {scenario && <Button small variant="plain" onClick={() => onScenario(`${current.trimEnd()}\n\n${v.scenario}`)}>Add below</Button>}
                    </>}
                  </div>
                </div>
              );
            })}
          </section>
        )}
        {greetings.length > 0 && (
          <section className="cs-sec" aria-label="Greetings">
            <h4>Greetings <small className="hint">{greetings.length}</small>
              {missing.length > 1 && <Button small variant="plain" onClick={() => onAddOpenings(missing.map((x) => asOpening(x.v, x.g)))}>Add all {missing.length}</Button>}</h4>
            {greetings.map(({ v, g, i }) => (
              <div key={`${v.id ?? "main"}:${i}`} className="cs-item">
                <span className="cs-label">{i === 0 ? "First message" : `Greeting ${i}`}{v.label ? ` · ${v.label}` : ""}</span>
                <p className="cs-text">{g}</p>
                <div className="cs-actions">
                  {openings.has(g.trim()) ? <span className="ok-text">✓ An opening</span>
                    : <Button small onClick={() => onAddOpenings([asOpening(v, g)])} aria-label={`Add ${i === 0 ? "the first message" : `greeting ${i}`}${v.label ? ` (${v.label})` : ""} as an opening`}>Add as an opening</Button>}
                </div>
              </div>
            ))}
          </section>
        )}
        <p className="hint">{greetings.length > 0 ? (greetings.some((x) => x.v.greetingScenario) ? "A greeting comes in as a new opening with its card's scenario. " : `A greeting comes in as a new opening with a copy of ${which}. `) : ""}
          {c.id === narratorId ? "This card tells the story: its {{char}} stays as it is." : `{{char}} becomes “${vs[0]!.name}” in the story (there it would mean the narrator). {{user}} stays.`}</p>
      </div>
    );
  };

  const items: PickItem[] = characters.map((c) => {
    const vs = versionsOf(c);
    const n = vs.reduce((s, v) => s + v.greetings.length, 0);
    const hasScenario = vs.some((v) => v.scenario);
    return {
      id: c.id, name: c.name, avatar: avatars[c.id], tags: c.tags,
      line: [n ? `${n} greeting${n === 1 ? "" : "s"}` : "", hasScenario ? "scenario" : "", inStory.includes(c.id) ? (c.id === narratorId ? "tells it" : "in the story") : ""].filter(Boolean).join(" · ") || "No greetings or scenario",
      detail: detail(c),
    };
  });
  const empty = characters.filter((c) => !versionsOf(c).some((v) => v.greetings.length || v.scenario)).map((c) => c.id);

  return (
    <Picker title="From a card" onClose={onClose} kinds={[{
      key: "cards", label: "Cards", action: "Add its greetings", browse: true,
      folders: folders?.folders ?? [], map: folders?.map ?? {},
      recent: inStory, recentLabel: "In this story",
      exclude: empty, excludeNote: "No greetings or scenario",
      onPick: (id) => {
        const c = characters.find((x) => x.id === id);
        if (!c) return;
        const vs = texts(c);
        const missing = vs.flatMap((v) => v.greetings.filter((g) => !openings.has(g.trim())).map((g) => asOpening(v, g)));
        if (missing.length) onAddOpenings(missing);
        else if (!scenario && vs[0]?.scenario) onScenario(vs[0].scenario);
      },
      items,
    }]} />
  );
}
