// Homunculus 2 — core database migrations. Author: CLAUDE, 2026-10-23.
// NEVER edit a migration that already shipped. Add a new one with the next version.
// Rich objects (characters, sessions) are stored as validated JSON (decision D-008),
// so adding a field to them needs no migration.
import type { Migration } from "./sql.ts";

export const coreMigrations: Migration[] = [
  {
    version: 1,
    name: "initial core tables",
    statements: [
      "CREATE TABLE characters (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)",
      "CREATE TABLE sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
      `CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        parent_id TEXT,
        speaker TEXT NOT NULL,
        content TEXT NOT NULL,
        meta TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      "CREATE INDEX idx_messages_session ON messages(session_id)",
      "CREATE INDEX idx_messages_parent ON messages(parent_id)",
      "CREATE TABLE branches (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, name TEXT NOT NULL, head_message_id TEXT)",
      "CREATE INDEX idx_branches_session ON branches(session_id)",
      "CREATE TABLE state_deltas (message_id TEXT PRIMARY KEY, delta TEXT NOT NULL)",
      "CREATE TABLE state_pins (session_id TEXT PRIMARY KEY, pins TEXT NOT NULL)",
    ],
  },
  {
    version: 2,
    name: "character avatars",
    statements: [
      // kept apart from the character JSON so lists stay light; base64 works with every driver
      "CREATE TABLE character_avatars (character_id TEXT PRIMARY KEY, mime TEXT NOT NULL, data_base64 TEXT NOT NULL)",
    ],
  },
  {
    version: 3,
    name: "blueprint foundation (slice 0)",
    statements: [
      // library and play documents (validated JSON, D-008)
      "CREATE TABLE campaigns (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
      "CREATE TABLE personas (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)",
      "CREATE TABLE agents (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)",
      "CREATE TABLE tracker_schemas (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)",
      "CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
      // message kind, visibility and reasoning (BLUEPRINT §2.3); NULL = derived default
      "ALTER TABLE messages ADD COLUMN kind TEXT",
      "ALTER TABLE messages ADD COLUMN visibility TEXT",
      "ALTER TABLE messages ADD COLUMN reasoning TEXT",
      // records per message (BLUEPRINT §2.4)
      `CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, message_id TEXT NOT NULL, agent_id TEXT NOT NULL,
        status TEXT NOT NULL, stale INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, created_at INTEGER NOT NULL
      )`,
      "CREATE INDEX idx_agent_runs_message ON agent_runs(message_id)",
      "CREATE INDEX idx_agent_runs_session ON agent_runs(session_id, created_at)",
      "CREATE TABLE message_revisions (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL)",
      "CREATE INDEX idx_revisions_message ON message_revisions(message_id)",
      `CREATE TABLE agent_notes (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, message_id TEXT NOT NULL, agent_id TEXT NOT NULL,
        data TEXT NOT NULL, created_at INTEGER NOT NULL
      )`,
      "CREATE INDEX idx_notes_message ON agent_notes(message_id)",
      "CREATE TABLE generation_records (message_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL)",
      "CREATE INDEX idx_generation_session ON generation_records(session_id)",
      // world state: the user's own edits per message, and a speed cache (BLUEPRINT §7.1)
      "CREATE TABLE state_user_deltas (message_id TEXT PRIMARY KEY, delta TEXT NOT NULL)",
      "CREATE TABLE state_snapshots (message_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, state TEXT NOT NULL)",
      "CREATE INDEX idx_snapshots_session ON state_snapshots(session_id)",
      "CREATE INDEX idx_messages_session_created ON messages(session_id, created_at)",
    ],
  },
  {
    version: 4,
    name: "trash and history for library items and sessions (slice 1)",
    statements: [
      // NULL = not in the Trash. Kept outside the JSON so saving an item never takes it out of the Trash.
      "ALTER TABLE characters ADD COLUMN trashed_at INTEGER",
      "ALTER TABLE personas ADD COLUMN trashed_at INTEGER",
      "ALTER TABLE sessions ADD COLUMN trashed_at INTEGER",
      // every saved version of a library item (BLUEPRINT §2.6): kind = "character" | "persona" | …
      "CREATE TABLE item_history (id TEXT PRIMARY KEY, kind TEXT NOT NULL, item_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL)",
      "CREATE INDEX idx_item_history_item ON item_history(kind, item_id, created_at)",
    ],
  },
  {
    version: 5,
    name: "connection profiles (slice 1b)",
    statements: [
      // validated JSON (D-008); API keys are never here (Windows Credential Manager, D-011)
      "CREATE TABLE connection_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)",
    ],
  },
  {
    version: 6,
    name: "presets (slice 2)",
    statements: [
      "CREATE TABLE presets (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, trashed_at INTEGER)",
    ],
  },
  {
    version: 7,
    name: "lorebooks (slice 3)",
    statements: [
      // one validated JSON document per book, entries inside (D-008)
      "CREATE TABLE lorebooks (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, trashed_at INTEGER)",
    ],
  },
  {
    version: 8,
    name: "stories, narrators and NPCs (slice 4)",
    statements: [
      // validated JSON documents (D-008). The old "campaigns" table (never used by a screen) stays, unused.
      "CREATE TABLE stories (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, trashed_at INTEGER)",
      "CREATE TABLE narrators (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, trashed_at INTEGER)",
      "CREATE TABLE npcs (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, trashed_at INTEGER)",
    ],
  },
  {
    version: 9,
    name: "branches held at a message (D-032)",
    statements: [
      // "Branch from here" on the last message: the branch it leaves stays ending there (null = ends at a leaf)
      "ALTER TABLE branches ADD COLUMN end_message_id TEXT",
    ],
  },
  {
    version: 10,
    name: "folders and kits (round 3, D-036)",
    statements: [
      // folders of every kind (a tree: parent_id in the JSON); an item is in one folder of its kind at most
      "CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL)",
      "CREATE TABLE folder_items (kind TEXT NOT NULL, item_id TEXT NOT NULL, folder_id TEXT NOT NULL, PRIMARY KEY (kind, item_id))",
      "CREATE INDEX idx_folder_items_folder ON folder_items(folder_id)",
      // kits: what a story starts with (validated JSON, D-008)
      "CREATE TABLE kits (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, trashed_at INTEGER)",
    ],
  },
];
