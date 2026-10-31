// Homunculus 2 — the app's data store on top of SQL. Author: CLAUDE, 2026-10-23; v2 2026-10-27.
// Everything read back is validated with the shared schemas, so a damaged row is
// reported clearly instead of breaking the UI later. Data from older versions is
// upgraded on read (schemas/legacy.ts), so no data migration is needed (D-008).
import {
  AgentConfig, AgentNote, AgentRun, Avatar, Branch, type BranchInput, Character, Folder, type FolderInput, type FolderKind, Kit, Narrator, Npc, Story, ConnectionProfile, GenerationRecord, Lorebook, LoreSettings, Preset, HistoryEntry, Message, MessageKind,
  MessageRevision, MessageVisibility, Persona, Session, SetupLayer, StateDelta, TrackerSchema, TrashItem, upgradeSession,
  type HistoryKind, type TrashKind,
  type AgentConfigInput, type AgentRunInput, type LorebookInput, type LoreTimers, type ConnectionProfileInput, type PresetInput, type CharacterInput, type MessageInput, type PersonaInput,
  type SessionInput, type TrackerSchemaInput, type NarratorInput, type NpcInput, type StoryInput,
} from "@homunculus/schemas";
import type { z } from "zod";
import type { MessageTree, ResolvedState, StateRepository } from "../state.ts";
import type { SqlDriver } from "./sql.ts";

interface MessageRow {
  id: string; session_id: string; parent_id: string | null;
  speaker: string; content: string; meta: string; created_at: number;
  kind: string | null; visibility: string | null; reasoning: string | null;
}

function rowToMessage(r: MessageRow): Message {
  const speaker = JSON.parse(r.speaker) as Message["speaker"];
  return Message.parse({
    id: r.id,
    sessionId: r.session_id,
    parentId: r.parent_id,
    speaker,
    // messages saved before v2 have no kind: derive it from the speaker
    kind: r.kind ?? (speaker.kind === "user" ? "user" : "reply"),
    visibility: r.visibility ? JSON.parse(r.visibility) : undefined,
    content: r.content,
    reasoning: r.reasoning ?? undefined,
    meta: JSON.parse(r.meta),
    createdAt: Number(r.created_at),
  });
}

/** A table of JSON documents validated by a schema (characters, personas, agents…). */
class DocTable<S extends z.ZodType<{ id: string }>> {
  constructor(
    private readonly db: SqlDriver,
    private readonly table: string,
    private readonly schema: S,
    private readonly opts: { named?: boolean; upgrade?: (raw: unknown) => unknown; trashable?: boolean } = {},
  ) {}

  private parse(data: string): z.infer<S> {
    const raw = JSON.parse(data);
    return this.schema.parse(this.opts.upgrade ? this.opts.upgrade(raw) : raw);
  }

  async save(input: z.input<S>): Promise<z.infer<S>> {
    const doc = this.schema.parse(input);
    const now = Date.now();
    if (this.opts.named) {
      await this.db.execute(
        `INSERT INTO ${this.table} (id, name, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`,
        [doc.id, (doc as { name?: string }).name ?? "", JSON.stringify(doc), now],
      );
    } else {
      await this.db.execute(
        `INSERT INTO ${this.table} (id, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        [doc.id, JSON.stringify(doc), now],
      );
    }
    return doc;
  }

  async get(id: string): Promise<z.infer<S> | undefined> {
    const [row] = await this.db.select<{ data: string }>(`SELECT data FROM ${this.table} WHERE id = ?`, [id]);
    return row ? this.parse(row.data) : undefined;
  }

  /** Everything except what is in the Trash (get() still finds trashed items, so old references keep working). */
  async list(): Promise<Array<z.infer<S>>> {
    const order = this.opts.named ? "name COLLATE NOCASE" : "updated_at DESC";
    const where = this.opts.trashable ? "WHERE trashed_at IS NULL " : "";
    const rows = await this.db.select<{ data: string }>(`SELECT data FROM ${this.table} ${where}ORDER BY ${order}`);
    return rows.map((r) => this.parse(r.data));
  }

  async delete(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM ${this.table} WHERE id = ?`, [id]);
  }
}

export class SqlStore implements StateRepository, MessageTree {
  readonly personas: DocTable<typeof Persona>;
  readonly agentConfigs: DocTable<typeof AgentConfig>;
  readonly trackerSchemas: DocTable<typeof TrackerSchema>;
  readonly connections: DocTable<typeof ConnectionProfile>;
  readonly presets: DocTable<typeof Preset>;
  readonly lorebooks: DocTable<typeof Lorebook>;
  readonly stories: DocTable<typeof Story>;
  readonly narrators: DocTable<typeof Narrator>;
  readonly npcs: DocTable<typeof Npc>;
  readonly folders: DocTable<typeof Folder>;
  readonly kits: DocTable<typeof Kit>;

  constructor(private readonly db: SqlDriver) {
    this.personas = new DocTable(db, "personas", Persona, { named: true, trashable: true });
    this.agentConfigs = new DocTable(db, "agents", AgentConfig);
    this.trackerSchemas = new DocTable(db, "tracker_schemas", TrackerSchema);
    this.connections = new DocTable(db, "connection_profiles", ConnectionProfile, { named: true });
    this.presets = new DocTable(db, "presets", Preset, { named: true, trashable: true });
    this.lorebooks = new DocTable(db, "lorebooks", Lorebook, { named: true, trashable: true });
    this.stories = new DocTable(db, "stories", Story, { named: true, trashable: true });
    this.narrators = new DocTable(db, "narrators", Narrator, { named: true, trashable: true });
    this.npcs = new DocTable(db, "npcs", Npc, { named: true, trashable: true });
    this.folders = new DocTable(db, "folders", Folder, { named: true });
    this.kits = new DocTable(db, "kits", Kit, { named: true, trashable: true });
  }

  // ------------------------------------------------------------ folders (round 3, D-036): a tree per kind
  async listFolders(kind?: FolderKind): Promise<Folder[]> {
    const all = await this.folders.list();
    return kind ? all.filter((f) => f.kind === kind) : all;
  }
  saveFolder(input: FolderInput): Promise<Folder> { return this.folders.save(input); }

  /** Which folder each item of a kind is in (items not listed are at the top level). */
  async folderMap(kind: FolderKind): Promise<Record<string, string>> {
    const rows = await this.db.select<{ item_id: string; folder_id: string }>("SELECT item_id, folder_id FROM folder_items WHERE kind = ?", [kind]);
    return Object.fromEntries(rows.map((r) => [r.item_id, r.folder_id]));
  }

