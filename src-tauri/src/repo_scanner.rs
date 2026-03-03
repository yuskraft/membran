use chrono::{DateTime, Local};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

#[derive(Serialize, Clone, Debug)]
pub struct RunScript {
    pub name: String,
    pub command: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct NestedProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub project_type: String,
    pub scripts: Vec<RunScript>,
}

#[derive(Serialize, Clone, Debug)]
pub struct RepoInfo {
    pub name: String,
    pub path: String,
    pub last_modified: Option<String>,
    pub git: GitInfo,
    pub health: RepoHealth,
    pub packages: Option<PackageInfo>,
    pub scripts: Vec<RunScript>,
    pub nested_projects: Vec<NestedProject>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GitInfo {
    pub branch: Option<String>,
    pub last_commit_msg: Option<String>,
    pub last_commit_date: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct RepoHealth {
    pub score: u8,
    pub has_lockfile: bool,
    pub has_typescript: bool,
    pub typescript_strict: bool,
    pub has_eslint: bool,
    pub has_ci: bool,
    pub has_tests: bool,
    pub node_modules_ignored: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct PackageInfo {
    pub dep_count: usize,
    pub dev_dep_count: usize,
}

const IGNORED_DIRS: &[&str] = &["node_modules", "dist", "build", ".cache", "target"];

// Scripts considered runnable at repo/project level, in priority order
const RUNNABLE_SCRIPTS: &[&str] = &[
    "mock",
    "mock-server",
    "mocks",
    "serve",
    "server",
    "api",
    "start",
    "dev",
    "run",
];

pub fn scan<F>(root_paths: Vec<String>, on_found: F)
where
    F: Fn(RepoInfo),
{
    for root in &root_paths {
        collect_repos(Path::new(root), &on_found);
    }
}

fn collect_repos<F>(dir: &Path, on_found: &F)
where
    F: Fn(RepoInfo),
{
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut has_git = false;
    let mut subdirs: Vec<std::path::PathBuf> = Vec::new();

    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let name_str = file_name.to_string_lossy();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if name_str == ".git" && file_type.is_dir() {
            has_git = true;
        } else if file_type.is_dir() && !IGNORED_DIRS.contains(&name_str.as_ref()) {
            subdirs.push(entry.path());
        }
    }

    if has_git {
        let path_str = dir.to_string_lossy().to_string();
        let name = dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path_str.clone());

        let last_modified = dir
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .map(format_time);

        on_found(RepoInfo {
            name,
            path: path_str,
            last_modified,
            git: read_git_info(dir),
            health: compute_health(dir),
            packages: read_package_info(dir),
            scripts: collect_node_scripts(dir),
            nested_projects: find_nested_projects(dir),
        });
        // Don't recurse into already-detected git repos
        return;
    }

    for subdir in subdirs {
        collect_repos(&subdir, on_found);
    }
}

fn find_nested_projects(repo_dir: &Path) -> Vec<NestedProject> {
    let mut projects = Vec::new();

    let entries = match fs::read_dir(repo_dir) {
        Ok(e) => e,
        Err(_) => return projects,
    };

    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if IGNORED_DIRS.contains(&name.as_str()) || name.starts_with('.') {
            continue;
        }

        let dir = entry.path();

        if let Some(project) = detect_nested_project(&dir) {
            projects.push(project);
        }
    }

    projects
}

fn detect_nested_project(dir: &Path) -> Option<NestedProject> {
    let path_str = dir.to_string_lossy().to_string();
    let name = dir.file_name()?.to_string_lossy().to_string();

    // Node.js project with runnable scripts
    if dir.join("package.json").exists() {
        let scripts = collect_node_scripts(dir);
        if !scripts.is_empty() {
            let project_type = classify_node_project(dir, &scripts);
            return Some(NestedProject {
                id: path_str.clone(),
                name,
                path: path_str,
                project_type,
                scripts,
            });
        }
    }

    // Rust project (but only standalone ones not already picked up as a repo)
    if dir.join("Cargo.toml").exists() && !dir.join(".git").exists() {
        return Some(NestedProject {
            id: path_str.clone(),
            name,
            path: path_str,
            project_type: "rust".to_string(),
            scripts: vec![RunScript {
                name: "run".to_string(),
                command: "cargo run".to_string(),
            }],
        });
    }

    // Docker Compose project
    if dir.join("docker-compose.yml").exists() || dir.join("docker-compose.yaml").exists() {
        return Some(NestedProject {
            id: path_str.clone(),
            name,
            path: path_str,
            project_type: "docker".to_string(),
            scripts: vec![RunScript {
                name: "up".to_string(),
                command: "docker compose up".to_string(),
            }],
        });
    }

    None
}

fn collect_node_scripts(dir: &Path) -> Vec<RunScript> {
    let content = match fs::read_to_string(dir.join("package.json")) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(j) => j,
        Err(_) => return Vec::new(),
    };

    let Some(script_map) = json["scripts"].as_object() else {
        return Vec::new();
    };

    let mut scripts: Vec<RunScript> = Vec::new();

    // Add scripts in priority order from our known list
    for &script_name in RUNNABLE_SCRIPTS {
        if script_map.contains_key(script_name) {
            scripts.push(RunScript {
                name: script_name.to_string(),
                command: format!("npm run {script_name}"),
            });
        }
    }

    // Also capture any unlisted script whose name suggests a server/mock
    for (script_name, _) in script_map {
        if scripts.iter().any(|s| &s.name == script_name) {
            continue;
        }
        let lower = script_name.to_lowercase();
        if lower.contains("mock") || lower.contains("server") || lower.contains("serve") {
            scripts.push(RunScript {
                name: script_name.clone(),
                command: format!("npm run {script_name}"),
            });
        }
    }

    scripts
}

