import { RepoInfo, RunScript } from '../types';
import HealthBar from './HealthBar';
import RunButton from './RunButton';
import NestedProjectList from './NestedProjectList';
import styles from './RepoCard.module.css';

interface RepoCardProps {
  repo: RepoInfo;
  runningProcesses: Set<string>;
  onRun: (id: string, path: string, script: RunScript) => void;
  onStop: (id: string) => void;
  onSelect: (repo: RepoInfo) => void;
}

export default function RepoCard({
  repo,
  runningProcesses,
  onRun,
  onStop,
  onSelect,
}: RepoCardProps) {
  const { name, path, git, health, packages, scripts, nested_projects, mfe } = repo;
  const totalDeps = packages ? packages.dep_count + packages.dev_dep_count : null;
  const primaryScript = scripts[0] ?? null;
  const isRunning = runningProcesses.has(path);
  const mfeLabel =
    mfe && mfe.is_host && mfe.is_remote
      ? 'HOST+REMOTE'
      : mfe?.is_host
        ? 'HOST'
        : mfe?.is_remote
          ? 'REMOTE'
          : null;

  return (
    <div className={styles.card}>
      <div
        className={`${styles.inner} ${isRunning ? styles.running : ''}`}
        onClick={() => onSelect(repo)}
      >
        {/* Top row: name + badges | run button */}
        <div className={styles.top}>
          <div className={styles.nameLine}>
            {isRunning && <span className={styles.runDot} />}
            <span className={styles.name} title={name}>
              {name}
            </span>
            <span className={styles.gitBadge}>git</span>
            {mfeLabel && (
              <span
                className={`${styles.mfeBadge} ${
                  mfeLabel === 'HOST'
                    ? styles.mfeHost
                    : mfeLabel === 'REMOTE'
                      ? styles.mfeRemote
                      : styles.mfeHub
                }`}
              >
                {mfeLabel}
              </span>
            )}
          </div>
          {primaryScript && (
            <RunButton
              id={path}
              path={path}
              script={primaryScript}
              isRunning={isRunning}
              onRun={onRun}
              onStop={onStop}
            />
          )}
        </div>

        {/* Bottom row: path + git info | health + meta */}
        <div className={styles.bottom}>
          <div className={styles.infoLine}>
            <span className={styles.path} title={path}>
              {path}
            </span>
            {git.branch && (
              <span className={styles.branch}>{git.branch}</span>
            )}
            {git.last_commit_msg && (
              <span className={styles.commit} title={git.last_commit_msg}>
                {git.last_commit_msg}
              </span>
            )}
          </div>
          <div className={styles.metaLine}>
            <div className={styles.healthWrap}>
              <HealthBar score={health.score} showLabel={false} />
            </div>
            {totalDeps !== null && (
              <span className={styles.deps}>{totalDeps} deps</span>
            )}
            {git.last_commit_date && (
              <span className={styles.date}>{git.last_commit_date}</span>
            )}
          </div>
        </div>
      </div>

      <NestedProjectList
        projects={nested_projects}
        runningProcesses={runningProcesses}
        onRun={onRun}
        onStop={onStop}
      />
    </div>
  );
}
