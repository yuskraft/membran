import { RepoInfo, MfeRemote } from '../types';
import styles from './MfeView.module.css';

interface MfeViewProps {
  repos: RepoInfo[];
  onSelectRepo: (repo: RepoInfo) => void;
}

interface ResolvedRemote {
  remote: MfeRemote;
  repo: RepoInfo | null;
}

interface MfeGroup {
  host: RepoInfo;
  remotes: ResolvedRemote[];
}

function buildMfeGroups(repos: RepoInfo[]): { groups: MfeGroup[]; standalone: RepoInfo[] } {
  const mfeRepos = repos.filter((r) => r.mfe !== null);

  // Build lookup maps: federation name → repo, repo name → repo
  const byFedName = new Map<string, RepoInfo>();
  const byRepoName = new Map<string, RepoInfo>();
  for (const repo of mfeRepos) {
    if (repo.mfe?.name) byFedName.set(repo.mfe.name, repo);
    byRepoName.set(repo.name, repo);
  }

  const grouped = new Set<string>();
  const groups: MfeGroup[] = [];

  for (const repo of mfeRepos) {
    if (!repo.mfe?.is_host) continue;
    const remotes: ResolvedRemote[] = (repo.mfe.remotes ?? []).map((remote) => {
      const matched =
        byFedName.get(remote.name) ??
        byRepoName.get(remote.name) ??
        repos.find((r) => r.name.toLowerCase() === remote.name.toLowerCase());
      return { remote, repo: matched ?? null };
    });
    groups.push({ host: repo, remotes });
    grouped.add(repo.path);
    for (const { repo: r } of remotes) {
      if (r) grouped.add(r.path);
    }
  }

  const standalone = mfeRepos.filter((r) => !grouped.has(r.path));
  return { groups, standalone };
}

function roleBadge(repo: RepoInfo): { label: string; cls: string } {
  const mfe = repo.mfe!;
  if (mfe.is_host && mfe.is_remote) return { label: 'HOST+REMOTE', cls: styles.badgeHub };
  if (mfe.is_host) return { label: 'HOST', cls: styles.badgeHost };
  return { label: 'REMOTE', cls: styles.badgeRemote };
}

export default function MfeView({ repos, onSelectRepo }: MfeViewProps) {
  const mfeRepos = repos.filter((r) => r.mfe !== null);

  if (mfeRepos.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No micro-frontends detected</p>
        <p className={styles.emptyHint}>
          Repos with a <code>webpack.config.js</code> containing{' '}
          <code>ModuleFederationPlugin</code>, or a <code>vite.config.ts</code> using{' '}
          <code>federation()</code>, will appear here.
        </p>
      </div>
    );
  }

  const { groups, standalone } = buildMfeGroups(repos);

  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        {mfeRepos.length} MFE {mfeRepos.length === 1 ? 'repo' : 'repos'} detected ·{' '}
        {groups.length} {groups.length === 1 ? 'group' : 'groups'}
        {standalone.length > 0 && ` · ${standalone.length} standalone`}
      </div>

      {groups.map((group) => {
        const { label, cls } = roleBadge(group.host);
        const fw = group.host.mfe!.framework;
        return (
          <div key={group.host.path} className={styles.group}>
            {/* Host row */}
            <div
              className={styles.hostRow}
              onClick={() => onSelectRepo(group.host)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectRepo(group.host)}
            >
              <div className={styles.hostLeft}>
                <span className={`${styles.roleBadge} ${cls}`}>{label}</span>
                <span className={styles.hostName}>{group.host.name}</span>
                {group.host.mfe!.name && (
                  <span className={styles.fedName}>{group.host.mfe!.name}</span>
                )}
              </div>
              <div className={styles.hostRight}>
                <span className={styles.framework}>{fw}</span>
                <span className={styles.hostPath}>{group.host.path}</span>
              </div>
            </div>

            {/* Remote rows */}
            {group.remotes.length > 0 && (
              <div className={styles.remotes}>
                {group.remotes.map(({ remote, repo }, i) => (
                  <div
                    key={remote.name + i}
                    className={`${styles.remoteRow} ${repo ? styles.remoteMatched : styles.remoteUnmatched}`}
                    onClick={() => repo && onSelectRepo(repo)}
                    role={repo ? 'button' : undefined}
                    tabIndex={repo ? 0 : undefined}
                    onKeyDown={
                      repo ? (e) => e.key === 'Enter' && onSelectRepo(repo) : undefined
                    }
                  >
                    <span className={styles.connector}>└──</span>
                    <span className={`${styles.roleBadge} ${styles.badgeRemote}`}>REMOTE</span>
                    <span className={styles.remoteName}>{repo ? repo.name : remote.name}</span>
                    {remote.url && (
                      <span className={styles.remoteUrl} title={remote.url}>
                        {remote.url.replace(/^https?:\/\//, '')}
                      </span>
                    )}
                    {!repo && (
                      <span className={styles.unmatchedHint}>not in scan</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Standalone MFE repos */}
      {standalone.length > 0 && (
        <div className={styles.standaloneSection}>
          <h3 className={styles.standaloneTitle}>Standalone</h3>
          <p className={styles.standaloneHint}>
            These repos are MFE participants but their host is not in the current scan.
          </p>
          {standalone.map((repo) => {
            const { label, cls } = roleBadge(repo);
            return (
              <div
                key={repo.path}
                className={styles.standaloneRow}
                onClick={() => onSelectRepo(repo)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelectRepo(repo)}
              >
                <span className={`${styles.roleBadge} ${cls}`}>{label}</span>
                <span className={styles.hostName}>{repo.name}</span>
                {repo.mfe!.name && (
                  <span className={styles.fedName}>{repo.mfe!.name}</span>
                )}
                <span className={styles.framework}>{repo.mfe!.framework}</span>
                {repo.mfe!.exposes.length > 0 && (
                  <span className={styles.exposesHint}>
                    exposes {repo.mfe!.exposes.length} module
                    {repo.mfe!.exposes.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