  /** Puts an item in a folder (null = out of any folder, at the top). */
  async setFolder(kind: FolderKind, itemId: string, folderId: string | null): Promise<void> {
    if (folderId === null) { await this.db.execute("DELETE FROM folder_items WHERE kind = ? AND item_id = ?", [kind, itemId]); return; }
    await this.db.execute(
      `INSERT INTO folder_items (kind, item_id, folder_id) VALUES (?, ?, ?)
       ON CONFLICT(kind, item_id) DO UPDATE SET folder_id = excluded.folder_id`, [kind, itemId, folderId]);
  }

  /** Deletes a folder; what was inside (items and folders) moves up to its parent. Nothing else is deleted. */
  async deleteFolder(id: string): Promise<void> {
    const f = await this.folders.get(id);
    if (!f) return;
    for (const child of (await this.listFolders(f.kind)).filter((x) => x.parentId === id)) await this.folders.save({ ...child, parentId: f.parentId });
    if (f.parentId) await this.db.execute("UPDATE folder_items SET folder_id = ? WHERE folder_id = ?", [f.parentId, id]);
    else await this.db.execute("DELETE FROM folder_items WHERE folder_id = ?", [id]);
    await this.folders.delete(id);
  }

  /** Moves a folder under another one (null = to the top). A folder never goes inside itself or its own subfolders. */
  async moveFolder(id: string, parentId: string | null): Promise<void> {
    const f = await this.folders.get(id);
    if (!f) return;
    const all = await this.listFolders(f.kind);
    for (let p = parentId; p; p = all.find((x) => x.id === p)?.parentId ?? null) if (p === id) throw new Error("A folder can't go inside itself.");
    await this.folders.save({ ...f, parentId });
  }

  // ------------------------------------------------------------ searching chats (round 3, D-036)
  /**
   * Messages of these chats that contain the words (case doesn't matter), newest first: per chat, how many and the newest
   * few with their ids (to open the chat there).
   */
  async searchMessages(sessionIds: string[], query: string, perChat = 3): Promise<Record<string, { count: number; hits: Array<{ id: string; content: string }> }>> {
    const q = query.trim();
    if (!q || !sessionIds.length) return {};
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.db.select<{ id: string; session_id: string; content: string }>(
      `SELECT id, session_id, content FROM messages WHERE session_id IN (${sessionIds.map(() => "?").join(", ")}) AND content LIKE ? ESCAPE '\\' ORDER BY created_at DESC`,
      [...sessionIds, like]);
    const out: Record<string, { count: number; hits: Array<{ id: string; content: string }> }> = {};
    for (const r of rows) {
      const o = (out[r.session_id] ??= { count: 0, hits: [] });
      o.count++;
      if (o.hits.length < perChat) o.hits.push({ id: r.id, content: r.content });
    }
    return out;
  }

  // ------------------------------------------------------------ characters
  async saveCharacter(input: CharacterInput): Promise<Character> {
    const c = Character.parse(input);
    const before = await this.getCharacter(c.id);
    await this.db.execute(
      `INSERT INTO characters (id, name, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`,
      [c.id, c.name, JSON.stringify(c), Date.now()],
    );
    await this.recordHistory("character", c.id, before, c);
    return c;
  }

  async getCharacter(id: string): Promise<Character | undefined> {
    const [row] = await this.db.select<{ data: string }>("SELECT data FROM characters WHERE id = ?", [id]);
    return row ? Character.parse(JSON.parse(row.data)) : undefined;
  }

  /** Characters in the library (not the ones in the Trash). */
  async listCharacters(): Promise<Character[]> {
    const rows = await this.db.select<{ data: string }>("SELECT data FROM characters WHERE trashed_at IS NULL ORDER BY name COLLATE NOCASE");
    return rows.map((r) => Character.parse(JSON.parse(r.data)));
  }

  /** Sessions whose cast includes this character (trashed sessions only when asked). */
  async sessionsUsingCharacter(characterId: string, includeTrashed = false): Promise<Session[]> {
    const all = includeTrashed ? await this.allSessions() : await this.listSessions();
    return all.filter((s) => s.cast.some((c) => c.characterId === characterId));
  }

  /** Deletes a character. Refuses while a session still uses it, so no story loses its character. */
  async deleteCharacter(id: string): Promise<void> {
    const using = await this.sessionsUsingCharacter(id);
    if (using.length > 0) {
      const names = using.slice(0, 3).map((s) => `"${s.title}"`).join(", ");
      throw new Error(`This character is used by ${using.length} session(s): ${names}${using.length > 3 ? "…" : ""}. Delete those sessions first.`);
    }
    await this.deleteAvatarsOf(id);
    await this.db.execute("DELETE FROM item_history WHERE kind = 'character' AND item_id = ?", [id]);
    await this.db.execute("DELETE FROM characters WHERE id = ?", [id]);
  }

  /** The owner's picture and the pictures of its variants ("<id>#<variant>"). */
  private async deleteAvatarsOf(ownerId: string): Promise<void> {
    await this.db.execute("DELETE FROM character_avatars WHERE character_id = ? OR character_id LIKE ?", [ownerId, `${ownerId}#%`]);
  }

  /** Avatars of characters, personas and variants all live here, keyed by the owner's id. */
  async setAvatar(ownerId: string, input: Avatar | null): Promise<void> {
    if (input === null) {
      await this.db.execute("DELETE FROM character_avatars WHERE character_id = ?", [ownerId]);
      return;
    }
    const a = Avatar.parse(input);
    await this.db.execute(
      `INSERT INTO character_avatars (character_id, mime, data_base64) VALUES (?, ?, ?)
       ON CONFLICT(character_id) DO UPDATE SET mime = excluded.mime, data_base64 = excluded.data_base64`,
      [ownerId, a.mime, a.base64],
    );
  }

  async getAvatar(ownerId: string): Promise<Avatar | undefined> {
    const [row] = await this.db.select<{ mime: string; data_base64: string }>(
      "SELECT mime, data_base64 FROM character_avatars WHERE character_id = ?", [ownerId]);
    return row ? { mime: row.mime, base64: row.data_base64 } : undefined;
  }

  /** The pictures of an owner and of its variants, keyed like setAvatar ("<id>" and "<id>#<variant>"). */
  async getAvatarsFor(ownerId: string): Promise<Record<string, Avatar>> {
    const rows = await this.db.select<{ character_id: string; mime: string; data_base64: string }>(
      "SELECT character_id, mime, data_base64 FROM character_avatars WHERE character_id = ? OR character_id LIKE ?", [ownerId, `${ownerId}#%`]);
    return Object.fromEntries(rows.map((r) => [r.character_id, { mime: r.mime, base64: r.data_base64 }]));
  }

