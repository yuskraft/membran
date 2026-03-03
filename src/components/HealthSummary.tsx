import { RepoInfo } from '../types';
import HealthBar from './HealthBar';
import styles from './HealthSummary.module.css';

interface Props {
  repos: RepoInfo[];
  scanning: boolean;
}

export default function HealthSummary({ repos, scanning }: Props) {
  if (repos.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.empty}>
          {scanning ? 'Scanning…' : 'No repositories yet'}
        </p>
      </div>
    );
  }

  const avgScore = Math.round(
    repos.reduce((sum, r) => sum + r.health.score, 0) / repos.length,
  );
  const high = repos.filter((r) => r.health.score >= 80).length;
  const mid = repos.filter((r) => r.health.score >= 50 && r.health.score < 80).length;
  const low = repos.filter((r) => r.health.score < 50).length;

  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>Health Overview</h3>

      <div className={styles.row}>
        <span className={styles.label}>Total</span>
        <span className={styles.value}>{repos.length}</span>
      </div>

      <div className={styles.avgRow}>
        <span className={styles.label}>Avg</span>
        <div className={styles.avgBar}>
          <HealthBar score={avgScore} />
        </div>
      </div>

      <div className={styles.dist}>
        <div className={styles.distRow}>
          <span className={styles.dot} style={{ background: 'var(--health-high)' }} />
          <span className={styles.distLabel}>High ≥80</span>
          <span className={styles.distCount}>{high}</span>
        </div>
        <div className={styles.distRow}>
          <span className={styles.dot} style={{ background: 'var(--health-mid)' }} />
          <span className={styles.distLabel}>Med ≥50</span>
          <span className={styles.distCount}>{mid}</span>
        </div>
        <div className={styles.distRow}>
          <span className={styles.dot} style={{ background: 'var(--health-low)' }} />
          <span className={styles.distLabel}>Low &lt;50</span>
          <span className={styles.distCount}>{low}</span>
        </div>
      </div>
    </div>
  );
}
