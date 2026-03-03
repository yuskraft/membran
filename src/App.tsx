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
        setRepos((prev) => {
          const idx = prev.findIndex((r) => r.path === e.payload.path);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = e.payload;
            setSelectedRepo((sel) =>
              sel?.path === e.payload.path ? e.payload : sel,
            );
            return next;
          }
          return [...prev, e.payload];
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
          if (cached.length > 0) setRepos(cached);

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
