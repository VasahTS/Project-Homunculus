// Homunculus 2 — sidebar: where you go (Library, Vault) and what you play (Stories, Chats). Author: CLAUDE, 2026-10-23;
// UI "I" 2026-10-27 (D-018); slice 4 (2026-10-29, D-029): Library and Vault are two places at the top (their kinds are
// tabs inside them), Stories and Chats are the lists below, each row with its last line so same-named chats differ.
// 2026-10-29 (round 3, D-036): the long list of chats left the sidebar (Daniel: "it will get really clogged when there are
// many characters"): Characters is a place (the cards, in folders; a character's chats are on its sheet), and
// "Recent" keeps the last 3 chats at hand.
// 2026-10-29: a chat writing a reply in the background says so ("writing…"), and its story too, even folded.
// Floats in the functional (glass) layer. Two levels at most. Nothing critical at the bottom.
import type { LibraryCategory, NavigationPlace, NavigationProfile } from "../theme/navigation.ts";
import { useRef, useState } from "react";
import type { Avatar, Character, Session, Story } from "@homunculus/schemas";
import { variantAvatarId } from "@homunculus/core";
import { avatarUrl } from "../files.ts";
import { Help } from "./Help.tsx";
import { Button, Icon, IconButton } from "./kit.tsx";
import { useSlidingPill } from "./motion.ts";
import { turns, useTurns, type LiveTurn } from "../turns.ts";

export interface SidebarSearchItem { id: string; name: string; kind: string; onOpen: () => void }

export type LibraryArea = "characters" | LibraryCategory;
export type Place = NavigationPlace | "settings" | null;