  // ------------------------------------------------------------ personas, agents, tracker schemas
  async savePersona(input: PersonaInput): Promise<Persona> {
    const before = await this.personas.get(Persona.parse(input).id);
    const p = await this.personas.save(input);
    await this.recordHistory("persona", p.id, before, p);
    return p;
  }

  async savePreset(input: PresetInput): Promise<Preset> {
    const before = await this.presets.get(Preset.parse(input).id);
    const p = await this.presets.save(input);
    await this.recordHistory("preset", p.id, before, p);
    return p;
  }

  // ------------------------------------------------------------ lorebooks (slice 3)
  /**
   * `mergeHistoryWithinMs`: for saving by itself while typing (the lorebook editor saves every change, D-028) —
   * a save this soon after the last one replaces that last version in History instead of adding one, so a burst of
   * edits is one version and History keeps its older versions.
   */
  async saveLorebook(input: LorebookInput, opts: { mergeHistoryWithinMs?: number } = {}): Promise<Lorebook> {
    const before = await this.lorebooks.get(Lorebook.parse(input).id);
    const b = await this.lorebooks.save(input);
    await this.recordHistory("lorebook", b.id, before, b, opts.mergeHistoryWithinMs ?? 0);
    return b;
  }

  /** These books, leaving out unknown ones and the ones in the Trash (a trashed book is never read). */
  async lorebooksForUse(ids: string[]): Promise<Lorebook[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const rows = await this.db.select<{ id: string; data: string }>(
      `SELECT id, data FROM lorebooks WHERE trashed_at IS NULL AND id IN (${unique.map(() => "?").join(", ")})`, unique);
    const byId = new Map(rows.map((r) => [r.id, Lorebook.parse(JSON.parse(r.data))]));
    return unique.map((id) => byId.get(id)).filter((b): b is Lorebook => !!b);
  }

  /** How lorebooks are read (one set for the app for now). */
  async getLoreSettings(): Promise<LoreSettings> {
    return LoreSettings.parse((await this.getAppSetting("lore.settings")) ?? {});
  }

  async setLoreSettings(input: Partial<LoreSettings>): Promise<LoreSettings> {
    const s = LoreSettings.parse({ ...(await this.getLoreSettings()), ...input });
    await this.setAppSetting("lore.settings", s);
    return s;
  }

  /**
   * The sticky/cooldown timers that apply after this path of messages: the ones saved with the newest
   * reply on the path that has a lorebook record (swipes and branches never see each other's timers).
   */
  async loreTimersAlong(path: Array<{ id: string }>): Promise<LoreTimers | undefined> {
    const ids = path.slice(-400).map((m) => m.id);
    if (!ids.length) return undefined;
    const rows = await this.db.select<{ message_id: string; data: string }>(
      `SELECT message_id, data FROM generation_records WHERE message_id IN (${ids.map(() => "?").join(", ")})`, ids);
    const byId = new Map(rows.map((r) => [r.message_id, r.data]));
    for (let i = ids.length - 1; i >= 0; i--) {
      const data = byId.get(ids[i]!);
      if (!data) continue;
      const rec = GenerationRecord.safeParse(JSON.parse(data));
      if (rec.success && rec.data.lore) return rec.data.lore.timers;
    }
    return undefined;
  }

  /** Characters, personas and sessions that use this lorebook (for "used by…" and the Trash). */
  async whoUsesLorebook(id: string): Promise<{ characters: Character[]; personas: Persona[]; sessions: Session[]; isDefault: boolean }> {
    const [characters, personas, sessions, def] = await Promise.all([this.listCharacters(), this.personas.list(), this.listSessions(), this.getDefaultSetup()]);
    const inLayer = (o?: { mode: string; add: string[] }) => !!o && o.mode !== "keep" && o.add.includes(id);
    return {
      characters: characters.filter((c) => c.lorebookIds.includes(id)),
      personas: personas.filter((p) => p.lorebookIds.includes(id)),
      sessions: sessions.filter((s) => inLayer(s.setup.lorebooks)),
      isDefault: inLayer(def.lorebooks),
    };
  }

  /** Sessions whose own setup picks this preset. */
  async sessionsUsingPreset(presetId: string, includeTrashed = false): Promise<Session[]> {
    const all = includeTrashed ? await this.allSessions() : await this.listSessions();
    return all.filter((s) => s.setup.presetId === presetId);
  }

  /** Sessions whose own setup picks this persona (the Default layer is checked separately). */
  async sessionsUsingPersona(personaId: string, includeTrashed = false): Promise<Session[]> {
    const all = includeTrashed ? await this.allSessions() : await this.listSessions();
    return all.filter((s) => s.setup.personaId === personaId);
  }
  saveAgentConfig(input: AgentConfigInput) { return this.agentConfigs.save(input); }
  saveTrackerSchema(input: TrackerSchemaInput) { return this.trackerSchemas.save(input); }

  // ------------------------------------------------------------ connection profiles (slice 1b)
  saveConnectionProfile(input: ConnectionProfileInput) { return this.connections.save(input); }

  /**
   * Deletes a connection profile. Everything that pointed at it (the Default setup, stories,
   * sessions, agents, other profiles' backup) goes back to "use the default". Refuses for the
   * default connection itself. Returns how many sessions were changed.
   */
  async deleteConnectionProfile(id: string): Promise<number> {
    const def = await this.getDefaultSetup();
    if (def.connectionId === id) throw new Error("This is the default connection. Make another connection the default first.");
    const strip = <T extends SetupLayer>(layer: T): T | null => {
      let changed = false;
      const next: SetupLayer = { ...layer };
      if (next.connectionId === id) { delete next.connectionId; changed = true; }
      if (next.agentConnectionId === id) { delete next.agentConnectionId; changed = true; }
      if (next.agentOverrides) {
        next.agentOverrides = Object.fromEntries(Object.entries(next.agentOverrides).map(([k, o]) => {
          if (o.connectionId !== id) return [k, o];
          changed = true;
          const { connectionId: _gone, ...rest } = o;
          return [k, rest];
        }));
      }
      return changed ? (next as T) : null;
    };
    const d = strip(def);
    if (d) await this.setDefaultSetup(d);
    for (const st of await this.stories.list()) { const l = strip(st.setup); if (l) await this.stories.save({ ...st, setup: l }); }
    let sessions = 0;
    for (const s of await this.allSessions()) {
      const l = strip(s.setup);
      if (!l) continue;
      // keep the session's place in the "most recent" order: only its data changes
      await this.db.execute("UPDATE sessions SET data = ? WHERE id = ?", [JSON.stringify(Session.parse({ ...s, setup: l })), s.id]);
      sessions++;
    }
    for (const p of await this.connections.list()) if (p.fallbackId === id) await this.connections.save({ ...p, fallbackId: null });
    await this.connections.delete(id);
    return sessions;
  }

