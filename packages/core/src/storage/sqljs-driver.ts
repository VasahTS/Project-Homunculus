// Homunculus 2 — SqlDriver backed by sql.js (SQLite compiled to WebAssembly).
// Used by tests and by the browser preview. Author: CLAUDE, 2026-10-23.
import type { Database } from "sql.js";
import type { SqlDriver } from "./sql.ts";

type BindValue = string | number | null | Uint8Array;

function toBind(params: unknown[] = []): BindValue[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (typeof p === "string" || typeof p === "number" || p instanceof Uint8Array) return p;
    return JSON.stringify(p);
  });
}

export class SqlJsDriver implements SqlDriver {
  constructor(private readonly db: Database) {}

  async execute(sql: string, params?: unknown[]): Promise<void> {
    this.db.run(sql, toBind(params));
  }

  async select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(toBind(params));
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }
}
