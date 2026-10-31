// Homunculus 2 — app shell: glass sidebar + the open view (a session, or a Library page). Author: CLAUDE, 2026-10-23;
// trackers 2026-10-27; UI direction "I" (D-018): sidebar (Sessions, Library), toolbar per view, inspector in sessions;
// 2026-10-28 (slice 1, D-019): versions of characters, personas, history, the Trash; (slice 1b, D-020): Settings.
// The look comes only from theme tokens + the appearance profile (theme/), so screens can evolve without a rewrite.
import { useCallback, useEffect, useRef, useState } from "react";
import { Lorebook, LoreSettings, Preset, type Folder, type FolderKind, type Kit, type Avatar, type Character, type Narrator, type Npc, type Persona, type Session, type SetupLayer, type Story, type TrashItem, type TrashKind, type AgentConfig, type AgentConfigInput } from "@homunculus/schemas";
import { applyLorePatch, applyToOriginal, loreChanges, patchFrom, exportChat, type ChatExportFormat, DEFAULT_PRESET, npcTagline, resolveBranches, effectiveCharacter, narratorLabel, nextChatTitle, npcSheetFields, resolveSetup, SIMPLE_NARRATOR, storyFromCard, type ConnectionConfig, type ModelInfo } from "@homunculus/core";
import { adoptEmbeddedLorebook, bookForCardExport, characterWithBook, linkCharacterToNamedBooks, linkImportedLorebook } from "@homunculus/st-lorebooks";
import { LorebookEditor } from "./ui/LorebookEditor.tsx";
import { PresetEditor } from "./ui/PresetEditor.tsx";
import { servicesReady, type AppServices } from "./core-instance.ts";
import { useConnections } from "./connection.ts";
import { UpdateBar } from "./ui/UpdateBar.tsx";
import { useUpdates } from "./updates.ts";
import { SettingsPage, type SettingsTab } from "./ui/SettingsPage.tsx";
import { imageFileToPngAvatar, readFileBytes, saveExport } from "./files.ts";
import { ChatView } from "./ui/ChatView.tsx";
import { turns, useTurns } from "./turns.ts";
import { FolderSelect, FolderView, folderAndBelow, folderLabel, VirtualTile, type FolderItem } from "./ui/Folders.tsx";
import { Picker, type PickKind } from "./ui/Picker.tsx";
import { ChatList, type ChatRow } from "./ui/ChatList.tsx";
import { CharacterEditor } from "./ui/CharacterEditor.tsx";
import { lastLineOf, Sidebar, type LibraryArea, type Place } from "./ui/Sidebar.tsx";
import { CharacterGallery, CharacterSheet, type VaultTab } from "./ui/Gallery.tsx";
import { KitSheet, SaveNpcSheet, type NpcDraft, type SaveNpcChoice, NarratorEditor, NewStorySheet, NpcEditor, narratorCard, npcCard, StorySheet, storyCard, VaultPage, type FieldSetOption, type NewStoryChoice } from "./ui/Vault.tsx";
import { changesIn, StoryPage, type NewChatChoice, type StoryChat } from "./ui/StoryPage.tsx";
import type { SetupNames, StorySetupProps } from "./ui/SetupFields.tsx";
import { TrackerEditor } from "./ui/TrackerEditor.tsx";
import { CharactersPage, LorebooksPage, PersonasPage, PresetsPage, TrackersPage, TrashPage } from "./ui/LibraryPages.tsx";
import { AgentsPage } from "./ui/AgentsPage.tsx";
import { AgentEditor } from "./ui/AgentEditor.tsx";
import { AgentTryIt } from "./ui/AgentTryIt.tsx";
import type { AgentDraft } from "./agent-draft.ts";
import { blankAgent, deleteAgent, listAgents, saveAgent } from "./agents.ts";
import { LoreChangeTag, LoreVersionBar } from "./ui/LoreVersions.tsx";
import { PersonaEditor } from "./ui/PersonaEditor.tsx";
import { Button, Icon, IconButton } from "./ui/kit.tsx";
import { Toolbar } from "./ui/Toolbar.tsx";
import { LibraryWorkspace } from "./ui/LibraryWorkspace.tsx";
import { COLLECTION_NAVIGATION, type LibraryCategory } from "./theme/navigation.ts";
import { applyProfile, BUILTIN_PROFILES, DEFAULT_PROFILE_ID } from "./theme/themes.ts";
import { blankTracker, deleteTracker, draftOf, listTrackers, saveTracker, withFieldSet, withTracker, type Tracker, type TrackerDraft, sampleFor } from "./trackers.ts";

type View =
  | { kind: "session" }
  | { kind: "characters"; id: string | "new" | null; edit?: boolean; justSaved?: boolean }
  | { kind: "personas"; id: string | "new" | null; justSaved?: boolean }
  | { kind: "presets"; id: string | null; draft?: Preset; justSaved?: boolean; block?: string }
  | { kind: "lorebooks"; id: string | null; draft?: Lorebook; justSaved?: boolean }
  | { kind: "trash" }
  | { kind: "settings"; tab: SettingsTab }
  | { kind: "trackers"; draft?: TrackerDraft; isNew?: boolean; fromSession?: boolean }
  | { kind: "agents"; id: string | null; fromSession?: boolean }
  | { kind: "vault"; tab: VaultTab; id: string | null }
  | { kind: "story"; id: string }
  | { kind: "kit"; id: string };
export interface Notice { kind: "ok" | "warn" | "error"; title: string; lines: string[]; action?: { label: string; run: () => void } }

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Small per-viewer layout memory (which panels are open). Never required: defaults apply without it. */
function usePanel(key: string, initial: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(key); return v === null ? initial : v === "1"; } catch { return initial; } });
  const toggle = useCallback(() => setOpen((v) => { try { localStorage.setItem(key, v ? "0" : "1"); } catch { /* storage unavailable */ } return !v; }), [key]);
  return [open, toggle];
}

/** Story chats made before D-031 were named "<Story>, session N": they become "Chat N" (once; the pattern is gone after). */
async function renameOldStoryChats(s: AppServices) {
  const names = Object.fromEntries((await s.store.listStories()).map((st) => [st.id, st.name]));
  for (const x of await s.store.listSessions()) {
    const m = x.storyId ? /^(.*), session (\d+)$/.exec(x.title) : null;
    if (m && m[1] === names[x.storyId!]) await s.store.saveSession({ ...x, title: `Chat ${m[2]}` });
  }
}

