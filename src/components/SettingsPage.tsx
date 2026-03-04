import { useState, useEffect } from 'react';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import FolderSelector from './FolderSelector';
import styles from './SettingsPage.module.css';

interface Props {
  rootPaths: string[];
  onSave: (paths: string[]) => void;
}

export default function SettingsPage({ rootPaths, onSave }: Props) {
  const [paths, setPaths] = useState<string[]>(rootPaths);
  const [openOnLaunch, setOpenOnLaunch] = useState(false);
  const dirty = JSON.stringify(paths) !== JSON.stringify(rootPaths);

  useEffect(() => {
    isEnabled().then(setOpenOnLaunch).catch(() => {});
  }, []);

  const handleAdd = (p: string) => {
    setPaths((prev) => (prev.includes(p) ? prev : [...prev, p]));
  };

  const handleRemove = (p: string) => {
    setPaths((prev) => prev.filter((x) => x !== p));
  };

  const handleOpenOnLaunchChange = async (checked: boolean) => {
    setOpenOnLaunch(checked);
    if (checked) {
      await enable();
    } else {
      await disable();
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>General</h2>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={openOnLaunch}
            onChange={(e) => handleOpenOnLaunchChange(e.target.checked)}
          />
          <span className={styles.checkboxLabel}>Open on launch</span>
          <span className={styles.checkboxDesc}>Automatically launch membran when you log in</span>
        </label>
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
