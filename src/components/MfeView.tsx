import { RepoInfo, MfeRemote, RunScript, NestedProject } from '../types';
import styles from './MfeView.module.css';

interface MfeViewProps {
  repos: RepoInfo[];
  onSelectRepo: (repo: RepoInfo) => void;
  runningProcesses: Set<string>;
  onRun: (id: string, path: string, script: RunScript) => void;
  onStop: (id: string) => void;
}

interface ResolvedRemote {
  remote: MfeRemote;
  repo: RepoInfo | null;
}

interface MfeGroup {
  host: RepoInfo;
  remotes: ResolvedRemote[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMfeGroups(repos: RepoInfo[]): { groups: MfeGroup[]; standalone: RepoInfo[] } {
  const mfeRepos = repos.filter((r) => r.mfe !== null);

  const byFedName = new Map<string, RepoInfo>();
  const byRepoName = new Map<string, RepoInfo>();
  for (const repo of mfeRepos) {
    if (repo.mfe?.name) byFedName.set(repo.mfe.name, repo);
    byRepoName.set(repo.name, repo);
  }

  const grouped = new Set<string>();
  const groups: MfeGroup[] = [];

  for (const repo of mfeRepos) {
    if (!repo.mfe?.is_host) continue;
    const remotes: ResolvedRemote[] = (repo.mfe.remotes ?? []).map((remote) => {
      const matched =
        byFedName.get(remote.name) ??
        byRepoName.get(remote.name) ??
        repos.find((r) => r.name.toLowerCase() === remote.name.toLowerCase());
      return { remote, repo: matched ?? null };
    });
    groups.push({ host: repo, remotes });
    grouped.add(repo.path);
    for (const { repo: r } of remotes) {
      if (r) grouped.add(r.path);
    }
  }

  const standalone = mfeRepos.filter((r) => !grouped.has(r.path));
  return { groups, standalone };
}

function roleBadge(repo: RepoInfo): { label: string; cls: string } {
  const mfe = repo.mfe!;
  if (mfe.is_host && mfe.is_remote) return { label: 'HOST+REMOTE', cls: styles.badgeHub };
  if (mfe.is_host) return { label: 'HOST', cls: styles.badgeHost };
  return { label: 'REMOTE', cls: styles.badgeRemote };
}

function getMockServers(repo: RepoInfo): NestedProject[] {
  return repo.nested_projects.filter((p) => p.project_type === 'mock server');
}

/** Start a repo's dev server + all its mock servers (only if not already running). */
function startRepoWithMocks(
  repo: RepoInfo,
  runningProcesses: Set<string>,
  onRun: (id: string, path: string, script: RunScript) => void,
) {
  if (repo.scripts.length > 0 && !runningProcesses.has(repo.path)) {
    onRun(repo.path, repo.path, repo.scripts[0]);
  }
  for (const mock of getMockServers(repo)) {
    if (mock.scripts.length > 0 && !runningProcesses.has(mock.id)) {
      onRun(mock.id, mock.path, mock.scripts[0]);
    }
  }
}

/** Stop a repo's dev server + all its mock servers. */
function stopRepoWithMocks(
  repo: RepoInfo,
  runningProcesses: Set<string>,
  onStop: (id: string) => void,
) {
  if (runningProcesses.has(repo.path)) onStop(repo.path);
  for (const mock of getMockServers(repo)) {
    if (runningProcesses.has(mock.id)) onStop(mock.id);
  }
}

function isRepoRunning(repo: RepoInfo, runningProcesses: Set<string>): boolean {
  return (
    runningProcesses.has(repo.path) ||
    getMockServers(repo).some((m) => runningProcesses.has(m.id))
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MfeView({
  repos,
  onSelectRepo,
  runningProcesses,
  onRun,
  onStop,
}: MfeViewProps) {
  const mfeRepos = repos.filter((r) => r.mfe !== null);

  if (mfeRepos.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No micro-frontends detected</p>
        <p className={styles.emptyHint}>
          Repos with a <code>webpack.config.js</code> containing{' '}
          <code>ModuleFederationPlugin</code>, or a <code>vite.config.ts</code> using{' '}
          <code>federation()</code>, will appear here.
        </p>
      </div>
    );
  }

  const { groups, standalone } = buildMfeGroups(repos);

  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        {mfeRepos.length} MFE {mfeRepos.length === 1 ? 'repo' : 'repos'} detected ·{' '}
        {groups.length} {groups.length === 1 ? 'group' : 'groups'}
        {standalone.length > 0 && ` · ${standalone.length} standalone`}
      </div>

      {groups.map((group) => {
        const { label, cls } = roleBadge(group.host);
        const fw = group.host.mfe!.framework;

        const matchedRepos = group.remotes
          .filter((r) => r.repo !== null)
          .map((r) => r.repo!);

        const groupRunning = isRepoRunning(group.host, runningProcesses) ||
          matchedRepos.some((r) => isRepoRunning(r, runningProcesses));
        const hostRunning = runningProcesses.has(group.host.path);

        const handleRunGroup = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (groupRunning) {
            stopRepoWithMocks(group.host, runningProcesses, onStop);
            for (const remote of matchedRepos) {
              stopRepoWithMocks(remote, runningProcesses, onStop);
            }
          } else {
            startRepoWithMocks(group.host, runningProcesses, onRun);
            for (const remote of matchedRepos) {
              startRepoWithMocks(remote, runningProcesses, onRun);
            }
          }
        };

        return (
          <div key={group.host.path} className={styles.group}>
            {/* Host row */}
            <div
              className={styles.hostRow}
              onClick={() => onSelectRepo(group.host)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectRepo(group.host)}
            >
              <div className={styles.hostLeft}>
                {hostRunning && <span className={styles.runDot} title="Running" />}
                <span className={`${styles.roleBadge} ${cls}`}>{label}</span>
                <span className={styles.hostName}>{group.host.name}</span>
                {group.host.mfe!.name && (
                  <span className={styles.fedName}>{group.host.mfe!.name}</span>
                )}
              </div>
              <div className={styles.hostRight}>
                <span className={styles.framework}>{fw}</span>
                <button
                  className={`${styles.runGroupBtn} ${groupRunning ? styles.runGroupBtnStop : ''}`}
                  onClick={handleRunGroup}
                  title={groupRunning ? 'Stop all in group' : 'Run all in group (host + remotes + mock servers)'}
                >
                  {groupRunning ? '■ Stop All' : '▶ Run All'}
                </button>
              </div>
            </div>

            {/* Remote rows */}
            {group.remotes.length > 0 && (
              <div className={styles.remotes}>
                {group.remotes.map(({ remote, repo }, i) => {
                  const remoteRunning = repo ? runningProcesses.has(repo.path) : false;
                  const mocks = repo ? getMockServers(repo) : [];

                  const handleRunRemote = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (!repo) return;
                    if (remoteRunning) {
                      onStop(repo.path);
                    } else {
                      // Run the remote + its mock servers + the host (as dependency)
                      startRepoWithMocks(repo, runningProcesses, onRun);
                      startRepoWithMocks(group.host, runningProcesses, onRun);
                    }
                  };

                  return (
                    <div key={remote.name + i} className={styles.remoteBlock}>
                      <div
                        className={`${styles.remoteRow} ${repo ? styles.remoteMatched : styles.remoteUnmatched}`}
                        onClick={() => repo && onSelectRepo(repo)}
                        role={repo ? 'button' : undefined}
                        tabIndex={repo ? 0 : undefined}
                        onKeyDown={
                          repo ? (e) => e.key === 'Enter' && onSelectRepo(repo) : undefined
                        }
                      >
                        <span className={styles.connector}>└──</span>
                        <span className={`${styles.roleBadge} ${styles.badgeRemote}`}>REMOTE</span>
                        <span className={styles.remoteName}>{repo ? repo.name : remote.name}</span>
                        {remote.url && (
                          <span className={styles.remoteUrl} title={remote.url}>
                            {remote.url.replace(/^https?:\/\//, '')}
                          </span>
                        )}
                        {!repo && <span className={styles.unmatchedHint}>not in scan</span>}
                        {repo && (
                          <button
                            className={`${styles.runBtn} ${remoteRunning ? styles.runBtnStop : ''}`}
                            onClick={handleRunRemote}
                            title={
                              remoteRunning
                                ? 'Stop remote'
                                : `Run ${repo.name} + ${group.host.name} + mock servers`
                            }
                          >
                            {remoteRunning ? '■' : '▶'}
                          </button>
                        )}
                        {remoteRunning && <span className={styles.runDot} />}
                      </div>

                      {/* Mock server sub-rows */}
                      {mocks.map((mock) => {
                        const mockRunning = runningProcesses.has(mock.id);
                        return (
                          <div key={mock.id} className={styles.mockRow}>
                            <span className={styles.connectorInner}>    └──</span>
                            <span className={styles.mockBadge}>mock</span>
                            <span className={styles.mockName}>{mock.name}</span>
                            {mockRunning && (
                              <>
                                <span className={styles.runDot} />
                                <button
                                  className={styles.runBtnStop}
                                  onClick={(e) => { e.stopPropagation(); onStop(mock.id); }}
                                  title={`Stop ${mock.name}`}
                                >
                                  ■
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Standalone MFE repos */}
      {standalone.length > 0 && (
        <div className={styles.standaloneSection}>
          <h3 className={styles.standaloneTitle}>Standalone</h3>
          <p className={styles.standaloneHint}>
            These repos are MFE participants but their host is not in the current scan.
          </p>
          {standalone.map((repo) => {
            const { label, cls } = roleBadge(repo);
            const running = runningProcesses.has(repo.path);
            const mocks = getMockServers(repo);

            return (
              <div key={repo.path} className={styles.standaloneCard}>
                <div
                  className={styles.standaloneRow}
                  onClick={() => onSelectRepo(repo)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onSelectRepo(repo)}
                >
                  {running && <span className={styles.runDot} />}
                  <span className={`${styles.roleBadge} ${cls}`}>{label}</span>
                  <span className={styles.hostName}>{repo.name}</span>
                  {repo.mfe!.name && (
                    <span className={styles.fedName}>{repo.mfe!.name}</span>
                  )}
                  <span className={styles.framework}>{repo.mfe!.framework}</span>
                  {repo.mfe!.exposes.length > 0 && (
                    <span className={styles.exposesHint}>
                      exposes {repo.mfe!.exposes.length} module
                      {repo.mfe!.exposes.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {repo.scripts.length > 0 && (
                    <button
                      className={`${styles.runBtn} ${running ? styles.runBtnStop : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (running) {
                          stopRepoWithMocks(repo, runningProcesses, onStop);
                        } else {
                          startRepoWithMocks(repo, runningProcesses, onRun);
                        }
                      }}
                      title={running ? 'Stop' : 'Run + mock servers'}
                    >
                      {running ? '■' : '▶'}
                    </button>
                  )}
                </div>

                {mocks.length > 0 && (
                  <div className={styles.standaloneMocks}>
                    {mocks.map((mock) => {
                      const mockRunning = runningProcesses.has(mock.id);
                      return (
                        <div key={mock.id} className={styles.mockRow}>
                          <span className={styles.connectorInner}>  └──</span>
                          <span className={styles.mockBadge}>mock</span>
                          <span className={styles.mockName}>{mock.name}</span>
                          {mockRunning && (
                            <>
                              <span className={styles.runDot} />
                              <button
                                className={styles.runBtnStop}
                                onClick={() => onStop(mock.id)}
                                title={`Stop ${mock.name}`}
                              >
                                ■
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
