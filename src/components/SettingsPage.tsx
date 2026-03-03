import { useState } from 'react';
import FolderSelector from './FolderSelector';
import styles from './SettingsPage.module.css';

interface Props {
  rootPaths: string[];
  onSave: (paths: string[]) => void;
}

export default function SettingsPage({ rootPaths, onSave }: Props) {
  const [paths, setPaths] = useState<string[]>(rootPaths);
  const dirty = JSON.stringify(paths) !== JSON.stringify(rootPaths);

  const handleAdd = (p: string) => {
    setPaths((prev) => (prev.includes(p) ? prev : [...prev, p]));
  };

  const handleRemove = (p: string) => {
    setPaths((prev) => prev.filter((x) => x !== p));
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Root Directories</h2>
        <p className={styles.sectionDesc}>
          membran scans these directories recursively for Git repositories.
          Changes take effect when you click Save &amp; Scan.
        </p>
        <FolderSelector
          rootPaths={paths}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      </div>

      <div className={styles.actions}>
        <button
          className={styles.saveBtn}
          onClick={() => onSave(paths)}
          disabled={!dirty}
        >
          Save &amp; Scan
        </button>
      </div>
    </div>
  );
}
