use chrono::{DateTime, Local};
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

// ── Public structs ────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct RunScript {
    pub name: String,
    pub command: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct GitCommit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
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
    pub git_log: Vec<GitCommit>,
    pub health: RepoHealth,
    pub packages: Option<PackageInfo>,
    pub scripts: Vec<RunScript>,
    pub nested_projects: Vec<NestedProject>,
    pub dist_size_bytes: Option<u64>,
    pub mfe: Option<MfeInfo>,
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
    pub has_node_modules: bool,
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
    pub dep_versions: BTreeMap<String, String>,
    pub dev_dep_versions: BTreeMap<String, String>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct MfeRemote {
    pub name: String,
    pub url: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct MfeInfo {
    pub is_host: bool,
    pub is_remote: bool,
    pub framework: String,
    pub name: Option<String>,
    pub remotes: Vec<MfeRemote>,
    pub exposes: Vec<String>,
}

// ── Constants ─────────────────────────────────────────────────────────────────

const IGNORED_DIRS: &[&str] = &["node_modules", "dist", "build", ".cache", "target"];

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

// ── Entry point ───────────────────────────────────────────────────────────────

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

        let git_dir = dir.join(".git");

        on_found(RepoInfo {
            name,
            path: path_str,
            last_modified,
            git: read_git_info(&git_dir),
            git_log: read_git_log(&git_dir, 30),
            health: compute_health(dir),
            packages: read_package_info(dir),
            scripts: collect_node_scripts(dir),
            nested_projects: find_nested_projects(dir),
            dist_size_bytes: compute_dist_size(dir),
            mfe: detect_mfe(dir),
        });
        return;
    }

    for subdir in subdirs {
        collect_repos(&subdir, on_found);
    }
}

// ── Git ───────────────────────────────────────────────────────────────────────

fn read_git_info(git_dir: &Path) -> GitInfo {
    let branch = fs::read_to_string(git_dir.join("HEAD")).ok().and_then(|s| {
        s.trim()
            .strip_prefix("ref: refs/heads/")
            .map(|b| b.to_string())
    });

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

fn read_git_log(git_dir: &Path, limit: usize) -> Vec<GitCommit> {
    let log_path = git_dir.join("logs").join("HEAD");
    let content = match fs::read_to_string(&log_path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    content
        .lines()
        .rev()
        .filter_map(parse_git_log_line)
        .take(limit)
        .collect()
}

fn parse_git_log_line(line: &str) -> Option<GitCommit> {
    // Format: <old-hash> <new-hash> <author name> <email> <unix-ts> <tz>\t<action>: <msg>
    let (meta, action) = line.split_once('\t')?;

    // Only process actual commits (not checkout/rebase/etc.)
    if !action.starts_with("commit") {
        return None;
    }

    let message = action
        .strip_prefix("commit (merge): ")
        .or_else(|| action.strip_prefix("commit (amend): "))
        .or_else(|| action.strip_prefix("commit: "))
        .unwrap_or(action)
        .to_string();

    // meta: "<old> <new> <author name(s)> <email> <timestamp> <tz>"
    let mut parts = meta.splitn(3, ' ');
    parts.next()?; // skip old hash
    let new_hash = parts.next()?.to_string();
    let rest = parts.next()?;

    // Author name is everything before the first '<'
    let email_start = rest.find('<')?;
    let email_end = rest.find('>')?;
    let author = rest[..email_start].trim().to_string();

    let after_email = rest[email_end + 1..].trim();
    let timestamp: i64 = after_email.split_whitespace().next()?.parse().ok()?;

    let date = chrono::DateTime::from_timestamp(timestamp, 0)
        .map(|dt| {
            dt.with_timezone(&chrono::Local)
                .format("%Y-%m-%d %H:%M")
                .to_string()
        })
        .unwrap_or_default();

    Some(GitCommit {
        hash: new_hash[..8.min(new_hash.len())].to_string(),
        message,
        author,
        date,
    })
}

// ── Health ────────────────────────────────────────────────────────────────────

fn compute_health(dir: &Path) -> RepoHealth {
    let has_node_modules = dir.join("node_modules").is_dir();

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
        has_node_modules,
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

// ── Packages ──────────────────────────────────────────────────────────────────

fn read_package_info(dir: &Path) -> Option<PackageInfo> {
    let content = fs::read_to_string(dir.join("package.json")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;

    let dep_versions: BTreeMap<String, String> = json["dependencies"]
        .as_object()
        .map(|o| {
            o.iter()
                .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("?").to_string()))
                .collect()
        })
        .unwrap_or_default();

    let dev_dep_versions: BTreeMap<String, String> = json["devDependencies"]
        .as_object()
        .map(|o| {
            o.iter()
                .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("?").to_string()))
                .collect()
        })
        .unwrap_or_default();

    Some(PackageInfo {
        dep_count: dep_versions.len(),
        dev_dep_count: dev_dep_versions.len(),
        dep_versions,
        dev_dep_versions,
    })
}

// ── Nested projects ───────────────────────────────────────────────────────────

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

    for &script_name in RUNNABLE_SCRIPTS {
        if script_map.contains_key(script_name) {
            scripts.push(RunScript {
                name: script_name.to_string(),
                command: format!("npm run {script_name}"),
            });
        }
    }

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

// ── Dist size ─────────────────────────────────────────────────────────────────

fn compute_dist_size(repo_dir: &Path) -> Option<u64> {
    for candidate in &["dist", "build", "out", ".next", ".nuxt"] {
        let dir = repo_dir.join(candidate);
        if dir.is_dir() {
            return Some(dir_bytes(&dir));
        }
    }
    None
}

