// Homunculus 2 — import a whole SillyTavern folder (D-128). Author: CLAUDE, 2026-11-13.
// Daniel (translated): "the complete SillyTavern importer, as planned before". Plan and his answers: docs/ST-IMPORT-PLAN.md.
//
// Order: tags → lorebooks → personas → presets → regex → Quick Replies → characters → extra links → chats → groups.
// Everything reuses the one-file importers (cards, lorebooks, personas, presets, regex, Quick Replies) so a card imported
// here is exactly a card imported by hand. Links are found by SillyTavern's names (a card's world, a persona's lorebook,
// a chat's lorebook and locked persona, the global lorebooks). Each chat is one batch (D-125/D-126).
// What came in is remembered (app setting `stImport`), so importing again skips it; the run's report lists what it
// made, so "Undo This Import" can move it all to the Trash. `secrets.json` is never read.
import type { Character, Lorebook, Persona, QuickReplySet, RegexScript, Session, SetupLayer, Speaker, Story } from "@homunculus/schemas";
import { importStLorebook } from "@homunculus/st-lorebooks";
import { importStPersonas } from "@homunculus/st-personas";
import { importStPreset } from "@homunculus/st-presets";
import { importStRegexFile } from "@homunculus/st-regex";
import { importStQuickReplies } from "@homunculus/core";
import { authorsNoteOf, buildStChatTree, chatLinksOf, groupStChats, parseStChat, saveStChat, type ParsedStChat } from "@homunculus/st-chats";
import type { AppServices } from "./core-instance.ts";
import { importCharacterFile } from "./importCharacters.ts";
import type { FolderSource, StScan } from "./stFolder.ts";

export type StKind = "characters" | "chats" | "groups" | "lorebooks" | "personas" | "presets" | "regex" | "quickReplies" | "tags";
export const ST_KINDS: StKind[] = ["characters", "chats", "groups", "lorebooks", "personas", "presets", "regex", "quickReplies", "tags"];

export interface StImportOptions {
  kinds: Record<StKind, boolean>;
  /** Card folder names (`chats/<name>`) whose chats to bring; undefined = all. */
  chatsOf?: string[];
}

export interface StProgress { stage: string; done: number; total: number; detail?: string }

/** Pause / cancel from the screen: checked between items (what came in stays). */
export interface StControl { paused: boolean; cancelled: boolean }

export interface StReport {
  user: string;
  startedAt: number;
  endedAt: number;
  cancelled: boolean;
  counts: Record<StKind | "messages" | "branches" | "swipes" | "alreadyHere", number>;
  /** Links made by name. */
  links: { cards: number; personas: number; chats: number; global: number };
  /** The preset SillyTavern had selected (by name), when it came in. */
  presetInUse?: string;
  /** The persona this run made the default (there was none). */
  defaultPersona?: string;
  warnings: Array<{ kind: StKind; text: string }>;
  skipped: StScan["skipped"];
  /** Everything this run made: for Undo This Import. */
  made: { characters: string[]; lorebooks: string[]; personas: string[]; presets: string[]; sessions: string[]; stories: string[]; regex: string[]; quickReplies: string[] };
}

/** What earlier imports brought (by SillyTavern file name / key), so a second run skips it. */
export interface StImported {
  cards: Record<string, string>;
  lorebooks: Record<string, string>;
  personas: Record<string, string>;
  presets: Record<string, string>;
  chats: Record<string, string>;
  groups: Record<string, string>;
  quickReplies: Record<string, string[]>;
  regex: Record<string, string>;
}
const EMPTY_IMPORTED: StImported = { cards: {}, lorebooks: {}, personas: {}, presets: {}, chats: {}, groups: {}, quickReplies: {}, regex: {} };
export const ST_IMPORTED_KEY = "stImport";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const base = (path: string) => path.split("/").pop() ?? path;
const stem = (name: string) => name.replace(/\.[^.]+$/, "");
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const at = (scan: StScan, sub: string) => (scan.user.dir ? `${scan.user.dir}/${sub}` : sub);

async function waitIfPaused(control: StControl | undefined): Promise<boolean> {
  while (control?.paused && !control.cancelled) await new Promise((r) => setTimeout(r, 200));
  return !!control?.cancelled;
}