export function App() {
  const [svc, setSvc] = useState<AppServices | null>(null);
  const [bootError, setBootError] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
  const [loreSettings, setLoreSettings] = useState<LoreSettings>(() => LoreSettings.parse({}));
  const [defaultPersonaId, setDefaultPersonaId] = useState<string | null>(null);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [defaultSetup, setDefaultSetupState] = useState<SetupLayer>({});
  const [avatars, setAvatars] = useState<Record<string, Avatar>>({});
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  /** The lorebook editor shows this story's version of the book (D-049); null = the original. */
  const [loreVersion, setLoreVersion] = useState<{ bookId: string; storyId: string } | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [narrators, setNarrators] = useState<Narrator[]>([]);
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [lastLines, setLastLines] = useState<Record<string, string>>({});
  /** Per chat: messages on its newest path and when it was last played (for the chat lists). */
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});
  const [lastTimes, setLastTimes] = useState<Record<string, number>>({});
  const [vaultQuery, setVaultQuery] = useState("");
  // folders of every kind (round 3, D-036): the tree, which item is where, and the folder open on each page
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderMaps, setFolderMaps] = useState<Partial<Record<FolderKind, Record<string, string>>>>({});
  const [openFolder, setOpenFolder] = useState<Partial<Record<string, string | null>>>({});
  const [kits, setKits] = useState<Kit[]>([]);
  /** A chat opened from a search result: the message to show. */
  const [focusMessage, setFocusMessage] = useState<{ sessionId: string; messageId: string } | null>(null);
  /** The New story sheet: closed, or open (with a card picked when it came from "Turn into a Story"). */
  const [savingNpc, setSavingNpc] = useState<{ draft: NpcDraft; sessionId: string } | null>(null);
  const [picker, setPicker] = useState<{ title: string; kinds: PickKind[]; initial?: string } | null>(null);
  const [newStoryOpen, setNewStoryOpen] = useState<false | { cardId: string | null }>(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Branches per session (D-032): "⑂ 3" in the sidebar, "3 branches" on a story's chat card. */
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({});
  const [view, setViewNow] = useState<View>({ kind: "session" });
  const [notice, setNotice] = useState<Notice | null>(null);
  // Keep failed agent drafts across editor navigation, only within this app instance. CODEX, D-051.
  const [agentDrafts] = useState(() => new Map<string, AgentDraft>());
  const [agentPreview, setAgentPreview] = useState<AgentDraft | null>(null);
  useEffect(() => { setAgentPreview(null); }, [view]);
  const [loreBack, setLoreBack] = useState<string | null>(null);
  // the lorebook editor saves by itself (D-028), also when it closes; its last save must see the view as it is now
  const setView = setViewNow;
  const viewRef = useRef(view);
  // the way back to the session lasts while you stay in Lorebooks
  useEffect(() => { if (view.kind !== "lorebooks") setLoreBack(null); }, [view.kind]);
  viewRef.current = view;
  const [sidebarOpen, toggleSidebar] = usePanel("homunculus.ui.sidebar", true);
  const [inspectorOpen, toggleInspector] = usePanel("homunculus.ui.inspector", true);
  const connection = useConnections(svc?.store ?? null);
  // a newer version on GitHub (D-037): a quiet bar on top + Settings → About
  const updates = useUpdates();

  useEffect(() => { applyProfile(BUILTIN_PROFILES.find((p) => p.id === DEFAULT_PROFILE_ID) ?? BUILTIN_PROFILES[0]!); }, []);

  useEffect(() => {
    const search = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      if (!sidebarOpen) toggleSidebar();
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-region="sidebar"] input')?.focus());
    };
    document.addEventListener("keydown", search);
    return () => document.removeEventListener("keydown", search);
  }, [sidebarOpen, toggleSidebar]);

  /** Stories, narrators and NPCs (the Vault). */
  const refreshVault = useCallback(async (s: AppServices) => {
    const [st, na, np, ki, fo] = await Promise.all([s.store.listStories(), s.store.narrators.list(), s.store.npcs.list(), s.store.kits.list(), s.store.listFolders()]);
    setStories(st); setNarrators(na); setNpcs(np); setKits(ki); setFolders(fo);
    const maps: Partial<Record<FolderKind, Record<string, string>>> = {};
    for (const k of ["character", "npc", "narrator", "lorebook", "kit", "story"] as const) maps[k] = await s.store.folderMap(k);
    setFolderMaps(maps);
    // pictures of stories, narrators, NPCs and kits (29/10), in the same table as characters'
    const av: Record<string, Avatar> = {};
    const owned = [...st, ...na, ...np, ...ki];
    for (const x of owned) { const a = await s.store.getAvatar(x.id); if (a) av[x.id] = a; }
    setAvatars((old) => ({ ...Object.fromEntries(Object.entries(old).filter(([k]) => !owned.some((x) => x.id === k))), ...av }));
  }, []);

  const refresh = useCallback(async (s: AppServices) => {
    const [ss, cs, ts, ps, def, tr, pr] = await Promise.all([s.store.listSessions(), s.store.listCharacters(), listTrackers(s.store),
      s.store.personas.list(), s.store.getDefaultSetup(), s.store.listTrash(), s.store.presets.list()]);
    setPresets(pr);
    setLorebooks(await s.store.lorebooks.list());
    setLoreSettings(await s.store.getLoreSettings());
    const av: Record<string, Avatar> = {};
    for (const x of [...cs, ...ps]) Object.assign(av, await s.store.getAvatarsFor(x.id));
    setSessions(ss);
    setCharacters(cs);
    setPersonas(ps);
    setDefaultPersonaId(def.personaId ?? null);
    setDefaultSetupState(def);
    setTrash(tr);
    setAvatars(av);
    setTrackers(ts);
    setAgents(await listAgents(s.store));
    await refreshVault(s);
    const lines: Record<string, string> = {};
    const counts: Record<string, number> = {};
    const msgs: Record<string, number> = {};
    const times: Record<string, number> = {};
    for (const x of ss) {
      const m = await s.store.latestMessage(x.id);
      if (m) { lines[x.id] = lastLineOf(m.content); times[x.id] = m.createdAt; msgs[x.id] = (await s.store.pathTo(m.id)).length; }
      counts[x.id] = await branchCountOf(s, x.id);
    }
    setLastLines(lines);
    setBranchCounts(counts);
    setMessageCounts(msgs);
    setLastTimes(times);
    return { ss, cs };
  }, [refreshVault]);

  useEffect(() => {
    let cancelled = false;
    servicesReady.then(async (s) => {
      await renameOldStoryChats(s);
      const { ss } = await refresh(s);
      if (cancelled) return;
      setSvc(s);
      setActiveId(ss[0]?.id ?? null);
    }).catch((e) => setBootError(errorText(e)));
    return () => { cancelled = true; };
  }, [refresh]);

  // A reply finished in a chat that is not on screen: say so, with a way there (Daniel, 30/10).
  const live = useTurns();
  const phases = useRef(new Map<string, string>());
  useEffect(() => {
    for (const [id, t] of live) {
      const before = phases.current.get(id);
      phases.current.set(id, t.phase);
      if (before !== "writing" || t.phase === "writing" || t.error) continue;
      if (view.kind === "session" && activeId === id) continue;
      const chat = sessions.find((x) => x.id === id);
      setNotice({ kind: "ok", title: `Reply ready in “${chat?.title ?? "a chat"}”`, lines: [], action: { label: "Open", run: () => { setActiveId(id); setView({ kind: "session" }); } } });
    }
    for (const id of [...phases.current.keys()]) if (!live.has(id)) phases.current.delete(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // "ok" notices go away by themselves; warnings and errors wait for Dismiss (30/10)
  useEffect(() => {
    if (!notice || notice.kind !== "ok") return;
    const t = setTimeout(() => setNotice((n) => (n === notice ? null : n)), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  if (bootError) return <div className="boot error">Could not start: {bootError}</div>;
  if (!svc) return <div className="boot">Waking the homunculus…</div>;

  const byId = Object.fromEntries(characters.map((c) => [c.id, c]));
  const active = sessions.find((s) => s.id === activeId) ?? null;

  const newSession = async (characterId: string, variantId: string | null = null) => {
    const c = byId[characterId];
    const label = variantId ? c?.variants.find((v) => v.id === variantId)?.label : undefined;
    const { session } = await svc.chat.createSession({
      title: `Session with ${c?.name ?? "…"}${label ? ` (${label})` : ""}`, cast: [{ characterId, variantId }],
    });
    await refresh(svc);
    setActiveId(session.id);
    setView({ kind: "session" });
  };

  const renameSession = async (title: string) => {
    if (!active) return;
    await svc.store.saveSession({ ...active, title });
    await refresh(svc);
  };

  /** Moves something to the Trash and offers Undo. Throws a readable error when a story still uses it. */
  const toTrash = async (kind: TrashKind, id: string, name: string) => {
    await svc.store.moveToTrash(kind, id);
    await refresh(svc);
    setNotice({ kind: "ok", title: `“${name}” moved to the Trash`, lines: [], action: { label: "Undo", run: () => void restore({ kind, id, name, trashedAt: 0 }, true) } });
  };

  const restore = async (it: TrashItem, reopen = false) => {
    await svc.store.restoreFromTrash(it.kind, it.id);
    await refresh(svc);
    setNotice({ kind: "ok", title: `“${it.name}” is back`, lines: [] });
    if (reopen && it.kind === "session") { setActiveId(it.id); setView({ kind: "session" }); }
    if (reopen && it.kind === "character") setView({ kind: "characters", id: it.id });
    if (reopen && it.kind === "persona") setView({ kind: "personas", id: it.id });
    if (reopen && it.kind === "preset") setView({ kind: "presets", id: it.id });
    if (reopen && it.kind === "lorebook") setView({ kind: "lorebooks", id: it.id });
    if (reopen && it.kind === "story") setView({ kind: "story", id: it.id });
    if (reopen && it.kind === "narrator") setView({ kind: "vault", tab: "narrators", id: it.id });
    if (reopen && it.kind === "npc") setView({ kind: "vault", tab: "npcs", id: it.id });
    if (reopen && it.kind === "kit") setView({ kind: "vault", tab: "kits", id: it.id });
  };

  const deleteForever = async (it: TrashItem) => {
    try {
      await svc.store.deleteForever(it.kind, it.id);
      await refresh(svc);
    } catch (e) {
      setNotice({ kind: "error", title: `Could not delete “${it.name}”`, lines: [errorText(e)] });
    }
  };

  const emptyTrash = async () => {
    try { await svc.store.emptyTrash(); } catch (e) { setNotice({ kind: "error", title: "Could not empty the Trash", lines: [errorText(e)] }); }
    await refresh(svc);
  };

  const deleteSession = async () => {
    if (!active) return;
    turns.stop(active.id); // a reply still being written there stops
    await toTrash("session", active.id, active.title);
    const ss = await svc.store.listSessions();
    setActiveId(ss[0]?.id ?? null);
  };

  const defaultPresetId = defaultSetup.presetId ?? DEFAULT_PRESET.id;

  const savePreset = async (p: Preset) => {
    await svc.store.savePreset(p);
    await refresh(svc);
    if (view.kind === "presets" && view.draft) setView({ kind: "presets", id: p.id, justSaved: true });
  };

  const trashPreset = async (id: string) => {
    await toTrash("preset", id, presets.find((p) => p.id === id)?.name ?? "Preset");
    setView({ kind: "presets", id: null });
  };

  const exportPreset = async (p: Preset) => {
    const exporter = svc.core.presetExporters.all()[0];
    if (!exporter) return;
    try {
      const file = await exporter.export(p);
      const where = await saveExport(file);
      if (!where) return;
      setNotice({ kind: file.warnings.length ? "warn" : "ok", title: `Exported ${p.name}`, lines: [`Saved to: ${where}`, ...file.warnings] });
    } catch (e) { setNotice({ kind: "error", title: `Could not export ${p.name}`, lines: [errorText(e)] }); }
  };

  const importPresets = async (files: File[]) => {
    const importer = svc.core.presetImporters.all()[0];
    if (!importer) return;
    const imported: string[] = [];
    const lines: string[] = [];
    let last: string | null = null;
    for (const f of files) {
      try {
        const r = await importer.import(await readFileBytes(f), f.name);
        const saved = await svc.store.savePreset(r.preset);
        imported.push(saved.name);
        lines.push(...r.warnings.map((w) => (files.length > 1 ? `${f.name}: ${w}` : w)));
        last = saved.id;
      } catch (e) { lines.push(`${f.name}: ${errorText(e)}`); }
    }
    await refresh(svc);
    if (last) setView({ kind: "presets", id: last });
    setNotice({ kind: imported.length ? (lines.length ? "warn" : "ok") : "error", title: imported.length ? `Imported ${imported.length} preset(s): ${imported.join(", ")}` : "Nothing was imported", lines });
  };

  // ---- lorebooks (slice 3, D-027/D-028)
  /** Who uses a book, in words: the Default setup, characters, personas, sessions. */
  const usedByOf = (id: string): string[] => {
    const out: string[] = [];
    const inLayer = (o?: SetupLayer["lorebooks"]) => !!o && o.mode !== "keep" && o.add.includes(id);
    if (inLayer(defaultSetup.lorebooks)) out.push("Global (every session)");
    for (const c of characters) if (c.lorebookIds.includes(id)) out.push(c.name);
    for (const p of personas) if (p.lorebookIds.includes(id)) out.push(`${p.name} (persona)`);
    for (const st of stories) if (inLayer(st.setup.lorebooks)) out.push(`${st.name} (story)`);
    for (const s of sessions) if (inLayer(s.setup.lorebooks)) out.push(s.title);
    return out;
  };

  /** The editor saves every change by itself (a little after typing stops); a burst of edits is one History version. */
  const saveLorebook = async (b: Lorebook) => {
    const saved = await svc.store.saveLorebook(b, { mergeHistoryWithinMs: 2 * 60_000 });
    setLorebooks((ls) => (ls.some((x) => x.id === saved.id) ? ls.map((x) => (x.id === saved.id ? saved : x)) : [...ls, saved]));
    const v = viewRef.current;
    if (v.kind === "lorebooks" && v.draft?.id === saved.id) setViewNow({ kind: "lorebooks", id: saved.id, justSaved: true });
  };

  // a story's version of a lorebook (D-049): only its differences are saved, on the story
  const saveStoryLore = async (storyId: string, original: Lorebook, edited: Lorebook) => {
    const st = await svc.store.getStory(storyId);
    if (!st) return;
    const patch = patchFrom(original, edited, st.lorePatches[original.id], "user", Date.now());
    const empty = !Object.keys(patch.entries).length && !patch.removed.length;
    const lorePatches = { ...st.lorePatches };
    if (empty) delete lorePatches[original.id]; else lorePatches[original.id] = patch;
    await svc.store.saveStory({ ...st, lorePatches });
    await refreshVault(svc);
  };
  const resetStoryLore = async (storyId: string, bookId: string) => {
    const st = await svc.store.getStory(storyId);
    if (!st) return;
    const lorePatches = { ...st.lorePatches };
    delete lorePatches[bookId];
    await svc.store.saveStory({ ...st, lorePatches });
    await refreshVault(svc);
  };
  const applyStoryLore = async (storyId: string, original: Lorebook, ids: string[]) => {
    const st = await svc.store.getStory(storyId);
    const patch = st?.lorePatches[original.id];
    if (!st || !patch) return;
    const r = applyToOriginal(original, patch, new Set(ids));
    await saveLorebook(r.book);
    const lorePatches = { ...st.lorePatches };
    if (!Object.keys(r.patch.entries).length && !r.patch.removed.length) delete lorePatches[original.id]; else lorePatches[original.id] = r.patch;
    await svc.store.saveStory({ ...st, lorePatches });
    await refreshVault(svc);
  };

  const trashLorebook = async (id: string) => {
    await toTrash("lorebook", id, lorebooks.find((b) => b.id === id)?.name ?? "Lorebook");
    setViewNow({ kind: "lorebooks", id: null });
  };

  const exportLorebook = async (b: Lorebook) => {
    const exporter = svc.core.lorebookExporters.all()[0];
    if (!exporter) return;
    try {
      const file = await exporter.export(b);
      const where = await saveExport(file);
      if (!where) return;
      setNotice({ kind: file.warnings.length ? "warn" : "ok", title: `Exported ${b.name}`, lines: [`Saved to: ${where}`, ...file.warnings] });
    } catch (e) { setNotice({ kind: "error", title: `Could not export ${b.name}`, lines: [errorText(e)] }); }
  };

  const importLorebooks = async (files: File[]) => {
    const importer = svc.core.lorebookImporters.all()[0];
    if (!importer) return;
    const imported: string[] = [];
    const lines: string[] = [];
    let last: string | null = null;
    for (const f of files) {
      try {
        const r = await importer.import(await readFileBytes(f), f.name);
        const saved = await svc.store.saveLorebook({ ...r.lorebook, id: crypto.randomUUID() });
        const linked = await linkImportedLorebook(svc.store, saved);
        imported.push(`${saved.name} (${saved.entries.length} entries)`);
        lines.push(...r.warnings.map((w) => (files.length > 1 ? `${f.name}: ${w}` : w)));
        if (linked.length) lines.push(`${saved.name} is now used with ${linked.join(", ")} (their SillyTavern data names it).`);
        last = saved.id;
      } catch (e) { lines.push(`${f.name}: ${errorText(e)}`); }
    }
    await refresh(svc);
    if (last) setView({ kind: "lorebooks", id: last });
    setNotice({ kind: imported.length ? (lines.some((l) => !l.includes(" is now used with ")) ? "warn" : "ok") : "error", title: imported.length ? `Imported ${imported.join(", ")}` : "Nothing was imported", lines });
  };

  const setDefaultSetup = async (patch: Partial<SetupLayer>) => {
    const layer = await svc.store.getDefaultSetup();
    await svc.store.setDefaultSetup({ ...layer, ...patch });
    await refresh(svc);
    await connection.reload();
  };

  const updateSession = async (s: Session) => {
    await svc.store.saveSession(s);
    await refresh(svc);
  };

  const saveCharacter = async (c: Character) => {
    await svc.store.saveCharacter(c);
    await refresh(svc);
    if (view.kind === "characters" && view.id === "new") setView({ kind: "characters", id: c.id, edit: true, justSaved: true });
  };

  const trashCharacter = async (id: string) => {
    await toTrash("character", id, byId[id]?.name ?? "Character"); // throws a readable error if a session still uses it
    setView({ kind: "characters", id: null });
  };

  const savePersona = async (p: Persona) => {
    await svc.store.savePersona(p);
    // the first persona becomes the default, so it is used right away
    if (!defaultPersonaId && personas.length === 0) await setDefaultPersona(p.id);
    await refresh(svc);
    if (view.kind === "personas" && view.id === "new") setView({ kind: "personas", id: p.id, justSaved: true });
  };

  const setDefaultPersona = async (id: string | null) => {
    const layer = await svc.store.getDefaultSetup();
    await svc.store.setDefaultSetup({ ...layer, personaId: id, personaVariantId: null });
    await refresh(svc);
  };

  const trashPersona = async (id: string) => {
    await toTrash("persona", id, personas.find((p) => p.id === id)?.name ?? "Persona");
    setView({ kind: "personas", id: null });
  };

  const importPersonas = async (files: File[]) => {
    const importer = svc.core.personaImporters.all()[0];
    if (!importer) return;
    try {
      const picked = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await readFileBytes(f) })));
      const r = await importer.import(picked);
      const savedIds: string[] = [];
      let fileDefault: string | null = null;
      for (const p of r.personas) {
        const saved = await svc.store.savePersona(p.persona);
        if (p.avatar) await svc.store.setAvatar(saved.id, p.avatar);
        savedIds.push(saved.id);
        if (p.isDefault) fileDefault = saved.id;
      }
      // no default yet: SillyTavern's default, else the first one imported
      const pickDefault = fileDefault ?? savedIds[0];
      if (!defaultPersonaId && pickDefault) await setDefaultPersona(pickDefault);
      await refresh(svc);
      setView({ kind: "personas", id: null });
      setNotice({
        kind: r.warnings.length ? "warn" : "ok",
        title: r.personas.length ? `Imported ${r.personas.length} persona(s): ${r.personas.map((p) => p.persona.name).join(", ")}` : "Nothing was imported",
        lines: r.warnings,
      });
    } catch (e) {
      setNotice({ kind: "error", title: "Nothing was imported", lines: [errorText(e)] });
    }
  };

  /** fromSession: opened from the Scene tab, so Close goes back to the story. */
  const openTracker = (id: string | "new", fromSession = false) => {
    const t = trackers.find((x) => x.agent.id === id);
    setView(t ? { kind: "trackers", draft: draftOf(t), isNew: false, fromSession } : { kind: "trackers", draft: blankTracker(), isNew: true, fromSession });
  };

  const onSaveTracker = async (d: TrackerDraft): Promise<TrackerDraft> => {
    const saved = await saveTracker(svc.store, d);
    await refresh(svc);
    return saved;
  };

  // agents (slice 5, D-047)
  const openAgent = (id: string | null, fromSession = false) => setView({ kind: "agents", id, fromSession });
  const onSaveAgent = async (a: AgentConfigInput): Promise<AgentConfig> => {
    const saved = await saveAgent(svc.store, a);
    setAgents(await listAgents(svc.store));
    return saved;
  };
  const onNewAgent = async () => {
    const saved = await saveAgent(svc.store, { ...blankAgent("inject"), name: "New agent" });
    setAgents(await listAgents(svc.store));
    openAgent(saved.id);
  };
  const onDeleteAgent = async (id: string) => {
    await deleteAgent(svc.store, id);
    await refresh(svc);
    setView((current) => current.kind === "agents" && current.id === id
      ? (current.fromSession ? { kind: "session" } : { kind: "agents", id: null }) : current);
  };
  const toggleAgent = async (id: string, on: boolean) => {
    if (!active) return;
    await svc.store.saveSession(withTracker(active, id, on, storyLayerOf(active)));
    await refresh(svc);
  };

  const onDeleteTracker = async (id: string) => {
    await deleteTracker(svc.store, id);
    await refresh(svc);
    setView(view.kind === "trackers" && view.fromSession ? { kind: "session" } : { kind: "trackers" });
  };

  /** A story chat inherits its story's layer (D-031); a 1:1 chat has none. */
  const storyLayerOf = (x: Session | undefined): SetupLayer | undefined => (x?.storyId ? stories.find((st) => st.id === x.storyId)?.setup : undefined);

  const toggleTracker = async (id: string, on: boolean) => {
    if (!active) return;
    await svc.store.saveSession(withTracker(active, id, on, storyLayerOf(active)));
    await refresh(svc);
  };

  const pickFieldSet = async (id: string, setId: string | null) => {
    if (!active) return;
    await svc.store.saveSession(withFieldSet(active, id, setId, storyLayerOf(active)));
    await refresh(svc);
  };

  const importFiles = async (files: File[]) => {
    const importers = svc.core.characterImporters.all();
    const imported: string[] = [];
    const problems: string[] = [];
    const warnings: string[] = [];
    let lastId: string | null = null;
    for (const file of files) {
      const importer = importers.find((i) => i.extensions.some((ext) => file.name.toLowerCase().endsWith(ext)));
      if (!importer) { problems.push(`${file.name}: this kind of file can't be imported.`); continue; }
      try {
        for (const r of await importer.import(await readFileBytes(file), file.name)) {
          const saved = await svc.store.saveCharacter({ ...r.character, id: crypto.randomUUID() });
          if (r.avatar) await svc.store.setAvatar(saved.id, r.avatar);
          // its embedded lorebook becomes a lorebook linked to it; books it names as its world get linked too
          const book = await adoptEmbeddedLorebook(svc.store, saved);
          await linkCharacterToNamedBooks(svc.store, (await svc.store.getCharacter(saved.id)) ?? saved);
          if (book) warnings.push(`${saved.name}: its embedded lorebook "${book.name}" (${book.entries.length} entries) was added to your lorebooks and is used with ${saved.name}.`);
          imported.push(saved.name);
          warnings.push(...r.warnings);
          lastId = saved.id;
        }
      } catch (e) {
        problems.push(`${file.name}: ${errorText(e)}`);
      }
    }
    await refresh(svc);
    if (imported.length === 1 && lastId) setView({ kind: "characters", id: lastId });
    setNotice({
      kind: problems.length ? (imported.length ? "warn" : "error") : warnings.length ? "warn" : "ok",
      title: imported.length ? `Imported ${imported.length} character(s): ${imported.join(", ")}` : "Nothing was imported",
      lines: [...problems, ...warnings],
    });
  };

  /** ownerKey: a character or persona id, or "<id>#<version>" for a version's own picture. */
  const changeAvatar = async (ownerKey: string, file: File | null) => {
    try {
      await svc.store.setAvatar(ownerKey, file ? await imageFileToPngAvatar(file) : null);
      await refresh(svc);
    } catch (e) {
      setNotice({ kind: "error", title: "Could not change the image", lines: [errorText(e)] });
    }
  };

  const exportCharacter = async (c: Character, exporterId: string, avatar: Avatar | undefined) => {
    const exporter = svc.core.characterExporters.get(exporterId);
    if (!exporter) return;
    try {
      // the card carries its lorebook (the one it came with, edits included), like SillyTavern does
      const where = await saveExport(await exporter.export(characterWithBook(c, await bookForCardExport(svc.store, c)), avatar));
      if (!where) return;
      setNotice({ kind: "ok", title: `Exported ${c.name}`, lines: [`Saved to: ${where}`] });
    } catch (e) {
      setNotice({ kind: "error", title: `Could not export ${c.name}`, lines: [errorText(e)] });
    }
  };

  // ---- stories and the Vault (slice 4, D-029)
  const narratorNames = { narrators: Object.fromEntries(narrators.map((n) => [n.id, n.name])), characters: Object.fromEntries(characters.map((c) => [c.id, c.name])) };
  const narratorOf = (st: Story) => narratorLabel(st, narratorNames);
  /** A story's picture: its own, else its narrator's (card or Vault). */
  const storyAvatar = (st: Story) => avatars[st.id] ?? (st.narrator.kind === "card" ? avatars[st.narrator.characterId] : st.narrator.kind === "vault" ? avatars[st.narrator.id] : undefined);
  const sessionsOfStory = (id: string) => sessions.filter((x) => x.storyId === id);
  /** The field sets an NPC sheet can use: Scene: Characters first. */
  const fieldSets: FieldSetOption[] = trackers
    .flatMap((t) => t.sets.filter((x) => npcSheetFields(x).length > 0).map((x) => ({ id: x.id, label: `${t.agent.name.replace(/^Scene: /, "")} — ${x.name}`, schema: x, first: t.agent.id === "scene-characters" })))
    .sort((a, b) => Number(b.first) - Number(a.first))
    .map(({ first: _first, ...x }) => x);

  const saveStory = async (st: Story) => {
    const before = stories.find((x) => x.id === st.id);
    const saved = await svc.store.saveStory(st);
    setStories((ls) => ls.map((x) => (x.id === saved.id ? saved : x)));
    // a card's version changed on the story page: its chats follow (each chat copied the cast when it was made),
    // unless a chat had picked another version for itself
    const moved = saved.cast.filter((m) => { const old = before?.cast.find((o) => o.characterId === m.characterId); return old && old.variantId !== m.variantId; });
    if (!moved.length) return;
    const chats = sessions.filter((x) => x.storyId === saved.id);
    for (const chat of chats) {
      let touched = false;
      const cast = chat.cast.map((c) => {
        const m = moved.find((x) => x.characterId === c.characterId);
        const old = before?.cast.find((o) => o.characterId === c.characterId);
        if (!m || !old || c.variantId !== old.variantId) return c;
        touched = true;
        return { ...c, variantId: m.variantId };
      });
      if (touched) await svc.store.saveSession({ ...chat, cast });
    }
    setSessions(await svc.store.listSessions());
  };

  const createStory = async (c: NewStoryChoice) => {
    setNewStoryOpen(false);
    const id = crypto.randomUUID();
    const card = c.fromCardId ? byId[c.fromCardId] : undefined;
    const base = card ? { ...storyFromCard(card, id, Date.now()), ...(c.name ? { name: c.name } : {}) } : { id, name: c.name, createdAt: Date.now(), setup: {} };
    const st = { ...base, userRole: c.role, setup: { ...base.setup, ...c.setup } };
    await svc.store.saveStory(st);
    await refreshVault(svc);
    setView({ kind: "story", id });
  };

  const turnIntoStory = (c: Character) => setNewStoryOpen({ cardId: c.id });

  /** New Chat in a story (D-031): its name, which opening (or one written for it) and what it changes from the story. */
  const newStoryChat = async (st: Story, c: NewChatChoice) => {
    try {
      await svc.store.saveStory(st);
      const { session } = await svc.chat.createSession({ storyId: st.id, title: c.title, openingIndex: c.openingIndex, ...(c.openingText !== undefined ? { openingText: c.openingText } : {}), setup: c.setup });
      await refresh(svc);
      setActiveId(session.id);
      setView({ kind: "session" });
    } catch (e) { setNotice({ kind: "error", title: `Could not start “${st.name}”`, lines: [errorText(e)] }); }
  };
  const playStory = (st: Story, openingIndex: number) => newStoryChat(st, { title: "", openingIndex, setup: {} });

  /** What a layer under `story` inherits, in words (the "Default · …" and "from the story" rows). */
  const namesFor = (story?: SetupLayer): SetupNames => {
    const r = resolveSetup({ default: defaultSetup, ...(story ? { story } : {}) });
    const conn = (id: string | null | undefined) => (id ? connection.byId.get(id)?.name : undefined);
    return {
      preset: presets.find((p) => p.id === (r.presetId ?? DEFAULT_PRESET.id))?.name ?? DEFAULT_PRESET.name,
      connection: conn(r.connectionId ?? connection.defaultId) ?? "none",
      agentConnection: conn(r.agentConnectionId) ?? "same as the story",
      persona: (r.personaId ? personas.find((p) => p.id === r.personaId)?.name : undefined) ?? "User (no persona)",
    };
  };
  const noteAbove = (story?: SetupLayer) => resolveSetup({ default: defaultSetup, ...(story ? { story } : {}) }).authorsNote;
  /** Asks a connection's service for its models (Settings → Connections, Quick Connection). */
  const listModels = async (config: ConnectionConfig, signal: AbortSignal): Promise<ModelInfo[]> => {
    const p = svc.core.providers.get(config.providerId);
    if (!p?.listModels) throw new Error("This AI can't list its models. Type the model's ID instead.");
    return p.listModels(config, signal);
  };
  const setupProps: StorySetupProps = { presets, profiles: connection.profiles, personas, trackers, agents, namesFor, noteAbove,
    setupAbove: (story) => resolveSetup({ default: defaultSetup, ...(story ? { story } : {}) }),
    onSavePreset: async (preset) => { await svc.store.savePreset(preset); await refresh(svc); },
    onOpenPreset: (id) => setView({ kind: "presets", id }),
  };

  /** The narrator card's greetings (a story made from a card without openings of its own uses them). */
  const greetingsOf = (st: Story): string[] => {
    if (st.narrator.kind !== "card") return [];
    const c = byId[st.narrator.characterId];
    return c ? effectiveCharacter(c, st.narrator.variantId).firstMessages : [];
  };
  /** The chats of a story as their cards show them, the one played last first. */
  const loadStoryChats = async (st: Story): Promise<StoryChat[]> => {
    const openings = st.openings.some((o) => o.trim()) ? st.openings : greetingsOf(st);
    const out: StoryChat[] = [];
    for (const x of sessionsOfStory(st.id)) {
      const latest = await svc.store.latestMessage(x.id);
      const path = latest ? await svc.store.pathTo(latest.id) : [];
      const first = path[0]?.content.trim();
      const i = first ? openings.findIndex((o) => o.trim() === first) : -1;
      out.push({ session: x, lastLine: lastLines[x.id] ?? "", messages: path.length, when: latest?.createdAt ?? x.createdAt, opening: i >= 0 ? i : null, changes: changesIn(x.setup), branches: await branchCountOf(svc, x.id) });
    }
    return out.sort((a, b) => b.when - a.when);
  };

  const duplicateStory = async (st: Story) => {
    const id = crypto.randomUUID();
    await svc.store.saveStory({ ...structuredClone(st), id, name: `${st.name} (copy)`, createdAt: Date.now() });
    await refreshVault(svc);
    setView({ kind: "story", id });
  };

  const trashStory = async (st: Story) => {
    for (const x of sessions.filter((y) => y.storyId === st.id)) turns.stop(x.id);
    await toTrash("story", st.id, st.name);
    setView({ kind: "vault", tab: "stories", id: null });
  };

  const saveNarrator = async (n: Narrator) => { await svc.store.saveNarrator(n); await refreshVault(svc); };
  const newNarrator = async () => {
    const id = crypto.randomUUID();
    await svc.store.saveNarrator({ ...SIMPLE_NARRATOR, id, name: "New narrator", builtin: false });
    await refreshVault(svc);
    setView({ kind: "vault", tab: "narrators", id });
  };
  const saveNpc = async (n: Npc) => { await svc.store.saveNpc(n); await refreshVault(svc); };
  const newNpc = async (storyId: string | null = null) => {
    const id = crypto.randomUUID();
    await svc.store.saveNpc({ id, name: "New NPC", storyId, schemaId: fieldSets[0]?.id ?? "scene-characters" });
    await refreshVault(svc);
    setView({ kind: "vault", tab: "npcs", id });
  };

  // ---- Kits (round 3, D-036): what a story starts with, kept to start new stories from. A Kit's own NPCs have
  // storyId = the Kit's id; making a story from a Kit (or a Kit from a story) COPIES them, so neither changes the other.
  const copyPicture = async (from: string, to: string) => { const a = await svc.store.getAvatar(from); if (a) await svc.store.setAvatar(to, a); };
  /** A copy of `src` (story or kit) under the id `id`: its own NPCs are copied too. */
  const copyStart = async (src: Story, id: string, name: string): Promise<Story> => {
    const npcIds: string[] = [];
    for (const nid of src.npcIds) {
      const n = npcs.find((x) => x.id === nid);
      if (n && n.storyId === src.id) {
        const copy = { ...structuredClone(n), id: crypto.randomUUID(), storyId: id };
        await svc.store.saveNpc(copy);
        await copyPicture(n.id, copy.id);
        npcIds.push(copy.id);
      } else npcIds.push(nid);
    }
    await copyPicture(src.id, id);
    return { ...structuredClone(src), id, name, npcIds, createdAt: Date.now() };
  };
  const saveKit = async (k: Kit) => { const saved = await svc.store.kits.save(k); setKits((ls) => ls.map((x) => (x.id === saved.id ? saved : x))); };
  const saveAsKit = async (st: Story) => {
    try {
      const kit = await copyStart(st, crypto.randomUUID(), st.name);
      await svc.store.kits.save(kit);
      await refreshVault(svc);
      setNotice({ kind: "ok", title: `Saved “${st.name}” as a Kit`, lines: ["It is in Library › Kits. Start new stories from it; this story is not changed."],
        action: { label: "Open the Kit", run: () => setView({ kind: "vault", tab: "kits", id: kit.id }) } });
    } catch (e) { setNotice({ kind: "error", title: "Could not save the Kit", lines: [errorText(e)] }); }
  };
  const startFromKit = async (k: Kit) => {
    try {
      const st = await copyStart(k, crypto.randomUUID(), k.name);
      await svc.store.saveStory(st);
      await refreshVault(svc);
      setView({ kind: "story", id: st.id });
    } catch (e) { setNotice({ kind: "error", title: `Could not start a story from “${k.name}”`, lines: [errorText(e)] }); }
  };
  const newKit = async () => {
    const id = crypto.randomUUID();
    await svc.store.kits.save({ id, name: "New Kit", createdAt: Date.now() });
    await refreshVault(svc);
    setView({ kind: "kit", id });
  };
  const duplicateKit = async (k: Kit) => {
    const copy = await copyStart(k, crypto.randomUUID(), `${k.name} (copy)`);
    await svc.store.kits.save(copy);
    await refreshVault(svc);
    setView({ kind: "vault", tab: "kits", id: copy.id });
  };
  const trashKit = async (k: Kit) => { await toTrash("kit", k.id, k.name); setView({ kind: "vault", tab: "kits", id: null }); };
  /** Stories and Kits, as places an NPC can be kept in. */
  const npcHomes = [...stories, ...kits.map((k) => ({ ...k, name: `Kit: ${k.name}` }))];
  const homeName = (id: string | null) => (id ? npcHomes.find((x) => x.id === id)?.name : undefined);

  // ---- folders (round 3, D-036)
  const foldersOf = (kind: FolderKind) => folders.filter((f) => f.kind === kind);
  const mapOf = (kind: FolderKind) => folderMaps[kind] ?? {};
  const folderAction = async (f: () => Promise<unknown>) => {
    try { await f(); await refreshVault(svc); } catch (e) { setNotice({ kind: "error", title: "Could not change the folders", lines: [errorText(e)] }); }
  };
  /** The folders above a page's cards; `page` keeps the open folder apart per page. */
  const folderView = (kind: FolderKind, page: string, label: string, items: FolderItem[], extra?: React.ReactNode, currentName?: string) => (
    <FolderView label={label} folders={foldersOf(kind)} map={mapOf(kind)} items={items} current={openFolder[page] ?? null} currentName={currentName}
      onOpen={(id) => setOpenFolder((o) => ({ ...o, [page]: id }))}
      onCreate={(name, parentId) => void folderAction(() => svc.store.saveFolder({ id: crypto.randomUUID(), kind, name, parentId, createdAt: Date.now() }))}
      onRename={(id, name) => void folderAction(async () => { const f = folders.find((x) => x.id === id); if (f) await svc.store.saveFolder({ ...f, name }); })}
      onDelete={(id) => void folderAction(async () => {
        const f = folders.find((x) => x.id === id);
        if (openFolder[page] && folderAndBelow(folders, id).has(openFolder[page]!)) setOpenFolder((o) => ({ ...o, [page]: f?.parentId ?? null }));
        await svc.store.deleteFolder(id);
      })}
      onMove={(itemId, folderId) => void folderAction(() => itemId.startsWith("folder:")
        ? svc.store.moveFolder(itemId.slice(7), folderId)
        : svc.store.setFolder(kind, itemId, folderId))}
      extra={extra} />
  );
  /** Is the item in the folder open on that page (directly)? */
  const inOpenFolder = (kind: FolderKind, page: string) => (id: string) => (mapOf(kind)[id] ?? null) === (openFolder[page] ?? null);
  const folderPick = (kind: FolderKind, id: string) => (
    <label className="row-line"><span className="field-label">Folder</span>
      <FolderSelect folders={foldersOf(kind)} value={mapOf(kind)[id] ?? null} onChange={(fid) => void folderAction(() => svc.store.setFolder(kind, id, fid))} />
    </label>
  );

  // ---- the big "Add…" window (round 3, D-036): cards, NPCs and narrators, with their folders
  const clip = (t: string, n = 600) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const cardKind = (exclude: string[], action: string, onPick: (id: string) => void): PickKind => ({
    key: "cards", label: "Cards", action, onPick, exclude, excludeNote: "Already in",
    folders: foldersOf("character"), map: mapOf("character"),
    recent: [...sessions].filter((x) => !x.storyId).map((x) => x.cast[0]?.characterId).filter((x): x is string => !!x).filter((x, i, a) => a.indexOf(x) === i),
    items: characters.map((c) => ({
      id: c.id, name: c.name, avatar: avatars[c.id], tags: c.tags,
      line: [c.creator && `by ${c.creator}`, c.variants.length ? `${c.variants.length + 1} versions` : ""].filter(Boolean).join(" · "),
      detail: <>{clip(c.description) || <span className="hint">No description.</span>}</>,
    })),
  });
  const npcKind = (exclude: string[], action: string, onPick: (id: string) => void): PickKind => ({
    key: "npcs", label: "NPCs", action, onPick, exclude, excludeNote: "Already in",
    folders: foldersOf("npc"), map: mapOf("npc"),
    virtual: npcHomes.map((h) => ({ id: h.id, name: h.name, note: kits.some((k) => k.id === h.id) ? "Kit's NPCs" : "Story's NPCs" })),
    items: npcs.map((n) => ({
      id: n.id, name: n.name, avatar: avatars[n.id], group: n.storyId,
      line: [npcTagline(n), n.storyId ? homeName(n.storyId) : "loose"].filter(Boolean).join(" · "),
      detail: <>{clip(Object.values(n.values).filter((v) => typeof v === "string").join("\n\n")) || <span className="hint">No details yet.</span>}</>,
    })),
  });
  const narratorKind = (current: string | null, onPick: (id: string) => void): PickKind => ({
    key: "narrators", label: "Narrators", action: "Use", onPick, exclude: current ? [current] : [], excludeNote: "Tells it now",
    folders: foldersOf("narrator"), map: mapOf("narrator"),
    items: narrators.map((n) => ({ id: n.id, name: n.name, avatar: avatars[n.id], line: n.builtin ? "Comes with Homunculus" : [n.style.pov, n.style.tone].filter(Boolean).join(" · "),
      detail: <>{clip(n.instructions) || <span className="hint">No instructions.</span>}</> })),
  });

  /** Save to the Vault, from a chat's Scene (round 3, D-036). */
  const saveNpcToVault = async (sessionId: string, c: SaveNpcChoice) => {
    setSavingNpc(null);
    try {
      let folderId = c.folderId;
      if (c.newFolder) { folderId = crypto.randomUUID(); await svc.store.saveFolder({ id: folderId, kind: "npc", name: c.newFolder, parentId: null, createdAt: Date.now() }); }
      const id = crypto.randomUUID();
      await svc.store.saveNpc({ id, name: c.name, storyId: c.storyId, schemaId: c.schemaId, values: c.values as Npc["values"], notes: "" });
      if (folderId) await svc.store.setFolder("npc", id, folderId);
      const chat = sessions.find((x) => x.id === sessionId);
      if (c.keepInChat && chat && !chat.npcIds.includes(id)) await svc.store.saveSession({ ...chat, npcIds: [...chat.npcIds, id] });
      await refresh(svc);
      setNotice({ kind: "ok", title: `${c.name} is in the Library`, lines: [c.keepInChat ? "This chat uses the Library NPC now." : "This chat is not changed."],
        action: { label: "Open in the Library", run: () => setView({ kind: "vault", tab: "npcs", id }) } });
    } catch (e) { setNotice({ kind: "error", title: `Could not save ${c.name}`, lines: [errorText(e)] }); }
  };
  const folderRows = (kind: FolderKind) => {
    const out: Array<{ id: string; label: string; depth: number }> = [];
    const walk = (parent: string | null, depth: number) => { for (const f of foldersOf(kind).filter((x) => x.parentId === parent).sort((a, b) => a.name.localeCompare(b.name))) { out.push({ id: f.id, label: f.name, depth }); walk(f.id, depth + 1); } };
    walk(null, 0);
    return out;
  };

  const storyPickers = {
    card: (exclude: string[], onPick: (id: string) => void) => setPicker({ title: "Add a Card", kinds: [cardKind(exclude, "Add", onPick)] }),
    npc: (exclude: string[], onPick: (id: string) => void) => setPicker({ title: "Add an NPC", kinds: [npcKind(exclude, "Add", onPick)] }),
    narrator: (current: string | null, onPick: (id: string) => void) => setPicker({ title: "Who tells it", kinds: [narratorKind(current, onPick)] }),
  };

  // ---- chats: search, export, open at a message (round 3, D-036)
  const searchChats = (ids: string[]) => (q: string) => svc.store.searchMessages(ids, q);
  const exportSession = async (sessionId: string, format: ChatExportFormat) => {
    try {
      const file = await exportChat(svc.store, sessionId, format);
      const where = await saveExport(file);
      if (!where) return;
      setNotice({ kind: "ok", title: `Exported “${sessions.find((x) => x.id === sessionId)?.title ?? "chat"}”`, lines: [`Saved to: ${where}`] });
    } catch (e) { setNotice({ kind: "error", title: "Could not export the chat", lines: [errorText(e)] }); }
  };
  const openChat = (sessionId: string, messageId?: string) => {
    setFocusMessage(messageId ? { sessionId, messageId } : null);
    setActiveId(sessionId);
    setView({ kind: "session" });
  };
  const renameChat = async (sessionId: string, title: string) => {
    const x = sessions.find((y) => y.id === sessionId);
    if (x) { await svc.store.saveSession({ ...x, title }); await refresh(svc); }
  };
  const trashChat = async (sessionId: string) => {
    const x = sessions.find((y) => y.id === sessionId);
    if (!x) return;
    turns.stop(x.id);
    await toTrash("session", x.id, x.title);
  };
  /** A story's chats, newest first (the Vault's story sheet). */
  const storyChatRows = (storyId: string): ChatRow[] => sessions.filter((x) => x.storyId === storyId)
    .map((x) => ({ session: x, lastLine: lastLines[x.id] ?? "", messages: messageCounts[x.id] ?? 0, when: lastTimes[x.id] ?? x.createdAt,
      badges: changesIn(x.setup) > 0 ? <span className="changed-chip">{changesIn(x.setup)} change{changesIn(x.setup) === 1 ? "" : "s"}</span> : undefined }))
    .sort((a, b) => b.when - a.when);
  const chatsLine = (rows: ChatRow[]) => rows.length ? `${rows.length} chat${rows.length === 1 ? "" : "s"} · ${new Date(rows[0]!.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No chats yet";
  /** A character's 1:1 chats, newest first. */
  const chatsWith = (characterId: string): ChatRow[] => sessions
    .filter((x) => !x.storyId && x.cast[0]?.characterId === characterId)
    .map((x) => {
      const vid = x.cast[0]?.variantId;
      const label = vid ? byId[characterId]?.variants.find((v) => v.id === vid)?.label : undefined;
      return { session: x, lastLine: lastLines[x.id] ?? "", messages: messageCounts[x.id] ?? 0, when: lastTimes[x.id] ?? x.createdAt,
        badges: label ? <span className="hint">{label} version</span> : undefined };
    })
    .sort((a, b) => b.when - a.when);

  const lead = (
    <IconButton label={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"} onClick={toggleSidebar} aria-pressed={sidebarOpen}>
      <Icon name="sidebar" size={17} />
    </IconButton>
  );
  const openLibrary = (area: LibraryArea) => { setVaultQuery(""); setView(area === "kits" || area === "narrators" || area === "npcs" ? { kind: "vault", tab: area, id: null } : area === "characters" || area === "personas" || area === "presets" || area === "lorebooks" ? { kind: area, id: null } : area === "trash" ? { kind: "trash" } : area === "agents" ? { kind: "agents", id: null } : { kind: "trackers" }); };
  const libraryCategory: LibraryCategory | null = view.kind === "vault" && view.tab !== "stories" ? view.tab : view.kind === "kit" ? "kits"
    : view.kind === "personas" || view.kind === "presets" || view.kind === "lorebooks" || view.kind === "trackers" || view.kind === "agents" || view.kind === "trash" ? view.kind : null;
  const pageLead = libraryCategory ? null : lead;
  // opened a lorebook from a session (Prompt tab): a button goes straight back to it (Daniel: "me senti perdido")
  const backSession = loreBack ? sessions.find((x) => x.id === loreBack) : undefined;
  const loreLead = backSession ? (
    <>{lead}<Button small variant="plain" className="back-btn" onClick={() => { setActiveId(backSession.id); setView({ kind: "session" }); }}
      title="Back to the session you came from"><Icon name="chevron" size={12} /> {backSession.title}</Button></>
  ) : lead;
  const noticeBar = notice && (
    <div className={`notice ${notice.kind}`} role="status" data-testid="notice">
      <div className="notice-head">
        <strong>{notice.title}</strong>
        <span className="notice-actions">
          {notice.action && <button className="link" onClick={() => { const a = notice.action!; setNotice(null); a.run(); }}>{notice.action.label}</button>}
          <button className="link" onClick={() => setNotice(null)}>Dismiss</button>
        </span>
      </div>
      {notice.lines.length > 0 && <ul>{notice.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  );

  const place: Place = libraryCategory ? "library" : view.kind === "settings" ? "settings" : view.kind === "characters" ? "characters"
    : view.kind === "story" || (view.kind === "vault" && view.tab === "stories") || (view.kind === "session" && active?.storyId) ? "stories" : null;
  let content;
  if (view.kind === "characters") {
    const editing = view.id === "new" ? null : view.id ? byId[view.id] ?? null : undefined;
    const importHelp = svc.core.characterImporters.all().map((i) => i.help).join(" ");
    const sheetOf = view.id && view.id !== "new" ? byId[view.id] : characters.find((c) => inOpenFolder("character", "characters")(c.id));
    content = !(view.edit || view.id === "new") ? (
      <CharacterGallery lead={lead} title="Characters" characters={characters} avatars={avatars} selectedId={sheetOf?.id ?? null}
        activity={Object.fromEntries(characters.map((c) => [c.id, chatsWith(c.id)[0]?.when ?? 0]))}
        importHelp={importHelp} onSelect={(id) => setView({ kind: "characters", id })} onNew={() => setView({ kind: "characters", id: "new" })}
        onImport={(files) => void importFiles(files)}
        folders={folderView("character", "characters", "characters", characters.map((c) => ({ id: c.id, name: c.name, avatar: avatars[c.id] })))}
        inFolder={(c) => inOpenFolder("character", "characters")(c.id)}
        folderOf={(c) => folderLabel(folders, mapOf("character")[c.id])}
        chatsOf={(c) => { const n = chatsWith(c.id); return n.length ? `${n.length} chat${n.length === 1 ? "" : "s"} · ${new Date(n[0]!.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No chats yet"; }}
        sheet={sheetOf ? (
          <CharacterSheet key={sheetOf.id} c={sheetOf} avatar={avatars[sheetOf.id]} avatars={avatars}
            lorebookNames={lorebooks.filter((b) => sheetOf.lorebookIds.includes(b.id)).map((b) => b.name)}
            storyNames={stories.filter((st) => st.narrator.kind === "card" && st.narrator.characterId === sheetOf.id).map((st) => st.name)}
            onContinue={chatsWith(sheetOf.id)[0] ? () => openChat(chatsWith(sheetOf.id)[0]!.session.id) : undefined}
            latestTitle={chatsWith(sheetOf.id)[0]?.session.title}
            folder={folderPick("character", sheetOf.id)}
            chats={<ChatList chats={chatsWith(sheetOf.id)} search={searchChats(chatsWith(sheetOf.id).map((x) => x.session.id))}
              onOpen={openChat} onRename={(id, t) => void renameChat(id, t)} onExport={(id, f) => void exportSession(id, f)} onTrash={(id) => void trashChat(id)}
              testId="character-chats" empty={`No chats with ${sheetOf.name} yet.`} />}
            onChat={(vid) => void newSession(sheetOf.id, vid)} onEdit={() => setView({ kind: "characters", id: sheetOf.id, edit: true })}
            onTurnIntoStory={() => void turnIntoStory(sheetOf)}
            onExport={svc.core.characterExporters.all()[0] ? () => void exportCharacter(sheetOf, svc.core.characterExporters.all()[0]!.id, avatars[sheetOf.id]) : undefined} />
        ) : null} />
    ) : (
      <CharactersPage lead={lead} characters={characters} avatars={avatars} selectedId={view.id}
        importHelp={importHelp}
        onSelect={(id) => setView({ kind: "characters", id, edit: true })} onNew={() => setView({ kind: "characters", id: "new" })}
        onImport={(files) => void importFiles(files)}
        detail={editing === undefined ? null : (
          <CharacterEditor
            key={view.id ?? "none"}
            character={editing}
            avatars={avatars}
            justSaved={view.justSaved ?? false}
            exporters={svc.core.characterExporters.all()}
            onSave={saveCharacter}
            onTrash={trashCharacter}
            onChangeAvatar={changeAvatar}
            onExport={(c, id, avatar) => void exportCharacter(c, id, avatar)}
            onStartSession={(c, variantId) => void newSession(c.id, variantId)}
            lorebooks={lorebooks}
            onOpenLorebook={(id) => setView({ kind: "lorebooks", id })}
            onClose={() => setView({ kind: "characters", id: view.id === "new" ? null : view.id })}
            loadHistory={(id) => svc.store.listHistory("character", id)}
          />
        )} />
    );
  } else if (view.kind === "personas") {
    const editing = view.id === "new" ? null : view.id ? personas.find((p) => p.id === view.id) ?? null : undefined;
    content = (
      <PersonasPage lead={pageLead} personas={personas} avatars={avatars} defaultId={defaultPersonaId} selectedId={view.id}
        importHelp={svc.core.personaImporters.all().map((i) => i.help).join(" ")}
        onSelect={(id) => setView({ kind: "personas", id })} onNew={() => setView({ kind: "personas", id: "new" })}
        onImport={(files) => void importPersonas(files)}
        detail={editing === undefined ? null : (
          <PersonaEditor
            key={view.id ?? "none"}
            persona={editing}
            avatars={avatars}
            isDefault={!!editing && editing.id === defaultPersonaId}
            justSaved={view.justSaved ?? false}
            onSave={savePersona}
            onTrash={trashPersona}
            onChangeAvatar={changeAvatar}
            onSetDefault={setDefaultPersona}
            lorebooks={lorebooks}
            onOpenLorebook={(id) => setView({ kind: "lorebooks", id })}
            onClose={() => setView({ kind: "personas", id: null })}
            loadHistory={(id) => svc.store.listHistory("persona", id)}
          />
        )} />
    );
  } else if (view.kind === "presets") {
    const editing = view.draft ?? (view.id ? presets.find((p) => p.id === view.id) : undefined);
    content = (
      <PresetsPage lead={pageLead} presets={presets} defaultId={defaultPresetId} selectedId={view.draft ? null : view.id}
        importHelp={svc.core.presetImporters.all().map((i) => i.help).join(" ")}
        onSelect={(id) => setView({ kind: "presets", id })}
        onNew={() => setView({ kind: "presets", id: null, draft: Preset.parse({ ...DEFAULT_PRESET, id: crypto.randomUUID(), name: "New preset", description: "" }) })}
        onImport={(files) => void importPresets(files)}
        detail={editing ? (
          <PresetEditor key={editing.id} preset={editing} isNew={!!view.draft} justSaved={view.justSaved ?? false} openBlock={view.block ?? null}
            isDefault={editing.id === defaultPresetId}
            onSave={savePreset} onTrash={trashPreset} onExport={(p) => void exportPreset(p)}
            onDuplicate={(p) => setView({ kind: "presets", id: null, draft: Preset.parse({ ...p, id: crypto.randomUUID(), name: `${p.name} (copy)` }) })}
            onSetDefault={(id) => setDefaultSetup({ presetId: id })}
            onClose={() => setView({ kind: "presets", id: null })}
            loadHistory={(id) => svc.store.listHistory("preset", id)} />
        ) : null} />
    );
  } else if (view.kind === "lorebooks") {
    const editing = view.draft ?? (view.id ? lorebooks.find((b) => b.id === view.id) : undefined);
    content = (
      <LorebooksPage lead={backSession ? loreLead : pageLead} books={lorebooks} selectedId={view.draft ? null : view.id}
        globalIds={defaultSetup.lorebooks && defaultSetup.lorebooks.mode !== "keep" ? defaultSetup.lorebooks.add : []}
        onSetGlobal={(ids) => void setDefaultSetup({ lorebooks: { mode: "add", add: ids, remove: (defaultSetup.lorebooks?.remove ?? []).filter((x) => !ids.includes(x)) } })}
        usedBy={Object.fromEntries(lorebooks.map((b) => { const u = usedByOf(b.id); return [b.id, u.length ? (u.length > 2 ? `${u[0]} +${u.length - 1}` : u.join(", ")) : ""]; }))}
        importHelp={svc.core.lorebookImporters.all().map((i) => i.help).join(" ")}
        onSelect={(id) => setView({ kind: "lorebooks", id })}
        folders={folderView("lorebook", "lorebooks", "lorebooks", lorebooks.map((b) => ({ id: b.id, name: b.name })))}
        inFolder={inOpenFolder("lorebook", "lorebooks")} folderOf={(id) => folderLabel(folders, mapOf("lorebook")[id])}
        onNew={() => setView({ kind: "lorebooks", id: null, draft: Lorebook.parse({ id: crypto.randomUUID(), name: "New lorebook" }) })}
        onImport={(files) => void importLorebooks(files)}
        detail={editing ? (
          (() => {
            const vs = loreVersion?.bookId === editing.id ? stories.find((x) => x.id === loreVersion.storyId) : undefined;
            const patch = vs?.lorePatches[editing.id];
            const changes = vs ? loreChanges(editing, patch) : undefined;
            const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
            const shown = vs ? applyLorePatch(editing, patch) : editing;
            return (
          <LorebookEditor key={`${editing.id}|${vs?.id ?? ""}`} book={shown} isNew={!!view.draft} justSaved={view.justSaved ?? false}
            {...(view.draft ? {} : { folder: folderPick("lorebook", editing.id) })}
            usedBy={usedByOf(editing.id)} trackers={trackers} sessions={sessions} preferredSessionId={activeId}
            onSave={vs ? (b) => saveStoryLore(vs.id, editing, b) : saveLorebook} onTrash={trashLorebook} onExport={(b) => void exportLorebook(b)}
            onDuplicate={(b) => { setViewNow({ kind: "lorebooks", id: null, draft: Lorebook.parse({ ...b, id: crypto.randomUUID(), name: `${b.name} (copy)`, source: { kind: "user" } }) }); }}
            onClose={() => setViewNow({ kind: "lorebooks", id: null })}
            loadHistory={(id) => svc.store.listHistory("lorebook", id)}
            tryIt={(b, sid, text) => svc.chat.turns.tryLorebook(b, sid, { text })}
            versionMode={!!vs}
            entryBadge={changes ? (id) => <LoreChangeTag change={changes.get(id)} by={patch?.meta[id] ? (patch.meta[id]!.by === "user" ? "you" : agentName(patch.meta[id]!.by)) : undefined} /> : undefined}
            versionBar={view.draft ? undefined : <LoreVersionBar book={editing} stories={stories} storyId={vs?.id ?? null} agentName={agentName}
              onPick={(sid) => setLoreVersion(sid ? { bookId: editing.id, storyId: sid } : null)}
              onSaveAsNew={() => setViewNow({ kind: "lorebooks", id: null, draft: Lorebook.parse({ ...shown, id: crypto.randomUUID(), name: `${editing.name} (${vs?.name})`, source: { kind: "user" } }) })}
              onApply={(ids) => { if (vs) void applyStoryLore(vs.id, editing, ids); }}
              onReset={() => { if (vs) void resetStoryLore(vs.id, editing.id); }} />} />
            );
          })()
        ) : null} />
    );
  } else if (view.kind === "settings") {
    content = (
      <SettingsPage lead={lead} tab={view.tab} onTab={(tab) => setView({ kind: "settings", tab })} c={connection} updates={updates}
        providers={svc.core.providers.all()} trackers={trackers} presets={presets} defaultPresetId={defaultPresetId} personas={personas} defaultPersonaId={defaultPersonaId}
        defaultSetup={defaultSetup} onSetDefaultSetup={setDefaultSetup} onSetDefaultPersona={setDefaultPersona}
        lorebooks={lorebooks} loreSettings={loreSettings} onSaveLoreSettings={async (x) => { setLoreSettings(await svc.store.setLoreSettings(x)); }}
        notify={(title, lines = []) => setNotice({ kind: "ok", title, lines })}
        listModels={listModels}
        test={(config) => svc.core.connections.complete(config, [{ role: "user", content: "Reply with just the word OK." }],
          { maxTokens: config.params?.maxTokens ?? 512 })} />
    );
  } else if (view.kind === "trash") {
    content = <TrashPage lead={pageLead} items={trash} onRestore={(it) => void restore(it)} onDeleteForever={(it) => void deleteForever(it)} onEmpty={() => void emptyTrash()} />;
  } else if (view.kind === "trackers") {
    content = (
      <TrackersPage lead={pageLead} trackers={trackers} selectedId={view.draft && !view.isNew ? view.draft.id : null}
        onSelect={(id) => openTracker(id)} onNew={() => openTracker("new")}
        detail={view.draft ? (
          <TrackerEditor key={view.draft.id} initial={view.draft} isNew={view.isNew ?? false}
            onSave={onSaveTracker} onDelete={onDeleteTracker} onClose={() => setView(view.fromSession ? { kind: "session" } : { kind: "trackers" })}
            loadSample={(id) => sampleFor(svc, id)} avatars={avatars} />
        ) : null} />
    );
  } else if (view.kind === "agents") {
    const editing = view.id ? agents.find((a) => a.id === view.id) : undefined;
    // A save/delete may finish after the user has opened another editor. CODEX, D-051.
    const close = () => setView((current) => current.kind === "agents" && current.id === view.id
      ? (current.fromSession ? { kind: "session" } : { kind: "agents", id: null }) : current);
    content = (
      <><AgentsPage lead={pageLead} agents={agents} stories={stories} sessions={sessions} selectedId={editing?.id ?? null}
        onSelect={(id) => openAgent(id)} onNew={() => void onNewAgent()}
        detail={editing ? <AgentEditor key={editing.id} agent={editing} agents={agents} drafts={agentDrafts} onTry={setAgentPreview} onSave={onSaveAgent} onDelete={onDeleteAgent} onClose={close} /> : null} />
      {agentPreview && editing?.id === agentPreview.snapshot().value.id && <AgentTryIt draft={agentPreview} svc={svc} sessions={sessions} stories={stories}
        characters={characters} connection={connection} defaultSetup={defaultSetup} initialSessionId={activeId} onClose={() => setAgentPreview(null)} />}</>
    );
  } else if (view.kind === "vault") {
    const q = vaultQuery.trim().toLowerCase();
    const searching = q !== "";
    const match = (name: string) => name.toLowerCase().includes(q);
    const tab = view.tab;
    const select = (id: string) => setView({ kind: "vault", tab, id });
    const page = `vault-${tab}`;
    const kindOf: Record<VaultTab, FolderKind> = { stories: "story", kits: "kit", narrators: "narrator", npcs: "npc" };
    const fkind = kindOf[tab];
    const open = openFolder[page] ?? null;
    /** Searching: everything that matches, with its folder; else the open folder's. */
    const shown = <T extends { id: string; name: string }>(xs: T[], inPlace: (x: T) => boolean = (x) => (mapOf(fkind)[x.id] ?? null) === open) =>
      searching ? xs.filter((x) => match(x.name)) : xs.filter(inPlace);
    const withFolder = <T extends { id: string; by?: string | undefined }>(c: T): T & { dragId: string } =>
      ({ ...c, dragId: c.id, ...(searching && mapOf(fkind)[c.id] ? { by: `${folderLabel(folders, mapOf(fkind)[c.id])}${c.by ? ` · ${c.by}` : ""}` } : {}) });
    let cards; let sheet; let newButton; let emptyText; let items: FolderItem[]; let extra: React.ReactNode = null; let currentName: string | undefined;
    if (tab === "stories") {
      const st = stories.find((x) => x.id === view.id) ?? (!view.id ? shown(stories)[0] : undefined);
      items = stories.map((x) => ({ id: x.id, name: x.name, avatar: storyAvatar(x) }));
      cards = shown(stories).map((x) => withFolder({ ...storyCard(x, narratorOf(x), sessionsOfStory(x.id).length, storyAvatar(x)), by: chatsLine(storyChatRows(x.id)) }));
      const rows = st ? storyChatRows(st.id) : [];
      sheet = st ? (
        <StorySheet story={st} narratorName={narratorOf(st)} npcNames={npcs.filter((n) => st.npcIds.includes(n.id)).map((n) => n.name)}
          cardNames={st.cast.filter((m) => m.characterId && m.role !== "narrator").map((m) => byId[m.characterId!]?.name ?? "").filter(Boolean)}
          avatar={storyAvatar(st)} ownImage={!!avatars[st.id]} onImage={(f) => void changeAvatar(st.id, f)}
          onOpen={() => setView({ kind: "story", id: st.id })} onNewChat={() => void playStory(st, 0)}
          onContinue={rows[0] ? () => openChat(rows[0]!.session.id) : undefined} latestTitle={rows[0]?.session.title}
          onDuplicate={() => void duplicateStory(st)} onSaveAsKit={() => void saveAsKit(st)} onTrash={() => void trashStory(st)} folder={folderPick("story", st.id)}
          chats={<ChatList chats={rows} search={searchChats(rows.map((x) => x.session.id))} testId="story-sheet-chats"
            onOpen={openChat} onRename={(id, t) => void renameChat(id, t)} onExport={(id, f) => void exportSession(id, f)} onTrash={(id) => void trashChat(id)}
            empty={`No chats in ${st.name} yet.`} />} />
      ) : null;
      newButton = <Button onClick={() => setNewStoryOpen({ cardId: null })}><Icon name="plus" size={14} /> New Story</Button>;
      emptyText = open ? "This folder is empty. Drag stories onto it." : "No stories yet. A story has a narrator, people and how it starts; each Play is a new session.";
    } else if (tab === "kits") {
      const k = kits.find((x) => x.id === view.id);
      items = kits.map((x) => ({ id: x.id, name: x.name, avatar: storyAvatar(x) }));
      cards = shown(kits).map((x) => withFolder({ ...storyCard(x, narratorOf(x), 0, storyAvatar(x)), size: `${x.npcIds.length + x.cast.length} people` }));
      sheet = k ? (
        <KitSheet kit={k} narratorName={narratorOf(k)} npcNames={npcs.filter((n) => k.npcIds.includes(n.id)).map((n) => n.name)}
          cardNames={k.cast.filter((m) => m.characterId && m.role !== "narrator").map((m) => byId[m.characterId!]?.name ?? "").filter(Boolean)}
          avatar={avatars[k.id]} onImage={(f) => void changeAvatar(k.id, f)}
          onStart={() => void startFromKit(k)} onOpen={() => setView({ kind: "kit", id: k.id })}
          onDuplicate={() => void duplicateKit(k)} onTrash={() => void trashKit(k)} folder={folderPick("kit", k.id)} />
      ) : null;
      newButton = <Button onClick={() => void newKit()}><Icon name="plus" size={14} /> New Kit</Button>;
      emptyText = open ? "This folder is empty. Drag Kits onto it." : "No Kits yet. A Kit keeps how a story starts (narrator, people, scenario, openings, setup) to start new stories from. Make one here, or from a story: More… → Save as Kit.";
    } else if (tab === "narrators") {
      const n = narrators.find((x) => x.id === view.id);
      items = narrators.map((x) => ({ id: x.id, name: x.name, avatar: avatars[x.id] }));
      cards = shown(narrators).map((x) => withFolder(narratorCard(x, stories.filter((st) => st.narrator.kind === "vault" && st.narrator.id === x.id).length, avatars[x.id])));
      sheet = n ? (
        <NarratorEditor narrator={n} usedBy={stories.filter((st) => st.narrator.kind === "vault" && st.narrator.id === n.id).map((st) => st.name)}
          avatar={avatars[n.id]} onImage={(f) => void changeAvatar(n.id, f)} folder={folderPick("narrator", n.id)}
          onSave={saveNarrator} onTrash={async () => { await toTrash("narrator", n.id, n.name); setView({ kind: "vault", tab, id: null }); }}
          onDuplicate={() => { const id = crypto.randomUUID(); void svc.store.saveNarrator({ ...n, id, name: `${n.name} (copy)`, builtin: false }).then(() => refreshVault(svc)).then(() => select(id)); }} />
      ) : null;
      newButton = <Button onClick={() => void newNarrator()}><Icon name="plus" size={14} /> New Narrator</Button>;
      emptyText = open ? "This folder is empty. Drag narrators onto it." : "No narrators.";
    } else {
      const n = npcs.find((x) => x.id === view.id);
      // a story's (or Kit's) own NPCs are a folder of their own, unless you put one in a folder of yours
      const home = open?.startsWith("home:") ? npcHomes.find((h) => h.id === open.slice(5)) : undefined;
      const loose = (x: Npc) => !mapOf("npc")[x.id];
      items = npcs.map((x) => ({ id: x.id, name: x.name, avatar: avatars[x.id] }));
      cards = shown(npcs, home ? (x) => loose(x) && x.storyId === home.id
        : (x) => (mapOf("npc")[x.id] ?? null) === open && (open !== null || !x.storyId || !npcHomes.some((h) => h.id === x.storyId)))
        .map((x) => withFolder(npcCard(x, homeName(x.storyId), avatars[x.id])));
      currentName = home?.name;
      extra = npcHomes.filter((h) => npcs.some((x) => x.storyId === h.id && loose(x))).map((h) => (
        <VirtualTile key={h.id} name={h.name} note={kits.some((k) => k.id === h.id) ? "Kit" : "Story"} label="NPCs"
          items={npcs.filter((x) => x.storyId === h.id && loose(x)).map((x) => ({ id: x.id, name: x.name, avatar: avatars[x.id] }))}
          onOpen={() => setOpenFolder((o) => ({ ...o, [page]: `home:${h.id}` }))} />
      ));
      sheet = n ? (
        <NpcEditor npc={n} fieldSets={fieldSets} stories={npcHomes} avatar={avatars[n.id]} onImage={(f) => void changeAvatar(n.id, f)} folder={folderPick("npc", n.id)}
          alsoIn={[...stories.filter((st) => st.npcIds.includes(n.id)).map((st) => `“${st.name}”`), ...sessions.filter((x) => x.npcIds.includes(n.id)).map((x) => `the chat “${x.title}”`)]}
          onSave={saveNpc} onTrash={async () => { await toTrash("npc", n.id, n.name); setView({ kind: "vault", tab, id: null }); }}
          onCopy={() => { const id = crypto.randomUUID(); void svc.store.saveNpc({ ...structuredClone(n), id, name: `${n.name} (copy)` }).then(() => refreshVault(svc)).then(() => select(id)); }} />
      ) : null;
      newButton = <Button onClick={() => void newNpc()}><Icon name="plus" size={14} /> New NPC</Button>;
      emptyText = open ? "This folder is empty. Drag NPCs onto it." : "No NPCs yet. NPCs are light sheets (Scene: Characters fields) the narrator voices. Use them in stories and chats.";
    }
    // nothing left at the top, but there are folders with things in them
    if (!open && items.length > 0 && cards.length === 0) emptyText = "Everything here is in the folders above.";
    content = (
      <VaultPage lead={pageLead} title={tab === "stories" ? "Stories" : tab === "kits" ? "Kits" : tab === "narrators" ? "Narrators" : "NPCs"} tab={tab}
        activity={Object.fromEntries(stories.map((st) => [st.id, storyChatRows(st.id)[0]?.when ?? 0]))} selectedId={view.id ?? (tab === "stories" ? cards[0]?.id ?? null : null)} onSelect={select}
        newButton={newButton} search={vaultQuery} onSearch={setVaultQuery} cards={cards} emptyText={emptyText}
        folders={folderView(fkind, page, tab === "stories" ? "stories" : tab === "kits" ? "kits" : tab === "narrators" ? "narrators" : "NPCs", items, extra, currentName)}
        sheet={sheet ?? <div className="empty-detail"><p>Pick one to see it here.</p></div>} />
    );
  } else if (view.kind === "kit") {
    const k = kits.find((x) => x.id === view.id);
    content = k ? (
      <StoryPage key={k.id} kind="kit" lead={lead} story={k} characters={characters} avatars={avatars} narrators={narrators} npcs={npcs}
        sessionsKey="" loadChats={async () => []} nextTitle="" cardGreetings={greetingsOf(k)}
        fieldSets={fieldSets} stories={npcHomes} lorebooks={lorebooks} setup={setupProps}
        onSave={saveKit} onNewChat={() => undefined} onOpenSession={() => undefined}
        onSaveNpc={saveNpc} onSaveNarrator={saveNarrator} onImage={(id, f) => void changeAvatar(id, f)} onOpenNarrator={(id) => setView({ kind: "vault", tab: "narrators", id })}
        onOpenLorebook={(id) => setView({ kind: "lorebooks", id })} folder={folderPick("kit", k.id)} pickers={storyPickers}
        onStartFromKit={(x) => void startFromKit(x)} onDuplicate={(x) => void duplicateKit(x)} onTrash={(x) => void trashKit(x)} />
    ) : (
      <div className="page"><Toolbar lead={lead} title="Kit" /><div className="empty-detail"><p>This Kit is in the Trash or was deleted.</p></div></div>
    );
  } else if (view.kind === "story") {
    const st = stories.find((x) => x.id === view.id);
    content = st ? (
      <StoryPage key={st.id} lead={lead} story={st} characters={characters} avatars={avatars} narrators={narrators} npcs={npcs}
        sessionsKey={sessionsOfStory(st.id).map((x) => `${x.id}:${x.title}:${lastLines[x.id] ?? ""}:${changesIn(x.setup)}`).join("|")}
        loadChats={() => loadStoryChats(st)} nextTitle={nextChatTitle(sessionsOfStory(st.id))} cardGreetings={greetingsOf(st)}
        fieldSets={fieldSets} stories={npcHomes} lorebooks={lorebooks} setup={setupProps}
        onSave={saveStory} onNewChat={(x, c) => void newStoryChat(x, c)} onOpenSession={(id) => { setActiveId(id); setView({ kind: "session" }); }}
        onSaveNpc={saveNpc} onSaveNarrator={saveNarrator} onImage={(id, f) => void changeAvatar(id, f)} onOpenNarrator={(id) => setView({ kind: "vault", tab: "narrators", id })}
        onOpenLorebook={(id) => setView({ kind: "lorebooks", id })} folder={folderPick("story", st.id)} pickers={storyPickers}
        chatTools={{ search: searchChats(sessionsOfStory(st.id).map((x) => x.id)), onOpen: openChat, onRename: (id, t) => void renameChat(id, t),
          onExport: (id, f) => void exportSession(id, f), onTrash: (id) => void trashChat(id) }}
        onSaveAsKit={(x) => void saveAsKit(x)}
        onDuplicate={(x) => void duplicateStory(x)} onTrash={(x) => void trashStory(x)} />
    ) : (
      <div className="page"><Toolbar lead={lead} title="Story" /><div className="empty-detail"><p>This story is in the Trash or was deleted.</p></div></div>
    );
  } else if (active) {
    const story = active.storyId ? stories.find((x) => x.id === active.storyId) : undefined;
    const chatLead = story ? (
      <>{lead}<Button small variant="plain" className="back-btn" onClick={() => setView({ kind: "story", id: story.id })}
        title="Open the story of this chat"><Icon name="chevron" size={12} /> {story.name}</Button><span className="crumb-sep" aria-hidden>/</span></>
    ) : lead;
    content = (
      <ChatView
        key={active.id}
        svc={svc}
        session={active}
        characters={byId}
        personas={personas}
        defaultPersonaId={defaultPersonaId}
        avatars={avatars}
        onChangeSession={updateSession}
        onOpenSettings={() => setView({ kind: "settings", tab: "connections" })}
          listModels={listModels}
        presets={presets}
        defaultPresetId={defaultPresetId}
        onSavePreset={async (p) => { await svc.store.savePreset(p); await refresh(svc); }}
        onOpenPreset={(id, block) => setView({ kind: "presets", id, ...(block ? { block } : {}) })}
        lorebooks={lorebooks}
        onOpenLorebook={(id) => { setLoreBack(activeId); setView({ kind: "lorebooks", id }); }}
        connection={connection}
        providers={svc.core.providers.all()}
        trackers={trackers}
        lead={chatLead}
        story={story ? { name: story.name, narrator: narratorOf(story), role: story.userRole } : undefined}
        storySetup={story?.setup}
        setupProps={setupProps}
        onOpenStory={story ? () => setView({ kind: "story", id: story.id }) : undefined}
        npcs={npcs}
        inspectorOpen={inspectorOpen}
        onToggleInspector={toggleInspector}
        onActivity={() => {
          void svc.store.listSessions().then(setSessions);
          void svc.store.latestMessage(active.id).then((m) => { if (m) setLastLines((l) => ({ ...l, [active.id]: lastLineOf(m.content) })); });
          void branchCountOf(svc, active.id).then((n) => setBranchCounts((c) => ({ ...c, [active.id]: n })));
        }}
        onOpenChat={async (id) => { await refresh(svc); setActiveId(id); setView({ kind: "session" }); }}
        onRename={(t) => void renameSession(t)}
        onDelete={() => void deleteSession()}
        onToggleTracker={(id, on) => void toggleTracker(id, on)}
        agents={agents}
        onOpenStoryLore={active?.storyId ? () => void (async () => {
          const st = await svc.store.getStory(active.storyId!);
          const id = st?.setup.lorebooks && st.setup.lorebooks.mode !== "keep" ? st.setup.lorebooks.add.find((b) => st.lorePatches[b]) ?? st.setup.lorebooks.add[0] : undefined;
          await refresh(svc);
          if (!st || !id) return;
          setLoreBack(activeId); setLoreVersion({ bookId: id, storyId: st.id }); setView({ kind: "lorebooks", id });
        })() : undefined}
        onToggleAgent={(id, on) => void toggleAgent(id, on)}
        onOpenAgent={(id) => openAgent(id, true)}
        onPickFieldSet={(id, setId) => void pickFieldSet(id, setId)}
        onEditTracker={(id) => openTracker(id, true)}
        onNewTracker={() => openTracker("new", true)}
        focusMessageId={focusMessage?.sessionId === active.id ? focusMessage.messageId : null}
        onSaveNpcToVault={(d) => setSavingNpc({ draft: d, sessionId: active.id })}
        onSaveCharacter={async (c) => { await svc.store.saveCharacter(c); await refresh(svc); }}
        onOpenCharacter={(id) => setView({ kind: "characters", id, edit: true })}
      />
    );
  } else {
    content = (
      <div className="page">
        <Toolbar lead={lead} title="Homunculus" />
        <div className="empty-detail">
          <p>No session open.</p>
          <p className="hint">Open Characters and start a chat from a character's sheet, or a story from Stories → New Story.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app" data-region="app">
      {sidebarOpen && (
        <Sidebar
          navigation={COLLECTION_NAVIGATION}
          searchItems={[
            ...characters.map((c) => ({ id: `character:${c.id}`, name: c.name, kind: "Character", onOpen: () => setView({ kind: "characters", id: c.id }) })),
            ...kits.map((k) => ({ id: `kit:${k.id}`, name: k.name, kind: "Kit", onOpen: () => setView({ kind: "kit", id: k.id }) })),
            ...narrators.map((n) => ({ id: `narrator:${n.id}`, name: n.name, kind: "Narrator", onOpen: () => setView({ kind: "vault", tab: "narrators", id: n.id }) })),
            ...npcs.map((n) => ({ id: `npc:${n.id}`, name: n.name, kind: "NPC", onOpen: () => setView({ kind: "vault", tab: "npcs", id: n.id }) })),
            ...lorebooks.map((b) => ({ id: `lorebook:${b.id}`, name: b.name, kind: "Lorebook", onOpen: () => setView({ kind: "lorebooks", id: b.id }) })),
            ...personas.map((p) => ({ id: `persona:${p.id}`, name: p.name, kind: "Persona", onOpen: () => setView({ kind: "personas", id: p.id }) })),
            ...presets.map((p) => ({ id: `preset:${p.id}`, name: p.name, kind: "Preset", onOpen: () => setView({ kind: "presets", id: p.id }) })),
            ...trackers.map((t) => ({ id: `tracker:${t.agent.id}`, name: t.agent.name, kind: "Tracker", onOpen: () => openTracker(t.agent.id) })),
            ...agents.map((a) => ({ id: `agent:${a.id}`, name: a.name, kind: "Agent", onOpen: () => openAgent(a.id) })),
          ]}
          onOpenStories={() => { setVaultQuery(""); setView({ kind: "vault", tab: "stories", id: null }); }}
          sessions={sessions}
          stories={stories}
          characters={characters}
          avatars={avatars}
          lastLines={lastLines}
          branchCounts={branchCounts}
          activeSessionId={view.kind === "session" && !active?.storyId ? activeId : null}
          activeStoryId={view.kind === "story" ? view.id : view.kind === "session" ? active?.storyId ?? null : null}
          activeChatId={view.kind === "session" && active?.storyId ? activeId : null}
          place={place}
          status={svc.isDesktop ? "saved on this PC" : "preview · not saved"}
          onOpenSession={(id) => { setActiveId(id); setView({ kind: "session" }); }}
          onOpenStory={(id) => setView({ kind: "story", id })}
          onNewStory={() => setNewStoryOpen({ cardId: null })}
          onOpenCharacters={() => setView({ kind: "characters", id: null })}
          onOpenLibrary={() => openLibrary(view.kind === "personas" || view.kind === "presets" || view.kind === "lorebooks" || view.kind === "trackers" || view.kind === "agents" || view.kind === "trash" ? view.kind : "kits")}
          onOpenVault={() => setView({ kind: "vault", tab: view.kind === "vault" ? view.tab : "stories", id: null })}
          onOpenSettings={() => setView({ kind: "settings", tab: "connections" })}
        />
      )}
      <div className="content">
        <UpdateBar u={updates} />
        {noticeBar}
        {libraryCategory ? <LibraryWorkspace lead={lead} category={libraryCategory} navigation={COLLECTION_NAVIGATION}
          counts={{ kits: kits.length, narrators: narrators.length, npcs: npcs.length, personas: personas.length, lorebooks: lorebooks.length, presets: presets.length, trackers: trackers.length, agents: agents.length, trash: trash.length }}
          onOpen={openLibrary}>{content}</LibraryWorkspace> : content}
      </div>
      {savingNpc && (() => {
        const chat = sessions.find((x) => x.id === savingNpc.sessionId);
        const st = chat?.storyId ? stories.find((x) => x.id === chat.storyId) : undefined;
        return <SaveNpcSheet draft={savingNpc.draft} fieldSets={fieldSets} story={st ? { id: st.id, name: st.name } : undefined} folders={folderRows("npc")}
          onSave={(c) => void saveNpcToVault(savingNpc.sessionId, c)} onClose={() => setSavingNpc(null)} />;
      })()}
      {picker && <Picker title={picker.title} kinds={picker.kinds} {...(picker.initial ? { initial: picker.initial } : {})} onClose={() => setPicker(null)} />}
      {newStoryOpen && <NewStorySheet characters={characters} avatars={avatars} lorebooks={lorebooks} setup={setupProps} initialCardId={newStoryOpen.cardId}
        onCreate={(c) => void createStory(c)} onClose={() => setNewStoryOpen(false)} />}
    </div>
  );
}

/** How many branches a chat has (1 for a straight chat, 0 for an empty one). */
async function branchCountOf(s: AppServices, sessionId: string): Promise<number> {
  const links = await s.store.messageLinks(sessionId);
  if (!links.length) return 0;
  return resolveBranches(links, await s.store.listBranches(sessionId), () => "new").branches.length;
}
