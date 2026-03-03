use chrono::Local;
use rusqlite::{params, Connection, Result};
use serde_json::Value;

pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS settings (
             key   TEXT PRIMARY KEY NOT NULL,
             value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS repos (
             path         TEXT PRIMARY KEY NOT NULL,
             data         TEXT NOT NULL,
             last_scanned TEXT NOT NULL
         );",
    )
}

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn upsert_repo(conn: &Connection, path: &str, data: &str) -> Result<()> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "INSERT OR REPLACE INTO repos (path, data, last_scanned) VALUES (?1, ?2, ?3)",
        params![path, data, now],
    )?;
    Ok(())
}

pub fn get_all_repos(conn: &Connection) -> Result<Vec<Value>> {
    let mut stmt = conn.prepare("SELECT data FROM repos ORDER BY last_scanned DESC")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut result = Vec::new();
    for row in rows.flatten() {
        if let Ok(v) = serde_json::from_str::<Value>(&row) {
            result.push(v);
        }
    }
    Ok(result)
}
