import { RepoInfo } from '../types';
import HealthBar from './HealthBar';
import styles from './RepoCard.module.css';

export default function RepoCard({ name, path, git, health, packages }: RepoInfo) {
  const totalDeps = packages
    ? packages.dep_count + packages.dev_dep_count
    : null;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.badge}>git</span>
        <span className={styles.name} title={name}>
          {name}
        </span>
      </div>

      <span className={styles.path} title={path}>
        {path}
      </span>

      {(git.branch || git.last_commit_msg) && (
        <div className={styles.gitRow}>
          {git.branch && (
            <span className={styles.branch}>{git.branch}</span>
          )}
          {git.last_commit_msg && (
            <span className={styles.commit} title={git.last_commit_msg}>
              {git.last_commit_msg}
            </span>
          )}
        </div>
      )}

      {git.last_commit_date && (
        <span className={styles.date}>last commit {git.last_commit_date}</span>
      )}

      <div className={styles.footer}>
        <div className={styles.healthWrap}>
          <HealthBar score={health.score} />
        </div>
        {totalDeps !== null && (
          <span className={styles.deps}>{totalDeps} deps</span>
        )}
      </div>
    </div>
  );
}
