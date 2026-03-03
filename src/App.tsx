import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { RepoInfo, RunScript, View } from './types';
import Sidebar from './components/Sidebar';
import RepoList from './components/RepoList';
import RepoDetailDrawer from './components/RepoDetailDrawer';
import HealthView from './components/HealthView';
import DepsView from './components/DepsView';
import HealthSummary from './components/HealthSummary';
import LoadingIndicator from './components/LoadingIndicator';
import ErrorBanner from './components/ErrorBanner';
import SettingsPage from './components/SettingsPage';
import styles from './App.module.css';

/**
 * Fill in defaults for any fields that may be missing from old cached repos
 * stored before a schema change. Prevents crashes when accessing new fields
 * on data deserialized from the SQLite cache.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeRepo(raw: any): RepoInfo {
  return {
    name: raw.name ?? '',
    path: raw.path ?? '',
    last_modified: raw.last_modified ?? null,
    git: {
      branch: raw.git?.branch ?? null,
      last_commit_msg: raw.git?.last_commit_msg ?? null,
      last_commit_date: raw.git?.last_commit_date ?? null,
    },
    git_log: raw.git_log ?? [],
    health: {
      score: raw.health?.score ?? 0,
      has_node_modules: raw.health?.has_node_modules ?? false,
      has_lockfile: raw.health?.has_lockfile ?? false,
      has_typescript: raw.health?.has_typescript ?? false,
      typescript_strict: raw.health?.typescript_strict ?? false,
      has_eslint: raw.health?.has_eslint ?? false,
      has_ci: raw.health?.has_ci ?? false,
      has_tests: raw.health?.has_tests ?? false,
      node_modules_ignored: raw.health?.node_modules_ignored ?? false,
    },
    packages: raw.packages
      ? {
          dep_count: raw.packages.dep_count ?? 0,
          dev_dep_count: raw.packages.dev_dep_count ?? 0,
          dep_versions: raw.packages.dep_versions ?? {},
          dev_dep_versions: raw.packages.dev_dep_versions ?? {},
        }
      : null,
    scripts: raw.scripts ?? [],
    nested_projects: (raw.nested_projects ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (np: any) => ({
        id: np.id ?? np.path ?? '',
        name: np.name ?? '',
        path: np.path ?? '',
        project_type: np.project_type ?? 'unknown',
        scripts: np.scripts ?? [],
      }),
    ),
    dist_size_bytes: raw.dist_size_bytes ?? null,
  };
}


function App() {
  const [view, setView] = useState<View>('repos');
  const [rootPaths, setRootPaths] = useState<string[]>([]);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [runningProcesses, setRunningProcesses] = useState<Set<string>>(new Set());
  const [selectedRepo, setSelectedRepo] = useState<RepoInfo | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const setup = async () => {
      const unlistenFound = await listen<RepoInfo>('repo-found', (e) => {
        const repo = normalizeRepo(e.payload);
        setRepos((prev) => {
          const idx = prev.findIndex((r) => r.path === repo.path);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = repo;
            setSelectedRepo((sel) => (sel?.path === repo.path ? repo : sel));
            return next;
          }
          return [...prev, repo];
        });
      });

      const unlistenComplete = await listen('scan-complete', () => {
        setScanning(false);
      });

      const unlistenError = await listen<string>('scan-error', (e) => {
        setError(e.payload);
        setScanning(false);
      });

      const unlistenStarted = await listen<string>('process-started', (e) => {
        setRunningProcesses((prev) => new Set(prev).add(e.payload));
      });

      const unlistenStopped = await listen<string>('process-stopped', (e) => {
        setRunningProcesses((prev) => {
          const next = new Set(prev);
          next.delete(e.payload);
          return next;
        });
      });

      try {
        const { root_paths } = await invoke<{ root_paths: string[] }>('get_settings');
        setRootPaths(root_paths);

        if (root_paths.length > 0) {
          const cached = await invoke<RepoInfo[]>('get_cached_repos').catch(() => []);
          if (cached.length > 0) setRepos(cached.map(normalizeRepo));

          setScanning(true);
          invoke('start_scan', { rootPaths: root_paths }).catch((e) => {
            setError(String(e));
            setScanning(false);
          });
        }
      } catch (e) {
        setError(String(e));
      }

      return () => {
        unlistenFound();
        unlistenComplete();
        unlistenError();
        unlistenStarted();
        unlistenStopped();
      };
    };

    let cleanup: (() => void) | undefined;
    setup().then((c) => {
      cleanup = c;
    });

    return () => {
      cleanup?.();
    };
  }, []);

  const handleRunProject = (id: string, path: string, script: RunScript) => {
    invoke('run_project', { id, path, command: script.command }).catch((e) =>
      setError(String(e)),
    );
  };

  const handleStopProject = (id: string) => {
    invoke('stop_project', { id }).catch((e) => setError(String(e)));
  };

  const handleSaveRootPaths = (paths: string[]) => {
    setRootPaths(paths);
    invoke('save_root_paths', { paths }).catch((e) => setError(String(e)));
    setRepos([]);
    if (paths.length > 0) {
      setScanning(true);
      invoke('start_scan', { rootPaths: paths }).catch((e) => {
        setError(String(e));
        setScanning(false);
      });
    }
    setView('repos');
  };

  const filtered = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.path.toLowerCase().includes(search.toLowerCase()),
  );

  const renderMain = () => {
    if (view === 'settings') {
      return <SettingsPage rootPaths={rootPaths} onSave={handleSaveRootPaths} />;
    }

    if (view === 'summary') {
      return (
        <div className={styles.summaryPage}>
          <HealthSummary repos={repos} scanning={scanning} />
        </div>
      );
    }

    if (view === 'health') {
      return (
        <HealthView repos={repos} onSelectRepo={(repo) => setSelectedRepo(repo)} />
      );
    }

    if (view === 'deps') {
      return <DepsView repos={repos} />;
    }

    return (
      <>
        <div className={styles.toolbar}>
          <input
            className={styles.search}
            type="text"
            placeholder="Search repositories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className={styles.toolbarRight}>
            {scanning && (
              <span className={styles.scanningBadge}>Scanning…</span>
            )}
            {runningProcesses.size > 0 && (
              <span className={styles.runningBadge}>
                {runningProcesses.size} running
              </span>
            )}
            {!scanning && repos.length > 0 && (
              <span className={styles.count}>
                {filtered.length} {filtered.length === 1 ? 'repo' : 'repos'}
              </span>
            )}
          </div>
        </div>

        {scanning && repos.length === 0 ? (
          <LoadingIndicator />
        ) : (
          <RepoList
            repos={filtered}
            hasRootPaths={rootPaths.length > 0}
            runningProcesses={runningProcesses}
            onRun={handleRunProject}
            onStop={handleStopProject}
            onSelect={(repo) => setSelectedRepo(repo)}
          />
        )}
      </>
    );
  };

  return (
    <div className={styles.layout}>
      <Sidebar
        view={view}
        repos={repos}
        scanning={scanning}
        runningCount={runningProcesses.size}
        onViewChange={setView}
      />

      <main className={styles.main}>
        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}
        {renderMain()}
      </main>

      {selectedRepo && (
        <RepoDetailDrawer
          repo={selectedRepo}
          runningProcesses={runningProcesses}
          onRun={handleRunProject}
          onStop={handleStopProject}
          onClose={() => setSelectedRepo(null)}
        />
      )}
    </div>
  );
}

export default App;