/** Runs the import. `onProgress` is called often (the screen keeps only the latest). */
export async function runStImport(svc: Pick<AppServices, "core" | "store">, src: FolderSource, scan: StScan, options: StImportOptions,
  onProgress: (p: StProgress) => void = () => {}, control?: StControl): Promise<StReport> {
  const store = svc.store;
  const on = options.kinds;
  const imported: StImported = { ...EMPTY_IMPORTED, ...((await store.getAppSetting<StImported>(ST_IMPORTED_KEY)) ?? {}) };
  const report: StReport = {
    user: scan.user.name, startedAt: Date.now(), endedAt: 0, cancelled: false,
    counts: { characters: 0, chats: 0, groups: 0, lorebooks: 0, personas: 0, presets: 0, regex: 0, quickReplies: 0, tags: 0, messages: 0, branches: 0, swipes: 0, alreadyHere: 0 },
    links: { cards: 0, personas: 0, chats: 0, global: 0 },
    warnings: [], skipped: scan.skipped,
    made: { characters: [], lorebooks: [], personas: [], presets: [], sessions: [], stories: [], regex: [], quickReplies: [] },
  };
  const warn = (kind: StKind, text: string) => report.warnings.push({ kind, text });
  const save = () => store.setAppSetting(ST_IMPORTED_KEY, imported);
  const stop = async () => { if (await waitIfPaused(control)) { report.cancelled = true; return true; } return false; };

  // ---- settings.json (only this one; secrets.json is never opened)
  let settings: Obj = {};
  if (scan.hasSettings) {
    try { settings = JSON.parse(decode(await src.read(at(scan, "settings.json")))) as Obj; }
    catch { warn("tags", "settings.json could not be read: tags, personas, regex and global lorebooks were left out."); }
  }
  const worldInfo = isObj(settings.world_info_settings) && isObj((settings.world_info_settings as Obj).world_info) ? (settings.world_info_settings as Obj).world_info as Obj
    : isObj(settings.world_info) ? settings.world_info as Obj : {};

  // ---- tags: id → name, and card file → names
  const tagNames = new Map<string, string>();
  const tagMap: Record<string, string[]> = {};
  if (on.tags && Array.isArray(settings.tags)) {
    for (const t of settings.tags) if (isObj(t) && str(t.id) && str(t.name)) tagNames.set(str(t.id), str(t.name));
    if (isObj(settings.tag_map)) for (const [file, ids] of Object.entries(settings.tag_map)) {
      if (Array.isArray(ids)) tagMap[file] = ids.map((i) => tagNames.get(String(i))).filter((n): n is string => !!n);
    }
    report.counts.tags = tagNames.size;
  }

  // ---- lorebooks
  const bookByName = new Map<string, string>();
  for (const [file, id] of Object.entries(imported.lorebooks)) bookByName.set(stem(file), id);
  if (on.lorebooks) {
    const list = scan.lorebooks;
    for (const [i, path] of list.entries()) {
      if (await stop()) return finish();
      const file = base(path);
      onProgress({ stage: "Lorebooks", done: i, total: list.length, detail: stem(file) });
      if (imported.lorebooks[file] && await store.lorebooks.get(imported.lorebooks[file]!)) { report.counts.alreadyHere++; continue; }
      try {
        const r = importStLorebook(await src.read(path), file);
        const saved = await store.saveLorebook({ ...r.lorebook, id: crypto.randomUUID() }, { isNew: true });
        bookByName.set(stem(file), saved.id);
        bookByName.set(saved.name, saved.id);
        imported.lorebooks[file] = saved.id;
        report.made.lorebooks.push(saved.id);
        report.counts.lorebooks++;
        for (const w of r.warnings) warn("lorebooks", `${stem(file)}: ${w}`);
      } catch (e) { warn("lorebooks", `${file}: ${(e as Error).message}`); }
    }
    // SillyTavern's "Active World(s) for all chats" → Global Lorebooks
    const globals = (Array.isArray(worldInfo.globalSelect) ? worldInfo.globalSelect : []).map((n) => bookByName.get(String(n))).filter((x): x is string => !!x);
    if (globals.length) {
      const layer = await store.getDefaultSetup();
      const before = layer.lorebooks && layer.lorebooks.mode !== "keep" ? layer.lorebooks.add : [];
      const add = [...new Set([...before, ...globals])];
      await store.setDefaultSetup({ ...layer, lorebooks: { mode: "add", add, remove: (layer.lorebooks?.remove ?? []).filter((x) => !add.includes(x)) } });
      report.links.global = add.length - before.length;
    }
    await save();
  }
  const bookId = (name: string) => bookByName.get(name) ?? bookByName.get(stem(name));

  // ---- personas (settings.json + User Avatars)
  const personaByKey = new Map<string, string>(Object.entries(imported.personas));
  if (on.personas && scan.personas > 0) {
    onProgress({ stage: "Personas", done: 0, total: scan.personas });
    try {
      const files: Array<{ name: string; bytes: Uint8Array }> = [{ name: "settings.json", bytes: new TextEncoder().encode(JSON.stringify(settings)) }];
      const wanted = new Set(Object.keys(isObj(settings.power_user) && isObj((settings.power_user as Obj).personas) ? (settings.power_user as Obj).personas as Obj : {}));
      for (const p of scan.personaPictures) if (wanted.has(base(p)) && !imported.personas[base(p)]) files.push({ name: base(p), bytes: await src.read(p) });
      const r = importStPersonas(files);
      const defaultLayer = await store.getDefaultSetup();
      for (const p of r.personas) {
        const key = str((p.persona.original as Obj | undefined)?.avatarId);
        if (key && imported.personas[key] && await store.personas.get(imported.personas[key]!)) { report.counts.alreadyHere++; continue; }
        const lore = str((p.persona.original as Obj | undefined)?.lorebook);
        const loreId = lore ? bookId(lore) : undefined;
        if (loreId) report.links.personas++;
        const saved = await store.savePersona({ ...p.persona, ...(loreId ? { lorebookIds: [loreId] } : {}) });
        if (p.avatar) await store.setAvatar(saved.id, p.avatar);
        if (key) { personaByKey.set(key, saved.id); imported.personas[key] = saved.id; }
        report.made.personas.push(saved.id);
        report.counts.personas++;
        if (p.isDefault && !defaultLayer.personaId) { await store.setDefaultSetup({ ...(await store.getDefaultSetup()), personaId: saved.id, personaVariantId: null }); report.defaultPersona = saved.id; }
      }
      // the one-file importer's notes about picking files don't apply here
      for (const w of r.warnings) if (!/picked|keeps? for when lorebooks/i.test(w)) warn("personas", w);
    } catch (e) { warn("personas", (e as Error).message); }
    await save();
  }

  // ---- presets
  if (on.presets) {
    const inUse = str(settings.preset_settings_openai);
    for (const [i, path] of scan.presets.entries()) {
      if (await stop()) return finish();
      const file = base(path);
      onProgress({ stage: "Presets", done: i, total: scan.presets.length, detail: stem(file) });
      if (imported.presets[file] && await store.presets.get(imported.presets[file]!)) { report.counts.alreadyHere++; continue; }
      try {
        const r = importStPreset(await src.read(path), file);
        const saved = await store.savePreset({ ...r.preset, id: crypto.randomUUID() });
        imported.presets[file] = saved.id;
        report.made.presets.push(saved.id);
        report.counts.presets++;
        if (inUse && stem(file) === inUse) report.presetInUse = saved.name;
      } catch (e) { warn("presets", `${file}: ${(e as Error).message}`); }
    }
    await save();
  }

  // ---- regex (global scripts in settings.json); scripts that came with cards and presets come with them
  if (on.regex && scan.regex > 0) {
    try {
      const { scripts } = importStRegexFile(new TextEncoder().encode(JSON.stringify(settings)), "settings.json");
      const have = await store.getGlobalRegex();
      const haveIds = new Set(have.map((x) => x.id));
      const fresh: RegexScript[] = [];
      for (const s of scripts) {
        const key = `${s.name}\n${s.find}`;
        if (imported.regex[key] && haveIds.has(imported.regex[key]!)) { report.counts.alreadyHere++; continue; }
        const x = haveIds.has(s.id) ? { ...s, id: crypto.randomUUID() } : s;
        imported.regex[key] = x.id;
        fresh.push(x);
      }
      if (fresh.length) await store.setGlobalRegex([...have, ...fresh]);
      report.made.regex.push(...fresh.map((x) => x.id));
      report.counts.regex = fresh.length;
    } catch (e) { warn("regex", (e as Error).message); }
    await save();
  }

  // ---- Quick Replies
  if (on.quickReplies) {
    const data = await store.getQuickReplies();
    let sets = [...data.sets];
    const added: QuickReplySet[] = [];
    for (const path of scan.quickReplies) {
      const file = base(path);
      if (imported.quickReplies[file]?.some((id) => sets.some((s) => s.id === id))) { report.counts.alreadyHere++; continue; }
      try {
        const got = importStQuickReplies(decode(await src.read(path)), file, sets);
        sets = [...sets, ...got];
        added.push(...got);
        imported.quickReplies[file] = got.map((s) => s.id);
      } catch (e) { warn("quickReplies", `${file}: ${(e as Error).message}`); }
    }
    if (added.length) await store.setQuickReplies({ ...data, sets });
    report.made.quickReplies.push(...added.map((s) => s.id));
    report.counts.quickReplies = added.length;
    await save();
  }

  // ---- characters (each one batch, D-125); books they name as their world were imported above
  const charByFile = new Map<string, string>();
  for (const [file, id] of Object.entries(imported.cards)) charByFile.set(stem(file), id);
  if (on.characters) {
    const charLore = new Map<string, string[]>();
    for (const e of Array.isArray(worldInfo.charLore) ? worldInfo.charLore : []) {
      if (isObj(e) && Array.isArray(e.extraBooks)) charLore.set(stem(str(e.name)), e.extraBooks.map(String));
    }
    for (const [i, path] of scan.cards.entries()) {
      if (await stop()) return finish();
      const file = base(path);
      onProgress({ stage: "Characters", done: i, total: scan.cards.length, detail: stem(file) });
      if (imported.cards[file] && await store.getCharacter(imported.cards[file]!)) { report.counts.alreadyHere++; continue; }
      try {
        const [r] = await importCharacterFile(svc, await src.read(path), file, {
          source: { site: "sillytavern", id: file, url: "", addedAt: Date.now() },
          extraTags: tagMap[file] ?? tagMap[stem(file)] ?? [],
        });
        if (!r) continue;
        let c = r.character;
        // SillyTavern's extra books for this card (World Info → character lore)
        const extra = (charLore.get(stem(file)) ?? []).map(bookId).filter((x): x is string => !!x && !c.lorebookIds.includes(x));
        if (extra.length) { c = await store.saveCharacter({ ...c, lorebookIds: [...c.lorebookIds, ...extra] }); }
        if (c.lorebookIds.length) report.links.cards++;
        charByFile.set(stem(file), c.id);
        imported.cards[file] = c.id;
        report.made.characters.push(c.id);
        report.counts.characters++;
        for (const w of r.warnings) if (!/embedded lorebook/.test(w)) warn("characters", w);
      } catch (e) { warn("characters", `${file}: ${(e as Error).message}`); }
      if (i % 25 === 24) await save();
    }
    await save();
  }

  // ---- chats: one session per main chat; its branches and checkpoints join it (D-126)
  const sessionSetup = (meta: Obj): SetupLayer => {
    const note = authorsNoteOf(meta);
    const links = chatLinksOf(meta);
    const loreId = links.lorebook ? bookId(links.lorebook) : undefined;
    const personaId = links.persona ? personaByKey.get(links.persona) : undefined;
    if (loreId || personaId) report.links.chats++;
    return {
      ...(note ? { authorsNote: note } : {}),
      ...(loreId ? { lorebooks: { mode: "add" as const, add: [loreId], remove: [] } } : {}),
      ...(personaId ? { personaId, personaVariantId: null } : {}),
    } as SetupLayer;
  };
  const saveChats = async (groupKey: string, files: ParsedStChat[], make: (main: ParsedStChat) => { session: Omit<Session, "setup"> & { setup?: SetupLayer }; speakerOf: (l: ParsedStChat["lines"][number]) => Speaker }) => {
    for (const g of groupStChats(files)) {
      const key = `${groupKey}/${g.main.name}`;
      if (imported.chats[key] && await store.getSession(imported.chats[key]!)) { report.counts.alreadyHere++; continue; }
      const { session, speakerOf } = make(g.main);
      const built = buildStChatTree(g, { sessionId: session.id, speakerOf });
      if (built.messages.length === 0) continue;
      await saveStChat(store, { ...session, setup: { ...sessionSetup(g.main.header.metadata), ...(session.setup ?? {}) } }, built);
      imported.chats[key] = session.id;
      report.made.sessions.push(session.id);
      report.counts.chats++;
      report.counts.messages += built.stored;
      report.counts.branches += g.branches.length;
      report.counts.swipes += built.swipes;
      for (const c of [g.main, ...g.branches]) for (const w of c.warnings) warn("chats", `${c.name}: ${w}`);
    }
  };
  if (on.chats) {
    const owners = Object.keys(scan.chats).filter((name) => !options.chatsOf || options.chatsOf.includes(name));
    const total = owners.reduce((n, o) => n + scan.chats[o]!.length, 0);
    let done = 0;
    let missingCards = 0;
    for (const owner of owners) {
      const characterId = charByFile.get(owner);
      const paths = scan.chats[owner]!;
      if (!characterId || !(await store.getCharacter(characterId))) { missingCards += paths.length; done += paths.length; continue; }
      const files: ParsedStChat[] = [];
      for (const path of paths) {
        if (await stop()) return finish();
        onProgress({ stage: "Chats", done, total, detail: owner });
        try { files.push(parseStChat(decode(await src.read(path)), base(path))); } catch (e) { warn("chats", `${base(path)}: ${(e as Error).message}`); }
        done++;
      }
      onProgress({ stage: "Chats", done, total, detail: owner });
      try {
        await saveChats(owner, files, (main) => ({
          session: { id: crypto.randomUUID(), title: main.name, storyId: null, userRole: "player", mainCharacterId: null, scenario: "", cast: [{ characterId, variantId: null, role: "character", presence: "in_scene", muted: false, joinedAtMessageId: null }], npcIds: [], createdAt: main.header.createdAt || main.lines[0]?.sendDate || Date.now() },
          speakerOf: () => ({ kind: "character", characterId }),
        }));
      } catch (e) { warn("chats", `${owner}: ${(e as Error).message}`); }
      await save();
    }
    if (missingCards) warn("chats", `${missingCards} chat file${missingCards === 1 ? "" : "s"} belong to cards that are not in the folder (deleted in SillyTavern) or were not imported: left out.`);
  }

  // ---- groups → a Story with that cast; its chats are the story's chats (Daniel, 11/13)
  if (on.groups) {
    const chatFiles = new Map(scan.groupChats.map((p) => [stem(base(p)), p]));
    for (const [i, path] of scan.groups.entries()) {
      if (await stop()) return finish();
      onProgress({ stage: "Group chats", done: i, total: scan.groups.length });
      let g: Obj;
      try { g = JSON.parse(decode(await src.read(path))) as Obj; } catch { warn("groups", `${base(path)}: not valid JSON`); continue; }
      const gid = str(g.id) || stem(base(path));
      const members = (Array.isArray(g.members) ? g.members : []).map(String);
      const disabled = new Set((Array.isArray(g.disabled_members) ? g.disabled_members : []).map(String));
      const cast = members.map((m) => ({ file: m, id: charByFile.get(stem(m)) })).filter((m): m is { file: string; id: string } => !!m.id);
      if (!cast.length) { warn("groups", `${str(g.name) || gid}: none of its characters came in, left out.`); continue; }
      let storyId = imported.groups[gid];
      let story = storyId ? await store.stories.get(storyId) : undefined;
      if (!story) {
        story = await store.stories.save({
          id: crypto.randomUUID(), name: str(g.name) || "Group", createdAt: Date.now(),
          cast: cast.map((m) => ({ characterId: m.id, variantId: null, role: "character", presence: "in_scene", muted: disabled.has(m.file), joinedAtMessageId: null })),
        }) as Story;
        storyId = story.id;
        imported.groups[gid] = storyId;
        report.made.stories.push(storyId);
        report.counts.groups++;
      }
      const nameToId = new Map<string, string>();
      for (const m of cast) {
        const c = await store.getCharacter(m.id);
        if (c) nameToId.set(c.name.toLowerCase(), m.id);
      }
      const speakerOf = (l: ParsedStChat["lines"][number]): Speaker => {
        const byAvatar = l.avatar ? charByFile.get(stem(l.avatar)) : undefined;
        const id = byAvatar ?? nameToId.get(l.name.toLowerCase()) ?? cast[0]!.id;
        return { kind: "character", characterId: id };
      };
      const files: ParsedStChat[] = [];
      for (const chatId of (Array.isArray(g.chats) ? g.chats : []).map(String)) {
        const p = chatFiles.get(chatId) ?? chatFiles.get(stem(chatId));
        if (!p) continue;
        try { files.push(parseStChat(decode(await src.read(p)), base(p))); } catch (e) { warn("groups", `${chatId}: ${(e as Error).message}`); }
      }
      const s = story;
      try {
        await saveChats(`group:${gid}`, files, (main) => ({
          session: { id: crypto.randomUUID(), title: main.name, storyId: s.id, userRole: s.userRole, mainCharacterId: null, scenario: s.scenario, cast: s.cast, npcIds: [], createdAt: main.header.createdAt || main.lines[0]?.sendDate || Date.now() },
          speakerOf,
        }));
      } catch (e) { warn("groups", `${s.name}: ${(e as Error).message}`); }
      await save();
    }
  }

  return finish();

  function finish(): StReport {
    report.endedAt = Date.now();
    void save();
    return report;
  }
}

