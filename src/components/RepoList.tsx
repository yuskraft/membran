import { RepoInfo, RunScript } from '../types';
import RepoCard from './RepoCard';
import styles from './RepoList.module.css';

interface Props {
  repos: RepoInfo[];
  hasRootPaths: boolean;
  runningProcesses: Set<string>;
  onRun: (id: string, path: string, script: RunScript) => void;
  onStop: (id: string) => void;
  onSelect: (repo: RepoInfo) => void;
}

export default function RepoList({
  repos,
  hasRootPaths,
  runningProcesses,
  onRun,
  onStop,
  onSelect,
}: Props) {
  if (!hasRootPaths) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No root folders selected</p>
        <p className={styles.emptyHint}>
          Add a root folder from the sidebar to start scanning for repositories.
        </p>
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No repositories found</p>
        <p className={styles.emptyHint}>
          Try adding a different root folder or clearing the search filter.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {repos.map((repo) => (
        <RepoCard
          key={repo.path}
          repo={repo}
          runningProcesses={runningProcesses}
          onRun={onRun}
          onStop={onStop}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
