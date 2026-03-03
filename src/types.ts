export interface GitInfo {
  branch: string | null;
  last_commit_msg: string | null;
  last_commit_date: string | null;
}

export interface RepoHealth {
  score: number;
  has_lockfile: boolean;
  has_typescript: boolean;
  typescript_strict: boolean;
  has_eslint: boolean;
  has_ci: boolean;
  has_tests: boolean;
  node_modules_ignored: boolean;
}

export interface PackageInfo {
  dep_count: number;
  dev_dep_count: number;
}

export interface RunScript {
  name: string;
  command: string;
}

export interface NestedProject {
  id: string;
  name: string;
  path: string;
  project_type: string;
  scripts: RunScript[];
}

export interface RepoInfo {
  name: string;
  path: string;
  last_modified: string | null;
  git: GitInfo;
  health: RepoHealth;
  packages: PackageInfo | null;
  scripts: RunScript[];
  nested_projects: NestedProject[];
}
