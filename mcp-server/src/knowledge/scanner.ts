import { readdir, readFile, stat, access } from "fs/promises";
import path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AIPlatform = "claude_code" | "cursor" | "copilot" | "gemini" | "unknown";

export interface AppScanResult {
  appName: string;
  appPath: string;
  platforms: AIPlatform[];
  forgeLogs: ForgeLogEntry[];
  sessionMonitor: SessionMonitorData | null;
  memoryFiles: string[];
  gitCommitCount: number;
}

export interface ForgeLogEntry {
  timestamp: string;
  level: "ERROR" | "WARN" | "INFO";
  category: string;
  event: string;
  data: Record<string, unknown>;
  sourceFile: string;
}

export interface SessionMonitorData {
  sessionId: string;
  startedAt: string;
  totalCommands: number;
  totalFailures: number;
  consecutiveFailures: number;
  lastErrorSignature: string;
  lastErrorCommand: string;
  serviceRestarts: number;
  sourceEnvAttempts: number;
}

// ─── Platform Detection ─────────────────────────────────────────────────────

const PLATFORM_DIRS: Record<string, AIPlatform> = {
  ".claude": "claude_code",
  ".cursor": "cursor",
  ".copilot": "copilot",
  ".gemini": "gemini",
};

async function detectPlatforms(appPath: string): Promise<AIPlatform[]> {
  const platforms: AIPlatform[] = [];
  for (const [dir, platform] of Object.entries(PLATFORM_DIRS)) {
    try {
      await access(path.join(appPath, dir));
      platforms.push(platform);
    } catch {
      // dir doesn't exist
    }
  }
  return platforms;
}

// ─── Forge Log Parser ───────────────────────────────────────────────────────

async function parseForgeLog(filePath: string): Promise<ForgeLogEntry | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content.trim());
    return {
      timestamp: parsed.ts || "",
      level: (parsed.level || "INFO").toUpperCase() as ForgeLogEntry["level"],
      category: parsed.category || "",
      event: parsed.event || "",
      data: parsed.data || {},
      sourceFile: filePath,
    };
  } catch {
    return null;
  }
}

async function scanForgeLogs(appPath: string): Promise<ForgeLogEntry[]> {
  const entries: ForgeLogEntry[] = [];
  const logDirs = [
    path.join(appPath, ".skillfoundry", "logs"),
    path.join(appPath, "sf_cli", ".skillfoundry", "logs"),
  ];

  for (const logDir of logDirs) {
    try {
      const files = await readdir(logDir);
      for (const file of files) {
        if (file.startsWith("forge-") && file.endsWith(".log")) {
          const entry = await parseForgeLog(path.join(logDir, file));
          if (entry) entries.push(entry);
        }
      }
    } catch {
      // dir doesn't exist
    }
  }

  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ─── Session Monitor Parser ─────────────────────────────────────────────────

async function parseSessionMonitor(
  appPath: string
): Promise<SessionMonitorData | null> {
  const candidates = [
    path.join(appPath, ".claude", "session-monitor-archive.jsonl"),
    path.join(appPath, ".claude", "session-monitor-state.json"),
  ];

  for (const filePath of candidates) {
    try {
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content.trim());
      return {
        sessionId: parsed.session_id || "",
        startedAt: parsed.started_at || "",
        totalCommands: parsed.total_commands || 0,
        totalFailures: parsed.total_failures || 0,
        consecutiveFailures: parsed.consecutive_failures || 0,
        lastErrorSignature: parsed.last_error_signature || "",
        lastErrorCommand: parsed.last_error_command || "",
        serviceRestarts: parsed.service_restarts || 0,
        sourceEnvAttempts: parsed.source_env_attempts || 0,
      };
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Memory File Discovery ──────────────────────────────────────────────────

async function findMemoryFiles(appPath: string): Promise<string[]> {
  const memoryDir = path.join(appPath, "memory_bank");
  try {
    const files: string[] = [];
    await walkDir(memoryDir, (filePath) => {
      if (filePath.endsWith(".jsonl") || filePath.endsWith(".md")) {
        files.push(filePath);
      }
    });
    return files;
  } catch {
    return [];
  }
}

async function walkDir(
  dir: string,
  callback: (filePath: string) => void
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

// ─── Git Commit Count ───────────────────────────────────────────────────────

async function getGitCommitCount(appPath: string): Promise<number> {
  try {
    await access(path.join(appPath, ".git"));
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("git", ["rev-list", "--count", "HEAD"], {
      cwd: appPath,
    });
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

// ─── Main Scanner ───────────────────────────────────────────────────────────

/**
 * Scan a single app directory for AI session data.
 */
export async function scanApp(appPath: string): Promise<AppScanResult> {
  const appName = path.basename(appPath);
  const [platforms, forgeLogs, sessionMonitor, memoryFiles, gitCommitCount] =
    await Promise.all([
      detectPlatforms(appPath),
      scanForgeLogs(appPath),
      parseSessionMonitor(appPath),
      findMemoryFiles(appPath),
      getGitCommitCount(appPath),
    ]);

  return {
    appName,
    appPath,
    platforms,
    forgeLogs,
    sessionMonitor,
    memoryFiles,
    gitCommitCount,
  };
}

/**
 * Scan all app directories under a root path.
 */
export async function scanAllApps(
  appsRoot: string
): Promise<AppScanResult[]> {
  const results: AppScanResult[] = [];

  try {
    const entries = await readdir(appsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;
      if (entry.name === "archive") continue;

      const appPath = path.join(appsRoot, entry.name);

      // Only scan directories that have at least one AI platform dir or .skillfoundry
      const hasPlatform = await detectPlatforms(appPath);
      let hasSkillfoundry = false;
      try {
        await access(path.join(appPath, ".skillfoundry"));
        hasSkillfoundry = true;
      } catch { /* no skillfoundry */ }

      if (hasPlatform.length > 0 || hasSkillfoundry) {
        const result = await scanApp(appPath);
        results.push(result);
      }
    }
  } catch (err) {
    throw new Error(`Failed to scan apps root: ${appsRoot}: ${err}`);
  }

  return results.sort((a, b) => a.appName.localeCompare(b.appName));
}
