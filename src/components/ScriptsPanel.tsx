import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { RepoInfo } from '../types';
import styles from './ScriptsPanel.module.css';

interface ScriptEntry {
  name: string;
  command: string;
}

interface OutputLine {
  line: string;
  is_error: boolean;
}

interface ScriptsPanelProps {
  repo: RepoInfo;
}

export default function ScriptsPanel({ repo }: ScriptsPanelProps) {
  const [allScripts, setAllScripts] = useState<ScriptEntry[]>([]);
  const [taskRunning, setTaskRunning] = useState(false);
  const [taskOutput, setTaskOutput] = useState<OutputLine[]>([]);
  const [taskLabel, setTaskLabel] = useState('');
  const [taskSuccess, setTaskSuccess] = useState<boolean | null>(null);
  const [checkoutInput, setCheckoutInput] = useState('');
  const [newBranchInput, setNewBranchInput] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);
  const taskIdRef = useRef<string>('');

  useEffect(() => {
    invoke<ScriptEntry[]>('get_package_scripts', { path: repo.path })
      .then(setAllScripts)
      .catch(() => setAllScripts([]));
  }, [repo.path]);

  useEffect(() => {
    const unlistenOutput = listen<{ task_id: string; line: string; is_error: boolean }>(
      'task-output',
      (event) => {
        if (event.payload.task_id !== taskIdRef.current) return;
        setTaskOutput((prev) => [...prev, { line: event.payload.line, is_error: event.payload.is_error }]);
      }
    );

    const unlistenDone = listen<{ task_id: string; success: boolean; exit_code: number }>(
      'task-done',
      (event) => {
        if (event.payload.task_id !== taskIdRef.current) return;
        setTaskRunning(false);
        setTaskSuccess(event.payload.success);
      }
    );

    return () => {
      unlistenOutput.then((fn) => fn());
      unlistenDone.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [taskOutput]);

  const runTask = (label: string, command: string[]) => {
    const id = `${repo.path}:${Date.now()}`;
    taskIdRef.current = id;
    setTaskLabel(label);
    setTaskOutput([]);
    setTaskSuccess(null);
    setTaskRunning(true);
    invoke('run_task', { taskId: id, path: repo.path, command }).catch((e) => {
      setTaskRunning(false);
      setTaskOutput([{ line: String(e), is_error: true }]);
    });
  };

  const showTerminal = taskOutput.length > 0 || taskRunning;

  return (
    <div className={styles.root}>
      {/* npm Scripts */}
      {allScripts.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>npm Scripts</div>
          <div className={styles.scriptList}>
            {allScripts.map((s) => (
              <div key={s.name} className={styles.scriptRow}>
                <button
                  className={styles.runBtn}
                  disabled={taskRunning}
                  onClick={() => runTask(`npm run ${s.name}`, ['npm', 'run', s.name])}
                  title={`Run ${s.name}`}
                >
                  ▶
                </button>
                <span className={styles.scriptName}>{s.name}</span>
                <span className={styles.scriptCmd}>npm run {s.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Git */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>Git</div>
        <div className={styles.buttonRow}>
          <button className={styles.actionBtn} disabled={taskRunning} onClick={() => runTask('git pull', ['git', 'pull'])}>
            ↓ Pull
          </button>
          <button className={styles.actionBtn} disabled={taskRunning} onClick={() => runTask('git fetch', ['git', 'fetch'])}>
            ↕ Fetch
          </button>
          <button className={styles.actionBtn} disabled={taskRunning} onClick={() => runTask('git status', ['git', 'status'])}>
            ★ Status
          </button>
          <button className={styles.actionBtn} disabled={taskRunning} onClick={() => runTask('git push', ['git', 'push'])}>
            ↑ Push
          </button>
        </div>
        <div className={styles.inputRow}>
          <span className={styles.inputLabel}>Checkout</span>
          <input
            className={styles.textInput}
            placeholder="branch name"
            value={checkoutInput}
            onChange={(e) => setCheckoutInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && checkoutInput.trim() && !taskRunning) {
                runTask(`git checkout ${checkoutInput}`, ['git', 'checkout', checkoutInput.trim()]);
              }
            }}
          />
          <button
            className={styles.actionBtn}
            disabled={taskRunning || !checkoutInput.trim()}
            onClick={() => runTask(`git checkout ${checkoutInput}`, ['git', 'checkout', checkoutInput.trim()])}
          >
            Checkout
          </button>
        </div>
        <div className={styles.inputRow}>
          <span className={styles.inputLabel}>New branch</span>
          <input
            className={styles.textInput}
            placeholder="branch name"
            value={newBranchInput}
            onChange={(e) => setNewBranchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newBranchInput.trim() && !taskRunning) {
                runTask(`git checkout -b ${newBranchInput}`, ['git', 'checkout', '-b', newBranchInput.trim()]);
              }
            }}
          />
          <button
            className={styles.actionBtn}
            disabled={taskRunning || !newBranchInput.trim()}
            onClick={() => runTask(`git checkout -b ${newBranchInput}`, ['git', 'checkout', '-b', newBranchInput.trim()])}
          >
            Create
          </button>
        </div>
      </section>

      {/* Workspace */}
      {repo.packages !== null && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>Workspace</div>
          <div className={styles.buttonRow}>
            <button className={styles.actionBtn} disabled={taskRunning} onClick={() => runTask('npm install', ['npm', 'install'])}>
              npm install
            </button>
            <button
              className={styles.actionBtn}
              disabled={taskRunning}
              onClick={() => runTask('Clean node_modules', ['rm', '-rf', 'node_modules'])}
            >
              Clean node_modules
            </button>
          </div>
          <div className={styles.buttonRow}>
            <button
              className={styles.actionBtn}
              disabled={taskRunning}
              onClick={() => runTask('Reinstall', ['sh', '-c', 'rm -rf node_modules && npm install'])}
            >
              Reinstall
            </button>
            <button
              className={styles.actionBtn}
              disabled={taskRunning}
              onClick={() => runTask('npm audit', ['npm', 'audit'])}
            >
              npm audit
            </button>
          </div>
        </section>
      )}

      {/* Output terminal */}
      {showTerminal && (
        <div className={styles.terminal}>
          <div className={styles.terminalHeader}>
            <span className={styles.terminalLabel}>$ {taskLabel}</span>
            <span className={styles.terminalStatus}>
              {taskRunning ? (
                <span className={styles.statusSpinner} title="Running" />
              ) : taskSuccess === true ? (
                <span className={styles.statusSuccess}>✓</span>
              ) : taskSuccess === false ? (
                <span className={styles.statusFail}>✗</span>
              ) : null}
            </span>
            {!taskRunning && (
              <button className={styles.clearBtn} onClick={() => setTaskOutput([])} title="Clear">
                ×
              </button>
            )}
          </div>
          <div className={styles.terminalBody} ref={outputRef}>
            {taskOutput.map((entry, i) => (
              <div key={i} className={entry.is_error ? styles.lineError : styles.line}>
                {entry.line}
              </div>
            ))}
            {taskRunning && taskOutput.length === 0 && (
              <div className={styles.lineRunning}>Running…</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
