import { useState } from 'react';
import { RepoInfo, RunScript } from '../types';
import GitHistoryPanel from './GitHistoryPanel';
import HealthDetailPanel from './HealthDetailPanel';
import DepPanel from './DepPanel';
import ScriptsPanel from './ScriptsPanel';
import RunButton from './RunButton';
import NestedProjectList from './NestedProjectList';
import styles from './RepoDetailDrawer.module.css';

type Tab = 'scripts' | 'git' | 'health' | 'deps';

interface RepoDetailDrawerProps {
  repo: RepoInfo;
  runningProcesses: Set<string>;
  onRun: (id: string, path: string, script: RunScript) => void;
  onStop: (id: string) => void;
  onClose: () => void;
}

export default function RepoDetailDrawer({
  repo,
  runningProcesses,
  onRun,
  onStop,
  onClose,
}: RepoDetailDrawerProps) {
  const [tab, setTab] = useState<Tab>('health');

  const primaryScript = repo.scripts[0] ?? null;
  const isRunning = runningProcesses.has(repo.path);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>
            <span className={styles.drawerBadge}>git</span>
            <h2 className={styles.repoName} title={repo.name}>
              {repo.name}
            </h2>
          </div>
          <div className={styles.drawerActions}>
            {primaryScript && (
              <RunButton
                id={repo.path}
                path={repo.path}
                script={primaryScript}
                isRunning={isRunning}
                onRun={onRun}
                onStop={onStop}
              />
            )}
            <button className={styles.closeBtn} onClick={onClose} title="Close">
              ✕
            </button>
          </div>
        </div>

        <p className={styles.repoPath} title={repo.path}>
          {repo.path}
        </p>

        {/* Nested projects (always visible) */}
        {repo.nested_projects.length > 0 && (
          <div className={styles.nestedSection}>
            <NestedProjectList
              projects={repo.nested_projects}
              runningProcesses={runningProcesses}
              onRun={onRun}
              onStop={onStop}
            />
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs}>
          {(['scripts', 'health', 'deps', 'git'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'scripts'
                ? 'Scripts'
                : t === 'health'
                  ? 'Health'
                  : t === 'deps'
                    ? 'Dependencies'
                    : 'Git History'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className={styles.content}>
          {tab === 'scripts' && <ScriptsPanel repo={repo} />}
          {tab === 'git' && <GitHistoryPanel commits={repo.git_log} />}
          {tab === 'health' && <HealthDetailPanel repo={repo} />}
          {tab === 'deps' && <DepPanel repo={repo} />}
        </div>
      </aside>
    </div>
  );
}
