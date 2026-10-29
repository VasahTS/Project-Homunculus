// Homunculus 2 — opens the database. Author: CLAUDE, 2026-10-23.
// Desktop app: real SQLite file via the Tauri SQL plugin, in the data folder the native shell picks
// (the app's config folder, or `dados` next to Homunculus.exe in portable mode — D-030).
// Browser preview / click tests: in-memory SQLite via sql.js (nothing is saved).
import { SqlJsDriver, type Migration, type SqlDriver } from "@homunculus/core";

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function openDatabase(): Promise<SqlDriver> {
  if (isDesktop) {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    const { invoke } = await import("@tauri-apps/api/core");
    const db = await Database.load(await invoke<string>("database_url"));
    return {
      execute: async (sql, params) => { await db.execute(sql, params ?? []); },
      select: async <T,>(sql: string, params?: unknown[]) => db.select<T[]>(sql, params ?? []),
    };
  }
  const { default: initSqlJs } = await import("sql.js");
  const { default: wasmUrl } = await import("sql.js/dist/sql-wasm.wasm?url");
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  // test/browser mode only: a copy of a real database can be handed in (as base64) to see the app with real data
  // (CLAUDE, 2026-10-28: comparing the Scene panel with the mockup on Daniel's data). Never used by the desktop app.
  const seed = (globalThis as { __h2SeedDb?: string }).__h2SeedDb;
  return new SqlJsDriver(new SQL.Database(seed ? Uint8Array.from(atob(seed), (c) => c.charCodeAt(0)) : undefined));
}

/** Before upgrading an existing database, copy it to the backups folder (desktop only). */
export async function backupBeforeMigrate(pending: Migration[]): Promise<void> {
  if (!isDesktop) return;
  if (pending.some((m) => m.version === 1)) return; // brand-new database: nothing to back up
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("backup_database");
}