  /** What a chat has spent so far: replies plus agent/tracker runs, as the providers reported it (all branches). */
  async sessionUsage(sessionId: string): Promise<{ tokensIn: number; tokensOut: number; cost: number; calls: number }> {
    const out = { tokensIn: 0, tokensOut: 0, cost: 0, calls: 0 };
    for (const table of ["generation_records", "agent_runs"]) {
      const rows = await this.db.select<{ data: string }>(`SELECT data FROM ${table} WHERE session_id = ?`, [sessionId]);
      for (const { data } of rows) {
        try {
          const d = JSON.parse(data) as { tokensIn?: number; tokensOut?: number; cost?: number };
          out.tokensIn += d.tokensIn ?? 0; out.tokensOut += d.tokensOut ?? 0; out.cost += d.cost ?? 0; out.calls++;
        } catch { /* a damaged row adds nothing */ }
      }
    }
    return out;
  }

  // ------------------------------------------------------------ app settings
  /** A small app-wide value (JSON), e.g. which starter data was installed. */
  async getAppSetting<T = unknown>(key: string): Promise<T | undefined> {
    const [row] = await this.db.select<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  async setAppSetting(key: string, value: unknown): Promise<void> {
    await this.db.execute("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, JSON.stringify(value)]);
  }

  // the Default setup layer
  async getDefaultSetup(): Promise<SetupLayer> {
    const [row] = await this.db.select<{ value: string }>("SELECT value FROM app_settings WHERE key = 'defaultSetup'");
    return row ? SetupLayer.parse(JSON.parse(row.value)) : {};
  }

  async setDefaultSetup(layer: SetupLayer): Promise<void> {
    const v = SetupLayer.parse(layer);
    await this.db.execute(
      "INSERT INTO app_settings (key, value) VALUES ('defaultSetup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [JSON.stringify(v)],
    );
  }

  // ------------------------------------------------------------ stories, narrators, NPCs (slice 4, D-029)
  saveStory(input: StoryInput): Promise<Story> { return this.stories.save(input); }
  getStory(id: string): Promise<Story | undefined> { return this.stories.get(id); }
  listStories(): Promise<Story[]> { return this.stories.list(); }

  /** The sessions of a story, most recent first (trashed ones only when asked). */
  async sessionsOfStory(storyId: string, includeTrashed = false): Promise<Session[]> {
    const all = includeTrashed ? await this.allSessions() : await this.listSessions();
    return all.filter((s) => s.storyId === storyId);
  }

  async saveNarrator(input: NarratorInput): Promise<Narrator> {
    const before = await this.narrators.get(Narrator.parse(input).id);
    const n = await this.narrators.save(input);
    await this.recordHistory("narrator", n.id, before, n);
    return n;
  }

  async saveNpc(input: NpcInput): Promise<Npc> {
    const before = await this.npcs.get(Npc.parse(input).id);
    const n = await this.npcs.save(input);
    await this.recordHistory("npc", n.id, before, n);
    return n;
  }

  /** These NPCs in this order, leaving out unknown ones and the ones in the Trash (a trashed NPC is never sent). */
  async npcsForUse(ids: string[]): Promise<Npc[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const rows = await this.db.select<{ id: string; data: string }>(
      `SELECT id, data FROM npcs WHERE trashed_at IS NULL AND id IN (${unique.map(() => "?").join(", ")})`, unique);
    const byId = new Map(rows.map((r) => [r.id, Npc.parse(JSON.parse(r.data))]));
    return unique.flatMap((id) => { const n = byId.get(id); return n ? [n] : []; });
  }

  /** Stories that tell themselves with this narrator from the Vault. */
  async storiesUsingNarrator(narratorId: string): Promise<Story[]> {
    return (await this.stories.list()).filter((st) => st.narrator.kind === "vault" && st.narrator.id === narratorId);
  }

  /** Stories and chats an NPC is in (for "also in …" and before deleting it). */
  async whereIsNpc(npcId: string): Promise<{ stories: Story[]; sessions: Session[] }> {
    const [stories, sessions] = await Promise.all([this.stories.list(), this.listSessions()]);
    return { stories: stories.filter((st) => st.npcIds.includes(npcId)), sessions: sessions.filter((x) => x.npcIds.includes(npcId)) };
  }

  /** Stories whose narrator is this card or whose cast has it. */
  async storiesUsingCharacter(characterId: string): Promise<Story[]> {
    return (await this.stories.list()).filter((st) => (st.narrator.kind === "card" && st.narrator.characterId === characterId)
      || st.cast.some((c) => c.characterId === characterId));
  }

  // ------------------------------------------------------------ sessions
  async saveSession(input: SessionInput): Promise<Session> {
    const s = Session.parse(input);
    await this.db.execute(
      `INSERT INTO sessions (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      [s.id, JSON.stringify(s), s.createdAt, Date.now()],
    );
    return s;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const [row] = await this.db.select<{ data: string }>("SELECT data FROM sessions WHERE id = ?", [id]);
    return row ? Session.parse(upgradeSession(JSON.parse(row.data))) : undefined;
  }

  /** Most recently active first. Sessions in the Trash are left out. */
  async listSessions(): Promise<Session[]> {
    const rows = await this.db.select<{ data: string }>("SELECT data FROM sessions WHERE trashed_at IS NULL ORDER BY updated_at DESC, created_at DESC");
    return rows.map((r) => Session.parse(upgradeSession(JSON.parse(r.data))));
  }

  private async allSessions(): Promise<Session[]> {
    const rows = await this.db.select<{ data: string }>("SELECT data FROM sessions ORDER BY updated_at DESC, created_at DESC");
    return rows.map((r) => Session.parse(upgradeSession(JSON.parse(r.data))));
  }

  /** Deletes a session with all its messages, branches, world state and records. */
  async deleteSession(id: string): Promise<void> {
    const inSession = "IN (SELECT id FROM messages WHERE session_id = ?)";
    await this.db.execute(`DELETE FROM state_deltas WHERE message_id ${inSession}`, [id]);
    await this.db.execute(`DELETE FROM state_user_deltas WHERE message_id ${inSession}`, [id]);
    await this.db.execute(`DELETE FROM message_revisions WHERE message_id ${inSession}`, [id]);
    await this.db.execute("DELETE FROM state_snapshots WHERE session_id = ?", [id]);
    await this.db.execute("DELETE FROM agent_runs WHERE session_id = ?", [id]);
    await this.db.execute("DELETE FROM agent_notes WHERE session_id = ?", [id]);
    await this.db.execute("DELETE FROM generation_records WHERE session_id = ?", [id]);
    await this.db.execute("DELETE FROM state_pins WHERE session_id = ?", [id]);
    await this.db.execute("DELETE FROM branches WHERE session_id = ?", [id]);
    await this.db.execute("DELETE FROM messages WHERE session_id = ?", [id]);
    await this.db.execute("DELETE FROM sessions WHERE id = ?", [id]);
  }

  async countMessages(sessionId: string): Promise<number> {
    const [row] = await this.db.select<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE session_id = ?", [sessionId]);
    return Number(row?.n ?? 0);
  }

  // ------------------------------------------------------------ messages (a tree)
  async addMessage(input: MessageInput): Promise<Message> {
    const m = Message.parse({ kind: input.speaker.kind === "user" ? "user" : "reply", ...input });
    await this.db.execute(
      `INSERT INTO messages (id, session_id, parent_id, speaker, content, meta, created_at, kind, visibility, reasoning)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.id, m.sessionId, m.parentId, JSON.stringify(m.speaker), m.content, JSON.stringify(m.meta), m.createdAt,
        m.kind, JSON.stringify(m.visibility), m.reasoning ?? null],
    );
    // the session becomes the most recently active one
    await this.db.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", [Date.now(), m.sessionId]);
    return m;
  }

  async updateMessageContent(id: string, content: string): Promise<void> {
    await this.db.execute("UPDATE messages SET content = ? WHERE id = ?", [content, id]);
  }

  async updateMessage(id: string, change: { kind?: MessageKind; visibility?: MessageVisibility; reasoning?: string; meta?: Message["meta"] }): Promise<void> {
    const m = await this.getMessage(id);
    if (!m) throw new Error(`Message "${id}" not found`);
    const next = Message.parse({ ...m, ...change });
    await this.db.execute("UPDATE messages SET kind = ?, visibility = ?, reasoning = ?, meta = ? WHERE id = ?",
      [next.kind, JSON.stringify(next.visibility), next.reasoning ?? null, JSON.stringify(next.meta), id]);
  }

  /** The newest message of a session (any branch). */
  async latestMessage(sessionId: string): Promise<Message | undefined> {
    const [row] = await this.db.select<MessageRow>("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 1", [sessionId]);
    return row ? rowToMessage(row) : undefined;
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const [row] = await this.db.select<MessageRow>("SELECT * FROM messages WHERE id = ?", [id]);
    return row ? rowToMessage(row) : undefined;
  }

  /** Direct children of a message (swipes/branches are siblings). null = first messages of the session. */
  async childrenOf(sessionId: string, parentId: string | null): Promise<Message[]> {
    const rows = parentId === null
      ? await this.db.select<MessageRow>(
          "SELECT * FROM messages WHERE session_id = ? AND parent_id IS NULL ORDER BY created_at, id", [sessionId])
      : await this.db.select<MessageRow>(
          "SELECT * FROM messages WHERE session_id = ? AND parent_id = ? ORDER BY created_at, id", [sessionId, parentId]);
    return rows.map(rowToMessage);
  }

  /** The conversation from the first message down to `messageId`. */
  async pathTo(messageId: string): Promise<Message[]> {
    const path: Message[] = [];
    const seen = new Set<string>();
    let current: string | null = messageId;
    while (current) {
      if (seen.has(current)) throw new Error(`Message tree has a cycle at "${current}"`);
      seen.add(current);
      const m = await this.getMessage(current);
      if (!m) throw new Error(`Message "${current}" not found`);
      path.push(m);
      current = m.parentId;
    }
    return path.reverse();
  }

  async parentOf(messageId: string): Promise<string | null | undefined> {
    const [row] = await this.db.select<{ parent_id: string | null }>("SELECT parent_id FROM messages WHERE id = ?", [messageId]);
    return row ? row.parent_id : undefined;
  }

  // ------------------------------------------------------------ branches
  async saveBranch(input: BranchInput): Promise<Branch> {
    const b = Branch.parse(input);
    await this.db.execute(
      `INSERT INTO branches (id, session_id, name, head_message_id, end_message_id) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, head_message_id = excluded.head_message_id, end_message_id = excluded.end_message_id`,
      [b.id, b.sessionId, b.name, b.headMessageId, b.endMessageId],
    );
    return b;
  }

  async listBranches(sessionId: string): Promise<Branch[]> {
    const rows = await this.db.select<{ id: string; session_id: string; name: string; head_message_id: string | null; end_message_id?: string | null }>(
      "SELECT * FROM branches WHERE session_id = ? ORDER BY name", [sessionId]);
    return rows.map((r) => Branch.parse({ id: r.id, sessionId: r.session_id, name: r.name, headMessageId: r.head_message_id, endMessageId: r.end_message_id ?? null }));
  }

  /** Removes a branch's saved name (the branch itself is its messages). */
  async deleteBranch(id: string): Promise<void> {
    await this.db.execute("DELETE FROM branches WHERE id = ?", [id]);
  }

  /** Every message of a session, oldest first (the tree view, D-032). */
  async messagesOf(sessionId: string): Promise<Message[]> {
    const rows = await this.db.select<MessageRow>("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at, id", [sessionId]);
    return rows.map(rowToMessage);
  }

  /** Every message of a session as a tree link (id, parent, time): enough to find its branches (D-032). */
  async messageLinks(sessionId: string): Promise<Array<{ id: string; parentId: string | null; createdAt: number }>> {
    const rows = await this.db.select<{ id: string; parent_id: string | null; created_at: number }>(
      "SELECT id, parent_id, created_at FROM messages WHERE session_id = ? ORDER BY created_at, id", [sessionId]);
    return rows.map((r) => ({ id: r.id, parentId: r.parent_id, createdAt: Number(r.created_at) }));
  }

  /** Deletes messages for good, with everything kept per message (world state, runs, notes, records). D-032. */
  async deleteMessages(sessionId: string, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const marks = chunk.map(() => "?").join(", ");
      for (const table of ["state_deltas", "state_user_deltas", "message_revisions", "state_snapshots", "agent_runs", "agent_notes", "generation_records"]) {
        await this.db.execute(`DELETE FROM ${table} WHERE message_id IN (${marks})`, chunk);
      }
      await this.db.execute(`DELETE FROM branches WHERE session_id = ? AND (head_message_id IN (${marks}) OR end_message_id IN (${marks}))`, [sessionId, ...chunk, ...chunk]);
      await this.db.execute(`DELETE FROM messages WHERE session_id = ? AND id IN (${marks})`, [sessionId, ...chunk]);
    }
    await this.db.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", [Date.now(), sessionId]);
  }

