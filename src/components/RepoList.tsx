import { RepoInfo } from '../types';
import RepoCard from './RepoCard';
import styles from './RepoList.module.css';

interface Props {
  repos: RepoInfo[];
  hasRootPaths: boolean;
}

export default function RepoList({ repos, hasRootPaths }: Props) {
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
    <div className={styles.grid}>
      {repos.map((repo) => (
        <RepoCard key={repo.path} {...repo} />
      ))}
    </div>
  );
}