/** Undo This Import: everything the run made goes to the Trash (regex scripts and Quick Reply sets are removed). */
export async function undoStImport(svc: Pick<AppServices, "store">, report: StReport): Promise<void> {
  const store = svc.store;
  // chats first (a character used by a chat can't be trashed before it)
  for (const id of report.made.sessions) await store.moveToTrash("session", id).catch(() => {});
  for (const id of report.made.stories) await store.moveToTrash("story", id).catch(() => {});
  for (const id of report.made.characters) await store.moveToTrash("character", id).catch(() => {});
  if (report.defaultPersona && (await store.getDefaultSetup()).personaId === report.defaultPersona) {
    await store.setDefaultSetup({ ...(await store.getDefaultSetup()), personaId: null, personaVariantId: null });
  }
  for (const id of report.made.personas) await store.moveToTrash("persona", id).catch(() => {});
  for (const id of report.made.presets) await store.moveToTrash("preset", id).catch(() => {});
  for (const id of report.made.lorebooks) await store.moveToTrash("lorebook", id).catch(() => {});
  if (report.made.regex.length) {
    const gone = new Set(report.made.regex);
    await store.setGlobalRegex((await store.getGlobalRegex()).filter((x) => !gone.has(x.id)));
  }
  if (report.made.quickReplies.length) {
    const gone = new Set(report.made.quickReplies);
    const data = await store.getQuickReplies();
    await store.setQuickReplies({ ...data, sets: data.sets.filter((s) => !gone.has(s.id)) });
  }
  // global lorebooks that pointed at trashed books
  const layer = await store.getDefaultSetup();
  if (layer.lorebooks && layer.lorebooks.mode !== "keep") {
    const gone = new Set(report.made.lorebooks);
    await store.setDefaultSetup({ ...layer, lorebooks: { ...layer.lorebooks, add: layer.lorebooks.add.filter((x) => !gone.has(x)) } });
  }
  // forget them, so importing again brings them back
  const imported: StImported = { ...EMPTY_IMPORTED, ...((await store.getAppSetting<StImported>(ST_IMPORTED_KEY)) ?? {}) };
  const madeIds = new Set(Object.values(report.made).flat());
  for (const k of ["cards", "lorebooks", "personas", "presets", "chats", "groups", "regex"] as const) {
    imported[k] = Object.fromEntries(Object.entries(imported[k]).filter(([, id]) => !madeIds.has(id)));
  }
  imported.quickReplies = Object.fromEntries(Object.entries(imported.quickReplies).filter(([, ids]) => !ids.some((id) => madeIds.has(id))));
  await store.setAppSetting(ST_IMPORTED_KEY, imported);
}

/** How many of each kind an earlier import already brought (for "already here" on the What-was-found step). */
export async function alreadyImported(store: AppServices["store"], scan: StScan): Promise<{ cards: number; chats: number }> {
  const imported: StImported = { ...EMPTY_IMPORTED, ...((await store.getAppSetting<StImported>(ST_IMPORTED_KEY)) ?? {}) };
  return {
    cards: scan.cards.filter((p) => imported.cards[base(p)]).length,
    chats: Object.keys(imported.chats).length,
  };
}

export type { Character, Lorebook, Persona };
