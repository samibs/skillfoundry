import { readdir, readFile, stat, access } from "fs/promises";
import path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AIPlatform =
  | "claude_code"
  | "cursor"
  | "copilot"
  | "gemini"
  | "codex"
  | "unknown";

export interface AppScanResult {
  appName: string;
  appPath: string;
  platforms: AIPlatform[];
  forgeLogs: ForgeLogEntry[];
  sessionMonitor: SessionMonitorData | null;
  memoryFiles: string[];
  gitCommitCount: number;
  /** Instruction/config files found at project root or platform dirs */
  instructionFiles: InstructionFile[];
  /** Per-platform artifact details */
  platformArtifacts: PlatformArtifacts;
  /** Framework metadata (.framework-version, etc.) */
  frameworkMeta: FrameworkMeta | null;
  /** Memory bank statistics */
  memoryBankStats: MemoryBankStats | null;
}

export interface InstructionFile {
  /** e.g. "CLAUDE.md", ".cursorrules", "GEMINI.md", "AGENTS.md" */
  fileName: string;
  /** Absolute path */
  filePath: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Which platform this file is for */
  platform: AIPlatform;
  /** Where it was found: "root" | "platform_dir" */
  location: "root" | "platform_dir";
}

export interface PlatformArtifacts {
  claude?: ClaudeArtifacts;
  copilot?: CopilotArtifacts;
  cursor?: CursorArtifacts;
  gemini?: GeminiArtifacts;
  codex?: CodexArtifacts;
}

export interface ClaudeArtifacts {
  hasSettingsJson: boolean;
  hasSettingsLocalJson: boolean;
  hasScratchpad: boolean;
  hasProjectClaude: boolean; // .claude/CLAUDE.md
  commandCount: number;
  agentCount: number;
  skillCount: number;
  hookCount: number;
  backupCount: number;
  commandNames: string[];
  agentNames: string[];
}

export interface CopilotArtifacts {
  customAgentCount: number;
  customAgentNames: string[];
  hasSecurityIntegration: boolean;
  hasInstructionsMd: boolean; // .github/copilot-instructions.md
}

export interface CursorArtifacts {
  hasCursorRules: boolean;
  cursorRulesSizeBytes: number;
  hasCursorDir: boolean;
}

export interface GeminiArtifacts {
  hasGeminiDir: boolean;
  hasGeminiMd: boolean; // root GEMINI.md
  fileCount: number;
  fileNames: string[];
}

export interface CodexArtifacts {
  hasCodexDir: boolean;
  hasAgentsMd: boolean; // root AGENTS.md
  hasCodexJson: boolean;
  fileCount: number;
  fileNames: string[];
}

export interface FrameworkMeta {
  version: string;
  updatedAt: string;
  platform: string;
  source: string; // which platform dir this came from
}

export interface MemoryBankStats {
  totalFiles: number;
  jsonlFiles: number;
  mdFiles: number;
  totalEntries: number; // lines in .jsonl files
  knowledgeFiles: string[];
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

// ─── Helpers ────────────────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function safeReadText(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf-8");
  } catch {
    return null;
  }
}

async function safeReaddir(p: string): Promise<string[]> {
  try {
    return await readdir(p);
  } catch {
    return [];
  }
}

async function safeFileSize(p: string): Promise<number> {
  try {
    const s = await stat(p);
    return s.size;
  } catch {
    return 0;
  }
}

async function countMdFiles(dir: string): Promise<{ count: number; names: string[] }> {
  const files = await safeReaddir(dir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));
  return { count: mdFiles.length, names: mdFiles.map((f) => f.replace(/\.md$/, "")) };
}

async function countJsonlEntries(filePath: string): Promise<number> {
  const content = await safeReadText(filePath);
  if (!content) return 0;
  return content.trim().split("\n").filter((l) => l.trim().length > 0).length;
}

// ─── Platform Detection ─────────────────────────────────────────────────────

const PLATFORM_DIRS: Record<string, AIPlatform> = {
  ".claude": "claude_code",
  ".cursor": "cursor",
  ".copilot": "copilot",
  ".gemini": "gemini",
  ".codex": "codex",
};

/** Root-level instruction files and which platform they belong to */
const ROOT_INSTRUCTION_FILES: Record<string, AIPlatform> = {
  "CLAUDE.md": "claude_code",
  ".cursorrules": "cursor",
  "GEMINI.md": "gemini",
  "AGENTS.md": "codex",
  ".github/copilot-instructions.md": "copilot",
};

