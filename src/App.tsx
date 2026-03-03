import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { RepoInfo } from './types';
import HealthSummary from './components/HealthSummary';
import RepoList from './components/RepoList';
import LoadingIndicator from './components/LoadingIndicator';
import ErrorBanner from './components/ErrorBanner';
import SettingsPage from './components/SettingsPage';
import styles from './App.module.css';

type View = 'repos' | 'settings';

function App() {
  const [view, setView] = useState<View>('repos');
  const [rootPaths, setRootPaths] = useState<string[]>([]);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const setup = async () => {
      // Register event listeners before starting any scan
      const unlistenFound = await listen<RepoInfo>('repo-found', (e) => {
        setRepos((prev) => {
          const idx = prev.findIndex((r) => r.path === e.payload.path);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = e.payload;
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

      // Load persisted settings
      try {
        const { root_paths } = await invoke<{ root_paths: string[] }>('get_settings');
        setRootPaths(root_paths);

        if (root_paths.length > 0) {
          // Show cached repos immediately while fresh scan runs
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

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <nav className={styles.nav}>
          <button
            className={`${styles.navBtn} ${view === 'repos' ? styles.navBtnActive : ''}`}
            onClick={() => setView('repos')}
          >
            Repos
          </button>
          <button
            className={`${styles.navBtn} ${view === 'settings' ? styles.navBtnActive : ''}`}
            onClick={() => setView('settings')}
          >
            Settings
          </button>
        </nav>
        <HealthSummary repos={repos} scanning={scanning} />
      </aside>

      <main className={styles.main}>
        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        {view === 'settings' ? (
          <SettingsPage rootPaths={rootPaths} onSave={handleSaveRootPaths} />
        ) : (
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
                {!scanning && repos.length > 0 && (
                  <span className={styles.count}>
                    {filtered.length}{' '}
                    {filtered.length === 1 ? 'repo' : 'repos'}
                  </span>
                )}
              </div>
            </div>

            {scanning && repos.length === 0 ? (
              <LoadingIndicator />
            ) : (
              <RepoList repos={filtered} hasRootPaths={rootPaths.length > 0} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
