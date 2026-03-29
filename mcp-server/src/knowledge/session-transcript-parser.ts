/**
 * Session Transcript Parser — parses AI platform session data from all 5 platforms.
 *
 * Supported platforms:
 *   1. Claude Code — ~/.claude/projects/<project-key>/*.jsonl
 *   2. Cursor      — ~/.cursor/projects/<project-key>/agent-tools/*.txt
 *   3. Gemini      — ~/.gemini/antigravity/annotations/*.pbtxt + brain/*
 *   4. Copilot     — per-project .copilot/ artifacts (no session transcripts)
 *   5. Codex       — per-project .codex/ artifacts (no session transcripts)
 *
 * Returns structured ParsedSession objects with message counts, errors, and raw content
 * for downstream insight extraction.
 */

import { readFile, readdir, stat, access } from "fs/promises";
import path from "path";
import os from "os";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedSession {
  appName: string;
  appPath: string;
  platform: string;
  sessionId: string;
  sessionDate: string | null;
  filePath: string;
  fileSizeBytes: number;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolUseCount: number;
  errorCount: number;
  durationMinutes: number | null;
  /** Raw messages for insight extraction */
  messages: ParsedMessage[];
}

export interface ParsedMessage {
  role: "user" | "assistant" | "tool" | "system" | "error";
  content: string;
  timestamp: string | null;
  toolName?: string;
  hasError?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function safeReaddir(p: string): Promise<string[]> {
  try { return await readdir(p); } catch { return []; }
}

async function fileSize(p: string): Promise<number> {
  try { return (await stat(p)).size; } catch { return 0; }
}

// ─── Claude Code Parser ─────────────────────────────────────────────────────

/**
 * Parse Claude Code session transcripts from ~/.claude/projects/<key>/*.jsonl
 */
async function parseClaudeSessions(appPath: string): Promise<ParsedSession[]> {
  const appName = path.basename(appPath);
  const homedir = os.homedir();

  // Claude stores sessions under ~/.claude/projects/<sanitized-path>/
  // Path: /home/user/apps/myapp → -home-user-apps-myapp
  const projectKey = appPath.replace(/\//g, "-").replace(/^-/, "-");
  const sessionsDir = path.join(homedir, ".claude", "projects", projectKey);

  if (!(await exists(sessionsDir))) return [];

  const files = await safeReaddir(sessionsDir);
  const jsonlFiles = files.filter(f => f.endsWith(".jsonl"));
  const sessions: ParsedSession[] = [];

  for (const file of jsonlFiles) {
    const filePath = path.join(sessionsDir, file);
    const sessionId = file.replace(".jsonl", "");
    const size = await fileSize(filePath);

    // Skip tiny files (<100 bytes) and very large files (>50MB)
    if (size < 100 || size > 50 * 1024 * 1024) continue;

    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(l => l.trim());

      const messages: ParsedMessage[] = [];
      let userCount = 0, assistantCount = 0, toolUseCount = 0, errorCount = 0;
      let firstTimestamp: string | null = null;
      let lastTimestamp: string | null = null;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const ts = entry.timestamp || null;
          if (ts && !firstTimestamp) firstTimestamp = ts;
          if (ts) lastTimestamp = ts;

          const type = entry.type;

          if (type === "user") {
            userCount++;
            const msg = entry.message;
            const text = typeof msg?.content === "string"
              ? msg.content
              : Array.isArray(msg?.content)
                ? msg.content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n")
                : "";
            if (text) {
              messages.push({ role: "user", content: text.slice(0, 2000), timestamp: ts });
            }
          } else if (type === "assistant") {
            assistantCount++;
            const msg = entry.message;
            const contentBlocks = Array.isArray(msg?.content) ? msg.content : [];

            for (const block of contentBlocks) {
              if (block.type === "text" && block.text) {
                const hasErr = /error|fail|crash|exception|cannot|refused|denied/i.test(block.text);
                if (hasErr) errorCount++;
                messages.push({
                  role: "assistant",
                  content: block.text.slice(0, 2000),
                  timestamp: ts,
                  hasError: hasErr,
                });
              } else if (block.type === "tool_use") {
                toolUseCount++;
                messages.push({
                  role: "tool",
                  content: `${block.name}(${JSON.stringify(block.input || {}).slice(0, 500)})`,
                  timestamp: ts,
                  toolName: block.name,
                });
              }
            }
          }
        } catch {
          // skip malformed lines
        }
      }

      // Calculate duration
      let durationMinutes: number | null = null;
      if (firstTimestamp && lastTimestamp) {
        const d1 = new Date(firstTimestamp).getTime();
        const d2 = new Date(lastTimestamp).getTime();
        if (d2 > d1) durationMinutes = Math.round((d2 - d1) / 60000);
      }

      sessions.push({
        appName,
        appPath,
        platform: "claude_code",
        sessionId,
        sessionDate: firstTimestamp ? firstTimestamp.split("T")[0] : null,
        filePath,
        fileSizeBytes: size,
        messageCount: userCount + assistantCount,
        userMessageCount: userCount,
        assistantMessageCount: assistantCount,
        toolUseCount,
        errorCount,
        durationMinutes,
        messages,
      });
    } catch {
      // skip unreadable files
    }
  }

  return sessions;
}