async function detectPlatforms(appPath: string): Promise<AIPlatform[]> {
  const platforms: AIPlatform[] = [];
  for (const [dir, platform] of Object.entries(PLATFORM_DIRS)) {
    if (await exists(path.join(appPath, dir))) {
      platforms.push(platform);
    }
  }
  // Also detect by root instruction files (e.g. .cursorrules without .cursor/)
  for (const [file, platform] of Object.entries(ROOT_INSTRUCTION_FILES)) {
    if (!platforms.includes(platform) && await exists(path.join(appPath, file))) {
      platforms.push(platform);
    }
  }
  return platforms;
}

// ─── Instruction File Scanner ───────────────────────────────────────────────

async function scanInstructionFiles(appPath: string): Promise<InstructionFile[]> {
  const files: InstructionFile[] = [];

  // Root-level instruction files
  for (const [fileName, platform] of Object.entries(ROOT_INSTRUCTION_FILES)) {
    const filePath = path.join(appPath, fileName);
    const size = await safeFileSize(filePath);
    if (size > 0) {
      files.push({ fileName, filePath, sizeBytes: size, platform, location: "root" });
    }
  }

  // Platform-dir instruction files
  const platformInstructionFiles: Record<string, { file: string; platform: AIPlatform }[]> = {
    ".claude": [{ file: "CLAUDE.md", platform: "claude_code" }],
    ".copilot": [{ file: "SECURITY-INTEGRATION.md", platform: "copilot" }],
  };

  for (const [dir, entries] of Object.entries(platformInstructionFiles)) {
    for (const { file, platform } of entries) {
      const filePath = path.join(appPath, dir, file);
      const size = await safeFileSize(filePath);
      if (size > 0) {
        files.push({
          fileName: `${dir}/${file}`,
          filePath,
          sizeBytes: size,
          platform,
          location: "platform_dir",
        });
      }
    }
  }

  return files;
}

// ─── Claude Code Artifact Scanner ───────────────────────────────────────────

async function scanClaudeArtifacts(appPath: string): Promise<ClaudeArtifacts | undefined> {
  const claudeDir = path.join(appPath, ".claude");
  if (!(await exists(claudeDir))) return undefined;

  const [
    hasSettingsJson,
    hasSettingsLocalJson,
    hasScratchpad,
    hasProjectClaude,
    commands,
    agents,
    skills,
    hooks,
    backups,
  ] = await Promise.all([
    exists(path.join(claudeDir, "settings.json")),
    exists(path.join(claudeDir, "settings.local.json")),
    exists(path.join(claudeDir, "scratchpad.md")),
    exists(path.join(claudeDir, "CLAUDE.md")),
    countMdFiles(path.join(claudeDir, "commands")),
    countMdFiles(path.join(claudeDir, "agents")),
    countMdFiles(path.join(claudeDir, "skills")),
    safeReaddir(path.join(claudeDir, "hooks")),
    safeReaddir(path.join(claudeDir, "backups")),
  ]);

  const hookFiles = hooks.filter((f) => f.endsWith(".sh") || f.endsWith(".py"));
  const backupDirs = backups.filter((f) => /^\d{8}_\d{6}$/.test(f));

  return {
    hasSettingsJson,
    hasSettingsLocalJson,
    hasScratchpad,
    hasProjectClaude,
    commandCount: commands.count,
    agentCount: agents.count,
    skillCount: skills.count,
    hookCount: hookFiles.length,
    backupCount: backupDirs.length,
    commandNames: commands.names,
    agentNames: agents.names,
  };
}

// ─── Copilot Artifact Scanner ───────────────────────────────────────────────

async function scanCopilotArtifacts(appPath: string): Promise<CopilotArtifacts | undefined> {
  const copilotDir = path.join(appPath, ".copilot");
  if (!(await exists(copilotDir))) return undefined;

  const [customAgents, hasSecurityIntegration, hasInstructionsMd] = await Promise.all([
    countMdFiles(path.join(copilotDir, "custom-agents")),
    exists(path.join(copilotDir, "SECURITY-INTEGRATION.md")),
    exists(path.join(appPath, ".github", "copilot-instructions.md")),
  ]);

  return {
    customAgentCount: customAgents.count,
    customAgentNames: customAgents.names,
    hasSecurityIntegration,
    hasInstructionsMd,
  };
}

