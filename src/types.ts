export interface GitInfo {
  branch: string | null;
  last_commit_msg: string | null;
  last_commit_date: string | null;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface RepoHealth {
  score: number;
  has_node_modules: boolean;
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
  dep_versions: Record<string, string>;
  dev_dep_versions: Record<string, string>;
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
  git_log: GitCommit[];
  health: RepoHealth;
  packages: PackageInfo | null;
  scripts: RunScript[];
  nested_projects: NestedProject[];
  dist_size_bytes: number | null;
}

export interface OutdatedPackage {
  current: string;
  wanted: string;
  latest: string;
  type: 'dependencies' | 'devDependencies';
}

export type OutdatedResult = Record<string, OutdatedPackage>;

export type View = 'repos' | 'summary' | 'health' | 'deps' | 'settings';
