import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RepoInfo, OutdatedResult } from '../types';
import styles from './DepPanel.module.css';

interface DepPanelProps {
  repo: RepoInfo;
}

export default function DepPanel({ repo }: DepPanelProps) {
  const [outdated, setOutdated] = useState<OutdatedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pkgs = repo.packages;

  const checkOutdated = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<OutdatedResult>('get_outdated_packages', {
        path: repo.path,
      });
      setOutdated(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!pkgs) {
    return <p className={styles.na}>No package.json in this repository.</p>;
  }

  const allDeps: Array<{ name: string; version: string; isDev: boolean }> = [
    ...Object.entries(pkgs.dep_versions).map(([name, version]) => ({
      name,
      version,
      isDev: false,
    })),
    ...Object.entries(pkgs.dev_dep_versions).map(([name, version]) => ({
      name,
      version,
      isDev: true,
    })),
  ];

  const outdatedCount = outdated ? Object.keys(outdated).length : null;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.stats}>
          <span className={styles.stat}>
            <strong>{pkgs.dep_count}</strong> prod deps
          </span>
          <span className={styles.statSep}>·</span>
          <span className={styles.stat}>
            <strong>{pkgs.dev_dep_count}</strong> dev deps
          </span>
        </div>
        <button
          className={styles.checkBtn}
          onClick={checkOutdated}
          disabled={loading}
        >
          {loading ? 'Checking…' : 'Check outdated'}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {outdated !== null && (
        <div className={styles.outdatedSection}>
          {outdatedCount === 0 ? (
            <div className={styles.allGood}>All packages up to date</div>
          ) : (
            <>
              <div className={styles.outdatedHeader}>
                {outdatedCount} outdated {outdatedCount === 1 ? 'package' : 'packages'}
              </div>
              <div className={styles.outdatedList}>
                {Object.entries(outdated).map(([name, info]) => (
                  <div key={name} className={styles.outdatedRow}>
                    <span className={styles.depName}>{name}</span>
                    <span className={styles.versionCurrent}>{info.current}</span>
                    <span className={styles.versionArrow}>→</span>
                    <span
                      className={
                        info.latest !== info.wanted
                          ? styles.versionLatestMajor
                          : styles.versionWanted
                      }
                    >
                      {info.latest}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className={styles.depList}>
        <div className={styles.depListHeader}>
          <span>Package</span>
          <span>Version</span>
        </div>
        {allDeps.map(({ name, version, isDev }) => (
          <div
            key={name}
            className={`${styles.depRow} ${outdated?.[name] ? styles.depOutdated : ''}`}
          >
            <span className={styles.depName}>
              {name}
              {isDev && <span className={styles.devTag}>dev</span>}
            </span>
            <span className={styles.depVersion}>{version}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
