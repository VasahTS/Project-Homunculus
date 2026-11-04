// Homunculus 2 — Home: the screen the app opens on, an "index of plates" (D-086). Author: CLAUDE, 2026-11-04.
// Daniel picked draft H3 on the canvas "Homunculus 2 — Home" ("H3 is my favorite"). Home has no sidebar: picking anything
// on it opens the app as usual (sidebar and all), and Home comes back with Ctrl+H, the Home item at the top of the
// sidebar or a click on the name "Homunculus". Esc on Home goes back to where you were.
// The art (moon over mountains, a spire) is fixed: it is never where a story's cover or a character's picture goes;
// those slots show the item's own picture, or its initials when it has none.
import { useMemo, useRef, useState } from "react";
import type { Avatar, Character, Session, Story } from "@homunculus/schemas";
import { variantAvatarId } from "@homunculus/core";
import { avatarUrl } from "../files.ts";
import { Icon } from "./kit.tsx";
import { CASCADE, useEnter } from "./motion.ts";
import type { LibraryArea } from "./Sidebar.tsx";
import panorama from "../assets/home/panorama.png";
import spire from "../assets/home/spire.png";

export interface HomeProps {
  sessions: Session[];
  stories: Story[];
  characters: Character[];
  avatars: Record<string, Avatar>;
  lastLines: Record<string, string>;
  lastTimes: Record<string, number>;
  messageCounts: Record<string, number>;
  counts: { lorebooks: number; presets: number; trackers: number; personas: number };
  /** The chat Esc goes back to, when there is one. */
  backTo: string | null;
  onBack: () => void;
  onOpenChat: (sessionId: string) => void;
  onOpenStory: (storyId: string) => void;
  onNewStory: () => void;
  onStories: () => void;
  onCharacters: () => void;
  onLibrary: (area: LibraryArea) => void;
  onCardBrowser: () => void;
  onImportFiles: (files: File[]) => void;
  onAsk: (text: string) => void;
  onSearch: () => void;
  onSettings: () => void;
}

