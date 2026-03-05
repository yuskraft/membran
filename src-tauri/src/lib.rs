mod database;
mod repo_scanner;

use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};

struct DbPath(PathBuf);

#[derive(serde::Serialize, Clone)]
struct ProcessInfo {
    id: String,
    name: String,
    path: String,
    command: String,
}

struct RunningProcess {
    child: Child,
    info: ProcessInfo,
}

struct ProcessManager(Arc<Mutex<HashMap<String, RunningProcess>>>);

fn detect_port(line: &str) -> Option<u16> {
    // Pattern 1: colon followed by digits (e.g. "localhost:3000", ":8080")
    if let Some(colon_pos) = line.rfind(':') {
        let after = &line[colon_pos + 1..];
        let port_str: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        if port_str.len() >= 2 {
            if let Ok(port) = port_str.parse::<u16>() {
                if port >= 80 {
                    return Some(port);
                }
            }
        }
    }
    // Pattern 2: "port NNNN" keyword
    let lower = line.to_lowercase();
    if let Some(idx) = lower.find("port ") {
        let rest = &line[idx + 5..];
        let port_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if !port_str.is_empty() {
            if let Ok(port) = port_str.parse::<u16>() {
                if port >= 80 {
                    return Some(port);
                }
            }
        }
    }
    None
}

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
    name: String,
    command: String,
    app: tauri::AppHandle,
    processes: State<ProcessManager>,
) -> Result<(), String> {
    {
        let mut map = processes.0.lock().map_err(|e| e.to_string())?;
        if let Some(mut existing) = map.remove(&id) {
            let _ = existing.child.kill();
        }
    }

    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Err("empty command".to_string());
    }
    let program = parts[0];
    let args = &parts[1..];

    let mut child = Command::new(program)
        .args(args)
        .current_dir(&path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start '{command}': {e}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let info = ProcessInfo {
        id: id.clone(),
        name: name.clone(),
        path: path.clone(),
        command: command.clone(),
    };

    {
        let mut map = processes.0.lock().map_err(|e| e.to_string())?;
        map.insert(
            id.clone(),
            RunningProcess {
                child,
                info: info.clone(),
            },
        );
    }

    let _ = app.emit("process-started", &info);

    // Spawn stdout reader thread
    if let Some(stdout) = stdout {
        let app2 = app.clone();
        let id2 = id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                if let Some(port) = detect_port(&line) {
                    let _ = app2.emit(
                        "process-port",
                        serde_json::json!({ "id": id2, "port": port }),
                    );
                }
                let _ = app2.emit(
                    "process-output",
                    serde_json::json!({ "id": id2, "line": line, "is_error": false }),
                );
            }
        });
    }

    // Spawn stderr reader thread
    if let Some(stderr) = stderr {
        let app2 = app.clone();
        let id2 = id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if let Some(port) = detect_port(&line) {
                    let _ = app2.emit(
                        "process-port",
                        serde_json::json!({ "id": id2, "port": port }),
                    );
                }
                let _ = app2.emit(
                    "process-output",
                    serde_json::json!({ "id": id2, "line": line, "is_error": true }),
                );
            }
        });
    }

    Ok(())
}

#[tauri::command]
fn stop_project(
    id: String,
    app: tauri::AppHandle,
    processes: State<ProcessManager>,
) -> Result<(), String> {
    let mut map = processes.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut running) = map.remove(&id) {
        running.child.kill().map_err(|e| e.to_string())?;
        let _ = app.emit("process-stopped", &id);
        Ok(())
    } else {
        Err(format!("no running process for id: {id}"))
    }
}

#[tauri::command]
fn get_running_processes(processes: State<ProcessManager>) -> Result<Vec<ProcessInfo>, String> {
    let map = processes.0.lock().map_err(|e| e.to_string())?;
    Ok(map.values().map(|p| p.info.clone()).collect())
}

#[tauri::command]
fn run_task(task_id: String, path: String, command: Vec<String>, app: tauri::AppHandle) -> Result<(), String> {
    if command.is_empty() {
        return Err("empty command".to_string());
    }
    std::thread::spawn(move || {
        let mut child = match Command::new(&command[0])
            .args(&command[1..])
            .current_dir(&path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(_) => {
                let _ = app.emit(
                    "task-done",
                    serde_json::json!({"task_id": task_id, "success": false, "exit_code": -1}),
                );
                return;
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let out_handle = stdout.map(|s| {
            let (app2, id2) = (app.clone(), task_id.clone());
            std::thread::spawn(move || {
                for line in BufReader::new(s).lines().flatten() {
                    let _ = app2.emit(
                        "task-output",
                        serde_json::json!({"task_id": id2, "line": line, "is_error": false}),
                    );
                }
            })
        });

        let err_handle = stderr.map(|s| {
            let (app2, id2) = (app.clone(), task_id.clone());
            std::thread::spawn(move || {
                for line in BufReader::new(s).lines().flatten() {
                    let _ = app2.emit(
                        "task-output",
                        serde_json::json!({"task_id": id2, "line": line, "is_error": true}),
                    );
                }
            })
        });

        let status = child.wait();
        out_handle.map(|h| h.join());
        err_handle.map(|h| h.join());

        let code = status.map(|s| s.code().unwrap_or(0)).unwrap_or(-1);
        let _ = app.emit(
            "task-done",
            serde_json::json!({"task_id": task_id, "success": code == 0, "exit_code": code}),
        );
    });
    Ok(())
}

#[tauri::command]
fn get_package_scripts(path: String) -> Result<Vec<serde_json::Value>, String> {
    let pkg_path = std::path::Path::new(&path).join("package.json");
    if !pkg_path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&pkg_path).map_err(|e| e.to_string())?;
    let pkg: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let scripts = pkg["scripts"]
        .as_object()
        .map(|map| {
            map.iter()
                .map(|(name, _)| {
                    serde_json::json!({
                        "name": name,
                        "command": format!("npm run {name}")
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(scripts)
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

/// Opens a URL in the system default browser.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if cfg!(target_os = "macos") {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    } else if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/c", "start", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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
            open_url,
            run_task,
            get_package_scripts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
