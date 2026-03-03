import { NestedProject, RunScript } from '../types';
import RunButton from './RunButton';
import styles from './NestedProjectList.module.css';

interface NestedProjectListProps {
  projects: NestedProject[];
  runningProcesses: Set<string>;
  onRun: (id: string, path: string, script: RunScript) => void;
  onStop: (id: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  'mock server': 'mock',
  'node app': 'node',
  rust: 'rust',
  docker: 'docker',
};

export default function NestedProjectList({
  projects,
  runningProcesses,
  onRun,
  onStop,
}: NestedProjectListProps) {
  if (projects.length === 0) return null;

  return (
    <div className={styles.section}>
      <span className={styles.sectionTitle}>Nested projects</span>
      <div className={styles.list}>
        {projects.map((project) => {
          const primaryScript = project.scripts[0];
          const isRunning = runningProcesses.has(project.id);
          const badgeLabel = TYPE_LABELS[project.project_type] ?? project.project_type;

          return (
            <div
              key={project.id}
              className={`${styles.item} ${isRunning ? styles.itemRunning : ''}`}
            >
              <div className={styles.itemInfo}>
                <span className={`${styles.typeBadge} ${styles[`type_${badgeLabel.replace(' ', '_')}`]}`}>
                  {badgeLabel}
                </span>
                <span className={styles.itemName} title={project.path}>
                  {project.name}
                </span>
              </div>
              {primaryScript && (
                <RunButton
                  id={project.id}
                  path={project.path}
                  script={primaryScript}
                  isRunning={isRunning}
                  onRun={onRun}
                  onStop={onStop}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