// ─── Cursor Parser ──────────────────────────────────────────────────────────

/**
 * Parse Cursor session data from ~/.cursor/projects/<key>/agent-tools/*.txt
 */
async function parseCursorSessions(appPath: string): Promise<ParsedSession[]> {
  const appName = path.basename(appPath);
  const homedir = os.homedir();

  // Cursor stores under ~/.cursor/projects/<sanitized-path>/
  const projectKey = appPath.replace(/\//g, "-").replace(/^-/, "");
  const agentToolsDir = path.join(homedir, ".cursor", "projects", projectKey, "agent-tools");

  if (!(await exists(agentToolsDir))) return [];

  const files = await safeReaddir(agentToolsDir);
  const txtFiles = files.filter(f => f.endsWith(".txt"));
  const sessions: ParsedSession[] = [];

  for (const file of txtFiles) {
    const filePath = path.join(agentToolsDir, file);
    const sessionId = `cursor-${file.replace(".txt", "")}`;
    const size = await fileSize(filePath);

    if (size < 100 || size > 50 * 1024 * 1024) continue;

    try {
      const content = await readFile(filePath, "utf-8");
      const messages: ParsedMessage[] = [];

      // Cursor agent-tools files are plain text conversation logs
      // Split by common patterns: "User:", "Assistant:", or conversation markers
      const chunks = content.split(/\n(?=(?:User|Human|Assistant|AI|System):)/i);

      let userCount = 0, assistantCount = 0, toolUseCount = 0, errorCount = 0;

      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed) continue;

        if (/^(?:User|Human):/i.test(trimmed)) {
          userCount++;
          messages.push({ role: "user", content: trimmed.slice(0, 2000), timestamp: null });
        } else if (/^(?:Assistant|AI):/i.test(trimmed)) {
          assistantCount++;
          const hasErr = /error|fail|crash|exception/i.test(trimmed);
          if (hasErr) errorCount++;
          messages.push({ role: "assistant", content: trimmed.slice(0, 2000), timestamp: null, hasError: hasErr });

          // Count tool references
          const toolRefs = trimmed.match(/(?:running|executing|calling)\s+\w+/gi);
          if (toolRefs) toolUseCount += toolRefs.length;
        } else {
          // If no clear role, treat as assistant continuation
          if (trimmed.length > 50) {
            assistantCount++;
            messages.push({ role: "assistant", content: trimmed.slice(0, 2000), timestamp: null });
          }
        }
      }

      if (messages.length === 0) continue;

      const fstat = await stat(filePath);
      sessions.push({
        appName,
        appPath,
        platform: "cursor",
        sessionId,
        sessionDate: fstat.mtime.toISOString().split("T")[0],
        filePath,
        fileSizeBytes: size,
        messageCount: userCount + assistantCount,
        userMessageCount: userCount,
        assistantMessageCount: assistantCount,
        toolUseCount,
        errorCount,
        durationMinutes: null,
        messages,
      });
    } catch {
      // skip unreadable
    }
  }

  return sessions;
}

// ─── Gemini Parser ──────────────────────────────────────────────────────────

/**
 * Parse Gemini session data from ~/.gemini/antigravity/annotations/*.pbtxt
 * and brain artifacts
 */