  // ------------------------------------------------------------ records per message (BLUEPRINT §2.4)
  async saveAgentRun(input: AgentRunInput): Promise<AgentRun> {
    const r = AgentRun.parse(input);
    await this.db.execute(
      `INSERT INTO agent_runs (id, session_id, message_id, agent_id, status, stale, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, stale = excluded.stale, data = excluded.data`,
      [r.id, r.sessionId, r.messageId, r.agentId, r.status, r.stale ? 1 : 0, JSON.stringify(r), r.startedAt],
    );
    return r;
  }

  async listAgentRuns(messageId: string): Promise<AgentRun[]> {
    const rows = await this.db.select<{ data: string; stale: number }>(
      "SELECT data, stale FROM agent_runs WHERE message_id = ? ORDER BY created_at, id", [messageId]);
    return rows.map((r) => AgentRun.parse({ ...JSON.parse(r.data), stale: Number(r.stale) === 1 }));
  }

  /**
   * Marks the records of every later message in the session as out of date (an earlier
   * message or value was edited). Nothing is recalculated automatically (BLUEPRINT §2.4).
   */
  async markStaleAfter(messageId: string): Promise<number> {
    const m = await this.getMessage(messageId);
    if (!m) return 0;
    const later = "SELECT id FROM messages WHERE session_id = ? AND created_at > ?";
    const [row] = await this.db.select<{ n: number }>(
      `SELECT COUNT(*) AS n FROM agent_runs WHERE stale = 0 AND message_id IN (${later})`, [m.sessionId, m.createdAt]);
    await this.db.execute(`UPDATE agent_runs SET stale = 1 WHERE message_id IN (${later})`, [m.sessionId, m.createdAt]);
    return Number(row?.n ?? 0);
  }

