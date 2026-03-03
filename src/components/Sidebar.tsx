import { RepoInfo, View } from '../types';
import HealthSummary from './HealthSummary';
import styles from './Sidebar.module.css';

interface NavItem {
  id: View;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'repos', label: 'Repositories' },
      { id: 'running', label: 'Running' },
      { id: 'summary', label: 'Summary' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { id: 'health', label: 'Health' },
      { id: 'deps', label: 'Dependencies' },
    ],
  },
  {
    label: 'System',
    items: [{ id: 'settings', label: 'Settings' }],
  },
];

interface SidebarProps {
  view: View;
  repos: RepoInfo[];
  scanning: boolean;
  runningCount: number;
  onViewChange: (v: View) => void;
}

export default function Sidebar({
  view,
  repos,
  scanning,
  runningCount,
  onViewChange,
}: SidebarProps) {
  // Compute badge counts for nav items
  const healthIssues = repos.filter((r) => r.health.score < 50).length;
  const depMismatches = countDepMismatches(repos);

  const badgeFor = (id: View): number | null => {
    if (id === 'health' && healthIssues > 0) return healthIssues;
    if (id === 'deps' && depMismatches > 0) return depMismatches;
    if (id === 'running' && runningCount > 0) return runningCount;
    return null;
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>membran</div>

      <nav className={styles.nav}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={styles.group}>
            <span className={styles.groupLabel}>{group.label}</span>
            {group.items.map((item) => {
              const badge = badgeFor(item.id);
              return (
                <button
                  key={item.id}
                  className={`${styles.navBtn} ${view === item.id ? styles.navBtnActive : ''}`}
                  onClick={() => onViewChange(item.id)}
                >
                  <span className={styles.navLabel}>{item.label}</span>
                  {badge !== null && (
                    <span className={styles.navBadge}>{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={styles.summary}>
        <HealthSummary repos={repos} scanning={scanning} />
      </div>
    </aside>
  );
}

function countDepMismatches(repos: RepoInfo[]): number {
  const depVersions = new Map<string, Set<string>>();
  for (const repo of repos) {
    if (!repo.packages) continue;
    const all = {
      ...(repo.packages.dep_versions ?? {}),
      ...(repo.packages.dev_dep_versions ?? {}),
    };
    for (const [name, version] of Object.entries(all)) {
      if (!depVersions.has(name)) depVersions.set(name, new Set());
      depVersions.get(name)!.add(version);
    }
  }
  let count = 0;
  for (const versions of depVersions.values()) {
    if (versions.size > 1) count++;
  }
  return count;
}
