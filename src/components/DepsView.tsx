import { useState } from 'react';
import { RepoInfo } from '../types';
import styles from './DepsView.module.css';

interface DepEntry {
  name: string;
  versions: { version: string; repos: string[] }[];
  hasMismatch: boolean;
  totalUsages: number;
}

function buildDepAnalysis(repos: RepoInfo[]): DepEntry[] {
  const depMap = new Map<string, Map<string, string[]>>();

  for (const repo of repos) {
    if (!repo.packages) continue;
    const all = {
      ...repo.packages.dep_versions,
      ...repo.packages.dev_dep_versions,
    };
    for (const [name, version] of Object.entries(all)) {
      if (!depMap.has(name)) depMap.set(name, new Map());
      const versions = depMap.get(name)!;
      if (!versions.has(version)) versions.set(version, []);
      versions.get(version)!.push(repo.name);
    }
  }

  return Array.from(depMap.entries())
    .map(([name, versions]) => {
      const versionEntries = Array.from(versions.entries())
        .map(([v, r]) => ({ version: v, repos: r }))
        .sort((a, b) => b.repos.length - a.repos.length);
      const totalUsages = versionEntries.reduce((s, v) => s + v.repos.length, 0);
      return {
        name,
        versions: versionEntries,
        hasMismatch: versionEntries.length > 1,
        totalUsages,
      };
    })
    .sort((a, b) => {
      // Mismatches first, then by name
      if (a.hasMismatch !== b.hasMismatch) return a.hasMismatch ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

interface DepsViewProps {
  repos: RepoInfo[];
}

type Filter = 'mismatches' | 'all';

export default function DepsView({ repos }: DepsViewProps) {
  const [filter, setFilter] = useState<Filter>('mismatches');
  const [search, setSearch] = useState('');

  const allEntries = buildDepAnalysis(repos);
  const mismatches = allEntries.filter((e) => e.hasMismatch);

  const visible = (filter === 'mismatches' ? mismatches : allEntries).filter(
    (e) => !search || e.name.toLowerCase().includes(search.toLowerCase()),
  );

  const nodeRepoCount = repos.filter((r) => r.packages !== null).length;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <button
            className={`${styles.filterBtn} ${filter === 'mismatches' ? styles.filterActive : ''}`}
            onClick={() => setFilter('mismatches')}
          >
            Version mismatches
            {mismatches.length > 0 && (
              <span className={styles.filterBadge}>{mismatches.length}</span>
            )}
          </button>
          <button
            className={`${styles.filterBtn} ${filter === 'all' ? styles.filterActive : ''}`}
            onClick={() => setFilter('all')}
          >
            All shared deps
            <span className={styles.filterBadge}>{allEntries.length}</span>
          </button>
        </div>
        <input
          className={styles.search}
          type="text"
          placeholder="Search packages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.meta}>
        {nodeRepoCount} Node.js {nodeRepoCount === 1 ? 'repo' : 'repos'} ·{' '}
        {allEntries.length} unique packages ·{' '}
        <span className={mismatches.length > 0 ? styles.mismatchCount : ''}>
          {mismatches.length} version{' '}
          {mismatches.length === 1 ? 'mismatch' : 'mismatches'}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className={styles.empty}>
          {filter === 'mismatches'
            ? 'No version mismatches detected.'
            : 'No packages found.'}
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map((entry) => (
            <div
              key={entry.name}
              className={`${styles.entry} ${entry.hasMismatch ? styles.entryMismatch : ''}`}
            >
              <div className={styles.entryHeader}>
                <code className={styles.pkgName}>{entry.name}</code>
                {entry.hasMismatch && (
                  <span className={styles.mismatchBadge}>
                    {entry.versions.length} versions
                  </span>
                )}
              </div>
              <div className={styles.versions}>
                {entry.versions.map(({ version, repos: repoNames }) => (
                  <div key={version} className={styles.versionRow}>
                    <code className={styles.version}>{version}</code>
                    <div className={styles.repoTags}>
                      {repoNames.map((r) => (
                        <span key={r} className={styles.repoTag}>
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