fn dir_bytes(dir: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_file() {
                    total += entry.metadata().map(|m| m.len()).unwrap_or(0);
                } else if ft.is_dir() {
                    total += dir_bytes(&entry.path());
                }
            }
        }
    }
    total
}

// ── Micro-frontend detection ──────────────────────────────────────────────────

fn detect_mfe(path: &Path) -> Option<MfeInfo> {
    for file in &[
        "webpack.config.js",
        "webpack.config.ts",
        "module-federation.config.js",
        "module-federation.config.ts",
    ] {
        if let Ok(content) = fs::read_to_string(path.join(file)) {
            if let Some(info) = parse_mfe_config(&content, "webpack") {
                return Some(info);
            }
        }
    }
    for file in &["vite.config.ts", "vite.config.js", "vite.config.mjs"] {
        if let Ok(content) = fs::read_to_string(path.join(file)) {
            if let Some(info) = parse_mfe_config(&content, "vite") {
                return Some(info);
            }
        }
    }
    None
}

fn parse_mfe_config(content: &str, framework: &str) -> Option<MfeInfo> {
    let is_mfe = if framework == "vite" {
        content.contains("federation(")
    } else {
        content.contains("ModuleFederationPlugin")
    };
    if !is_mfe {
        return None;
    }

    let remotes_block = extract_js_block(content, "remotes");
    let exposes_block = extract_js_block(content, "exposes");
    let is_host = remotes_block.is_some();
    let is_remote = exposes_block.is_some();

    let remotes = remotes_block
        .map(|b| {
            b.lines()
                .filter_map(|line| {
                    let (key, val) = extract_js_key_value(line.trim())?;
                    let url = val
                        .map(|v| {
                            // Webpack format: "remoteName@https://host/remoteEntry.js"
                            if let Some(at) = v.rfind('@') {
                                v[at + 1..].to_string()
                            } else {
                                v
                            }
                        })
                        .filter(|u| u.contains("://") || u.starts_with('/'));
                    Some(MfeRemote { name: key, url })
                })
                .collect()
        })
        .unwrap_or_default();

    let exposes = exposes_block
        .map(|b| {
            b.lines()
                .filter_map(|line| {
                    let (key, _) = extract_js_key_value(line.trim())?;
                    if key.starts_with("./") || key.starts_with('/') {
                        Some(key)
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Some(MfeInfo {
        is_host,
        is_remote,
        framework: framework.to_string(),
        name: extract_quoted_after_key(content, "name"),
        remotes,
        exposes,
    })
}

/// Find `key: { ... }` in JS/TS text and return the inner block.
/// The `{` must appear within 80 bytes of the key to avoid false matches.
fn extract_js_block(content: &str, key: &str) -> Option<String> {
    let pos = content
        .find(&format!("\"{}\":", key))
        .or_else(|| content.find(&format!("{}:", key)))?;
    // The opening '{' must be close to the key
    let window_end = (pos + 80).min(content.len());
    let window = &content[pos..window_end];
    let brace_offset = window.find('{')?;
    let after = &content[pos + brace_offset + 1..];
    // Count matching braces
    let mut depth = 1i32;
    let mut end = after.len();
    for (i, c) in after.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    end = i;
                    break;
                }
            }
            _ => {}
        }
    }
    let block = after[..end].to_string();
    if block.trim().is_empty() {
        None
    } else {
        Some(block)
    }
}

/// Return the first quoted string value following `key:` in content.
fn extract_quoted_after_key(content: &str, key: &str) -> Option<String> {
    for pattern in &[format!("\"{}\":", key), format!("{}:", key)] {
        if let Some(pos) = content.find(pattern.as_str()) {
            let after = content[pos + pattern.len()..].trim_start();
            let q = match after.chars().next()? {
                '\'' => '\'',
                '"' => '"',
                _ => continue,
            };
            let inner = &after[1..];
            if let Some(end) = inner.find(q) {
                return Some(inner[..end].to_string());
            }
        }
    }
    None
}

/// Extract key and optional quoted value from a single JS object property line.
fn extract_js_key_value(line: &str) -> Option<(String, Option<String>)> {
    let line = line.trim().trim_end_matches(',');
    if line.is_empty()
        || line.starts_with("//")
        || line.starts_with("/*")
        || line.starts_with('*')
        || line == "{"
        || line == "}"
    {
        return None;
    }

    let (key, rest): (String, &str) = if line.starts_with('"') || line.starts_with('\'') {
        let q = line.chars().next()?;
        let after_q = &line[1..];
        let close = after_q.find(q)?;
        let key = after_q[..close].to_string();
        let rest = after_q[close + 1..].trim().strip_prefix(':')?.trim();
        (key, rest)
    } else {
        let colon = line.find(':')?;
        let key = line[..colon].trim().to_string();
        let rest = line[colon + 1..].trim();
        (key, rest)
    };

    if key.is_empty() || key.contains('{') || key.contains('}') || key.contains(' ') {
        return None;
    }

    let value = if rest.starts_with('"') || rest.starts_with('\'') {
        let q = rest.chars().next()?;
        let inner = &rest[1..];
        let end = inner.find(q)?;
        Some(inner[..end].to_string())
    } else {
        None
    };

    Some((key, value))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn format_time(t: SystemTime) -> String {
    let dt: DateTime<Local> = t.into();
    dt.format("%Y-%m-%d %H:%M").to_string()
}