fn classify_node_project(dir: &Path, scripts: &[RunScript]) -> String {
    let has_mock_script = scripts.iter().any(|s| {
        let lower = s.name.to_lowercase();
        lower.contains("mock") || lower == "mocks"
    });

    if has_mock_script {
        return "mock server".to_string();
    }

    // Check package.json dependencies for known mock/server libraries
    if let Ok(content) = fs::read_to_string(dir.join("package.json")) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let mut all_deps: Vec<String> = Vec::new();
            if let Some(d) = json["dependencies"].as_object() {
                all_deps.extend(d.keys().cloned());
            }
            if let Some(d) = json["devDependencies"].as_object() {
                all_deps.extend(d.keys().cloned());
            }

            let mock_libs = [
                "json-server",
                "mockoon",
                "wiremock",
                "msw",
                "nock",
                "miragejs",
                "express",
                "fastify",
                "koa",
                "hapi",
                "nestjs",
            ];
            if all_deps
                .iter()
                .any(|d| mock_libs.iter().any(|m| d.contains(m)))
            {
                return "mock server".to_string();
            }
        }
    }

    "node app".to_string()
}

fn read_git_info(dir: &Path) -> GitInfo {
    let git_dir = dir.join(".git");

    // Current branch from HEAD
    let branch = fs::read_to_string(git_dir.join("HEAD")).ok().and_then(|s| {
        s.trim()
            .strip_prefix("ref: refs/heads/")
            .map(|b| b.to_string())
    });

    // Last commit message and date from COMMIT_EDITMSG (updated on every commit)
    let commit_editmsg = git_dir.join("COMMIT_EDITMSG");
    let last_commit_msg = fs::read_to_string(&commit_editmsg).ok().and_then(|s| {
        let line = s.lines().next()?.trim().to_string();
        if line.is_empty() {
            None
        } else {
            Some(line)
        }
    });

    let last_commit_date = commit_editmsg
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .map(format_time);

    GitInfo {
        branch,
        last_commit_msg,
        last_commit_date,
    }
}

fn compute_health(dir: &Path) -> RepoHealth {
    let has_lockfile = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]
        .iter()
        .any(|f| dir.join(f).exists());

    let tsconfig = dir.join("tsconfig.json");
    let has_typescript = tsconfig.exists();
    let typescript_strict = has_typescript
        && fs::read_to_string(&tsconfig)
            .map(|s| s.contains("\"strict\": true") || s.contains("\"strict\":true"))
            .unwrap_or(false);

    let has_eslint = [
        ".eslintrc",
        ".eslintrc.js",
        ".eslintrc.cjs",
        ".eslintrc.mjs",
        ".eslintrc.json",
        ".eslintrc.yaml",
        ".eslintrc.yml",
        "eslint.config.js",
        "eslint.config.mjs",
        "eslint.config.cjs",
        "eslint.config.ts",
    ]
    .iter()
    .any(|f| dir.join(f).exists());

    let has_ci = dir.join(".github").join("workflows").exists()
        || dir.join(".gitlab-ci.yml").exists()
        || dir.join("Jenkinsfile").exists()
        || dir.join(".circleci").exists();

    let has_tests = ["test", "tests", "__tests__", "spec"]
        .iter()
        .any(|d| dir.join(d).is_dir())
        || dir_has_test_files(dir);

    let node_modules_ignored = fs::read_to_string(dir.join(".gitignore"))
        .map(|s| {
            s.lines().any(|l| {
                let l = l.trim();
                l == "node_modules" || l == "/node_modules" || l == "node_modules/"
            })
        })
        .unwrap_or(false);

    let mut score: u32 = 0;
    if has_lockfile {
        score += 15;
    }
    if has_typescript {
        score += 15;
    }
    if typescript_strict {
        score += 10;
    }
    if has_eslint {
        score += 15;
    }
    if has_ci {
        score += 20;
    }
    if has_tests {
        score += 15;
    }
    if node_modules_ignored {
        score += 10;
    }

    RepoHealth {
        score: score as u8,
        has_lockfile,
        has_typescript,
        typescript_strict,
        has_eslint,
        has_ci,
        has_tests,
        node_modules_ignored,
    }
}

fn dir_has_test_files(dir: &Path) -> bool {
    fs::read_dir(dir)
        .ok()
        .map(|entries| {
            entries.flatten().any(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                name.contains(".test.") || name.contains(".spec.")
            })
        })
        .unwrap_or(false)
}

fn read_package_info(dir: &Path) -> Option<PackageInfo> {
    let content = fs::read_to_string(dir.join("package.json")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    Some(PackageInfo {
        dep_count: json["dependencies"]
            .as_object()
            .map(|o| o.len())
            .unwrap_or(0),
        dev_dep_count: json["devDependencies"]
            .as_object()
            .map(|o| o.len())
            .unwrap_or(0),
    })
}

fn format_time(t: SystemTime) -> String {
    let dt: DateTime<Local> = t.into();
    dt.format("%Y-%m-%d %H:%M").to_string()
}