/** "2 hours ago", "yesterday", "5 days ago"… */
export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? "a minute ago" : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "an hour ago" : `${h} hours ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** A cover or portrait slot: the item's own picture, or its initials. Never decorative art. */
function Slot({ name, avatar, className }: { name: string; avatar?: Avatar | undefined; className: string }) {
  return avatar
    ? <img className={className} src={avatarUrl(avatar)} alt="" />
    : <span className={`${className} home-initials`} aria-hidden>{initials(name)}</span>;
}

export function HomePage(p: HomeProps) {
  const grid = useRef<HTMLDivElement>(null);
  useEnter(grid, "home", ":scope > .plate", { ...CASCADE, max: 6 });
  const [ask, setAsk] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const lead = (s: Session) => p.characters.find((c) => c.id === s.cast[0]?.characterId);
  const portrait = (s: Session, c: Character | undefined) => {
    if (!c) return undefined;
    const vid = s.cast[0]?.variantId;
    return (vid ? p.avatars[variantAvatarId(c.id, vid)] : undefined) ?? p.avatars[c.id];
  };
  const storyOf = (s: Session) => (s.storyId ? p.stories.find((x) => x.id === s.storyId) : undefined);
  const storyCover = (st: Story) => p.avatars[st.id] ?? (st.narrator.kind === "card" ? p.avatars[st.narrator.characterId] : st.narrator.kind === "vault" ? p.avatars[st.narrator.id] : undefined);
  const when = (s: Session) => p.lastTimes[s.id] ?? s.createdAt;

  const last = p.sessions[0];
  // characters you chatted with, newest first: one row each, opening their newest chat
  const played = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ c: Character; s: Session }> = [];
    for (const s of p.sessions) {
      const c = lead(s);
      if (!c || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ c, s });
      if (out.length === 4) break;
    }
    return out;
  }, [p.sessions, p.characters]);
  // stories, the one played most recently first
  const stories = useMemo(() => {
    const rank = (st: Story) => { const i = p.sessions.findIndex((s) => s.storyId === st.id); return i < 0 ? Infinity : i; };
    return [...p.stories].sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt).slice(0, 3);
  }, [p.stories, p.sessions]);

  const continueCard = (() => {
    if (!last) return (
      <div className="home-continue" data-testid="home-continue">
        <div className="home-continue-text">
          <span className="home-kicker">Nothing played yet</span>
          <span className="home-continue-title">Begin a story</span>
          <span className="home-line">Start from one of your cards, from a narrator in the Vault, or from a blank page.</span>
          <div className="home-continue-actions">
            <button type="button" className="home-cta" onClick={p.onNewStory}>New Story</button>
            <button type="button" className="home-cta-ghost" onClick={p.onCharacters}>Chat with a Character</button>
          </div>
        </div>
      </div>
    );
    const st = storyOf(last);
    const c = lead(last);
    const name = st?.name ?? c?.name ?? last.title;
    const count = p.messageCounts[last.id] ?? 0;
    return (
      <div className="home-continue" data-testid="home-continue">
        <Slot name={name} avatar={st ? storyCover(st) : portrait(last, c)} className="home-cover" />
        <div className="home-continue-text">
          <span className="home-kicker">Continue where you left off</span>
          <span className="home-continue-title">{name}</span>
          {p.lastLines[last.id] && <span className="home-line">“{p.lastLines[last.id]}”</span>}
          <div className="home-continue-actions">
            <span className="home-meta">{last.title !== name ? `${last.title}, ` : ""}{count} message{count === 1 ? "" : "s"}, {ago(when(last))}</span>
            <button type="button" className="home-cta" data-testid="home-continue-button" onClick={() => p.onOpenChat(last.id)}>Continue</button>
          </div>
        </div>
      </div>
    );
  })();

  return (
    <div className="home" data-region="home" data-testid="home">
      <header className="home-top">
        <span className="home-mark" aria-hidden><Icon name="home" size={18} stroke={1.8} /></span>
        <span className="home-brand">Homunculus</span>
        <span className="home-top-gap" />
        {p.backTo && (
          <button type="button" className="home-top-btn" onClick={p.onBack} data-testid="home-back">
            Back to {p.backTo} <kbd>Esc</kbd>
          </button>
        )}
        <button type="button" className="home-top-btn" onClick={p.onSearch}><Icon name="search" size={14} /> Search <kbd>Ctrl K</kbd></button>
        <button type="button" className="home-top-btn" onClick={p.onSettings}><Icon name="gear" size={14} /> Settings</button>
      </header>

      <div className="home-grid" ref={grid}>
        <section className="plate plate-hero" aria-labelledby="home-title">
          <img className="plate-art" src={panorama} alt="" />
          <div className="plate-hero-head">
            <h1 id="home-title" className="home-wordmark">Homunculus</h1>
            <span className="plate-no">Pl. I</span>
          </div>
          {continueCard}
        </section>

        <section className="plate" aria-labelledby="home-played">
          <button type="button" className="plate-head" onClick={p.onCharacters}>
            <h2 id="home-played">Played last</h2><span className="plate-no">Pl. II, Characters</span>
          </button>
          {played.length === 0 && <p className="home-empty">The characters you chat with show up here. Find one in Characters or the Card Browser.</p>}
          <ul className="home-list">
            {played.map(({ c, s }) => (
              <li key={c.id}>
                <button type="button" className="home-row" onClick={() => p.onOpenChat(s.id)} title={`Open your newest chat with ${c.name}`}>
                  <Slot name={c.name} avatar={portrait(s, c)} className="home-portrait" />
                  <span className="home-row-text"><span className="home-row-name">{c.name}</span><span className="home-meta">{ago(when(s))}</span></span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="home-wide-btn" onClick={p.onCharacters}>Chat with a Character</button>
        </section>

        <section className="plate" aria-labelledby="home-stories">
          <button type="button" className="plate-head" onClick={p.onStories}>
            <h2 id="home-stories">Stories</h2><span className="plate-no">Pl. III{p.stories.length > 3 ? `, all ${p.stories.length}` : ""}</span>
          </button>
          <div className="home-shelf">
            {stories.map((st) => (
              <button key={st.id} type="button" className="home-tile" onClick={() => p.onOpenStory(st.id)}>
                <Slot name={st.name} avatar={storyCover(st)} className="home-tile-cover" />
                <span className="home-tile-name">{st.name}</span>
              </button>
            ))}
            <button type="button" className="home-tile" onClick={p.onNewStory} data-testid="home-new-story">
              <span className="home-tile-cover home-tile-new" aria-hidden><Icon name="plus" size={26} /></span>
              <span className="home-tile-name home-tile-new-name">New Story</span>
            </button>
          </div>
        </section>

        <section className="plate plate-art-plate" aria-labelledby="home-assistant">
          <img className="plate-art" src={spire} alt="" />
          <div className="plate-art-body">
            <div className="plate-head plate-head-static">
              <h2 id="home-assistant">Assistant</h2><span className="plate-no">Pl. IV</span>
            </div>
            <p className="home-assistant-line">Builds characters, lorebooks and trackers with you.</p>
            <form className="home-ask" onSubmit={(e) => { e.preventDefault(); p.onAsk(ask.trim()); }}>
              <input aria-label="Ask the Assistant" placeholder="Make a tracker for money and quests…" value={ask} onChange={(e) => setAsk(e.target.value)} data-testid="home-ask" />
              <button type="submit" className="home-cta">Open in Assistant</button>
            </form>
          </div>
        </section>

        <section className="plate" aria-labelledby="home-library">
          <button type="button" className="plate-head" onClick={() => p.onLibrary("lorebooks")}>
            <h2 id="home-library">Library</h2><span className="plate-no">Pl. V</span>
          </button>
          <ul className="home-list">
            {([["lorebooks", "Lorebooks", "scroll"], ["presets", "Presets", "preset"], ["trackers", "Trackers", "trackers"], ["personas", "Personas", "persona"]] as const).map(([area, label, icon]) => (
              <li key={area}>
                <button type="button" className="home-count" onClick={() => p.onLibrary(area)}>
                  <Icon name={icon} size={15} /><span>{label}</span><span className="home-meta">{p.counts[area]}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="home-pair">
            <button type="button" className="home-wide-btn" onClick={p.onCardBrowser}><Icon name="globe" size={14} /> Card Browser</button>
            <button type="button" className="home-wide-btn" onClick={() => file.current?.click()}><Icon name="import" size={14} /> Import Cards</button>
          </div>
          <input ref={file} type="file" accept=".png,.json" multiple hidden aria-label="Card files"
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) p.onImportFiles(files); }} />
        </section>
      </div>
    </div>
  );
}
