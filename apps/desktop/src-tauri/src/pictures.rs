// Homunculus 2 — pictures served by address (`h2pic://`), straight from the database. CLAUDE, 2026-11-13 (D-124).
//
// The idea from Marinara Engine and SillyTavern (they serve avatars as files with a long cache): instead of handing every
// picture to the window as base64 text (kept in JavaScript memory, copied into every <img>), the window asks for
// `h2pic://localhost/<p|f>:<version>:<owner key>` and the WebView loads, caches and frees the picture by itself.
// `p` = the small preview lists use (the full picture when no preview exists yet), `f` = the full picture. The version
// (the row's `updated_at`) is part of the address, so a changed picture is a new address and the cache never shows an
// old one. Read-only: this never writes to the database.
use base64::Engine;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::PathBuf;
use std::str::FromStr;
use tauri::http::{Response, StatusCode};
use tokio::sync::OnceCell;

/// Which copy of a picture an address asks for.
#[derive(Debug, PartialEq, Eq)]
pub enum Copy { Preview, Full }

/// `p:1731500000000:char-id#variant` (percent-encoded, with or without a leading slash) → what to read.
pub fn parse_address(path: &str) -> Option<(Copy, String)> {
    let decoded = percent_decode(path.trim_start_matches('/'))?;
    let mut parts = decoded.splitn(3, ':');
    let copy = match parts.next()? { "p" => Copy::Preview, "f" => Copy::Full, _ => return None };
    let _version = parts.next()?;
    let key = parts.next()?;
    if key.is_empty() { return None; }
    Some((copy, key.to_string()))
}

fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// One small pool, opened the first time a picture is asked for.
static POOL: OnceCell<SqlitePool> = OnceCell::const_new();

async fn pool(db: &PathBuf) -> Result<&'static SqlitePool, String> {
    POOL.get_or_try_init(|| async {
        let opts = SqliteConnectOptions::from_str(&format!("sqlite:{}", db.to_string_lossy()))
            .map_err(|e| e.to_string())?
            .create_if_missing(false);
        SqlitePoolOptions::new().max_connections(2).connect_with(opts).await.map_err(|e| e.to_string())
    }).await
}

/// The picture's type and bytes, or None when there is no such picture. D-132: a preview is read on its own (the full
/// picture, ~1 MB, is read only when the full one is asked for, or when no preview exists yet).
pub async fn read_picture(pool: &SqlitePool, copy: &Copy, key: &str) -> Result<Option<(String, Vec<u8>)>, String> {
    if *copy == Copy::Preview {
        let row: Option<(Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT preview_mime, preview_base64 FROM character_avatars WHERE character_id = ?")
            .bind(key).fetch_optional(pool).await.map_err(|e| e.to_string())?;
        match row {
            None => return Ok(None),
            Some((Some(pm), Some(p))) if !p.is_empty() => {
                let bytes = base64::engine::general_purpose::STANDARD.decode(p.trim()).map_err(|e| e.to_string())?;
                return Ok(Some((pm, bytes)));
            }
            _ => {} // no preview yet: the full picture stands in
        }
    }
    let row: Option<(String, String)> = sqlx::query_as("SELECT mime, data_base64 FROM character_avatars WHERE character_id = ?")
        .bind(key).fetch_optional(pool).await.map_err(|e| e.to_string())?;
    let Some((mime, full)) = row else { return Ok(None) };
    let bytes = base64::engine::general_purpose::STANDARD.decode(full.trim()).map_err(|e| e.to_string())?;
    Ok(Some((mime, bytes)))
}

fn empty(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder().status(status).header("Access-Control-Allow-Origin", "*").body(Vec::new()).unwrap()
}

/// Answers one `h2pic://` request.
pub async fn serve(db: PathBuf, path: String) -> Response<Vec<u8>> {
    let Some((copy, key)) = parse_address(&path) else { return empty(StatusCode::BAD_REQUEST) };
    let pool = match pool(&db).await { Ok(p) => p, Err(_) => return empty(StatusCode::SERVICE_UNAVAILABLE) };
    match read_picture(pool, &copy, &key).await {
        Ok(Some((mime, bytes))) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", mime)
            // the version is in the address: the same address always means the same picture
            .header("Cache-Control", "public, max-age=31536000, immutable")
            .header("Access-Control-Allow-Origin", "*")
            .body(bytes)
            .unwrap(),
        Ok(None) => empty(StatusCode::NOT_FOUND),
        Err(_) => empty(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn addresses() {
        assert_eq!(parse_address("/p%3A1731%3Achar-1"), Some((Copy::Preview, "char-1".into())));
        assert_eq!(parse_address("f:0:abc%23v2"), Some((Copy::Full, "abc#v2".into())));
        assert_eq!(parse_address("p:1:a:b"), Some((Copy::Preview, "a:b".into()))); // a key may hold ':'
        assert_eq!(parse_address("x:1:a"), None);
        assert_eq!(parse_address("p:1:"), None);
        assert_eq!(parse_address("p%3"), None);
    }

    #[test]
    fn reads_preview_or_full() {
        tauri::async_runtime::block_on(async {
            let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
            sqlx::query("CREATE TABLE character_avatars (character_id TEXT PRIMARY KEY, mime TEXT NOT NULL, data_base64 TEXT NOT NULL, preview_mime TEXT, preview_base64 TEXT, updated_at INTEGER NOT NULL DEFAULT 0)")
                .execute(&pool).await.unwrap();
            let b64 = |s: &str| base64::engine::general_purpose::STANDARD.encode(s);
            sqlx::query("INSERT INTO character_avatars VALUES ('a', 'image/png', ?, 'image/jpeg', ?, 1), ('b', 'image/png', ?, NULL, NULL, 0)")
                .bind(b64("FULL-A")).bind(b64("SMALL-A")).bind(b64("FULL-B")).execute(&pool).await.unwrap();
            assert_eq!(read_picture(&pool, &Copy::Preview, "a").await.unwrap(), Some(("image/jpeg".into(), b"SMALL-A".to_vec())));
            assert_eq!(read_picture(&pool, &Copy::Full, "a").await.unwrap(), Some(("image/png".into(), b"FULL-A".to_vec())));
            // no preview yet: the full picture stands in
            assert_eq!(read_picture(&pool, &Copy::Preview, "b").await.unwrap(), Some(("image/png".into(), b"FULL-B".to_vec())));
            assert_eq!(read_picture(&pool, &Copy::Preview, "none").await.unwrap(), None);
        });
    }
}
