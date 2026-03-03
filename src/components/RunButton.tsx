import { RunScript } from '../types';
import styles from './RunButton.module.css';

interface RunButtonProps {
  id: string;
  path: string;
  script: RunScript;
  isRunning: boolean;
  onRun: (id: string, path: string, script: RunScript) => void;
  onStop: (id: string) => void;
}

export default function RunButton({
  id,
  path,
  script,
  isRunning,
  onRun,
  onStop,
}: RunButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunning) {
      onStop(id);
    } else {
      onRun(id, path, script);
    }
  };

  return (
    <button
      className={`${styles.btn} ${isRunning ? styles.stop : styles.run}`}
      onClick={handleClick}
      title={isRunning ? `Stop (${script.command})` : `Run: ${script.command}`}
    >
      {isRunning ? '■ Stop' : '▶ Run'}
    </button>
  );
}
