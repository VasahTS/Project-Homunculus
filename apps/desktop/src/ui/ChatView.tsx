// Homunculus 2 — the chat of one session: streaming, swipes, branches. Author: CLAUDE, 2026-10-23;
// 2026-10-27: fix (the sent message vanished while streaming); reply shown before trackers finish; Scene panel;
// UI "I" (D-018): toolbar, prose, receipt line, composer, inspector (Scene / Prompt / Reply);
// 2026-10-28 (slice 1): "who's in this story" (character version, persona and its version), real names.
// 2026-10-29 (D-032): branches (the "⑂ Main ▾" list, the marker where the story splits, the tree, Branch from here)
// and the message action bar (copy, edit, new version, branch, hide from the AI, details, delete).
// 2026-10-29 (after Daniel's tests, D-032 v2): branches are direct, like SillyTavern and Marinara — "Branch from here"
// on any message makes the branch and puts you on it; a branch is a named end; each branch keeps its own versions.
// 2026-10-29 (Daniel: "things stop generating when we leave the chat"): the turn lives in `turns.ts`, outside this
// screen, so a reply keeps going when you open another chat, and several chats can write at once. This screen watches it.
import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import type { AgentConfig, Avatar, Character, Lorebook, Message, Npc, Persona, Preset, Session, SetupLayer, UserRole } from "@homunculus/schemas";
import { AgentMarks, CheckLines, Choices, ComposerChoices, NoteChips, ProposalLines, useAgentResults } from "./AgentResults.tsx";
import { AgentsPanel } from "./AgentsPanel.tsx";
import { MemoryGroup } from "./MemoryGroup.tsx";
import type { StorySetupProps } from "./SetupFields.tsx";
import { SessionLorebooks } from "./LorePanels.tsx";
import { REGEX_HTML, regexKey, applyBasicMacros, applyRegexScripts, DEFAULT_USER_NAME, effectiveCharacter, effectivePersona } from "@homunculus/core";
import { WhoPicker } from "./WhoPicker.tsx";
import type { AppServices } from "../core-instance.ts";
import { turns, useTurn, type LiveTurn, type StreamTo } from "../turns.ts";
import type { ConnectionState } from "../connection.ts";
import { deletableFrom, nextBranchName, type ChatBranch, type ConnectionConfig, type ModelInfo, type ProviderDefinition } from "@homunculus/core";
import { PromptCharacter } from "./PromptCharacter.tsx";
import { ScenePanel } from "./ScenePanel.tsx";
import { layerWithStyle, type Tracker } from "../trackers.ts";
import { Inspector, type InspectorTab } from "./Inspector.tsx";
import { PromptPane } from "./ConnectionPanel.tsx";
import { approxTokens, fmtTokens, ReplyPane } from "./ReplyPane.tsx";
import { Button, Icon, IconButton } from "./kit.tsx";
import { RegexReview, SessionRegex } from "./RegexScripts.tsx";
import { MessageText } from "./MessageText.tsx";
import { AuthorsNoteGroup, noteMarkAt } from "./AuthorsNote.tsx";
import { QuickConnect } from "./QuickConnect.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { BranchMenu, ForkMarker, subtreeOf, TreeSheet, useBranches } from "./Branches.tsx";
import type { ReactNode } from "react";

interface SiblingInfo { index: number; ids: string[] }
interface Pending { parentId: string | null; userText?: string | undefined; text: string; reasoning: string }

