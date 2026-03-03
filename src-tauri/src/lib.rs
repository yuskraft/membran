mod database;
mod repo_scanner;

use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};

struct DbPath(PathBuf);

struct ProcessManager(Arc<Mutex<HashMap<String, Child>>>);

#[tauri::command]
fn get_settings(db_path: State<DbPath>) -> Result<Value, String> {
    let conn = rusqlite::Connection::open(&db_path.0).map_err(|e| e.to_string())?;
    let root_paths: Vec<String> = database::get_setting(&conn, "root_paths")
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    Ok(serde_json::json!({ "root_paths": root_paths }))
}

#[tauri::command]
fn save_root_paths(paths: Vec<String>, db_path: State<DbPath>) -> Result<(), String> {
    let conn = rusqlite::Connection::open(&db_path.0).map_err(|e| e.to_string())?;
    let json = serde_json::to_string(&paths).map_err(|e| e.to_string())?;
    database::set_setting(&conn, "root_paths", &json).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_cached_repos(db_path: State<DbPath>) -> Result<Vec<Value>, String> {
    let conn = rusqlite::Connection::open(&db_path.0).map_err(|e| e.to_string())?;
    database::get_all_repos(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_scan(
    root_paths: Vec<String>,
    app: tauri::AppHandle,
    db_path: State<DbPath>,
) -> Result<(), String> {
    let path = db_path.0.clone();
    std::thread::spawn(move || {
        let conn = match rusqlite::Connection::open(&path) {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit("scan-error", e.to_string());
                return;
            }
        };

        repo_scanner::scan(root_paths, |repo| {
            if let Ok(data) = serde_json::to_string(&repo) {
                let _ = database::upsert_repo(&conn, &repo.path, &data);
            }
            let _ = app.emit("repo-found", &repo);
        });

        let _ = app.emit("scan-complete", ());
    });
    Ok(())
}

#[tauri::command]
fn run_project(
    id: String,
    path: String,
    command: String,
    app: tauri::AppHandle,
    processes: State<ProcessManager>,
) -> Result<(), String> {
    {
        let mut map = processes.0.lock().map_err(|e| e.to_string())?;
        if let Some(mut existing) = map.remove(&id) {
            let _ = existing.kill();
        }
    }

    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Err("empty command".to_string());
    }
    let program = parts[0];
    let args = &parts[1..];

    let child = Command::new(program)
        .args(args)
        .current_dir(&path)
        .spawn()
        .map_err(|e| format!("failed to start '{command}': {e}"))?;

    {
        let mut map = processes.0.lock().map_err(|e| e.to_string())?;
        map.insert(id.clone(), child);
    }

    let _ = app.emit("process-started", &id);
    Ok(())
}

#[tauri::command]
fn stop_project(
    id: String,
    app: tauri::AppHandle,
    processes: State<ProcessManager>,
) -> Result<(), String> {
    let mut map = processes.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = map.remove(&id) {
        child.kill().map_err(|e| e.to_string())?;
        let _ = app.emit("process-stopped", &id);
        Ok(())
    } else {
        Err(format!("no running process for id: {id}"))
    }
}

#[tauri::command]
fn get_running_processes(processes: State<ProcessManager>) -> Result<Vec<String>, String> {
    let map = processes.0.lock().map_err(|e| e.to_string())?;
    Ok(map.keys().cloned().collect())
}

/// Runs `npm outdated --json` in the given path and returns the parsed JSON.
/// npm exits with code 1 when there are outdated packages — that is not an error.
#[tauri::command]
fn get_outdated_packages(path: String) -> Result<Value, String> {
    let output = Command::new("npm")
        .args(["outdated", "--json"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("failed to run npm outdated: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }

    serde_json::from_str(&stdout).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_file = data_dir.join("membran.db");

            let conn = rusqlite::Connection::open(&db_file)
                .map_err(|e| format!("failed to open db: {e}"))?;
            database::init(&conn).map_err(|e| format!("failed to init db: {e}"))?;
            drop(conn);

            app.manage(DbPath(db_file));
            app.manage(ProcessManager(Arc::new(Mutex::new(HashMap::new()))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_root_paths,
            get_cached_repos,
            start_scan,
            run_project,
            stop_project,
            get_running_processes,
            get_outdated_packages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