// ─── Cursor Artifact Scanner ────────────────────────────────────────────────

async function scanCursorArtifacts(appPath: string): Promise<CursorArtifacts | undefined> {
  const cursorRulesPath = path.join(appPath, ".cursorrules");
  const cursorDirPath = path.join(appPath, ".cursor");

  const [rulesSize, hasCursorDir] = await Promise.all([
    safeFileSize(cursorRulesPath),
    exists(cursorDirPath),
  ]);

  if (rulesSize === 0 && !hasCursorDir) return undefined;

  return {
    hasCursorRules: rulesSize > 0,
    cursorRulesSizeBytes: rulesSize,
    hasCursorDir,
  };
}

// ─── Gemini Artifact Scanner ────────────────────────────────────────────────

async function scanGeminiArtifacts(appPath: string): Promise<GeminiArtifacts | undefined> {
  const geminiDir = path.join(appPath, ".gemini");
  const geminiMdPath = path.join(appPath, "GEMINI.md");

  const [hasGeminiDir, hasGeminiMd] = await Promise.all([
    exists(geminiDir),
    exists(geminiMdPath),
  ]);

  if (!hasGeminiDir && !hasGeminiMd) return undefined;

  let fileCount = 0;
  let fileNames: string[] = [];
  if (hasGeminiDir) {
    const files = await safeReaddir(geminiDir);
    fileNames = files.filter((f) => !f.startsWith("."));
    fileCount = fileNames.length;
  }

  return { hasGeminiDir, hasGeminiMd, fileCount, fileNames };
}

// ─── Codex Artifact Scanner ─────────────────────────────────────────────────

async function scanCodexArtifacts(appPath: string): Promise<CodexArtifacts | undefined> {
  const codexDir = path.join(appPath, ".codex");
  const agentsMdPath = path.join(appPath, "AGENTS.md");
  const codexJsonPath = path.join(appPath, "codex.json");

  const [hasCodexDir, hasAgentsMd, hasCodexJson] = await Promise.all([
    exists(codexDir),
    exists(agentsMdPath),
    exists(codexJsonPath),
  ]);

  if (!hasCodexDir && !hasAgentsMd && !hasCodexJson) return undefined;

  let fileCount = 0;
  let fileNames: string[] = [];
  if (hasCodexDir) {
    const files = await safeReaddir(codexDir);
    fileNames = files.filter((f) => !f.startsWith("."));
    fileCount = fileNames.length;
  }

  return { hasCodexDir, hasAgentsMd, hasCodexJson, fileCount, fileNames };
}

// ─── Framework Metadata Scanner ─────────────────────────────────────────────

async function scanFrameworkMeta(appPath: string): Promise<FrameworkMeta | null> {
  // Check all platform dirs for framework metadata
  const platformDirs = [".claude", ".copilot", ".cursor", ".gemini", ".codex"];

  for (const dir of platformDirs) {
    const base = path.join(appPath, dir);
    const versionFile = path.join(base, ".framework-version");
    const version = await safeReadText(versionFile);
    if (version) {
      const [updatedAt, platform] = await Promise.all([
        safeReadText(path.join(base, ".framework-updated")),
        safeReadText(path.join(base, ".framework-platform")),
      ]);
      return {
        version: version.trim(),
        updatedAt: updatedAt?.trim() || "",
        platform: platform?.trim() || "",
        source: dir,
      };
    }
  }

  return null;
}

// ─── Memory Bank Scanner ────────────────────────────────────────────────────

