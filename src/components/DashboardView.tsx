import { RepoInfo, RepoHealth, View } from '../types';
import styles from './DashboardView.module.css';

interface DashboardViewProps {
  repos: RepoInfo[];
  runningCount: number;
  scanning: boolean;
  onSelectRepo: (repo: RepoInfo) => void;
  onNavigate: (view: View) => void;
}

type HealthBoolKey = Exclude<keyof RepoHealth, 'score'>;

const CHECKS: { key: HealthBoolKey; label: string }[] = [
  { key: 'has_lockfile', label: 'Lockfile' },
  { key: 'has_typescript', label: 'TypeScript' },
  { key: 'typescript_strict', label: 'TS Strict' },
  { key: 'has_eslint', label: 'ESLint' },
  { key: 'has_ci', label: 'CI Config' },
  { key: 'has_tests', label: 'Tests' },
  { key: 'node_modules_ignored', label: 'node_modules ignored' },
];

function getMissingChecks(repo: RepoInfo): string[] {
  const h = repo.health;
  const missing: string[] = [];
  if (!h.has_lockfile) missing.push('No lockfile');
  if (!h.has_eslint) missing.push('No ESLint');
  if (!h.has_ci) missing.push('No CI');
  if (!h.has_tests) missing.push('No tests');
  if (!h.typescript_strict) missing.push('TS not strict');
  if (!h.has_typescript) missing.push('No TypeScript');
  return missing;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString();
}

function scoreClass(score: number): string {
  if (score >= 80) return styles.high;
  if (score >= 50) return styles.mid;
  return styles.low;
}

