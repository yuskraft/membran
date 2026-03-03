import { RepoInfo, ProcessEntry } from '../types';
import ProcessCard from './ProcessCard';
import styles from './RunningView.module.css';

interface RunningViewProps {
  processEntries: Record<string, ProcessEntry>;
  repos: RepoInfo[];
  onStop: (id: string) => void;
}

interface ProcessGroup {
  repoName: string;
  entries: ProcessEntry[];
}

function groupByRepo(entries: ProcessEntry[], repos: RepoInfo[]): ProcessGroup[] {
  const groups = new Map<string, ProcessGroup>();

  for (const entry of entries) {
    // Find parent repo whose path is a prefix of the process path
    const parentRepo = repos.find(
      (r) => entry.info.path === r.path || entry.info.path.startsWith(r.path + '/'),
    );
    const groupKey = parentRepo ? parentRepo.path : entry.info.path;
    const groupName = parentRepo ? parentRepo.name : entry.info.path;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { repoName: groupName, entries: [] });
    }
    groups.get(groupKey)!.entries.push(entry);
  }

  return Array.from(groups.values());
}

export default function RunningView({ processEntries, repos, onStop }: RunningViewProps) {
  const entries = Object.values(processEntries);

  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No running processes</p>
        <p className={styles.emptyHint}>
          Start a project from the Repositories view to see it here.
        </p>
      </div>
    );
  }

  const groups = groupByRepo(entries, repos);

  return (
    <div className={styles.view}>
      {groups.map((group) => (
        <div key={group.repoName} className={styles.group}>
          <div className={styles.groupHeader}>
            <span className={styles.groupName}>{group.repoName}</span>
            <span className={styles.groupCount}>
              {group.entries.length} process{group.entries.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <div className={styles.cards}>
            {group.entries.map((entry) => (
              <ProcessCard key={entry.info.id} entry={entry} onStop={onStop} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