async function scanMemoryBank(appPath: string): Promise<MemoryBankStats | null> {
  const memoryDir = path.join(appPath, "memory_bank");
  if (!(await exists(memoryDir))) return null;

  const stats: MemoryBankStats = {
    totalFiles: 0,
    jsonlFiles: 0,
    mdFiles: 0,
    totalEntries: 0,
    knowledgeFiles: [],
  };

  await walkDir(memoryDir, async (filePath) => {
    stats.totalFiles++;
    if (filePath.endsWith(".jsonl")) {
      stats.jsonlFiles++;
      stats.knowledgeFiles.push(filePath);
      const entries = await countJsonlEntries(filePath);
      stats.totalEntries += entries;
    } else if (filePath.endsWith(".md")) {
      stats.mdFiles++;
    }
  });

  return stats.totalFiles > 0 ? stats : null;
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
    const files = await safeReaddir(logDir);
    for (const file of files) {
      if (file.startsWith("forge-") && file.endsWith(".log")) {
        const entry = await parseForgeLog(path.join(logDir, file));
        if (entry) entries.push(entry);
      }
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

// ─── Memory File Discovery (legacy) ─────────────────────────────────────────

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
  callback: (filePath: string) => void | Promise<void>
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, callback);
    } else {
      await callback(fullPath);
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
 * Scan a single app directory for AI session data across all platforms.
 */
export async function scanApp(appPath: string): Promise<AppScanResult> {
  const appName = path.basename(appPath);

  const [
    platforms,
    forgeLogs,
    sessionMonitor,
    memoryFiles,
    gitCommitCount,
    instructionFiles,
    claudeArtifacts,
    copilotArtifacts,
    cursorArtifacts,
    geminiArtifacts,
    codexArtifacts,
    frameworkMeta,
    memoryBankStats,
  ] = await Promise.all([
    detectPlatforms(appPath),
    scanForgeLogs(appPath),
    parseSessionMonitor(appPath),
    findMemoryFiles(appPath),
    getGitCommitCount(appPath),
    scanInstructionFiles(appPath),
    scanClaudeArtifacts(appPath),
    scanCopilotArtifacts(appPath),
    scanCursorArtifacts(appPath),
    scanGeminiArtifacts(appPath),
    scanCodexArtifacts(appPath),
    scanFrameworkMeta(appPath),
    scanMemoryBank(appPath),
  ]);

  const platformArtifacts: PlatformArtifacts = {};
  if (claudeArtifacts) platformArtifacts.claude = claudeArtifacts;
  if (copilotArtifacts) platformArtifacts.copilot = copilotArtifacts;
  if (cursorArtifacts) platformArtifacts.cursor = cursorArtifacts;
  if (geminiArtifacts) platformArtifacts.gemini = geminiArtifacts;
  if (codexArtifacts) platformArtifacts.codex = codexArtifacts;

  return {
    appName,
    appPath,
    platforms,
    forgeLogs,
    sessionMonitor,
    memoryFiles,
    gitCommitCount,
    instructionFiles,
    platformArtifacts,
    frameworkMeta,
    memoryBankStats,
  };
}

/**
 * Determine if an app has any harvestable data.
 */
export function appHasData(result: AppScanResult): boolean {
  // Forge logs or session monitor
  if (result.forgeLogs.length > 0 || result.sessionMonitor !== null) return true;

  // Any instruction files (CLAUDE.md, .cursorrules, GEMINI.md, AGENTS.md, etc.)
  if (result.instructionFiles.length > 0) return true;

  // Memory bank
  if (result.memoryBankStats !== null) return true;

  // Claude artifacts (commands, agents, skills, hooks)
  const claude = result.platformArtifacts.claude;
  if (claude && (claude.commandCount > 0 || claude.agentCount > 0 || claude.skillCount > 0)) {
    return true;
  }

  // Copilot artifacts
  const copilot = result.platformArtifacts.copilot;
  if (copilot && copilot.customAgentCount > 0) return true;

  // Cursor artifacts
  const cursor = result.platformArtifacts.cursor;
  if (cursor && cursor.hasCursorRules) return true;

  // Gemini artifacts
  const gemini = result.platformArtifacts.gemini;
  if (gemini && (gemini.hasGeminiMd || gemini.fileCount > 0)) return true;

  // Codex artifacts
  const codex = result.platformArtifacts.codex;
  if (codex && (codex.hasAgentsMd || codex.hasCodexJson || codex.fileCount > 0)) return true;

  // Framework metadata
  if (result.frameworkMeta !== null) return true;

  return false;
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

      // Detect if this app has any AI platform presence
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

/**
 * Scan multiple app root directories and merge results.
 */
export async function scanMultipleRoots(
  appsRoots: string[]
): Promise<AppScanResult[]> {
  const allResults: AppScanResult[] = [];
  const seen = new Set<string>();

  for (const root of appsRoots) {
    const results = await scanAllApps(root);
    for (const result of results) {
      // Deduplicate by absolute path
      if (!seen.has(result.appPath)) {
        seen.add(result.appPath);
        allResults.push(result);
      }
    }
  }

  return allResults.sort((a, b) => a.appName.localeCompare(b.appName));
}
