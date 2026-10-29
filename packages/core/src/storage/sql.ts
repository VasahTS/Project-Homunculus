// Homunculus 2 — SQL driver interface and migrations. Author: CLAUDE, 2026-10-23.
// The core speaks SQL through this tiny interface. Drivers:
//  - Tauri SQL plugin (the real app, file on disk)
//  - sql.js (WASM SQLite: tests and the browser preview)
// Placeholders are always "?" (supported by both).

export interface SqlDriver {
  execute(sql: string, params?: unknown[]): Promise<void>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export interface MigrateOptions {
  /** Called once before any pending migration runs (e.g. to back up the database file). */
  beforeMigrate?: (pending: Migration[]) => Promise<void>;
}

/** Applies pending migrations in order. Returns the versions applied now. */
export async function migrate(db: SqlDriver, migrations: Migration[], options: MigrateOptions = {}): Promise<number[]> {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  sorted.forEach((m, i) => {
    if (i > 0 && m.version === sorted[i - 1]!.version) throw new Error(`Duplicate migration version ${m.version}`);
  });

  await db.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)",
  );
  const done = new Set((await db.select<{ version: number }>("SELECT version FROM schema_migrations")).map((r) => Number(r.version)));
  const pending = sorted.filter((m) => !done.has(m.version));
  if (pending.length === 0) return [];

  await options.beforeMigrate?.(pending);
  for (const m of pending) {
    for (const statement of m.statements) await db.execute(statement);
    await db.execute("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [m.version, m.name, Date.now()]);
  }
  return pending.map((m) => m.version);
}