export default function DashboardView({
  repos,
  runningCount,
  scanning,
  onSelectRepo,
  onNavigate,
}: DashboardViewProps) {
  if (repos.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>
          {scanning ? 'Scanning repositories…' : 'No repositories yet'}
        </p>
        {!scanning && (
          <button className={styles.emptyAction} onClick={() => onNavigate('settings')}>
            Configure scan paths →
          </button>
        )}
      </div>
    );
  }

  const total = repos.length;
  const avgScore = Math.round(repos.reduce((s, r) => s + r.health.score, 0) / total);
  const high = repos.filter((r) => r.health.score >= 80).length;
  const mid = repos.filter((r) => r.health.score >= 50 && r.health.score < 80).length;
  const low = repos.filter((r) => r.health.score < 50).length;
  const totalDeps = repos.reduce(
    (s, r) => s + (r.packages ? r.packages.dep_count + r.packages.dev_dep_count : 0),
    0,
  );
  const nodeRepos = repos.filter((r) => r.packages !== null).length;
  const mfeCount = repos.filter((r) => r.mfe !== null).length;

  const worstRepos = [...repos].sort((a, b) => a.health.score - b.health.score).slice(0, 5);

  const recentRepos = [...repos]
    .filter((r) => r.last_modified)
    .sort((a, b) => new Date(b.last_modified!).getTime() - new Date(a.last_modified!).getTime())
    .slice(0, 5);

  return (
    <div className={styles.root}>
      {scanning && <div className={styles.scanningBanner}>Scanning…</div>}

      {/* Stat cards */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{total}</span>
          <span className={styles.statLabel}>Repositories</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardAccent}`}>
          <span className={`${styles.statValue} ${scoreClass(avgScore)}`}>{avgScore}</span>
          <span className={styles.statLabel}>Avg Health Score</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statValue} ${low > 0 ? styles.low : styles.high}`}>
            {low}
          </span>
          <span className={styles.statLabel}>Need Attention</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{totalDeps.toLocaleString()}</span>
          <span className={styles.statLabel}>Total Deps</span>
          <span className={styles.statSub}>{nodeRepos} Node.js repos</span>
        </div>
        {runningCount > 0 && (
          <div
            className={`${styles.statCard} ${styles.statCardRunning}`}
            onClick={() => onNavigate('running')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigate('running')}
          >
            <span className={`${styles.statValue} ${styles.running}`}>{runningCount}</span>
            <span className={styles.statLabel}>Running</span>
          </div>
        )}
        {mfeCount > 0 && (
          <div
            className={`${styles.statCard} ${styles.statCardMfe}`}
            onClick={() => onNavigate('mfe')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigate('mfe')}
          >
            <span className={`${styles.statValue} ${styles.mfe}`}>{mfeCount}</span>
            <span className={styles.statLabel}>Micro Frontends</span>
          </div>
        )}
      </div>

      <div className={styles.grid}>
        {/* Left column */}
        <div className={styles.col}>
          {/* Health distribution */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Health Distribution</h2>
            <div className={styles.distBar}>
              {high > 0 && (
                <div
                  className={`${styles.distSegment} ${styles.segHigh}`}
                  style={{ flex: high }}
                  title={`High: ${high}`}
                />
              )}
              {mid > 0 && (
                <div
                  className={`${styles.distSegment} ${styles.segMid}`}
                  style={{ flex: mid }}
                  title={`Mid: ${mid}`}
                />
              )}
              {low > 0 && (
                <div
                  className={`${styles.distSegment} ${styles.segLow}`}
                  style={{ flex: low }}
                  title={`Low: ${low}`}
                />
              )}
            </div>
            <div className={styles.distLegend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.segHigh}`} />
                High ≥80 &nbsp;<strong>{high}</strong>
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.segMid}`} />
                Med ≥50 &nbsp;<strong>{mid}</strong>
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.segLow}`} />
                Low &lt;50 &nbsp;<strong>{low}</strong>
              </span>
            </div>
          </section>

          {/* Checks coverage */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Checks Coverage</h2>
            <div className={styles.checks}>
              {CHECKS.map(({ key, label }) => {
                const passing = repos.filter((r) => r.health[key]).length;
                const pct = total > 0 ? Math.round((passing / total) * 100) : 0;
                return (
                  <div key={key} className={styles.checkRow}>
                    <span className={styles.checkLabel}>{label}</span>
                    <div className={styles.checkBar}>
                      <div
                        className={`${styles.checkFill} ${pct >= 80 ? styles.fillHigh : pct >= 50 ? styles.fillMid : styles.fillLow}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={styles.checkCount}>
                      {passing}/{total}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className={styles.col}>
          {/* Needs attention */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Needs Attention</h2>
              {low > 0 && (
                <button className={styles.viewAll} onClick={() => onNavigate('health')}>
                  View all →
                </button>
              )}
            </div>
            {low === 0 ? (
              <p className={styles.allGood}>All repos score ≥ 50</p>
            ) : (
              <div className={styles.repoList}>
                {worstRepos
                  .filter((r) => r.health.score < 50)
                  .map((repo) => {
                    const missing = getMissingChecks(repo);
                    const shown = missing.slice(0, 3);
                    const extra = missing.length - shown.length;
                    return (
                      <div
                        key={repo.path}
                        className={styles.attentionRow}
                        onClick={() => onSelectRepo(repo)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && onSelectRepo(repo)}
                      >
                        <div className={styles.attentionLeft}>
                          <span className={styles.attentionName}>{repo.name}</span>
                          <div className={styles.attentionTags}>
                            {shown.map((m) => (
                              <span key={m} className={styles.issueTag}>
                                {m}
                              </span>
                            ))}
                            {extra > 0 && (
                              <span className={styles.issueTagMore}>+{extra}</span>
                            )}
                          </div>
                        </div>
                        <span className={`${styles.scorePill} ${styles.low}`}>
                          {repo.health.score}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>

          {/* Recent activity */}
          {recentRepos.length > 0 && (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Recent Activity</h2>
              <div className={styles.repoList}>
                {recentRepos.map((repo) => (
                  <div
                    key={repo.path}
                    className={styles.recentRow}
                    onClick={() => onSelectRepo(repo)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectRepo(repo)}
                  >
                    <div className={styles.recentLeft}>
                      <span className={styles.recentName}>{repo.name}</span>
                      {repo.git.last_commit_msg && (
                        <span className={styles.recentCommit}>{repo.git.last_commit_msg}</span>
                      )}
                    </div>
                    <div className={styles.recentRight}>
                      <span className={`${styles.scorePill} ${scoreClass(repo.health.score)}`}>
                        {repo.health.score}
                      </span>
                      <span className={styles.recentDate}>
                        {formatRelativeDate(repo.last_modified!)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