  async addRevision(input: MessageRevision): Promise<MessageRevision> {
    const r = MessageRevision.parse(input);
    await this.db.execute("INSERT INTO message_revisions (id, message_id, data, created_at) VALUES (?, ?, ?, ?)",
      [r.id, r.messageId, JSON.stringify(r), r.createdAt]);
    return r;
  }

  async listRevisions(messageId: string): Promise<MessageRevision[]> {
    const rows = await this.db.select<{ data: string }>(
      "SELECT data FROM message_revisions WHERE message_id = ? ORDER BY created_at, id", [messageId]);
    return rows.map((r) => MessageRevision.parse(JSON.parse(r.data)));
  }

  async addNote(input: AgentNote): Promise<AgentNote> {
    const n = AgentNote.parse(input);
    await this.db.execute(
      "INSERT INTO agent_notes (id, session_id, message_id, agent_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [n.id, n.sessionId, n.messageId, n.agentId, JSON.stringify(n), n.createdAt]);
    return n;
  }

  async listNotes(messageId: string, agentId?: string): Promise<AgentNote[]> {
    const rows = agentId
      ? await this.db.select<{ data: string }>("SELECT data FROM agent_notes WHERE message_id = ? AND agent_id = ? ORDER BY created_at, id", [messageId, agentId])
      : await this.db.select<{ data: string }>("SELECT data FROM agent_notes WHERE message_id = ? ORDER BY created_at, id", [messageId]);
    return rows.map((r) => AgentNote.parse(JSON.parse(r.data)));
  }

  async saveGenerationRecord(input: z.input<typeof GenerationRecord>): Promise<GenerationRecord> {
    const g = GenerationRecord.parse(input);
    await this.db.execute(
      `INSERT INTO generation_records (message_id, session_id, data, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET data = excluded.data`,
      [g.messageId, g.sessionId, JSON.stringify(g), g.createdAt]);
    return g;
  }

  async getGenerationRecord(messageId: string): Promise<GenerationRecord | undefined> {
    const [row] = await this.db.select<{ data: string }>("SELECT data FROM generation_records WHERE message_id = ?", [messageId]);
    return row ? GenerationRecord.parse(JSON.parse(row.data)) : undefined;
  }

  // ------------------------------------------------------------ history of library items (BLUEPRINT §2.6)
  /** At most this many saved versions are kept per item (the oldest go first). */
  static readonly HISTORY_LIMIT = 100;

  /**
   * Keeps the saved version. The first time an item that existed before history did is saved,
   * its previous version is kept too, so the very first edit can be undone.
   */
  private async recordHistory(kind: HistoryKind, itemId: string, before: unknown, after: unknown, mergeWithinMs = 0): Promise<void> {
    if (before !== undefined && JSON.stringify(before) === JSON.stringify(after)) return; // nothing changed
    const [row] = await this.db.select<{ n: number; last: number | null }>(
      "SELECT COUNT(*) AS n, MAX(created_at) AS last FROM item_history WHERE kind = ? AND item_id = ?", [kind, itemId]);
    // saved again soon after (saving by itself while typing): the newest version becomes this one. With only one
    // version kept so far it is the one before the edits, so it stays and this is added after it.
    if (mergeWithinMs > 0 && Number(row?.n ?? 0) > 1 && row?.last != null && Date.now() - Number(row.last) <= mergeWithinMs) {
      await this.db.execute("UPDATE item_history SET data = ?, created_at = ? WHERE kind = ? AND item_id = ? AND created_at = ?",
        [JSON.stringify(after), Math.max(Date.now(), Number(row.last)), kind, itemId, Number(row.last)]);
      return;
    }
    // keep entries in order even when two saves happen in the same millisecond
    let at = Math.max(Date.now(), Number(row?.last ?? 0) + 1);
    if (Number(row?.n ?? 0) === 0 && before !== undefined) {
      await this.db.execute("INSERT INTO item_history (id, kind, item_id, data, created_at) VALUES (?, ?, ?, ?, ?)",
        [crypto.randomUUID(), kind, itemId, JSON.stringify(before), at - 1]);
      at += 1;
    }
    await this.db.execute("INSERT INTO item_history (id, kind, item_id, data, created_at) VALUES (?, ?, ?, ?, ?)",
      [crypto.randomUUID(), kind, itemId, JSON.stringify(after), at]);
    await this.db.execute(
      `DELETE FROM item_history WHERE kind = ? AND item_id = ? AND id NOT IN (
         SELECT id FROM item_history WHERE kind = ? AND item_id = ? ORDER BY created_at DESC LIMIT ?)`,
      [kind, itemId, kind, itemId, SqlStore.HISTORY_LIMIT]);
  }

  /** Saved versions of an item, newest first (the first one is the current version). */
  async listHistory(kind: HistoryKind, itemId: string): Promise<HistoryEntry[]> {
    const rows = await this.db.select<{ id: string; data: string; created_at: number }>(
      "SELECT id, data, created_at FROM item_history WHERE kind = ? AND item_id = ? ORDER BY created_at DESC", [kind, itemId]);
    return rows.map((r) => HistoryEntry.parse({ id: r.id, kind, itemId, data: JSON.parse(r.data), createdAt: Number(r.created_at) }));
  }

  // ------------------------------------------------------------ the Trash (BLUEPRINT §2.6)
  private static readonly TRASH_TABLES: Record<TrashKind, string> = { session: "sessions", character: "characters", persona: "personas", preset: "presets", lorebook: "lorebooks", story: "stories", narrator: "narrators", npc: "npcs", kit: "kits" };

  /**
   * Moves something to the Trash. It disappears from the lists but nothing is lost until the
   * Trash is emptied. Refuses (with a plain message) when a story still uses it.
   */
  async moveToTrash(kind: TrashKind, id: string): Promise<void> {
    if (kind === "character") {
      const using = await this.sessionsUsingCharacter(id);
      if (using.length) throw new Error(`This character is used by ${describeSessions(using)}. Move those sessions to the Trash first.`);
      const stories = await this.storiesUsingCharacter(id);
      if (stories.length) throw new Error(`This character is in the story ${stories.map((st) => `"${st.name}"`).join(", ")}. Take it out of the story first.`);
    }
    if (kind === "narrator") {
      const n = await this.narrators.get(id);
      if (n?.builtin) throw new Error("The Simple Narrator comes with the app. You can edit it or restore it, but not move it to the Trash.");
      const using = await this.storiesUsingNarrator(id);
      if (using.length) throw new Error(`This narrator tells ${using.map((st) => `"${st.name}"`).join(", ")}. Pick another narrator there first.`);
    }
    if (kind === "story") {
      // the story's sessions go with it (same time), and come back with it
      const now = Date.now();
      await this.db.execute("UPDATE stories SET trashed_at = ? WHERE id = ?", [now, id]);
      for (const x of await this.sessionsOfStory(id)) await this.db.execute("UPDATE sessions SET trashed_at = ? WHERE id = ?", [now, x.id]);
      return;
    }
    if (kind === "persona") {
      if ((await this.getDefaultSetup()).personaId === id) throw new Error("This is your default persona. Pick another default (or none) first.");
      const using = await this.sessionsUsingPersona(id);
      if (using.length) throw new Error(`This persona is used by ${describeSessions(using)}. Pick another persona there, or move those sessions to the Trash first.`);
    }
    if (kind === "preset") {
      if ((await this.getDefaultSetup()).presetId === id) throw new Error("This is your default preset. Pick another default first.");
      const using = await this.sessionsUsingPreset(id);
      if (using.length) throw new Error(`This preset is used by ${describeSessions(using)}. Pick another preset there, or move those sessions to the Trash first.`);
    }
    await this.db.execute(`UPDATE ${SqlStore.TRASH_TABLES[kind]} SET trashed_at = ? WHERE id = ?`, [Date.now(), id]);
  }

  async restoreFromTrash(kind: TrashKind, id: string): Promise<void> {
    if (kind === "story") {
      const [row] = await this.db.select<{ trashed_at: number | null }>("SELECT trashed_at FROM stories WHERE id = ?", [id]);
      if (row?.trashed_at != null) {
        for (const x of await this.sessionsOfStory(id, true)) {
          await this.db.execute("UPDATE sessions SET trashed_at = NULL WHERE id = ? AND trashed_at = ?", [x.id, row.trashed_at]);
        }
      }
    }
    if (kind === "session") {
      // a session of a story in the Trash brings its story back too
      const x = await this.getSession(id);
      if (x?.storyId) await this.db.execute("UPDATE stories SET trashed_at = NULL WHERE id = ?", [x.storyId]);
    }
    await this.db.execute(`UPDATE ${SqlStore.TRASH_TABLES[kind]} SET trashed_at = NULL WHERE id = ?`, [id]);
  }

  /** What is in the Trash, most recently trashed first. */
  async listTrash(): Promise<TrashItem[]> {
    const out: TrashItem[] = [];
    for (const kind of ["character", "persona", "preset", "lorebook", "story", "narrator", "npc", "kit"] as const) {
      const rows = await this.db.select<{ id: string; name: string; trashed_at: number }>(
        `SELECT id, name, trashed_at FROM ${SqlStore.TRASH_TABLES[kind]} WHERE trashed_at IS NOT NULL`);
      for (const r of rows) out.push({ kind, id: r.id, name: r.name, trashedAt: Number(r.trashed_at) });
    }
    const rows = await this.db.select<{ id: string; data: string; trashed_at: number }>(
      "SELECT id, data, trashed_at FROM sessions WHERE trashed_at IS NOT NULL");
    // a story's sessions trashed with it are shown as part of the story, not one by one
    const storyTrashedAt = new Map(out.filter((x) => x.kind === "story").map((x) => [x.id, x.trashedAt]));
    for (const r of rows) {
      const d = JSON.parse(r.data) as { title?: string; storyId?: string | null; campaignId?: string | null };
      const sid = d.storyId ?? null;
      if (sid && storyTrashedAt.get(sid) === Number(r.trashed_at)) continue;
      out.push({ kind: "session", id: r.id, name: String(d.title ?? "Session"), trashedAt: Number(r.trashed_at) });
    }
    return out.sort((a, b) => b.trashedAt - a.trashedAt);
  }

  /** Deletes one item of the Trash for good. A character or persona still used by a trashed session must wait for it. */
  async deleteForever(kind: TrashKind, id: string): Promise<void> {
    if (kind === "session") return this.deleteSession(id);
    if (kind === "story") {
      for (const x of await this.sessionsOfStory(id, true)) await this.deleteSession(x.id);
      return this.stories.delete(id);
    }
    if (kind === "narrator") {
      const using = await this.storiesUsingNarrator(id);
      if (using.length) throw new Error(`This narrator still tells ${using.map((st) => `"${st.name}"`).join(", ")}. Pick another narrator there first.`);
      await this.db.execute("DELETE FROM item_history WHERE kind = 'narrator' AND item_id = ?", [id]);
      return this.narrators.delete(id);
    }
    if (kind === "kit") {
      await this.db.execute("DELETE FROM folder_items WHERE kind = 'kit' AND item_id = ?", [id]);
      return this.kits.delete(id);
    }
    if (kind === "npc") {
      // stories and chats simply stop listing it
      for (const st of await this.stories.list()) if (st.npcIds.includes(id)) await this.stories.save({ ...st, npcIds: st.npcIds.filter((x) => x !== id) });
      for (const x of await this.allSessions()) if (x.npcIds.includes(id)) await this.db.execute("UPDATE sessions SET data = ? WHERE id = ?", [JSON.stringify(Session.parse({ ...x, npcIds: x.npcIds.filter((n) => n !== id) })), x.id]);
      await this.db.execute("DELETE FROM item_history WHERE kind = 'npc' AND item_id = ?", [id]);
      return this.npcs.delete(id);
    }
    if (kind === "character") {
      const using = await this.sessionsUsingCharacter(id, true);
      if (using.length) throw new Error(`This character is still used by ${describeSessions(using)}. Delete those sessions first.`);
      return this.deleteCharacter(id);
    }
    if (kind === "preset") {
      const usingPreset = await this.sessionsUsingPreset(id, true);
      if (usingPreset.length) throw new Error(`This preset is still used by ${describeSessions(usingPreset)}. Delete those sessions first.`);
      await this.db.execute("DELETE FROM item_history WHERE kind = 'preset' AND item_id = ?", [id]);
      return this.presets.delete(id);
    }
    if (kind === "lorebook") {
      await this.db.execute("DELETE FROM item_history WHERE kind = 'lorebook' AND item_id = ?", [id]);
      return this.lorebooks.delete(id);
    }
    const using = await this.sessionsUsingPersona(id, true);
    if (using.length) throw new Error(`This persona is still used by ${describeSessions(using)}. Delete those sessions first.`);
    await this.deleteAvatarsOf(id);
    await this.db.execute("DELETE FROM item_history WHERE kind = 'persona' AND item_id = ?", [id]);
    await this.personas.delete(id);
  }

  /** Deletes everything in the Trash for good (sessions first, so their characters can go too). */
  async emptyTrash(): Promise<void> {
    const items = await this.listTrash();
    const order: TrashKind[] = ["session", "story", "persona", "preset", "lorebook", "npc", "narrator", "character"];
    for (const kind of order) for (const it of items.filter((x) => x.kind === kind)) await this.deleteForever(kind, it.id);
  }

  // ------------------------------------------------------------ world state (StateRepository)
  async getDelta(messageId: string): Promise<StateDelta | undefined> {
    const [row] = await this.db.select<{ delta: string }>("SELECT delta FROM state_deltas WHERE message_id = ?", [messageId]);
    return row ? StateDelta.parse(JSON.parse(row.delta)) : undefined;
  }

  async setDelta(messageId: string, delta: StateDelta): Promise<void> {
    await this.db.execute(
      "INSERT INTO state_deltas (message_id, delta) VALUES (?, ?) ON CONFLICT(message_id) DO UPDATE SET delta = excluded.delta",
      [messageId, JSON.stringify(delta)],
    );
    await this.invalidateSnapshotsFrom(messageId);
  }

  async getUserDelta(messageId: string): Promise<StateDelta | undefined> {
    const [row] = await this.db.select<{ delta: string }>("SELECT delta FROM state_user_deltas WHERE message_id = ?", [messageId]);
    return row ? StateDelta.parse(JSON.parse(row.delta)) : undefined;
  }

  async setUserDelta(messageId: string, delta: StateDelta): Promise<void> {
    await this.db.execute(
      "INSERT INTO state_user_deltas (message_id, delta) VALUES (?, ?) ON CONFLICT(message_id) DO UPDATE SET delta = excluded.delta",
      [messageId, JSON.stringify(delta)],
    );
    await this.invalidateSnapshotsFrom(messageId);
  }

  async getPins(sessionId: string): Promise<StateDelta> {
    const [row] = await this.db.select<{ pins: string }>("SELECT pins FROM state_pins WHERE session_id = ?", [sessionId]);
    return row ? StateDelta.parse(JSON.parse(row.pins)) : {};
  }

  async setPins(sessionId: string, pins: StateDelta): Promise<void> {
    await this.db.execute(
      "INSERT INTO state_pins (session_id, pins) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET pins = excluded.pins",
      [sessionId, JSON.stringify(pins)],
    );
  }

  async getSnapshot(messageId: string): Promise<ResolvedState | undefined> {
    const [row] = await this.db.select<{ state: string }>("SELECT state FROM state_snapshots WHERE message_id = ?", [messageId]);
    return row ? (JSON.parse(row.state) as ResolvedState) : undefined;
  }

  async setSnapshot(messageId: string, state: ResolvedState): Promise<void> {
    const [row] = await this.db.select<{ session_id: string }>("SELECT session_id FROM messages WHERE id = ?", [messageId]);
    if (!row) return;
    await this.db.execute(
      "INSERT INTO state_snapshots (message_id, session_id, state) VALUES (?, ?, ?) ON CONFLICT(message_id) DO UPDATE SET state = excluded.state",
      [messageId, row.session_id, JSON.stringify(state)],
    );
  }

  /** A change at a message makes the snapshots of that message and every later one useless. */
  private async invalidateSnapshotsFrom(messageId: string): Promise<void> {
    await this.db.execute(
      `DELETE FROM state_snapshots WHERE message_id IN (
         SELECT m2.id FROM messages m1 JOIN messages m2 ON m2.session_id = m1.session_id AND m2.created_at >= m1.created_at
         WHERE m1.id = ?)`,
      [messageId],
    );
  }
}

function describeSessions(sessions: Session[]): string {
  const names = sessions.slice(0, 3).map((s) => `"${s.title}"`).join(", ");
  return `${sessions.length} session(s): ${names}${sessions.length > 3 ? "…" : ""}`;
}
