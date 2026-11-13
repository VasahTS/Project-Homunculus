// Homunculus 2 — many writes in one call and one transaction. CLAUDE, 2026-11-13 (D-125).
//
// The idea from Aventuras (`db_transaction`): every query from the window is a trip to the native side, so an import
// that writes thousands of rows (a long SillyTavern chat) paid thousands of trips. Here the window sends the whole list
// at once; it runs on the SQL plugin's own pool (no second writer, so no "database is locked"), inside one transaction:
// all the rows are saved, or none. Values are bound exactly like the plugin's own `execute` does.
use serde::Deserialize;
use serde_json::Value as JsonValue;
use sqlx::{Sqlite, Transaction};
use tauri::Manager;
use tauri_plugin_sql::{DbInstances, DbPool};

#[derive(Debug, Deserialize)]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<JsonValue>,
}

/// Binds the values the way tauri-plugin-sql 2.x does (null, text, numbers as f64, anything else as JSON).
fn bind_all<'q>(sql: &'q str, params: &'q [JsonValue]) -> sqlx::query::Query<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    let mut query = sqlx::query(sql);
    for value in params {
        if value.is_null() {
            query = query.bind(None::<JsonValue>);
        } else if let Some(s) = value.as_str() {
            query = query.bind(s.to_owned());
        } else if let Some(number) = value.as_number() {
            query = query.bind(number.as_f64().unwrap_or_default());
        } else {
            query = query.bind(value.clone());
        }
    }
    query
}

/// Runs the statements in order in an open transaction; the first error stops (the caller rolls back).
pub async fn run_in(tx: &mut Transaction<'_, Sqlite>, statements: &[Statement]) -> Result<(), String> {
    for (i, s) in statements.iter().enumerate() {
        bind_all(&s.sql, &s.params)
            .execute(&mut **tx)
            .await
            .map_err(|e| format!("statement {} of {}: {e}", i + 1, statements.len()))?;
    }
    Ok(())
}

pub async fn run_batch(pool: &sqlx::SqlitePool, statements: &[Statement]) -> Result<(), String> {
    if statements.is_empty() { return Ok(()); }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    match run_in(&mut tx, statements).await {
        Ok(()) => tx.commit().await.map_err(|e| e.to_string()),
        Err(e) => { let _ = tx.rollback().await; Err(e) }
    }
}

/// `db`: the address the window opened (`Database.path`, e.g. "sqlite:C:\…\homunculus.db").
#[tauri::command]
pub async fn db_batch<R: tauri::Runtime>(app: tauri::AppHandle<R>, db: String, statements: Vec<Statement>) -> Result<(), String> {
    let instances = app.state::<DbInstances>();
    let pools = instances.0.read().await;
    // (the plugin's `DbPool::sqlite()` helper is commented out in 2.6; only the SQLite variant is compiled in)
    let pool = match pools.get(&db).ok_or_else(|| format!("database {db} is not open"))? {
        DbPool::Sqlite(pool) => pool,
    };
    run_batch(pool, &statements).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn memory_pool() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE t (id TEXT PRIMARY KEY, n REAL, note TEXT)").execute(&pool).await.unwrap();
        pool
    }

    fn st(sql: &str, params: Vec<JsonValue>) -> Statement { Statement { sql: sql.into(), params } }

    #[test]
    fn all_rows_are_saved_together() {
        tauri::async_runtime::block_on(async {
            let pool = memory_pool().await;
            let list: Vec<Statement> = (0..500)
                .map(|i| st("INSERT INTO t (id, n, note) VALUES (?, ?, ?)", vec![format!("r{i}").into(), i.into(), JsonValue::Null]))
                .collect();
            run_batch(&pool, &list).await.unwrap();
            let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM t").fetch_one(&pool).await.unwrap();
            assert_eq!(count, 500);
        });
    }

    #[test]
    fn a_failing_statement_saves_none_of_them() {
        tauri::async_runtime::block_on(async {
            let pool = memory_pool().await;
            let list = vec![
                st("INSERT INTO t (id, n) VALUES (?, ?)", vec!["a".into(), 1.into()]),
                st("INSERT INTO t (id, n) VALUES (?, ?)", vec!["a".into(), 2.into()]), // same id: refused
            ];
            let err = run_batch(&pool, &list).await.unwrap_err();
            assert!(err.contains("statement 2 of 2"), "{err}");
            let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM t").fetch_one(&pool).await.unwrap();
            assert_eq!(count, 0);
        });
    }
}
