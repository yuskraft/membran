import { useState } from 'react';
import { RepoInfo } from '../types';
import styles from './HealthView.module.css';

interface HealthViewProps {
  repos: RepoInfo[];
  onSelectRepo: (repo: RepoInfo) => void;
}

type SortKey = 'score' | 'name' | 'deps';
type SortDir = 'asc' | 'desc';

function Tick({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? styles.tickPass : styles.tickFail}>
      {ok ? '✓' : '✗'}
    </span>
  );
}

export default function HealthView({ repos, onSelectRepo }: HealthViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...repos].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'score') cmp = a.health.score - b.health.score;
    else if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortKey === 'deps') {
      const da = a.packages ? a.packages.dep_count + a.packages.dev_dep_count : 0;
      const db = b.packages ? b.packages.dep_count + b.packages.dev_dep_count : 0;
      cmp = da - db;
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  if (repos.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No repositories to analyse yet.</p>
      </div>
    );
  }

  const SortBtn = ({ col }: { col: SortKey }) => (
    <button className={styles.sortBtn} onClick={() => toggleSort(col)}>
      {sortKey === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
    </button>
  );

  return (
    <div className={styles.root}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thName}>
                Repo <SortBtn col="name" />
              </th>
              <th className={styles.thScore}>
                Score <SortBtn col="score" />
              </th>
              <th className={styles.thCheck} title="node_modules installed">
                node_modules
              </th>
              <th className={styles.thCheck} title="Lockfile present">
                Lockfile
              </th>
              <th className={styles.thCheck} title="TypeScript strict mode">
                TS strict
              </th>
              <th className={styles.thCheck} title="ESLint configured">
                ESLint
              </th>
              <th className={styles.thCheck} title="CI pipeline configured">
                CI
              </th>
              <th className={styles.thCheck} title="Tests present">
                Tests
              </th>
              <th className={styles.thDeps}>
                Deps <SortBtn col="deps" />
              </th>
              <th className={styles.thDist}>Bundle</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((repo) => {
              const h = repo.health;
              const totalDeps = repo.packages
                ? repo.packages.dep_count + repo.packages.dev_dep_count
                : null;
              const distMb = repo.dist_size_bytes
                ? (repo.dist_size_bytes / (1024 * 1024)).toFixed(1)
                : null;

              return (
                <tr
                  key={repo.path}
                  className={styles.row}
                  onClick={() => onSelectRepo(repo)}
                  title="Click to view details"
                >
                  <td className={styles.tdName}>
                    <span className={styles.repoName}>{repo.name}</span>
                    {repo.git.branch && (
                      <span className={styles.repoBranch}>{repo.git.branch}</span>
                    )}
                  </td>
                  <td className={styles.tdScore}>
                    <span
                      className={`${styles.scorePill} ${
                        h.score >= 80
                          ? styles.scoreHigh
                          : h.score >= 50
                            ? styles.scoreMid
                            : styles.scoreLow
                      }`}
                    >
                      {h.score}
                    </span>
                  </td>
                  <td className={styles.tdCheck}>
                    <Tick ok={h.has_node_modules} />
                  </td>
                  <td className={styles.tdCheck}>
                    <Tick ok={h.has_lockfile} />
                  </td>
                  <td className={styles.tdCheck}>
                    <Tick ok={h.typescript_strict} />
                  </td>
                  <td className={styles.tdCheck}>
                    <Tick ok={h.has_eslint} />
                  </td>
                  <td className={styles.tdCheck}>
                    <Tick ok={h.has_ci} />
                  </td>
                  <td className={styles.tdCheck}>
                    <Tick ok={h.has_tests} />
                  </td>
                  <td className={styles.tdDeps}>
                    {totalDeps !== null ? totalDeps : '—'}
                  </td>
                  <td className={styles.tdDist}>
                    {distMb !== null ? `${distMb} MB` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
