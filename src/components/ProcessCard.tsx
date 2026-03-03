import { useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ProcessEntry } from '../types';
import styles from './ProcessCard.module.css';

interface ProcessCardProps {
  entry: ProcessEntry;
  onStop: (id: string) => void;
}

export default function ProcessCard({ entry, onStop }: ProcessCardProps) {
  const { info, ports, lines } = entry;
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  const handleOpenPort = (port: number) => {
    invoke('open_url', { url: `http://localhost:${port}` }).catch(console.error);
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.meta}>
          <span className={styles.name}>{info.name}</span>
          <span className={styles.command}>{info.command}</span>
        </div>
        <div className={styles.actions}>
          {ports.map((port) => (
            <button
              key={port}
              className={styles.portLink}
              onClick={() => handleOpenPort(port)}
              title={`Open http://localhost:${port}`}
            >
              :{port}
            </button>
          ))}
          <button
            className={styles.stopBtn}
            onClick={() => onStop(info.id)}
            title="Stop process"
          >
            ■ Stop
          </button>
        </div>
      </div>

      <div ref={logRef} className={styles.log}>
        {lines.length === 0 ? (
          <span className={styles.logEmpty}>Waiting for output…</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={`${styles.line} ${l.is_error ? styles.lineError : ''}`}>
              {l.line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