async function parseGeminiSessions(_appPath: string): Promise<ParsedSession[]> {
  const appName = path.basename(_appPath);
  const homedir = os.homedir();
  const sessions: ParsedSession[] = [];

  // Gemini global data
  const geminiBase = path.join(homedir, ".gemini", "antigravity");
  if (!(await exists(geminiBase))) return [];

  // Parse annotations (text protobuf — human-readable)
  const annotationsDir = path.join(geminiBase, "annotations");
  const annotationFiles = await safeReaddir(annotationsDir);

  for (const file of annotationFiles.filter(f => f.endsWith(".pbtxt"))) {
    const filePath = path.join(annotationsDir, file);
    const sessionId = `gemini-${file.replace(".pbtxt", "")}`;
    const size = await fileSize(filePath);

    try {
      const content = await readFile(filePath, "utf-8");
      const messages: ParsedMessage[] = [];

      // Extract text fields from pbtxt format
      const textMatches = content.match(/text:\s*"([^"]+)"/g);
      let userCount = 0, assistantCount = 0;

      if (textMatches) {
        for (const match of textMatches) {
          const text = match.replace(/^text:\s*"/, "").replace(/"$/, "");
          if (text.length > 10) {
            messages.push({ role: "assistant", content: text.slice(0, 2000), timestamp: null });
            assistantCount++;
          }
        }
      }

      // Check brain artifacts for this session
      const brainDir = path.join(geminiBase, "brain", file.replace(".pbtxt", ""));
      if (await exists(brainDir)) {
        const brainFiles = await safeReaddir(brainDir);
        for (const bf of brainFiles.filter(f => f.endsWith(".md"))) {
          const brainContent = await readFile(path.join(brainDir, bf), "utf-8").catch(() => "");
          if (brainContent) {
            messages.push({ role: "assistant", content: brainContent.slice(0, 2000), timestamp: null });
            assistantCount++;
          }
        }
      }

      if (messages.length === 0) continue;

      sessions.push({
        appName,
        appPath: _appPath,
        platform: "gemini",
        sessionId,
        sessionDate: null,
        filePath,
        fileSizeBytes: size,
        messageCount: userCount + assistantCount,
        userMessageCount: userCount,
        assistantMessageCount: assistantCount,
        toolUseCount: 0,
        errorCount: 0,
        durationMinutes: null,
        messages,
      });
    } catch {
      // skip
    }
  }

  return sessions;
}

// ─── Copilot & Codex Artifact Parser ────────────────────────────────────────

/**
 * Parse per-project Copilot/Codex artifacts as pseudo-sessions.
 * These platforms don't store conversation transcripts locally,
 * but their config files contain valuable rule/agent definitions.
 */
async function parsePlatformArtifacts(
  appPath: string,
  platform: "copilot" | "codex"
): Promise<ParsedSession[]> {
  const appName = path.basename(appPath);
  const dirMap = { copilot: ".copilot", codex: ".codex" };
  const platformDir = path.join(appPath, dirMap[platform]);

  if (!(await exists(platformDir))) return [];

  const sessions: ParsedSession[] = [];
  const messages: ParsedMessage[] = [];

  // Scan custom-agents/ or skills/ directories
  const subDirs = platform === "copilot"
    ? ["custom-agents", ""]
    : ["prompts", ""];

  for (const subDir of subDirs) {
    const scanDir = subDir ? path.join(platformDir, subDir) : platformDir;
    const files = await safeReaddir(scanDir);

    for (const file of files.filter(f => f.endsWith(".md"))) {
      try {
        const content = await readFile(path.join(scanDir, file), "utf-8");
        if (content.length > 50) {
          messages.push({
            role: "system",
            content: content.slice(0, 3000),
            timestamp: null,
          });
        }
      } catch {
        // skip
      }
    }
  }

  if (messages.length > 0) {
    const fstat = await stat(platformDir).catch(() => null);
    sessions.push({
      appName,
      appPath,
      platform,
      sessionId: `${platform}-artifacts-${appName}`,
      sessionDate: fstat ? fstat.mtime.toISOString().split("T")[0] : null,
      filePath: platformDir,
      fileSizeBytes: 0,
      messageCount: messages.length,
      userMessageCount: 0,
      assistantMessageCount: messages.length,
      toolUseCount: 0,
      errorCount: 0,
      durationMinutes: null,
      messages,
    });
  }

  return sessions;
}

// ─── Cursor Rules Parser ────────────────────────────────────────────────────

/**
 * Parse .cursorrules file as a platform artifact session
 */