export function Sidebar({ sessions, stories, characters, avatars, lastLines, branchCounts = {}, activeSessionId, activeStoryId, activeChatId = null, place, status,
  navigation, searchItems, onOpenStories, onOpenSession, onOpenStory, onNewStory, onOpenCharacters, onOpenLibrary, onOpenVault, onOpenSettings }: {
  navigation: NavigationProfile;
  searchItems: SidebarSearchItem[];
  onOpenStories: () => void;
  sessions: Session[];
  stories: Story[];
  characters: Character[];
  avatars: Record<string, Avatar>;
  /** The newest line of each session (by session id), shown under its name. */
  lastLines: Record<string, string>;
  /** Branches per session, for the "⑂ 3" next to a chat's name (D-032). */
  branchCounts?: Record<string, number>;
  activeSessionId: string | null;
  activeStoryId: string | null;
  /** The story chat open right now (highlighted under its story). */
  activeChatId?: string | null;
  place: Place;
  status: string;
  onOpenSession: (id: string) => void;
  onOpenStory: (id: string) => void;
  onNewStory: () => void;
  onOpenCharacters: () => void;
  onOpenLibrary: () => void;
  onOpenVault: () => void;
  onOpenSettings: () => void;
}) {
  const live = useTurns();
  /** What a chat with a turn running shows instead of its last line. */
  const working = (id: string) => {
    const t: LiveTurn | undefined = live.get(id);
    if (!t || t.phase === "done") return null;
    // ■ stops the reply without opening the chat (inside the row's button, so a span that acts as one)
    const stop = (e: { stopPropagation: () => void; preventDefault: () => void }) => { e.stopPropagation(); e.preventDefault(); turns.stop(id); };
    return <span className="side-line side-writing" data-testid="side-writing"><i aria-hidden />{t.phase === "writing" ? "writing…" : "updating the scene…"}
      {t.phase === "writing" && <span role="button" tabIndex={0} className="side-stop" aria-label="Cancel this reply" title="Stop this reply" data-testid="side-stop"
        onClick={stop} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") stop(e); }}>■</span>}</span>;
  };
  const [q, setQ] = useState("");
  /** Stories whose chats are shown (the active story's always are). */
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({});
  const lead = (s: Session) => characters.find((c) => c.id === s.cast[0]?.characterId);
  /** The session's picture: the version's own picture when it has one. */
  const sessionAvatar = (s: Session, c: Character | undefined) => {
    if (!c) return undefined;
    const vid = s.cast[0]?.variantId;
    return (vid ? avatars[variantAvatarId(c.id, vid)] : undefined) ?? avatars[c.id];
  };
  const storyAvatar = (st: Story) => avatars[st.id] ?? (st.narrator.kind === "card" ? avatars[st.narrator.characterId] : st.narrator.kind === "vault" ? avatars[st.narrator.id] : undefined);
  const match = (text: string) => text.toLowerCase().includes(q.trim().toLowerCase());
  // the last 3 chats (any), or every chat that matches the search
  const searching = q.trim() !== "";
  const storyName = (s: Session) => stories.find((st) => st.id === s.storyId)?.name;
  const chats = searching
    ? sessions.filter((s) => match(s.title) || match(lead(s)?.name ?? "") || match(storyName(s) ?? ""))
    : sessions.slice(0, navigation.recentLimit);
  // stories: the one played most recently first, then new ones
  const lastPlayed = (st: Story) => { const i = sessions.findIndex((s) => s.storyId === st.id); return i < 0 ? Infinity : i; };
  const shownStories = stories.filter((st) => match(st.name)).sort((a, b) => lastPlayed(a) - lastPlayed(b) || b.createdAt - a.createdAt);
  const chatsOf = (st: Story) => sessions.filter((s) => s.storyId === st.id);
  const storyLine = (st: Story) => {
    const busy = chatsOf(st).filter((x) => live.get(x.id) && live.get(x.id)!.phase !== "done");
    if (busy.length) return <span className="side-writing"><i aria-hidden />{busy.length === 1 ? `writing in ${busy[0]!.title}…` : `writing in ${busy.length} chats…`}</span>;
    const n = chatsOf(st).length;
    return n ? `${n} chat${n === 1 ? "" : "s"}` : "Not started";
  };

  // the highlight slides from the old place to the new one (D-023)
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  useSlidingPill(navRef, pillRef, ".side-item.on", `${activeSessionId}:${activeStoryId}:${activeChatId}:${place}:${JSON.stringify(unfolded)}`);

  return (
    <nav className="sidebar glass" aria-label="Sidebar" data-region="sidebar" ref={navRef}>
      <span className="slide-pill side-pill" ref={pillRef} aria-hidden />
      <div className="sidebar-brand">
        <span className="brand">Homunculus</span>
        <span className="status-chip" data-testid="status">{status}</span>
      </div>
      <label className="search-box side-search">
        <Icon name="search" size={13} />
        <input aria-label="Search everything" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      <ul className="side-list side-places" data-testid="place-list">
        {navigation.places.map((item) => {
          const actions = { stories: onOpenStories, characters: onOpenCharacters, library: onOpenLibrary, vault: onOpenVault };
          const count = item.id === "stories" ? stories.length : item.id === "characters" ? characters.length : null;
          const busy = item.id === "stories" && sessions.some((session) => session.storyId && live.get(session.id) && live.get(session.id)!.phase !== "done");
          return <li key={item.id}><button className={`side-item${place === item.id ? " on" : ""}`} aria-current={place === item.id ? "page" : undefined} onClick={actions[item.id]}>
            <span className="side-icon"><Icon name={item.icon} /></span><span className="side-text"><strong>{item.label}</strong>{busy && <span className="side-writing">writing…</span>}</span>
            {count !== null && <span className="side-count" aria-hidden="true">{count}</span>}
          </button></li>;
        })}
      </ul>

      {searching && <section className="side-search-results" aria-label="Matching library items and characters">
        <div className="side-head">Characters and Library</div>
        <ul className="side-list">{searchItems.filter((item) => match(item.name)).map((item) => <li key={item.id}>
          <button className="side-item" onClick={item.onOpen}><span className="side-text"><strong>{item.name}</strong><span>{item.kind}</span></span>
          </button></li>)}</ul>
      </section>}
      {(searching || navigation.showStoryShortcuts) && <>
      <div className="side-head">
        <span className="label-row">Stories <Help text="Narrated stories: a narrator (not a character), NPCs from the Vault, how it starts and its own setup. Each story can have several chats; each chat starts with the story's setup and can change some of it." /></span>
        <IconButton label="New story" onClick={onNewStory}><Icon name="plus" size={15} /></IconButton>
      </div>
      <ul className="side-list" data-testid="story-list">
        {shownStories.map((st) => {
          const chats = chatsOf(st);
          const open = chats.length > 0 && (unfolded[st.id] ?? st.id === activeStoryId);
          return (
            <li key={st.id} className="side-story">
              <div className="side-story-row">
                <button className={`side-item${st.id === activeStoryId && !activeChatId ? " on" : ""}`} onClick={() => onOpenStory(st.id)}>
                  <StoryMark name={st.name} avatar={storyAvatar(st)} size={24} />
                  <span className="side-text"><strong>{st.name}</strong><span>{storyLine(st)}</span></span>
                </button>
                {chats.length > 0 && (
                  <IconButton label={open ? `Hide the chats of ${st.name}` : `Show the chats of ${st.name}`} className={`side-fold${open ? " open" : ""}`}
                    aria-expanded={open} onClick={() => setUnfolded((u) => ({ ...u, [st.id]: !open }))}>
                    <Icon name="chevron" size={12} />
                  </IconButton>
                )}
              </div>
              {open && (
                <ul className="side-chats" data-testid={`story-chats-${st.id}`}>
                  {chats.map((x) => (
                    <li key={x.id}>
                      <button className={`side-item side-chat${x.id === activeChatId ? " on" : ""}`} onClick={() => onOpenSession(x.id)} aria-current={x.id === activeChatId ? "page" : undefined}>
                        <span className="side-text"><strong>{x.title}{(branchCounts[x.id] ?? 1) > 1 && <span className="side-fork" title={`${branchCounts[x.id]} branches`}><Icon name="branch" size={11} />{branchCounts[x.id]}</span>}</strong>{working(x.id) ?? <span className="side-line">{lastLines[x.id] || "—"}</span>}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {stories.length === 0 && <li className="side-empty">No stories yet. Start one with “+”.</li>}
        {stories.length > 0 && shownStories.length === 0 && <li className="side-empty">No story matches.</li>}
      </ul>
      </>}

      <div className="side-head">
        <span className="label-row">{searching ? "Chats" : "Recent"} <Help text="Your last chats. Every chat with a character is on its sheet (Characters); a story's chats are on its page." /></span>
      </div>
      <ul className="side-list side-recent" data-testid="session-list">
        {chats.map((s) => {
          const c = lead(s);
          const st = storyName(s);
          return (
            <li key={s.id}>
              <button className={`side-item side-chat${s.id === activeSessionId || s.id === activeChatId ? " on" : ""}`} onClick={() => onOpenSession(s.id)}
                aria-current={s.id === activeSessionId || s.id === activeChatId ? "page" : undefined}>
                <span className="side-text"><strong>{s.title}{(branchCounts[s.id] ?? 1) > 1 && <span className="side-fork" title={`${branchCounts[s.id]} branches`}><Icon name="branch" size={11} />{branchCounts[s.id]}</span>}</strong>
                  {working(s.id) ?? <span className="side-line">{st ?? c?.name ?? "—"} · {lastLines[s.id] || "—"}</span>}</span>
              </button>
            </li>
          );
        })}
        {sessions.length === 0 && <li className="side-empty">No chats yet. Open Characters and start one.</li>}
        {searching && chats.length === 0 && <li className="side-empty">No chat matches.</li>}
      </ul>

      <div className="side-bottom">
        <ul className="side-list" data-testid="app-list">
          <li>
            <button className={`side-item${place === "settings" ? " on" : ""}`} onClick={onOpenSettings}>
              <span className="side-icon"><Icon name="gear" /></span><span className="side-text"><strong>Settings</strong></span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

/** A round avatar: the picture when there is one, else the first letter. */
export function AvatarDot({ name, avatar, size = 28 }: { name: string; avatar?: Avatar; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  return avatar
    ? <img className="avatar-dot" src={avatarUrl(avatar)} alt="" style={style} />
    : <span className="avatar-dot letter" aria-hidden style={style}>{(name || "?").slice(0, 1).toUpperCase()}</span>;
}

/** A story's small square mark: the narrator card's picture, else its first letter on a tint. */
export function StoryMark({ name, avatar, size = 28 }: { name: string; avatar?: Avatar; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  return avatar
    ? <img className="story-mark" src={avatarUrl(avatar)} alt="" style={style} />
    : <span className="story-mark letter" aria-hidden style={style}>{(name || "?").slice(0, 1).toUpperCase()}</span>;
}

/** The newest line of a message, made short and plain for a list (markdown asterisks and quotes removed). */
export function lastLineOf(text: string): string {
  const flat = text.replace(/[*_~`>#]+/g, "").replace(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 88)}…` : flat;
}