export function ChatView({ svc, session, onOpenChat, characters, personas, defaultPersonaId, avatars, onChangeSession, onOpenSettings, listModels, presets, defaultPresetId, onSavePreset, onOpenPreset, lorebooks, onOpenLorebook, connection, providers, trackers, lead, story: storyInfo, storySetup, setupProps, onOpenStory, npcs, inspectorOpen, onToggleInspector, onActivity, onRename, onDelete, onToggleTracker, onPickFieldSet, onEditTracker, onNewTracker, focusMessageId = null, onSaveNpcToVault, onSaveCharacter, onOpenCharacter, agents = [], onToggleAgent, onOpenAgent, onOpenStoryLore, onRegexChanged, onOpenRegex }: {
  /** Open the chat at this message (a chat search result, round 3): its branch, scrolled to it. */
  focusMessageId?: string | null;
  svc: AppServices;
  /** Opens another chat (after "Make a Separate Chat"). */
  onOpenChat?: (sessionId: string) => void;
  providers: ProviderDefinition[];
  /** Leading toolbar item from the shell (the sidebar toggle). */
  lead: ReactNode;
  /** The story this session belongs to (slice 4): its name and who tells it. */
  story?: { name: string; narrator: string; role?: UserRole } | undefined;
  /** The story's setup layer: what this chat inherits (D-031). Undefined for a 1:1 chat. */
  storySetup?: SetupLayer | undefined;
  /** For the Prompt tab of a story chat (the same setup block as the story's page). */
  setupProps?: StorySetupProps;
  onOpenStory?: (() => void) | undefined;
  /** The NPCs of the Vault, for adding them to this chat. */
  npcs: Npc[];
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  session: Session;
  characters: Record<string, Character>;
  personas: Persona[];
  defaultPersonaId: string | null;
  avatars: Record<string, Avatar>;
  onChangeSession: (s: Session) => void | Promise<void>;
  /** Save someone of the Scene to the Vault (round 3). */
  /** Saves a card edited in the Prompt tab; opens the full editor (round 3). */
  onSaveCharacter?: ((c: Character) => Promise<void>) | undefined;
  onOpenCharacter?: ((id: string) => void) | undefined;
  onSaveNpcToVault?: ((d: { name: string; schemaId: string; values: Record<string, unknown> }) => void) | undefined;
  onOpenSettings: () => void;
  /** Asks a connection's service for its models (Quick Connection). */
  listModels: (config: ConnectionConfig, signal: AbortSignal) => Promise<ModelInfo[]>;
  presets: Preset[];
  defaultPresetId: string;
  onSavePreset: (p: Preset) => Promise<void>;
  onOpenPreset: (id: string, block?: string) => void;
  lorebooks: Lorebook[];
  onOpenLorebook: (id: string) => void;
  connection: ConnectionState;
  trackers: Tracker[];
  onActivity: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onToggleTracker: (trackerId: string, on: boolean) => void;
  onPickFieldSet: (trackerId: string, setId: string | null) => void;
  onEditTracker: (trackerId: string) => void;
  onNewTracker: () => void;
  /** The Library's agents (slice 5, D-047): the ✦ menu, marks, notes and choices. */
  agents?: AgentConfig[];
  onToggleAgent?: (agentId: string, on: boolean) => void;
  onOpenAgent?: (agentId: string | null) => void;
  /** Opens this story's version of its lorebook (after an agent added entries, D-049). */
  onOpenStoryLore?: (() => void) | undefined;
  /** Regex scripts were allowed here (the Library and editors reload what is allowed). */
  onRegexChanged?: () => void;
  onOpenRegex?: () => void;
}) {
  // regex scripts for drawing messages (global → preset → character, D-060)
  const [regex, setRegex] = useState<Awaited<ReturnType<typeof svc.chat.turns.regexForSession>>>({ scripts: [], ctx: { macros: (t) => t } });
  const [regexWaiting, setRegexWaiting] = useState<Awaited<ReturnType<typeof svc.chat.turns.regexWaiting>>>([]);
  const [regexTick, setRegexTick] = useState(0);
  const [regexRows, setRegexRows] = useState<Awaited<ReturnType<typeof svc.chat.turns.regexRows>> | null>(null);
  const [reviewRegex, setReviewRegex] = useState(false);
  const [regexLater, setRegexLater] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void svc.chat.turns.regexForSession(session.id).then((r) => { if (live) setRegex(r); }).catch(() => {});
    void svc.chat.turns.regexWaiting(session.id).then((r) => { if (live) setRegexWaiting(r); }).catch(() => {});
    void svc.chat.turns.regexRows(session.id).then((r) => { if (live) setRegexRows(r); }).catch(() => {});
    return () => { live = false; };
  }, [svc, session, presets, characters, defaultPresetId, regexTick]);
  const waitingKey = regexWaiting.flatMap((g) => g.scripts.map((x) => x.id)).join(",");
  const loadLorebooks = useCallback(() => svc.chat.turns.lorebooksOf(session.id), [svc, session]);
  const [headId, setHeadId] = useState<string | null | undefined>(undefined);
  const [path, setPath] = useState<Message[]>([]);
  const [siblings, setSiblings] = useState<Record<string, SiblingInfo>>({});
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(session.title);
  const endRef = useRef<HTMLDivElement>(null);
  const loadSeq = useRef(0);
  // ---- this chat's turn (turns.ts): it runs outside this screen, so it survives leaving the chat
  const turn = useTurn(session.id);
  /** A turn is running: the reply may already be on screen while trackers still work. */
  const busy = !!turn && turn.phase !== "done";
  /** The last state of the reply while it was being written: kept on screen until the list with the saved reply shows. */
  const lastWriting = useRef<LiveTurn | null>(null);
  if (turn?.phase === "writing") lastWriting.current = turn;
  /** The turn's newest end this screen has shown (turn id + how many times its end moved). */
  const [shown, setShown] = useState(() => { const t = turns.all().get(session.id); return t ? { id: t.id, seq: t.headSeq } : { id: 0, seq: 0 }; });
  const behind = !!turn && (turn.id !== shown.id ? turn.headSeq > 0 : turn.headSeq > shown.seq);
  /** A reply being written right now: where it hangs, the user's words (if any) and what has arrived so far. */
  const pending: Pending | null = turn?.phase === "writing" ? turn : behind && lastWriting.current?.id === turn?.id ? lastWriting.current : null;
  const [sceneKey, setSceneKey] = useState(0);
  const [tab, setTab] = useState<InspectorTab>("scene");
  /** The reply shown in the Reply tab (null = the latest one). */
  const [replyFor, setReplyFor] = useState<string | null>(null);

  // ---- branches (D-032 v2: direct, like SillyTavern and Marinara): a branch is a named end; you are on one of them
  const [branchTick, setBranchTick] = useState(0);
  const [branches, reloadBranches] = useBranches(svc, session.id, `${headId ?? ""}|${branchTick}`);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const currentRef = useRef<string | null>(null);
  const current = branches.list.find((b) => b.recordId === currentId);
  const [treeOpen, setTreeOpen] = useState(false);
  /** The branch just made, for a short "you are on it" hint in the toolbar. */
  const [justBranched, setJustBranched] = useState<string | null>(null);
  useEffect(() => {
    if (!justBranched) return;
    const t = setTimeout(() => setJustBranched(null), 2500);
    return () => clearTimeout(t);
  }, [justBranched]);

  // ---- the message action bar
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [deletingMsg, setDeletingMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /** After the next load, scroll to this message instead of the end. */
  const scrollTarget = useRef<{ id: string; block: ScrollLogicalPosition } | null>(null);

  /**
   * Moves the view to the end of a branch. The new list is loaded first and shown all at once,
   * so nothing blinks or disappears in between (bug of 27/10: the sent message vanished).
   */
  async function showBranch(head: string | null, afterLoad?: () => void) {
    const seq = ++loadSeq.current;
    const p = head ? await svc.store.pathTo(head) : [];
    const info: Record<string, SiblingInfo> = {};
    for (const m of p) {
      const sibs = await svc.store.childrenOf(session.id, m.parentId);
      info[m.id] = { index: sibs.findIndex((x) => x.id === m.id), ids: sibs.map((x) => x.id) };
    }
    if (seq !== loadSeq.current) return; // a newer move won
    setPath(p); setSiblings(info); setHeadId(head);
    afterLoad?.();
  }

  /** Puts you on a branch (remembered for the next time this chat opens). */
  function choose(b: ChatBranch) {
    currentRef.current = b.recordId;
    setCurrentId(b.recordId);
    void svc.store.setAppSetting(`branch:${session.id}`, b.recordId);
  }

  /** The branch you are on now ends at `head` (you wrote, swiped, regenerated or deleted on it). */
  async function moveEnd(head: string | null) {
    const id = currentRef.current;
    if (!id) return;
    const row = (await svc.store.listBranches(session.id)).find((b) => b.id === id);
    if (row && row.endMessageId !== head) await svc.store.saveBranch({ ...row, endMessageId: head });
    setBranchTick((t) => t + 1);
  }

  /** Shows the end of the branch you are on and moves that end there. */
  async function setHead(head: string | null, afterLoad?: () => void) {
    await moveEnd(head);
    await showBranch(head, afterLoad);
  }

  useEffect(() => { currentRef.current = null; setCurrentId(null); }, [session.id]);

  // open the chat on the branch you were on (else the most recent); also when the one you were on is gone
  useEffect(() => {
    if (!branches.loaded || current || !branches.list.length) return;
    let cancelled = false;
    void (async () => {
      const saved = await svc.store.getAppSetting<string>(`branch:${session.id}`);
      if (cancelled) return;
      // opened from a search result: the branch that has that message (the saved one first, if it does)
      const withFocus = focusMessageId ? branches.list.filter((x) => x.path.includes(focusMessageId)) : [];
      const b = withFocus.find((x) => x.recordId === saved) ?? withFocus[0]
        ?? branches.list.find((x) => x.recordId === saved) ?? [...branches.list].sort((x, y) => y.lastAt - x.lastAt)[0]!;
      choose(b);
      if (withFocus.length) scrollTarget.current = { id: focusMessageId!, block: "center" };
      await showBranch(b.endId);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, current]);

  // ---- following the end of the chat: only while you are at the bottom; scrolling up stops it (also while a reply streams)
  const storyRef = useRef<HTMLElement>(null);
  const stickRef = useRef(true);
  const lastTopRef = useRef(0);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  function onStoryScroll() {
    const el = storyRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist < 24) stickRef.current = true;
    else if (el.scrollTop < lastTopRef.current - 1) stickRef.current = false; // you moved up
    lastTopRef.current = el.scrollTop;
    setAwayFromEnd(!stickRef.current);
  }
  function toEnd() {
    const el = storyRef.current;
    stickRef.current = true;
    setAwayFromEnd(false);
    if (el) { el.scrollTop = el.scrollHeight; lastTopRef.current = el.scrollTop; }
  }
  useEffect(() => { toEnd(); }, [session.id]);
  // a new turn starts (you sent, swiped or regenerated): go to the end once
  const turnStarted = pending !== null;
  useEffect(() => { if (turnStarted) toEnd(); }, [turnStarted]);

  useEffect(() => {
    const t = scrollTarget.current;
    if (t) {
      scrollTarget.current = null;
      stickRef.current = false;
      document.querySelector(`[data-mid="${t.id}"]`)?.scrollIntoView({ block: t.block });
      onStoryScroll();
      return;
    }
    if (stickRef.current) toEnd();
  }, [path, pending]);

  /** Starts a turn in turns.ts (it keeps going if you leave this chat). */
  function run(start: { parentId: string | null; userText?: string }, task: (signal: AbortSignal, stream: StreamTo) => Promise<string | null>) {
    setError("");
    turns.start(svc, { sessionId: session.id, parentId: start.parentId, userText: start.userText, before: headId ?? null,
      branchId: currentRef.current, onActivity, task });
  }

  // the turn's end moved (reply saved, or the turn ended): show it — the "writing…" bubble goes away together with the
  // new list appearing. Only when you are still on the branch it writes on (else just refresh the branch list).
  useEffect(() => {
    if (!turn) return;
    const mark = { id: turn.id, seq: turn.headSeq };
    const finish = () => {
      setShown(mark);
      setSceneKey((k) => k + 1);
      if (turn.phase === "done") { if (turn.error) setError(turn.error); turns.clear(session.id, turn); }
    };
    if (!behind) { if (turn.phase === "done") finish(); return; }
    if (turn.branchId && currentRef.current && turn.branchId !== currentRef.current) { setBranchTick((t) => t + 1); finish(); return; }
    scrollTarget.current = null;
    void showBranch(turn.head, finish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn?.id, turn?.headSeq, turn?.phase]);

  /** A choice button: sends its words as your message, like typing them (D-047). */
  const sendText = (text: string) => {
    if (busy || !text.trim()) return;
    const parentId = headId ?? null;
    run({ parentId, userText: text }, async (signal, streamTo) => {
      const r = connection.forRequest();
      const { reply } = await svc.chat.send(session.id, parentId, text, r.connection, { signal, connections: r.connections, ...streamTo });
      return reply.id;
    });
  };

  const send = () => {
    const text = input.trim();
    if (busy) return;
    const parentId = headId ?? null;
    if (!text) {
      // empty send (like SillyTavern): the AI writes the next message after the last one in the chat
      if (!parentId) return;
      run({ parentId }, async (signal, streamTo) => {
        const r = connection.forRequest();
        const reply = await svc.chat.generate(session.id, parentId, r.connection, { signal, connections: r.connections, ...streamTo });
        return reply.id;
      });
      return;
    }
    setInput("");
    run({ parentId, userText: text }, async (signal, streamTo) => {
      const r = connection.forRequest();
      const { reply } = await svc.chat.send(session.id, parentId, text, r.connection, { signal, connections: r.connections, ...streamTo });
      return reply.id;
    });
  };

  /** Shows another branch (optionally scrolled to one of its messages). */
  const goTo = (b: ChatBranch, at?: string) => {
    setEditing(null); setDeletingMsg(null);
    choose(b);
    if (at) scrollTarget.current = { id: at, block: "center" };
    void showBranch(b.endId);
  };

  /**
   * "Branch from here" (SillyTavern `createBranch`, Marinara `handleBranch`): a new branch that ends at this message,
   * and you are on it now. What you do next happens only in it.
   */
  const branchFrom = async (messageId: string) => {
    if (busy) return;
    setEditing(null); setDeletingMsg(null);
    const id = crypto.randomUUID();
    await svc.store.saveBranch({ id, sessionId: session.id, name: nextBranchName(branches.list.map((b) => b.name)), headMessageId: null, endMessageId: messageId });
    const info = await reloadBranches();
    const b = info.list.find((x) => x.recordId === id);
    if (!b) return;
    choose(b);
    scrollTarget.current = { id: messageId, block: "nearest" };
    await showBranch(messageId);
    setJustBranched(id);
    onActivity(); // the sidebar's "⑂ N" counts it now
  };
  const deleteBranch = async (b: ChatBranch) => {
    if (b.own.length) await svc.store.deleteMessages(session.id, b.own);
    await svc.store.deleteBranch(b.recordId);
    setBranchTick((t) => t + 1);
    onActivity();
  };

  const renameBranch = async (b: ChatBranch, name: string) => {
    const row = (await svc.store.listBranches(session.id)).find((x) => x.id === b.recordId);
    if (row) await svc.store.saveBranch({ ...row, name });
    setBranchTick((t) => t + 1);
  };

  const separate = async (endId: string | null, name: string) => {
    if (!endId) return;
    const copy = await svc.chat.copyPathToNewChat(session.id, endId, `${session.title} · ${name}`);
    onOpenChat?.(copy.id);
  };

  // ---- the message action bar
  const copyText = async (m: Message) => {
    try { await navigator.clipboard.writeText(show(m.content, m)); } catch { /* the clipboard may be blocked */ }
    setCopied(m.id);
    setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1500);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { id, text } = editing;
    setEditing(null);
    await svc.chat.editMessage(id, text);
    scrollTarget.current = { id, block: "nearest" };
    await showBranch(headId ?? null);
    setSceneKey((k) => k + 1);
  };

  const toggleHidden = async (m: Message) => {
    await svc.store.updateMessage(m.id, { visibility: { ...m.visibility, ai: m.visibility.ai === "none" ? "full" : "none" } });
    scrollTarget.current = { id: m.id, block: "nearest" };
    await showBranch(headId ?? null);
  };

  const deleteMessage = async (m: Message) => {
    setDeletingMsg(null);
    // only this branch loses them: messages other branches use stay
    const ids = deletableFrom(branches.links, branches.list, current, m.id);
    await moveEnd(m.parentId);
    await svc.store.deleteMessages(session.id, ids);
    await showBranch(m.parentId);
    setBranchTick((t) => t + 1);
    setSceneKey((k) => k + 1);
    onActivity();
  };

  /** A new version of the last reply; on your own last message, a reply to it. */
  const regenerate = (m: Message) => {
    const parentId = m.speaker.kind === "user" ? m.id : m.parentId;
    run({ parentId }, async (signal, streamTo) => {
      const r = connection.forRequest();
      const reply = await svc.chat.generate(session.id, parentId, r.connection, { signal, connections: r.connections, ...streamTo });
      return reply.id;
    });
  };

  const switchSibling = async (m: Message, dir: -1 | 1) => {
    const versions = versionsOf(m);
    const target = versions[versions.indexOf(m.id) + dir];
    if (!target) return;
    // an older message's version: go on to the newest end under it that no other branch uses (what came after it)
    let end = target;
    for (;;) {
      const kids = branches.links.filter((l) => l.parentId === end && !otherUsed.has(l.id));
      if (!kids.length) break;
      end = kids.reduce((a, b) => (b.createdAt >= a.createdAt ? b : a)).id;
    }
    await setHead(end);
  };

  /** Characters as this session sees them (the version it picked). */
  const charAsCast = (id: string) => {
    const c = characters[id];
    return c ? effectiveCharacter(c, session.cast.find((x) => x.characterId === id)?.variantId) : undefined;
  };
  // the persona: the session's own, else the default one (null = none, explicitly)
  const personaLayer = session.setup.personaId !== undefined ? session.setup : storySetup?.personaId !== undefined ? storySetup : undefined;
  const personaId = personaLayer ? personaLayer.personaId ?? null : defaultPersonaId;
  const personaRaw = personaId ? personas.find((p) => p.id === personaId) : undefined;
  const persona = personaRaw ? effectivePersona(personaRaw, personaLayer ? personaLayer.personaVariantId ?? null : null) : undefined;
  const userName = persona?.name ?? DEFAULT_USER_NAME;

  const speakerName = (m: Message) =>
    m.speaker.kind === "user" ? (persona?.name ?? "You")
      : m.speaker.kind === "character" ? charAsCast(m.speaker.characterId)?.name ?? "Character"
        : m.speaker.kind === "narrator" ? "Narrator" : "System";

  const commitTitle = () => {
    setEditingTitle(false);
    const t = title.trim();
    if (t && t !== session.title) onRename(t); else setTitle(session.title);
  };

  // While a reply is being written, show the branch only up to where it hangs (a swipe hides the old version).
  const cut = pending ? (pending.parentId === null ? 0 : path.findIndex((m) => m.id === pending.parentId) + 1) : path.length;
  const visible = path.slice(0, cut);
  const last = visible[visible.length - 1];
  const leadChar = charAsCast(session.cast[0]?.characterId ?? "");
  /**
   * Messages are stored raw; {{char}}/{{user}} are filled in for display (and in the prompt). Display-only regex
   * scripts run first (D-060; depth 0 = the newest message on screen).
   */
  const show = (text: string, m?: Message, depth?: number) => {
    const char = m?.speaker.kind === "character" ? charAsCast(m.speaker.characterId)?.name : leadChar?.name;
    const shown = regex.scripts.length
      ? applyRegexScripts(regex.scripts, text, { target: m?.speaker.kind === "user" ? "user" : "ai", mode: "display", depth: depth ?? 0 }, { ...regex.ctx, ...(char ? { char } : {}) })
      : text;
    return applyBasicMacros(shown, { char: char ?? leadChar?.name ?? "Narrator", user: userName });
  };

  /** A message's text on screen: Markdown, dialogue color and filtered HTML (D-061); regex-made HTML is always drawn. */
  const body = (m: Message, depth: number): ReactNode => {
    const text = show(m.content, m, depth);
    const before = typeof m.meta.beforeRegex === "string" ? m.meta.beforeRegex : null;
    const fromRegex = REGEX_HTML.test(text) && ((regex.scripts.length > 0 && !REGEX_HTML.test(m.content)) || (before !== null && !REGEX_HTML.test(before)));
    return <MessageText text={text} htmlFromRegex={fromRegex} />;
  };

  const lastAi = [...visible].reverse().find((m) => m.speaker.kind !== "user");
  // what agents did on the replies on screen (the latest 30), reloaded when a turn ends or something changes
  // (+ the message before the latest reply: "before the reply" agents record their runs there)
  const latestParentId = lastAi?.parentId ?? null;
  // what this chat has spent (D-055, Daniel short on credits): reloaded when a turn ends or the chat changes
  const [usage, setUsage] = useState<{ tokensIn: number; tokensOut: number; cost: number; calls: number } | null>(null);
  useEffect(() => { let off = false; void svc.store.sessionUsage(session.id).then((u) => { if (!off) setUsage(u); }).catch(() => {}); return () => { off = true; }; }, [svc, session.id, busy, sceneKey]);
  const aiShown = visible.filter((m) => m.speaker.kind !== "user").slice(-30);
  const rawResults = useAgentResults(svc, [...new Set([...aiShown.map((m) => m.id), ...aiShown.flatMap((m) => (m.parentId ? [m.parentId] : [])), ...(latestParentId ? [latestParentId] : [])])], sceneKey);
  // Parallel agents (D-059) run beside the reply and record on the message it answers: show their notes with the reply
  const parallelIds = new Set(agents.filter((a) => a.triggers.some((t) => t.on === "turn" && t.phase === "parallel")).map((a) => a.id));
  const agentResults = {
    get: (id: string) => {
      const own = rawResults.get(id);
      const m = aiShown.find((x) => x.id === id);
      const parent = m?.parentId ? rawResults.get(m.parentId) : undefined;
      if (!parent || !parallelIds.size) return own;
      const pick = <T extends { agentId: string }>(xs: T[]) => xs.filter((x) => parallelIds.has(x.agentId));
      return { runs: [...(own?.runs ?? []), ...pick(parent.runs)], notes: [...(own?.notes ?? []), ...pick(parent.notes)], revisions: own?.revisions ?? [] };
    },
  };
  /** Undo all / the mix chosen in the rewrite comparison: the message gets that text (the old one is kept as a revision). */
  const saveText = async (m: Message, text: string) => {
    if (text === m.content) return;
    await svc.chat.editMessage(m.id, text);
    scrollTarget.current = { id: m.id, block: "nearest" };
    await showBranch(headId ?? null);
    setSceneKey((k) => k + 1);
  };
  /** Runs an agent by hand on a message (D-057: with an optional direction), and says why when it failed. */
  const runAgentOn = async (agentId: string, messageId: string, direction = "") => {
    const r = connection.forRequest();
    try {
      const out = await svc.chat.turns.runManual(session.id, agentId, messageId, r.connection, undefined, r.connections, { direction });
      if (!out) {
        const run = (await svc.store.listAgentRuns(messageId)).filter((x) => x.agentId === agentId).sort((a, b) => a.startedAt - b.startedAt).at(-1);
        if (run?.status === "failed") throw new Error(run.error ?? "It failed.");
      }
    } finally {
      await showBranch(headId ?? null);
      setSceneKey((k) => k + 1);
    }
  };
  const runAgentByHand = async (agentId: string, direction = "") => {
    const target = lastAi ?? last;
    if (!target) throw new Error("Write or get a message first: agents run on the latest message.");
    await runAgentOn(agentId, target.id, direction);
  };
  const againOn = (messageId: string) => busy ? undefined : (agentId: string) => (direction: string) => runAgentOn(agentId, messageId, direction);
  /** Messages the other branches use: they are not versions here (each branch keeps its own, like a copy would). */
  const otherUsed = new Set(branches.list.filter((b) => b !== current).flatMap((b) => b.path));
  const versionsOf = (m: Message) => (siblings[m.id]?.ids ?? [m.id]).filter((id) => id === m.id || !otherUsed.has(id));
  // the Author's Note: what this chat uses (its own lines over the story's / the Defaults'), and where it sits on screen
  const noteAbove = setupProps?.noteAbove(storySetup);
  const note = noteAbove ? { ...noteAbove, ...Object.fromEntries(Object.entries(session.setup.authorsNote ?? {}).filter(([, v]) => v !== undefined)) } : undefined;
  const noteAt = note && !pending ? noteMarkAt(note, visible.length) : null;
  const noteMark = note && (
    <li className="an-mark-li" key="an-mark"><button type="button" className="an-mark" data-testid="authors-note-mark"
      title="Open the Author's Note (Prompt tab)" onClick={() => { setTab("prompt"); if (!inspectorOpen) onToggleInspector(); }}>
      Author's Note goes here · {note.depth} message{note.depth === 1 ? "" : "s"} back{note.interval > 1 ? ` · every ${note.interval} of your messages` : ""}
    </button></li>
  );
  // NPCs appear in the Scene as "n:<name>": their Vault picture goes with them (29/10)
  const sceneAvatars = { ...avatars, ...Object.fromEntries(npcs.filter((n) => avatars[n.id]).map((n) => [`n:${n.name}`, avatars[n.id]!])) };
  const openReply = (id: string) => { setReplyFor(id); setTab("reply"); if (!inspectorOpen) onToggleInspector(); };
  const story = connection.storyProfileFor(session, storySetup);
  const params = story?.params ?? {};

  return (
    <div className="session-view">
      <div className="story-pane">
        <Toolbar
          lead={lead}
          title={editingTitle ? (
            <input className="title-input" autoFocus value={title} aria-label="Session title"
              onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setTitle(session.title); setEditingTitle(false); } }} />
          ) : (
            <button className="title-btn" title="Click to rename" onClick={() => setEditingTitle(true)}>{session.title}</button>
          )}
          subtitle={<>
            {branches.list.length > 0 && (
              <BranchMenu info={branches} current={current} fresh={!!current && justBranched === current.recordId}
                onGo={(b) => goTo(b)} onRename={(b, name) => void renameBranch(b, name)} onDelete={(b) => void deleteBranch(b)}
                onTree={() => setTreeOpen(true)} onSeparate={(b) => void separate(b.endId, b.name)} />
            )}
            <WhoPicker session={session} characters={characters} personas={personas} defaultPersonaId={defaultPersonaId}
              avatars={avatars} onChange={onChangeSession} story={storyInfo} npcs={npcs} />
          </>}
          trailing={<>
            {onToggleAgent && onOpenAgent && (
              <AgentsPanel svc={svc} agents={agents} trackers={trackers} session={session} storySetup={storySetup}
                latest={lastAi ? agentResults.get(lastAi.id) : undefined} latestBefore={latestParentId ? agentResults.get(latestParentId) : undefined} latestId={(lastAi ?? last)?.id ?? null} busy={busy} connection={connection}
                onToggle={(id, on, tracker) => tracker ? onToggleTracker(id, on) : onToggleAgent(id, on)} onRun={runAgentByHand} onOpen={onOpenAgent}
                onEditTracker={onEditTracker} onChanged={() => setSceneKey((k) => k + 1)} onPick={busy ? undefined : sendText}
                onStyle={(id, sid) => void onChangeSession({ ...session, setup: layerWithStyle(session.setup, id, sid) })} />
            )}
            {onOpenStory && <Button onClick={onOpenStory} data-testid="story-page-button">Story Page</Button>}
            {/* an icon (29/10): the words took the room of the title, branch and "with …" in narrow windows */}
            <IconButton label="Move to Trash" className="danger-hover" onClick={onDelete} title="Move to Trash: the chat goes to Library → Trash; you can restore it."><Icon name="trash" size={16} /></IconButton>
            <IconButton label={inspectorOpen ? "Hide Inspector" : "Show Inspector"} onClick={onToggleInspector} aria-pressed={inspectorOpen}>
              <Icon name="inspector" size={17} />
            </IconButton>
          </>}
        />

        <main className="story" data-region="story" ref={storyRef} onScroll={onStoryScroll}>
          {regexWaiting.length > 0 && regexLater !== waitingKey && (
            <div className="rx-waiting rx-chat-bar" role="status" data-testid="regex-waiting">
              <Icon name="lock" size={14} />
              <span>{(() => { const n = regexWaiting.reduce((k, g) => k + g.scripts.length, 0); return `${n} new regex script${n === 1 ? "" : "s"} in ${regexWaiting.map((g) => `“${g.ownerName}”`).join(" and ")} — not running until you allow ${n === 1 ? "it" : "them"}.`; })()}</span>
              <Button small onClick={() => setReviewRegex(true)} data-testid="regex-review-open">Review</Button>
              <Button small variant="plain" onClick={() => setRegexLater(waitingKey)}>Later</Button>
            </div>
          )}
          {reviewRegex && (
            <RegexReview groups={regexWaiting} sample={lastAi?.content} onClose={() => setReviewRegex(false)}
              onAllow={(xs) => void svc.store.approveRegex(xs.map(regexKey)).then(() => { setRegexTick((t) => t + 1); onRegexChanged?.(); })} />
          )}
          <ol className="messages-list" data-testid="messages">
            {visible.map((m, i) => {
              const versions = versionsOf(m);
              const vIndex = versions.indexOf(m.id);
              const isLast = m === last;
              const isLastAi = m === lastAi && isLast;
              const user = m.speaker.kind === "user";
              const hidden = m.visibility.ai === "none";
              const fork = branches.forks.get(m.id);
              const isEditing = editing?.id === m.id;
              // what Delete removes here: this message and what follows, minus what other branches still use
              const gone = deletingMsg === m.id ? deletableFrom(branches.links, branches.list, current, m.id) : [];
              const kept = deletingMsg === m.id ? subtreeOf(branches.links, m.id).length - gone.length : 0;
              return (
                <Fragment key={m.id}>
                {noteAt === i && noteMark}
                <li className={`msg ${m.speaker.kind}${hidden ? " hidden-ai" : ""}${isLast ? " last" : ""}`} data-testid="message" data-region="message" data-mid={m.id}>
                  <div className="msg-body">
                  <div className="who">{speakerName(m)}
                    {!user && <AgentMarks results={agentResults.get(m.id)} agents={agents} current={m.content} canWriteAgain={isLastAi && m.parentId !== null && !busy}
                      onSaveText={(t) => void saveText(m, t)} onWriteAgain={() => regenerate(m)} />}
                    {m.meta.incomplete === true && <span className="warn"> · incomplete</span>}
                    {typeof m.meta.beforeRegex === "string" && !isEditing && (
                      <button type="button" className="link rx-undo" title="Regex scripts changed this message when it was saved. Put the original text back."
                        onClick={() => void svc.chat.undoRegex(m.id).then(() => showBranch(headId ?? null))} data-testid="regex-undo">&nbsp;· changed by regex · Original</button>
                    )}
                    {hidden && <span className="hidden-tag" data-testid="hidden-tag"> · hidden from the AI</span>}
                  </div>
                  {m.reasoning && (
                    <details className="reasoning" data-testid="reasoning">
                      <summary>Reasoning</summary>
                      <div className="reasoning-text">{regex.scripts.length ? applyRegexScripts(regex.scripts, m.reasoning, { target: "reasoning", mode: "display", depth: visible.length - i - 1 }, regex.ctx) : m.reasoning}</div>
                    </details>
                  )}
                  {isEditing ? (
                    <div className="msg-edit">
                      <textarea autoFocus aria-label="Edit the message" value={editing.text} rows={Math.min(14, Math.max(3, editing.text.split("\n").length + 1))}
                        onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void saveEdit(); }} />
                      <span className="row-line end">
                        <span className="hint grow">The old text is kept as a revision. Ctrl+Enter saves.</span>
                        <Button small onClick={() => setEditing(null)}>Cancel</Button>
                        <Button small variant="prominent" onClick={() => void saveEdit()} data-testid="save-edit">Save</Button>
                      </span>
                    </div>
                  ) : (
                    <div className={user ? "text" : "text prose"}>{body(m, visible.length - i - 1)}</div>
                  )}
                  {!user && !isEditing && <CheckLines results={agentResults.get(m.id)} agents={agents} canWriteAgain={isLastAi && m.parentId !== null && !busy} onWriteAgain={() => regenerate(m)} />}
                  {!user && !isEditing && <NoteChips results={agentResults.get(m.id)} agents={agents} onRun={againOn(m.id)} />}
                  {!user && !isEditing && <ProposalLines results={agentResults.get(m.id)} agents={agents} onOpen={onOpenStoryLore} />}
                  {isLastAi && !busy && !pending && !isEditing && (
                    <Choices results={agentResults.get(m.id)} agents={agents} onPick={sendText} onEdit={(t) => setInput(t)} onRun={againOn(m.id)} />
                  )}
                  </div>
                  {deletingMsg === m.id ? (
                    <div className="msg-delete" data-testid="message-delete-confirm">
                      <span><strong>Delete {gone.length > 1 ? `this message and the ${gone.length - 1} after it` : "this message"} for good?</strong>
                        <small> Its world state goes too. It does not go to the Trash.{kept > 0 ? " Other branches keep the messages they use." : ""}</small></span>
                      <span className="row-line end"><Button small onClick={() => setDeletingMsg(null)}>Cancel</Button>
                        <Button small variant="destructive" onClick={() => void deleteMessage(m)}>Delete Forever</Button></span>
                    </div>
                  ) : !isEditing && (
                    <div className="tools msg-actions">
                      {versions.length > 1 && (
                        <span className="swipes">
                          <button aria-label="Previous version" disabled={vIndex === 0 || busy} onClick={() => switchSibling(m, -1)}>‹</button>
                          <span data-testid="swipe-counter"><b>{vIndex + 1}</b>/{versions.length}</span>
                          <button aria-label="Next version" disabled={vIndex === versions.length - 1 || busy} onClick={() => switchSibling(m, 1)}>›</button>
                        </span>
                      )}
                      <IconButton className="act" label={copied === m.id ? "Copied" : "Copy"} onClick={() => void copyText(m)}><Icon name={copied === m.id ? "check" : "copy"} size={15} /></IconButton>
                      <IconButton className="act" label="Edit" disabled={busy} onClick={() => setEditing({ id: m.id, text: m.content })}><Icon name="pencil" size={15} /></IconButton>
                      {isLastAi && m.parentId !== null && !busy && (
                        <IconButton className="act" label="New Version" onClick={() => regenerate(m)}><Icon name="refresh" size={15} /></IconButton>
                      )}
                      {isLast && user && !busy && (
                        <IconButton className="act" label="Get a Reply" onClick={() => regenerate(m)}><Icon name="refresh" size={15} /></IconButton>
                      )}
                      {!busy && (
                        <IconButton className="act" label="Branch from here" title="Branch from here: a new branch that ends at this message, and you go to it"
                          onClick={() => void branchFrom(m.id)}><Icon name="branch" size={15} /></IconButton>
                      )}
                      <IconButton className={`act${hidden ? " on" : ""}`} label={hidden ? "Show to the AI" : "Hide from the AI"} aria-pressed={hidden} disabled={busy}
                        onClick={() => void toggleHidden(m)}><Icon name={hidden ? "eye" : "eyeOff"} size={15} /></IconButton>
                      {!user && m.parentId !== null && (
                        <IconButton className="act" label="Details" onClick={() => openReply(m.id)}><Icon name="info" size={15} /></IconButton>
                      )}
                      <span className="act-sep" aria-hidden />
                      <IconButton className="act" label="Delete" disabled={busy} onClick={() => setDeletingMsg(m.id)}><Icon name="trash" size={15} /></IconButton>
                      {isLastAi && !busy && <><span className="spacer" /><ReceiptLine svc={svc} messageId={m.id} trackers={trackers} refreshKey={sceneKey} onDetails={() => openReply(m.id)} /></>}
                    </div>
                  )}
                  {/* where the story splits: under the message and its actions (29/10: it sat between the two) */}
                  {fork && <ForkMarker through={fork} current={current} lines={branches.lines} onGo={(b) => goTo(b)} />}
                </li>
                </Fragment>
              );
            })}
            {noteAt !== null && noteAt >= visible.length && visible.length > 0 && noteMark}
            {path.length === 0 && !busy && headId !== undefined && (
              <li className="empty-chat">No messages yet. Write the first one below.</li>
            )}
            {pending?.userText !== undefined && (
              <li className="msg user fresh" data-testid="message">
                <div className="msg-body">
                  <div className="who">{persona?.name ?? "You"}</div>
                  <div className="text">{pending.userText}</div>
                </div>
              </li>
            )}
            {pending && (
              <li className="msg character streaming fresh" data-testid="streaming">
                <div className="who">{leadChar?.name ?? "…"} {pending.reasoning && !pending.text ? "is thinking…" : "is writing…"}</div>
                {pending.reasoning && (
                  <details className="reasoning" data-testid="reasoning-live">
                    <summary>Reasoning</summary>
                    <div className="reasoning-text">{pending.reasoning}</div>
                  </details>
                )}
                <div className="text prose">{pending.text ? <MessageText text={show(pending.text)} /> : <span className="typing" aria-label="waiting for the reply"><i /><i /><i /></span>}</div>
              </li>
            )}
          </ol>
          <div ref={endRef} />
          {awayFromEnd && (
            <div className="to-end-dock">
              <button type="button" className="to-end" onClick={toEnd} data-testid="jump-to-end">
                {pending ? "Writing… ↓" : "Latest ↓"}
              </button>
            </div>
          )}
        </main>

        {error && <div className="error-bar" role="alert">{error}</div>}
        {busy && !pending && <div className="turn-status" data-testid="turn-status">Reply saved. Trackers are updating…</div>}

        {lastAi && !busy && !pending && <ComposerChoices results={agentResults.get(lastAi.id)} agents={agents} onPick={sendText} onEdit={(t) => setInput(t)} onRun={againOn(lastAi.id)} />}
        <form className="composer" data-region="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <div className="composer-box">
            <QuickConnect svc={svc} c={connection} session={session} storySetup={storySetup} listModels={listModels}
              onChangeSession={onChangeSession} onManage={onOpenSettings} />
            <textarea value={input} rows={2} aria-label="Your message"
              placeholder="Write your message (Enter sends, Shift+Enter makes a new line; empty Enter gets a reply)"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            {busy
              ? <Button variant="prominent" onClick={() => turns.stop(session.id)}>Stop</Button>
              : <Button variant="prominent" type="submit" disabled={!input.trim() && !headId}
                  title={input.trim() ? undefined : "Empty: the AI writes the next message"}>Send</Button>}
          </div>
          <div className="composer-meta">
            <button type="button" className="link quiet" onClick={() => { setTab("prompt"); if (!inspectorOpen) onToggleInspector(); }}>
              Writing with {story ? (story.providerId === "offline-test" ? "the offline test AI" : `${story.name}`) : "no connection"}
              {params.temperature !== undefined ? `, temperature ${params.temperature}` : ""}
              {params.reasoningEffort ? `, thinking ${params.reasoningEffort}` : ""}
            </button>
            {usage && usage.tokensIn + usage.tokensOut > 0 && (
              <span className="composer-usage" data-testid="chat-usage" title={`This chat so far (all branches, replies and agents): ${usage.tokensIn.toLocaleString("en-US")} tokens in, ${usage.tokensOut.toLocaleString("en-US")} out, ${usage.calls} calls${usage.cost ? `, $${usage.cost.toFixed(4)}` : ""}. Only what the provider reported.`}>
                · this chat: {shortTokens(usage.tokensIn + usage.tokensOut)} tokens{usage.cost ? ` · $${usage.cost.toFixed(2)}` : ""}
              </span>
            )}
          </div>
        </form>
      </div>

      {treeOpen && (
        <TreeSheet svc={svc} sessionId={session.id} title={session.title} info={branches} current={current} speakerName={speakerName}
          onGoTo={(b, at) => goTo(b, at)} onBranchFrom={(id) => void branchFrom(id)}
          onClose={() => setTreeOpen(false)} />
      )}

      {inspectorOpen && headId !== undefined && (
        <Inspector tab={tab} onTab={setTab}
          scene={<ScenePanel svc={svc} session={session} storySetup={storySetup} messageId={last?.id ?? null} busy={busy} refreshKey={sceneKey}
            trackers={trackers} connection={connection} avatars={sceneAvatars} onToggle={onToggleTracker} onPickSet={onPickFieldSet} onEditTracker={onEditTracker}
            onNewTracker={onNewTracker} onChanged={() => setSceneKey((k) => k + 1)} onChangeSession={onChangeSession} onSaveToVault={onSaveNpcToVault} />}
          prompt={<PromptPane c={connection} providers={providers} session={session} storySetup={storySetup} storyName={storyInfo?.name} director={storyInfo?.role === "director"} setupProps={setupProps} onChangeSession={onChangeSession} onOpenSettings={onOpenSettings}
            presets={presets} defaultPresetId={defaultPresetId} onSavePreset={onSavePreset} onOpenPreset={onOpenPreset} trackers={trackers}
            authorsNote={noteAbove && <AuthorsNoteGroup level="chat" inStory={!!storySetup} layer={session.setup} above={noteAbove} onChange={(setup) => onChangeSession({ ...session, setup })} />}
            lore={<>
              <SessionLorebooks session={session} all={lorebooks} load={loadLorebooks} onChangeSession={onChangeSession} onOpen={onOpenLorebook} />
              <SessionRegex rows={regexRows} regexOff={session.setup.regexOff ?? []} onOpenLibrary={() => onOpenRegex?.()}
                onChange={(regexOff) => { void onChangeSession({ ...session, setup: { ...session.setup, regexOff } }); setRegexTick((t) => t + 1); }} />
            </>}
            memory={<MemoryGroup svc={svc} session={session} headId={headId ?? null} connection={connection} storySetup={storySetup} onChangeSession={onChangeSession} refreshKey={sceneKey} />}
            character={onSaveCharacter && onOpenCharacter ? (
              <PromptCharacter cards={session.cast.filter((m) => m.characterId && characters[m.characterId]).map((m) => ({ character: characters[m.characterId!]!, variantId: m.variantId }))}
                avatars={avatars} onSave={onSaveCharacter} onOpenEditor={onOpenCharacter} />
            ) : undefined}
            preview={() => { const r = connection.forRequest(); return svc.chat.turns.previewPrompt(session.id, headId ?? null, r.connection, { connections: r.connections, userText: input }); }} />}
          reply={<ReplyPane providers={providers} svc={svc} session={session} storySetup={storySetup} messageId={replyFor ?? lastAi?.id ?? null} trackers={trackers} connection={connection}
            refreshKey={sceneKey} onChanged={() => setSceneKey((k) => k + 1)} />}
        />
      )}
    </div>
  );
}

