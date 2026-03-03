import { RepoInfo } from '../types';
import styles from './HealthDetailPanel.module.css';

interface HealthDetailPanelProps {
  repo: RepoInfo;
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={styles.checkRow}>
      <span className={ok ? styles.checkPass : styles.checkFail}>
        {ok ? '✓' : '✗'}
      </span>
      <span className={styles.checkLabel}>{label}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      {children}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function HealthDetailPanel({ repo }: HealthDetailPanelProps) {
  const h = repo.health;
  const pkgs = repo.packages;

  return (
    <div className={styles.root}>
      {/* ── Basic Hygiene ─────────────────────────────────────────────── */}
      <Section title="Basic Hygiene">
        <Check ok={h.has_node_modules} label="node_modules installed" />
        <Check ok={h.has_lockfile} label="Lockfile present (package-lock / yarn.lock / pnpm)" />
        <Check ok={h.node_modules_ignored} label="node_modules in .gitignore" />
        <Check ok={h.has_typescript} label="TypeScript configured" />
        <Check ok={h.typescript_strict} label="TypeScript strict mode" />
        <Check ok={h.has_eslint} label="ESLint config" />
        <Check ok={h.has_ci} label="CI config (.github/workflows, GitLab CI, etc.)" />
        <Check ok={h.has_tests} label="Tests folder / test files" />
      </Section>

      {/* ── Dependency Health ─────────────────────────────────────────── */}
      <Section title="Dependency Health">
        {pkgs ? (
          <>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Dependencies</span>
              <span className={styles.statValue}>{pkgs.dep_count}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Dev dependencies</span>
              <span className={styles.statValue}>{pkgs.dev_dep_count}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Total packages</span>
              <span className={styles.statValue}>
                {pkgs.dep_count + pkgs.dev_dep_count}
              </span>
            </div>
            {pkgs.dep_count + pkgs.dev_dep_count > 100 && (
              <div className={styles.warning}>
                Large dependency surface ({pkgs.dep_count + pkgs.dev_dep_count} packages)
              </div>
            )}
            <LargeDepsWarning pkgs={pkgs.dep_versions} />
          </>
        ) : (
          <p className={styles.na}>No package.json found</p>
        )}
      </Section>

      {/* ── Architecture Health ───────────────────────────────────────── */}
      <Section title="Architecture Health">
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Bundle / dist size</span>
          <span className={styles.statValue}>
            {repo.dist_size_bytes !== null
              ? formatBytes(repo.dist_size_bytes)
              : 'No dist folder'}
          </span>
        </div>
        {repo.dist_size_bytes !== null && repo.dist_size_bytes > 10 * 1024 * 1024 && (
          <div className={styles.warning}>
            Bundle exceeds 10 MB ({formatBytes(repo.dist_size_bytes)})
          </div>
        )}
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Language</span>
          <span className={styles.statValue}>
            {h.has_typescript ? 'TypeScript' : 'JavaScript'}
          </span>
        </div>
        <div className={styles.statRow}>
          <span className={styles.statLabel}>Health score</span>
          <span
            className={`${styles.statValue} ${
              h.score >= 80
                ? styles.scoreHigh
                : h.score >= 50
                  ? styles.scoreMid
                  : styles.scoreLow
            }`}
          >
            {h.score} / 100
          </span>
        </div>
      </Section>
    </div>
  );
}

const HEAVY_DEPS = [
  'moment',
  'lodash',
  'jquery',
  'underscore',
  'rxjs',
  'three',
  'd3',
  'echarts',
  'chart.js',
  'antd',
  '@mui/material',
  'semantic-ui-react',
];

function LargeDepsWarning({ pkgs }: { pkgs: Record<string, string> }) {
  const found = Object.keys(pkgs).filter((k) =>
    HEAVY_DEPS.some((h) => k === h || k.startsWith(h + '/')),
  );
  if (found.length === 0) return null;
  return (
    <div className={styles.heavyDeps}>
      <span className={styles.heavyTitle}>Known heavy packages:</span>
      {found.map((d) => (
        <span key={d} className={styles.heavyBadge}>
          {d}
        </span>
      ))}
    </div>
  );
}
