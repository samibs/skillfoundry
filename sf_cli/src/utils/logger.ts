// Structured JSONL logger for SkillFoundry CLI.
// Writes to .skillfoundry/logs/ — one session.log (rolling) + per-run logs.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogCategory = 'pipeline' | 'runner' | 'gate' | 'microgate' | 'provider' | 'tool' | 'budget';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LOGS_DIR = '.skillfoundry/logs';
const SESSION_LOG = 'session.log';
const MAX_SESSION_LINES = 1000;
const MAX_RUN_LOGS = 20;

interface LogEntry {
  ts: string;
  level: LogLevel;
  category: LogCategory;
  event: string;
  data?: Record<string, unknown>;
}

/**
 * Structured JSONL logger.
 * Writes entries as one JSON object per line to session.log and optionally a per-run log.
 * Uses appendFileSync for crash safety (no buffering).
 */
class SfLogger {
  private logsDir: string;
  private sessionLogPath: string;
  private runLogPath: string | null = null;
  private threshold: number;

  constructor(workDir: string, level: LogLevel) {
    this.logsDir = join(workDir, LOGS_DIR);
    this.sessionLogPath = join(this.logsDir, SESSION_LOG);
    this.threshold = LEVEL_PRIORITY[level];

    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Start a per-run log file. Called at pipeline start.
   * Run log is named to match the runId from .skillfoundry/runs/{runId}.json.
   */
  startRunLog(runId: string): void {
    this.runLogPath = join(this.logsDir, `${runId}.log`);
  }

  /**
   * Remove oldest run logs beyond MAX_RUN_LOGS.
   * Called at pipeline start to prevent unbounded growth.
   */
  cleanupOldLogs(): void {
    if (!existsSync(this.logsDir)) return;

    const logFiles = readdirSync(this.logsDir)
      .filter((f) => f.endsWith('.log') && f !== SESSION_LOG)
      .map((f) => ({
        name: f,
        path: join(this.logsDir, f),
        mtime: statSync(join(this.logsDir, f)).mtimeMs,
      }))
      .sort((a, b) => a.mtime - b.mtime);

    const excess = logFiles.length - MAX_RUN_LOGS;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        try {
          unlinkSync(logFiles[i].path);
        } catch {
          // Best-effort cleanup — skip files that can't be removed
        }
      }
    }
  }

  debug(category: LogCategory, event: string, data?: Record<string, unknown>): void {
    this.write('DEBUG', category, event, data);
  }

  info(category: LogCategory, event: string, data?: Record<string, unknown>): void {
    this.write('INFO', category, event, data);
  }

  warn(category: LogCategory, event: string, data?: Record<string, unknown>): void {
    this.write('WARN', category, event, data);
  }

  error(category: LogCategory, event: string, data?: Record<string, unknown>): void {
    this.write('ERROR', category, event, data);
  }

  private write(level: LogLevel, category: LogCategory, event: string, data?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < this.threshold) return;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      category,
      event,
    };
    if (data !== undefined) {
      entry.data = data;
    }

    const line = JSON.stringify(entry) + '\n';

    // Write to session log (always)
    try {
      appendFileSync(this.sessionLogPath, line);
      this.trimSessionLog();
    } catch {
      // Logging must never crash the application
    }

    // Write to run log (when active)
    if (this.runLogPath) {
      try {
        appendFileSync(this.runLogPath, line);
      } catch {
        // Best-effort
      }
    }
  }

  /**
   * Trim session.log when it exceeds MAX_SESSION_LINES.
   * Keeps the newest half of lines.
   */
  private trimSessionLog(): void {
    try {
      const content = readFileSync(this.sessionLogPath, 'utf-8');
      const lines = content.split('\n');
      if (lines.length > MAX_SESSION_LINES) {
        const keepFrom = Math.floor(lines.length / 2);
        writeFileSync(this.sessionLogPath, lines.slice(keepFrom).join('\n'));
      }
    } catch {
      // Best-effort — don't crash if we can't trim
    }
  }
}

// ── Singleton management ──────────────────────────────────────

let instance: SfLogger | null = null;

/**
 * Initialize the logger singleton. Call once per session with the workDir and log level.
 * Subsequent calls with different parameters re-initialize the logger.
 */
export function initLogger(workDir: string, level: LogLevel): SfLogger {
  instance = new SfLogger(workDir, level);
  return instance;
}

/**
 * Get the logger singleton. Returns a no-op logger if not yet initialized.
 */
export function getLogger(): SfLogger {
  if (!instance) {
    // Return a no-op logger to avoid null checks everywhere.
    // This happens when modules are used outside a full session (e.g., tests).
    instance = new SfLogger(process.cwd(), 'ERROR');
  }
  return instance;
}
