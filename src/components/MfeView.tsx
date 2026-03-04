import { useState } from 'react';
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

/** Collapse separators and lowercase so camelCase / kebab-case / PascalCase all compare equal. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_\s.@/]/g, '');
}

function buildMfeGroups(repos: RepoInfo[]): { groups: MfeGroup[]; standalone: RepoInfo[] } {
  const mfeRepos = repos.filter((r) => r.mfe !== null);

  // Build four lookup maps: exact and normalised, keyed by federation name and repo dir name.
  const byFedName = new Map<string, RepoInfo>();
  const byRepoName = new Map<string, RepoInfo>();
  const byNormFedName = new Map<string, RepoInfo>();
  const byNormRepoName = new Map<string, RepoInfo>();

  for (const repo of mfeRepos) {
    if (repo.mfe?.name) {
      byFedName.set(repo.mfe.name, repo);
      byNormFedName.set(normalizeName(repo.mfe.name), repo);
    }
    byRepoName.set(repo.name, repo);
    byNormRepoName.set(normalizeName(repo.name), repo);
  }

  const grouped = new Set<string>();
  const groups: MfeGroup[] = [];

  for (const repo of mfeRepos) {
    if (!repo.mfe?.is_host) continue;
    const remotes: ResolvedRemote[] = (repo.mfe.remotes ?? []).map((remote) => {
      const norm = normalizeName(remote.name);

      const matched =
        // 1. Exact federation name  (shareholderOperations === shareholderOperations)
        byFedName.get(remote.name) ??
        // 2. Exact repo dir name    (shareholderOperations === shareholderOperations)
        byRepoName.get(remote.name) ??
        // 3. Case-insensitive dir name
        repos.find((r) => r.name.toLowerCase() === remote.name.toLowerCase()) ??
        // 4. Normalised federation name  (camelCase vs kebab: "shareHolderOps" === "share-holder-ops")
        byNormFedName.get(norm) ??
        // 5. Normalised repo dir name   ("abb-dashboard" normalises to "abbdashboard" === "abbdashboard")
        byNormRepoName.get(norm) ??
        // 6. Substring: "abb-shareholder-operations" ⊇ "shareholderoperations" (min 4 chars)
        (norm.length >= 4
          ? mfeRepos.find((r) => {
              const normRepo = normalizeName(r.name);
              const normFed = r.mfe?.name ? normalizeName(r.mfe.name) : '';
              return (
                normRepo.includes(norm) ||
                norm.includes(normRepo) ||
                (normFed.length >= 4 && (normFed.includes(norm) || norm.includes(normFed)))
              );
            })
          : undefined);

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
  // Tracks which groups have their "not in scan" section expanded (keyed by host path).
  const [expandedUnmatched, setExpandedUnmatched] = useState<Set<string>>(new Set());

  const toggleUnmatched = (hostPath: string) =>
    setExpandedUnmatched((prev) => {
      const next = new Set(prev);
      if (next.has(hostPath)) next.delete(hostPath);
      else next.add(hostPath);
      return next;
    });

  if (mfeRepos.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No micro-frontends detected</p>
        <p className={styles.emptyHint}>
          Repos using Module Federation will appear here. Detected via:{' '}
          <code>module-federation.config.{'{js,ts}'}</code>,{' '}
          <code>webpack.config.js</code> with <code>ModuleFederationPlugin</code>,{' '}
          <code>rspack.config.js</code>, <code>rsbuild.config.ts</code>,{' '}
          <code>vite.config.ts</code> with <code>federation()</code>, or{' '}
          <code>package.json</code> with <code>@module-federation/*</code> deps.
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
            {group.remotes.length > 0 && (() => {
              const matched = group.remotes.filter((r) => r.repo !== null);
              const unmatched = group.remotes.filter((r) => r.repo === null);
              const unmatchedOpen = expandedUnmatched.has(group.host.path);

              return (
                <div className={styles.remotes}>
                  {/* Matched remotes */}
                  {matched.map(({ remote, repo }, i) => {
                    const remoteRunning = runningProcesses.has(repo!.path);
                    const mocks = getMockServers(repo!);

                    const handleRunRemote = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      if (remoteRunning) {
                        onStop(repo!.path);
                      } else {
                        startRepoWithMocks(repo!, runningProcesses, onRun);
                        startRepoWithMocks(group.host, runningProcesses, onRun);
                      }
                    };

                    return (
                      <div key={remote.name + i} className={styles.remoteBlock}>
                        <div
                          className={`${styles.remoteRow} ${styles.remoteMatched}`}
                          onClick={() => onSelectRepo(repo!)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && onSelectRepo(repo!)}
                        >
                          <span className={styles.connector}>└──</span>
                          <span className={`${styles.roleBadge} ${styles.badgeRemote}`}>REMOTE</span>
                          <span className={styles.remoteName}>{repo!.name}</span>
                          {remote.url && (
                            <span className={styles.remoteUrl} title={remote.url}>
                              {remote.url.replace(/^https?:\/\//, '')}
                            </span>
                          )}
                          <button
                            className={`${styles.runBtn} ${remoteRunning ? styles.runBtnStop : ''}`}
                            onClick={handleRunRemote}
                            title={remoteRunning ? 'Stop remote' : `Run ${repo!.name} + ${group.host.name} + mock servers`}
                          >
                            {remoteRunning ? '■' : '▶'}
                          </button>
                          {remoteRunning && <span className={styles.runDot} />}
                        </div>

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

                  {/* Unmatched remotes — collapsed by default */}
                  {unmatched.length > 0 && (
                    <div className={styles.unmatchedGroup}>
                      <button
                        className={styles.unmatchedToggle}
                        onClick={(e) => { e.stopPropagation(); toggleUnmatched(group.host.path); }}
                        title={unmatchedOpen ? 'Hide remotes not found in scan' : 'Show remotes not found in scan'}
                      >
                        <span className={styles.connector}>└──</span>
                        <span className={styles.unmatchedCount}>
                          {unmatched.length} not in scan
                        </span>
                        <span className={`${styles.unmatchedChevron} ${unmatchedOpen ? styles.unmatchedChevronOpen : ''}`}>▶</span>
                      </button>

                      {unmatchedOpen && (
                        <div className={styles.unmatchedList}>
                          {unmatched.map(({ remote }, i) => (
                            <div key={remote.name + i} className={`${styles.remoteRow} ${styles.remoteUnmatched}`}>
                              <span className={styles.connectorInner}>    └──</span>
                              <span className={`${styles.roleBadge} ${styles.badgeRemote}`}>REMOTE</span>
                              <span className={styles.remoteName}>{remote.name}</span>
                              {remote.url && (
                                <span className={styles.remoteUrl} title={remote.url}>
                                  {remote.url.replace(/^https?:\/\//, '')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
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