async function parseCursorRules(appPath: string): Promise<ParsedSession[]> {
  const appName = path.basename(appPath);
  const rulesPath = path.join(appPath, ".cursorrules");
  const cursorRulesDir = path.join(appPath, ".cursor", "rules");

  const sessions: ParsedSession[] = [];
  const messages: ParsedMessage[] = [];

  // Root .cursorrules
  if (await exists(rulesPath)) {
    try {
      const content = await readFile(rulesPath, "utf-8");
      if (content.length > 50) {
        messages.push({ role: "system", content: content.slice(0, 5000), timestamp: null });
      }
    } catch { /* skip */ }
  }

  // .cursor/rules/*.md
  if (await exists(cursorRulesDir)) {
    const files = await safeReaddir(cursorRulesDir);
    for (const file of files.filter(f => f.endsWith(".md") || f.endsWith(".mdc"))) {
      try {
        const content = await readFile(path.join(cursorRulesDir, file), "utf-8");
        if (content.length > 50) {
          messages.push({ role: "system", content: content.slice(0, 3000), timestamp: null });
        }
      } catch { /* skip */ }
    }
  }

  if (messages.length > 0) {
    sessions.push({
      appName,
      appPath,
      platform: "cursor",
      sessionId: `cursor-rules-${appName}`,
      sessionDate: null,
      filePath: rulesPath,
      fileSizeBytes: 0,
      messageCount: messages.length,
      userMessageCount: 0,
      assistantMessageCount: messages.length,
      toolUseCount: 0,
      errorCount: 0,
      durationMinutes: null,
      messages,
    });
  }

  return sessions;
}

// ─── Gemini Per-Project Parser ──────────────────────────────────────────────

/**
 * Parse per-project .gemini/ skills as artifact sessions
 */
async function parseGeminiProjectArtifacts(appPath: string): Promise<ParsedSession[]> {
  const appName = path.basename(appPath);
  const geminiDir = path.join(appPath, ".gemini");
  if (!(await exists(geminiDir))) return [];

  const messages: ParsedMessage[] = [];

  // GEMINI.md at root
  const geminiMd = path.join(appPath, "GEMINI.md");
  if (await exists(geminiMd)) {
    try {
      const content = await readFile(geminiMd, "utf-8");
      if (content.length > 50) {
        messages.push({ role: "system", content: content.slice(0, 5000), timestamp: null });
      }
    } catch { /* skip */ }
  }

  // .gemini/skills/*.md
  const skillsDir = path.join(geminiDir, "skills");
  if (await exists(skillsDir)) {
    const files = await safeReaddir(skillsDir);
    for (const file of files.filter(f => f.endsWith(".md")).slice(0, 50)) {
      try {
        const content = await readFile(path.join(skillsDir, file), "utf-8");
        if (content.length > 50) {
          messages.push({ role: "system", content: content.slice(0, 3000), timestamp: null });
        }
      } catch { /* skip */ }
    }
  }

  if (messages.length === 0) return [];

  return [{
    appName,
    appPath,
    platform: "gemini",
    sessionId: `gemini-artifacts-${appName}`,
    sessionDate: null,
    filePath: geminiDir,
    fileSizeBytes: 0,
    messageCount: messages.length,
    userMessageCount: 0,
    assistantMessageCount: messages.length,
    toolUseCount: 0,
    errorCount: 0,
    durationMinutes: null,
    messages,
  }];
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Parse all AI platform session transcripts for a single project.
 */
export async function parseProjectSessions(appPath: string): Promise<ParsedSession[]> {
  const results = await Promise.all([
    parseClaudeSessions(appPath),
    parseCursorSessions(appPath),
    parseCursorRules(appPath),
    parseGeminiSessions(appPath),
    parseGeminiProjectArtifacts(appPath),
    parsePlatformArtifacts(appPath, "copilot"),
    parsePlatformArtifacts(appPath, "codex"),
  ]);

  return results.flat();
}

/**
 * Parse sessions for all projects under a root directory.
 */
export async function parseAllProjectSessions(appsRoot: string): Promise<ParsedSession[]> {
  const allSessions: ParsedSession[] = [];

  try {
    const entries = await readdir(appsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "archive") continue;
      const appPath = path.join(appsRoot, entry.name);
      const sessions = await parseProjectSessions(appPath);
      allSessions.push(...sessions);
    }
  } catch {
    // skip inaccessible roots
  }

  return allSessions;
}

/**
 * Parse sessions across multiple root directories.
 */
export async function parseMultiRootSessions(roots: string[]): Promise<ParsedSession[]> {
  const allSessions: ParsedSession[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const sessions = await parseAllProjectSessions(root);
    for (const session of sessions) {
      const key = `${session.appPath}:${session.sessionId}`;
      if (!seen.has(key)) {
        seen.add(key);
        allSessions.push(session);
      }
    }
  }

  return allSessions;
}
