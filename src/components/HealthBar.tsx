import styles from './HealthBar.module.css';

interface Props {
  score: number;
  showLabel?: boolean;
}

function healthColor(score: number): string {
  if (score >= 80) return 'var(--health-high)';
  if (score >= 50) return 'var(--health-mid)';
  return 'var(--health-low)';
}

export default function HealthBar({ score, showLabel = true }: Props) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${score}%`, backgroundColor: healthColor(score) }}
        />
      </div>
      {showLabel && <span className={styles.label}>{score}</span>}
    </div>
  );
}
