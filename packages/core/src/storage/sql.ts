// Homunculus 2 — SQL driver interface and migrations. Author: CLAUDE, 2026-10-23.
// The core speaks SQL through this tiny interface. Drivers:
//  - Tauri SQL plugin (the real app, file on disk)
//  - sql.js (WASM SQLite: tests and the browser preview)
// Placeholders are always "?" (supported by both).

export interface SqlDriver {
  execute(sql: string, params?: unknown[]): Promise<void>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /**
   * Many writes in one go and one transaction: all of them or none (D-125). Optional: a driver without it gets the
   * statements one by one. In the desktop app this is one trip to the native side instead of one per statement.
   */
  batch?(statements: SqlStatement[]): Promise<void>;
}

export interface SqlStatement { sql: string; params: unknown[] }

/** Runs statements together when the driver can, else one after another. */
export async function runTogether(db: SqlDriver, statements: SqlStatement[]): Promise<void> {
  if (statements.length === 0) return;
  if (db.batch) { await db.batch(statements); return; }
  for (const s of statements) await db.execute(s.sql, s.params);
}

/**
 * A driver whose writes wait and go to the database together (D-125, the idea from Aventuras' `db_transaction`).
 * A read first sends what is waiting, so it always sees the writes made before it. `flush()` sends the rest; a failed
 * group is rolled back as a whole and the error comes out of the read or `flush()` that sent it.
 */
export class BatchingDriver implements SqlDriver {
  private pending: SqlStatement[] = [];
  constructor(private readonly base: SqlDriver, private readonly maxWaiting = 2000) {}

  async execute(sql: string, params?: unknown[]): Promise<void> {
    this.pending.push({ sql, params: params ?? [] });
    if (this.pending.length >= this.maxWaiting) await this.flush();
  }

  async select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    await this.flush();
    return this.base.select<T>(sql, params);
  }

  async batch(statements: SqlStatement[]): Promise<void> {
    this.pending.push(...statements);
    if (this.pending.length >= this.maxWaiting) await this.flush();
  }

  /** How many writes are waiting. */
  get waiting(): number { return this.pending.length; }

  async flush(): Promise<void> {
    const list = this.pending;
    this.pending = [];
    await runTogether(this.base, list);
  }
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