/** The short receipt under the last reply: size, time, and which agents did (not) update. Click opens the Reply tab. */
function ReceiptLine({ svc, messageId, trackers, refreshKey, onDetails }: {
  svc: AppServices; messageId: string; trackers: Tracker[]; refreshKey: number; onDetails: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rec, runs] = await Promise.all([svc.store.getGenerationRecord(messageId), svc.store.listAgentRuns(messageId)]);
      if (cancelled || !rec) { if (!cancelled) setText(null); return; }
      const tokens = rec.tokensIn ?? rec.prompt.reduce((n, p) => n + approxTokens(p.content), 0);
      const name = (id: string) => trackers.find((t) => t.agent.id === id)?.agent.name ?? id;
      // trackers only: other agents show their own marks on the reply (D-047)
      const latest = new Map(runs.filter((r) => trackers.some((t) => t.agent.id === r.agentId)).map((r) => [r.agentId, r]));
      const failed = [...latest.values()].filter((r) => r.status === "failed").map((r) => name(r.agentId));
      const ok = [...latest.values()].filter((r) => r.status === "ok").length;
      const parts = [`${rec.tokensIn ? "" : "about "}${fmtTokens(tokens)} tokens, ${(rec.durationMs / 1000).toFixed(1)} s.`];
      if (failed.length) parts.push(`${failed.join(", ")} didn’t update.`);
      else if (ok) parts.push(`${ok} tracker${ok === 1 ? "" : "s"} updated.`);
      setText(parts.join(" "));
    })();
    return () => { cancelled = true; };
  }, [svc, messageId, trackers, refreshKey]);
  if (!text) return null;
  return <button className="receipt" data-testid="receipt" onClick={onDetails}>{text} <span className="receipt-link">Details</span></button>;
}

/** 12345 → "12.3k", 2500000 → "2.5M". */
function shortTokens(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}

