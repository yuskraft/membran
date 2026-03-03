import { GitCommit } from '../types';
import styles from './GitHistoryPanel.module.css';

interface GitHistoryPanelProps {
  commits: GitCommit[];
}

export default function GitHistoryPanel({ commits }: GitHistoryPanelProps) {
  if (commits.length === 0) {
    return (
      <div className={styles.empty}>No git history available.</div>
    );
  }

  return (
    <div className={styles.list}>
      {commits.map((commit, i) => (
        <div key={i} className={styles.commit}>
          <div className={styles.commitMeta}>
            <code className={styles.hash}>{commit.hash}</code>
            <span className={styles.author}>{commit.author}</span>
            <span className={styles.date}>{commit.date}</span>
          </div>
          <p className={styles.message}>{commit.message}</p>
        </div>
      ))}
    </div>
  );
}
