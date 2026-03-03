import { open } from '@tauri-apps/plugin-dialog';
import styles from './FolderSelector.module.css';

interface Props {
  rootPaths: string[];
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
}

export default function FolderSelector({ rootPaths, onAdd, onRemove }: Props) {
  const handleAdd = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      onAdd(selected);
    }
  };

  return (
    <div className={styles.container}>
      <ul className={styles.list}>
        {rootPaths.length === 0 && (
          <li className={styles.empty}>No directories added yet.</li>
        )}
        {rootPaths.map((p) => (
          <li key={p} className={styles.item}>
            <span className={styles.path} title={p}>
              {p}
            </span>
            <button
              className={styles.remove}
              onClick={() => onRemove(p)}
              title="Remove"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button className={styles.addBtn} onClick={handleAdd}>
        + Add Directory
      </button>
    </div>
  );
}
